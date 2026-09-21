// Deciding a sale exactly once.
//
// Points are credited when a sale moves to APPROVED. Two requests that both looked at the sale while it was still
// waiting (a double click, two admins, a slow response that gets retried) must not both credit it, so every decision
// here is a conditional update: it only changes the sale if it is STILL in the status the caller saw, and reports
// whether it did. The customer is credited in the same database transaction as the status change.

import { Prisma, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { rollCustomerPeriod } from './tier';

export interface SaleToCredit {
  id: string;
  customerId: string;
  pointsAwarded: number;
  gasBonusPoints: number;
}

/** Moves the sale from `from` to APPROVED and credits the customer. Returns the updated customer, or null when the sale was no longer in `from`. */
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
  return db.user.update({
    where: { id: sale.customerId },
    data: { pointsBalance: { increment: totalPoints }, periodPoints: { increment: totalPoints } },
  });
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
