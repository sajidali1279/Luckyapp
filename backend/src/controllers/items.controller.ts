// The Items page (2026-11-10, step 1 of the owner's items plan): every product in the stores' PDI item lists, found by name or barcode,
// with each store's own register price and cost, and the lists of what stands out (below cost, low margin, prices that differ inside a
// state, no cost, different names). Read only: prices are changed in PDI, and shelf labels in Labels. HQ sees every store; a store manager
// sees only their own stores (prices and costs), the same rule as the PDI item lists.
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { storeIdsFor } from './pdiItems.controller';
import { Role } from '@prisma/client';
import { getCatalog, searchCatalog, productFor, ITEM_FILTERS, PAGE_SIZE, type ItemFilter, type ItemQuery, type Catalog, type Product, type StorePrice } from '../utils/itemCatalog';
import { barcodeVariants, gs1CheckDigit } from '../utils/barcode';
import { hasMinRole } from '../middleware/auth';
import { audit } from '../utils/audit';
import { pdiKey } from '../utils/pdiItemList';
import { appCategoryFor } from '../utils/pdiDepartments';
import { canonicalPrice, samePrice } from '../utils/labelPrice';
import { ensureScannedProductForBarcode } from '../utils/labelSync';
import { priceUp, priceDown, costUpSamePrice } from '../utils/pdiPriceHistory';
import { departmentMargins, dealIdeas, rewardCost, hotFoodMatches, defaultQuery, DEAL_MIN_MARGIN, DEAL_KEEP_MARGIN, DEAL_MIN_SAVING } from '../utils/itemInsights';

const str = (v: unknown, n = 80) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);

/** GET /items?q&department&state&filter&at&notAt&lowPct&sort&page */
export async function listItems(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const cat = await getCatalog();
  const filter = str(req.query.filter) as ItemFilter | undefined;
  const sort = str(req.query.sort);
  const lowPct = Number(req.query.lowPct);
  const query: ItemQuery = {
    q: str(req.query.q), department: str(req.query.department, 120), state: str(req.query.state, 4),
    filter: filter && ITEM_FILTERS.includes(filter) ? filter : 'ALL',
    at: str(req.query.at, 64), notAt: str(req.query.notAt, 64),
    lowPct: Number.isFinite(lowPct) && lowPct > 0 && lowPct <= 90 ? lowPct : undefined,
    sort: sort === 'spread' || sort === 'margin' || sort === 'stores' ? sort : 'name',
    page: Number(req.query.page) || 1,
  };
  // a store or state outside the person's stores finds nothing rather than another store's prices
  const result = searchCatalog(cat, scope, query);
  const mine = cat.stores.filter((s) => !scope || scope.includes(s.id));
  const imports = await prisma.pdiItemImport.findMany({ where: { storeId: { in: mine.map((s) => s.id) } }, orderBy: { createdAt: 'desc' }, distinct: ['storeId'], select: { storeId: true, createdAt: true, items: true } });
  res.json({ success: true, data: {
    ...result,
    stores: mine.map((s) => {
      const imp = imports.find((i) => i.storeId === s.id);
      return { id: s.id, name: s.name, state: s.state, items: imp?.items ?? 0, uploadedAt: imp?.createdAt ?? null };
    }),
    states: [...new Set(mine.filter((s) => imports.some((i) => i.storeId === s.id)).map((s) => s.state).filter((x): x is string => !!x))].sort(),
    builtAt: cat.builtAt,
  } });
}

/** GET /items/:key: one product at each of the person's stores, with what the app has for it (shelf label and its price at each store,
 *  the rewards and the shelf deal on that label, the scanned product). */
export async function getItem(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const key = String(req.params.key ?? '').replace(/\D/g, '').slice(0, 14);
  const view = key ? productFor(await getCatalog(), key, scope) : null;
  if (!view) { res.status(404).json({ success: false, error: 'No store you can see has this item in its PDI list.' }); return; }
  const variants = barcodeVariants(view.upc);
  const [labels, scanned] = await Promise.all([
    prisma.label.findMany({
      where: { barcode: { in: variants } },
      select: { id: true, productName: true, priceText: true, dealText: true, category: true,
        storeLabels: { select: { storeId: true, priceText: true } },
        rewards: { select: { id: true, title: true, pointsCost: true, isActive: true, storeId: true } } },
    }),
    prisma.scannedProduct.findFirst({ where: { barcode: { in: variants } }, select: { name: true, category: true, brand: true, source: true } }),
  ]);
  // its price history at the person's stores (2026-11-11), newest first
  const history = await prisma.pdiPriceChange.findMany({
    where: { upcKey: view.key, ...(scope ? { storeId: { in: scope } } : {}) }, orderBy: { createdAt: 'desc' }, take: 60,
    select: { storeId: true, kind: true, oldPriceCents: true, newPriceCents: true, oldCostCents: true, newCostCents: true, createdAt: true },
  });
  const nameOf = new Map(view.prices.map((p) => [p.storeId, p.storeName]));
  const label = labels[0] ?? null;
  const shelf = (storeId: string): string | null => {
    if (!label) return null;
    const sl = label.storeLabels.find((x) => x.storeId === storeId);
    if (!sl) return null;   // this store has no copy of the label
    return sl.priceText ?? label.priceText;
  };
  res.json({ success: true, data: {
    ...view,
    prices: view.prices.map((p) => ({ ...p, shelfPrice: shelf(p.storeId), hasLabel: !!label?.storeLabels.some((x) => x.storeId === p.storeId) })),
    label: label && {
      id: label.id, productName: label.productName, priceText: label.priceText, dealText: label.dealText, category: label.category,
      stores: label.storeLabels.filter((x) => !scope || scope.includes(x.storeId)).length,
      rewards: label.rewards.filter((r) => !r.storeId || !scope || scope.includes(r.storeId)).map((r) => ({ id: r.id, title: r.title, pointsCost: r.pointsCost, isActive: r.isActive })),
    },
    otherLabels: labels.length - (label ? 1 : 0),
    scanned,
    history: history.map((h) => ({ ...h, storeName: nameOf.get(h.storeId) ?? null })),
  } });
}

// ─── 2026-11-11: the owner's seven ideas for the PDI lists ─────────────────────

const page = (v: unknown) => Math.max(1, Math.floor(Number(v) || 1));
const isHq = (req: AuthRequest) => hasMinRole(req.user!.role, Role.SUPER_ADMIN);
const inScope = (scope: string[] | null, storeId: string | undefined) => !!storeId && (!scope || scope.includes(storeId));

export const CHANGE_FILTERS = ['ALL', 'PRICE_UP', 'PRICE_DOWN', 'COST_UP', 'NEW', 'GONE'] as const;
type ChangeFilter = (typeof CHANGE_FILTERS)[number];

/** GET /items/changes?storeId&importId&filter&q&page: what changed in a store's PDI list at one upload (the last one unless chosen). */
export async function listChanges(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const storeId = str(req.query.storeId, 64);
  if (!inScope(scope, storeId)) { res.status(403).json({ success: false, error: 'Pick one of your stores.' }); return; }
  const imports = await prisma.pdiItemImport.findMany({
    where: { storeId }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, createdAt: true, fileName: true, items: true, pricesUp: true, pricesDown: true, costsUp: true, newItems: true, goneItems: true },
  });
  const wanted = str(req.query.importId, 64);
  const imp = imports.find((i) => i.id === wanted) ?? imports[0] ?? null;
  const filter: ChangeFilter = (CHANGE_FILTERS as readonly string[]).includes(str(req.query.filter) ?? '') ? (str(req.query.filter) as ChangeFilter) : 'ALL';
  const empty = { imports, importId: imp?.id ?? null, compared: imp ? imp.pricesUp != null : false, total: 0, page: 1, pages: 1, changes: [] as unknown[] };
  if (!imp || imp.pricesUp == null) { res.json({ success: true, data: empty }); return; }
  const all = await prisma.pdiPriceChange.findMany({ where: { importId: imp.id }, orderBy: { name: 'asc' } });
  const words = (str(req.query.q) ?? '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const rows = all.filter((c) => {
    if (words.length && !words.every((w) => c.name.toUpperCase().includes(w) || c.code.includes(w))) return false;
    return filter === 'ALL' ? true : filter === 'PRICE_UP' ? priceUp(c) : filter === 'PRICE_DOWN' ? priceDown(c) : filter === 'COST_UP' ? costUpSamePrice(c) : c.kind === filter;
  });
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const p = Math.min(page(req.query.page), pages);
  res.json({ success: true, data: {
    ...empty, total: rows.length, page: p, pages,
    changes: rows.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE).map((c) => ({
      code: c.code, upc: c.code.length === 11 ? c.code + gs1CheckDigit(c.code) : c.code, key: c.upcKey, name: c.name, kind: c.kind,
      oldPriceCents: c.oldPriceCents, newPriceCents: c.newPriceCents, oldCostCents: c.oldCostCents, newCostCents: c.newCostCents,
    })),
  } });
}

// ─── Shelf labels made from PDI ───────────────────────────────────────────────

const NO_LABEL_KINDS = new Set(['LOTTERY', 'TEST']);
export const MAKE_LABELS_MAX = 300;

/** The labels in the catalog by their PDI key, with whether the store has a copy. */
async function labelsByKey(storeId: string) {
  const labels = await prisma.label.findMany({
    where: { barcode: { not: null } },
    select: { id: true, productName: true, priceText: true, dealText: true, barcode: true, createdAt: true,
      storeLabels: { select: { storeId: true, everPrinted: true, priceText: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const by = new Map<string, (typeof labels)[number]>();
  for (const l of labels) { const k = pdiKey(l.barcode!); if (!by.has(k)) by.set(k, l); }   // the oldest item wins, as everywhere
  return { by, onStore: (l: (typeof labels)[number]) => l.storeLabels.some((s) => s.storeId === storeId) };
}

/** A store's PDI items that could get a shelf label: a real barcode, a register price a label can carry, not a lottery ticket. */
function labelRows(cat: Catalog, storeId: string) {
  const out: { p: Product; row: StorePrice; price: string }[] = [];
  for (const p of cat.products) {
    const row = p.prices.find((x) => x.storeId === storeId);
    if (!row || NO_LABEL_KINDS.has(row.kind ?? '') || /^0000/.test(p.code) || !/^\d{11,13}$/.test(p.code)) continue;
    const price = row.priceCents ? canonicalPrice((row.priceCents / 100).toFixed(2)) : null;
    if (!price) continue;
    out.push({ p, row, price });
  }
  return out;
}

/** GET /items/label-candidates?storeId&department&q&page: the store's PDI items with no shelf label on its list. */
export async function labelCandidates(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const storeId = str(req.query.storeId, 64);
  if (!inScope(scope, storeId)) { res.status(403).json({ success: false, error: 'Pick one of your stores.' }); return; }
  const cat = await getCatalog();
  const { by, onStore } = await labelsByKey(storeId!);
  const department = str(req.query.department, 120);
  const words = (str(req.query.q) ?? '').toUpperCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const departments = new Map<string, number>();
  const hits: { key: string; upc: string; name: string; department: string | null; priceCents: number; label: { id: string; productName: string; priceText: string | null } | null }[] = [];
  for (const { p, row } of labelRows(cat, storeId!)) {
    const l = by.get(p.key);
    if (l && onStore(l)) continue;
    const d = row.department ?? '';
    departments.set(d, (departments.get(d) ?? 0) + 1);
    if (department !== undefined && department !== '' && d !== department) continue;
    if (words.length && !words.every((w) => p.search.includes(w))) continue;
    hits.push({ key: p.key, upc: p.upc, name: row.name, department: row.department, priceCents: row.priceCents!, label: l ? { id: l.id, productName: l.productName, priceText: l.priceText } : null });
  }
  const pages = Math.max(1, Math.ceil(hits.length / PAGE_SIZE));
  const p = Math.min(page(req.query.page), pages);
  res.json({ success: true, data: {
    total: hits.length, page: p, pages, items: hits.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE),
    keys: hits.slice(0, MAKE_LABELS_MAX).map((h) => h.key),   // "tick all" (up to the most made at once) without loading every page
    departments: [...departments].map(([name, items]) => ({ name, items })).sort((a, b) => b.items - a.items),
    canMake: isHq(req), max: MAKE_LABELS_MAX,
  } });
}

/** POST /items/make-labels {storeId, keys} (HQ): a shelf label at the register price for each item, on the store's print list as new. An
 *  item already in the Labels catalog (from another store) is added to this store's list, with this store's own price when the chain
 *  price differs; a priceless placeholder a scan made is filled in. Every price is read again here from the store's PDI list. */
export async function makeLabels(req: AuthRequest, res: Response) {
  if (!isHq(req)) { res.status(403).json({ success: false, error: 'Only HQ makes shelf labels from PDI.' }); return; }
  const body = (req.body ?? {}) as { storeId?: unknown; keys?: unknown };
  const storeId = typeof body.storeId === 'string' ? body.storeId : '';
  const store = storeId ? await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } }) : null;
  if (!store) { res.status(400).json({ success: false, error: 'Pick the store.' }); return; }
  const keys = Array.isArray(body.keys) ? [...new Set(body.keys.filter((k): k is string => typeof k === 'string' && /^\d{1,14}$/.test(k)))] : [];
  if (!keys.length) { res.status(400).json({ success: false, error: 'Pick the items.' }); return; }
  if (keys.length > MAKE_LABELS_MAX) { res.status(400).json({ success: false, error: `At most ${MAKE_LABELS_MAX} labels at once.` }); return; }
  const cat = await getCatalog();
  const rows = new Map(labelRows(cat, store.id).map((r) => [r.p.key, r]));
  const { by } = await labelsByKey(store.id);
  const out = { made: 0, added: 0, filled: 0, already: 0, skipped: 0 };
  const names: string[] = [];
  for (const key of keys) {
    const r = rows.get(key);
    if (!r) { out.skipped++; continue; }
    const category = appCategoryFor(r.row.department) ?? (r.row.kind === 'TOBACCO' ? 'Tobacco' : null);
    const existing = by.get(key);
    try {
      if (existing) {
        const placeholder = existing.priceText == null && existing.dealText == null && existing.storeLabels.every((s) => !s.everPrinted && s.priceText == null);
        if (!placeholder && existing.storeLabels.some((s) => s.storeId === store.id)) { out.already++; continue; }
        const done: 'already' | 'filled' | 'added' = await prisma.$transaction(async (tx) => {
          if (placeholder) {
            const { count } = await tx.label.updateMany({ where: { id: existing.id, priceText: null, dealText: null }, data: { productName: r.p.name.slice(0, 200), priceText: r.price, ...(category ? { category } : {}) } });
            if (!count) return 'already';
          }
          const has = await tx.storeLabel.findUnique({ where: { labelId_storeId: { labelId: existing.id, storeId: store.id } }, select: { id: true } });
          if (has) return placeholder ? 'filled' : 'already';
          const chain = placeholder ? r.price : existing.priceText;
          await tx.storeLabel.create({ data: { labelId: existing.id, storeId: store.id, priceText: samePrice(chain, r.price) ? null : r.price } });
          return placeholder ? 'filled' : 'added';
        });
        out[done]++;
        if (done !== 'already') names.push(existing.productName);
      } else {
        const label = await prisma.label.create({ data: {
          productName: r.p.name.slice(0, 200), barcode: r.p.upc, priceText: r.price, category, createdByStoreId: store.id, createdById: req.user!.id,
          storeLabels: { create: { storeId: store.id, priceText: null } },
        } });
        out.made++;
        names.push(label.productName);
        try { await ensureScannedProductForBarcode(label.barcode!, { name: label.productName, category: label.category, brand: null }); }
        catch (e) { console.error('ensureScannedProductForBarcode failed for label', label.id, e); }
      }
    } catch (e) {
      console.error('[items] make label failed', key, (e as Error).message);
      out.skipped++;
    }
  }
  const total = out.made + out.added + out.filled;
  if (total) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'LABELS_FROM_PDI', entity: 'Store', entityId: store.id,
      details: { summary: `Made ${total} shelf label${total === 1 ? '' : 's'} from PDI at ${store.name} (register prices): ${names.slice(0, 8).join(', ')}${names.length > 8 ? ` and ${names.length - 8} more` : ''}`, ...out },
      storeId: store.id, storeName: store.name,
    });
  }
  res.json({ success: true, data: out });
}

// ─── Margins and deal ideas ───────────────────────────────────────────────────

/** GET /items/margins?storeId: each department of the store's list with its margins. */
export async function margins(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const storeId = str(req.query.storeId, 64);
  if (!inScope(scope, storeId)) { res.status(403).json({ success: false, error: 'Pick one of your stores.' }); return; }
  res.json({ success: true, data: { departments: departmentMargins(await getCatalog(), storeId!) } });
}

/** GET /items/deal-ideas?state&department&q&page: items with a healthy margin everywhere, each with a "2 for" deal that fits. */
export async function dealIdeasList(req: AuthRequest, res: Response) {
  const scopeIds = await storeIdsFor(req.user!);
  const cat = await getCatalog();
  const state = str(req.query.state, 4);
  let ids = scopeIds ?? cat.stores.map((s) => s.id);
  if (state) ids = ids.filter((id) => cat.stores.find((s) => s.id === id)?.state === state);
  const listed = ids.filter((id) => cat.listStores.has(id) && !cat.standIn.has(id));
  const ideas = dealIdeas(cat, new Set(ids), { minStores: Math.min(3, Math.max(1, listed.length)), department: str(req.query.department, 120), q: str(req.query.q) });
  const pages = Math.max(1, Math.ceil(ideas.length / PAGE_SIZE));
  const p = Math.min(page(req.query.page), pages);
  res.json({ success: true, data: {
    total: ideas.length, page: p, pages, ideas: ideas.slice((p - 1) * PAGE_SIZE, p * PAGE_SIZE),
    rules: { minMarginPct: DEAL_MIN_MARGIN, keepMarginPct: DEAL_KEEP_MARGIN, minSavingPct: DEAL_MIN_SAVING }, stores: listed.length,
  } });
}

// ─── What a reward costs the store, and the hot food menu against the register ─

const QUERY_MAX = 60;
const cleanQuery = (v: unknown): string | null | undefined => {
  if (v === null || v === '') return null;
  if (typeof v !== 'string') return undefined;
  const q = v.replace(/\s+/g, ' ').trim().slice(0, QUERY_MAX);
  return q || null;
};

/** GET /items/reward-costs: each reward with what it costs the store, from the PDI items its words find (at the person's stores). */
export async function rewardCosts(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const cat = await getCatalog();
  const rewards = await prisma.redemptionCatalogItem.findMany({
    where: scope ? { OR: [{ storeId: null }, { storeId: { in: scope } }] } : {},
    select: { id: true, title: true, pointsCost: true, pdiQuery: true, storeId: true, isActive: true },
  });
  const set = scope ? new Set(scope) : null;
  res.json({ success: true, data: { rewards: rewards.map((r) => {
    const query = r.pdiQuery ?? defaultQuery(r.title);
    return { id: r.id, query, custom: r.pdiQuery != null, pointsCost: r.pointsCost, isActive: r.isActive, ...rewardCost(cat, query, set) };
  }) } });
}

/** PATCH /items/reward-costs/:id {pdiQuery}: the words that find the reward in PDI (null: from its title). HQ, or the manager of a store's own reward. */
export async function setRewardQuery(req: AuthRequest, res: Response) {
  const q = cleanQuery((req.body ?? {}).pdiQuery);
  if (q === undefined) { res.status(400).json({ success: false, error: 'Type the words that find it in PDI.' }); return; }
  const r = await prisma.redemptionCatalogItem.findUnique({ where: { id: String(req.params.id) }, select: { id: true, title: true, storeId: true } });
  if (!r) { res.status(404).json({ success: false, error: 'That reward is gone.' }); return; }
  const scope = await storeIdsFor(req.user!);
  if (!isHq(req) && !(r.storeId && inScope(scope, r.storeId))) { res.status(403).json({ success: false, error: 'Only HQ changes a reward for every store.' }); return; }
  await prisma.redemptionCatalogItem.update({ where: { id: r.id }, data: { pdiQuery: q } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'CATALOG_ITEM_UPDATE', entity: 'RedemptionCatalogItem', entityId: r.id,
    details: { summary: `Reward ${r.title}: PDI search words ${q ? `"${q}"` : 'back to its name'}` }, storeId: r.storeId ?? undefined });
  res.json({ success: true, data: { id: r.id, pdiQuery: q } });
}

/** GET /items/hot-food-check: each hot food menu item at each of its stores with a PDI list, next to the PDI hot food items its words find. */
export async function hotFoodCheck(req: AuthRequest, res: Response) {
  const scope = await storeIdsFor(req.user!);
  const cat = await getCatalog();
  const items = await prisma.hotFoodCatalogItem.findMany({
    select: { id: true, name: true, price: true, pdiQuery: true, stores: { where: { isAvailable: true }, select: { storeId: true } } },
    orderBy: { name: 'asc' },
  });
  const storeName = new Map(cat.stores.map((s) => [s.id, s.name]));
  const hasHotFood = new Set<string>();
  for (const p of cat.products) for (const x of p.prices) if (x.kind === 'HOT_FOOD') hasHotFood.add(x.storeId);
  res.json({ success: true, data: { canEdit: isHq(req), items: items.map((it) => {
    const stores = hotFoodRows(cat, it, scope, hasHotFood, storeName);
    return { id: it.id, name: it.name, appCents: Math.round(it.price * 100), query: it.pdiQuery ?? defaultQuery(it.name), custom: it.pdiQuery != null,
      stores, registerCents: oneRegisterPrice(stores, Math.round(it.price * 100)) };
  }) } });
}

/** One hot food item at each of its stores with a PDI list (in scope), next to the PDI hot food item its words find. */
function hotFoodRows(cat: Catalog, it: { name: string; price: number; pdiQuery: string | null; stores: { storeId: string }[] }, scope: string[] | null, hasHotFood: Set<string>, storeName: Map<string, string>) {
  const query = it.pdiQuery ?? defaultQuery(it.name);
  const appCents = Math.round(it.price * 100);
  return it.stores.map((s) => s.storeId).filter((id) => inScope(scope, id) && hasHotFood.has(id))
    .sort((a, b) => (storeName.get(a) ?? '').localeCompare(storeName.get(b) ?? '', undefined, { numeric: true }))
    .map((id) => {
      const m = hotFoodMatches(cat, query, id);
      const same = m.find((x) => x.priceCents === appCents);
      const best = same ?? m[0] ?? null;
      return { storeId: id, storeName: storeName.get(id) ?? 'Store', matches: m.length, pdiName: best?.name ?? null, pdiCents: best?.priceCents ?? null, differs: !!best && !same };
    });
}

/** The register price every store found agrees on, when it is not the app's (2026-11-11: "Use the register price"); null otherwise. */
const oneRegisterPrice = (rows: { pdiCents: number | null; matches: number }[], appCents: number): number | null => {
  const found = rows.filter((r) => r.matches === 1 && r.pdiCents);   // only stores where the words find exactly one item
  if (!found.length || found.length !== rows.filter((r) => r.matches > 0).length) return null;
  const prices = new Set(found.map((r) => r.pdiCents!));
  const [only] = [...prices];
  return prices.size === 1 && only !== appCents && only < 100_000 ? only : null;
};

/** POST /items/hot-food-check/:id/use-register (HQ): the menu item's app price becomes the price every store's register agrees on. */
export async function useHotFoodRegisterPrice(req: AuthRequest, res: Response) {
  if (!isHq(req)) { res.status(403).json({ success: false, error: 'Only HQ changes the hot food menu.' }); return; }
  const it = await prisma.hotFoodCatalogItem.findUnique({ where: { id: String(req.params.id) },
    select: { id: true, name: true, price: true, pdiQuery: true, stores: { where: { isAvailable: true }, select: { storeId: true } } } });
  if (!it) { res.status(404).json({ success: false, error: 'That menu item is gone.' }); return; }
  const cat = await getCatalog();
  const hasHotFood = new Set<string>();
  for (const p of cat.products) for (const x of p.prices) if (x.kind === 'HOT_FOOD') hasHotFood.add(x.storeId);
  const cents = oneRegisterPrice(hotFoodRows(cat, it, null, hasHotFood, new Map(cat.stores.map((s) => [s.id, s.name]))), Math.round(it.price * 100));
  if (cents == null) { res.status(409).json({ success: false, error: 'The registers do not agree on one price for it (or it already is the app price). Nothing was changed.' }); return; }
  const price = cents / 100;
  await prisma.hotFoodCatalogItem.update({ where: { id: it.id }, data: { price } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'HOT_FOOD_ITEM_UPDATED', entity: 'hot_food_item', entityId: it.id,
    details: { name: it.name, changes: { price: { was: it.price, now: price } }, summary: `Hot food ${it.name}: app price $${it.price.toFixed(2)} to $${price.toFixed(2)}, the stores' register price in PDI` } });
  res.json({ success: true, data: { id: it.id, price } });
}

/** PATCH /items/hot-food-check/:id {pdiQuery} (HQ): the words that find a hot food item in the stores' PDI hot food (null: from its name). */
export async function setHotFoodQuery(req: AuthRequest, res: Response) {
  if (!isHq(req)) { res.status(403).json({ success: false, error: 'Only HQ changes the hot food menu.' }); return; }
  const q = cleanQuery((req.body ?? {}).pdiQuery);
  if (q === undefined) { res.status(400).json({ success: false, error: 'Type the words that find it in PDI.' }); return; }
  const it = await prisma.hotFoodCatalogItem.findUnique({ where: { id: String(req.params.id) }, select: { id: true, name: true } });
  if (!it) { res.status(404).json({ success: false, error: 'That menu item is gone.' }); return; }
  await prisma.hotFoodCatalogItem.update({ where: { id: it.id }, data: { pdiQuery: q } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'HOT_FOOD_ITEM_UPDATED', entity: 'hot_food_item', entityId: it.id,
    details: { name: it.name, summary: `Hot food ${it.name}: PDI search words ${q ? `"${q}"` : 'back to its name'}` } });
  res.json({ success: true, data: { id: it.id, pdiQuery: q } });
}
