// Win-back gifts (2026-10-16): HQ gives a few points, with a push, to customers who bought before but have not been back for a while,
// then sees how many came back. A campaign is a Challenge of kind WINBACK that never runs (isActive false), and each gift is a reward
// line on it like a challenge's reward (purchaseAmount 0, challengeId set, the store's platform fee). So every count of sales already
// leaves gifts out, the customer's history shows it, billing has its fee, and HQ can void one like any reward.
import { Prisma, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { excludeDeletedCustomers } from './accountDeletion';
import { isTestPhone } from './testAccounts';

export const WINBACK = 'WINBACK';
export const WINBACK_LIMITS = {
  minAmount: 0.1, maxAmount: 5,           // $0.10 to $5.00 a customer (10 to 500 points)
  minQuietDays: 14, maxQuietDays: 365,
  maxRecipients: 5000,
  maxTotal: 2500,                          // dollars of gifts in one campaign
  cooldownDays: 60,                        // a customer gets one win-back gift in this many days at most
  resultDays: 30,                          // "came back" = an approved purchase within this many days of the gift
};

/** A real purchase: approved, not a reward line (challenge, win-back, referral), not test data. */
const REAL_SALE: Prisma.PointsTransactionWhereInput = { status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 } };

export interface WinBackPick { quietDays: number; storeId?: string | null; now?: Date }
export interface Recipient { id: string; name: string | null; phone: string; language: string | null; lastVisit: Date; storeId: string; storeName: string }

/**
 * The customers a campaign would go to: they bought before, their last purchase is at least quietDays ago (at the chosen store, when
 * one is chosen: their last purchase was there), the account is an active, real (not test), not deleted customer, and they had no
 * win-back gift in the last cooldownDays. Each gift is booked to the store of their last purchase.
 */
export async function winBackRecipients({ quietDays, storeId = null, now = new Date() }: WinBackPick): Promise<Recipient[]> {
  const cutoff = new Date(now.getTime() - quietDays * 86_400_000);
  const last = await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: REAL_SALE, _max: { createdAt: true } });
  const quiet = last.filter((l) => l._max.createdAt && l._max.createdAt < cutoff).map((l) => l.customerId);
  if (quiet.length === 0) return [];
  const since = new Date(now.getTime() - WINBACK_LIMITS.cooldownDays * 86_400_000);
  const [people, lastSales, gifted] = await Promise.all([
    prisma.user.findMany({
      where: { AND: [{ id: { in: quiet }, role: 'CUSTOMER', isActive: true }, excludeDeletedCustomers] },
      select: { id: true, name: true, phone: true, language: true },
    }),
    prisma.pointsTransaction.findMany({
      where: { ...REAL_SALE, customerId: { in: quiet } }, orderBy: { createdAt: 'desc' }, distinct: ['customerId'],
      select: { customerId: true, storeId: true, createdAt: true, store: { select: { name: true, isActive: true } } },
    }),
    prisma.pointsTransaction.findMany({
      where: { customerId: { in: quiet }, createdAt: { gte: since }, challenge: { kind: WINBACK } }, select: { customerId: true }, distinct: ['customerId'],
    }),
  ]);
  const lastOf = new Map(lastSales.map((s) => [s.customerId, s]));
  const skip = new Set(gifted.map((g) => g.customerId));
  return people
    .filter((p) => !isTestPhone(p.phone) && !skip.has(p.id))
    .map((p) => ({ p, s: lastOf.get(p.id)! }))
    .filter(({ s }) => s && s.store?.isActive !== false && (!storeId || s.storeId === storeId))
    .map(({ p, s }) => ({ id: p.id, name: p.name, phone: p.phone, language: p.language, lastVisit: s.createdAt, storeId: s.storeId, storeName: s.store?.name ?? '' }))
    .sort((a, b) => b.lastVisit.getTime() - a.lastVisit.getTime());
}

/** How a campaign did: customers given a gift, how many made a real purchase within resultDays after it, and what they spent. */
export async function winBackResults(campaign: { id: string; startDate: Date }, now = new Date()) {
  const gifts = await prisma.pointsTransaction.findMany({ where: { challengeId: campaign.id }, select: { customerId: true, pointsAwarded: true, status: true } });
  const given = gifts.filter((g) => g.status === TransactionStatus.APPROVED);
  const ids = [...new Set(given.map((g) => g.customerId))];
  const until = new Date(Math.min(now.getTime(), campaign.startDate.getTime() + WINBACK_LIMITS.resultDays * 86_400_000));
  const after = ids.length ? await prisma.pointsTransaction.groupBy({
    by: ['customerId'], where: { ...REAL_SALE, customerId: { in: ids }, createdAt: { gt: campaign.startDate, lte: until } }, _sum: { purchaseAmount: true },
  }) : [];
  const spent = after.reduce((n, a) => n + (a._sum.purchaseAmount ?? 0), 0);
  const cost = given.reduce((n, g) => n + g.pointsAwarded, 0);
  return {
    sent: ids.length, cameBack: after.length, cameBackPercent: ids.length ? Math.round((after.length / ids.length) * 1000) / 10 : 0,
    spentAfter: Math.round(spent * 100) / 100, cost: Math.round(cost * 100) / 100,
    measuring: now.getTime() < campaign.startDate.getTime() + WINBACK_LIMITS.resultDays * 86_400_000,   // still inside the 30 days
  };
}
