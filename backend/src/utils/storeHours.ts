import { DayOfWeek } from '@prisma/client';

// Stores are all in Texas — every "what day/time is it right now" question
// for hours display must be answered in Central time regardless of where
// the server itself runs (Render is UTC). Same technique already used by
// daily-report-reminder-cron.ts for the same reason.
const STORE_TIMEZONE = 'America/Chicago';

const DAY_ABBR_TO_ENUM: Record<string, DayOfWeek> = {
  Sun: DayOfWeek.SUN, Mon: DayOfWeek.MON, Tue: DayOfWeek.TUE, Wed: DayOfWeek.WED,
  Thu: DayOfWeek.THU, Fri: DayOfWeek.FRI, Sat: DayOfWeek.SAT,
};

export function localDateISO(): string {
  // en-CA gives YYYY-MM-DD directly, computed in STORE_TIMEZONE regardless of server TZ
  return new Date().toLocaleDateString('en-CA', { timeZone: STORE_TIMEZONE });
}

export function localDayOfWeek(): DayOfWeek {
  const abbr = new Date().toLocaleDateString('en-US', { timeZone: STORE_TIMEZONE, weekday: 'short' });
  return DAY_ABBR_TO_ENUM[abbr];
}

// "06:00" -> "6:00 AM"
export function formatTime12h(t: string): string {
  const [hStr, m] = t.split(':');
  const h = parseInt(hStr, 10);
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m} ${period}`;
}

interface DaySchedule {
  isClosed: boolean;
  isOpen24Hours: boolean;
  openTime: string | null;
  closeTime: string | null;
}

function scheduleLabel(s: DaySchedule): string {
  if (s.isClosed) return 'Closed';
  if (s.isOpen24Hours) return 'Open 24 Hours';
  if (s.openTime && s.closeTime) return `${formatTime12h(s.openTime)} - ${formatTime12h(s.closeTime)}`;
  return 'Hours not set';
}

/**
 * Computes what to show as "today's hours" for a store, in Central time,
 * checking a holiday override for today's date first and falling back to
 * the regular weekly schedule. Returns null only if neither exists yet
 * (a store that's never had its hours configured at all).
 */
export function computeTodayHoursLabel(
  weeklyHours: Array<DaySchedule & { dayOfWeek: DayOfWeek }>,
  holidays: Array<DaySchedule & { date: Date; label: string }>,
): string | null {
  const today = localDateISO();
  const todayHoliday = holidays.find((h) => h.date.toISOString().slice(0, 10) === today);
  if (todayHoliday) return `${scheduleLabel(todayHoliday)} (${todayHoliday.label})`;

  const dow = localDayOfWeek();
  const todaySchedule = weeklyHours.find((w) => w.dayOfWeek === dow);
  if (todaySchedule) return scheduleLabel(todaySchedule);

  return null;
}
