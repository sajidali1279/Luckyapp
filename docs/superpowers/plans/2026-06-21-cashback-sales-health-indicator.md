# Cashback-to-Sales Health Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a DevAdmin-only Dashboard indicator showing each store's trailing-30-day cashback-to-sales ratio (with per-category breakdown), flagging stores/categories that are bleeding margin even when no single transaction looks anomalous.

**Architecture:** One new backend endpoint (`GET /billing/cashback-health`) aggregates `PointsTransaction` grouped by store and category over a rolling 30-day window, classifies each ratio into `ok`/`warn`/`critical`, and returns a store-level rollup with nested category detail. One new Dashboard card consumes it, reusing the existing `.dash-card`/`.dash-fade-in`/`handleGlowMove` visual language already established on this page.

**Tech Stack:** Node/Express/Prisma backend, React + TypeScript + Vite admin frontend. No test runner exists in this project — verification is `npx tsc --noEmit`/`npm run build` plus a one-off, dependency-free script testing the pure classification logic with synthetic numbers (no DB access needed for this one, since classification is pure math).

**Spec:** `docs/superpowers/specs/2026-06-21-cashback-sales-health-indicator-design.md`

---

### Task 1: Backend — cashback health endpoint

**Files:**
- Modify: `backend/src/controllers/billing.controller.ts` (add new exported function + helper, end of file)
- Modify: `backend/src/routes/index.ts` (import + route registration)

- [ ] **Step 1: Add the classification helper and main handler**

Add to the end of `backend/src/controllers/billing.controller.ts` (after the last function, `getAllGasPrices`):

```ts

// ─── Cashback-to-Sales Health (DevAdmin only) ──────────────────────────────────

const CASHBACK_HEALTH_WARN = 0.075;
const CASHBACK_HEALTH_CRITICAL = 0.09;

export function classifyCashbackRatio(ratio: number): 'ok' | 'warn' | 'critical' {
  if (ratio > CASHBACK_HEALTH_CRITICAL) return 'critical';
  if (ratio > CASHBACK_HEALTH_WARN) return 'warn';
  return 'ok';
}

// DevAdmin: trailing-30-day cashback-to-sales ratio per store, with category breakdown.
// Catches a systemic rate misconfiguration that no single transaction would look
// anomalous for (every transaction using the same wrong rate looks "consistent").
export async function getCashbackHealth(_req: AuthRequest, res: Response) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [stores, categoryStats] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId', 'category'],
      where: { status: 'APPROVED', createdAt: { gte: thirtyDaysAgo } },
      _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
  ]);

  const byStore: Record<string, typeof categoryStats> = {};
  for (const row of categoryStats) {
    (byStore[row.storeId] ??= []).push(row);
  }

  const data = stores.map((store) => {
    const rows = byStore[store.id] ?? [];
    const categories = rows
      .map((r) => {
        const cashbackIssued = parseFloat((r._sum.pointsAwarded ?? 0).toFixed(2));
        const purchaseVolume = parseFloat((r._sum.purchaseAmount ?? 0).toFixed(2));
        const ratio = purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0;
        return { category: String(r.category), cashbackIssued, purchaseVolume, ratio, status: classifyCashbackRatio(ratio) };
      })
      .filter((c) => c.purchaseVolume > 0);

    const cashbackIssued = parseFloat(categories.reduce((s, c) => s + c.cashbackIssued, 0).toFixed(2));
    const purchaseVolume = parseFloat(categories.reduce((s, c) => s + c.purchaseVolume, 0).toFixed(2));
    const ratio = purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0;

    return {
      storeId: store.id,
      storeName: store.name,
      cashbackIssued,
      purchaseVolume,
      ratio,
      status: classifyCashbackRatio(ratio),
      categories,
    };
  });

  res.json({ success: true, data });
}
```

- [ ] **Step 2: Register the route**

Find the billing import block in `backend/src/routes/index.ts` (it lists every export from `../controllers/billing.controller`, including):

```ts
  getDevRevenue,
  getAnalytics,
  getCategoryRates,
```

Replace with:

```ts
  getDevRevenue,
  getAnalytics,
  getCashbackHealth,
  getCategoryRates,
```

Then find:

```ts
router.get('/billing/analytics', authenticate, requireRole(Role.DEV_ADMIN), getAnalytics);
```

Add immediately after it:

```ts
router.get('/billing/analytics', authenticate, requireRole(Role.DEV_ADMIN), getAnalytics);
router.get('/billing/cashback-health', authenticate, requireRole(Role.DEV_ADMIN), getCashbackHealth);
```

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add backend/src/controllers/billing.controller.ts backend/src/routes/index.ts
git commit -m "feat: add GET /billing/cashback-health endpoint with per-category breakdown"
```

We have explicit user consent to commit directly to `main` — do not create a new branch.

---

### Task 2: Verify the classification logic with synthetic data (read-only, no DB)

**Files:** none created/modified — temporary script, deleted after use.

This task runs entirely without touching the database — `classifyCashbackRatio` is a pure function, so this validates logic correctness with plain numbers before trusting it on real data.

- [ ] **Step 1: Write the verification script**

Create `backend/verify-cashback-health-tmp.ts`:

```ts
import { classifyCashbackRatio } from './src/controllers/billing.controller';

function expect(label: string, actual: string, expected: string) {
  const pass = actual === expected;
  console.log(`${pass ? '✅' : '❌'} ${label}: got ${actual}, expected ${expected}`);
  if (!pass) process.exitCode = 1;
}

// Clearly healthy
expect('5% ratio', classifyCashbackRatio(0.05), 'ok');
expect('6% ratio', classifyCashbackRatio(0.06), 'ok');

// Boundary: exactly at the warn threshold (7.5%) should NOT be warn yet (classifyCashbackRatio uses >, not >=)
expect('exactly 7.5% (boundary)', classifyCashbackRatio(0.075), 'ok');
expect('7.6% (just past warn)', classifyCashbackRatio(0.076), 'warn');

// Borderline / warn band
expect('8% ratio', classifyCashbackRatio(0.08), 'warn');

// Boundary: exactly at the critical threshold (9%) should still be warn, not critical
expect('exactly 9% (boundary)', classifyCashbackRatio(0.09), 'warn');
expect('9.1% (just past critical)', classifyCashbackRatio(0.091), 'critical');

// Clearly bad
expect('12% ratio', classifyCashbackRatio(0.12), 'critical');

// Edge case: zero ratio (e.g. a store with sales but somehow no cashback issued)
expect('0% ratio', classifyCashbackRatio(0), 'ok');

// ── Mixed-category dilution scenario ──
// Simulates buildBillForPeriod-style category rows for one store: several healthy
// categories plus one badly-misconfigured category, to confirm the store's blended
// ratio can look "ok"-ish while the bad category still independently flags critical.
const categories = [
  { category: 'GAS',       cashbackIssued: 30,  purchaseVolume: 1000 }, // 3% - ok
  { category: 'GROCERIES', cashbackIssued: 40,  purchaseVolume: 1000 }, // 4% - ok
  { category: 'HOT_FOODS', cashbackIssued: 150, purchaseVolume: 1000 }, // 15% - critical (misconfigured)
];
const totalCashback = categories.reduce((s, c) => s + c.cashbackIssued, 0); // 220
const totalVolume = categories.reduce((s, c) => s + c.purchaseVolume, 0);   // 3000
const blendedRatio = totalCashback / totalVolume; // ~7.33%

console.log(`\nBlended ratio across 3 categories: ${(blendedRatio * 100).toFixed(2)}%`);
expect('blended ratio (diluted)', classifyCashbackRatio(blendedRatio), 'ok');

const hotFoodsRatio = categories[2].cashbackIssued / categories[2].purchaseVolume;
console.log(`HOT_FOODS category ratio alone: ${(hotFoodsRatio * 100).toFixed(2)}%`);
expect('HOT_FOODS category (not diluted)', classifyCashbackRatio(hotFoodsRatio), 'critical');

console.log('\nIf both lines above show ✅, the dilution scenario is correctly caught at the category level even though the blended store ratio looks healthy.');
```

- [ ] **Step 2: Run it**

Run: `cd S:\LUCKYAPP\backend && npx ts-node verify-cashback-health-tmp.ts`
Expected: every line printed with a ✅, no ❌, ending with the dilution-scenario confirmation message. If any line shows ❌, stop and report — do not proceed to Task 3 with broken classification logic.

- [ ] **Step 3: Delete the script**

```bash
cd S:\LUCKYAPP\backend
rm verify-cashback-health-tmp.ts
```

(No commit needed — this file is never staged.)

---

### Task 3: Dashboard UI — Cashback Health card

**Files:**
- Modify: `admin/src/services/api.ts` (add `getCashbackHealth` to `billingApi`)
- Modify: `admin/src/pages/Dashboard.tsx` (new component + insertion point + styles)

- [ ] **Step 1: Add the API client method**

Find:

```ts
  getAnalytics: (from?: string, to?: string) =>
    api.get(`/billing/analytics${from ? `?from=${from}&to=${to}` : ''}`),
```

Add immediately after it:

```ts
  getAnalytics: (from?: string, to?: string) =>
    api.get(`/billing/analytics${from ? `?from=${from}&to=${to}` : ''}`),
  getCashbackHealth: () => api.get('/billing/cashback-health'),
```

- [ ] **Step 2: Add the `CashbackHealthCard` component**

Find the `AttentionBanner` function in `admin/src/pages/Dashboard.tsx`:

```tsx
function AttentionBanner({ pending, disputes }: { pending: number; disputes: number }) {
```

Add a new component immediately BEFORE it (so it's defined alongside the other Dashboard sub-components):

```tsx
type CashbackCategoryHealth = {
  category: string; cashbackIssued: number; purchaseVolume: number; ratio: number;
  status: 'ok' | 'warn' | 'critical';
};
type CashbackStoreHealth = {
  storeId: string; storeName: string; cashbackIssued: number; purchaseVolume: number;
  ratio: number; status: 'ok' | 'warn' | 'critical'; categories: CashbackCategoryHealth[];
};

const HEALTH_STATUS_META: Record<'ok' | 'warn' | 'critical', { label: string; color: string; bg: string; border: string }> = {
  ok:       { label: '✅ OK',       color: '#1a7a3a', bg: '#f0fdf4', border: '#bbf7d0' },
  warn:     { label: '⚠️ Warn',     color: '#92400e', bg: '#fffbeb', border: '#fde68a' },
  critical: { label: '🚨 Critical', color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function CashbackHealthCard() {
  const [expandedStore, setExpandedStore] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cashback-health'],
    queryFn: () => billingApi.getCashbackHealth(),
    staleTime: 5 * 60_000,
  });

  // Quietly hide on error — this is a passive health indicator, not a critical-path
  // feature; a failed fetch shouldn't show a scary error box on the main Dashboard.
  if (isError) return null;

  const stores: CashbackStoreHealth[] = data?.data?.data ?? [];
  const problemStores = stores
    .filter(s => s.status !== 'ok' || s.categories.some(c => c.status !== 'ok'))
    .sort((a, b) => b.ratio - a.ratio);

  return (
    <div>
      <SectionHeader title="Cashback Health" subtitle="Cashback paid out vs. sales, trailing 30 days" />
      {isLoading ? (
        <div style={s.healthLoading}>Checking cashback health…</div>
      ) : problemStores.length === 0 ? (
        <div style={s.healthOk}>✅ All stores within cashback target</div>
      ) : (
        <div style={s.healthList}>
          {problemStores.map(store => {
            const meta = HEALTH_STATUS_META[store.status];
            const isOpen = expandedStore === store.storeId;
            return (
              <div
                key={store.storeId}
                className="dash-card"
                style={{ ...s.healthRow, borderColor: meta.border, background: meta.bg }}
                onMouseMove={handleGlowMove}
              >
                <div style={s.healthRowHeader} onClick={() => setExpandedStore(isOpen ? null : store.storeId)}>
                  <div style={s.healthRowName}>{isOpen ? '▾' : '▸'} {store.storeName}</div>
                  <div style={s.healthRowStats}>
                    <span style={s.healthStat}>{fmt$(store.purchaseVolume)} sold</span>
                    <span style={s.healthStat}>{fmt$(store.cashbackIssued)} cashback</span>
                    <span style={{ ...s.healthPill, color: meta.color, borderColor: meta.border }}>
                      {meta.label} · {(store.ratio * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
                {isOpen && (
                  <div style={s.healthCategoryList}>
                    {store.categories.map(cat => {
                      const catMeta = HEALTH_STATUS_META[cat.status];
                      return (
                        <div key={cat.category} style={s.healthCategoryRow}>
                          <span style={s.healthCategoryName}>{cat.category.replace(/_/g, ' ')}</span>
                          <span style={s.healthStat}>{fmt$(cat.purchaseVolume)} sold</span>
                          <span style={s.healthStat}>{fmt$(cat.cashbackIssued)} cashback</span>
                          <span style={{ color: catMeta.color, fontWeight: 700, fontSize: 13 }}>
                            {catMeta.label} · {(cat.ratio * 100).toFixed(1)}%
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

```

(`fmt$`, `useState`, `useQuery`, `billingApi`, `handleGlowMove`, `SectionHeader` are all already defined/imported earlier in this same file — no new imports needed beyond what Step 1 already covers via the existing `billingApi` import.)

- [ ] **Step 3: Insert the card into the Dashboard, DevAdmin-only, after Revenue Overview**

Find:

```tsx
      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          <SectionHeader title="Revenue Overview" action={{ label: 'View Billing', to: '/billing' }} />
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Transactions" value={revenue.totalTransactions} to="/transactions" />
            <StatCard icon="💵" label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume)} />
            <StatCard icon="⭐" label="Points Issued" value={fmt$(revenue.totalPointsAwarded)} />
            <StatCard icon="🎁" label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount)} />
            <StatCard icon="💰" label="Dev Cut (cashback)" value={fmt$(revenue.totalDevCut)} valueColor="#2DC653" to="/billing" />
            <StatCard icon="📋" label="Subscription Revenue" value={fmt$(revenue.totalSubscriptionRevenue)} valueColor="#2DC653" to="/billing" />
          </div>
        </div>
      )}

      {/* ── SuperAdmin sections ── */}
```

Replace with:

```tsx
      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          <SectionHeader title="Revenue Overview" action={{ label: 'View Billing', to: '/billing' }} />
          <div style={s.statsGrid}>
            <StatCard icon="🧾" label="Transactions" value={revenue.totalTransactions} to="/transactions" />
            <StatCard icon="💵" label="Purchase Volume" value={fmt$(revenue.totalPurchaseVolume)} />
            <StatCard icon="⭐" label="Points Issued" value={fmt$(revenue.totalPointsAwarded)} />
            <StatCard icon="🎁" label="Credits Redeemed" value={fmt$(revenue.totalRedeemedAmount)} />
            <StatCard icon="💰" label="Dev Cut (cashback)" value={fmt$(revenue.totalDevCut)} valueColor="#2DC653" to="/billing" />
            <StatCard icon="📋" label="Subscription Revenue" value={fmt$(revenue.totalSubscriptionRevenue)} valueColor="#2DC653" to="/billing" />
          </div>
        </div>
      )}

      {/* ── Cashback Health (DevAdmin only) ── */}
      {isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '150ms' }}>
          <CashbackHealthCard />
        </div>
      )}

      {/* ── SuperAdmin sections ── */}
```

- [ ] **Step 4: Add styles**

Find this exact block in the `s` styles object (verified current content — `statCardHov` no longer exists, it was removed in an earlier Dashboard polish pass):

```tsx
  statValue: { fontSize: 24, fontWeight: 800, letterSpacing: -0.5 },

  storeTable: {
```

Replace with (inserting the new style entries between `statValue` and `storeTable`):

```tsx
  statValue: { fontSize: 24, fontWeight: 800, letterSpacing: -0.5 },

  healthLoading: { color: '#9ca3af', fontSize: 14, padding: '12px 0', fontStyle: 'italic' },
  healthOk: {
    color: '#1a7a3a', fontSize: 14, fontWeight: 600, background: '#f0fdf4',
    border: '1px solid #bbf7d0', borderRadius: 10, padding: '10px 16px', marginBottom: 8,
  },
  healthList: { display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 32 },
  healthRow: {
    borderRadius: 14, border: '1px solid', padding: '14px 18px',
    transition: TRANSITION_TRANSFORM,
  },
  healthRowHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    cursor: 'pointer', flexWrap: 'wrap' as const, gap: 10,
  },
  healthRowName: { fontWeight: 700, fontSize: 15, color: '#1D3557' },
  healthRowStats: { display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const },
  healthStat: { fontSize: 13, color: '#6b7280' },
  healthPill: {
    fontSize: 13, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
    border: '1px solid', background: '#fff', transition: TRANSITION_FAST,
  },
  healthCategoryList: {
    marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', gap: 8,
  },
  healthCategoryRow: {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' as const,
    fontSize: 13, paddingLeft: 8,
  },
  healthCategoryName: { fontWeight: 600, color: '#374151', minWidth: 110 },

  storeTable: {
```

- [ ] **Step 5: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/services/api.ts admin/src/pages/Dashboard.tsx
git commit -m "feat: add Cashback Health Dashboard card with per-category breakdown"
```

We have explicit user consent to commit directly to `main` — do not create a new branch.

---

### Task 4: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build verification**

Run: `cd S:\LUCKYAPP\backend && npx tsc --noEmit`
Expected: no errors.

Run: `cd S:\LUCKYAPP\admin && npm run build`
Expected: `tsc && vite build` completes with no errors.

- [ ] **Step 2: Manual visual check**

Run: `cd S:\LUCKYAPP\admin && npm run dev`, open the local URL, log in as DevAdmin, and check the Dashboard. Confirm:
- A new "Cashback Health" section appears after "Revenue Overview" and before whatever DevAdmin sees next (Analytics Charts).
- It fades in consistently with the rest of the Dashboard's staggered entrance animation (briefly shows "Checking cashback health…" then resolves).
- If all stores are healthy, it shows a single quiet green "✅ All stores within cashback target" line — not an empty table, not an error-looking box.
- If any store/category is in `warn`/`critical` (you can temporarily verify this by checking against the real ratios computed in Task 1, or by noting current live category-rate misconfiguration history this session), it shows a list of cards with the mouse-tracking glow/hover-lift effect (same as the StatCard/QuickActions cards elsewhere on this Dashboard), clicking a row expands it to show the per-category breakdown underneath.
- Status pills always show both a text label ("✅ OK"/"⚠️ Warn"/"🚨 Critical") and a percentage — never color alone.

Stop the dev server once confirmed (Ctrl+C).

- [ ] **Step 3: Confirm no unrelated files were touched**

Run: `cd S:\LUCKYAPP && git diff --stat 7da583f..HEAD`
Expected: only `backend/src/controllers/billing.controller.ts`, `backend/src/routes/index.ts`, `admin/src/services/api.ts`, `admin/src/pages/Dashboard.tsx` appear (plus the earlier spec doc commits already made before this plan). No other backend/admin files changed.

No commit needed for this verification-only task.
