// Happy hours for a promotion: days of the week and a time window (store time, Central). A promotion with hours is shown all day with them,
// and its extra cashback is paid ONLY on sales inside them. One without hours pays all day, as before.
//
// days: 0 = Sunday .. 6 = Saturday; empty means every day. from / to: "HH:MM" (24 h). A window that ends at or before it starts runs past
// midnight ("22:00" to "02:00"): the part after midnight belongs to the day it started on.

import { storeMinutes, storeWeekday } from './storeTime';

export interface OfferHours {
  happyDays?: number[] | null;
  happyFrom?: string | null;
  happyTo?: string | null;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** From 00:00 to 00:00: the whole of each chosen day ("Tuesdays, all day"). */
export const ALL_DAY = '00:00';
const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** True when the promotion has a happy-hour window at all. */
export function hasHours(o: OfferHours): boolean {
  return !!o.happyFrom && !!o.happyTo;
}

/** Whether the promotion pays on a sale made at this instant (always true for one without hours). */
export function offerPaysAt(o: OfferHours, at: Date = new Date()): boolean {
  if (!hasHours(o)) return true;
  const from = toMinutes(o.happyFrom!), to = toMinutes(o.happyTo!);
  const days = o.happyDays && o.happyDays.length > 0 ? o.happyDays : null;
  const dayOk = (d: number) => !days || days.includes(d);
  const mins = storeMinutes(at);
  const today = storeWeekday(at);
  if (from < to) return mins >= from && mins < to && dayOk(today);
  // Past midnight: from today's start to midnight, or from midnight to the end, counted to yesterday's day
  if (mins >= from) return dayOk(today);
  if (mins < to) return dayOk((today + 6) % 7);
  return false;
}

/**
 * The hours in a request body, checked: both times or neither, real "HH:MM" times, not the same time, days 0..6. Returns the cleaned
 * values (days sorted, no repeats) or the sentence that refuses them. Missing everything means "no hours" (pays all day).
 */
export function checkHours(input: { happyDays?: unknown; happyFrom?: unknown; happyTo?: unknown }):
  { ok: true; hours: { happyDays: number[]; happyFrom: string | null; happyTo: string | null } } | { ok: false; message: string } {
  const blank = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
  const from = blank(input.happyFrom) ? null : String(input.happyFrom).trim();
  const to = blank(input.happyTo) ? null : String(input.happyTo).trim();
  let days: unknown = input.happyDays;
  if (typeof days === 'string') { try { days = days.trim() ? JSON.parse(days) : []; } catch { return { ok: false, message: 'Pick the days for the happy hour.' }; } }
  if (days == null) days = [];
  if (!Array.isArray(days) || days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return { ok: false, message: 'Pick the days for the happy hour.' };
  const cleanDays = [...new Set(days as number[])].sort((a, b) => a - b);
  if (!from && !to) {
    if (cleanDays.length > 0) return { ok: false, message: 'Give the happy hour a start and an end time, or no days.' };
    return { ok: true, hours: { happyDays: [], happyFrom: null, happyTo: null } };
  }
  if (!from || !to) return { ok: false, message: 'Give the happy hour both a start and an end time.' };
  if (!HHMM.test(from) || !HHMM.test(to)) return { ok: false, message: 'Write the happy-hour times like 15:00 and 18:00.' };
  // 00:00 to 00:00 is "all day on these days" (Taco Tuesday); any other same start and end is a mistake
  if (from === to && from === ALL_DAY) {
    if (cleanDays.length === 0 || cleanDays.length === 7) return { ok: true, hours: { happyDays: [], happyFrom: null, happyTo: null } };   // every day, all day: no hours
    return { ok: true, hours: { happyDays: cleanDays, happyFrom: ALL_DAY, happyTo: ALL_DAY } };
  }
  if (from === to) return { ok: false, message: 'The happy hour starts and ends at the same time. Leave both empty for all day.' };
  return { ok: true, hours: { happyDays: cleanDays.length === 7 ? [] : cleanDays, happyFrom: from, happyTo: to } };
}

const twelve = (t: string) => {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}`;
};

/** "Mon-Fri, 3 PM to 6 PM" / "Every day, 10 PM to 2 AM" (English, for HQ, the Activity Log and pushes), or null without hours. */
export function hoursText(o: OfferHours): string | null {
  if (!hasHours(o)) return null;
  const days = o.happyDays && o.happyDays.length > 0 && o.happyDays.length < 7 ? [...o.happyDays].sort((a, b) => a - b) : null;
  let dayText = 'Every day';
  if (days) {
    const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    dayText = run && days.length >= 3 ? `${DAY_SHORT[days[0]]}-${DAY_SHORT[days[days.length - 1]]}` : days.map((d) => DAY_SHORT[d]).join(', ');
  }
  if (o.happyFrom === ALL_DAY && o.happyTo === ALL_DAY) return `${dayText}, all day`;
  return `${dayText}, ${twelve(o.happyFrom!)} to ${twelve(o.happyTo!)}`;
}
