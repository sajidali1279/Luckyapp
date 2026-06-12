import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// ─── GET /scanned-products/barcode/:barcode ───────────────────────────────────
// Check the local catalog before hitting Open Food Facts.
// Returns the saved name+category instantly if we've seen this barcode before.

export async function lookupBarcode(req: AuthRequest, res: Response) {
  const { barcode } = req.params;
  if (!barcode?.trim()) { res.status(400).json({ success: false, error: 'Barcode required' }); return; }

  const product = await prisma.scannedProduct.findUnique({ where: { barcode } });

  if (!product) { res.json({ success: true, data: null }); return; }

  // Increment scan count + update timestamp (fire & forget)
  prisma.scannedProduct.update({
    where: { barcode },
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

  const { barcode, name, category, brand, source } = parsed.data;

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

  res.status(201).json({ success: true, data: product });
}

// ─── GET /scanned-products ────────────────────────────────────────────────────
// DevAdmin only — browse the full catalog (for review/cleanup)

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
// DevAdmin only — remove a bad entry

export async function deleteProduct(req: AuthRequest, res: Response) {
  const { id } = req.params;
  await prisma.scannedProduct.delete({ where: { id } });
  res.json({ success: true });
}
