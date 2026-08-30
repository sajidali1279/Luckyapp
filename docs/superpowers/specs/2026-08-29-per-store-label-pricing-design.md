# Per-Store Label Pricing & Print Tracking — Design Spec

**Date:** 2026-08-29
**Status:** Approved, ready for planning

## Problem

The `Label` catalog is chain-wide: one row per barcode, one `priceText`, one `printedAt`. In practice, different stores charge different prices for the same item, and there's no way to represent that today — every store sees and prints the same price. Worse, `printedAt` being a single field means whichever store prints first marks the item "printed" for every store, even ones that have never physically printed their own copy. Creating a label for an item another store already scanned also means re-typing the name and price from scratch, even when the price is identical.

## Approach

Split "the catalog fact" from "this store's copy." `Label` keeps its existing shape and becomes the chain-wide catalog record with a **base** price. A new `StoreLabel` join table represents one store's own copy of a catalog item — an optional price override and its own `printedAt`. A store's effective price is always `StoreLabel.priceText ?? Label.priceText`. Creating a brand-new catalog item (a barcode nobody has scanned before) creates a `Label` and the creating store's `StoreLabel` together, in one step. Adding an already-cataloged item to a different store's queue ("Add from Catalog") creates just a `StoreLabel` row — no retyping.

Deal text (`dealText`) stays chain-wide only, not store-overridable — nothing in this request asked for per-store deals, and allowing it would introduce an unnecessary null-ambiguity (does a null override mean "inherit the base deal" or "this store explicitly has no deal"?). If a genuine need for per-store deals shows up later, that's a distinct follow-up.

## Data model

```prisma
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String        // chain-wide BASE price — what a store sees until they override it
  dealText         String?       // chain-wide only, not store-overridable
  barcode          String?
  category         String?
  template         LabelTemplate @default(CLASSIC_RED_BLACK)
  createdByStoreId String?       // which store first created this catalog entry — history only, no longer drives print-queue membership
  createdById      String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  storeLabels StoreLabel[]

  @@map("labels")
}
// printedAt is REMOVED from Label — superseded by StoreLabel.printedAt.
// Destructive (drops a column with real data) — this migration ships in the
// same push as the matching backend code, per this project's standing rule
// for contract-breaking schema changes, not applied ahead of time.

model StoreLabel {
  id        String    @id @default(uuid())
  labelId   String
  storeId   String
  priceText String?   // null = inherit Label.priceText; non-null = this store's own price
  printedAt DateTime? // null = needs printing at this store. Reset to null on any relevant edit.
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  label Label @relation(fields: [labelId], references: [id], onDelete: Cascade)
  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@unique([labelId, storeId])
  @@index([storeId, printedAt])
  @@map("store_labels")
}
```

Effective price resolution is always `storeLabel?.priceText ?? label.priceText`, computed the same way in every place that needs it (backend response shaping, mobile print, admin display) — one helper function, not reimplemented per call site.

## Backend

- `POST /labels` — unchanged in spirit: creates a brand-new `Label` (only called when the scanned/typed barcode has no existing catalog match, same client-side dedupe check as today) **and** a `StoreLabel` row for the creating user's resolved store in the same request, with `priceText: null` (their price equals the base they just entered) and `printedAt: null`.
- New: `POST /store-labels`, body `{ labelId, storeId, priceText? }` — the "Add from Catalog" action. Upserts a `StoreLabel` row for that pair. Omitting `priceText` (or passing null) means "use the base price." If the row already exists and the effective price is actually changing, reset `printedAt` to null; otherwise leave print status alone.
- `PATCH /labels/:id` (editing the base catalog record — name, barcode, template, category, base price, deal text): when `priceText` changes, cascade `prisma.storeLabel.updateMany({ where: { labelId, priceText: null }, data: { printedAt: null } })` — only stores still inheriting the base price get flagged; a store with its own override is untouched.
- New: `PATCH /store-labels/:id` — edit or clear one store's own override (clearing reverts to the base price). Resets that row's own `printedAt` on any change. Store-ownership enforced the same way `requireStoreAccess` already does elsewhere — a store's own staff can only touch their own store's rows; SuperAdmin/DevAdmin can touch any.
- `POST /labels/print` changes shape from bare label ids to `{ items: [{ storeLabelId, quantity }] }` — printing now stamps `printedAt` on specific `StoreLabel` rows, and the existing `PRINT_LABEL` audit call gets an exact `storeId` per event instead of guessing from `storeIds[0]`.
- `GET /labels` — the global catalog (base price only), used by admin's Catalog view and mobile's Catalog browse. Accepts an optional `?myStoreId=X` query param (mobile sends its already-resolved store — via GPS or the manual dropdown fallback; admin never sends this) — when present, each row is annotated with that store's `StoreLabel` if one exists, so mobile can show "already in my queue" inline while browsing without a second round-trip. This is explicit client-supplied context, not inferred from role, since DevAdmin/SuperAdmin have no "own store" to infer.
- New: `GET /store-labels?storeId=X` — every `Label` left-joined with that store's `StoreLabel`, resolved price, and print status. Mobile's "My Prints" is this endpoint filtered to `printedAt IS NULL`; admin's per-store view is this endpoint unfiltered (per your answer, admin sees every item's resolved price at that store, touched or not).

## Mobile

- **Catalog** (replaces "Full Catalog"): browse every `Label`, category-filterable per your earlier ask, each row shows the base price and, if the current store already has a `StoreLabel`, a status pill (in queue / printed). Tapping an item opens a sheet: "Add at this price" (calls `POST /store-labels` with no `priceText`) or "Add with a different price" (same call, their price). Scanning a barcode is a shortcut into this same flow — an existing barcode routes straight to the add-sheet; only a genuinely new one goes through full create.
- **My Prints** (replaces "Ready to Print"): `GET /store-labels?storeId=mine&unprinted=true`, showing each item's resolved price. Printing calls `POST /labels/print` with the selected `StoreLabel` ids.
- Store resolution reuses `useCurrentStoreId` (the existing GPS mechanism from location-based gas pricing). When it can't resolve to a known store, a manual dropdown picker is shown instead of erroring — this is Employee/Manager only; DevAdmin/SuperAdmin don't use mobile for this at all (per this project's existing platform split).

## Admin web

- Existing `Labels.tsx` becomes the global **Catalog** view — same table, now clearly editing base/default values. Editing the base price shows a confirmation of how many stores will be flagged for reprint (the cascade above).
- New: a **per-store view** — pick a store, see every catalog item with that store's resolved price (an "override" badge when it differs from base) and print status, editable inline (writes through `PATCH /store-labels/:id` or `POST /store-labels` if the row doesn't exist yet).
- Activity Log gains the exact `storeId` on every `PRINT_LABEL`/relevant event now that it's tracked per `StoreLabel` row instead of guessed.

## Explicitly out of scope

- **The price-check feature** and **ScannedProduct category-browsing reorg** — both real, but separate follow-on specs that build on this foundation rather than part of it.
- **The ScannedProduct cleanup** (deleting catalog-mismatched entries) — a one-off data operation with its own explicit sign-off, unrelated to this schema work.
- **Per-store deal text** — deals stay chain-wide only, as explained above.
- **Multi-store staff resolution** beyond what location-detection + the manual dropdown fallback already covers — a chain-wide manager still works from whichever store they're physically standing in, same as every other location-aware feature in this app.

## Verification

No test framework in this repo — verification is `npx tsc --noEmit` per sub-app, plus a live-browser Playwright pass for admin (mocked auth, the established technique from prior label iterations), plus a manual mobile checklist (device if connected, web-preview otherwise):

1. Create a brand-new item at Store A → confirm it appears in Store A's My Prints at the entered price, and in the global Catalog at that same price as the base.
2. From Store B, add that same item from Catalog at the base price (no override) → confirm Store B's My Prints shows the same price with no retyping required.
3. Store A prints their copy → confirm Store A's copy drops out of My Prints while Store B's is unaffected (still shows as not-yet-printed, independently).
4. Store B sets their own override price and prints → confirm Store A's already-printed copy is untouched.
5. Admin edits the base price → confirm every store still on the base price (not Store B, which has its own override) gets flagged for reprint; Store B does not.
6. Admin edits Store B's override directly from the per-store view → confirm only Store B's `printedAt` resets.
7. Admin's per-store view for a store that has never touched a given item still shows that item with the resolved (base) price, not omitted.
