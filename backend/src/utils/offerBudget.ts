// A promotion's limits (2026-10-05): the most extra cashback it pays in all (budgetCap, dollars) and per customer per store day
// (dailyCapPerCustomer). A sale gets only what is left of them; what counts is the promotion's share (offerCashback) of the sales that
// are approved or still waiting (pending or held), so a rejected one gives its share back. When the budget is used up the promotion
// stops paying and showing (budgetReachedAt) and HQ is told (the HQ notifications list); raising the budget starts it again.
// Two sales at the very same moment can each find room, so a budget can be passed by at most one sale's bonus.

import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { audit } from './audit';
import { storeDayStart } from './storeTime';

export interface Limited { id: string; title?: string; budgetCap?: number | null; dailyCapPerCustomer?: number | null }
const COUNTED = [TransactionStatus.PENDING, TransactionStatus.APPROVED, TransactionStatus.FLAGGED];
const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export const hasLimits = (o: Limited) => o.budgetCap != null || o.dailyCapPerCustomer != null;

/** What the promotion has paid so far (approved and waiting sales). */
export async function budgetSpent(offerId: string): Promise<number> {
  const s = await prisma.pointsTransaction.aggregate({ where: { offerId, status: { in: COUNTED } }, _sum: { offerCashback: true } });
  return r4(s._sum.offerCashback ?? 0);
}

/** Spent so far per promotion (for the admin cards). */
export async function budgetSpentMany(offerIds: string[]): Promise<Map<string, number>> {
  if (offerIds.length === 0) return new Map();
  const rows = await prisma.pointsTransaction.groupBy({ by: ['offerId'], where: { offerId: { in: offerIds }, status: { in: COUNTED } }, _sum: { offerCashback: true } });
  return new Map(rows.map((r) => [r.offerId as string, r4(r._sum.offerCashback ?? 0)]));
}

/**
 * How much more the promotion may pay this customer on this sale (Infinity without limits). `already` is what earlier lines of the
 * same receipt already took from it (not saved yet).
 */
export async function promotionRoom(o: Limited, customerId: string, now: Date = new Date(), already = 0): Promise<number> {
  if (!hasLimits(o)) return Infinity;
  let room = Infinity;
  if (o.budgetCap != null) room = Math.min(room, o.budgetCap - (await budgetSpent(o.id)) - already);
  if (o.dailyCapPerCustomer != null) {
    const today = await prisma.pointsTransaction.aggregate({
      where: { offerId: o.id, customerId, status: { in: COUNTED }, createdAt: { gte: storeDayStart(now) } },
      _sum: { offerCashback: true },
    });
    room = Math.min(room, o.dailyCapPerCustomer - (today._sum.offerCashback ?? 0) - already);
  }
  return Math.max(0, r4(room));
}

/** After a sale: when the budget is now used up, mark it (once) and tell HQ. Returns true when this sale used it up. */
export async function noteBudgetUse(o: Limited, now: Date = new Date()): Promise<boolean> {
  if (o.budgetCap == null) return false;
  const spent = await budgetSpent(o.id);
  if (spent < o.budgetCap - 0.005) return false;
  const { count } = await prisma.offer.updateMany({ where: { id: o.id, budgetReachedAt: null }, data: { budgetReachedAt: now } });
  if (count === 0) return false;
  audit({
    actorId: 'system', actorName: 'Promotion budget (automatic)', actorRole: 'DEV_ADMIN',
    action: 'PROMOTION_BUDGET_USED', entity: 'offer', entityId: o.id,
    details: { summary: `Promotion "${o.title ?? o.id}" used its $${o.budgetCap.toFixed(2)} budget ($${spent.toFixed(2)} paid) and stopped`, budgetCap: o.budgetCap, spent },
    storeId: null,
  });
  return true;
}
