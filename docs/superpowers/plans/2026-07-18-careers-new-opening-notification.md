# Careers New-Opening Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Notify customers (push + in-app inbox) when a new job opening becomes visible to them, mirroring exactly how Offers already notify today.

**Architecture:** A new `careersUrl()` route builder joins the existing `notificationRoutes.ts` catalog. `jobOpenings.controller.ts`'s `createOpening` and `updateOpening` call the existing `broadcastToCustomers()` helper (already used by Offers) whenever an opening's `isActive` becomes `true` — at creation, or via the false→true transition on an edit. Mobile's `NotificationsScreen.tsx` gets a `JOB_OPENING` entry in its icon/color config so the notification renders with the Careers icon instead of falling back to a generic bell.

**Tech Stack:** Node/Express + Prisma/Postgres (backend), React Native + Expo Router (mobile). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-18-careers-new-opening-notification-design.md`
- Notification type string: `'JOB_OPENING'` (new value — `UserNotification.type` is a free-form `String`, no schema/enum change needed)
- Broadcasts to **all** customers regardless of the opening's `storeId` (matches Offers) — the notification body must always name the specific store, or "any Lucky Stop location" when `storeId` is null, so a broadcast is never misleading about relevance
- Fires on `isActive` becoming `true`: at creation (`isActive: true` in the create payload) OR via an edit that transitions an existing opening from `isActive: false` to `isActive: true`. Does NOT fire on: creating with `isActive: false`, editing any other field while `isActive` stays unchanged, or deactivating (`true` → `false`)
- No new schema, no dedicated Careers nav badge, no admin-side changes, no per-store targeting — all explicitly out of scope per the spec
- `expiresAt` (3rd positional arg to `broadcastToCustomers`, after `type`) is always `undefined` for this notification — job openings have no expiry concept

---

### Task 1: Route builder — `careersUrl()`

**Files:**
- Modify: `backend/src/utils/notificationRoutes.ts`

**Interfaces:**
- Produces: `careersUrl(): string` returning `/(customer)/careers` — consumed by Task 2.

- [ ] **Step 1: Add `careersUrl()` alongside the other customer route builders**

In `backend/src/utils/notificationRoutes.ts`, change:

```ts
// ─── Mobile: Customer ──────────────────────────────────────────────────────
export function offerUrl(): string {
  return '/(customer)/home?scrollTo=offers';
}
```

to:

```ts
// ─── Mobile: Customer ──────────────────────────────────────────────────────
export function offerUrl(): string {
  return '/(customer)/home?scrollTo=offers';
}
export function careersUrl(): string {
  return '/(customer)/careers';
}
```

- [ ] **Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/utils/notificationRoutes.ts
git commit -m "feat: add careersUrl notification route builder"
```

---

### Task 2: Wire `createOpening` and `updateOpening` to notify on isActive becoming true

**Files:**
- Modify: `backend/src/controllers/jobOpenings.controller.ts`

**Interfaces:**
- Consumes: `careersUrl()` from Task 1; `broadcastToCustomers(title, body, type, expiresAt?, actionUrl?)` from `backend/src/utils/push.ts` (already exists, signature: `(title: string, body: string, type = 'OFFER', expiresAt?: Date, actionUrl?: string) => Promise<void>`).

- [ ] **Step 1: Import `broadcastToCustomers` and `careersUrl`**

Change (line 1-4):

```ts
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
```

to:

```ts
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { broadcastToCustomers } from '../utils/push';
import { careersUrl } from '../utils/notificationRoutes';
```

- [ ] **Step 2: Notify on creation when the new opening is active**

Change `createOpening` (lines 40-52):

```ts
// POST /careers/openings
export async function createOpening(req: AuthRequest, res: Response) {
  const parsed = openingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const opening = await prisma.jobOpening.create({
    data: { ...parsed.data, createdById: req.user!.id },
    include: { store: { select: { name: true, city: true } } },
  });
  res.status(201).json({ success: true, data: opening });
}
```

to:

```ts
// POST /careers/openings
export async function createOpening(req: AuthRequest, res: Response) {
  const parsed = openingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const opening = await prisma.jobOpening.create({
    data: { ...parsed.data, createdById: req.user!.id },
    include: { store: { select: { name: true, city: true } } },
  });

  if (opening.isActive) {
    broadcastToCustomers(
      '🧑‍💼 New Job Opening!',
      `${opening.title} at ${opening.store?.name ?? 'any Lucky Stop location'} — check it out!`,
      'JOB_OPENING',
      undefined,
      careersUrl(),
    ).catch(() => {});
  }

  res.status(201).json({ success: true, data: opening });
}
```

- [ ] **Step 3: Notify on the false→true `isActive` transition during an edit**

Change `updateOpening` (lines 55-69):

```ts
// PATCH /careers/openings/:id
export async function updateOpening(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = openingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const opening = await prisma.jobOpening.update({
    where: { id },
    data: parsed.data,
    include: { store: { select: { name: true, city: true } } },
  });
  res.json({ success: true, data: opening });
}
```

to:

```ts
// PATCH /careers/openings/:id
export async function updateOpening(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const parsed = openingSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.jobOpening.findUnique({ where: { id }, select: { isActive: true } });

  const opening = await prisma.jobOpening.update({
    where: { id },
    data: parsed.data,
    include: { store: { select: { name: true, city: true } } },
  });

  if (existing && existing.isActive === false && opening.isActive === true) {
    broadcastToCustomers(
      '🧑‍💼 New Job Opening!',
      `${opening.title} at ${opening.store?.name ?? 'any Lucky Stop location'} — check it out!`,
      'JOB_OPENING',
      undefined,
      careersUrl(),
    ).catch(() => {});
  }

  res.json({ success: true, data: opening });
}
```

Note: `existing` is checked with `existing &&` rather than a non-null assertion — if the row was deleted between the `findUnique` and `update` calls (an edge case Prisma's `update` would itself throw on), this guards against a `TypeError` on `existing.isActive` rather than crashing on a null-check that no longer matters once `update` has already thrown.

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/jobOpenings.controller.ts
git commit -m "feat: notify customers when a job opening becomes active"
```

---

### Task 3: Mobile — `JOB_OPENING` icon/color in `NotificationsScreen.tsx`

**Files:**
- Modify: `mobile/components/NotificationsScreen.tsx`

**Interfaces:**
- Consumes: the `'JOB_OPENING'` notification type string from Task 2 (no schema/interface change — `Notification.type` is already `string`).

- [ ] **Step 1: Import `BriefcaseIcon`**

Change (lines 15-18):

```ts
import {
  BellIcon, GasPumpIcon, TagIcon, DollarSignIcon, GiftIcon,
  CalendarIcon, ClockIcon, ClipboardIcon, PackageIcon, AlertTriangleIcon,
} from './Icons';
```

to:

```ts
import {
  BellIcon, GasPumpIcon, TagIcon, DollarSignIcon, GiftIcon,
  CalendarIcon, ClockIcon, ClipboardIcon, PackageIcon, AlertTriangleIcon,
  BriefcaseIcon,
} from './Icons';
```

- [ ] **Step 2: Add `JOB_OPENING` to `TYPE_CONFIG`**

Change (lines 20-34):

```ts
const TYPE_CONFIG: Record<string, { color: string }> = {
  GAS_PRICE_UPDATE:  { color: '#f97316' },
  OFFER:             { color: '#F4A261' },
  POINTS:            { color: '#2DC653' },
  REDEMPTION:        { color: '#a78bfa' },
  SCHEDULE:          { color: '#60a5fa' },
  SHIFT_REQUEST:     { color: '#f472b6' },
  STORE_REQUEST:     { color: '#fb923c' },
  STOCK_REQUEST:     { color: '#2563eb' },
  PRODUCT_REQUEST:   { color: '#7c3aed' },
  ALERT:             { color: '#E63946' },
  DISPUTE_SUBMITTED: { color: '#f59e0b' },
  HOT_FOOD_ORDER:    { color: '#ea580c' },
  GENERAL:           { color: COLORS.primary },
};
```

to:

```ts
const TYPE_CONFIG: Record<string, { color: string }> = {
  GAS_PRICE_UPDATE:  { color: '#f97316' },
  OFFER:             { color: '#F4A261' },
  POINTS:            { color: '#2DC653' },
  REDEMPTION:        { color: '#a78bfa' },
  SCHEDULE:          { color: '#60a5fa' },
  SHIFT_REQUEST:     { color: '#f472b6' },
  STORE_REQUEST:     { color: '#fb923c' },
  STOCK_REQUEST:     { color: '#2563eb' },
  PRODUCT_REQUEST:   { color: '#7c3aed' },
  ALERT:             { color: '#E63946' },
  DISPUTE_SUBMITTED: { color: '#f59e0b' },
  HOT_FOOD_ORDER:    { color: '#ea580c' },
  JOB_OPENING:       { color: '#0369a1' },
  GENERAL:           { color: COLORS.primary },
};
```

(`#0369a1` is an existing blue already used elsewhere in this codebase for informational/professional contexts — e.g. `admin/src/pages/Customers.tsx`'s `AVATAR_PALETTE` — not a newly invented color.)

- [ ] **Step 3: Add `JOB_OPENING` to `NotifIcon()`**

Change (lines 36-53):

```ts
function NotifIcon({ type, color }: { type: string; color: string }) {
  const p = { size: 22, color, strokeWidth: 1.75 };
  switch (type) {
    case 'GAS_PRICE_UPDATE':  return <GasPumpIcon {...p} />;
    case 'OFFER':             return <TagIcon {...p} />;
    case 'POINTS':            return <DollarSignIcon {...p} />;
    case 'REDEMPTION':        return <GiftIcon {...p} />;
    case 'SCHEDULE':          return <CalendarIcon {...p} />;
    case 'SHIFT_REQUEST':     return <ClockIcon {...p} />;
    case 'STORE_REQUEST':     return <ClipboardIcon {...p} />;
    case 'STOCK_REQUEST':     return <PackageIcon {...p} />;
    case 'PRODUCT_REQUEST':   return <TagIcon {...p} />;
    case 'ALERT':             return <AlertTriangleIcon {...p} />;
    case 'DISPUTE_SUBMITTED': return <ClipboardIcon {...p} />;
    case 'HOT_FOOD_ORDER':    return <ClipboardIcon {...p} />;
    default:                  return <BellIcon {...p} />;
  }
}
```

to:

```ts
function NotifIcon({ type, color }: { type: string; color: string }) {
  const p = { size: 22, color, strokeWidth: 1.75 };
  switch (type) {
    case 'GAS_PRICE_UPDATE':  return <GasPumpIcon {...p} />;
    case 'OFFER':             return <TagIcon {...p} />;
    case 'POINTS':            return <DollarSignIcon {...p} />;
    case 'REDEMPTION':        return <GiftIcon {...p} />;
    case 'SCHEDULE':          return <CalendarIcon {...p} />;
    case 'SHIFT_REQUEST':     return <ClockIcon {...p} />;
    case 'STORE_REQUEST':     return <ClipboardIcon {...p} />;
    case 'STOCK_REQUEST':     return <PackageIcon {...p} />;
    case 'PRODUCT_REQUEST':   return <TagIcon {...p} />;
    case 'ALERT':             return <AlertTriangleIcon {...p} />;
    case 'DISPUTE_SUBMITTED': return <ClipboardIcon {...p} />;
    case 'HOT_FOOD_ORDER':    return <ClipboardIcon {...p} />;
    case 'JOB_OPENING':       return <BriefcaseIcon {...p} />;
    default:                  return <BellIcon {...p} />;
  }
}
```

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add mobile/components/NotificationsScreen.tsx
git commit -m "feat: add JOB_OPENING icon/color to notifications list"
```

---

### Task 4: Final verification pass

**Files:**
- None (verification only)

- [ ] **Step 1: Full typecheck**

Run: `cd backend && npx tsc --noEmit`
Run: `cd mobile && npx tsc --noEmit`
Expected: no errors in either.

- [ ] **Step 2: Manual click-through**

1. As admin (SUPER_ADMIN), post a new job opening with "Active" checked → confirm a customer device receives the push, and it appears in the in-app Notifications list with the briefcase icon in the new blue color, and tapping it navigates to the Careers screen.
2. Post a new opening with "Active" unchecked → confirm no notification fires (check `UserNotification` rows or just confirm no push arrives).
3. Edit that inactive opening and check "Active" → confirm a notification fires now.
4. Edit an opening that is already active (e.g. change its pay range, leave "Active" checked) → confirm no notification fires.
5. Toggle an active opening to inactive → confirm no notification fires.
6. Confirm a chain-wide opening (no store assigned) notifies with body text "...at any Lucky Stop location...".

- [ ] **Step 3: No commit needed** — this task is verification only.
