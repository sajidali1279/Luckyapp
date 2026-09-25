// Guards for anything that moves a customer's points: redemptions, refunds, tier benefits.
//
// Several handlers used to read the balance (or a status, or a count), decide, and then write in a separate step. Two requests at the same
// moment (a double tap, a customer cancelling while the cashier confirms, the expiry job running meanwhile) both passed the check: a
// redemption was deducted twice (even below zero), a refund was paid twice, a daily refill was given twice.
import { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/** How close together two identical requests must be to count as one repeated tap. */
export const REPEAT_WINDOW_MS = 10_000;

/**
 * Holds this customer's row until the surrounding transaction ends, so two money operations for one customer run one after the other and
 * the second sees what the first did. Call it first inside prisma.$transaction(async (tx) => ...), then read the balance with tx.
 */
export async function lockCustomer(tx: Tx, userId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
}

/**
 * Moves a catalog redemption out of PENDING only if it is still PENDING, and refunds its points when asked, in one transaction. Returns
 * true when this call made the change; false when something else (the cashier, the customer, the expiry job) already settled it.
 */
export async function settlePendingRedemption(
  tx: Tx,
  redemption: { id: string; customerId: string; pointsSpent: number },
  to: 'COMPLETED' | 'EXPIRED' | 'CANCELLED',
  options: { refund?: boolean; data?: Prisma.CatalogRedemptionUncheckedUpdateManyInput } = {},
): Promise<boolean> {
  const { count } = await tx.catalogRedemption.updateMany({
    where: { id: redemption.id, status: 'PENDING' },
    data: { ...(options.data ?? {}), status: to },
  });
  if (count === 0) return false;
  if (options.refund) {
    await tx.user.update({ where: { id: redemption.customerId }, data: { pointsBalance: { increment: redemption.pointsSpent / 100 } } });
  }
  return true;
}
