import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

export const POSITIONS = [
  'CASHIER', 'ASSISTANT_MANAGER', 'STORE_MANAGER',
  'FOOD_PREP', 'NIGHT_SHIFT', 'FUEL_ATTENDANT',
] as const;

const availabilitySchema = z.object({
  type: z.enum(['FULL_TIME', 'PART_TIME']),
  shifts: z.array(z.enum(['MORNINGS', 'AFTERNOONS', 'NIGHTS', 'WEEKENDS'])).min(1),
});

const applySchema = z.object({
  name: z.string().min(2).max(100),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional().or(z.literal('')),
  position: z.enum(POSITIONS),
  storeId: z.string().uuid().optional(),
  availability: availabilitySchema,
  experience: z.string().max(1000).optional(),
  message: z.string().max(500).optional(),
});

// ─── POST /careers/apply  (customer submits application) ─────────────────────

export async function submitApplication(req: AuthRequest, res: Response) {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { name, phone, email, position, storeId, availability, experience, message } = parsed.data;

  // Prevent duplicate applications for same position within 30 days
  const recent = await prisma.jobApplication.findFirst({
    where: {
      phone,
      position,
      ...(storeId ? { storeId } : {}),
      createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    },
  });
  if (recent) {
    res.status(409).json({ success: false, error: 'You already applied for this position recently. Please wait 30 days before reapplying.' });
    return;
  }

  const application = await prisma.jobApplication.create({
    data: {
      name,
      phone,
      email: email || null,
      position,
      storeId: storeId || null,
      availability: availability as object,
      experience: experience || null,
      message: message || null,
      customerId: (req as AuthRequest).user?.id ?? null,
    },
  });

  res.status(201).json({ success: true, data: { id: application.id } });
}

// ─── GET /careers/applications  (admin — list all) ────────────────────────────

export async function getApplications(req: AuthRequest, res: Response) {
  const { status, position, storeId, page = '1' } = req.query as Record<string, string>;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const take = 50;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (position) where.position = position;
  if (storeId) where.storeId = storeId;

  const [total, applications] = await Promise.all([
    prisma.jobApplication.count({ where }),
    prisma.jobApplication.findMany({
      where,
      include: { store: { select: { name: true, city: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * take,
      take,
    }),
  ]);

  res.json({ success: true, data: { applications, total, page: pageNum } });
}

// ─── GET /careers/applications/new-count  (badge count) ──────────────────────

export async function getNewApplicationCount(req: AuthRequest, res: Response) {
  const count = await prisma.jobApplication.count({ where: { status: 'NEW' } });
  res.json({ success: true, data: { count } });
}

// ─── PATCH /careers/applications/:id  (admin — update status / notes) ────────

const updateSchema = z.object({
  status: z.enum(['NEW', 'REVIEWED', 'INTERVIEW', 'HIRED', 'REJECTED']).optional(),
  reviewNotes: z.string().max(1000).optional(),
});

export async function updateApplication(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const app = await prisma.jobApplication.update({
    where: { id },
    data: { ...(parsed.data.status ? { status: parsed.data.status as any } : {}), ...(parsed.data.reviewNotes !== undefined ? { reviewNotes: parsed.data.reviewNotes } : {}) },
    include: { store: { select: { name: true, city: true } } },
  });

  res.json({ success: true, data: app });
}

// ─── DELETE /careers/applications/:id  (admin — delete) ──────────────────────

export async function deleteApplication(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.jobApplication.delete({ where: { id } });
  res.json({ success: true });
}
