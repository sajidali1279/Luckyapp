import { Prisma, Tier } from '@prisma/client';
import { rule, engagement } from './appSettings';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { storeDateKey } from './storeTime';

// Default tier thresholds in dollars (internally). Display: × 100 = pts
export const TIER_THRESHOLDS: Record<string, number> = {
  SILVER:   50,   // 5,000 pts
  GOLD:     150,  // 15,000 pts
  DIAMOND:  300,  // 30,000 pts
  PLATINUM: 450,  // 45,000 pts
};

// Load stored thresholds from DB, falling back to defaults for any missing tier
export async function getStoredThresholds(): Promise<Record<string, number>> {
  const stored = await prisma.tierCashbackRate.findMany({
    select: { tier: true, pointsThreshold: true },
  });
  const thresholds = { ...TIER_THRESHOLDS };
  for (const r of stored) {
    if (r.tier !== Tier.BRONZE && r.pointsThreshold != null) {
      thresholds[r.tier] = r.pointsThreshold;
    }
  }
  return thresholds;
}

export function calculateTier(
  periodPointsDollars: number,
  thresholds: Record<string, number> = TIER_THRESHOLDS,
): Tier {
  if (periodPointsDollars >= thresholds.PLATINUM) return Tier.PLATINUM;
  if (periodPointsDollars >= thresholds.DIAMOND)  return Tier.DIAMOND;
  if (periodPointsDollars >= thresholds.GOLD)     return Tier.GOLD;
  if (periodPointsDollars >= thresholds.SILVER)   return Tier.SILVER;
  return Tier.BRONZE;
}

// The rewards half-year is counted on the store calendar (Central time) like every other store day, so a new period starts at
// midnight in Texas on January 1 and July 1, not at 6 or 7 pm the evening before (which is what UTC did).
export function getCurrentPeriod(at: Date = new Date()): string {
  const [year, month] = storeDateKey(at).split('-').map(Number);
  return `${year}-H${month <= 6 ? 1 : 2}`;
}

/** Lowest to highest. */
export const TIER_LADDER: Tier[] = [Tier.BRONZE, Tier.SILVER, Tier.GOLD, Tier.DIAMOND, Tier.PLATINUM];
const rank = (t: Tier) => TIER_LADDER.indexOf(t);

/** How many half-year boundaries lie between two periods ("2026-H1" to "2027-H1" is 2). 0 when equal; text that is not a period counts as 1. */
export function periodsBetween(from: string, to: string): number {
  const number = (p: string) => { const m = /^(\d{4})-H([12])$/.exec(p); return m ? Number(m[1]) * 2 + Number(m[2]) : null; };
  const a = number(from);
  const b = number(to);
  if (a == null || b == null) return from === to ? 0 : 1;
  return Math.max(0, b - a);
}

/** The tier after falling `steps` levels (Bronze is the floor). */
export function stepDownTier(tier: Tier, steps: number): Tier {
  return TIER_LADDER[Math.max(0, rank(tier) - Math.max(0, steps))] ?? Tier.BRONZE;
}

/**
 * A customer's tier and progress as they stand NOW. When the stored period is the current one that is what is stored. When it is
 * an old one (the reset has not reached this customer yet) it is what the reset will make of them: one tier down for each
 * half-year missed and no progress. Every screen and every sale reads a customer through this, so they all give the same answer.
 */
export function effectiveTier(
  customer: { tier: Tier; tierPeriod: string; periodPoints: number },
  at: Date = new Date(),
): { tier: Tier; periodPoints: number; period: string; current: boolean } {
  const period = getCurrentPeriod(at);
  if (customer.tierPeriod === period) return { tier: customer.tier, periodPoints: customer.periodPoints, period, current: true };
  return { tier: stepDownTier(customer.tier, periodsBetween(customer.tierPeriod, period)), periodPoints: 0, period, current: false };
}

/**
 * Applies the reset to one customer whose stored period is old, so points credited next land in the new period instead of being
 * wiped by the job later. Safe to call at any time and from two places at once: it only changes a row that still has the old
 * period, so a customer is never stepped down twice. Returns true when it changed the customer.
 */
export async function rollCustomerPeriod(db: Prisma.TransactionClient | typeof prisma, customerId: string, at: Date = new Date()): Promise<boolean> {
  const c = await db.user.findUnique({ where: { id: customerId }, select: { tier: true, tierPeriod: true } });
  if (!c) return false;
  const period = getCurrentPeriod(at);
  if (c.tierPeriod === period) return false;
  const moved = await db.user.updateMany({
    where: { id: customerId, tierPeriod: c.tierPeriod },
    data: { tier: stepDownTier(c.tier, periodsBetween(c.tierPeriod, period)), tierPeriod: period, periodPoints: 0 },
  });
  return moved.count > 0;
}

// Bonus cashback per gallon IN DOLLARS (e.g. 0.05 = 5 pts) for a tier: HQ's cents (Settings > Rewards & offers > Tier perks, 2026-10-17).
// It was fixed here: Gold 5, Diamond 7, Platinum 10 cents.
export function gasBonusPerGallon(tier: string): number {
  const cents = tier === 'GOLD' ? rule('gasBonusGoldCents') : tier === 'DIAMOND' ? rule('gasBonusDiamondCents') : tier === 'PLATINUM' ? rule('gasBonusPlatinumCents') : 0;
  return Math.round(cents) / 100;
}

export const TIER_LABELS: Record<string, string> = {
  BRONZE:   '🥉 Bronze',
  SILVER:   '🥈 Silver',
  GOLD:     '🥇 Gold',
  DIAMOND:  '💎 Diamond',
  PLATINUM: '👑 Platinum',
};

// Extracts the promo bonus rate for a given tier. A per-tier promotion (tierBonusRates is a real map) pays each tier only the rate
// typed in for it, a tier the admin left blank gets nothing, not the top tier's rate. A plain flat-rate promotion (tierBonusRates
// null, one bonusRate for every tier) still falls back to bonusRate, since that IS the whole promotion.
export function getTierBonusRate(
  offer: { bonusRate: number | null; tierBonusRates: unknown } | null,
  tier: string,
): number {
  if (!offer) return 0;
  const map = offer.tierBonusRates as Record<string, number> | null;
  if (map) return map[tier] ?? 0;
  return offer.bonusRate ?? 0;
}

const TIER_NAME: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', DIAMOND: 'Diamond', PLATINUM: 'Platinum' };   // as the app shows them, in both languages
/** The tier-up push, in the customer's language (2026-10-24: it was English only and named the tier in capitals). */
export function tierUpWords(tier: Tier, es: boolean): { title: string; body: string } {
  const name = TIER_NAME[tier] ?? tier;
  return es
    ? { title: `🎉 ¡Subiste de nivel! Llegaste a ${name}`, body: `Tus beneficios ${name} ya están listos. Toca para verlos.` }
    : { title: `🎉 Tier Up! You reached ${name}`, body: `Your ${name} perks are ready. Tap to see them.` };
}

// Moves a customer UP a tier after points are credited (and says so). A tier never goes down here: after the half-year step down a
// customer keeps their lower tier while they earn their way back, instead of being dropped to what one small sale is worth.
// The write only happens while the stored tier is still lower (2026-10-24): two sales approved at the same moment used to both write and
// both push "Tier Up", and the slower one could put back the lower tier. Now only the call that really moves them up says so. The push
// opens Rewards; with HQ's Tier celebration on, an engagement_events row lets the app show its one-time celebration (POST
// /engagement/tier-up). The sale is already credited when this runs, so nothing after the write may throw.
export async function updateCustomerTierIfNeeded(
  customerId: string,
  updatedPeriodPoints: number,
  currentTier: Tier,
): Promise<void> {
  const thresholds = await getStoredThresholds();
  const newTier = calculateTier(updatedPeriodPoints, thresholds);
  if (rank(newTier) <= rank(currentTier)) return;
  const moved = await prisma.user.updateMany({ where: { id: customerId, tier: { in: TIER_LADDER.slice(0, rank(newTier)) } }, data: { tier: newTier } });
  if (moved.count === 0) return;   // already at this tier or above: another approval got there first
  try {
    const u = await prisma.user.findUnique({ where: { id: customerId }, select: { language: true, tierPeriod: true } });
    if (engagement().tierUp.enabled) {
      await prisma.engagementEvent.createMany({ data: [{ customerId, kind: 'TIER_UP', key: `${u?.tierPeriod ?? getCurrentPeriod()}:${newTier}` }], skipDuplicates: true });
    }
    const w = tierUpWords(newTier, u?.language === 'es');
    sendPushToUser(customerId, w.title, w.body, 'GENERAL', '/(customer)/rewards');
  } catch (e: any) {
    console.error('[tier] tier-up message failed:', e?.message ?? e);
  }
}

/**
 * Checks the tier again from what is stored now, after a bonus that is not a sale (a check-in, a store goal, a birthday gift, an invite
 * reward): those add period points too, but used to wait for the customer's next sale to move them up. Never throws. A customer whose
 * stored period is old is left alone: their next credit rolls the period first.
 */
export async function raiseTierFor(customerId: string): Promise<void> {
  try {
    const u = await prisma.user.findUnique({ where: { id: customerId }, select: { tier: true, tierPeriod: true, periodPoints: true } });
    if (!u || u.tierPeriod !== getCurrentPeriod()) return;
    await updateCustomerTierIfNeeded(customerId, u.periodPoints, u.tier);
  } catch (e: any) {
    console.error('[tier] re-check failed:', e?.message ?? e);
  }
}

// Returns the next tier threshold in pts for display
export function getNextTierProgress(
  periodPointsDollars: number,
  thresholds: Record<string, number> = TIER_THRESHOLDS,
): { pts: number; nextPts: number | null; tier: Tier; nextTier: string | null } {
  const pts = Math.round(periodPointsDollars * 100);
  const tier = calculateTier(periodPointsDollars, thresholds);

  const map: Record<string, { next: string; threshold: number } | null> = {
    BRONZE:   { next: 'Silver',   threshold: Math.round(thresholds.SILVER   * 100) },
    SILVER:   { next: 'Gold',     threshold: Math.round(thresholds.GOLD     * 100) },
    GOLD:     { next: 'Diamond',  threshold: Math.round(thresholds.DIAMOND  * 100) },
    DIAMOND:  { next: 'Platinum', threshold: Math.round(thresholds.PLATINUM * 100) },
    PLATINUM: null,
  };

  const entry = map[tier];
  return {
    pts,
    tier,
    nextTier:  entry?.next ?? null,
    nextPts:   entry?.threshold ?? null,
  };
}
