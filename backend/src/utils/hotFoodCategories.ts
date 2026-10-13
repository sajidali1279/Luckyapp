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

/** The categories in the order the menu shows them. */
export function orderCategories(names: (string | null | undefined)[]): string[] {
  const set = new Set(names.filter((n): n is string => !!n));
  const known = HOT_FOOD_CATEGORIES.filter((c) => set.has(c));
  const other = [...set].filter((c) => !(HOT_FOOD_CATEGORIES as readonly string[]).includes(c)).sort((a, b) => a.localeCompare(b));
  return [...known, ...other];
}
