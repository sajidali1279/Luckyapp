// What the PDI item lists can tell beyond one item (2026-11-11, the owner's "what else can we do with this data", all seven ideas): margin by
// department, deal ideas from margin, items one store does not carry, what a reward or a hot food item is in PDI. Pure functions over the
// products (utils/itemCatalog.ts), so they are tested on the real files without a database. Margins come from each store's own cost and
// register price; about half the items have no cost, and an average over items is not weighted by what sells (no sales in these files).
import type { Catalog, Product, StorePrice } from './itemCatalog';
import { notARewardKind, type DepartmentKind } from './pdiDepartments';

const marginOf = (p: Pick<StorePrice, 'priceCents' | 'costCents'>): number | null =>
  p.priceCents && p.costCents ? ((p.priceCents - p.costCents) / p.priceCents) * 100 : null;
const round1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ─── Margin by department ─────────────────────────────────────────────────────

export interface DepartmentMargin {
  department: string; kind: DepartmentKind | null; items: number; withCost: number;
  medianPct: number | null;     // the middle item's margin: one wrong cost (a case cost typed as a unit cost) does not move it
  averagePct: number | null;    // over the items with a believable margin (-50% to 95%)
  belowCost: number; under10: number;
}

/** Each department of one store's list with its items' margins. */
export function departmentMargins(cat: Catalog, storeId: string): DepartmentMargin[] {
  const by = new Map<string, { kind: DepartmentKind | null; rows: StorePrice[] }>();
  for (const p of cat.products) {
    const row = p.prices.find((x) => x.storeId === storeId);
    if (!row) continue;
    const d = row.department ?? '';
    const g = by.get(d) ?? { kind: row.kind ?? null, rows: [] };
    g.rows.push(row);
    by.set(d, g);
  }
  return [...by].map(([department, g]) => {
    const m = g.rows.map(marginOf).filter((x): x is number => x != null);
    const believable = m.filter((x) => x >= -50 && x <= 95);
    const med = median(m);
    return {
      department, kind: g.kind, items: g.rows.length, withCost: m.length,
      medianPct: med == null ? null : round1(med),
      averagePct: believable.length ? round1(believable.reduce((a, b) => a + b, 0) / believable.length) : null,
      belowCost: m.filter((x) => x < 0).length, under10: m.filter((x) => x >= 0 && x < 10).length,
    };
  }).sort((a, b) => b.items - a.items);
}

// ─── Deal ideas ───────────────────────────────────────────────────────────────

export const DEAL_MIN_MARGIN = 35;      // the item's margin now, at every store with a cost
export const DEAL_KEEP_MARGIN = 20;     // what the deal price still leaves at the store with the highest cost
export const DEAL_MIN_SAVING = 10;      // the customer saves at least this much at the cheapest store

export interface DealIdea {
  key: string; upc: string; name: string; department: string | null; stores: number;
  minPriceCents: number; maxPriceCents: number; maxCostCents: number; marginNowPct: number;
  dealText: string; dealTotalCents: number; unitCents: number; marginAfterPct: number; savingPct: number;
}

/** "2 for $X" with X a round price (a whole dollar or a half): the highest one that saves the customer DEAL_MIN_SAVING% at the cheapest
 *  store and still leaves DEAL_KEEP_MARGIN% at the store with the highest cost. Null when none fits. */
export function twoForPrice(minPriceCents: number, maxCostCents: number): number | null {
  const most = Math.floor(2 * minPriceCents * (1 - DEAL_MIN_SAVING / 100));
  const least = Math.ceil((2 * maxCostCents) / (1 - DEAL_KEEP_MARGIN / 100));
  const t = Math.floor(most / 50) * 50;
  return t >= least && t >= 100 ? t : null;
}

/** Items with a healthy margin at every store that has a cost, sold at several stores, with a "2 for" deal that fits. Never tobacco,
 *  alcohol, lottery, CBD, propane or PDI's test department. */
export function dealIdeas(cat: Catalog, scope: Set<string> | null, opts: { minStores?: number; department?: string; q?: string } = {}): DealIdea[] {
  const minStores = opts.minStores ?? 3;
  const words = (opts.q ?? '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const out: DealIdea[] = [];
  for (const p of cat.products) {
    if (notARewardKind(p.kind) || p.prices.some((x) => notARewardKind(x.kind))) continue;
    if (/^0000/.test(p.code)) continue;   // a store's own short code, not a product barcode
    if (opts.department && (p.department ?? '') !== opts.department) continue;
    if (words.length && !words.every((w) => p.search.includes(w))) continue;
    const rows = p.prices.filter((x) => (!scope || scope.has(x.storeId)) && x.priceCents);
    if (rows.length < minStores) continue;
    const costed = rows.filter((x) => x.costCents);
    if (costed.length < 2) continue;
    const margins = costed.map((x) => marginOf(x)!);
    const marginNow = Math.min(...margins);
    if (marginNow < DEAL_MIN_MARGIN || Math.max(...margins) > 95) continue;   // over 95% is a cost typed wrong
    const minPrice = Math.min(...rows.map((x) => x.priceCents!));
    const maxPrice = Math.max(...rows.map((x) => x.priceCents!));
    const maxCost = Math.max(...costed.map((x) => x.costCents!));
    if (minPrice < 100 || minPrice > 2000) continue;   // a "2 for" is for everyday items between $1 and $20
    const total = twoForPrice(minPrice, maxCost);
    if (!total) continue;
    const unit = total / 2;
    out.push({
      key: p.key, upc: p.upc, name: p.name, department: p.department, stores: rows.length,
      minPriceCents: minPrice, maxPriceCents: maxPrice, maxCostCents: maxCost, marginNowPct: round1(marginNow),
      dealText: `2 for $${total % 100 ? (total / 100).toFixed(2) : total / 100}`, dealTotalCents: total, unitCents: unit,
      marginAfterPct: round1(((unit - maxCost) / unit) * 100), savingPct: round1(((minPrice - unit) / minPrice) * 100),
    });
  }
  return out.sort((a, b) => b.stores - a.stores || b.marginAfterPct - a.marginAfterPct || a.name.localeCompare(b.name));
}

// ─── Words that find a reward or a hot food item in PDI ───────────────────────

const FILLER = new Set(['ANY', 'OR', 'AND', 'THE', 'A', 'AN', 'OF', 'FOR', 'WITH', 'FLAVOR', 'FLAVORS', 'SIZE', 'ONE', 'FROM', 'BIGGER', 'UP', 'TO',
  'SMALL', 'BIG', 'LARGE', 'REGULAR', 'COOLER', 'BOTTLED', 'CUP', 'CAN', 'BOTTLE', 'BAG', 'FRESH', 'HOT', 'MEAL', 'PIECE', 'PIECES', 'PC']);

/** The words a name gives for a PDI search, when no one has set them: its words without filler ("Any Venom 16oz" is "venom 16oz"). */
export function defaultQuery(name: string): string {
  const w = name.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter((x) => x && !FILLER.has(x) && !/^\d+$/.test(x));
  return w.slice(0, 3).join(' ').toLowerCase();
}

/** The words of a query as matched: every one must be in the item's name (an "OZ" size is matched with or without a space). */
const queryWords = (q: string) => q.toUpperCase().replace(/(\d+)\s+OZ\b/g, '$1OZ').split(/\s+/).filter(Boolean).slice(0, 6);
const nameHas = (name: string, words: string[]) => {
  const n = name.toUpperCase().replace(/(\d+)\s+OZ\b/g, '$1OZ');
  return words.every((w) => n.includes(w));
};

export interface Match { storeId: string; name: string; priceCents: number | null; costCents: number | null }

/** The PDI items (at the given stores) whose names have every word, with only the kinds allowed. */
export function matchItems(cat: Catalog, query: string, scope: Set<string> | null, allow: (k: DepartmentKind | null | undefined) => boolean, limit = 400): Match[] {
  const words = queryWords(query);
  if (!words.length) return [];
  const out: Match[] = [];
  for (const p of cat.products) {
    if (!words.every((w) => p.search.includes(w))) continue;   // a quick pass on every store's names together
    for (const x of p.prices) {
      if (scope && !scope.has(x.storeId)) continue;
      if (!allow(x.kind) || !nameHas(x.name, words)) continue;
      out.push({ storeId: x.storeId, name: x.name, priceCents: x.priceCents, costCents: x.costCents });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** What a reward costs the store, from the items it can be: the middle cost (most items cost about that), the lowest and the highest. */
export function rewardCost(cat: Catalog, query: string, scope: Set<string> | null) {
  const hits = matchItems(cat, query, scope, (k) => !notARewardKind(k));
  const costs = hits.map((h) => h.costCents).filter((c): c is number => !!c && c < 100_000);
  const prices = hits.map((h) => h.priceCents).filter((c): c is number => !!c && c < 100_000);
  return {
    items: new Set(hits.map((h) => h.name.toUpperCase())).size, rows: hits.length, withCost: costs.length,
    costCents: costs.length ? Math.round(median(costs)!) : null, minCostCents: costs.length ? Math.min(...costs) : null, maxCostCents: costs.length ? Math.max(...costs) : null,
    priceCents: prices.length ? Math.round(median(prices)!) : null,
    examples: [...new Set(hits.map((h) => h.name))].slice(0, 5),
  };
}

/** The hot food items in a store's PDI list (its hot food departments) whose names have every word of the query. */
export function hotFoodMatches(cat: Catalog, query: string, storeId: string): Match[] {
  return matchItems(cat, query, new Set([storeId]), (k) => k === 'HOT_FOOD', 20);
}

// ─── Items one store does not carry ───────────────────────────────────────────

/** True when most of the other stores that have a list carry the product (and at least 2). */
export function carriedByMost(p: Product, missingAt: string, listStores: Set<string>): boolean {
  const others = [...listStores].filter((id) => id !== missingAt);
  if (others.length < 2) return false;
  const n = p.prices.filter((x) => x.storeId !== missingAt && listStores.has(x.storeId)).length;
  return n >= 2 && n * 2 > others.length;
}

// ─── A product asked for by name (customer product requests) ──────────────────

const ASK_FILLER = new Set(['ANY', 'THE', 'AND', 'FOR', 'WITH', 'PLEASE', 'YOU', 'GUYS', 'CAN', 'GET', 'SOME', 'MORE', 'NEW', 'FLAVOR', 'FLAVORS', 'PACK']);

/** The PDI items a typed product name ("Takis Blue Heat") can be: every word of 3+ letters in the item's name. At the given store first
 *  (up to 3, with prices), then the other stores (of `scope`) that carry one. Null when the name has no usable word. */
export function askedFor(cat: Catalog, text: string, storeId: string, scope: Set<string> | null) {
  const words = text.toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length >= 3 && !ASK_FILLER.has(w)).slice(0, 4);
  if (!words.length) return null;
  const here: { name: string; priceCents: number | null }[] = [];
  const elsewhere = new Map<string, string>();   // store id -> an item's name there
  for (const p of cat.products) {
    if (!words.every((w) => p.search.includes(w))) continue;
    for (const x of p.prices) {
      if (!words.every((w) => x.name.toUpperCase().includes(w))) continue;
      if (x.storeId === storeId) { if (here.length < 3) here.push({ name: x.name, priceCents: x.priceCents }); }
      else if ((!scope || scope.has(x.storeId)) && !elsewhere.has(x.storeId)) elsewhere.set(x.storeId, x.name);
    }
  }
  const names = new Map(cat.stores.map((s) => [s.id, s.name]));
  const hasList = cat.listStores.has(storeId);
  return {
    words: words.join(' ').toLowerCase(), hasList, here,
    elsewhere: [...elsewhere].map(([id, name]) => ({ storeName: names.get(id) ?? 'Store', name }))
      .sort((a, b) => a.storeName.localeCompare(b.storeName, undefined, { numeric: true })).slice(0, 6),
  };
}
