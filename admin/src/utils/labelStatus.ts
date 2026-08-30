// Shared print-status vocabulary for the Labels admin pages (By Store,
// Coverage, and the Print Tray). Mirrors the backend's printStatus() in
// labels.controller.ts — keep the four states in sync with that function.
export type LabelPrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'printed';

export const STATUS_LABEL: Record<LabelPrintStatus, string> = {
  not_added: 'Not Added',
  new: 'New',
  needs_reprint: 'Needs Reprint',
  printed: '✓ Printed',
};

// Colors are intentionally distinct from each other at a glance: gray (inert),
// blue (informational, no action needed yet), amber (the one that actually
// wants attention — a printed sticker on a shelf is now wrong), green (done).
export const STATUS_COLOR: Record<LabelPrintStatus, string> = {
  not_added: '#8892a0',
  new: '#2563eb',
  needs_reprint: '#b7791f',
  printed: '#0f5132',
};

export const STATUS_BG: Record<LabelPrintStatus, string> = {
  not_added: '#f4f4f7',
  new: '#eff6ff',
  needs_reprint: '#fffbeb',
  printed: '#f0fdf4',
};

// Days since a timestamp, floored — used to show "New · 3d" style staleness
// so an item sitting untouched doesn't just silently blend in.
export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function formatAge(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}
