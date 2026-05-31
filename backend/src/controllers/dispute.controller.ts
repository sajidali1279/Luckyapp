import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { Role } from '@prisma/client';
import { sendPushToUser, sendPushToStoreStaff } from '../utils/push';

const submitSchema = z.object({
  storeId:      z.string().uuid(),
  description:  z.string().min(10).max(500),
  estimatedAmt: z.number().positive().max(10000).optional(),
});

export async function submitDispute(req: AuthRequest, res: Response) {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { storeId, description, estimatedAmt } = parsed.data;

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) {
    res.status(404).json({ success: false, error: 'Store not found' });
    return;
  }

  const dispute = await prisma.pointsDispute.create({
    data: { customerId: req.user!.id, storeId, description, estimatedAmt },
  });

  // Notify store staff so they can review promptly
  sendPushToStoreStaff(
    storeId,
    'New Missing-Points Report',
    `A customer reported missing cashback at ${store.name}. Review in the admin portal.`,
    'DISPUTE_SUBMITTED',
  ).catch(() => {});

  res.status(201).json({ success: true, data: dispute });
}

export async function getMyDisputes(req: AuthRequest, res: Response) {
  const disputes = await prisma.pointsDispute.findMany({
    where: { customerId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: { store: { select: { name: true } } },
  });
  res.json({ success: true, data: disputes });
}

export async function getStoreDisputes(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status } = req.query as { status?: string };

  const user = req.user!;
  if (user.role === Role.STORE_MANAGER && !user.storeIds?.includes(storeId)) {
    res.status(403).json({ success: false, error: 'Not authorized for this store' });
    return;
  }

  const disputes = await prisma.pointsDispute.findMany({
    where: { storeId, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
  });

  res.json({ success: true, data: disputes });
}

export async function getAllDisputes(req: AuthRequest, res: Response) {
  const { status, storeId } = req.query as { status?: string; storeId?: string };
  const disputes = await prisma.pointsDispute.findMany({
    where: {
      ...(status  ? { status: status as any } : {}),
      ...(storeId ? { storeId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      store:    { select: { id: true, name: true } },
    },
  });
  res.json({ success: true, data: disputes });
}

const DISPUTE_CREDIT_HARD_CAP = 50; // $50 max credit per dispute

const resolveSchema = z.object({
  action:       z.enum(['APPROVED', 'REJECTED']),
  resolvedNote: z.string().max(300).optional(),
  creditedAmt:  z.number().positive().max(DISPUTE_CREDIT_HARD_CAP).optional(),
});

export async function resolveDispute(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { action, resolvedNote, creditedAmt } = parsed.data;

  const dispute = await prisma.pointsDispute.findUnique({ where: { id } });
  if (!dispute) {
    res.status(404).json({ success: false, error: 'Dispute not found' });
    return;
  }
  if (dispute.status !== 'PENDING') {
    res.status(400).json({ success: false, error: 'Dispute already resolved' });
    return;
  }

  const user = req.user!;
  if (user.role === Role.STORE_MANAGER && !user.storeIds?.includes(dispute.storeId)) {
    res.status(403).json({ success: false, error: 'Not authorized for this store' });
    return;
  }

  // Enforce cap: creditedAmt cannot exceed estimatedAmt (if provided)
  if (creditedAmt && dispute.estimatedAmt && creditedAmt > dispute.estimatedAmt) {
    res.status(400).json({ success: false, error: `Credit cannot exceed the claimed purchase amount ($${dispute.estimatedAmt.toFixed(2)})` });
    return;
  }

  const finalCreditedAmt = action === 'APPROVED' ? creditedAmt : undefined;

  await prisma.$transaction(async (tx) => {
    await tx.pointsDispute.update({
      where: { id },
      data: {
        status: action,
        resolvedById: user.id,
        resolvedNote,
        creditedAmt: finalCreditedAmt ?? null,
      },
    });

    if (action === 'APPROVED' && finalCreditedAmt && finalCreditedAmt > 0) {
      await tx.user.update({
        where: { id: dispute.customerId },
        data: { pointsBalance: { increment: finalCreditedAmt } },
      });
    }
  });

  // Notify the customer of the outcome
  const pushTitle = action === 'APPROVED' ? 'Missing Points Approved!' : 'Missing Points Report Update';
  const pushBody  = action === 'APPROVED'
    ? `Your report was reviewed and $${(finalCreditedAmt ?? 0).toFixed(2)} in credits has been added to your account.`
    : `Your missing-points report has been reviewed. ${resolvedNote ? resolvedNote : 'No additional credits were added.'}`;

  sendPushToUser(dispute.customerId, pushTitle, pushBody, 'DISPUTE_RESOLVED').catch(() => {});

  res.json({ success: true });
}
