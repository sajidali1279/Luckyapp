# Per-Store Label Pricing & Print Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let different stores charge different prices for the same catalog item and track print status per store, instead of one shared price/printedAt for the whole chain — while keeping a catalog-first workflow where a store can add an already-known item to their own print queue without retyping its name or price.

**Architecture:** `Label` stays the chain-wide catalog record (name, barcode, template, category, base price) but loses `printedAt`. A new `StoreLabel` join table (`labelId` + `storeId`, unique pair) carries an optional price override and its own `printedAt`. Effective price is always `override ?? base`, resolved through one shared helper used by every layer that needs it. Admin gets a second view (a new `StoreLabelsPanel` component, toggled within the existing Labels page) for per-store pricing/printing; mobile's existing Ready-to-Print/Full-Catalog toggle is repurposed into My-Prints/Catalog with the same underlying split.

**Tech Stack:** Node/Express + Prisma + Zod (backend), React + react-router-dom (admin, inline `style` objects), React Native + Expo (mobile). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through (final task appends a checklist to `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`).

**Spec:** `docs/superpowers/specs/2026-08-29-per-store-label-pricing-design.md` — read this first for the full rationale; this plan doesn't repeat the "why," only the "how."

## Global Constraints

- Effective price for a store is always `storeLabel?.priceText ?? label.priceText` — computed by one shared function (`resolveEffectivePrice`, Task 2), never reimplemented inline anywhere else.
- `dealText` is chain-wide only — `StoreLabel` never carries its own deal text (deliberate scope decision, see spec).
- Editing `Label.priceText` (the base price), and only the price, resets `printedAt` to null on every `StoreLabel` row for that label where `priceText IS NULL` (inheriting the base) — rows with their own override are untouched. Editing any *other* base field (name, barcode, category, template, deal text) resets `printedAt` on **every** `StoreLabel` row for that label regardless of override, since the physical label content itself is now stale for every store — this is a real change to the request handler, not present in the first draft of this plan, added during self-review because the admin edit form always submits `priceText` on every save even when only another field changed.
- Editing a specific `StoreLabel.priceText` resets only that row's own `printedAt`.
- Creating a brand-new `Label` (a barcode with no existing catalog match) also creates a `StoreLabel` for the creating user's resolved store in the same request — no extra "add to my prints" step needed for the person who just made the thing.
- Store-scoped `StoreLabel` mutations are gated the same way other store-scoped writes in this app are: a STORE_MANAGER/EMPLOYEE can only touch their own store's rows (checked against `req.user!.storeIds`), SUPER_ADMIN/DEV_ADMIN can touch any.
- The destructive part of the migration (`DROP COLUMN "printedAt"` on `labels`) lives in the same migration file and the same commit as the controller code that stops referencing it — per this project's standing rule, never applied to the database ahead of the matching code being ready to deploy.
- Mobile's own-store resolution reuses the existing `useCurrentStoreId(allStores, assignedStoreIds)` hook (`mobile/utils/geo.ts`) — never re-implemented. It already defaults to `assignedStoreIds[0]` synchronously and refines via GPS for multi-store staff; a manual store picker is shown only when it returns `undefined` (a user with zero store assignments).

---

## File Structure

**Backend — modified:**
- `backend/prisma/schema.prisma` — `Label` loses `printedAt`; new `StoreLabel` model; `Store` gains a `storeLabels` relation
- `backend/src/controllers/labels.controller.ts` — every handler rewritten or added
- `backend/src/routes/index.ts` — new routes registered

**Backend — created:**
- `backend/prisma/migrations/20260829020000_store_label_pricing/migration.sql`
- `backend/src/utils/labelPricing.ts` — the shared `resolveEffectivePrice` helper

**Admin — modified:**
- `admin/src/services/api.ts` — `labelsApi` gains `getStoreLabels`, `addToStore`, `updateStoreLabel`; `print` changes shape
- `admin/src/pages/Labels.tsx` — trimmed to the base-catalog view + a view toggle

**Admin — created:**
- `admin/src/components/StoreLabelsPanel.tsx` — the per-store pricing/print view

**Mobile — modified:**
- `mobile/services/api.ts` — mirrors the admin API client additions
- `mobile/components/LabelsScreen.tsx` — Catalog view drops inline print/qty in favor of an "Add" action; My Prints view queries `StoreLabel`; location resolution added

**Docs — modified:**
- `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` — new verification section

---

### Task 1: Backend — `StoreLabel` model, migration, shared price helper, and controller rewrite

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260829020000_store_label_pricing/migration.sql`
- Create: `backend/src/utils/labelPricing.ts`
- Modify: `backend/src/controllers/labels.controller.ts`
- Modify: `backend/src/routes/index.ts`

**Interfaces:**
- Produces: `StoreLabel { id, labelId, storeId, priceText: string | null, printedAt: Date | null, createdAt, updatedAt }`; `resolveEffectivePrice(label: { priceText: string }, storeLabel?: { priceText: string | null } | null): string`; routes `GET /labels`, `GET /labels?myStoreId=X`, `POST /labels`, `PATCH /labels/:labelId`, `DELETE /labels/:labelId`, `GET /store-labels?storeId=X`, `POST /store-labels`, `PATCH /store-labels/:storeLabelId`, `POST /labels/print` (body now `{ items: [{ storeLabelId, quantity }] }`) — every later task (admin/mobile API clients) calls these exact paths/shapes.

- [ ] **Step 1: Update the `Label` model and add `StoreLabel`**

In `backend/prisma/schema.prisma`, find the `Label` model:

```prisma
// Chain-wide catalog, not per-store — the same product/price applies to
// every store. If a store ever needs a different price on one item, that's
// a future per-store override, not modeled here.
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String        // Always the regular unit price, a plain number ("3.99") — $ is added at render time. Always required, always shown.
  dealText         String?       // Optional freeform deal text ("2 for $5", "BOGO"), shown alongside priceText only when present.
  barcode          String?       // the physical product's own barcode (UPC/EAN/etc) for order lookups — independent of priceText/dealText
  category         String?       // freeform, same approval pipeline as Order List/Stock Request (OrderCategory) — not constrained by an enum here
  template         LabelTemplate @default(CLASSIC_RED_BLACK)
  createdByStoreId String?       // which store's employee/manager created this — null for admin-web-created labels. Set once at creation, never changed by edits.
  createdById      String?       // which user created this. Set once at creation, never changed by edits.
  printedAt        DateTime?     // null = ready to print. Set when printed (POST /labels/print); reset to null by any subsequent edit.
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([createdByStoreId, printedAt])
  @@map("labels")
}
```

Replace with:

```prisma
// The chain-wide catalog fact — name, barcode, template, and a BASE price.
// Per-store pricing and per-store print status live on StoreLabel, not
// here — a store's effective price is always
// storeLabel?.priceText ?? label.priceText (see resolveEffectivePrice).
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String        // chain-wide BASE price — what a store sees until it sets its own override
  dealText         String?       // chain-wide only, not store-overridable (see design spec for why)
  barcode          String?       // the physical product's own barcode (UPC/EAN/etc) for order lookups — independent of priceText/dealText
  category         String?       // freeform, same approval pipeline as Order List/Stock Request (OrderCategory) — not constrained by an enum here
  template         LabelTemplate @default(CLASSIC_RED_BLACK)
  createdByStoreId String?       // which store first created this catalog entry — history only, no longer drives print-queue membership
  createdById      String?       // which user created this. Set once at creation, never changed by edits.
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  storeLabels StoreLabel[]

  @@index([createdByStoreId])
  @@map("labels")
}

// One store's own copy of a catalog Label — an optional price override and
// its own independent print status. priceText null = inherit Label's base
// price. printedAt null = this store still needs to print it.
model StoreLabel {
  id        String    @id @default(uuid())
  labelId   String
  storeId   String
  priceText String?
  printedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)
  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@unique([labelId, storeId])
  @@index([storeId, printedAt])
  @@map("store_labels")
}
```

- [ ] **Step 2: Add the reverse relation on `Store`**

In `backend/prisma/schema.prisma`, find (in the `Store` model's relations list):

```prisma
  keywordMappings    StoreKeywordMapping[]
  jobApplications    JobApplication[]
```

Replace with:

```prisma
  keywordMappings    StoreKeywordMapping[]
  jobApplications    JobApplication[]
  storeLabels        StoreLabel[]
```

- [ ] **Step 3: Write the migration — create table, backfill, drop the old column**

Create `backend/prisma/migrations/20260829020000_store_label_pricing/migration.sql`:

```sql
-- gen_random_uuid() is used below for the backfill's generated ids (Prisma
-- normally generates @default(uuid()) ids client-side in JS, so there's no
-- column-level DB default to fall back on for this raw-SQL insert). This
-- extension has never been enabled by a prior migration in this project —
-- CREATE EXTENSION IF NOT EXISTS is idempotent and safe even if the
-- function is already available natively (Postgres 13+ ships it in core).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "store_labels" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "priceText" TEXT,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_labels_labelId_storeId_key" ON "store_labels"("labelId", "storeId");

-- CreateIndex
CREATE INDEX "store_labels_storeId_printedAt_idx" ON "store_labels"("storeId", "printedAt");

-- AddForeignKey
ALTER TABLE "store_labels" ADD CONSTRAINT "store_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_labels" ADD CONSTRAINT "store_labels_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing label created by a store gets that store's own
-- StoreLabel row, carrying over its current printedAt so nothing suddenly
-- looks unprinted. priceText is left NULL (inherit the base) — no store's
-- effective price actually changes as a result of this migration.
INSERT INTO "store_labels" ("id", "labelId", "storeId", "priceText", "printedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "createdByStoreId", NULL, "printedAt", "createdAt", "updatedAt"
FROM "labels"
WHERE "createdByStoreId" IS NOT NULL;

-- AlterTable
ALTER TABLE "labels" DROP COLUMN "printedAt";
```

This single migration mixes an additive part (the new table + backfill) with a destructive one (the `DROP COLUMN`) — matching this project's established pattern (e.g. the `isDeal`→`dealText` migration) for a change that has to land as one atomic unit with its matching code, not staged ahead of time. Do not run `prisma migrate deploy` for this until Steps 4-6 below are also ready to ship in the same push.

- [ ] **Step 4: Add the shared price-resolution helper**

Create `backend/src/utils/labelPricing.ts`:

```ts
export interface LabelBase {
  priceText: string;
}

export interface StoreLabelOverride {
  priceText: string | null;
}

/**
 * A store's effective price for a catalog item: its own override if it has
 * one, otherwise the catalog's base price. The one place this logic lives —
 * every layer that needs an effective price (API responses, print HTML,
 * admin/mobile display) calls this instead of reimplementing the fallback.
 */
export function resolveEffectivePrice(label: LabelBase, storeLabel?: StoreLabelOverride | null): string {
  return storeLabel?.priceText ?? label.priceText;
}
```

- [ ] **Step 5: Rewrite `labels.controller.ts`**

Replace the entire contents of `backend/src/controllers/labels.controller.ts` with:

```ts
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate, Role } from '@prisma/client';
import { audit } from '../utils/audit';
import { resolveEffectivePrice } from '../utils/labelPricing';

function canTouchStore(user: { role: Role; storeIds?: string[] }, storeId: string): boolean {
  if (user.role === Role.DEV_ADMIN || user.role === Role.SUPER_ADMIN) return true;
  return !!user.storeIds?.includes(storeId);
}

const createLabelSchema = z.object({
  productName: z.string().min(1).max(40),
  priceText: z.string().min(1).max(7),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
});

// GET /labels — the global catalog (base price only). ?myStoreId=X is
// explicit client-supplied context (mobile sends its own resolved store;
// admin never sends this — DevAdmin/SuperAdmin have no "own store" to
// infer) — when present, each row is annotated with that store's
// StoreLabel (if any) so a caller can show "already in my queue" inline.
export async function getAllLabels(req: AuthRequest, res: Response) {
  const { myStoreId } = req.query;

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
  if (!canTouchStore(req.user!, storeId)) {
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

  const creatorStoreId = req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.create({
    data: {
      ...parsed.data,
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

  if (!canTouchStore(req.user!, storeId)) {
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
  if (!canTouchStore(req.user!, existing.storeId)) {
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
  const disallowed = rows.some(r => !canTouchStore(req.user!, r.storeId));
  if (disallowed) {
    res.status(403).json({ success: false, error: "You don't have access to one of those stores" });
    return;
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
```

- [ ] **Step 6: Register the new routes**

In `backend/src/routes/index.ts`, find:

```ts
import { getAllLabels, createLabel, updateLabel, deleteLabel, markLabelsPrinted } from '../controllers/labels.controller';
```

Replace with:

```ts
import { getAllLabels, createLabel, updateLabel, deleteLabel, markLabelsPrinted, getStoreLabels, upsertStoreLabel, updateStoreLabel } from '../controllers/labels.controller';
```

Then find:

```ts
router.get   ('/labels',                authenticate, requireRole(Role.EMPLOYEE), getAllLabels);
router.post  ('/labels',                authenticate, requireRole(Role.EMPLOYEE), createLabel);
router.post  ('/labels/print',          authenticate, requireRole(Role.EMPLOYEE), markLabelsPrinted);
router.patch ('/labels/:labelId',       authenticate, requireRole(Role.EMPLOYEE), updateLabel);
router.delete('/labels/:labelId',       authenticate, requireRole(Role.EMPLOYEE), deleteLabel);
```

Replace with:

```ts
router.get   ('/labels',                authenticate, requireRole(Role.EMPLOYEE), getAllLabels);
router.post  ('/labels',                authenticate, requireRole(Role.EMPLOYEE), createLabel);
router.post  ('/labels/print',          authenticate, requireRole(Role.EMPLOYEE), markLabelsPrinted);
router.patch ('/labels/:labelId',       authenticate, requireRole(Role.EMPLOYEE), updateLabel);
router.delete('/labels/:labelId',       authenticate, requireRole(Role.EMPLOYEE), deleteLabel);
router.get   ('/store-labels',          authenticate, requireRole(Role.EMPLOYEE), getStoreLabels);
router.post  ('/store-labels',          authenticate, requireRole(Role.EMPLOYEE), upsertStoreLabel);
router.patch ('/store-labels/:storeLabelId', authenticate, requireRole(Role.EMPLOYEE), updateStoreLabel);
```

- [ ] **Step 7: Regenerate the Prisma client**

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 8: Verify types**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 9: Apply the migration**

This is the point where the migration (Step 3) must be applied — only do this once you are also ready to deploy this task's code (push to `main`), since the `DROP COLUMN` half is destructive and this project has no separate staging database (`admin/.env` and mobile both point at production).

Run: `cd backend && npx prisma migrate deploy`
Expected: `Applying migration 20260829020000_store_label_pricing` then `All migrations have been successfully applied.`

If this fails specifically on the `CREATE EXTENSION IF NOT EXISTS pgcrypto;` line with a permissions error (some managed Postgres hosts restrict extension installation to a superuser role), check whether `gen_random_uuid()` already works without it first (`SELECT gen_random_uuid();` via `npx prisma db execute --stdin` or the host's SQL console) — Postgres 13+ ships it in core with no extension required, so the `CREATE EXTENSION` line is very likely a no-op safety net, not a hard requirement. If it's genuinely blocked and the function isn't natively available, remove that one line and re-run — everything else in the migration is unaffected.

- [ ] **Step 10: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260829020000_store_label_pricing backend/src/utils/labelPricing.ts backend/src/controllers/labels.controller.ts backend/src/routes/index.ts
git commit -m "feat: split Label into chain-wide catalog + per-store StoreLabel pricing/print tracking"
```

Push this commit to `main` promptly after Step 9 (Render auto-deploys on push) — the database and the running backend code must not be out of sync for long, since old code still expects `labels.printedAt` to exist.

---

### Task 2: Admin — API client additions

**Files:**
- Modify: `admin/src/services/api.ts`

**Interfaces:**
- Consumes: `GET /store-labels`, `POST /store-labels`, `PATCH /store-labels/:id`, `POST /labels/print` (Task 1).
- Produces: `labelsApi.getStoreLabels(storeId, unprinted?)`, `labelsApi.addToStore(labelId, storeId, priceText?)`, `labelsApi.updateStoreLabel(storeLabelId, priceText)` — Task 4 (`StoreLabelsPanel.tsx`) calls these exact names.

- [ ] **Step 1: Update `labelsApi`**

In `admin/src/services/api.ts`, find:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  print: (items: { labelId: string; quantity: number }[]) => api.post('/labels/print', { items }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
};
```

Replace with:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  print: (items: { storeLabelId: string; quantity: number }[]) => api.post('/labels/print', { items }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
  getStoreLabels: (storeId: string, unprinted?: boolean) =>
    api.get(`/store-labels?storeId=${encodeURIComponent(storeId)}${unprinted ? '&unprinted=true' : ''}`),
  addToStore: (labelId: string, storeId: string, priceText?: string | null) =>
    api.post('/store-labels', { labelId, storeId, priceText }),
  updateStoreLabel: (storeLabelId: string, priceText: string | null) =>
    api.patch(`/store-labels/${storeLabelId}`, { priceText }),
};
```

- [ ] **Step 2: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: errors in `Labels.tsx` referencing the old `print` shape (`labelId` vs `storeLabelId`) and `printedAt`/`createdByStoreId` filtering — expected at this point, fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add admin/src/services/api.ts
git commit -m "feat: add store-label API client methods, update print() shape"
```

---

### Task 3: Admin — trim `Labels.tsx` to the base catalog view

**Files:**
- Modify: `admin/src/pages/Labels.tsx`

**Interfaces:**
- Consumes: `labelsApi.getAll()` (unchanged shape minus `printedAt`), the `StoreLabelsPanel` component (Task 4 — imported here, `<StoreLabelsPanel />` takes no props).

This task removes everything about store attribution, print status, and printing from this page — those move to `StoreLabelsPanel`. What remains: browse/search/filter the base catalog, add/edit/duplicate/delete base catalog entries.

- [ ] **Step 1: Replace the whole file**

Replace the entire contents of `admin/src/pages/Labels.tsx` with:

```tsx
import { useState, useEffect, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, orderCategoriesApi, scannedProductApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { LABEL_PRESETS } from '../data/labelPresets';
import StoreLabelsPanel from '../components/StoreLabelsPanel';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
}

// Sentinel for the "Uncategorized" filter option — distinct from '' (no filter).
const UNCATEGORIZED = '__uncategorized__';

const TEMPLATE_OPTIONS: { value: string; label: string; accent: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black', accent: '#b91c1c' },
  { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter', accent: '#14532d' },
  { value: 'SUMMER', label: 'Summer', accent: '#ea580c' },
  { value: 'CLEARANCE', label: 'Clearance', accent: '#dc2626' },
  { value: 'INDEPENDENCE_DAY', label: 'Independence Day', accent: '#1e3a8a' },
  { value: 'HALLOWEEN', label: 'Halloween', accent: '#7c3aed' },
  { value: 'PREMIUM', label: 'Premium / Top Shelf', accent: '#b8860b' },
];

const TEMPLATE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_OPTIONS.map(t => [t.value, t.label])
);

export default function Labels() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'catalog' | 'store'>('catalog');
  const [showModal, setShowModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formDealText, setFormDealText] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  const [confirmDelete, setConfirmDelete] = useState<Label | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');

  const nameQuery = formProductName.trim().toLowerCase();
  const suggestions = nameQuery
    ? LABEL_PRESETS.filter(p => p.name.toLowerCase().includes(nameQuery)).slice(0, 8)
    : [];

  function applyPreset(preset: (typeof LABEL_PRESETS)[number]) {
    setFormProductName(preset.name);
    setFormPriceText(preset.priceText.replace(/^\$/, ''));
    setShowSuggestions(false);
  }

  useEffect(() => {
    if (showModal) {
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    }
  }, [showModal]);

  useEffect(() => {
    if (!formCategory.trim()) { setCatSuggs([]); return; }
    const q = formCategory.toLowerCase();
    setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowCatSugg(true);
  }, [formCategory, approvedCats]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labels'],
    queryFn: labelsApi.getAll,
    enabled: viewMode === 'catalog',
  });
  const labels: Label[] = data?.data?.data || [];

  const filteredLabels = labels.filter(l => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchesName = l.productName.toLowerCase().includes(q);
      const matchesBarcode = !!l.barcode && l.barcode.toLowerCase().includes(q);
      if (!matchesName && !matchesBarcode) return false;
    }
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter && l.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const availableCategories = Array.from(
    new Set(labels.map(l => l.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = labels.some(l => !l.category);

  const saveMutation = useMutation({
    mutationFn: () => {
      const category = formCategory.trim() || null;
      const barcode = formBarcode.trim() || null;
      if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
        orderCategoriesApi.submitNew(category).catch(() => {});
      }
      if (barcode) {
        scannedProductApi.save({ barcode, name: formProductName.trim(), category: category || undefined }).catch(() => {});
      }
      return editingLabel
        ? labelsApi.update(editingLabel.id, { productName: formProductName.trim(), priceText: formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate })
        : labelsApi.create({ productName: formProductName.trim(), priceText: formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['store-labels'] });
      toast.success(editingLabel ? 'Label updated' : 'Label added');
      if (editingLabel) toast('Affected stores were flagged to reprint', { icon: '🔄' });
      closeModal();
    },
    onError: (e: any) => {
      const err = e.response?.data?.error;
      toast.error(typeof err === 'string' ? err : 'Failed to save label');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.delete(labelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toast.success('Label removed');
      setConfirmDelete(null);
    },
    onError: (e: any) => {
      const err = e.response?.data?.error;
      toast.error(typeof err === 'string' ? err : 'Failed to remove label');
    },
  });

  function openAddModal() {
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode('');
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowModal(true);
  }

  function openEditModal(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setFormBarcode(label.barcode || '');
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setShowModal(true);
  }

  function duplicateLabel(label: Label) {
    setEditingLabel(null);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setFormBarcode(label.barcode || '');
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode('');
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
  }

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmDelete}
        title="Remove Label"
        message={`Remove the label for "${confirmDelete?.productName}"? It will no longer appear in any store's catalog.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id); }}
        onCancel={() => setConfirmDelete(null)}
      />

      {showModal && (
        <div style={m.overlay} onClick={closeModal}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <div style={m.header}>
              <h2 style={m.title}>{editingLabel ? 'Edit Label' : 'Add Label'}</h2>
              <button style={m.closeBtn} onClick={closeModal}>✕</button>
            </div>
            <div style={m.form}>
              <div style={m.label}>Product Name *</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={formProductName}
                  onChange={e => { setFormProductName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. Monster Energy 16oz"
                  maxLength={40}
                  autoComplete="off"
                  autoFocus
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={m.sugg}>
                    {suggestions.map(p => (
                      <div key={p.name} style={m.suggRow} onMouseDown={() => applyPreset(p)}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span style={m.suggPrice}>{p.priceText}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={m.label}>Base Price *</div>
              <div style={m.priceInputWrap}>
                <span style={m.priceInputDollar}>$</span>
                <input
                  style={{ ...m.input, ...m.priceInput }}
                  value={formPriceText}
                  onChange={e => setFormPriceText(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="3.99"
                  inputMode="decimal"
                  maxLength={7}
                />
              </div>
              {editingLabel && (
                <div style={m.hint}>Editing this flags every store still using the base price to reprint. A store with its own price override is unaffected.</div>
              )}
              <div style={m.label}>Deal (optional, chain-wide)</div>
              <input
                style={m.input}
                value={formDealText}
                onChange={e => setFormDealText(e.target.value)}
                placeholder='e.g. "2 for $5" or "BOGO" - shown alongside the price above'
                maxLength={20}
              />
              <div style={m.label}>Barcode (optional)</div>
              <input
                style={m.input}
                value={formBarcode}
                onChange={e => setFormBarcode(e.target.value)}
                placeholder="Scan or type the product's UPC/EAN - for order lookups, not tied to the price/deal above"
                maxLength={40}
              />
              <div style={m.label}>Category (optional)</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={formCategory}
                  onChange={e => { setFormCategory(e.target.value); setShowCatSugg(true); }}
                  onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowCatSugg(false), 150)}
                  placeholder="e.g. Groceries, Frozen Foods…"
                  maxLength={100}
                  autoComplete="off"
                />
                {showCatSugg && catSuggs.length > 0 && (
                  <div style={m.sugg}>
                    {catSuggs.map(c => (
                      <div key={c} style={m.suggRow} onMouseDown={() => { setFormCategory(c); setShowCatSugg(false); }}>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={m.label}>Template</div>
              <div style={m.templateRow}>
                {TEMPLATE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    style={{ ...m.templateChip, ...(formTemplate === t.value ? m.templateChipActive : {}) }}
                    onClick={() => setFormTemplate(t.value)}
                  >
                    <span style={{ ...m.templateSwatch, background: t.accent }} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={m.actions}>
                <button style={m.cancelBtn} onClick={closeModal}>Cancel</button>
                <button
                  style={{ ...m.saveBtn, ...(!formProductName.trim() || !formPriceText.trim() || saveMutation.isPending ? m.saveBtnDim : {}) }}
                  onClick={() => saveMutation.mutate()}
                  disabled={!formProductName.trim() || !formPriceText.trim() || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Label'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.inner}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>🏷️ Labels</h1>
            <p style={s.pageSub}>
              {viewMode === 'catalog' ? 'Chain-wide catalog and base prices.' : 'Per-store pricing, overrides, and printing.'}
            </p>
          </div>
          {viewMode === 'catalog' && (
            <button style={s.addBtn} onClick={openAddModal}>+ Add Label</button>
          )}
        </div>

        <div style={s.viewToggleRow}>
          <button
            type="button"
            style={{ ...s.viewToggleChip, ...(viewMode === 'catalog' ? s.viewToggleChipActive : {}) }}
            onClick={() => setViewMode('catalog')}
          >
            Catalog
          </button>
          <button
            type="button"
            style={{ ...s.viewToggleChip, ...(viewMode === 'store' ? s.viewToggleChipActive : {}) }}
            onClick={() => setViewMode('store')}
          >
            By Store
          </button>
        </div>

        {viewMode === 'store' ? (
          <StoreLabelsPanel />
        ) : (
          <>
            {!isError && !isLoading && labels.length > 0 && (
              <div style={s.filterRow}>
                <input
                  style={s.searchInput}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by product name or barcode…"
                />
                {(availableCategories.length > 0 || hasUncategorized) && (
                  <select style={s.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                    <option value="">All Categories</option>
                    {availableCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                    {hasUncategorized && <option value={UNCATEGORIZED}>Uncategorized</option>}
                  </select>
                )}
              </div>
            )}

            {isError ? (
              <ErrorState message="Failed to load labels." onRetry={refetch} />
            ) : isLoading ? (
              <TableSkeleton columns={7} />
            ) : labels.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>🏷️</div>
                <div style={s.emptyTitle}>No labels yet</div>
                <div style={s.emptySub}>Add a label to start building the catalog</div>
              </div>
            ) : filteredLabels.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>🔍</div>
                <div style={s.emptyTitle}>No labels match your filters</div>
                <div style={s.emptySub}>Try clearing the search or category filter</div>
              </div>
            ) : (
              <div style={s.tableWrap}>
                <Table style={s.table}>
                  <TableHeader>
                    <TableRow>
                      {['Product', 'Category', 'Base Price / Deal', 'Template', 'Updated', 'Actions'].map(h => (
                        <TableHead key={h} style={s.th}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLabels.map((label, i) => (
                      <TableRow key={label.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                        <TableCell style={s.td}>
                          <span style={s.itemName}>{label.productName}</span>
                          {label.barcode && <span style={s.barcodeBadge} title={`Barcode: ${label.barcode}`}>|||| {label.barcode}</span>}
                        </TableCell>
                        <TableCell style={s.td}>
                          {label.category ? label.category : <span style={{ color: TEXT_MUTED }}> - </span>}
                        </TableCell>
                        <TableCell style={s.td}>
                          ${label.priceText}
                          {label.dealText && <span style={s.dealBadge}>{label.dealText}</span>}
                        </TableCell>
                        <TableCell style={s.td}>{TEMPLATE_LABELS[label.template] || label.template}</TableCell>
                        <TableCell style={s.td}>{new Date(label.updatedAt).toLocaleDateString()}</TableCell>
                        <TableCell style={s.td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={s.editBtn} onClick={() => openEditModal(label)}>Edit</button>
                            <button style={s.duplicateBtn} onClick={() => duplicateLabel(label)}>Duplicate</button>
                            <button style={s.deleteBtn} onClick={() => setConfirmDelete(label)}>Delete</button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6fb', padding: '32px 0' },
  inner: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  pageTitle: { fontSize: 26, fontWeight: 900, color: '#1D3557', margin: 0 },
  pageSub: { color: TEXT_MUTED, marginTop: 4, fontSize: 14 },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#1D3557', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },

  viewToggleRow: { display: 'flex', gap: 8 },
  viewToggleChip: {
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd', borderRadius: 20, padding: '8px 16px',
    fontSize: 13, fontWeight: 700, color: '#444', background: '#fff', cursor: 'pointer',
  },
  viewToggleChipActive: { borderColor: '#1D3557', background: '#eff6ff', color: '#1D3557' },

  filterRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  searchInput: {
    flex: '1 1 240px', minWidth: 200, border: '1.5px solid #ddd', borderRadius: 10,
    padding: '9px 14px', fontSize: 14, outline: 'none',
  },
  filterSelect: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 12px',
    fontSize: 14, background: '#fff', color: '#333', cursor: 'pointer',
  },

  tableWrap: {
    background: '#fff', borderRadius: 14, overflowX: 'auto',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eee',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle', fontSize: 14 },
  itemName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  barcodeBadge: { display: 'block', fontSize: 11, color: TEXT_MUTED, fontFamily: 'monospace', marginTop: 2 },
  dealBadge: { display: 'block', fontSize: 12, fontWeight: 600, color: '#b7791f', marginTop: 2 },
  editBtn: {
    background: '#eff6ff', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  duplicateBtn: {
    background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  deleteBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },

  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
    maxHeight: '90vh', overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #eee',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#1D3557' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#333', marginTop: 6 },
  hint: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  templateRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  templateChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1.5px solid #ddd', borderRadius: 20,
    padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#444',
    background: '#fff', cursor: 'pointer',
  },
  templateChipActive: { borderColor: '#1D3557', background: '#eff6ff', color: '#1D3557' },
  templateSwatch: { width: 10, height: 10, borderRadius: 5, display: 'inline-block' },
  priceInputWrap: { position: 'relative' as const },
  priceInputDollar: {
    position: 'absolute' as const, left: 14, top: '50%', transform: 'translateY(-50%)',
    fontSize: 15, fontWeight: 700, color: '#667', pointerEvents: 'none' as const,
  },
  priceInput: { paddingLeft: 26 },
  sugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
    border: '1.5px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
  },
  suggRow: {
    padding: '10px 14px', cursor: 'pointer', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', fontSize: 14,
    borderBottom: '1px solid #f8fafc', transition: 'background 0.1s',
  },
  suggPrice: { fontSize: 13, color: TEXT_MUTED, marginLeft: 8, whiteSpace: 'nowrap' as const },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 },
  cancelBtn: {
    background: '#f4f4f4', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444',
  },
  saveBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};
```

Note this file now imports `StoreLabelsPanel` from `../components/StoreLabelsPanel`, which doesn't exist yet — Task 4 creates it. `tsc` will fail until then; that's expected.

- [ ] **Step 2: Commit**

```bash
git add admin/src/pages/Labels.tsx
git commit -m "refactor: trim admin Labels.tsx to the base-catalog view, add Catalog/By Store toggle"
```

---

### Task 4: Admin — `StoreLabelsPanel.tsx` (per-store pricing and printing)

**Files:**
- Create: `admin/src/components/StoreLabelsPanel.tsx`

**Interfaces:**
- Consumes: `labelsApi.getStoreLabels`, `labelsApi.addToStore`, `labelsApi.updateStoreLabel`, `labelsApi.print` (Task 2), `storesApi.getAccessible()` (already exists, unchanged), `printLabels`/`PrintableLabelEntry` (`admin/src/utils/printLabels.ts`, already exists, unchanged — takes `{ label, quantity }[]` where `label.priceText` is whatever string you pass it).

- [ ] **Step 1: Create the component**

Create `admin/src/components/StoreLabelsPanel.tsx`:

```tsx
import { useState, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, storesApi } from '../services/api';
import ConfirmModal from './ConfirmModal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import TableSkeleton from './TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';

interface StoreLabel {
  id: string;
  storeLabelId: string | null;
  productName: string;
  barcode: string | null;
  category: string | null;
  template: string;
  basePriceText: string;
  dealText: string | null;
  priceText: string;
  hasOverride: boolean;
  printedAt: string | null;
  updatedAt: string;
}

export default function StoreLabelsPanel() {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingPrice, setEditingPrice] = useState<StoreLabel | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [pendingBulkPrint, setPendingBulkPrint] = useState<PrintableLabelEntry[] | null>(null);

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: () => storesApi.getAccessible(),
  });
  const stores: any[] = storesData?.data?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['store-labels', storeId],
    queryFn: () => labelsApi.getStoreLabels(storeId),
    enabled: !!storeId,
  });
  const items: StoreLabel[] = data?.data?.data || [];

  const addMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.addToStore(labelId, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Added at the base price');
    },
    onError: () => toast.error('Failed to add'),
  });

  const priceMutation = useMutation({
    mutationFn: () =>
      editingPrice!.storeLabelId
        ? labelsApi.updateStoreLabel(editingPrice!.storeLabelId, priceDraft.trim())
        : labelsApi.addToStore(editingPrice!.id, storeId, priceDraft.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Price updated for this store');
      setEditingPrice(null);
    },
    onError: () => toast.error('Failed to update price'),
  });

  const revertMutation = useMutation({
    mutationFn: (storeLabelId: string) => labelsApi.updateStoreLabel(storeLabelId, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Reverted to base price');
    },
    onError: () => toast.error('Failed to revert'),
  });

  function toggleSelected(item: StoreLabel) {
    if (!item.storeLabelId) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.storeLabelId!)) next.delete(item.storeLabelId!);
      else next.add(item.storeLabelId!);
      return next;
    });
    setQuantities(prev => {
      if (prev[item.storeLabelId!] !== undefined) {
        const next = { ...prev };
        delete next[item.storeLabelId!];
        return next;
      }
      return { ...prev, [item.storeLabelId!]: 1 };
    });
  }

  function setQuantity(storeLabelId: string, qty: number) {
    setQuantities(prev => ({ ...prev, [storeLabelId]: Math.max(1, Math.min(999, qty || 1)) }));
  }

  const totalCopies = [...selectedIds].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  function buildPrintEntries(): PrintableLabelEntry[] {
    return items
      .filter(i => i.storeLabelId && selectedIds.has(i.storeLabelId))
      .map(i => ({
        label: {
          id: i.id, productName: i.productName, priceText: i.priceText,
          dealText: i.dealText, barcode: i.barcode, template: i.template,
        },
        quantity: quantities[i.storeLabelId!] ?? 1,
      }));
  }

  function runPrint(entries: PrintableLabelEntry[]) {
    const opened = printLabels(entries);
    if (opened) {
      const printItems = entries.map(e => {
        const source = items.find(i => i.id === e.label.id)!;
        return { storeLabelId: source.storeLabelId!, quantity: e.quantity };
      });
      labelsApi.print(printItems).catch(() => {});
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      setSelectedIds(new Set());
      setQuantities({});
    }
  }

  function handlePrintSelected() {
    const entries = buildPrintEntries();
    if (entries.length === 0) return;
    if (entries.length > 5) {
      setPendingBulkPrint(entries);
      return;
    }
    runPrint(entries);
  }

  return (
    <div style={s.wrap}>
      <ConfirmModal
        open={!!pendingBulkPrint}
        title="Print This Many Labels?"
        message={pendingBulkPrint ? `You're about to print ${pendingBulkPrint.length} labels (${pendingBulkPrint.reduce((sum, e) => sum + e.quantity, 0)} total copies) for this store. Continue?` : ''}
        confirmLabel="Print"
        onConfirm={() => { if (pendingBulkPrint) runPrint(pendingBulkPrint); setPendingBulkPrint(null); }}
        onCancel={() => setPendingBulkPrint(null)}
      />

      {editingPrice && (
        <div style={m.overlay} onClick={() => setEditingPrice(null)}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <h3 style={m.title}>Price at {stores.find(st => st.id === storeId)?.name}</h3>
            <p style={m.sub}>{editingPrice.productName} — base price ${editingPrice.basePriceText}</p>
            <div style={m.priceInputWrap}>
              <span style={m.priceInputDollar}>$</span>
              <input
                style={m.input}
                value={priceDraft}
                onChange={e => setPriceDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={editingPrice.basePriceText}
                autoFocus
              />
            </div>
            <div style={m.actions}>
              <button style={m.cancelBtn} onClick={() => setEditingPrice(null)}>Cancel</button>
              <button
                style={{ ...m.saveBtn, ...(!priceDraft.trim() ? m.saveBtnDim : {}) }}
                disabled={!priceDraft.trim() || priceMutation.isPending}
                onClick={() => priceMutation.mutate()}
              >
                {priceMutation.isPending ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={s.pickerRow}>
        <select style={s.storeSelect} value={storeId} onChange={e => { setStoreId(e.target.value); setSelectedIds(new Set()); setQuantities({}); }}>
          <option value="">Choose a store…</option>
          {stores.map((st: any) => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
        {storeId && (
          <button
            style={{ ...s.printBtn, ...(selectedIds.size === 0 ? s.printBtnDim : {}) }}
            onClick={handlePrintSelected}
            disabled={selectedIds.size === 0}
          >
            🖨️ Print Selected ({totalCopies})
          </button>
        )}
      </div>

      {!storeId ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏪</div>
          <div style={s.emptyTitle}>Pick a store</div>
          <div style={s.emptySub}>See every catalog item's price and print status at that store</div>
        </div>
      ) : isLoading ? (
        <TableSkeleton columns={6} />
      ) : items.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏷️</div>
          <div style={s.emptyTitle}>The catalog is empty</div>
          <div style={s.emptySub}>Add a label from the Catalog tab first</div>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                {['', 'Product', 'Price', 'Qty', 'Status', 'Actions'].map(h => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                  <TableCell style={s.td}>
                    {item.storeLabelId && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.storeLabelId)}
                        onChange={() => toggleSelected(item)}
                      />
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    <span style={s.itemName}>{item.productName}</span>
                  </TableCell>
                  <TableCell style={s.td}>
                    ${item.priceText}
                    {item.hasOverride && <span style={s.overrideBadge}>override</span>}
                  </TableCell>
                  <TableCell style={s.td}>
                    {item.storeLabelId && selectedIds.has(item.storeLabelId) && (
                      <input
                        type="number"
                        min={1}
                        max={999}
                        style={s.qtyInput}
                        value={quantities[item.storeLabelId] ?? 1}
                        onChange={e => setQuantity(item.storeLabelId!, parseInt(e.target.value, 10))}
                      />
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    {!item.storeLabelId ? (
                      <span style={{ color: TEXT_MUTED }}>Not added</span>
                    ) : item.printedAt ? (
                      <span style={s.printedBadge}>✓ Printed</span>
                    ) : (
                      <span style={s.readyBadge}>Ready to Print</span>
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!item.storeLabelId ? (
                        <button style={s.addBtn} onClick={() => addMutation.mutate(item.id)}>Add at ${item.basePriceText}</button>
                      ) : (
                        <button style={s.editBtn} onClick={() => { setEditingPrice(item); setPriceDraft(item.hasOverride ? item.priceText : ''); }}>
                          Set Price
                        </button>
                      )}
                      {item.hasOverride && item.storeLabelId && (
                        <button style={s.revertBtn} onClick={() => revertMutation.mutate(item.storeLabelId!)}>Use Base</button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  pickerRow: { display: 'flex', gap: 10, alignItems: 'center' },
  storeSelect: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 14px',
    fontSize: 14, background: '#fff', color: '#333', cursor: 'pointer', minWidth: 220,
  },
  printBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#0f5132', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  printBtnDim: { opacity: 0.5, cursor: 'not-allowed' },

  tableWrap: {
    background: '#fff', borderRadius: 14, overflowX: 'auto',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eee',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle', fontSize: 14 },
  itemName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  overrideBadge: {
    marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 6px',
  },
  printedBadge: { fontSize: 13, fontWeight: 600, color: '#0f5132' },
  readyBadge: { fontSize: 13, fontWeight: 600, color: '#b7791f' },
  qtyInput: {
    width: 52, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #ddd',
    fontSize: 14, textAlign: 'center' as const,
  },
  addBtn: {
    background: '#eff6ff', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  editBtn: {
    background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  revertBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },

  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 380,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 800, color: '#1D3557' },
  sub: { fontSize: 13, color: TEXT_MUTED, marginTop: 4, marginBottom: 16 },
  priceInputWrap: { position: 'relative' as const },
  priceInputDollar: {
    position: 'absolute' as const, left: 14, top: '50%', transform: 'translateY(-50%)',
    fontSize: 15, fontWeight: 700, color: '#667', pointerEvents: 'none' as const,
  },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10, paddingLeft: 26,
    padding: '10px 14px 10px 26px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: {
    background: '#f4f4f4', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444',
  },
  saveBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};
```

- [ ] **Step 2: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

Run the admin dev server (`cd admin && npm run dev`), log in as DevAdmin/SuperAdmin, open Labels. Confirm the Catalog tab shows the base catalog with no store/status columns. Switch to "By Store," pick a store, confirm every catalog item appears with a resolved price (base, since nothing has an override yet), "Add at $X.XX" works, "Set Price" opens the override modal and saving shows the override badge, "Use Base" reverts it, and selecting + printing works.

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/StoreLabelsPanel.tsx
git commit -m "feat: add admin per-store pricing/printing panel"
```

---

### Task 5: Mobile — API client additions

**Files:**
- Modify: `mobile/services/api.ts`

**Interfaces:**
- Consumes: same backend routes as Task 2.
- Produces: `labelsApi.getStoreLabels(storeId, unprinted?)`, `labelsApi.getAllWithMyStore(storeId?)`, `labelsApi.addToStore(labelId, storeId, priceText?)`, `labelsApi.updateStoreLabel(storeLabelId, priceText)` — Task 6/7 call these exact names.

- [ ] **Step 1: Update `labelsApi`**

In `mobile/services/api.ts`, find:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  getReadyToPrint: (storeId: string) => api.get(`/labels?storeId=${encodeURIComponent(storeId)}&unprinted=true`),
  create: (data: { productName: string; priceText: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  print: (items: { labelId: string; quantity: number }[]) => api.post('/labels/print', { items }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
};
```

Replace with:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  getAllWithMyStore: (myStoreId?: string) =>
    api.get(`/labels${myStoreId ? `?myStoreId=${encodeURIComponent(myStoreId)}` : ''}`),
  getStoreLabels: (storeId: string, unprinted?: boolean) =>
    api.get(`/store-labels?storeId=${encodeURIComponent(storeId)}${unprinted ? '&unprinted=true' : ''}`),
  addToStore: (labelId: string, storeId: string, priceText?: string | null) =>
    api.post('/store-labels', { labelId, storeId, priceText }),
  updateStoreLabel: (storeLabelId: string, priceText: string | null) =>
    api.patch(`/store-labels/${storeLabelId}`, { priceText }),
  create: (data: { productName: string; priceText: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; dealText?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  print: (items: { storeLabelId: string; quantity: number }[]) => api.post('/labels/print', { items }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
};
```

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: errors in `LabelsScreen.tsx` (old `getReadyToPrint`/`print` shapes) — expected, fixed in Tasks 6-7.

- [ ] **Step 3: Commit**

```bash
git add mobile/services/api.ts
git commit -m "feat: add store-label API client methods on mobile"
```

---

### Task 6: Mobile — Catalog view (browse + add, no inline print/qty)

**Files:**
- Modify: `mobile/components/LabelsScreen.tsx`

**Interfaces:**
- Consumes: `labelsApi.getAllWithMyStore`, `labelsApi.addToStore` (Task 5), `useCurrentStoreId` (`mobile/utils/geo.ts`, existing, unchanged), `storesApi.getAll()` (existing, unchanged).

This task and Task 7 together replace the whole file. Doing it as one task would make a single step too large to review — this task handles store resolution + the Catalog view; Task 7 handles My Prints + the print flow. Both steps below edit the same file; do them in order.

- [ ] **Step 1: Add store resolution and switch the Catalog data source**

In `mobile/components/LabelsScreen.tsx`, find:

```ts
import { labelsApi, storesApi, orderCategoriesApi, scannedProductApi } from '../services/api';
import { COLORS } from '../constants';
import { TagIcon, XIcon, CheckCircleIcon, EditIcon, CameraIcon, FilterIcon } from './Icons';
import BarcodeScannerModal, { BarcodeResult } from './BarcodeScannerModal';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import { useAuthStore } from '../store/authStore';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
}
```

Replace with:

```ts
import { labelsApi, storesApi, orderCategoriesApi, scannedProductApi } from '../services/api';
import { COLORS } from '../constants';
import { TagIcon, XIcon, CheckCircleIcon, EditIcon, CameraIcon, FilterIcon, PlusIcon } from './Icons';
import BarcodeScannerModal, { BarcodeResult } from './BarcodeScannerModal';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import { useAuthStore } from '../store/authStore';
import { useCurrentStoreId } from '../utils/geo';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
  // Only present in responses from getAllWithMyStore(storeId) when a
  // storeId was actually supplied — absent (not just null) otherwise, e.g.
  // when no store has resolved yet. Always check truthiness, not `!== null`.
  myStoreLabel?: { effectivePrice: string; printedAt: string | null } | null;
}

interface StoreLabelItem {
  id: string;
  storeLabelId: string | null;
  productName: string;
  barcode: string | null;
  category: string | null;
  template: string;
  basePriceText: string;
  dealText: string | null;
  priceText: string;
  hasOverride: boolean;
  printedAt: string | null;
  updatedAt: string;
}
```

`PlusIcon` already exists in `mobile/components/Icons.tsx` (line 377) — no change needed there.

Next, find:

```tsx
export default function LabelsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const accentColor = user?.role === 'STORE_MANAGER' ? COLORS.managerPrimary : COLORS.secondary;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showScanner, setShowScanner] = useState(false);
```

Replace with:

```tsx
export default function LabelsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const accentColor = user?.role === 'STORE_MANAGER' ? COLORS.managerPrimary : COLORS.secondary;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [manualStoreId, setManualStoreId] = useState<string | undefined>(undefined);
  const [addSheetItem, setAddSheetItem] = useState<Label | null>(null);
  const [addSheetPriceMode, setAddSheetPriceMode] = useState<'base' | 'custom'>('base');
  const [addSheetPrice, setAddSheetPrice] = useState('');
```

Next, find:

```ts
  const storeId = user?.storeIds?.[0];

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mobile-labels', viewMode, storeId],
    queryFn: () =>
      viewMode === 'ready' && storeId
        ? labelsApi.getReadyToPrint(storeId)
        : labelsApi.getAll(),
  });
  const labels: Label[] = data?.data?.data || [];

  // Unfiltered catalog query, used only for barcode-dedupe lookup and name
  // autocomplete — the view-scoped `labels` above only contains this store's
  // unprinted labels in "Ready to Print" mode, which would otherwise miss
  // already-printed labels and cause re-scans to create duplicates.
  const { data: catalogData } = useQuery({
    queryKey: ['mobile-labels', 'catalog-all'],
    queryFn: labelsApi.getAll,
  });
  const allLabels: Label[] = catalogData?.data?.data || [];
```

Replace with:

```ts
  const { data: storesListData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });
  const allStores: any[] = storesListData?.data?.data || [];

  const resolvedStoreId = useCurrentStoreId(allStores, user?.storeIds);
  const storeId = manualStoreId ?? resolvedStoreId;

  // Every catalog item, annotated with this store's own StoreLabel (if any)
  // when a store is known — powers both the Catalog view's "already added"
  // status and the dedupe/autocomplete lookups below.
  const { data: catalogData } = useQuery({
    queryKey: ['mobile-labels', 'catalog-all', storeId],
    queryFn: () => labelsApi.getAllWithMyStore(storeId),
  });
  const allLabels: Label[] = catalogData?.data?.data || [];

  const { data: myPrintsData, isLoading: myPrintsLoading, refetch: refetchMyPrints, isRefetching: myPrintsRefetching } = useQuery({
    queryKey: ['store-labels', storeId, 'unprinted'],
    queryFn: () => labelsApi.getStoreLabels(storeId!, true),
    enabled: !!storeId,
  });
  const myPrints: StoreLabelItem[] = myPrintsData?.data?.data || [];

  const isLoading = viewMode === 'ready' ? myPrintsLoading : false;
  const isRefetching = viewMode === 'ready' ? myPrintsRefetching : false;
  const labels: Label[] = viewMode === 'catalog' ? allLabels : [];
  const refetch = viewMode === 'ready' ? refetchMyPrints : (() => qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] }));
```

This introduces `viewMode` before its own declaration further down the file — the next step moves it up. Continue to Step 2 before running `tsc`.

- [ ] **Step 2: Move `viewMode` above its first use, and add the "add to my prints" mutation**

Find:

```ts
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [viewMode, setViewMode] = useState<'ready' | 'catalog'>('ready');
  const [search, setSearch] = useState('');
```

Replace with:

```ts
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [search, setSearch] = useState('');
```

(Removing it from here — it moves earlier.) Now find the block just added in Step 1 that starts with `const { data: storesListData }` and insert `viewMode`'s declaration immediately before it:

```ts
  const [viewMode, setViewMode] = useState<'ready' | 'catalog'>('ready');

  const { data: storesListData } = useQuery({
```

Next, add the add-to-store mutation. Find:

```ts
  function applyNameSuggestion(label: Label) {
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setShowNameSugg(false);
  }
```

Replace with:

```ts
  function applyNameSuggestion(label: Label) {
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setShowNameSugg(false);
  }

  function openAddSheet(label: Label) {
    setAddSheetItem(label);
    setAddSheetPriceMode('base');
    setAddSheetPrice('');
  }

  async function confirmAddToMyPrints() {
    if (!addSheetItem || !storeId) return;
    const priceText = addSheetPriceMode === 'custom' ? addSheetPrice.trim() || null : null;
    try {
      await labelsApi.addToStore(addSheetItem.id, storeId, priceText);
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      await qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] });
      Toast.show({ type: 'success', text1: 'Added to My Prints' });
      setAddSheetItem(null);
    } catch (err: any) {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : 'Failed to add' });
    }
  }
```

- [ ] **Step 3: Verify (partial — Task 7 finishes the rework)**

Run: `cd mobile && npx tsc --noEmit`
Expected: errors referencing `printedAt`/`createdByStoreId` filtering further down the file, `handlePrint`/`runPrint` still using the old `Label[]`/`labelId` shape, and the render section's catalog-grouping/print-footer logic — all expected, all fixed in Task 7 (which edits the render section and print handlers of this same file).

- [ ] **Step 4: Commit**

```bash
git add mobile/components/LabelsScreen.tsx
git commit -m "feat: mobile Labels — resolve own store, fetch catalog with per-store status"
```

---

### Task 7: Mobile — My Prints view, print flow, and render section rework

**Files:**
- Modify: `mobile/components/LabelsScreen.tsx`

**Interfaces:**
- Consumes: everything from Task 6 (`storeId`, `myPrints`, `allLabels`, `openAddSheet`, `confirmAddToMyPrints`, `addSheetItem`/`addSheetPriceMode`/`addSheetPrice`).

- [ ] **Step 1: Remove the dead `storesData`/`storeNameById` query and rewrite filtering/selection logic**

Task 6 already added a `storesListData`/`allStores` query (used for `useCurrentStoreId` and the manual store picker) under the same `['stores']` query key. The *original* `storesData`/`storeNameById` pair — previously used only to label the Full Catalog SectionList's store-group headers, which this step also removes — becomes dead code and duplicates a query React Query already has cached under an identical key. This one find/replace removes that dead block and replaces the whole old filtering/selection/grouping section with the new Catalog-vs-My-Prints logic in a single pass. Find:

```ts
  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });
  const storeNameById: Record<string, string> = Object.fromEntries(
    (storesData?.data?.data || []).map((st: any) => [st.id, st.name])
  );

  const filteredLabels = labels.filter(l => {
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter) {
      if (l.category !== categoryFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.productName.toLowerCase().includes(q) || (!!l.barcode && l.barcode.toLowerCase().includes(q));
  });

  // Category chips reflect what's actually present in the current view
  // (Ready to Print vs Full Catalog), not every category in the system.
  const availableCategories = Array.from(
    new Set(labels.map(l => l.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = labels.some(l => !l.category);

  const allFilteredSelected = filteredLabels.length > 0 && filteredLabels.every(l => selectedIds.has(l.id));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredLabels.forEach(l => next.delete(l.id));
      else filteredLabels.forEach(l => next.add(l.id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      if (allFilteredSelected) filteredLabels.forEach(l => { delete next[l.id]; });
      else filteredLabels.forEach(l => { if (!(l.id in next)) next[l.id] = 1; });
      return next;
    });
  }

  // Full Catalog spans every store — group it so staff aren't scrolling past
  // other stores' items to find their own. Ready to Print is already scoped
  // to just this store, so grouping would be a no-op there.
  const catalogSections = viewMode === 'catalog'
    ? Object.entries(
        filteredLabels.reduce((groups: Record<string, Label[]>, l) => {
          const key = l.createdByStoreId ? (storeNameById[l.createdByStoreId] || 'Unknown Store') : 'Admin Web';
          (groups[key] = groups[key] || []).push(l);
          return groups;
        }, {})
      )
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([title, data]) => ({ title, data }))
    : [];
```

Replace with:

```ts
  const filteredCatalog = allLabels.filter(l => {
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter) {
      if (l.category !== categoryFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.productName.toLowerCase().includes(q) || (!!l.barcode && l.barcode.toLowerCase().includes(q));
  });

  const filteredMyPrints = myPrints.filter(l => {
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter) {
      if (l.category !== categoryFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.productName.toLowerCase().includes(q) || (!!l.barcode && l.barcode.toLowerCase().includes(q));
  });

  // Category chips reflect what's actually present in the current view.
  const availableCategories = Array.from(
    new Set((viewMode === 'catalog' ? allLabels : myPrints).map(l => l.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = (viewMode === 'catalog' ? allLabels : myPrints).some(l => !l.category);

  const allFilteredSelected = filteredMyPrints.length > 0 && filteredMyPrints.every(l => l.storeLabelId && selectedIds.has(l.storeLabelId));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const ids = filteredMyPrints.map(l => l.storeLabelId).filter((id): id is string => !!id);
      if (allFilteredSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      const ids = filteredMyPrints.map(l => l.storeLabelId).filter((id): id is string => !!id);
      if (allFilteredSelected) ids.forEach(id => { delete next[id]; });
      else ids.forEach(id => { if (!(id in next)) next[id] = 1; });
      return next;
    });
  }
```

- [ ] **Step 2: Rewrite the print handlers**

Find:

```ts
  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setQuantities(prev => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
  }

  function setQuantity(id: string, qty: number) {
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, Math.min(999, qty || 1)) }));
  }

  const totalCopies = [...selectedIds].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  async function runPrint(toPrint: Label[], shareAsPdf: boolean) {
    setPrinting(true);
    try {
      const entries: PrintableLabelEntry[] = toPrint.map(label => ({ label, quantity: quantities[label.id] ?? 1 }));
      await printLabels({ entries, shareAsPdf });
      labelsApi.print(entries.map(e => ({ labelId: e.label.id, quantity: e.quantity }))).catch(() => {});
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      setSelectedIds(new Set());
      setQuantities({});
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }

  function handlePrint(shareAsPdf: boolean) {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0 || printing) return;
    // The Full Catalog view (unlike Ready to Print) can include labels
    // scanned in by a different store — printing one marks it printed
    // chain-wide, immediately dropping it out of that other store's own
    // Ready to Print queue. Warn before doing that by accident; still fully
    // allowed if it's intentional (e.g. reprinting a shared item on
    // someone's behalf).
    const otherStoreCount = toPrint.filter(l => l.createdByStoreId && l.createdByStoreId !== storeId).length;
    if (otherStoreCount > 0) {
      Alert.alert(
        otherStoreCount === 1 ? '1 label is from another store' : `${otherStoreCount} labels are from other stores`,
        "Printing will mark them printed and remove them from that store's own Ready to Print queue. Continue?",
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Print Anyway', onPress: () => runPrint(toPrint, shareAsPdf) },
        ]
      );
      return;
    }
    runPrint(toPrint, shareAsPdf);
  }
```

Replace with:

```ts
  function toggleSelected(storeLabelId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(storeLabelId)) next.delete(storeLabelId); else next.add(storeLabelId);
      return next;
    });
    setQuantities(prev => {
      if (prev[storeLabelId] !== undefined) {
        const next = { ...prev };
        delete next[storeLabelId];
        return next;
      }
      return { ...prev, [storeLabelId]: 1 };
    });
  }

  function setQuantity(storeLabelId: string, qty: number) {
    setQuantities(prev => ({ ...prev, [storeLabelId]: Math.max(1, Math.min(999, qty || 1)) }));
  }

  const totalCopies = [...selectedIds].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = myPrints.filter(l => l.storeLabelId && selectedIds.has(l.storeLabelId));
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      const entries: PrintableLabelEntry[] = toPrint.map(item => ({
        label: {
          id: item.id, productName: item.productName, priceText: item.priceText,
          dealText: item.dealText, barcode: item.barcode, template: item.template,
        },
        quantity: quantities[item.storeLabelId!] ?? 1,
      }));
      await printLabels({ entries, shareAsPdf });
      const printItems = toPrint.map(item => ({ storeLabelId: item.storeLabelId!, quantity: quantities[item.storeLabelId!] ?? 1 }));
      labelsApi.print(printItems).catch(() => {});
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      setSelectedIds(new Set());
      setQuantities({});
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }
```

`Alert` may now be unused if nothing else in the file references it — check the imports at the top of the file and remove `Alert` from the `react-native` import list only if `tsc`/lint flags it as unused after this change (the barcode-scanner delete-confirmation dialog elsewhere in this file also uses `Alert.alert`, so it very likely stays imported; verify rather than assuming either way).

- [ ] **Step 3: Rewrite the render section — view toggle, list, and the add-sheet modal**

Find:

```tsx
      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
      </View>

      <View style={s.viewToggleRow}>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'ready' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('ready')}
          accessibilityRole="button"
          accessibilityLabel="Show labels ready to print for my store"
        >
          <Text style={s.viewToggleText}>Ready to Print{viewMode === 'ready' ? ` · ${labels.length}` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'catalog' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('catalog')}
          accessibilityRole="button"
          accessibilityLabel="Show the full shared catalog"
        >
          <Text style={s.viewToggleText}>Full Catalog{viewMode === 'catalog' ? ` · ${labels.length}` : ''}</Text>
        </TouchableOpacity>
      </View>
```

Replace with:

```tsx
      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
      </View>

      {!storeId && (
        <View style={s.storePickerRow}>
          <Text style={s.storePickerLabel}>Which store are you at?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {allStores.map((st: any) => (
              <TouchableOpacity
                key={st.id}
                style={[s.categoryChip, { borderColor: accentColor }]}
                onPress={() => setManualStoreId(st.id)}
                accessibilityRole="button"
                accessibilityLabel={`Use ${st.name}`}
              >
                <Text style={s.categoryChipText}>{st.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={s.viewToggleRow}>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'ready' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('ready')}
          accessibilityRole="button"
          accessibilityLabel="Show my store's prints"
        >
          <Text style={s.viewToggleText}>My Prints{viewMode === 'ready' ? ` · ${myPrints.length}` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'catalog' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('catalog')}
          accessibilityRole="button"
          accessibilityLabel="Browse the full catalog"
        >
          <Text style={s.viewToggleText}>Catalog{viewMode === 'catalog' ? ` · ${allLabels.length}` : ''}</Text>
        </TouchableOpacity>
      </View>
```

Next, find the list-rendering block:

```tsx
      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : labels.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>{viewMode === 'ready' ? 'Nothing to print' : 'No labels yet'}</Text>
          <Text style={s.emptySub}>
            {viewMode === 'ready' ? 'Scan an item to add one, or check the Full Catalog' : 'Scan an item to create the first one'}
          </Text>
        </View>
      ) : filteredLabels.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>No matches</Text>
          {existingBarcodeMatch ? (
            <>
              <Text style={s.emptySub}>That barcode is already in the catalog</Text>
              <TouchableOpacity
                style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                onPress={() => { const match = existingBarcodeMatch; setSearch(''); openEditForm(match); }}
                accessibilityRole="button"
                accessibilityLabel={`Open ${existingBarcodeMatch.productName}`}
              >
                <Text style={s.quickAddBtnText}>Open "{existingBarcodeMatch.productName}"</Text>
              </TouchableOpacity>
            </>
          ) : searchTerm ? (
            <>
              <Text style={s.emptySub}>Try a different name or barcode</Text>
              <TouchableOpacity
                style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                onPress={openQuickAddFromSearch}
                accessibilityRole="button"
                accessibilityLabel={isBarcodeLikeSearch ? `Add barcode ${searchTerm} as new label` : `Add ${searchTerm} as new label`}
              >
                <Text style={s.quickAddBtnText}>
                  {isBarcodeLikeSearch ? `Add barcode "${searchTerm}" as new label` : `Add "${searchTerm}" as new label`}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={s.emptySub}>No labels in this category</Text>
          )}
        </View>
      ) : viewMode === 'catalog' ? (
        <SectionList
          sections={catalogSections}
          keyExtractor={l => l.id}
          contentContainerStyle={s.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          stickySectionHeadersEnabled
          renderSectionHeader={({ section }) => (
            <Text style={s.sectionHeader}>{section.title} ({section.data.length})</Text>
          )}
          renderItem={({ item }) => renderLabelCard(item)}
        />
      ) : (
        <FlatList
          data={filteredLabels}
          keyExtractor={l => l.id}
          contentContainerStyle={s.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => renderLabelCard(item)}
        />
      )}
```

Replace with:

```tsx
      {!storeId ? null : viewMode === 'catalog' ? (
        filteredCatalog.length === 0 ? (
          <View style={s.center}>
            <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
            <Text style={s.emptyTitle}>No matches</Text>
            {existingBarcodeMatch ? (
              <>
                <Text style={s.emptySub}>That barcode is already in the catalog</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={() => { const match = existingBarcodeMatch; setSearch(''); openEditForm(match); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${existingBarcodeMatch.productName}`}
                >
                  <Text style={s.quickAddBtnText}>Open "{existingBarcodeMatch.productName}"</Text>
                </TouchableOpacity>
              </>
            ) : searchTerm ? (
              <>
                <Text style={s.emptySub}>Try a different name or barcode</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={openQuickAddFromSearch}
                  accessibilityRole="button"
                  accessibilityLabel={isBarcodeLikeSearch ? `Add barcode ${searchTerm} as new label` : `Add ${searchTerm} as new label`}
                >
                  <Text style={s.quickAddBtnText}>
                    {isBarcodeLikeSearch ? `Add barcode "${searchTerm}" as new label` : `Add "${searchTerm}" as new label`}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.emptySub}>No labels yet — scan an item to create the first one</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredCatalog}
            keyExtractor={l => l.id}
            contentContainerStyle={s.list}
            renderItem={({ item }) => renderCatalogCard(item)}
          />
        )
      ) : myPrintsLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : filteredMyPrints.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>Nothing to print</Text>
          <Text style={s.emptySub}>Add an item from the Catalog, or scan a new one</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMyPrints}
          keyExtractor={l => l.id}
          contentContainerStyle={s.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => renderMyPrintCard(item)}
        />
      )}
```

Next, find the closing of the component (the `renderLabelCard` function and the final `}`):

```tsx
  function renderLabelCard(item: Label) {
    const checked = selectedIds.has(item.id);
    const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
    return (
      <View style={s.card}>
        <TouchableOpacity
          style={s.checkbox}
          onPress={() => toggleSelected(item.id)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Select ${item.productName} for printing`}
        >
          <View style={[s.checkboxBox, checked && { backgroundColor: accentColor, borderColor: accentColor }]}>
            {checked && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={s.cardBody} onPress={() => openEditForm(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.productName}`}>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{item.productName}</Text>
            {item.category && <Text style={s.cardCategory}>{item.category}</Text>}
            <Text style={s.cardPrice}>${item.priceText}</Text>
            {item.dealText && <Text style={s.cardDeal}>{item.dealText}</Text>}
            {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
          </View>
          <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        {checked && (
          <View style={s.qtyStepper}>
            <TouchableOpacity
              style={s.qtyBtn}
              onPress={() => setQuantity(item.id, (quantities[item.id] ?? 1) - 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decrease copies"
            >
              <Text style={s.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.qtyValue}>{quantities[item.id] ?? 1}</Text>
            <TouchableOpacity
              style={s.qtyBtn}
              onPress={() => setQuantity(item.id, (quantities[item.id] ?? 1) + 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Increase copies"
            >
              <Text style={s.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }
}
```

Replace with:

```tsx
  function renderCatalogCard(item: Label) {
    const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
    return (
      <View style={s.card}>
        <TouchableOpacity style={s.cardBody} onPress={() => openEditForm(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.productName}`}>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{item.productName}</Text>
            {item.category && <Text style={s.cardCategory}>{item.category}</Text>}
            <Text style={s.cardPrice}>${item.priceText} base</Text>
            {item.dealText && <Text style={s.cardDeal}>{item.dealText}</Text>}
            {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
          </View>
          <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        {item.myStoreLabel ? (
          <View style={s.inQueueBadge}>
            <Text style={s.inQueueBadgeText}>{item.myStoreLabel.printedAt ? 'Printed' : 'In My Prints'}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.addToPrintsBtn, { backgroundColor: accentColor }]}
            onPress={() => openAddSheet(item)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.productName} to my prints`}
          >
            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderMyPrintCard(item: StoreLabelItem) {
    const checked = !!item.storeLabelId && selectedIds.has(item.storeLabelId);
    const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
    return (
      <View style={s.card}>
        <TouchableOpacity
          style={s.checkbox}
          onPress={() => item.storeLabelId && toggleSelected(item.storeLabelId)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Select ${item.productName} for printing`}
        >
          <View style={[s.checkboxBox, checked && { backgroundColor: accentColor, borderColor: accentColor }]}>
            {checked && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
          </View>
        </TouchableOpacity>
        <View style={s.cardBody}>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{item.productName}</Text>
            {item.category && <Text style={s.cardCategory}>{item.category}</Text>}
            <Text style={s.cardPrice}>${item.priceText}{item.hasOverride ? ' (my price)' : ''}</Text>
            {item.dealText && <Text style={s.cardDeal}>{item.dealText}</Text>}
            {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
          </View>
        </View>
        {checked && item.storeLabelId && (
          <View style={s.qtyStepper}>
            <TouchableOpacity
              style={s.qtyBtn}
              onPress={() => setQuantity(item.storeLabelId!, (quantities[item.storeLabelId!] ?? 1) - 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decrease copies"
            >
              <Text style={s.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.qtyValue}>{quantities[item.storeLabelId!] ?? 1}</Text>
            <TouchableOpacity
              style={s.qtyBtn}
              onPress={() => setQuantity(item.storeLabelId!, (quantities[item.storeLabelId!] ?? 1) + 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Increase copies"
            >
              <Text style={s.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }
}
```

- [ ] **Step 4: Add the "Add to My Prints" sheet modal**

Find (the closing of the existing form `<Modal>`, right before the `<View style={s.header}>` block):

```tsx
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <View style={s.header}>
```

Replace with:

```tsx
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!addSheetItem} animationType="fade" transparent onRequestClose={() => setAddSheetItem(null)}>
        <View style={s.addSheetOverlay}>
          <View style={s.addSheetCard}>
            <Text style={s.formTitle}>{addSheetItem?.productName}</Text>
            <Text style={s.addSheetSub}>Base price: ${addSheetItem?.priceText}</Text>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: accentColor, marginTop: 16 }]}
              onPress={() => { setAddSheetPriceMode('base'); confirmAddToMyPrints(); }}
              accessibilityRole="button"
              accessibilityLabel={`Add at $${addSheetItem?.priceText}`}
            >
              <Text style={s.saveBtnText}>Add at ${addSheetItem?.priceText}</Text>
            </TouchableOpacity>
            {addSheetPriceMode === 'custom' ? (
              <>
                <Text style={[s.fieldLabel, { marginTop: 16 }]}>My price</Text>
                <View style={s.priceInputWrap}>
                  <Text style={s.priceInputDollar}>$</Text>
                  <TextInput
                    style={[s.fieldInput, s.priceInput]}
                    value={addSheetPrice}
                    onChangeText={t => setAddSheetPrice(t.replace(/[^0-9.]/g, ''))}
                    placeholder={addSheetItem?.priceText}
                    placeholderTextColor="#B0B8C4"
                    keyboardType="decimal-pad"
                    maxLength={7}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: accentColor, marginTop: 12 }, !addSheetPrice.trim() && s.saveBtnDim]}
                  onPress={confirmAddToMyPrints}
                  disabled={!addSheetPrice.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm custom price"
                >
                  <Text style={s.saveBtnText}>Confirm ${addSheetPrice || '0.00'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={{ marginTop: 12, alignItems: 'center' }}
                onPress={() => setAddSheetPriceMode('custom')}
                accessibilityRole="button"
                accessibilityLabel="Use a different price for my store"
              >
                <Text style={{ color: accentColor, fontWeight: '700', fontSize: 14 }}>Use a different price for my store</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => setAddSheetItem(null)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={s.header}>
```

- [ ] **Step 5: Add the new styles**

Find (in the `StyleSheet.create` block):

```ts
  quickAddBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },
  quickAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
```

Replace with:

```ts
  quickAddBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },
  quickAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  storePickerRow: { paddingHorizontal: 20, marginBottom: 10, gap: 6 },
  storePickerLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  addToPrintsBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  inQueueBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F0F0F0' },
  inQueueBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  addSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  addSheetCard: { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 340 },
  addSheetSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
```

- [ ] **Step 6: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. If `Alert` (flagged as a possible unused import back in Task 7 Step 2) is genuinely unused after this whole rework, remove it from the `react-native` import list now.

- [ ] **Step 7: Manual click-through (on a real Android device, per `project_usb_android_testing`)**

1. As a Store Manager at a single-assigned store, open Labels → confirm no store picker appears (resolves immediately from `useCurrentStoreId`) and "My Prints"/"Catalog" both load.
2. Scan a brand-new item, name and price it → confirm it appears in My Prints at that price immediately.
3. Switch to Catalog, find that same item → confirm it shows "In My Prints" instead of an Add button.
4. Log in as staff at a *different* store, open Catalog, find that same item, tap Add → confirm the sheet shows the base price, tapping "Add at $X" adds it to that store's My Prints at the base price with no retyping.
5. From My Prints at the second store, print that item → confirm only that store's copy shows as printed; the first store's copy is unaffected.
6. From the first store, edit that label's *base* price (via Catalog → tap the item → edit form). Confirm the first store (no override) gets flagged to reprint in My Prints; the second store, if it set its own override, is unaffected — if it didn't override, it should also flag.
7. As DevAdmin/SuperAdmin on admin web, open the per-store view for a store the mobile device isn't logged into, set an override price there, and confirm it reflects on that store's mobile My Prints on next refresh.

- [ ] **Step 8: Commit**

```bash
git add mobile/components/LabelsScreen.tsx
git commit -m "feat: mobile Labels — Catalog add-flow and store-scoped My Prints/print flow"
```

---

### Task 8: Update the consolidated manual test checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Append a new section**

Add at the end of the file:

```markdown
## 13. Per-store label pricing + print tracking (2026-08-29)

- [ ] Create a brand-new item at Store A → confirm it appears in Store A's My Prints at the entered price, and in the global Catalog at that same price as the base
- [ ] From Store B, add that same item from Catalog at the base price → confirm Store B's My Prints shows the same price with no retyping
- [ ] Store A prints their copy → confirm Store A's copy drops out of My Prints while Store B's (untouched, unprinted) is unaffected
- [ ] Store B sets their own override price and prints → confirm Store A's already-printed copy stays printed
- [ ] Admin edits the base price from the Catalog tab → confirm every store still on the base price gets flagged for reprint; a store with its own override does not
- [ ] Admin edits Store B's override directly from the By Store view → confirm only Store B's print status resets
- [ ] Admin's By Store view for a store that has never touched a given item still shows that item with the resolved (base) price, with an "Add" action instead of being omitted
- [ ] As a multi-store Employee/Manager, confirm the resolved store follows physical location (GPS) rather than always defaulting to the first assigned store
- [ ] As a user with zero store assignments (if reachable in practice), confirm the manual store-picker row appears instead of an error
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add per-store label pricing section to the manual test checklist"
```
