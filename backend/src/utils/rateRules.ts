// What the Rates page may change, checked on one rule book by the server (this file) and repeated by the admin page
// (admin/src/lib/rateRules.ts, same sentences) so a refusal reads the same wherever it is shown.
//
// Plain functions over plain objects: the controller loads the rates, asks refusalFor() about the change, and only then writes.
// A sale never pays more than CASHBACK_RATE_CAP and is held for a manager above CASHBACK_RATE_WARN, so the limits here are about
// stopping the slip (30 typed for 3, 5000 cents for 5) before it is saved, not about protecting the payout.

import {
  CASHBACK_RATE_CAP, MAX_TIER_CASHBACK_RATE, MAX_CATEGORY_BONUS_RATE, MAX_GAS_CENTS_PER_GALLON,
  MIN_TIER_THRESHOLD_POINTS, MAX_TIER_THRESHOLD_POINTS,
} from '../config/constants';

export const TIER_ORDER = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
export const LADDER = ['SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
export const GAS_CATEGORIES = ['GAS', 'DIESEL'];

export const CATEGORY_NAMES: Record<string, string> = {
  GROCERIES: 'Groceries', FROZEN_FOODS: 'Frozen Foods', FRESH_FOODS: 'Fresh Foods', GAS: 'Gas', DIESEL: 'Diesel', HOT_FOODS: 'Hot Foods', OTHER: 'Other',
};

export interface TierRateState { cashbackRate: number; gasCentsPerGallon: number | null; thresholdPoints: number | null }
export interface RateState {
  tiers: Record<string, TierRateState>;
  /** category -> bonus as a fraction (0.03) */
  categories: Record<string, number>;
}
export interface TierChange { tier: string; cashbackRate?: number; gasCentsPerGallon?: number | null; pointsThreshold?: number }
export interface CategoryChange { category: string; cashbackRate: number }

export const tierName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
export const categoryName = (c: string) => CATEGORY_NAMES[c] ?? c;
/** 0.075 -> "7.5%", 0.05 -> "5%" */
export const pct = (fraction: number) => `${parseFloat((fraction * 100).toFixed(2))}%`;
const points = (n: number) => `${Math.round(n).toLocaleString('en-US')} points`;

/** The rates as they will stand once the changes are applied. Does not touch its input. */
export function applyChanges(state: RateState, tierChanges: TierChange[], categoryChanges: CategoryChange[] = []): RateState {
  const tiers: Record<string, TierRateState> = {};
  for (const [k, v] of Object.entries(state.tiers)) tiers[k] = { ...v };
  for (const c of tierChanges) {
    const t = tiers[c.tier];
    if (!t) continue;
    if (c.cashbackRate !== undefined) t.cashbackRate = c.cashbackRate;
    if (c.gasCentsPerGallon !== undefined) t.gasCentsPerGallon = c.gasCentsPerGallon;
    if (c.pointsThreshold !== undefined) t.thresholdPoints = c.pointsThreshold;
  }
  const categories = { ...state.categories };
  for (const c of categoryChanges) categories[c.category] = c.cashbackRate;
  return { tiers, categories };
}

/** True when this tier pays gas by the gallon (so the percent bonus on Gas and Diesel is not used for it). */
const paysGasByGallon = (t: TierRateState) => t.gasCentsPerGallon != null && t.gasCentsPerGallon > 0;

/** What a sale in `category` pays for a customer in `tier`, as a fraction (tier rate plus the category's bonus). */
export function totalRate(state: RateState, tier: string, category: string): number {
  return (state.tiers[tier]?.cashbackRate ?? 0) + (state.categories[category] ?? 0);
}

/** Every tier and category pair that is over `limit` (0.075 for the review line), skipping the gas the tier pays by the gallon. */
export function totalsOver(state: RateState, limit: number): { tier: string; category: string; total: number }[] {
  const out: { tier: string; category: string; total: number }[] = [];
  for (const tier of TIER_ORDER) {
    const t = state.tiers[tier];
    if (!t) continue;
    for (const category of Object.keys(CATEGORY_NAMES)) {
      if (GAS_CATEGORIES.includes(category) && paysGasByGallon(t)) continue;
      const total = totalRate(state, tier, category);
      if (total > limit + 1e-9) out.push({ tier, category, total });
    }
  }
  return out;
}

/**
 * The first reason these changes should not be saved, as one plain sentence, or null when they are fine. `before` is the state
 * now. Only tier and category pairs the change touches are held to the 10% rule, so a combination that was already over the
 * line does not block an unrelated edit.
 */
export function refusalFor(before: RateState, tierChanges: TierChange[], categoryChanges: CategoryChange[] = []): string | null {
  // A value that is not changing is not judged (a save that sends the whole row back must not be refused for an old number).
  for (const c of tierChanges) {
    const name = tierName(c.tier);
    const now = before.tiers[c.tier];
    if (c.cashbackRate !== undefined && c.cashbackRate !== now?.cashbackRate && c.cashbackRate > MAX_TIER_CASHBACK_RATE + 1e-9) {
      return `${name} cashback can be at most ${pct(MAX_TIER_CASHBACK_RATE)} (you entered ${pct(c.cashbackRate)}). Above that, sales are held for a manager to review.`;
    }
    if (c.gasCentsPerGallon != null && c.gasCentsPerGallon !== now?.gasCentsPerGallon && c.gasCentsPerGallon > MAX_GAS_CENTS_PER_GALLON) {
      return `${name} gas can pay at most ${MAX_GAS_CENTS_PER_GALLON} cents a gallon (you entered ${parseFloat(c.gasCentsPerGallon.toFixed(2))}). Check that it is in cents, not dollars.`;
    }
    if (c.pointsThreshold !== undefined && c.pointsThreshold !== now?.thresholdPoints) {
      if (c.tier === 'BRONZE') return 'Bronze is the starting tier and has no points threshold.';
      if (c.pointsThreshold < MIN_TIER_THRESHOLD_POINTS || c.pointsThreshold > MAX_TIER_THRESHOLD_POINTS) {
        return `${name} needs between ${points(MIN_TIER_THRESHOLD_POINTS)} and ${points(MAX_TIER_THRESHOLD_POINTS)} to reach (you entered ${points(c.pointsThreshold)}). The app shows customers points, and 100 points is $1 of cashback.`;
      }
    }
  }
  for (const c of categoryChanges) {
    if (c.cashbackRate !== before.categories[c.category] && c.cashbackRate > MAX_CATEGORY_BONUS_RATE + 1e-9) {
      return `${categoryName(c.category)} bonus can be at most ${pct(MAX_CATEGORY_BONUS_RATE)} (you entered ${pct(c.cashbackRate)}). It is added to every customer's tier rate.`;
    }
  }

  const after = applyChanges(before, tierChanges, categoryChanges);

  if (tierChanges.some((c) => c.pointsThreshold !== undefined && c.pointsThreshold !== before.tiers[c.tier]?.thresholdPoints)) {
    for (let i = 1; i < LADDER.length; i++) {
      const lower = after.tiers[LADDER[i - 1]]?.thresholdPoints;
      const higher = after.tiers[LADDER[i]]?.thresholdPoints;
      if (lower != null && higher != null && higher <= lower) {
        return `${tierName(LADDER[i])} must need more points than ${tierName(LADDER[i - 1])} (${tierName(LADDER[i])} ${points(higher)}, ${tierName(LADDER[i - 1])} ${points(lower)}).`;
      }
    }
  }

  const touchedTiers = new Set(tierChanges.filter((c) => c.cashbackRate !== undefined || c.gasCentsPerGallon !== undefined).map((c) => c.tier));
  const touchedCategories = new Set(categoryChanges.map((c) => c.category));
  for (const o of totalsOver(after, CASHBACK_RATE_CAP)) {
    if (!touchedTiers.has(o.tier) && !touchedCategories.has(o.category)) continue;
    const was = before.tiers[o.tier] && !(GAS_CATEGORIES.includes(o.category) && paysGasByGallon(before.tiers[o.tier])) ? totalRate(before, o.tier, o.category) : 0;
    if (o.total <= was + 1e-9) continue;
    return `${tierName(o.tier)} (${pct(after.tiers[o.tier].cashbackRate)}) plus ${categoryName(o.category)} (${pct(after.categories[o.category] ?? 0)}) would be ${pct(o.total)}, more than the ${pct(CASHBACK_RATE_CAP)} a sale can ever pay. Lower one of them.`;
  }
  return null;
}
