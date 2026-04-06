import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { Role } from '@prisma/client';
import { AuthRequest } from '../types';
import { z } from 'zod';
import { audit } from '../utils/audit';
import { sendOtpEmail } from '../utils/email';

const SALT_ROUNDS = 12;

const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days

// ─── Per-phone login lockout (DB-backed) ──────────────────────────────────────
const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

async function checkLockout(phone: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { phone }, select: { lockedUntil: true } });
  if (!user?.lockedUntil) return null;
  if (user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    return `Too many failed attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.`;
  }
  return null;
}

async function recordFailure(phone: string) {
  const user = await prisma.user.findUnique({ where: { phone }, select: { failedLoginAttempts: true } });
  if (!user) return;
  const count = user.failedLoginAttempts + 1;
  await prisma.user.update({
    where: { phone },
    data: {
      failedLoginAttempts: count,
      lockedUntil: count >= MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS) : null,
    },
  });
}

async function clearFailures(phone: string) {
  await prisma.user.update({
    where: { phone },
    data: { failedLoginAttempts: 0, lockedUntil: null },
  });
}

function issueJwt(user: { id: string; phone: string; name?: string | null; role: Role; tier?: string | null }, storeIds: string[]) {
  return jwt.sign(
    { id: user.id, phone: user.phone, name: user.name || null, role: user.role, tier: user.tier ?? 'BRONZE', storeIds },
    process.env.JWT_SECRET!,
    { expiresIn: JWT_EXPIRES_IN_SECONDS }
  );
}

// ─── Register (new customer self-signup) ─────────────────────────────────────

const registerSchema = z.object({
  phone: z.string().min(10).max(15),
  pin: z.string().length(4).regex(/^\d{4}$/, 'PIN must be 4 digits'),
  name: z.string().min(1).max(80),
});

export async function register(req: Request, res: Response) {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { phone, pin, name } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    res.status(409).json({ success: false, error: 'Phone number already registered' });
    return;
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
  const qrCode = uuidv4();

  const user = await prisma.user.create({
    data: { phone, name, pinHash, qrCode, role: Role.CUSTOMER, isProfileComplete: true },
  });

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
      select: { id: true, phone: true, name: true, role: true, qrCode: true, pointsBalance: true, isActive: true, tier: true, periodPoints: true, tierPeriod: true },
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

  if (!newPin || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ success: false, error: 'New PIN must be 4 digits' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user?.pinHash) {
    res.status(400).json({ success: false, error: 'No PIN set on account' });
    return;
  }

  const valid = await bcrypt.compare(currentPin, user.pinHash);
  if (!valid) {
    res.status(401).json({ success: false, error: 'Current PIN is incorrect' });
    return;
  }

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

  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: { name: name.trim() },
    select: { id: true, phone: true, name: true, role: true, qrCode: true, pointsBalance: true },
  });
  res.json({ success: true, data: user });
}

// ─── Create Super Admin (DevAdmin only) ───────────────────────────────────────

const createSuperAdminSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1),
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export async function createSuperAdmin(req: AuthRequest, res: Response) {
  const parsed = createSuperAdminSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { phone, name, pin } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) {
    res.status(409).json({ success: false, error: 'Phone number already in use' });
    return;
  }

  const pinHash = await bcrypt.hash(pin, SALT_ROUNDS);
  const user = await prisma.user.create({
    data: { phone, name, pinHash, role: Role.SUPER_ADMIN, isProfileComplete: true },
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

// ─── List Staff (SuperAdmin+) ─────────────────────────────────────────────────

export async function listStaff(_req: AuthRequest, res: Response) {
  const staff = await prisma.user.findMany({
    where: { role: { not: Role.CUSTOMER } },
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
  if (userId === req.user!.id) {
    res.status(400).json({ success: false, error: 'Cannot deactivate your own account' });
    return;
  }
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isActive: !target.isActive },
    select: { id: true, isActive: true },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'TOGGLE_USER', entity: 'user', entityId: userId,
    details: { targetName: target.name, targetPhone: target.phone, targetRole: target.role, isActive: updated.isActive },
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
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
  await prisma.user.update({ where: { id: userId }, data: { pinHash } });
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
  try {
    // Delete all records referencing this user (no cascade on these FKs)
    await prisma.pointsTransaction.deleteMany({ where: { customerId: userId } });
    await prisma.pointsTransaction.deleteMany({ where: { grantedById: userId } });
    await prisma.creditRedemption.deleteMany({ where: { customerId: userId } });
    await prisma.creditRedemption.deleteMany({ where: { processedBy: userId } });
    await prisma.redemption.deleteMany({ where: { customerId: userId } });
    await prisma.userStoreRole.deleteMany({ where: { userId } });
    await prisma.pushToken.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
  } catch (err: any) {
    console.error('[deleteUser] Failed:', err?.message);
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

// ─── Forgot PIN — request OTP ─────────────────────────────────────────────────

export async function forgotPin(req: Request, res: Response) {
  const { phone, email } = req.body as { phone: string; email?: string };
  if (!phone) {
    res.status(400).json({ success: false, error: 'phone is required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  // Always return 200 to avoid user enumeration
  if (!user || !user.isActive) {
    res.json({ success: true, message: 'If that account exists, an OTP was sent.' });
    return;
  }

  // If email provided, verify it matches their account
  if (email && user.email && user.email.toLowerCase() !== email.toLowerCase()) {
    res.status(400).json({ success: false, error: 'Email does not match the account' });
    return;
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6-digit OTP
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Invalidate existing OTPs for this phone
  await prisma.otpCode.updateMany({
    where: { phone, purpose: 'FORGOT_PIN', used: false },
    data: { used: true },
  });

  await prisma.otpCode.create({
    data: { phone, email: user.email, code: otp, purpose: 'FORGOT_PIN', expiresAt },
  });

  if (user.email) {
    await sendOtpEmail(user.email, otp);
  }

  res.json({
    success: true,
    message: user.email ? 'OTP sent to your email.' : 'OTP sent.',
    email: user.email ? user.email.replace(/(.{2}).*(@.*)/, '$1***$2') : null,
  });
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export async function verifyOtp(req: Request, res: Response) {
  const { phone, code } = req.body as { phone: string; code: string };
  if (!phone || !code) {
    res.status(400).json({ success: false, error: 'phone and code are required' });
    return;
  }

  const record = await prisma.otpCode.findFirst({
    where: { phone, code, purpose: 'FORGOT_PIN', used: false },
    orderBy: { createdAt: 'desc' },
  });

  if (!record || record.expiresAt < new Date()) {
    res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    return;
  }

  // Mark as used
  await prisma.otpCode.update({ where: { id: record.id }, data: { used: true } });

  // Issue a short-lived reset token (reuse JWT with special claim)
  const resetToken = jwt.sign(
    { phone, purpose: 'RESET_PIN' },
    process.env.JWT_SECRET!,
    { expiresIn: 600 } // 10 minutes
  );

  res.json({ success: true, resetToken });
}

// ─── Reset PIN (after OTP verified) ──────────────────────────────────────────

export async function resetPin(req: Request, res: Response) {
  const { resetToken, newPin } = req.body as { resetToken: string; newPin: string };
  if (!resetToken || !newPin || !/^\d{4}$/.test(newPin)) {
    res.status(400).json({ success: false, error: 'resetToken and 4-digit newPin are required' });
    return;
  }

  let payload: { phone: string; purpose: string };
  try {
    payload = jwt.verify(resetToken, process.env.JWT_SECRET!) as { phone: string; purpose: string };
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
  await prisma.user.update({ where: { id: user.id }, data: { pinHash, pinHistory: newHistory } });

  res.json({ success: true, message: 'PIN reset successfully. You can now log in.' });
}

// ─── Create Staff Account (SuperAdmin only) ───────────────────────────────────

const createStaffSchema = z.object({
  phone: z.string().min(10).max(15),
  name: z.string().min(1),
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

  const { phone, name, pin, role, storeId } = parsed.data;

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
