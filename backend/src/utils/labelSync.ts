import prisma from '../config/prisma';

// Server-side sync between the two barcode-keyed catalogs: ScannedProduct (a
// no-price name/category/brand cache written by every scan surface) and
// Label (the printable price-label catalog). Both directions are
// deliberately asymmetric — see
// docs/superpowers/specs/2026-09-12-scanned-product-label-sync-design.md.
//
// Label.barcode is intentionally non-unique (the "Duplicate Label" feature
// relies on this), so both directions look a Label up with findFirst,
// matching the lookup semantics lookupStoreLabelByBarcode already uses.

interface EnsureLabelInput {
  productName: string;
  category?: string | null;
  brand?: string | null;
  creatorStoreId: string | null;
  creatorId: string;
}

// Scan -> Label direction. Creates a priceless Label the first time this
// barcode is ever seen. Does NOT touch an existing Label's fields at all —
// existence alone is enough. A Label a human has already curated (price,
// template, category, etc.) must never be silently overwritten by a later,
// possibly-lower-quality scan of the same barcode.
export async function ensureLabelForBarcode(barcode: string, data: EnsureLabelInput): Promise<void> {
  const existing = await prisma.label.findFirst({ where: { barcode } });
  if (existing) return;

  await prisma.label.create({
    data: {
      productName: data.productName,
      priceText: null,
      category: data.category ?? null,
      brand: data.brand ?? null,
      barcode,
      createdByStoreId: data.creatorStoreId,
      createdById: data.creatorId,
    },
  });
}

interface EnsureScannedProductInput {
  name: string;
  category?: string | null;
  brand?: string | null;
}

// Label -> ScannedProduct direction. Unlike ensureLabelForBarcode, this DOES
// overwrite an existing ScannedProduct's name/category on every call — a
// Label save is a deliberate human curating the catalog, a more
// authoritative signal than a raw scan event, so it's correct for the cache
// to refresh from it. Deliberately does NOT touch scanCount/lastScannedAt —
// those track real scan events, and saving a Label (e.g. only its price)
// isn't one; bumping them here would make "last scanned" lie.
//
// brand is the one exception to the always-overwrite rule above: no Label
// create/edit form (admin or mobile) collects a brand value, so
// data.brand is always null/undefined on every real call site today.
// ScannedProduct.brand, on the other hand, can legitimately hold real data
// from other sources (e.g. an openfoodfacts lookup). If we always wrote
// brand like name/category, saving any Label for a barcode that already had
// a real brand from openfoodfacts would silently null it out. So brand only
// overwrites the existing row when the incoming value is a genuine
// non-null, non-empty string; otherwise the existing brand (if any) is left
// untouched by omitting the key from the update clause entirely. A brand-new
// row has no prior value to preserve, so create still writes null in that case.
export async function ensureScannedProductForBarcode(barcode: string, data: EnsureScannedProductInput): Promise<void> {
  const category = data.category ?? null;
  const brand = data.brand ?? null;
  const hasBrand = typeof data.brand === 'string' && data.brand.trim().length > 0;
  await prisma.scannedProduct.upsert({
    where: { barcode },
    create: {
      barcode,
      name: data.name,
      category,
      brand,
      source: 'manual',
      scanCount: 1,
      lastScannedAt: new Date(),
    },
    update: {
      name: data.name,
      category,
      source: 'manual',
      ...(hasBrand ? { brand: data.brand } : {}),
    },
  });
}
