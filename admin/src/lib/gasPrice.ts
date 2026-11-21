// Gas and diesel price helpers shared by the Stores page and its Gas prices board (2026-11-20).

const DAY_MS = 86_400_000;

/** How old a price is, in words. A price of 0 (what a store starts with) or a missing date means it was never set. Stale is more than two days. */
export function priceAge(price: number | null, at: string | null): { text: string; stale: boolean; days: number | null } {
  if (price == null || price <= 0 || !at) return { text: 'never set', stale: true, days: null };
  const days = Math.floor((Date.now() - new Date(at).getTime()) / DAY_MS);
  return { text: days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`, stale: days > 2, days };
}

/** The problem with a typed price (the server enforces the same rule), or null when it is fine or empty. */
export function priceProblem(label: string, text: string): string | null {
  const t = text.trim();
  if (t === '') return null;
  if (!/^\d{1,2}(\.\d{1,3})?$/.test(t)) return `${label}: enter a price such as 3.499 (at most three decimals).`;
  const v = Number(t);
  if (v < 0.5) return `${label}: the price must be at least $0.50.`;
  if (v > 20) return `${label}: the price can be at most $20.00.`;
  return null;
}

/** Whether a store sells gas or diesel (no categories chosen = all of them; missing on a partial reply = all, never a crash). */
export function categoryEnabled(store: { enabledCategories?: string[] | null }, category: 'GAS' | 'DIESEL'): boolean {
  const cats = store.enabledCategories ?? [];
  return cats.length === 0 || cats.includes(category);
}

/** A saved price as the box shows it ('' when never set). */
export function priceText(v: number | null | undefined): string {
  return v != null && v > 0 ? v.toFixed(3) : '';
}
