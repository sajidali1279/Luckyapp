import { Response } from 'express';
import { z } from 'zod';
import { DayOfWeek } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { formatTime12h } from '../utils/storeHours';
import { isRealDateKey } from '../utils/storeTime';

const timeStringSchema = z.string({ message: 'Times are written as 24-hour HH:mm, such as 06:00.' }).regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Times are written as 24-hour HH:mm, such as 06:00.');

const daySchema = z.object({
  dayOfWeek: z.nativeEnum(DayOfWeek),
  isClosed: z.boolean(),
  isOpen24Hours: z.boolean(),
  openTime: timeStringSchema.nullable(),
  closeTime: timeStringSchema.nullable(),
});

const updateHoursSchema = z.object({
  days: z.array(daySchema, { message: 'Send the seven days of the week.' }).length(7, 'Send all seven days of the week.'),
});

const DAY_NAMES: Record<string, string> = { MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday' };

type DayLike = { isClosed: boolean; isOpen24Hours: boolean; openTime: string | null; closeTime: string | null };
/** "closed", "open 24 hours" or "6:00 AM to 10:00 PM" (a day with no hours set at all reads "not set") */
function dayWords(d: DayLike | undefined): string {
  if (!d) return 'not set';
  if (d.isClosed) return 'closed';
  if (d.isOpen24Hours) return 'open 24 hours';
  return d.openTime && d.closeTime ? `${formatTime12h(d.openTime)} to ${formatTime12h(d.closeTime)}` : 'not set';
}

/** The sentence that refuses a day that is open but has no usable hours, or null when the day is fine. */
function dayProblem(day: { dayOfWeek: string } & DayLike): string | null {
  if (day.isClosed || day.isOpen24Hours) return null;
  const name = DAY_NAMES[day.dayOfWeek] ?? day.dayOfWeek;
  if (!day.openTime || !day.closeTime) return `${name} is open but has no opening or closing time. Set both times, mark it closed, or choose open 24 hours.`;
  if (day.openTime === day.closeTime) return `${name} opens and closes at the same time (${formatTime12h(day.openTime)}). Use "open 24 hours" for a day that never closes.`;
  return null;
}

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store)
export async function getStoreHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const [weekly, holidays] = await Promise.all([
    prisma.storeHours.findMany({ where: { storeId }, orderBy: { dayOfWeek: 'asc' } }),
    prisma.storeHoliday.findMany({ where: { storeId }, orderBy: { date: 'asc' } }),
  ]);
  res.json({ success: true, data: { weekly, holidays } });
}

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store). Replaces the
// full 7-day week in one call rather than a per-day PATCH, since the
// admin UI always edits the whole week at once.
export async function updateStoreHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = updateHoursSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }

  const seen = new Set(parsed.data.days.map((d) => d.dayOfWeek));
  if (seen.size !== 7) {
    res.status(400).json({ success: false, error: 'Each day of the week must appear exactly once.' });
    return;
  }
  for (const day of parsed.data.days) {
    const problem = dayProblem(day);
    if (problem) { res.status(400).json({ success: false, error: problem }); return; }
  }

  const [store, existing] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
    prisma.storeHours.findMany({ where: { storeId } }),
  ]);
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  const wasFor = new Map(existing.map((e) => [e.dayOfWeek as string, e]));
  const diffs = parsed.data.days
    .filter((d) => dayWords(wasFor.get(d.dayOfWeek)) !== dayWords(d))
    .map((d) => `${DAY_NAMES[d.dayOfWeek] ?? d.dayOfWeek}: ${dayWords(wasFor.get(d.dayOfWeek))} to ${dayWords(d)}`);

  await prisma.$transaction(
    parsed.data.days.map((day) =>
      prisma.storeHours.upsert({
        where: { storeId_dayOfWeek: { storeId, dayOfWeek: day.dayOfWeek } },
        create: { storeId, ...day },
        update: { isClosed: day.isClosed, isOpen24Hours: day.isOpen24Hours, openTime: day.openTime, closeTime: day.closeTime },
      })
    )
  );

  const weekly = await prisma.storeHours.findMany({ where: { storeId }, orderBy: { dayOfWeek: 'asc' } });
  if (diffs.length > 0) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'UPDATE_STORE_HOURS', entity: 'store', entityId: storeId,
      details: { summary: `${store.name} weekly hours: ${diffs.join('; ')}`, changedDays: diffs.length },
      storeId, storeName: store.name,
    });
  }
  res.json({ success: true, data: weekly, changed: diffs.length > 0 });
}

const holidaySchema = z.object({
  date: z.string({ message: 'Pick the date of the holiday.' }).regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick the date of the holiday.'),
  label: z.string({ message: 'Enter a name for the holiday.' }).trim().min(1, 'Enter a name for the holiday.').max(60, 'The holiday name is too long (60 characters at most).'),
  isClosed: z.boolean({ message: 'Say whether the store is closed that day.' }),
  isOpen24Hours: z.boolean({ message: 'Say whether the store is open 24 hours that day.' }),
  openTime: timeStringSchema.nullable(),
  closeTime: timeStringSchema.nullable(),
});

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store)
export async function addStoreHoliday(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { date, ...rest } = parsed.data;
  // A real calendar date: "2026-02-30" used to be quietly saved as March 2
  if (!isRealDateKey(date)) {
    res.status(400).json({ success: false, error: `${date} is not a real date. Pick a day from the calendar.` });
    return;
  }
  const problem = dayProblem({ dayOfWeek: 'the holiday', ...rest });
  if (problem) { res.status(400).json({ success: false, error: problem.replace(/^the holiday/, 'The holiday') }); return; }
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  const holiday = await prisma.storeHoliday.upsert({
    where: { storeId_date: { storeId, date: new Date(date) } },
    create: { storeId, date: new Date(date), ...rest },
    update: rest,
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'ADD_STORE_HOLIDAY', entity: 'store', entityId: storeId,
    details: { summary: `${store.name}: ${rest.label} (${date}) ${dayWords(rest)}` },
    storeId, storeName: store.name,
  });
  res.json({ success: true, data: holiday });
}

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store)
export async function deleteStoreHoliday(req: AuthRequest, res: Response) {
  const { storeId, holidayId } = req.params;
  const holiday = await prisma.storeHoliday.findUnique({ where: { id: holidayId } });
  if (!holiday || holiday.storeId !== storeId) {
    res.status(404).json({ success: false, error: 'That holiday was already removed.' });
    return;
  }
  await prisma.storeHoliday.delete({ where: { id: holidayId } });
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'DELETE_STORE_HOLIDAY', entity: 'store', entityId: storeId,
    details: { summary: `${store?.name ?? 'Store'}: holiday ${holiday.label} (${holiday.date.toISOString().slice(0, 10)}) removed` },
    storeId, storeName: store?.name ?? null,
  });
  res.json({ success: true });
}
