# Order List: Standing Instructions + Auto-Reopen

## Problem

The Order List (procurement ticketing) system has two gaps found while investigating a related admin-web bug ([2026-07-10 async/orderlist session]):

1. **No way to leave a standing note for a store's ordering.** `OrderList.notes` exists in the schema but is described as "optional note when closing" — it's never surfaced in any UI (mobile has zero references to it; the admin web "Close List" confirmation has no notes input either). There's no way for HQ (DevAdmin/SuperAdmin, web-only) or a Store Manager (mobile-only) to leave something like "call supplier before ordering dairy" that the other side will actually see.

2. **Closing a list leaves the store without an open one until someone manually opens a new one.** A "+ Open List" button was just added to the admin web page to fix an immediate case of this (2 of 12 stores had no open list and no way to create one), but the underlying gap remains: every list close requires a separate manual open afterward.

## Changes

### 1. Standing instructions field — lives on `Store`, not `OrderList`

Add `orderInstructions String?` (max 300 chars) to the `Store` model. This is deliberately store-level, not per-list: the requirement ("carries over when a list closes and the next one opens") is exactly what a store-level field gives for free, with no copy-forward logic and no risk of the copy drifting from the source. The trade-off is that a closed list's historical record won't show "what the instructions were at that time" — only the current value is ever visible. That's an accepted trade-off; no request was made for historical snapshotting.

Drop the vestigial `notes` handling in `closeList` (`backend/src/controllers/orderList.controller.ts`) — it was never wired to any UI on either platform, so removing it changes no observable behavior. The `OrderList.notes` schema field itself is left in place (unused) rather than migrated away, to avoid a data migration for a field that was already empty in practice.

### 2. New endpoint: `PATCH /stores/:storeId/order-instructions`

- Body: `{ instructions: string | null }` (300 char max, empty string/null clears it)
- Middleware: `authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess` — this is the same pattern used elsewhere in this codebase for actions both a store's own manager and any SUPER_ADMIN+ can take (see `openList`), and correctly allows both audiences named in this spec (Store Manager for their own store via mobile; DevAdmin/SuperAdmin for any store via web) without allowing a manager to touch another store's note.
- Handler: simple `prisma.store.update({ where: { id: storeId }, data: { orderInstructions: instructions?.trim() || null } })`.

### 3. Display + edit UI

**Admin web** (`admin/src/pages/OrderList.tsx`, `OrderListDetail` component): a small editable banner between the list header and the two-column item body. Shows the current instructions text (or a muted "No standing instructions — click to add" placeholder if empty) with a pencil affordance; click opens an inline textarea + Save/Cancel, matching the existing inline-edit pattern already used for item quantity editing on this same page. Visible to anyone who can view the list detail (read-only for roles without `canEdit`/`canClose`... actually: since both DevAdmin and SuperAdmin should be able to edit this per the "both, either can edit" decision, and `canClose` is already `isDevAdmin || isSuperAdmin`, gate editing on `canClose` and make it read-only-display otherwise).

**Mobile** (`mobile/app/(manager)/order-list.tsx`): same concept — a banner at the top of the active list screen, editable inline by the Store Manager viewing their own store's list. Uses the store's own `requireStoreAccess`-covered endpoint, so no new permission plumbing needed beyond the new route.

### 4. Auto-reopen on close

In `closeList` (`backend/src/controllers/orderList.controller.ts`), after the existing close logic succeeds, immediately create a new `OPEN` list for that store — reusing the same `generateListName` + `prisma.orderList.create` logic already in `openList` (extract into a small shared helper, e.g. `createListForStore(storeId, openedById)`, called from both `openList` and the tail of `closeList`). This always happens; no toggle, matching what was asked for. `closeList`'s response now includes both the closed list and the newly-opened one: `{ success: true, data: { closed: ..., reopened: ... } }`. Verified neither existing consumer (admin web's `closeMutation`, mobile's `closeListMutation`) reads the response body today — both just invalidate/refetch on success — so this shape change is safe.

The manual "+ Open List" button added earlier this session (`admin/src/pages/OrderList.tsx`, gated on `canClose`) stays as-is, for the edge case where a store has zero lists (brand new store, or auto-open somehow didn't fire).

## Out of scope

- No historical snapshot of instructions per closed list (see trade-off in section 1).
- No notification/push alert when instructions change — this is a passive banner, not an active ping. (Could be a future follow-up using the existing push-notification plumbing if it turns out people miss updates.)
- No change to who can close a list, or to the existing fraud/velocity flagging system for points transactions — unrelated subsystem.
- Mobile UI is a small addition to the existing `order-list.tsx` screen, not a new screen or navigation change.
