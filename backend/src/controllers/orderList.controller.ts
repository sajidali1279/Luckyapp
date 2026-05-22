import { Response } from 'express';
import { AuthRequest } from '../types';
import prisma from '../config/prisma';
import { Prisma, Role, OrderItemStatus, OrderItemPriority } from '@prisma/client';
import { z } from 'zod';
import { sendPushToUser } from '../utils/push';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Employees can only access their assigned store(s). Managers access any. */
async function assertStoreAccess(req: AuthRequest, storeId: string) {
  const { role, id: userId } = req.user!;
  if (role === Role.DEV_ADMIN || role === Role.SUPER_ADMIN) return;
  const link = await prisma.userStoreRole.findFirst({ where: { userId, storeId } });
  if (!link) throw Object.assign(new Error('No access to this store'), { status: 403 });
}

// ─── GET /order-list/summary (manager: all stores pending counts) ─────────────
export async function getOrderSummary(req: AuthRequest, res: Response) {
  const { role, id: userId } = req.user!;

  const where: Prisma.StoreWhereInput = { isActive: true };
  if (role !== Role.DEV_ADMIN && role !== Role.SUPER_ADMIN) {
    const links = await prisma.userStoreRole.findMany({ where: { userId }, select: { storeId: true } });
    where.id = { in: links.map(l => l.storeId) };
  }

  const stores = await prisma.store.findMany({
    where,
    select: {
      id: true, name: true,
      orderItems: {
        where: { status: { in: [OrderItemStatus.PENDING, OrderItemStatus.PRINTED, OrderItemStatus.ORDERED] } },
        select: { status: true, priority: true },
      },
    },
    orderBy: { name: 'asc' },
  });

  const summary = stores.map(s => ({
    storeId: s.id,
    storeName: s.name,
    pendingCount: s.orderItems.filter(i => i.status === OrderItemStatus.PENDING).length,
    urgentCount:  s.orderItems.filter(i => i.priority === OrderItemPriority.URGENT && i.status === OrderItemStatus.PENDING).length,
    printedCount: s.orderItems.filter(i => i.status === OrderItemStatus.PRINTED).length,
    orderedCount: s.orderItems.filter(i => i.status === OrderItemStatus.ORDERED).length,
  }));

  res.json({ success: true, data: summary });
}

// ─── GET /order-list/store/:storeId ──────────────────────────────────────────
export async function getStoreItems(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status } = req.query as { status?: string };

  await assertStoreAccess(req, storeId);

  const statusFilter = status
    ? { status: status as OrderItemStatus }
    : { status: { notIn: [OrderItemStatus.REMOVED] as OrderItemStatus[] } };

  const items = await prisma.orderItem.findMany({
    where: { storeId, ...statusFilter },
    include: {
      addedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: [
      { priority: 'asc' },   // URGENT < NORMAL < LOW alphabetically — we sort on frontend
      { sortOrder: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  res.json({ success: true, data: items });
}

// ─── POST /order-list/store/:storeId ─────────────────────────────────────────
const addItemSchema = z.object({
  name:     z.string().min(1).max(120),
  quantity: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  notes:    z.string().max(300).optional(),
  priority: z.nativeEnum(OrderItemPriority).optional(),
});

export async function addItem(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  await assertStoreAccess(req, storeId);

  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  // Get highest current sortOrder
  const last = await prisma.orderItem.findFirst({
    where: { storeId, status: { not: OrderItemStatus.REMOVED } },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const item = await prisma.orderItem.create({
    data: {
      storeId,
      addedById: req.user!.id,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      ...parsed.data,
    },
    include: { addedBy: { select: { id: true, name: true, role: true } } },
  });

  res.status(201).json({ success: true, data: item });
}

// ─── PATCH /order-list/items/:itemId ─────────────────────────────────────────
const updateItemSchema = z.object({
  name:      z.string().min(1).max(120).optional(),
  quantity:  z.string().max(60).nullable().optional(),
  category:  z.string().max(60).nullable().optional(),
  notes:     z.string().max(300).nullable().optional(),
  priority:  z.nativeEnum(OrderItemPriority).optional(),
});

export async function updateItem(req: AuthRequest, res: Response) {
  const { itemId } = req.params;
  const { role, id: userId } = req.user!;

  const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
  if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }

  await assertStoreAccess(req, item.storeId);

  // Employees can only edit their own PENDING items
  if (role === Role.EMPLOYEE && (item.addedById !== userId || item.status !== OrderItemStatus.PENDING)) {
    res.status(403).json({ success: false, error: 'You can only edit your own pending items' });
    return;
  }

  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const updated = await prisma.orderItem.update({
    where: { id: itemId },
    data: parsed.data,
    include: { addedBy: { select: { id: true, name: true, role: true } } },
  });

  res.json({ success: true, data: updated });
}

// ─── DELETE /order-list/items/:itemId ────────────────────────────────────────
export async function removeItem(req: AuthRequest, res: Response) {
  const { itemId } = req.params;
  const { role, id: userId } = req.user!;

  const item = await prisma.orderItem.findUnique({ where: { id: itemId } });
  if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }

  await assertStoreAccess(req, item.storeId);

  // Employees can only remove their own PENDING items
  if (role === Role.EMPLOYEE && (item.addedById !== userId || item.status !== OrderItemStatus.PENDING)) {
    res.status(403).json({ success: false, error: 'You can only remove your own pending items' });
    return;
  }

  await prisma.orderItem.update({ where: { id: itemId }, data: { status: OrderItemStatus.REMOVED } });
  res.json({ success: true });
}

// ─── PATCH /order-list/store/:storeId/reorder (manager only) ─────────────────
export async function reorderItems(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { items } = req.body as { items: { id: string; sortOrder: number }[] };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'items array required' });
    return;
  }

  await prisma.$transaction(
    items.map(({ id, sortOrder }) =>
      prisma.orderItem.updateMany({ where: { id, storeId }, data: { sortOrder } })
    )
  );

  res.json({ success: true });
}

// ─── POST /order-list/store/:storeId/print (manager only) ────────────────────
export async function printItems(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { notes } = req.body as { notes?: string };

  const pending = await prisma.orderItem.findMany({
    where: { storeId, status: OrderItemStatus.PENDING },
    include: { addedBy: { select: { id: true, name: true } } },
    orderBy: [{ priority: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });

  if (pending.length === 0) {
    res.status(400).json({ success: false, error: 'No pending items to print' });
    return;
  }

  const now = new Date();

  // Create print job with snapshots
  const printJob = await prisma.printJob.create({
    data: {
      storeId,
      printedById: req.user!.id,
      notes,
      itemCount: pending.length,
      items: {
        create: pending.map(item => ({
          orderItemId: item.id,
          snapshot: {
            name: item.name,
            quantity: item.quantity,
            category: item.category,
            notes: item.notes,
            priority: item.priority,
            addedByName: item.addedBy.name,
          },
        })),
      },
    },
    include: {
      items: { include: { orderItem: { include: { addedBy: { select: { id: true, name: true } } } } } },
    },
  });

  // Mark all pending items as PRINTED
  await prisma.orderItem.updateMany({
    where: { id: { in: pending.map(i => i.id) } },
    data: { status: OrderItemStatus.PRINTED, printedAt: now },
  });

  // Notify employees that their items were printed (grouped by adder)
  const byAdder = new Map<string, string[]>();
  for (const item of pending) {
    if (!byAdder.has(item.addedById)) byAdder.set(item.addedById, []);
    byAdder.get(item.addedById)!.push(item.name);
  }
  for (const [uid, names] of byAdder) {
    const body = names.length === 1
      ? `"${names[0]}" is on the printed order list.`
      : `${names.length} of your requests are on the printed order list.`;
    sendPushToUser(uid, 'Order List Printed', body, 'ORDER_PRINTED').catch(() => {});
  }

  res.json({ success: true, data: printJob });
}

// ─── POST /order-list/items/mark-ordered (manager only) ──────────────────────
export async function markOrdered(req: AuthRequest, res: Response) {
  const { itemIds } = req.body as { itemIds: string[] };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ success: false, error: 'itemIds array required' });
    return;
  }

  const items = await prisma.orderItem.findMany({
    where: { id: { in: itemIds }, status: OrderItemStatus.PRINTED },
    include: { addedBy: { select: { id: true, name: true } } },
  });

  if (items.length === 0) {
    res.status(400).json({ success: false, error: 'No printed items found with those IDs' });
    return;
  }

  await prisma.orderItem.updateMany({
    where: { id: { in: items.map(i => i.id) } },
    data: { status: OrderItemStatus.ORDERED, orderedAt: new Date() },
  });

  // Notify each employee whose item was ordered
  const byAdder = new Map<string, string[]>();
  for (const item of items) {
    if (!byAdder.has(item.addedById)) byAdder.set(item.addedById, []);
    byAdder.get(item.addedById)!.push(item.name);
  }
  for (const [uid, names] of byAdder) {
    const body = names.length === 1
      ? `"${names[0]}" has been ordered and is on its way.`
      : `${names.length} of your requests have been ordered.`;
    sendPushToUser(uid, 'Items Ordered! 🎉', body, 'ORDER_ORDERED').catch(() => {});
  }

  res.json({ success: true, updated: items.length });
}

// ─── POST /order-list/items/mark-received (manager only) ─────────────────────
export async function markReceived(req: AuthRequest, res: Response) {
  const { itemIds } = req.body as { itemIds: string[] };
  if (!Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ success: false, error: 'itemIds array required' });
    return;
  }

  await prisma.orderItem.updateMany({
    where: { id: { in: itemIds }, status: OrderItemStatus.ORDERED },
    data: { status: OrderItemStatus.RECEIVED, receivedAt: new Date() },
  });

  res.json({ success: true });
}

// ─── GET /order-list/store/:storeId/print-history ────────────────────────────
export async function getPrintHistory(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  await assertStoreAccess(req, storeId);

  const jobs = await prisma.printJob.findMany({
    where: { storeId },
    include: {
      printedBy: { select: { name: true } },
      items: { select: { snapshot: true } },
    },
    orderBy: { printedAt: 'desc' },
    take: 30,
  });

  res.json({ success: true, data: jobs });
}

// ─── GET /order-list/print-jobs/:jobId ───────────────────────────────────────
export async function getPrintJob(req: AuthRequest, res: Response) {
  const { jobId } = req.params;

  const job = await prisma.printJob.findUnique({
    where: { id: jobId },
    include: {
      printedBy: { select: { name: true } },
      store: { select: { name: true } },
      items: { select: { id: true, snapshot: true, orderItemId: true } },
    },
  });

  if (!job) { res.status(404).json({ success: false, error: 'Print job not found' }); return; }
  await assertStoreAccess(req, job.storeId);

  res.json({ success: true, data: job });
}
