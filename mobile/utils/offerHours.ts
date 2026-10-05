// Happy hours for a promotion (backend utils/offerHours.ts): days 0 = Sunday .. 6 = Saturday ([] = every day) and "HH:MM" times on the store
// clock. The server also sends English hoursText; the app words them itself so they read in Spanish too.
type TFunction = (key: string, opts?: Record<string, unknown>) => string;

export interface OfferHours { happyDays?: number[] | null; happyFrom?: string | null; happyTo?: string | null }

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function hasHours(o: OfferHours): boolean {
  return !!o.happyFrom && !!o.happyTo;
}

/** "3 PM", "10:30 AM" */
export function clock(t: string): string {
  const h = Number(t.slice(0, 2)), m = t.slice(3, 5);
  return `${h % 12 === 0 ? 12 : h % 12}${m === '00' ? '' : `:${m}`} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Mon-Fri, 3 PM to 6 PM" / "lun-vie, 3 PM a 6 PM", or null without hours. */
export function hoursText(o: OfferHours, t: TFunction): string | null {
  if (!hasHours(o)) return null;
  const days = o.happyDays && o.happyDays.length > 0 && o.happyDays.length < 7 ? [...o.happyDays].sort((a, b) => a - b) : null;
  const name = (d: number) => t(`offerHours.${DAY_KEYS[d]}`);
  let dayText = t('offerHours.everyDay');
  if (days) {
    const run = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
    dayText = run && days.length >= 3 ? `${name(days[0])}-${name(days[days.length - 1])}` : days.map(name).join(', ');
  }
  if (o.happyFrom === '00:00' && o.happyTo === '00:00') return t('offerHours.allDayOn', { days: dayText });   // all day on those days
  return t('offerHours.window', { days: dayText, from: clock(o.happyFrom!), to: clock(o.happyTo!) });
}

export function dayShort(d: number, t: TFunction): string {
  return t(`offerHours.${DAY_KEYS[d]}`);
}
