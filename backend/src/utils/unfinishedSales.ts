// Unfinished sales (2026-10-18). A cashier's sale is saved when they press Grant, before the receipt photo (POST /points/grant, then
// POST /points/grant/:id/receipt). When the cashier stopped in between (a wrong category, Cancel, the app closed), the sale used to
// wait forever: PENDING or FLAGGED with no photo, in HQ's list and the badge counts, impossible to approve, and rejecting it told the
// customer their purchase "could not be verified". Now:
//   - a sale with no photo yet is "unfinished": HQ, the managers and the customer do not see it until the photo is added;
//   - the cashier's Cancel, starting the same customer again, a manager's Clear, or HQ's minutes with no photo (default 30) cancel it;
//   - CANCELLED credited nothing and tells nobody; it counts nowhere (not a sale, not a rejection).
// Only cashier and HQ grants can be unfinished: receipt scans always carry their photo, receipt-QR, challenge and referral lines are
// approved when made.
import { Prisma, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { audit } from './audit';
import { rule } from './appSettings';

export type CancelReason = 'CASHIER' | 'NEW_SCAN' | 'TIMEOUT' | 'MANAGER';

/** A sale waiting for its receipt photo. */
export const UNFINISHED: Prisma.PointsTransactionWhereInput = {
  status: { in: [TransactionStatus.PENDING, TransactionStatus.FLAGGED] },
  receiptImageUrl: null,
};

/** Every sale someone should see: not cancelled, and not still waiting for its photo. Spread into a where (it sets AND). */
export const SHOWN: Prisma.PointsTransactionWhereInput = {
  AND: [{ status: { not: TransactionStatus.CANCELLED } }, { NOT: UNFINISHED }],
};

/** The waiting ones a manager or HQ decides on: held (or, rarely, pending) sales that have their photo. */
export const AWAITING_DECISION: Prisma.PointsTransactionWhereInput = {
  status: { in: [TransactionStatus.PENDING, TransactionStatus.FLAGGED] },
  receiptImageUrl: { not: null },
};

/** Statuses that count as a sale that happened (or may yet): for the duplicate and "how many today" checks. */
export const NOT_A_SALE: TransactionStatus[] = [TransactionStatus.REJECTED, TransactionStatus.CANCELLED];

/**
 * Cancels the unfinished sales matching `where` (only ones still waiting for their photo). Returns how many. Never touches a sale that
 * has its photo or was decided: the conditional update is the guard, so a photo uploaded at the same moment wins.
 */
export async function cancelUnfinished(where: Prisma.PointsTransactionWhereInput, reason: CancelReason, now: Date = new Date()): Promise<number> {
  const { count } = await prisma.pointsTransaction.updateMany({
    where: { AND: [where, UNFINISHED] },
    data: { status: TransactionStatus.CANCELLED, cancelledAt: now, cancelReason: reason },
  });
  return count;
}

/** The job: sales still waiting for their photo after 30 minutes are cancelled. Returns how many. */
export async function cancelAbandonedSales(now: Date = new Date()): Promise<number> {
  const stale = await prisma.pointsTransaction.findMany({
    where: { AND: [UNFINISHED, { createdAt: { lt: new Date(now.getTime() - rule('reviewUnfinishedMinutes') * 60_000) } }] },
    select: { id: true, storeId: true, purchaseAmount: true, grantedById: true },
    take: 500,
  });
  if (!stale.length) return 0;
  const count = await cancelUnfinished({ id: { in: stale.map((t) => t.id) } }, 'TIMEOUT', now);
  if (count) {
    audit({ actorId: 'system', actorName: 'Unfinished sales job (automatic)', actorRole: 'DEV_ADMIN', action: 'CANCEL_UNFINISHED_SALES', entity: 'transaction',
      details: { count, ids: stale.map((t) => t.id).slice(0, 50), reason: `No receipt photo within ${rule('reviewUnfinishedMinutes')} minutes` }, storeId: null });
  }
  return count;
}
