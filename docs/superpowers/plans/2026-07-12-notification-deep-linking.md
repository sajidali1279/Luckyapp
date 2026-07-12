# Notification Deep-Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every notification (push, in-app list, admin bell feed) carries a real destination URL computed once on the backend, so tapping it lands on the exact record it's about — with a brief scroll-and-pulse highlight — instead of opening to a default screen or doing nothing.

**Architecture:** A new `backend/src/utils/notificationRoutes.ts` builds every destination URL from a small set of functions. That URL is stored on `UserNotification.actionUrl` and included in the Expo push `data` payload. Mobile adds an OS-level tap listener (foreground/background/cold-start) that navigates to `actionUrl`; the in-app Notifications list is simplified to do the same instead of its old duplicated per-role switch. Admin's existing notification-card `actionUrl` pattern (already live for billing/transactions) is extended to disputes and requests, which don't appear there today at all. A shared `highlightId` query param tells the destination screen which row to scroll to and pulse.

**Tech Stack:** Node/Express + Prisma/Postgres (backend), React Native + Expo Router (mobile), React + react-router-dom (admin). **This repo has no test framework** — verification throughout is `npx tsc --noEmit` per sub-app plus manual click-through, not automated tests. Prisma migrations are hand-authored SQL (no local `DATABASE_URL`, so `prisma migrate dev` can't run) — match the style of `backend/prisma/migrations/20260712000000_add_store_order_instructions/migration.sql`.

**Design spec:** `docs/superpowers/specs/2026-07-12-notification-deep-linking-design.md`

**Scope note:** During planning, auditing every notification call site (required because the old per-role switch is being deleted — any type not given an `actionUrl` would silently stop navigating, a regression) surfaced a few gaps beyond what the spec named: `HOT_FOOD_ORDER` pushed to a *customer* ("your food is ready") has no existing customer-facing order-status screen to land on — left with no `actionUrl` (matches today's already-dead behavior, not a regression, and building a new screen is out of scope per the spec). `SHIFT_REQUEST` pushes mostly target DevAdmin/SuperAdmin, who are web-only and never see mobile push taps — left unwired for the same reason. Everything else is wired below.

---

## File Structure

**Backend — new:**
- `backend/prisma/migrations/20260712010000_add_notification_action_url/migration.sql` — adds the column
- `backend/src/utils/notificationRoutes.ts` — every destination URL, in one place

**Backend — modified:**
- `backend/prisma/schema.prisma` — `UserNotification.actionUrl`
- `backend/src/utils/push.ts` — threads `actionUrl` through the 5 send functions
- `backend/src/controllers/dispute.controller.ts`, `productRequest.controller.ts`, `employeeRequest.controller.ts` — pass builder output at each call site
- `backend/src/controllers/offers.controller.ts`, `points.controller.ts`, `receipt.controller.ts`, `catalog.controller.ts`, `hotFood.controller.ts`, `billing.controller.ts`, `backend/src/utils/catalog-expiry-cron.ts` — same, for the remaining call sites that already work via the old switch and would otherwise regress
- `backend/src/controllers/billing.controller.ts` — new dispute/request sections in the admin notification synthesizer (separate change from the line above)

**Mobile — new:**
- `mobile/components/PulseHighlight.tsx` — reusable glow-on-arrival wrapper
- `mobile/hooks/useHighlightParam.ts` — reads/clears the `highlightId` param

**Mobile — modified:**
- `mobile/app/_layout.tsx` — OS-level tap listener + cold-start check
- `mobile/components/NotificationsScreen.tsx` — replace the 3 role-switches with `router.push(item.actionUrl)`
- `mobile/components/ManagerDisputesScreen.tsx`, `ManagerRequestsScreen.tsx`, `mobile/app/(employee)/hot-food.tsx`, `mobile/app/(employee)/stock-request.tsx`, `mobile/app/(customer)/history.tsx`, `mobile/app/(customer)/rewards.tsx`, `mobile/app/(customer)/request-product.tsx`, `mobile/app/(customer)/my-disputes.tsx` — highlight wiring

**Admin — modified:**
- `admin/src/index.css` — pulse keyframe (reuses existing `--ease-premium` and brand navy `#1D3557`)
- `admin/src/pages/StoreRequests.tsx` — URL-addressable store/tab/highlight state
- `admin/src/pages/Customers.tsx` — highlight wiring on the disputes tab
- `admin/src/pages/Notifications.tsx` — `disputes`/`requests` categories

---

### Task 1: Database migration — `UserNotification.actionUrl`

**Files:**
- Modify: `backend/prisma/schema.prisma:718-732`
- Create: `backend/prisma/migrations/20260712010000_add_notification_action_url/migration.sql`

- [ ] **Step 1: Add the field to the Prisma schema**

In `backend/prisma/schema.prisma`, change the `UserNotification` model:

```prisma
model UserNotification {
  id        String    @id @default(uuid())
  userId    String
  title     String
  body      String
  type      String    // "OFFER" | "POINTS" | "REDEMPTION" | "SCHEDULE" | "SHIFT_REQUEST" | "STORE_REQUEST"
  actionUrl String?   // where tapping this notification should navigate to
  isRead    Boolean   @default(false)
  expiresAt DateTime? // when set, notification is hidden after this time (used for OFFER type)
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, isRead])
  @@map("user_notifications")
}
```

- [ ] **Step 2: Write the migration**

Create `backend/prisma/migrations/20260712010000_add_notification_action_url/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "user_notifications" ADD COLUMN "actionUrl" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client` with no errors. (This repo has no local `DATABASE_URL`, so the migration itself isn't applied here — it ships to production the normal way this repo already deploys migrations. `prisma generate` is what makes `actionUrl` type-check in the code that follows.)

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260712010000_add_notification_action_url
git commit -m "feat: add actionUrl column to UserNotification"
```

---

### Task 2: Route-builder helpers

**Files:**
- Create: `backend/src/utils/notificationRoutes.ts`

- [ ] **Step 1: Write the file**

```ts
// Every notification destination URL, built once here instead of re-derived
// (and drifting out of sync) by three separate mobile role-switches and an
// admin page. Optional ids are omitted from the query string when absent —
// the destination screen's highlight hook just no-ops if nothing matches.

function withHighlight(base: string, id?: string): string {
  return id ? `${base}?highlightId=${id}` : base;
}

// ─── Mobile: Customer ──────────────────────────────────────────────────────
export function offerUrl(): string {
  return '/(customer)/home?scrollTo=offers';
}
export function gasPriceUrlCustomer(): string {
  return '/(customer)/home?scrollTo=gas';
}
export function pointsUrl(transactionId?: string): string {
  return withHighlight('/(customer)/history', transactionId);
}
export function redemptionUrl(redemptionId?: string): string {
  return withHighlight('/(customer)/rewards', redemptionId);
}
export function productRequestUrlCustomer(requestId: string): string {
  return withHighlight('/(customer)/request-product', requestId);
}
export function disputeResolvedUrl(disputeId: string): string {
  return withHighlight('/(customer)/my-disputes', disputeId);
}

// ─── Mobile: Employee ──────────────────────────────────────────────────────
export function hotFoodOrderUrl(orderId: string): string {
  return `/(employee)/hot-food?tab=PENDING&highlightId=${orderId}`;
}
export function gasPriceUrlEmployee(): string {
  return '/(employee)/scan';
}
export function shiftRequestUrlEmployee(): string {
  return '/(employee)/requests';
}
export function storeRequestUrlEmployee(): string {
  return '/(employee)/requests';
}
export function scheduleUrl(): string {
  return '/(employee)/schedule';
}
export function stockRequestUrlEmployee(requestId: string): string {
  return withHighlight('/(employee)/stock-request', requestId);
}
export function disputeSubmittedUrlEmployee(): string {
  return '/(employee)/home';
}

// ─── Mobile: Store Manager ─────────────────────────────────────────────────
export function stockRequestUrlManager(requestId: string): string {
  return `/(manager)/requests?tab=stock&highlightId=${requestId}`;
}
export function productRequestUrlManager(requestId: string): string {
  return `/(manager)/requests?tab=products&highlightId=${requestId}`;
}
export function alertUrlManager(): string {
  return '/(manager)/home';
}

// ─── Admin web ──────────────────────────────────────────────────────────────
export function adminDisputeUrl(disputeId: string): string {
  return `/customers?tab=disputes&highlightId=${disputeId}`;
}
export function adminEmployeeRequestUrl(storeId: string, requestId: string): string {
  return `/store-requests?storeId=${storeId}&tab=employee&highlightId=${requestId}`;
}
export function adminProductRequestUrl(storeId: string, requestId: string): string {
  return `/store-requests?storeId=${storeId}&tab=product&highlightId=${requestId}`;
}
```

- [ ] **Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (this file has no external dependencies beyond TypeScript itself).

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/notificationRoutes.ts
git commit -m "feat: add notification route-builder helpers"
```

---

### Task 3: Thread `actionUrl` through `push.ts`

**Files:**
- Modify: `backend/src/utils/push.ts` (full file, 97 lines)

- [ ] **Step 1: Replace the file contents**

```ts
import prisma from '../config/prisma';
import { Role } from '@prisma/client';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

async function saveNotification(userId: string, title: string, body: string, type: string, actionUrl?: string, expiresAt?: Date) {
  try {
    await prisma.userNotification.create({ data: { userId, title, body, type, actionUrl, ...(expiresAt && { expiresAt }) } });
  } catch { /* non-critical */ }
}

export async function saveNotificationMany(userIds: string[], title: string, body: string, type: string, actionUrl?: string, expiresAt?: Date) {
  if (userIds.length === 0) return;
  try {
    await prisma.userNotification.createMany({
      data: userIds.map((userId) => ({ userId, title, body, type, actionUrl, ...(expiresAt && { expiresAt }) })),
    });
  } catch { /* non-critical */ }
}

/** Send push + in-app notification to all staff (employees + managers) of a specific store. */
export async function sendPushToStoreStaff(storeId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  return sendPushToStoreByRole(storeId, title, body, type, actionUrl);
}

/** Send push + in-app notification to employees only (excludes store managers). */
export async function sendPushToStoreEmployees(storeId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  return sendPushToStoreByRole(storeId, title, body, type, actionUrl, Role.EMPLOYEE);
}

/** Send push + in-app notification to store managers only (excludes employees). */
export async function sendPushToStoreManagers(storeId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  return sendPushToStoreByRole(storeId, title, body, type, actionUrl, Role.STORE_MANAGER);
}

async function sendPushToStoreByRole(storeId: string, title: string, body: string, type: string, actionUrl?: string, role?: Role): Promise<void> {
  try {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { storeId, ...(role ? { role } : {}) },
      include: { user: { include: { pushTokens: { select: { token: true } } } } },
    });
    if (storeRoles.length === 0) return;

    const userIds = storeRoles.map((r) => r.userId);
    await saveNotificationMany(userIds, title, body, type, actionUrl);

    const tokens = storeRoles.flatMap((r) => r.user.pushTokens.map((t) => t.token));
    if (tokens.length === 0) return;

    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map((token) => ({ to: token, title, body, sound: 'default', ...(actionUrl && { data: { actionUrl } }) }))),
    });
  } catch { /* non-critical */ }
}

/** Send a push notification to all devices registered for a single user. */
export async function sendPushToUser(userId: string, title: string, body: string, type = 'GENERAL', actionUrl?: string): Promise<void> {
  saveNotification(userId, title, body, type, actionUrl); // always save to in-app inbox

  try {
    const tokens = await prisma.pushToken.findMany({ where: { userId }, select: { token: true } });
    if (tokens.length === 0) return;
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tokens.map(({ token }) => ({ to: token, title, body, sound: 'default', ...(actionUrl && { data: { actionUrl } }) }))),
    });
  } catch { /* non-critical */ }
}

/** Broadcast a push notification to all customers (role = CUSTOMER). */
export async function broadcastToCustomers(title: string, body: string, type = 'OFFER', expiresAt?: Date, actionUrl?: string): Promise<void> {
  try {
    const customers = await prisma.user.findMany({
      where: { role: 'CUSTOMER' },
      select: { id: true, pushTokens: { select: { token: true } } },
    });
    if (customers.length === 0) return;

    saveNotificationMany(customers.map((c) => c.id), title, body, type, actionUrl, expiresAt);

    const allTokens = customers.flatMap((c) => c.pushTokens.map((t) => t.token));
    if (allTokens.length === 0) return;

    for (let i = 0; i < allTokens.length; i += 100) {
      const chunk = allTokens.slice(i, i + 100);
      await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(chunk.map((token) => ({ to: token, title, body, sound: 'default', ...(actionUrl && { data: { actionUrl } }) }))),
      });
    }
  } catch { /* non-critical */ }
}
```

Note: `broadcastToCustomers`'s new `actionUrl` param is appended *after* `expiresAt` (not inserted before it, unlike the other functions) because `offers.controller.ts` already calls it positionally with `expiresAt` as the 4th argument — appending preserves that call site without editing it in this task.

- [ ] **Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: errors will appear at every call site that isn't updated yet — that's expected and gets resolved by Tasks 4-7. If `push.ts` itself has no internal errors, this step is done.

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/push.ts
git commit -m "feat: thread actionUrl through push notification helpers"
```

---

### Task 4: Wire `dispute.controller.ts`

**Files:**
- Modify: `backend/src/controllers/dispute.controller.ts:1-6,33-38,175`

- [ ] **Step 1: Import the builders**

Change line 6:

```ts
import { sendPushToUser, sendPushToStoreEmployees } from '../utils/push';
```

to:

```ts
import { sendPushToUser, sendPushToStoreEmployees } from '../utils/push';
import { disputeSubmittedUrlEmployee, disputeResolvedUrl } from '../utils/notificationRoutes';
```

- [ ] **Step 2: Wire `submitDispute`'s push**

Change (lines 33-38):

```ts
  sendPushToStoreEmployees(
    storeId,
    'New Missing-Points Report',
    `A customer reported missing cashback at ${store.name}. Review in the admin portal.`,
    'DISPUTE_SUBMITTED',
  ).catch(() => {});
```

to:

```ts
  sendPushToStoreEmployees(
    storeId,
    'New Missing-Points Report',
    `A customer reported missing cashback at ${store.name}. Review in the admin portal.`,
    'DISPUTE_SUBMITTED',
    disputeSubmittedUrlEmployee(),
  ).catch(() => {});
```

- [ ] **Step 3: Wire `resolveDispute`'s push**

Change line 175:

```ts
  sendPushToUser(dispute.customerId, pushTitle, pushBody, 'DISPUTE_RESOLVED').catch(() => {});
```

to:

```ts
  sendPushToUser(dispute.customerId, pushTitle, pushBody, 'DISPUTE_RESOLVED', disputeResolvedUrl(dispute.id)).catch(() => {});
```

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/dispute.controller.ts
git commit -m "feat: wire actionUrl into dispute notifications"
```

---

### Task 5: Wire `productRequest.controller.ts`

**Files:**
- Modify: `backend/src/controllers/productRequest.controller.ts:1-7,73,207`

- [ ] **Step 1: Import the builders**

Change line 4:

```ts
import { sendPushToUser } from '../utils/push';
```

to:

```ts
import { sendPushToUser } from '../utils/push';
import { productRequestUrlManager, productRequestUrlCustomer } from '../utils/notificationRoutes';
```

- [ ] **Step 2: Wire the manager-facing "new request" push**

Change (lines 72-74):

```ts
  managerIds.forEach((id) =>
    sendPushToUser(id, '🛍️ New Product Request', `A customer is requesting "${request.productName}" at ${request.store.name}`, 'PRODUCT_REQUEST')
  );
```

to:

```ts
  managerIds.forEach((id) =>
    sendPushToUser(id, '🛍️ New Product Request', `A customer is requesting "${request.productName}" at ${request.store.name}`, 'PRODUCT_REQUEST', productRequestUrlManager(request.id))
  );
```

- [ ] **Step 3: Wire the customer-facing "outcome" push**

Change line 207:

```ts
  sendPushToUser(request.customerId, notifTitle, notifBody, 'PRODUCT_REQUEST');
```

to:

```ts
  sendPushToUser(request.customerId, notifTitle, notifBody, 'PRODUCT_REQUEST', productRequestUrlCustomer(request.id));
```

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/productRequest.controller.ts
git commit -m "feat: wire actionUrl into product request notifications"
```

---

### Task 6: Wire `employeeRequest.controller.ts`

**Files:**
- Modify: `backend/src/controllers/employeeRequest.controller.ts:1-7,78,272`

- [ ] **Step 1: Import the builders**

Change line 7:

```ts
import { sendPushToUser } from '../utils/push';
```

to:

```ts
import { sendPushToUser } from '../utils/push';
import { stockRequestUrlManager, stockRequestUrlEmployee } from '../utils/notificationRoutes';
```

- [ ] **Step 2: Wire the manager-facing "new request" push**

Change (lines 77-79):

```ts
  managerIds.forEach(id =>
    sendPushToUser(id, '📦 New Stock Request', `${user.name || 'An employee'} requested ${itemCount} item${itemCount !== 1 ? 's' : ''} for restocking`, 'STOCK_REQUEST')
  );
```

to:

```ts
  managerIds.forEach(id =>
    sendPushToUser(id, '📦 New Stock Request', `${user.name || 'An employee'} requested ${itemCount} item${itemCount !== 1 ? 's' : ''} for restocking`, 'STOCK_REQUEST', stockRequestUrlManager(request.id))
  );
```

- [ ] **Step 3: Wire the employee-facing "reviewed" push**

Change line 272:

```ts
  sendPushToUser(request.submittedById, notifTitle, notifBody, 'STOCK_REQUEST');
```

to:

```ts
  sendPushToUser(request.submittedById, notifTitle, notifBody, 'STOCK_REQUEST', stockRequestUrlEmployee(requestId));
```

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/employeeRequest.controller.ts
git commit -m "feat: wire actionUrl into stock request notifications"
```

---

### Task 7: Sweep remaining call sites (prevent regressions)

Every type below already has a working tap target via the old per-role switch in `NotificationsScreen.tsx`, which Task 11 deletes. Each one needs an `actionUrl` now or that switch's deletion silently breaks a currently-working tap.

**Files:**
- Modify: `backend/src/controllers/offers.controller.ts:71`
- Modify: `backend/src/controllers/billing.controller.ts:1289-1294,1300-1306`
- Modify: `backend/src/controllers/points.controller.ts:208,340-345,409-414,474-479,528,541,894`
- Modify: `backend/src/controllers/receipt.controller.ts:338-343`
- Modify: `backend/src/controllers/catalog.controller.ts:243-244`
- Modify: `backend/src/controllers/hotFood.controller.ts:433-438`
- Modify: `backend/src/utils/catalog-expiry-cron.ts:23-28`

- [ ] **Step 1: `offers.controller.ts` — import + wire**

Add near the top imports:
```ts
import { offerUrl } from '../utils/notificationRoutes';
```
Change line 71:
```ts
  broadcastToCustomers('🎉 New Promotion!', `${offer.title} — check the Lucky Stop app for details.`, 'OFFER', new Date(parsed.data.endDate));
```
to:
```ts
  broadcastToCustomers('🎉 New Promotion!', `${offer.title} — check the Lucky Stop app for details.`, 'OFFER', new Date(parsed.data.endDate), offerUrl());
```

- [ ] **Step 2: `billing.controller.ts` — gas price section**

Add to imports (this file already imports other helpers near the top — add alongside them):
```ts
import { gasPriceUrlEmployee, gasPriceUrlCustomer } from '../utils/notificationRoutes';
```
Change (lines 1289-1294):
```ts
  sendPushToStoreEmployees(
    storeId,
    `⛽ Gas Prices Updated — ${store.name}`,
    `${priceText} — update pump display now`,
    'GAS_PRICE_UPDATE',
  );
```
to:
```ts
  sendPushToStoreEmployees(
    storeId,
    `⛽ Gas Prices Updated — ${store.name}`,
    `${priceText} — update pump display now`,
    'GAS_PRICE_UPDATE',
    gasPriceUrlEmployee(),
  );
```
Change (lines 1300-1306):
```ts
        saveNotificationMany(
          customers.map((c) => c.id),
          `⛽ New Prices at ${store.name}`,
          priceText,
          'GAS_PRICE_UPDATE',
        );
```
to:
```ts
        saveNotificationMany(
          customers.map((c) => c.id),
          `⛽ New Prices at ${store.name}`,
          priceText,
          'GAS_PRICE_UPDATE',
          gasPriceUrlCustomer(),
        );
```

- [ ] **Step 3: `points.controller.ts` — 6 call sites**

Add to imports:
```ts
import { alertUrlManager, pointsUrl, redemptionUrl } from '../utils/notificationRoutes';
```

Line 208 — change:
```ts
      sendPushToUser(mgr.id, '🚨 Suspicious Transaction', `$${purchaseAmount.toFixed(2)} transaction flagged for review at your store.`, 'ALERT');
```
to:
```ts
      sendPushToUser(mgr.id, '🚨 Suspicious Transaction', `$${purchaseAmount.toFixed(2)} transaction flagged for review at your store.`, 'ALERT', alertUrlManager());
```

Lines 340-345 — change:
```ts
  sendPushToUser(
    transaction.customerId,
    '💰 Points Credited!',
    `${Math.round(totalPoints * 100)} pts added to your Lucky Stop balance.`,
    'POINTS'
  );
```
to:
```ts
  sendPushToUser(
    transaction.customerId,
    '💰 Points Credited!',
    `${Math.round(totalPoints * 100)} pts added to your Lucky Stop balance.`,
    'POINTS',
    pointsUrl(transaction.id)
  );
```

Lines 409-414 — this is an in-store cash-credit redemption with no single redemption record to link to. Change:
```ts
  sendPushToUser(
    customer.id,
    '🎉 Redemption Successful!',
    `$${amount.toFixed(2)} redeemed at Lucky Stop. Remaining balance: $${updated.pointsBalance.toFixed(2)}.`,
    'REDEMPTION'
  );
```
to:
```ts
  sendPushToUser(
    customer.id,
    '🎉 Redemption Successful!',
    `$${amount.toFixed(2)} redeemed at Lucky Stop. Remaining balance: $${updated.pointsBalance.toFixed(2)}.`,
    'REDEMPTION',
    redemptionUrl()
  );
```

Lines 474-479 — change:
```ts
  sendPushToUser(
    transaction.customerId,
    '❌ Transaction Rejected',
    `Your $${transaction.purchaseAmount.toFixed(2)} ${transaction.category.replace(/_/g, ' ').toLowerCase()} transaction could not be verified. Visit the store if you have questions.`,
    'POINTS'
  );
```
to:
```ts
  sendPushToUser(
    transaction.customerId,
    '❌ Transaction Rejected',
    `Your $${transaction.purchaseAmount.toFixed(2)} ${transaction.category.replace(/_/g, ' ').toLowerCase()} transaction could not be verified. Visit the store if you have questions.`,
    'POINTS',
    pointsUrl(transactionId)
  );
```

Line 528 — change:
```ts
    sendPushToUser(transaction.customerId, '❌ Transaction Rejected', `Your $${transaction.purchaseAmount.toFixed(2)} transaction was reviewed and rejected.`, 'POINTS');
```
to:
```ts
    sendPushToUser(transaction.customerId, '❌ Transaction Rejected', `Your $${transaction.purchaseAmount.toFixed(2)} transaction was reviewed and rejected.`, 'POINTS', pointsUrl(transactionId));
```

Line 541 — change:
```ts
  sendPushToUser(transaction.customerId, '💰 Points Credited!', `Your $${transaction.purchaseAmount.toFixed(2)} transaction was approved. ${Math.round(totalPoints * 100)} pts added.`, 'POINTS');
```
to:
```ts
  sendPushToUser(transaction.customerId, '💰 Points Credited!', `Your $${transaction.purchaseAmount.toFixed(2)} transaction was approved. ${Math.round(totalPoints * 100)} pts added.`, 'POINTS', pointsUrl(transactionId));
```

Line 894 — change:
```ts
  sendPushToUser(customer.id, '🎁 Reward Redeemed!', `You redeemed "${item.title}" for ${item.pointsCost} pts.`, 'REDEMPTION');
```
to:
```ts
  sendPushToUser(customer.id, '🎁 Reward Redeemed!', `You redeemed "${item.title}" for ${item.pointsCost} pts.`, 'REDEMPTION', redemptionUrl());
```
(No single catalog-redemption id is in scope at this call site — omit the id, matching the pattern above.)

- [ ] **Step 4: `receipt.controller.ts`**

Add to imports:
```ts
import { pointsUrl } from '../utils/notificationRoutes';
```
This call grants a batch of transactions at once (from a receipt-QR scan), so there's no single transaction id to link to — call `pointsUrl()` with no argument. Change (lines 338-343):
```ts
  sendPushToUser(
    customer.id,
    '💰 Points Credited!',
    `${Math.round(totalPointsAwarded * 100)} pts added to your Lucky Stop balance.`,
    'POINTS'
  );
```
to:
```ts
  sendPushToUser(
    customer.id,
    '💰 Points Credited!',
    `${Math.round(totalPointsAwarded * 100)} pts added to your Lucky Stop balance.`,
    'POINTS',
    pointsUrl()
  );
```

- [ ] **Step 5: `catalog.controller.ts`**

Add to imports:
```ts
import { redemptionUrl } from '../utils/notificationRoutes';
```
Change line 243-244:
```ts
  sendPushToUser(redemption.customerId, '✅ Reward Confirmed!',
    `Your "${redemption.catalogItem.title}" has been redeemed. Enjoy!`, 'REDEMPTION');
```
to:
```ts
  sendPushToUser(redemption.customerId, '✅ Reward Confirmed!',
    `Your "${redemption.catalogItem.title}" has been redeemed. Enjoy!`, 'REDEMPTION', redemptionUrl(redemption.id));
```

- [ ] **Step 6: `hotFood.controller.ts` — employee-facing call site only**

Add to imports:
```ts
import { hotFoodOrderUrl } from '../utils/notificationRoutes';
```
Change (lines 433-438):
```ts
  sendPushToStoreEmployees(
    storeId,
    `🔥 New Order #${order.orderNumber}`,
    itemSummary,
    'HOT_FOOD_ORDER',
  );
```
to:
```ts
  sendPushToStoreEmployees(
    storeId,
    `🔥 New Order #${order.orderNumber}`,
    itemSummary,
    'HOT_FOOD_ORDER',
    hotFoodOrderUrl(order.id),
  );
```
**Do not** touch the customer-facing call site at lines 235-240 (`'✅ Your food is ready!'`) — no customer-facing order screen exists to link to; leave it without an `actionUrl`, matching its current (already non-actionable) behavior.

- [ ] **Step 7: `catalog-expiry-cron.ts`**

This file lives in `backend/src/utils/`, the same directory as `notificationRoutes.ts`, so add to imports:
```ts
import { redemptionUrl } from './notificationRoutes';
```
Change (lines 23-28):
```ts
        sendPushToUser(
          r.customerId,
          '⏰ Redemption Expired',
          `Your "${r.catalogItem.title}" redemption wasn't scanned in time — ${r.pointsSpent} pts have been refunded.`,
          'REDEMPTION',
        );
```
to:
```ts
        sendPushToUser(
          r.customerId,
          '⏰ Redemption Expired',
          `Your "${r.catalogItem.title}" redemption wasn't scanned in time — ${r.pointsSpent} pts have been refunded.`,
          'REDEMPTION',
          redemptionUrl(r.id),
        );
```

- [ ] **Step 8: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors anywhere in `backend/src`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/controllers/offers.controller.ts backend/src/controllers/billing.controller.ts backend/src/controllers/points.controller.ts backend/src/controllers/receipt.controller.ts backend/src/controllers/catalog.controller.ts backend/src/controllers/hotFood.controller.ts backend/src/utils/catalog-expiry-cron.ts
git commit -m "feat: wire actionUrl into remaining notification call sites"
```

---

### Task 8: Admin bell feed — dispute/request cards

**Files:**
- Modify: `backend/src/controllers/billing.controller.ts` — `getSuperAdminNotifications` (809-956) and `getDevAdminNotifications` (959-1107)

- [ ] **Step 1: Import the builders**

Add near the top of the file:
```ts
import { adminDisputeUrl, adminEmployeeRequestUrl, adminProductRequestUrl } from '../utils/notificationRoutes';
```

- [ ] **Step 2: Add dispute/request queries to `getSuperAdminNotifications`**

In the `Promise.all` at lines 814-829, add two more queries alongside the existing ones (matching the existing "fetch separately, degrade gracefully" pattern already used for `pendingShiftRequests` at lines 831-844):

```ts
  let pendingDisputes: any[] = [];
  try {
    pendingDisputes = await prisma.pointsDispute.findMany({
      where: { status: 'PENDING' },
      include: { customer: { select: { name: true, phone: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  } catch { /* Gracefully degrade — dispute notifications simply won't appear */ }

  let pendingEmployeeRequests: any[] = [];
  let pendingProductRequests: any[] = [];
  try {
    [pendingEmployeeRequests, pendingProductRequests] = await Promise.all([
      prisma.storeRequest.findMany({
        where: { status: 'PENDING' },
        include: { submitter: { select: { name: true } }, store: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.productRequest.findMany({
        where: { status: 'PENDING', expiresAt: { gte: now } },
        include: { customer: { select: { name: true, phone: true } }, store: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);
  } catch { /* Gracefully degrade — request notifications simply won't appear */ }
```

Place this block right after the existing `pendingShiftRequests` try/catch (after line 844), so it follows the same "isolated failure" convention already established there.

- [ ] **Step 3: Push notification cards for each, in `getSuperAdminNotifications`**

Add this block right before the `notifications.sort(...)` line (953):

```ts
  for (const d of pendingDisputes) {
    notifications.push({
      id: `dispute-${d.id}`,
      type: 'DISPUTE',
      category: 'disputes',
      title: `Missing-Points Report — ${d.customer?.name || d.customer?.phone}`,
      message: `${d.description} (${d.store?.name || 'Unknown store'})`,
      createdAt: d.createdAt.toISOString(),
      isRead: false,
      severity: 'warning',
      actionUrl: adminDisputeUrl(d.id),
      actionLabel: 'Review Dispute',
    });
  }

  for (const r of pendingEmployeeRequests) {
    notifications.push({
      id: `emp-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Store Alert — ${r.submitter?.name || 'Employee'}`,
      message: `${r.notes || r.type} at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: r.priority === 'HIGH' ? 'error' : 'info',
      actionUrl: adminEmployeeRequestUrl(r.store.id, r.id),
      actionLabel: 'Review Alert',
    });
  }

  for (const r of pendingProductRequests) {
    notifications.push({
      id: `product-request-${r.id}`,
      type: 'REQUEST',
      category: 'requests',
      title: `Product Request — "${r.productName}"`,
      message: `${r.customer?.name || r.customer?.phone} at ${r.store.name}`,
      createdAt: r.createdAt.toISOString(),
      isRead: false,
      severity: 'info',
      actionUrl: adminProductRequestUrl(r.store.id, r.id),
      actionLabel: 'Review Request',
    });
  }
```

- [ ] **Step 4: Repeat for `getDevAdminNotifications`**

Same two blocks (Step 2's queries, Step 3's push loop), inserted into `getDevAdminNotifications` — queries after its existing `pendingShiftRequests` fetch (after line 989, following the same `.catch(() => [] as any[])` inline-degrade style already used there rather than a separate try/catch), and the three `for` loops before its `notifications.sort(...)` at line 1105.

- [ ] **Step 5: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

Run: `cd backend && node -e "require('./dist/controllers/billing.controller.js')"` — not applicable without a build step; instead just confirm `tsc` is clean, since there's no test runner to exercise this against real data in this environment.

- [ ] **Step 6: Commit**

```bash
git add backend/src/controllers/billing.controller.ts
git commit -m "feat: surface disputes and requests in admin notification feed"
```

---

### Task 9: Mobile highlight infrastructure

**Files:**
- Create: `mobile/components/PulseHighlight.tsx`
- Create: `mobile/hooks/useHighlightParam.ts`

- [ ] **Step 1: Write `PulseHighlight.tsx`**

Mirrors the existing `FadeSlideIn.tsx` component's style (same `Animated`-ref pattern already used in this codebase) but pulses a border/shadow instead of fading in. Uses `COLORS.accent` — the token already documented in `mobile/constants/index.ts:6` as "Warm orange for highlights" — so no new color is introduced, per the "stay within existing styling" constraint.

```tsx
import { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { COLORS } from '../constants';

export default function PulseHighlight({
  active,
  children,
  style,
}: {
  active: boolean;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 1500,
      useNativeDriver: false, // borderColor/shadowOpacity aren't supported by the native driver
    });
    anim.start();
    return () => anim.stop();
  }, [active]);

  if (!active) return <>{children}</>;

  const shadowOpacity = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.55, 0] });
  const borderColor = progress.interpolate({ inputRange: [0, 0.15, 1], outputRange: ['rgba(0,0,0,0)', COLORS.accent, 'rgba(0,0,0,0)'] });

  return (
    <Animated.View
      style={[
        style,
        {
          borderWidth: 2,
          borderColor,
          borderRadius: 16,
          shadowColor: COLORS.accent,
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity,
          shadowRadius: 10,
          elevation: 4,
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}
```

- [ ] **Step 2: Write `useHighlightParam.ts`**

```ts
import { useCallback, useState } from 'react';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';

/**
 * Reads a `highlightId` route param set by a notification deep link,
 * exposes it for one focus pass, then clears both the local state and
 * the URL param so revisiting the screen later doesn't replay it.
 */
export function useHighlightParam(): string | null {
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const [active, setActive] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!highlightId) return;
      setActive(highlightId);
      const timer = setTimeout(() => {
        setActive(null);
        router.setParams({ highlightId: '' });
      }, 1700);
      return () => clearTimeout(timer);
    }, [highlightId])
  );

  return active;
}
```

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors (neither file is imported anywhere yet, so this just checks they're individually well-typed).

- [ ] **Step 4: Commit**

```bash
git add mobile/components/PulseHighlight.tsx mobile/hooks/useHighlightParam.ts
git commit -m "feat: add mobile highlight-on-arrival components"
```

---

### Task 10: OS-level tap listener + cold start

**Files:**
- Modify: `mobile/app/_layout.tsx`

- [ ] **Step 1: Import `Href` type and add the always-on tap listener**

Add to the imports (alongside the existing `expo-notifications` import):
```ts
import type { Href } from 'expo-router';
```

Add a new `useEffect` inside `RootLayout`, alongside the existing ones (after the `registerPushToken` effect, around line 107):

```tsx
  // Catch OS-level notification taps while the app is foregrounded or
  // backgrounded (process still alive). The cold-start case (app was fully
  // killed) is handled separately below, inside the auth-resolved navigate().
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const actionUrl = response.notification.request.content.data?.actionUrl as string | undefined;
      if (actionUrl) router.push(actionUrl as Href);
    });
    return () => sub.remove();
  }, []);
```

- [ ] **Step 2: Handle the cold-start case inside the existing post-auth navigate effect**

The existing effect (lines 65-101) already picks a default landing route once auth resolves. Change its inner `navigate()` function so a pending cold-start notification tap overrides that default, checked *after* the role-based redirect so it isn't immediately clobbered:

Change:
```tsx
    async function navigate() {
      if (!user) {
        // Check if first-time user — show welcome/onboarding
        const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
        if (!onboardingDone) {
          router.replace('/(auth)/welcome');
        } else {
          router.replace('/(auth)/login');
        }
        return;
      }

      // Logged in — check if role tour has been shown
      const tourSeen = await AsyncStorage.getItem(`tour_seen_${user.role}`);
      if (!tourSeen) {
        router.replace('/role-tour');
        return;
      }

      if (['STORE_MANAGER', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        router.replace('/(manager)/home');
      } else if (user.role === 'EMPLOYEE') {
        router.replace('/(employee)/home');
      } else {
        router.replace('/(customer)/home');
      }
    }
```

to:

```tsx
    async function navigate() {
      if (!user) {
        // Check if first-time user — show welcome/onboarding
        const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
        if (!onboardingDone) {
          router.replace('/(auth)/welcome');
        } else {
          router.replace('/(auth)/login');
        }
        return;
      }

      // Logged in — check if role tour has been shown
      const tourSeen = await AsyncStorage.getItem(`tour_seen_${user.role}`);
      if (!tourSeen) {
        router.replace('/role-tour');
        return;
      }

      if (['STORE_MANAGER', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
        router.replace('/(manager)/home');
      } else if (user.role === 'EMPLOYEE') {
        router.replace('/(employee)/home');
      } else {
        router.replace('/(customer)/home');
      }

      // Cold start via notification tap: the app just launched because the
      // user tapped a push while it was fully killed. Override the default
      // landing route above with wherever that notification actually points.
      const lastResponse = await Notifications.getLastNotificationResponseAsync();
      const actionUrl = lastResponse?.notification.request.content.data?.actionUrl as string | undefined;
      if (actionUrl) router.push(actionUrl as Href);
    }
```

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add mobile/app/_layout.tsx
git commit -m "feat: navigate to actionUrl on notification tap (foreground, background, cold start)"
```

---

### Task 11: Simplify `NotificationsScreen.tsx`

**Files:**
- Modify: `mobile/components/NotificationsScreen.tsx`

- [ ] **Step 1: Delete the dead `getStaffRoute` function**

Remove lines 20-35 entirely (`getStaffRoute` is defined but never called anywhere in this file — confirmed by reading the full file; `handlePress` has its own separate, now-being-replaced switch logic).

- [ ] **Step 2: Add `actionUrl` to the `Notification` interface**

Change (lines 94-102):
```ts
interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  expiresAt?: string;
}
```
to:
```ts
interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  actionUrl?: string;
  isRead: boolean;
  createdAt: string;
  expiresAt?: string;
}
```

- [ ] **Step 3: Replace `handlePress` with the one-line version**

Change (lines 191-240):
```ts
  function handlePress(item: Notification) {
    if (!item.isRead) markOneMutation.mutate(item.id);

    if (user?.role === 'CUSTOMER') {
      switch (item.type) {
        case 'OFFER': {
          const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
          if (expired) {
            Alert.alert('Offer Ended', `"${item.title}" has expired and is no longer available.`, [{ text: 'Got it' }]);
            return;
          }
          router.push({ pathname: '/(customer)/home', params: { scrollTo: 'offers' } } as any);
          return;
        }
        case 'GAS_PRICE_UPDATE':
          router.push({ pathname: '/(customer)/home', params: { scrollTo: 'gas' } } as any);
          return;
        case 'POINTS':     router.push('/(customer)/history'); return;
        case 'REDEMPTION': router.push('/(customer)/rewards'); return;
        default: return;
      }
    }

    if (user?.role === 'EMPLOYEE') {
      switch (item.type) {
        case 'HOT_FOOD_ORDER':
          router.push({ pathname: '/(employee)/hot-food', params: { tab: 'PENDING' } } as any);
          return;
        case 'GAS_PRICE_UPDATE': router.push('/(employee)/scan');     return;
        case 'SHIFT_REQUEST':
        case 'STORE_REQUEST':    router.push('/(employee)/requests'); return;
        case 'SCHEDULE':         router.push('/(employee)/schedule'); return;
        default: return;
      }
    }

    if (user?.role === 'STORE_MANAGER') {
      switch (item.type) {
        case 'STOCK_REQUEST':
          router.push({ pathname: '/(manager)/requests', params: { tab: 'stock' } } as any);
          return;
        case 'PRODUCT_REQUEST':
          router.push({ pathname: '/(manager)/requests', params: { tab: 'products' } } as any);
          return;
        case 'ALERT':
        case 'DISPUTE_SUBMITTED': router.push('/(manager)/home'); return;
        default: return;
      }
    }
  }
```
to:
```ts
  function handlePress(item: Notification) {
    if (!item.isRead) markOneMutation.mutate(item.id);

    const expired = item.type === 'OFFER' && item.expiresAt && new Date(item.expiresAt) < new Date();
    if (expired) {
      Alert.alert('Offer Ended', `"${item.title}" has expired and is no longer available.`, [{ text: 'Got it' }]);
      return;
    }

    if (item.actionUrl) router.push(item.actionUrl as any);
  }
```

- [ ] **Step 4: Replace the three `*HasAction` gate functions with one check**

Change (lines 37-45):
```ts
function customerHasAction(type: string): boolean {
  return ['OFFER', 'GAS_PRICE_UPDATE', 'POINTS', 'REDEMPTION'].includes(type);
}
function employeeHasAction(type: string): boolean {
  return ['HOT_FOOD_ORDER', 'GAS_PRICE_UPDATE', 'SHIFT_REQUEST', 'STORE_REQUEST', 'SCHEDULE'].includes(type);
}
function managerHasAction(type: string): boolean {
  return ['STOCK_REQUEST', 'PRODUCT_REQUEST', 'ALERT', 'DISPUTE_SUBMITTED'].includes(type);
}
```
Delete this block entirely.

Change the `hasAction` computation inside `renderItem` (around line 248-251):
```ts
    const hasAction = role === 'CUSTOMER'      ? customerHasAction(item.type)
                    : role === 'EMPLOYEE'      ? employeeHasAction(item.type)
                    : role === 'STORE_MANAGER' ? managerHasAction(item.type)
                    : false;
```
to:
```ts
    const hasAction = !!item.actionUrl;
```

- [ ] **Step 5: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors. The unused `role` variable (line 247, `const role = user?.role;`) may now be flagged if it's not used elsewhere in the function — check and remove it if `tsc`/lint flags it as unused.

- [ ] **Step 6: Commit**

```bash
git add mobile/components/NotificationsScreen.tsx
git commit -m "refactor: replace per-role notification switches with actionUrl"
```

---

### Task 12: Highlight wiring — `ManagerDisputesScreen.tsx`

**Files:**
- Modify: `mobile/components/ManagerDisputesScreen.tsx`

- [ ] **Step 1: Import the highlight hook and component**

Add to imports:
```ts
import { useHighlightParam } from '../hooks/useHighlightParam';
import PulseHighlight from './PulseHighlight';
```

- [ ] **Step 2: Read the highlight param and scroll to it**

Add inside the component, alongside the existing `disputes`/`pending`/`displayed` derivations (after line 66):
```ts
  const highlightedId = useHighlightParam();
  const listRef = useRef<FlatList<Dispute>>(null);

  useEffect(() => {
    if (!highlightedId) return;
    const index = displayed.findIndex(d => d.id === highlightedId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightedId, displayed]);
```
Add `useRef` to the existing `import { useState, useEffect } from 'react';` at the top (line 5) — change to `import { useState, useEffect, useRef } from 'react';`.

- [ ] **Step 3: Wrap the card body in `PulseHighlight` and attach the ref**

Change `renderItem`'s return (line 101-102):
```tsx
    return (
      <View style={[s.card, !isPending && s.cardDone]}>
```
to:
```tsx
    return (
      <PulseHighlight active={item.id === highlightedId} style={[s.card, !isPending && s.cardDone]}>
```
And its closing tag (line 150):
```tsx
      </View>
    );
```
to:
```tsx
      </PulseHighlight>
    );
```

Attach the ref and a scroll-failure fallback to the `FlatList` (lines 239-246):
```tsx
          <FlatList
            data={displayed}
            keyExtractor={d => d.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          />
```
to:
```tsx
          <FlatList
            ref={listRef}
            data={displayed}
            keyExtractor={d => d.id}
            renderItem={renderItem}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
            onScrollToIndexFailed={(info) => {
              // Item not measured yet (common right after mount) — retry once the layout settles.
              setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: true }), 200);
            }}
          />
```

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ManagerDisputesScreen.tsx
git commit -m "feat: highlight the target dispute when arriving via notification"
```

---

### Task 13: Highlight wiring — `ManagerRequestsScreen.tsx`

**Files:**
- Modify: `mobile/components/ManagerRequestsScreen.tsx`

This screen already has a `useLocalSearchParams`/`useFocusEffect`/`router.setParams` block (lines 111-118) that switches tabs on notification arrival. Extend it to also surface `highlightId`, and wrap each of the three tabs' `FlatList` row renderers in `PulseHighlight`.

- [ ] **Step 1: Import the highlight hook and component**

Add to imports:
```ts
import { useHighlightParam } from '../hooks/useHighlightParam';
import PulseHighlight from './PulseHighlight';
```

- [ ] **Step 2: Read `highlightId` alongside the existing `tab` param**

The existing block only reads `tab`. Add `useHighlightParam()` as a separate call right after it (it manages its own param/clearing independently, so it composes cleanly with the existing effect rather than needing to be merged into it):

```tsx
  const highlightedId = useHighlightParam();
```

- [ ] **Step 3: Wrap each of the three `renderItem` functions' returned card in `PulseHighlight`**

`renderAlertItem` (lines 224-286) — change its outer wrapper. Line 225:
```tsx
      <View style={[s.card, isDone && s.cardDone]}>
```
to:
```tsx
      <PulseHighlight active={item.id === highlightedId} style={[s.card, isDone && s.cardDone]}>
```
And its matching closing tag, line 284:
```tsx
      </View>
```
to:
```tsx
      </PulseHighlight>
```

`renderEmpItem` (lines 294-385) — line 295:
```tsx
      <View style={[s.card, !isPending && s.cardDone]}>
```
to:
```tsx
      <PulseHighlight active={item.id === highlightedId} style={[s.card, !isPending && s.cardDone]}>
```
And its matching closing tag, line 383:
```tsx
      </View>
```
to:
```tsx
      </PulseHighlight>
```

`renderProductItem` (lines 390-448) — line 391:
```tsx
      <View style={[s.card, !isPending && s.cardDone]}>
```
to:
```tsx
      <PulseHighlight active={item.id === highlightedId} style={[s.card, !isPending && s.cardDone]}>
```
And its matching closing tag, line 446:
```tsx
      </View>
```
to:
```tsx
      </PulseHighlight>
```

In each case, only the single outer `<View>`/`</View>` pair changes — the card's inner content (lines in between) is untouched. All three renderers close over `highlightedId` from Step 2, since they're all defined in the same component body.

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/ManagerRequestsScreen.tsx
git commit -m "feat: highlight the target request when arriving via notification"
```

---

### Task 14: Highlight wiring — `hot-food.tsx`

**Files:**
- Modify: `mobile/app/(employee)/hot-food.tsx`

Same pattern as Task 13 — this screen already has the `tab`-param `useFocusEffect` block (lines 579-586).

- [ ] **Step 1: Import the highlight hook and component**

Add to imports:
```ts
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';
```

- [ ] **Step 2: Read the highlight param**

```tsx
  const highlightedId = useHighlightParam();
```

- [ ] **Step 3: Wrap `OrderCard` usage in `PulseHighlight`**

In the `FlatList`'s `renderItem` (lines 819-825):
```tsx
  renderItem={({ item }) => (
    <OrderCard
      order={item}
      onUpdateStatus={handleUpdateStatus}
      updating={updatingId === item.id}
    />
  )}
```
to:
```tsx
  renderItem={({ item }) => (
    <PulseHighlight active={item.id === highlightedId}>
      <OrderCard
        order={item}
        onUpdateStatus={handleUpdateStatus}
        updating={updatingId === item.id}
      />
    </PulseHighlight>
  )}
```

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(employee)/hot-food.tsx"
git commit -m "feat: highlight the target order when arriving via notification"
```

---

### Task 15: Highlight wiring — `stock-request.tsx`

**Files:**
- Modify: `mobile/app/(employee)/stock-request.tsx`

Unlike Tasks 13-14, this screen has **no existing** notification-tab-switch wiring — it needs one added, plus using the `highlightId` to both switch to the "My Requests" tab and auto-expand the matching row (this screen already has an `expandedId` toggle state in `MyRequests`, so "expand" doubles naturally as "highlight" here).

- [ ] **Step 1: Import `expo-router` hooks and the highlight hook**

Add to imports:
```ts
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useHighlightParam } from '../../hooks/useHighlightParam';
```

- [ ] **Step 2: Switch to the "My Requests" tab on arrival, in `StockRequestScreen`**

Add inside `StockRequestScreen` (after the `activeTab` state declaration, line 515):
```tsx
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useFocusEffect(useCallback(() => {
    if (tab === 'mine') {
      setActiveTab('mine');
      router.setParams({ tab: '' });
    }
  }, [tab]));
```
`useCallback` needs adding to the `import React, { useState, useRef, useEffect, useCallback } from 'react';` line — it's already imported (line 1), no change needed there.

- [ ] **Step 3: Pass a `highlightId` prop through to `MyRequests`**

Change the call site that renders `<MyRequests />` to `<MyRequests highlightId={useHighlightParam()} />` — call the hook once in `StockRequestScreen` and pass it down, rather than calling it again inside `MyRequests`, to avoid clearing the URL param twice.

- [ ] **Step 4: Auto-expand the matching row in `MyRequests`**

Change the function signature (line 385):
```ts
function MyRequests() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
```
to:
```ts
function MyRequests({ highlightId }: { highlightId: string | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightId) setExpandedId(highlightId);
  }, [highlightId]);
```
(`useEffect` is already imported at the top of this file.)

- [ ] **Step 5: Update the corresponding actionUrl builder to include `tab=mine`**

Back in `backend/src/utils/notificationRoutes.ts` (Task 2), `stockRequestUrlEmployee` currently returns `/(employee)/stock-request?highlightId=${requestId}` with no tab param, so it wouldn't force the "My Requests" tab. Update it to:
```ts
export function stockRequestUrlEmployee(requestId: string): string {
  return `/(employee)/stock-request?tab=mine&highlightId=${requestId}`;
}
```
(This is a small correction to Task 2's output, made here since the dependency only becomes obvious once this screen's actual tab-switching mechanism is built.)

- [ ] **Step 6: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

Run: `cd backend && npx tsc --noEmit`
Expected: no errors (confirms the Step 5 backend edit didn't break anything).

- [ ] **Step 7: Commit**

```bash
git add "mobile/app/(employee)/stock-request.tsx" backend/src/utils/notificationRoutes.ts
git commit -m "feat: highlight and auto-expand the target stock request on arrival"
```

---

### Task 16: Highlight wiring — `history.tsx`

**Files:**
- Modify: `mobile/app/(customer)/history.tsx`

- [ ] **Step 1: Import the highlight hook, component, and `useRef`/`useEffect`**

Change (line 4):
```ts
import { useState } from 'react';
```
to:
```ts
import { useState, useEffect, useRef } from 'react';
```
Add to the other imports:
```ts
import type { FlatList as FlatListType } from 'react-native';
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';
```

- [ ] **Step 2: Read the highlight param and scroll to it**

Add inside `HistoryScreen`, after `const transactions = data?.pages.flatMap(...)` (line 30):
```ts
  const highlightedId = useHighlightParam();
  const listRef = useRef<FlatListType<any>>(null);

  useEffect(() => {
    if (!highlightedId) return;
    const index = transactions.findIndex((t: any) => t.id === highlightedId);
    if (index < 0) return;
    const timer = setTimeout(() => {
      listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightedId, transactions]);
```

- [ ] **Step 3: Attach the ref, retry handler, and wrap each row**

Change (lines 56-62):
```tsx
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={transactions.length === 0 ? s.emptyContainer : s.list}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
```
to:
```tsx
        <FlatList
          ref={listRef}
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={transactions.length === 0 ? s.emptyContainer : s.list}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: true }), 200);
          }}
```

Change the `renderItem` return (lines 76-104):
```tsx
            return (
              <TouchableOpacity
                style={s.card}
                onPress={() => setSelected(item)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`View transaction details for ${item.store?.name || 'Lucky Stop'} on ${format(new Date(item.createdAt), 'MMM d, yyyy')}`}
              >
                <View style={s.cardIconBg}>
                  <Text style={s.cardIcon}>{icon}</Text>
                </View>
                <View style={s.cardBody}>
                  <Text style={s.storeName}>{item.store?.name || 'Lucky Stop'}</Text>
                  <Text style={s.date}>{format(new Date(item.createdAt), 'MMM d, yyyy · h:mm a')}</Text>
                  <View style={s.catTag}>
                    <Text style={s.catTagText}>{catLabel}</Text>
                  </View>
                </View>
                <View style={s.cardRight}>
                  {item.status === 'APPROVED' ? (
                    <Text style={s.points}>+{Math.round(Number(item.pointsAwarded) * 100).toLocaleString()} pts</Text>
                  ) : item.status === 'PENDING' ? (
                    <Text style={[s.points, { color: '#F4A261', fontSize: 12 }]}>Pending</Text>
                  ) : (
                    <Text style={[s.points, { color: '#E63946', fontSize: 12 }]}>Rejected</Text>
                  )}
                  <ChevronRightIcon size={20} color={COLORS.border} strokeWidth={1.5} />
                </View>
              </TouchableOpacity>
            );
```
to:
```tsx
            return (
              <PulseHighlight active={item.id === highlightedId}>
                <TouchableOpacity
                  style={s.card}
                  onPress={() => setSelected(item)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`View transaction details for ${item.store?.name || 'Lucky Stop'} on ${format(new Date(item.createdAt), 'MMM d, yyyy')}`}
                >
                  <View style={s.cardIconBg}>
                    <Text style={s.cardIcon}>{icon}</Text>
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.storeName}>{item.store?.name || 'Lucky Stop'}</Text>
                    <Text style={s.date}>{format(new Date(item.createdAt), 'MMM d, yyyy · h:mm a')}</Text>
                    <View style={s.catTag}>
                      <Text style={s.catTagText}>{catLabel}</Text>
                    </View>
                  </View>
                  <View style={s.cardRight}>
                    {item.status === 'APPROVED' ? (
                      <Text style={s.points}>+{Math.round(Number(item.pointsAwarded) * 100).toLocaleString()} pts</Text>
                    ) : item.status === 'PENDING' ? (
                      <Text style={[s.points, { color: '#F4A261', fontSize: 12 }]}>Pending</Text>
                    ) : (
                      <Text style={[s.points, { color: '#E63946', fontSize: 12 }]}>Rejected</Text>
                    )}
                    <ChevronRightIcon size={20} color={COLORS.border} strokeWidth={1.5} />
                  </View>
                </TouchableOpacity>
              </PulseHighlight>
            );
```

If the target transaction is on a page not yet fetched (pagination via `useInfiniteQuery`), `findIndex` returns `-1` and the effect no-ops — consistent with the established graceful-miss behavior on every other screen in this plan.

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(customer)/history.tsx"
git commit -m "feat: highlight the target transaction when arriving via notification"
```

---

### Task 17: Highlight wiring — `rewards.tsx`, `request-product.tsx`, `my-disputes.tsx`

These three screens all use `ScrollView` + `.map()` (not `FlatList`) for the relevant list, and are all short, already-near-the-top lists (active/pending items render first). Per the design spec's scoped-down decision, these get the **pulse only, no auto-scroll** — scrolling a manual `ScrollView` to an arbitrary item requires per-item `onLayout` measurement, which isn't worth the complexity for lists that are already short and near the top.

**Files:**
- Modify: `mobile/app/(customer)/rewards.tsx`
- Modify: `mobile/app/(customer)/request-product.tsx`
- Modify: `mobile/app/(customer)/my-disputes.tsx`

- [ ] **Step 1: `rewards.tsx` — pending redemptions banner**

Import:
```ts
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';
```
Add `const highlightedId = useHighlightParam();` inside the component.
Change (lines 464-466):
```tsx
{pendingRedemptions.map(rd => (
  <ActiveRedemptionBanner key={rd.id} redemption={rd} onCancel={() => handleCancelRedemption(rd)} />
))}
```
to:
```tsx
{pendingRedemptions.map(rd => (
  <PulseHighlight key={rd.id} active={rd.id === highlightedId}>
    <ActiveRedemptionBanner redemption={rd} onCancel={() => handleCancelRedemption(rd)} />
  </PulseHighlight>
))}
```

- [ ] **Step 2: `request-product.tsx` — pending/resolved request cards**

Import:
```ts
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';
```
Add `const highlightedId = useHighlightParam();` inside the component.
Change both `.map()` blocks (lines ~152-157 and ~161-166):
```tsx
{pending.map((r, i) => (
  <FadeSlideIn key={r.id} delay={Math.min(i * 40, 200)}>
    <RequestCard request={r} />
  </FadeSlideIn>
))}
```
to:
```tsx
{pending.map((r, i) => (
  <FadeSlideIn key={r.id} delay={Math.min(i * 40, 200)}>
    <PulseHighlight active={r.id === highlightedId}>
      <RequestCard request={r} />
    </PulseHighlight>
  </FadeSlideIn>
))}
```
(Apply the same wrap to the `resolved.map(...)` block just below it.)

- [ ] **Step 3: `my-disputes.tsx` — dispute report cards**

Import:
```ts
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';
```
Add `const highlightedId = useHighlightParam();` inside the component (`MyDisputesScreen`).
Change (lines 199-201):
```tsx
{disputes.map((d, index) => (
  <FadeSlideIn key={d.id} delay={Math.min(index * 40, 200)}>
    <View style={s.card}>
```
to:
```tsx
{disputes.map((d, index) => (
  <FadeSlideIn key={d.id} delay={Math.min(index * 40, 200)}>
    <PulseHighlight active={d.id === highlightedId} style={s.card}>
```
And its matching closing tags — the existing `</View>` that closes this card becomes `</PulseHighlight>` (leave the `</FadeSlideIn>` as-is, only the inner `View` changes).

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(customer)/rewards.tsx" "mobile/app/(customer)/request-product.tsx" "mobile/app/(customer)/my-disputes.tsx"
git commit -m "feat: highlight the target item on customer ScrollView screens"
```

---

### Task 18: Admin — pulse keyframe

**Files:**
- Modify: `admin/src/index.css`

- [ ] **Step 1: Add the keyframe + utility class**

Add after the existing `dash-fade-in` block (after line 151), reusing the already-defined `--ease-premium` variable and the app's brand navy `#1D3557` (expressed as its rgba equivalent, `29, 53, 87` — not a new color):

```css
@keyframes ls-highlight-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(29, 53, 87, 0.45); }
  70%  { box-shadow: 0 0 0 14px rgba(29, 53, 87, 0); }
  100% { box-shadow: 0 0 0 0 rgba(29, 53, 87, 0); }
}
.ls-highlight-pulse {
  animation: ls-highlight-pulse 1.5s var(--ease-premium);
}
```

- [ ] **Step 2: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors (CSS isn't type-checked, but confirms this step didn't break the build config).

- [ ] **Step 3: Commit**

```bash
git add admin/src/index.css
git commit -m "feat: add reusable highlight-pulse keyframe"
```

---

### Task 19: Admin — `StoreRequests.tsx` becomes URL-addressable

**Files:**
- Modify: `admin/src/pages/StoreRequests.tsx`

- [ ] **Step 1: Import `useSearchParams`**

Add to imports (line 1-8 area):
```ts
import { useSearchParams } from 'react-router-dom';
```

- [ ] **Step 2: Initialize state from the URL**

Change (lines 110-112):
```ts
  const [activeTab, setActiveTab] = useState<'employee' | 'product'>('employee');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
```
to:
```ts
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<'employee' | 'product'>(
    searchParams.get('tab') === 'product' ? 'product' : 'employee'
  );
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(searchParams.get('storeId'));
  const [statusFilter, setStatusFilter] = useState<string>('');
  const highlightId = searchParams.get('highlightId');
```

- [ ] **Step 3: Apply the pulse class to the matching request card**

Change the employee/alert card wrapper (line 307):
```tsx
                        <div key={req.id} style={{ ...s.card, ...(isDone ? s.cardDone : {}) }}>
```
to:
```tsx
                        <div key={req.id} className={req.id === highlightId ? 'ls-highlight-pulse' : undefined} style={{ ...s.card, ...(isDone ? s.cardDone : {}) }}>
```

Change the product-request card wrapper (line 397):
```tsx
                        <div key={pr.id} style={{ ...s.prCard, ...(isPending ? {} : s.cardDone) }}>
```
to:
```tsx
                        <div key={pr.id} className={pr.id === highlightId ? 'ls-highlight-pulse' : undefined} style={{ ...s.prCard, ...(isPending ? {} : s.cardDone) }}>
```

- [ ] **Step 4: Scroll the matching card into view on arrival**

Add near the top of the component body, after the state declarations from Step 2:
```ts
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => {
      document.querySelector('.ls-highlight-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightId, requests, productRequests]);
```
Add `useEffect` to the top-level `import { useState } from 'react';` (line 1) — change to `import { useState, useEffect } from 'react';`.

- [ ] **Step 5: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add admin/src/pages/StoreRequests.tsx
git commit -m "feat: make StoreRequests URL-addressable by store, tab, and request"
```

---

### Task 20: Admin — `Customers.tsx` highlight wiring

**Files:**
- Modify: `admin/src/pages/Customers.tsx`

- [ ] **Step 1: Read the highlight param**

`useSearchParams` is already imported and used here (line 2, 32). Add alongside the existing `activeTab` initialization (after line 35):
```ts
  const highlightId = searchParams.get('highlightId');
```

- [ ] **Step 2: Apply the pulse class to the matching dispute card**

Change (line 193):
```tsx
                <div key={d.id} style={s.disputeCard}>
```
to:
```tsx
                <div key={d.id} className={d.id === highlightId ? 'ls-highlight-pulse' : undefined} style={s.disputeCard}>
```

- [ ] **Step 3: Scroll the matching card into view on arrival**

Add near the top of the component body:
```ts
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(() => {
      document.querySelector('.ls-highlight-pulse')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
    return () => clearTimeout(timer);
  }, [highlightId, disputes]);
```
Add `useEffect` to the existing `import { useState } from 'react';` (line 1) — change to `import { useState, useEffect } from 'react';`.

- [ ] **Step 4: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add admin/src/pages/Customers.tsx
git commit -m "feat: highlight the target dispute when arriving via notification"
```

---

### Task 21: Admin — `Notifications.tsx` category additions

**Files:**
- Modify: `admin/src/pages/Notifications.tsx:11-44`

- [ ] **Step 1: Widen the `Notification` interface's `category` union**

Change line 14:
```ts
  category: 'billing' | 'transactions' | 'scheduling' | 'customers';
```
to:
```ts
  category: 'billing' | 'transactions' | 'scheduling' | 'customers' | 'disputes' | 'requests';
```

- [ ] **Step 2: Add the two new categories to the `CAT` map**

Change (lines 39-44):
```ts
const CAT: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  billing:      { label: 'Billing',      icon: '💳', color: '#1e3a8a', bg: '#dbeafe' },
  transactions: { label: 'Transactions', icon: '🧾', color: '#7c2d12', bg: '#ffedd5' },
  scheduling:   { label: 'Scheduling',   icon: '📅', color: '#065f46', bg: '#d1fae5' },
  customers:    { label: 'Customers',    icon: '🏪', color: '#4c1d95', bg: '#ede9fe' },
};
```
to:
```ts
const CAT: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  billing:      { label: 'Billing',      icon: '💳', color: '#1e3a8a', bg: '#dbeafe' },
  transactions: { label: 'Transactions', icon: '🧾', color: '#7c2d12', bg: '#ffedd5' },
  scheduling:   { label: 'Scheduling',   icon: '📅', color: '#065f46', bg: '#d1fae5' },
  customers:    { label: 'Customers',    icon: '🏪', color: '#4c1d95', bg: '#ede9fe' },
  disputes:     { label: 'Disputes',     icon: '⚠️', color: '#92400e', bg: '#fffbeb' },
  requests:     { label: 'Requests',     icon: '📋', color: '#166534', bg: '#f0fdf4' },
};
```
(Colors reused from the existing `severity`/`CAT` palette already defined in this same file — `#92400e`/`#fffbeb` matches the existing `warning` severity pair, `#166534`/`#f0fdf4` matches an existing accepted/success shade already used elsewhere in this codebase — not new colors.)

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors. No render-loop changes are needed — confirmed in planning that the existing card rendering already keys off `CAT[n.category]` generically (`n.actionUrl` click handling at lines 446-483 is likewise already generic).

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/Notifications.tsx
git commit -m "feat: add disputes and requests categories to admin notification feed"
```

---

## Manual Verification (after all tasks)

No test framework exists in this repo — this is the real verification pass:

1. **Backend**: `cd backend && npx tsc --noEmit` clean across all 21 tasks combined.
2. **Admin**: `cd admin && npx tsc --noEmit` clean; click through: a pending dispute and a pending request each appear as bell-feed cards with the right icon/color; clicking one lands on `/customers?tab=disputes` or `/store-requests?storeId=...&tab=...` with the right card pulsing and scrolled into view.
3. **Mobile — in-app list**: for each role (customer/employee/manager), open the Notifications screen and tap an item of each type that now has an `actionUrl` — confirm it lands on the right screen (and highlights/scrolls where applicable) instead of doing nothing.
4. **Mobile — OS push tap, on a real device** (simulators don't reliably deliver pushes): trigger a real dispute/request/points/offer event, then tap the resulting push notification in all three states — app foregrounded, app backgrounded, app fully killed (cold start) — and confirm each lands correctly. This is the core of the feature and the one leg that can't be verified without a physical device and a build.
5. Spot-check the two intentionally-unwired gaps behave as expected (no crash, just no navigation): a customer "your food is ready" push, and a manager "shift request" push.
