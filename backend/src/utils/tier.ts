import { Tier } from '@prisma/client';

// Tier thresholds in dollars (internally). Display: × 100 = pts
export const TIER_THRESHOLDS = {
  SILVER:   50,   // 5,000 pts
  GOLD:     150,  // 15,000 pts
  DIAMOND:  300,  // 30,000 pts
  PLATINUM: 450,  // 45,000 pts
};

export function calculateTier(periodPointsDollars: number): Tier {
  if (periodPointsDollars >= TIER_THRESHOLDS.PLATINUM) return Tier.PLATINUM;
  if (periodPointsDollars >= TIER_THRESHOLDS.DIAMOND)  return Tier.DIAMOND;
  if (periodPointsDollars >= TIER_THRESHOLDS.GOLD)     return Tier.GOLD;
  if (periodPointsDollars >= TIER_THRESHOLDS.SILVER)   return Tier.SILVER;
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

// Returns the next tier threshold in pts for display
export function getNextTierProgress(periodPointsDollars: number): { pts: number; nextPts: number | null; tier: Tier; nextTier: string | null } {
  const pts = Math.round(periodPointsDollars * 100);
  const tier = calculateTier(periodPointsDollars);

  const map: Record<string, { next: string; threshold: number } | null> = {
    BRONZE:   { next: 'Silver',   threshold: TIER_THRESHOLDS.SILVER   * 100 },
    SILVER:   { next: 'Gold',     threshold: TIER_THRESHOLDS.GOLD     * 100 },
    GOLD:     { next: 'Diamond',  threshold: TIER_THRESHOLDS.DIAMOND  * 100 },
    DIAMOND:  { next: 'Platinum', threshold: TIER_THRESHOLDS.PLATINUM * 100 },
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
