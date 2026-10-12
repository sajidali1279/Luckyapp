// Hot food paid with points (2026-10-11). The customer can pay a whole order with points, only when their balance covers all of it
// (no part payments): the points are taken when the order is placed, go back when the order is declined, cancelled or not accepted, and
// count as a redemption at that store when it is picked up. Balances are dollars of credit; 100 points = $1.
import prisma from '../config/prisma';
import { lockCustomer } from './moneyGuards';

export const pts = (dollars: number) => Math.round(dollars * 100);

/** Takes the order's total from the customer's balance, in the same transaction that creates the order. Null when the balance is short. */
export async function placeWithPoints<T>(customerId: string, total: number, create: (tx: any) => Promise<T>): Promise<{ order: T; balance: number } | { short: true; balance: number }> {
  return prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customerId);
    const { pointsBalance } = await tx.user.findUniqueOrThrow({ where: { id: customerId }, select: { pointsBalance: true } });
    if (pts(pointsBalance) < pts(total)) return { short: true as const, balance: pointsBalance };
    await tx.user.update({ where: { id: customerId }, data: { pointsBalance: { decrement: total } } });
    const order = await create(tx);
    return { order, balance: pointsBalance - total };
  });
}

/** Gives back the points of a cancelled order, once (whoever cancels it first). Returns the dollars given back, 0 when none. */
export async function returnOrderPoints(orderId: string, now: Date = new Date()): Promise<number> {
  const o = await prisma.hotFoodOrder.findUnique({ where: { id: orderId }, select: { customerId: true, paidWithPoints: true, pointsAmount: true, pointsReturnedAt: true } });
  if (!o?.paidWithPoints || !o.pointsAmount || o.pointsReturnedAt) return 0;   // most orders: paid at the counter, nothing to give back
  const amount = o.pointsAmount;
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.hotFoodOrder.updateMany({ where: { id: orderId, pointsReturnedAt: null }, data: { pointsReturnedAt: now } });
    if (claimed.count === 0) return 0;
    await tx.user.update({ where: { id: o.customerId }, data: { pointsBalance: { increment: amount } } });
    return amount;
  });
}

/** A points order picked up: recorded as a redemption at that store by the person who handed it over (store reports and billing). */
export async function recordPointsPickup(order: { customerId: string; storeId: string; pointsAmount: number | null }, processedBy: string): Promise<void> {
  if (!order.pointsAmount) return;
  await prisma.creditRedemption.create({ data: { customerId: order.customerId, storeId: order.storeId, amount: order.pointsAmount, devCut: 0, processedBy } });
}
