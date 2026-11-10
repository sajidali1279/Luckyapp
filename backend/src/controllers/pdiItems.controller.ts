// Each store's item list as PDI knows it (2026-11-06): HQ uploads PDI's "Current inventory by item" report per store, and Invoices to PDI
// checks every invoice UPC against it (PDI refuses an item it does not know), finds an item by name for a line with no UPC, and shows
// PDI's cost next to the invoice's. The list also shows which shelf labels carry a price other than the register's. Cost is shown only
// to HQ and that store's managers (the same people who can open the store's invoices).
import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import { audit } from '../utils/audit';
import { gs1CheckDigit } from '../utils/barcode';
import { readItemReport, PdiItemListError, PdiItemRow, pdiKey } from '../utils/pdiItemList';
import { canonicalPrice, samePrice } from '../utils/labelPrice';
import { endedSaleView, describeStorePrice } from '../utils/labelSale';
import { savePlanned } from './labels.controller';
import { itemKind, notARewardKind } from '../utils/pdiDepartments';
import { dealPriceOf, dealVerdict } from '../utils/dealPrice';
import { forgetCatalog, catalogOrNull, kindAt } from '../utils/itemCatalog';
import { diffLists, looksLikeAnotherStore, type ChangeCounts } from '../utils/pdiPriceHistory';

const SEARCH_LIMIT = 25;
const CHUNK = 2000;

/** The stores a person may use: null for every store (HQ, or a manager with access to all of them). */
export async function storeIdsFor(user: { id: string; role: Role }): Promise<string[] | null> {
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) return null;
  const u = await prisma.user.findUnique({ where: { id: user.id }, select: { allStoresAccess: true } });
  if (u?.allStoresAccess) return null;
  return (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);
}

async function storeFor(req: AuthRequest, res: Response, storeId: unknown) {
  const id = typeof storeId === 'string' ? storeId : '';
  const store = id ? await prisma.store.findUnique({ where: { id }, select: { id: true, name: true } }) : null;
  if (!store) { res.status(400).json({ success: false, error: 'Pick the store.' }); return null; }
  const ids = await storeIdsFor(req.user!);
  if (ids && !ids.includes(store.id)) { res.status(403).json({ success: false, error: 'That store is not one you manage.' }); return null; }
  return store;
}

/** The full 12-digit UPC of an 11-digit PDI code (check digit added), for a person to see and for an invoice line to take. */
export const fullCode = (code: string) => (code.length === 11 ? code + gs1CheckDigit(code) : code);

/** Replaces a store's whole list with the items read from its report, and records the upload. */
/** The store's new list in place of the old one, with what changed between them (2026-11-11: price history). Refused, unless `anyway`,
 *  when the new file shares under half its items with the last list (probably another store's file); `counts` is null on a first list. */
export async function replaceItemList(storeId: string, items: PdiItemRow[], meta: { fileName: string | null; skipped: number; userId: string; anyway?: boolean }) {
  return prisma.$transaction(async (tx) => {
    const old = await tx.pdiItem.findMany({ where: { storeId }, select: { code: true, upcKey: true, name: true, priceCents: true, costCents: true } });
    const diff = diffLists(old, items);
    if (!meta.anyway && looksLikeAnotherStore(old.length, items.length, diff.shared, diff.unchanged)) {
      return { mismatch: { oldItems: old.length, newItems: items.length, shared: diff.shared, unchanged: diff.unchanged }, imp: null, counts: null };
    }
    await tx.pdiItem.deleteMany({ where: { storeId } });
    for (let i = 0; i < items.length; i += CHUNK) {
      await tx.pdiItem.createMany({ data: items.slice(i, i + CHUNK).map((it) => ({ storeId, ...it })) });
    }
    const counts: ChangeCounts | null = old.length ? diff.counts : null;
    const imp = await tx.pdiItemImport.create({ data: {
      storeId, fileName: meta.fileName, items: items.length, skipped: meta.skipped, importedById: meta.userId, ...(counts ?? {}),
    } });
    if (counts) {
      for (let i = 0; i < diff.rows.length; i += CHUNK) {
        await tx.pdiPriceChange.createMany({ data: diff.rows.slice(i, i + CHUNK).map((r) => ({ storeId, importId: imp.id, ...r, name: r.name.slice(0, 200) })) });
      }
    }
    return { mismatch: null, imp, counts };
  }, { timeout: 120_000, maxWait: 20_000 });
}

/** GET /pdi-items/lists: each store this person may use, with its list's size and last upload. */
export async function listPdiItemLists(req: AuthRequest, res: Response) {
  const ids = await storeIdsFor(req.user!);
  const stores = await prisma.store.findMany({ where: { isActive: true, ...(ids ? { id: { in: ids } } : {}) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const [counts, imports] = await Promise.all([
    prisma.pdiItem.groupBy({ by: ['storeId'], where: { storeId: { in: stores.map((s) => s.id) } }, _count: { _all: true } }),
    prisma.pdiItemImport.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, orderBy: { createdAt: 'desc' }, distinct: ['storeId'] }),
  ]);
  const people = await prisma.user.findMany({ where: { id: { in: imports.map((i) => i.importedById).filter((x): x is string => !!x) } }, select: { id: true, name: true } });
  res.json({ success: true, data: {
    canUpload: hasMinRole(req.user!.role, Role.SUPER_ADMIN),
    stores: stores.map((s) => {
      const imp = imports.find((i) => i.storeId === s.id);
      return {
        storeId: s.id, name: s.name, items: counts.find((c) => c.storeId === s.id)?._count._all ?? 0,
        importedAt: imp?.createdAt ?? null, importedBy: imp ? people.find((p) => p.id === imp.importedById)?.name ?? null : null, fileName: imp?.fileName ?? null,
      };
    }),
  } });
}

/** POST /pdi-items/import (HQ; multipart "file" + storeId): reads the store's PDI item report and replaces its list. */
export async function importPdiItems(req: AuthRequest, res: Response) {
  const store = await storeFor(req, res, (req.body as { storeId?: string }).storeId);
  if (!store) return;
  const file = req.file as Express.Multer.File | undefined;
  if (!file?.buffer?.length) { res.status(400).json({ success: false, error: 'Choose the report file PDI saved for this store.' }); return; }
  let read: ReturnType<typeof readItemReport>;
  try { read = readItemReport(file.buffer); }
  catch (e) { if (e instanceof PdiItemListError) { res.status(400).json({ success: false, error: e.message }); return; } throw e; }
  const fileName = (file.originalname || '').slice(0, 200) || null;
  const anyway = (req.body as { anyway?: string }).anyway === 'true';
  const done = await replaceItemList(store.id, read.items, { fileName, skipped: read.skipped, userId: req.user!.id, anyway });
  if (done.mismatch) {
    const m = done.mismatch;
    const why = m.shared * 2 < Math.min(m.oldItems, m.newItems)
      ? `only ${m.shared.toLocaleString()} of its ${m.newItems.toLocaleString()} items are on ${store.name}'s last list`
      : `only ${m.unchanged.toLocaleString()} of the ${m.shared.toLocaleString()} items it shares with ${store.name}'s last list have the same price and cost`;
    res.status(409).json({ success: false, code: 'LIST_MISMATCH', data: m, error:
      `This file does not look like ${store.name}'s list: ${why}. It may be another store's report. Nothing was changed.` });
    return;
  }
  forgetCatalog();   // the Items page builds its products again
  // the new items with no shelf label yet (on this store's label list), for "make their labels" on the Items page
  let newWithoutLabel: number | null = null;
  if (done.counts?.newItems) {
    const fresh = await prisma.pdiPriceChange.findMany({ where: { importId: done.imp!.id, kind: 'NEW' }, select: { upcKey: true }, take: 20_000 });
    const keys = new Set(fresh.map((f) => f.upcKey));
    const labelled = await prisma.label.findMany({ where: { barcode: { not: null }, storeLabels: { some: { storeId: store.id } } }, select: { barcode: true } });
    const has = new Set(labelled.map((l) => pdiKey(l.barcode!)));
    newWithoutLabel = [...keys].filter((k) => !has.has(k)).length;
  }
  const departments = [...read.items.reduce((m, i) => m.set(i.department ?? 'None', (m.get(i.department ?? 'None') ?? 0) + 1), new Map<string, number>())]
    .sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, items]) => ({ name, items }));
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'PDI_ITEMS_IMPORTED', entity: 'Store', entityId: store.id,
    details: { fileName, items: read.items.length, skipped: read.skipped, duplicates: read.duplicates, ...(done.counts ? { changes: done.counts } : {}), ...(anyway ? { notLikeLastList: true } : {}) },
    storeId: store.id, storeName: store.name,
  });
  res.json({ success: true, data: {
    store, items: read.items.length, skipped: read.skipped, duplicates: read.duplicates, departments, changes: done.counts, newWithoutLabel,
    withCost: read.items.filter((i) => i.costCents).length, withPrice: read.items.filter((i) => i.priceCents).length,
  } });
}

/** GET /pdi-items/search?storeId&q: the store's PDI items whose name has every word typed (or whose code has the digits typed). */
export async function searchPdiItems(req: AuthRequest, res: Response) {
  const store = await storeFor(req, res, req.query.storeId);
  if (!store) return;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) { res.json({ success: true, data: { items: [] } }); return; }
  const digits = q.replace(/\D/g, '');
  const rows = await prisma.pdiItem.findMany({
    where: { storeId: store.id, OR: [
      { AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) },
      ...(digits.length >= 4 && digits.length === q.replace(/\s/g, '').length ? [{ code: { contains: digits } }] : []),
    ] },
    orderBy: { name: 'asc' }, take: SEARCH_LIMIT,
  });
  res.json({ success: true, data: { items: rows.map((r) => ({
    code: r.code, upc: fullCode(r.code), name: r.name, department: r.department, costCents: r.costCents, priceCents: r.priceCents,
  })) } });
}

/** GET /pdi-items/price?storeId&barcode: what the store's register charges for a barcode, from its PDI item list (2026-11-08), for a new
 *  shelf label's price. The price only (never the cost); null when PDI does not have it at that store. */
export async function registerPrice(req: AuthRequest, res: Response) {
  const store = await storeFor(req, res, req.query.storeId);
  if (!store) return;
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode.trim() : '';
  if (!/^\d{6,14}$/.test(barcode)) { res.json({ success: true, data: { priceText: null } }); return; }
  const item = await prisma.pdiItem.findFirst({ where: { storeId: store.id, upcKey: pdiKey(barcode) }, select: { priceCents: true, name: true } });
  res.json({ success: true, data: { priceText: item?.priceCents ? (item.priceCents / 100).toFixed(2) : null } });
}

/** GET /pdi-items/barcode?barcode (2026-11-08): what the PDI item lists say about a barcode, for a new label in admin Labels (a chain-wide
 *  item): its name and the register price most of the person's stores charge (HQ: every store with a list), with how many charge it. */
export async function barcodeInfo(req: AuthRequest, res: Response) {
  const barcode = typeof req.query.barcode === 'string' ? req.query.barcode.trim() : '';
  const none = { found: false, name: null, priceText: null, priceStores: 0, stores: 0, storeName: null };
  if (!/^\d{6,14}$/.test(barcode)) { res.json({ success: true, data: none }); return; }
  const ids = await storeIdsFor(req.user!);
  const rows = await prisma.pdiItem.findMany({
    where: { upcKey: pdiKey(barcode), ...(ids ? { storeId: { in: ids } } : {}) },
    select: { storeId: true, name: true, priceCents: true }, take: 100,
  });
  if (!rows.length) { res.json({ success: true, data: none }); return; }
  const counts = new Map<number, string[]>();
  for (const r of rows) if (r.priceCents && r.priceCents < 100_000) counts.set(r.priceCents, [...(counts.get(r.priceCents) ?? []), r.storeId]);
  // the price most stores charge; a tie goes to the lower price
  const best = [...counts.entries()].sort((a, b) => b[1].length - a[1].length || a[0] - b[0])[0];
  const at = best ? rows.find((r) => r.priceCents === best[0])! : rows[0];
  const storeName = best && best[1].length === 1 ? (await prisma.store.findUnique({ where: { id: best[1][0] }, select: { name: true } }))?.name ?? null : null;
  res.json({ success: true, data: {
    found: true, name: at.name.trim(), priceText: best ? (best[0] / 100).toFixed(2) : null,
    priceStores: best?.[1].length ?? 0, stores: rows.length, storeName,
  } });
}

/** GET /pdi-items/deal-check?q&dealText (2026-11-10): a deal's price against each store's register, for the deal form. q is a product name
 *  (every word) or a barcode; up to 6 products, each with every one of the person's stores that has it in PDI: the register price, the
 *  cost (managers see only their own stores, as everywhere on these pages) and what the deal is there (a saving, no saving, below cost).
 *  The deal's words give the price per item ("2 for $5" is $2.50 each); words with no price ("$1 off") come back with deal null. */
export async function dealCheck(req: AuthRequest, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const deal = dealPriceOf(typeof req.query.dealText === 'string' ? req.query.dealText.slice(0, 60) : '');
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (q.length < 2 || !words.length) { res.json({ success: true, data: { deal, products: [], listStores: 0 } }); return; }
  const ids = await storeIdsFor(req.user!);
  const scope = ids ? { storeId: { in: ids } } : {};
  const digits = q.replace(/\D/g, '');
  const byBarcode = /^\d{6,14}$/.test(q.replace(/\s/g, ''));
  const rows = await prisma.pdiItem.findMany({
    where: { ...scope, ...(byBarcode ? { upcKey: pdiKey(digits) } : { AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })) }) },
    select: { storeId: true, code: true, name: true, department: true, priceCents: true, costCents: true }, take: 600,
  });
  const [stores, lists] = await Promise.all([
    prisma.store.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.storeId))] } }, select: { id: true, name: true, state: true } }),
    prisma.pdiItem.groupBy({ by: ['storeId'], where: scope, _count: { _all: true } }),
  ]);
  const byCode = new Map<string, typeof rows>();
  for (const r of rows) byCode.set(r.code, [...(byCode.get(r.code) ?? []), r]);
  const products = [...byCode.entries()].sort((a, b) => b[1].length - a[1].length || a[1][0].name.localeCompare(b[1][0].name)).slice(0, 6).map(([code, list]) => ({
    code, upc: fullCode(code), name: list[0].name.trim(), department: list[0].department,
    stores: list.map((r) => {
      const s = stores.find((x) => x.id === r.storeId);
      return {
        storeId: r.storeId, storeName: s?.name ?? 'Store', state: s?.state ?? null, priceCents: r.priceCents, costCents: r.costCents,
        verdict: deal ? dealVerdict(deal.unitCents, r) : null,
      };
    }).sort((a, b) => a.storeName.localeCompare(b.storeName, undefined, { numeric: true })),
  }));
  res.json({ success: true, data: { deal, products, listStores: lists.length } });
}

// Never a reward: tobacco, alcohol, lottery, CBD, propane and PDI's test department (2026-11-08; both department naming styles 2026-11-10,
// utils/pdiDepartments.ts)

/** GET /pdi-items/reward-search?q&storeId (2026-11-08): PDI items for a reward with no shelf label, by name (every word), at the reward's
 *  store or (none given) the person's stores, each with the register price most of those stores charge. No tobacco, beer or propane. */
export async function rewardSearch(req: AuthRequest, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  const words = q.split(/\s+/).filter(Boolean).slice(0, 6);
  if (q.length < 2 || !words.length) { res.json({ success: true, data: { items: [] } }); return; }
  let ids = await storeIdsFor(req.user!);
  const one = typeof req.query.storeId === 'string' && req.query.storeId ? req.query.storeId : null;
  if (one) {
    if (ids && !ids.includes(one)) { res.status(403).json({ success: false, error: 'That store is not one you manage.' }); return; }
    ids = [one];
  }
  const rows = await prisma.pdiItem.findMany({
    where: { ...(ids ? { storeId: { in: ids } } : {}), AND: words.map((w) => ({ name: { contains: w, mode: 'insensitive' as const } })), priceCents: { gt: 0, lt: 100_000 } },
    select: { code: true, upcKey: true, storeId: true, name: true, department: true, priceCents: true }, orderBy: { name: 'asc' }, take: 400,
  });
  // what each one is (2026-11-10): a lottery ticket by its name, and what most stores call a product this store files under groceries;
  // a product that is not a reward at ANY store it is listed at is left out everywhere
  const cat = await catalogOrNull();
  const kindOfRow = (r: (typeof rows)[number]) => { const k = cat ? kindAt(cat, r.upcKey, r.storeId) : undefined; return k !== undefined ? k : itemKind(r.department, r.name, r.priceCents); };
  const banned = new Set(rows.filter((r) => notARewardKind(kindOfRow(r))).map((r) => r.code));
  const byCode = new Map<string, { name: string; prices: Map<number, number> }>();
  for (const r of rows) {
    if (banned.has(r.code)) continue;
    const e = byCode.get(r.code) ?? { name: r.name.trim(), prices: new Map<number, number>() };
    e.prices.set(r.priceCents!, (e.prices.get(r.priceCents!) ?? 0) + 1);
    byCode.set(r.code, e);
  }
  const items = [...byCode.entries()].slice(0, 8).map(([code, e]) => {
    const [cents, count] = [...e.prices.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
    const stores = [...e.prices.values()].reduce((n, x) => n + x, 0);
    return { code, name: e.name, priceText: (cents / 100).toFixed(2), priceStores: count, stores };
  });
  res.json({ success: true, data: { items } });
}

const priceOf = (text: string | null | undefined) => {
  const m = /^\s*\$?\s*(\d{1,5}(?:\.\d{1,2})?)\s*$/.exec(text ?? '');
  return m ? Math.round(Number(m[1]) * 100) : null;
};

/** GET /pdi-items/label-prices?storeId: shelf labels whose price at this store (its own price, else the chain's) is not the register's. */
export async function labelPriceCheck(req: AuthRequest, res: Response) {
  const store = await storeFor(req, res, req.query.storeId);
  if (!store) return;
  const has = await prisma.pdiItem.count({ where: { storeId: store.id } });
  if (!has) { res.json({ success: true, data: { hasList: false, compared: 0, same: 0, notInPdi: 0, different: [] } }); return; }
  const labels = await prisma.label.findMany({
    where: { barcode: { not: null } },
    select: { id: true, productName: true, barcode: true, priceText: true, storeLabels: { where: { storeId: store.id }, select: { priceText: true, overrideExpiresAt: true, printedAt: true } } },
  });
  const now = new Date();
  const keys = [...new Set(labels.map((l) => pdiKey(l.barcode!)))];
  const items = await prisma.pdiItem.findMany({ where: { storeId: store.id, upcKey: { in: keys } }, select: { upcKey: true, name: true, priceCents: true } });
  const byKey = new Map(items.map((i) => [i.upcKey, i]));
  let compared = 0, same = 0, notInPdi = 0;
  const different: {
    labelId: string; name: string; barcode: string; labelCents: number; registerCents: number; pdiName: string; storePrice: boolean;
    inStore: boolean; saleEnds: string | null;   // on the store's own list; a sale price running until then (2026-11-08)
  }[] = [];
  for (const l of labels) {
    const row = endedSaleView(l.storeLabels[0] ?? null, now);   // an ended sale is back on the base price
    const own = row?.priceText;
    const labelCents = priceOf(own ?? l.priceText);
    if (labelCents === null) continue;
    const item = byKey.get(pdiKey(l.barcode!));
    if (!item) { notInPdi++; continue; }
    if (!item.priceCents) continue;
    compared++;
    if (item.priceCents === labelCents) same++;
    else different.push({
      labelId: l.id, name: l.productName, barcode: l.barcode!, labelCents, registerCents: item.priceCents, pdiName: item.name, storePrice: !!own,
      inStore: !!row, saleEnds: row?.overrideExpiresAt ? row.overrideExpiresAt.toISOString() : null,
    });
  }
  different.sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, data: { hasList: true, compared, same, notInPdi, different } });
}

const APPLY_MAX = 3000;

/** POST /pdi-items/label-prices/apply {storeId, labelIds, addMissing} (2026-11-08): puts each label's price at this store on the register's
 *  price from the store's PDI list. Only that store changes: its own price is set (or cleared, when the chain price already is the register's),
 *  and a label whose shelf price really changes goes back on the store's print list, as any store price change does. The price is read again
 *  here, never taken from the page. Left alone: a label on a sale with an end date, one PDI has no usable price for, and one that is not on
 *  the store's list unless addMissing (then it is added at the register price and shows as new to print). Every change is in the Activity log. */
export async function applyRegisterPrices(req: AuthRequest, res: Response) {
  const body = (req.body ?? {}) as { storeId?: unknown; labelIds?: unknown; addMissing?: unknown };
  const store = await storeFor(req, res, body.storeId);
  if (!store) return;
  const ids = Array.isArray(body.labelIds) ? [...new Set(body.labelIds.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))] : [];
  if (!ids.length) { res.status(400).json({ success: false, error: 'Pick the labels to update.' }); return; }
  if (ids.length > APPLY_MAX) { res.status(400).json({ success: false, error: `At most ${APPLY_MAX} labels at once.` }); return; }
  const addMissing = body.addMissing === true;

  const labels = await prisma.label.findMany({
    where: { id: { in: ids }, barcode: { not: null } },
    select: { id: true, productName: true, barcode: true, priceText: true, storeLabels: { where: { storeId: store.id }, select: { id: true, priceText: true, overrideExpiresAt: true, printedAt: true } } },
  });
  const items = await prisma.pdiItem.findMany({ where: { storeId: store.id, upcKey: { in: [...new Set(labels.map((l) => pdiKey(l.barcode!)))] } }, select: { upcKey: true, priceCents: true } });
  const byKey = new Map(items.map((i) => [i.upcKey, i]));
  const now = new Date();
  const out = { updated: 0, added: 0, same: 0, notOnList: 0, onSale: 0, noPrice: 0, conflicts: 0, gone: ids.length - labels.length };
  const actor = { actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role };

  for (const l of labels) {
    const cents = byKey.get(pdiKey(l.barcode!))?.priceCents;
    const register = cents ? canonicalPrice((cents / 100).toFixed(2)) : null;
    if (!register) { out.noPrice++; continue; }
    const next = samePrice(l.priceText, register) ? null : register;   // the chain price already is the register's: no store price needed
    const raw = l.storeLabels[0] ?? null;
    const row = endedSaleView(raw, now);
    if (!raw) {
      if (!addMissing) { out.notOnList++; continue; }
      try { await prisma.storeLabel.create({ data: { labelId: l.id, storeId: store.id, priceText: next, overrideExpiresAt: null } }); }
      catch (e: any) { if (e?.code !== 'P2002') throw e; out.conflicts++; continue; }
      out.added++;
      audit({
        ...actor, action: 'STORE_LABEL_PRICE', entity: 'label', entityId: l.id, storeId: store.id, storeName: store.name,
        details: { summary: `Added "${l.productName}" to ${store.name} at the register price $${register} from PDI (the label said $${l.priceText ?? 'nothing'}).`,
          productName: l.productName, priceBefore: null, priceAfter: register, endsAt: null, source: 'PDI_REGISTER_PRICE' },
      });
      continue;
    }
    if (row?.overrideExpiresAt) { out.onSale++; continue; }
    const outcome = await savePlanned(raw, l, next, null, now);
    if (outcome.kind === 'conflict') { out.conflicts++; continue; }
    if (outcome.kind === 'same') { out.same++; continue; }
    out.updated++;
    audit({
      ...actor, action: 'STORE_LABEL_PRICE', entity: 'label', entityId: l.id, storeId: store.id, storeName: store.name,
      details: { summary: `${describeStorePrice(l.productName, store.name, outcome.plan)} Set to the register price from PDI.`, productName: l.productName,
        priceBefore: outcome.plan.before.price, priceAfter: outcome.plan.after.price, endsAt: null, source: 'PDI_REGISTER_PRICE' },
    });
  }
  if (out.updated + out.added > 0) {
    audit({
      ...actor, action: 'LABEL_PRICES_FROM_PDI', entity: 'Store', entityId: store.id, storeId: store.id, storeName: store.name,
      details: { summary: `Put ${out.updated + out.added} label prices at ${store.name} on the register price from PDI (${out.updated} changed, ${out.added} added).`, ...out },
    });
  }
  res.json({ success: true, data: out });
}
