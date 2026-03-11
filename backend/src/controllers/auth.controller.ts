import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { Role } from '@prisma/client';
import { AuthRequest } from '../types';
import { z } from 'zod';

const SALT_ROUNDS = 12;

const JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 30; // 30 days

function issueJwt(user: { id: string; phone: string; role: Role }, storeIds: string[]) {
  return jwt.sign(
    { id: user.id, phone: user.phone, role: user.role, storeIds },
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

  const user = await prisma.user.findUnique({ where: { phone } });

  // Constant-time comparison even if user not found (prevents timing attacks)
  const dummyHash = '$2a$12$invalidhashfortimingxxxxxxxxxxxxxxxxxxxxxxxx';
  const pinValid = await bcrypt.compare(pin, user?.pinHash ?? dummyHash);

  if (!user || !pinValid) {
    res.status(401).json({ success: false, error: 'Incorrect phone number or PIN' });
    return;
  }

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
      user: { id: user.id, phone: user.phone, name: user.name, role: user.role, qrCode: user.qrCode, pointsBalance: Number(user.pointsBalance), storeIds },
    },
  });
}

// ─── Get Current User (balance refresh) ──────────────────────────────────────

export async function getMe(req: AuthRequest, res: Response) {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: { id: true, phone: true, name: true, role: true, qrCode: true, pointsBalance: true, isActive: true },
  });
  if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }
  res.json({ success: true, data: { ...user, pointsBalance: Number(user.pointsBalance) } });
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

  const pinHash = await bcrypt.hash(newPin, SALT_ROUNDS);
  await prisma.user.update({ where: { id: user.id }, data: { pinHash } });
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

  res.json({ success: true, data: { customers, total, page: parseInt(page) } });
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
  res.json({ success: true, message: 'PIN reset successfully' });
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

  res.status(201).json({
    success: true,
    data: { id: staff.id, phone: staff.phone, name: staff.name, role: staff.role },
  });
}
