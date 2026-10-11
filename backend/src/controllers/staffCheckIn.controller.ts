// Where staff are working (2026-10-11): the app's check-in, and the "Where staff are" calendar for managers, HQ and each employee.
// See utils/staffCheckIn.ts for the rules.
import { Response } from 'express';
import { z } from 'zod';
import { DayOfWeek, Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import { refuse } from '../utils/refusal';
import { addStoreDays, isRealDateKey, startOfStoreDate, endOfStoreDate, storeDateKey } from '../utils/storeTime';
import { latestCheckIns, recordCheckIn, shiftsToday } from '../utils/staffCheckIn';

const DAYS: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const MAX_DAYS = 31;

/** GET /staff/today: today's shifts, the latest check-in today, and the stores the person works at (with locations, for the phone). */
export async function getMyStaffToday(req: AuthRequest, res: Response) {
  const user = req.user!;
  const now = new Date();
  const storeDay = storeDateKey(now);
  const [shifts, checks, stores] = await Promise.all([
    shiftsToday([user.id], now),
    latestCheckIns([user.id], storeDay),
    prisma.store.findMany({ where: { id: { in: user.storeIds ?? [] }, isActive: true }, select: { id: true, name: true, address: true, city: true, latitude: true, longitude: true } }),
  ]);
  const nameOf = (id: string) => stores.find((s) => s.id === id)?.name ?? null;
  const c = checks.get(user.id);
  res.json({
    success: true,
    data: {
      storeDay,
      shifts: (shifts.get(user.id) ?? []).map((s) => ({ ...s, storeName: nameOf(s.storeId) })),
      checkIn: c ? { storeId: c.storeId, storeName: nameOf(c.storeId), at: c.createdAt, method: c.method } : null,
      stores,
    },
  });
}

const checkInSchema = z.object({
  storeId: z.string().uuid('That store is not valid.'),
  method: z.enum(['AUTO', 'CHOSEN'], { message: 'The method must be AUTO or CHOSEN.' }),
  distanceFeet: z.number().int().min(0).max(5_000_000).nullable().optional(),
});

/** POST /staff/check-in: "I am working at this store today" (from the app; only a store the person is assigned to). */
export async function staffCheckIn(req: AuthRequest, res: Response) {
  const parsed = checkInSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { storeId, method, distanceFeet } = parsed.data;
  const user = req.user!;
  if (!(user.storeIds ?? []).includes(storeId)) { res.status(403).json({ success: false, error: 'You are not assigned to that store.' }); return; }
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { isActive: true, name: true } });
  if (!store?.isActive) { res.status(400).json({ success: false, error: 'That store is not open.' }); return; }
  const r = await recordCheckIn({ id: user.id, name: user.name }, storeId, method, distanceFeet ?? null);
  res.status(r.repeated ? 200 : 201).json({ success: true, data: { storeId, storeName: store.name, at: r.checkIn.createdAt, method: r.checkIn.method, mismatch: r.mismatch, repeated: r.repeated } });
}

const rangeSchema = z.object({
  from: z.string().refine(isRealDateKey, 'from must be a day, YYYY-MM-DD.'),
  to: z.string().refine(isRealDateKey, 'to must be a day, YYYY-MM-DD.'),
  storeId: z.string().min(1).max(64).optional(),   // limited to the person's stores below
});

export type DayStatus = 'ON_SITE' | 'ELSEWHERE' | 'NO_CHECK_IN' | 'UNSCHEDULED' | 'OFF' | 'UPCOMING';

/**
 * GET /staff/attendance?from&to[&storeId]: for each day, each person scheduled or checked in: where the schedule had them, where they
 * checked in, and the status. A store manager sees their stores, HQ every store, an employee only themselves. The schedule is the
 * weekly one in use now (shifts are not kept per date).
 */
export async function getStaffAttendance(req: AuthRequest, res: Response) {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const { from, to, storeId } = parsed.data;
  if (to < from) { res.status(400).json({ success: false, error: 'to must be on or after from.' }); return; }
  const days: string[] = [];
  for (let d = from; d <= to && days.length <= MAX_DAYS; d = addStoreDays(d, 1)) days.push(d);
  if (days.length > MAX_DAYS) { res.status(400).json({ success: false, error: `At most ${MAX_DAYS} days at a time.` }); return; }

  const me = req.user!;
  const isHQ = hasMinRole(me.role, Role.SUPER_ADMIN);
  const isManager = !isHQ && hasMinRole(me.role, Role.STORE_MANAGER);
  // Whose days: an employee only their own; a manager the people of their stores; HQ everyone
  const scopeStores = isHQ ? null : (me.storeIds ?? []);
  if (storeId && scopeStores && !scopeStores.includes(storeId)) { res.status(403).json({ success: false, error: 'That is not one of your stores.' }); return; }
  let peopleIds: string[];
  if (!isHQ && !isManager) peopleIds = [me.id];
  else {
    const roles = await prisma.userStoreRole.findMany({
      where: { ...(storeId ? { storeId } : scopeStores ? { storeId: { in: scopeStores } } : {}), role: { in: ['EMPLOYEE', 'STORE_MANAGER'] }, user: { isActive: true } },
      select: { userId: true },
    });
    peopleIds = [...new Set(roles.map((r) => r.userId))];
  }

  const rangeStart = startOfStoreDate(from); const rangeEnd = endOfStoreDate(to);
  const [people, templates, timeOff, checkIns, stores] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: peopleIds } }, select: { id: true, name: true, role: true } }),
    prisma.shiftTemplate.findMany({ where: { employeeId: { in: peopleIds }, isActive: true }, select: { employeeId: true, storeId: true, dayOfWeek: true, shiftType: true, startTime: true, endTime: true } }),
    prisma.shiftRequest.findMany({ where: { employeeId: { in: peopleIds }, requestType: 'TIME_OFF', status: 'APPROVED', date: { gte: rangeStart, lte: rangeEnd } }, select: { employeeId: true, date: true } }),
    prisma.staffCheckIn.findMany({ where: { userId: { in: peopleIds }, storeDay: { gte: from, lte: to } }, select: { userId: true, storeId: true, storeDay: true, createdAt: true, method: true }, orderBy: { createdAt: 'asc' } }),
    prisma.store.findMany({ select: { id: true, name: true } }),
  ]);
  const nameOf = (id: string) => stores.find((s) => s.id === id)?.name ?? '';
  const today = storeDateKey(new Date());
  const offKey = new Set(timeOff.map((t) => `${t.employeeId}|${storeDateKey(t.date)}`));

  const result = days.map((day) => {
    const weekday = DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()];
    const entries = people.map((p) => {
      const shift = templates.find((t) => t.employeeId === p.id && t.dayOfWeek === weekday) ?? null;
      const ins = checkIns.filter((c) => c.userId === p.id && c.storeDay === day);
      const off = offKey.has(`${p.id}|${day}`);
      if (!shift && ins.length === 0) return null;
      const last = ins[ins.length - 1];
      const status: DayStatus = off ? 'OFF'
        : !shift ? 'UNSCHEDULED'
        : last ? (last.storeId === shift.storeId ? 'ON_SITE' : 'ELSEWHERE')
        : day > today ? 'UPCOMING' : 'NO_CHECK_IN';
      return {
        userId: p.id, name: p.name, role: p.role, status,
        scheduled: shift ? { storeId: shift.storeId, storeName: nameOf(shift.storeId), shiftType: shift.shiftType, startTime: shift.startTime, endTime: shift.endTime } : null,
        checkIns: ins.map((c) => ({ storeId: c.storeId, storeName: nameOf(c.storeId), at: c.createdAt, method: c.method })),
      };
    }).filter((e): e is NonNullable<typeof e> => !!e)
      .filter((e) => !storeId || e.scheduled?.storeId === storeId || e.checkIns.some((c) => c.storeId === storeId))
      .sort((a, b) => (a.scheduled?.startTime ?? '99').localeCompare(b.scheduled?.startTime ?? '99') || (a.name ?? '').localeCompare(b.name ?? ''));
    return { day, entries };
  });
  res.json({ success: true, data: { from, to, today, days: result } });
}
