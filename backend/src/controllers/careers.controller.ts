import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { notifyNewApplication, notifyApplicationStatusChange } from '../utils/email';

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

  const store = storeId
    ? await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } })
    : null;

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

  notifyNewApplication({ name, phone, email, position, storeName: store?.name }).catch(() => {});

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

  if (parsed.data.status && app.email) {
    notifyApplicationStatusChange({
      applicantEmail: app.email,
      applicantName: app.name,
      position: app.position,
      status: parsed.data.status,
    }).catch(() => {});
  }

  res.json({ success: true, data: app });
}

// ─── DELETE /careers/applications/:id  (admin — delete) ──────────────────────

export async function deleteApplication(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.jobApplication.delete({ where: { id } });
  res.json({ success: true });
}

// ─── GET /careers/openings  (authenticated — active openings for customers) ───

export async function getActiveOpenings(_req: Request, res: Response) {
  const openings = await prisma.jobOpening.findMany({
    where: { isActive: true },
    include: { store: { select: { id: true, name: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: openings });
}

// ─── GET /careers/openings/all  (admin — all incl. inactive) ─────────────────

export async function getAllOpenings(_req: Request, res: Response) {
  const openings = await prisma.jobOpening.findMany({
    include: { store: { select: { id: true, name: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: openings });
}

// ─── POST /careers/openings  (admin — create) ────────────────────────────────

const openingSchema = z.object({
  title:        z.string().min(2).max(120),
  position:     z.string().min(2).max(80),
  storeId:      z.string().uuid().nullable().optional(),
  description:  z.string().max(2000).nullable().optional(),
  requirements: z.string().max(2000).nullable().optional(),
  payRange:     z.string().max(80).nullable().optional(),
  employType:   z.enum(['FULL_TIME', 'PART_TIME', 'BOTH']).default('BOTH'),
  isActive:     z.boolean().default(true),
});

export async function createOpening(req: AuthRequest, res: Response) {
  const parsed = openingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { storeId, ...rest } = parsed.data;
  const opening = await prisma.jobOpening.create({
    data: { ...rest, storeId: storeId ?? null, createdById: req.user!.id },
    include: { store: { select: { id: true, name: true, city: true } } },
  });
  res.status(201).json({ success: true, data: opening });
}

// ─── PATCH /careers/openings/:id  (admin — update) ───────────────────────────

const updateOpeningSchema = openingSchema.partial();

export async function updateOpening(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateOpeningSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const existing = await prisma.jobOpening.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Opening not found' }); return; }

  const opening = await prisma.jobOpening.update({
    where: { id },
    data: parsed.data,
    include: { store: { select: { id: true, name: true, city: true } } },
  });
  res.json({ success: true, data: opening });
}

// ─── DELETE /careers/openings/:id  (admin — delete) ──────────────────────────

export async function deleteOpening(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.jobOpening.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Opening not found' }); return; }
  await prisma.jobOpening.delete({ where: { id } });
  res.json({ success: true });
}
