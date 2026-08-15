# Store-Scoped Label Print Queue & Print Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tag each shelf/price label with who and which store created it, track whether it's been printed (reset on edit), and default the mobile Labels screen to a shared per-store "Ready to Print" queue instead of the entire cross-store history — while logging every print through the existing audit system so admin's Activity Log becomes a real "who's doing what, per store" view for labels.

**Architecture:** Three nullable columns added to the existing chain-wide `Label` table (`createdByStoreId`, `createdById`, `printedAt`) — no reversal to per-store labels, no new print-log model. A new `POST /labels/print` endpoint marks the given labels printed and writes one `PRINT_LABEL` audit entry (reusing the `audit()` util and `AuditLog` table that already exist and already power admin's Activity Log page). Mobile's Labels screen gains a two-way toggle between the new filtered "Ready to Print" view (this store, unprinted) and the existing unfiltered "Full Catalog" view.

**Tech Stack:** Node/Express + Prisma + Zod (backend), React + react-router-dom (admin, inline `style` objects), React Native + Expo (mobile). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through (final task appends a checklist to `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`).

**Spec:** `docs/superpowers/specs/2026-08-14-label-print-queue-design.md` — read this first for the full rationale; this plan doesn't repeat the "why," only the "how."

## Global Constraints

- `createdByStoreId`/`createdById` are set once at creation from `req.user!.storeIds?.[0] ?? null` / `req.user!.id`, and never changed by later edits — only `printedAt` toggles after creation.
- Every `updateLabel` call unconditionally resets `printedAt: null`, regardless of what changed — no branching on "was it previously printed."
- The `Ready to Print` view is a **shared per-store queue** — every Store Manager/Employee at the same store sees the same list, not a personal-only view scoped to who created each entry.
- Print or PDF export both count as "printed" — both call `POST /labels/print` before generating output, on both mobile and admin web.
- Admin web never attaches a `storeId` to labels it creates or prints (`req.user!.storeIds?.[0] ?? null` naturally evaluates to `null` for DevAdmin/SuperAdmin, who have no `storeIds`) — no store-picker added to admin's flow.
- No new admin page and no new print-log model — reuse the existing `AuditLog` table/`audit()` util and the existing Activity Log page (`admin/src/pages/ActivityLog.tsx`), only adding a `storeId` to the existing label audit calls and a new `PRINT_LABEL` action.
- The logging call (`labelsApi.print(...)`) is fire-and-forget on both platforms — its failure must never block the actual print/PDF output from being generated.

---

## File Structure

**Backend — modified:**
- `backend/prisma/schema.prisma` — `Label` gains `createdByStoreId`, `createdById`, `printedAt` + a new index
- `backend/src/controllers/labels.controller.ts` — `createLabel`/`updateLabel`/`deleteLabel`/`getAllLabels` updated; new `markLabelsPrinted` export
- `backend/src/routes/index.ts` — import + register `POST /labels/print`

**Admin — modified:**
- `admin/src/services/api.ts` — new `labelsApi.print`
- `admin/src/pages/Labels.tsx` — `handlePrintSelected` calls the new endpoint
- `admin/src/pages/ActivityLog.tsx` — `ACTION_META` gains 4 label entries

**Mobile — modified:**
- `mobile/services/api.ts` — new `labelsApi.print` and `labelsApi.getReadyToPrint`
- `mobile/components/LabelsScreen.tsx` — Ready to Print / Full Catalog toggle; `handlePrint` calls the new endpoint

**Docs — modified:**
- `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` — append a verification section

---

### Task 1: Backend — `Label` print-tracking fields + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260814020000_add_label_print_tracking/migration.sql`

**Interfaces:**
- Produces: `Label.createdByStoreId: string | null`, `Label.createdById: string | null`, `Label.printedAt: Date | null` — every later backend task reads/writes these exact field names.

- [ ] **Step 1: Add the three fields and the index**

In `backend/prisma/schema.prisma`, replace the current `Label` model:

```prisma
model Label {
  id          String        @id @default(uuid())
  productName String
  priceText   String        // Regular mode: just the number ("3.99"), $ is added at render time. Deal mode: freeform ("2 for $5", "BOGO").
  isDeal      Boolean       @default(false) // false = Regular Price (priceText is a plain number, rendered with a fixed "$"), true = Deal (priceText is freeform, rendered as-is)
  barcode     String?       // the physical product's own barcode (UPC/EAN/etc) for order lookups — independent of priceText/deal
  template    LabelTemplate @default(CLASSIC_RED_BLACK)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  @@map("labels")
}
```

with:

```prisma
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String        // Regular mode: just the number ("3.99"), $ is added at render time. Deal mode: freeform ("2 for $5", "BOGO").
  isDeal           Boolean       @default(false) // false = Regular Price (priceText is a plain number, rendered with a fixed "$"), true = Deal (priceText is freeform, rendered as-is)
  barcode          String?       // the physical product's own barcode (UPC/EAN/etc) for order lookups — independent of priceText/deal
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

- [ ] **Step 2: Write the migration**

`backend/prisma/migrations/20260814020000_add_label_print_tracking/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "labels" ADD COLUMN     "createdByStoreId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "printedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "labels_createdByStoreId_printedAt_idx" ON "labels"("createdByStoreId", "printedAt");
```

- [ ] **Step 3: Regenerate the Prisma client and apply the migration**

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

Run: `npx prisma migrate deploy`
Expected: `Applying migration 20260814020000_add_label_print_tracking` then `All migrations have been successfully applied.` This is purely additive (3 nullable columns + 1 index on top of existing columns) — safe to apply directly ahead of the code push, matching this project's established rule for non-destructive schema changes.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors (nothing references the new fields yet — this just confirms the regenerated client compiles).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260814020000_add_label_print_tracking
git commit -m "feat: add print-tracking fields to Label (createdByStoreId, createdById, printedAt)"
```

---

### Task 2: Backend — update `createLabel`/`updateLabel`/`deleteLabel`/`getAllLabels`

**Files:**
- Modify: `backend/src/controllers/labels.controller.ts`

**Interfaces:**
- Consumes: `Label.createdByStoreId`/`createdById`/`printedAt` (Task 1), `AuthRequest`/`AuthUser` (`backend/src/types/index.ts` — `AuthUser.storeIds?: string[]`, already exists, no change needed).
- Produces: `getAllLabels` now accepts `?storeId=<id>&unprinted=true` query params — Task 6 (mobile API client) calls this exact shape.

- [ ] **Step 1: Update `getAllLabels` to support optional filtering**

Replace:

```ts
export async function getAllLabels(req: AuthRequest, res: Response) {
  const labels = await prisma.label.findMany({
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ success: true, data: labels });
}
```

with:

```ts
export async function getAllLabels(req: AuthRequest, res: Response) {
  const { storeId, unprinted } = req.query;
  const where: Record<string, unknown> = {};
  if (typeof storeId === 'string' && storeId) where.createdByStoreId = storeId;
  if (unprinted === 'true') where.printedAt = null;

  const labels = await prisma.label.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ success: true, data: labels });
}
```

- [ ] **Step 2: Stamp creator fields in `createLabel` and add `storeId` to its audit call**

Replace:

```ts
export async function createLabel(req: AuthRequest, res: Response) {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const label = await prisma.label.create({ data: parsed.data });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText },
  });

  res.status(201).json({ success: true, data: label });
}
```

with:

```ts
export async function createLabel(req: AuthRequest, res: Response) {
  const parsed = createLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const storeId = req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.create({
    data: {
      ...parsed.data,
      createdByStoreId: storeId,
      createdById: req.user!.id,
    },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText },
    storeId,
  });

  res.status(201).json({ success: true, data: label });
}
```

- [ ] **Step 3: Reset `printedAt` on every edit in `updateLabel` and add `storeId` to its audit call**

Replace:

```ts
export async function updateLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const parsed = updateLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const label = await prisma.label.update({
    where: { id: labelId },
    data: parsed.data,
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText },
  });

  res.json({ success: true, data: label });
}
```

with:

```ts
export async function updateLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const parsed = updateLabelSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const storeId = req.user!.storeIds?.[0] ?? null;

  const label = await prisma.label.update({
    where: { id: labelId },
    data: { ...parsed.data, printedAt: null },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'UPDATE_LABEL', entity: 'label', entityId: label.id,
    details: { productName: label.productName, priceText: label.priceText },
    storeId,
  });

  res.json({ success: true, data: label });
}
```

- [ ] **Step 4: Add `storeId` to `deleteLabel`'s audit call**

Replace:

```ts
export async function deleteLabel(req: AuthRequest, res: Response) {
  const { labelId } = req.params;

  const deleted = await prisma.label.delete({ where: { id: labelId } });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_LABEL', entity: 'label', entityId: deleted.id,
    details: { productName: deleted.productName },
  });

  res.json({ success: true, data: deleted });
}
```

with:

```ts
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
```

- [ ] **Step 5: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/labels.controller.ts
git commit -m "feat: stamp Label creator/store, reset printedAt on edit, filter getAllLabels"
```

---

### Task 3: Backend — `POST /labels/print` endpoint

**Files:**
- Modify: `backend/src/controllers/labels.controller.ts`
- Modify: `backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `Label.printedAt` (Task 1), `audit()` (`backend/src/utils/audit.ts` — already exists, unchanged: `audit({ actorId, actorName, actorRole, action, entity, entityId?, details?, storeId? }): void`).
- Produces: `markLabelsPrinted(req, res)` export, routed as `POST /labels/print` with body `{ labelIds: string[] }` — Task 4 (admin) and Task 6 (mobile) API clients call this exact path/body shape.

- [ ] **Step 1: Add the new controller function**

At the end of `backend/src/controllers/labels.controller.ts`, add:

```ts
const printLabelsSchema = z.object({
  labelIds: z.array(z.string().uuid()).min(1),
});

export async function markLabelsPrinted(req: AuthRequest, res: Response) {
  const parsed = printLabelsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { labelIds } = parsed.data;
  const storeId = req.user!.storeIds?.[0] ?? null;

  await prisma.label.updateMany({
    where: { id: { in: labelIds } },
    data: { printedAt: new Date() },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PRINT_LABEL', entity: 'label',
    details: { count: labelIds.length, labelIds },
    storeId,
  });

  res.json({ success: true, data: { printedCount: labelIds.length } });
}
```

- [ ] **Step 2: Register the route**

In `backend/src/routes/index.ts`, find:

```ts
import { getAllLabels, createLabel, updateLabel, deleteLabel } from '../controllers/labels.controller';
```

Replace with:

```ts
import { getAllLabels, createLabel, updateLabel, deleteLabel, markLabelsPrinted } from '../controllers/labels.controller';
```

Then find:

```ts
router.get   ('/labels',                authenticate, requireRole(Role.EMPLOYEE), getAllLabels);
router.post  ('/labels',                authenticate, requireRole(Role.EMPLOYEE), createLabel);
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
```

`/labels/print` is registered **before** `/labels/:labelId` — Express matches routes in registration order, and `:labelId` would otherwise never let a literal `/print` path segment reach the right handler if `PATCH`/`DELETE` used the same prefix (defensive ordering; in this specific case the HTTP methods don't actually collide with GET/POST, but keeping the literal path before the param path is the correct general pattern and costs nothing).

- [ ] **Step 3: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/controllers/labels.controller.ts backend/src/routes/index.ts
git commit -m "feat: add POST /labels/print to mark labels printed and log a PRINT_LABEL audit event"
```

---

### Task 4: Admin — wire the print button to log the print event

**Files:**
- Modify: `admin/src/services/api.ts`
- Modify: `admin/src/pages/Labels.tsx`

**Interfaces:**
- Consumes: `POST /labels/print` (Task 3).
- Produces: `labelsApi.print(labelIds: string[]): Promise<AxiosResponse>` — no other task depends on this.

- [ ] **Step 1: Add the API client method**

In `admin/src/services/api.ts`, find:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
```

Replace with:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  print: (labelIds: string[]) => api.post('/labels/print', { labelIds }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
```

(The closing `};` of the object is unchanged — this only adds one new line before `delete`.)

- [ ] **Step 2: Call it from `handlePrintSelected`**

In `admin/src/pages/Labels.tsx`, find:

```ts
  function handlePrintSelected() {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0) return;
    printLabels(toPrint);
  }
```

Replace with:

```ts
  function handlePrintSelected() {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0) return;
    labelsApi.print(toPrint.map(l => l.id)).catch(() => {});
    printLabels(toPrint);
    qc.invalidateQueries({ queryKey: ['labels'] });
  }
```

The logging call is fire-and-forget (`.catch(() => {})`, not awaited) — a failure to log must never stop the actual print from happening, since the physical labels are what the user actually needs. `qc` is already in scope (declared at the top of the component as `const qc = useQueryClient();`).

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual check**

Run the admin dev server (`cd admin && npm run dev`), log in as DevAdmin/SuperAdmin, open Labels, select a label, click "Print Selected." Confirm the print dialog still opens exactly as before (the new logging call shouldn't change or delay the print flow).

- [ ] **Step 5: Commit**

```bash
git add admin/src/services/api.ts admin/src/pages/Labels.tsx
git commit -m "feat: log a print event from admin web's Labels page"
```

---

### Task 5: Admin — style label actions in Activity Log

**Files:**
- Modify: `admin/src/pages/ActivityLog.tsx`

**Interfaces:**
- Consumes: the `PRINT_LABEL`/`CREATE_LABEL`/`UPDATE_LABEL`/`DELETE_LABEL` audit `action` strings (Task 2, Task 3 — must match exactly).

- [ ] **Step 1: Add the four label entries to `ACTION_META`**

Find:

```ts
  // Store Requests
  SUBMIT_STORE_REQUEST:      { label: 'Store Request',          color: '#f59e0b', bg: '#f59e0b18', icon: '📋' },
  ACKNOWLEDGE_STORE_REQUEST: { label: 'Acknowledge Request',    color: '#2DC653', bg: '#2DC65318', icon: '✅' },
};
```

Replace with:

```ts
  // Store Requests
  SUBMIT_STORE_REQUEST:      { label: 'Store Request',          color: '#f59e0b', bg: '#f59e0b18', icon: '📋' },
  ACKNOWLEDGE_STORE_REQUEST: { label: 'Acknowledge Request',    color: '#2DC653', bg: '#2DC65318', icon: '✅' },
  // Labels
  CREATE_LABEL:              { label: 'Create Label',           color: '#1D3557', bg: '#1D355718', icon: '🏷️' },
  UPDATE_LABEL:              { label: 'Update Label',           color: '#1D3557', bg: '#1D355718', icon: '✏️' },
  DELETE_LABEL:              { label: 'Delete Label',           color: '#E63946', bg: '#E6394618', icon: '🗑️' },
  PRINT_LABEL:               { label: 'Print Label(s)',         color: '#0f5132', bg: '#0f513218', icon: '🖨️' },
};
```

- [ ] **Step 2: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Manual check**

With the admin dev server running and at least one label created/edited/printed earlier in this session's testing, open Activity Log as DevAdmin/SuperAdmin. Confirm `CREATE_LABEL`/`UPDATE_LABEL`/`DELETE_LABEL`/`PRINT_LABEL` rows show the new icons/labels/colors instead of a generic fallback.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/ActivityLog.tsx
git commit -m "feat: add icons/labels for label actions in Activity Log"
```

---

### Task 6: Mobile — `labelsApi.print` and `labelsApi.getReadyToPrint`

**Files:**
- Modify: `mobile/services/api.ts`

**Interfaces:**
- Consumes: `POST /labels/print` (Task 3), `GET /labels?storeId=&unprinted=true` (Task 2).
- Produces: `labelsApi.print(labelIds: string[])`, `labelsApi.getReadyToPrint(storeId: string)` — Task 7 calls both by these exact names.

- [ ] **Step 1: Add both methods**

In `mobile/services/api.ts`, find:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
```

Replace with:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  getReadyToPrint: (storeId: string) => api.get(`/labels?storeId=${encodeURIComponent(storeId)}&unprinted=true`),
  create: (data: { productName: string; priceText: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  print: (labelIds: string[]) => api.post('/labels/print', { labelIds }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
```

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/services/api.ts
git commit -m "feat: add labelsApi.print and labelsApi.getReadyToPrint"
```

---

### Task 7: Mobile — Ready to Print / Full Catalog toggle in `LabelsScreen.tsx`

**Files:**
- Modify: `mobile/components/LabelsScreen.tsx`

**Interfaces:**
- Consumes: `labelsApi.getReadyToPrint`/`labelsApi.print` (Task 6), `useAuthStore` (already imported in this file — `user?.storeIds?: string[]`).

- [ ] **Step 1: Add view-mode state and switch the query**

Find:

```ts
  const [printing, setPrinting] = useState(false);
  const [showNameSugg, setShowNameSugg] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mobile-labels'],
    queryFn: labelsApi.getAll,
  });
  const labels: Label[] = data?.data?.data || [];
```

Replace with:

```ts
  const [printing, setPrinting] = useState(false);
  const [showNameSugg, setShowNameSugg] = useState(false);
  const [viewMode, setViewMode] = useState<'ready' | 'catalog'>('ready');

  const storeId = user?.storeIds?.[0];

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mobile-labels', viewMode, storeId],
    queryFn: () =>
      viewMode === 'ready' && storeId
        ? labelsApi.getReadyToPrint(storeId)
        : labelsApi.getAll(),
  });
  const labels: Label[] = data?.data?.data || [];
```

- [ ] **Step 2: Call the print-logging endpoint from `handlePrint`**

Find:

```ts
  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      await printLabels({ labels: toPrint, shareAsPdf });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }
```

Replace with:

```ts
  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      labelsApi.print(toPrint.map(l => l.id)).catch(() => {});
      await printLabels({ labels: toPrint, shareAsPdf });
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }
```

The logging call is fire-and-forget, same reasoning as Task 4 — never let it block or fail the actual print. `qc` is already in scope (`const qc = useQueryClient();`, declared near the top of the component).

- [ ] **Step 3: Add the toggle UI and update the header/empty-state text**

Find:

```tsx
      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
        <Text style={s.headerSub}>{labels.length} in the shared catalog</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : labels.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>No labels yet</Text>
          <Text style={s.emptySub}>Scan an item to create the first one</Text>
        </View>
      ) : (
```

Replace with:

```tsx
      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
        <Text style={s.headerSub}>
          {viewMode === 'ready' ? `${labels.length} ready to print` : `${labels.length} in the shared catalog`}
        </Text>
      </View>

      <View style={s.viewToggleRow}>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'ready' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('ready')}
          accessibilityRole="button"
          accessibilityLabel="Show labels ready to print for my store"
        >
          <Text style={s.viewToggleText}>Ready to Print</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'catalog' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('catalog')}
          accessibilityRole="button"
          accessibilityLabel="Show the full shared catalog"
        >
          <Text style={s.viewToggleText}>Full Catalog</Text>
        </TouchableOpacity>
      </View>

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
      ) : (
```

- [ ] **Step 4: Add the toggle styles**

Find (in the `StyleSheet.create` block):

```ts
  headerSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
```

Replace with:

```ts
  headerSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  viewToggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  viewToggleChip: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  viewToggleText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
```

- [ ] **Step 5: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual click-through (on a real Android device, per `project_usb_android_testing`)**

1. As a Store Manager, scan a new item → confirm it appears in "Ready to Print" immediately.
2. Log in as an Employee at the *same* store on a second session/device → confirm they see the same item in their own "Ready to Print" (shared queue, not personal).
3. Select and print it → confirm it disappears from "Ready to Print" after a refresh, and still appears in "Full Catalog."
4. Edit that label's price from "Full Catalog" → confirm it reappears in "Ready to Print."
5. Log in as a Store Manager at a *different* store → confirm neither store's items leak into the other's "Ready to Print," but both appear together in "Full Catalog."

- [ ] **Step 7: Commit**

```bash
git add mobile/components/LabelsScreen.tsx
git commit -m "feat: add Ready to Print / Full Catalog toggle to mobile LabelsScreen"
```

---

### Task 8: Update the consolidated manual test checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Append a new section**

Add at the end of the file:

```markdown
## 12. Store-scoped label print queue + print tracking (2026-08-14)

- [ ] As Store Manager, scan a new item → confirm it appears in "Ready to Print" for your store immediately
- [ ] As an Employee at the *same* store, confirm they see that same item in their own "Ready to Print" view (shared queue)
- [ ] Select it and tap Print → confirm it disappears from "Ready to Print" (after refresh) and still shows up in "Full Catalog"
- [ ] Edit that label's price from "Full Catalog" → confirm it reappears in "Ready to Print"
- [ ] As a Store Manager at a *different* store, confirm neither store's items appear in the other's "Ready to Print," but both show together in "Full Catalog"
- [ ] As DevAdmin/SuperAdmin, create and print a label from admin web → confirm it never appears in any store's "Ready to Print" queue
- [ ] As DevAdmin/SuperAdmin, open Activity Log and filter by store and by action → confirm `CREATE_LABEL`/`UPDATE_LABEL`/`DELETE_LABEL`/`PRINT_LABEL` events appear with proper icons, correctly attributed to the store where the action happened (or no store, for admin-web actions)
- [ ] Tap PDF instead of Print → confirm it also marks the labels as printed (not just the native Print button)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add label print queue section to the manual test checklist"
```
