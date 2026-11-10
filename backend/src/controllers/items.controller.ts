// The Items page (2026-11-10, step 1 of the owner's items plan): every product in the stores' PDI item lists, found by name or barcode,
// with each store's own register price and cost, and the lists of what stands out (below cost, low margin, prices that differ inside a
// state, no cost, different names). Read only: prices are changed in PDI, and shelf labels in Labels. HQ sees every store; a store manager
// sees only their own stores (prices and costs), the same rule as the PDI item lists.
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { storeIdsFor } from './pdiItems.controller';
import { getCatalog, searchCatalog, productFor, ITEM_FILTERS, type ItemFilter, type ItemQuery } from '../utils/itemCatalog';
import { barcodeVariants } from '../utils/barcode';

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
  } });
}
