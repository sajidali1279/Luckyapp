// Where staff are working (2026-10-11). When a staff member opens the app during a shift, the phone works out which of their stores it is
// at (no coordinates leave the phone). At the store the schedule has them at, they are checked in on their own; at another of their stores,
// the app asks which store they are working at, and their answer counts for that store day. The schedule itself is never changed.
// A check-in at a store they were not scheduled at tells HQ and the managers of both stores, once a day for that pair.
// Hot food alerts follow where people are: their latest check-in today, else the store of their shift (utils/hotFoodRouting.ts).
import prisma from '../config/prisma';
import { DayOfWeek } from '@prisma/client';
import { storeDateKey, storeDayStart, storeDayEnd, storeMinutes, storeWeekday } from './storeTime';
import { sendPushToUser } from './push';

/** Where the alert opens: the manager app's Where staff are tab (managers); HQ reads it on the admin site. */
const CHECK_INS_URL = '/(manager)/schedule?tab=where';

const DAYS: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + (m || 0); };
/** A shift is "now" from this many minutes before it starts, so someone arriving early is checked in. */
export const EARLY_MINUTES = 30;

export interface ShiftNow { storeId: string; startTime: string; endTime: string; shiftType: string; now: boolean }

/**
 * Today's shifts for these people (store day), without the ones they have approved time off for, each with whether it is on now
 * (started, or starting within EARLY_MINUTES, and not ended; last night's shift running past midnight too).
 */
export async function shiftsToday(userIds: string[], now: Date = new Date()): Promise<Map<string, ShiftNow[]>> {
  const out = new Map<string, ShiftNow[]>();
  if (userIds.length === 0) return out;
  const day = storeWeekday(now); const minute = storeMinutes(now);
  const today = DAYS[day]; const yesterday = DAYS[(day + 6) % 7];
  const [templates, off] = await Promise.all([
    prisma.shiftTemplate.findMany({
      where: { employeeId: { in: userIds }, isActive: true, dayOfWeek: { in: [today, yesterday] }, employee: { isActive: true } },
      select: { employeeId: true, storeId: true, dayOfWeek: true, startTime: true, endTime: true, shiftType: true },
    }),
    prisma.shiftRequest.findMany({
      where: { employeeId: { in: userIds }, requestType: 'TIME_OFF', status: 'APPROVED', date: { gte: storeDayStart(now), lte: storeDayEnd(now) } },
      select: { employeeId: true },
    }),
  ]);
  const offIds = new Set(off.map((r) => r.employeeId));
  for (const t of templates) {
    if (offIds.has(t.employeeId)) continue;
    const start = mins(t.startTime); const end = mins(t.endTime); const overnight = end <= start;
    let isNow: boolean; let counts = true;
    if (t.dayOfWeek === today) isNow = overnight ? minute >= start - EARLY_MINUTES : minute >= start - EARLY_MINUTES && minute < end;
    else { counts = overnight && minute < end; isNow = counts; }   // yesterday's: only while it runs past midnight
    if (!counts) continue;
    const list = out.get(t.employeeId) ?? [];
    list.push({ storeId: t.storeId, startTime: t.startTime, endTime: t.endTime, shiftType: t.shiftType, now: isNow });
    out.set(t.employeeId, list);
  }
  return out;
}

/** The latest check-in of each person on this store day. */
export async function latestCheckIns(userIds: string[], storeDay: string): Promise<Map<string, { storeId: string; createdAt: Date; method: string }>> {
  const out = new Map<string, { storeId: string; createdAt: Date; method: string }>();
  if (userIds.length === 0) return out;
  const rows = await prisma.staffCheckIn.findMany({
    where: { userId: { in: userIds }, storeDay },
    select: { userId: true, storeId: true, createdAt: true, method: true },
    orderBy: { createdAt: 'asc' },
  });
  for (const r of rows) out.set(r.userId, { storeId: r.storeId, createdAt: r.createdAt, method: r.method });
  return out;
}

/**
 * The people working at a store now: on a shift now (any of their stores) and either checked in there today, or not checked in anywhere
 * today and scheduled there. Only people still assigned to the store.
 */
export async function workingAt(storeId: string, now: Date = new Date()): Promise<string[]> {
  // Everyone with a shift at this store today, and everyone checked in at it today: the only people who can be working there
  const storeDay = storeDateKey(now);
  const [scheduledHere, checkedHere, assigned] = await Promise.all([
    prisma.shiftTemplate.findMany({ where: { storeId, isActive: true }, select: { employeeId: true }, distinct: ['employeeId'] }),
    prisma.staffCheckIn.findMany({ where: { storeId, storeDay }, select: { userId: true }, distinct: ['userId'] }),
    prisma.userStoreRole.findMany({ where: { storeId, user: { isActive: true } }, select: { userId: true } }),
  ]);
  const assignedIds = new Set(assigned.map((a) => a.userId));
  const people = [...new Set([...scheduledHere.map((s) => s.employeeId), ...checkedHere.map((c) => c.userId)])].filter((id) => assignedIds.has(id));
  const [shifts, checks] = await Promise.all([shiftsToday(people, now), latestCheckIns(people, storeDay)]);
  return people.filter((id) => {
    const mine = (shifts.get(id) ?? []).filter((s) => s.now);
    if (mine.length === 0) return false;                     // not working right now
    const checked = checks.get(id);
    if (checked) return checked.storeId === storeId;         // where they said they are
    return mine.some((s) => s.storeId === storeId);           // else where the schedule has them
  });
}

export type CheckInResult = { checkIn: { id: string; storeId: string; createdAt: Date; method: string }; repeated: boolean; mismatch: boolean };

/**
 * Records that `user` is working at `storeId` this store day. A repeat of the latest check-in today changes nothing. At a store other than
 * the one they are scheduled at now, HQ and both stores' managers are told (once a day for that pair).
 */
export async function recordCheckIn(user: { id: string; name?: string | null }, storeId: string, method: 'AUTO' | 'CHOSEN', distanceFeet: number | null, now: Date = new Date()): Promise<CheckInResult> {
  const storeDay = storeDateKey(now);
  const latest = (await latestCheckIns([user.id], storeDay)).get(user.id);
  const shifts = (await shiftsToday([user.id], now)).get(user.id) ?? [];
  const scheduled = shifts.find((s) => s.now) ?? shifts[0] ?? null;
  const scheduledStoreId = scheduled?.storeId ?? null;
  if (latest && latest.storeId === storeId) {
    const row = await prisma.staffCheckIn.findFirst({ where: { userId: user.id, storeDay, storeId }, orderBy: { createdAt: 'desc' } });
    return { checkIn: row!, repeated: true, mismatch: !!scheduledStoreId && scheduledStoreId !== storeId };
  }
  const earlierPair = scheduledStoreId && scheduledStoreId !== storeId
    ? await prisma.staffCheckIn.findFirst({ where: { userId: user.id, storeDay, storeId, scheduledStoreId }, select: { id: true } })
    : null;
  const row = await prisma.staffCheckIn.create({ data: { userId: user.id, storeId, storeDay, scheduledStoreId, method, distanceFeet } });
  const mismatch = !!scheduledStoreId && scheduledStoreId !== storeId;
  if (mismatch && !earlierPair) {
    const stores = await prisma.store.findMany({ where: { id: { in: [storeId, scheduledStoreId!] } }, select: { id: true, name: true } });
    const nameOf = (id: string) => stores.find((s) => s.id === id)?.name ?? 'another store';
    const who = user.name || 'A staff member';
    const title = `${who} is at ${nameOf(storeId)}`;
    const body = `${who} checked in at ${nameOf(storeId)} but is scheduled at ${nameOf(scheduledStoreId!)} today${scheduled ? ` (${scheduled.startTime} to ${scheduled.endTime})` : ''}. Check ${nameOf(scheduledStoreId!)} is covered.`;
    try {
      // Each person once: the managers of both stores and HQ (someone can be both)
      const [managers, hq] = await Promise.all([
        prisma.userStoreRole.findMany({ where: { storeId: { in: [storeId, scheduledStoreId!] }, role: 'STORE_MANAGER', user: { isActive: true } }, select: { userId: true } }),
        prisma.user.findMany({ where: { role: 'SUPER_ADMIN', isActive: true }, select: { id: true } }),
      ]);
      const to = new Set([...managers.map((m) => m.userId), ...hq.map((a) => a.id)]);
      to.delete(user.id);
      await Promise.all([...to].map((id) => sendPushToUser(id, title, body, 'STAFF_CHECK_IN', CHECK_INS_URL)));
    } catch { /* the check-in counts even if a push fails */ }
  }
  return { checkIn: row, repeated: false, mismatch };
}
