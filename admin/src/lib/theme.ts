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
