# Shelf/Price Labels — Design Spec

**Date:** 2026-08-11
**Status:** Approved, ready for planning

## Problem

There's no admin tooling to generate printable shelf/price tags for in-store products. Pricing and promotional "2 for $X" style tags are handled ad hoc today, and nothing in the schema models a product's shelf price the way it models offers/banners.

## Approach

A new standalone feature — not an extension of the `PrintJob`/`OrderList` system. That model is tightly coupled to the internal stock-request print workflow (FK'd to `OrderListItem`, no price field) and is the wrong shape for a customer-facing price tag. Instead, follow the same per-store CRUD + admin page pattern already used for Offers/Banners/Order List, and reuse the browser-native print mechanism already proven in `admin/src/utils/invoicePdf.ts` — open a blank tab, write styled HTML, auto-fire `window.print()` on load — rather than adding a new PDF library.

## Data model

New `Label` model in `backend/prisma/schema.prisma`, styled after `OrderList`'s *required* `storeId` (not `Offer`/`Banner`'s optional one) — every label belongs to exactly one store, with no chain-wide broadcast concept needed here:

```prisma
enum LabelTemplate {
  CLASSIC_RED_BLACK
  // seasonal templates added later as they're designed
}

model Label {
  id          String        @id @default(uuid())
  storeId     String
  productName String
  priceText   String        // freeform: "$3.99" or "2 for $5" — covers plain and deal pricing alike
  template    LabelTemplate @default(CLASSIC_RED_BLACK)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@index([storeId])
  @@map("labels")
}
```

`priceText` is freeform rather than a structured price+dealCount pair — this mirrors how `Offer.dealText` already handles the identical "$X vs 2 for $X" ambiguity as display-only text (`schema.prisma:465`), and avoids over-modeling something that's ultimately just printed text on a tag.

## Backend

- `backend/src/controllers/labels.controller.ts` (new) — `getLabelsForStore`, `createLabel`, `updateLabel`, `deleteLabel`. Same shape as `offers.controller.ts`; no per-user store-membership check needed since access is role-gated, not store-membership-gated (see Permissions).
- `backend/src/routes/index.ts` — register, following the `storeId`-as-route-param convention already used by `disputesApi.getForStore` (`GET /disputes/store/:storeId`, `api.ts:134`):
  ```ts
  router.get('/labels/store/:storeId', authenticate, requireRole(Role.SUPER_ADMIN), getLabelsForStore);
  router.post('/labels', authenticate, requireRole(Role.SUPER_ADMIN), createLabel);
  router.patch('/labels/:labelId', authenticate, requireRole(Role.SUPER_ADMIN), updateLabel);
  router.delete('/labels/:labelId', authenticate, requireRole(Role.SUPER_ADMIN), deleteLabel);
  ```
  `requireRole` is a *minimum*-role check (`hasMinRole`, `backend/src/middleware/auth.ts:58`), so `requireRole(Role.SUPER_ADMIN)` naturally also allows `DEV_ADMIN` (higher in the hierarchy) without listing it separately — exactly the "DevAdmin + SuperAdmin only" requirement.

## Admin web

- `admin/src/services/api.ts` — new `labelsApi` object (`getForStore`, `create`, `update`, `delete`), same shape as `offersApi`/`bannersApi` (`api.ts:85-97`).
- `admin/src/components/AppSidebar.tsx` — new nav item after "Scanned Products" (line 383), gated the same way "Customers"/"Careers" already are (lines 378-380, 384-386): `{(isDevAdmin || isSuperAdmin) && <SidebarNavItem to="/labels" icon={<Tag size={16}/>} label="Labels" />}`.
- `admin/src/App.tsx` — register `<Route path="/labels" element={<Labels />} />`.
- `admin/src/pages/Labels.tsx` (new) — same store-picker-sidebar layout as `OrderList.tsx`/`StoreRequests.tsx`: pick a store, see that store's label table (product, price/deal text, template, last updated), Add/Edit/Delete a label, checkboxes per row plus a "Print Selected" button.
- `admin/src/utils/printLabels.ts` (new) — modeled directly on `invoicePdf.ts`'s `downloadInvoicePdf` (`window.open('', '_blank')` → write HTML with an inline `<style>` block → `window.onload = () => window.print()`). Renders the selected labels into a CSS grid sized for A4 (`@page { size: A4; }`), aiming for ~30-40 labels per page, each cell styled per its `template` value.

## Print templates

v1 ships one template, `CLASSIC_RED_BLACK` — black card background, red/white accent, product name and price/deal text large and centered. This is the only one implemented now; the `LabelTemplate` enum exists so seasonal templates are additive later (a new enum value + a new CSS block in `printLabels.ts`) rather than a schema migration every time one's added.

## Explicitly out of scope

- **No barcode on the label** — this is a customer-facing shelf tag, not a POS scan target. `mobile/utils/printOrderList.ts` already has SVG barcode-rendering precedent in this codebase if that's wanted later.
- **No product image.**
- **No cashback-rate display** on the label.
- **No Store Manager / Employee access** — DevAdmin/SuperAdmin only, per your answer during brainstorming.
- **No integration with the `ScannedProduct` barcode catalog** for autofill — product name is typed directly. Worth revisiting later since that catalog already exists (`admin/src/pages/ScannedProducts.tsx`) and could prefill `productName`/`category`.
- **No "all stores" broadcast mode** — every label belongs to exactly one store, matching `OrderList` rather than `Offer`/`Banner`'s optional-storeId pattern.

## Verification

No test framework in this repo (consistent with prior work) — verification is `npx tsc --noEmit` per sub-app (backend, admin) plus manual click-through:

1. As SuperAdmin, open Labels, pick a store, add a label with a plain price (`$3.99`) → appears in the table.
2. Add another with a deal price (`2 for $5`) → appears correctly, confirming `priceText` handles both cases.
3. Select both, hit "Print Selected" → new tab opens, the print dialog fires automatically, and the grid layout shows both labels styled per the red/black template.
4. Edit a label's price → table updates; re-printing reflects the new price.
5. Delete a label → removed from the table and from future prints.
6. Confirm a StoreManager/Employee-role login either gets a 403 from the `/labels` endpoints, or simply never sees the nav item — matching the existing Customers/Careers gating pattern.
