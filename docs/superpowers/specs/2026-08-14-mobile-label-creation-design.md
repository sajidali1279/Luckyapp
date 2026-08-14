# Mobile Label Creation & Printing — Design Spec

**Date:** 2026-08-14
**Status:** Approved, ready for planning

## Problem

The chain-wide `Label` catalog (shipped 2026-08-11/12, see `2026-08-11-shelf-price-labels-design.md`) can only be created and printed from admin web, by DevAdmin/SuperAdmin. Store Managers and Employees are on the floor next to the actual products, not at a desk — they're the ones who'd naturally notice a missing/wrong price tag or a brand-new item that needs one. There's no way for them to add or print a label without asking someone with admin web access to type it in from a description.

Separately, creating a label today requires typing the barcode in manually (if entered at all) — there's no way to capture it directly from the physical item.

## Approach

Add a new "Labels" tab to both the Store Manager and Employee mobile apps, giving them full create/edit/delete/print access to the same chain-wide `Label` table admin web already manages — mobile and admin web become two front ends onto one shared catalog, not separate systems. No new backend tables. Two existing pieces of infrastructure carry almost the entire feature:

- **`BarcodeScannerModal.tsx`** already implements exactly the "scan → check the shared catalog → fall back to Open Food Facts → let the user name it → save to `ScannedProduct`" flow this needs. It's reused as-is, with one new optional prop to hide its Order-List-specific "Quantity" field.
- **`mobile/utils/printOrderList.ts`** already establishes the `expo-print` + `expo-sharing` mobile print pattern (including SVG barcode rendering via a CDN script, the same JsBarcode approach admin web's `printLabels.ts` now also uses). A sibling `printLabels.ts` in the same directory follows the identical pattern for the label grid.

The mobile screen deliberately mirrors admin web's existing Labels page shape (list + checkboxes + "Print Selected") rather than inventing a separate "batch" concept — consistency between the two front ends matters more than any mobile-specific cleverness here, and it's the smaller design.

## Permissions

Per your answer during brainstorming, Store Manager and Employee get **full control** (create, edit, delete) over the shared `Label` catalog from mobile — the same power DevAdmin/SuperAdmin already have from admin web. This is a deliberate reversal of the original "DevAdmin/SuperAdmin only" restriction from the first Labels iteration, now that the catalog has a legitimate floor-level workflow.

Backend route guard changes from `requireRole(Role.SUPER_ADMIN)` to `requireRole(Role.EMPLOYEE)` on all four `/labels` routes (`backend/src/routes/index.ts:466-469`). Since `requireRole` is a minimum-role check (`hasMinRole`), this naturally still allows DevAdmin/SuperAdmin/StoreManager through (all higher in the hierarchy than Employee) while continuing to exclude Customers.

## Data model

No schema changes. This feature is pure UI + a permissions loosening on top of what already shipped:
- `Label` (`productName`, `priceText`, `barcode`, `template`) — mobile creates/edits/deletes rows in the exact same table admin web reads.
- `ScannedProduct` — the barcode scan step upserts into this exactly the way `BarcodeScannerModal` already does for Order List; no Label-specific fork of that behavior.

## Mobile UI

**New tab**: `labels.tsx` added as a top-level tab in both `mobile/app/(manager)/_layout.tsx` and `mobile/app/(employee)/_layout.tsx` — not nested under Settings, matching how `order-list`/`stock-request` are already first-class tabs for comparable inventory-adjacent tools (see `feedback_orphan_screens` — burying an operational tool a manager needs daily is the exact mistake to avoid).

**List view** (default state): cards for every label in the shared catalog — product name, price/deal text, a small barcode badge if one's set, template swatch, a checkbox, Edit and Delete actions. A "Print Selected (N)" button (disabled at 0) and a "+ New Label" button, directly mirroring `admin/src/pages/Labels.tsx`'s layout.

**Creating a label**:
1. Tap "+ New Label" → opens `BarcodeScannerModal` with `hideQuantity` set.
2. On scan result (`{name, category, barcode, source}`), open an inline form pre-filled with the scanned name: Product Name (editable), Price/Deal Text (required, freeform like admin web), Template picker (same three chips: Classic Red & Black / Christmas Winter / Summer).
3. **Duplicate-barcode default**: if the scanned barcode already matches an existing `Label`, skip the blank-form step and open that label's *edit* form pre-filled instead — scanning an item that already has a tag should let you update it, not silently create a second one. (Straightforward to override — just change the price and save normally.)
4. Save → immediate `POST`/`PATCH /labels` call. The saved label appears in the list, checked by default (so it's included the next time Print is tapped) — nothing is held in unsaved local state.
5. Repeat scanning for additional items before printing; each one saves independently, so backgrounding the app or a network hiccup mid-session never loses an already-saved label.

**Editing/deleting an existing label**: tapping a card opens the same inline form pre-filled, with Save/Delete — no scanning step required (the barcode, if any, is shown but scanning again isn't part of the edit path).

## Printing

`mobile/utils/printLabels.ts` (new) takes the checked labels and produces the same HTML/CSS structure as admin web's `printLabels.ts` (6-column A4 grid, border+text-only templates, JsBarcode-rendered barcodes for labels that have one, QR code linking to app signup) via `expo-print`'s `Print.printAsync` (send to any OS-registered printer) or `printToFileAsync` + `expo-sharing` (save/share as PDF) — offer both, matching the existing choice already present in `printOrderList.ts`. The two `printLabels.ts` files (admin web, mobile) intentionally share the same visual design so a printed batch looks identical regardless of which platform produced it; keeping them as two files (rather than one shared module) matches this repo's existing pattern of admin web and mobile not sharing a build/dependency graph.

## Explicitly out of scope

- **No offline queueing** — label creation requires network connectivity, same as every other mobile write in this app (Order List, points granting, etc.).
- **No bulk/CSV import on mobile** — that idea is still an open, unspecified item on the admin-web side (noted but not built in the original Labels spec); mobile creation is one-scan-at-a-time by design, matching how `BarcodeScannerModal` already works for Order List.
- **No changes to admin web's Labels page** beyond what the shared `Label` table already gives it for free — a label created on mobile just appears there on next load, no new admin-web UI needed.
- **No per-role restriction between Manager and Employee** — both get identical label permissions; there's no "Employee can create but not delete" tier, since the earlier "Full control" answer applied to both roles equally, not one more than the other.

## Verification

No test framework in this repo (consistent with prior work). Verification is `npx tsc --noEmit` for backend/mobile, plus:

1. As Employee, open the new Labels tab → see the same catalog admin web shows (proves the shared-table read).
2. Scan a brand-new barcode (not in `ScannedProduct`) → name it → set a price → save → confirm it now appears in both the mobile list and, on refresh, admin web's Labels page.
3. Scan a barcode that already has a label → confirm it opens that label's edit form instead of creating a duplicate.
4. Edit a label's price on mobile → confirm admin web reflects the change on refresh, and vice versa (edit on admin web, confirm mobile reflects it).
5. Delete a label on mobile as Employee → confirm it's gone from admin web too.
6. Select 2+ labels (including at least one with a barcode) and Print → confirm the generated PDF/print output matches admin web's visual template (border/text-only legibility, working barcode, QR code).
7. Live-verify on a real Android device over USB (per `project_usb_android_testing`) — Expo's web preview can't exercise the camera scanner.
