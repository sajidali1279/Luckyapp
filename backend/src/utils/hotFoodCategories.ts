// Hot food categories (2026-10-13): HQ gives each catalog item one (a suggestion below, or its own), and the customer menu is grouped by
// it in this order; categories not in the list come after, A to Z; items with none come last ("More").
export const HOT_FOOD_CATEGORIES = [
  'Chicken', 'Tenders', 'Wings', 'Seafood', 'Sandwiches', 'Family Meals', 'Sides', 'Breakfast', 'Snacks', 'Desserts', 'Drinks',
] as const;

/** "family meals " as "Family Meals": a known category in its own spelling, anything else trimmed with its first letters capitalised. */
export function cleanCategory(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!t) return null;
  const known = HOT_FOOD_CATEGORIES.find((c) => c.toLowerCase() === t.toLowerCase());
  return known ?? t.replace(/(^|\s)(\S)/g, (_m, sp, ch) => sp + ch.toUpperCase());
}

/** The AppConfig key of HQ's own category order (2026-11-10, admin Hot Food > Catalog > Category order) */
export const CATEGORY_ORDER_KEY = 'HOT_FOOD_CATEGORY_ORDER';

/** The categories in the order the menu shows them: HQ's own order first (when set), then the suggested order, then the rest A to Z. */
export function orderCategories(names: (string | null | undefined)[], hqOrder: string[] = []): string[] {
  const set = new Set(names.filter((n): n is string => !!n));
  const mine = hqOrder.filter((c) => set.has(c));
  const known = HOT_FOOD_CATEGORIES.filter((c) => set.has(c) && !mine.includes(c));
  const other = [...set].filter((c) => !mine.includes(c) && !(HOT_FOOD_CATEGORIES as readonly string[]).includes(c)).sort((a, b) => a.localeCompare(b));
  return [...mine, ...known, ...other];
}

/** HQ's category order as saved: up to 60 cleaned, distinct names; anything else is []. */
export function cleanCategoryOrder(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const out: string[] = [];
  for (const x of v.slice(0, 60)) { const c = cleanCategory(x); if (c && !out.includes(c)) out.push(c); }
  return out;
}
