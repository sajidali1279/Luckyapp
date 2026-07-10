/**
 * Daily report reminder cron — runs daily at 7:30am local time.
 *
 * NOTE: unlike the other crons in this file (which use UTC because the
 * exact wall-clock time doesn't matter for month/day boundaries), this one
 * is inherently about a specific local time — opening shift starts at 6am
 * per SHIFT_TIMES in the mobile app. The Store model has no timezone field
 * today, so REMINDER_TIMEZONE is hardcoded to the stores' actual zone
 * (Central) — revisit if stores ever span multiple timezones. node-cron
 * resolves named IANA zones (incl. DST) via its `timezone` option, so this
 * only needs to be a single correct zone name.
 *
 * For each active store with no DailyReport submitted yet today: finds
 * employees on an OPENING ShiftTemplate for today's day-of-week, excludes
 * anyone with an APPROVED TIME_OFF request for today, and pushes a reminder
 * to whoever's left. Safe to run multiple times — a store is skipped
 * entirely once any employee has submitted that day's report.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { sendPushToUser } from './push';
import { DayOfWeek, RequestStatus, ShiftRequestType, ShiftType } from '@prisma/client';

const REMINDER_TIMEZONE = 'America/Chicago'; // Central Time — stores are in Texas

const DAY_ABBR_TO_ENUM: Record<string, DayOfWeek> = {
  Sun: DayOfWeek.SUN, Mon: DayOfWeek.MON, Tue: DayOfWeek.TUE, Wed: DayOfWeek.WED,
  Thu: DayOfWeek.THU, Fri: DayOfWeek.FRI, Sat: DayOfWeek.SAT,
};

function localDateISO(): string {
  // en-CA gives YYYY-MM-DD directly, computed in REMINDER_TIMEZONE regardless of server TZ
  return new Date().toLocaleDateString('en-CA', { timeZone: REMINDER_TIMEZONE });
}

function localDayOfWeek(): DayOfWeek {
  const abbr = new Date().toLocaleDateString('en-US', { timeZone: REMINDER_TIMEZONE, weekday: 'short' });
  return DAY_ABBR_TO_ENUM[abbr];
}

export async function runDailyReportReminder() {
  const today = localDateISO();
  const dow = localDayOfWeek();
  console.log(`[daily-report-reminder] Checking opening-shift employees for ${today} (${dow})…`);

  const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } });

  let remindedStores = 0;
  let remindedEmployees = 0;

  for (const store of stores) {
    const alreadySubmitted = await prisma.dailyReport.findFirst({
      where: { storeId: store.id, reportDate: today },
      select: { id: true },
    });
    if (alreadySubmitted) continue;

    const openingShifts = await prisma.shiftTemplate.findMany({
      where: { storeId: store.id, dayOfWeek: dow, shiftType: ShiftType.OPENING, isActive: true },
      select: { employeeId: true },
    });
    if (openingShifts.length === 0) continue;

    const dayStart = new Date(`${today}T00:00:00.000Z`);
    const dayEnd = new Date(`${today}T23:59:59.999Z`);
    const approvedOff = await prisma.shiftRequest.findMany({
      where: {
        storeId: store.id,
        requestType: ShiftRequestType.TIME_OFF,
        status: RequestStatus.APPROVED,
        date: { gte: dayStart, lte: dayEnd },
      },
      select: { employeeId: true },
    });
    const offIds = new Set(approvedOff.map((r) => r.employeeId));

    const targetIds = [...new Set(openingShifts.map((s) => s.employeeId).filter((id) => !offIds.has(id)))];
    if (targetIds.length === 0) continue;

    for (const employeeId of targetIds) {
      sendPushToUser(employeeId, '📋 Daily Report Reminder', `Don't forget to submit today's daily report for ${store.name}.`);
    }
    remindedStores++;
    remindedEmployees += targetIds.length;
    console.log(`[daily-report-reminder]   ⏰ ${store.name} — reminded ${targetIds.length} employee(s)`);
  }

  console.log(`[daily-report-reminder] Done. Stores reminded: ${remindedStores}, employees reminded: ${remindedEmployees}`);
}

// Schedule: 7:30am in REMINDER_TIMEZONE, every day
export function startDailyReportReminderCron() {
  cron.schedule('30 7 * * *', runDailyReportReminder, { timezone: REMINDER_TIMEZONE });
  console.log(`[daily-report-reminder] Reminder job scheduled (daily 07:30 ${REMINDER_TIMEZONE})`);
}
