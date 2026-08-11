# Shelf/Price Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let DevAdmin/SuperAdmin build a per-store catalog of printable shelf/price labels (plain prices or "2 for $X" deal text) and print a batch of them as an A4 grid via the browser's native print dialog.

**Architecture:** A new `Label` Prisma model, scoped per-store like `OrderList` (required `storeId`, no chain-wide broadcast concept). Standard CRUD controller + routes, gated to `SUPER_ADMIN` and above. A new admin page (`Labels.tsx`) using the same store-picker-sidebar layout as `OrderList.tsx`/`StoreRequests.tsx`, plus a print utility modeled directly on the existing `invoicePdf.ts` pattern (open a blank tab, write styled HTML, auto-fire `window.print()`) — no new dependencies.

**Tech Stack:** React + react-router-dom (admin, inline `style` objects), Node/Express + Prisma + Zod (backend). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through (final task appends a checklist to `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`).

**Spec:** `docs/superpowers/specs/2026-08-11-shelf-price-labels-design.md` — read this first for the full rationale; this plan doesn't repeat the "why," only the "how."

## Global Constraints

- DevAdmin/SuperAdmin only — no Store Manager or Employee access, enforced via `requireRole(Role.SUPER_ADMIN)` (a *minimum*-role check, so `DEV_ADMIN` passes too without listing it separately).
- Every label belongs to exactly one store — `storeId` is required (not nullable), matching `OrderList`, not `Offer`/`Banner`'s optional `storeId`.
- `priceText` is a single freeform string covering both plain prices (`"$3.99"`) and deal pricing (`"2 for $5"`) — no separate structured price/dealCount fields.
- v1 ships exactly one print template, `CLASSIC_RED_BLACK` — the `LabelTemplate` enum exists so more can be added later without a new migration each time, but only build the one template now.
- No barcode, no product image, no cashback-rate display on the label, no `ScannedProduct` catalog integration — all explicitly out of scope per the spec.
- Print mechanism is the browser's native `window.print()` via a new tab, exactly matching `admin/src/utils/invoicePdf.ts`'s existing pattern — no new PDF library.

---

## File Structure

**Backend — new:**
- `backend/src/controllers/labels.controller.ts` — `getLabelsForStore`, `createLabel`, `updateLabel`, `deleteLabel`

**Backend — modified:**
- `backend/prisma/schema.prisma` — new `Label` model + `LabelTemplate` enum; add `labels Label[]` to `Store`
- `backend/src/routes/index.ts` — import + register the four `/labels` routes

**Admin — new:**
- `admin/src/pages/Labels.tsx` — store-picker sidebar + label table + add/edit modal + "Print Selected"
- `admin/src/utils/printLabels.ts` — the print-grid generator

**Admin — modified:**
- `admin/src/services/api.ts` — new `labelsApi`
- `admin/src/App.tsx` — new `/labels` route
- `admin/src/components/AppSidebar.tsx` — new "Labels" nav item (DevAdmin/SuperAdmin only)

**Docs — modified:**
- `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` — append a verification section

---

### Task 1: Backend — `Label` model + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `Label` model (`id`, `storeId`, `productName`, `priceText`, `template: LabelTemplate`, `createdAt`, `updatedAt`) and `LabelTemplate` enum (`CLASSIC_RED_BLACK`) — every later task depends on this exact shape.

- [ ] **Step 1: Add the `LabelTemplate` enum and `Label` model**

Add this near the other per-store content models (e.g. right after the `Banner` model, `schema.prisma:494`):

```prisma
enum LabelTemplate {
  CLASSIC_RED_BLACK
}

model Label {
  id          String        @id @default(uuid())
  storeId     String
  productName String
  priceText   String        // freeform: "$3.99" or "2 for $5"
  template    LabelTemplate @default(CLASSIC_RED_BLACK)
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  store Store @relation(fields: [storeId], references: [id], onDelete: Cascade)

  @@index([storeId])
  @@map("labels")
}
```

- [ ] **Step 2: Add the back-relation on `Store`**

In the `Store` model, add `labels Label[]` immediately after `adminNotices AdminNotice[]` (`schema.prisma:334`).

- [ ] **Step 3: Generate the migration**

Run: `cd backend && npx prisma migrate dev --name add_labels`
Expected: a new folder under `backend/prisma/migrations/` timestamped today, containing a `migration.sql` that creates the `labels` table and the `LabelTemplate` enum type. Prisma Client regenerates automatically as part of this command.

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (nothing references the new model yet, so this just confirms the generated client compiles).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add Label model for printable shelf/price labels"
```

---

### Task 2: Backend — `labels.controller.ts`

**Files:**
- Create: `backend/src/controllers/labels.controller.ts`

**Interfaces:**
- Consumes: `Label`/`LabelTemplate` from `@prisma/client` (Task 1), `AuthRequest` from `../types`, `prisma` from `../config/prisma`, `audit` from `../utils/audit`.
- Produces: `getLabelsForStore(req, res)`, `createLabel(req, res)`, `updateLabel(req, res)`, `deleteLabel(req, res)` — Task 3 imports and routes to these by exact name.

- [ ] **Step 1: Write the controller**

```ts
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { LabelTemplate } from '@prisma/client';
import { audit } from '../utils/audit';

const createLabelSchema = z.object({
  storeId: z.string().uuid(),
  productName: z.string().min(1).max(120),
  priceText: z.string().min(1).max(40),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
});

export async function getLabelsForStore(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const labels = await prisma.label.findMany({
    where: { storeId },
    orderBy: { updatedAt: 'desc' },
  });

  res.json({ success: true, data: labels });
}

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
    storeId: label.storeId,
  });

  res.status(201).json({ success: true, data: label });
}

const updateLabelSchema = z.object({
  productName: z.string().min(1).max(120).optional(),
  priceText: z.string().min(1).max(40).optional(),
  template: z.nativeEnum(LabelTemplate).optional(),
});

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
    storeId: label.storeId,
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
    storeId: deleted.storeId,
  });

  res.json({ success: true, data: deleted });
}
```

Note `createLabel`/`updateLabel` skip the `store managers can only edit their own` branch seen in `offers.controller.ts` — irrelevant here since Store Managers never reach these routes at all (route-level `requireRole(Role.SUPER_ADMIN)` blocks them before the controller runs).

- [ ] **Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/labels.controller.ts
git commit -m "feat: add labels CRUD controller"
```

---

### Task 3: Backend — register `/labels` routes

**Files:**
- Modify: `backend/src/routes/index.ts`

**Interfaces:**
- Consumes: `getLabelsForStore`, `createLabel`, `updateLabel`, `deleteLabel` (Task 2), `authenticate`/`requireRole` (already imported at the top of this file), `Role` from `@prisma/client` (already imported).
- Produces: `GET /labels/store/:storeId`, `POST /labels`, `PATCH /labels/:labelId`, `DELETE /labels/:labelId` — Task 4's `labelsApi` calls these exact paths.

- [ ] **Step 1: Add the controller import**

Near the `scannedProduct.controller` import (`routes/index.ts:68`), add:

```ts
import { getLabelsForStore, createLabel, updateLabel, deleteLabel } from '../controllers/labels.controller';
```

- [ ] **Step 2: Register the routes**

Directly after the `scanned-products` route block (`routes/index.ts:458-462`), add:

```ts
// ─── Labels (printable shelf/price tags) ───────────────────────────────────────
router.get   ('/labels/store/:storeId', authenticate, requireRole(Role.SUPER_ADMIN), getLabelsForStore);
router.post  ('/labels',                authenticate, requireRole(Role.SUPER_ADMIN), createLabel);
router.patch ('/labels/:labelId',       authenticate, requireRole(Role.SUPER_ADMIN), updateLabel);
router.delete('/labels/:labelId',       authenticate, requireRole(Role.SUPER_ADMIN), deleteLabel);
```

- [ ] **Step 3: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manually smoke-test one route**

With the backend running locally (`npm run dev` in `backend/`), and a valid DevAdmin/SuperAdmin JWT:

```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/labels/store/<a-real-store-id>
```

Expected: `{"success":true,"data":[]}` (empty array — no labels created yet).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/index.ts
git commit -m "feat: register /labels routes"
```

---

### Task 4: Admin — `labelsApi` client

**Files:**
- Modify: `admin/src/services/api.ts`

**Interfaces:**
- Produces: `labelsApi.getForStore(storeId)`, `labelsApi.create(data)`, `labelsApi.update(labelId, data)`, `labelsApi.delete(labelId)` — Task 5 imports and calls these.

- [ ] **Step 1: Add the API client object**

Near `bannersApi` (`api.ts:93-97`), add:

```ts
export const labelsApi = {
  getForStore: (storeId: string) => api.get(`/labels/store/${storeId}`),
  create: (data: { storeId: string; productName: string; priceText: string; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
};
```

- [ ] **Step 2: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/services/api.ts
git commit -m "feat: add labelsApi client"
```

---

### Task 5: Admin — `Labels.tsx` page (store picker, table, add/edit/delete)

**Files:**
- Create: `admin/src/pages/Labels.tsx`
- Modify: `admin/src/App.tsx`
- Modify: `admin/src/components/AppSidebar.tsx`
- Read (for reference, not modification): `admin/src/pages/StoreRequests.tsx:322-364` (sidebar store-picker JSX) and `:949-973` (its styles) — the layout this page's sidebar is based on. `admin/src/pages/ScannedProducts.tsx:107-164,295-333` (the add/edit modal JSX + styles) — the modal this page's Add/Edit form is based on.

**Interfaces:**
- Consumes: `labelsApi` (Task 4), `storesApi.getAll()` (existing, used by `OrderList.tsx`), `ConfirmModal`, `ErrorState`, `TableSkeleton`, `Table`/`TableHeader`/`TableBody`/`TableRow`/`TableHead`/`TableCell` (existing shared components, same imports as `ScannedProducts.tsx`), `TEXT_MUTED` from `../lib/theme`.
- Produces: default-exported `Labels` component; a `printLabels` prop-shaped call site for Task 6 (`selectedLabels: Label[]` passed to a `printLabels()` function imported from `../utils/printLabels`).

- [ ] **Step 1: Read the three reference files listed above**

Confirm current line numbers and exact style-object names before copying — this plan's line numbers were correct as of this session but may have shifted.

- [ ] **Step 2: Write `Labels.tsx`**

```tsx
import { useState, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, storesApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { printLabels } from '../utils/printLabels';

interface Store {
  id: string;
  name: string;
  city: string;
}

interface Label {
  id: string;
  storeId: string;
  productName: string;
  priceText: string;
  template: string;
  updatedAt: string;
}

const TEMPLATE_LABELS: Record<string, string> = {
  CLASSIC_RED_BLACK: 'Classic Red & Black',
};

export default function Labels() {
  const qc = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Label | null>(null);

  const { data: storesData } = useQuery({
    queryKey: ['stores-all'],
    queryFn: storesApi.getAll,
  });
  const stores: Store[] = storesData?.data?.data || [];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labels', selectedStoreId],
    queryFn: () => labelsApi.getForStore(selectedStoreId!),
    enabled: !!selectedStoreId,
  });
  const labels: Label[] = data?.data?.data || [];

  const saveMutation = useMutation({
    mutationFn: () =>
      editingLabel
        ? labelsApi.update(editingLabel.id, { productName: formProductName.trim(), priceText: formPriceText.trim() })
        : labelsApi.create({ storeId: selectedStoreId!, productName: formProductName.trim(), priceText: formPriceText.trim() }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels', selectedStoreId] });
      toast.success(editingLabel ? 'Label updated' : 'Label added');
      closeModal();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save label'),
  });

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.delete(labelId),
    onSuccess: (_res, labelId) => {
      qc.invalidateQueries({ queryKey: ['labels', selectedStoreId] });
      setSelectedIds(prev => { const next = new Set(prev); next.delete(labelId); return next; });
      toast.success('Label removed');
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to remove label'),
  });

  function openAddModal() {
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setShowModal(true);
  }

  function openEditModal(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handlePrintSelected() {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0) return;
    printLabels(toPrint);
  }

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmDelete}
        title="Remove Label"
        message={`Remove the label for "${confirmDelete?.productName}"? It will no longer appear in this store's print batches.`}
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
              <input
                style={m.input}
                value={formProductName}
                onChange={e => setFormProductName(e.target.value)}
                placeholder="e.g. Monster Energy 16oz"
                maxLength={120}
                autoFocus
              />
              <div style={m.label}>Price / Deal Text *</div>
              <input
                style={m.input}
                value={formPriceText}
                onChange={e => setFormPriceText(e.target.value)}
                placeholder='e.g. "$3.99" or "2 for $5"'
                maxLength={40}
              />
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

      {/* ── Sidebar ── */}
      <div style={s.sidebar}>
        <div style={s.sidebarTop}>
          <div style={s.sidebarTitle}>Labels</div>
          <div style={s.sidebarSubtitle}>{stores.length} store{stores.length !== 1 ? 's' : ''}</div>
        </div>
        <div style={s.storeList}>
          {stores.map(store => {
            const active = store.id === selectedStoreId;
            return (
              <button
                key={store.id}
                style={{ ...s.storeBtn, ...(active ? s.storeBtnActive : {}) }}
                onClick={() => { setSelectedStoreId(store.id); setSelectedIds(new Set()); }}
              >
                <div style={s.storeBtnName}>{store.name}</div>
                {store.city && <div style={s.storeBtnCity}>{store.city}</div>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Main panel ── */}
      <div style={s.main}>
        {!selectedStoreId ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>🏷️</div>
            <div style={s.emptyTitle}>Select a store</div>
            <div style={s.emptySub}>Choose a store from the sidebar to manage its labels</div>
          </div>
        ) : (
          <>
            <div style={s.pageHeader}>
              <h1 style={s.pageTitle}>🏷️ Labels</h1>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  style={{ ...s.printBtn, ...(selectedIds.size === 0 ? s.printBtnDim : {}) }}
                  onClick={handlePrintSelected}
                  disabled={selectedIds.size === 0}
                >
                  🖨️ Print Selected ({selectedIds.size})
                </button>
                <button style={s.addBtn} onClick={openAddModal}>+ Add Label</button>
              </div>
            </div>

            {isError ? (
              <ErrorState message="Failed to load labels." onRetry={refetch} />
            ) : isLoading ? (
              <TableSkeleton columns={6} />
            ) : labels.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>🏷️</div>
                <div style={s.emptyTitle}>No labels yet</div>
                <div style={s.emptySub}>Add a label to start building this store's print batch</div>
              </div>
            ) : (
              <div style={s.tableWrap}>
                <Table style={s.table}>
                  <TableHeader>
                    <TableRow>
                      {['', 'Product', 'Price / Deal', 'Template', 'Updated', ''].map(h => (
                        <TableHead key={h} style={s.th}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {labels.map((label, i) => (
                      <TableRow key={label.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                        <TableCell style={s.td}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(label.id)}
                            onChange={() => toggleSelected(label.id)}
                          />
                        </TableCell>
                        <TableCell style={s.td}><span style={s.itemName}>{label.productName}</span></TableCell>
                        <TableCell style={s.td}>{label.priceText}</TableCell>
                        <TableCell style={s.td}>{TEMPLATE_LABELS[label.template] || label.template}</TableCell>
                        <TableCell style={s.td}>{new Date(label.updatedAt).toLocaleDateString()}</TableCell>
                        <TableCell style={s.td}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button style={s.editBtn} onClick={() => openEditModal(label)}>Edit</button>
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
  page: { display: 'flex', height: 'calc(100vh - 64px)', background: '#f0f2f5', overflow: 'hidden' },

  sidebar: {
    width: 272, background: '#fff', borderRight: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  sidebarTop: { padding: '20px 18px 8px' },
  sidebarTitle: { fontSize: 20, fontWeight: 800, color: '#1D3557' },
  sidebarSubtitle: { fontSize: 13, color: TEXT_MUTED, marginTop: 2 },
  storeList: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 8px 12px' },
  storeBtn: {
    width: '100%', textAlign: 'left', background: 'none', border: 'none',
    borderRadius: 12, padding: '10px 12px', cursor: 'pointer', marginBottom: 2,
  },
  storeBtnActive: { background: '#eff6ff' },
  storeBtnName: { fontWeight: 600, fontSize: 14, color: '#212529', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeBtnCity: { fontSize: 13, color: TEXT_MUTED, marginTop: 1 },

  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 24, gap: 20 },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#111827' },
  emptySub: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center' },
  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
  pageTitle: { fontSize: 24, fontWeight: 900, color: '#1D3557', margin: 0 },
  printBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#0f5132', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  printBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#1D3557', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },

  tableWrap: {
    background: '#fff', borderRadius: 14, overflowX: 'auto', overflowY: 'auto', flex: 1, minHeight: 0,
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
  editBtn: {
    background: '#eff6ff', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  deleteBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
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
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
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

Note this imports `printLabels` from `../utils/printLabels`, which doesn't exist until Task 6 — `tsc` will fail on this task's own verify step until Task 6 lands. That's expected and fine given how tightly coupled these two tasks are (the button this task builds has no purpose without Task 6's function); Step 4 below accounts for it.

- [ ] **Step 3: Register the route**

In `admin/src/App.tsx`, add the import (near the other page imports) and the route (near `/scanned-products`, `App.tsx:142` per the requests-hub-redesign plan's file structure — confirm current line by reading the file):

```tsx
import Labels from './pages/Labels';
// ...
<Route path="/labels" element={<Labels />} />
```

- [ ] **Step 4: Add the sidebar nav item**

In `admin/src/components/AppSidebar.tsx`:
1. Add `Printer` to the `lucide-react` import list (`AppSidebar.tsx:19-51`) — `Tag` is already imported but already used for "Offers" (`AppSidebar.tsx:348`), so this feature needs its own icon.
2. After the "Scanned Products" nav item (`AppSidebar.tsx:383`), add:

```tsx
{(isDevAdmin || isSuperAdmin) && (
  <SidebarNavItem to="/labels" icon={<Printer size={16} />} label="Labels" />
)}
```

- [ ] **Step 5: Verify (expect one failure)**

Run: `cd admin && npx tsc --noEmit`
Expected: exactly one error, `Cannot find module '../utils/printLabels'` (or similar) from `Labels.tsx`'s import — this is the expected, temporary gap closed by Task 6. No other errors should appear; if there are others, fix them now before proceeding.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/Labels.tsx admin/src/App.tsx admin/src/components/AppSidebar.tsx
git commit -m "feat: add Labels admin page (store picker, table, add/edit/delete)"
```

---

### Task 6: Admin — `printLabels.ts` print utility

**Files:**
- Create: `admin/src/utils/printLabels.ts`
- Read (for reference, not modification): `admin/src/utils/invoicePdf.ts` (full file) — the exact pattern this reuses.

**Interfaces:**
- Consumes: nothing from earlier tasks except the `Label` shape already defined inline in `Labels.tsx` (`{ id, storeId, productName, priceText, template, updatedAt }`) — this file defines its own matching parameter type rather than importing `Labels.tsx`'s internal interface (pages shouldn't be imported by utils).
- Produces: `printLabels(labels: PrintableLabel[]): void` — already called by `Labels.tsx` (Task 5).

- [ ] **Step 1: Read `invoicePdf.ts` in full**

Confirm its exact `window.open` → `document.write`-or-equivalent → `window.print()` sequence, and how it escapes user-provided text into HTML (check for an `esc()`-style helper, or whether it relies on template literals directly — if there's no existing escape helper in that file, use the same `esc()` function already defined in `mobile/utils/printOrderList.ts:19-25` as a reference implementation, re-implemented here since admin and mobile don't share a utils module).

- [ ] **Step 2: Write the print utility**

```ts
interface PrintableLabel {
  id: string;
  productName: string;
  priceText: string;
  template: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TEMPLATE_CSS: Record<string, string> = {
  CLASSIC_RED_BLACK: `
    background: #111;
    color: #fff;
    border: 3px solid #c0392b;
  `,
};

function renderLabel(label: PrintableLabel): string {
  const templateCss = TEMPLATE_CSS[label.template] || TEMPLATE_CSS.CLASSIC_RED_BLACK;
  return `
    <div class="label" style="${templateCss}">
      <div class="label-name">${esc(label.productName)}</div>
      <div class="label-price">${esc(label.priceText)}</div>
    </div>
  `;
}

export function printLabels(labels: PrintableLabel[]): void {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Labels</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6mm;
    }
    .label {
      aspect-ratio: 3 / 2;
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 4mm;
      page-break-inside: avoid;
    }
    .label-name {
      font-size: 12pt;
      font-weight: 700;
      margin-bottom: 4mm;
    }
    .label-price {
      font-size: 20pt;
      font-weight: 900;
      color: #e63946;
    }
  </style>
  <script>window.onload = () => window.print();</script>
</head>
<body>
  <div class="grid">
    ${labels.map(renderLabel).join('')}
  </div>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
}
```

A 4-column grid with a 3:2 aspect-ratio card and 10mm page margins yields roughly 32 labels per A4 page (4 columns × ~8 rows) — within the ~30-40 target from the spec. If Step 1's read of `invoicePdf.ts` reveals a different escaping helper or window-opening sequence already in use, match that exactly instead of what's shown here — this step's code is based on the pattern described in the spec, not a fresh read of the file at plan-writing time.

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors — this closes the one expected gap from Task 5.

- [ ] **Step 4: Manual print check**

Run the admin dev server (`cd admin && npm run dev`), log in as DevAdmin/SuperAdmin, go to Labels, pick a store, add two labels (one plain price, one deal price), select both, click "Print Selected." Confirm a new tab opens, the print dialog appears automatically, and the preview shows both labels in the grid with the red/black styling, product name, and price/deal text all legible.

- [ ] **Step 5: Commit**

```bash
git add admin/src/utils/printLabels.ts
git commit -m "feat: add browser-native print utility for label batches"
```

---

### Task 7: Append manual verification section to the consolidated checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Append a new section**

Add at the end of the file:

```markdown
## 8. Shelf/price labels (2026-08-11)

- [ ] As DevAdmin/SuperAdmin, open the new "Labels" nav item → confirm the store-picker sidebar lists all stores
- [ ] Pick a store, add a label with a plain price (`$3.99`) → appears in the table
- [ ] Add another label with a deal price (`2 for $5`) → appears correctly
- [ ] Edit a label's price → table updates immediately
- [ ] Select both labels, click "Print Selected" → a new tab opens, the print dialog fires automatically, and both labels render in a grid styled with the red/black template
- [ ] Delete a label → disappears from the table and from a subsequent print selection
- [ ] Log in as a Store Manager (or check the API directly) → confirm no "Labels" nav item appears, and `/labels/*` endpoints return 403
- [ ] Switch to a different store in the sidebar → confirm the label table and any selection checkboxes reset to that store's own labels (no cross-store leakage)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add shelf/price labels section to the manual test checklist"
```
