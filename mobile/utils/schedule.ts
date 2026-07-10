// Shared between (employee)/schedule.tsx and (manager)/schedule.tsx. The two
// screens intentionally render shift times at different verbosity — Employee
// has room for "6:00 am – 2:00 pm", Manager's denser layout uses "6am–2pm" —
// but both derive from the same SHIFT_HOURS so a shift-time change only has
// to happen in one place instead of two independently-maintained copies.
import { COLORS } from '../constants';

export const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const;
export type DayKey = typeof DAY_ORDER[number];

export const DAY_LABELS: Record<DayKey, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
  THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
};
export const DAY_SHORT: Record<DayKey, string> = {
  MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun',
};
export const DAY_LETTER: Record<DayKey, string> = {
  MON: 'M', TUE: 'T', WED: 'W', THU: 'T', FRI: 'F', SAT: 'S', SUN: 'S',
};

export const JS_DAY_TO_ENUM: DayKey[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export type ShiftKey = 'OPENING' | 'MIDDLE' | 'CLOSING';
export const SHIFT_ORDER: ShiftKey[] = ['OPENING', 'MIDDLE', 'CLOSING'];
export const SHIFT_LABELS: Record<ShiftKey, string> = { OPENING: 'Opening', MIDDLE: 'Middle', CLOSING: 'Closing' };
export const SHIFT_COLORS: Record<ShiftKey, string> = { OPENING: COLORS.accent, MIDDLE: COLORS.success, CLOSING: COLORS.secondary };

// Canonical shift hours (24h clock) — the single source of truth for shift times.
export const SHIFT_HOURS: Record<ShiftKey, { start: number; end: number }> = {
  OPENING: { start: 6, end: 14 },
  MIDDLE: { start: 10, end: 18 },
  CLOSING: { start: 14, end: 22 },
};

function fmtHour(h: number, compact: boolean): string {
  const period = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return compact ? `${h12}${period}` : `${h12}:00 ${period}`;
}

/** compact=false → "6:00 am – 2:00 pm" (Employee). compact=true → "6am–2pm" (Manager). */
export function formatShiftTime(shift: ShiftKey, compact = false): string {
  const { start, end } = SHIFT_HOURS[shift];
  const dash = compact ? '–' : ' – ';
  return `${fmtHour(start, compact)}${dash}${fmtHour(end, compact)}`;
}

export function getCurrentWeekDates(): { key: DayKey; date: Date }[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  return DAY_ORDER.map((key, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return { key, date: d };
  });
}

export function getTodayDayKey(): DayKey {
  return JS_DAY_TO_ENUM[new Date().getDay()];
}

export function fmtDateFull(d: string): string {
  return new Date(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function fmtDateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fmtMonthDay(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
