// Sizing a deal so the owner does not give away too much: HQ sets a maximum discount per category (Labels > Deals > Deal limits; the system
// has no cost per item, so this is what keeps a deal from losing money), and a deal is the shelf-looking "N for $X" whose saving is as
// close as it can get to that limit without going over. Tobacco and Tobacco Accessories are left out by default.
//
// Kept the same in backend/src/utils/dealSuggest.ts and admin/src/lib/dealSuggest.ts (no imports, so both can use it as is).

export interface DealLimits {
  defaultPct: number;                       // for a category with no limit of its own
  categories: Record<string, number>;       // lower-case category name -> max discount %
  excluded: string[];                       // lower-case category names that get no deal suggestions
}

export const DEAL_LIMITS_DEFAULT: DealLimits = {
  defaultPct: 8,
  categories: {
    candy: 12, snacks: 12, gummies: 12,
    drinks: 10, water: 10, soda: 10, 'soft drinks': 10, 'energy drinks': 10, juice: 10, coffee: 10, tea: 10, 'protein drinks': 10,
  },
  excluded: ['tobacco', 'tobacco accessories'],
};

export const MIN_SAVING = 0.03;   // a deal that saves less than 3% is not worth a label
export const MIN_PRICE = 0.5;     // nor is one on an item under 50 cents
const SLACK = 0.005;              // "12%" allows 12.06% (2 for $3.50 on a $1.99 item): half a point of rounding
const key = (c: string | null | undefined) => (c ?? '').trim().toLowerCase();

/** The max discount for a category as a fraction (0.12), or null when the category gets no deals. */
export function limitFor(limits: DealLimits, category: string | null | undefined): number | null {
  const k = key(category);
  if (limits.excluded.includes(k)) return null;
  const pct = limits.categories[k] ?? limits.defaultPct;
  return Math.max(0, Math.min(50, pct)) / 100;
}

/** Shelf-looking totals, in cents: quarters ($3.25, $3.50) and prices ending in 9 ($2.29, $3.49). */
const shelfLike = (cents: number) => cents % 25 === 0 || cents % 10 === 9;

/**
 * The deal for a price within a limit: 2 of an item ($1 and up) or 3 (under $1), at the shelf-looking total whose saving is nearest the
 * target (the limit, or what deals on similar items save when that is less) and never more than the limit. null when no total saves at
 * least 3% within the limit (a very cheap item, or a limit under 3%).
 */
export function suggestDeal(price: number, limit: number, typical?: number | null): { qty: number; total: number; saving: number; text: string } | null {
  if (!(price >= MIN_PRICE) || !(limit >= MIN_SAVING)) return null;
  const qty = price < 1 ? 3 : 2;
  const full = Math.round(qty * price * 100);
  const target = Math.min(limit, typical != null && typical >= MIN_SAVING ? typical : limit);
  let best: { cents: number; saving: number } | null = null;
  for (let c = Math.ceil(full * (1 - limit - SLACK)); c <= Math.floor(full * (1 - MIN_SAVING)); c++) {
    if (!shelfLike(c)) continue;
    const saving = 1 - c / full;
    if (saving > limit + SLACK + 1e-9 || saving < MIN_SAVING - 1e-9) continue;
    // nearest the target; on a tie, a quarter ($3.50) before an ending in 9
    if (!best || Math.abs(saving - target) < Math.abs(best.saving - target) - 1e-9
      || (Math.abs(Math.abs(saving - target) - Math.abs(best.saving - target)) < 1e-9 && c % 25 === 0 && best.cents % 25 !== 0)) best = { cents: c, saving };
  }
  if (!best) return null;
  const total = best.cents / 100;
  return { qty, total, saving: Math.round(best.saving * 1000) / 1000, text: `${qty} for $${total.toFixed(2)}` };
}

/** Tobacco, vape and alcohol: their label deals never show in the customer app (Google Play policy), whatever the label says. */
export function isRestrictedCategory(category: string | null | undefined): boolean {
  const c = key(category);
  if (/\bbeer\s*salt\b/.test(c)) return false;   // salt for beer is not alcohol
  return /\b(tobacco|vapes?|vaping|e-?cig\w*|cigarettes?|cigars?|cigarillos?|nicotine|hookah|beer|wine|liquor|alcohol|spirits|seltzer)\b/.test(c);
}
