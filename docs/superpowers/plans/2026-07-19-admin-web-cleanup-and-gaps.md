# Admin Web Cleanup & Feature Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close a set of admin-web (React, `admin/src/`) gaps and cleanups surfaced by a full admin-vs-mobile parity audit on 2026-07-19: two orphaned, partially-working Hot Food pages need to be neutralized rather than left reachable; two files carry dead/inconsistent StoreManager-only code; the Stock Requests tab lost a cross-store "All Stores" view when it was unified into the Requests hub; and two real feature gaps exist where mobile has capability admin web doesn't (a barcode/scanned-products audit view, and restoring items from a closed order list).

**Architecture:** All admin-web only — no mobile changes, no schema changes. Two tasks add small new backend surface area reusing existing patterns (an admin API client method that already has a live backend route, per the research below) or add zero backend code at all (the scanned-products backend routes already exist and need only an admin client + page). Confirmed decisions from the user this session: StoreManager's admin-web scope should be **inventory management only** — do not build any StoreManager-facing Hot Food access; the Scanned Products page (barcode inventory database) fits that scope and should be reachable by STORE_MANAGER too, matching its actual backend authorization level.

**Tech Stack:** React + react-router-dom, inline `style` objects (no Tailwind/CSS modules), `@tanstack/react-query`, `react-hot-toast`. **No test framework** — verification is `npx tsc --noEmit` + `npm run build` in `admin/`.

**Research:** All findings below come from a full parity-audit pass plus a targeted grounding-research pass, both done in this session — not re-cited per task, just noted here once.

## Global Constraints

- No mobile changes in this plan. No `schema.prisma` changes in this plan.
- StoreManager's admin-web role is **inventory management only** — do not add any StoreManager-facing Hot Food nav/page/access anywhere in this plan.
- `HotFood.tsx` (the currently nav-linked, working "unified Hot Food: Orders/Catalog/Availability" page) must not be touched — it's a separate, genuinely working feature, unrelated to the two orphan pages this plan neutralizes.
- The existing SuperAdmin/DevAdmin permission split on Order List (`canEdit = isDevAdmin`, `canClose = isDevAdmin || isSuperAdmin`) is not being changed — the new restore-from-history action should follow `canEdit` (DevAdmin-only), matching how adding/editing items already works, for consistency.
- `employeeRequestApi.adminGetAll({storeId?, status?})` already exists in `admin/src/services/api.ts` and its backend route (`GET /employee-requests/admin/all`, `requireRole(Role.SUPER_ADMIN)`) is already live — Task 4 wires up existing, currently-unused plumbing, it does not add a new backend route.
- `storeRequestApi` and `productRequestApi` have **no** cross-store backend route today (`/store-requests/admin/all` and `/product-requests/admin/all` do not exist) — an "All Stores" view for the Alerts/Products tabs is explicitly **out of scope** for this plan (would require new backend routes); only the Stock tab gets it, since that's the one with pre-existing plumbing and the one that actually regressed.
- `ScannedProduct` has no `storeId` or "added by" attribution in its schema — it's a single global chain-wide catalog. The new admin page is a flat list, not a per-store view.

---

## File Structure

**Backend — modified:**
- `backend/src/controllers/scannedProduct.controller.ts` — fix an inaccurate comment only (role check itself is already correct); no functional change

**Admin — new:**
- `admin/src/pages/ComingSoon.tsx` — small shared placeholder component
- `admin/src/pages/ScannedProducts.tsx` — new admin page for the barcode/scanned-products catalog

**Admin — modified:**
- `admin/src/App.tsx` — gate `/daily-reports` + `/daily-tasks` behind `SuperAdminOnly`; swap `/hot-food/menu` + `/hot-food/orders` to `ComingSoon`; add `/scanned-products` route
- `admin/src/pages/DailyReports.tsx` — remove now-genuinely-dead `isManager` branches
- `admin/src/pages/Customers.tsx` — remove dead ternary branch
- `admin/src/pages/StoreRequests.tsx` — "All Stores" option for the Stock tab
- `admin/src/pages/OrderList.tsx` — restore-from-history UI in `OrderListDetail` for closed lists
- `admin/src/services/api.ts` — add `scannedProductApi` (admin-side) and (if missing) `orderListApi.restoreItems`
- `admin/src/components/AppSidebar.tsx` — add a "Scanned Products" nav item

---

### Task 1: Gate `/daily-reports` and `/daily-tasks`, then remove the now-dead StoreManager branch in `DailyReports.tsx`

**Files:**
- Modify: `admin/src/App.tsx` (route definitions, ~lines 143-144 — confirm current line numbers)
- Modify: `admin/src/pages/DailyReports.tsx` (~lines 152,159,165,191)

**Context:** `/daily-reports` and `/daily-tasks` are registered outside any `SuperAdminOnly` wrapper, even though their sidebar links are hidden for `STORE_MANAGER` (`AppSidebar.tsx`) and their backend endpoints require `SUPER_ADMIN` minimum. A `STORE_MANAGER` who navigates to `/daily-reports` directly today gets a page that computes a manager-scoped view and then 403s on fetch — a confusing broken experience, not a clean redirect. `DailyReports.tsx`'s `isManager` branches only exist to serve that unreachable-in-practice case (backend rejects `STORE_MANAGER` regardless of what the branch does), so gating the route first makes them genuinely dead, then removing them is safe cleanup.

- [ ] **Step 1: Read the current route definitions and the `SuperAdminOnly` wrapper's exact span**

Confirm exactly which `<Route>` elements are already inside `<Route element={<SuperAdminOnly />}>` (e.g. `/staff`, `/hot-food`, `/customers`) and which are not (`/daily-reports`, `/daily-tasks`, alongside `/catalog`, `/careers`, `/order-list`).

- [ ] **Step 2: Move `/daily-reports` and `/daily-tasks` inside the `SuperAdminOnly` wrapper**

Relocate both `<Route path="/daily-reports" .../>` and `<Route path="/daily-tasks" .../>` into the existing `SuperAdminOnly`-wrapped block. Don't move any other routes.

- [ ] **Step 3: Remove `DailyReports.tsx`'s now-dead `isManager` branches**

Read the file fresh (line numbers may have shifted). Remove `const isManager = ...`, the `enabled: !isManager` conditional (replace with unconditional `enabled: true` or just remove the option if that was its only purpose), the `storeId = isManager ? ... : selectedStoreId` ternary (replace with just `selectedStoreId`), and the `{!isManager && (...)}` wrapper around the store-filter dropdown (render it unconditionally). After Step 2, no `STORE_MANAGER` can ever render this component, so these branches are genuinely unreachable — confirm this reasoning holds before deleting (re-check the route guard change from Step 2 actually took effect).

- [ ] **Step 4: Check `DailyTasks.tsx` for equivalent dead code**

Read `admin/src/pages/DailyTasks.tsx` for any `isManager`/`STORE_MANAGER`-specific branches. Prior research found only `isDevAdmin` branches there (no StoreManager-specific code) — if that's confirmed, no changes needed to this file beyond the route-gating in Step 2.

- [ ] **Step 5: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add admin/src/App.tsx admin/src/pages/DailyReports.tsx
git commit -m "fix: gate /daily-reports and /daily-tasks behind SuperAdminOnly, remove now-dead StoreManager branch"
```

---

### Task 2: Remove the dead ternary in `Customers.tsx`

**Files:**
- Modify: `admin/src/pages/Customers.tsx` (~lines 72-77)

**Context:** `/customers` is already wrapped in `SuperAdminOnly`, so `isSuperAdmin` is always `true` for any user who reaches this component — the `: disputesApi.getForStore(...)` branch of the disputes query's ternary can never execute.

- [ ] **Step 1: Read the current disputes query**

Confirm the exact ternary and that `isSuperAdmin` is computed the same way described (`['DEV_ADMIN','SUPER_ADMIN'].includes(user?.role || '')`).

- [ ] **Step 2: Simplify to the unconditional call**

Replace the ternary with just `disputesApi.getAll({ storeId: disputeStore || undefined, status: disputeStatus || undefined })` — no conditional.

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/Customers.tsx
git commit -m "cleanup: remove unreachable StoreManager branch from Customers disputes query"
```

---

### Task 3: Neutralize the Hot Food orphan pages with a "Coming Soon" placeholder

**Files:**
- Create: `admin/src/pages/ComingSoon.tsx`
- Modify: `admin/src/App.tsx` (~lines 141-142)

**Context:** `HotFoodMenu.tsx` and `HotFoodOrders.tsx` are reachable by direct URL by any authenticated non-employee role (no route guard, no nav link) and only partially work — the user has decided to defer finishing them and wants them shown as disabled/"coming soon" until a full release, rather than left reachable in their current partial state. The genuinely-working, nav-linked `HotFood.tsx` page is untouched. Per this plan's Global Constraints, do not add any StoreManager-facing Hot Food access as part of this task.

- [ ] **Step 1: Create a small reusable `ComingSoon` component**

```tsx
export default function ComingSoon({ feature }: { feature: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, textAlign: 'center', padding: 24 }}>
      <div style={{ fontSize: 40, opacity: 0.4 }}>🚧</div>
      <h2 style={{ fontSize: 20, fontWeight: 800, color: '#111827' }}>{feature}</h2>
      <p style={{ fontSize: 14, color: '#5a6472', maxWidth: 380 }}>This is coming in a future release. Check back soon.</p>
    </div>
  );
}
```

Match whatever this codebase's actual muted-text color token/convention is in nearby admin pages rather than the literal hex values above if a shared token exists — read one or two other admin pages' empty-state styling first to confirm.

- [ ] **Step 2: Swap the two orphan routes' elements**

In `admin/src/App.tsx`, change:
```tsx
<Route path="/hot-food/menu" element={<HotFoodMenu />} />
<Route path="/hot-food/orders" element={<HotFoodOrders />} />
```
to:
```tsx
<Route path="/hot-food/menu" element={<ComingSoon feature="Hot Food Menu Management" />} />
<Route path="/hot-food/orders" element={<ComingSoon feature="Hot Food Order Board" />} />
```
Remove the now-unused `HotFoodMenu`/`HotFoodOrders` lazy imports if nothing else references them (confirm via grep first). Do not delete `HotFoodMenu.tsx`/`HotFoodOrders.tsx` themselves in this task — leaving the files in place (just unrouted-to-real-content) is the safer, less destructive choice given the user said they'll revisit this feature later.

- [ ] **Step 3: Confirm `HotFood.tsx` is untouched**

Grep to confirm the working unified page's route/import is unchanged.

- [ ] **Step 4: Verify**

Run: `cd admin && npx tsc --noEmit`

- [ ] **Step 5: Commit**

```bash
git add admin/src/App.tsx admin/src/pages/ComingSoon.tsx
git commit -m "fix: replace partially-working Hot Food orphan pages with a Coming Soon placeholder"
```

---

### Task 4: "All Stores" view for the Stock Requests tab

**Files:**
- Modify: `admin/src/pages/StoreRequests.tsx`

**Context:** The old, now-deleted `RequestsTab` let DevAdmin/SuperAdmin pick "All Stores" and see every store's pending stock requests in one flat list via `employeeRequestApi.adminGetAll({storeId, status})`. The new unified Stock tab requires a single store to be selected first. That client method and its backend route (`GET /employee-requests/admin/all`, `SUPER_ADMIN` minimum) both still exist and are currently unused — this task wires them back up for the Stock tab only (Alerts/Products have no equivalent backend route, out of scope per Global Constraints).

- [ ] **Step 1: Read `StoreRequests.tsx`'s current sidebar and Stock-tab query in full**

Confirm the exact current shape: `effectiveStoreId`, the `isStoreManager`-gated sidebar (`stores.map(...)`), and the Stock tab's `useQuery` calling `employeeRequestApi.getForStore(effectiveStoreId, ...)`.

- [ ] **Step 2: Add an "All Stores" option to the sidebar, visible only when NOT `isStoreManager`**

Add a row above (or as the first entry in) the store list, styled consistently with the existing store rows, labeled "All Stores". Selecting it should set a distinct state (e.g. `selectedStoreId = 'ALL'` as a sentinel, or a separate boolean — pick whichever is less invasive given the existing `effectiveStoreId`/`selectedStoreId` plumbing) rather than requiring a real store id. `STORE_MANAGER` never sees this (already hidden behind `!isStoreManager` for the whole sidebar), so no gating change needed there — this is DevAdmin/SuperAdmin-only by virtue of being inside the existing sidebar's existing visibility rule.

- [ ] **Step 3: Change the Stock tab's query to call `adminGetAll` when "All Stores" is selected**

When the "All Stores" sentinel is active AND `activeTab === 'stock'`: call `employeeRequestApi.adminGetAll({ status: stockStatusFilter || undefined })` instead of `employeeRequestApi.getForStore(effectiveStoreId, ...)`. When a real store is selected, behavior is unchanged (still calls `getForStore`). Use a distinct `queryKey` for the all-stores case (e.g. `['stock-requests-all', stockStatusFilter]`) so it doesn't collide with the per-store query's cache entry.

- [ ] **Step 4: Add a store-name column/label to Stock tab cards when in "All Stores" mode**

`adminGetAllRequests`'s response already includes `store: {id, name}` per request (confirmed in the controller). When rendering in "All Stores" mode, show the store name on each card (e.g. next to the submitter name) so rows spanning multiple stores are distinguishable — when a single store is selected, this label isn't needed (already implied by context) so only show it conditionally.

- [ ] **Step 5: Confirm "Review Items" (accept/reject) still works correctly in "All Stores" mode**

The review mutation acts on a specific `requestId` regardless of which store it belongs to — confirm the existing `reviewMutation`/accept-all logic doesn't assume `effectiveStoreId` is a real id anywhere in its call path (e.g. for cache invalidation) and adjust if it does (invalidate both the per-store and all-stores query keys on success, to be safe, since either could be showing stale data after a review either way).

- [ ] **Step 6: Verify**

Run: `cd admin && npx tsc --noEmit` and `cd admin && npm run build`

- [ ] **Step 7: Commit**

```bash
git add admin/src/pages/StoreRequests.tsx
git commit -m "feat: restore an All Stores view for the Stock Requests tab"
```

---

### Task 5: Admin Scanned Products page

**Files:**
- Modify: `admin/src/services/api.ts` — add `scannedProductApi`
- Create: `admin/src/pages/ScannedProducts.tsx`
- Modify: `admin/src/App.tsx` — add route
- Modify: `admin/src/components/AppSidebar.tsx` — add nav item

**Context:** Backend already fully supports listing/deleting the chain-wide barcode→name/category/brand catalog managers build up via mobile scanning (`GET /scanned-products`, `DELETE /scanned-products/:id`, both `requireRole(Role.STORE_MANAGER)` minimum — so DEV_ADMIN, SUPER_ADMIN, and STORE_MANAGER can all use this). No admin API client or page exists at all today. Per this plan's Global Constraints, StoreManager's admin scope is inventory management — this page fits that scope, so it should be reachable by all three roles, not gated to HQ-only.

- [ ] **Step 1: Add `scannedProductApi` to `admin/src/services/api.ts`**

Mirror the mobile client's shape (`mobile/services/api.ts:308-326`) for the two endpoints this page needs:
```ts
export const scannedProductApi = {
  list: (q?: string) => api.get('/scanned-products', { params: q ? { q } : undefined }),
  delete: (id: string) => api.delete(`/scanned-products/${id}`),
};
```
(Lookup/save/extractFromPhoto are scan-time mobile flows, not needed for an admin audit/browse page — don't add them unless Step 2 reveals a real need.)

- [ ] **Step 2: Build `admin/src/pages/ScannedProducts.tsx`**

A table/list page: search input (debounced, filters by `q`), columns for barcode, name, category, brand, source (badge — "manual" vs "openfoodfacts"), scan count, last scanned date, and a delete button per row (with a confirm step — reuse this codebase's existing `ConfirmModal` pattern already used elsewhere in admin for destructive actions, e.g. in `OrderList.tsx`, rather than a native `confirm()`). Empty/loading/error states matching this codebase's established conventions (`ErrorState` with retry, a skeleton or spinner for loading). Since there's no store attribution on this data (global catalog), this is a single flat list — no store-picker sidebar needed.

- [ ] **Step 3: Add the route**

In `admin/src/App.tsx`, add `/scanned-products` as a lazy-loaded route, reachable by all three admin-web roles (DEV_ADMIN, SUPER_ADMIN, STORE_MANAGER) — do NOT wrap it in `SuperAdminOnly`/`DevAdminOnly`, matching the backend's actual `STORE_MANAGER`-minimum requirement.

- [ ] **Step 4: Add a nav item**

In `admin/src/components/AppSidebar.tsx`, add a "Scanned Products" (or similar — pick a label consistent with this app's terminology, e.g. matching how the mobile screen is labeled) nav item visible to all three roles, placed near the existing Order List/Catalog nav items since it's inventory-adjacent.

- [ ] **Step 5: Fix the inaccurate "DevAdmin only" comment in the backend controller**

`backend/src/controllers/scannedProduct.controller.ts`'s `listProducts`/`deleteProduct` functions have a comment claiming "DevAdmin only" — the actual `requireRole` check is `STORE_MANAGER` minimum. Fix the comment to match reality (no functional change, this is purely a misleading-comment fix while touching this area).

- [ ] **Step 6: Verify**

Run: `cd admin && npx tsc --noEmit` and `cd admin && npm run build`

- [ ] **Step 7: Commit**

```bash
git add admin/src/services/api.ts admin/src/pages/ScannedProducts.tsx admin/src/App.tsx admin/src/components/AppSidebar.tsx backend/src/controllers/scannedProduct.controller.ts
git commit -m "feat: add admin Scanned Products page for auditing the barcode catalog"
```

---

### Task 6: Order List admin — restore items from a closed list

**Files:**
- Modify: `admin/src/services/api.ts` — add `orderListApi.restoreItems` if missing (check first)
- Modify: `admin/src/pages/OrderList.tsx` — restore UI in `OrderListDetail`

**Context:** Mobile's `HistoryModal` lets a manager browse closed lists for their store, checkbox-select non-RECEIVED/non-REMOVED items, and restore them into the store's currently-OPEN list via `POST /order-lists/store/:storeId/restore-items`. Admin has no equivalent — `OrderListDetail` can already be opened for any closed list (via the cross-store browse table), but offers no restore action. Gate this the same way item-adding already works on this page (`canEdit = isDevAdmin`), for consistency with the existing permission split.

- [ ] **Step 1: Check whether `orderListApi.restoreItems` already exists in `admin/src/services/api.ts`**

If missing, add it mirroring the mobile client (`mobile/services/api.ts:299-300`):
```ts
restoreItems: (storeId: string, closedListId: string, itemIds: string[]) =>
  api.post(`/order-lists/store/${storeId}/restore-items`, { closedListId, itemIds }),
```

- [ ] **Step 2: Read `OrderListDetail` in full to find where to add this**

Confirm the exact current structure — where the item-list renders, where `canEdit`/`list.status` are available.

- [ ] **Step 3: Add a "Restore Items" section, shown only when `list.status === 'CLOSED'` and `canEdit` is true**

Render the closed list's items filtered client-side to `status !== 'RECEIVED' && status !== 'REMOVED'` (matching mobile's exact filter), each with a checkbox. A button below, "Restore N Items" (disabled when nothing selected), calling a new mutation using `orderListApi.restoreItems(list.storeId, list.id, selectedItemIds)`.

- [ ] **Step 4: Handle the "no open list for this store" backend error clearly**

The backend 400s with "No open list for this store — open one first" if the target store has no currently-OPEN list. Catch this in the mutation's `onError` and show it via `toast.error(err.response?.data?.error || 'Failed to restore items.')`, matching this file's established error-toast convention.

- [ ] **Step 5: On success, invalidate the right queries**

Invalidate whatever query key backs the store's active/open list view (so if an admin later opens that store's current list, the restored items are visible) — check what query key the admin page already uses for "the currently open list for a store" if such a view exists, or note in your report if no such view currently exists on admin (in which case the restored items will only become visible next time that store's open list is viewed via the normal browse flow, which is fine — no new UI is required here, just correct invalidation so the data isn't stale if it IS viewed).

- [ ] **Step 6: Verify**

Run: `cd admin && npx tsc --noEmit` and `cd admin && npm run build`

- [ ] **Step 7: Commit**

```bash
git add admin/src/services/api.ts admin/src/pages/OrderList.tsx
git commit -m "feat: add restore-items-from-closed-list action to admin Order List detail view"
```

---

### Task 7: Append manual verification section to the consolidated checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Append a new section**

```markdown
## 8. Admin web cleanup & feature gaps (2026-07-19)

- [ ] As a STORE_MANAGER, try navigating directly to `/daily-reports` and `/daily-tasks` by URL → confirm you're now redirected/blocked cleanly instead of seeing a broken page
- [ ] As DevAdmin/SuperAdmin, navigate to `/hot-food/menu` and `/hot-food/orders` by URL → confirm a "Coming Soon" placeholder shows instead of the old partial functionality
- [ ] Confirm the main `/hot-food` page (Orders/Catalog/Availability) still works exactly as before — this plan should not have touched it
- [ ] On the Requests hub's Stock tab, select "All Stores" → confirm it shows pending stock requests across every store, each labeled with its store name, and that Review Items/Accept All still work correctly
- [ ] Navigate to the new Scanned Products admin page as DevAdmin, SuperAdmin, and StoreManager → confirm all three can view and delete entries, search works
- [ ] On a closed order list (view via the Order Lists tab's status filter), as DevAdmin, use the new Restore Items action → confirm it adds the selected items to that store's current open list
- [ ] Try Restore Items on a store with no currently-open list → confirm a clear error message, not a silent failure
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add admin web cleanup verification section to the manual test checklist"
```
