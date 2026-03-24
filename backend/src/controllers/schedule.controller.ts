import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { DayOfWeek, ShiftType, ShiftRequestType, RequestStatus, Role } from '@prisma/client';
import { sendPushToUser } from '../utils/push';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const JS_DAY_TO_ENUM: DayOfWeek[] = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function getTodayDayOfWeek(): DayOfWeek {
  return JS_DAY_TO_ENUM[new Date().getDay()];
}

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

  const { startTime, endTime } = SHIFT_TIMES[shiftType];

  const template = await prisma.shiftTemplate.upsert({
    where: { employeeId_storeId_dayOfWeek: { employeeId, storeId, dayOfWeek } },
    create: { employeeId, storeId, dayOfWeek, shiftType, startTime, endTime },
    update: { shiftType, startTime, endTime, isActive: true },
    include: {
      employee: { select: { id: true, name: true, phone: true } },
    },
  });

  res.status(201).json({ success: true, data: template });
}

// ─── DELETE /schedule/shifts/:shiftId ─────────────────────────────────────────

export async function removeShift(req: AuthRequest, res: Response) {
  const { shiftId } = req.params;

  const existing = await prisma.shiftTemplate.findUnique({ where: { id: shiftId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Shift template not found' });
    return;
  }

  await prisma.shiftTemplate.delete({ where: { id: shiftId } });

  res.json({ success: true, message: 'Shift removed' });
}

// ─── GET /schedule/my ─────────────────────────────────────────────────────────

export async function getMySchedule(req: AuthRequest, res: Response) {
  const employeeId = req.user!.id;

  const templates = await prisma.shiftTemplate.findMany({
    where: { employeeId, isActive: true },
    include: {
      store: { select: { id: true, name: true, city: true } },
    },
    orderBy: { dayOfWeek: 'asc' },
  });

  const requests = await prisma.shiftRequest.findMany({
    where: { employeeId },
    include: {
      store: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  res.json({ success: true, data: { templates, requests } });
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
    // Check there is an open shift: someone has an approved TIME_OFF for that day
    const dayStart = new Date(requestDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(requestDate);
    dayEnd.setHours(23, 59, 59, 999);

    const openShift = await prisma.shiftRequest.findFirst({
      where: {
        storeId,
        requestType: ShiftRequestType.TIME_OFF,
        status: RequestStatus.APPROVED,
        date: { gte: dayStart, lte: dayEnd },
      },
    });
    if (!openShift) {
      res.status(400).json({ success: false, error: 'No open shifts available for that day at this store' });
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
      store: { select: { id: true, name: true } },
    },
  });

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

  // If approving a TIME_OFF, notify other employees at that store scheduled that day
  if (parsed.data.status === 'APPROVED' && shiftRequest.requestType === ShiftRequestType.TIME_OFF) {
    const requestDate = new Date(shiftRequest.date);
    const dayOfWeek = JS_DAY_TO_ENUM[requestDate.getDay()];

    // Find all employees scheduled that day at this store (excluding the one who requested off)
    const scheduledEmployees = await prisma.shiftTemplate.findMany({
      where: {
        storeId: shiftRequest.storeId,
        dayOfWeek,
        isActive: true,
        employeeId: { not: shiftRequest.employeeId },
      },
      select: { employeeId: true },
    });

    // Also exclude employees who already have an approved TIME_OFF for that same day
    const dayStart = new Date(requestDate);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(requestDate);
    dayEnd.setHours(23, 59, 59, 999);

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
    const targetEmployeeIds = scheduledEmployees
      .map((t) => t.employeeId)
      .filter((id) => !alreadyOffIds.has(id));

    const employeeName = shiftRequest.employee.name || 'Someone';
    const storeName = shiftRequest.store.name;
    const dateStr = fmtDate(requestDate);
    const shiftType = shiftRequest.shiftType;
    const times = SHIFT_TIMES[shiftType];

    const title = 'Shift Available 📅';
    const body = `${employeeName}'s ${shiftType} shift (${times.startTime}–${times.endTime}) on ${dateStr} at ${storeName} is open. Check your schedule to volunteer!`;

    // Fire-and-forget push notifications
    for (const empId of targetEmployeeIds) {
      sendPushToUser(empId, title, body);
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
