// Keeping the label catalog to one item per product, and changing it in bulk from a spreadsheet. HQ only.
//
// Same barcode: items saved before "one barcode, one item" (2026-09-21), or read with and without the leading 0 on different phones,
// can be two items with two prices. GET /labels/duplicates lists them; POST /labels/merge keeps the one HQ picks (and the price HQ
// picks), moves the other items' store copies onto it and removes the others.
//
// Import: POST /labels/import takes the rows of an edited Labels export. With apply false it only says what would change (the preview);
// with apply true it makes those changes. Rows match an item by barcode (any form), else by exact product name. Nothing is ever
// deleted by an import. A blank Deal cell ends the deal; a blank price, category, brand or barcode leaves it as it is.

import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { canonicalPrice, samePrice, PRICE_MESSAGE } from '../utils/labelPrice';
import { barcodeKey, canonicalBarcode } from '../utils/barcode';
import { resolveEffectivePrice } from '../utils/labelPricing';
import { ensureScannedProductForBarcode } from '../utils/labelSync';
import { ITEM_GONE_MESSAGE } from '../utils/labelRules';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// ─── Same barcode ─────────────────────────────────────────────────────────────

/** GET /labels/duplicates: groups of items whose barcodes are the same product, each item with its prices and stores. */
export async function getBarcodeDuplicates(_req: AuthRequest, res: Response) {
  const labels = await prisma.label.findMany({
    where: { barcode: { not: null } },
    select: {
      id: true, productName: true, barcode: true, priceText: true, dealText: true, category: true, createdAt: true, updatedAt: true,
      storeLabels: { select: { storeId: true, priceText: true, store: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
  const groups = new Map<string, typeof labels>();
  for (const l of labels) {
    if (!l.barcode || !l.barcode.trim()) continue;
    const k = barcodeKey(l.barcode);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  const data = [...groups.entries()].filter(([, items]) => items.length > 1).map(([key, items]) => {
    const prices = new Set(items.map((i) => canonicalPrice(i.priceText ?? '') ?? i.priceText ?? ''));
    return {
      key,
      differentPrices: prices.size > 1,
      items: items.map((i) => ({
        id: i.id, productName: i.productName, barcode: i.barcode, priceText: i.priceText, dealText: i.dealText, category: i.category,
        createdAt: i.createdAt, updatedAt: i.updatedAt,
        stores: i.storeLabels.length,
        ownPrices: i.storeLabels.filter((s) => s.priceText).map((s) => ({ store: s.store.name, priceText: s.priceText })),
      })),
    };
  });
  res.json({ success: true, data });
}

const mergeSchema = z.object({
  keepId: z.string().min(1, 'Choose the item to keep.').max(64),
  mergeIds: z.array(z.string().min(1).max(64)).min(1, 'Choose at least one item to merge into it.').max(20),
  priceText: z.string().optional().nullable(),   // the chain-wide price the kept item ends with (default: its own)
});

/**
 * POST /labels/merge: keeps one item, moves the others' store copies onto it (a store that already has the kept item keeps its own
 * copy), and removes the others. Each moved copy keeps its store price; one whose printed label differs from the kept item is marked
 * for reprint. Refused unless every item has the same barcode (in any form).
 */
export async function mergeLabels(req: AuthRequest, res: Response) {
  const parsed = mergeSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { keepId, priceText: askedPrice } = parsed.data;
  const mergeIds = [...new Set(parsed.data.mergeIds)].filter((id) => id !== keepId);
  if (mergeIds.length === 0) { res.status(400).json({ success: false, error: 'Choose at least one other item to merge into it.' }); return; }
  let newPrice: string | null | undefined;
  if (askedPrice != null && askedPrice !== '') {
    newPrice = canonicalPrice(askedPrice);
    if (newPrice === null) { res.status(400).json({ success: false, error: PRICE_MESSAGE }); return; }
  }

  const all = await prisma.label.findMany({
    where: { id: { in: [keepId, ...mergeIds] } },
    include: { storeLabels: true },
  });
  const keep = all.find((l) => l.id === keepId);
  const others = all.filter((l) => l.id !== keepId);
  if (!keep || others.length !== mergeIds.length) { res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE }); return; }
  if (!keep.barcode || others.some((o) => !o.barcode || barcodeKey(o.barcode) !== barcodeKey(keep.barcode!))) {
    res.status(400).json({ success: false, error: 'Only items with the same barcode can be merged.' });
    return;
  }

  const finalPrice = newPrice !== undefined ? newPrice : keep.priceText;
  const keptStores = new Set(keep.storeLabels.map((s) => s.storeId));
  let moved = 0, dropped = 0, reprint = 0;
  await prisma.$transaction(async (tx) => {
    // The kept item: its price (if HQ picked another) and its barcode in the package's form
    const priceChanged = newPrice !== undefined && !samePrice(keep.priceText, newPrice);
    await tx.label.update({ where: { id: keep.id }, data: { barcode: canonicalBarcode(keep.barcode!), ...(priceChanged ? { priceText: newPrice } : {}) } });
    if (priceChanged) reprint += (await tx.storeLabel.updateMany({ where: { labelId: keep.id, priceText: null }, data: { printedAt: null } })).count;

    for (const other of others) {
      for (const sl of other.storeLabels) {
        if (keptStores.has(sl.storeId)) { dropped += 1; continue; }   // the store already has the kept item: its copy stays
        // The shelf label that store printed was for the other item: still right only if it reads the same
        const printedSame = other.productName === keep.productName && (other.dealText ?? null) === (keep.dealText ?? null)
          && other.template === keep.template && samePrice(resolveEffectivePrice(other, sl), resolveEffectivePrice({ ...keep, priceText: finalPrice }, sl));
        await tx.storeLabel.update({ where: { id: sl.id }, data: { labelId: keep.id, ...(printedSame ? {} : { printedAt: null }) } });
        keptStores.add(sl.storeId);
        moved += 1;
        if (!printedSame && sl.printedAt) reprint += 1;
      }
      await tx.label.delete({ where: { id: other.id } });   // its remaining store copies (stores that had both) go with it
    }
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'LABELS_MERGED', entity: 'label', entityId: keep.id,
    details: {
      summary: `Merged ${others.map((o) => `"${o.productName}" ($${o.priceText ?? 'no price'})`).join(', ')} into "${keep.productName}" ($${finalPrice ?? 'no price'}), barcode ${canonicalBarcode(keep.barcode)}: `
        + `${plural(moved, 'store copy', 'store copies')} moved, ${plural(dropped, 'duplicate store copy', 'duplicate store copies')} removed, ${plural(reprint, 'store', 'stores')} to reprint`,
      removed: others.map((o) => ({ id: o.id, productName: o.productName, priceText: o.priceText, barcode: o.barcode })),
    },
    storeId: null,
  });
  res.json({ success: true, data: { keptId: keep.id, moved, dropped, reprint, priceText: finalPrice } });
}

// ─── Import ───────────────────────────────────────────────────────────────────

const rowSchema = z.object({
  line: z.number().int(),
  productName: z.string().max(500).optional().nullable(),
  brand: z.string().max(500).optional().nullable(),
  category: z.string().max(500).optional().nullable(),
  barcode: z.string().max(500).optional().nullable(),
  priceText: z.string().max(500).optional().nullable(),
  dealText: z.string().max(500).optional().nullable(),
});
const importSchema = z.object({
  rows: z.array(rowSchema).max(5000, 'At most 5,000 rows in one import.'),
  apply: z.boolean().default(false),
  dealColumn: z.boolean().default(true),   // false when the file has no Deal column (then deals are left alone)
});

type Field = 'productName' | 'brand' | 'category' | 'barcode' | 'priceText' | 'dealText';
type Change = { from: string | null; to: string | null };
type Outcome =
  | { line: number; kind: 'update'; labelId: string; productName: string; changes: Partial<Record<Field, Change>> }
  | { line: number; kind: 'new'; productName: string; values: Partial<Record<Field, string | null>> }
  | { line: number; kind: 'same'; labelId: string; productName: string }
  | { line: number; kind: 'error'; productName: string; message: string };

const blank = (v: string | null | undefined) => (v == null || v.trim() === '' ? null : v.trim());

/** POST /labels/import: { rows, apply }. The preview (apply false) and the real run use the same rules, so the preview is what happens. */
export async function importLabels(req: AuthRequest, res: Response) {
  const parsed = importSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { rows, apply, dealColumn } = parsed.data;

  const labels = await prisma.label.findMany({ select: { id: true, productName: true, brand: true, category: true, barcode: true, priceText: true, dealText: true } });
  const byKey = new Map<string, typeof labels>();
  const byName = new Map<string, typeof labels>();
  for (const l of labels) {
    if (l.barcode && l.barcode.trim()) byKey.set(barcodeKey(l.barcode), [...(byKey.get(barcodeKey(l.barcode)) ?? []), l]);
    const n = l.productName.trim().toLowerCase();
    byName.set(n, [...(byName.get(n) ?? []), l]);
  }

  const seen = new Map<string, number>();   // item id or new barcode/name -> the line that already uses it
  const outcomes: Outcome[] = rows.map((r): Outcome => {
    const name = blank(r.productName);
    const shown = name ?? '(no name)';
    const err = (message: string): Outcome => ({ line: r.line, kind: 'error', productName: shown, message });

    // Check each cell the way the forms do
    let barcode = blank(r.barcode);
    if (barcode) {
      if (/e\+|\d\.\d/i.test(barcode)) return err(`The barcode "${barcode}" was changed by the spreadsheet (it shows as a number like 4.9E+10). Format the column as text and type it again.`);
      barcode = canonicalBarcode(barcode);
      if (barcode.length > 40) return err('The barcode is too long (40 characters at most).');
    }
    let price: string | null = null;
    if (blank(r.priceText)) {
      price = canonicalPrice(blank(r.priceText)!);
      if (price === null) return err(`"${blank(r.priceText)}" is not a price. ${PRICE_MESSAGE}`);
    }
    if (name && name.length > 40) return err('The product name is too long (40 characters at most).');
    const deal = dealColumn ? blank(r.dealText) : undefined;
    if (deal && deal.length > 20) return err('The deal text is too long (20 characters at most).');
    const category = blank(r.category);
    if (category && category.length > 100) return err('The category is too long (100 characters at most).');
    const brand = blank(r.brand);
    if (brand && brand.length > 100) return err('The brand is too long (100 characters at most).');

    // Which item it is: the barcode first, then the exact name
    let match: (typeof labels)[number] | undefined;
    if (barcode) {
      const hits = byKey.get(barcodeKey(barcode)) ?? [];
      if (hits.length > 1) return err(`${hits.length} items have this barcode (${hits.map((h) => h.productName).join(', ')}). Merge them under Same barcode first.`);
      match = hits[0];
      // The barcode is one item and the name is another's: refused rather than renaming one into the other
      const named = match && name && name !== match.productName ? (byName.get(name.toLowerCase()) ?? []).find((h) => h.id !== match!.id) : undefined;
      if (match && named) return err(`The barcode is "${match.productName}" but the name is another item's ("${named.productName}"). Check the row.`);
    }
    if (!match && name) {
      const hits = (byName.get(name.toLowerCase()) ?? []).filter((h) => !barcode || !h.barcode);   // a name match with another barcode is another product
      if (hits.length > 1) return err(`${hits.length} items are called "${name}". Add the barcode to the row so it is clear which one.`);
      match = hits[0];
    }

    if (match) {
      const dupLine = seen.get(match.id);
      if (dupLine) return err(`This item is already changed on line ${dupLine}.`);
      seen.set(match.id, r.line);
      const changes: Partial<Record<Field, Change>> = {};
      if (name && name !== match.productName) changes.productName = { from: match.productName, to: name };
      if (brand && brand !== (match.brand ?? null)) changes.brand = { from: match.brand, to: brand };
      if (category && category !== (match.category ?? null)) changes.category = { from: match.category, to: category };
      if (barcode && (!match.barcode || barcodeKey(match.barcode) !== barcodeKey(barcode))) {
        const owner = (byKey.get(barcodeKey(barcode)) ?? []).find((h) => h.id !== match!.id);
        if (owner) return err(`The barcode ${barcode} already belongs to "${owner.productName}".`);
        changes.barcode = { from: match.barcode, to: barcode };
      }
      if (price && !samePrice(match.priceText, price)) changes.priceText = { from: match.priceText, to: price };
      if (deal !== undefined && (deal ?? null) !== (match.dealText ?? null)) changes.dealText = { from: match.dealText, to: deal };
      if (Object.keys(changes).length === 0) return { line: r.line, kind: 'same', labelId: match.id, productName: match.productName };
      return { line: r.line, kind: 'update', labelId: match.id, productName: match.productName, changes };
    }

    if (!name) return err('A new item needs a product name.');
    const newKey = barcode ? `b:${barcodeKey(barcode)}` : `n:${name.toLowerCase()}`;
    const dupLine = seen.get(newKey);
    if (dupLine) return err(`The same new item is already on line ${dupLine}.`);
    seen.set(newKey, r.line);
    return { line: r.line, kind: 'new', productName: name, values: { productName: name, brand, category, barcode, priceText: price, dealText: deal ?? null } };
  });

  const count = (k: Outcome['kind']) => outcomes.filter((o) => o.kind === k).length;
  const summary = { update: count('update'), new: count('new'), same: count('same'), error: count('error') };
  if (!apply) { res.json({ success: true, data: { applied: false, summary, rows: outcomes } }); return; }

  // Apply: each item is changed the way an edit on the Labels page changes it (who reprints follows what changed)
  let reprint = 0, created = 0, updated = 0;
  const syncs: { barcode: string; name: string; category: string | null }[] = [];
  for (const o of outcomes) {
    if (o.kind === 'update') {
      const data: Record<string, string | null> = {};
      for (const [f, c] of Object.entries(o.changes)) data[f] = c!.to;
      const fields = Object.keys(o.changes);
      const printedUnchanged = fields.every((f) => f === 'category' || f === 'brand');
      const priceOnly = fields.every((f) => f === 'priceText' || f === 'category' || f === 'brand');
      await prisma.$transaction(async (tx) => {
        const l = await tx.label.update({ where: { id: o.labelId }, data });
        if (printedUnchanged) { /* nothing printed changed */ }
        else if (priceOnly) reprint += (await tx.storeLabel.updateMany({ where: { labelId: o.labelId, priceText: null }, data: { printedAt: null } })).count;
        else reprint += (await tx.storeLabel.updateMany({ where: { labelId: o.labelId }, data: { printedAt: null } })).count;
        if (l.barcode && (o.changes.productName || o.changes.category || o.changes.barcode)) syncs.push({ barcode: l.barcode, name: l.productName, category: l.category });
      });
      updated += 1;
    } else if (o.kind === 'new') {
      const v = o.values;
      const l = await prisma.label.create({
        data: {
          productName: v.productName!, brand: v.brand ?? null, category: v.category ?? null, barcode: v.barcode ?? null,
          priceText: v.priceText ?? null, dealText: v.dealText ?? null, createdById: req.user!.id, createdByStoreId: null,
        },
      });
      if (l.barcode) syncs.push({ barcode: l.barcode, name: l.productName, category: l.category });
      created += 1;
    }
  }
  for (const s of syncs) {
    ensureScannedProductForBarcode(s.barcode, { name: s.name, category: s.category }).catch((e) => console.error('[labels-import] catalog sync failed', s.barcode, e?.message ?? e));
  }
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'LABELS_IMPORTED', entity: 'label', entityId: 'import',
    details: {
      summary: `Imported a Labels file: ${plural(updated, 'item', 'items')} changed, ${plural(created, 'new item', 'new items')}, ${plural(summary.error, 'row', 'rows')} skipped; ${plural(reprint, 'store copy', 'store copies')} to reprint`,
      changed: outcomes.filter((o) => o.kind === 'update').slice(0, 200).map((o) => o.kind === 'update' ? { item: o.productName, changes: o.changes } : null),
      created: outcomes.filter((o) => o.kind === 'new').slice(0, 200).map((o) => o.productName),
    },
    storeId: null,
  });
  res.json({ success: true, data: { applied: true, summary, rows: outcomes, updated, created, reprint } });
}
