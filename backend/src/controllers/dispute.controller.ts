import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { Role } from '@prisma/client';
import { sendPushToUser, sendPushToStoreEmployees } from '../utils/push';
import { disputeSubmittedUrlEmployee, disputeResolvedUrl } from '../utils/notificationRoutes';

const submitSchema = z.object({
  storeId:       z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  description:   z.string().min(10).max(500),
  estimatedAmt:  z.number().positive().max(10000).optional(),
}).refine(
  (data) => Boolean(data.storeId) !== Boolean(data.transactionId),
  { message: 'Provide either storeId or transactionId, not both.' }
);

export async function submitDispute(req: AuthRequest, res: Response) {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { description, transactionId } = parsed.data;
  let storeId = parsed.data.storeId;
  let estimatedAmt = parsed.data.estimatedAmt;

  if (transactionId) {
    const transaction = await prisma.pointsTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, customerId: true, storeId: true },
    });
    if (!transaction) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }
    if (transaction.customerId !== req.user!.id) {
      res.status(403).json({ success: false, error: 'Not authorized for this transaction' });
      return;
    }
    const existingPending = await prisma.pointsDispute.findFirst({
      where: { transactionId, status: 'PENDING' },
    });
    if (existingPending) {
      res.status(409).json({ success: false, error: 'You already have a pending report for this transaction.' });
      return;
    }
    storeId = transaction.storeId;
    estimatedAmt = undefined;
  }

  if (!storeId) {
    res.status(400).json({ success: false, error: 'storeId is required' });
    return;
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) {
    res.status(404).json({ success: false, error: 'Store not found' });
    return;
  }

  const dispute = await prisma.pointsDispute.create({
    data: { customerId: req.user!.id, storeId: store.id, transactionId, description, estimatedAmt },
  });

  // Notify employees only — cashiers handled the transaction and can escalate
  sendPushToStoreEmployees(
    storeId,
    'New Missing-Points Report',
    `A customer reported missing cashback at ${store.name}. Review in the admin portal.`,
    'DISPUTE_SUBMITTED',
    disputeSubmittedUrlEmployee(),
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

// GET /disputes/store/:storeId/pending-count — badge count for mobile manager nav
export async function getStorePendingDisputeCount(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const user = req.user!;
  if (user.role === Role.STORE_MANAGER && !user.storeIds?.includes(storeId)) {
    res.status(403).json({ success: false, error: 'Not authorized for this store' });
    return;
  }

  const count = await prisma.pointsDispute.count({ where: { storeId, status: 'PENDING' } });
  res.json({ success: true, data: { count } });
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

// ─── GET /disputes/pending-count ──────────────────────────────────────────────
export async function getPendingDisputeCount(req: AuthRequest, res: Response) {
  const count = await prisma.pointsDispute.count({ where: { status: 'PENDING' } });
  res.json({ success: true, data: { count } });
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

  sendPushToUser(dispute.customerId, pushTitle, pushBody, 'DISPUTE_RESOLVED', disputeResolvedUrl(dispute.id)).catch(() => {});

  res.json({ success: true });
}
