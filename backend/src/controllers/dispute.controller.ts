import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { Role } from '@prisma/client';
import { sendPushToUser, sendPushToStoreEmployees } from '../utils/push';
import { disputeSubmittedUrlEmployee, disputeResolvedUrl } from '../utils/notificationRoutes';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { DELETED_PHONE_PREFIX } from '../utils/accountDeletion';

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
    include: {
      store: { select: { name: true } },
      transaction: {
        select: {
          id: true,
          purchaseAmount: true,
          category: true,
          status: true,
          createdAt: true,
          receiptImageUrl: true,
        },
      },
    },
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
      transaction: {
        select: {
          id: true,
          purchaseAmount: true,
          category: true,
          status: true,
          createdAt: true,
          receiptImageUrl: true,
          grantedBy: { select: { name: true } },
        },
      },
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

// GET /disputes/my-stores/pending-count — badge count across every store the
// manager is assigned to (a multi-store manager previously only ever saw
// their first store's pending-dispute count on the tab bar).
export async function getMyStoresPendingDisputeCount(req: AuthRequest, res: Response) {
  const storeIds = req.user!.storeIds ?? [];
  if (storeIds.length === 0) { res.json({ success: true, data: { count: 0 } }); return; }
  const count = await prisma.pointsDispute.count({ where: { storeId: { in: storeIds }, status: 'PENDING' } });
  res.json({ success: true, data: { count } });
}

const allDisputesQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED'], { message: 'The status must be PENDING, APPROVED or REJECTED.' }).optional(),
  storeId: z.string().uuid('That store is not valid.').optional(),
  limit: z.coerce.number({ message: 'The limit must be a number.' }).int('The limit must be a whole number.').min(1, 'The limit must be at least 1.').max(200, 'A list holds at most 200 reports.').default(100),
});

export async function getAllDisputes(req: AuthRequest, res: Response) {
  const parsed = allDisputesQuery.safeParse(req.query);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { status, storeId, limit } = parsed.data;
  const where = { ...(status ? { status } : {}), ...(storeId ? { storeId } : {}) };
  const [disputes, total] = await prisma.$transaction([
    prisma.pointsDispute.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        store:    { select: { id: true, name: true } },
        transaction: {
          select: {
            id: true,
            purchaseAmount: true,
            category: true,
            status: true,
            createdAt: true,
            receiptImageUrl: true,
            grantedBy: { select: { name: true } },
          },
        },
      },
    }),
    prisma.pointsDispute.count({ where }),
  ]);
  // `total` is how many match, so a list cut at the limit can say "showing 100 of 137"
  res.json({ success: true, data: disputes, total });
}

// ─── GET /disputes/pending-count ──────────────────────────────────────────────
export async function getPendingDisputeCount(req: AuthRequest, res: Response) {
  const count = await prisma.pointsDispute.count({ where: { status: 'PENDING' } });
  res.json({ success: true, data: { count } });
}

const DISPUTE_CREDIT_HARD_CAP = 50; // $50 max credit per dispute
const CREDIT_HELP = `Enter the amount to credit (from $0.01 to $${DISPUTE_CREDIT_HARD_CAP}). To turn the report down, choose Reject.`;

const resolveSchema = z.object({
  action:       z.enum(['APPROVED', 'REJECTED'], { message: 'Choose Approve or Reject.' }),
  resolvedNote: z.string({ message: 'The note must be text.' }).max(300, 'The note is too long (300 characters at most).').optional(),
  creditedAmt:  z.number({ message: 'The credit must be a number.' })
    .positive('The credit must be more than $0. To turn the report down, choose Reject.')
    .max(DISPUTE_CREDIT_HARD_CAP, `The most one report can credit is $${DISPUTE_CREDIT_HARD_CAP}.`)
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, 'The credit is dollars and cents, at most two decimals.')
    .optional(),
});

class AlreadyDecided extends Error {}

/**
 * PATCH /disputes/:id/resolve — a report is decided ONCE. The decision only takes effect if the report is still pending at the moment it is
 * written, so two approvals (a double click, the admin and the mobile manager screen, two managers) cannot both credit the customer, and the
 * credit and the decision are one transaction. Approving needs an amount: before, an approval with no amount credited nothing while telling
 * everyone that points were credited. Every decision is written to the Activity Log with who, how much and the note.
 */
export async function resolveDispute(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = resolveSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { action, resolvedNote, creditedAmt } = parsed.data;
  const note = resolvedNote?.trim() || undefined;

  const dispute = await prisma.pointsDispute.findUnique({ where: { id } });
  if (!dispute) {
    res.status(404).json({ success: false, error: 'That report no longer exists.' });
    return;
  }
  if (dispute.status !== 'PENDING') {
    res.status(409).json({ success: false, error: alreadyText(dispute.status, dispute.creditedAmt) });
    return;
  }

  const user = req.user!;
  if (user.role === Role.STORE_MANAGER && !user.storeIds?.includes(dispute.storeId)) {
    res.status(403).json({ success: false, error: 'Not authorized for this store' });
    return;
  }

  if (action === 'APPROVED') {
    if (creditedAmt == null) { res.status(400).json({ success: false, error: CREDIT_HELP }); return; }
    // Enforce cap: creditedAmt cannot exceed estimatedAmt (if provided)
    if (dispute.estimatedAmt && creditedAmt > dispute.estimatedAmt) {
      res.status(400).json({ success: false, error: `Credit cannot exceed the claimed purchase amount ($${dispute.estimatedAmt.toFixed(2)})` });
      return;
    }
  }

  const customer = await prisma.user.findUnique({ where: { id: dispute.customerId }, select: { id: true, name: true, phone: true } });
  if (action === 'APPROVED' && (!customer || customer.phone.startsWith(DELETED_PHONE_PREFIX))) {
    res.status(409).json({ success: false, error: 'This customer has deleted their account, so there is no account to credit. Reject the report.' });
    return;
  }

  const finalCreditedAmt = action === 'APPROVED' ? creditedAmt! : null;

  try {
    await prisma.$transaction(async (tx) => {
      // Only if it is still pending: the row is claimed by whoever writes first
      const claimed = await tx.pointsDispute.updateMany({
        where: { id, status: 'PENDING' },
        data: { status: action, resolvedById: user.id, resolvedNote: note ?? null, creditedAmt: finalCreditedAmt },
      });
      if (claimed.count === 0) throw new AlreadyDecided();

      if (finalCreditedAmt) {
        await tx.user.update({
          where: { id: dispute.customerId },
          data: { pointsBalance: { increment: finalCreditedAmt } },
        });
      }
    });
  } catch (err) {
    if (err instanceof AlreadyDecided) {
      const now = await prisma.pointsDispute.findUnique({ where: { id }, select: { status: true, creditedAmt: true } });
      res.status(409).json({ success: false, error: alreadyText(now?.status ?? 'decided', now?.creditedAmt ?? null) });
      return;
    }
    throw err;
  }

  const who = customer?.name || customer?.phone || 'a customer';
  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: action === 'APPROVED' ? 'DISPUTE_APPROVED' : 'DISPUTE_REJECTED', entity: 'dispute', entityId: id,
    details: {
      summary: action === 'APPROVED'
        ? `Missing-points report from ${who} approved: $${finalCreditedAmt!.toFixed(2)} credited${note ? `. Note: ${note}` : ''}`
        : `Missing-points report from ${who} rejected${note ? `. Note: ${note}` : ''}`,
      customerId: dispute.customerId, creditedAmt: finalCreditedAmt, note: note ?? null, estimatedAmt: dispute.estimatedAmt ?? null,
    },
    storeId: dispute.storeId,
  });

  // Notify the customer of the outcome
  const pushTitle = action === 'APPROVED' ? 'Missing Points Approved!' : 'Missing Points Report Update';
  const pushBody  = action === 'APPROVED'
    ? `Your report was reviewed and $${finalCreditedAmt!.toFixed(2)} in credits has been added to your account.`
    : `Your missing-points report has been reviewed. ${note ? note : 'No additional credits were added.'}`;

  sendPushToUser(dispute.customerId, pushTitle, pushBody, 'DISPUTE_RESOLVED', disputeResolvedUrl(dispute.id)).catch(() => {});

  res.json({ success: true, data: { status: action, creditedAmt: finalCreditedAmt } });
}

/** "Someone already decided this report: it was approved for $2.50." */
function alreadyText(status: string, credited: number | null): string {
  const what = status === 'APPROVED' ? `approved${credited ? ` for $${credited.toFixed(2)}` : ''}` : status === 'REJECTED' ? 'rejected' : 'decided';
  return `Someone already decided this report: it was ${what}. Nothing was changed.`;
}
