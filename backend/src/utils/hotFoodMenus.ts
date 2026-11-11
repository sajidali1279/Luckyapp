// Hot food menus by time of day, and ordering ahead (2026-11-10).
//
// HQ makes menus like "Breakfast" 05:00 to 10:30 (store time, every day or some days) and puts catalog items in them
// (HotFoodCatalogItem.daypartIds). HQ can give one store its own times for a menu, or leave the menu out at a store. An item in no
// menu is served whenever hot food is open ("all day"), as before. An item in menus:
//   - ordered for now: only inside one of its menus, and not in the last minutes before it ends (lastCallMinutes, so the kitchen is
//     not caught out at 10:29);
//   - ordered ahead: its pickup time must be inside one of its menus (and hot food open then).
// A menu switched off by HQ counts as not there: an item left with no menu that is on is served all day again. A menu left out at a
// store means its items are not served there (when that was their only menu).
import { comboOpenAt } from './hotFoodCombos';
import { storeDateKey, addStoreDays, startOfStoreDate, storeMinutes, storeWeekday, endOfStoreDate } from './storeTime';
import { formatTime12h } from './storeHours';

export interface DaypartRow {
  id: string; name: string; nameEs: string | null; fromTime: string; toTime: string; days: number[];
  lastCallMinutes: number; sortOrder: number; isActive: boolean;
  stores?: { storeId: string; fromTime: string | null; toTime: string | null; days: number[]; isOff: boolean }[];
}
/** A menu as it is at one store: the store's own times when HQ gave it some, else the chain's. off: left out at this store. */
export interface StoreDaypart {
  id: string; name: string; nameEs: string | null; fromTime: string; toTime: string; days: number[]; lastCallMinutes: number; sortOrder: number;
  off: boolean; ownTimes: boolean;
}

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export const SLOT_MINUTES = 15;
/** The shortest time from ordering to pickup, and the cook time of an item that has none */
export const MIN_LEAD_MINUTES = 15;
export const MAX_DAYPARTS = 10;

const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** The active menus as they are at this store (the ones left out there kept, marked off), in HQ's order */
export function daypartsAt(all: DaypartRow[], storeId: string): StoreDaypart[] {
  return all.filter((d) => d.isActive).map((d) => {
    const own = d.stores?.find((s) => s.storeId === storeId);
    const times = own && !own.isOff && own.fromTime && own.toTime;
    return {
      id: d.id, name: d.name, nameEs: d.nameEs, lastCallMinutes: d.lastCallMinutes, sortOrder: d.sortOrder,
      fromTime: times ? own!.fromTime! : d.fromTime, toTime: times ? own!.toTime! : d.toTime, days: times ? own!.days : d.days,
      off: !!own?.isOff, ownTimes: !!times,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder || toMin(a.fromTime) - toMin(b.fromTime) || a.name.localeCompare(b.name));
}

/** Inside the menu's hours at `at` (its days, and hours past midnight belong to the day they started on) */
export function daypartOpenAt(d: StoreDaypart, at: Date): boolean {
  return !d.off && d.fromTime !== d.toTime && comboOpenAt({ fromTime: d.fromTime, toTime: d.toTime, days: d.days }, at);
}

/** Minutes until the menu ends, when it is on at `at`; null when it is not on */
export function minutesLeft(d: StoreDaypart, at: Date): number | null {
  if (!daypartOpenAt(d, at)) return null;
  const m = storeMinutes(at), from = toMin(d.fromTime), to = toMin(d.toTime);
  if (from < to) return to - m;
  return m >= from ? 1440 - m + to : to - m;
}

/** On at `at` and before its last call: an order for now can still be placed */
export function daypartTakingOrders(d: StoreDaypart, at: Date): boolean {
  const left = minutesLeft(d, at);
  return left != null && left > d.lastCallMinutes;
}

/** When the menu next starts after `at` (within 8 days), or null */
export function nextStart(d: StoreDaypart, at: Date): Date | null {
  if (d.off || d.fromTime === d.toTime) return null;
  const key = storeDateKey(at);
  for (let i = 0; i <= 8; i++) {
    const day = addStoreDays(key, i);
    const start = new Date(startOfStoreDate(day).getTime() + toMin(d.fromTime) * 60_000);
    if (start.getTime() <= at.getTime()) continue;
    const wd = storeWeekday(new Date(startOfStoreDate(day).getTime() + 12 * 3600_000));
    if (d.days.length === 0 || d.days.length >= 7 || d.days.includes(wd)) return start;
  }
  return null;
}

/** The item's menus at this store: null = all day (in no menu that is on); [] = only in menus left out here (not served here) */
export function itemMenus(daypartIds: string[] | null | undefined, here: StoreDaypart[]): StoreDaypart[] | null {
  const mine = here.filter((d) => (daypartIds ?? []).includes(d.id));
  if (mine.length === 0) return null;
  return mine.filter((d) => !d.off);
}

/** Can the item be ordered for now at `at` (inside one of its menus, before last call) */
export function servedNow(daypartIds: string[] | null | undefined, here: StoreDaypart[], at: Date): boolean {
  const menus = itemMenus(daypartIds, here);
  return menus == null || menus.some((d) => daypartTakingOrders(d, at));
}

/** Can the item be picked up at `at` (inside one of its menus) */
export function servedAt(daypartIds: string[] | null | undefined, here: StoreDaypart[], at: Date): boolean {
  const menus = itemMenus(daypartIds, here);
  return menus == null || menus.some((d) => daypartOpenAt(d, at));
}

/** When an item not served now is next served (the soonest start of its menus), or null */
export function nextServed(daypartIds: string[] | null | undefined, here: StoreDaypart[], at: Date): Date | null {
  const menus = itemMenus(daypartIds, here);
  if (!menus) return null;
  const starts = menus.map((d) => nextStart(d, at)).filter((x): x is Date => !!x).sort((a, b) => a.getTime() - b.getTime());
  return starts[0] ?? null;
}

/** "5:00 AM to 10:30 AM" */
export function hoursText(d: { fromTime: string; toTime: string }): string {
  return `${formatTime12h(d.fromTime)} to ${formatTime12h(d.toTime)}`;
}

/** The kitchen's lead for these items: the longest cook time, at least MIN_LEAD_MINUTES */
export function leadMinutes(cookMinutes: (number | null | undefined)[]): number {
  return Math.max(MIN_LEAD_MINUTES, ...cookMinutes.map((m) => (m && m > 0 ? m : 0)));
}

/** The latest pickup time that can be ordered: the end of the store day `days` days from now */
export function lastPickupDay(now: Date, days: number): Date {
  return endOfStoreDate(addStoreDays(storeDateKey(now), Math.max(0, days)));
}

/**
 * Pickup times a customer can choose: every SLOT_MINUTES from `MIN_LEAD_MINUTES` after now to the end of the store day `days` from
 * today, when hot food is open, each with the menus on then (so the app keeps the times that suit what is in the cart). The app also
 * drops the ones sooner than the cart's own lead.
 */
export function pickupSlots(now: Date, days: number, hotFoodOpenAt: (at: Date) => boolean, here: StoreDaypart[]): { at: string; menus: string[] }[] {
  const step = SLOT_MINUTES * 60_000;
  const first = Math.ceil((now.getTime() + MIN_LEAD_MINUTES * 60_000) / step) * step;
  const last = lastPickupDay(now, days).getTime();
  const out: { at: string; menus: string[] }[] = [];
  for (let t = first; t <= last && out.length < 800; t += step) {
    const at = new Date(t);
    if (!hotFoodOpenAt(at)) continue;
    out.push({ at: at.toISOString(), menus: here.filter((d) => daypartOpenAt(d, at)).map((d) => d.id) });
  }
  return out;
}

/** A pickup time the customer may choose for these items, or why not (English; the app shows its own words for the codes) */
export function pickupProblem(pickupAt: Date, now: Date, days: number, lead: number, hotFoodOpenAt: (at: Date) => boolean): { code: string; error: string } | null {
  if (!Number.isFinite(pickupAt.getTime())) return { code: 'PICKUP_TIME', error: 'Choose a pickup time.' };
  if (pickupAt.getTime() < now.getTime() + (lead - 2) * 60_000) {
    return { code: 'PICKUP_TOO_SOON', error: `That pickup time is too soon. These items take about ${lead} minutes: choose a later time.` };
  }
  if (pickupAt.getTime() > lastPickupDay(now, days).getTime()) {
    return { code: 'PICKUP_TOO_FAR', error: days === 0 ? 'Orders can be placed ahead for later today only.' : `Orders can be placed up to ${days} day${days === 1 ? '' : 's'} ahead.` };
  }
  if (!hotFoodOpenAt(pickupAt)) return { code: 'PICKUP_CLOSED', error: 'Hot food is closed at that pickup time. Choose another time.' };
  return null;
}

/** When the kitchen should start an order picked up at `pickupAt` (never before now) */
export function startTime(pickupAt: Date, lead: number, now: Date): Date {
  return new Date(Math.max(now.getTime(), pickupAt.getTime() - lead * 60_000));
}

/** "6:30 AM", "6:30 AM tomorrow" or "6:30 AM Tue, Nov 12" for a pickup time, as seen from `now` (store time) */
export function pickupWords(pickupAt: Date, now: Date = new Date()): string {
  const time = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(pickupAt);
  const a = storeDateKey(now), b = storeDateKey(pickupAt);
  if (a === b) return time;
  if (addStoreDays(a, 1) === b) return `${time} tomorrow`;
  return `${time} ${new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric' }).format(pickupAt)}`;
}
export function pickupWordsEs(pickupAt: Date, now: Date = new Date()): string {
  const time = new Intl.DateTimeFormat('es-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(pickupAt);
  const a = storeDateKey(now), b = storeDateKey(pickupAt);
  if (a === b) return time;
  if (addStoreDays(a, 1) === b) return `mañana a las ${time}`;
  return `${new Intl.DateTimeFormat('es-US', { timeZone: 'America/Chicago', weekday: 'short', day: 'numeric', month: 'short' }).format(pickupAt)}, ${time}`;
}

/** A menu's fields as HQ sent them, checked. `error` when one is wrong. */
export function daypartFields(body: any, creating: boolean): { error: string } | { data: Record<string, any> } {
  const data: Record<string, any> = {};
  if (creating || body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 40) return { error: 'Give the menu a name of up to 40 characters, like "Breakfast".' };
    data.name = name;
  }
  if (body.nameEs !== undefined) {
    const es = typeof body.nameEs === 'string' ? body.nameEs.trim() : '';
    if (es.length > 40) return { error: 'Keep the Spanish name under 40 characters.' };
    data.nameEs = es || null;
  }
  for (const k of ['fromTime', 'toTime'] as const) {
    if (creating || body[k] !== undefined) {
      if (typeof body[k] !== 'string' || !TIME_RE.test(body[k])) return { error: 'Give the times as hours and minutes, like 05:00 and 10:30.' };
      data[k] = body[k];
    }
  }
  if (data.fromTime && data.toTime && data.fromTime === data.toTime) return { error: 'The menu must end at a different time than it starts.' };
  if (body.days !== undefined) {
    const d = daysOf(body.days);
    if (!d) return { error: 'Days must be from Sunday (0) to Saturday (6).' };
    data.days = d;
  }
  if (body.lastCallMinutes !== undefined) {
    const m = Number(body.lastCallMinutes);
    if (!Number.isInteger(m) || m < 0 || m > 120) return { error: 'Last call must be from 0 to 120 minutes before the menu ends.' };
    data.lastCallMinutes = m;
  }
  if (body.sortOrder !== undefined) {
    const n = Number(body.sortOrder);
    if (!Number.isInteger(n) || n < 0 || n > 100) return { error: 'The order must be a whole number from 0 to 100.' };
    data.sortOrder = n;
  }
  if (body.isActive !== undefined) {
    if (typeof body.isActive !== 'boolean') return { error: 'isActive must be true or false.' };
    data.isActive = body.isActive;
  }
  return { data };
}

/** Days as sent (0..6, no repeats, sorted); all seven = [] (every day); null when one is wrong */
export function daysOf(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const set = new Set<number>();
  for (const x of v) { if (!Number.isInteger(x) || x < 0 || x > 6) return null; set.add(x); }
  return set.size === 7 ? [] : [...set].sort((a, b) => a - b);
}
