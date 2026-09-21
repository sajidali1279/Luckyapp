// What the Rates page may change, and what a change means in dollars. The limits and the sentences repeat
// backend/src/utils/rateRules.ts (keep the two in step: the page refuses first, the server refuses again, both say the same thing).
//
// A sale never pays more than the 10% ceiling and is held for a manager above 7.5%, so the limits are about stopping a slip
// (30 typed for 3, 5000 cents for 5) before it is saved. Plain functions, so the confirmation box and the tests share one answer.

export const CASHBACK_WARN = 0.075;
export const CASHBACK_CAP = 0.10;
export const MAX_TIER_RATE = CASHBACK_WARN;
export const MAX_CATEGORY_BONUS = 0.05;
export const MAX_GAS_CENTS = 25;
export const MIN_THRESHOLD_POINTS = 100;
export const MAX_THRESHOLD_POINTS = 10_000_000;

export const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
export type TierKey = typeof TIERS[number];
const LADDER = ['SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
export const GAS_CATEGORIES = ['GAS', 'DIESEL'];
export const CATEGORY_NAMES: Record<string, string> = {
  GROCERIES: 'Groceries', FROZEN_FOODS: 'Frozen Foods', FRESH_FOODS: 'Fresh Foods', GAS: 'Gas', DIESEL: 'Diesel', HOT_FOODS: 'Hot Foods', OTHER: 'Other',
};

/** The fixed extra for a gallon of gas that the server adds for these tiers (backend GAS_BONUS_PER_GALLON), used only if the server does not say. */
export const FALLBACK_GAS_BONUS_CENTS: Record<string, number> = { GOLD: 5, DIAMOND: 7, PLATINUM: 10 };

export interface TierRateState { cashbackRate: number; gasCentsPerGallon: number | null; thresholdPoints: number | null; gasBonusCents: number }
export interface RateState { tiers: Record<string, TierRateState>; categories: Record<string, number> }
export interface TierChange { tier: string; cashbackRate?: number; gasCentsPerGallon?: number | null; pointsThreshold?: number }
export interface CategoryChange { category: string; cashbackRate: number }

export interface TierRow { tier: string; cashbackRate: number; gasCentsPerGallon: number | null; pointsThreshold: number; gasBonusCentsPerGallon?: number }
export interface CategoryRow { category: string; cashbackRate: number }

export const tierName = (t: string) => t.charAt(0) + t.slice(1).toLowerCase();
export const categoryName = (c: string) => CATEGORY_NAMES[c] ?? c;
/** 0.075 -> "7.5%", 0.05 -> "5%" */
export const pct = (fraction: number) => `${parseFloat((fraction * 100).toFixed(2))}%`;
/** 0.0343 -> "3.4%" (one decimal, for what a sale pays) */
export const pctOne = (fraction: number) => `${(fraction * 100).toFixed(1)}%`;
export const money = (n: number) => `$${n.toFixed(2)}`;
const points = (n: number) => `${Math.round(n).toLocaleString('en-US')} points`;

/** The state the page is showing, from what the server sent. */
export function stateFromRows(tiers: TierRow[], categories: CategoryRow[]): RateState {
  const state: RateState = { tiers: {}, categories: {} };
  for (const r of tiers) {
    state.tiers[r.tier] = {
      cashbackRate: r.cashbackRate,
      gasCentsPerGallon: r.gasCentsPerGallon,
      thresholdPoints: r.tier === 'BRONZE' ? null : r.pointsThreshold,
      gasBonusCents: r.gasBonusCentsPerGallon ?? FALLBACK_GAS_BONUS_CENTS[r.tier] ?? 0,
    };
  }
  for (const c of categories) state.categories[c.category] = c.cashbackRate;
  return state;
}

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

const paysGasByGallon = (t: TierRateState) => t.gasCentsPerGallon != null && t.gasCentsPerGallon > 0;
export const totalRate = (state: RateState, tier: string, category: string) => (state.tiers[tier]?.cashbackRate ?? 0) + (state.categories[category] ?? 0);

/** Every tier and category pair over `limit`, leaving out the gas a tier pays by the gallon. */
export function totalsOver(state: RateState, limit: number): { tier: string; category: string; total: number }[] {
  const out: { tier: string; category: string; total: number }[] = [];
  for (const tier of TIERS) {
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

/** The first reason a change should not be saved, as a plain sentence, or null. Values that are not changing are not judged. */
export function refusalFor(before: RateState, tierChanges: TierChange[], categoryChanges: CategoryChange[] = []): string | null {
  for (const c of tierChanges) {
    const name = tierName(c.tier);
    const now = before.tiers[c.tier];
    if (c.cashbackRate !== undefined && c.cashbackRate !== now?.cashbackRate && c.cashbackRate > MAX_TIER_RATE + 1e-9) {
      return `${name} cashback can be at most ${pct(MAX_TIER_RATE)} (you entered ${pct(c.cashbackRate)}). Above that, sales are held for a manager to review.`;
    }
    if (c.gasCentsPerGallon != null && c.gasCentsPerGallon !== now?.gasCentsPerGallon && c.gasCentsPerGallon > MAX_GAS_CENTS) {
      return `${name} gas can pay at most ${MAX_GAS_CENTS} cents a gallon (you entered ${parseFloat(c.gasCentsPerGallon.toFixed(2))}). Check that it is in cents, not dollars.`;
    }
    if (c.pointsThreshold !== undefined && c.pointsThreshold !== now?.thresholdPoints) {
      if (c.tier === 'BRONZE') return 'Bronze is the starting tier and has no points threshold.';
      if (c.pointsThreshold < MIN_THRESHOLD_POINTS || c.pointsThreshold > MAX_THRESHOLD_POINTS) {
        return `${name} needs between ${points(MIN_THRESHOLD_POINTS)} and ${points(MAX_THRESHOLD_POINTS)} to reach (you entered ${points(c.pointsThreshold)}). The app shows customers points, and 100 points is $1 of cashback.`;
      }
    }
  }
  for (const c of categoryChanges) {
    if (c.cashbackRate !== before.categories[c.category] && c.cashbackRate > MAX_CATEGORY_BONUS + 1e-9) {
      return `${categoryName(c.category)} bonus can be at most ${pct(MAX_CATEGORY_BONUS)} (you entered ${pct(c.cashbackRate)}). It is added to every customer's tier rate.`;
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
  for (const o of totalsOver(after, CASHBACK_CAP)) {
    if (!touchedTiers.has(o.tier) && !touchedCategories.has(o.category)) continue;
    const was = before.tiers[o.tier] && !(GAS_CATEGORIES.includes(o.category) && paysGasByGallon(before.tiers[o.tier])) ? totalRate(before, o.tier, o.category) : 0;
    if (o.total <= was + 1e-9) continue;
    return `${tierName(o.tier)} (${pct(after.tiers[o.tier].cashbackRate)}) plus ${categoryName(o.category)} (${pct(after.categories[o.category] ?? 0)}) would be ${pct(o.total)}, more than the ${pct(CASHBACK_CAP)} a sale can ever pay. Lower one of them.`;
  }
  return null;
}

// ─── What a change means in dollars ──────────────────────────────────────────

/** The sale every example uses: a $40 basket, or a $40 fill of gas at a typical pump price. */
export const EXAMPLE_SALE = 40;
export const EXAMPLE_GAS_PRICE = 3.5;
export const exampleGallons = EXAMPLE_SALE / EXAMPLE_GAS_PRICE;

/** What a category sale pays a customer of this tier (gas by the gallon is not a category sale; use gasFill). */
export function salePays(state: RateState, tier: string, category: string, amount = EXAMPLE_SALE): number {
  return amount * totalRate(state, tier, category);
}

/** What a $40 fill pays a customer of this tier: the cashback (cents a gallon or a percent) plus the fixed extra for Gold and up. */
export function gasFill(state: RateState, tier: string): { cashback: number; bonus: number; total: number; percent: number } {
  const t = state.tiers[tier];
  if (!t) return { cashback: 0, bonus: 0, total: 0, percent: 0 };
  const cashback = paysGasByGallon(t) ? (exampleGallons * (t.gasCentsPerGallon as number)) / 100 : EXAMPLE_SALE * totalRate(state, tier, 'GAS');
  const bonus = (exampleGallons * t.gasBonusCents) / 100;
  return { cashback, bonus, total: cashback + bonus, percent: (cashback + bonus) / EXAMPLE_SALE };
}

/** The changes, one line each ("Silver cashback: 2% to 3%"). */
export function changeLines(before: RateState, tierChanges: TierChange[], categoryChanges: CategoryChange[] = []): string[] {
  const out: string[] = [];
  for (const c of tierChanges) {
    const was = before.tiers[c.tier];
    const name = tierName(c.tier);
    if (!was) continue;
    if (c.cashbackRate !== undefined && c.cashbackRate !== was.cashbackRate) out.push(`${name} cashback: ${pct(was.cashbackRate)} to ${pct(c.cashbackRate)}`);
    if (c.gasCentsPerGallon !== undefined && c.gasCentsPerGallon !== was.gasCentsPerGallon) {
      const show = (v: number | null) => (v == null ? 'percent of the sale' : `${parseFloat(v.toFixed(2))} cents a gallon`);
      out.push(`${name} gas: ${show(was.gasCentsPerGallon)} to ${show(c.gasCentsPerGallon)}`);
    }
    if (c.pointsThreshold !== undefined && c.pointsThreshold !== was.thresholdPoints) {
      out.push(`${name} points to reach the tier: ${was.thresholdPoints?.toLocaleString('en-US')} to ${c.pointsThreshold.toLocaleString('en-US')} (${money(c.pointsThreshold / 100)} of cashback)`);
    }
  }
  for (const c of categoryChanges) out.push(`${categoryName(c.category)} bonus: ${pct(before.categories[c.category] ?? 0)} to ${pct(c.cashbackRate)}`);
  return out;
}

/** What the change does to real sales, in dollars on the example sale. */
export function effectLines(before: RateState, tierChanges: TierChange[], categoryChanges: CategoryChange[] = []): string[] {
  const after = applyChanges(before, tierChanges, categoryChanges);
  const out: string[] = [];
  for (const c of tierChanges) {
    const name = tierName(c.tier);
    const b = before.tiers[c.tier];
    const a = after.tiers[c.tier];
    if (!b) continue;
    if (c.cashbackRate !== undefined && c.cashbackRate !== b.cashbackRate) {
      out.push(`A ${money(EXAMPLE_SALE)} grocery sale by a ${name} customer pays ${money(salePays(after, c.tier, 'GROCERIES'))} instead of ${money(salePays(before, c.tier, 'GROCERIES'))}.`);
    }
    if (c.gasCentsPerGallon !== undefined && c.gasCentsPerGallon !== b.gasCentsPerGallon) {
      const was = gasFill(before, c.tier);
      const now = gasFill(after, c.tier);
      out.push(`A ${money(EXAMPLE_SALE)} fill of gas (${exampleGallons.toFixed(1)} gallons) by a ${name} customer pays ${money(now.total)} instead of ${money(was.total)}${a.gasBonusCents ? ` (the fixed ${a.gasBonusCents} cent a gallon extra is included)` : ''}.`);
    }
    if (c.pointsThreshold !== undefined && c.pointsThreshold !== b.thresholdPoints) {
      out.push(`${name} is reached after ${money((c.pointsThreshold ?? 0) / 100)} of cashback in a half-year. Nobody changes tier right now: a customer's tier is checked when they next earn points.`);
    }
  }
  for (const c of categoryChanges) {
    if (GAS_CATEGORIES.includes(c.category)) {
      const percentTiers = TIERS.filter((t) => before.tiers[t] && !paysGasByGallon(after.tiers[t]));
      if (percentTiers.length === 0) out.push(`${categoryName(c.category)} bonus changes nothing today: every tier is paid for gas by the gallon, and this bonus is only used when a tier is paid as a percent.`);
      else out.push(`${categoryName(c.category)} bonus only reaches ${percentTiers.map(tierName).join(', ')} (paid for gas as a percent). ${money(EXAMPLE_SALE)} of ${categoryName(c.category).toLowerCase()} pays ${money(salePays(after, percentTiers[0], c.category))} instead of ${money(salePays(before, percentTiers[0], c.category))} for ${tierName(percentTiers[0])}.`);
    } else {
      out.push(`${money(EXAMPLE_SALE)} of ${categoryName(c.category).toLowerCase()} pays a Bronze customer ${money(salePays(after, 'BRONZE', c.category))} instead of ${money(salePays(before, 'BRONZE', c.category))}, and a Platinum customer ${money(salePays(after, 'PLATINUM', c.category))} instead of ${money(salePays(before, 'PLATINUM', c.category))}.`);
    }
  }
  return out;
}

/** Totals a change pushes above the review line: those sales would be held for a manager. */
export function holdWarnings(before: RateState, tierChanges: TierChange[], categoryChanges: CategoryChange[] = []): string[] {
  const after = applyChanges(before, tierChanges, categoryChanges);
  const touchedTiers = new Set(tierChanges.filter((c) => c.cashbackRate !== undefined || c.gasCentsPerGallon !== undefined).map((c) => c.tier));
  const touchedCategories = new Set(categoryChanges.map((c) => c.category));
  const found = totalsOver(after, CASHBACK_WARN).filter((o) => touchedTiers.has(o.tier) || touchedCategories.has(o.category));
  const lines = found.slice(0, 3).map((o) => `${tierName(o.tier)} plus ${categoryName(o.category)} would be ${pct(o.total)}: those sales are held for a manager to review (over ${pct(CASHBACK_WARN)}).`);
  if (found.length > 3) lines.push(`${found.length - 3} more tier and category pairs are over ${pct(CASHBACK_WARN)} too.`);
  return lines;
}

/** True when the change touches what the customer app shows as a fixed number (cashback percent, points to reach a tier). */
export function touchesAppText(tierChanges: TierChange[]): boolean {
  return tierChanges.some((c) => c.cashbackRate !== undefined || c.pointsThreshold !== undefined);
}
