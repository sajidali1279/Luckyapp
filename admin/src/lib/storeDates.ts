// The store calendar. Every store is in Texas, so "today" and "the last 30 days" mean Central time no matter where
// the admin is opened, and the server counts days the same way. Dates travel as 'YYYY-MM-DD'.

const TZ = 'America/Chicago';
const dayFormat = new Intl.DateTimeFormat('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The date of the instant on the store calendar. */
export function storeToday(at: Date = new Date()): string {
  const p = Object.fromEntries(dayFormat.formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** The date `days` after (or before, if negative) the given date. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days, 12)).toISOString().slice(0, 10);
}

/** The last `n` calendar days ending today, both ends included, so 7 means exactly seven days. */
export function lastNDays(n: number, at: Date = new Date()) {
  const to = storeToday(at);
  return { from: addDays(to, -(n - 1)), to };
}

/** True for a real calendar date ('2026-02-31' is not one). */
export function isRealDate(key: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** Whole days from date a to date b. */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** 'Aug 21' */
export function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });

/** '9:30 PM' on the store clock, wherever the admin is opened. Newer browsers put a narrow no-break space before PM; a plain space is used. */
export function storeTime(at: Date | string): string {
  const d = new Date(at);
  return isNaN(d.getTime()) ? '' : timeFormat.format(d).replace(/[\u202f\u00a0]/g, ' ');
}

/** 'Sep 19' for the instant, on the store calendar. */
export function storeDay(at: Date | string): string {
  const d = new Date(at);
  return isNaN(d.getTime()) ? '' : dayLabel(storeToday(d)); // a missing date reads as blank, it must never take the page down
}

// ── Promotion dates ────────────────────────────────────────────────────────────
// A promotion runs from the start of a store day to the end of one. These turn a 'YYYY-MM-DD' pick into the real instant
// on the Central clock (same method as backend/src/utils/storeTime.ts, so both sides agree, daylight saving included),
// wherever the admin is opened. A date picked as Sep 21 used to be sent as UTC midnight: 7 pm on Sep 20 in Texas.

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// Milliseconds to ADD to a UTC instant to get the store wall clock (negative for Central).
function offsetMsAt(instant: Date): number {
  const p: Record<string, number> = {};
  for (const { type, value } of partsFormat.formatToParts(instant)) if (type !== 'literal') p[type] = parseInt(value, 10);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant.getTime() / 1000) * 1000;
}

/** First instant of the store day 'YYYY-MM-DD'. */
export function startOfStoreDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  let utc = guess - offsetMsAt(new Date(guess));
  const settled = guess - offsetMsAt(new Date(utc)); // the offset can differ near a daylight-saving change; settle it once
  if (settled !== utc) utc = settled;
  return new Date(utc);
}

/** Last millisecond of the store day 'YYYY-MM-DD'. */
export function endOfStoreDay(key: string): Date {
  return new Date(startOfStoreDay(addDays(key, 1)).getTime() - 1);
}

const longDayFormat = new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric' });

/** 'Sep 21, 2026' for the instant, on the store calendar. */
export function storeDayLong(at: Date | string): string {
  const d = new Date(at);
  return isNaN(d.getTime()) ? '' : longDayFormat.format(d);
}

/** 'Sep 21, 12:00 AM' for the instant on the store clock (a plain space before AM or PM). */
export function storeDayTime(at: Date | string): string {
  const day = storeDay(at);
  return day ? `${day}, ${storeTime(at)}` : '';
}

/** The date one calendar month after the given date, minus a day: a "1 month" promotion that starts on the 20th ends on the 19th. */
export function monthEnd(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1, 12)); // first of the month after
  const last = new Date(Date.UTC(y, m + 1, 0, 12)).getUTCDate(); // days in that month
  const target = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth(), Math.min(d, last), 12));
  return addDays(target.toISOString().slice(0, 10), -1);
}
