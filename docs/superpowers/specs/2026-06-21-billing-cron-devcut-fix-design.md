# Billing Cron: Fix devCut Formula + Period Mislabeling

## Problem

The automated monthly billing cron (`backend/src/utils/billing-cron.ts`, run via `cron.schedule('5 0 1 * *', runMonthlyBilling, ...)`, started unconditionally at `backend/src/index.ts:102` on every server boot) computes a store's dev cut for `PER_TRANSACTION`/`HYBRID` billing as:

```ts
amount = purchaseAmount_sum * transactionFeeRate
```

This contradicts the documented and already-correctly-implemented design: `schema.prisma:370` documents `PointsTransaction.devCut` as "dev's cut of cashback issued," and `backend/src/controllers/points.controller.ts:131-132` computes it correctly at grant time: `devCut = cashbackIssued * devCutRate`. The manual, DevAdmin-triggered billing route (`generateMonthlyBilling` → `buildBillForPeriod` in `billing.controller.ts:443-499`) already does this correctly, by summing the stored `devCut` field via `groupBy`/`_sum`.

All 12 real stores are configured as `PER_TRANSACTION` (`transactionFeeRate` 0.04, one store 0.08), so this cron bug is live. It has not yet caused real financial harm — confirmed via direct DB query that the only existing `BillingRecord` rows in the live database are from manually-triggered test runs against seeded demo transactions (`isPaid: false` on all of them), and the cron's own idempotency check (skip if a record already exists for that store+period) means it has likely never actually fired yet, since manual test runs already created records for every period so far. But once real customer transactions flow and a real month boundary passes without a prior manual run, the cron will generate a real, wrong (inflated) invoice automatically with zero human review.

A second, independent bug was found while comparing the two implementations: the cron labels the generated bill under the **current** month (`currentPeriod()`) while summing **last** month's transaction data (`lastMonthRange()`) — a mislabeling bug, separate from the devCut formula issue. The manual route's convention (`periodBounds(period)` in `billing.controller.ts:391-397`) treats whatever period string is passed as that exact month's start/end — i.e. the period label and the data it describes always match.

## Fix

Rather than patching the cron's formula in place (maintaining two parallel implementations of "how much does a store owe," which is how this bug happened to begin with), the cron will be rewritten to call the same, already-correct logic the manual route uses.

### 1. Export shared helpers from `billing.controller.ts`

Add `export` to:
- `buildBillForPeriod` (currently private, `billing.controller.ts:443`)
- `toPeriod` (currently private, `billing.controller.ts:399-401`)

No change to either function's logic — purely making them importable.

### 2. Rewrite `runMonthlyBilling` in `backend/src/utils/billing-cron.ts`

- Compute the target period as **last month's** `toPeriod()` string (so the label and the data being summed always refer to the same month — fixing the mislabeling bug as a direct consequence of reusing the shared period convention).
- Keep the existing per-store idempotency check (skip if a `BillingRecord` already exists for that store+period) — unchanged.
- For each store needing a bill, call `buildBillForPeriod(store, period)` instead of computing `amount` manually. If it returns `null` (nothing to bill), skip — matching existing skip behavior for stores with zero activity.
- Create the `BillingRecord` using the returned `{ amount, notes }`, storing `notes: JSON.stringify(bill.notes)` — the cron currently stores no `notes` at all; this brings cron-generated bills to the same level of detail as manually-generated ones (category breakdown, effective rates, etc.) visible in the admin Billing page.

### 3. Remove now-dead code in `billing-cron.ts`

- `currentPeriod()` and `lastMonthRange()` helper functions (replaced by reusing `toPeriod` + a single last-month `Date` calculation).
- The three-way `MONTHLY_SUBSCRIPTION` / `PER_TRANSACTION` / `HYBRID` branching — `buildBillForPeriod` already handles all three billing types internally in one place.

## Role impact + DevAdmin UI clarity

Every billing-record-viewing route (`/billing/stores`, `/billing/monthly-records`, `/billing/revenue`, etc.) is gated `Role.DEV_ADMIN`-only (`backend/src/routes/index.ts:273-296`). SuperAdmin and StoreManager have no access to `BillingRecord` data at all today, so this fix has no cross-role visibility concerns — only the DevAdmin (sole viewer) is affected.

To make the fix's effect visible and auditable in the DevAdmin UI, both call sites will tag their `notes` payload with a `generatedBy: 'cron' | 'manual'` field (added after `buildBillForPeriod` returns, before persisting — `buildBillForPeriod`'s own logic and return shape are unchanged):
- `generateMonthlyBilling` (manual route) sets `generatedBy: 'manual'`.
- the fixed `runMonthlyBilling` (cron) sets `generatedBy: 'cron'`.

`admin/src/pages/Billing.tsx`'s `BillNotes` interface (line 7) gains the optional `generatedBy?: 'cron' | 'manual'` field, and each store-level invoice row (around line 524, next to the existing Paid/Unpaid badge) gets a small badge — "🤖 Auto" if `generatedBy === 'cron'`, "✋ Manual" if `'manual'`, nothing shown for older records that predate this field (`undefined`). This lets you see at a glance which bills were auto-generated by the cron vs. manually triggered, without digging into raw `notes` JSON.

## Verification approach

No automated test suite exists for this backend. Verification is:
1. `npx tsc --noEmit` to confirm the refactor compiles.
2. A manual, read-only comparison: for a past period that already has a real (manually-generated, correct) `BillingRecord` in the dev/staging DB, temporarily simulate calling the new cron logic for that same period (without writing — or against a disposable test store) and confirm the computed `amount` matches the existing correct record exactly, proving the cron and manual path now agree.
3. Do not run the real cron function against the live production database as part of verification — it writes real `BillingRecord` rows. Any live verification must use a disposable/test store id, or be limited to read-only computation without the final `create` call.

## Out of scope

- No changes to `points.controller.ts` (already correct).
- No changes to `buildBillForPeriod`'s internal logic or return shape (only its export visibility changes). `generateMonthlyBilling` gets one small addition — tagging its output with `generatedBy: 'manual'` before saving — covered above.
- No changes to existing `BillingRecord` rows already in the database (all confirmed test data, `isPaid: false`, no real-world correction needed).
- No changes to the cron schedule itself (still 1st of month, 00:05 UTC).
