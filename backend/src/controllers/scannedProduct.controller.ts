import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ensureLabelForBarcode } from '../utils/labelSync';
import { barcodeVariants, canonicalBarcode } from '../utils/barcode';
import { pdiKey } from '../utils/pdiItemList';
import { Role } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import { appCategoryFor } from '../utils/pdiDepartments';
import { catalogOrNull, kindAt } from '../utils/itemCatalog';
import { addPdiToScanned } from '../utils/scannedFromPdi';
import { audit } from '../utils/audit';

// The app category a PDI department becomes (decided 2026-11-07, for the owner; Texas department names added 2026-11-10): only the
// departments that are one kind of product (utils/pdiDepartments.ts appCategoryFor). GROC, GROCERY and the others mix soda, candy, chips,
// medicine and more, so staff still pick those.

/** The name (and, for a clear department, the category) a store's PDI item list has for a barcode: one of this person's stores first,
 *  else any store's (names do not differ by store). */
async function pdiItemFor(barcode: string, user: { id: string; role: Role }): Promise<{ name: string; category: string | null } | null> {
  if (!/^\d{6,14}$/.test(barcode.trim())) return null;
  const key = pdiKey(barcode);   // a small pack's short UPC-E too (2026-11-10)
  const hits = await prisma.pdiItem.findMany({ where: { upcKey: key }, select: { storeId: true, name: true, department: true }, take: 20 });
  if (!hits.length) return null;
  const mine = hasMinRole(user.role, Role.SUPER_ADMIN) ? [] : (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);
  const hit = hits.find((h) => mine.includes(h.storeId)) ?? hits[0];
  // the kind across the stores (2026-11-10): store 9 files the 4K cigars under GROCERY, most stores under CIGARS
  const cat = await catalogOrNull();
  const kind = cat ? kindAt(cat, key, hit.storeId) : undefined;
  if (kind === 'LOTTERY') return { name: hit.name.slice(0, 200), category: null };
  return { name: hit.name.slice(0, 200), category: appCategoryFor(hit.department) ?? (kind === 'TOBACCO' ? 'Tobacco' : null) };
}

// ─── GET /scanned-products/barcode/:barcode ───────────────────────────────────
// Check the local catalog before hitting Open Food Facts.
// Returns the saved name+category instantly if we've seen this barcode before.

export async function lookupBarcode(req: AuthRequest, res: Response) {
  const { barcode } = req.params;
  if (!barcode?.trim()) { res.status(400).json({ success: false, error: 'Barcode required' }); return; }

  // The same product whether the camera read it with or without the leading 0
  const product = await prisma.scannedProduct.findFirst({ where: { barcode: { in: barcodeVariants(barcode) } }, orderBy: { lastScannedAt: 'desc' } });

  if (!product) {
    // Not in the catalog yet: the name PDI has for it at one of this person's stores (2026-11-06), so a scan in Labels or the store catalog
    // comes up with a name instead of an empty form. Saved to the catalog like an Open Food Facts answer, with a category only for a PDI
    // department that is one kind of product (appCategoryFor); for the rest staff still pick the category.
    const pdi = await pdiItemFor(barcode, req.user!);
    if (!pdi) { res.json({ success: true, data: null }); return; }
    const saved = await prisma.scannedProduct.upsert({
      where: { barcode: canonicalBarcode(barcode) },
      create: { barcode: canonicalBarcode(barcode), name: pdi.name, category: pdi.category, source: 'pdi', scanCount: 1, lastScannedAt: new Date() },
      update: {},
    }).catch(() => null);
    res.json({ success: true, data: { name: saved?.name ?? pdi.name, category: saved?.category ?? pdi.category, brand: saved?.brand ?? null, source: 'pdi' } });
    return;
  }

  // Increment scan count + update timestamp (fire & forget)
  prisma.scannedProduct.update({
    where: { barcode: product.barcode },
    data: { scanCount: { increment: 1 }, lastScannedAt: new Date() },
  }).catch(() => {});

  res.json({ success: true, data: { name: product.name, category: product.category, brand: product.brand, source: product.source } });
}

// ─── POST /scanned-products ───────────────────────────────────────────────────
// Upsert a barcode→name mapping.  Called when:
//   a) User manually names an unknown product ("manual")
//   b) Open Food Facts returns a hit and we cache it ("openfoodfacts")

const saveSchema = z.object({
  barcode:  z.string().min(1).max(50),
  name:     z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  brand:    z.string().max(100).optional(),
  source:   z.enum(['manual', 'openfoodfacts']).default('manual'),
});

export async function saveProduct(req: AuthRequest, res: Response) {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const { name, category, brand, source } = parsed.data;
  // Saved on the row that already has this product in any form, or as a new row in the package's form (UPC, not EAN-13 with a 0)
  const known = await prisma.scannedProduct.findFirst({ where: { barcode: { in: barcodeVariants(parsed.data.barcode) } }, select: { barcode: true } });
  const barcode = known?.barcode ?? canonicalBarcode(parsed.data.barcode);

  const product = await prisma.scannedProduct.upsert({
    where: { barcode },
    create: { barcode, name, category, brand, source, scanCount: 1, lastScannedAt: new Date() },
    update: {
      name, category, brand,
      // Only upgrade source to manual (manual overrides openfoodfacts)
      ...(source === 'manual' ? { source } : {}),
      scanCount: { increment: 1 },
      lastScannedAt: new Date(),
    },
  });

  // Every scan that reaches this endpoint should also exist as a (possibly
  // priceless) Label, this is what lets Order List/Stock Request/mobile
  // Catalog/Price Check feed the printable catalog without each caller
  // doing anything extra. A sync hiccup here must not break the primary
  // scan-save response, so it's logged, not thrown.
  try {
    await ensureLabelForBarcode(barcode, {
      productName: name,
      category: category ?? null,
      brand: brand ?? null,
      creatorStoreId: req.user!.storeIds?.[0] ?? null,
      creatorId: req.user!.id,
    });
  } catch (err) {
    console.error('ensureLabelForBarcode failed for scanned product', barcode, err);
  }

  res.status(201).json({ success: true, data: product });
}

// ─── GET /scanned-products ────────────────────────────────────────────────────
// STORE_MANAGER minimum (so StoreManager, SuperAdmin, DevAdmin), browse the full catalog (for review/cleanup)

export async function listProducts(req: AuthRequest, res: Response) {
  const { q, source } = req.query as { q?: string; source?: string };
  // The admin page asks for pages (2026-11-11: about 18,000 products since the PDI lists went in); the apps keep the plain list
  if (req.query.page !== undefined) { await listProductsPaged(req, res); return; }
  const where: Record<string, unknown> = {};
  // a name, or (2026-11-11) a barcode or part of one: digits only
  const digits = (q ?? '').replace(/\s/g, '');
  if (q && /^\d{4,14}$/.test(digits)) where.OR = [{ barcode: { contains: digits } }, { barcode: { in: barcodeVariants(digits) } }, { name: { contains: q, mode: 'insensitive' } }];
  else if (q) where.name = { contains: q, mode: 'insensitive' };
  if (source) where.source  = source;

  const products = await prisma.scannedProduct.findMany({
    where,
    orderBy: [{ scanCount: 'desc' }, { lastScannedAt: 'desc' }],
    take: 200,
  });
  res.json({ success: true, data: products });
}

// ─── The admin's paged list and bulk changes (2026-11-11) ───────────────────────

export const SCANNED_PAGE_SIZE = 50;
const SOURCES = ['manual', 'openfoodfacts', 'pdi'];
export const NO_CATEGORY = '__none__';
export const BULK_MAX = 5000;

/** The filters of the admin's list as a database where. */
function scannedWhere(query: Record<string, unknown>) {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');
  const q = str(query.q), source = str(query.source), category = str(query.category), scanned = str(query.scanned);
  const where: Record<string, unknown>[] = [];
  const digits = q.replace(/\s/g, '');
  if (q && /^\d{4,14}$/.test(digits)) where.push({ OR: [{ barcode: { contains: digits } }, { barcode: { in: barcodeVariants(digits) } }, { name: { contains: q, mode: 'insensitive' } }] });
  else if (q) where.push({ AND: q.split(/\s+/).slice(0, 6).map((w) => ({ name: { contains: w, mode: 'insensitive' } })) });
  if (SOURCES.includes(source)) where.push({ source });
  if (category === NO_CATEGORY) where.push({ OR: [{ category: null }, { category: '' }] });
  else if (category) where.push({ category });
  if (scanned === 'never') where.push({ scanCount: 0 });
  else if (scanned === 'yes') where.push({ scanCount: { gt: 0 } });
  return where.length ? { AND: where } : {};
}

/** GET /scanned-products?page&q&source&category&scanned&sort (admin): one page, the total, and the counts for the filters. With idsOnly=1,
 *  the ids of every product that matches (up to BULK_MAX), for "select all that match". */
async function listProductsPaged(req: AuthRequest, res: Response) {
  const where = scannedWhere(req.query as Record<string, unknown>);
  if (req.query.idsOnly === '1') {
    const rows = await prisma.scannedProduct.findMany({ where, select: { id: true }, take: BULK_MAX });
    res.json({ success: true, data: { ids: rows.map((r) => r.id), capped: rows.length === BULK_MAX } });
    return;
  }
  const sort = req.query.sort === 'name' ? [{ name: 'asc' as const }] : req.query.sort === 'newest' ? [{ createdAt: 'desc' as const }] : [{ scanCount: 'desc' as const }, { lastScannedAt: 'desc' as const }];
  const [total, sources, categories] = await Promise.all([
    prisma.scannedProduct.count({ where }),
    prisma.scannedProduct.groupBy({ by: ['source'], _count: { _all: true } }),
    prisma.scannedProduct.groupBy({ by: ['category'], _count: { _all: true }, orderBy: { _count: { category: 'desc' } }, take: 300 }),
  ]);
  const pages = Math.max(1, Math.ceil(total / SCANNED_PAGE_SIZE));
  const page = Math.min(Math.max(1, Math.floor(Number(req.query.page) || 1)), pages);
  const items = await prisma.scannedProduct.findMany({ where, orderBy: sort, skip: (page - 1) * SCANNED_PAGE_SIZE, take: SCANNED_PAGE_SIZE });
  const none = categories.filter((c) => !c.category).reduce((n, c) => n + c._count._all, 0);
  res.json({ success: true, data: {
    items, total, page, pages,
    sources: Object.fromEntries(sources.map((s) => [s.source, s._count._all])),
    categories: [...categories.filter((c) => c.category).map((c) => ({ name: c.category!, items: c._count._all })).sort((a, b) => a.name.localeCompare(b.name)),
      ...(none ? [{ name: NO_CATEGORY, items: none }] : [])],
  } });
}

const bulkIds = (v: unknown): string[] | null => {
  if (!Array.isArray(v)) return null;
  const ids = [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0 && x.length <= 64))];
  return ids.length && ids.length <= BULK_MAX ? ids : null;
};

/** POST /scanned-products/bulk-category {ids, category} (manager+): one category (or none) for many products. */
export async function bulkSetCategory(req: AuthRequest, res: Response) {
  const ids = bulkIds(req.body?.ids);
  if (!ids) { res.status(400).json({ success: false, error: `Pick between 1 and ${BULK_MAX.toLocaleString()} products.` }); return; }
  const raw = req.body?.category;
  const category = raw === null || raw === '' ? null : typeof raw === 'string' ? raw.trim().slice(0, 100) || null : undefined;
  if (category === undefined) { res.status(400).json({ success: false, error: 'Type the category, or leave it empty for none.' }); return; }
  const { count } = await prisma.scannedProduct.updateMany({ where: { id: { in: ids } }, data: { category } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SCANNED_PRODUCTS_BULK', entity: 'ScannedProduct', entityId: 'bulk',
    details: { summary: `Set the category of ${count.toLocaleString()} scanned products to ${category ? `"${category}"` : 'none'}.`, count, category } });
  res.json({ success: true, data: { updated: count } });
}

/** POST /scanned-products/bulk-delete {ids} (manager+): removes many products (a scan of one asks for its name again). */
export async function bulkDeleteProducts(req: AuthRequest, res: Response) {
  const ids = bulkIds(req.body?.ids);
  if (!ids) { res.status(400).json({ success: false, error: `Pick between 1 and ${BULK_MAX.toLocaleString()} products.` }); return; }
  const { count } = await prisma.scannedProduct.deleteMany({ where: { id: { in: ids } } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SCANNED_PRODUCTS_BULK', entity: 'ScannedProduct', entityId: 'bulk',
    details: { summary: `Removed ${count.toLocaleString()} products from Scanned products.`, count } });
  res.json({ success: true, data: { removed: count } });
}

// ─── POST /scanned-products/from-pdi ───────────────────────────────────────────
// HQ (2026-11-11): every product in the stores' PDI item lists that is not in Scanned products yet, added with PDI's name. Products already
// there are left as they are. Also run after every PDI list upload (controllers/pdiItems.controller.ts).

export async function fillFromPdi(req: AuthRequest, res: Response) {
  const out = await addPdiToScanned();
  if (out.added) {
    audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SCANNED_PRODUCTS_FROM_PDI', entity: 'ScannedProduct', entityId: 'pdi',
      details: { summary: `Added ${out.added.toLocaleString()} products from the PDI item lists to Scanned products (${out.already.toLocaleString()} were already there).`, ...out } });
  }
  res.json({ success: true, data: out });
}

// ─── DELETE /scanned-products/:id ────────────────────────────────────────────
// STORE_MANAGER minimum (so StoreManager, SuperAdmin, DevAdmin), remove a bad entry

export async function deleteProduct(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.scannedProduct.delete({ where: { id } });
  res.json({ success: true });
}

// ─── PATCH /scanned-products/:id ───────────────────────────────────────────────
// Edits name/category/brand. barcode is NOT editable here, it's the upsert
// key everywhere else in this system; correcting a wrong barcode is still
// delete + recreate, unchanged from today. STORE_MANAGER minimum, same gate
// as listProducts/deleteProduct on this controller.

const updateSchema = z.object({
  name:     z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional().nullable(),
  brand:    z.string().max(100).optional().nullable(),
});

export async function updateProduct(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const existing = await prisma.scannedProduct.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Product not found' }); return; }

  const { name, category, brand } = parsed.data;
  const product = await prisma.scannedProduct.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(brand !== undefined ? { brand } : {}),
    },
  });

  res.json({ success: true, data: product });
}
