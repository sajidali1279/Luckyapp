import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import prisma from '../config/prisma';
import { Prisma, Role } from '@prisma/client';
import { AuthRequest } from '../types';
import { z } from 'zod';
import { audit } from '../utils/audit';
import admin from '../config/firebase';
import cloudinary from '../config/cloudinary';
import { anonymizeCustomerAccount, excludeDeletedCustomers } from '../utils/accountDeletion';
import { csvText } from '../utils/csv';
import { storeDateText } from '../utils/storeTime';
import { canManageAccount, CANNOT_MANAGE_MESSAGE } from '../utils/rolePolicy';
import { canonicalPhone, staffPhone } from '../utils/phone';

const SALT_ROUNDS = 12;

const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ─── Per-phone login lockout (DB-backed) ──────────────────────────────────────
const MAX_FAILURES = 5;
// Each lockout in a row is longer: 15 minutes, then 1 hour, then 4 hours (4 hours from then on). Guessing a four-digit
// PIN is the weak point, so repeated failures get slower and slower. A good sign-in, Forgot PIN or an admin PIN reset
// starts over, so nobody stays locked out of their own account for long.
const LOCKOUT_STEPS_MS = [15 * 60 * 1000, 60 * 60 * 1000, 4 * 60 * 60 * 1000];

// The helpers take a database client so a test can run them inside a transaction it rolls back.
type LockoutDb = Prisma.TransactionClient;

export async function checkLockout(phone: string, db: LockoutDb = prisma): Promise<string | null> {
  const user = await db.user.findUnique({ where: { phone }, select: { lockedUntil: true } });
  if (!user?.lockedUntil) return null;
  if (user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    const when = mins >= 120 ? `${Math.ceil(mins / 60)} hours` : `${mins} minute${mins !== 1 ? 's' : ''}`;
    return `Too many failed attempts. Try again in ${when}, or use Forgot PIN to reset it now.`;
  }
  return null;
}

export async function recordFailure(phone: string, db: LockoutDb = prisma) {
  const user = await db.user.findUnique({ where: { phone }, select: { failedLoginAttempts: true, lockedUntil: true, lockoutLevel: true } });
  if (!user) return;
  // A lock that has run out starts a fresh set of tries. The counter used to stay at the limit, so one
  // wrong PIN after the lock ended locked the account again for another 15 minutes.
  const lockRanOut = !!user.lockedUntil && user.lockedUntil <= new Date();
  const count = (lockRanOut ? 0 : user.failedLoginAttempts) + 1;
  const locking = count >= MAX_FAILURES;
  await db.user.update({
    where: { phone },
    data: {
      failedLoginAttempts: count,
      lockedUntil: locking ? new Date(Date.now() + LOCKOUT_STEPS_MS[Math.min(user.lockoutLevel, LOCKOUT_STEPS_MS.length - 1)]) : null,
      ...(locking ? { lockoutLevel: user.lockoutLevel + 1 } : {}),
    },
  });
}

export async function clearFailures(phone: string, db: LockoutDb = prisma) {
  await db.user.update({
    where: { phone },
    data: { failedLoginAttempts: 0, lockedUntil: null, lockoutLevel: 0 },
  });
}

// A short fingerprint of the current PIN hash. The PIN-reset token carries it, so the token stops working the moment
// the PIN changes: a reset token can be used once.
const pinFingerprint = (pinHash: string | null) => createHash('sha256').update(pinHash ?? '').digest('hex').slice(0, 16);

function issueJwt(user: { id: string; phone: string; name?: string | null; role: Role; tier?: string | null }, storeIds: string[]) {
  return jwt.sign(
    { id: user.id, phone: user.phone, name: user.name || null, role: user.role, tier: user.tier ?? 'BRONZE', storeIds },
    process.env.JWT_SECRET!,
    { expiresIn: JWT_EXPIRES_IN_SECONDS }
  );
}

// Every action on someone else's account (reset PIN, deactivate, delete, store assignments) goes through this:
// it refuses, with the reason, when the target is at or above the caller's role, and records the attempt.
// Returns true when it has already answered the request.
function refuseUnlessManageable(req: AuthRequest, res: Response, target: { id: string; role: Role }): boolean {
  const actor = req.user!;
  if (canManageAccount(actor.role, target.role)) return false;
  audit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'DENIED_ACCOUNT_ACTION', entity: 'user', entityId: target.id,
    details: { targetRole: target.role, request: `${req.method} ${req.originalUrl.split('?')[0]}` },
  });
  res.status(403).json({ success: false, error: CANNOT_MANAGE_MESSAGE });
  return true;
}

// ─── Register (new customer self-signup) ─────────────────────────────────────

const registerSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().length(4).regex(/^\d{4}$/, 'PIN must be 4 digits'),
  name: z.string().min(1).max(80),
  firebaseToken: z.string().min(1),
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { phone, pin, name, firebaseToken } = parsed.data;

  // Verify the Firebase ID token (proves they own the phone number)
  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(firebaseToken);
  } catch {
    res.status(401).json({ success: false, error: 'Phone verification failed. Please try again.' });
    return;
  }

  // Firebase gives E.164 format (+12345678900). The account phone is the verified number's last ten digits and
  // what the app sent has to agree with it (see canonicalPhone).
  const accountPhone = canonicalPhone(phone, decodedToken.phone_number ?? '');
  if (!accountPhone) {
    res.status(400).json({ success: false, error: 'Phone number does not match the verified number.' });
    return;
  }

  // Clean up the Firebase Auth user — we manage sessions ourselves
  admin.auth().deleteUser(decodedToken.uid).catch(() => {});

  const existing = await prisma.user.findUnique({ where: { phone: accountPhone } });
  if (existing) {
    res.status(409).json({ success: false, error: 'Phone number already registered' });
    return;
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
  const qrCode = uuidv4();

  let user;
  try {
    user = await prisma.user.create({
      data: { phone: accountPhone, name, pinHash, qrCode, role: Role.CUSTOMER, isProfileComplete: true },
    });
  } catch (e) {
    // Two signups for the same number at the same moment: the second hits the unique phone
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      res.status(409).json({ success: false, error: 'Phone number already registered' });
      return;
    }
    throw e;
  }

  const token = issueJwt(user, []);
  res.status(201).json({
    success: true,
    data: {
      token,
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role, qrCode: user.qrCode, pointsBalance: 0 },
    },
  });
}

// ─── Login ────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().length(4).regex(/^\d{4}$/),
  pushToken: z.string().optional(),
  platform: z.enum(['ios', 'android']).optional(),
});

export async function login(req: Request, res: Response) {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { phone, pin, pushToken, platform } = parsed.data;

  // Check lockout before touching DB
  const lockMsg = await checkLockout(phone);
  if (lockMsg) {
    res.status(429).json({ success: false, error: lockMsg });
    return;
  }

  const user = await prisma.user.findUnique({ where: { phone } });

  // Constant-time comparison even if user not found (prevents timing attacks)
  const dummyHash = '$2a$12$invalidhashfortimingxxxxxxxxxxxxxxxxxxxxxxxx';
  const pinValid = await bcrypt.compare(pin, user?.pinHash ?? dummyHash);

  if (!user || !pinValid) {
    await recordFailure(phone);
    res.status(401).json({ success: false, error: 'Incorrect phone number or PIN' });
    return;
  }

  await clearFailures(phone);

  if (!user.isActive) {
    res.status(403).json({ success: false, error: 'Account deactivated. Contact support.' });
    return;
  }

  if (pushToken && platform) {
    await prisma.pushToken.upsert({
      where: { token: pushToken },
      update: { userId: user.id },
      create: { userId: user.id, token: pushToken, platform },
    });
  }

  const storeRoles = await prisma.userStoreRole.findMany({
    where: { userId: user.id },
    select: { storeId: true },
  });
  const storeIds = storeRoles.map((r) => r.storeId);

  const token = issueJwt(user, storeIds);
  res.json({
    success: true,
    data: {
      token,
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role, qrCode: user.qrCode, pointsBalance: Number(user.pointsBalance), periodPoints: Number(user.periodPoints), tier: user.tier, tierPeriod: user.tierPeriod, storeIds },
    },
  });
}

// ─── Get Current User (balance refresh) ──────────────────────────────────────

export async function getMe(req: AuthRequest, res: Response) {
  const [user, storeRoles] = await Promise.all([
    prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, phone: true, name: true, role: true, qrCode: true, pointsBalance: true, isActive: true, tier: true, periodPoints: true, tierPeriod: true, avatarUrl: true, age21Confirmed: true, age21Declined: true },
    }),
    prisma.userStoreRole.findMany({
      where: { userId: req.user!.id },
      select: { storeId: true },
    }),
  ]);
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  const storeIds = storeRoles.map((r) => r.storeId);
  res.json({ success: true, data: { ...user, pointsBalance: Number(user.pointsBalance), periodPoints: Number(user.periodPoints), storeIds } });
}

// ─── Register Push Token ──────────────────────────────────────────────────────

export async function registerPushToken(req: AuthRequest, res: Response) {
  const { token, platform } = req.body as { token: string; platform: string };
  if (!token || !platform) {
    res.status(400).json({ success: false, error: 'token and platform required' });
    return;
  }
  await prisma.pushToken.upsert({
    where: { token },
    update: { userId: req.user!.id },
    create: { userId: req.user!.id, token, platform },
  });
  res.json({ success: true });
}

// ─── Change PIN ───────────────────────────────────────────────────────────────

export async function changePin(req: AuthRequest, res: Response) {
  const { currentPin, newPin } = req.body as { currentPin: string; newPin: string };

  if (!currentPin || !/^\d{4}$/.test(currentPin)) {
    res.status(400).json({ success: false, error: 'Current PIN must be 4 digits' });
    return;
  }
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ success: false, error: 'New PIN must be 4 digits' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.pinHash) {
    res.status(400).json({ success: false, error: 'No PIN set on account' });
    return;
  }

  // Guessing the current PIN from a stolen session counts against the same limit as guessing it at sign-in
  const lockMsg = await checkLockout(user.phone);
  if (lockMsg) {
    res.status(429).json({ success: false, error: lockMsg });
    return;
  }

  const valid = await bcrypt.compare(currentPin, user.pinHash);
  if (!valid) {
    await recordFailure(user.phone);
    res.status(401).json({ success: false, error: 'Current PIN is incorrect' });
    return;
  }
  await clearFailures(user.phone);

  // Check PIN history (last 3 PINs cannot be reused)
  for (const oldHash of user.pinHistory) {
    if (await bcrypt.compare(newPin, oldHash)) {
      res.status(400).json({ success: false, error: 'Cannot reuse a recent PIN. Choose a different 4-digit PIN.' });
      return;
    }
  }

  const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
  const newHistory = [user.pinHash, ...user.pinHistory].slice(0, 3);
  await prisma.user.update({ where: { id: user.id }, data: { pinHash, pinHistory: newHistory } });
  res.json({ success: true, message: 'PIN updated' });
}

// ─── Update Profile ───────────────────────────────────────────────────────────

export async function updateProfile(req: AuthRequest, res: Response) {
  const { name } = req.body as { name: string };
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'Name is required' });
    return;
  }
  if (name.trim().length > 80) {
    res.status(400).json({ success: false, error: 'Name is too long (80 characters at most)' });
    return;
  }

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: name.trim() },
    select: { id: true, phone: true, name: true, role: true, qrCode: true, pointsBalance: true },
  });
  res.json({ success: true, data: user });
}

// ─── Upload Avatar ────────────────────────────────────────────────────────────

export async function uploadAvatar(req: AuthRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ success: false, error: 'No image file provided' });
    return;
  }

  const b64 = Buffer.from(req.file.buffer).toString('base64');
  const dataUri = `data:${req.file.mimetype};base64,${b64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    folder: 'lucky-stop/avatars',
    public_id: `avatar_${req.user!.id}`,
    overwrite: true,
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  });

  await prisma.user.update({ where: { id: req.user!.id }, data: { avatarUrl: result.secure_url } });

  res.json({ success: true, data: { avatarUrl: result.secure_url } });
}

export async function deleteAvatar(req: AuthRequest, res: Response) {
  const user = req.user!;
  try {
    await cloudinary.uploader.destroy(`lucky-stop/avatars/avatar_${user.id}`);
  } catch {
    // Non-fatal — may not exist on Cloudinary yet
  }
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: null } });
  res.json({ success: true });
}

// ─── Create Super Admin (DevAdmin only) ───────────────────────────────────────

const createSuperAdminSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().trim().min(1).max(80),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export async function createSuperAdmin(req: AuthRequest, res: Response) {
  const parsed = createSuperAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { name, pin } = parsed.data;
  const phone = staffPhone(parsed.data.phone);
  if (!phone) {
    res.status(400).json({ success: false, error: 'Enter a full ten-digit phone number' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    res.status(409).json({ success: false, error: 'Phone number already in use' });
    return;
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { phone, name, pinHash, role: Role.SUPER_ADMIN, isProfileComplete: true },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_SUPER_ADMIN', entity: 'staff', entityId: user.id,
    details: { name: user.name, phone: user.phone, role: user.role },
  });
  res.status(201).json({
    success: true,
    data: { id: user.id, phone: user.phone, name: user.name, role: user.role },
  });
}

// ─── List Customers (SuperAdmin+) ────────────────────────────────────────────

export async function listCustomers(req: AuthRequest, res: Response) {
  const { search = '', page = '1', limit = '50' } = req.query as { search?: string; page?: string; limit?: string };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const where = {
    role: Role.CUSTOMER,
    ...excludeDeletedCustomers,
    ...(search ? {
      OR: [
        { phone: { contains: search } },
        { name: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
  };

  const [customers, total] = await prisma.$transaction([
    prisma.user.findMany({
      where,
      select: { id: true, phone: true, name: true, pointsBalance: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
    }),
    prisma.user.count({ where }),
  ]);

  // Enrich with transaction stats
  const customerIds = customers.map((c) => c.id);
  const txStats = await prisma.pointsTransaction.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: 'APPROVED' },
    _count: { id: true },
    _sum: { purchaseAmount: true },
  });
  const txMap = Object.fromEntries(txStats.map((r) => [r.customerId, r]));
  const enriched = customers.map((c) => ({
    ...c,
    txCount: txMap[c.id]?._count.id ?? 0,
    totalSpent: parseFloat((txMap[c.id]?._sum.purchaseAmount ?? 0).toFixed(2)),
  }));

  // Total credits outstanding across all customers (not just this page)
  const creditsAgg = await prisma.user.aggregate({
    where: { role: 'CUSTOMER' },
    _sum: { pointsBalance: true },
  });

  res.json({
    success: true,
    data: {
      customers: enriched,
      total,
      page: parseInt(page),
      totalCreditsOutstanding: parseFloat((creditsAgg._sum.pointsBalance ?? 0).toFixed(2)),
    },
  });
}

// ─── Export Customers CSV (SuperAdmin+) ──────────────────────────────────────

export async function exportCustomersCsv(req: AuthRequest, res: Response) {
  const { search = '', isActive } = req.query as { search?: string; isActive?: string };

  const where = {
    role: Role.CUSTOMER,
    ...excludeDeletedCustomers,
    ...(search ? {
      OR: [
        { phone: { contains: search } },
        { name: { contains: search, mode: 'insensitive' as const } },
      ],
    } : {}),
    ...(isActive !== undefined ? { isActive: isActive === 'true' } : {}),
  };

  const customers = await prisma.user.findMany({
    where,
    select: { id: true, phone: true, name: true, pointsBalance: true, isActive: true, fraudNote: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 20000,
  });

  const customerIds = customers.map((c) => c.id);
  const txStats = await prisma.pointsTransaction.groupBy({
    by: ['customerId'],
    where: { customerId: { in: customerIds }, status: 'APPROVED' },
    _count: { id: true },
    _sum: { purchaseAmount: true },
  });
  const txMap = Object.fromEntries(txStats.map((r) => [r.customerId, r]));

  const header = 'Name,Phone,Credits Balance,Transactions,Total Spent,Status,Fraud Note,Joined';
  const rows = customers.map((c) => {
    const stats = txMap[c.id];
    return [
      csvText(c.name),
      csvText(c.phone),
      (c.pointsBalance ?? 0).toFixed(2),
      String(stats?._count.id ?? 0),
      (stats?._sum.purchaseAmount ?? 0).toFixed(2),
      c.isActive ? 'Active' : 'Restricted',
      csvText(c.fraudNote),
      storeDateText(new Date(c.createdAt)),
    ].join(',');
  });

  const csv = [header, ...rows].join('\n');
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="customers-${date}.csv"`);
  res.send(csv);
}

// ─── List Staff (SuperAdmin+) ─────────────────────────────────────────────────

export async function listStaff(req: AuthRequest, res: Response) {
  // A Dev Admin sees every account. Anyone else does not get Dev Admin accounts at all, so their ids and phone
  // numbers never reach a Super Admin's browser.
  const hideDevAdmins = req.user!.role !== Role.DEV_ADMIN;
  const staff = await prisma.user.findMany({
    where: { role: hideDevAdmins ? { notIn: [Role.CUSTOMER, Role.DEV_ADMIN] } : { not: Role.CUSTOMER } },
    select: {
      id: true, phone: true, name: true, role: true, isActive: true, createdAt: true,
      storeRoles: { select: { store: { select: { id: true, name: true } }, role: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: staff });
}

// ─── Toggle User Active (SuperAdmin+) ────────────────────────────────────────

export async function toggleUserActive(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  const { fraudNote } = req.body as { fraudNote?: string };

  if (userId === req.user!.id) {
    res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  if (refuseUnlessManageable(req, res, target)) return;

  const nowActive = !target.isActive;
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      isActive: nowActive,
      // Stamp fraud note when restricting; clear it when restoring
      fraudNote: nowActive ? null : (fraudNote?.trim() || target.fraudNote || null),
    },
    select: { id: true, isActive: true, fraudNote: true },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'TOGGLE_USER', entity: 'user', entityId: userId,
    details: { targetName: target.name, targetPhone: target.phone, targetRole: target.role, isActive: updated.isActive, fraudNote: updated.fraudNote },
  });
  res.json({ success: true, data: updated });
}

// ─── Reset User PIN (SuperAdmin+) ─────────────────────────────────────────────

export async function resetUserPin(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  const { newPin } = req.body as { newPin: string };
  if (!newPin || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ success: false, error: 'New PIN must be 4 digits' });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, role: true, pinHash: true, pinHistory: true } });
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  // Resetting your own PIN this way skips the current-PIN check that Change PIN asks for, which would let anyone
  // holding a stolen session take the account over for good
  if (user.id === req.user!.id) {
    res.status(400).json({ success: false, error: 'Change your own PIN from your profile.' });
    return;
  }
  if (refuseUnlessManageable(req, res, user)) return;
  const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
  const newHistory = user.pinHash ? [user.pinHash, ...user.pinHistory].slice(0, 3) : user.pinHistory;
  // Clearing the lock too: a reset for someone who is locked out has to let them in with the new PIN now
  // The person has to sign in again with the new PIN: every session issued before now ends
  await prisma.user.update({ where: { id: userId }, data: { pinHash, pinHistory: newHistory, failedLoginAttempts: 0, lockedUntil: null, lockoutLevel: 0, sessionsValidAfter: new Date() } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'RESET_PIN', entity: 'user', entityId: userId,
    details: { targetName: user.name, targetPhone: user.phone, targetRole: user.role },
  });
  res.json({ success: true, message: 'PIN reset successfully' });
}

// ─── Add / Remove Store Assignment (SuperAdmin only) ─────────────────────────

export async function addUserStore(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  const { storeId } = req.body as { storeId: string };
  if (!storeId) { res.status(400).json({ success: false, error: 'storeId is required' }); return; }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  if (refuseUnlessManageable(req, res, user)) return;
  if (!['EMPLOYEE', 'STORE_MANAGER'].includes(user.role)) {
    res.status(400).json({ success: false, error: 'Store assignment is only valid for EMPLOYEE or STORE_MANAGER accounts' });
    return;
  }

  await prisma.userStoreRole.upsert({
    where: { userId_storeId: { userId, storeId } },
    create: { userId, storeId, role: user.role as Role },
    update: {},
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'ADD_STORE', entity: 'user', entityId: userId,
    details: { storeId }, storeId,
  });
  res.json({ success: true });
}

export async function removeUserStore(req: AuthRequest, res: Response) {
  const { userId, storeId } = req.params;

  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
  if (!target) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  if (refuseUnlessManageable(req, res, target)) return;

  const remaining = await prisma.userStoreRole.count({ where: { userId } });
  if (remaining <= 1) {
    res.status(400).json({ success: false, error: 'Cannot remove the last store assignment' });
    return;
  }

  await prisma.userStoreRole.deleteMany({ where: { userId, storeId } });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'REMOVE_STORE', entity: 'user', entityId: userId,
    details: { storeId }, storeId,
  });
  res.json({ success: true });
}

// ─── Delete User (DevAdmin only) ──────────────────────────────────────────────

export async function deleteUser(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  if (userId === req.user!.id) {
    res.status(400).json({ success: false, error: 'Cannot delete your own account' });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, phone: true, role: true } });
  if (!target) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  if (refuseUnlessManageable(req, res, target)) return;
  try {
    // Delete all records referencing this user (no cascade on these FKs)
    await prisma.pointsTransaction.deleteMany({ where: { customerId: userId } });
    await prisma.pointsTransaction.deleteMany({ where: { grantedById: userId } });
    await prisma.creditRedemption.deleteMany({ where: { customerId: userId } });
    await prisma.creditRedemption.deleteMany({ where: { processedBy: userId } });
    await prisma.redemption.deleteMany({ where: { customerId: userId } });
    await prisma.catalogRedemption.deleteMany({ where: { customerId: userId } });
    await prisma.catalogRedemption.deleteMany({ where: { processedById: userId } });
    await prisma.employeeRating.deleteMany({ where: { OR: [{ customerId: userId }, { employeeId: userId }] } });
    await prisma.hotFoodOrder.deleteMany({ where: { customerId: userId } });
    await prisma.userStoreRole.deleteMany({ where: { userId } });
    await prisma.pushToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: `Delete failed: ${err?.message ?? 'unknown error'}` });
    return;
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_USER', entity: 'user', entityId: userId,
    details: { name: target.name, phone: target.phone, role: target.role },
  });
  res.json({ success: true });
}

// ─── Update Email (authenticated user) ───────────────────────────────────────

export async function updateEmail(req: AuthRequest, res: Response) {
  const { email } = req.body as { email: string };
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, error: 'Valid email address is required' });
    return;
  }
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== req.user!.id) {
    res.status(409).json({ success: false, error: 'Email already in use' });
    return;
  }
  await prisma.user.update({ where: { id: req.user!.id }, data: { email, emailVerified: false } });
  res.json({ success: true });
}

// ─── Verify Firebase Phone Token → issue reset token ─────────────────────────

export async function verifyFirebaseReset(req: Request, res: Response) {
  const { firebaseToken } = req.body as { firebaseToken?: string };
  if (!firebaseToken) {
    res.status(400).json({ success: false, error: 'firebaseToken is required' });
    return;
  }

  // Verify the Firebase ID token (proves they own the phone number via SMS)
  let decodedToken: admin.auth.DecodedIdToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(firebaseToken);
  } catch {
    res.status(401).json({ success: false, error: 'Phone verification failed. Please try again.' });
    return;
  }

  // Extract 10-digit phone from E.164 format (+12345678900)
  const firebaseDigits = (decodedToken.phone_number ?? '').replace(/\D/g, '');
  const phone = firebaseDigits.slice(-10);

  // Clean up Firebase Auth user — we manage sessions ourselves
  admin.auth().deleteUser(decodedToken.uid).catch(() => {});

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.isActive) {
    res.status(404).json({ success: false, error: 'No account found for this phone number.' });
    return;
  }

  // Issue a short-lived reset token (10 minutes)
  const resetToken = jwt.sign(
    { phone, purpose: 'RESET_PIN', pv: pinFingerprint(user.pinHash) },
    process.env.JWT_SECRET!,
    { expiresIn: 600 }
  );

  res.json({ success: true, resetToken });
}

// ─── Reset PIN (after Firebase phone verification) ────────────────────────────

export async function resetPin(req: Request, res: Response) {
  const { resetToken, newPin } = req.body as { resetToken: string; newPin: string };
  if (!resetToken || !newPin || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ success: false, error: 'resetToken and 4-digit newPin are required' });
    return;
  }

  let payload: { phone: string; purpose: string; pv?: string };
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET!) as { phone: string; purpose: string; pv?: string };
  } catch {
    res.status(400).json({ success: false, error: 'Reset token is invalid or expired' });
    return;
  }

  if (payload.purpose !== 'RESET_PIN') {
    res.status(400).json({ success: false, error: 'Invalid token purpose' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { phone: payload.phone } });
  if (!user) {
    res.status(404).json({ success: false, error: 'User not found' });
    return;
  }
  // The token was made for the PIN the account had then. Once the PIN has changed it is spent (tokens made before
  // this check existed carry no fingerprint and are still accepted for their 10 minutes).
  if (payload.pv !== undefined && payload.pv !== pinFingerprint(user.pinHash)) {
    res.status(400).json({ success: false, error: 'Reset token is invalid or expired' });
    return;
  }

  // Check PIN history (last 3 PINs cannot be reused)
  for (const oldHash of user.pinHistory) {
    if (await bcrypt.compare(newPin, oldHash)) {
      res.status(400).json({ success: false, error: 'Cannot reuse a recent PIN. Choose a different 4-digit PIN.' });
      return;
    }
  }
  if (user.pinHash && await bcrypt.compare(newPin, user.pinHash)) {
    res.status(400).json({ success: false, error: 'Cannot reuse your current PIN.' });
    return;
  }

  const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
  const newHistory = user.pinHash ? [user.pinHash, ...user.pinHistory].slice(0, 3) : user.pinHistory;
  // They proved they own the phone, so any lock from earlier wrong tries ends with the reset
  // Every session issued before now ends too: someone holding the old session (a lost phone) is signed out
  await prisma.user.update({ where: { id: user.id }, data: { pinHash, pinHistory: newHistory, failedLoginAttempts: 0, lockedUntil: null, lockoutLevel: 0, sessionsValidAfter: new Date() } });

  res.json({ success: true, message: 'PIN reset successfully. You can now log in.' });
}

// ─── Create Staff Account (SuperAdmin only) ───────────────────────────────────

const createStaffSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().trim().min(1).max(80),
  pin: z.string().length(4).regex(/^\d{4}$/),
  role: z.enum(['EMPLOYEE', 'STORE_MANAGER']),
  storeId: z.string().uuid(),
});

export async function createStaffAccount(req: AuthRequest, res: Response) {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { name, pin, role, storeId } = parsed.data;
  // Stored as ten digits, the way customers' phones are, so the sign-in screen finds it whatever was typed here
  const phone = staffPhone(parsed.data.phone);
  if (!phone) {
    res.status(400).json({ success: false, error: 'Enter a full ten-digit phone number' });
    return;
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    res.status(409).json({ success: false, error: 'Phone number already in use' });
    return;
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);

  const staff = await prisma.user.create({
    data: { phone, name, pinHash, role: role as Role, isProfileComplete: true },
  });

  await prisma.userStoreRole.create({
    data: { userId: staff.id, storeId, role: role as Role },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_STAFF', entity: 'staff', entityId: staff.id,
    details: { name: staff.name, phone: staff.phone, role: staff.role, storeId },
    storeId,
  });
  res.status(201).json({
    success: true,
    data: { id: staff.id, phone: staff.phone, name: staff.name, role: staff.role },
  });
}

// ─── Confirm 21+ Age (customer self-declares for age-restricted stores) ────────

export async function confirm21(req: AuthRequest, res: Response) {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { age21Confirmed: true, age21Declined: false },
  });
  res.json({ success: true });
}

// Customer said "not now" at an age-restricted prompt (a store or an offer).
// Distinct from simply never having been asked: once declined, restricted
// content stays hidden (not even blurred) instead of prompting again on
// every encounter, until the customer opts in themselves from Profile.
export async function decline21(req: AuthRequest, res: Response) {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { age21Declined: true },
  });
  res.json({ success: true });
}

// ─── Delete Own Account (customer self-service) ───────────────────────────────

export async function deleteOwnAccount(req: AuthRequest, res: Response) {
  const userId = req.user!.id;

  if (req.user!.role !== 'CUSTOMER') {
    res.status(403).json({ success: false, error: 'Staff accounts must be removed by an admin' });
    return;
  }

  try {
    // Anonymise instead of deleting the row: transactions, redemptions, ratings and
    // hot food orders all point at it with RESTRICT foreign keys, so a hard delete
    // failed for every customer who had ever earned or spent anything.
    await prisma.$transaction((tx) => anonymizeCustomerAccount(tx, userId));
  } catch (err) {
    console.error('[deleteOwnAccount] failed:', err);
    // No message on purpose: the app falls back to its own translated one, and
    // database internals never reach the client.
    res.status(500).json({ success: false });
    return;
  }

  // Best effort, after the account is already gone
  try {
    await cloudinary.uploader.destroy(`lucky-stop/avatars/avatar_${userId}`);
  } catch {
    // Non-fatal, the customer may never have uploaded a photo
  }

  audit({ actorId: userId, actorRole: 'CUSTOMER', action: 'DELETE_OWN_ACCOUNT', entity: 'user', entityId: userId });
  res.json({ success: true, message: 'Account deleted' });
}
