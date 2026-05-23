import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OrderItemPriority, OrderItemSource, RejectionReason } from '@prisma/client';

// ─── POST /employee-requests ──────────────────────────────────────────────────

const submitSchema = z.object({
  note:  z.string().max(300).optional(),
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
      lines: { create: parsed.data.lines.map(l => ({ name: l.name.trim(), quantity: l.quantity?.trim(), category: l.category?.trim(), notes: l.notes?.trim() })) },
    },
    include: { submittedBy: { select: { id: true, name: true } }, lines: true },
  });
  res.status(201).json({ success: true, data: request });
}

// ─── GET /employee-requests/store/:storeId ────────────────────────────────────

export async function getStoreRequests(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status } = req.query;
  const where: Record<string, unknown> = { storeId };
  if (status === 'PENDING' || status === 'REVIEWED') where.status = status;
  const requests = await prisma.employeeItemRequest.findMany({
    where, include: { submittedBy: { select: { id: true, name: true, role: true } }, reviewedBy: { select: { id: true, name: true } }, lines: true },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  res.json({ success: true, data: requests });
}

// ─── GET /employee-requests/mine ─────────────────────────────────────────────

export async function getMyRequests(req: AuthRequest, res: Response) {
  const requests = await prisma.employeeItemRequest.findMany({
    where: { submittedById: req.user!.id },
    include: { lines: true, reviewedBy: { select: { id: true, name: true } } },
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

// ─── PATCH /employee-requests/:requestId/review ───────────────────────────────

const reviewLineSchema = z.object({
  id:              z.string().uuid(),
  action:          z.enum(['ACCEPT', 'REJECT']),
  rejectionReason: z.nativeEnum(RejectionReason).optional(),
  rejectionNote:   z.string().max(300).optional(),
});

const reviewSchema = z.object({
  listId: z.string().uuid(),
  lines:  z.array(reviewLineSchema).min(1),
});

export async function reviewRequest(req: AuthRequest, res: Response) {
  const { requestId } = req.params;
  const parsed = reviewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }

  const request = await prisma.employeeItemRequest.findUnique({ where: { id: requestId }, include: { lines: true } });
  if (!request) { res.status(404).json({ success: false, error: 'Request not found' }); return; }

  const targetList = await prisma.orderList.findUnique({ where: { id: parsed.data.listId } });
  if (!targetList) { res.status(404).json({ success: false, error: 'Target list not found' }); return; }
  if (targetList.status !== 'OPEN') { res.status(400).json({ success: false, error: 'Target list is closed' }); return; }
  if (targetList.storeId !== request.storeId) { res.status(400).json({ success: false, error: 'List belongs to a different store' }); return; }

  const user = req.user!;
  const now  = new Date();
  const max  = await prisma.orderListItem.aggregate({ where: { listId: parsed.data.listId }, _max: { sortOrder: true } });
  let sortOrder = (max._max.sortOrder ?? 0) + 1;

  const updates = await prisma.$transaction(async (tx) => {
    const results: { lineId: string; action: string; listItemId?: string }[] = [];
    for (const line of parsed.data.lines) {
      const src = request.lines.find(l => l.id === line.id);
      if (!src || src.status !== 'PENDING') continue;

      if (line.action === 'ACCEPT') {
        const listItem = await tx.orderListItem.create({
          data: {
            listId: parsed.data.listId, name: src.name, quantity: src.quantity,
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

  res.json({ success: true, data: { requestId, results: updates } });
}
