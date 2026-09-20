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
  return timeFormat.format(new Date(at)).replace(/[\u202f\u00a0]/g, ' ');
}

/** 'Sep 19' for the instant, on the store calendar. */
export function storeDay(at: Date | string): string {
  return dayLabel(storeToday(new Date(at)));
}
