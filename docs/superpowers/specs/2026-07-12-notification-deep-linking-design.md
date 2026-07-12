# Notification Deep-Linking Infrastructure

## Problem

Across both apps, a notification tells you *something* happened but never takes you *there*:

1. **Push messages carry no data.** `backend/src/utils/push.ts` sends every Expo push as `{ to, title, body, sound }` — no `data` field. Even if the mobile app listened for taps, there'd be nothing to route on.
2. **Nothing listens for OS-level taps.** No `addNotificationResponseReceivedListener` or `getLastNotificationResponseAsync` exists anywhere in `mobile/` (repo-wide, confirmed). Tapping a push just opens the app to its default role landing screen. Only the in-app Notifications *list* (`mobile/components/NotificationsScreen.tsx`), opened manually, deep-links today — via a role-specific type-switch (`:191-238`) duplicated three times (customer/employee/manager).
3. **That switch is itself incomplete and, in one case, wrong.** `dispute.controller.ts:33-38` sends `DISPUTE_SUBMITTED` to store *employees* via `sendPushToStoreEmployees` — but `NotificationsScreen.tsx`'s `EMPLOYEE` switch (`:214-225`) has no case for it, so tapping it does nothing. The `STORE_MANAGER` switch does have a case (`:236`), but it routes to `/(manager)/home`, not the disputes screen.
4. **Admin web has no URL-addressable state for requests.** `admin/src/pages/StoreRequests.tsx` picks a store via local React state only — no `storeId`/`tab` query param — so even a correct link has nowhere to land. Contrast `Customers.tsx`, which already reads `?tab=disputes` from `useSearchParams`.
5. **Admin's Notifications bell omits disputes and requests entirely.** The synthesizer in `billing.controller.ts` only emits `billing`/`transactions`/`scheduling`/`customers` cards. Disputes and store/product requests exist only as sidebar badge counts (`AppSidebar.tsx:156-170`), with no click-through to a specific one.

Admin web *does* already have a working pattern worth reusing rather than reinventing: `billing.controller.ts` attaches a plain `actionUrl` string to each notification card, and `Notifications.tsx:167-176` just does `navigate(n.actionUrl)`.

## Changes

### 1. Adopt server-computed `actionUrl` everywhere (not a client-side route table)

Rather than have each client resolve `type → route` (today's approach, duplicated and already out of sync), the backend computes the actual destination path once, at notification-creation time, and every consumer just navigates to it blindly. This unifies three separate tap paths — OS push tap, in-app Notifications list tap, admin bell card click — onto one mechanism, and matches the pattern admin web already proved out.

### 2. Data model

Add `UserNotification.actionUrl String?` (nullable — a plain `type` is a bare string column already, so no enum migration concerns). Hand-authored migration SQL, matching this repo's established convention (no local `DATABASE_URL`, `prisma migrate dev` isn't available here).

### 3. Route-builder helpers — `backend/src/utils/notificationRoutes.ts`

One small function per destination, so a URL is never hand-typed at a call site. Mobile targets (ported 1:1 from the existing `NotificationsScreen.tsx` switch, so this is porting, not new route design):

| type | mobile actionUrl |
|---|---|
| `OFFER` | `/(customer)/home?scrollTo=offers` |
| `GAS_PRICE_UPDATE` (customer) | `/(customer)/home?scrollTo=gas` |
| `POINTS` | `/(customer)/history` |
| `REDEMPTION` | `/(customer)/rewards` |
| `HOT_FOOD_ORDER` | `/(employee)/hot-food?tab=PENDING` |
| `GAS_PRICE_UPDATE` (employee) | `/(employee)/scan` |
| `SHIFT_REQUEST` / `STORE_REQUEST` (employee) | `/(employee)/requests` |
| `SCHEDULE` | `/(employee)/schedule` |
| `STOCK_REQUEST` | `/(manager)/requests?tab=stock&highlightId={id}` |
| `PRODUCT_REQUEST` (manager) | `/(manager)/requests?tab=products&highlightId={id}` |
| `DISPUTE_SUBMITTED` (manager) | `/(manager)/disputes?highlightId={id}` |
| `DISPUTE_SUBMITTED` (employee) — new, currently a dead end | `/(employee)/disputes?highlightId={id}` (or nearest employee equivalent screen) |

Plus admin-only builders: `adminDisputeUrl(id)` → `/customers?tab=disputes&highlightId={id}`, `adminRequestUrl(storeId, tab, id)` → `/store-requests?storeId={storeId}&tab={tab}&highlightId={id}`.

### 4. Thread `actionUrl` through the existing push helpers

`push.ts` already centralizes sending behind five public functions (`sendPushToUser`, `sendPushToStoreEmployees`, `sendPushToStoreManagers`, `sendPushToStoreStaff`, `broadcastToCustomers`) that all funnel through `saveNotification`/`saveNotificationMany`. Add an optional `actionUrl?: string` parameter to each public function, forwarded into the saved `UserNotification` row and into the Expo push `data` field (`data: { actionUrl }`). Each of the ~10-12 call sites (`dispute.controller.ts`, `productRequest.controller.ts`, `employeeRequest.controller.ts`, etc.) then passes the relevant builder's output — a one-argument addition per call site, not a restructure.

### 5. Mobile: catch taps in every app state

In `mobile/app/_layout.tsx`, alongside the existing push-token registration:
- `Notifications.addNotificationResponseReceivedListener()` — foreground/backgrounded-but-alive taps.
- `Notifications.getLastNotificationResponseAsync()` — checked once on launch, for the cold-start case (app was fully killed).
- Both resolve to `router.push(actionUrl as Href)`.

`NotificationsScreen.tsx`'s three role-specific switches collapse into `router.push(item.actionUrl)`. This is also where the `DISPUTE_SUBMITTED` gaps (dead end for employees, wrong destination for managers) get fixed — as a consequence of migrating to real per-notification URLs, not as a separate patch.

### 6. Mobile: highlight-on-arrival

New shared hook, e.g. `useHighlightParam()`: on mount, if a `highlightId` route param is present, scroll the matching list item into view and run a ~1.5s pulse using React Native's built-in `Animated` API — **reusing the app's existing accent/brand color token, not a new color**, per the "stay within existing styling" constraint. Clears the param via `router.setParams` afterward so a later revisit doesn't re-trigger it. Applied to every screen these types can land on (manager disputes/requests, employee requests/hot-food/schedule, customer home/history/rewards) — one hook call each, no per-screen animation code. If the target item isn't in the currently-loaded list (already resolved/filtered out), the hook no-ops silently.

### 7. Admin web: `StoreRequests.tsx` becomes URL-addressable

Reads `storeId`, `tab` (`alerts`/`products`), and `highlightId` from `useSearchParams` — same pattern already used in `Customers.tsx` for `?tab=disputes` — and auto-selects the store + sub-tab on mount when present.

### 8. Admin web: bell feed gains dispute/request cards

`billing.controller.ts`'s notification synthesizer gains two new sections (pending disputes, pending store/product requests), built the same way the existing sections are, each carrying a real `actionUrl`. Because these are computed live from current pending records rather than a persisted log, a card disappears on its own once resolved — same self-cleaning behavior the existing billing cards already have, no extra expiry logic. `Notifications.tsx`'s `CAT` styling map gets two new entries (`disputes`, `requests`) using the **same color/icon system already defined there** (`SEV`/`CAT` objects), not new design tokens.

### 9. Admin web: highlight-on-arrival

On landing with a `highlightId`, the target page calls `scrollIntoView({behavior:'smooth', block:'center'})` on the matching card/row and applies a temporary CSS class pulsing `box-shadow` in the **existing accent color already used for this app's borders/focus states** for ~1.5s, then removes the class.

### 10. Unaffected on purpose

Sidebar badge counts and clicks (`AppSidebar.tsx`) are unchanged — they still link to the plain page root. A badge is a count, not a pointer to one record; only bell-feed cards and notification taps carry a `highlightId`.

## Verification

This repo has no test framework — `tsc --noEmit` per sub-app (`backend`/`admin`/`mobile`) plus manual click-through is the established method here. Specifically:
1. `npx tsc --noEmit` in all three after each change.
2. Trigger each real flow (submit a dispute/request, etc.) and confirm both the in-app Notifications list and the admin bell feed land on the right item with the highlight firing.
3. **OS-tap testing needs a real device** — simulators don't reliably deliver pushes, and this is the core of the feature. Foreground, backgrounded, and fully-killed cold-start taps all need checking on-device; this leg can't be verified in a coding session and needs the user to confirm on their phone once a build is out.

## Out of scope

- Transaction-linked disputes (a customer disputing one specific transaction, with the admin seeing the linked transaction + receipt) — separate sub-project, needs its own `PointsDispute.transactionId` schema change and new UI entry point from `history.tsx`.
- Careers badge/notification and the stale-cache refetch bug — separate sub-project, though it will reuse the `actionUrl`/push-data mechanism built here once tackled.
- App icon swap — unrelated, separate sub-project.
- Any redesign of admin's Notifications page beyond adding the two new category entries to the existing `CAT`/`SEV` maps — no new visual language, per the "don't go out of existing styling" constraint.
- Migrating off Expo's push service or `expo-notifications` — out of scope, unrelated to this gap.
- Read-state analytics/history — this only affects where a tap lands, not what's tracked about it.
