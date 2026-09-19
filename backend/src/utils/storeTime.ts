// One definition of "the store's day" for every sales, limit and benefit boundary.
//
// All stores are in Texas (Central time). Render runs the server in UTC, so a plain
// `new Date().setHours(0, 0, 0, 0)` cuts the day at 7 pm Central (6 pm in winter):
// evening sales landed on "tomorrow", and per-day limits (fraud counters, the daily
// free refill) reset while the stores were still open. Use these helpers instead.
// Daylight saving is handled by asking Intl for the real offset at each instant.

export const STORE_TIMEZONE = 'America/Chicago';

const FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: STORE_TIMEZONE, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

interface Parts { y: number; m: number; d: number; h: number; mi: number; s: number }

function partsAt(instant: Date): Parts {
  const p: Record<string, number> = {};
  for (const { type, value } of FMT.formatToParts(instant)) {
    if (type !== 'literal') p[type] = parseInt(value, 10);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second };
}

// Milliseconds to ADD to a UTC instant to get the store-local wall clock (negative for Central).
function offsetMsAt(instant: Date): number {
  const p = partsAt(instant);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(instant.getTime() / 1000) * 1000;
}

// The UTC instant at which store-local midnight of y-m-d begins.
function localMidnightUtc(y: number, m: number, d: number): Date {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let utc = guess - offsetMsAt(new Date(guess));
  // The offset can differ between the guess and the real instant near a DST change; settle it once.
  const off2 = offsetMsAt(new Date(utc));
  const settled = guess - off2;
  if (settled !== utc) utc = settled;
  return new Date(utc);
}

/** 'YYYY-MM-DD' of the given instant on the store's calendar. */
export function storeDateKey(at: Date = new Date()): string {
  const p = partsAt(at);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** The store-calendar date `days` after (or before, if negative) the given 'YYYY-MM-DD'. */
export function addStoreDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days, 12)); // noon anchor: immune to DST edges
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** First instant of the store day containing `at`. */
export function storeDayStart(at: Date = new Date()): Date {
  const p = partsAt(at);
  return localMidnightUtc(p.y, p.m, p.d);
}

/** Last millisecond of the store day containing `at`. */
export function storeDayEnd(at: Date = new Date()): Date {
  const next = addStoreDays(storeDateKey(at), 1);
  return new Date(startOfStoreDate(next).getTime() - 1);
}

/** First instant of the store month containing `at`. */
export function storeMonthStart(at: Date = new Date()): Date {
  const p = partsAt(at);
  return localMidnightUtc(p.y, p.m, 1);
}

/** First instant of the store month before the one containing `at`. */
export function storePrevMonthStart(at: Date = new Date()): Date {
  const p = partsAt(at);
  return p.m === 1 ? localMidnightUtc(p.y - 1, 12, 1) : localMidnightUtc(p.y, p.m - 1, 1);
}

/** Store-local hour of day (0-23) of the instant. */
export function storeHour(at: Date): number {
  return partsAt(at).h;
}

/** Store-local day of the month (1-31) of the instant. */
export function storeDayOfMonth(at: Date): number {
  return partsAt(at).d;
}

/** Whole store days from date `a` to date `b` ('YYYY-MM-DD'), so b minus a. */
export function storeDaysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Start of a 'YYYY-MM-DD' store date. An unparseable value gives an Invalid Date, as `new Date('bad')` did. */
export function startOfStoreDate(dateKey: string): Date {
  if (!DATE_RE.test(dateKey)) return new Date(NaN);
  const [y, m, d] = dateKey.split('-').map(Number);
  return localMidnightUtc(y, m, d);
}

/** End (last millisecond) of a 'YYYY-MM-DD' store date. */
export function endOfStoreDate(dateKey: string): Date {
  if (!DATE_RE.test(dateKey)) return new Date(NaN);
  return new Date(startOfStoreDate(addStoreDays(dateKey, 1)).getTime() - 1);
}
