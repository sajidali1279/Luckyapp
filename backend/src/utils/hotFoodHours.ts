import { DayOfWeek } from '@prisma/client';
import { storeDateKey, addStoreDays, startOfStoreDate, storeMinutes, storeWeekday, storeTimeText, storeDaysBetween } from './storeTime';
import { formatTime12h } from './storeHours';

// Whether hot food can be ordered at a store at a given moment, and until when (or from when), in store time (Central).
//
// Hot food is open when BOTH say so:
//   - its own weekly hot food hours (HotFoodHours rows), when a store has them; with none it follows the store, and
//   - the store's own hours (StoreHours, with a StoreHoliday row for a date winning over the weekly day), when a store has any.
// A store with neither is always open, as before hours existed. A closing time earlier than the opening time runs past midnight
// (6:00 PM to 2:00 AM), so 1:00 AM Tuesday is still inside Monday's hours.

export interface DayHours {
  isClosed: boolean;
  isOpen24Hours: boolean;
  openTime: string | null;
  closeTime: string | null;
}
export interface WeeklyHours extends DayHours { dayOfWeek: DayOfWeek }
export interface HolidayHours extends DayHours { date: Date; label: string }

export interface HotFoodSchedules {
  hotFood: WeeklyHours[];
  storeWeekly: WeeklyHours[];
  storeHolidays: HolidayHours[];
}

export interface HotFoodState {
  open: boolean;
  /** false when nothing limits ordering (no hours of either kind) */
  limited: boolean;
  /** true when the store has no hot food hours of its own and the store's hours are used */
  followsStore: boolean;
  /** when it closes next ('10:00 PM'), when open and it closes within two days */
  closesAt: string | null;
  /** when it opens next, when closed and it opens within a week */
  opensAt: string | null;
  /** 'today', 'tomorrow' or the weekday ('SUN'..'SAT') of opensAt */
  opensDay: 'today' | 'tomorrow' | DayOfWeek | null;
  /** today's hot food hours as words: '6:00 AM - 10:00 PM', 'Open 24 Hours', 'Closed', or null when not limited */
  todayText: string | null;
  /** the store is closed today for a holiday (its name), when that is why */
  holiday: string | null;
}

const DOW: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

function weekdayOf(dateKey: string): DayOfWeek {
  return DOW[storeWeekday(new Date(startOfStoreDate(dateKey).getTime() + 12 * 3600_000))];
}

const holidayOn = (holidays: HolidayHours[], dateKey: string) => holidays.find((h) => h.date.toISOString().slice(0, 10) === dateKey);

// A day's hours for one schedule, or undefined when that schedule says nothing about the day
function dayOf(weekly: WeeklyHours[], holidays: HolidayHours[], dateKey: string): DayHours | undefined {
  return holidayOn(holidays, dateKey) ?? weekly.find((w) => w.dayOfWeek === weekdayOf(dateKey));
}

const overnight = (d: DayHours) => !d.isClosed && !d.isOpen24Hours && !!d.openTime && !!d.closeTime && toMin(d.closeTime) < toMin(d.openTime);

// Open at minute t of this day, by this day's own hours (the evening part of an overnight day included)
function openWithin(d: DayHours, t: number): boolean {
  if (d.isClosed) return false;
  if (d.isOpen24Hours) return true;
  if (!d.openTime || !d.closeTime) return false;
  const o = toMin(d.openTime), c = toMin(d.closeTime);
  return c > o ? t >= o && t < c : t >= o;
}

// Still open at minute t because yesterday's hours ran past midnight
const carriedOver = (yesterday: DayHours | undefined, t: number) => !!yesterday && overnight(yesterday) && t < toMin(yesterday.closeTime!);

function scheduleOpenAt(weekly: WeeklyHours[], holidays: HolidayHours[], at: Date): boolean {
  if (weekly.length === 0 && holidays.length === 0) return true;
  const key = storeDateKey(at);
  const t = storeMinutes(at);
  const today = dayOf(weekly, holidays, key);
  const yesterday = dayOf(weekly, holidays, addStoreDays(key, -1));
  if (!today && !carriedOver(yesterday, t)) return weekly.length === 0;   // a holiday-only store is open on other days
  return (!!today && openWithin(today, t)) || carriedOver(yesterday, t);
}

export function hotFoodOpenAt(s: HotFoodSchedules, at: Date): boolean {
  const hotFoodOk = s.hotFood.length === 0 || scheduleOpenAt(s.hotFood, [], at);
  return hotFoodOk && scheduleOpenAt(s.storeWeekly, s.storeHolidays, at);
}

// The moments where "open" can change: every opening and closing time of both schedules, and each midnight
function boundaries(s: HotFoodSchedules, fromKey: string, days: number): Date[] {
  const out: Date[] = [];
  for (let i = 0; i <= days; i++) {
    const key = addStoreDays(fromKey, i);
    const start = startOfStoreDate(key).getTime();
    const times = new Set<number>([0]);
    for (const d of [dayOf(s.hotFood, [], key), dayOf(s.storeWeekly, s.storeHolidays, key)]) {
      if (d?.openTime) times.add(toMin(d.openTime));
      if (d?.closeTime) times.add(toMin(d.closeTime));
    }
    times.forEach((m) => out.push(new Date(start + m * 60_000)));
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

function dayWords(d: DayHours | undefined): string | null {
  if (!d) return null;
  if (d.isClosed) return 'Closed';
  if (d.isOpen24Hours) return 'Open 24 Hours';
  return d.openTime && d.closeTime ? `${formatTime12h(d.openTime)} - ${formatTime12h(d.closeTime)}` : null;
}

export function hotFoodState(s: HotFoodSchedules, now: Date = new Date()): HotFoodState {
  const limited = s.hotFood.length > 0 || s.storeWeekly.length > 0 || s.storeHolidays.length > 0;
  const followsStore = s.hotFood.length === 0;
  const key = storeDateKey(now);
  const todayHoliday = holidayOn(s.storeHolidays, key);
  const todayText = !limited ? null
    : todayHoliday?.isClosed ? 'Closed'
    : dayWords(followsStore ? dayOf(s.storeWeekly, s.storeHolidays, key) : dayOf(s.hotFood, [], key));
  const base = { limited, followsStore, todayText, holiday: todayHoliday?.isClosed ? todayHoliday.label : null };
  if (!limited) return { ...base, open: true, closesAt: null, opensAt: null, opensDay: null };

  const open = hotFoodOpenAt(s, now);
  const later = boundaries(s, addStoreDays(key, -1), open ? 3 : 8).filter((b) => b.getTime() > now.getTime());
  if (open) {
    const close = later.find((b) => !hotFoodOpenAt(s, b));
    return { ...base, open, closesAt: close ? storeTimeText(close) : null, opensAt: null, opensDay: null };
  }
  const reopen = later.find((b) => hotFoodOpenAt(s, b));
  if (!reopen) return { ...base, open, closesAt: null, opensAt: null, opensDay: null };
  const days = storeDaysBetween(key, storeDateKey(reopen));
  return {
    ...base, open, closesAt: null,
    opensAt: storeTimeText(reopen),
    opensDay: days === 0 ? 'today' : days === 1 ? 'tomorrow' : DOW[storeWeekday(reopen)],
  };
}

const DAY_NAME: Record<DayOfWeek, string> = { SUN: 'Sunday', MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday' };

/** "It opens tomorrow at 6:00 AM." (or "" when there is no opening within a week) */
export function opensSentence(st: HotFoodState): string {
  if (!st.opensAt || !st.opensDay) return '';
  const when = st.opensDay === 'today' ? 'today' : st.opensDay === 'tomorrow' ? 'tomorrow' : `on ${DAY_NAME[st.opensDay]}`;
  return ` It opens ${when} at ${st.opensAt}.`;
}
