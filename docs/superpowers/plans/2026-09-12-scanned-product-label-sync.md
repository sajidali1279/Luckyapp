# Scanned Product ↔ Label Catalog Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the sync between `ScannedProduct` (barcode→name/category/brand cache) and `Label` (printable price-label catalog) server-side, bidirectional, and automatic — every scan entry point creates a matching priceless `Label` for free, every Label save keeps `ScannedProduct` current, and every print surface correctly treats a priceless item as non-printable instead of crashing or silently printing garbage.

**Architecture:** Two small shared backend helpers (`ensureLabelForBarcode`, `ensureScannedProductForBarcode`) are called from the existing `saveProduct` / `createLabel` / `updateLabel` controllers — no new public endpoints, no new client-side sync code. `Label.priceText` becomes nullable, `resolveEffectivePrice` returns `string | null`, and a new `'needs_price'` print-status state flows through every consumer (admin web, mobile) that currently assumes a label always has a price.

**Tech Stack:** Node.js/Express/Prisma/PostgreSQL backend, React admin web (Vite, @tanstack/react-query, react-hot-toast), React Native/Expo mobile (expo-camera, react-native-toast-message, i18next on the manager Catalog screen only). No test framework in this repo — verification is `npx tsc --noEmit` per sub-app, curl against a real local dev server for runtime-behavior claims, and a live-browser Playwright pass (mocked auth) for admin UI.

## Global Constraints

- **`Label.barcode` stays non-unique.** The existing "Duplicate Label" feature intentionally relies on this (e.g. a sale-price sign and a regular-price sign for the same barcode). Every sync lookup uses `prisma.label.findFirst({ where: { barcode } })`, matching the lookup semantics `lookupStoreLabelByBarcode` already uses — never `findUnique`, never an assumption of uniqueness.
- **`ensureLabelForBarcode` (scan → Label) never overwrites an existing Label's fields.** Existence alone is enough; only a genuinely missing Label gets created. A Label a human has already curated must never be silently clobbered by a later scan of the same barcode.
- **`ensureScannedProductForBarcode` (Label → ScannedProduct) DOES overwrite an existing ScannedProduct's fields on every call.** This is intentionally asymmetric — a Label save is a deliberate human curating the catalog, a more authoritative signal than a raw scan event.
- **The customer-facing "Request Product" ticket system is explicitly out of scope** — a genuinely different feature (text/ticket based, no barcode, no `ScannedProduct`/`Label` involvement). Do not touch `ProductRequest` or anything under `product-requests`.
- **No enforced enum for `category`** on either model — `OrderCategory` stays advisory (suggests + records new names for review), matching how it already works everywhere it's wired in today. Do not add a hard constraint.
- **`Label.barcode` uniqueness is not being added** — do not add a `@unique` constraint or any code that assumes one barcode maps to exactly one Label.
- **The `storeIds[0]`-audit-log-only pattern in `labels.controller.ts` is explicitly not being touched** (`updateLabel`/`deleteLabel`/`markLabelsPrinted` use `req.user!.storeIds?.[0]` purely to annotate the audit-log `storeId` field, not for any authorization decision). Do not "fix" this as part of this work — it is flagged in the design spec for awareness only, lower severity than the authorization-bypass class already fixed chain-wide on 2026-09-10, and fixing it is explicitly deferred to a future request.
- **No Jest/Vitest/any test framework** — this repo has zero test files by established convention. Every "run the tests" step in this plan is `npx tsc --noEmit` (per sub-app), a curl command against a real running dev server, or a Playwright browser check. Do not add a test framework.
- **No em-dashes in any new user-facing copy string** (standing project-wide rule) — use "—" only where it already appears in existing copy being edited in place; write new strings without em-dashes (e.g. "No price set" not "No price — set one").

---

## Task 1: Schema migration — nullable `Label.priceText` + new `Label.brand`

**Files:**
- Modify: `backend/prisma/schema.prisma` (the `Label` model, lines 561-578)
- Create: `backend/prisma/migrations/20260912050000_label_price_nullable_and_brand/migration.sql`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `Label.priceText: string | null` and `Label.brand: string | null` in the generated Prisma Client (`@prisma/client`'s `Label` type) — every later backend task that touches `Label` relies on `priceText` being nullable and `brand` existing as a column.

- [ ] **Step 1: Edit the `Label` model in schema.prisma**

In `backend/prisma/schema.prisma`, find the `Label` model (currently lines 561-578):

```prisma
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
```

Replace with:

```prisma
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String?       // was required — null means "known product, price not set yet" (e.g. created by a scan, not a human)
  brand            String?       // parity with ScannedProduct.brand, carried through on sync
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
```

- [ ] **Step 2: Create the migration folder and hand-write `migration.sql`**

This repo's convention (confirmed from `backend/prisma/migrations/20260901050000_store_label_override_expiry/migration.sql` and `20260823000000_billing_record_chain_wide/migration.sql`) is a hand-written `migration.sql` with a short narrative comment, not raw `prisma migrate dev`-generated SQL. Create the directory:

```bash
mkdir -p "S:/LUCKYAPP/backend/prisma/migrations/20260912050000_label_price_nullable_and_brand"
```

Create `backend/prisma/migrations/20260912050000_label_price_nullable_and_brand/migration.sql`:

```sql
-- Label.priceText loses its NOT NULL constraint: a Label created from a scan
-- (see ensureLabelForBarcode, backend/src/utils/labelSync.ts) starts out
-- priceless ("known product, price not set yet") until someone fills one in.
-- Widening/additive only — existing rows keep their values, nothing is dropped.
ALTER TABLE "labels" ALTER COLUMN "priceText" DROP NOT NULL;

-- Label.brand: parity with ScannedProduct.brand, carried through by the new
-- scan<->label sync in both directions.
ALTER TABLE "labels" ADD COLUMN "brand" TEXT;
```

- [ ] **Step 3: Apply the migration and regenerate the Prisma Client**

Run from `backend/`:

```bash
cd "S:/LUCKYAPP/backend" && npx prisma migrate dev
```

Expected output: Prisma detects the new `20260912050000_label_price_nullable_and_brand` folder, applies it (since it exactly matches the schema.prisma diff, no further migration is generated), and ends with `Your database is now in sync with your schema.` followed by `✔ Generated Prisma Client`. If Prisma instead prompts to create an *additional* migration, the hand-written SQL doesn't match the schema.prisma edit exactly — stop and reconcile before proceeding (do not accept an auto-generated second migration for the same change).

- [ ] **Step 4: Verify the column change against the real DB**

```bash
cd "S:/LUCKYAPP/backend" && npx prisma db execute --stdin <<'EOF'
SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_name = 'labels' AND column_name IN ('priceText', 'brand');
EOF
```

Expected output: two rows — `priceText | YES | text` and `brand | YES | text`.

- [ ] **Step 5: Type-check the backend**

```bash
cd "S:/LUCKYAPP/backend" && npx tsc --noEmit
```

Expected: this will now FAIL with type errors in `backend/src/controllers/labels.controller.ts` and `backend/src/utils/labelPricing.ts` (e.g. `Type 'string | null' is not assignable to type 'string'`) — this is expected at this point in the plan; those files are fixed in Tasks 4 and 5. Confirm the errors are limited to those two files (and not, e.g., a typo in this task's own schema edit) before moving on.

- [ ] **Step 6: Commit**

```bash
cd "S:/LUCKYAPP/backend" && git add prisma/schema.prisma prisma/migrations/20260912050000_label_price_nullable_and_brand/migration.sql
git commit -m "$(cat <<'EOF'
Make Label.priceText nullable, add Label.brand

Lays the schema groundwork for scan-created Labels to exist without a
price yet, and for brand to carry through the new scan<->label sync.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Shared sync helpers (`backend/src/utils/labelSync.ts`)

**Files:**
- Create: `backend/src/utils/labelSync.ts`

**Interfaces:**
- Consumes: `prisma` (`backend/src/config/prisma.ts`, default export), the Prisma Client `Label`/`ScannedProduct` types produced by Task 1.
- Produces (exact signatures relied on by Tasks 3 and 4):
  ```ts
  export async function ensureLabelForBarcode(
    barcode: string,
    data: {
      productName: string;
      category?: string | null;
      brand?: string | null;
      creatorStoreId: string | null;
      creatorId: string;
    }
  ): Promise<void>

  export async function ensureScannedProductForBarcode(
    barcode: string,
    data: { name: string; category?: string | null; brand?: string | null }
  ): Promise<void>
  ```

- [ ] **Step 1: Write `backend/src/utils/labelSync.ts`**

```ts
import prisma from '../config/prisma';

// Server-side sync between the two barcode-keyed catalogs: ScannedProduct (a
// no-price name/category/brand cache written by every scan surface) and
// Label (the printable price-label catalog). Both directions are
// deliberately asymmetric — see
// docs/superpowers/specs/2026-09-12-scanned-product-label-sync-design.md.
//
// Label.barcode is intentionally non-unique (the "Duplicate Label" feature
// relies on this), so both directions look a Label up with findFirst,
// matching the lookup semantics lookupStoreLabelByBarcode already uses.

interface EnsureLabelInput {
  productName: string;
  category?: string | null;
  brand?: string | null;
  creatorStoreId: string | null;
  creatorId: string;
}

// Scan -> Label direction. Creates a priceless Label the first time this
// barcode is ever seen. Does NOT touch an existing Label's fields at all —
// existence alone is enough. A Label a human has already curated (price,
// template, category, etc.) must never be silently overwritten by a later,
// possibly-lower-quality scan of the same barcode.
export async function ensureLabelForBarcode(barcode: string, data: EnsureLabelInput): Promise<void> {
  const existing = await prisma.label.findFirst({ where: { barcode } });
  if (existing) return;

  await prisma.label.create({
    data: {
      productName: data.productName,
      priceText: null,
      category: data.category ?? null,
      brand: data.brand ?? null,
      barcode,
      createdByStoreId: data.creatorStoreId,
      createdById: data.creatorId,
    },
  });
}

interface EnsureScannedProductInput {
  name: string;
  category?: string | null;
  brand?: string | null;
}

// Label -> ScannedProduct direction. Unlike ensureLabelForBarcode, this DOES
// overwrite an existing ScannedProduct's name/category/brand on every call —
// a Label save is a deliberate human curating the catalog, a more
// authoritative signal than a raw scan event, so it's correct for the cache
// to refresh from it. Deliberately does NOT touch scanCount/lastScannedAt —
// those track real scan events, and saving a Label (e.g. only its price)
// isn't one; bumping them here would make "last scanned" lie.
export async function ensureScannedProductForBarcode(barcode: string, data: EnsureScannedProductInput): Promise<void> {
  const category = data.category ?? null;
  const brand = data.brand ?? null;
  await prisma.scannedProduct.upsert({
    where: { barcode },
    create: {
      barcode,
      name: data.name,
      category,
      brand,
      source: 'manual',
      scanCount: 1,
      lastScannedAt: new Date(),
    },
    update: {
      name: data.name,
      category,
      brand,
      source: 'manual',
    },
  });
}
```

- [ ] **Step 2: Type-check**

```bash
cd "S:/LUCKYAPP/backend" && npx tsc --noEmit
```

Expected: no NEW errors from `labelSync.ts` itself (the two pre-existing errors from Task 1 Step 5 in `labels.controller.ts`/`labelPricing.ts` are still present and are fixed in Tasks 4-5).

- [ ] **Step 3: Verify `ensureLabelForBarcode`'s create-only-when-missing behavior with a throwaway script**

This is a genuine runtime-behavior claim ("does NOT overwrite an existing Label"), so verify it against the real dev DB rather than just reading the code. With the backend NOT running (this is a one-off script, not an HTTP call), run from `backend/`:

```bash
cd "S:/LUCKYAPP/backend" && npx ts-node -e "
import prisma from './src/config/prisma';
import { ensureLabelForBarcode } from './src/utils/labelSync';

(async () => {
  const barcode = 'TEST_SYNC_' + Date.now();
  await prisma.label.create({ data: { productName: 'Human-Named Product', priceText: '4.99', barcode } });

  // Should NOT overwrite — the Label already exists for this barcode.
  await ensureLabelForBarcode(barcode, {
    productName: 'Scan-Named Product', category: 'Groceries', brand: 'Acme',
    creatorStoreId: null, creatorId: 'test-creator',
  });

  const label = await prisma.label.findFirst({ where: { barcode } });
  console.log(JSON.stringify({ productName: label?.productName, priceText: label?.priceText }));

  await prisma.label.deleteMany({ where: { barcode } });
  await prisma.\$disconnect();
})();
"
```

Expected output: `{"productName":"Human-Named Product","priceText":"4.99"}` — proving the pre-existing Label's fields were left untouched, not overwritten with the scan's "Scan-Named Product" / null price.

- [ ] **Step 4: Commit**

```bash
cd "S:/LUCKYAPP/backend" && git add src/utils/labelSync.ts
git commit -m "$(cat <<'EOF'
Add ensureLabelForBarcode / ensureScannedProductForBarcode sync helpers

Shared, asymmetric sync logic used by both saveProduct (scan -> Label,
create-only) and createLabel/updateLabel (Label -> ScannedProduct,
always-overwrite) in the next two commits.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Wire scan→Label sync + add PATCH `/scanned-products/:id`

**Files:**
- Modify: `backend/src/controllers/scannedProduct.controller.ts`
- Modify: `backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `ensureLabelForBarcode(barcode, { productName, category, brand, creatorStoreId, creatorId })` from Task 2.
- Produces: `updateProduct` controller function, exported for the route file; new route `PATCH /api/scanned-products/:id` (`STORE_MANAGER` minimum) — relied on by Task 6's admin `scannedProductApi.update`.

- [ ] **Step 1: Import the new helper in `scannedProduct.controller.ts`**

At the top of `backend/src/controllers/scannedProduct.controller.ts`, add to the imports (currently lines 1-4):

```ts
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { ensureLabelForBarcode } from '../utils/labelSync';
```

- [ ] **Step 2: Call `ensureLabelForBarcode` at the end of `saveProduct`**

Replace the current `saveProduct` function (lines 40-59):

```ts
export async function saveProduct(req: AuthRequest, res: Response) {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const { barcode, name, category, brand, source } = parsed.data;

  const product = await prisma.scannedProduct.upsert({
    where: { barcode },
    create: { barcode, name, category, brand, source, scanCount: 1, lastScannedAt: new Date() },
    update: {
      name, category, brand,
      // Only upgrade source to manual (manual overrides openfoodfacts)
      ...(source === 'manual' ? { source } : {}),
      scanCount: { increment: 1 },
      lastScannedAt: new Date(),
    },
  });

  res.status(201).json({ success: true, data: product });
}
```

with:

```ts
export async function saveProduct(req: AuthRequest, res: Response) {
  const parsed = saveSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const { barcode, name, category, brand, source } = parsed.data;

  const product = await prisma.scannedProduct.upsert({
    where: { barcode },
    create: { barcode, name, category, brand, source, scanCount: 1, lastScannedAt: new Date() },
    update: {
      name, category, brand,
      // Only upgrade source to manual (manual overrides openfoodfacts)
      ...(source === 'manual' ? { source } : {}),
      scanCount: { increment: 1 },
      lastScannedAt: new Date(),
    },
  });

  // Every scan that reaches this endpoint should also exist as a (possibly
  // priceless) Label — this is what lets Order List/Stock Request/mobile
  // Catalog/Price Check feed the printable catalog without each caller
  // doing anything extra. A sync hiccup here must not break the primary
  // scan-save response, so it's logged, not thrown.
  try {
    await ensureLabelForBarcode(barcode, {
      productName: name,
      category: category ?? null,
      brand: brand ?? null,
      creatorStoreId: req.user!.storeIds?.[0] ?? null,
      creatorId: req.user!.id,
    });
  } catch (err) {
    console.error('ensureLabelForBarcode failed for scanned product', barcode, err);
  }

  res.status(201).json({ success: true, data: product });
}
```

- [ ] **Step 3: Add `updateProduct` (PATCH) at the end of the file**

Append to `backend/src/controllers/scannedProduct.controller.ts`, after `deleteProduct`:

```ts
// ─── PATCH /scanned-products/:id ───────────────────────────────────────────────
// Edits name/category/brand. barcode is NOT editable here — it's the upsert
// key everywhere else in this system; correcting a wrong barcode is still
// delete + recreate, unchanged from today. STORE_MANAGER minimum, same gate
// as listProducts/deleteProduct on this controller.

const updateSchema = z.object({
  name:     z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional().nullable(),
  brand:    z.string().max(100).optional().nullable(),
});

export async function updateProduct(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const existing = await prisma.scannedProduct.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Product not found' }); return; }

  const { name, category, brand } = parsed.data;
  const product = await prisma.scannedProduct.update({
    where: { id },
    data: {
      ...(name !== undefined ? { name } : {}),
      ...(category !== undefined ? { category } : {}),
      ...(brand !== undefined ? { brand } : {}),
    },
  });

  res.json({ success: true, data: product });
}
```

- [ ] **Step 4: Register the route in `backend/src/routes/index.ts`**

Find the import line for this controller (currently line 68):

```ts
import { lookupBarcode, saveProduct, listProducts, deleteProduct } from '../controllers/scannedProduct.controller';
```

Replace with:

```ts
import { lookupBarcode, saveProduct, listProducts, updateProduct, deleteProduct } from '../controllers/scannedProduct.controller';
```

Find the "Scanned Product Catalog" route block (currently lines 474-479):

```ts
// ─── Scanned Product Catalog ──────────────────────────────────────────────────
router.get   ('/scanned-products/barcode/:barcode', authenticate, requireRole(Role.EMPLOYEE),  lookupBarcode);  // Look up by barcode (employee + manager)
router.post  ('/scanned-products',                  authenticate, requireRole(Role.EMPLOYEE),  saveProduct);    // Save/upsert a barcode→name mapping
router.get   ('/scanned-products',                  authenticate, requireRole(Role.STORE_MANAGER), listProducts);   // Browse catalog (managers+)
router.delete('/scanned-products/:id',              authenticate, requireRole(Role.STORE_MANAGER), deleteProduct);  // Remove bad entry (managers+)
router.post  ('/scanned-products/extract-from-photo', authenticate, requireRole(Role.STORE_MANAGER), upload.single('image'), extractFromPhoto); // AI photo import
```

Replace with:

```ts
// ─── Scanned Product Catalog ──────────────────────────────────────────────────
router.get   ('/scanned-products/barcode/:barcode', authenticate, requireRole(Role.EMPLOYEE),  lookupBarcode);  // Look up by barcode (employee + manager)
router.post  ('/scanned-products',                  authenticate, requireRole(Role.EMPLOYEE),  saveProduct);    // Save/upsert a barcode→name mapping
router.get   ('/scanned-products',                  authenticate, requireRole(Role.STORE_MANAGER), listProducts);   // Browse catalog (managers+)
router.patch ('/scanned-products/:id',              authenticate, requireRole(Role.STORE_MANAGER), updateProduct);  // Edit name/category/brand (managers+) — barcode not editable
router.delete('/scanned-products/:id',              authenticate, requireRole(Role.STORE_MANAGER), deleteProduct);  // Remove bad entry (managers+)
router.post  ('/scanned-products/extract-from-photo', authenticate, requireRole(Role.STORE_MANAGER), upload.single('image'), extractFromPhoto); // AI photo import
```

- [ ] **Step 5: Type-check**

```bash
cd "S:/LUCKYAPP/backend" && npx tsc --noEmit
```

Expected: same two pre-existing errors as Task 1 Step 5 (in `labels.controller.ts` / `labelPricing.ts`, fixed in Tasks 4-5) and nothing new from `scannedProduct.controller.ts` or `routes/index.ts`.

- [ ] **Step 6: Verify against a real running dev server — scan creates a priceless Label**

Start the backend (in a separate terminal / background process):

```bash
cd "S:/LUCKYAPP/backend" && npm run dev
```

In another terminal, log in as the seeded DevAdmin (`backend/src/utils/seed.ts`) and save a new scanned product:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9999999999","pin":"0000"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.token))")

BARCODE="VERIFY_$(date +%s)"
curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"$BARCODE\",\"name\":\"Verify Sync Product\",\"category\":\"Groceries\",\"source\":\"manual\"}"

curl -s "http://localhost:3000/api/labels/lookup?storeId=$(curl -s http://localhost:3000/api/stores -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0].id))")&barcode=$BARCODE" \
  -H "Authorization: Bearer $TOKEN"
```

Expected: the first `curl` returns `{"success":true,"data":{...,"name":"Verify Sync Product",...}}`. The second returns `{"success":true,"data":{"found":true,"productName":"Verify Sync Product","category":"Groceries","priceText":null,"status":"not_added",...}}` — the sentence "found:true, priceText:null" is the proof that `saveProduct` created a matching priceless Label for a brand-new barcode.

- [ ] **Step 7: Commit**

```bash
cd "S:/LUCKYAPP/backend" && git add src/controllers/scannedProduct.controller.ts src/routes/index.ts
git commit -m "$(cat <<'EOF'
Sync scans to Label catalog, add PATCH /scanned-products/:id

saveProduct now also creates a matching priceless Label via
ensureLabelForBarcode, so every scan entry point (Order List, Stock
Request, mobile Catalog, upcoming Price Check registration) feeds the
printable catalog automatically. Adds the missing edit affordance for
ScannedProduct (name/category/brand; barcode stays the immutable key).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire Label→scan sync, remove client-side calls

**Files:**
- Modify: `backend/src/controllers/labels.controller.ts`
- Modify: `admin/src/pages/Labels.tsx`
- Modify: `mobile/components/LabelsScreen.tsx`

**Interfaces:**
- Consumes: `ensureScannedProductForBarcode(barcode, { name, category, brand })` from Task 2.
- Produces: `createLabelSchema`/`updateLabelSchema` with `priceText` optional/nullable — relied on by Task 5's null-price handling and Task 7/11's admin/mobile forms (which still enforce a non-empty price client-side, so this is a backend-only widening).

- [ ] **Step 1: Import the helper in `labels.controller.ts`**

At the top of `backend/src/controllers/labels.controller.ts`, add to the imports (currently lines 1-8):

```ts
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate, Role } from '@prisma/client';
import { audit } from '../utils/audit';
import { resolveEffectivePrice } from '../utils/labelPricing';
import { hasMinRole } from '../middleware/auth';
import { ensureScannedProductForBarcode } from '../utils/labelSync';
```

- [ ] **Step 2: Make `priceText` optional/nullable in both Zod schemas**

Replace `createLabelSchema` (currently lines 33-41):

```ts
const createLabelSchema = z.object({
  productName: z.string().min(1).max(40),
  priceText: z.string().max(7).optional().nullable(),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
  storeId: z.string().uuid().optional(),
});
```

Replace `updateLabelSchema` (currently lines 179-186):

```ts
const updateLabelSchema = z.object({
  productName: z.string().min(1).max(40).optional(),
  priceText: z.string().max(7).optional().nullable(),
  dealText: z.string().max(20).optional().nullable(),
  barcode: z.string().max(40).optional().nullable(),
  category: z.string().max(100).optional().nullable(),
  template: z.nativeEnum(LabelTemplate).optional(),
});
```

(Both schemas still cap `priceText` at 7 characters when a value is provided — only the "required" `.min(1)` requirement is dropped.)

- [ ] **Step 3: Call `ensureScannedProductForBarcode` in `createLabel`**

In `createLabel`, after the `label` is created and before the `audit(...)` call (currently lines 157-174):

```ts
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
    details: { productName: label.productName, priceText: label.priceText, category: label.category },
    storeId: creatorStoreId,
  });

  res.status(201).json({ success: true, data: label });
```

- [ ] **Step 4: Call `ensureScannedProductForBarcode` in `updateLabel`**

In `updateLabel`, after `const label = await prisma.label.update(...)` and before the `priceChanged`/`otherFieldChanged` block (currently lines 213-228):

```ts
  const label = await prisma.label.update({
    where: { id: labelId },
    data: parsed.data,
  });

  // Same sync as createLabel — a barcode edited/confirmed here should stay
  // findable from the scan-lookup cache. Not rolled back on failure.
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

  const priceChanged = parsed.data.priceText !== undefined && parsed.data.priceText !== before.priceText;
```

(The rest of `updateLabel` — the `otherFieldChanged` check, the `storeLabel.updateMany` calls, and the final `audit`/response — is unchanged.)

- [ ] **Step 5: Remove the client-side sync call in `admin/src/pages/Labels.tsx`**

In `admin/src/pages/Labels.tsx`, the `saveMutation` currently reads (lines 219-232):

```tsx
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
```

Replace with (the `scannedProductApi.save(...)` call is deleted — the sync now happens server-side inside `createLabel`/`updateLabel`):

```tsx
  const saveMutation = useMutation({
    mutationFn: () => {
      const category = formCategory.trim() || null;
      const barcode = formBarcode.trim() || null;
      if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
        orderCategoriesApi.submitNew(category).catch(() => {});
      }
      return editingLabel
        ? labelsApi.update(editingLabel.id, { productName: formProductName.trim(), priceText: formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate })
        : labelsApi.create({ productName: formProductName.trim(), priceText: formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate });
    },
```

Update the import line (currently line 5) to drop the now-unused `scannedProductApi`:

```tsx
import { labelsApi, orderCategoriesApi } from '../services/api';
```

- [ ] **Step 6: Remove the client-side sync call in `mobile/components/LabelsScreen.tsx`**

In `mobile/components/LabelsScreen.tsx`, `handleSave` currently has (lines 347-361):

```tsx
    try {
      if (editingLabel) {
        await labelsApi.update(editingLabel.id, { productName, priceText, dealText, barcode, category, template: formTemplate });
      } else {
        await labelsApi.create({ productName, priceText, dealText, barcode, category, template: formTemplate, storeId });
      }
      // Keep the shared scan-lookup cache (ScannedProduct) in sync — labels
      // typed/edited directly here (quick-add from search, or correcting an
      // existing label's name/category) bypass BarcodeScannerModal entirely,
      // which is the only other place this cache normally gets written.
      // Without this, a barcode entered here would come up "not found" the
      // next time someone scans it in Order List/Stock Request.
      if (barcode) {
        scannedProductApi.save({ barcode, name: productName, category: category || undefined, source: 'manual' }).catch(() => {});
      }
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
```

Replace with (the sync comment + call are deleted — `createLabel`/`updateLabel` do this server-side now):

```tsx
    try {
      if (editingLabel) {
        await labelsApi.update(editingLabel.id, { productName, priceText, dealText, barcode, category, template: formTemplate });
      } else {
        await labelsApi.create({ productName, priceText, dealText, barcode, category, template: formTemplate, storeId });
      }
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
```

Update the import line (currently line 10) to drop the now-unused `scannedProductApi`:

```tsx
import { labelsApi, storesApi, orderCategoriesApi } from '../services/api';
```

- [ ] **Step 7: Type-check all three sub-apps**

```bash
cd "S:/LUCKYAPP/backend" && npx tsc --noEmit
cd "S:/LUCKYAPP/admin" && npx tsc --noEmit
cd "S:/LUCKYAPP/mobile" && npx tsc --noEmit
```

Expected: backend still shows only the pre-existing `printStatus`/`resolveEffectivePrice` nullability errors (fixed in Task 5). Admin and mobile pass clean (no unused-import errors are expected either way since neither tsconfig sets `noUnusedLocals`, but the imports are removed regardless for cleanliness).

- [ ] **Step 8: Verify against a real running dev server — creating a Label with a barcode creates/updates ScannedProduct**

With the dev server still running and `$TOKEN` still set from Task 3 Step 6:

```bash
BARCODE="VERIFY_LABEL_$(date +%s)"
curl -s -X POST http://localhost:3000/api/labels \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"productName\":\"Verify Label Sync\",\"priceText\":\"2.49\",\"barcode\":\"$BARCODE\",\"category\":\"Groceries\"}"

curl -s "http://localhost:3000/api/scanned-products/barcode/$BARCODE" -H "Authorization: Bearer $TOKEN"
```

Expected: the first call returns `{"success":true,"data":{...,"productName":"Verify Label Sync","priceText":"2.49",...}}`. The second returns `{"success":true,"data":{"name":"Verify Label Sync","category":"Groceries","brand":null,"source":"manual"}}` — proving `createLabel` created a matching `ScannedProduct` row.

- [ ] **Step 9: Commit**

```bash
cd "S:/LUCKYAPP" && git add backend/src/controllers/labels.controller.ts admin/src/pages/Labels.tsx mobile/components/LabelsScreen.tsx
git commit -m "$(cat <<'EOF'
Move Label -> ScannedProduct sync server-side

createLabel/updateLabel now call ensureScannedProductForBarcode
directly, replacing the client-side scannedProductApi.save() calls in
admin Labels.tsx and mobile LabelsScreen.tsx that were wrapped in a
swallowed .catch(() => {}) — a failed request used to silently leave
the two tables diverged with no retry or record. priceText is also
now optional/nullable in both label schemas, ahead of the null-price
handling in the next commit.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Nullable-price handling in backend price/status logic

**Files:**
- Modify: `backend/src/utils/labelPricing.ts`
- Modify: `backend/src/controllers/labels.controller.ts`

**Interfaces:**
- Consumes: `Label.priceText: string | null` from Task 1.
- Produces: `resolveEffectivePrice(label, storeLabel?): string | null`; `PrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed'`; `printStatus(storeLabel, effectivePrice): PrintStatus` — relied on by every admin/mobile consumer of `getAllLabels`/`getStoreLabels`/`lookupStoreLabelByBarcode`/`getLabelsCoverage` response shapes (Tasks 6-11).

- [ ] **Step 1: Widen `resolveEffectivePrice`'s types in `labelPricing.ts`**

Replace the entire contents of `backend/src/utils/labelPricing.ts`:

```ts
export interface LabelBase {
  priceText: string | null;
}

export interface StoreLabelOverride {
  priceText: string | null;
}

/**
 * A store's effective price for a catalog item: its own override if it has
 * one, otherwise the catalog's base price — which can itself be null (a
 * Label created from a scan, before anyone has set a price). Every layer
 * that needs an effective price calls this instead of reimplementing the
 * fallback; a null result means "no price at all," which every caller must
 * treat as non-printable, never as an empty string.
 */
export function resolveEffectivePrice(label: LabelBase, storeLabel?: StoreLabelOverride | null): string | null {
  return storeLabel?.priceText ?? label.priceText;
}
```

- [ ] **Step 2: Add `'needs_price'` to `PrintStatus` and update `printStatus`'s signature**

Replace the current `PrintStatus` type + `printStatus` function (currently lines 22-31):

```ts
type PrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'printed';

// printedAt alone can't tell "never printed" apart from "was printed, then a
// later edit reset it" — both look identical (null). everPrinted never
// resets, so it's the only reliable way to split those two states apart.
function printStatus(storeLabel: { printedAt: Date | null; everPrinted: boolean } | null): PrintStatus {
  if (!storeLabel) return 'not_added';
  if (storeLabel.printedAt) return 'printed';
  return storeLabel.everPrinted ? 'needs_reprint' : 'new';
}
```

with:

```ts
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
```

- [ ] **Step 3: Update `getAllLabels`'s call site**

Replace the `data` mapping in `getAllLabels` (currently lines 65-84):

```ts
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
```

- [ ] **Step 4: Update `getStoreLabels`'s call site**

Replace the `data` mapping in `getStoreLabels` (currently lines 109-128):

```ts
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
```

- [ ] **Step 5: Update `lookupStoreLabelByBarcode`'s call site**

Replace the response-building part of `lookupStoreLabelByBarcode` (currently lines 425-443):

```ts
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
```

- [ ] **Step 6: Update `getLabelsCoverage`'s call site**

Replace the `coverage` mapping inside `getLabelsCoverage` (currently lines 473-482):

```ts
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
```

- [ ] **Step 7: Make `markLabelsPrinted` reject priceless items**

Replace `markLabelsPrinted` (currently lines 366-399):

```ts
export async function markLabelsPrinted(req: AuthRequest, res: Response) {
  const parsed = printLabelsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

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
```

Note: `getLabelsHealthSummary` is deliberately NOT modified in this task — it counts `StoreLabel` rows where `printedAt IS NULL` and has never called `printStatus`/`resolveEffectivePrice`. A `'needs_price'` row still has `printedAt: null`, so it is still correctly counted as "needs attention" in that summary; it just doesn't distinguish *why*. This is verified, not assumed, in Task 8.

- [ ] **Step 8: Type-check the backend — expect a clean pass now**

```bash
cd "S:/LUCKYAPP/backend" && npx tsc --noEmit
```

Expected: no errors. This is the first point in the plan where the backend fully type-checks again after Task 1's nullable schema change.

- [ ] **Step 9: Verify `markLabelsPrinted` rejects a priceless item against the real dev server**

With the dev server running and `$TOKEN` set:

```bash
STORE_ID=$(curl -s http://localhost:3000/api/stores -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0].id))")

BARCODE="VERIFY_PRICELESS_$(date +%s)"
LABEL_ID=$(curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"$BARCODE\",\"name\":\"Priceless Verify\",\"source\":\"manual\"}" > /dev/null
  curl -s "http://localhost:3000/api/labels/lookup?storeId=$STORE_ID&barcode=$BARCODE" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.id))")

STORE_LABEL_ID=$(curl -s -X POST http://localhost:3000/api/store-labels \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"labelId\":\"$LABEL_ID\",\"storeId\":\"$STORE_ID\"}" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.id))")

curl -s -X POST http://localhost:3000/api/labels/print \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"items\":[{\"storeLabelId\":\"$STORE_LABEL_ID\",\"quantity\":1}]}"
```

Expected: `{"success":false,"error":"1 item(s) have no price set and can't be marked printed"}` with a 400 status — proving a priceless item can never be marked as printed even via a direct API call.

- [ ] **Step 10: Commit**

```bash
cd "S:/LUCKYAPP/backend" && git add src/utils/labelPricing.ts src/controllers/labels.controller.ts
git commit -m "$(cat <<'EOF'
Add needs_price print status, reject priceless items from being printed

resolveEffectivePrice now returns string | null; printStatus takes the
resolved effective price and surfaces a new 'needs_price' state ahead
of 'printed'/'needs_reprint'/'new' whenever the base Label (or its
store override) has no price at all. markLabelsPrinted now hard-rejects
any item whose effective price is null instead of silently stamping
printedAt on something that was never actually printable.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Admin — ScannedProducts edit + category wiring

**Files:**
- Modify: `admin/src/services/api.ts`
- Modify: `admin/src/pages/ScannedProducts.tsx`

**Interfaces:**
- Consumes: `PATCH /api/scanned-products/:id` from Task 3; `orderCategoriesApi.getApproved()` / `.submitNew(name)` (already exist in `admin/src/services/api.ts`, lines 342-348).
- Produces: `scannedProductApi.update(id, { name?, category?, brand? })` — admin-only, no other task depends on it.

- [ ] **Step 1: Add `scannedProductApi.update` in `admin/src/services/api.ts`**

Replace the `scannedProductApi` block (currently lines 351-356):

```ts
export const scannedProductApi = {
  list: (q?: string) => api.get('/scanned-products', { params: q ? { q } : undefined }),
  update: (id: string, data: { name?: string; category?: string | null; brand?: string | null }) =>
    api.patch(`/scanned-products/${id}`, data),
  delete: (id: string) => api.delete(`/scanned-products/${id}`),
  save: (data: { barcode: string; name: string; category?: string; brand?: string }) =>
    api.post('/scanned-products', data),
};
```

- [ ] **Step 2: Import `orderCategoriesApi` in `ScannedProducts.tsx`**

Replace the import line (currently line 4):

```tsx
import { scannedProductApi, orderCategoriesApi } from '../services/api';
```

- [ ] **Step 3: Add edit + category-suggestion state**

In the `ScannedProducts` component, after the existing state declarations (currently lines 35-43, ending with `const [newBrand, setNewBrand] = useState('');`), add:

```tsx
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [newCatSuggs, setNewCatSuggs] = useState<string[]>([]);
  const [showNewCatSugg, setShowNewCatSugg] = useState(false);
  const [editingItem, setEditingItem] = useState<ScannedProduct | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCatSuggs, setEditCatSuggs] = useState<string[]>([]);
  const [showEditCatSugg, setShowEditCatSugg] = useState(false);
```

- [ ] **Step 4: Load approved categories and compute suggestions**

After the existing debounce `useEffect` (currently lines 47-50), add:

```tsx
  useEffect(() => {
    if (showAddModal || editingItem) {
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    }
  }, [showAddModal, editingItem]);

  useEffect(() => {
    if (!newCategory.trim()) { setNewCatSuggs([]); return; }
    const q = newCategory.toLowerCase();
    setNewCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowNewCatSugg(true);
  }, [newCategory, approvedCats]);

  useEffect(() => {
    if (!editCategory.trim()) { setEditCatSuggs([]); return; }
    const q = editCategory.toLowerCase();
    setEditCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowEditCatSugg(true);
  }, [editCategory, approvedCats]);
```

- [ ] **Step 5: Add the update mutation and edit-modal handlers**

After the existing `saveMutation` block (currently lines 87-95), add:

```tsx
  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name: string; category?: string; brand?: string }) =>
      scannedProductApi.update(data.id, { name: data.name, category: data.category || null, brand: data.brand || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
      toast.success('Product updated');
      closeEditModal();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update product'),
  });

  function openEditModal(item: ScannedProduct) {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category || '');
    setEditBrand(item.brand || '');
  }

  function closeEditModal() {
    setEditingItem(null);
    setEditName(''); setEditCategory(''); setEditBrand('');
    setShowEditCatSugg(false);
  }

  function submitEdit() {
    if (!editingItem) return;
    const name = editName.trim();
    if (!name) return;
    const category = editCategory.trim();
    if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
      orderCategoriesApi.submitNew(category).catch(() => {});
    }
    updateMutation.mutate({ id: editingItem.id, name, category: category || undefined, brand: editBrand.trim() || undefined });
  }
```

- [ ] **Step 6: Wire the Add modal's category submission (it currently has none)**

Replace `submitAdd` (currently lines 102-111):

```tsx
  function submitAdd() {
    const barcode = newBarcode.trim();
    const name = newName.trim();
    if (!barcode || !name) return;
    const category = newCategory.trim();
    if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
      orderCategoriesApi.submitNew(category).catch(() => {});
    }
    saveMutation.mutate({
      barcode, name,
      category: category || undefined,
      brand: newBrand.trim() || undefined,
    });
  }
```

- [ ] **Step 7: Add category-suggestion dropdown to the Add modal**

Replace the Add modal's Category field (currently lines 157-164):

```tsx
              <div style={m.label}>Category</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={newCategory}
                  onChange={e => { setNewCategory(e.target.value); setShowNewCatSugg(true); }}
                  onFocus={() => setShowNewCatSugg(newCatSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowNewCatSugg(false), 150)}
                  placeholder="Optional - e.g. Drinks"
                  maxLength={100}
                  autoComplete="off"
                />
                {showNewCatSugg && newCatSuggs.length > 0 && (
                  <div style={m.sugg}>
                    {newCatSuggs.map(c => (
                      <div key={c} style={m.suggRow} onMouseDown={() => { setNewCategory(c); setShowNewCatSugg(false); }}>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
```

- [ ] **Step 8: Add an Edit button to each row**

Replace the Actions cell (currently lines 260-268):

```tsx
                            <TableCell style={s.td}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button style={s.editBtn} onClick={() => openEditModal(p)}>Edit</button>
                                <button
                                  style={s.deleteBtn}
                                  onClick={() => handleDelete(p)}
                                  disabled={deletingId === p.id}
                                >
                                  {deletingId === p.id ? '…' : 'Delete'}
                                </button>
                              </div>
                            </TableCell>
```

- [ ] **Step 9: Add the Edit modal JSX**

Right after the Add modal's closing `)}` (currently the block ending at line 189), add:

```tsx
      {editingItem && (
        <div style={m.overlay} onClick={closeEditModal}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <div style={m.header}>
              <h2 style={m.title}>Edit Product</h2>
              <button style={m.closeBtn} onClick={closeEditModal}>✕</button>
            </div>
            <div style={m.form}>
              <div style={m.label}>Barcode</div>
              <input style={{ ...m.input, ...m.inputReadOnly }} value={editingItem.barcode} readOnly disabled />
              <div style={m.hint}>Barcode can't be changed here. Delete and re-add to fix a wrong barcode.</div>
              <div style={m.label}>Name *</div>
              <input
                style={m.input}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. Monster Energy 16oz"
                maxLength={200}
                autoFocus
              />
              <div style={m.label}>Category</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={editCategory}
                  onChange={e => { setEditCategory(e.target.value); setShowEditCatSugg(true); }}
                  onFocus={() => setShowEditCatSugg(editCatSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowEditCatSugg(false), 150)}
                  placeholder="Optional - e.g. Drinks"
                  maxLength={100}
                  autoComplete="off"
                />
                {showEditCatSugg && editCatSuggs.length > 0 && (
                  <div style={m.sugg}>
                    {editCatSuggs.map(c => (
                      <div key={c} style={m.suggRow} onMouseDown={() => { setEditCategory(c); setShowEditCatSugg(false); }}>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={m.label}>Brand</div>
              <input
                style={m.input}
                value={editBrand}
                onChange={e => setEditBrand(e.target.value)}
                placeholder="Optional - e.g. Monster"
                maxLength={100}
              />
              <div style={m.actions}>
                <button style={m.cancelBtn} onClick={closeEditModal}>Cancel</button>
                <button
                  style={{ ...m.saveBtn, ...(!editName.trim() || updateMutation.isPending ? m.saveBtnDim : {}) }}
                  onClick={submitEdit}
                  disabled={!editName.trim() || updateMutation.isPending}
                >
                  {updateMutation.isPending ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 10: Add the new styles**

In the `s` style object, add `editBtn` next to the existing `deleteBtn` (currently around line 336):

```tsx
  editBtn: {
    background: '#eff6ff', color: PRIMARY, border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
```

In the `m` style object, add `sugg`, `suggRow`, and `inputReadOnly` (there is currently no suggestion-dropdown styling in this file — copy the shape used in `admin/src/pages/Labels.tsx`'s `m.sugg`/`m.suggRow`):

```tsx
  sugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
    border: '1.5px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
  },
  suggRow: {
    padding: '10px 14px', cursor: 'pointer', fontSize: 14,
    borderBottom: '1px solid #f8fafc',
  },
  inputReadOnly: { background: '#f4f4f4', color: '#888', cursor: 'not-allowed' },
```

- [ ] **Step 11: Type-check admin**

```bash
cd "S:/LUCKYAPP/admin" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 12: Verify the PATCH endpoint end-to-end via curl**

With the dev server running and `$TOKEN` set:

```bash
BARCODE="VERIFY_EDIT_$(date +%s)"
PRODUCT_ID=$(curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"$BARCODE\",\"name\":\"Wrong Name\",\"source\":\"manual\"}" \
  | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.id))")

curl -s -X PATCH "http://localhost:3000/api/scanned-products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Corrected Name","category":"Frozen Foods"}'
```

Expected: `{"success":true,"data":{...,"name":"Corrected Name","category":"Frozen Foods","barcode":"VERIFY_EDIT_...",...}}` — barcode unchanged, name/category updated.

- [ ] **Step 13: Commit**

```bash
cd "S:/LUCKYAPP" && git add admin/src/services/api.ts admin/src/pages/ScannedProducts.tsx
git commit -m "$(cat <<'EOF'
Add Edit affordance + category approval wiring to admin ScannedProducts

Correcting a wrong name/category previously meant re-typing the exact
barcode into the Add modal and hoping it upserted the right row.
ScannedProducts.tsx now has a real Edit modal (barcode read-only) using
the new PATCH endpoint, and both Add and Edit route new category names
through orderCategoriesApi.submitNew(), matching Labels.tsx's existing
pattern instead of accepting free text with no review.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Admin — nullable price display + needs_price handling in Labels.tsx (Catalog tab)

**Files:**
- Modify: `admin/src/pages/Labels.tsx`

**Interfaces:**
- Consumes: `Label.priceText: string | null` from the (now-nullable) `getAllLabels` response (Task 5).
- Produces: nothing new consumed by later tasks — this task's exclusion pattern (type-guard filter before building `PrintTray`/print entries) does NOT require widening `PrintTrayItem`'s type, so Task 8 can widen it independently without conflicting with this task's edits.

- [ ] **Step 1: Widen the local `Label` interface**

Replace the `priceText` field in the `Label` interface (currently line 21):

```tsx
interface Label {
  id: string;
  productName: string;
  priceText: string | null;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
}
```

- [ ] **Step 2: Fix `openEditModal` and `duplicateLabel`'s null-unsafe assignment**

`setFormPriceText(label.priceText)` appears twice — in `openEditModal` (currently line 273) and `duplicateLabel` (currently line 284). Replace both with:

```tsx
    setFormPriceText(label.priceText || '');
```

(Both call sites get the identical one-line change: the `TextInput`-equivalent `<input>` `value` prop cannot be `null`, and an empty string is the correct "not set yet" starting point for the edit form, which still requires a non-empty price before Save is enabled.)

- [ ] **Step 3: Exclude priceless rows from selection**

Replace `toggleSelectAll` (currently lines 165-178) and the `allFilteredSelected` computation (currently line 137):

```tsx
  const selectableFilteredLabels = filteredLabels.filter(l => l.priceText != null);
  const allFilteredSelected = selectableFilteredLabels.length > 0 && selectableFilteredLabels.every(l => selectedIds.has(l.id));
```

```tsx
  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) selectableFilteredLabels.forEach(l => next.delete(l.id));
      else selectableFilteredLabels.forEach(l => next.add(l.id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      if (allFilteredSelected) selectableFilteredLabels.forEach(l => { delete next[l.id]; });
      else selectableFilteredLabels.forEach(l => { if (!(l.id in next)) next[l.id] = 1; });
      return next;
    });
  }
```

- [ ] **Step 4: Replace the per-row checkbox with a disabled indicator for priceless rows**

Replace the checkbox cell in the catalog table body (currently lines 553-555):

```tsx
                          <TableCell style={s.td}>
                            {label.priceText != null ? (
                              <input type="checkbox" checked={checked} onChange={() => toggleSelected(label.id)} />
                            ) : (
                              <span title="Set a price before this can be printed" style={{ color: TEXT_MUTED, fontSize: 16 }}>—</span>
                            )}
                          </TableCell>
```

- [ ] **Step 5: Show a "no price set" badge in the price column**

Replace the price cell (currently lines 563-566):

```tsx
                          <TableCell style={s.td}>
                            {label.priceText != null ? (
                              <>
                                ${label.priceText}
                                {label.dealText && <span style={s.dealBadge}>{label.dealText}</span>}
                              </>
                            ) : (
                              <span style={s.noPriceBadge} title="No price set yet. A manager can add one when labeling.">No price set</span>
                            )}
                          </TableCell>
```

- [ ] **Step 6: Add the `noPriceBadge` style**

In the `s` style object, add next to `dealBadge` (currently around line 656):

```tsx
  noPriceBadge: {
    fontSize: 12.5, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '2px 8px',
  },
```

- [ ] **Step 7: Filter priceless rows out of the catalog print builders**

Replace `buildCatalogPrintEntries` (currently lines 200-207):

```tsx
  function buildCatalogPrintEntries(): PrintableLabelEntry[] {
    return labels
      .filter((l): l is Label & { priceText: string } => selectedIds.has(l.id) && l.priceText != null)
      .map(l => ({
        label: { ...l, priceText: priceOverrides[l.id] ?? l.priceText },
        quantity: quantities[l.id] ?? 1,
      }));
  }
```

Replace the `<PrintTray>` `items` prop in the catalog tab (currently lines 586-595):

```tsx
            <PrintTray
              items={labels
                .filter((l): l is Label & { priceText: string } => selectedIds.has(l.id) && l.priceText != null)
                .map(l => ({
                  id: l.id,
                  productName: l.productName,
                  priceText: priceOverrides[l.id] ?? l.priceText,
                  dealText: l.dealText,
                  quantity: quantities[l.id] ?? 1,
                }))}
```

(The type-guard predicate `(l): l is Label & { priceText: string }` narrows `l.priceText` to `string` for everything downstream in each `.map()`, so `PrintTrayItem.priceText` stays `string` here — no dependency on Task 8's later widening of that type.)

- [ ] **Step 8: Type-check admin**

```bash
cd "S:/LUCKYAPP/admin" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Live-browser verification — "No price set" badge renders correctly**

This is a rendering claim best shown live rather than just read. Start the admin dev server:

```bash
cd "S:/LUCKYAPP/admin" && npm run dev
```

Use the mocked-auth Playwright technique documented from this repo's prior session (`project_store_count_cleanup` memory, 2026-08-03): seed `localStorage['jwt_token']` with any non-empty string and `localStorage['luckystop-admin-auth']` with `{"state":{"user":{"id":"test-admin","phone":"9999999999","name":"Test DevAdmin","role":"DEV_ADMIN","storeIds":[]},"token":"fake"},"version":0}` (matching `admin/src/store/authStore.ts`'s zustand-persist shape), then use `page.route('**/api/labels', ...)` to fulfill with a canned response containing one label with `"priceText": null`, and `page.route('**/api/**', ...)` as a catch-all returning `{"success":true,"data":[]}` so nothing else 401s. Navigate to `/labels`, and confirm the "No price set" badge (with the amber styling from `s.noPriceBadge`) renders for that row, and that its row's checkbox is replaced with a plain `—` (not an interactive checkbox).

- [ ] **Step 10: Commit**

```bash
cd "S:/LUCKYAPP" && git add admin/src/pages/Labels.tsx
git commit -m "$(cat <<'EOF'
Show "No price set" badge and exclude priceless labels from print selection

Labels.tsx's Catalog tab now handles priceText: null explicitly: a
clear amber badge instead of "$null", and the row's print checkbox is
replaced with a disabled indicator so a priceless label (created by
the new scan sync) can never be silently selected for the base-price
reference print. The existing Edit modal already lets a price be set.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Admin — needs_price handling in print surfaces (By Store, Coverage, Print Tray)

**Files:**
- Modify: `admin/src/utils/labelStatus.ts`
- Modify: `admin/src/components/PrintTray.tsx`
- Modify: `admin/src/components/StoreLabelsPanel.tsx`
- Modify: `admin/src/components/CoverageView.tsx`
- No code change (verify only): `admin/src/components/HealthView.tsx`, `admin/src/pages/Dashboard.tsx`, `admin/src/components/BulkPrintWizard.tsx`

**Interfaces:**
- Consumes: `status: 'needs_price'` in `getStoreLabels`/`getLabelsCoverage` responses (Task 5); the type-guard-filter pattern established in Task 7 (this task independently widens `PrintTrayItem.priceText`, which is backward-compatible with Task 7's already-narrowed usage).
- Produces: `LabelPrintStatus` extended to include `'needs_price'` — the canonical admin-side status vocabulary every admin label surface uses.

- [ ] **Step 1: Add `'needs_price'` to `admin/src/utils/labelStatus.ts`**

Replace the type + three status maps (currently lines 4-28):

```ts
export type LabelPrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed';

export const STATUS_LABEL: Record<LabelPrintStatus, string> = {
  not_added: 'Not Added',
  new: 'New',
  needs_reprint: 'Needs Reprint',
  needs_price: 'Needs Price',
  printed: '✓ Printed',
};

// Colors are intentionally distinct from each other at a glance: gray (inert),
// blue (informational, no action needed yet), amber (the one that actually
// wants attention — a printed sticker on a shelf is now wrong, or nothing
// can be printed at all yet), green (done).
export const STATUS_COLOR: Record<LabelPrintStatus, string> = {
  not_added: '#8892a0',
  new: '#2563eb',
  needs_reprint: '#b7791f',
  needs_price: '#b7791f',
  printed: '#0f5132',
};

export const STATUS_BG: Record<LabelPrintStatus, string> = {
  not_added: '#f4f4f7',
  new: '#eff6ff',
  needs_reprint: '#fffbeb',
  needs_price: '#fffbeb',
  printed: '#f0fdf4',
};
```

(`daysSince`/`formatAge` below are unchanged.)

- [ ] **Step 2: Widen `PrintTrayItem.priceText` and render it null-safely**

In `admin/src/components/PrintTray.tsx`, replace the interface (currently lines 5-14):

```tsx
export interface PrintTrayItem {
  id: string;
  productName: string;
  priceText: string | null;
  dealText?: string | null;
  quantity: number;
  status?: Exclude<LabelPrintStatus, 'not_added'>;
  ageLabel?: string;
  hasOverride?: boolean;
}
```

Replace the price rendering (currently lines 61-76):

```tsx
              <div style={s.priceWrap}>
                <span style={s.dollar}>$</span>
                {editablePrice && onPriceChange ? (
                  <input
                    key={item.id}
                    style={s.priceInput}
                    defaultValue={item.priceText ?? ''}
                    placeholder="0.00"
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && v !== item.priceText) onPriceChange(item.id, v);
                    }}
                  />
                ) : (
                  <span style={s.priceStatic}>{item.priceText ?? 'not set'}</span>
                )}
              </div>
```

- [ ] **Step 3: Exclude priceless rows from selection in `StoreLabelsPanel.tsx`**

Replace the `StoreLabel` interface's two price fields (currently lines 21, 23):

```tsx
  basePriceText: string | null;
  dealText: string | null;
  priceText: string | null;
```

Replace `selectableFilteredItems` (currently line 156):

```tsx
  const selectableFilteredItems = filteredItems.filter((i): i is StoreLabel & { storeLabelId: string } => !!i.storeLabelId && i.status !== 'needs_price');
```

Replace the checkbox cell in the table body (currently lines 346-353):

```tsx
                  <TableCell style={s.td}>
                    {item.storeLabelId && item.status !== 'needs_price' && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.storeLabelId)}
                        onChange={() => toggleSelected(item)}
                      />
                    )}
                  </TableCell>
```

- [ ] **Step 4: Fix the price-display bugs in `StoreLabelsPanel.tsx`**

Replace the price cell (currently lines 358-366):

```tsx
                  <TableCell style={s.td}>
                    {item.priceText != null ? (
                      <>
                        ${item.priceText}
                        {item.hasOverride && <span style={s.overrideBadge}>override</span>}
                        {item.overrideExpiresAt && (
                          <span style={s.expiryBadge}>
                            ends {new Date(item.overrideExpiresAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={s.noPriceBadge}>No price set</span>
                    )}
                  </TableCell>
```

Replace the "Add" button (currently line 380):

```tsx
                      {!item.storeLabelId ? (
                        <button style={s.addBtn} onClick={() => addMutation.mutate(item.id)}>
                          {item.basePriceText != null ? `Add at $${item.basePriceText}` : 'Add (no price yet)'}
                        </button>
                      ) : (
```

Replace the price-edit modal's sub-line and placeholder (currently lines 247, 254):

```tsx
            <p style={m.sub}>{editingPrice.productName} — base price {editingPrice.basePriceText != null ? `$${editingPrice.basePriceText}` : 'not set'}</p>
```

```tsx
                placeholder={editingPrice.basePriceText ?? 'Enter a price'}
```

Add the `noPriceBadge` style next to `overrideBadge` (currently around line 460):

```tsx
  noPriceBadge: {
    fontSize: 12, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 8px',
  },
```

- [ ] **Step 5: Filter priceless rows out of `StoreLabelsPanel.tsx`'s print builder**

Replace `buildPrintEntries` (currently lines 192-202):

```tsx
  function buildPrintEntries(): PrintableLabelEntry[] {
    return items
      .filter((i): i is StoreLabel & { storeLabelId: string; priceText: string } =>
        !!i.storeLabelId && selectedIds.has(i.storeLabelId) && i.priceText != null)
      .map(i => ({
        label: {
          id: i.id, productName: i.productName, priceText: i.priceText,
          dealText: i.dealText, barcode: i.barcode, template: i.template,
        },
        quantity: quantities[i.storeLabelId!] ?? 1,
      }));
  }
```

(The `<PrintTray items={...}>` builder a few lines below, at lines 400-412, needs no code change — it already passes `priceText: i.priceText` through as-is, which now compiles cleanly against the widened `PrintTrayItem.priceText: string | null` from Step 2.)

- [ ] **Step 6: Fix the null-price display bugs in `CoverageView.tsx`**

Replace the `basePriceText` field in `CoverageLabel` (currently line 18):

```tsx
interface CoverageLabel {
  id: string; productName: string; barcode: string | null; category: string | null; basePriceText: string | null; dealText: string | null;
  template: string; addedCount: number; coverage: CoverageEntry[];
}
```

Replace the base-price cell (currently lines 215-218):

```tsx
                      <TableCell style={s.td}>
                        {label.basePriceText != null ? `$${label.basePriceText}` : <span style={{ color: TEXT_MUTED }}>No price set</span>}
                        {label.dealText && <span style={s.dealBadge}>{label.dealText}</span>}
                      </TableCell>
```

Replace the per-store coverage chip's price display (currently lines 244-254):

```tsx
                                  {c.status !== 'not_added' ? (
                                    c.priceText != null ? (
                                      <span style={s.chipPrice}>${c.priceText}{c.hasOverride ? ' •' : ''}</span>
                                    ) : (
                                      <span style={s.chipPrice}>No price set</span>
                                    )
                                  ) : (
                                    <button
                                      style={s.chipAddBtn}
                                      disabled={addOneMutation.isPending && addOneMutation.variables?.storeId === c.storeId}
                                      onClick={() => addOneMutation.mutate({ labelId: label.id, storeId: c.storeId })}
                                    >
                                      + Add
                                    </button>
                                  )}
```

`PRINTABLE_STATUSES` (currently line 13, `['new', 'needs_reprint']`) needs no change — it's an explicit allowlist, so `'needs_price'` is already excluded from `startBulkPrint`'s queue by omission. Confirm this by reading the line again after the edit and leaving it untouched.

- [ ] **Step 7: Type-check admin**

```bash
cd "S:/LUCKYAPP/admin" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Verify `BulkPrintWizard.tsx` needs no code change**

Read `admin/src/components/BulkPrintWizard.tsx` again: it only renders whatever `queue: BulkPrintStoreGroup[]` it's given as a prop, and its one caller (`CoverageView.tsx`'s `startBulkPrint`) only ever adds a `coverage` entry to the queue when `PRINTABLE_STATUSES.includes(c.status)` is true (Step 6 above confirms this list still excludes `'needs_price'`). Confirm no other file imports `BulkPrintWizard` (`grep -rn "BulkPrintWizard" admin/src` should show only `CoverageView.tsx` and its own file). No code change needed.

- [ ] **Step 9: Verify `HealthView.tsx` / `Dashboard.tsx`'s health stat card need no code change**

Both consume `GET /labels/health-summary` (`getLabelsHealthSummary`), which counts `StoreLabel` rows with `printedAt IS NULL` and never calls `printStatus`/`resolveEffectivePrice` (confirmed in Task 5 Step 7's note). A `'needs_price'` row still has `printedAt: null`, so `totalStale`/`storesWithStale` still count it correctly as "needs attention" — it is not silently miscounted as `'not_added'` (that status is a property `printStatus` returns for API consumers, not something `getLabelsHealthSummary` computes at all). Confirm by re-reading `backend/src/controllers/labels.controller.ts`'s `getLabelsHealthSummary` function and noting it has no dependency on `printStatus`. No code change needed in either admin file.

- [ ] **Step 10: Live-browser verification — needs_price row is excluded from print selection**

With the admin dev server running, use the same mocked-auth Playwright technique as Task 7 Step 9, this time mocking `GET /store-labels?storeId=...` with one row carrying `"status": "needs_price", "priceText": null`. Navigate to Labels → By Store, pick the mocked store, and confirm: the row's checkbox cell is empty (no checkbox rendered), the Status column shows an amber "Needs Price" badge, and the Price column shows "No price set" instead of "$null".

- [ ] **Step 11: Commit**

```bash
cd "S:/LUCKYAPP" && git add admin/src/utils/labelStatus.ts admin/src/components/PrintTray.tsx admin/src/components/StoreLabelsPanel.tsx admin/src/components/CoverageView.tsx
git commit -m "$(cat <<'EOF'
Handle needs_price status across admin print surfaces

By Store and Coverage now exclude priceless items from print
selection (checkbox hidden/omitted) and fix several "$null" display
bugs (base price, per-store coverage chips, the price-edit modal's
placeholder and sub-label) that priceText: null exposes for the first
time. PrintTray's priceText prop is widened to string | null with a
"not set" fallback. BulkPrintWizard, HealthView, and Dashboard's
health stat card were reviewed and need no change — verified, not
assumed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Mobile — Price Check registers unknown barcodes

**Files:**
- Modify: `mobile/components/PriceCheckModal.tsx`

**Interfaces:**
- Consumes: `scannedProductApi.save({barcode, name, category?, source})` (mobile `services/api.ts`, unchanged) which now also creates a priceless Label server-side (Task 3); `orderCategoriesApi.getApproved()`/`.submitNew(name)` (mobile `services/api.ts`, unchanged); the naming-phase UI pattern from `mobile/components/BarcodeScannerModal.tsx`.
- Produces: nothing new consumed by later tasks (this is the last mobile file that still needed the naming pattern).

- [ ] **Step 1: Update imports and the local `PrintStatus` vocabulary**

Replace the imports (currently lines 1-12):

```tsx
import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  StatusBar, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { COLORS } from '../constants';
import { XIcon, DollarSignIcon, PlusIcon, CheckCircleIcon } from './Icons';
import { labelsApi, scannedProductApi, orderCategoriesApi } from '../services/api';
```

Replace `Phase`/`PrintStatus`/the two status maps (currently lines 14-47):

```tsx
type Phase = 'scanning' | 'loading' | 'result' | 'naming';
type PrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed';

interface LookupResult {
  found: boolean;
  barcode: string;
  id?: string;
  productName?: string;
  category?: string | null;
  basePriceText?: string | null;
  dealText?: string | null;
  priceText?: string | null;
  hasOverride?: boolean;
  status?: PrintStatus;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  storeId: string;
}

const STATUS_LABEL: Record<PrintStatus, string> = {
  not_added: 'Not added',
  new: 'New — not printed yet',
  needs_reprint: 'Needs reprint — price changed',
  needs_price: 'No price set yet',
  printed: 'Printed and up to date',
};
const STATUS_COLOR: Record<PrintStatus, string> = {
  not_added: '#8892a0',
  new: '#2563eb',
  needs_reprint: '#b7791f',
  needs_price: '#b7791f',
  printed: '#15803d',
};
```

- [ ] **Step 2: Add naming/registration state**

Replace the component's state declarations (currently lines 54-65):

```tsx
export default function PriceCheckModal({ visible, onClose, storeId }: Props) {
  const qc = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [lastCode, setLastCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const manualInputRef = useRef<TextInput>(null);

  // Naming/registration phase (unrecognized barcode) — same lightweight
  // pattern as BarcodeScannerModal's "name this product" prompt.
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const nameRef = useRef<TextInput>(null);
```

- [ ] **Step 3: Reset new state on open, and load approved categories**

Replace the `visible`-driven `useEffect` (currently lines 73-81):

```tsx
  useEffect(() => {
    if (visible) {
      setPhase('scanning'); setLastCode(''); setBarcode(''); setResult(null); setAdding(false);
      setShowManualEntry(false); setManualBarcode('');
      setProductName(''); setCategory(''); setRegistering(false); setJustRegistered(false);
      clearPendingScan();
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    } else {
      clearPendingScan();
    }
  }, [visible]);

  useEffect(() => {
    if (!category.trim()) { setCatSuggs([]); return; }
    const q = category.toLowerCase();
    setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowCatSugg(true);
  }, [category, approvedCats]);
```

- [ ] **Step 4: Route an unrecognized barcode to the naming phase instead of a dead-end**

Replace `handleScan` (currently lines 91-102):

```tsx
  async function handleScan({ data }: { data: string }) {
    if (phase !== 'scanning' || data === lastCode) return;
    setLastCode(data);
    setBarcode(data);
    setPhase('loading');
    try {
      const res = await labelsApi.lookupByBarcode(storeId, data);
      const found = res.data?.data ?? { found: false, barcode: data };
      setResult(found);
      setPhase(found.found ? 'result' : 'naming');
    } catch {
      setResult({ found: false, barcode: data });
      setPhase('naming');
    }
  }
```

- [ ] **Step 5: Add `handleRegister` and fix `handleAddToMyPrints`'s null-price bugs**

Replace `handleAddToMyPrints` (currently lines 119-132) and add `handleRegister` after it:

```tsx
  async function handleAddToMyPrints() {
    if (!result?.id || adding) return;
    setAdding(true);
    try {
      await labelsApi.addToStore(result.id, storeId);
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all', storeId] });
      const newStatus: PrintStatus = result.basePriceText != null ? 'new' : 'needs_price';
      Toast.show({
        type: 'success',
        text1: 'Added to My Prints',
        text2: result.basePriceText != null ? `At base price $${result.basePriceText}` : 'No price set yet',
      });
      setResult({ ...result, status: newStatus, priceText: result.basePriceText ?? null, hasOverride: false });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to add' });
    }
    setAdding(false);
  }

  async function handleRegister() {
    const name = productName.trim();
    const cat = category.trim();
    if (!name || registering) return;
    setRegistering(true);
    // Silently submit a brand-new category for DevAdmin approval — same
    // pipeline BarcodeScannerModal/Order List/Stock Request already feed.
    if (cat && !approvedCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      orderCategoriesApi.submitNew(cat).catch(() => {});
    }
    try {
      await scannedProductApi.save({ barcode, name, category: cat || undefined, source: 'manual' });
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
      setJustRegistered(true);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save product' });
    }
    setRegistering(false);
  }
```

- [ ] **Step 6: Reset naming state in `scanAgain`**

Replace `scanAgain` (currently lines 112-117):

```tsx
  function scanAgain() {
    setPhase('scanning');
    setLastCode('');
    setBarcode('');
    setResult(null);
    setProductName(''); setCategory(''); setJustRegistered(false);
    clearPendingScan();
  }
```

- [ ] **Step 7: Replace the dead-end result and add the naming-phase render branch**

Replace the entire `phase === 'result' && result` block through the final `) : null}` (currently lines 225-282):

```tsx
        ) : phase === 'result' && result ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <View style={st.resultCard}>
              <View style={st.iconWrap}>
                <DollarSignIcon size={28} color={COLORS.secondary} strokeWidth={1.75} />
              </View>
              <Text style={st.productName}>{result.productName}</Text>
              {result.category ? (
                <View style={st.catChip}><Text style={st.catChipText}>{result.category}</Text></View>
              ) : null}

              {result.status !== 'not_added' && result.priceText ? (
                <>
                  <Text style={st.priceBig}>${result.priceText}</Text>
                  {result.dealText ? <Text style={st.dealText}>{result.dealText}</Text> : null}
                  {result.hasOverride && <Text style={st.overrideNote}>Custom price for your store</Text>}
                  {result.status && (
                    <View style={[st.statusChip, { borderColor: STATUS_COLOR[result.status] }]}>
                      <Text style={[st.statusChipText, { color: STATUS_COLOR[result.status] }]}>{STATUS_LABEL[result.status]}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={st.notAddedText}>
                    {result.status === 'needs_price' ? 'No price set yet. A manager can add one when labeling.' : 'Not priced at your store yet'}
                  </Text>
                  {result.status !== 'needs_price' && (
                    <>
                      {result.basePriceText != null && <Text style={st.baseHint}>Chain base price: ${result.basePriceText}</Text>}
                      <TouchableOpacity
                        style={[st.addBtn, adding && st.btnDim]}
                        onPress={handleAddToMyPrints}
                        disabled={adding}
                        accessibilityRole="button"
                        accessibilityLabel="Add to My Prints"
                      >
                        {adding ? <ActivityIndicator color="#fff" size="small" /> : (
                          <>
                            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
                            <Text style={st.addBtnText}>Add to My Prints</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>

            <Text style={st.barcodeSmall}>{result.barcode}</Text>

            <TouchableOpacity style={st.scanAgainBtn} onPress={scanAgain} accessibilityRole="button" accessibilityLabel="Check another price" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={st.scanAgainText}>Check another price</Text>
            </TouchableOpacity>
          </ScrollView>

        ) : phase === 'naming' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {justRegistered ? (
                <View style={st.resultCard}>
                  <View style={st.iconWrap}>
                    <CheckCircleIcon size={28} color={COLORS.secondary} strokeWidth={1.75} />
                  </View>
                  <Text style={st.productName}>{productName.trim()}</Text>
                  <Text style={st.notAddedText}>No price set yet. A manager can add one when labeling.</Text>
                </View>
              ) : (
                <>
                  <View style={st.barcodeChip}>
                    <Text style={st.barcodeChipLabel}>Barcode</Text>
                    <Text style={st.barcodeChipValue}>{barcode}</Text>
                  </View>

                  <Text style={st.namingHint}>
                    This barcode isn't in the label catalog yet.{'\n'}
                    Name it once - a manager can add a price when labeling.
                  </Text>

                  <Text style={st.fieldLabel}>Product name  <Text style={st.fieldLabelRequired}>*</Text></Text>
                  <TextInput
                    ref={nameRef}
                    style={st.fieldInput}
                    value={productName}
                    onChangeText={setProductName}
                    placeholder="e.g. Whole Milk 1 Gallon"
                    placeholderTextColor="#B0B8C4"
                    autoCapitalize="words"
                    autoCorrect={false}
                    returnKeyType="next"
                    maxLength={200}
                  />

                  <Text style={[st.fieldLabel, { marginTop: 16 }]}>Category  <Text style={st.fieldLabelSub}>(optional)</Text></Text>
                  <View style={{ position: 'relative' }}>
                    <TextInput
                      style={st.fieldInput}
                      value={category}
                      onChangeText={v => { setCategory(v); setShowCatSugg(true); }}
                      onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                      onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
                      placeholder="e.g. Dairy, Frozen Foods…"
                      placeholderTextColor="#B0B8C4"
                      autoCapitalize="words"
                      autoCorrect={false}
                      returnKeyType="done"
                      maxLength={100}
                    />
                    {showCatSugg && catSuggs.length > 0 && (
                      <View style={st.catSugg}>
                        {catSuggs.map(c => (
                          <TouchableOpacity key={c} style={st.catSuggRow}
                            onPress={() => { setCategory(c); setShowCatSugg(false); }}
                            accessibilityRole="button"
                            accessibilityLabel={`Use category ${c}`}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Text style={st.catSuggText}>{c}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    style={[st.addBtn, (!productName.trim() || registering) && st.btnDim]}
                    onPress={handleRegister}
                    disabled={!productName.trim() || registering}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Add product to catalog"
                  >
                    {registering ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
                        <Text style={st.addBtnText}>Add to Catalog</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <Text style={st.barcodeSmall}>{barcode}</Text>

              <TouchableOpacity style={st.scanAgainBtn} onPress={scanAgain} accessibilityRole="button" accessibilityLabel="Check another price" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={st.scanAgainText}>Check another price</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}
```

- [ ] **Step 8: Add the naming-phase styles**

In the `st` `StyleSheet.create({...})` object, add (values copied from `mobile/components/BarcodeScannerModal.tsx`'s equivalent styles for visual consistency):

```tsx
  fieldLabel:        { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldLabelSub:     { fontWeight: '400', color: COLORS.textMuted },
  fieldLabelRequired:{ fontWeight: '400', color: COLORS.textMuted },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: COLORS.text,
  },
  catSugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, marginTop: 2, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 8,
  },
  catSuggRow:  { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  catSuggText: { fontSize: 14, color: COLORS.text },
  barcodeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 10, padding: 12, marginBottom: 16,
  },
  barcodeChipLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  barcodeChipValue: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  namingHint: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20, marginBottom: 24 },
```

- [ ] **Step 9: Type-check mobile**

```bash
cd "S:/LUCKYAPP/mobile" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 10: Verify against the real dev server — Price Check registers a new barcode**

With the backend running and `$TOKEN`/`$STORE_ID` set from earlier tasks, simulate what `handleRegister` does (Price Check's own scan-and-lookup UI is a manual/device check in Task 12; this proves the underlying call registers both tables):

```bash
BARCODE="VERIFY_PRICECHECK_$(date +%s)"
curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"$BARCODE\",\"name\":\"Price Check Verify\",\"source\":\"manual\"}"

curl -s "http://localhost:3000/api/labels/lookup?storeId=$STORE_ID&barcode=$BARCODE" -H "Authorization: Bearer $TOKEN"
```

Expected: second call returns `"found":true,"priceText":null,"status":"not_added"` (the Label exists chain-wide with no price; this store hasn't added it to its own queue yet — exactly the state Price Check's "naming" flow leaves behind, matching Verification scenario 6 in the design spec).

- [ ] **Step 11: Commit**

```bash
cd "S:/LUCKYAPP" && git add mobile/components/PriceCheckModal.tsx
git commit -m "$(cat <<'EOF'
Price Check registers unknown barcodes instead of dead-ending

An unrecognized barcode previously showed "Not in the catalog" with
no way to act on it. It now prompts for a name + category (reusing
BarcodeScannerModal's naming pattern) and calls scannedProductApi.save
— which now also creates the matching priceless Label server-side
(Task 3). Also fixes several $null display bugs this modal already
had for the found-but-not-yet-priced-at-your-store case, which the
nullable base price exposes for the first time.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Mobile — category wiring in Catalog tabs (ScanTab, ManualTab)

**Files:**
- Modify: `mobile/app/(manager)/catalog.tsx`

**Interfaces:**
- Consumes: `orderCategoriesApi.getApproved()`/`.submitNew(name)` (mobile `services/api.ts`, unchanged).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add the missing `submitNew` call in `ManualTab`**

`ManualTab` already fetches approved categories and shows suggestions (`catsData`/`approvedCats`/`onCatChange`, lines 336-351) but never submits a genuinely new category name for approval. Replace `handleAdd` (currently lines 353-372):

```tsx
  async function handleAdd() {
    const trimName = name.trim();
    if (!trimName || adding) return;
    setAdding(true);
    const cat = category.trim();
    if (cat && !approvedCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      orderCategoriesApi.submitNew(cat).catch(() => {});
    }
    // Use a name-derived pseudo-barcode so the same product name doesn't create duplicates
    const bc = barcode.trim() || `NOBARCODE_${trimName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    try {
      await scannedProductApi.save({ barcode: bc, name: trimName, category: cat || undefined, source: 'manual' });
      setRecentItems(prev => [{ name: trimName, category: cat }, ...prev].slice(0, 30));
      setName('');
      setBarcode('');
      // keep category — manager is likely batch-adding from the same section of their book
      qc.invalidateQueries({ queryKey: ['catalog-list'] });
      nameRef.current?.focus();
    } catch (err: any) {
      Alert.alert(t('managerCatalog.saveFailedTitle'), err?.response?.data?.error || t('managerCatalog.checkConnection'));
    } finally {
      setAdding(false);
    }
  }
```

- [ ] **Step 2: Add category-suggestion state and query to `ScanTab`**

`ScanTab` currently has no approved-category wiring at all — its `catInput` field (in the `needs_name` phase) is a plain free-text input. Add state after the existing declarations in `ScanTab` (currently lines 86-92, ending with `const qc = useQueryClient();`):

```tsx
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [showCatSugg, setShowCatSugg] = useState(false);

  const { data: catsData } = useQuery({
    queryKey: ['approved-categories'],
    queryFn: orderCategoriesApi.getApproved,
  });
  useEffect(() => {
    setApprovedCats(catsData?.data?.data || []);
  }, [catsData]);

  function onCatInputChange(v: string) {
    setCatInput(v);
    if (v.trim()) {
      const q = v.toLowerCase();
      setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 4));
      setShowCatSugg(true);
    } else {
      setCatSuggs([]);
    }
  }
```

This requires `useEffect` in the top-level React import (currently `import React, { useState, useRef, useMemo } from 'react';` at line 1) — replace with:

```tsx
import React, { useState, useRef, useMemo, useEffect } from 'react';
```

- [ ] **Step 3: Wire the category input to suggestions and to `submitNew` in `ScanTab`**

Replace the category `TextInput` in the `needs_name` phase (currently lines 278-289):

```tsx
            <View style={{ position: 'relative' }}>
              <TextInput
                style={[s.namingInput, { marginTop: 8 }]}
                value={catInput}
                onChangeText={onCatInputChange}
                onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                onBlur={() => setTimeout(() => setShowCatSugg(false), 120)}
                placeholder={t('managerCatalog.categoryPlaceholderShort')}
                placeholderTextColor="#B0B8C4"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSaveName}
                maxLength={100}
              />
              {showCatSugg && catSuggs.length > 0 && (
                <View style={s.sugg}>
                  {catSuggs.map(c => (
                    <TouchableOpacity
                      key={c}
                      style={s.suggRow}
                      onPress={() => { setCatInput(c); setShowCatSugg(false); }}
                      accessibilityRole="button"
                      accessibilityLabel={t('managerCatalog.useCategoryLabel', { category: c })}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={s.suggText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
```

Replace `handleSaveName` (currently lines 174-190):

```tsx
  async function handleSaveName() {
    const name = nameInput.trim();
    if (!name || saving) return;
    setSaving(true);
    const cat = catInput.trim();
    if (cat && !approvedCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      orderCategoriesApi.submitNew(cat).catch(() => {});
    }
    try {
      await scannedProductApi.save({ barcode: curBarcode, name, category: cat || undefined, source: 'manual' });
      setResultName(name);
      setPhase('added');
      qc.invalidateQueries({ queryKey: ['catalog-list'] });
      setTimeout(resetToReady, 2200);
    } catch (err: any) {
      Alert.alert(t('managerCatalog.saveFailedTitle'), err?.response?.data?.error || t('managerCatalog.checkConnection'));
      resetToReady();
    } finally {
      setSaving(false);
    }
  }
```

- [ ] **Step 4: Type-check mobile**

```bash
cd "S:/LUCKYAPP/mobile" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Verify `submitNew` fires against the real dev server**

With the backend running and `$TOKEN` set, confirm the endpoint `ScanTab`/`ManualTab` now call behaves as expected (this proves the server side of the wiring; the mobile UI trigger itself is confirmed on-device/web-preview in Task 12):

```bash
NEWCAT="VerifyCatalogCat$(date +%s)"
curl -s -X POST http://localhost:3000/api/order-categories/submit \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"name\":\"$NEWCAT\"}"

curl -s "http://localhost:3000/api/order-categories/admin?status=PENDING" -H "Authorization: Bearer $TOKEN" | grep -o "$NEWCAT"
```

Expected: first call returns `{"success":true,...}`, second call's output includes the literal `$NEWCAT` string, confirming the pending category row was recorded.

- [ ] **Step 6: Commit**

```bash
cd "S:/LUCKYAPP" && git add "mobile/app/(manager)/catalog.tsx"
git commit -m "$(cat <<'EOF'
Wire ScanTab and ManualTab categories through the approval pipeline

ManualTab already suggested approved categories but never submitted a
genuinely new one for review; ScanTab had no suggestion wiring at all.
Both now match BarcodeScannerModal's existing orderCategoriesApi
getApproved()/submitNew() pattern, closing the last two entry points
where a category could be typed as free text with no suggestions and
no approval record.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Mobile — nullable price display in LabelsScreen

**Files:**
- Modify: `mobile/utils/labelStatus.ts`
- Modify: `mobile/components/LabelsScreen.tsx`

**Interfaces:**
- Consumes: `Label.priceText`/`StoreLabelItem.priceText`/`basePriceText: string | null` and `status: 'needs_price'` from `getAllLabels`/`getStoreLabels` (Task 5).
- Produces: nothing new consumed by later tasks.

- [ ] **Step 1: Add `'needs_price'` to `mobile/utils/labelStatus.ts`**

Replace the type + three status maps (currently lines 3-24):

```ts
export type LabelPrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed';

export const STATUS_LABEL: Record<LabelPrintStatus, string> = {
  not_added: 'Not Added',
  new: 'New',
  needs_reprint: 'Needs Reprint',
  needs_price: 'Needs Price',
  printed: 'Printed',
};

export const STATUS_COLOR: Record<LabelPrintStatus, string> = {
  not_added: '#8892A0',
  new: '#2563EB',
  needs_reprint: '#B7791F',
  needs_price: '#B7791F',
  printed: '#0F5132',
};

export const STATUS_BG: Record<LabelPrintStatus, string> = {
  not_added: '#F4F4F7',
  new: '#EFF6FF',
  needs_reprint: '#FFFBEB',
  needs_price: '#FFFBEB',
  printed: '#F0FDF4',
};
```

- [ ] **Step 2: Widen the local types in `LabelsScreen.tsx`**

Replace the local `LabelPrintStatus` type (currently line 21) — kept as a mirror of `mobile/utils/labelStatus.ts`, matching this file's existing pattern of not importing that type even though it imports the status maps from the same file:

```tsx
type LabelPrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed';
```

Replace `priceText` in the `Label` interface (currently line 26) and `effectivePrice` in `myStoreLabel` (currently line 38):

```tsx
interface Label {
  id: string;
  productName: string;
  priceText: string | null;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
  myStoreLabel?: {
    id: string;
    effectivePrice: string | null;
    printedAt: string | null;
    status: LabelPrintStatus;
    hasOverride: boolean;
    overrideExpiresAt: string | null;
  } | null;
}
```

Replace `basePriceText`/`priceText` in `StoreLabelItem` (currently lines 53, 55):

```tsx
  basePriceText: string | null;
  dealText: string | null;
  priceText: string | null;
```

- [ ] **Step 3: Fix the two null-unsafe `setFormPriceText(label.priceText)` call sites**

In `applyNameSuggestion` (currently line 248) and `openEditForm` (currently line 314), replace each occurrence of:

```tsx
    setFormPriceText(label.priceText);
```

with:

```tsx
    setFormPriceText(label.priceText || '');
```

- [ ] **Step 4: Exclude needs_price rows from My Prints selection**

Replace `allFilteredSelected` (currently line 215) and `toggleSelectAll` (currently lines 217-232):

```tsx
  const selectableMyPrints = filteredMyPrints.filter(l => l.storeLabelId && l.status !== 'needs_price');
  const allFilteredSelected = selectableMyPrints.length > 0 && selectableMyPrints.every(l => selectedIds.has(l.storeLabelId!));

  function toggleSelectAll() {
    const ids = selectableMyPrints.map(l => l.storeLabelId!);
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      if (allFilteredSelected) ids.forEach(id => { delete next[id]; });
      else ids.forEach(id => { if (!(id in next)) next[id] = 1; });
      return next;
    });
  }
```

- [ ] **Step 5: Fix `handlePrint` and `handlePrintCatalogItem`'s null-price handling**

Replace `handlePrint` (currently lines 431-459):

```tsx
  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = myPrints.filter((l): l is StoreLabelItem & { storeLabelId: string; priceText: string } =>
      !!l.storeLabelId && selectedIds.has(l.storeLabelId) && l.status !== 'needs_price' && l.priceText != null);
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      const entries: PrintableLabelEntry[] = toPrint.map(item => ({
        label: {
          id: item.id, productName: item.productName, priceText: item.priceText,
          dealText: item.dealText, barcode: item.barcode, template: item.template,
        },
        quantity: quantities[item.storeLabelId] ?? 1,
      }));
      await printLabels({ entries, shareAsPdf });
      const printItems = toPrint.map(item => ({ storeLabelId: item.storeLabelId, quantity: quantities[item.storeLabelId] ?? 1 }));
      try {
        await labelsApi.print(printItems);
      } catch {
        Toast.show({ type: 'error', text1: 'Printed, but failed to update status', text2: 'Pull to refresh to check' });
      }
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      await qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] });
      setSelectedIds(new Set());
      setQuantities({});
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }
```

Replace `handlePrintCatalogItem` (currently lines 466-490) — this also fixes a latent bug the nullable base price exposes: it was building the print entry from `item.priceText` (the catalog's chain-wide base price) instead of `item.myStoreLabel.effectivePrice` (this store's actual price, which may be an override), so a store with a custom override would print the wrong price for a base-priceless item:

```tsx
  async function handlePrintCatalogItem(item: Label) {
    if (!item.myStoreLabel || item.myStoreLabel.status === 'needs_price' || printingCatalogId) return;
    setPrintingCatalogId(item.id);
    try {
      const entries: PrintableLabelEntry[] = [{
        label: {
          // Guarded above: status !== 'needs_price' guarantees effectivePrice is set.
          id: item.id, productName: item.productName, priceText: item.myStoreLabel.effectivePrice!,
          dealText: item.dealText, barcode: item.barcode, template: item.template,
        },
        quantity: 1,
      }];
      await printLabels({ entries, shareAsPdf: false });
      try {
        await labelsApi.print([{ storeLabelId: item.myStoreLabel.id, quantity: 1 }]);
      } catch {
        Toast.show({ type: 'error', text1: 'Printed, but failed to update status', text2: 'Pull to refresh to check' });
      }
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      await qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Print failed', text2: err?.message });
    } finally {
      setPrintingCatalogId(null);
    }
  }
```

- [ ] **Step 6: Fix the addSheet's null-price display and dead "Add at base price" button**

Replace `openAddSheet` (currently lines 253-258) so a priceless item opens directly into custom-price mode:

```tsx
  function openAddSheet(label: Label) {
    setAddSheetItem(label);
    setAddSheetPriceMode(label.priceText != null ? 'base' : 'custom');
    setAddSheetPrice('');
    setAddSheetExpiryDays(null);
  }
```

Replace the base-price text and the always-rendered "Add at base price" button (currently lines 669-678) so the button only renders when there's an actual base price to add at:

```tsx
            <Text style={s.formTitle}>{addSheetItem?.productName}</Text>
            <Text style={s.addSheetSub}>
              {addSheetItem?.priceText != null ? `Base price: $${addSheetItem.priceText}` : 'No base price set yet. Enter your own price below.'}
            </Text>
            {addSheetItem?.priceText != null && (
              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: accentColor, marginTop: 16 }]}
                onPress={() => { setAddSheetPriceMode('base'); confirmAddToMyPrints(); }}
                accessibilityRole="button"
                accessibilityLabel={`Add at $${addSheetItem.priceText}`}
              >
                <Text style={s.saveBtnText}>Add at ${addSheetItem.priceText}</Text>
              </TouchableOpacity>
            )}
```

Replace the custom-price `TextInput`'s `placeholder` (currently line 688):

```tsx
                    placeholder={addSheetItem?.priceText ?? '0.00'}
```

- [ ] **Step 7: Fix `renderCatalogCard`'s and `renderMyPrintCard`'s null-price display and selection**

Replace the price line in `renderCatalogCard` (currently line 988):

```tsx
            <Text style={s.cardPrice}>{item.priceText != null ? `$${item.priceText} base` : 'No price set yet'}</Text>
```

Replace the checkbox `onPress` in `renderMyPrintCard` (currently line 1037):

```tsx
          onPress={() => item.storeLabelId && item.status !== 'needs_price' && toggleSelected(item.storeLabelId)}
```

Replace the price line in `renderMyPrintCard` (currently line 1052):

```tsx
            <Text style={s.cardPrice}>{item.priceText != null ? `$${item.priceText}${item.hasOverride ? ' (my price)' : ''}` : 'No price set. Set one before printing.'}</Text>
```

- [ ] **Step 8: Type-check mobile**

```bash
cd "S:/LUCKYAPP/mobile" && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Manual verification (device or web-preview)**

Using this repo's `project_usb_android_testing` technique (or the web-preview fallback), open the manager Labels screen. Confirm: a catalog item created from a scan (no price) shows "No price set yet" instead of "$null" or a blank; adding it to My Prints without setting a custom price shows a "Needs Price" badge (not "New"); its row checkbox in My Prints cannot be checked; and setting a custom price for it (via "Use a different price for my store") makes the checkbox and "New" status available again.

- [ ] **Step 10: Commit**

```bash
cd "S:/LUCKYAPP" && git add mobile/utils/labelStatus.ts mobile/components/LabelsScreen.tsx
git commit -m "$(cat <<'EOF'
Handle needs_price and nullable prices in mobile LabelsScreen

Mirrors admin's needs_price handling: My Prints excludes priceless
rows from selection/printing, the Add-to-My-Prints sheet opens
directly into custom-price mode when there's no base price to inherit
(instead of showing a dead "Add at $null" button), and several
$null display bugs are fixed across the catalog and My Prints cards.
Also fixes a latent bug handlePrintCatalogItem had independent of this
feature: it printed the catalog's base price instead of this store's
actual effective price (base or override), which the nullable base
price now makes user-visible.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: End-to-end verification

This task has no code changes — it walks the design spec's nine numbered Verification scenarios against a real running system, using the seeded DevAdmin account (`backend/src/utils/seed.ts`: phone `9999999999`, PIN `0000`) which satisfies every `STORE_MANAGER`+/`SUPER_ADMIN`+ role gate exercised below.

**Files:** none (verification only).

**Interfaces:** consumes every endpoint/UI surface touched by Tasks 1-11; produces nothing.

- [ ] **Step 1: Full type-check across all three sub-apps**

```bash
cd "S:/LUCKYAPP/backend" && npx tsc --noEmit
cd "S:/LUCKYAPP/admin" && npx tsc --noEmit
cd "S:/LUCKYAPP/mobile" && npx tsc --noEmit
```

Expected: all three pass clean. If any of them still show errors here, do not proceed — one of Tasks 1-11 was applied incompletely.

- [ ] **Step 2: Start the backend and grab a token + a real store id**

```bash
cd "S:/LUCKYAPP/backend" && npm run dev
```

In another terminal:

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"phone":"9999999999","pin":"0000"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.token))")
STORE_ID=$(curl -s http://localhost:3000/api/stores -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0].id))")
echo "TOKEN=$TOKEN"
echo "STORE_ID=$STORE_ID"
```

- [ ] **Step 3: Spec Verification 1+2 — a new scan creates a priceless Label; a repeat scan does not duplicate it**

```bash
BARCODE="E2E_$(date +%s)"
curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"$BARCODE\",\"name\":\"E2E Verify Product\",\"category\":\"Groceries\",\"source\":\"manual\"}"

curl -s http://localhost:3000/api/scanned-products -H "Authorization: Bearer $TOKEN" | grep -o "E2E Verify Product"
curl -s "http://localhost:3000/api/labels?myStoreId=$STORE_ID" -H "Authorization: Bearer $TOKEN" | grep -o "E2E Verify Product"

# Repeat "scan" (Stock Request would also call POST /scanned-products)
curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"$BARCODE\",\"name\":\"E2E Verify Product\",\"category\":\"Groceries\",\"source\":\"manual\"}"

curl -s http://localhost:3000/api/scanned-products -H "Authorization: Bearer $TOKEN" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const p = JSON.parse(d).data.find(x=>x.barcode==='$BARCODE');
  console.log('scanCount:', p.scanCount);
});"
```

Expected: both `grep` calls find a match (appears in both ScannedProduct list and Label catalog). After the second scan, `scanCount: 2` (incremented, not duplicated). Confirm no second Label row exists for this barcode by re-running the `getAllLabels` grep and confirming the match count stays at one occurrence of `"E2E Verify Product"`.

- [ ] **Step 4: Spec Verification 3 — editing a Label's price doesn't corrupt ScannedProduct's name/category**

```bash
LABEL_ID=$(curl -s "http://localhost:3000/api/labels/lookup?storeId=$STORE_ID&barcode=$BARCODE" -H "Authorization: Bearer $TOKEN" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data.id))")

curl -s -X PATCH "http://localhost:3000/api/labels/$LABEL_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"priceText":"3.29"}'

curl -s "http://localhost:3000/api/labels/lookup?storeId=$STORE_ID&barcode=$BARCODE" -H "Authorization: Bearer $TOKEN"
curl -s http://localhost:3000/api/scanned-products -H "Authorization: Bearer $TOKEN" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  const p = JSON.parse(d).data.find(x=>x.barcode==='$BARCODE');
  console.log(JSON.stringify({name:p.name, category:p.category}));
});"
```

Expected: the lookup now shows `"status":"new"` (no longer `needs_price`, since the base price is set and this label's own `createLabel` step earlier gave it a StoreLabel at this store). The ScannedProduct's `name`/`category` are still `"E2E Verify Product"`/`"Groceries"` — unaffected by the price-only edit.

- [ ] **Step 5: Spec Verification 4 — creating a Label directly in admin creates a matching ScannedProduct**

Already proven in Task 4 Step 8's curl verification. Re-confirm here with a fresh barcode for a clean record:

```bash
BARCODE2="E2E_LABELFIRST_$(date +%s)"
curl -s -X POST http://localhost:3000/api/labels \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"productName\":\"E2E Label First\",\"priceText\":\"5.99\",\"barcode\":\"$BARCODE2\"}"
curl -s "http://localhost:3000/api/scanned-products/barcode/$BARCODE2" -H "Authorization: Bearer $TOKEN"
```

Expected: second call returns `{"success":true,"data":{"name":"E2E Label First",...}}`.

- [ ] **Step 6: Spec Verification 5 — editing a ScannedProduct via the new admin Edit modal doesn't touch Label**

```bash
PRODUCT_ID=$(curl -s http://localhost:3000/api/scanned-products -H "Authorization: Bearer $TOKEN" | node -e "
let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{
  console.log(JSON.parse(d).data.find(x=>x.barcode==='$BARCODE2').id);
});")

curl -s -X PATCH "http://localhost:3000/api/scanned-products/$PRODUCT_ID" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"E2E Label First RENAMED"}'

curl -s "http://localhost:3000/api/labels/lookup?storeId=$STORE_ID&barcode=$BARCODE2" -H "Authorization: Bearer $TOKEN"
```

Expected: the Label lookup still shows `"productName":"E2E Label First"` (unchanged) even though the ScannedProduct was just renamed — proving `updateProduct` never reaches into `Label`.

- [ ] **Step 7: Spec Verification 6 — Price Check registration (manual/device check)**

This step requires the mobile app (device or web-preview per `project_mobile_web_preview_technique`/`project_usb_android_testing`). Open the manager Labels screen, tap Price Check, scan or manually enter a barcode that is genuinely new (e.g. `E2E_MOBILE_<timestamp>` via manual entry), confirm the naming form appears (Task 9), submit a name, and confirm the "No price set yet. A manager can add one when labeling." confirmation shows. Then, from a curl session, confirm both tables now have this barcode:

```bash
curl -s "http://localhost:3000/api/labels/lookup?storeId=$STORE_ID&barcode=<barcode used above>" -H "Authorization: Bearer $TOKEN"
curl -s "http://localhost:3000/api/scanned-products/barcode/<barcode used above>" -H "Authorization: Bearer $TOKEN"
```

Expected: both return the newly-registered product; the Label lookup shows `"priceText":null`.

- [ ] **Step 8: Spec Verification 7 — bulk print excludes a priceless Label (admin, live browser)**

Start admin (`cd admin && npm run dev`), log in as DevAdmin for real (not mocked — this scenario needs real backend state), navigate to Labels → Coverage. Select the `E2E Verify Product` label from Step 3 alongside at least one normally-priced label, click "Print for All Stores," and confirm the bulk-print queue that opens either omits the priceless one entirely or never offers it as printable (per Task 8's `PRINTABLE_STATUSES` exclusion). Also try Labels → By Store for `$STORE_ID`: confirm the priceless row's checkbox is absent and its Status column reads "Needs Price."

- [ ] **Step 9: Spec Verification 8 — a brand-new category on ScannedProducts goes through approval**

```bash
NEWCAT2="E2ECategory$(date +%s)"
curl -s -X POST http://localhost:3000/api/scanned-products \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"barcode\":\"E2E_CAT_$(date +%s)\",\"name\":\"E2E Category Test\",\"category\":\"$NEWCAT2\",\"source\":\"manual\"}"
```

Then, in the admin browser session from Step 8, open ScannedProducts, click Edit on any row, type `$NEWCAT2` (or a different brand-new name) into the Category field, and save — confirm (via the Network tab or by checking `GET /order-categories/admin?status=PENDING`) that `POST /order-categories/submit` fired for that name.

- [ ] **Step 10: Spec Verification 9 — Duplicate Label still works**

In the admin browser session, go to Labels → Catalog, find any label with a barcode, click "Duplicate," change nothing, and Save. Confirm a second Label row now exists with the identical barcode (via `GET /api/labels`, grep for that barcode and count the occurrences — expect 2), proving `Label.barcode`'s non-uniqueness was never touched by this work.

- [ ] **Step 11: Clean up verification data**

```bash
curl -s -X DELETE "http://localhost:3000/api/scanned-products/$PRODUCT_ID" -H "Authorization: Bearer $TOKEN"
# Repeat DELETE for any other E2E_* ScannedProduct ids created above, and
# DELETE /api/labels/:labelId for any E2E-prefixed Labels, via the admin
# Catalog tab's Delete button or curl, so the verification run doesn't leave
# permanent test rows in a real dev database.
```

- [ ] **Step 12: Final commit (if any verification step required a fix)**

If every step above passed without needing a code change, there is nothing to commit for this task. If a verification step surfaced a bug, fix it in the relevant task's file, re-run that task's own type-check and verification steps, then commit with a message describing what the verification pass caught, e.g.:

```bash
git add -A
git commit -m "$(cat <<'EOF'
Fix issue found during end-to-end sync verification

<describe the specific gap found in Task 12 and the fix applied>

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

**1. Spec coverage** — every numbered item in the design spec's Backend/Admin web/Mobile sections maps to a task:
- `Label.priceText` nullable + `Label.brand` → Task 1.
- `ensureLabelForBarcode`/`ensureScannedProductForBarcode` → Task 2.
- `saveProduct` calls `ensureLabelForBarcode`, new `PATCH /scanned-products/:id` → Task 3.
- `createLabel`/`updateLabel` call `ensureScannedProductForBarcode`, schemas widened, client-side calls deleted → Task 4.
- `resolveEffectivePrice`/`printStatus`/`markLabelsPrinted` nullable-price handling → Task 5.
- `ScannedProducts.tsx` Edit + category wiring → Task 6.
- `Labels.tsx` nullable price display + needs_price → Task 7.
- `PrintTray`/`StoreLabelsPanel`/`CoverageView` needs_price, `HealthView`/`Dashboard`/`BulkPrintWizard` verified → Task 8.
- `PriceCheckModal.tsx` registration flow → Task 9.
- `catalog.tsx` ScanTab/ManualTab category wiring → Task 10.
- `LabelsScreen.tsx` nullable price display → Task 11.
- All 9 spec Verification scenarios → Task 12, one step each (Steps 3-10).
- Explicitly-out-of-scope items (Request Product, category enum, Label.barcode uniqueness, the storeIds[0] audit-log-only pattern) are called out in Global Constraints and not touched by any task. No gaps found.

**2. Placeholder scan** — every step above contains complete, real code (no `TODO`, no "similar to Task N," no "add error handling" without showing it). The one intentionally-open-ended step is Task 12 Step 12 ("if a verification step surfaced a bug, fix it") — this is correct, not a placeholder, since Task 12 is the verification task and cannot know in advance whether Tasks 1-11 have a defect; if one is found there, the fix belongs in the originating task's file, not invented here.

**3. Type/name consistency across tasks** — checked and confirmed:
- `ensureLabelForBarcode(barcode, { productName, category, brand, creatorStoreId, creatorId })` — identical signature in Task 2 (definition) and Task 3 Step 2 (call site).
- `ensureScannedProductForBarcode(barcode, { name, category, brand })` — identical signature in Task 2 (definition) and Task 4 Steps 3-4 (call sites).
- `resolveEffectivePrice(label, storeLabel?): string | null` — defined in Task 5 Step 1, consumed with the same two-argument shape in Task 5 Steps 3-7.
- `printStatus(storeLabel, effectivePrice): PrintStatus` — the signature changes from one argument to two in Task 5 Step 2; every one of its five call sites is updated in the same task (Steps 3-7), so the backend never sits in a state where some callers pass one argument and others pass two.
- `PrintStatus`/`LabelPrintStatus` gains `'needs_price'` in five independent places that must all agree on the string literal: backend `labels.controller.ts` (Task 5), `admin/src/utils/labelStatus.ts` (Task 8), `mobile/utils/labelStatus.ts` (Task 11), `mobile/components/LabelsScreen.tsx`'s local duplicate (Task 11), and `mobile/components/PriceCheckModal.tsx`'s local duplicate (Task 9) — all five spell it `'needs_price'` identically.
- `PrintTrayItem.priceText` is deliberately widened in Task 8 (not Task 7) to avoid a cross-task compile break: Task 7's `Labels.tsx` catalog-tab usage narrows with a type-guard filter (`(l): l is Label & { priceText: string } => ...`) so it never depends on `PrintTrayItem` accepting `null`, and stays valid both before and after Task 8 widens that type.
- `scannedProductApi.update(id, data)` — defined in Task 6 Step 1, called with the same shape in Task 6 Step 5.

No inconsistencies found. Nothing required fixing during this review pass.

---

Plan complete and saved to `docs/superpowers/plans/2026-09-12-scanned-product-label-sync.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
