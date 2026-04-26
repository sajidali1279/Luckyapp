import { Tier } from '@prisma/client';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';

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

export function getCurrentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const half = now.getUTCMonth() < 6 ? 'H1' : 'H2';
  return `${year}-${half}`;
}

// Bonus points per gallon IN DOLLARS (e.g. 0.05 = 5 pts)
export const GAS_BONUS_PER_GALLON: Record<string, number> = {
  GOLD:     0.05,
  DIAMOND:  0.07,
  PLATINUM: 0.10,
};

export const TIER_LABELS: Record<string, string> = {
  BRONZE:   '🥉 Bronze',
  SILVER:   '🥈 Silver',
  GOLD:     '🥇 Gold',
  DIAMOND:  '💎 Diamond',
  PLATINUM: '👑 Platinum',
};

// Extracts the promo bonus rate for a given tier from an offer's tierBonusRates map,
// falling back to the offer's flat bonusRate.
export function getTierBonusRate(
  offer: { bonusRate: number | null; tierBonusRates: unknown } | null,
  tier: string,
): number {
  if (!offer) return 0;
  const map = offer.tierBonusRates as Record<string, number> | null;
  return map?.[tier] ?? offer.bonusRate ?? 0;
}

// Updates a customer's tier after points are credited, sending a push if they tier up.
export async function updateCustomerTierIfNeeded(
  customerId: string,
  updatedPeriodPoints: number,
  currentTier: Tier,
): Promise<void> {
  const thresholds = await getStoredThresholds();
  const newTier = calculateTier(updatedPeriodPoints, thresholds);
  if (newTier !== currentTier) {
    await prisma.user.update({ where: { id: customerId }, data: { tier: newTier } });
    sendPushToUser(customerId, '🎉 Tier Up!', `You're now ${newTier} tier. Check your new benefits!`, 'GENERAL');
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
