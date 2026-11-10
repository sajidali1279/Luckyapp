// The Items page (2026-11-10): every product in the stores' PDI item lists, one row per product (its barcode key), with each store's own
// register price and cost. Each store's list is the truth for that store: prices are mostly the same across a state (the owner, 2026-11-10)
// but some items differ by store on purpose (a cigar at $1.19 at one store and $1.29 at another), so a price that differs is shown as
// information, never "fixed" here. Nothing in PDI is changed from here, and the lists' stock counts are never used (most are below zero).
//
// The lists hold about 8,000 items a store (65,000 rows for 8 stores), so the products are put together once per upload and kept in
// memory; any new upload (a new pdi_item_imports row) builds them again on the next request.
import prisma from '../config/prisma';
import { gs1CheckDigit } from './barcode';
import { pdiKey } from './pdiItemList';
import { departmentKind, itemKind, restrictedAcrossStores, restrictedKind, type DepartmentKind } from './pdiDepartments';

export interface CatalogStore { id: string; name: string; state: string | null }
export interface StorePrice { storeId: string; code: string; name: string; department: string | null; priceCents: number | null; costCents: number | null;
  kind?: DepartmentKind | null }   // what it is at this store: its department, a ticket by its name, or what most stores call it (utils/pdiDepartments.ts)
export interface Product { key: string; code: string; upc: string; name: string; department: string | null; kind: DepartmentKind | null; prices: StorePrice[]; search: string }
export interface Catalog { version: string; builtAt: Date; stores: CatalogStore[]; products: Product[]; byKey: Map<string, Product> }

/** Margins below this (percent of the price) are "low margin" unless asked otherwise. */
export const LOW_MARGIN_PCT = 10;
export const PAGE_SIZE = 50;

let cache: Catalog | null = null;
let building: Promise<Catalog> | null = null;

/** Forget the products (a list was uploaded); the next request builds them again. */
export function forgetCatalog() { cache = null; }

async function versionNow(): Promise<string> {
  const [last, n] = await Promise.all([
    prisma.pdiItemImport.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } }),
    prisma.pdiItemImport.count(),
  ]);
  return `${n}:${last?.id ?? 'none'}`;
}

const mostCommon = <T,>(xs: T[]): T | undefined => {
  const m = new Map<T, number>(); let best: T | undefined; let n = 0;
  for (const x of xs) { const c = (m.get(x) ?? 0) + 1; m.set(x, c); if (c > n) { n = c; best = x; } }
  return best;
};

/** Every product in the uploaded lists, one per barcode key, each with every store's own price. */
export async function buildCatalog(version: string): Promise<Catalog> {
  const [stores, rows] = await Promise.all([
    prisma.store.findMany({ select: { id: true, name: true, state: true } }),
    prisma.pdiItem.findMany({ select: { storeId: true, code: true, upcKey: true, name: true, department: true, priceCents: true, costCents: true } }),
  ]);
  stores.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const rank = new Map(stores.map((s, i) => [s.id, i]));
  const byKey = new Map<string, StorePrice[]>();
  const codeOf = new Map<string, string>();
  for (const r of rows) {
    const list = byKey.get(r.upcKey) ?? [];
    // one row per store: a list can hold the same product twice under two codes; the first is kept, as the upload does
    if (!list.some((p) => p.storeId === r.storeId)) list.push({ storeId: r.storeId, code: r.code, name: r.name.trim(), department: r.department, priceCents: r.priceCents, costCents: r.costCents });
    byKey.set(r.upcKey, list);
    if (!codeOf.has(r.upcKey)) codeOf.set(r.upcKey, r.code);
  }
  const products: Product[] = [];
  for (const [key, prices] of byKey) {
    prices.sort((a, b) => (rank.get(a.storeId) ?? 99) - (rank.get(b.storeId) ?? 99));   // stores in number order, once
    const own = prices.map((p) => itemKind(p.department, p.name, p.priceCents));
    prices.forEach((p, i) => {
      const others = prices.map((o, j) => ({ name: o.name, kind: own[j] })).filter((_, j) => j !== i);
      p.kind = restrictedAcrossStores(p.code, p.name, others, p.department) ?? own[i];
    });
    const code = codeOf.get(key)!;
    const name = mostCommon(prices.map((p) => p.name)) ?? '';
    const department = mostCommon(prices.map((p) => p.department).filter((d): d is string => !!d)) ?? null;
    const names = [...new Set(prices.map((p) => p.name.toUpperCase()))].join(' ');
    const kinds = prices.map((p) => p.kind ?? null);
    products.push({ key, code, upc: code.length === 11 ? code + gs1CheckDigit(code) : code, name, department, kind: restrictedKind(kinds) ?? mostCommon(kinds) ?? departmentKind(department), prices, search: `${names} ${code} ${key} ${code.length === 11 ? code + gs1CheckDigit(code) : ''}` });
  }
  products.sort((a, b) => a.name.localeCompare(b.name));
  return { version, builtAt: new Date(), stores, products, byKey: new Map(products.map((p) => [p.key, p])) };
}

/** The products, built again only when a list was uploaded since. */
export async function getCatalog(): Promise<Catalog> {
  const v = await versionNow();
  if (cache && cache.version === v) return cache;
  if (!building) building = buildCatalog(v).then((c) => { cache = c; return c; }).finally(() => { building = null; });
  return building;
}

// ─── What one person sees of a product ─────────────────────────────────────────

export interface PriceView extends StorePrice { storeName: string; state: string | null; marginPct: number | null }
export interface ProductView {
  key: string; upc: string; name: string; department: string | null; kind: DepartmentKind | null;
  prices: PriceView[]; minCents: number | null; maxCents: number | null;
  differs: boolean;                  // not the same price at every store shown
  differsInStates: string[];         // the states inside which the stores shown charge different prices
  belowCost: string[];               // stores whose register price is below their cost
  lowMargin: string[];               // stores whose margin is under the low-margin line (and not below cost)
  noCost: boolean;                   // no store shown has a cost for it
  names: number;                     // how many different names the stores give it
}

const margin = (p: StorePrice): number | null => (p.priceCents && p.costCents ? Math.round(((p.priceCents - p.costCents) / p.priceCents) * 1000) / 10 : null);

/** A product as seen at the given stores (null = every store), with what stands out about its prices. Null when none of them has it. */
export function viewOf(p: Product, stores: Map<string, CatalogStore>, scope: Set<string> | null, lowPct = LOW_MARGIN_PCT): ProductView | null {
  const prices: PriceView[] = p.prices.filter((x) => (!scope || scope.has(x.storeId)) && stores.has(x.storeId)).map((x) => {
    const s = stores.get(x.storeId)!;
    return { ...x, storeName: s.name, state: s.state, marginPct: margin(x) };
  });
  if (!prices.length) return null;
  const priced = prices.filter((x) => x.priceCents);
  const cents = priced.map((x) => x.priceCents!);
  const byState = new Map<string, Set<number>>();
  for (const x of priced) { const st = x.state ?? '?'; byState.set(st, (byState.get(st) ?? new Set()).add(x.priceCents!)); }
  return {
    key: p.key, upc: p.upc, name: p.name, department: p.department, kind: p.kind, prices,
    minCents: cents.length ? Math.min(...cents) : null, maxCents: cents.length ? Math.max(...cents) : null,
    differs: new Set(cents).size > 1,
    differsInStates: [...byState].filter(([, set]) => set.size > 1).map(([st]) => st).sort(),
    belowCost: prices.filter((x) => x.priceCents && x.costCents && x.priceCents < x.costCents).map((x) => x.storeName),
    lowMargin: prices.filter((x) => x.marginPct != null && x.marginPct >= 0 && x.marginPct < lowPct).map((x) => x.storeName),
    noCost: !prices.some((x) => x.costCents),
    names: new Set(prices.map((x) => x.name.toUpperCase())).size,
  };
}

export type ItemFilter = 'ALL' | 'DIFFERS' | 'DIFFERS_IN_STATE' | 'BELOW_COST' | 'LOW_MARGIN' | 'NO_COST' | 'NAMES';
export const ITEM_FILTERS: ItemFilter[] = ['ALL', 'DIFFERS', 'DIFFERS_IN_STATE', 'BELOW_COST', 'LOW_MARGIN', 'NO_COST', 'NAMES'];

const passes = (v: ProductView, f: ItemFilter) =>
  f === 'ALL' ? true
  : f === 'DIFFERS' ? v.differs
  : f === 'DIFFERS_IN_STATE' ? v.differsInStates.length > 0
  : f === 'BELOW_COST' ? v.belowCost.length > 0
  : f === 'LOW_MARGIN' ? v.lowMargin.length > 0
  : f === 'NO_COST' ? v.noCost
  : v.names > 1;

export interface ItemQuery {
  q?: string; department?: string; state?: string; filter?: ItemFilter; at?: string; notAt?: string; lowPct?: number; page?: number;
  sort?: 'name' | 'spread' | 'margin' | 'stores';
}

/** One page of products for a person (their stores only), with the counts of each problem over all their products. */
export function searchCatalog(cat: Catalog, scopeIds: string[] | null, query: ItemQuery) {
  const stores = new Map(cat.stores.map((s) => [s.id, s]));
  const lowPct = query.lowPct ?? LOW_MARGIN_PCT;
  // a state narrows the stores looked at (Texas prices next to Texas prices)
  let scopeList = scopeIds ?? cat.stores.map((s) => s.id);
  if (query.state) scopeList = scopeList.filter((id) => (stores.get(id)?.state ?? '') === query.state);
  const scope = new Set(scopeList);
  const words = (query.q ?? '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const digits = (query.q ?? '').replace(/\D/g, '');
  const byCode = digits.length >= 4 && digits.length === (query.q ?? '').replace(/\s/g, '').length;
  const filter = query.filter ?? 'ALL';
  // a whole barcode as scanned (12 or 13 digits, with or without its check digit) is matched by its key
  const wholeKey = byCode && digits.length >= 6 ? pdiKey(digits) : null;

  const counts: Record<ItemFilter, number> = { ALL: 0, DIFFERS: 0, DIFFERS_IN_STATE: 0, BELOW_COST: 0, LOW_MARGIN: 0, NO_COST: 0, NAMES: 0 };
  const departments = new Map<string, number>();
  const hits: ProductView[] = [];
  for (const p of cat.products) {
    const v = viewOf(p, stores, scope, lowPct);
    if (!v) continue;
    for (const f of ITEM_FILTERS) if (passes(v, f)) counts[f]++;
    const d = v.department ?? '';
    departments.set(d, (departments.get(d) ?? 0) + 1);
    if (query.department !== undefined && query.department !== '' && (v.department ?? '') !== query.department) continue;
    if (words.length && !(byCode ? p.key === wholeKey || p.search.includes(digits) : words.every((w) => p.search.includes(w)))) continue;
    if (query.at && !v.prices.some((x) => x.storeId === query.at)) continue;
    if (query.notAt && v.prices.some((x) => x.storeId === query.notAt)) continue;
    if (!passes(v, filter)) continue;
    hits.push(v);
  }
  const spread = (v: ProductView) => (v.maxCents ?? 0) - (v.minCents ?? 0);
  const worstMargin = (v: ProductView) => Math.min(...v.prices.map((x) => x.marginPct ?? 999));
  if (query.sort === 'spread') hits.sort((a, b) => spread(b) - spread(a) || a.name.localeCompare(b.name));
  else if (query.sort === 'margin') hits.sort((a, b) => worstMargin(a) - worstMargin(b) || a.name.localeCompare(b.name));
  else if (query.sort === 'stores') hits.sort((a, b) => b.prices.length - a.prices.length || a.name.localeCompare(b.name));
  const page = Math.max(1, Math.floor(query.page ?? 1));
  const pages = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
  return {
    total: hits.length, page: Math.min(page, pages), pages,
    items: hits.slice((Math.min(page, pages) - 1) * PAGE_SIZE, Math.min(page, pages) * PAGE_SIZE),
    counts, lowPct,
    departments: [...departments].map(([name, items]) => ({ name, items, kind: departmentKind(name) })).sort((a, b) => b.items - a.items),
  };
}

/** What a product is at one store (its kind), from the products; undefined when the store's list does not have it. */
export function kindAt(cat: Catalog, key: string, storeId: string): DepartmentKind | null | undefined {
  const row = cat.byKey.get(key)?.prices.find((p) => p.storeId === storeId);
  return row ? row.kind ?? null : undefined;
}

/** The products, or null when they cannot be built (the kinds then come from each store's own departments). */
export async function catalogOrNull(): Promise<Catalog | null> {
  try { return await getCatalog(); } catch (e) { console.error('[items] catalog failed:', (e as Error).message); return null; }
}

/** One product by its key, as this person sees it. */
export function productFor(cat: Catalog, key: string, scopeIds: string[] | null) {
  const p = cat.byKey.get(key);
  if (!p) return null;
  return viewOf(p, new Map(cat.stores.map((s) => [s.id, s])), scopeIds ? new Set(scopeIds) : null);
}
