# Careers New-Opening Notification — Design Spec

**Date:** 2026-07-18
**Status:** Approved, ready for planning

## Problem

Item 3 of the 2026-07-12 feedback batch: when admin posts a new job opening, customers get no notification and no badge indicating one exists — they only see it if they happen to open the Careers screen (which, separately, was already fixed this session to refetch on focus instead of showing stale data).

## Approach

Mirror exactly how Offers already notify customers today (`offers.controller.ts:72` → `broadcastToCustomers(...)`), rather than inventing a new mechanism. This piggybacks entirely on infrastructure already shipped in this app: the notification deep-linking system (`actionUrl` computed server-side, generic tap handler on mobile) and the existing customer notification inbox + Bell badge count.

## Backend

### `createOpening` (`backend/src/controllers/jobOpenings.controller.ts:40-52`)

After the `prisma.jobOpening.create(...)` call succeeds, if the created opening's `isActive` is `true`, call:

```ts
broadcastToCustomers(
  '🧑‍💼 New Job Opening!',
  `${opening.title} at ${opening.store?.name ?? 'any Lucky Stop location'} — check it out!`,
  'JOB_OPENING',
  undefined,
  careersUrl(),
);
```

`expiresAt` (3rd positional arg after type) is `undefined` — job openings have no expiry field. If `isActive` is `false` at creation (admin left the checkbox unchecked), send nothing.

### `updateOpening` (`backend/src/controllers/jobOpenings.controller.ts:55-69`)

Currently does a direct `prisma.jobOpening.update(...)` with no prior read. Change to:
1. Fetch the existing row first (`prisma.jobOpening.findUnique({ where: { id } })`) to capture its `isActive` before the update.
2. Perform the update as today.
3. After the update succeeds, if the existing row's `isActive` was `false` AND the updated row's `isActive` is `true`, fire the same `broadcastToCustomers(...)` call as above (using the *updated* opening's `title`/`store` for the body).
4. Any other transition (staying active, staying inactive, active→inactive, or non-`isActive` field edits) sends nothing.

### Notification type string

`'JOB_OPENING'` — a new value for `UserNotification.type`. This column is a free-form `String` (not a Prisma enum), so no schema change is needed to introduce it.

### New route builder

`backend/src/utils/notificationRoutes.ts` — add, in the "Mobile: Customer" section, alongside `offerUrl()`:

```ts
export function careersUrl(): string {
  return '/(customer)/careers';
}
```

No `highlightId` — the openings list is short and there's no natural "highlight one specific opening" requirement, matching `offerUrl()`'s no-ID pattern rather than `pointsUrl()`'s ID-taking one.

## Mobile

`mobile/components/NotificationsScreen.tsx`:
- Add a `JOB_OPENING` entry to `TYPE_CONFIG` (icon color) and to `NotifIcon()`'s switch, using the already-imported `BriefcaseIcon` (the same icon already used for the Careers drawer link in `mobile/app/(customer)/_layout.tsx`). Without this, a `JOB_OPENING` notification would still work (fall back to the generic bell icon/color) but wouldn't visually match the feature it's about.
- No other mobile change needed: `handlePress()`'s existing `if (item.actionUrl) router.push(item.actionUrl as any);` already handles navigation generically, and `hasAction`/`actionLabel` already derive purely from `!!item.actionUrl`.

## Explicitly out of scope

- **No per-store targeting.** `broadcastToCustomers()` sends to every customer regardless of the opening's `storeId` — confirmed acceptable since the notification body always names the specific store (or "any location"), so it's never misleading about relevance, and this matches how Offers already broadcast app-wide today.
- **No dedicated Careers nav badge.** The notification flows through the existing generic notification inbox and Bell badge count only — no new "unseen openings" tracking, no new badge-count endpoint, no new schema field for a per-customer "last seen Careers" timestamp. This exactly matches how Offers work today (no dedicated Offers-tab badge either).
- **No draft/scheduling concept.** `isActive` remains the only publish/unpublish toggle that exists today; this feature doesn't add a new state, only reacts to `isActive`'s existing false→true transition (at creation or via edit).
- **No admin-side changes.** `admin/src/pages/Careers.tsx`'s posting/editing form is untouched — this feature is entirely about what happens after a create/update call succeeds on the backend.

## Verification

No test framework in this repo (consistent with prior work) — verification is `npx tsc --noEmit` per sub-app (backend, mobile) plus manual click-through:
1. Post a new opening with "Active" checked → confirm a customer receives the push/inbox entry with the Briefcase icon, and tapping it navigates to the Careers screen.
2. Post a new opening with "Active" unchecked → confirm no notification fires.
3. Edit that inactive opening and check "Active" → confirm a notification fires now (the false→true transition).
4. Edit an opening that is already active (e.g. change its pay range) → confirm no notification fires (no `isActive` transition occurred).
5. Toggle an active opening to inactive → confirm no notification fires (only false→true triggers, not true→false).
