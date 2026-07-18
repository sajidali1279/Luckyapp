# Billing Cron devCut Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the automated monthly billing cron so it computes dev cut the same correct way the manual billing route already does, and fixes a separate period-mislabeling bug, by having the cron call the shared, already-correct billing logic instead of maintaining its own broken copy.

**Architecture:** Export `buildBillForPeriod` and `toPeriod` from `backend/src/controllers/billing.controller.ts`. Rewrite `backend/src/utils/billing-cron.ts` to import and call them instead of its own per-store amount calculation. Tag both call sites' saved `notes` with a `generatedBy: 'cron' | 'manual'` field so the admin UI can show which path created each bill.

**Tech Stack:** Node.js/Express/Prisma backend, React/TypeScript admin panel. No test runner exists in this project — verification is `npx tsc --noEmit` plus a strictly **read-only** one-off script for the financial logic (no `prisma.billingRecord.create()` calls outside the actual application code paths — this touches real production billing data).

**⚠️ Financial-logic caution:** This plan touches code that creates real money-owed records (`BillingRecord`). Every verification step in this plan is read-only against the live database (queries/aggregates only). No task in this plan should ever call `prisma.billingRecord.create()` as part of "testing" — only the application's own existing call sites (`generateMonthlyBilling`, the fixed `runMonthlyBilling`) create real records, and those are only exercised by a human triggering them deliberately, not by anything in this plan's verification steps.

**Spec:** `docs/superpowers/specs/2026-06-21-billing-cron-devcut-fix-design.md`

---

### Task 1: Export shared helpers + tag manual billing's notes

**Files:**
- Modify: `backend/src/controllers/billing.controller.ts:399-401` (`toPeriod`)
- Modify: `backend/src/controllers/billing.controller.ts:443` (`buildBillForPeriod`)
- Modify: `backend/src/controllers/billing.controller.ts:524-532` (`generateMonthlyBilling`'s save call)

- [ ] **Step 1: Export `toPeriod`**

Find:

```ts
function toPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
```

Replace with:

```ts
export function toPeriod(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Export `buildBillForPeriod`**

Find:

```ts
async function buildBillForPeriod(
  store: { id: string; billingType: string; subscriptionPrice: number; transactionFeeRate: number },
  period: string,
): Promise<{ amount: number; notes: BillNotes } | null> {
```

Replace with:

```ts
export async function buildBillForPeriod(
  store: { id: string; billingType: string; subscriptionPrice: number; transactionFeeRate: number },
  period: string,
): Promise<{ amount: number; notes: BillNotes } | null> {
```

Note: `BillNotes` itself does NOT need to be exported — `billing-cron.ts` (Task 2) only spreads `bill.notes` into a new object literal via `{ ...bill.notes, generatedBy: 'cron' }`, it never references the `BillNotes` type by name, so TypeScript's structural inference handles this without an explicit import. Keep this change limited to exactly the two functions above — don't export anything else in this file.

- [ ] **Step 3: Tag `generateMonthlyBilling`'s saved notes with `generatedBy: 'manual'`**

Find:

```ts
  let created = 0; let skipped = 0;
  for (const store of stores) {
    if (existingIds.has(store.id)) { skipped++; continue; }
    const bill = await buildBillForPeriod(store, period);
    if (!bill) { skipped++; continue; }
    await (prisma.billingRecord as any).create({
      data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify(bill.notes) },
    });
    created++;
  }
```

Replace with:

```ts
  let created = 0; let skipped = 0;
  for (const store of stores) {
    if (existingIds.has(store.id)) { skipped++; continue; }
    const bill = await buildBillForPeriod(store, period);
    if (!bill) { skipped++; continue; }
    await (prisma.billingRecord as any).create({
      data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify({ ...bill.notes, generatedBy: 'manual' }) },
    });
    created++;
  }
```

- [ ] **Step 4: Verify it compiles**

Run: `cd S:\LUCKYAPP\backend && npx tsc --noEmit`
Expected: no new errors. (`buildBillForPeriod`/`toPeriod`/`BillNotes` are now exported but not yet imported anywhere else — this alone causes no errors, just makes them available.)

- [ ] **Step 5: Commit**

```bash
cd S:\LUCKYAPP
git add backend/src/controllers/billing.controller.ts
git commit -m "feat: export buildBillForPeriod/toPeriod, tag manual bills with generatedBy"
```

---

### Task 2: Rewrite the billing cron to use the shared, correct logic

**Files:**
- Modify: `backend/src/utils/billing-cron.ts` (full rewrite of `runMonthlyBilling`, removal of dead helpers)

- [ ] **Step 1: Replace the entire file content**

The current file is:

```ts
/**
 * Monthly billing cron — runs on the 1st of every month at 00:05 UTC.
 * Creates a BillingRecord for each active store based on their billing type:
 *   MONTHLY_SUBSCRIPTION  → flat subscriptionPrice
 *   PER_TRANSACTION       → prior-month transaction count × transactionFeeRate × avg purchase
 *   HYBRID                → subscription + per-transaction fees
 *
 * Safe to run multiple times — skips stores that already have a record for the period.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { BillingType } from '@prisma/client';

function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function lastMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to };
}

export async function runMonthlyBilling() {
  const period = currentPeriod();
  console.log(`[billing-cron] Running monthly billing for period ${period}…`);

  const stores = await prisma.store.findMany({ where: { isActive: true } });
  const { from, to } = lastMonthRange();

  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    // Idempotency — skip if already billed for this period
    const existing = await prisma.billingRecord.findFirst({
      where: { storeId: store.id, period },
    });
    if (existing) { skipped++; continue; }

    let amount = 0;

    if (store.billingType === BillingType.MONTHLY_SUBSCRIPTION) {
      amount = Number(store.subscriptionPrice);

    } else if (store.billingType === BillingType.PER_TRANSACTION) {
      const stats = await prisma.pointsTransaction.aggregate({
        where: { storeId: store.id, status: 'APPROVED', createdAt: { gte: from, lt: to } },
        _sum: { purchaseAmount: true },
      });
      amount = parseFloat(((stats._sum.purchaseAmount ?? 0) * Number(store.transactionFeeRate)).toFixed(2));

    } else {
      // HYBRID: flat fee + per-transaction fees on last month's volume
      const stats = await prisma.pointsTransaction.aggregate({
        where: { storeId: store.id, status: 'APPROVED', createdAt: { gte: from, lt: to } },
        _sum: { purchaseAmount: true },
      });
      const txFees = parseFloat(((stats._sum.purchaseAmount ?? 0) * Number(store.transactionFeeRate)).toFixed(2));
      amount = parseFloat((Number(store.subscriptionPrice) + txFees).toFixed(2));
    }

    await prisma.billingRecord.create({
      data: {
        storeId: store.id,
        billingType: store.billingType,
        amount,
        period,
        isPaid: false,  // pending payment
      },
    });
    created++;
    console.log(`[billing-cron]   ✅ ${store.name} — $${amount.toFixed(2)} (${store.billingType})`);
  }

  console.log(`[billing-cron] Done. Created: ${created}, Skipped: ${skipped}`);
}

// Schedule: 1st of every month at 00:05 UTC
export function startBillingCron() {
  cron.schedule('5 0 1 * *', runMonthlyBilling, { timezone: 'UTC' });
  console.log('[billing-cron] Monthly billing job scheduled (1st of month, 00:05 UTC)');
}
```

Replace the **entire file** with:

```ts
/**
 * Monthly billing cron — runs on the 1st of every month at 00:05 UTC.
 * Bills each active store for LAST month's activity, using the same
 * buildBillForPeriod logic the manual "Generate Monthly Billing" admin
 * route uses — so the cron and manual paths can never disagree on what
 * a store owes.
 *
 * Safe to run multiple times — skips stores that already have a record for the period.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { BillingType } from '@prisma/client';
import { buildBillForPeriod, toPeriod } from '../controllers/billing.controller';

function lastMonthPeriod(): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return toPeriod(lastMonth);
}

export async function runMonthlyBilling() {
  const period = lastMonthPeriod();
  console.log(`[billing-cron] Running monthly billing for period ${period}…`);

  const stores = await prisma.store.findMany({ where: { isActive: true } });

  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    // Idempotency — skip if already billed for this period
    const existing = await prisma.billingRecord.findFirst({
      where: { storeId: store.id, period },
    });
    if (existing) { skipped++; continue; }

    const bill = await buildBillForPeriod(store, period);
    if (!bill) { skipped++; continue; }

    await (prisma.billingRecord as any).create({
      data: {
        storeId: store.id,
        billingType: store.billingType as BillingType,
        amount: bill.amount,
        period,
        notes: JSON.stringify({ ...bill.notes, generatedBy: 'cron' }),
        isPaid: false,
      },
    });
    created++;
    console.log(`[billing-cron]   ✅ ${store.name} — $${bill.amount.toFixed(2)} (${store.billingType})`);
  }

  console.log(`[billing-cron] Done. Created: ${created}, Skipped: ${skipped}`);
}

// Schedule: 1st of every month at 00:05 UTC
export function startBillingCron() {
  cron.schedule('5 0 1 * *', runMonthlyBilling, { timezone: 'UTC' });
  console.log('[billing-cron] Monthly billing job scheduled (1st of month, 00:05 UTC)');
}
```

Note what changed: `currentPeriod()`/`lastMonthRange()` are gone, replaced by the single `lastMonthPeriod()` helper built on the shared `toPeriod`. The three-way `MONTHLY_SUBSCRIPTION`/`PER_TRANSACTION`/`HYBRID` branch is gone — `buildBillForPeriod` already handles all three internally. `BillingType` import is kept (still used for the `as BillingType` cast on the create call, matching the same pattern `generateMonthlyBilling` already uses).

- [ ] **Step 2: Verify it compiles**

Run: `cd S:\LUCKYAPP\backend && npx tsc --noEmit`
Expected: no errors. If you see a circular-import error between `billing-cron.ts` and `billing.controller.ts`, stop and report it rather than working around it — this would need a design discussion, not a quick patch, since it's financial logic. (It is not expected to occur — `billing.controller.ts` does not import anything from `billing-cron.ts`, so the dependency is one-directional.)

- [ ] **Step 3: Commit**

```bash
cd S:\LUCKYAPP
git add backend/src/utils/billing-cron.ts
git commit -m "fix: billing cron now uses shared buildBillForPeriod, fixes devCut formula and period mislabeling"
```

---

### Task 3: DevAdmin UI — show which bills were auto-generated vs manual

**Files:**
- Modify: `admin/src/pages/Billing.tsx:7-14` (`BillNotes` interface)
- Modify: `admin/src/pages/Billing.tsx:563-566` (per-store breakdown row)

- [ ] **Step 1: Add `generatedBy` to the `BillNotes` interface**

Find:

```tsx
interface BillNotes {
  txCount: number; purchaseVolume: number;
  cashbackIssued: number; devCutEarned: number; customerCashback: number;
  effectiveCashbackRate: number; effectiveDevCutRate: number;
  categories: { category: string; txCount: number; purchaseVolume: number; cashbackIssued: number; devCutEarned: number; customerCashback: number }[];
  subscriptionFee: number; transactionFeeRate: number; transactionFee: number;
  cashbackFee: number; totalAmountOwed: number; periodStart: string; periodEnd: string;
}
```

Replace with:

```tsx
interface BillNotes {
  txCount: number; purchaseVolume: number;
  cashbackIssued: number; devCutEarned: number; customerCashback: number;
  effectiveCashbackRate: number; effectiveDevCutRate: number;
  categories: { category: string; txCount: number; purchaseVolume: number; cashbackIssued: number; devCutEarned: number; customerCashback: number }[];
  subscriptionFee: number; transactionFeeRate: number; transactionFee: number;
  cashbackFee: number; totalAmountOwed: number; periodStart: string; periodEnd: string;
  generatedBy?: 'cron' | 'manual';
}
```

- [ ] **Step 2: Add the badge to the per-store breakdown row**

Find (in the per-store breakdown table inside the expanded period row):

```tsx
                                      return (
                                        <tr key={r.id}>
                                          <td style={s.catTd}>
                                            <strong>{r.store?.name}</strong>
                                            <div style={s.cityLabel}>{r.store?.city}</div>
                                          </td>
```

Replace with:

```tsx
                                      return (
                                        <tr key={r.id}>
                                          <td style={s.catTd}>
                                            <strong>{r.store?.name}</strong>
                                            <div style={s.cityLabel}>{r.store?.city}</div>
                                            {n?.generatedBy === 'cron' && (
                                              <span style={{ display: 'inline-block', marginTop: 3, padding: '1px 7px', background: '#eef2ff', color: '#4338ca', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>🤖 Auto</span>
                                            )}
                                            {n?.generatedBy === 'manual' && (
                                              <span style={{ display: 'inline-block', marginTop: 3, padding: '1px 7px', background: '#f0fdf4', color: '#166534', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>✋ Manual</span>
                                            )}
                                          </td>
```

This relies on `n` (the parsed `BillNotes`) already being in scope — confirm by checking the line just above this block, which should already read `const n: BillNotes | null = r.notes;` (it does, this is existing code, not part of this change). Records created before this fix have no `generatedBy` field (`undefined`), so neither badge renders for those — no visual change for historical records.

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Billing.tsx
git commit -m "feat: show Auto/Manual badge on billing records in admin"
```

---

### Task 4: Read-only verification against the real database

**Files:** none created/modified — this task runs a temporary, read-only script and deletes it afterward.

**⚠️ This task must not write any data.** It only reads existing data and calls `buildBillForPeriod` (a pure read+compute function — confirm by re-reading it that it contains no `.create()`/`.update()`/`.delete()` calls before running this). Do not call `runMonthlyBilling()` or `generateMonthlyBilling` in this task — only `buildBillForPeriod` directly.

- [ ] **Step 1: Confirm `buildBillForPeriod` performs no writes**

Run: `cd S:\LUCKYAPP\backend && grep -n "\.create(\|\.update(\|\.delete(\|\.upsert(" src/controllers/billing.controller.ts | sed -n '/buildBillForPeriod/,/^$/p'`

Simpler check: open `src/controllers/billing.controller.ts` and re-read the `buildBillForPeriod` function (now exported, found via `export async function buildBillForPeriod`) top to bottom. Confirm it contains only `prisma.pointsTransaction.groupBy(...)` (a read) and local arithmetic — no Prisma write calls. This was already true before this plan's changes (Task 1 only added an `export` keyword and tagged the *caller's* save call, not `buildBillForPeriod` itself) — this step is a final confirmation, not expected to find anything new.

- [ ] **Step 2: Write the verification script**

Create `backend/verify-billing-cron-fix-tmp.ts`:

```ts
import { PrismaClient } from '@prisma/client';
import { buildBillForPeriod, toPeriod } from './src/controllers/billing.controller';

const prisma = new PrismaClient();

async function main() {
  // 1. Confirm the new "last month" period calculation matches expectations.
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const computedPeriod = toPeriod(lastMonth);
  console.log(`Today: ${now.toISOString().slice(0, 10)} → computed last-month period: ${computedPeriod}`);

  // 2. Pick a real store + a real existing BillingRecord period to cross-check against.
  const existingRecord = await prisma.billingRecord.findFirst({
    where: { billingType: 'PER_TRANSACTION' },
    orderBy: { createdAt: 'desc' },
  });
  if (!existingRecord) {
    console.log('No existing PER_TRANSACTION BillingRecord found to cross-check against. Nothing to verify.');
    return;
  }

  const store = await prisma.store.findUnique({ where: { id: existingRecord.storeId } });
  if (!store) {
    console.log('Store for existing record not found — skipping cross-check.');
    return;
  }

  console.log(`\nCross-checking store "${store.name}" for period ${existingRecord.period}…`);
  console.log(`Existing BillingRecord.amount = $${existingRecord.amount}`);

  // Read-only call — buildBillForPeriod performs no writes.
  const recomputed = await buildBillForPeriod(
    { id: store.id, billingType: store.billingType, subscriptionPrice: store.subscriptionPrice, transactionFeeRate: store.transactionFeeRate },
    existingRecord.period,
  );

  if (!recomputed) {
    console.log('buildBillForPeriod returned null for this store/period — mismatch, investigate.');
    return;
  }

  console.log(`Recomputed via buildBillForPeriod = $${recomputed.amount}`);
  console.log(recomputed.amount === existingRecord.amount ? '✅ MATCH' : '❌ MISMATCH — investigate before proceeding');
}

main().finally(() => prisma.$disconnect());
```

- [ ] **Step 3: Run it and inspect the output**

Run: `cd S:\LUCKYAPP\backend && npx ts-node verify-billing-cron-fix-tmp.ts`

Expected: prints a computed "last-month period" string matching the actual previous calendar month, then `✅ MATCH` for the cross-checked store (since `buildBillForPeriod`'s logic is unchanged by this plan — only its export visibility changed — this confirms the import/export refactor introduced no behavioral drift).

If it prints `❌ MISMATCH`: stop, do not proceed to delete the script, and report the exact mismatch (store name, period, both amounts) — do not attempt to silently "fix" anything further without discussing it first, since this is financial logic.

- [ ] **Step 4: Delete the temporary script**

```bash
cd S:\LUCKYAPP\backend
rm verify-billing-cron-fix-tmp.ts
```

(No commit needed — this file is never staged/committed; it's deleted immediately after use.)

---

### Task 5: Final full build verification

**Files:** none (verification only)

- [ ] **Step 1: Backend type-check**

Run: `cd S:\LUCKYAPP\backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 2: Admin build**

Run: `cd S:\LUCKYAPP\admin && npm run build`
Expected: `tsc && vite build` completes with no errors.

- [ ] **Step 3: Confirm no other files were touched**

Run: `cd S:\LUCKYAPP && git diff --stat eb12592..HEAD`
Expected: only `backend/src/controllers/billing.controller.ts`, `backend/src/utils/billing-cron.ts`, and `admin/src/pages/Billing.tsx` appear (plus the two spec doc commits already made before this plan). No other backend or admin files changed.

No commit needed for this verification-only task.
