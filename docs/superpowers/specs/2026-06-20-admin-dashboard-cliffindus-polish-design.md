# Admin Dashboard: cliffindus.com-style Polish (Pilot)

## Problem

The user wants the admin panel to feel as interactive/polished as the company's marketing site, `cliffindus.com` (a dark, minimal site using hover lifts, mouse-tracking radial gradients on cards, smooth cubic-bezier transitions, and subtle entrance motion).

The admin panel (`admin/src/pages/*.tsx`, 20+ pages, 500–1600 lines each) is light-themed (navy `#1D3557` / red `#E63946` branding) and uses inline `style={{...}}` objects per page rather than the Tailwind/shadcn design system that's already installed in the repo (`admin/src/index.css`, `admin/src/components/ui/`) but largely unused outside the Login page.

Decision: keep the light theme for the internal data-heavy pages (full dark theme like the public site would hurt readability for all-day admin use) — borrow the *interaction* language (motion, hover, glow), not the color scheme. Given the size of the admin app, this spec scopes to **one pilot page, Dashboard**, to establish the pattern before any rollout to other pages (a separate, later effort).

## Current state

`Dashboard.tsx` already has partial polish: `StatCard`, `QuickActions`, and `SectionHeader` each track hover via React `useState` + `onMouseEnter`/`onMouseLeave`, swapping inline style objects (e.g. `statCard` → `statCardHov` adds `transform: translateY(-3px)`). Transition timing is inconsistent across components — some use `'all 0.15s ease'`, others `'transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease'`. There's no mouse-tracking effect and no entrance animation; sections render fully formed the instant data loads.

## Changes

### 1. Shared motion tokens

New constants in `admin/src/lib/motion.ts`:
```ts
export const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
export const TRANSITION_FAST = `all 0.18s ${EASE}`;
export const TRANSITION_TRANSFORM = `transform 0.18s ${EASE}, box-shadow 0.18s ${EASE}, border-color 0.18s ${EASE}`;
```
Replaces the ad-hoc `'ease'` / `'all 0.15s ease'` strings in `Dashboard.tsx`'s `statCard`, `quickBtn`, and `sectionLink` styles. Scoped to Dashboard for this pilot; other pages adopt these tokens when they're redesigned later.

### 2. Mouse-tracking glow (StatCard, QuickActions buttons)

Mirrors cliffindus.com's `.work-card` effect: track cursor position relative to the element via `onMouseMove`, write it to CSS custom properties (`--mx`, `--my`) on the element, and use a `radial-gradient(circle at var(--mx) var(--my), ...)` background layer that's invisible until hover (`opacity: 0` → `1`). Applied to `StatCard` and the `QuickActions` buttons — the two interactive card-like surfaces on this page.

### 3. CSS hover classes replace `useState` hover boilerplate

`StatCard`, `QuickActions`, `SectionHeader` currently re-render on every mouse enter/leave just to swap a style object. Move the hover-triggered visual changes (lift, shadow, border, glow opacity) into CSS classes added to `admin/src/index.css` (e.g. `.dash-card`, `.dash-card:hover`), applied via `className` alongside the existing inline `style` for layout/color. This removes the `useState`/`onMouseEnter`/`onMouseLeave` wiring from these three components and is what makes the mouse-tracking glow practical (real `:hover` + CSS var reads, GPU-composited).

Other Dashboard elements that don't currently have hover state (e.g. plain navigation rows) are left as-is — only the three components above are touched.

### 4. Staggered entrance animation

On initial mount (not on refetch/re-render), the stat grid, quick actions row, recent activity list, and chart sections fade+slide in with a small stagger (~40ms offset between sections) using a CSS `@keyframes` animation + `animation-delay`. Implemented via a wrapper `<div className="dash-fade-in" style={{ animationDelay: '...' }}>` around each top-level section — no new JS animation library, no layout shift (animates `opacity`/`transform` only).

## Out of scope

- No changes to any other admin page — this is a Dashboard-only pilot.
- No color palette or layout/grid changes.
- No chart (Recharts) behavior changes.
- No migration to Tailwind/shadcn — inline styles remain the pattern, just with shared motion tokens and a few CSS classes for hover/animation that inline styles can't express.
- Rollout to other pages is a separate future effort, informed by what this pilot validates.
