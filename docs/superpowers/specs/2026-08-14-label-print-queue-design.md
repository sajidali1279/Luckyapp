# Store-Scoped Label Print Queue & Print Tracking — Design Spec

**Date:** 2026-08-14
**Status:** Approved, ready for planning

## Problem

The `Label` catalog is chain-wide and fully anonymous — no `storeId`, no creator, no record of whether or when a label has ever been printed. With Store Managers and Employees at multiple stores now creating labels concurrently from mobile (shipped earlier today), the mobile Labels screen shows every label from every store's entire history with no way to distinguish "mine, just scanned" from "someone else's, from weeks ago." There's no real race condition — each device's print-selection checkboxes are local, client-only state — but it's easy for staff to lose track of which labels are actually theirs to print, and there's no record anywhere of who printed what, or when.

## Approach

Keep the chain-wide `Label` table as the single source of truth (no reversal to per-store labels) — every new label, regardless of who creates it, still lands in the one shared catalog. Layer three things on top: (1) tag each label with which store/user created it, (2) track whether it's been printed, with an edit after printing putting it back in the queue, and (3) make "printed" a real, logged, server-side event rather than a purely client-side action, reusing the audit-logging infrastructure and Activity Log admin page that already exist rather than building a parallel reporting system.

## Data model

Add three nullable fields to `Label` (backend/prisma/schema.prisma) — denormalized plain columns, not Prisma relations, matching the existing `PrintJob.storeId`/`printedById` precedent:

```prisma
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String
  isDeal           Boolean       @default(false)
  barcode          String?
  template         LabelTemplate @default(CLASSIC_RED_BLACK)
  createdByStoreId String?       // which store's employee/manager created this — null for admin-web-created labels
  createdById      String?       // which user created this — null is possible if the creating user is later deleted
  printedAt        DateTime?     // null = ready to print. Set when printed; reset to null on any edit after that.
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt

  @@index([createdByStoreId, printedAt])
  @@map("labels")
}
```

`createdByStoreId`/`createdById` are set once, at creation, from `req.user.storeIds?.[0]` / `req.user.id` — never changed afterward, even if the label is later edited by someone else. `printedAt` is the only field that toggles: null → timestamp on print, timestamp → null on any subsequent edit (price, name, deal text, template, barcode — any `updateLabel` call resets it). This is purely additive — safe to migrate directly ahead of the code push, per this project's established rule for non-destructive schema changes.

## Backend

- `createLabel` stamps `createdByStoreId: req.user!.storeIds?.[0] ?? null` and `createdById: req.user!.id` on every new row.
- `updateLabel` always sets `printedAt: null` as part of its update — any edit implicitly un-prints the label. (Deliberately unconditional, not "only if it was previously printed" — setting null-to-null is a no-op, so there's no need to branch on current state first.)
- New endpoint, `POST /labels/print`, body `{ labelIds: string[] }`, gated the same as the other label routes (`requireRole(Role.EMPLOYEE)`, min role, unchanged): `prisma.label.updateMany({ where: { id: { in: labelIds } }, data: { printedAt: new Date() } })`, then one `audit()` call — action `PRINT_LABEL`, entity `label`, `storeId: req.user!.storeIds?.[0]`, `details: { count: labelIds.length, labelIds }`. Both mobile's and admin web's print flows call this endpoint immediately before generating the actual print/PDF output (whichever the user tapped — Print or PDF both count as "printed").
- The three existing `audit()` calls in `labels.controller.ts` (`CREATE_LABEL`/`UPDATE_LABEL`/`DELETE_LABEL`) each gain a `storeId: req.user!.storeIds?.[0]` param — they don't pass one today, which is why the Activity Log's store filter currently can't scope them.
- `getAllLabels` gains an optional query-param mode for the mobile "Ready to Print" default view — e.g. `GET /labels?storeId=<id>&unprinted=true` filtering `createdByStoreId = storeId AND printedAt IS NULL` — versus the existing unfiltered call (which the "Full Catalog" view keeps using as-is).

## Mobile

- `LabelsScreen.tsx` defaults to a **"Ready to Print"** view: the `unprinted=true` filtered query, scoped to the logged-in user's own store. This is a shared, store-wide queue — anyone at that store sees the same list, regardless of who personally created each entry (a manager can scan in the morning, an employee can print in the afternoon).
- A toggle switches to **"Full Catalog"** — today's unfiltered view, every label from every store, printed or not — where anything can still be selected, edited, reprinted, or deleted exactly as it can today. Ready to Print is the new default landing view; Full Catalog is one tap away, not removed.
- Tapping Print or PDF now calls `POST /labels/print` for the selected IDs first, then proceeds with the existing client-side print/share exactly as today. Once marked printed, those labels naturally drop out of the Ready to Print view on next refresh (no separate "mark as done" step).
- Scanning a new item is unchanged — it lands in the shared catalog with `printedAt` null, so it's immediately visible in Ready to Print for that store.

## Admin web

- Labels created or printed from admin web get `createdByStoreId: null` — they show up in the shared catalog and the Activity Log without a store tag, same as admin actions elsewhere in this app. No store-picker step added to admin's print flow.
- Admin's print button also calls `POST /labels/print` before its existing `window.print()` call, so admin-initiated prints are logged too (closing the same gap Order List's own print button already has, for labels specifically — not fixing Order List's version of this gap, which is out of scope here).
- **Activity Log** (`admin/src/pages/ActivityLog.tsx`): its `ACTION_META` lookup gains entries for `CREATE_LABEL`/`UPDATE_LABEL`/`DELETE_LABEL`/`PRINT_LABEL` (icon + label + color, matching the pattern already used for every other action type there) so they render properly instead of falling back to the generic icon. No structural changes to the page — its existing action/role/store/date-range filters already give admin the "per day, who's doing what" view once label events carry a `storeId` and render distinctly. No new admin page is built.

## Explicitly out of scope

- **No fix to Order List's own print-logging gap** (its admin-web print button doesn't call its existing `PrintJob`-logging endpoint either) — a real, separate pre-existing issue in a different feature, not touched here.
- **No per-label print history** (who printed *this specific label*, every time) — `printedAt` is a single timestamp, overwritten on every print/edit cycle. The full history of print events still exists in the Activity Log (one `PRINT_LABEL` audit entry per print action, listing which label IDs), just not surfaced as a per-label detail view.
- **No multi-store selection** for staff who belong to more than one store — "my store" resolves to `storeIds[0]`, the same convention Order List and Store Catalog already use elsewhere in this app. Not a new gap introduced by this feature.
- **No changes to the underlying scan/create/edit UI** built earlier today (barcode field, Regular/Deal toggle, autocomplete, continuous scanning, scan-confirmation delay) — this spec only adds scoping/tracking on top of that already-shipped flow.

## Verification

No test framework in this repo — verification is `npx tsc --noEmit` per sub-app plus manual click-through:

1. As a Store Manager, scan a new item → confirm it appears in that store's "Ready to Print" view immediately.
2. As a different Employee logged into the *same* store, confirm they see that same item in their own "Ready to Print" view (shared queue, not personal).
3. Select and print it → confirm it disappears from "Ready to Print" (for both users, after refresh) and now only appears in "Full Catalog."
4. Edit that label's price from "Full Catalog" → confirm it reappears in "Ready to Print."
5. As a Store Manager at a *different* store, confirm neither store's items appear in the other's "Ready to Print" view, but both appear together in "Full Catalog" for everyone.
6. As DevAdmin/SuperAdmin, create and print a label from admin web → confirm it has no store tag anywhere and doesn't appear in any store's "Ready to Print" queue.
7. As DevAdmin/SuperAdmin, open Activity Log, filter by store and by action type → confirm `PRINT_LABEL`/`CREATE_LABEL`/`UPDATE_LABEL`/`DELETE_LABEL` events appear with proper icons and the correct store attributed (or no store, for admin-web actions).
