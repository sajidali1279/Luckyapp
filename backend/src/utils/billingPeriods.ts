import { storeDateKey, addStoreDays, startOfStoreDate, endOfStoreDate } from './storeTime';

// Billing months are STORE months: every store is in Texas, so a month runs from midnight on the 1st to 11:59 pm on the
// last day in Central time, wherever the server runs. (The server used to cut months at UTC midnight, which moved a
// 9 pm Central sale on the last day into the NEXT month's bill.) A period is written 'YYYY-MM'.

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** True for a real 'YYYY-MM' month (2020 to 2100). */
export function isRealPeriod(p: unknown): p is string {
  if (typeof p !== 'string') return false;
  const m = PERIOD_RE.exec(p);
  if (!m) return false;
  const year = Number(m[1]);
  return year >= 2020 && year <= 2100;
}

export function nextPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

export function previousPeriod(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

/** 'September 2026' */
export function periodLabel(p: string): string {
  const [y, m] = p.split('-').map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** '2026-09-01' */
export function periodFirstDay(p: string): string {
  return `${p}-01`;
}

/** '2026-09-30' */
export function periodLastDay(p: string): string {
  return addStoreDays(`${nextPeriod(p)}-01`, -1);
}

/** The first and last instants of the month on the store calendar. */
export function periodBounds(p: string): { start: Date; end: Date } {
  return { start: startOfStoreDate(periodFirstDay(p)), end: endOfStoreDate(periodLastDay(p)) };
}

/** The store-calendar month of an instant. */
export function storePeriodOf(date: Date): string {
  return storeDateKey(date).slice(0, 7);
}

export function currentStorePeriod(now: Date = new Date()): string {
  return storePeriodOf(now);
}

/** The most recent month that has ended on the store calendar. */
export function lastFinishedPeriod(now: Date = new Date()): string {
  return previousPeriod(currentStorePeriod(now));
}

/** True once the month is over on the store calendar (a bill for a month still running would freeze part-month numbers). */
export function isFinishedPeriod(p: string, now: Date = new Date()): boolean {
  return p < currentStorePeriod(now);
}

/** Every month from the month a store was created up to and including `upTo`, oldest first. */
export function periodsSince(createdAt: Date, upTo: string): string[] {
  const out: string[] = [];
  let cur = storePeriodOf(createdAt);
  while (cur <= upTo) {
    out.push(cur);
    cur = nextPeriod(cur);
  }
  return out;
}
