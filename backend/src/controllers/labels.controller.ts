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

type PrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'printed';

// printedAt alone can't tell "never printed" apart from "was printed, then a
// later edit reset it" — both look identical (null). everPrinted never
// resets, so it's the only reliable way to split those two states apart.
function printStatus(storeLabel: { printedAt: Date | null; everPrinted: boolean } | null): PrintStatus {
  if (!storeLabel) return 'not_added';
  if (storeLabel.printedAt) return 'printed';
  return storeLabel.everPrinted ? 'needs_reprint' : 'new';
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
    const { storeLabels, ...rest } = label as typeof label & {
      storeLabels: { priceText: string | null; printedAt: Date | null; everPrinted: boolean; overrideExpiresAt: Date | null }[];
    };
    const myStoreLabel = storeLabels[0] ?? null;
    return {
      ...rest,
      myStoreLabel: myStoreLabel
        ? {
            effectivePrice: resolveEffectivePrice(label, myStoreLabel),
            printedAt: myStoreLabel.printedAt,
            status: printStatus(myStoreLabel),
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
      overrideExpiresAt: storeLabel?.overrideExpiresAt?.toISOString() ?? null,
      printedAt: storeLabel?.printedAt ?? null,
      status: printStatus(storeLabel),
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
  expiresAt: z.string().min(1).optional().nullable(),
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
  priceText: z.string().min(1).max(7).optional().nullable(),
  expiresAt: z.string().min(1).optional().nullable(),
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
      priceText: storeLabel ? resolveEffectivePrice(label, storeLabel) : null,
      hasOverride: !!storeLabel?.priceText,
      printedAt: storeLabel?.printedAt ?? null,
      status: printStatus(storeLabel),
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
      return {
        storeId: store.id,
        storeLabelId: sl?.id ?? null,
        status: printStatus(sl),
        priceText: sl ? resolveEffectivePrice(label, sl) : null,
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
