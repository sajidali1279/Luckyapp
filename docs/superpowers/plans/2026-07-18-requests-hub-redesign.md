# Requests Hub Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify and polish the three request types (Store Alerts, Stock Requests, Product Requests) across manager mobile, employee mobile, and admin web — consistent naming, consistent notification coverage, one admin hub instead of a confusing two-page split, plus the functional/visual gaps a full research pass surfaced on 2026-07-18.

**Architecture:** Three separate Prisma models already exist and are **not** being merged or renamed: `StoreRequest` ("Alerts"), `EmployeeItemRequest` ("Stock Requests"), `ProductRequest` ("Products"). This plan only touches UI labels, admin page structure, and notification wiring — no schema changes. The one genuinely new piece of backend work is push notifications for `StoreRequest` (currently sends none at all, unlike the other two types) and admin bell-feed coverage for Stock Requests (currently missing entirely). Everything else is relabeling, restyling, bug-fixing, or relocating existing UI.

**Tech Stack:** React Native + Expo Router (mobile), React + react-router-dom (admin, inline `style` objects), Node/Express + Prisma (backend). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through against `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` (append a new section there in the final task).

**Research:** All findings below come from a full-repo research pass done in the same session as this plan (manager/employee mobile screens, both admin pages, `notificationRoutes.ts`, `billing.controller.ts`'s admin bell feed, `employeeRequest.controller.ts`'s push pattern, `storeRequest.controller.ts`) — not re-cited per task, just noted here once. User decisions confirmed this session: merge Stock Requests into a unified admin hub (not just restyle in place); clean up UI-facing naming (not the Prisma models); add push notifications both ways for Store Alerts; keep the existing DevAdmin/SuperAdmin permission split on Order List untouched (that page is *not* otherwise part of this plan except for removing its `RequestsTab` in Task 12, which the Order List polish plan explicitly avoids touching for exactly this reason).

## Global Constraints

- Do not rename the Prisma models (`StoreRequest`, `EmployeeItemRequest`, `ProductRequest`) or their fields — naming cleanup is UI copy and route/URL-parameter identifiers only.
- Do not merge or restructure the three underlying data models — they stay separate; only the *presentation* is unified.
- Umbrella term everywhere (mobile nav group, admin nav item): **"Requests"**. Tab labels (short, tab-bar space): **"Alerts"** / **"Stock"** / **"Products"**. Full names when referenced in headers/cards/notifications: **"Store Alert"** / **"Stock Request"** / **"Product Request"**.
- Do not rename `admin/src/pages/StoreRequests.tsx`'s filename or its `/store-requests` route — purely cosmetic imprecision (the file covers more than "store requests" once Stock is merged in) not worth the blast radius of updating every import/route reference for a non-user-facing string.
- Employee-facing type icons for Store Alerts (`EmployeeRequestsScreen.tsx`) currently use emoji (📦🧹🛍️🔧); manager-facing (`ManagerRequestsScreen.tsx`) already uses vector icons (`PackageIcon`/`ClipboardIcon`/`ShoppingBagIcon`/`BriefcaseIcon` via a `TypeIcon` helper) for the same four types — standardize on the vector set.
- `sendPushToUser(userId, title, body, type, actionUrl)` is the established push helper signature (`backend/src/utils/push.ts`, used throughout `employeeRequest.controller.ts` and `productRequest.controller.ts`) — match it exactly, don't invent a different call shape.
- Two existing route-builder functions in `backend/src/utils/notificationRoutes.ts` are **already present but incomplete/unused**: `storeRequestUrlEmployee()` (takes no `requestId`, so can't highlight a specific alert) and `alertUrlManager()` (returns `/(manager)/home`, not the Alerts tab). Task 2 fixes both before Task 3 wires them into real push calls — don't build new duplicate functions alongside them.
- `adminEmployeeRequestUrl` (in `notificationRoutes.ts`) and the `pendingEmployeeRequests` variable (in `billing.controller.ts`, appears **twice** in that file — two separate notification-feed functions) are both misnamed: despite the name, they build/query **Store Alerts** (`StoreRequest`), not `EmployeeItemRequest`. This is exactly the naming confusion this plan is meant to fix — Task 1 renames these internal identifiers (not user-facing text, just code clarity) before anything else touches them.
- Admin's `StoreRequests.tsx` internal tab-state type is `'employee' | 'product'` where `'employee'` confusingly means Store Alerts (same root cause as above) — Task 12 renames this to `'alert' | 'stock' | 'product'` while adding the third tab, so it isn't renamed twice.

---

## File Structure

**Backend — modified:**
- `backend/src/utils/notificationRoutes.ts` — rename `adminEmployeeRequestUrl` → `adminAlertUrl`; fix `storeRequestUrlEmployee`/`alertUrlManager` to take a `requestId` and build correct highlightable URLs; add `adminStockRequestUrl`
- `backend/src/controllers/billing.controller.ts` — rename `pendingEmployeeRequests` → `pendingStoreAlerts` (both occurrences); add a new Stock Requests section to both admin notification-feed functions
- `backend/src/controllers/storeRequest.controller.ts` — add push notifications to submit + acknowledge

**Mobile — modified:**
- `mobile/i18n/en.json`, `mobile/i18n/es.json` — nav label rename
- `mobile/components/EmployeeRequestsScreen.tsx` — vector icons, instructional copy
- `mobile/components/ManagerRequestsScreen.tsx` — pull-to-refresh, Products filter, instructional copy, badge scope-mismatch hint
- `mobile/app/(employee)/stock-request.tsx` — instructional copy

**Admin — modified:**
- `admin/src/pages/StoreRequests.tsx` — third "Stock" tab (ported from `OrderList.tsx`), tab-state rename, badge-invalidation fix, Products error state
- `admin/src/pages/OrderList.tsx` — remove `RequestsTab` and its tab option
- `admin/src/components/AppSidebar.tsx` — move Stock badge count from "Order List" nav item to "Requests" nav item

**Docs — modified:**
- `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` — append a verification section

---

### Task 1: Backend — rename the misleading "employee request" identifiers that actually mean Store Alerts

**Files:**
- Modify: `backend/src/utils/notificationRoutes.ts:71-73`
- Modify: `backend/src/controllers/billing.controller.ts` (two occurrences: ~lines 856-1008 and ~lines 1036-1220 — confirm exact current line numbers by reading the file, this plan's line numbers are from the research pass and may have shifted)

**Context:** `adminEmployeeRequestUrl` and the `pendingEmployeeRequests` variable both actually query/route to `StoreRequest` ("Store Alert") data, not `EmployeeItemRequest`. This is the single most concrete piece of internal naming confusion found in research and directly caused the research agent to initially mis-map the feature — fixing it now, before any new code references these names, avoids compounding the confusion in the tasks that follow.

- [ ] **Step 1: Rename the route builder**

In `backend/src/utils/notificationRoutes.ts`, rename `adminEmployeeRequestUrl` to `adminAlertUrl`. Keep its signature and body identical (`(storeId: string, requestId: string) => \`/store-requests?storeId=${storeId}&tab=employee&highlightId=${requestId}\``) — the `tab=employee` query value itself gets fixed in Task 12 when the admin page's tab-state type is renamed; don't change it here, that's a separate concern owned by a later task touching the consuming page.

- [ ] **Step 2: Update the one call site**

In `backend/src/controllers/billing.controller.ts`, update the import (`adminEmployeeRequestUrl` → `adminAlertUrl`) and both call sites (`actionUrl: adminEmployeeRequestUrl(...)` → `actionUrl: adminAlertUrl(...)`).

- [ ] **Step 3: Rename the variable in both notification-feed functions**

In the same file, rename `pendingEmployeeRequests` to `pendingStoreAlerts` everywhere it appears (the `Promise.all([...])` destructuring, the `prisma.storeRequest.findMany(...)` assignment, and the `for (const r of pendingEmployeeRequests)` loop) — in **both** of the two separate functions that build a notification feed (confirm you've caught both by searching the whole file for `pendingEmployeeRequests`, not just the first match).

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/notificationRoutes.ts backend/src/controllers/billing.controller.ts
git commit -m "refactor: rename misleading adminEmployeeRequestUrl/pendingEmployeeRequests (they mean Store Alerts, not EmployeeItemRequest)"
```

---

### Task 2: Backend — fix the two stubbed-but-incomplete route builders for Store Alerts

**Files:**
- Modify: `backend/src/utils/notificationRoutes.ts:43-45,63-65`

**Context:** `storeRequestUrlEmployee()` and `alertUrlManager()` already exist but neither actually supports highlighting a specific alert — they're leftover stubs from the original notification-deep-linking work that were never finished because `StoreRequest` never sent a push at the time. Task 3 needs both fixed first.

- [ ] **Step 1: Fix `storeRequestUrlEmployee`**

Change it to take a `requestId: string` parameter and use the existing `withHighlight` helper (already defined at the top of this file, used by `pointsUrl`/`redemptionUrl`/etc. — same pattern):

```ts
export function storeRequestUrlEmployee(requestId: string): string {
  return withHighlight('/(employee)/requests', requestId);
}
```

- [ ] **Step 2: Fix `alertUrlManager`**

Change it to take a `requestId: string` parameter and land on the Alerts tab specifically, matching the exact query-param shape `stockRequestUrlManager`/`productRequestUrlManager` already use two functions above it in this same file:

```ts
export function alertUrlManager(requestId: string): string {
  return `/(manager)/requests?tab=alerts&highlightId=${requestId}`;
}
```

- [ ] **Step 3: Confirm `ManagerRequestsScreen.tsx` already reads `?tab=alerts` correctly**

Read `mobile/components/ManagerRequestsScreen.tsx`'s deep-link tab-selection logic (it already handles `?tab=stock|products` per existing code — confirm the exact string it compares against for the Alerts tab; it may be `'alerts'` already matching what Task 2 Step 2 produces, or it may use a different string like `'alert'`). If the screen's own tab-matching logic uses a different string than `'alerts'`, use that exact string in Step 2 instead — the screen's existing code is the source of truth here, not this plan.

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: **new** errors at any call site that still calls these two functions with zero arguments — there shouldn't be any yet (nothing calls them until Task 3), but if there are, that's a sign this plan's file structure section missed a caller; find and note it before proceeding.

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/notificationRoutes.ts
git commit -m "fix: complete storeRequestUrlEmployee/alertUrlManager to support highlighting a specific alert"
```

---

### Task 3: Backend — push notifications for Store Alerts (both directions)

**Files:**
- Modify: `backend/src/controllers/storeRequest.controller.ts` (submit function and acknowledge function — read the file first for exact function names and line numbers)

**Context:** This controller currently has zero push calls anywhere — an employee submitting an alert gets no manager notification (managers only find out via a 60s-polled badge count), and a manager acknowledging one gives the employee no notification at all (they only find out by reopening the screen). `EmployeeItemRequest` and `ProductRequest` both already push in both directions; this brings `StoreRequest` to parity.

- [ ] **Step 1: Read the submit and acknowledge functions in full**

Confirm their exact names, what data is available at each point (submitter info, store info, the created/updated record), and how `employeeRequest.controller.ts`'s `submitRequest` (lines 56-83) resolves the list of store managers to notify (`prisma.userStoreRole.findMany({ where: { storeId }, ... })` filtered to `Role.STORE_MANAGER`) — replicate that exact manager-lookup pattern rather than re-deriving a different one.

- [ ] **Step 2: Add the push import**

Add `sendPushToUser` from `../utils/push` and `alertUrlManager`, `storeRequestUrlEmployee` from `../utils/notificationRoutes` to this file's imports (these are the two functions fixed in Task 2).

- [ ] **Step 3: Push managers on submit**

At the end of the submit function (after the `StoreRequest` record is successfully created), look up that store's managers the same way `employeeRequest.controller.ts:72-76` does, and for each:

```ts
sendPushToUser(managerId, '🔔 New Store Alert', `${user.name || 'An employee'} flagged: ${request.type.replace(/_/g, ' ').toLowerCase()}`, 'STORE_REQUEST', alertUrlManager(request.id))
```

(Confirm the exact field name holding the alert type on the created record — research found it as `type` on `StoreRequest`, but verify against the actual Prisma model before writing this.)

- [ ] **Step 4: Push the employee on acknowledge**

At the end of the acknowledge function (after the status update succeeds), push the original submitter:

```ts
sendPushToUser(request.submitterId, '✅ Alert Reviewed', 'Your store alert has been handled by your manager.', 'STORE_REQUEST', storeRequestUrlEmployee(request.id))
```

(Confirm the exact field name for the submitter's user id — research referred to it as `submitterId`/`submitterName` in places and `submittedById` in others across different models; use whatever `StoreRequest`'s actual schema field is called, don't assume it matches `EmployeeItemRequest`'s naming.)

- [ ] **Step 5: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/storeRequest.controller.ts
git commit -m "feat: push notifications for store alerts (submit -> manager, acknowledge -> employee)"
```

---

### Task 4: Backend — add Stock Requests to the admin notification bell feed

**Files:**
- Modify: `backend/src/utils/notificationRoutes.ts` — add `adminStockRequestUrl`
- Modify: `backend/src/controllers/billing.controller.ts` — add a Stock Requests section to both notification-feed functions (same two functions touched in Task 1)

**Context:** The admin bell feed already surfaces pending Store Alerts and Product Requests as clickable cards; pending `EmployeeItemRequest`s (Stock Requests) never appear there at all. Now that they're gaining equal footing in the unified admin hub (Task 12), the bell feed should cover them too.

- [ ] **Step 1: Add the route builder**

In `backend/src/utils/notificationRoutes.ts`, add (near `adminAlertUrl`/`adminProductRequestUrl`):

```ts
export function adminStockRequestUrl(storeId: string, requestId: string): string {
  return `/store-requests?storeId=${storeId}&tab=stock&highlightId=${requestId}`;
}
```

- [ ] **Step 2: Add a Stock Requests query + notification section, matching the existing Store Alert pattern exactly**

In `backend/src/controllers/billing.controller.ts`, in both notification-feed functions (same two spots touched in Task 1), add a `pendingStockRequests` query alongside the existing `pendingStoreAlerts`/`pendingProductRequests` ones — same `Promise.all` array, same `try`/`catch` graceful-degrade wrapper if one exists around the neighboring queries (match whatever error-handling convention the surrounding code already uses):

```ts
prisma.employeeItemRequest.findMany({
  where: { status: 'PENDING' },
  include: { store: { select: { id: true, name: true } }, submittedBy: { select: { name: true } }, lines: true },
}),
```

Then, in the loop that builds notification cards, add:

```ts
for (const r of pendingStockRequests) {
  notifications.push({
    id: `stock-request-${r.id}`,
    type: 'REQUEST',
    category: 'requests',
    title: `Stock Request — ${r.submittedBy?.name || 'Employee'}`,
    message: `${r.lines.length} item${r.lines.length !== 1 ? 's' : ''} requested at ${r.store.name}`,
    createdAt: r.createdAt.toISOString(),
    isRead: false,
    severity: 'info',
    actionUrl: adminStockRequestUrl(r.store.id, r.id),
    actionLabel: 'Review Request',
  });
}
```

Confirm the exact field names (`submittedBy`, `lines`, `store`) against `EmployeeItemRequest`'s actual Prisma schema and `employeeRequest.controller.ts`'s existing queries before writing this — don't assume the shape above is exactly right, it's based on research, not a fresh read.

- [ ] **Step 3: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add backend/src/utils/notificationRoutes.ts backend/src/controllers/billing.controller.ts
git commit -m "feat: surface pending Stock Requests in the admin notification bell feed"
```

---

### Task 5: Mobile — rename the manager nav group label

**Files:**
- Modify: `mobile/i18n/en.json`, `mobile/i18n/es.json`

**Context:** The manager drawer's nav item for this whole hub is currently labeled "Item Requests" (`nav.itemRequests`), which undersells that it also covers non-item alerts. Rename to just "Requests", matching the admin nav's existing label for the same concept.

- [ ] **Step 1: Update the English string**

In `mobile/i18n/en.json`, change `"itemRequests": "Item Requests"` to `"itemRequests": "Requests"` (keep the key name `itemRequests` as-is — renaming the i18n *key* would require touching every `t('nav.itemRequests')` call site for zero user-visible benefit; only the displayed string needs to change).

- [ ] **Step 2: Update the Spanish string**

In `mobile/i18n/es.json`, find the corresponding `itemRequests` key and update its value to the Spanish equivalent of "Requests" (likely "Solicitudes" — confirm against how other "Requests"-like strings are already translated elsewhere in this same file for consistency, e.g. check what the employee-side `requests` key's Spanish translation looks like).

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors (this is a JSON-only change, but run it anyway since nothing else changed in this task).

- [ ] **Step 4: Commit**

```bash
git add mobile/i18n/en.json mobile/i18n/es.json
git commit -m "copy: rename manager nav label from 'Item Requests' to 'Requests'"
```

---

### Task 6: Mobile — vector icons for Store Alert types on the employee side

**Files:**
- Modify: `mobile/components/EmployeeRequestsScreen.tsx`

**Context:** The employee-side alert-type selection cards use emoji (📦🧹🛍️🔧); the manager-side rendering of the exact same four types already uses a vector `TypeIcon` helper (`PackageIcon`/`ClipboardIcon`/`ShoppingBagIcon`/`BriefcaseIcon`) in `ManagerRequestsScreen.tsx`. Bring the employee side in line.

- [ ] **Step 1: Read `ManagerRequestsScreen.tsx`'s `TypeIcon` helper**

Confirm its exact implementation (the type-to-icon mapping) so the employee side replicates it exactly rather than inventing a slightly different mapping.

- [ ] **Step 2: Read `EmployeeRequestsScreen.tsx`'s type-selection cards**

Find where the four emoji (📦🧹🛍️🔧) are rendered for Low Stock / Store Supplies / Customer Asking / Work Order.

- [ ] **Step 3: Replace the emoji with the same vector icons**

Import the same icon components (`PackageIcon`, `ClipboardIcon`, `ShoppingBagIcon`, `BriefcaseIcon` from `../components/Icons`) used by `ManagerRequestsScreen.tsx`'s `TypeIcon`, and either import/reuse that exact `TypeIcon` helper directly (preferred — avoids a second copy of the same type-to-icon mapping drifting out of sync) or replicate its mapping inline if `TypeIcon` isn't already exported in a reusable way. If it's not exported, add `export` to it in `ManagerRequestsScreen.tsx` and import it from there rather than duplicating the mapping.

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/EmployeeRequestsScreen.tsx mobile/components/ManagerRequestsScreen.tsx
git commit -m "style: use the same vector icons for alert types on employee and manager screens"
```

---

### Task 7: Mobile — pull-to-refresh on the manager hub's three tabs

**Files:**
- Modify: `mobile/components/ManagerRequestsScreen.tsx`

**Context:** All three `FlatList`s in this screen rely solely on 15s polling with no `RefreshControl` — every other comparable list screen in this codebase has pull-to-refresh.

- [ ] **Step 1: Read the three `useQuery` calls backing the Alerts/Stock/Products tabs**

Confirm their exact `refetch` function names (likely aliased per-query, e.g. `refetch: refetchAlerts`).

- [ ] **Step 2: Add `RefreshControl` to all three `FlatList`s**

Add a shared `refreshing`/`onRefresh` pattern (a single `refreshing` boolean state is fine even though there are three lists, since only one tab is visible at a time — set it true, call the current tab's `refetch()`, set it false on completion, matching the pattern already used in `mobile/app/(employee)/stock-request.tsx`'s `MyRequests` component, which already has this).

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ManagerRequestsScreen.tsx
git commit -m "feat: add pull-to-refresh to the manager Requests hub"
```

---

### Task 8: Mobile — status filter on the manager's Products tab

**Files:**
- Modify: `mobile/components/ManagerRequestsScreen.tsx`

**Context:** The Alerts and Stock tabs both have an All/Pending/Done-style sub-filter row; the Products tab has none, always showing the full unfiltered list.

- [ ] **Step 1: Read the Alerts tab's existing filter-row implementation**

Confirm its exact structure (state variable, filter values, chip styling) to replicate precisely.

- [ ] **Step 2: Add an equivalent filter row to the Products tab**

Products has three real statuses per research (Pending/Accepted/Declined, not just Pending/Done like Alerts) — build the filter chip row with those three plus "All", following the same visual pattern as the Alerts tab's chips.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ManagerRequestsScreen.tsx
git commit -m "feat: add a status filter to the manager Products tab, matching Alerts and Stock"
```

---

### Task 9: Mobile — instructional copy on the manager hub

**Files:**
- Modify: `mobile/components/ManagerRequestsScreen.tsx`

**Context:** None of the three tabs currently explain what they're for or what happens when a manager acts — just empty-state one-liners. Add one short explanatory line per tab (not a full help doc — a single sentence under each tab's header).

- [ ] **Step 1: Add a one-line explainer under each tab's header/filter row**

- Alerts: "Quick flags from your team — mark handled once you've dealt with it."
- Stock: "Multi-item requests from your team — accepted items get added straight to your Order List."
- Products: "Customer requests to carry a specific product."

Style each as small, muted text (reuse whatever muted-text style token this file already uses elsewhere — don't invent a new color/size).

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/ManagerRequestsScreen.tsx
git commit -m "docs: add a one-line explainer under each tab in the manager Requests hub"
```

---

### Task 10: Mobile — instructional copy on employee Stock Request screen

**Files:**
- Modify: `mobile/app/(employee)/stock-request.tsx`

**Context:** The only help text in this whole flow is "Type to search from order history, or add any item manually." Add two small, targeted additions: what Low Stock vs Customer Ask actually means, and a legend for the order-list lifecycle badges (On order list → Ordered → Received) an employee sees in "My Requests" — both currently unexplained anywhere.

- [ ] **Step 1: Add a one-line explainer under the Low Stock / Customer Ask type toggle in `NewRequestForm`**

E.g. "Low Stock helps track what regularly runs out. Customer Ask flags something a customer specifically wanted." — placed directly under the type toggle, small muted text.

- [ ] **Step 2: Add a small legend above the lifecycle-status badges in `MyRequests`**

Where accepted-line badges (On order list / Ordered / Received) are rendered, add a one-time small caption above the first request card (or a persistent small legend row at the top of the "My Requests" tab) explaining: "On order list → Ordered → Received tracks your item once a manager accepts it."

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(employee)/stock-request.tsx"
git commit -m "docs: add explainer copy to employee Stock Request screen"
```

---

### Task 11: Mobile — badge scope-mismatch hint on the manager hub

**Files:**
- Modify: `mobile/components/ManagerRequestsScreen.tsx`
- Modify: `mobile/app/(manager)/_layout.tsx` (only if needed to pass extra data down — check first)

**Context:** The drawer nav badge sums pending counts across **all** of a manager's stores; the in-screen tab badges are scoped to whichever store is currently selected. A manager with 2 stores can see "5" on the drawer icon but "2" on the currently-open tab with no indication the other 3 are in a different store.

- [ ] **Step 1: Confirm whether the manager's other-store pending counts are already fetched anywhere accessible to this screen**

Check whether `ManagerRequestsScreen.tsx` (or its store-picker) already has access to per-store breakdowns, or only the current store's data plus the drawer's already-summed total. If only the summed total is available and no per-store breakdown exists, this task is scoped down to the simplest honest version: a hint that some pending items may be in another store, without claiming an exact count.

- [ ] **Step 2: Add a small hint when the manager has more than one store**

If the manager has multiple stores (the existing store-picker only renders when `stores.length > 1`, matching Chat's `stores.length > 1` convention — reuse that same condition), and viewing an individual tab, add a small muted line near the store picker: "Switch stores to see requests from your other locations" — a static reminder rather than a computed exact-count mismatch indicator, since Step 1 may not have exact per-store numbers available. If Step 1 finds real per-store breakdown data is already available, prefer showing the more specific "+N pending in other stores" version instead of the generic reminder.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/components/ManagerRequestsScreen.tsx
git commit -m "feat: hint that other stores may have pending requests, for multi-store managers"
```

---

### Task 12: Admin — merge Stock Requests into `StoreRequests.tsx` as a third tab

**Files:**
- Modify: `admin/src/pages/StoreRequests.tsx` (major change — add third tab, rename `activeTab` type)
- Read (for reference, not modification in this task): `admin/src/pages/OrderList.tsx`'s `RequestsTab` function (~lines 1003-1169) — this is the UI being ported and restyled, not copy-pasted verbatim

**Context:** This is the core of the "unify into one hub" decision. Stock Requests (`EmployeeItemRequest`) currently live in `OrderList.tsx` with visibly older UI (native `<select>` dropdowns, ▲/▼ text accordions, ✓/✕ text buttons). Port the functionality into `StoreRequests.tsx`, restyled to match this file's existing card language (icon chips, avatar+submitter+time row, priority/status badges, chip-row filters) — the same visual language already used for Alerts and Products in this exact file.

- [ ] **Step 1: Read `StoreRequests.tsx` in full**

Confirm the exact current structure: the `activeTab` state (`'employee' | 'product'`), the store-sidebar, the per-tab query hooks, the card-rendering functions for Alerts and Products, the `isReadOnly`/`isStoreManager` role-gating pattern, and the chip-filter row pattern for each tab.

- [ ] **Step 2: Read `OrderList.tsx`'s `RequestsTab` in full**

Confirm exactly what data it queries (`employeeRequestApi` calls), what actions it offers (per-line accept/reject with rejection-reason chips, "Accept All"), and its store/status filter state — this is the *functionality* to preserve; the *visual implementation* gets rebuilt to match `StoreRequests.tsx`'s conventions, not copied as-is.

- [ ] **Step 3: Rename the tab-state type and add the third value**

Change `activeTab` from `'employee' | 'product'` to `'alert' | 'stock' | 'product'`. Update the `searchParams.get('tab')` parsing (currently `=== 'product' ? 'product' : 'employee'`) to a three-way check, defaulting to `'alert'`. Update every place `activeTab === 'employee'` is checked to `activeTab === 'alert'`.

- [ ] **Step 4: Update Task 1's `tab=employee` query value everywhere it's produced**

`adminAlertUrl` (renamed in Task 1) still builds `tab=employee` — now that this page's tab-state uses `'alert'`, update `adminAlertUrl` in `notificationRoutes.ts` to build `tab=alert` instead, and update `adminEmployeeRequestUrl`'s (already renamed to `adminAlertUrl`) query string accordingly. This is the one small piece of Task 1 that was deliberately deferred to here since it depends on this task's tab-state rename.

- [ ] **Step 5: Add the third tab button**

Add a "📦 Stock Requests" tab button alongside the existing "🔔 Store Alerts" and "🛍️ Product Requests" buttons, following the exact same styling/active-state pattern already used for the other two.

- [ ] **Step 6: Add the Stock tab's data fetching**

Add a `useQuery` for `employeeRequestApi.getByStore(storeId)` (or whatever the exact existing admin/mobile API client method is called — check `admin/src/services/api.ts` for an existing `employeeRequestApi`, and add one modeled on `storeRequestApi`/`productRequestApi` in the same file if it doesn't already exist there), enabled only when `activeTab === 'stock'`, following the same `enabled:` gating pattern the Products query already uses (`enabled: !!effectiveStoreId && activeTab === 'product'`).

- [ ] **Step 7: Build the Stock tab's card list**

For each `EmployeeItemRequest`, render a card matching this file's established language: icon chip (`PackageIcon` via lucide-react, matching Task 6's mobile icon choice for visual consistency across platforms), submitter name + time, item-count summary, and (for `STORE_MANAGER` only, matching this file's existing `isReadOnly` gate) a "Review Items" action that opens a per-line accept/reject interface — port `OrderList.tsx`'s accept-all/per-line/rejection-reason-chip functionality here, restyled with this file's existing chip/badge/button visual language instead of `OrderList.tsx`'s plainer buttons.

- [ ] **Step 8: Add the Stock tab's status filter**

Match the Alerts tab's All/Pending/Done-style chip row, adapted to whatever statuses `EmployeeItemRequest` actually has (research found `PENDING`/`REVIEWED` at the request level).

- [ ] **Step 9: Ensure the Stock tab's accept/reject mutation invalidates the correct badge query key**

The sidebar's Stock badge (moved to the "Requests" nav item in Task 14) reads a specific query key — confirm what it's called once Task 14 is done (or read `AppSidebar.tsx`'s current `employee-requests-pending-count`/similar key now, since that's the key this new mutation needs to invalidate) and make sure the new mutation's `onSuccess` invalidates it, so this new tab doesn't ship with the same staleness bug Task 15 is about to fix on the other two tabs.

- [ ] **Step 10: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 11: Commit**

```bash
git add admin/src/pages/StoreRequests.tsx backend/src/utils/notificationRoutes.ts
git commit -m "feat: merge Stock Requests into the unified admin Requests hub"
```

---

### Task 13: Admin — remove the now-redundant `RequestsTab` from `OrderList.tsx`

**Files:**
- Modify: `admin/src/pages/OrderList.tsx`

**Context:** With Task 12 landed, this tab is fully redundant and would let the two diverge if left in place.

- [ ] **Step 1: Remove the `RequestsTab` function, its tab button, and its route into the page's tab-switcher**

Confirm nothing else in this file (or elsewhere) still references `RequestsTab` before deleting — check for any leftover import or type reference.

- [ ] **Step 2: Confirm the Categories tab (DevAdmin-only) is unaffected**

This task removes only the Requests tab, not Categories — make sure the tab-switcher logic still correctly shows Categories to DevAdmin after Requests is gone.

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/OrderList.tsx
git commit -m "cleanup: remove RequestsTab from Order List page, now merged into the unified Requests hub"
```

---

### Task 14: Admin — move the Stock badge count from "Order List" to "Requests" in the nav

**Files:**
- Modify: `admin/src/components/AppSidebar.tsx`

**Context:** Confirmed from research: the "Order List" nav item's badge currently sums the Stock/`EmployeeItemRequest` pending count plus pending-category-approval count; the "Requests" nav item sums Store-Alert + Product-Request pending counts. Now that Stock lives in the Requests hub, its count should move to that badge.

- [ ] **Step 1: Read the current badge-count logic for both nav items**

Confirm the exact query keys and how they're summed (research cited `AppSidebar.tsx:156-179` — confirm current line numbers).

- [ ] **Step 2: Move the Stock/`EmployeeItemRequest` pending-count query into the "Requests" nav item's sum**

The "Order List" nav item keeps only its category-approval pending count (if that count becomes the only thing left, confirm the badge still renders sensibly when it's the sole contributor — don't leave a badge showing "0" when there's nothing to show, match whatever the existing zero-badge-hiding convention is elsewhere in this file).

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/components/AppSidebar.tsx
git commit -m "fix: move Stock Requests badge count from Order List nav item to Requests nav item"
```

---

### Task 15: Admin — fix badge staleness on Alerts and Products actions

**Files:**
- Modify: `admin/src/pages/StoreRequests.tsx`

**Context:** `acknowledgeMutation` invalidates `['store-requests']`/`['store-requests-count']`, but the sidebar badge's actual query key is `['store-requests-pending-count']` (confirm exact key from `AppSidebar.tsx`) — different key, so acknowledging an alert here doesn't refresh the sidebar badge until its own poll fires (up to 60s later). `respondMutation` for Product Requests has the same gap against `['product-requests-pending-count']`.

- [ ] **Step 1: Confirm the exact sidebar badge query keys**

Read `AppSidebar.tsx` (touched in Task 14) for the precise key strings.

- [ ] **Step 2: Add the missing invalidations**

In `acknowledgeMutation`'s `onSuccess`, add `qc.invalidateQueries({ queryKey: ['store-requests-pending-count'] })` alongside its existing invalidations. In `respondMutation`'s `onSuccess`, add `qc.invalidateQueries({ queryKey: ['product-requests-pending-count'] })` alongside its existing one.

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/StoreRequests.tsx
git commit -m "fix: sidebar badge count refreshes immediately after acknowledging an alert or responding to a product request"
```

---

### Task 16: Admin — missing error state on the Products tab

**Files:**
- Modify: `admin/src/pages/StoreRequests.tsx`

**Context:** The Alerts tab already has `isError ? <ErrorState .../> : ...`; the Products half of this same file doesn't have the equivalent branch (`prLoading` is checked, but no `prIsError` branch was found in research).

- [ ] **Step 1: Confirm the Products query's error state is actually exposed**

Read the Products `useQuery` call — confirm it destructures `isError` (likely under a different alias like `prIsError`, matching the existing `prLoading` naming convention in this file) and a `refetch` function. If `isError` isn't currently destructured at all, add it to the destructuring.

- [ ] **Step 2: Add the missing `ErrorState` branch**

Mirror the Alerts tab's exact pattern: `prIsError ? <ErrorState message="Failed to load product requests." onRetry={refetchProducts} /> : ...`.

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/StoreRequests.tsx
git commit -m "fix: add missing error state to the Products tab, matching Alerts and Stock"
```

---

### Task 17: Append manual verification section to the consolidated checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Append a new section**

Add a new `## 7. Requests hub redesign (2026-07-18)` section at the end of the file with these unchecked items:

```markdown
## 7. Requests hub redesign (2026-07-18)

- [ ] Submit a Store Alert as an employee → confirm the assigned manager gets a push notification that lands on the Alerts tab with the right card pulsing
- [ ] Acknowledge that alert as a manager → confirm the employee gets a push notification back
- [ ] Check admin web's notification bell as DevAdmin/SuperAdmin → confirm a pending Stock Request now appears as a card, and clicking it lands on the new Stock tab in the Requests hub with the right one highlighted
- [ ] On employee mobile, confirm the four alert-type icons (Low Stock/Store Supplies/Customer Asking/Work Order) now match the vector icons used on the manager side, not emoji
- [ ] Pull down to refresh on each of the manager hub's three tabs (Alerts/Stock/Products) → confirm it actually refetches
- [ ] On the manager hub's Products tab, confirm a status filter row now exists (All/Pending/Accepted/Declined or similar) and actually filters
- [ ] Read the one-line explainer text under each of the manager hub's three tabs → confirm it renders and makes sense
- [ ] On employee Stock Request screen, confirm the Low Stock vs Customer Ask explainer and the order-list lifecycle legend both appear
- [ ] As a manager assigned to 2+ stores, confirm some kind of "other stores may have pending requests" hint appears when appropriate
- [ ] On admin web, confirm Order List's page no longer has a "Requests" tab, and the Requests hub (`/store-requests`) now has three tabs: Alerts, Stock, Products
- [ ] On admin web, use the Stock tab to accept/reject a request → confirm it behaves the same as it used to on the old Order List page (per-line accept/reject, rejection reasons, Accept All)
- [ ] Check the "Order List" and "Requests" nav badges on admin web → confirm Stock's pending count now shows on "Requests," not "Order List"
- [ ] Acknowledge a Store Alert or respond to a Product Request on admin web → confirm the sidebar badge count updates immediately, not after up to a minute
- [ ] Force a Product Requests load failure on admin web → confirm a retry button now appears (previously it silently showed nothing/stale data)
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add Requests hub redesign section to the manual test checklist"
```
