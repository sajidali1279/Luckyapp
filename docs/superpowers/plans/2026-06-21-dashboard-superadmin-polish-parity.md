# Dashboard SuperAdmin/DevAdmin Polish Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the SuperAdmin section of the admin Dashboard up to the same visual/interaction polish already established for DevAdmin (glow/hover-lift cards, staggered entrance animation), and let DevAdmin see the pending-reviews/disputes attention banner they currently never see.

**Architecture:** All changes are in `admin/src/pages/Dashboard.tsx` (component/JSX/query changes) plus one new CSS class appended to `admin/src/index.css`. No backend changes, no new data — this is purely making existing data render more consistently and one query's `enabled` condition slightly wider.

**Tech Stack:** React + TypeScript + Vite. No test runner exists in this project — verification is `npx tsc --noEmit`, `npm run build`, and a manual visual check (described per task).

**Spec:** `docs/superpowers/specs/2026-06-21-dashboard-superadmin-polish-parity-design.md`

---

### Task 1: `KPICard` gets glow/hover polish

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx` (the `KPICard` component, currently lines 291-306)

- [ ] **Step 1: Add the dash-card class and glow handler**

Find:

```tsx
function KPICard({ label, value, sub, color = '#1D3557', bg = '#eff6ff', icon }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string; icon: string;
}) {
  return (
    <div style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }}>
```

Replace with:

```tsx
function KPICard({ label, value, sub, color = '#1D3557', bg = '#eff6ff', icon }: {
  label: string; value: string | number; sub?: string; color?: string; bg?: string; icon: string;
}) {
  return (
    <div className="dash-card" style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }} onMouseMove={handleGlowMove}>
```

(`handleGlowMove` is already imported at the top of this file via `import { handleGlowMove, TRANSITION_FAST, TRANSITION_TRANSFORM } from '../lib/motion';` — no new import needed. The colored top border and everything else about `KPICard` stays unchanged.)

- [ ] **Step 2: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Dashboard.tsx
git commit -m "feat: add glow/hover polish to KPICard"
```

We have explicit user consent to commit directly to `main` — do not create a new branch.

---

### Task 2: `AttentionBanner` becomes shared between DevAdmin and SuperAdmin

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx` (the `sa-disputes-pending` query's `enabled` condition)
- Modify: `admin/src/pages/Dashboard.tsx` (remove `AttentionBanner` from inside the SuperAdmin-only block, add a new shared block)

- [ ] **Step 1: Widen the disputes query's `enabled` condition**

Find:

```ts
  const { data: disputesRaw } = useQuery({
    queryKey: ['sa-disputes-pending'],
    queryFn: () => disputesApi.getAll({ status: 'PENDING' }),
    enabled: isSuperAdmin && !isDevAdmin,
    refetchInterval: 60_000,
  });
```

Replace with:

```ts
  const { data: disputesRaw } = useQuery({
    queryKey: ['sa-disputes-pending'],
    queryFn: () => disputesApi.getAll({ status: 'PENDING' }),
    enabled: isSuperAdmin,
    refetchInterval: 60_000,
  });
```

(Do NOT touch the `sa-trend-30d` query right above it — that one stays `isSuperAdmin && !isDevAdmin` since it powers a SuperAdmin-only chart; DevAdmin has its own separate analytics chart already.)

- [ ] **Step 2: Add the new shared AttentionBanner block, after Quick Actions**

Find:

```tsx
      {/* ── Quick Actions ── */}
      {isSuperAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '60ms' }}>
          <QuickActions isDevAdmin={isDevAdmin} />
        </div>
      )}

      {/* ── Revenue (DevAdmin only) ── */}
```

Replace with:

```tsx
      {/* ── Quick Actions ── */}
      {isSuperAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '60ms' }}>
          <QuickActions isDevAdmin={isDevAdmin} />
        </div>
      )}

      {/* ── Attention banner (shared: DevAdmin + SuperAdmin) ── */}
      {isSuperAdmin && ((platform?.pending ?? 0) > 0 || pendingDisputesCount > 0) && (
        <div className="dash-fade-in" style={{ animationDelay: '90ms' }}>
          <AttentionBanner pending={platform?.pending ?? 0} disputes={pendingDisputesCount} />
        </div>
      )}

      {/* ── Revenue (DevAdmin only) ── */}
```

- [ ] **Step 3: Remove the now-duplicated AttentionBanner from inside the SuperAdmin-only block**

Find:

```tsx
      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          {/* Attention banner */}
          {((platform?.pending ?? 0) > 0 || pendingDisputesCount > 0) && (
            <AttentionBanner pending={platform?.pending ?? 0} disputes={pendingDisputesCount} />
          )}

          {/* KPI row */}
```

Replace with:

```tsx
      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          {/* KPI row */}
```

(This step only removes the now-redundant `AttentionBanner` block and its comment from inside the SuperAdmin section — Task 3 below will further restructure the rest of this block's internals, so don't worry about the surrounding `<div>`/delay yet, that's handled next.)

- [ ] **Step 4: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Dashboard.tsx
git commit -m "feat: show pending-reviews/disputes attention banner to DevAdmin too"
```

---

### Task 3: Split the SuperAdmin block into individually staggered sections

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx` (the SuperAdmin-only block, now starting after Task 2's edit)

This task takes the SuperAdmin block (now containing 5 sections after Task 2 removed `AttentionBanner`) and gives each section its own `dash-fade-in` wrapper instead of one shared one.

- [ ] **Step 1: Replace the whole SuperAdmin block**

Find (this is the full block after Task 2's changes — confirm it matches before editing):

```tsx
      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          {/* KPI row */}
          {platform && (
            <>
              <SectionHeader title="Today's Activity" action={{ label: 'View Transactions', to: '/transactions' }} />
              <div style={s.kpiGrid}>
                <KPICard icon="🧾" label="Transactions" value={platform.today.transactions} sub="Today" color="#1D3557" bg="#eff6ff" />
                <KPICard icon="💵" label="Purchase Volume" value={fmt$(platform.today.purchaseVolume)} sub="Today" color="#157A6E" bg="#f0fdf9" />
                <KPICard icon="⭐" label="Cashback Issued" value={fmt$(platform.today.cashbackIssued)} sub="Today" color="#7C3AED" bg="#f5f3ff" />
                <KPICard icon="📅" label="Monthly Volume" value={fmt$(platform.thisMonth.purchaseVolume)} sub="This month" color="#B45309" bg="#fffbeb" />
                <KPICard
                  icon="⏳" label="Pending Reviews" value={platform.pending}
                  sub={platform.pending > 0 ? 'Need action' : 'All clear'}
                  color={platform.pending > 0 ? '#E63946' : '#2DC653'}
                  bg={platform.pending > 0 ? '#fff5f5' : '#f0fdf4'}
                />
                <KPICard icon="💰" label="Credits Outstanding" value={fmt$(platform.totalCreditsOutstanding)} sub="Unredeemed" color="#0369a1" bg="#f0f9ff" />
              </div>
            </>
          )}

          {/* 30-day trend chart */}
          {trend30.length > 0 && (
            <>
              <SectionHeader title="30-Day Purchase Volume" subtitle="Daily volume across all stores" />
              <div style={s.chartBoxFull}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trend30} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="saGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1D3557" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1D3557" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} interval={4} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Volume']} labelFormatter={(l) => `Date: ${l}`} />
                    <Area type="monotone" dataKey="volume" stroke="#1D3557" strokeWidth={2} fill="url(#saGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {/* Store performance */}
          {platform?.storeRanking?.length > 0 && (
            <>
              <SectionHeader title="Store Performance — This Month" action={{ label: 'Full Leaderboard', to: '/leaderboard' }} />
              <div style={s.storeTable}>
                <div style={s.storeTableHeader}>
                  <span style={s.storeColName}>Store</span>
                  <span style={s.storeColNum}>Transactions</span>
                  <span style={s.storeColNum}>Purchase Volume</span>
                  <span style={s.storeColNum}>Cashback Issued</span>
                  <span style={s.storeColBar}>Activity</span>
                </div>
                {platform.storeRanking.map((store: any, i: number) => {
                  const maxVol = platform.storeRanking[0]?.purchaseVolume || 1;
                  const barWidth = Math.max(4, (store.purchaseVolume / maxVol) * 100);
                  return <StoreRow key={store.id} store={store} i={i} barWidth={barWidth} color={storeColor(i)} />;
                })}
              </div>
            </>
          )}

          {/* Active promotions + recent transactions side by side */}
          <div style={s.twoColRow}>
            <ActiveOffersPanel offers={activeOffersList} banners={bannersData?.data?.data || []} />
            <RecentTransactions txs={recentTxs} />
          </div>

          {/* Platform overview */}
          <SectionHeader title="Platform Overview" />
          <div style={s.statsGrid}>
            <StatCard icon="🏪" label="Active Stores" value={loadingStores ? '…' : activeStores} to="/stores" />
            <StatCard icon="🙋" label="Customers" value={loadingCustomers ? '…' : totalCustomers} to="/customers" />
            <StatCard icon="👷" label="Staff Members" value={loadingStaff ? '…' : totalStaff} to="/staff" />
            <StatCard icon="📢" label="Active Offers" value={loadingOffers ? '…' : activeOffersCount} to="/offers" />
            <StatCard icon="🖼️" label="Active Banners" value={loadingBanners ? '…' : activeBanners} to="/banners" />
          </div>
        </div>
      )}
```

Replace with:

```tsx
      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <>
          {/* KPI row */}
          {platform && (
            <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
              <SectionHeader title="Today's Activity" action={{ label: 'View Transactions', to: '/transactions' }} />
              <div style={s.kpiGrid}>
                <KPICard icon="🧾" label="Transactions" value={platform.today.transactions} sub="Today" color="#1D3557" bg="#eff6ff" />
                <KPICard icon="💵" label="Purchase Volume" value={fmt$(platform.today.purchaseVolume)} sub="Today" color="#157A6E" bg="#f0fdf9" />
                <KPICard icon="⭐" label="Cashback Issued" value={fmt$(platform.today.cashbackIssued)} sub="Today" color="#7C3AED" bg="#f5f3ff" />
                <KPICard icon="📅" label="Monthly Volume" value={fmt$(platform.thisMonth.purchaseVolume)} sub="This month" color="#B45309" bg="#fffbeb" />
                <KPICard
                  icon="⏳" label="Pending Reviews" value={platform.pending}
                  sub={platform.pending > 0 ? 'Need action' : 'All clear'}
                  color={platform.pending > 0 ? '#E63946' : '#2DC653'}
                  bg={platform.pending > 0 ? '#fff5f5' : '#f0fdf4'}
                />
                <KPICard icon="💰" label="Credits Outstanding" value={fmt$(platform.totalCreditsOutstanding)} sub="Unredeemed" color="#0369a1" bg="#f0f9ff" />
              </div>
            </div>
          )}

          {/* 30-day trend chart */}
          {trend30.length > 0 && (
            <div className="dash-fade-in" style={{ animationDelay: '150ms' }}>
              <SectionHeader title="30-Day Purchase Volume" subtitle="Daily volume across all stores" />
              <div style={s.chartBoxFull}>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trend30} margin={{ top: 4, right: 16, bottom: 0, left: -10 }}>
                    <defs>
                      <linearGradient id="saGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#1D3557" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#1D3557" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f1f2" />
                    <XAxis dataKey="date" tick={{ fontSize: 12 }} interval={4} />
                    <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v}`} />
                    <Tooltip formatter={(v: any) => [`$${Number(v).toFixed(2)}`, 'Volume']} labelFormatter={(l) => `Date: ${l}`} />
                    <Area type="monotone" dataKey="volume" stroke="#1D3557" strokeWidth={2} fill="url(#saGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Store performance */}
          {platform?.storeRanking?.length > 0 && (
            <div className="dash-fade-in" style={{ animationDelay: '180ms' }}>
              <SectionHeader title="Store Performance — This Month" action={{ label: 'Full Leaderboard', to: '/leaderboard' }} />
              <div style={s.storeTable}>
                <div style={s.storeTableHeader}>
                  <span style={s.storeColName}>Store</span>
                  <span style={s.storeColNum}>Transactions</span>
                  <span style={s.storeColNum}>Purchase Volume</span>
                  <span style={s.storeColNum}>Cashback Issued</span>
                  <span style={s.storeColBar}>Activity</span>
                </div>
                {platform.storeRanking.map((store: any, i: number) => {
                  const maxVol = platform.storeRanking[0]?.purchaseVolume || 1;
                  const barWidth = Math.max(4, (store.purchaseVolume / maxVol) * 100);
                  return <StoreRow key={store.id} store={store} i={i} barWidth={barWidth} color={storeColor(i)} />;
                })}
              </div>
            </div>
          )}

          {/* Active promotions + recent transactions side by side */}
          <div className="dash-fade-in" style={{ animationDelay: '210ms' }}>
            <div style={s.twoColRow}>
              <ActiveOffersPanel offers={activeOffersList} banners={bannersData?.data?.data || []} />
              <RecentTransactions txs={recentTxs} />
            </div>
          </div>

          {/* Platform overview */}
          <div className="dash-fade-in" style={{ animationDelay: '240ms' }}>
            <SectionHeader title="Platform Overview" />
            <div style={s.statsGrid}>
              <StatCard icon="🏪" label="Active Stores" value={loadingStores ? '…' : activeStores} to="/stores" />
              <StatCard icon="🙋" label="Customers" value={loadingCustomers ? '…' : totalCustomers} to="/customers" />
              <StatCard icon="👷" label="Staff Members" value={loadingStaff ? '…' : totalStaff} to="/staff" />
              <StatCard icon="📢" label="Active Offers" value={loadingOffers ? '…' : activeOffersCount} to="/offers" />
              <StatCard icon="🖼️" label="Active Banners" value={loadingBanners ? '…' : activeBanners} to="/banners" />
            </div>
          </div>
        </>
      )}
```

Note what changed: the outer wrapper went from a single `<div className="dash-fade-in" style={{ animationDelay: '120ms' }}>` around all 5 sections to a plain `<>` fragment, with each of the 5 sections now individually wrapped in its own `dash-fade-in` div at 120/150/180/210/240ms. The KPI row and 30-day chart and store performance sections each already had their own conditional (`{platform && (...)}`, `{trend30.length > 0 && (...)}`, `{platform?.storeRanking?.length > 0 && (...)}`) — the `dash-fade-in` wrapper now lives INSIDE each of those conditionals (so the fade-in only applies when that section actually renders), replacing the `<>...</>` fragments that were there before.

- [ ] **Step 2: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Dashboard.tsx
git commit -m "feat: stagger SuperAdmin dashboard sections individually instead of one bundled fade-in"
```

---

### Task 4: `StoreRow` — CSS-based hover instead of `useState`

**Files:**
- Modify: `admin/src/index.css` (append new `.dash-table-row` class)
- Modify: `admin/src/pages/Dashboard.tsx` (the `StoreRow` component, currently lines 124-152)

- [ ] **Step 1: Add the new CSS class**

Append to the end of `admin/src/index.css` (after the existing `.dash-section-link:focus-visible` block):

```css

.dash-table-row {
  transition: background-color 0.18s var(--ease-premium);
}
.dash-table-row:hover {
  background: #f0f4ff;
}
```

- [ ] **Step 2: Update `StoreRow` to use it**

Find:

```tsx
function StoreRow({ store, i, barWidth, color }: { store: any; i: number; barWidth: number; color: string }) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  return (
    <div
      style={{ ...s.storeTableRow, background: hov ? '#f0f4ff' : (i % 2 === 0 ? '#fff' : '#fafbfc'), cursor: 'pointer' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => navigate('/leaderboard')}
    >
```

Replace with:

```tsx
function StoreRow({ store, i, barWidth, color }: { store: any; i: number; barWidth: number; color: string }) {
  const navigate = useNavigate();
  return (
    <div
      className="dash-table-row"
      style={{ ...s.storeTableRow, background: i % 2 === 0 ? '#fff' : '#fafbfc', cursor: 'pointer' }}
      onClick={() => navigate('/leaderboard')}
    >
```

(`useState` import itself stays in the file — other components like `LiveRateCard` and `CashbackHealthCard` still use it. Only this one component's own `useState` call is removed.)

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/index.css admin/src/pages/Dashboard.tsx
git commit -m "refactor: migrate StoreRow hover to CSS instead of useState"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full build verification**

Run: `cd S:\LUCKYAPP\admin && npm run build`
Expected: `tsc && vite build` completes with no errors.

- [ ] **Step 2: Manual visual check**

Run: `cd S:\LUCKYAPP\admin && npm run dev`, open the local URL, and check both a DevAdmin login and a SuperAdmin login (if you have test accounts for both):
- **DevAdmin**: if there are any pending transaction reviews or disputes, an Attention banner now appears after Quick Actions (it previously never showed for DevAdmin at all).
- **SuperAdmin**: the dashboard sections (KPI row, 30-day chart, store performance, promotions/transactions, platform overview) fade in with a noticeable stagger instead of all appearing at once. Hovering a KPI card shows the same glow/lift effect as the DevAdmin StatCards. Hovering a row in the Store Performance table shows a smooth background color change with no jarring lift/jump.
- Confirm the Store Performance table's zebra-striping (alternating row backgrounds) still looks correct when not hovering.

Stop the dev server once confirmed (Ctrl+C). No commit needed for this verification-only task.

- [ ] **Step 3: Confirm no unrelated files were touched**

Run: `cd S:\LUCKYAPP && git diff --stat 8a00f35..HEAD`
Expected: only `admin/src/pages/Dashboard.tsx` and `admin/src/index.css` appear (plus the earlier spec doc commit already made before this plan).
