// Who a promotion is for (2026-10-05). EVERYONE (as before), TIER_UP (this tier and above), LAPSED (customers who have bought before but
// not in the last N days, default 30: a win-back), NEW (joined in the last N days, default 14) or BIRTHDAY (their birthday month, from
// the month and day they gave in the app). Only they see it in the app, are told about it, and are paid it: the same answer at the
// till (points.controller, receipt.controller), in the app's list (getActiveOffers) and for the pushes (offerAnnounce, offerLastDay).

import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { storeDateKey } from './storeTime';

export const AUDIENCES = ['EVERYONE', 'TIER_UP', 'LAPSED', 'NEW', 'BIRTHDAY'] as const;
export type Audience = (typeof AUDIENCES)[number];
export const DEFAULT_LAPSED_DAYS = 30;
export const DEFAULT_NEW_DAYS = 14;
const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'];
const DAY_MS = 86_400_000;
const TIER_NAME: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', DIAMOND: 'Diamond', PLATINUM: 'Platinum' };

export interface Targeted { audience?: string | null; audienceTier?: string | null; audienceDays?: number | null }
/** What decides it, per customer (loadCustomerFacts reads it once for many). */
export interface CustomerFacts { id: string; tier: string; createdAt: Date; birthMonth: number | null; lastPurchaseAt: Date | null }

export const forEveryone = (o: Targeted) => !o.audience || o.audience === 'EVERYONE';

/** Whether the customer is in the promotion's audience now. */
export function inAudience(o: Targeted, c: CustomerFacts, now: Date = new Date()): boolean {
  switch (o.audience ?? 'EVERYONE') {
    case 'TIER_UP':
      return TIER_ORDER.indexOf(c.tier) >= TIER_ORDER.indexOf(o.audienceTier ?? 'BRONZE');
    case 'LAPSED': {
      // has bought before (a win-back is for someone who has been here), but not in the last N days
      const days = o.audienceDays ?? DEFAULT_LAPSED_DAYS;
      return c.lastPurchaseAt != null && now.getTime() - c.lastPurchaseAt.getTime() >= days * DAY_MS;
    }
    case 'NEW':
      return now.getTime() - c.createdAt.getTime() <= (o.audienceDays ?? DEFAULT_NEW_DAYS) * DAY_MS;
    case 'BIRTHDAY':
      return c.birthMonth != null && c.birthMonth === Number(storeDateKey(now).slice(5, 7));
    default:
      return true;
  }
}

/** The facts for these customers: tier, when they joined, birthday month, and their last purchase (any sale not rejected). */
export async function loadCustomerFacts(ids: string[], tierOverride?: Record<string, string>, before?: Date): Promise<Map<string, CustomerFacts>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const [users, last] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, tier: true, createdAt: true, birthMonth: true } }),
    // a visit is any sale not rejected (one still waiting for its receipt counts: two sales on the day they come back are one return);
    // a referral reward paid to the person who shared is not a visit of theirs
    prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { customerId: { in: unique }, status: { in: [TransactionStatus.APPROVED, TransactionStatus.PENDING, TransactionStatus.FLAGGED] }, referralId: null, ...(before ? { createdAt: { lt: before } } : {}) }, _max: { createdAt: true } }),
  ]);
  const lastBy = new Map(last.map((r) => [r.customerId, r._max.createdAt ?? null]));
  return new Map(users.map((u) => [u.id, {
    id: u.id, tier: tierOverride?.[u.id] ?? u.tier, createdAt: u.createdAt, birthMonth: u.birthMonth ?? null, lastPurchaseAt: lastBy.get(u.id) ?? null,
  }]));
}

/** The promotions this customer may have (the ones for everyone need no lookup). `before`: only visits before it count (a sale
 *  being approved is not its own "last visit": a win-back challenge is judged as of the purchase). */
export async function forCustomer<T extends Targeted>(offers: T[], customerId: string, now: Date = new Date(), tier?: string, before?: Date): Promise<T[]> {
  if (offers.every(forEveryone)) return offers;
  const facts = (await loadCustomerFacts([customerId], tier ? { [customerId]: tier } : undefined, before)).get(customerId);
  return offers.filter((o) => forEveryone(o) || (!!facts && inAudience(o, facts, now)));
}

/** The people of a push audience who are in the promotion's audience. */
export async function membersInAudience<M extends { id: string }>(o: Targeted, members: M[], now: Date = new Date()): Promise<M[]> {
  if (forEveryone(o)) return members;
  const facts = await loadCustomerFacts(members.map((m) => m.id));
  return members.filter((m) => { const f = facts.get(m.id); return !!f && inAudience(o, f, now); });
}

/** "Gold and above", "Customers who have not bought in 30 days", ... (English, for HQ, the Activity Log and the admin cards). */
export function audienceText(o: Targeted): string {
  switch (o.audience ?? 'EVERYONE') {
    case 'TIER_UP': return o.audienceTier === 'PLATINUM' ? 'Platinum members' : `${TIER_NAME[o.audienceTier ?? 'BRONZE']} and above`;
    case 'LAPSED': return `Customers who have not bought in ${o.audienceDays ?? DEFAULT_LAPSED_DAYS} days`;
    case 'NEW': return `New customers (joined in the last ${o.audienceDays ?? DEFAULT_NEW_DAYS} days)`;
    case 'BIRTHDAY': return 'Customers whose birthday is this month';
    default: return 'Everyone';
  }
}
