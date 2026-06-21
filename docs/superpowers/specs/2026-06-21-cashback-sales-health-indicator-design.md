# Cashback-to-Sales Health Indicator

## Problem

There's already a per-transaction safeguard at grant time (`backend/src/controllers/points.controller.ts`): a hard `CASHBACK_RATE_CAP` (10%), a soft `CASHBACK_RATE_WARN` (7.5%, flags the transaction `HIGH_CASHBACK_RATE`), and several fraud-pattern flags (`HIGH_AMOUNT`, `LARGE_PURCHASE`, `CUSTOMER_VELOCITY`, `EMPLOYEE_VELOCITY`, `REPEAT_PAIR`). These catch a single transaction that looks wrong.

What they don't catch: a **systemic** rate misconfiguration. If every transaction at a store uses the same (currently-misconfigured) rate consistently — e.g. the live example found earlier this session where category bonuses were flat 5% across every category, pushing total store cost to 8–12% instead of the intended ~7% — no individual transaction looks anomalous, because they're all consistently wrong in the same way. The per-transaction caps have nothing to compare against except themselves.

This feature adds an aggregate, sales-relative view: is a store's cashback-to-sales ratio, over a recent rolling window, within a sustainable range — independent of whether any single transaction looks suspicious.

## Design

### 1. Backend — rolling 30-day cashback ratio per store, with category breakdown

New query (in `backend/src/controllers/billing.controller.ts`, alongside the existing billing aggregation logic): for each active store, over the trailing 30 days (`createdAt >= now - 30 days`, `status: 'APPROVED'`), aggregate `PointsTransaction` **grouped by category** (same `groupBy(['category'])` pattern already used in `buildBillForPeriod`), then also roll up a store-level total:
- Per category: `cashbackIssued = sum(pointsAwarded)`, `purchaseVolume = sum(purchaseAmount)`, `ratio = purchaseVolume > 0 ? cashbackIssued / purchaseVolume : 0`
- Per store (rolled up across all its categories): same three fields, summed/recomputed from the category rows.

Classify every ratio (both store-level and each category-level) using the same bands:
- `ok`: ratio ≤ 0.075 (7.5%)
- `warn`: 0.075 < ratio ≤ 0.09 (9%)
- `critical`: ratio > 0.09

New endpoint: `GET /billing/cashback-health` — DevAdmin-only (`requireRole(Role.DEV_ADMIN)`), matching the existing gating convention for all other billing routes (`backend/src/routes/index.ts:273-296`). Returns an array of `{ storeId, storeName, cashbackIssued, purchaseVolume, ratio, status, categories: [{ category, cashbackIssued, purchaseVolume, ratio, status }] }`, one entry per active store, regardless of status (the frontend filters for display — see below). A store's `status` reflects its rolled-up blended ratio; a category can independently be `warn`/`critical` even if the store's blended ratio is `ok` (e.g. one bad category diluted by several healthy ones).

This is read-only and does not affect any existing grant-time logic, billing generation, or stored rates — it's a new, independent reporting query.

### 2. Dashboard UI — new card

A new card on the DevAdmin Dashboard (`admin/src/pages/Dashboard.tsx`), positioned near the existing "Needs your attention" `AttentionBanner` component (same place users already look for problems-that-need-action). Behavior:
- If no store is `warn` or `critical` (by its blended ratio OR any individual category): render a quiet, low-emphasis "✅ All stores within cashback target" line — not a big always-visible table when everything's healthy.
- If one or more stores (or categories within an otherwise-`ok` store) are `warn`/`critical`: render a compact list, worst-first (sorted by store ratio descending), each row showing: store name, blended ratio (formatted as %), 30-day purchase volume, cashback issued, and a colored status pill (amber for `warn`, red for `critical`).
- Each row is expandable (clicking it, matching the existing expand pattern already used in `admin/src/pages/Billing.tsx`'s per-store breakdown) to reveal the category-level rows — same columns, one per category, so a category-specific problem is visible even when the store's blended ratio looks `ok`. Only categories with `purchaseVolume > 0` in the window are shown.

This follows the existing Dashboard pattern of conditional, attention-grabbing-only-when-needed banners rather than permanent dashboard clutter.

### 3. Verification with synthetic data

Since this project has no test framework, validate the classification logic with a one-off, read-only script (same pattern as the billing-cron fix's verification step): generate synthetic `{ cashbackIssued, purchaseVolume }` pairs in memory (never written to the database) spanning:
- Clearly healthy ratios (~5–6%)
- Borderline ratios (~7–8%, should land in `warn`)
- Clearly bad ratios (~12%+, should land in `critical`)
- Edge cases: `purchaseVolume = 0` (must not divide by zero), ratio exactly at the 7.5%/9% boundaries

Run each through the actual classification function and confirm it lands in the expected bucket. Also include a mixed-category scenario: one store with several `ok` categories and one `critical` category, confirming the store's blended ratio comes out `ok`-ish while the individual category still correctly classifies as `critical` — this is the exact "diluted by other categories" scenario the category breakdown exists to catch. Delete the script after use — it's a logic check, not a permanent test suite.

## Out of scope

- No changes to the existing per-transaction `CASHBACK_RATE_CAP`/`CASHBACK_RATE_WARN`/fraud-flag logic in `points.controller.ts` — this is a separate, complementary aggregate view, not a replacement.
- No SuperAdmin/StoreManager visibility — DevAdmin-only, matching all other billing-data routes.
- No historical trend charting (e.g. a 90-day graph) — just the current trailing-30-day snapshot per store. A trend view could be a future follow-up.
- No automated alerting/push-notifications for this indicator — it's a passive Dashboard card you check, not an active notification (unlike the existing `FLAGGED` transaction push notifications, which are unrelated and unaffected).
