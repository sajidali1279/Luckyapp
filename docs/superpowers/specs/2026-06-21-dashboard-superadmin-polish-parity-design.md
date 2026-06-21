# Dashboard: SuperAdmin/DevAdmin Polish Parity

## Problem

A code audit of the SuperAdmin section of `admin/src/pages/Dashboard.tsx` found it had fallen behind the polish pass applied to the DevAdmin sections earlier this session (the `.dash-card` mouse-tracking glow/hover-lift, `handleGlowMove`/`TRANSITION_FAST`/`TRANSITION_TRANSFORM` from `admin/src/lib/motion.ts`, and individually-staggered `.dash-fade-in` entrance animations):

1. **`KPICard`** (SuperAdmin's "Today's Activity" section) has no hover/glow polish at all — a static card with just a colored top border, unlike `StatCard` which already got the full treatment.
2. **The entire SuperAdmin block** (lines ~526-614) is one single `dash-fade-in` wrapper with one `animationDelay` (120ms) covering 6 distinct sub-sections — they all pop in simultaneously instead of cascading like DevAdmin's sections do.
3. **`StoreRow`** (the Store Performance table) still uses the pre-polish `useState` + manual inline-style-swap hover pattern instead of CSS.
4. **`AttentionBanner`** (pending transactions + disputes) only renders inside the `isSuperAdmin && !isDevAdmin` block — DevAdmin never sees it on their own dashboard, despite already having the underlying `platform.pending` data fetched (`enabled: isSuperAdmin`, which is true for DevAdmin too).

## Changes

### 1. `KPICard` → add glow/hover polish

Add `className="dash-card"` and `onMouseMove={handleGlowMove}` to `KPICard`'s root `<div>`, matching `StatCard`'s existing pattern. The KPI row is already laid out as a card grid (`s.kpiGrid`), so the lift+glow treatment fits directly with no layout changes needed. Keep the existing colored top-border accent (`borderTop: 3px solid ${color}`) — that's a distinct, useful visual signal, not part of what needs fixing.

### 2. `AttentionBanner` → shared, role-agnostic placement

Currently `AttentionBanner` is rendered only inside `isSuperAdmin && !isDevAdmin`. Move it to a new top-level block gated simply on `isSuperAdmin` (true for both DevAdmin and SuperAdmin), positioned right after the Quick Actions block and before Revenue Overview/SuperAdmin sections, with its own `dash-fade-in` delay of `90ms` (between Quick Actions' 60ms and Revenue Overview's 120ms — no renumbering of existing delays needed).

This requires widening the disputes-count query's `enabled` condition in the same file, from:
```ts
enabled: isSuperAdmin && !isDevAdmin,
```
to:
```ts
enabled: isSuperAdmin,
```
(query key `sa-disputes-pending`, used to compute `pendingDisputesCount`). Without this, `AttentionBanner` would render for DevAdmin but always show a 0 dispute count regardless of reality. The other SuperAdmin-only-gated query (`sa-trend-30d`, used for the "30-Day Purchase Volume" chart) is unrelated and stays as-is — DevAdmin has its own separate analytics chart already.

### 3. Split the remaining SuperAdmin block into individually staggered sections

With `AttentionBanner` extracted (per #2), the remaining SuperAdmin-only content is 5 sections: KPI row, 30-day trend chart, store performance table, promotions+recent-transactions two-column row, platform overview stats grid. Each gets its own `dash-fade-in` wrapper with delays `120ms / 150ms / 180ms / 210ms / 240ms` respectively — mirroring the same cadence already used in DevAdmin's section sequence. Since the SuperAdmin block (`isSuperAdmin && !isDevAdmin`) and DevAdmin's blocks (`isDevAdmin`) are mutually exclusive per user, reusing the same delay values across both is safe — they never render for the same person at the same time.

### 4. `StoreRow` → CSS-based hover, no lift

`StoreRow` is a full-width table row, not a card — applying `.dash-card`'s `translateY(-3px)` lift would visually break table row alignment with its neighbors. Instead:
- Remove the `useState`/`onMouseEnter`/`onMouseLeave` hover tracking.
- Add a new CSS class `.dash-table-row` (in `admin/src/index.css`, alongside the existing `.dash-*` classes) with only a `background-color` transition on `:hover` (no `transform`, no glow `::before` layer), using the same `var(--ease-premium)` timing token for consistency.
- The existing zebra-striping (`background: i % 2 === 0 ? '#fff' : '#fafbfc'`) stays as an inline style for the base (non-hover) state; the CSS `:hover` rule overrides it with the existing hover color (`#f0f4ff`).

## Out of scope

- No changes to `LiveRateCard` or any other Dashboard sub-component not named above — this audit and fix is scoped to the 4 specific issues found.
- No changes to the actual data/queries powering these sections beyond the one `enabled` condition widening in #2.
- No changes to DevAdmin's existing Revenue Overview, Cashback Health, Analytics Charts, or Live Cashback Rates sections — they're already polished and untouched by this work.
