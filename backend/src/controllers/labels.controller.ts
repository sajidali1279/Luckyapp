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
import { priceField } from '../utils/labelPrice';
import { labelChanges, refusalFor, describeChanges, editSummary, DELETE_ROLE_MESSAGE, ITEM_GONE_MESSAGE, barcodeTakenText } from '../utils/labelRules';

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
    const myStoreLabel = storeLabels[0] ?? null;
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
    const storeLabel = label.storeLabels[0] ?? null;
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

// POST /labels — creates a brand-new catalog entry AND the creating user's
// own StoreLabel in one step, so the person who just made this immediately
// has it in their own print queue. Only called when the barcode has no
// existing catalog match (client-side dedupe, same as before this feature).
// One barcode belongs to one item: a second item with the same barcode is
// refused, naming the first.
export async function createLabel(req: AuthRequest, res: Response) {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const { storeId: requestedStoreId, ...labelData } = parsed.data;

  if (requestedStoreId && !(await canTouchStore(req.user!.id, req.user!.role, requestedStoreId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  if (labelData.barcode) {
    const taken = await prisma.label.findFirst({ where: { barcode: labelData.barcode }, select: { id: true, productName: true } });
    if (taken) {
      res.status(409).json({ success: false, code: 'BARCODE_TAKEN', error: barcodeTakenText(labelData.barcode, taken.productName), data: { existingId: taken.id, existingName: taken.productName } });
      return;
    }
  }

  const creatorStoreId = requestedStoreId ?? req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.create({
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
    details: { productName: label.productName, priceText: label.priceText, category: label.category, barcode: label.barcode },
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

const upsertStoreLabelSchema = z.object({
  labelId: z.string().uuid(),
  storeId: z.string().uuid(),
  priceText: priceField.optional().nullable(),
  expiresAt: z.string().min(1).optional().nullable(),
});

// POST /store-labels — "Add from Catalog." Upserts a store's own copy of a
// catalog item. Omitting priceText (or passing null) means "use the base
// price." If the row already exists and the effective price is actually
// changing, printedAt resets; otherwise it's left alone.
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
    res.status(404).json({ success: false, error: 'Label not found' });
    return;
  }

  if (expiresAt) {
    const parsedDate = new Date(expiresAt);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid expiresAt date' });
      return;
    }
  }

  const existing = await prisma.storeLabel.findUnique({
    where: { labelId_storeId: { labelId, storeId } },
  });

  const nextPriceText = priceText ?? null;
  // An expiry only means anything alongside an actual override — never
  // persisted against the base price.
  const nextExpiresAt = nextPriceText && expiresAt ? new Date(expiresAt) : null;
  const priceIsChanging = !existing || resolveEffectivePrice(label, existing) !== resolveEffectivePrice(label, { priceText: nextPriceText });

  const storeLabel = await prisma.storeLabel.upsert({
    where: { labelId_storeId: { labelId, storeId } },
    create: { labelId, storeId, priceText: nextPriceText, overrideExpiresAt: nextExpiresAt },
    update: priceIsChanging ? { priceText: nextPriceText, overrideExpiresAt: nextExpiresAt, printedAt: null } : { overrideExpiresAt: nextExpiresAt },
  });

  res.status(existing ? 200 : 201).json({ success: true, data: storeLabel });
}

const updateStoreLabelSchema = z.object({
  priceText: priceField.optional().nullable(),
  expiresAt: z.string().min(1).optional().nullable(),
});

// PATCH /store-labels/:storeLabelId — edit or clear (pass null) one store's
// own override. Resets that row's own printedAt on any change.
export async function updateStoreLabel(req: AuthRequest, res: Response) {
  const { storeLabelId } = req.params;
  const parsed = updateStoreLabelSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const existing = await prisma.storeLabel.findUnique({ where: { id: storeLabelId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Store label not found' });
    return;
  }
  if (!(await canTouchStore(req.user!.id, req.user!.role, existing.storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  if (parsed.data.expiresAt) {
    const parsedDate = new Date(parsed.data.expiresAt);
    if (isNaN(parsedDate.getTime())) {
      res.status(400).json({ success: false, error: 'Invalid expiresAt date' });
      return;
    }
  }

  const nextPriceText = parsed.data.priceText ?? null;
  const nextExpiresAt = nextPriceText && parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  const storeLabel = await prisma.storeLabel.update({
    where: { id: storeLabelId },
    data: { priceText: nextPriceText, overrideExpiresAt: nextExpiresAt, printedAt: null },
  });

  res.json({ success: true, data: storeLabel });
}

const printLabelsSchema = z.object({
  items: z.array(z.object({
    storeLabelId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999).default(1),
  })).min(1),
});

// POST /labels/print — stamps printedAt on specific StoreLabel rows (not
// the shared Label anymore), so printing at one store never affects
// another store's queue.
export async function markLabelsPrinted(req: AuthRequest, res: Response) {
  const parsed = printLabelsSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const { items } = parsed.data;
  const storeLabelIds = items.map(i => i.storeLabelId);
  const totalCopies = items.reduce((sum, i) => sum + i.quantity, 0);

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

  const priceless = rows.filter((r) => resolveEffectivePrice(r.label, r) === null);
  if (priceless.length > 0) {
    res.status(400).json({ success: false, error: `${priceless.length} item(s) have no price set and can't be marked printed` });
    return;
  }

  await prisma.storeLabel.updateMany({
    where: { id: { in: storeLabelIds } },
    data: { printedAt: new Date(), everPrinted: true },
  });

  const storeId = rows[0]?.storeId ?? req.user!.storeIds?.[0] ?? null;
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PRINT_LABEL', entity: 'label',
    details: { labelCount: storeLabelIds.length, totalCopies, storeLabelIds },
    storeId,
  });

  res.json({ success: true, data: { printedCount: storeLabelIds.length, totalCopies } });
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

  const storeLabel = label.storeLabels[0] ?? null;
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
      const sl = byStore.get(store.id) ?? null;
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
// state) are left untouched, so this is safe to call repeatedly.
export async function pushLabelToAllStores(req: AuthRequest, res: Response) {
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    res.status(403).json({ success: false, error: 'Requires SuperAdmin access' });
    return;
  }

  const { labelId } = req.params;
  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) {
    res.status(404).json({ success: false, error: 'Label not found' });
    return;
  }

  const [stores, existing] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true } }),
    prisma.storeLabel.findMany({ where: { labelId }, select: { storeId: true } }),
  ]);
  const existingIds = new Set(existing.map((e) => e.storeId));
  const missing = stores.filter((s) => !existingIds.has(s.id));

  if (missing.length > 0) {
    await prisma.storeLabel.createMany({
      data: missing.map((s) => ({ labelId, storeId: s.id, priceText: null })),
    });
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PUSH_LABEL_TO_ALL_STORES', entity: 'label', entityId: labelId,
    details: { productName: label.productName, storesAdded: missing.length },
    storeId: null,
  });

  res.json({ success: true, data: { added: missing.length } });
}

// GET /labels/health-summary — SuperAdmin+ only. A cheap, chain-wide count
// (not the full per-item breakdown Coverage returns) for the Dashboard's
// "one glance" stat card: how many labels need printing right now, and
// which stores are behind. printedAt IS NULL already covers both 'new' and
// 'needs_reprint' in one filter — no need to compute status per row here.
export async function getLabelsHealthSummary(req: AuthRequest, res: Response) {
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    res.status(403).json({ success: false, error: 'Requires SuperAdmin access' });
    return;
  }

  const [staleRows, stores] = await Promise.all([
    prisma.storeLabel.findMany({
      where: { printedAt: null },
      select: { storeId: true, everPrinted: true, createdAt: true, updatedAt: true },
    }),
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);

  const byStoreMap = new Map<string, { count: number; oldestMs: number }>();
  const now = Date.now();
  for (const row of staleRows) {
    const staleSince = row.everPrinted ? row.updatedAt : row.createdAt;
    const ageMs = now - staleSince.getTime();
    const entry = byStoreMap.get(row.storeId) ?? { count: 0, oldestMs: 0 };
    entry.count += 1;
    entry.oldestMs = Math.max(entry.oldestMs, ageMs);
    byStoreMap.set(row.storeId, entry);
  }

  const byStore = stores
    .map((store) => {
      const entry = byStoreMap.get(store.id);
      if (!entry) return null;
      return {
        storeId: store.id,
        storeName: store.name,
        staleCount: entry.count,
        oldestStaleDays: Math.floor(entry.oldestMs / 86400000),
      };
    })
    .filter((s): s is NonNullable<typeof s> => !!s)
    .sort((a, b) => b.staleCount - a.staleCount);

  res.json({
    success: true,
    data: {
      totalStale: staleRows.length,
      storesWithStale: byStore.length,
      totalStores: stores.length,
      byStore,
    },
  });
}
