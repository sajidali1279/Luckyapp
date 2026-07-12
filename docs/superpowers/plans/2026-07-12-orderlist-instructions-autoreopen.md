# Order List Standing Instructions + Auto-Reopen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a standing, always-current "order instructions" text field per store (editable by both DevAdmin/SuperAdmin on the admin web portal and Store Managers on mobile), and make closing an order list automatically open a fresh one for that store.

**Architecture:** One new nullable `String` column on the existing `Store` model (not `OrderList` — see spec's rationale). One new REST endpoint gated the same way as the existing `updateGasPrices` endpoint (`STORE_MANAGER` + `requireStoreAccess`, so a manager can only touch their own store while SUPER_ADMIN+ can touch any). `closeList`'s handler gains a second Prisma write, extracted alongside `openList`'s existing create logic into one shared helper so both call sites stay in sync. Both frontends (admin web, mobile) get a small inline-editable banner reusing each codebase's existing inline-edit pattern (admin: the item-quantity click-to-edit pattern already in `OrderListDetail`; mobile: a new but simple `TextInput` + Save/Cancel, matching the existing `TouchableOpacity`/mutation conventions in that screen).

**Tech Stack:** Express + Prisma + PostgreSQL (backend), React + TanStack Query (admin web), React Native + Expo + TanStack Query (mobile). **No test framework exists in this repo** (confirmed: no jest/vitest config, no `*.test.ts` files anywhere) — verification steps in this plan use `npx tsc --noEmit` (the same method used for every other change in this codebase this session) instead of automated tests, matching established project convention rather than introducing a new one.

---

## Before you start

You will not have a working `DATABASE_URL` in your environment (there is no `.env` file committed to this repo, by design). This means:
- You cannot run `prisma migrate dev` to auto-generate the migration — Task 1 has you hand-write the migration SQL instead, matching the exact format Prisma already uses in this repo's `prisma/migrations/` folder.
- You cannot run the backend against a live database to manually hit the new endpoint. Verification for backend tasks is `npx tsc --noEmit` plus careful reading of the diff — this matches how every backend change in this repo was verified this session.
- The migration applies automatically on the next deploy, via the existing `prisma migrate deploy` step already wired into `backend/package.json`'s `build` script. You don't need to do anything extra to trigger it.

---

### Task 1: Database — add `Store.orderInstructions`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260712000000_add_store_order_instructions/migration.sql`

- [ ] **Step 1: Add the field to the `Store` model**

In `backend/prisma/schema.prisma`, find the `Store` model. Add the new field right after the `hotFoodEnabled` line (around line 289), before the "Gas prices" comment block:

```prisma
  // Feature flags
  hotFoodEnabled    Boolean  @default(true)

  // Standing order instructions — shown to whoever opens the store's order list
  // (admin web or mobile), persists across list close/auto-reopen cycles
  orderInstructions String?

  // Gas prices (updated daily by admins)
```

- [ ] **Step 2: Write the migration file**

Create `backend/prisma/migrations/20260712000000_add_store_order_instructions/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "stores" ADD COLUMN "orderInstructions" TEXT;
```

This matches the exact style Prisma generates for a single nullable column addition (verified against this repo's own migration history — e.g. `prisma/migrations/20260709120000_add_admin_notices/migration.sql` uses the same `-- AlterTable`/`-- CreateTable` comment convention).

- [ ] **Step 3: Regenerate the Prisma client types**

Run: `cd backend && npx prisma generate`
Expected: `✔ Generated Prisma Client` with no errors. This updates the local TypeScript types (`@prisma/client`) so `orderInstructions` is available on `Store` in the next tasks — it does NOT touch the database (no `DATABASE_URL` needed for `generate`, only for `migrate dev`/`deploy`).

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (this only confirms the schema change and generated client are internally consistent — the actual column won't exist until the next deploy runs `prisma migrate deploy`).

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260712000000_add_store_order_instructions/
git commit -m "feat: add Store.orderInstructions column"
```

---

### Task 2: Backend — extract shared list-creation helper, wire auto-reopen into closeList

**Files:**
- Modify: `backend/src/controllers/orderList.controller.ts:171-203`

- [ ] **Step 1: Extract `createListForStore` and use it in `openList`**

Replace the existing `openList` function (currently lines 171-183) with:

```ts
// ─── POST /order-lists/store/:storeId/open ───────────────────────────────────

async function createListForStore(storeId: string, openedById: string) {
  const name = await generateListName(storeId);
  return prisma.orderList.create({
    data: { storeId, name, openedById },
    include: { openedBy: { select: { id: true, name: true } } },
  });
}

export async function openList(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const existing = await prisma.orderList.findFirst({ where: { storeId, status: 'OPEN' } });
  if (existing) { res.status(409).json({ success: false, error: 'A list is already open for this store', data: existing }); return; }
  const list = await createListForStore(storeId, req.user!.id);
  res.status(201).json({ success: true, data: list });
}
```

This is a pure refactor of `openList` (same behavior, same response shape) plus a new private helper — no observable change yet.

- [ ] **Step 2: Verify the refactor alone didn't break anything**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Wire auto-reopen into `closeList`**

Replace the existing `closeList` function (the one right after `openList`, currently ending around line 203) with:

```ts
// ─── POST /order-lists/:listId/close ─────────────────────────────────────────

export async function closeList(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const list = await prisma.orderList.findUnique({ where: { id: listId } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }
  if (list.status === 'CLOSED') { res.status(400).json({ success: false, error: 'List is already closed' }); return; }

  const user = req.user!;
  if (!(await hasStoreAccess(user.id, user.role, list.storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store' }); return;
  }
  const closed = await prisma.orderList.update({
    where: { id: listId },
    data: { status: 'CLOSED', closedById: user.id, closedAt: new Date() },
  });
  const reopened = await createListForStore(list.storeId, user.id);
  res.json({ success: true, data: { closed, reopened } });
}
```

Notes on what changed from the current version:
- Dropped the `notes` request-body handling entirely (`const notes = req.body.notes as string | undefined` and the `...(notes ? { notes } : {})` spread) — per the spec, this was never wired to any UI on either platform, so removing it changes no observable behavior for any real caller.
- After the close succeeds, immediately calls the same `createListForStore` helper `openList` uses, and returns both records under `data.closed` / `data.reopened` instead of the old flat `data: updated` shape.
- This response shape change is safe: neither existing consumer reads the response body today. Confirmed by checking both call sites — `admin/src/pages/OrderList.tsx`'s `closeMutation.onSuccess` (`() => { toast.success('List closed'); ...; onBack(); }`, no destructuring) and `mobile/app/(manager)/order-list.tsx`'s `closeListMutation.onSuccess` (same — invalidates queries and shows a toast, doesn't touch the response body).

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/orderList.controller.ts
git commit -m "feat: auto-reopen a new order list immediately after closing one"
```

---

### Task 3: Backend — `updateOrderInstructions` endpoint + expose the field in existing reads

**Files:**
- Modify: `backend/src/controllers/billing.controller.ts`
- Modify: `backend/src/controllers/orderList.controller.ts:149` (getListById's `store` include)
- Modify: `backend/src/routes/index.ts`

- [ ] **Step 1: Add the endpoint to `billing.controller.ts`**

Add this near `updateGasPrices` (the pattern this mirrors exactly — same permission model, same shape):

```ts
// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store) — standing order instructions
const orderInstructionsSchema = z.object({
  instructions: z.string().max(300).nullable(),
});

export async function updateOrderInstructions(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = orderInstructionsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const trimmed = parsed.data.instructions?.trim() || null;
  const store = await prisma.store.update({
    where: { id: storeId },
    data: { orderInstructions: trimmed },
    select: { id: true, orderInstructions: true },
  });
  res.json({ success: true, data: store });
}
```

- [ ] **Step 2: Expose `orderInstructions` in the reads mobile/admin already use**

In `billing.controller.ts`, `getStoreById`'s `select` object (currently `id: true, name: true, address: true, city: true, state: true, zipCode: true, phone: true, latitude: true, longitude: true, shiftsPerDay: true, gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true, enabledCategories: true, hotFoodEnabled: true`), add `orderInstructions: true,` to the list.

In the same file, `getAccessibleStores`'s shared `storeSelect` const (currently `id: true, name: true, address: true, isActive: true, gasPricePerGallon: true, dieselPricePerGallon: true, gasPriceUpdatedAt: true`), add `orderInstructions: true,` to the list. **This is the one mobile's order-list screen actually reads** — it fetches stores via `storesApi.accessible()` and finds the selected store from that array, so this is the field that makes `selectedStore.orderInstructions` available there in Task 7.

- [ ] **Step 3: Expose it on the admin side's list-detail read**

In `orderList.controller.ts`, `getListById`'s `store` include (currently `store: { select: { id: true, name: true } }`, around line 149), change to:

```ts
store:    { select: { id: true, name: true, orderInstructions: true } },
```

- [ ] **Step 4: Register the route**

In `backend/src/routes/index.ts`:
1. Add `updateOrderInstructions` to the existing `billing.controller` import list (the multi-line `import { updateStoreBilling, getAllStoresBilling, getStoreById, getStores, getAccessibleStores, updateStore, updateGasPrices, ... } from '../controllers/billing.controller';` block).
2. Add this route right after the existing gas-prices route (`router.patch('/stores/:storeId/gas-prices', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, updateGasPrices);`):

```ts
router.patch('/stores/:storeId/order-instructions', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, updateOrderInstructions); // Manager+ per store — standing note
```

- [ ] **Step 5: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/billing.controller.ts backend/src/controllers/orderList.controller.ts backend/src/routes/index.ts
git commit -m "feat: add updateOrderInstructions endpoint, expose field in existing store reads"
```

---

### Task 4: Admin web — API client + types

**Files:**
- Modify: `admin/src/services/api.ts`
- Modify: `admin/src/pages/OrderList.tsx` (interfaces only — `Store`, `OrderList`)

- [ ] **Step 1: Add the API call**

In `admin/src/services/api.ts`, in the `storesApi` object (currently ending with `deleteKeywordMapping`), add:

```ts
  updateOrderInstructions: (storeId: string, instructions: string | null) =>
    api.patch(`/stores/${storeId}/order-instructions`, { instructions }),
```

- [ ] **Step 2: Extend the `Store` and `OrderList` interfaces**

In `admin/src/pages/OrderList.tsx`:

Change (line 12):
```ts
interface Store { id: string; name: string }
```
to:
```ts
interface Store { id: string; name: string; orderInstructions?: string | null }
```

Change the `OrderList` interface's `store` field (currently `store: { id: string; name: string };`) to:
```ts
  store: { id: string; name: string; orderInstructions?: string | null };
```

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/services/api.ts admin/src/pages/OrderList.tsx
git commit -m "feat: add updateOrderInstructions API client + types (admin)"
```

---

### Task 5: Admin web — instructions banner UI

**Files:**
- Modify: `admin/src/pages/OrderList.tsx` (`OrderListDetail` component)

- [ ] **Step 1: Add state and mutation to `OrderListDetail`**

In `OrderListDetail` (the component receiving `list`, `canEdit`, `canClose`, `onBack`, `onListChanged`), add alongside the existing `useState`/`useMutation` calls near the top of the function:

```ts
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft,   setInstructionsDraft]   = useState('');

  const instructionsMutation = useMutation({
    mutationFn: (instructions: string | null) => storesApi.updateOrderInstructions(list.store.id, instructions),
    onSuccess: () => {
      toast.success('Instructions saved');
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      setEditingInstructions(false);
    },
    onError: () => toast.error('Failed to save instructions'),
  });
```

This needs `storesApi` imported in this file — check the existing import line (`import { orderListApi, orderCategoriesApi, storesApi, employeeRequestApi, inventoryAnalyticsApi } from '../services/api';`) — `storesApi` is already imported, no change needed there.

- [ ] **Step 2: Add the banner JSX**

In `OrderListDetail`'s render, insert this between the closing `</div>` of the header block (`s.listDetailHeader`, ends right before the "Two-column body" comment) and the `<div style={s.detailBody}>` that follows it:

```tsx
      {/* Standing instructions banner */}
      <div style={s.instructionsBanner}>
        {editingInstructions ? (
          <>
            <textarea
              style={s.instructionsTextarea}
              value={instructionsDraft}
              onChange={e => setInstructionsDraft(e.target.value)}
              maxLength={300}
              placeholder="e.g. Call supplier before ordering dairy"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                style={s.approveBtn}
                onClick={() => instructionsMutation.mutate(instructionsDraft.trim() || null)}
                disabled={instructionsMutation.isPending}
              >
                {instructionsMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button style={s.cancelBtnSm} onClick={() => setEditingInstructions(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div
            style={s.instructionsDisplay}
            onClick={canClose ? () => { setInstructionsDraft(list.store.orderInstructions || ''); setEditingInstructions(true); } : undefined}
          >
            <span style={s.instructionsLabel}>📋 Standing instructions</span>
            <span style={list.store.orderInstructions ? s.instructionsText : s.instructionsEmpty}>
              {list.store.orderInstructions || (canClose ? 'No standing instructions — click to add' : 'No standing instructions')}
            </span>
          </div>
        )}
      </div>
```

Note: gated on `canClose` (not `canEdit`) per the spec — `canClose` is `isDevAdmin || isSuperAdmin`, matching the "both, either can edit" requirement for the web side. Non-`canClose` viewers see the same banner but it's not clickable and never shows editing mode.

- [ ] **Step 3: Add the styles**

In the `s` style object at the bottom of the file, add near `printBtn`/`closeListBtn`:

```ts
  instructionsBanner:  { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 },
  instructionsDisplay: { display: 'flex', flexDirection: 'column' as const, gap: 4, cursor: 'pointer' },
  instructionsLabel:   { fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  instructionsText:    { fontSize: 14, color: '#1E293B', lineHeight: 1.5 },
  instructionsEmpty:   { fontSize: 14, color: '#94A3B8', fontStyle: 'italic' as const },
  instructionsTextarea:{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' as const },
```

- [ ] **Step 4: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/OrderList.tsx
git commit -m "feat: show/edit standing order instructions on admin order list detail"
```

---

### Task 6: Mobile — API client + types

**Files:**
- Modify: `mobile/services/api.ts`
- Modify: `mobile/app/(manager)/order-list.tsx` (interface only — `Store`)

- [ ] **Step 1: Add the API call**

In `mobile/services/api.ts`, in the `storesApi` object (currently `getAll`, `getGasPrices`, `getTierRates`, `getCategoryRates`, `accessible`), add:

```ts
  updateOrderInstructions: (storeId: string, instructions: string | null) =>
    api.patch(`/stores/${storeId}/order-instructions`, { instructions }),
```

- [ ] **Step 2: Extend the `Store` interface**

In `mobile/app/(manager)/order-list.tsx`, change (line 30):
```ts
interface Store { id: string; name: string }
```
to:
```ts
interface Store { id: string; name: string; orderInstructions?: string | null }
```

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/services/api.ts "mobile/app/(manager)/order-list.tsx"
git commit -m "feat: add updateOrderInstructions API client + type (mobile)"
```

---

### Task 7: Mobile — instructions banner UI

**Files:**
- Modify: `mobile/app/(manager)/order-list.tsx`

- [ ] **Step 1: Add state and mutation**

In `ManagerOrderListScreen`, alongside the existing `useState`/`useMutation` declarations near the top of the component, add:

```ts
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft,   setInstructionsDraft]   = useState('');

  const instructionsMutation = useMutation({
    mutationFn: (instructions: string | null) => storesApi.updateOrderInstructions(selectedStoreId!, instructions),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accessible-stores'] });
      setEditingInstructions(false);
      Toast.show({ type: 'success', text1: 'Instructions saved' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to save instructions' }),
  });
```

Invalidating `['accessible-stores']` (the query key `storesApi.accessible` uses, per the existing `useQuery({ queryKey: ['accessible-stores'], queryFn: storesApi.accessible, ... })`) refreshes `selectedStore.orderInstructions` after saving, since that's the source the banner reads from.

- [ ] **Step 2: Add the banner JSX**

Find this exact anchor (the closing of the `{/* Stats + list controls bar */}` `<View style={s.listBanner}>` block, immediately followed by the employee-requests banner comment):

```tsx
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline employee requests banner */}
```

Insert the new banner between `</View>` (closing `s.listBanner`) and `{/* Inline employee requests banner */}`, so it reads:

```tsx
              </TouchableOpacity>
            </View>
          </View>

          {/* Standing instructions banner */}
          <View style={s.instructionsBanner}>
            {editingInstructions ? (
              <>
                <TextInput
                  style={s.instructionsInput}
                  value={instructionsDraft}
                  onChangeText={setInstructionsDraft}
                  maxLength={300}
                  multiline
                  placeholder="e.g. Call supplier before ordering dairy"
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                  <TouchableOpacity
                    style={[s.instructionsSaveBtn, instructionsMutation.isPending && { opacity: 0.6 }]}
                    onPress={() => instructionsMutation.mutate(instructionsDraft.trim() || null)}
                    disabled={instructionsMutation.isPending}
                  >
                    <Text style={s.instructionsSaveBtnText}>{instructionsMutation.isPending ? 'Saving…' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.instructionsCancelBtn} onPress={() => setEditingInstructions(false)}>
                    <Text style={s.instructionsCancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <TouchableOpacity
                onPress={() => { setInstructionsDraft(selectedStore?.orderInstructions || ''); setEditingInstructions(true); }}
                accessibilityRole="button"
                accessibilityLabel="Edit standing order instructions"
              >
                <Text style={s.instructionsLabel}>📋 Standing instructions</Text>
                <Text style={selectedStore?.orderInstructions ? s.instructionsText : s.instructionsEmpty}>
                  {selectedStore?.orderInstructions || 'No standing instructions — tap to add'}
                </Text>
              </TouchableOpacity>
            )}
          </View>
```

The pre-existing `{/* Inline employee requests banner */}` block continues unchanged directly after this — don't duplicate or remove it, just insert the new block before it.

- [ ] **Step 3: Add the styles**

In the `s` StyleSheet object, add near `listBanner`/`listName`:

```ts
  instructionsBanner: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, marginHorizontal: 16, marginBottom: 8 },
  instructionsLabel:  { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 },
  instructionsText:   { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  instructionsEmpty:  { fontSize: 14, color: COLORS.textMuted, fontStyle: 'italic' },
  instructionsInput:  { minHeight: 56, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 8, padding: 10, fontSize: 14, color: COLORS.text, textAlignVertical: 'top' },
  instructionsSaveBtn:   { backgroundColor: COLORS.primary, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  instructionsSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  instructionsCancelBtn:   { borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16 },
  instructionsCancelBtnText: { color: COLORS.textMuted, fontWeight: '600', fontSize: 13 },
```

Check the existing `s` StyleSheet in this file for the exact `COLORS` import already in use (it's used elsewhere in this file per `COLORS.primary`/`COLORS.border`/`COLORS.text`/`COLORS.textMuted` references already present) — no new import needed.

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(manager)/order-list.tsx"
git commit -m "feat: show/edit standing order instructions on mobile order list screen"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck all three apps**

```bash
cd backend && npx tsc --noEmit
cd ../admin && npx tsc --noEmit
cd ../mobile && npx tsc --noEmit
```
Expected: no errors in any of the three.

- [ ] **Step 2: Review the full diff against the spec**

Run: `git log --oneline -8` and `git diff origin/main --stat`
Manually confirm each spec requirement has a corresponding change:
- Store-level `orderInstructions` field ✓ (Task 1)
- New scoped endpoint, both StoreManager (own store) and SuperAdmin+ (any store) can call it ✓ (Task 3)
- Admin web banner, editable by `canClose` roles ✓ (Task 5)
- Mobile banner, editable by the store's manager ✓ (Task 7)
- Auto-reopen on close, always, no toggle ✓ (Task 2)
- Manual "+ Open List" button (admin) and "Open New List" button (mobile) both left untouched as fallbacks ✓ (no task modifies either)

- [ ] **Step 3: Push**

```bash
git push origin main
```

This triggers Render (backend — runs `prisma migrate deploy` automatically as part of the existing build script) and Vercel (admin) auto-deploys. The mobile changes require a new EAS/GitHub Actions build + store submission to reach devices, same as every other mobile change this session — not automatic.
