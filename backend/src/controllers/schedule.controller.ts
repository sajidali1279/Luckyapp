import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { DayOfWeek, ShiftType, ShiftRequestType, RequestStatus, Role } from '@prisma/client';
import { sendPushToUser } from '../utils/push';
import { audit } from '../utils/audit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JS_DAY_TO_ENUM: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getTodayDayOfWeek(): DayOfWeek {
  return JS_DAY_TO_ENUM[new Date().getDay()];
}

const SHIFT_LABELS: Record<ShiftType, string> = {
  OPENING: 'Opening',
  MIDDLE:  'Middle',
  CLOSING: 'Closing',
};

const SHIFT_TIMES: Record<ShiftType, { startTime: string; endTime: string }> = {
  OPENING: { startTime: '06:00', endTime: '14:00' },
  MIDDLE:  { startTime: '10:00', endTime: '18:00' },
  CLOSING: { startTime: '14:00', endTime: '22:00' },
};

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ─── GET /schedule/store/:storeId ─────────────────────────────────────────────

export async function getStoreSchedule(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const templates = await prisma.shiftTemplate.findMany({
    where: { storeId, isActive: true },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { shiftType: 'asc' }],
  });

  // Group by dayOfWeek
  const grouped: Record<string, typeof templates> = {};
  for (const day of Object.values(DayOfWeek)) {
    grouped[day] = templates.filter((t) => t.dayOfWeek === day);
  }

  res.json({ success: true, data: { templates, grouped } });
}

// ─── GET /schedule/store/:storeId/today ───────────────────────────────────────

export async function getTodayRoster(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const todayDay = getTodayDayOfWeek();

  // Start/end of today (UTC midnight boundaries)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  // All active templates for today
  const templates = await prisma.shiftTemplate.findMany({
    where: { storeId, isActive: true, dayOfWeek: todayDay },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
    },
  });

  // Employees with approved TIME_OFF for today
  const approvedTimeOff = await prisma.shiftRequest.findMany({
    where: {
      storeId,
      requestType: ShiftRequestType.TIME_OFF,
      status: RequestStatus.APPROVED,
      date: { gte: todayStart, lte: todayEnd },
    },
    select: { employeeId: true },
  });

  const offEmployeeIds = new Set(approvedTimeOff.map((r) => r.employeeId));

  const roster = templates
    .filter((t) => !offEmployeeIds.has(t.employeeId))
    .map((t) => ({
      templateId: t.id,
      employee: t.employee,
      shiftType: t.shiftType,
      startTime: t.startTime,
      endTime: t.endTime,
    }));

  res.json({ success: true, data: { day: todayDay, roster } });
}

// ─── POST /schedule/shifts ────────────────────────────────────────────────────

const assignShiftSchema = z.object({
  employeeId: z.string().uuid(),
  storeId: z.string().uuid(),
  dayOfWeek: z.nativeEnum(DayOfWeek),
  shiftType: z.nativeEnum(ShiftType),
});

export async function assignShift(req: AuthRequest, res: Response) {
  const parsed = assignShiftSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { employeeId, storeId, dayOfWeek, shiftType } = parsed.data;

  // Verify employee belongs to this store
  const storeRole = await prisma.userStoreRole.findUnique({
    where: { userId_storeId: { userId: employeeId, storeId } },
  });
  if (!storeRole) {
    res.status(400).json({ success: false, error: 'Employee is not assigned to this store' });
    return;
  }

  // Block if employee already has an active shift on this day at a different store
  const crossConflict = await prisma.shiftTemplate.findFirst({
    where: { employeeId, dayOfWeek, isActive: true, storeId: { not: storeId } },
    include: { store: { select: { name: true } } },
  });
  if (crossConflict) {
    res.status(400).json({
      success: false,
      error: `Employee is already scheduled at ${crossConflict.store.name} on ${dayOfWeek}s. Remove that shift first before assigning here.`,
    });
    return;
  }

  const { startTime, endTime } = SHIFT_TIMES[shiftType];

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });

  const template = await prisma.shiftTemplate.upsert({
    where: { employeeId_storeId_dayOfWeek: { employeeId, storeId, dayOfWeek } },
    create: { employeeId, storeId, dayOfWeek, shiftType, startTime, endTime },
    update: { shiftType, startTime, endTime, isActive: true },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
    },
  });

  // Notify the employee
  const DAY_LABELS: Record<string, string> = {
    MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday',
    THU: 'Thursday', FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
  };
  sendPushToUser(
    employeeId,
    'Shift Assigned 📅',
    `You've been scheduled for ${SHIFT_LABELS[shiftType]} (${startTime}–${endTime}) every ${DAY_LABELS[dayOfWeek]} at ${store?.name || 'your store'}.`,
    'SCHEDULE'
  );

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'ASSIGN_SHIFT', entity: 'shift_template', entityId: template.id,
    details: { employeeName: template.employee.name || template.employee.phone, dayOfWeek, shiftType },
    storeId, storeName: store?.name,
  });

  res.status(201).json({ success: true, data: template });
}

// ─── DELETE /schedule/shifts/:shiftId ─────────────────────────────────────────

export async function removeShift(req: AuthRequest, res: Response) {
  const { shiftId } = req.params;

  const existing = await prisma.shiftTemplate.findUnique({
    where: { id: shiftId },
    include: { employee: { select: { name: true, phone: true } }, store: { select: { id: true, name: true } } },
  });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Shift template not found' });
    return;
  }

  await prisma.shiftTemplate.delete({ where: { id: shiftId } });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'REMOVE_SHIFT', entity: 'shift_template', entityId: shiftId,
    details: { employeeName: existing.employee.name || existing.employee.phone, dayOfWeek: existing.dayOfWeek, shiftType: existing.shiftType },
    storeId: existing.storeId, storeName: existing.store.name,
  });

  res.json({ success: true, message: 'Shift removed' });
}

// ─── GET /schedule/my ─────────────────────────────────────────────────────────

export async function getMySchedule(req: AuthRequest, res: Response) {
  const employeeId = req.user!.id;

  const [templates, requests, storeRoles] = await Promise.all([
    prisma.shiftTemplate.findMany({
      where: { employeeId, isActive: true },
      include: { store: { select: { id: true, name: true, city: true } } },
      orderBy: { dayOfWeek: 'asc' },
    }),
    prisma.shiftRequest.findMany({
      where: { employeeId },
      include: { store: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.userStoreRole.findMany({
      where: { userId: employeeId },
      include: { store: { select: { id: true, name: true, city: true } } },
    }),
  ]);

  const stores = storeRoles.map((sr) => sr.store);

  res.json({ success: true, data: { templates, requests, stores } });
}

// ─── POST /schedule/requests ──────────────────────────────────────────────────

const createRequestSchema = z.object({
  storeId:     z.string().uuid(),
  requestType: z.nativeEnum(ShiftRequestType),
  date:        z.string().datetime(),
  shiftType:   z.nativeEnum(ShiftType),
  notes:       z.string().max(500).optional(),
});

export async function createShiftRequest(req: AuthRequest, res: Response) {
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { storeId, requestType, date, shiftType, notes } = parsed.data;
  const employeeId = req.user!.id;
  const requestDate = new Date(date);

  // Map request date to DayOfWeek
  const dayOfWeek = JS_DAY_TO_ENUM[requestDate.getDay()];

  if (requestType === ShiftRequestType.TIME_OFF) {
    // Employee must have a template for that day at that store
    const template = await prisma.shiftTemplate.findUnique({
      where: { employeeId_storeId_dayOfWeek: { employeeId, storeId, dayOfWeek } },
    });
    if (!template || !template.isActive) {
      res.status(400).json({ success: false, error: 'You are not scheduled for that day at this store' });
      return;
    }
  }

  if (requestType === ShiftRequestType.FILL_IN) {
    // Employee must NOT already be scheduled on that day at ANY store
    const alreadyScheduled = await prisma.shiftTemplate.findFirst({
      where: { employeeId, dayOfWeek, isActive: true },
      include: { store: { select: { name: true } } },
    });
    if (alreadyScheduled) {
      const conflictStore = alreadyScheduled.storeId === storeId
        ? 'this store'
        : alreadyScheduled.store.name;
      res.status(400).json({
        success: false,
        error: `You're already scheduled at ${conflictStore} on this day. You can't work two stores on the same day.`,
      });
      return;
    }
  }

  // Prevent duplicate pending request
  const dayStart = new Date(requestDate);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(requestDate);
  dayEnd.setHours(23, 59, 59, 999);

  const existing = await prisma.shiftRequest.findFirst({
    where: {
      employeeId, storeId, requestType,
      date: { gte: dayStart, lte: dayEnd },
      status: RequestStatus.PENDING,
    },
  });
  if (existing) {
    res.status(400).json({ success: false, error: 'You already have a pending request for that day' });
    return;
  }

  const request = await prisma.shiftRequest.create({
    data: { employeeId, storeId, requestType, date: requestDate, shiftType, notes, status: RequestStatus.PENDING },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
      store:    { select: { id: true, name: true } },
    },
  });

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CREATE_SHIFT_REQUEST', entity: 'shift_request', entityId: request.id,
    details: { requestType, shiftType, date: requestDate.toISOString() },
    storeId, storeName: request.store.name,
  });

  // FILL_IN: notify store managers + all super admins
  if (requestType === ShiftRequestType.FILL_IN) {
    const empName = request.employee.name || request.employee.phone || 'An employee';
    const storeName = request.store.name;
    const dateStr = fmtDate(requestDate);
    const title = '🙋 Fill-In Request';
    const body = `${empName} is requesting to fill the ${SHIFT_LABELS[shiftType]} shift on ${dateStr} at ${storeName}.`;

    // Store managers for this store
    const storeMgrs = await prisma.userStoreRole.findMany({
      where: { storeId, role: Role.STORE_MANAGER },
      select: { userId: true },
    });
    for (const m of storeMgrs) sendPushToUser(m.userId, title, body, 'SHIFT_REQUEST');

    // All super admins
    const superAdmins = await prisma.user.findMany({
      where: { role: Role.SUPER_ADMIN, isActive: true },
      select: { id: true },
    });
    for (const a of superAdmins) sendPushToUser(a.id, title, body, 'SHIFT_REQUEST');
  }

  res.status(201).json({ success: true, data: request });
}

// ─── GET /schedule/store/:storeId/requests ────────────────────────────────────

export async function getStoreRequests(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const requests = await prisma.shiftRequest.findMany({
    where: { storeId },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by status
  const grouped = {
    PENDING:  requests.filter((r) => r.status === RequestStatus.PENDING),
    APPROVED: requests.filter((r) => r.status === RequestStatus.APPROVED),
    DENIED:   requests.filter((r) => r.status === RequestStatus.DENIED),
  };

  res.json({ success: true, data: { requests, grouped } });
}

// ─── PATCH /schedule/requests/:requestId ──────────────────────────────────────

const updateRequestSchema = z.object({
  status: z.enum(['APPROVED', 'DENIED']),
});

export async function updateShiftRequest(req: AuthRequest, res: Response) {
  const { requestId } = req.params;

  const parsed = updateRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const shiftRequest = await prisma.shiftRequest.findUnique({
    where: { id: requestId },
    include: {
      employee: { select: { id: true, name: true } },
      store:    { select: { id: true, name: true } },
    },
  });

  if (!shiftRequest) {
    res.status(404).json({ success: false, error: 'Request not found' });
    return;
  }

  const updated = await prisma.shiftRequest.update({
    where: { id: requestId },
    data: { status: parsed.data.status as RequestStatus },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
      store:    { select: { id: true, name: true } },
    },
  });

  const requestDate = new Date(shiftRequest.date);
  const dayOfWeek   = JS_DAY_TO_ENUM[requestDate.getDay()];
  const dateStr     = fmtDate(requestDate);
  const employeeName = shiftRequest.employee.name || 'Employee';
  const storeName    = shiftRequest.store.name;
  const shiftType    = shiftRequest.shiftType;
  const times        = SHIFT_TIMES[shiftType];

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: parsed.data.status === 'APPROVED' ? 'APPROVE_SHIFT_REQUEST' : 'DENY_SHIFT_REQUEST',
    entity: 'shift_request', entityId: requestId,
    details: { requestType: shiftRequest.requestType, employeeName, shiftType, date: shiftRequest.date },
    storeId: shiftRequest.storeId, storeName,
  });

  if (parsed.data.status === 'APPROVED') {

    // ── FILL_IN: create a shift template + conflict check ──────────────────────
    if (shiftRequest.requestType === ShiftRequestType.FILL_IN) {
      // Guard: employee may have been assigned to another store since the request was submitted
      const crossConflict = await prisma.shiftTemplate.findFirst({
        where: {
          employeeId: shiftRequest.employeeId,
          dayOfWeek,
          isActive: true,
          storeId: { not: shiftRequest.storeId },
        },
        include: { store: { select: { name: true } } },
      });
      if (crossConflict) {
        res.status(400).json({
          success: false,
          error: `Cannot approve: ${employeeName} is already scheduled at ${crossConflict.store.name} on ${dayOfWeek}s. Remove that shift first.`,
        });
        return;
      }

      // Upsert shift template so employee is now scheduled for that day
      await prisma.shiftTemplate.upsert({
        where: {
          employeeId_storeId_dayOfWeek: {
            employeeId: shiftRequest.employeeId,
            storeId:    shiftRequest.storeId,
            dayOfWeek,
          },
        },
        create: {
          employeeId: shiftRequest.employeeId,
          storeId:    shiftRequest.storeId,
          dayOfWeek,
          shiftType,
          startTime:  times.startTime,
          endTime:    times.endTime,
        },
        update: {
          shiftType,
          startTime: times.startTime,
          endTime:   times.endTime,
          isActive:  true,
        },
      });

      // Notify the employee
      sendPushToUser(
        shiftRequest.employeeId,
        'Fill-In Approved ✅',
        `Your request to fill the ${SHIFT_LABELS[shiftType]} shift (${times.startTime}–${times.endTime}) on ${dateStr} at ${storeName} has been approved.`,
        'SHIFT_REQUEST'
      );

      // Check if anyone else is already assigned to the same shift slot that day
      const conflicting = await prisma.shiftTemplate.findMany({
        where: {
          storeId:   shiftRequest.storeId,
          dayOfWeek,
          shiftType,
          isActive:  true,
          employeeId: { not: shiftRequest.employeeId },
        },
        include: { employee: { select: { name: true, phone: true } } },
      });

      if (conflicting.length > 0) {
        const conflictNames = conflicting
          .map((t) => t.employee.name || t.employee.phone)
          .join(', ');

        const superAdmins = await prisma.user.findMany({
          where: { role: Role.SUPER_ADMIN, isActive: true },
          select: { id: true },
        });

        const conflictTitle = '⚠️ Shift Overlap at ' + storeName;
        const conflictBody  = `${employeeName} was approved for the ${SHIFT_LABELS[shiftType]} shift on ${dateStr}, but ${conflictNames} is already assigned to that same slot.`;

        for (const a of superAdmins) {
          sendPushToUser(a.id, conflictTitle, conflictBody, 'SHIFT_REQUEST');
        }
      }
    }

    // ── TIME_OFF: notify coworkers that the shift is open ─────────────────────
    if (shiftRequest.requestType === ShiftRequestType.TIME_OFF) {
      // Notify the employee their time off was approved
      sendPushToUser(
        shiftRequest.employeeId,
        'Time Off Approved ✅',
        `Your time-off request for ${dateStr} (${SHIFT_LABELS[shiftType]} shift) at ${storeName} has been approved.`,
        'SHIFT_REQUEST'
      );

      // Notify coworkers scheduled that day (excluding those already off)
      const scheduledEmployees = await prisma.shiftTemplate.findMany({
        where: {
          storeId: shiftRequest.storeId,
          dayOfWeek,
          isActive: true,
          employeeId: { not: shiftRequest.employeeId },
        },
        select: { employeeId: true },
      });

      const dayStart = new Date(requestDate); dayStart.setHours(0, 0, 0, 0);
      const dayEnd   = new Date(requestDate); dayEnd.setHours(23, 59, 59, 999);

      const alreadyOff = await prisma.shiftRequest.findMany({
        where: {
          storeId: shiftRequest.storeId,
          requestType: ShiftRequestType.TIME_OFF,
          status: RequestStatus.APPROVED,
          date: { gte: dayStart, lte: dayEnd },
        },
        select: { employeeId: true },
      });

      const alreadyOffIds = new Set(alreadyOff.map((r) => r.employeeId));
      const coworkerIds   = scheduledEmployees
        .map((t) => t.employeeId)
        .filter((id) => !alreadyOffIds.has(id));

      for (const empId of coworkerIds) {
        sendPushToUser(
          empId,
          'Shift Available 📅',
          `${employeeName}'s ${SHIFT_LABELS[shiftType]} shift (${times.startTime}–${times.endTime}) on ${dateStr} at ${storeName} is open.`,
          'SCHEDULE'
        );
      }
    }
  }

  res.json({ success: true, data: updated });
}

// ─── GET /schedule/store/:storeId/employees ───────────────────────────────────

export async function getStoreEmployees(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const storeRoles = await prisma.userStoreRole.findMany({
    where: {
      storeId,
      role: { in: [Role.EMPLOYEE, Role.STORE_MANAGER] },
      user: { isActive: true },
    },
    include: {
      user: { select: { id: true, name: true, phone: true, role: true } },
    },
    orderBy: { user: { name: 'asc' } },
  });

  const employees = storeRoles.map((sr) => sr.user);

  res.json({ success: true, data: employees });
}

// ─── GET /schedule/store/:storeId/day ─────────────────────────────────────────
// Returns who is on each shift for a specific date (defaults to today).
// Used by employees to see shift availability before requesting a fill-in.

export async function getDayRoster(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const dateStr = req.query.date as string | undefined;
  const date = dateStr ? new Date(dateStr) : new Date();
  const dayOfWeek = JS_DAY_TO_ENUM[date.getDay()];

  const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(date); dayEnd.setHours(23, 59, 59, 999);

  // All active templates for this day
  const templates = await prisma.shiftTemplate.findMany({
    where: { storeId, isActive: true, dayOfWeek },
    include: { employee: { select: { id: true, name: true, phone: true } } },
  });

  // Employees with approved TIME_OFF that day
  const approvedTimeOff = await prisma.shiftRequest.findMany({
    where: {
      storeId,
      requestType: ShiftRequestType.TIME_OFF,
      status: RequestStatus.APPROVED,
      date: { gte: dayStart, lte: dayEnd },
    },
    select: { employeeId: true },
  });
  const offIds = new Set(approvedTimeOff.map((r) => r.employeeId));

  // Group by shift, excluding people who are off
  const shifts: Record<string, { employees: { id: string; name: string | null; phone: string }[]; startTime: string; endTime: string }> = {
    OPENING: { employees: [], ...SHIFT_TIMES.OPENING },
    MIDDLE:  { employees: [], ...SHIFT_TIMES.MIDDLE  },
    CLOSING: { employees: [], ...SHIFT_TIMES.CLOSING },
  };

  for (const t of templates) {
    if (!offIds.has(t.employeeId)) {
      shifts[t.shiftType].employees.push(t.employee);
    }
  }

  res.json({ success: true, data: { dayOfWeek, date: date.toISOString(), shifts } });
}

// ─── GET /schedule/vacancies ──────────────────────────────────────────────────
// Returns vacant shift slots (store+day+shiftType combos with no employee assigned).
// Platform admins see all stores; managers/employees see only their stores.

const ALL_DAYS: DayOfWeek[] = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const ALL_SHIFTS: ShiftType[] = ['OPENING', 'MIDDLE', 'CLOSING'];
const PLATFORM_ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN'];

export async function getVacancies(req: AuthRequest, res: Response) {
  const user = req.user!;

  let stores: { id: string; name: string; city: string; shiftsPerDay: number }[];

  if (PLATFORM_ADMIN_ROLES.includes(user.role)) {
    stores = await prisma.store.findMany({
      where: { isActive: true },
      select: { id: true, name: true, city: true, shiftsPerDay: true },
      orderBy: { name: 'asc' },
    });
  } else {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { userId: user.id },
      include: { store: { select: { id: true, name: true, city: true, shiftsPerDay: true } } },
    });
    stores = storeRoles.map((sr) => sr.store);
  }

  const storeIds = stores.map((s) => s.id);
  if (storeIds.length === 0) {
    res.json({ success: true, data: { stores: [], totalVacancies: 0 } });
    return;
  }

  // All active templates across these stores
  const templates = await prisma.shiftTemplate.findMany({
    where: { storeId: { in: storeIds }, isActive: true },
    select: { storeId: true, dayOfWeek: true, shiftType: true },
  });

  const filled = new Set(templates.map((t) => `${t.storeId}|${t.dayOfWeek}|${t.shiftType}`));

  // 2-shift stores use OPENING + CLOSING only (no MIDDLE)
  const shiftsFor = (n: number): ShiftType[] => n === 2 ? ['OPENING', 'CLOSING'] : ALL_SHIFTS;

  const result = stores.map((store) => {
    const vacancies: { dayOfWeek: DayOfWeek; shiftType: ShiftType }[] = [];
    for (const day of ALL_DAYS) {
      for (const shift of shiftsFor(store.shiftsPerDay)) {
        if (!filled.has(`${store.id}|${day}|${shift}`)) {
          vacancies.push({ dayOfWeek: day, shiftType: shift });
        }
      }
    }
    return { storeId: store.id, storeName: store.name, city: store.city, shiftsPerDay: store.shiftsPerDay, vacancies, vacantCount: vacancies.length };
  });

  const totalVacancies = result.reduce((sum, s) => sum + s.vacantCount, 0);
  res.json({ success: true, data: { stores: result, totalVacancies } });
}
