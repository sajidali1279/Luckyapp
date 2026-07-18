import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OrderItemPriority, OrderItemSource, RejectionReason, EmployeeRequestType, Role } from '@prisma/client';
import { generateListName } from './orderList.controller';
import { sendPushToUser } from '../utils/push';
import { stockRequestUrlManager, stockRequestUrlEmployee } from '../utils/notificationRoutes';

// ─── GET /employee-requests/suggestions ──────────────────────────────────────
//
//  Returns item-name suggestions with their most common category, drawn from
//  real order-list history (what was actually ordered).  Employees can't call
//  the manager-only /order-lists/suggestions endpoint, so this is their path.
//
export async function getEmployeeSuggestions(req: AuthRequest, res: Response) {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) { res.json({ success: true, data: [] }); return; }

  // Pull name + category pairs from real order history, rank by frequency.
  // GROUP BY name + category so "Milk → Dairy" and "Milk → Produce" are
  // separate rows; the front-end picks the top match per name.
  const results = await prisma.$queryRaw<{ name: string; category: string | null; count: bigint }[]>`
    SELECT name, category, COUNT(*) AS count
    FROM order_list_items
    WHERE name ILIKE ${'%' + q + '%'}
      AND status != 'REMOVED'
    GROUP BY name, category
    ORDER BY count DESC
    LIMIT 10
  `;

  // Deduplicate by name — keep the highest-count category for each name
  const seen = new Map<string, { name: string; category: string | null; count: number }>();
  for (const r of results) {
    const key = r.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: r.name, category: r.category, count: Number(r.count) });
  }

  res.json({ success: true, data: [...seen.values()].slice(0, 8) });
}

// ─── POST /employee-requests ──────────────────────────────────────────────────

const submitSchema = z.object({
  note:        z.string().max(300).optional(),
  requestType: z.enum(['LOW_STOCK', 'CUSTOMER_REQUEST']).default('LOW_STOCK'),
  lines: z.array(z.object({
    name:     z.string().min(1).max(120),
    quantity: z.string().max(60).optional(),
    category: z.string().max(80).optional(),
    notes:    z.string().max(300).optional(),
  })).min(1).max(30),
});

export async function submitRequest(req: AuthRequest, res: Response) {
  const user = req.user!;
  const storeRole = await prisma.userStoreRole.findFirst({ where: { userId: user.id } });
  if (!storeRole) { res.status(403).json({ success: false, error: 'Not assigned to a store' }); return; }
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const request = await prisma.employeeItemRequest.create({
    data: {
      storeId: storeRole.storeId, submittedById: user.id, note: parsed.data.note,
      requestType: parsed.data.requestType as EmployeeRequestType,
      lines: { create: parsed.data.lines.map((l: any) => ({ name: l.name.trim(), quantity: l.quantity?.trim(), category: l.category?.trim(), notes: l.notes?.trim() })) },
    },
    include: { submittedBy: { select: { id: true, name: true } }, lines: true, store: { select: { name: true } } },
  });

  // Notify store managers
  const assignments = await prisma.userStoreRole.findMany({
    where: { storeId: storeRole.storeId },
    select: { userId: true, user: { select: { role: true } } },
  });
  const managerIds = assignments.filter(a => a.user.role === Role.STORE_MANAGER).map(a => a.userId);
  const itemCount = parsed.data.lines.length;
  managerIds.forEach(id =>
    sendPushToUser(id, '📦 New Stock Request', `${user.name || 'An employee'} requested ${itemCount} item${itemCount !== 1 ? 's' : ''} for restocking`, 'STOCK_REQUEST', stockRequestUrlManager(request.id))
  );

  res.status(201).json({ success: true, data: request });
}

// ─── GET /employee-requests/store/:storeId ────────────────────────────────────

export async function getStoreRequests(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status } = req.query;
  const where: Record<string, unknown> = { storeId };
  if (status === 'PENDING' || status === 'REVIEWED') where.status = status;
  const requests = await prisma.employeeItemRequest.findMany({
    where,
    include: {
      submittedBy: { select: { id: true, name: true, role: true } },
      reviewedBy:  { select: { id: true, name: true } },
      lines: true,
      store: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ success: true, data: requests });
}

// ─── GET /employee-requests/admin/all ────────────────────────────────────────
// Admin view: all requests across all stores, filterable by status and store

export async function adminGetAllRequests(req: AuthRequest, res: Response) {
  const { status, storeId } = req.query as { status?: string; storeId?: string };
  const where: Record<string, unknown> = {};
  if (status === 'PENDING' || status === 'REVIEWED') where.status = status;
  if (storeId) where.storeId = storeId;
  const requests = await prisma.employeeItemRequest.findMany({
    where,
    include: {
      submittedBy: { select: { id: true, name: true, role: true } },
      reviewedBy:  { select: { id: true, name: true } },
      lines: true,
      store: { select: { id: true, name: true } },
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 200,
  });
  res.json({ success: true, data: requests });
}

// ─── GET /employee-requests/mine ─────────────────────────────────────────────

export async function getMyRequests(req: AuthRequest, res: Response) {
  const requests = await prisma.employeeItemRequest.findMany({
    where: { submittedById: req.user!.id },
    include: {
      lines: {
        include: {
          listItem: { select: { status: true, orderedAt: true, receivedAt: true } },
        },
      },
      reviewedBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' }, take: 30,
  });
  res.json({ success: true, data: requests });
}

// ─── GET /employee-requests/store/:storeId/rejected ──────────────────────────

export async function getRejectedLines(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const lines = await prisma.employeeRequestLine.findMany({
    where: { status: 'REJECTED', request: { storeId } },
    include: { request: { select: { id: true, createdAt: true, submittedBy: { select: { id: true, name: true } } } } },
    orderBy: { reviewedAt: 'desc' }, take: 100,
  });
  res.json({ success: true, data: lines });
}

// ─── GET /employee-requests/pending-count ────────────────────────────────────

export async function getItemRequestsPendingCount(req: AuthRequest, res: Response) {
  const user = req.user!;
  const isAdmin = user.role === Role.DEV_ADMIN || user.role === Role.SUPER_ADMIN;

  // Admins see the global count across all stores — no UserStoreRole lookup needed
  if (isAdmin) {
    const count = await prisma.employeeItemRequest.count({ where: { status: 'PENDING' } });
    res.json({ success: true, data: { count } });
    return;
  }

  const storeRoles = await prisma.userStoreRole.findMany({
    where: { userId: user.id },
    select: { storeId: true },
  });
  const storeIds = storeRoles.map(r => r.storeId);
  if (storeIds.length === 0) { res.json({ success: true, data: { count: 0 } }); return; }
  const count = await prisma.employeeItemRequest.count({
    where: { storeId: { in: storeIds }, status: 'PENDING' },
  });
  res.json({ success: true, data: { count } });
}

// ─── PATCH /employee-requests/:requestId/review ───────────────────────────────

const reviewLineSchema = z.object({
  id:              z.string().uuid(),
  action:          z.enum(['ACCEPT', 'REJECT']),
  rejectionReason: z.nativeEnum(RejectionReason).optional(),
  rejectionNote:   z.string().max(300).optional(),
});

const reviewSchema = z.object({
  listId: z.string().uuid().optional(),
  lines:  z.array(reviewLineSchema).min(1),
});

export async function reviewRequest(req: AuthRequest, res: Response) {
  const { requestId } = req.params;
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const request = await prisma.employeeItemRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!request) { res.status(404).json({ success: false, error: 'Request not found' }); return; }

  const user = req.user!;

  // Resolve the target list — use provided listId, or auto-find/create the store's OPEN list
  let targetListId = parsed.data.listId;
  if (!targetListId) {
    let activeList = await prisma.orderList.findFirst({
      where: { storeId: request.storeId, status: 'OPEN' },
      select: { id: true },
    });
    if (!activeList) {
      const name = await generateListName(request.storeId);
      activeList = await prisma.orderList.create({
        data: { storeId: request.storeId, name, openedById: user.id },
        select: { id: true },
      });
    }
    targetListId = activeList.id;
  } else {
    // Validate the explicitly provided listId
    const targetList = await prisma.orderList.findUnique({ where: { id: targetListId } });
    if (!targetList) { res.status(404).json({ success: false, error: 'Target list not found' }); return; }
    if (targetList.status !== 'OPEN') { res.status(400).json({ success: false, error: 'Target list is closed' }); return; }
    if (targetList.storeId !== request.storeId) { res.status(400).json({ success: false, error: 'List belongs to a different store' }); return; }
  }

  const now  = new Date();
  const max  = await prisma.orderListItem.aggregate({ where: { listId: targetListId }, _max: { sortOrder: true } });
  let sortOrder = (max._max.sortOrder ?? 0) + 1;

  const updates = await prisma.$transaction(async (tx) => {
    const results: { lineId: string; action: string; listItemId?: string }[] = [];
    for (const line of parsed.data.lines) {
      const src = request.lines.find(l => l.id === line.id);
      if (!src || src.status !== 'PENDING') continue;

      if (line.action === 'ACCEPT') {
        const listItem = await tx.orderListItem.create({
          data: {
            listId: targetListId, name: src.name, quantity: src.quantity,
            category: src.category, notes: src.notes, priority: OrderItemPriority.NORMAL,
            source: OrderItemSource.EMPLOYEE_REQUEST, requestLineId: src.id,
            addedById: user.id, sortOrder: sortOrder++,
          },
        });
        await tx.employeeRequestLine.update({ where: { id: src.id }, data: { status: 'ACCEPTED', reviewedAt: now } });
        results.push({ lineId: src.id, action: 'ACCEPTED', listItemId: listItem.id });
      } else {
        await tx.employeeRequestLine.update({
          where: { id: src.id },
          data: { status: 'REJECTED', rejectionReason: line.rejectionReason ?? 'OTHER', rejectionNote: line.rejectionNote ?? null, reviewedAt: now },
        });
        results.push({ lineId: src.id, action: 'REJECTED' });
      }
    }
    await tx.employeeItemRequest.update({
      where: { id: requestId },
      data: { status: 'REVIEWED', reviewedById: user.id, reviewedAt: now },
    });
    return results;
  });

  const acceptedCount = updates.filter(r => r.action === 'ACCEPTED').length;
  const total = updates.length;
  const notifTitle = acceptedCount === total ? '✅ Stock Request Approved!'
    : acceptedCount === 0 ? '❌ Stock Request Declined'
    : '📦 Stock Request Reviewed';
  const notifBody = acceptedCount === total
    ? `All ${total} item${total !== 1 ? 's' : ''} accepted and added to the order list!`
    : `${acceptedCount} of ${total} item${total !== 1 ? 's' : ''} accepted for ordering.`;
  sendPushToUser(request.submittedById, notifTitle, notifBody, 'STOCK_REQUEST', stockRequestUrlEmployee(requestId));

  res.json({ success: true, data: { requestId, results: updates, listId: targetListId } });
}
