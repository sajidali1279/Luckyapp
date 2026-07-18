import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { broadcastToCustomers } from '../utils/push';
import { careersUrl } from '../utils/notificationRoutes';

const openingSchema = z.object({
  title:        z.string().min(3).max(120),
  position:     z.enum(['CASHIER', 'ASSISTANT_MANAGER', 'STORE_MANAGER', 'FOOD_PREP', 'NIGHT_SHIFT', 'FUEL_ATTENDANT']),
  storeId:      z.string().uuid().optional().nullable(),
  description:  z.string().max(2000).optional().nullable(),
  requirements: z.string().max(2000).optional().nullable(),
  payRange:     z.string().max(60).optional().nullable(),
  employType:   z.enum(['FULL_TIME', 'PART_TIME', 'BOTH']).default('BOTH'),
  isActive:     z.boolean().default(true),
});

// GET /careers/openings — customers see active openings
export async function getActiveOpenings(_req: AuthRequest, res: Response) {
  const openings = await prisma.jobOpening.findMany({
    where: { isActive: true },
    include: { store: { select: { name: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: openings });
}

// GET /careers/openings/all — admins see all (including inactive)
export async function getAllOpenings(_req: AuthRequest, res: Response) {
  const openings = await prisma.jobOpening.findMany({
    include: {
      store:     { select: { name: true, city: true } },
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: openings });
}

// POST /careers/openings
export async function createOpening(req: AuthRequest, res: Response) {
  const parsed = openingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const opening = await prisma.jobOpening.create({
    data: { ...parsed.data, createdById: req.user!.id },
    include: { store: { select: { name: true, city: true } } },
  });

  if (opening.isActive) {
    broadcastToCustomers(
      '🧑‍💼 New Job Opening!',
      `${opening.title} at ${opening.store?.name ?? 'any Lucky Stop location'} — check it out!`,
      'JOB_OPENING',
      undefined,
      careersUrl(),
    ).catch(() => {});
  }

  res.status(201).json({ success: true, data: opening });
}

// PATCH /careers/openings/:id
export async function updateOpening(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = openingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.jobOpening.findUnique({ where: { id }, select: { isActive: true } });

  const opening = await prisma.jobOpening.update({
    where: { id },
    data: parsed.data,
    include: { store: { select: { name: true, city: true } } },
  });

  if (existing && existing.isActive === false && opening.isActive === true) {
    broadcastToCustomers(
      '🧑‍💼 New Job Opening!',
      `${opening.title} at ${opening.store?.name ?? 'any Lucky Stop location'} — check it out!`,
      'JOB_OPENING',
      undefined,
      careersUrl(),
    ).catch(() => {});
  }

  res.json({ success: true, data: opening });
}

// DELETE /careers/openings/:id
export async function deleteOpening(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.jobOpening.delete({ where: { id } });
  res.json({ success: true });
}
