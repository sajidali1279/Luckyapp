import type { CSSProperties } from 'react';

// Shared style constants for the admin app's hand-rolled inline-style pages.
// #9ca3af (~2.5:1 on white) and #6b7280 (~4.8:1 in isolation, but used on
// off-white surfaces and at small sizes where it falls below WCAG AA's 4.5:1)
// were the previous ad hoc "muted text" colors. Use this constant in new code
// instead of reintroducing either.
export const TEXT_MUTED = '#5a6472';

// The admin app's dominant brand color (headings, primary buttons, active
// nav state, accents) — was hardcoded as the literal '#1D3557' in ~375
// places across 39 files before this constant existed, meaning any future
// rebrand or shade tweak meant a 39-file find-and-replace instead of one
// line here. Matches mobile's COLORS.secondary ("Deep navy") — same color,
// same name convention, kept consistent across both apps.
export const PRIMARY = '#1D3557';

// The calm, professional look (chosen 2026-09-29). The same values live as CSS variables in index.css.
// Rules: navy for the main action, red only for the brand mark and for delete, a status colour only
// when it says something (live, waiting, failed), gray for everything else.
export const C = {
  page: '#f6f7f9',
  surface: '#ffffff',
  subtle: '#f9fafb',
  hover: '#f1f3f6',
  border: '#e4e7ec',
  borderStrong: '#d5dae1',
  text: '#111827',
  text2: '#374151',
  muted: TEXT_MUTED,
  primary: PRIMARY,
  primaryHover: '#152844',
  primaryTint: '#eef2f7',
  brand: '#D62839',
  danger: '#c42130',
  dangerTint: '#fdf2f2',
  success: '#17663a',
  successTint: '#edf7f0',
  warning: '#8a5300',
  warningTint: '#fdf6e8',
} as const;

export const RADIUS = { sm: 6, md: 8, lg: 12 } as const;

export const SHADOW = {
  card: '0 1px 2px rgba(16, 24, 40, 0.05)',
  raised: '0 4px 12px rgba(16, 24, 40, 0.08)',
  pop: '0 12px 32px rgba(16, 24, 40, 0.16)',
} as const;

// One type scale: page title, section title, body, small, caption
export const FONT = { page: 22, section: 15, body: 14, small: 13, caption: 12 } as const;

// Inputs, selects and text areas across the pages
export const INPUT: CSSProperties = {
  padding: '8px 12px', borderRadius: RADIUS.md, border: `1px solid ${C.borderStrong}`, background: C.surface,
  fontSize: FONT.body, color: C.text, width: '100%', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit',
};
