// Mirrors admin's src/utils/labelStatus.ts — keep the four states in sync
// with the backend's printStatus() in labels.controller.ts.
export type LabelPrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'printed';

export const STATUS_LABEL: Record<LabelPrintStatus, string> = {
  not_added: 'Not Added',
  new: 'New',
  needs_reprint: 'Needs Reprint',
  printed: 'Printed',
};

export const STATUS_COLOR: Record<LabelPrintStatus, string> = {
  not_added: '#8892A0',
  new: '#2563EB',
  needs_reprint: '#B7791F',
  printed: '#0F5132',
};

export const STATUS_BG: Record<LabelPrintStatus, string> = {
  not_added: '#F4F4F7',
  new: '#EFF6FF',
  needs_reprint: '#FFFBEB',
  printed: '#F0FDF4',
};

export function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
}

export function formatAge(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
}

export function formatEndsOn(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
