// One spelling of the product categories (the backend's ProductCategory) for every page and pop-up, in sentence case, and one name
// for "no category". Pages read their labels from here so a category never reads two ways in two places.

export const CATEGORY_LABELS: Record<string, string> = {
  GROCERIES: 'Groceries',
  FROZEN_FOODS: 'Frozen foods',
  FRESH_FOODS: 'Fresh foods',
  GAS: 'Gas',
  DIESEL: 'Diesel',
  HOT_FOODS: 'Hot food',
  OTHER: 'Other',
};

/** What an empty category means: the offer, challenge or picture is for every purchase. */
export const NO_CATEGORY_LABEL = 'All categories';

/** A category's label; none (null or empty) is "All categories", and a key this map does not know is spelled out from its name. */
export function categoryLabel(category?: string | null): string {
  if (!category) return NO_CATEGORY_LABEL;
  return CATEGORY_LABELS[category] ?? category.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase());
}

/** The categories as picker options, "All categories" first. */
export const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: NO_CATEGORY_LABEL },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];
