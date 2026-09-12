# Scanned Product ↔ Label Catalog Sync — Design Spec

**Date:** 2026-09-12
**Status:** Approved, ready for planning

## Problem

`ScannedProduct` (a barcode→name/category/brand cache, no price) and `Label` (the shelf-price-label catalog, price required) are two independent tables with no foreign key — linked only by matching `barcode` strings when both happen to have one. In practice:

- Every scan from Order List, Stock Request, or the mobile Catalog screen's Scan/Manual/Photo tabs writes only to `ScannedProduct` and never reaches `Label` — a product can be scanned hundreds of times and never become printable unless a human manually re-creates it as a Label from scratch.
- The one sync that exists (`Labels.tsx`/`LabelsScreen.tsx`, when saving a Label with a barcode, also upserting `ScannedProduct`) is client-side, one-directional, and wrapped in a swallowed `.catch(() => {})` — a failed request silently leaves the two tables diverged with no retry or record.
- `ScannedProducts.tsx` (admin) has no edit affordance — only Add (upsert-by-barcode) and Delete. Correcting a wrong name/category means re-typing the exact barcode into the Add modal and hoping it upserts the right row; the barcode itself can't be fixed without delete + recreate.
- Price Check (mobile) dead-ends on an unrecognized barcode ("Not in the catalog") instead of registering it, even though every other scan surface in the app treats an unrecognized barcode as "help us learn this product."
- Category tagging is inconsistently wired: `BarcodeScannerModal`, `LabelsScreen`, and admin `Labels.tsx` all route new category names through an approval pipeline (`OrderCategory`, via `orderCategoriesApi.getApproved()`/`.submitNew()`); `ScannedProducts.tsx`'s Add modal and mobile Catalog's `ScanTab` do not — they accept free text with no suggestions and no submission, so the same real-world category can end up spelled two different ways depending which screen created it.

## Approach

Make the sync server-side, bidirectional, and automatic, so every existing and future scan entry point gets it for free just by calling the endpoints they already call — no new "sync module" for callers to remember to invoke.

- `Label.priceText` becomes nullable. A scan that reaches `ScannedProduct` for the first time also creates a matching `Label` with `priceText: null` — the product exists in the catalog immediately, price to be filled in whenever someone gets to it. This directly satisfies "scanning gets the product into the system for reuse" without adding a separate review/approval step.
- The reverse direction (`Label` → `ScannedProduct`) moves server-side too, replacing the current client-side calls, so it can no longer silently fail without a trace.
- `Label.barcode` stays non-unique (an intentional existing "Duplicate Label" feature relies on this — e.g. a sale-price sign and a regular-price sign for the same barcode). Sync always operates against `findFirst` by barcode, matching the lookup semantics `lookupStoreLabelByBarcode` already uses elsewhere in this codebase — it never enforces or assumes uniqueness.
- Print surfaces need a real "missing price" state for the first time ever (previously structurally impossible, since `priceText` was required) — every print-building function must exclude or flag `Label`s with a null effective price, and every place that displays a Label needs a visible "no price set" indicator with a quick way to fill it in.
- Category tagging gets the same `orderCategoriesApi` treatment everywhere a category can be typed, closing the drift between screens.
- Price Check becomes a real registration entry point: an unrecognized barcode prompts for a name (reusing the same lightweight "name this product" pattern `BarcodeScannerModal` already has) instead of dead-ending, then creates the same `ScannedProduct` + priceless `Label` pair every other entry point creates.

## Data model

```prisma
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String?       // was required — null means "known product, price not set yet"
  brand            String?       // NEW — parity with ScannedProduct.brand, carried through on sync
  dealText         String?
  barcode          String?
  category         String?
  template         LabelTemplate @default(CLASSIC_RED_BLACK)
  createdByStoreId String?
  createdById      String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  storeLabels StoreLabel[]

  @@index([createdByStoreId])
  @@map("labels")
}
// ScannedProduct and StoreLabel are unchanged.
```

`priceText` losing its NOT NULL constraint is additive/widening, not destructive — existing rows keep their values, nothing is dropped. Ships in the same push as the matching backend code, per this project's standing rule for contract-breaking schema changes.

`resolveEffectivePrice` (`backend/src/utils/labelPricing.ts`) changes return type from `string` to `string | null`, since a base `Label` can now have no price at all even before a store override is considered. Every caller (already a short, enumerable list — `getAllLabels`, `getStoreLabels`, `lookupStoreLabelByBarcode`, `getLabelsCoverage`, plus mobile/admin print-building code) needs to handle a null result: never print, always show a "set a price" affordance instead.

## Backend

**New shared logic** (a small internal helper, not a new public endpoint — called from both directions):
- `ensureLabelForBarcode(barcode, { productName, category, brand, creatorStoreId, creatorId })` — `findFirst` a `Label` by barcode; if none exists, create one with `priceText: null` and the given fields. If one exists, this call does NOT overwrite an existing Label's fields (a Label a human has already curated shouldn't get silently overwritten by a later, possibly-lower-quality scan of the same barcode) — existence alone is enough; only a genuinely missing Label gets created. `creatorStoreId`/`creatorId` are resolved by each call site the same way `createLabel` already resolves them today (`requestedStoreId ?? req.user!.storeIds?.[0] ?? null`, `req.user!.id`) — attribution on a newly-created record, not an authorization decision, so this is the same already-shipped pattern `createLabel` uses, not a new instance of the storeIds[0] authorization bug class fixed chain-wide on 2026-09-10.
- `ensureScannedProductForBarcode(barcode, { name, category, brand })` — the existing `saveProduct` upsert logic, extracted so `createLabel`/`updateLabel` can call the exact same code path instead of duplicating upsert semantics. Unlike `ensureLabelForBarcode`, this one DOES overwrite an existing `ScannedProduct`'s fields on every call — intentionally asymmetric with the other direction. A Label save is a deliberate human curating the catalog (typing a name/category into a form), which is a more authoritative signal than a raw scan event, so it's correct for that curated data to refresh the cache. A raw scan, by contrast, is often an opportunistic capture and should never silently overwrite a Label a human already set up (price, template, etc.) — hence create-only in that direction. This mirrors the existing client-side behavior being replaced (today's `Labels.tsx`/`LabelsScreen.tsx` sync calls already overwrite `ScannedProduct` on every Label save), so this is not a new behavior change, just moving it server-side.

**`scannedProduct.controller.ts`**:
- `saveProduct` (`POST /scanned-products`), after its existing upsert, also calls `ensureLabelForBarcode` — every current and future caller of this endpoint (Order List, Stock Request, Catalog's Scan/Manual/Photo tabs, the new Price Check registration) gets a matching Label for free, with no client-side changes needed beyond Price Check's new prompt.
- New: `updateProduct` (`PATCH /scanned-products/:id`) — edits `name`/`category`/`brand`. `barcode` is not editable here (it's the upsert key elsewhere in the system); correcting a wrong barcode is still delete + recreate, unchanged from today. Same `STORE_MANAGER`+ gate as the rest of this controller's admin-facing routes.
- New route: `PATCH /scanned-products/:id` in `backend/src/routes/index.ts`, registered next to the existing `scanned-products` routes.

**`labels.controller.ts`**:
- `createLabelSchema`/`updateLabelSchema`: `priceText` becomes `z.string().max(7).optional().nullable()` — still capped at 7 chars when provided, but no longer required.
- `createLabel`/`updateLabel`, when a barcode is present, call `ensureScannedProductForBarcode` server-side in the same request — replacing the client-side calls in `Labels.tsx`/`LabelsScreen.tsx`, which get deleted. A failure here should not roll back the Label write (a Label is still useful even if the cache-side sync hiccups) but should be logged, not silently swallowed like today.
- `printStatus`/print-building logic: add a price check ahead of the existing status logic — a `Label` (or its effective price after a `StoreLabel` override) that resolves to `null` cannot be `'printed'`/`'needs_reprint'`/queued; surface it as a distinct state (e.g. `'needs_price'`) that every consumer (`markLabelsPrinted`, mobile `handlePrint`, `PrintTray`, `BulkPrintWizard`) treats as non-printable and excludes from bulk-print selection.
- `lookupStoreLabelByBarcode` (Price Check's backend): when no `Label` matches, still returns `found: false` as today — the new registration behavior lives in the mobile client calling `saveProduct` afterward, not in this lookup endpoint itself.

## Admin web

- `ScannedProducts.tsx`: add a real Edit action per row (button + modal, pre-filled with the row's current `name`/`category`/`brand`) that calls the new `PATCH /scanned-products/:id`. Barcode shown but read-only in the edit modal, consistent with the backend decision above. Wire the category field (both Add and Edit) through `orderCategoriesApi.getApproved()`/`.submitNew()`, matching `Labels.tsx`'s existing pattern exactly.
- `Labels.tsx`: remove the now-redundant client-side `scannedProductApi.save()` call (server-side now). Handle `priceText: null` — show a clear "no price set" badge and make it trivial to add one (the existing edit flow already lets you set `priceText`; the gap is purely visual/discoverability, not a missing capability).
- `PrintTray.tsx`, `BulkPrintWizard.tsx`, `StoreLabelsPanel.tsx`: exclude or visibly flag priceless items in whatever list/selection UI each already has, using the new `'needs_price'` status. No new components — these already render a `status` field per row; this just adds a state they need to handle.
- `CoverageView.tsx`, `HealthView.tsx`, `Dashboard.tsx`'s health stat card: read `printStatus`/coverage data that already accounts for the new status by construction (they consume the same backend functions being updated) — verify each renders `'needs_price'` sensibly (e.g. not silently miscounted as `'not_added'`) rather than assuming no changes needed.

## Mobile

- `PriceCheckModal.tsx`: on `found: false`, instead of the current dead-end message, prompt for a name (reusing `BarcodeScannerModal`'s existing "name this product" UI pattern) and category (through the same `orderCategoriesApi` suggestion flow), then call `scannedProductApi.save()` — which now also creates the matching priceless `Label` server-side. After saving, show the same "added — no price set yet, a manager can add one when labeling" messaging admin sees, so the user understands what just happened instead of it looking like a silent no-op.
- `mobile/app/(manager)/catalog.tsx`: wire `ManualTab` and `ScanTab`'s category fields through `orderCategoriesApi.getApproved()`/`.submitNew()`, matching `BarcodeScannerModal`'s existing pattern (currently the only entry points missing it). No other changes needed here — these tabs already call `scannedProductApi.save()`, which now creates the Label automatically.
- `LabelsScreen.tsx`: remove the now-redundant client-side `scannedProductApi.save()` sync call (server-side now, via `createLabel`/`updateLabel`). Handle a null `priceText` the same way admin does — a visible "no price set" state, not a blank/broken-looking label.

## Explicitly out of scope

- **The customer-facing "Request Product" ticket system** — a genuinely different feature (text/ticket based, no barcode, no `ScannedProduct`/`Label` involvement at all). Confirmed unrelated during investigation; not touched.
- **Enforcing an actual enum for `category`** on either model — the `OrderCategory` approval pipeline stays advisory (suggests + records new names for review) rather than a hard constraint, matching how it already works everywhere it's wired in today. Making it a true enforced enum would be a separate, larger change.
- **Making `Label.barcode` unique** — the existing "Duplicate Label" feature intentionally relies on non-uniqueness; not changed by this work.
- **A `storeIds[0]`-style audit-log-only observation in `labels.controller.ts`** (`updateLabel`/`deleteLabel`/`markLabelsPrinted` use `req.user!.storeIds?.[0]` purely to annotate the audit-log `storeId` field, not for any authorization decision — lower severity than the authorization-bypass class already fixed chain-wide on 2026-09-10). Flagged for awareness; fix only if explicitly requested, since it's adjacent to but not part of this request's scope.

## Verification

No test framework in this repo — verification is `npx tsc --noEmit` per sub-app, plus a live-browser Playwright pass for admin (mocked auth), plus a manual mobile checklist (device if connected, web-preview otherwise). Given the point of this work is specifically "the two lists never diverge," verification should prove that directly, not just that each piece works in isolation:

1. Scan a genuinely new barcode at Order List → confirm it appears in `ScannedProduct` (admin ScannedProducts page) AND as a priceless `Label` (admin Labels page, showing "no price set").
2. Scan that same barcode again at Stock Request → confirm no duplicate Label was created (still exactly one Label for that barcode), and `ScannedProduct.scanCount` incremented.
3. From admin, edit that Label's price → confirm it now shows as printable (no longer `'needs_price'`), and `ScannedProduct`'s name/category are unaffected by that edit (Label edits shouldn't corrupt the cache side with unrelated field bleed).
4. Create a brand-new Label directly in admin (barcode + price entered together, as today) → confirm a matching `ScannedProduct` now exists (server-side sync working in this direction too).
5. Edit a `ScannedProduct` via the new admin Edit modal → confirm the change persists and does NOT touch any existing Label's fields (only `ensureLabelForBarcode`'s create path should ever write Label fields from the scan side; editing an existing cache entry shouldn't reach into Label at all).
6. Scan an unrecognized barcode via mobile Price Check → confirm it now registers (both tables), instead of dead-ending, and the user sees messaging explaining the price still needs to be set.
7. Try to bulk-print a selection that includes a priceless Label from `BulkPrintWizard`/`PrintTray` → confirm it's excluded/flagged, never silently printed with a blank or wrong price.
8. Type a brand-new category name into `ScannedProducts.tsx`'s Add/Edit modal → confirm it goes through the same `orderCategoriesApi.submitNew()` path as `Labels.tsx` already does (check network calls or the `OrderCategory` table for the pending entry).
9. Duplicate an existing Label (the existing feature) → confirm it still works exactly as before (same barcode, new Label row) — this work must not break that intentional non-uniqueness.
