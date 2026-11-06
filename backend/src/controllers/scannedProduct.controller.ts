import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ensureLabelForBarcode } from '../utils/labelSync';
import { barcodeKey, barcodeVariants, canonicalBarcode } from '../utils/barcode';
import { Role } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';

/** The name a store's PDI item list has for a barcode: one of this person's stores first, else any store's (names do not differ by store). */
async function pdiNameFor(barcode: string, user: { id: string; role: Role }): Promise<string | null> {
  if (!/^\d{6,14}$/.test(barcode.trim())) return null;
  const hits = await prisma.pdiItem.findMany({ where: { upcKey: barcodeKey(barcode) }, select: { storeId: true, name: true }, take: 20 });
  if (!hits.length) return null;
  const mine = hasMinRole(user.role, Role.SUPER_ADMIN) ? [] : (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);
  return (hits.find((h) => mine.includes(h.storeId)) ?? hits[0]).name.slice(0, 200);
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
    // comes up with a name instead of an empty form. Saved to the catalog like an Open Food Facts answer, without a category (PDI's
    // departments do not match the app's categories; the owner is deciding how they line up), so staff still pick the category.
    const pdi = await pdiNameFor(barcode, req.user!);
    if (!pdi) { res.json({ success: true, data: null }); return; }
    const saved = await prisma.scannedProduct.upsert({
      where: { barcode: canonicalBarcode(barcode) },
      create: { barcode: canonicalBarcode(barcode), name: pdi, source: 'pdi', scanCount: 1, lastScannedAt: new Date() },
      update: {},
    }).catch(() => null);
    res.json({ success: true, data: { name: saved?.name ?? pdi, category: saved?.category ?? null, brand: saved?.brand ?? null, source: 'pdi' } });
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
  const where: Record<string, unknown> = {};
  if (q)      where.name    = { contains: q, mode: 'insensitive' };
  if (source) where.source  = source;

  const products = await prisma.scannedProduct.findMany({
    where,
    orderBy: [{ scanCount: 'desc' }, { lastScannedAt: 'desc' }],
    take: 200,
  });
  res.json({ success: true, data: products });
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
