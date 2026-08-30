import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate, Role } from '@prisma/client';
import { audit } from '../utils/audit';
import { resolveEffectivePrice } from '../utils/labelPricing';
import { hasMinRole } from '../middleware/auth';

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

const createLabelSchema = z.object({
  productName: z.string().min(1).max(40),
  priceText: z.string().min(1).max(7),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
  storeId: z.string().uuid().optional(),
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
    const { storeLabels, ...rest } = label as typeof label & { storeLabels: { priceText: string | null; printedAt: Date | null }[] };
    const myStoreLabel = storeLabels[0] ?? null;
    return {
      ...rest,
      myStoreLabel: myStoreLabel
        ? { effectivePrice: resolveEffectivePrice(label, myStoreLabel), printedAt: myStoreLabel.printedAt }
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
    return {
      id: label.id,
      productName: label.productName,
      barcode: label.barcode,
      category: label.category,
      template: label.template,
      basePriceText: label.priceText,
      dealText: label.dealText,
      storeLabelId: storeLabel?.id ?? null,
      priceText: resolveEffectivePrice(label, storeLabel),
      hasOverride: !!storeLabel?.priceText,
      printedAt: storeLabel?.printedAt ?? null,
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
export async function createLabel(req: AuthRequest, res: Response) {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { storeId: requestedStoreId, ...labelData } = parsed.data;

  if (requestedStoreId && !(await canTouchStore(req.user!.id, req.user!.role, requestedStoreId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
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

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText, category: label.category },
    storeId: creatorStoreId,
  });

  res.status(201).json({ success: true, data: label });
}

const updateLabelSchema = z.object({
  productName: z.string().min(1).max(40).optional(),
  priceText: z.string().min(1).max(7).optional(),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).optional(),
});

// PATCH /labels/:labelId — edits the base catalog record. Only a REAL
// change to priceText cascades a reprint flag, and only to stores still
// inheriting the base price (no override of their own) — a store with its
// own override has an unchanged effective price. A real change to any
// other field (name, barcode, category, template, deal text) means the
// physical label content itself is stale, so it cascades to every store
// regardless of price override, matching this app's long-standing "any
// edit un-prints the label" rule from before per-store pricing existed.
export async function updateLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const parsed = updateLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const before = await prisma.label.findUnique({ where: { id: labelId } });
  if (!before) {
    res.status(404).json({ success: false, error: 'Label not found' });
    return;
  }

  const storeId = req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.update({
    where: { id: labelId },
    data: parsed.data,
  });

  const priceChanged = parsed.data.priceText !== undefined && parsed.data.priceText !== before.priceText;
  const otherFieldChanged = (['productName', 'barcode', 'category', 'template', 'dealText'] as const)
    .some((field) => parsed.data[field] !== undefined && parsed.data[field] !== before[field]);

  if (otherFieldChanged) {
    // Content itself changed — every store's printed copy is now stale.
    await prisma.storeLabel.updateMany({ where: { labelId }, data: { printedAt: null } });
  } else if (priceChanged) {
    // Only the base price changed — only stores inheriting it are affected.
    await prisma.storeLabel.updateMany({ where: { labelId, priceText: null }, data: { printedAt: null } });
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText, category: label.category },
    storeId,
  });

  res.json({ success: true, data: label });
}

export async function deleteLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const deleted = await prisma.label.delete({ where: { id: labelId } });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_LABEL', entity: 'label', entityId: deleted.id,
    details: { productName: deleted.productName },
    storeId: req.user!.storeIds?.[0] ?? null,
  });

  res.json({ success: true, data: deleted });
}

const upsertStoreLabelSchema = z.object({
  labelId: z.string().uuid(),
  storeId: z.string().uuid(),
  priceText: z.string().min(1).max(7).optional().nullable(),
});

// POST /store-labels — "Add from Catalog." Upserts a store's own copy of a
// catalog item. Omitting priceText (or passing null) means "use the base
// price." If the row already exists and the effective price is actually
// changing, printedAt resets; otherwise it's left alone.
export async function upsertStoreLabel(req: AuthRequest, res: Response) {
  const parsed = upsertStoreLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { labelId, storeId, priceText } = parsed.data;

  if (!(await canTouchStore(req.user!.id, req.user!.role, storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const label = await prisma.label.findUnique({ where: { id: labelId } });
  if (!label) {
    res.status(404).json({ success: false, error: 'Label not found' });
    return;
  }

  const existing = await prisma.storeLabel.findUnique({
    where: { labelId_storeId: { labelId, storeId } },
  });

  const nextPriceText = priceText ?? null;
  const priceIsChanging = !existing || resolveEffectivePrice(label, existing) !== resolveEffectivePrice(label, { priceText: nextPriceText });

  const storeLabel = await prisma.storeLabel.upsert({
    where: { labelId_storeId: { labelId, storeId } },
    create: { labelId, storeId, priceText: nextPriceText },
    update: priceIsChanging ? { priceText: nextPriceText, printedAt: null } : {},
  });

  res.status(existing ? 200 : 201).json({ success: true, data: storeLabel });
}

const updateStoreLabelSchema = z.object({
  priceText: z.string().min(1).max(7).optional().nullable(),
});

// PATCH /store-labels/:storeLabelId — edit or clear (pass null) one store's
// own override. Resets that row's own printedAt on any change.
export async function updateStoreLabel(req: AuthRequest, res: Response) {
  const { storeLabelId } = req.params;
  const parsed = updateStoreLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.storeLabel.findUnique({ where: { id: storeLabelId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Store label not found' });
    return;
  }
  if (!(await canTouchStore(req.user!.id, req.user!.role, existing.storeId))) {
    res.status(403).json({ success: false, error: "You don't have access to that store" });
    return;
  }

  const storeLabel = await prisma.storeLabel.update({
    where: { id: storeLabelId },
    data: { priceText: parsed.data.priceText ?? null, printedAt: null },
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
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { items } = parsed.data;
  const storeLabelIds = items.map(i => i.storeLabelId);
  const totalCopies = items.reduce((sum, i) => sum + i.quantity, 0);

  const rows = await prisma.storeLabel.findMany({ where: { id: { in: storeLabelIds } } });
  for (const r of rows) {
    if (!(await canTouchStore(req.user!.id, req.user!.role, r.storeId))) {
      res.status(403).json({ success: false, error: "You don't have access to one of those stores" });
      return;
    }
  }

  await prisma.storeLabel.updateMany({
    where: { id: { in: storeLabelIds } },
    data: { printedAt: new Date() },
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
