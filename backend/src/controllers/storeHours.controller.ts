import { Response } from 'express';
import { z } from 'zod';
import { DayOfWeek } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use 24-hour HH:mm format');

const daySchema = z.object({
  dayOfWeek: z.nativeEnum(DayOfWeek),
  isClosed: z.boolean(),
  isOpen24Hours: z.boolean(),
  openTime: timeStringSchema.nullable(),
  closeTime: timeStringSchema.nullable(),
});

const updateHoursSchema = z.object({
  days: z.array(daySchema).length(7, 'Provide all 7 days'),
});

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store)
export async function getStoreHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const [weekly, holidays] = await Promise.all([
    prisma.storeHours.findMany({ where: { storeId }, orderBy: { dayOfWeek: 'asc' } }),
    prisma.storeHoliday.findMany({ where: { storeId }, orderBy: { date: 'asc' } }),
  ]);
  res.json({ success: true, data: { weekly, holidays } });
}

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store) — replaces the
// full 7-day week in one call rather than a per-day PATCH, since the
// admin UI always edits the whole week at once.
export async function updateStoreHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = updateHoursSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }

  const seen = new Set(parsed.data.days.map((d) => d.dayOfWeek));
  if (seen.size !== 7) {
    res.status(400).json({ success: false, error: 'Each day of the week must appear exactly once' });
    return;
  }

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
  res.json({ success: true, data: weekly });
}

const holidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD format'),
  label: z.string().trim().min(1).max(60),
  isClosed: z.boolean(),
  isOpen24Hours: z.boolean(),
  openTime: timeStringSchema.nullable(),
  closeTime: timeStringSchema.nullable(),
});

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store)
export async function addStoreHoliday(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = holidaySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.errors[0].message });
    return;
  }
  const { date, ...rest } = parsed.data;
  try {
    const holiday = await prisma.storeHoliday.upsert({
      where: { storeId_date: { storeId, date: new Date(date) } },
      create: { storeId, date: new Date(date), ...rest },
      update: rest,
    });
    res.json({ success: true, data: holiday });
  } catch {
    res.status(400).json({ success: false, error: 'Failed to save holiday hours' });
  }
}

// STORE_MANAGER+ (own store) or SUPER_ADMIN+ (any store)
export async function deleteStoreHoliday(req: AuthRequest, res: Response) {
  const { storeId, holidayId } = req.params;
  const holiday = await prisma.storeHoliday.findUnique({ where: { id: holidayId } });
  if (!holiday || holiday.storeId !== storeId) {
    res.status(404).json({ success: false, error: 'Holiday not found' });
    return;
  }
  await prisma.storeHoliday.delete({ where: { id: holidayId } });
  res.json({ success: true });
}
