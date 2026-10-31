// Hot food paid with points (2026-10-11). The customer can pay a whole order with points, only when their balance covers all of it
// (no part payments): the points are taken when the order is placed, go back when the order is declined, cancelled or not accepted, and
// count as a redemption at that store when it is picked up. Balances are dollars of credit; 100 points = $1.
import prisma from '../config/prisma';
import { lockCustomer } from './moneyGuards';
import { useLots, restoreLots } from './pointLots';

export const pts = (dollars: number) => Math.round(dollars * 100);

/**
 * Places an order in one transaction that holds the customer's row (2026-10-31). `check` (the open-order limit and the same order sent
 * twice) runs inside it, so two taps at the same moment cannot both pass it; with points (`pointsTotal`), the balance is checked and the
 * total taken there too, in the same transaction that creates the order.
 */
export async function placeOrderHeld<T, R>(
  customerId: string, pointsTotal: number | null, check: (tx: any) => Promise<R | null>, create: (tx: any) => Promise<T>,
): Promise<{ refused: R } | { short: true; balance: number } | { order: T; balance?: number }> {
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    const refused = await check(tx);
    if (refused) return { refused };
    if (pointsTotal == null) return { order: await create(tx) };
    const { pointsBalance } = await tx.user.findUniqueOrThrow({ where: { id: customerId }, select: { pointsBalance: true } });
    if (pts(pointsBalance) < pts(pointsTotal)) return { short: true as const, balance: pointsBalance };
    await tx.user.update({ where: { id: customerId }, data: { pointsBalance: { decrement: pointsTotal } } });
    const order = await create(tx);
    await useLots(tx, customerId, pointsTotal, 'HOT_FOOD', (order as any)?.id ?? null);   // oldest points first (utils/pointLots.ts)
    return { order, balance: pointsBalance - pointsTotal };
  });
}

/** Gives back the points of a cancelled order inside `tx`, once (whoever cancels it first). Returns the dollars given back, 0 when none. */
async function returnPointsIn(tx: any, orderId: string, now: Date): Promise<number> {
  const o = await tx.hotFoodOrder.findUnique({ where: { id: orderId }, select: { customerId: true, paidWithPoints: true, pointsAmount: true, pointsReturnedAt: true } });
  if (!o?.paidWithPoints || !o.pointsAmount || o.pointsReturnedAt) return 0;   // most orders: paid at the counter, nothing to give back
  const claimed = await tx.hotFoodOrder.updateMany({ where: { id: orderId, pointsReturnedAt: null }, data: { pointsReturnedAt: now } });
  if (claimed.count === 0) return 0;
  await tx.user.update({ where: { id: o.customerId }, data: { pointsBalance: { increment: o.pointsAmount } } });
  await restoreLots(tx, o.customerId, 'HOT_FOOD', orderId, o.pointsAmount, now);   // back into the batches they came from
  return o.pointsAmount;
}

/** Gives back the points of an order that is already cancelled, once. Returns the dollars given back, 0 when none. */
export async function returnOrderPoints(orderId: string, now: Date = new Date()): Promise<number> {
  return prisma.$transaction((tx) => returnPointsIn(tx, orderId, now));
}

/**
 * Cancels an order that is still in `from` and, when `refund`, gives back its points in the SAME transaction (2026-10-31): before, the
 * order was marked cancelled first and the points went back in a second step, so a failure in between left it cancelled with the points
 * kept and nothing tried again. Null when the order had already moved on (nothing changed).
 */
export async function cancelOrder(orderId: string, from: string, data: Record<string, unknown>, refund: boolean, now: Date = new Date()): Promise<{ returned: number } | null> {
  return prisma.$transaction(async (tx) => {
    const moved = await tx.hotFoodOrder.updateMany({ where: { id: orderId, status: from as any }, data: { ...data, status: 'CANCELLED' } });
    if (moved.count === 0) return null;
    return { returned: refund ? await returnPointsIn(tx, orderId, now) : 0 };
  });
}

/** A points order picked up: recorded as a redemption at that store by the person who handed it over (store reports and billing). */
export async function recordPointsPickup(order: { customerId: string; storeId: string; pointsAmount: number | null }, processedBy: string): Promise<void> {
  if (!order.pointsAmount) return;
  await prisma.creditRedemption.create({ data: { customerId: order.customerId, storeId: order.storeId, amount: order.pointsAmount, devCut: 0, processedBy } });
}
