import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { Role, OrderListItemStatus, OrderItemPriority, OrderItemSource } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';

// ─── Helpers ─────────────────────────────────────────────────────────────────

export async function generateListName(storeId: string): Promise<string> {
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  const storeName = store?.name ?? 'Store';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const startOfDay = new Date(now); startOfDay.setHours(0, 0, 0, 0);
  const todayCount = await prisma.orderList.count({ where: { storeId, openedAt: { gte: startOfDay } } });
  const suffix = todayCount > 0 ? ` #${todayCount + 1}` : '';
  return `${storeName} — ${dateStr}${suffix}`;
}

async function trackCategoryUsage(name: string): Promise<void> {
  if (!name?.trim()) return;
  const key = name.trim();
  const existing = await prisma.orderCategory.findFirst({
    where: { name: key, storeId: null },
  });
  if (existing) {
    const newCount = existing.usageCount + 1;
    await prisma.orderCategory.update({
      where: { id: existing.id },
      data: { usageCount: newCount, ...(newCount >= 3 && existing.status === 'PENDING' ? { status: 'APPROVED' } : {}) },
    });
  } else {
    await prisma.orderCategory.create({ data: { name: key, storeId: null, usageCount: 1, status: 'PENDING' } }).catch(() => {});
  }
}

// ─── GET /order-lists/suggestions ─────────────────────────────────────────────

export async function getItemSuggestions(req: AuthRequest, res: Response) {
  const q = String(req.query.q || '').trim();
  if (q.length < 1) { res.json({ success: true, data: [] }); return; }

  const results = await prisma.$queryRaw<{ name: string; category: string | null; count: bigint }[]>`
    SELECT name, category, COUNT(*) as count FROM order_list_items
    WHERE name ILIKE ${'%' + q + '%'} AND status != 'REMOVED'
    GROUP BY name, category
    ORDER BY count DESC LIMIT 20
  `;

  // Deduplicate by name — keep top category
  const seen = new Map<string, { name: string; category: string | null; count: number }>();
  for (const r of results) {
    const key = r.name.toLowerCase();
    if (!seen.has(key)) seen.set(key, { name: r.name, category: r.category, count: Number(r.count) });
  }

  res.json({ success: true, data: [...seen.values()].slice(0, 8) });
}

// ─── GET /order-lists/store/:storeId/active ───────────────────────────────────

export async function getActiveList(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const list = await prisma.orderList.findFirst({
    where: { storeId, status: 'OPEN' },
    include: {
      openedBy: { select: { id: true, name: true } },
      items: {
        where: { status: { not: 'REMOVED' } },
        include: { addedBy: { select: { id: true, name: true, role: true } }, requestLine: { select: { id: true, requestId: true } } },
        orderBy: [{ category: 'asc' }, { priority: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });
  if (!list) { res.json({ success: true, data: null }); return; }
  const grouped: Record<string, typeof list.items> = {};
  for (const item of list.items) {
    const key = item.category || 'Uncategorized';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }
  res.json({ success: true, data: { ...list, grouped } });
}

// ─── GET /order-lists/store/:storeId/history ─────────────────────────────────

export async function getListHistory(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const page = Number(req.query.page) || 1;
  const [lists, total] = await Promise.all([
    prisma.orderList.findMany({
      where: { storeId, status: 'CLOSED' },
      include: {
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        items: {
          where: { status: { not: 'REMOVED' } },
          select: { id: true, name: true, status: true, priority: true, category: true, quantity: true },
        },
        _count: { select: { items: true } },
      },
      orderBy: { closedAt: 'desc' },
      skip: (page - 1) * 10,
      take: 10,
    }),
    prisma.orderList.count({ where: { storeId, status: 'CLOSED' } }),
  ]);
  res.json({ success: true, data: { lists, total, page, pages: Math.ceil(total / 10) } });
}

// ─── GET /order-lists/:listId ─────────────────────────────────────────────────

export async function getListById(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const list = await prisma.orderList.findUnique({
    where: { id: listId },
    include: {
      openedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      store:    { select: { id: true, name: true } },
      items: {
        where: { status: { not: 'REMOVED' } },
        include: { addedBy: { select: { id: true, name: true, role: true } } },
        orderBy: [{ category: 'asc' }, { priority: 'asc' }, { sortOrder: 'asc' }],
      },
    },
  });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }
  const grouped: Record<string, typeof list.items> = {};
  for (const item of list.items) {
    const key = item.category || 'Uncategorized';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }
  res.json({ success: true, data: { ...list, grouped } });
}

// ─── POST /order-lists/store/:storeId/open ───────────────────────────────────

export async function openList(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const existing = await prisma.orderList.findFirst({ where: { storeId, status: 'OPEN' } });
  if (existing) { res.status(409).json({ success: false, error: 'A list is already open for this store', data: existing }); return; }
  const name = await generateListName(storeId);
  const list = await prisma.orderList.create({
    data: { storeId, name, openedById: req.user!.id },
    include: { openedBy: { select: { id: true, name: true } } },
  });
  res.status(201).json({ success: true, data: list });
}

// ─── POST /order-lists/:listId/close ─────────────────────────────────────────

export async function closeList(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const notes = req.body.notes as string | undefined;
  const list = await prisma.orderList.findUnique({ where: { id: listId } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }
  if (list.status === 'CLOSED') { res.status(400).json({ success: false, error: 'List is already closed' }); return; }

  const user = req.user!;
  if (!hasMinRole(user.role, Role.DEV_ADMIN)) {
    const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { allStoresAccess: true } });
    if (!dbUser?.allStoresAccess) {
      const access = await prisma.userStoreRole.findUnique({ where: { userId_storeId: { userId: user.id, storeId: list.storeId } } });
      if (!access) { res.status(403).json({ success: false, error: 'No access to this store' }); return; }
    }
  }
  const updated = await prisma.orderList.update({
    where: { id: listId },
    data: { status: 'CLOSED', closedById: user.id, closedAt: new Date(), ...(notes ? { notes } : {}) },
  });
  res.json({ success: true, data: updated });
}

// ─── POST /order-lists/:listId/items ─────────────────────────────────────────

const addItemSchema = z.object({
  name:     z.string().min(1).max(120),
  quantity: z.string().max(60).optional(),
  category: z.string().max(80).optional(),
  notes:    z.string().max(300).optional(),
  priority: z.nativeEnum(OrderItemPriority).default('NORMAL'),
});

export async function addItem(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const parsed = addItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const list = await prisma.orderList.findUnique({ where: { id: listId }, select: { status: true } });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }
  if (list.status === 'CLOSED') { res.status(400).json({ success: false, error: 'Cannot add to a closed list' }); return; }
  const max = await prisma.orderListItem.aggregate({ where: { listId }, _max: { sortOrder: true } });
  const item = await prisma.orderListItem.create({
    data: { listId, ...parsed.data, sortOrder: (max._max.sortOrder ?? 0) + 1, addedById: req.user!.id },
    include: { addedBy: { select: { id: true, name: true, role: true } } },
  });
  if (parsed.data.category) trackCategoryUsage(parsed.data.category).catch(() => {});
  res.status(201).json({ success: true, data: item });
}

// ─── PATCH /order-lists/:listId/items/:itemId ────────────────────────────────

const updateItemSchema = z.object({
  name:     z.string().min(1).max(120).optional(),
  quantity: z.string().max(60).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  notes:    z.string().max(300).nullable().optional(),
  priority: z.nativeEnum(OrderItemPriority).optional(),
});

export async function updateItem(req: AuthRequest, res: Response) {
  const { listId, itemId } = req.params;
  const parsed = updateItemSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.errors[0].message }); return; }
  const item = await prisma.orderListItem.findFirst({ where: { id: itemId, listId } });
  if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
  if (item.status !== 'PENDING') { res.status(400).json({ success: false, error: 'Can only edit PENDING items' }); return; }
  const updated = await prisma.orderListItem.update({ where: { id: itemId }, data: parsed.data });
  if (parsed.data.category) trackCategoryUsage(parsed.data.category).catch(() => {});
  res.json({ success: true, data: updated });
}

// ─── DELETE /order-lists/:listId/items/:itemId ───────────────────────────────

export async function removeItem(req: AuthRequest, res: Response) {
  const { listId, itemId } = req.params;
  const item = await prisma.orderListItem.findFirst({ where: { id: itemId, listId } });
  if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
  await prisma.orderListItem.update({ where: { id: itemId }, data: { status: 'REMOVED' } });
  res.json({ success: true });
}

// ─── PATCH /order-lists/:listId/items/:itemId/status ─────────────────────────

export async function updateItemStatus(req: AuthRequest, res: Response) {
  const { listId, itemId } = req.params;
  const { status } = req.body;
  if (!['ORDERED', 'RECEIVED'].includes(status)) {
    res.status(400).json({ success: false, error: 'status must be ORDERED or RECEIVED' }); return;
  }
  const item = await prisma.orderListItem.findFirst({ where: { id: itemId, listId } });
  if (!item) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
  const data: Partial<{ status: OrderListItemStatus; orderedAt: Date; receivedAt: Date }> = { status };
  if (status === 'ORDERED')  data.orderedAt  = new Date();
  if (status === 'RECEIVED') data.receivedAt = new Date();
  const updated = await prisma.orderListItem.update({ where: { id: itemId }, data });
  res.json({ success: true, data: updated });
}

// ─── POST /order-lists/:listId/reorder ───────────────────────────────────────

export async function reorderItems(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const { items } = req.body as { items: { id: string; sortOrder: number }[] };
  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'items array required' }); return;
  }
  await prisma.$transaction(
    items.map(({ id, sortOrder }) => prisma.orderListItem.updateMany({ where: { id, listId }, data: { sortOrder } }))
  );
  res.json({ success: true });
}

// ─── POST /order-lists/:listId/print ─────────────────────────────────────────

export async function printList(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const { notes } = req.body;
  const list = await prisma.orderList.findUnique({
    where: { id: listId },
    include: { items: { where: { status: 'PENDING' } } },
  });
  if (!list) { res.status(404).json({ success: false, error: 'List not found' }); return; }
  if (list.items.length === 0) { res.status(400).json({ success: false, error: 'No pending items to print' }); return; }
  const job = await prisma.printJob.create({
    data: {
      listId, storeId: list.storeId, printedById: req.user!.id,
      notes: notes || null, itemCount: list.items.length,
      items: {
        create: list.items.map(item => ({
          listItemId: item.id,
          snapshot: { name: item.name, quantity: item.quantity, category: item.category, notes: item.notes, priority: item.priority },
        })),
      },
    },
    include: { printedBy: { select: { id: true, name: true } }, items: true },
  });
  res.json({ success: true, data: job });
}

// ─── GET /order-lists/:listId/print-history ──────────────────────────────────

export async function getPrintHistory(req: AuthRequest, res: Response) {
  const { listId } = req.params;
  const jobs = await prisma.printJob.findMany({
    where: { listId },
    include: { printedBy: { select: { id: true, name: true } }, items: true },
    orderBy: { printedAt: 'desc' },
  });
  res.json({ success: true, data: jobs });
}

// ─── POST /order-lists/store/:storeId/restore-items ──────────────────────────

export async function restoreItems(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { closedListId, itemIds } = req.body as { closedListId: string; itemIds: string[] };
  if (!closedListId || !Array.isArray(itemIds) || itemIds.length === 0) {
    res.status(400).json({ success: false, error: 'closedListId and itemIds[] required' }); return;
  }
  const openList = await prisma.orderList.findFirst({ where: { storeId, status: 'OPEN' } });
  if (!openList) { res.status(400).json({ success: false, error: 'No open list for this store — open one first' }); return; }

  const sourceItems = await prisma.orderListItem.findMany({
    where: { id: { in: itemIds }, listId: closedListId, status: { not: 'REMOVED' } },
  });
  if (sourceItems.length === 0) { res.status(404).json({ success: false, error: 'No matching items in closed list' }); return; }

  const max = await prisma.orderListItem.aggregate({ where: { listId: openList.id }, _max: { sortOrder: true } });
  let sortOrder = (max._max.sortOrder ?? 0) + 1;

  const created = await prisma.$transaction(
    sourceItems.map(item =>
      prisma.orderListItem.create({
        data: {
          listId: openList.id, name: item.name, quantity: item.quantity,
          category: item.category, notes: item.notes, priority: item.priority,
          source: OrderItemSource.MANAGER, addedById: req.user!.id, sortOrder: sortOrder++,
        },
      })
    )
  );
  res.json({ success: true, data: { added: created.length, items: created } });
}

// ─── Admin: GET /admin/order-lists ────────────────────────────────────────────

export async function adminGetAllLists(req: AuthRequest, res: Response) {
  const { storeId, status, page: pageStr } = req.query;
  const page = Number(pageStr) || 1;
  const where: Record<string, unknown> = {};
  if (storeId) where.storeId = storeId;
  if (status === 'OPEN' || status === 'CLOSED') where.status = status;

  const [lists, total] = await Promise.all([
    prisma.orderList.findMany({
      where,
      include: {
        store:    { select: { id: true, name: true } },
        openedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
        _count:   { select: { items: { where: { status: { not: 'REMOVED' } } } } },
      },
      orderBy: [{ status: 'asc' }, { openedAt: 'desc' }],
      skip: (page - 1) * 20, take: 20,
    }),
    prisma.orderList.count({ where }),
  ]);
  res.json({ success: true, data: { lists, total, page, pages: Math.ceil(total / 20) } });
}
