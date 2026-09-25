import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate, Prisma, Role } from '@prisma/client';
import { audit } from '../utils/audit';
import { resolveEffectivePrice } from '../utils/labelPricing';
import { hasMinRole } from '../middleware/auth';
import { ensureScannedProductForBarcode } from '../utils/labelSync';
import { refuse } from '../utils/refusal';
import { priceField, samePrice } from '../utils/labelPrice';
import { labelChanges, refusalFor, describeChanges, editSummary, DELETE_ROLE_MESSAGE, ITEM_GONE_MESSAGE, barcodeTakenText } from '../utils/labelRules';
import { endedSaleView, saleEnded, parseSaleEnd, planPriceSave, describeStorePrice } from '../utils/labelSale';

// SUPER_ADMIN+ always has access; below that, a StoreManager needs either
// allStoresAccess or an explicit UserStoreRole for this specific store.
// Matches hasStoreAccess in orderList.controller.ts — see that file for the
// canonical version of this check.
async function canTouchStore(userId: string, userRole: Role, storeId: string): Promise<boolean> {
  if (hasMinRole(userRole, Role.SUPER_ADMIN)) return true;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { allStoresAccess: true } });
  if (dbUser?.allStoresAccess) return true;
  const access = await prisma.userStoreRole.findUnique({ where: { userId_storeId: { userId, storeId } } });
  return !!access;
}

type PrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed';

// printedAt alone can't tell "never printed" apart from "was printed, then a
// later edit reset it" — both look identical (null). everPrinted never
// resets, so it's the only reliable way to split those two states apart.
// A null effectivePrice wins over everything except "not added at all" — a
// Label (or its store override) that resolves to no price can never be
// 'printed'/'needs_reprint'/queued, even if it happened to be printed once
// before the price was since cleared.
function printStatus(storeLabel: { printedAt: Date | null; everPrinted: boolean } | null, effectivePrice: string | null): PrintStatus {
  if (!storeLabel) return 'not_added';
  if (effectivePrice === null) return 'needs_price';
  if (storeLabel.printedAt) return 'printed';
  return storeLabel.everPrinted ? 'needs_reprint' : 'new';
}

// A text box the person may leave empty (empty becomes "none")
const textField = (what: string, max: number) =>
  z.string({ message: `Enter the ${what}.` }).trim().max(max, `The ${what} is too long (${max} characters at most).`).transform((v) => (v === '' ? null : v));

const createLabelSchema = z.object({
  productName: z.string({ message: 'Enter the product name.' }).trim().min(1, 'Enter the product name.').max(40, 'The product name is too long (40 characters at most).'),
  priceText: priceField.optional().nullable(),
  dealText: textField('deal text', 20).optional().nullable(),
  barcode: textField('barcode', 40).optional().nullable(),
  category: textField('category', 100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate, { message: 'Choose one of the label designs.' }).default(LabelTemplate.CLASSIC_RED_BLACK),
  storeId: z.string().uuid('That store is not valid.').optional(),
});

// GET /labels — the global catalog (base price only). ?myStoreId=X is
// explicit client-supplied context (mobile sends its own resolved store;
// admin never sends this — DevAdmin/SuperAdmin have no "own store" to
// infer) — when present, each row is annotated with that store's
// StoreLabel (if any) so a caller can show "already in my queue" inline.
export async function getAllLabels(req: AuthRequest, res: Response) {
  const { myStoreId } = req.query;

  if (typeof myStoreId === 'string' && myStoreId) {
    if (!(await canTouchStore(req.user!.id, req.user!.role, myStoreId))) {
      res.status(403).json({ success: false, error: "You don't have access to that store" });
      return;
    }
  }

  const labels = await prisma.label.findMany({
    orderBy: { updatedAt: 'desc' },
    include: typeof myStoreId === 'string' && myStoreId
      ? { storeLabels: { where: { storeId: myStoreId } } }
      : undefined,
  });

  const data = labels.map((label) => {
    if (typeof myStoreId !== 'string' || !myStoreId) return label;
    const { storeLabels, ...rest } = label as typeof label & {
      storeLabels: { id: string; priceText: string | null; printedAt: Date | null; everPrinted: boolean; overrideExpiresAt: Date | null }[];
    };
    const myStoreLabel = endedSaleView(storeLabels[0] ?? null); // a sale that has ended is over now, not when the 15-minute job gets to it
    const effectivePrice = resolveEffectivePrice(label, myStoreLabel);
    return {
      ...rest,
      myStoreLabel: myStoreLabel
        ? {
            id: myStoreLabel.id,
            effectivePrice,
            printedAt: myStoreLabel.printedAt,
            status: printStatus(myStoreLabel, effectivePrice),
            hasOverride: !!myStoreLabel.priceText,
            overrideExpiresAt: myStoreLabel.overrideExpiresAt,
          }
        : null,
    };
  });

  res.json({ success: true, data });
}

// GET /store-labels?storeId=X — every catalog Label left-joined with that
// store's StoreLabel, resolved price, and print status. This is the "By
// Store" view (admin, unfiltered) and mobile's "My Prints" (filtered to
// printedAt IS NULL by the caller after fetching, or via ?unprinted=true).
export async function getStoreLabels(req: AuthRequest, res: Response) {
  const { storeId, unprinted } = req.query;
  if (typeof storeId !== 'string' || !storeId) {
    res.status(400).json({ success: false, error: 'storeId is required' });
    return;
  }
  if (!(await canTouchStore(req.user!.id, req.user!.role, storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const labels = await prisma.label.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { storeLabels: { where: { storeId } } },
  });

  let data = labels.map((label) => {
    const storeLabel = endedSaleView(label.storeLabels[0] ?? null);
    const effectivePrice = resolveEffectivePrice(label, storeLabel);
    return {
      id: label.id,
      productName: label.productName,
      barcode: label.barcode,
      category: label.category,
      template: label.template,
      basePriceText: label.priceText,
      dealText: label.dealText,
      storeLabelId: storeLabel?.id ?? null,
      priceText: effectivePrice,
      hasOverride: !!storeLabel?.priceText,
      overrideExpiresAt: storeLabel?.overrideExpiresAt?.toISOString() ?? null,
      printedAt: storeLabel?.printedAt ?? null,
      status: printStatus(storeLabel, effectivePrice),
      createdAt: (storeLabel?.createdAt ?? label.createdAt).toISOString(),
      updatedAt: (storeLabel?.updatedAt ?? label.updatedAt).toISOString(),
    };
  });

  if (unprinted === 'true') {
    data = data.filter((l) => l.storeLabelId && !l.printedAt);
  }

  res.json({ success: true, data });
}

// A label made automatically by a scan (ensureLabelForBarcode) and never touched since: no price, no deal, and no store has
// priced or printed it. Creating a label for its barcode fills it in instead of being refused.
function isUnclaimedPlaceholder(l: { priceText: string | null; dealText: string | null; storeLabels: { everPrinted: boolean; priceText: string | null }[] }): boolean {
  return l.priceText == null && l.dealText == null && l.storeLabels.every((sl) => !sl.everPrinted && sl.priceText == null);
}

// POST /labels — creates a brand-new catalog entry AND the creating user's
// own StoreLabel in one step, so the person who just made this immediately
// has it in their own print queue. Only called when the barcode has no
// existing catalog match (client-side dedupe, same as before this feature).
// One barcode belongs to one item: a second item with the same barcode is
// refused, naming the first, except when the first is still an unclaimed scan
// placeholder (see isUnclaimedPlaceholder), which is filled in instead.
export async function createLabel(req: AuthRequest, res: Response) {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const { storeId: requestedStoreId, ...labelData } = parsed.data;

  if (requestedStoreId && !(await canTouchStore(req.user!.id, req.user!.role, requestedStoreId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const creatorStoreId = requestedStoreId ?? req.user!.storeIds?.[0] ?? null;
  let adoptedPlaceholder = false;
  let label: Awaited<ReturnType<typeof prisma.label.create>> & { storeLabels: unknown[] };

  const taken = labelData.barcode
    ? await prisma.label.findFirst({
        where: { barcode: labelData.barcode },
        select: { id: true, productName: true, priceText: true, dealText: true, storeLabels: { select: { everPrinted: true, priceText: true } } },
      })
    : null;

  if (taken && !isUnclaimedPlaceholder(taken)) {
    res.status(409).json({ success: false, code: 'BARCODE_TAKEN', error: barcodeTakenText(labelData.barcode!, taken.productName), data: { existingId: taken.id, existingName: taken.productName } });
    return;
  }

  if (taken) {
    // Scanning a new product saves it to the Store Catalog, and that save makes a priceless label for the barcode
    // (ensureLabelForBarcode). The scanner then opens the New Label form, and saving it used to be refused with "The barcode
    // already belongs to <the same item>". A label nobody has priced, given a deal or printed is a placeholder: filling it in is
    // what creating it would have done, so it is filled in here. The update only matches while it is still unpriced, so if
    // two people save at once the second is refused like any taken barcode.
    const claimed = await prisma.$transaction(async (tx) => {
      const { count } = await tx.label.updateMany({
        where: { id: taken.id, priceText: null, dealText: null },
        data: {
          productName: labelData.productName,
          priceText: labelData.priceText ?? null,
          dealText: labelData.dealText ?? null,
          template: labelData.template,
          ...(labelData.category ? { category: labelData.category } : {}),   // a blank category keeps the one the scan found
        },
      });
      if (count === 0) return null;
      if (creatorStoreId) {
        await tx.storeLabel.upsert({
          where: { labelId_storeId: { labelId: taken.id, storeId: creatorStoreId } },
          create: { labelId: taken.id, storeId: creatorStoreId, priceText: null },
          update: {},
        });
      }
      return tx.label.findUnique({ where: { id: taken.id }, include: { storeLabels: true } });
    });
    if (!claimed) {
      res.status(409).json({ success: false, code: 'BARCODE_TAKEN', error: barcodeTakenText(labelData.barcode!, taken.productName), data: { existingId: taken.id, existingName: taken.productName } });
      return;
    }
    label = claimed;
    adoptedPlaceholder = true;
  } else {
    label = await prisma.label.create({
      data: {
        ...labelData,
        createdByStoreId: creatorStoreId,
        createdById: req.user!.id,
        ...(creatorStoreId
          ? { storeLabels: { create: { storeId: creatorStoreId, priceText: null } } }
          : {}),
      },
      include: { storeLabels: true },
    });
  }

  // Keep the shared scan-lookup cache (ScannedProduct) in sync — a Label
  // created directly here (with a barcode) should be findable the next
  // time someone scans it in Order List/Stock Request/Catalog. A failure
  // here should not roll back the Label write; it's logged, not swallowed.
  if (label.barcode) {
    try {
      await ensureScannedProductForBarcode(label.barcode, {
        name: label.productName,
        category: label.category,
        brand: label.brand,
      });
    } catch (err) {
      console.error('ensureScannedProductForBarcode failed for label', label.id, err);
    }
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText, category: label.category, barcode: label.barcode, ...(adoptedPlaceholder ? { filledInScanPlaceholder: true } : {}) },
    storeId: creatorStoreId,
  });

  res.status(201).json({ success: true, data: label });
}

const updateLabelSchema = z.object({
  productName: z.string({ message: 'Enter the product name.' }).trim().min(1, 'Enter the product name.').max(40, 'The product name is too long (40 characters at most).').optional(),
  priceText: priceField.optional().nullable(),
  dealText: textField('deal text', 20).optional().nullable(),
  barcode: textField('barcode', 40).optional().nullable(),
  category: textField('category', 100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate, { message: 'Choose one of the label designs.' }).optional(),
});

// How many stores hold an item, and in what state: what a change or a delete would touch.
async function labelImpact(labelId: string) {
  const rows = await prisma.storeLabel.findMany({ where: { labelId }, select: { priceText: true, overrideExpiresAt: true, printedAt: true } });
  return {
    storeCopies: rows.length,
    inheritingBase: rows.filter((r) => r.priceText == null).length,
    ownPrice: rows.filter((r) => r.priceText != null).length,
    salePrice: rows.filter((r) => r.overrideExpiresAt != null).length,
    printed: rows.filter((r) => r.printedAt != null).length,
  };
}

// GET /labels/:labelId/impact — SuperAdmin+. What changing this item's price, or removing it, would do at the stores, so the
// admin can say so in the box before anything is sent.
export async function getLabelImpact(req: AuthRequest, res: Response) {
  const { labelId } = req.params;
  const label = await prisma.label.findUnique({ where: { id: labelId }, select: { id: true, productName: true, priceText: true, barcode: true } });
  if (!label) { res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE }); return; }
  res.json({ success: true, data: { ...label, ...(await labelImpact(labelId)) } });
}

// PATCH /labels/:labelId — edits the base catalog record. Only a REAL
// change counts (the phone sends every field on every edit), and who may
// make it depends on what it changes: the chain-wide price needs HQ, the
// item's name/barcode/category/deal/design needs a store manager or above.
// A real change to priceText cascades a reprint flag, and only to stores
// still inheriting the base price (no override of their own) — a store with
// its own override has an unchanged effective price. A real change to any
// other field means the physical label content itself is stale, so it
// cascades to every store regardless of price override. The Activity Log
// keeps before and after and how many stores were told to reprint.
export async function updateLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const parsed = updateLabelSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const before = await prisma.label.findUnique({ where: { id: labelId } });
  if (!before) {
    res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE });
    return;
  }

  const changes = labelChanges(before, parsed.data);
  const refusal = refusalFor(req.user!.role, changes);
  if (refusal) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'LABEL_CHANGE_REFUSED', entity: 'label', entityId: labelId,
      details: { summary: `${before.productName}: tried ${describeChanges(changes)}, refused (${req.user!.role})` },
      storeId: null,
    });
    res.status(403).json({ success: false, error: refusal });
    return;
  }
  if (Object.keys(changes).length === 0) {
    res.json({ success: true, data: before, changed: false, reprint: { stores: 0, keptOwnPrice: 0 } });
    return;
  }

  if (changes.barcode?.to) {
    const taken = await prisma.label.findFirst({ where: { barcode: changes.barcode.to, id: { not: labelId } }, select: { id: true, productName: true } });
    if (taken) {
      res.status(409).json({ success: false, code: 'BARCODE_TAKEN', error: barcodeTakenText(changes.barcode.to, taken.productName), data: { existingId: taken.id, existingName: taken.productName } });
      return;
    }
  }

  const priceOnly = Object.keys(changes).every((k) => k === 'priceText');
  let flagged = 0;
  let keptOwnPrice = 0;
  let label;
  try {
    label = await prisma.$transaction(async (tx) => {
      const updated = await tx.label.update({ where: { id: labelId }, data: parsed.data });
      if (priceOnly) {
        // Only the base price changed — only stores inheriting it are affected.
        flagged = (await tx.storeLabel.updateMany({ where: { labelId, priceText: null }, data: { printedAt: null } })).count;
        keptOwnPrice = await tx.storeLabel.count({ where: { labelId, priceText: { not: null } } });
      } else {
        // Content itself changed — every store's printed copy is now stale.
        flagged = (await tx.storeLabel.updateMany({ where: { labelId }, data: { printedAt: null } })).count;
      }
      return updated;
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE });
      return;
    }
    throw err;
  }

  // Same sync as createLabel — a barcode edited/confirmed here should stay
  // findable from the scan-lookup cache. Not rolled back on failure. Only
  // overwrite name/category on the ScannedProduct side if THIS request
  // actually touched them — a price-only edit shouldn't resync a stale
  // productName/category that a manager may have already corrected
  // directly on ScannedProduct via its own Edit modal.
  if (label.barcode) {
    try {
      await ensureScannedProductForBarcode(label.barcode, {
        name: label.productName,
        category: label.category,
        brand: label.brand,
        overwriteName: !!changes.productName,
        overwriteCategory: !!changes.category,
      });
    } catch (err) {
      console.error('ensureScannedProductForBarcode failed for label', label.id, err);
    }
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_LABEL', entity: 'label', entityId: label.id,
    details: { summary: editSummary(before.productName, changes, flagged, keptOwnPrice), changes, storesFlagged: flagged, keptOwnPrice },
    storeId: null,
  });

  res.json({ success: true, data: label, changed: true, reprint: { stores: flagged, keptOwnPrice } });
}

// DELETE /labels/:labelId — HQ only. Removing an item removes every store's copy of it with its print history and sale prices, so
// the Activity Log keeps what it was (price, barcode) and how much went with it.
export async function deleteLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'LABEL_CHANGE_REFUSED', entity: 'label', entityId: labelId,
      details: { summary: `${label?.productName ?? 'An item'}: tried to remove it from the catalog, refused (${req.user!.role})` },
      storeId: null,
    });
    res.status(403).json({ success: false, error: DELETE_ROLE_MESSAGE });
    return;
  }
  if (!label) {
    res.status(404).json({ success: false, error: 'That item was already removed.' });
    return;
  }

  const impact = await labelImpact(labelId);
  let deleted;
  try {
    deleted = await prisma.label.delete({ where: { id: labelId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
      res.status(404).json({ success: false, error: 'That item was already removed.' });
      return;
    }
    throw err;
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_LABEL', entity: 'label', entityId: deleted.id,
    details: {
      summary: `${deleted.productName} (${deleted.priceText ? `$${deleted.priceText}` : 'no price'}${deleted.barcode ? `, barcode ${deleted.barcode}` : ''}) removed from ${plural(impact.storeCopies, 'store', 'stores')}; ${plural(impact.printed, 'print record', 'print records')}, ${plural(impact.ownPrice, 'store price', 'store prices')} and ${plural(impact.salePrice, 'sale price', 'sale prices')} went with it`,
      basePrice: deleted.priceText, barcode: deleted.barcode, ...impact,
    },
    storeId: null,
  });

  res.json({ success: true, data: deleted, removed: impact });
}

const storeLabelBody = {
  priceText: priceField.optional().nullable(),
  // A store day ("2026-09-29", the sale runs to the end of that day) or an exact instant (the phone). Missing keeps the current end,
  // null clears it.
  expiresAt: z.string().min(1).optional().nullable(),
};

const upsertStoreLabelSchema = z.object({
  labelId: z.string().uuid(),
  storeId: z.string().uuid(),
  ...storeLabelBody,
});

// The end date of a request: undefined keeps the current end, null clears it, a string is a real end that has not passed yet.
function requestedEnd(expiresAt: string | null | undefined, now: Date): { end: Date | null | undefined } | { refusal: string } {
  if (expiresAt === undefined || expiresAt === null) return { end: expiresAt };
  const parsed = parseSaleEnd(expiresAt, now);
  return parsed.ok ? { end: parsed.date } : { refusal: parsed.message };
}

const storeNameOf = async (storeId: string) => (await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }))?.name ?? 'the store';

// Saves a planned store price only if the row still holds the price and end the plan was made from, so a fast double click or two people
// saving at once record ONE change. If the row moved, the request is planned again against the row as it is now: when that leaves nothing
// to change, the other save already did it (a repeat); otherwise someone changed it differently and the person is told.
async function savePlanned(
  existing: { id: string; priceText: string | null; overrideExpiresAt: Date | null; printedAt: Date | null },
  label: { priceText: string | null },
  price: string | null,
  end: Date | null | undefined,
  now: Date,
) {
  const plan = planPriceSave(label, existing, price, end, now);
  if (!plan.changed) return { kind: 'same' as const, row: existing };
  const claimed = await prisma.storeLabel.updateMany({
    where: { id: existing.id, priceText: existing.priceText, overrideExpiresAt: existing.overrideExpiresAt },
    data: plan.data,
  });
  if (claimed.count > 0) return { kind: 'saved' as const, row: await prisma.storeLabel.findUnique({ where: { id: existing.id } }), plan };
  const fresh = await prisma.storeLabel.findUnique({ where: { id: existing.id } });
  if (!fresh) return { kind: 'conflict' as const };
  return planPriceSave(label, fresh, price, end, now).changed ? { kind: 'conflict' as const } : { kind: 'same' as const, row: fresh };
}

const CHANGED_UNDERFOOT = 'Someone changed this price a moment ago. Reload the page and look at the price before changing it again.';

// POST /store-labels — "Add from Catalog." Adds a store's own copy of a catalog item, at the base price or, when a price is given, at
// that store price. Adding what is already there changes nothing (it used to put the base price back over the store's own price).
// Giving a price for an item the store already has is the same as PATCH /store-labels/:id.
export async function upsertStoreLabel(req: AuthRequest, res: Response) {
  const parsed = upsertStoreLabelSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { labelId, storeId, priceText, expiresAt } = parsed.data;

  if (!(await canTouchStore(req.user!.id, req.user!.role, storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) {
    res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE });
    return;
  }

  const now = new Date();
  const asked = requestedEnd(expiresAt, now);
  if ('refusal' in asked) { res.status(400).json({ success: false, error: asked.refusal }); return; }

  const existing = await prisma.storeLabel.findUnique({ where: { labelId_storeId: { labelId, storeId } } });
  const price = priceText ?? null;

  if (existing && price === null) {
    res.json({ success: true, data: existing, changed: false });
    return;
  }

  if (!existing) {
    let created;
    try {
      // An expiry only means anything alongside an actual override: never stored against the base price.
      created = await prisma.storeLabel.create({ data: { labelId, storeId, priceText: price, overrideExpiresAt: price ? (asked.end ?? null) : null } });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      // Two adds at once: the other one won, and this one is a repeat of it
      const winner = await prisma.storeLabel.findUnique({ where: { labelId_storeId: { labelId, storeId } } });
      res.json({ success: true, data: winner, changed: false });
      return;
    }
    if (price !== null) {
      const storeName = await storeNameOf(storeId);
      const plan = planPriceSave(label, null, price, asked.end, now);
      audit({
        actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
        action: 'STORE_LABEL_PRICE', entity: 'label', entityId: labelId, storeId, storeName,
        details: { summary: describeStorePrice(label.productName, storeName, plan), productName: label.productName, priceBefore: plan.before.price, priceAfter: plan.after.price, endsAt: plan.after.ends?.toISOString() ?? null },
      });
    }
    res.status(201).json({ success: true, data: created, changed: true });
    return;
  }

  const outcome = await savePlanned(existing, label, price, asked.end, now);
  if (outcome.kind === 'conflict') { res.status(409).json({ success: false, error: CHANGED_UNDERFOOT }); return; }
  if (outcome.kind === 'same') { res.json({ success: true, data: outcome.row, changed: false }); return; }

  const storeName = await storeNameOf(storeId);
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'STORE_LABEL_PRICE', entity: 'label', entityId: labelId, storeId, storeName,
    details: { summary: describeStorePrice(label.productName, storeName, outcome.plan), productName: label.productName, priceBefore: outcome.plan.before.price, priceAfter: outcome.plan.after.price, endsAt: outcome.plan.after.ends?.toISOString() ?? null },
  });
  res.json({ success: true, data: outcome.row, changed: true, needsReprint: outcome.plan.priceChanged });
}

const updateStoreLabelSchema = z.object(storeLabelBody);

// PATCH /store-labels/:storeLabelId — set one store's own price (with an end date), or clear it (null) to go back to the base price.
// Only a real change counts: the same price and end again records nothing and does not flag the label for reprint. The label is flagged
// only when the price on the shelf really changes. A price sent without an end date keeps the sale's end date; null clears it.
export async function updateStoreLabel(req: AuthRequest, res: Response) {
  const { storeLabelId } = req.params;
  const parsed = updateStoreLabelSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const existing = await prisma.storeLabel.findUnique({ where: { id: storeLabelId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'That store label no longer exists. It may have been removed. Reload the page.' });
    return;
  }
  if (!(await canTouchStore(req.user!.id, req.user!.role, existing.storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const now = new Date();
  const asked = requestedEnd(parsed.data.expiresAt, now);
  if ('refusal' in asked) { res.status(400).json({ success: false, error: asked.refusal }); return; }

  const label = await prisma.label.findUnique({ where: { id: existing.labelId } });
  if (!label) { res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE }); return; }

  const outcome = await savePlanned(existing, label, parsed.data.priceText ?? null, asked.end, now);
  if (outcome.kind === 'conflict') { res.status(409).json({ success: false, error: CHANGED_UNDERFOOT }); return; }
  if (outcome.kind === 'same') { res.json({ success: true, data: outcome.row, changed: false }); return; }

  const storeName = await storeNameOf(existing.storeId);
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'STORE_LABEL_PRICE', entity: 'label', entityId: existing.labelId, storeId: existing.storeId, storeName,
    details: { summary: describeStorePrice(label.productName, storeName, outcome.plan), productName: label.productName, priceBefore: outcome.plan.before.price, priceAfter: outcome.plan.after.price, endsAt: outcome.plan.after.ends?.toISOString() ?? null },
  });
  res.json({ success: true, data: outcome.row, changed: true, needsReprint: outcome.plan.priceChanged });
}

// DELETE /store-labels/:storeLabelId — HQ only. Takes an item out of ONE store's list, for an item that was added there by mistake (or by
// "Push to all stores") and never printed. A label that has been printed there stays on record, and the chain-wide item is not touched.
export async function removeStoreLabel(req: AuthRequest, res: Response) {
  const { storeLabelId } = req.params;
  const existing = await prisma.storeLabel.findUnique({ where: { id: storeLabelId }, include: { label: { select: { productName: true } } } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'That label is not in this store any more. Reload the page.' });
    return;
  }
  const storeName = await storeNameOf(existing.storeId);
  const KEPT = `"${existing.label.productName}" was printed at ${storeName} before, so it stays on record and cannot be removed from this store. Only labels that were never printed there can be removed.`;
  if (existing.everPrinted) { res.status(409).json({ success: false, error: KEPT }); return; }

  // Decide once: removed only if it is still never printed
  const removed = await prisma.storeLabel.deleteMany({ where: { id: storeLabelId, everPrinted: false } });
  if (removed.count === 0) { res.status(409).json({ success: false, error: KEPT }); return; }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'STORE_LABEL_REMOVED', entity: 'label', entityId: existing.labelId, storeId: existing.storeId, storeName,
    details: { summary: `Took "${existing.label.productName}" out of ${storeName}'s labels (it was never printed there).`, productName: existing.label.productName },
  });
  res.json({ success: true, removed: true });
}

const printLabelsSchema = z.object({
  items: z.array(z.object({
    storeLabelId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999).default(1),
    // The price that is on the paper. When it is sent, the label counts as printed only if it is still the store's price (a price changed
    // while the sheet was printing means the paper is out of date). The phone does not send it yet, and then the check is skipped.
    printedPrice: priceField.optional(),
  })).min(1),
});

export interface NotMarked {
  storeLabelId: string;
  productName: string | null;
  reason: 'gone' | 'no_price' | 'price_changed';
  printedPrice?: string;
  currentPrice?: string | null;
}

// POST /labels/print — stamps printedAt on specific StoreLabel rows (not
// the shared Label anymore), so printing at one store never affects
// another store's queue. Called after the person confirms the paper came
// out. Each label is judged on its own: one that is gone, has lost its
// price, or now has a different price than the one printed is reported in
// `notMarked` and stays in the queue, and the rest are marked.
export async function markLabelsPrinted(req: AuthRequest, res: Response) {
  const parsed = printLabelsSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const { items } = parsed.data;
  const storeLabelIds = items.map(i => i.storeLabelId);

  const rows = await prisma.storeLabel.findMany({
    where: { id: { in: storeLabelIds } },
    include: { label: true },
  });
  for (const r of rows) {
    if (!(await canTouchStore(req.user!.id, req.user!.role, r.storeId))) {
      res.status(403).json({ success: false, error: "You don't have access to one of those stores" });
      return;
    }
  }

  const now = new Date();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const notMarked: NotMarked[] = [];
  const good: { row: (typeof rows)[number]; quantity: number }[] = [];
  for (const item of items) {
    const row = byId.get(item.storeLabelId);
    if (!row) { notMarked.push({ storeLabelId: item.storeLabelId, productName: null, reason: 'gone' }); continue; }
    const current = resolveEffectivePrice(row.label, endedSaleView(row, now));
    if (current === null) { notMarked.push({ storeLabelId: row.id, productName: row.label.productName, reason: 'no_price' }); continue; }
    if (item.printedPrice !== undefined && !samePrice(item.printedPrice, current)) {
      notMarked.push({ storeLabelId: row.id, productName: row.label.productName, reason: 'price_changed', printedPrice: item.printedPrice, currentPrice: current });
      continue;
    }
    good.push({ row, quantity: item.quantity });
  }

  if (good.length > 0) {
    // A sale that ended a few minutes ago may still be stored as the store's price. It was printed at the base price, so the ended sale
    // goes with it (otherwise the job that ends sales would flag this fresh print for a reprint).
    const ended = good.filter((g) => saleEnded(g.row, now)).map((g) => g.row.id);
    const rest = good.filter((g) => !saleEnded(g.row, now)).map((g) => g.row.id);
    if (rest.length > 0) await prisma.storeLabel.updateMany({ where: { id: { in: rest } }, data: { printedAt: now, everPrinted: true } });
    if (ended.length > 0) await prisma.storeLabel.updateMany({ where: { id: { in: ended } }, data: { printedAt: now, everPrinted: true, priceText: null, overrideExpiresAt: null } });
  }
  const totalCopies = good.reduce((sum, g) => sum + g.quantity, 0);

  const storeId = rows[0]?.storeId ?? req.user!.storeIds?.[0] ?? null;
  const storeName = storeId ? await storeNameOf(storeId) : null;
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PRINT_LABEL', entity: 'label',
    details: {
      summary: `Marked ${good.length} ${good.length === 1 ? 'label' : 'labels'} (${totalCopies} ${totalCopies === 1 ? 'copy' : 'copies'}) as printed${storeName ? ` at ${storeName}` : ''}${notMarked.length ? `; ${notMarked.length} left in the queue` : ''}.`,
      labelCount: good.length, totalCopies, storeLabelIds: good.map((g) => g.row.id), notMarked: notMarked.length,
    },
    storeId,
    storeName,
  });

  res.json({ success: true, data: { printedCount: good.length, totalCopies, notMarked } });
}

// GET /labels/lookup?storeId=X&barcode=Y — mobile Price Check. Resolves a
// single scanned barcode straight to this store's price, without pulling
// the whole catalog down for a one-item lookup.
export async function lookupStoreLabelByBarcode(req: AuthRequest, res: Response) {
  const { storeId, barcode } = req.query;
  if (typeof storeId !== 'string' || !storeId || typeof barcode !== 'string' || !barcode) {
    res.status(400).json({ success: false, error: 'storeId and barcode are required' });
    return;
  }
  if (!(await canTouchStore(req.user!.id, req.user!.role, storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const label = await prisma.label.findFirst({
    where: { barcode },
    include: { storeLabels: { where: { storeId } } },
  });

  if (!label) {
    res.json({ success: true, data: { found: false, barcode } });
    return;
  }

  const storeLabel = endedSaleView(label.storeLabels[0] ?? null); // a sale that has ended is over now, not when the 15-minute job gets to it
  const effectivePrice = storeLabel ? resolveEffectivePrice(label, storeLabel) : null;
  res.json({
    success: true,
    data: {
      found: true,
      id: label.id,
      productName: label.productName,
      barcode: label.barcode,
      category: label.category,
      template: label.template,
      basePriceText: label.priceText,
      dealText: label.dealText,
      storeLabelId: storeLabel?.id ?? null,
      priceText: effectivePrice,
      hasOverride: !!storeLabel?.priceText,
      printedAt: storeLabel?.printedAt ?? null,
      status: printStatus(storeLabel, effectivePrice),
    },
  });
}

// GET /labels/coverage — SuperAdmin+ only. Every catalog label against
// every active store in one shot, for the cross-store coverage view. Fetches
// the three tables independently and stitches them in memory instead of a
// per-label query, since this is meant to render the whole catalog x store
// grid at once (currently ~90 labels x ~12 stores — trivial either way, but
// N+1 here would mean 90 round trips for no reason).
export async function getLabelsCoverage(req: AuthRequest, res: Response) {
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    res.status(403).json({ success: false, error: 'Requires SuperAdmin access' });
    return;
  }

  const [labels, stores, storeLabels] = await Promise.all([
    prisma.label.findMany({ orderBy: { updatedAt: 'desc' } }),
    prisma.store.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.storeLabel.findMany(),
  ]);

  const byLabel = new Map<string, typeof storeLabels>();
  for (const sl of storeLabels) {
    if (!byLabel.has(sl.labelId)) byLabel.set(sl.labelId, []);
    byLabel.get(sl.labelId)!.push(sl);
  }

  const data = labels.map((label) => {
    const rows = byLabel.get(label.id) ?? [];
    const byStore = new Map(rows.map((r) => [r.storeId, r]));
    const coverage = stores.map((store) => {
      const sl = endedSaleView(byStore.get(store.id) ?? null);
      const effectivePrice = sl ? resolveEffectivePrice(label, sl) : null;
      return {
        storeId: store.id,
        storeLabelId: sl?.id ?? null,
        status: printStatus(sl, effectivePrice),
        priceText: effectivePrice,
        hasOverride: !!sl?.priceText,
      };
    });
    return {
      id: label.id,
      productName: label.productName,
      barcode: label.barcode,
      category: label.category,
      basePriceText: label.priceText,
      dealText: label.dealText,
      template: label.template,
      addedCount: coverage.filter((c) => c.status !== 'not_added').length,
      coverage,
    };
  });

  res.json({ success: true, data: { stores, labels: data } });
}

// POST /labels/:labelId/push-to-all — SuperAdmin+ only. Adds this label, at
// its base price, to every active store that doesn't already have it —
// closing the "add once, chase 12 stores individually" gap the coverage
// view exists to surface. Stores that already have this label (in any
// state) are left untouched, so this is safe to call repeatedly, even
// twice at once. The answer names the stores, and the Activity Log keeps
// them (a store can be taken out again with DELETE /store-labels/:id
// while the label has never been printed there).
export async function pushLabelToAllStores(req: AuthRequest, res: Response) {
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    res.status(403).json({ success: false, error: 'Requires SuperAdmin access' });
    return;
  }

  const { labelId } = req.params;
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) {
    res.status(404).json({ success: false, error: ITEM_GONE_MESSAGE });
    return;
  }

  const [stores, existing] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.storeLabel.findMany({ where: { labelId }, select: { storeId: true } }),
  ]);
  const existingIds = new Set(existing.map((e) => e.storeId));
  const missing = stores.filter((s) => !existingIds.has(s.id));

  let addedCount = 0;
  if (missing.length > 0) {
    const result = await prisma.storeLabel.createMany({
      data: missing.map((s) => ({ labelId, storeId: s.id, priceText: null })),
      skipDuplicates: true, // a second click at the same moment adds nothing twice
    });
    addedCount = result.count;
  }
  const storeNames = addedCount > 0 ? missing.map((s) => s.name) : [];

  if (addedCount > 0) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'PUSH_LABEL_TO_ALL_STORES', entity: 'label', entityId: labelId,
      details: {
        summary: `Added "${label.productName}" to ${addedCount} ${addedCount === 1 ? 'store' : 'stores'}: ${storeNames.join(', ')}.`,
        productName: label.productName, storesAdded: addedCount, storeNames,
      },
      storeId: null,
    });
  }

  res.json({ success: true, data: { added: addedCount, storeNames } });
}

// GET /labels/health-summary — SuperAdmin+ only. A cheap, chain-wide count
// (not the full per-item breakdown Coverage returns) for the Dashboard's
// "one glance" stat card: how many labels can be printed right now, and
// which stores are behind. It counts only what can really be printed: a
// copy at a closed store, and a copy whose item has no price, are not
// "waiting to print" (an item with no price is reported on its own, as
// `noPriceItems`). A sale that has ended counts as waiting for a reprint
// even before the job that ends sales has run.
export async function getLabelsHealthSummary(req: AuthRequest, res: Response) {
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    res.status(403).json({ success: false, error: 'Requires SuperAdmin access' });
    return;
  }

  const now = new Date();
  const [rows, stores] = await Promise.all([
    prisma.storeLabel.findMany({
      where: { OR: [{ printedAt: null }, { overrideExpiresAt: { lte: now } }] },
      select: {
        labelId: true, storeId: true, everPrinted: true, createdAt: true, updatedAt: true,
        priceText: true, overrideExpiresAt: true, printedAt: true,
        label: { select: { priceText: true } },
      },
    }),
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const active = new Set(stores.map((st) => st.id));

  const byStoreMap = new Map<string, { count: number; oldestMs: number }>();
  const noPrice = new Set<string>();
  let totalStale = 0;
  for (const raw of rows) {
    if (!active.has(raw.storeId)) continue; // a closed store prints nothing
    const row = endedSaleView(raw, now)!;
    if (resolveEffectivePrice(raw.label, row) === null) { noPrice.add(raw.labelId); continue; }
    if (row.printedAt) continue;
    const staleSince = row.everPrinted ? row.updatedAt : row.createdAt;
    const entry = byStoreMap.get(row.storeId) ?? { count: 0, oldestMs: 0 };
    entry.count += 1;
    entry.oldestMs = Math.max(entry.oldestMs, now.getTime() - staleSince.getTime());
    byStoreMap.set(row.storeId, entry);
    totalStale += 1;
  }

  const byStore = stores
    .map((store) => {
      const entry = byStoreMap.get(store.id);
      if (!entry) return null;
      return {
        storeId: store.id,
        storeName: store.name,
        staleCount: entry.count,
        oldestStaleDays: Math.max(0, Math.floor(entry.oldestMs / 86400000)),
      };
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.staleCount - a.staleCount);

  res.json({
    success: true,
    data: {
      totalStale,
      storesWithStale: byStore.length,
      totalStores: stores.length,
      noPriceItems: noPrice.size,
      byStore,
    },
  });
}
