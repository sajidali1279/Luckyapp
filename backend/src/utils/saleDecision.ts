// Deciding a sale exactly once.
//
// Points are credited when a sale moves to APPROVED. Two requests that both looked at the sale while it was still
// waiting (a double click, two admins, a slow response that gets retried) must not both credit it, so every decision
// here is a conditional update: it only changes the sale if it is STILL in the status the caller saw, and reports
// whether it did. The customer is credited in the same database transaction as the status change.

import { Prisma, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { rollCustomerPeriod } from './tier';
import { creditChallenges } from './challenges';
import { creditReferral } from './referrals';

export interface SaleToCredit {
  id: string;
  customerId: string;
  pointsAwarded: number;
  gasBonusPoints: number;
}

/**
 * Moves the sale from `from` to APPROVED and credits the customer. Returns the updated customer, or null when the sale was no longer in
 * `from`. The approved sale also moves the customer's challenges on (utils/challenges.ts), in the same transaction: a reward it completes
 * is credited too, included in the balance returned, and listed in `challengeAwards` for the caller to push once this is saved. A
 * referral it completes (utils/referrals.ts) is paid the same way: the customer's own welcome bonus is in the balance returned, and
 * both awards are in `referralAwards`.
 */
export async function approveAndCredit(
  db: Prisma.TransactionClient,
  sale: SaleToCredit,
  from: TransactionStatus,
  alsoSet: Prisma.PointsTransactionUpdateManyMutationInput = {},
) {
  const moved = await db.pointsTransaction.updateMany({
    where: { id: sale.id, status: from },
    data: { ...alsoSet, status: TransactionStatus.APPROVED },
  });
  if (moved.count === 0) return null;
  // If the half-year turned and the reset has not reached this customer yet, apply it first so these points count in the new period
  await rollCustomerPeriod(db, sale.customerId);
  const totalPoints = sale.pointsAwarded + sale.gasBonusPoints;
  const user = await db.user.update({
    where: { id: sale.customerId },
    data: { pointsBalance: { increment: totalPoints }, periodPoints: { increment: totalPoints } },
  });
  const challengeAwards = await creditChallenges(db, sale.id);
  const referralAwards = await creditReferral(db, sale.id);
  const extra = challengeAwards.reduce((n, a) => n + a.reward, 0)
    + referralAwards.filter((a) => a.customerId === sale.customerId).reduce((n, a) => n + a.amount, 0);
  return { ...user, pointsBalance: user.pointsBalance + extra, periodPoints: user.periodPoints + extra, challengeAwards, referralAwards };
}

/** Moves the sale from `from` to REJECTED. Returns false when the sale was no longer in `from`. */
export async function rejectIfStill(saleId: string, from: TransactionStatus, db: Prisma.TransactionClient | typeof prisma = prisma): Promise<boolean> {
  const moved = await db.pointsTransaction.updateMany({
    where: { id: saleId, status: from },
    data: { status: TransactionStatus.REJECTED },
  });
  return moved.count > 0;
}

export const ALREADY_DECIDED_MESSAGE = 'This transaction was already handled by someone else. Refresh to see its current status.';
