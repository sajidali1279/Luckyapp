# Admin Dashboard cliffindus.com-style Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the admin Dashboard page a cliffindus.com-style interaction layer — mouse-tracking glow on cards/buttons, consistent premium easing, and a staggered entrance animation — without changing colors, layout, or any other page.

**Architecture:** Add shared motion tokens + a mouse-glow helper in a new `admin/src/lib/motion.ts`. Add CSS classes (`.dash-card`, `.dash-quick-btn`, `.dash-section-link`, `.dash-fade-in`) to the existing global stylesheet `admin/src/index.css`, since inline `style` objects can't express `:hover` pseudo-classes or keyframe animations. Apply those classes to `StatCard`, `QuickActions`, and `SectionHeader` in `admin/src/pages/Dashboard.tsx`, removing their current `useState`/`onMouseEnter`/`onMouseLeave` hover-tracking boilerplate. Wrap the page's top-level sections in fade-in wrapper divs with staggered `animationDelay`.

**Tech Stack:** React 18 + TypeScript, Vite, plain CSS (no Tailwind/shadcn migration — explicitly out of scope per the design spec). No test runner exists in this project (`admin/package.json` has no test script); verification is `tsc` via `npm run build` plus manual visual check in the dev server.

**Spec:** `docs/superpowers/specs/2026-06-20-admin-dashboard-cliffindus-polish-design.md`

---

### Task 1: Shared motion tokens + mouse-glow helper

**Files:**
- Create: `admin/src/lib/motion.ts`

- [ ] **Step 1: Create the file**

```ts
// admin/src/lib/motion.ts
import type { MouseEvent } from 'react';

/** cliffindus.com's premium-feel easing curve — use for all Dashboard hover/entrance motion. */
export const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const TRANSITION_FAST = `all 0.18s ${EASE}`;
export const TRANSITION_TRANSFORM = `transform 0.18s ${EASE}, box-shadow 0.18s ${EASE}, border-color 0.18s ${EASE}`;

/**
 * Tracks cursor position relative to the hovered element and writes it to
 * --mx/--my CSS custom properties, which the .dash-card / .dash-quick-btn
 * CSS classes read to position their mouse-tracking radial-gradient glow.
 */
export function handleGlowMove(e: MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - rect.top}px`);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors mentioning `motion.ts`.

- [ ] **Step 3: Commit**

```bash
cd admin && git add src/lib/motion.ts
git commit -m "feat: add shared motion tokens and mouse-glow helper for admin dashboard polish"
```

---

### Task 2: Add CSS classes for hover, glow, and entrance animation

**Files:**
- Modify: `admin/src/index.css`

- [ ] **Step 1: Add the new rules at the end of the file**

Append to `admin/src/index.css` (after the existing `@keyframes spin` block at the end):

```css
/* ── Dashboard polish (pilot) ───────────────────────────────────────────── */

:root {
  --ease-premium: cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes dash-fade-in {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
.dash-fade-in {
  animation: dash-fade-in 0.5s var(--ease-premium) both;
}

.dash-card {
  position: relative;
  overflow: hidden;
  transition: transform 0.18s var(--ease-premium), box-shadow 0.18s var(--ease-premium), border-color 0.18s var(--ease-premium);
}
.dash-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle 120px at var(--mx, 50%) var(--my, 50%), rgba(29, 53, 87, 0.08), transparent 70%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
.dash-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.1);
  border-color: #dde3f0;
}
.dash-card:hover::before {
  opacity: 1;
}
.dash-stat-arrow {
  opacity: 0;
  transition: opacity 0.18s var(--ease-premium);
}
.dash-card:hover .dash-stat-arrow {
  opacity: 1;
}

.dash-quick-btn {
  position: relative;
  overflow: hidden;
  transition: transform 0.18s var(--ease-premium), box-shadow 0.18s var(--ease-premium),
    background-color 0.18s var(--ease-premium), color 0.18s var(--ease-premium), border-color 0.18s var(--ease-premium);
}
.dash-quick-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle 80px at var(--mx, 50%) var(--my, 50%), rgba(255, 255, 255, 0.35), transparent 70%);
  opacity: 0;
  transition: opacity 0.25s ease;
  pointer-events: none;
}
.dash-quick-btn:hover {
  background: #1D3557;
  color: #fff;
  border-color: #1D3557;
  box-shadow: 0 4px 14px rgba(29, 53, 87, 0.22);
  transform: translateY(-1px);
}
.dash-quick-btn:hover::before {
  opacity: 1;
}

.dash-section-link {
  transition: background-color 0.18s var(--ease-premium), color 0.18s var(--ease-premium), border-color 0.18s var(--ease-premium);
}
.dash-section-link:hover {
  background: #1D3557;
  color: #fff;
  border-color: #1D3557;
}
```

- [ ] **Step 2: Verify the dev server still starts cleanly**

Run: `cd admin && npm run dev`
Expected: Vite starts with no CSS parse errors in the terminal. Stop the server with Ctrl+C once confirmed.

- [ ] **Step 3: Commit**

```bash
cd admin && git add src/index.css
git commit -m "feat: add hover/glow/entrance CSS classes for admin dashboard polish"
```

---

### Task 3: Migrate `StatCard` to CSS hover + mouse glow

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx:41-64` (the `StatCard` component)
- Modify: `admin/src/pages/Dashboard.tsx:726-742` (its styles)

- [ ] **Step 1: Add the import**

At the top of `admin/src/pages/Dashboard.tsx` (after the existing `import toast from 'react-hot-toast';` line), add:

```ts
import { handleGlowMove, TRANSITION_TRANSFORM } from '../lib/motion';
```

- [ ] **Step 2: Replace the `StatCard` component**

Replace the existing `StatCard` function (currently lines 41-64):

```tsx
function StatCard({ icon, label, value, valueColor = '#111827', to }: {
  icon: string; label: string; value: any; valueColor?: string; to?: string;
}) {
  const [hov, setHov] = useState(false);
  const navigate = useNavigate();
  const bg = STAT_BG[icon] || '#f8fafc';
  return (
    <div
      style={{ ...s.statCard, ...(hov ? s.statCardHov : {}), cursor: to ? 'pointer' : 'default' }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={() => to && navigate(to)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ ...s.statIconWrap, background: bg }}>
          <span style={s.statIcon}>{icon}</span>
        </div>
        {to && <span style={{ ...s.statArrow, opacity: hov ? 1 : 0 }}>→</span>}
      </div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
    </div>
  );
}
```

with:

```tsx
function StatCard({ icon, label, value, valueColor = '#111827', to }: {
  icon: string; label: string; value: any; valueColor?: string; to?: string;
}) {
  const navigate = useNavigate();
  const bg = STAT_BG[icon] || '#f8fafc';
  return (
    <div
      className="dash-card"
      style={{ ...s.statCard, cursor: to ? 'pointer' : 'default' }}
      onMouseMove={handleGlowMove}
      onClick={() => to && navigate(to)}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ ...s.statIconWrap, background: bg }}>
          <span style={s.statIcon}>{icon}</span>
        </div>
        {to && <span className="dash-stat-arrow" style={s.statArrow}>→</span>}
      </div>
      <div style={s.statLabel}>{label}</div>
      <div style={{ ...s.statValue, color: valueColor }}>{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Update the `statCard` style and remove `statCardHov`**

Replace (currently around lines 726-736):

```tsx
  statCard: {
    background: '#fff', borderRadius: 16, padding: '18px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid #f0f1f2', transition: 'transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease',
  },
  statCardHov: {
    transform: 'translateY(-3px)',
    boxShadow: '0 8px 28px rgba(0,0,0,0.1)',
    border: '1px solid #dde3f0',
  },
```

with:

```tsx
  statCard: {
    background: '#fff', borderRadius: 16, padding: '18px 16px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.04)',
    display: 'flex', flexDirection: 'column', gap: 8,
    border: '1px solid #f0f1f2', transition: TRANSITION_TRANSFORM,
  },
```

- [ ] **Step 4: Remove the now-unused `opacity`-only `transition` from `statArrow` (the CSS class owns it now)**

Replace:

```tsx
  statArrow: { fontSize: 15, color: '#9ca3af', fontWeight: 700, transition: 'opacity 0.15s ease' },
```

with:

```tsx
  statArrow: { fontSize: 15, color: '#9ca3af', fontWeight: 700 },
```

- [ ] **Step 5: Verify it compiles**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors. (`useState` import in this file is still used by other components like `StoreRow` and `LiveRateCard`, so the import itself stays.)

- [ ] **Step 6: Commit**

```bash
cd admin && git add src/pages/Dashboard.tsx
git commit -m "refactor: migrate StatCard hover to CSS, add mouse-tracking glow"
```

---

### Task 4: Migrate `QuickActions` to CSS hover + mouse glow

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx:66-100` (the `QuickActions` component)
- Modify: `admin/src/pages/Dashboard.tsx:630-641` (its styles)

- [ ] **Step 1: Replace the `QuickActions` component**

Replace the existing function (currently lines 66-100):

```tsx
function QuickActions({ isDevAdmin }: { isDevAdmin: boolean }) {
  const navigate = useNavigate();
  const [hov, setHov] = useState<string | null>(null);
  const actions = isDevAdmin ? [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '🏪', label: 'Stores', to: '/stores' },
    { icon: '💳', label: 'Billing', to: '/billing' },
    { icon: '📈', label: 'Analytics', to: '/analytics' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ] : [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '👥', label: 'Staff', to: '/staff' },
    { icon: '🙋', label: 'Customers', to: '/customers' },
    { icon: '🏆', label: 'Leaderboard', to: '/leaderboard' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ];
  return (
    <div style={s.quickActions}>
      {actions.map(a => (
        <button
          key={a.to}
          style={{ ...s.quickBtn, ...(hov === a.to ? s.quickBtnHov : {}) }}
          onMouseEnter={() => setHov(a.to)}
          onMouseLeave={() => setHov(null)}
          onClick={() => navigate(a.to)}
        >
          <span style={{ fontSize: 15 }}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
```

with:

```tsx
function QuickActions({ isDevAdmin }: { isDevAdmin: boolean }) {
  const navigate = useNavigate();
  const actions = isDevAdmin ? [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '🏪', label: 'Stores', to: '/stores' },
    { icon: '💳', label: 'Billing', to: '/billing' },
    { icon: '📈', label: 'Analytics', to: '/analytics' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ] : [
    { icon: '📢', label: 'Offers', to: '/offers' },
    { icon: '🧾', label: 'Transactions', to: '/transactions' },
    { icon: '👥', label: 'Staff', to: '/staff' },
    { icon: '🙋', label: 'Customers', to: '/customers' },
    { icon: '🏆', label: 'Leaderboard', to: '/leaderboard' },
    { icon: '🔔', label: 'Notifications', to: '/notifications' },
  ];
  return (
    <div style={s.quickActions}>
      {actions.map(a => (
        <button
          key={a.to}
          className="dash-quick-btn"
          style={s.quickBtn}
          onMouseMove={handleGlowMove}
          onClick={() => navigate(a.to)}
        >
          <span style={{ fontSize: 15 }}>{a.icon}</span>
          <span>{a.label}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update the `quickBtn` style and remove `quickBtnHov`**

Replace (currently lines 630-641):

```tsx
  quickBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#fff', border: '1px solid #e9ecef',
    borderRadius: 10, padding: '8px 16px',
    fontSize: 15, fontWeight: 600, color: '#374151',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: 'all 0.15s ease',
  },
  quickBtnHov: {
    background: '#1D3557', color: '#fff', border: '1px solid #1D3557',
    boxShadow: '0 4px 14px rgba(29,53,87,0.22)', transform: 'translateY(-1px)',
  },
```

with:

```tsx
  quickBtn: {
    display: 'flex', alignItems: 'center', gap: 6,
    background: '#fff', border: '1px solid #e9ecef',
    borderRadius: 10, padding: '8px 16px',
    fontSize: 15, fontWeight: 600, color: '#374151',
    cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    transition: TRANSITION_FAST,
  },
```

- [ ] **Step 3: Add `TRANSITION_FAST` to the existing motion import**

Update the import added in Task 3, Step 1, from:

```ts
import { handleGlowMove, TRANSITION_TRANSFORM } from '../lib/motion';
```

to:

```ts
import { handleGlowMove, TRANSITION_FAST, TRANSITION_TRANSFORM } from '../lib/motion';
```

- [ ] **Step 4: Verify it compiles**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd admin && git add src/pages/Dashboard.tsx
git commit -m "refactor: migrate QuickActions hover to CSS, add mouse-tracking glow"
```

---

### Task 5: Migrate `SectionHeader` to CSS hover

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx:102-125` (the `SectionHeader` component)
- Modify: `admin/src/pages/Dashboard.tsx:651-657` (its styles)

- [ ] **Step 1: Replace the `SectionHeader` component**

Replace the existing function (currently lines 102-125):

```tsx
function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: { label: string; to: string };
}) {
  const navigate = useNavigate();
  const [hov, setHov] = useState(false);
  return (
    <div style={s.sectionHeader}>
      <div>
        <h2 style={s.section}>{title}</h2>
        {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
      </div>
      {action && (
        <button
          style={{ ...s.sectionLink, ...(hov ? s.sectionLinkHov : {}) }}
          onMouseEnter={() => setHov(true)}
          onMouseLeave={() => setHov(false)}
          onClick={() => navigate(action.to)}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}
```

with:

```tsx
function SectionHeader({ title, subtitle, action }: {
  title: string; subtitle?: string; action?: { label: string; to: string };
}) {
  const navigate = useNavigate();
  return (
    <div style={s.sectionHeader}>
      <div>
        <h2 style={s.section}>{title}</h2>
        {subtitle && <p style={s.sectionSub}>{subtitle}</p>}
      </div>
      {action && (
        <button
          className="dash-section-link"
          style={s.sectionLink}
          onClick={() => navigate(action.to)}
        >
          {action.label} →
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Update the `sectionLink` style and remove `sectionLinkHov`**

Replace (currently lines 651-657):

```tsx
  sectionLink: {
    background: 'none', border: '1px solid #dee2e6', borderRadius: 8,
    padding: '5px 12px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    color: '#6c757d', transition: 'all 0.15s ease', whiteSpace: 'nowrap' as const,
    alignSelf: 'flex-start', marginTop: 2,
  },
  sectionLinkHov: { background: '#1D3557', color: '#fff', border: '1px solid #1D3557' },
```

with:

```tsx
  sectionLink: {
    background: 'none', border: '1px solid #dee2e6', borderRadius: 8,
    padding: '5px 12px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
    color: '#6c757d', transition: TRANSITION_FAST, whiteSpace: 'nowrap' as const,
    alignSelf: 'flex-start', marginTop: 2,
  },
```

Note: `ActiveOffersPanel` and `RecentTransactions` also reference `s.sectionLink` directly on their own buttons ("Manage Offers →", "Manage Banners →", "View all →"). Per the design spec, only `StatCard`, `QuickActions`, and `SectionHeader` are in scope — leave those other buttons exactly as they are (plain, no hover class, no behavior change). They keep using the bare `sectionLink` style object, which still works standalone since its non-hover properties are unchanged.

- [ ] **Step 3: Verify it compiles**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd admin && git add src/pages/Dashboard.tsx
git commit -m "refactor: migrate SectionHeader action-link hover to CSS"
```

---

### Task 6: Staggered entrance animation for top-level sections

**Files:**
- Modify: `admin/src/pages/Dashboard.tsx:390-600` (the main `return` block)

- [ ] **Step 1: Wrap the Welcome card**

Replace:

```tsx
      {/* ── Welcome ── */}
      <div style={s.welcomeCard}>
```

with:

```tsx
      {/* ── Welcome ── */}
      <div className="dash-fade-in" style={{ ...s.welcomeCard, animationDelay: '0ms' }}>
```

(Note: `s.welcomeCard` is a `React.CSSProperties` object: spreading it with `animationDelay` added inline is valid since `animationDelay` is a standard CSS property name in React's style typing.)

- [ ] **Step 2: Wrap the Quick Actions block**

Replace:

```tsx
      {/* ── Quick Actions ── */}
      {isSuperAdmin && <QuickActions isDevAdmin={isDevAdmin} />}
```

with:

```tsx
      {/* ── Quick Actions ── */}
      {isSuperAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '60ms' }}>
          <QuickActions isDevAdmin={isDevAdmin} />
        </div>
      )}
```

- [ ] **Step 3: Wrap the Revenue section (DevAdmin only)**

Replace:

```tsx
      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <>
          <SectionHeader title="Revenue Overview" action={{ label: 'View Billing', to: '/billing' }} />
```

with:

```tsx
      {/* ── Revenue (DevAdmin only) ── */}
      {isDevAdmin && revenue && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          <SectionHeader title="Revenue Overview" action={{ label: 'View Billing', to: '/billing' }} />
```

and its closing tag — replace:

```tsx
          </div>
        </>
      )}

      {/* ── SuperAdmin sections ── */}
```

with:

```tsx
          </div>
        </div>
      )}

      {/* ── SuperAdmin sections ── */}
```

- [ ] **Step 4: Wrap the SuperAdmin section block**

Replace:

```tsx
      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <>
          {/* Attention banner */}
```

with:

```tsx
      {/* ── SuperAdmin sections ── */}
      {isSuperAdmin && !isDevAdmin && (
        <div className="dash-fade-in" style={{ animationDelay: '120ms' }}>
          {/* Attention banner */}
```

and its closing tag — replace:

```tsx
          </div>
        </>
      )}

      {/* ── Analytics Charts (DevAdmin only) ── */}
```

with:

```tsx
          </div>
        </div>
      )}

      {/* ── Analytics Charts (DevAdmin only) ── */}
```

- [ ] **Step 5: Wrap the Analytics Charts block (DevAdmin only)**

Replace:

```tsx
      {/* ── Analytics Charts (DevAdmin only) ── */}
      {isDevAdmin && analytics && (
        <>
          <SectionHeader title="Last 30 Days — Activity" action={{ label: 'Full Analytics', to: '/analytics' }} />
```

with:

```tsx
      {/* ── Analytics Charts (DevAdmin only) ── */}
      {isDevAdmin && analytics && (
        <div className="dash-fade-in" style={{ animationDelay: '180ms' }}>
          <SectionHeader title="Last 30 Days — Activity" action={{ label: 'Full Analytics', to: '/analytics' }} />
```

and its closing tag — replace:

```tsx
          )}
        </>
      )}

      {/* ── Live Cashback Rates (DevAdmin only) ── */}
```

with:

```tsx
          )}
        </div>
      )}

      {/* ── Live Cashback Rates (DevAdmin only) ── */}
```

- [ ] **Step 6: Wrap the Live Cashback Rates block (DevAdmin only)**

Replace:

```tsx
      {/* ── Live Cashback Rates (DevAdmin only) ── */}
      {isDevAdmin && liveRates.length > 0 && (
        <>
          <SectionHeader
```

with:

```tsx
      {/* ── Live Cashback Rates (DevAdmin only) ── */}
      {isDevAdmin && liveRates.length > 0 && (
        <div className="dash-fade-in" style={{ animationDelay: '240ms' }}>
          <SectionHeader
```

and its closing tag — replace the final:

```tsx
          </div>
        </>
      )}
    </div>
  );
}
```

with:

```tsx
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Verify it compiles**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors. (JSX fragment `<>...</>` replaced 1:1 with `<div>...</div>` — no adjacent-sibling issues since each fragment only ever wrapped a single conditional block's contents.)

- [ ] **Step 8: Manual visual check**

Run: `cd admin && npm run dev`, open the printed local URL, log in, and observe the Dashboard page load:
- Sections should fade+slide in with a slight stagger (Welcome card first, Quick Actions ~60ms after, the rest following).
- Hovering a stat card should lift it and show a soft glow that follows the cursor.
- Hovering a Quick Action button should darken it (navy background) with a lighter glow following the cursor.
- Hovering a "View Billing →" / "Full Analytics →" style section-header link should turn it navy with white text — same as before, just driven by CSS now.
- Confirm "Manage Offers →" / "Manage Banners →" / "View all →" buttons (in Active Promotions / Recent Transactions panels) look and behave exactly as before — no hover added there, per scope.

Stop the dev server once confirmed (Ctrl+C).

- [ ] **Step 9: Commit**

```bash
cd admin && git add src/pages/Dashboard.tsx
git commit -m "feat: add staggered entrance animation to dashboard sections"
```

---

### Task 7: Final build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full production build**

Run: `cd admin && npm run build`
Expected: `tsc && vite build` completes with no errors, producing a `dist/` output.

- [ ] **Step 2: Spot-check the other admin pages are unaffected**

Run: `cd admin && npm run dev`, open the local URL, and click through to Customers, Billing, and Staff pages.
Expected: no visual change on these pages — the new CSS classes (`dash-*`) are not referenced anywhere outside `Dashboard.tsx`, and `:root { --ease-premium: ... }` is a harmless unused variable on other pages.

Stop the dev server once confirmed (Ctrl+C). No commit needed for this verification-only task.
