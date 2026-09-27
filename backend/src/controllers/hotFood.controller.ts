import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import cloudinary from '../config/cloudinary';
import { sendPushToStoreEmployees, sendPushToUser } from '../utils/push';
import { hotFoodOrderUrl } from '../utils/notificationRoutes';
import { hotFoodState, opensSentence, HotFoodSchedules, HotFoodState } from '../utils/hotFoodHours';
import { updateHoursSchema, dayProblem, dayWords, DAY_NAMES } from './storeHours.controller';
import { refuse } from '../utils/refusal';
import { audit } from '../utils/audit';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// HQ can act on every store; a manager with allStoresAccess too; anyone else only on a store they are assigned to. Same rule as
// requireStoreAccess, for routes where the store comes from the order rather than the address.
async function canActOnStore(userId: string, role: Role, storeId: string): Promise<boolean> {
  if (hasMinRole(role, Role.SUPER_ADMIN)) return true;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { allStoresAccess: true } });
  if (dbUser?.allStoresAccess) return true;
  return !!(await prisma.userStoreRole.findUnique({ where: { userId_storeId: { userId, storeId } } }));
}

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';

// Where an order may go from each step. Completed and cancelled are final. A ready order can still be cancelled (never picked up).
export const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['READY', 'CANCELLED'],
  READY: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};
const STATUS_WORD: Record<OrderStatus, string> = {
  PENDING: 'waiting', ACCEPTED: 'being made', READY: 'ready', COMPLETED: 'picked up', CANCELLED: 'cancelled',
};

// A store's hot food hours, its own opening hours and its holidays around now (enough to say when it next opens)
async function schedulesFor(storeId: string): Promise<HotFoodSchedules> {
  const [hotFood, storeWeekly, storeHolidays] = await Promise.all([
    prisma.hotFoodHours.findMany({ where: { storeId } }),
    prisma.storeHours.findMany({ where: { storeId } }),
    prisma.storeHoliday.findMany({ where: { storeId, date: { gte: new Date(Date.now() - 2 * 86_400_000), lte: new Date(Date.now() + 10 * 86_400_000) } } }),
  ]);
  return { hotFood, storeWeekly, storeHolidays };
}

// What one order may hold
export const MAX_QTY_PER_ITEM = 20;
export const MAX_ORDER_LINES = 30;
export const MAX_NOTE_LENGTH = 300;

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `HF-${ts}${rand}`;
}

// ─── Menu (admin) ─────────────────────────────────────────────────────────────

// GET /hot-food/menu?storeId=xxx
export async function getMenu(req: AuthRequest, res: Response) {
  const { storeId } = req.query as { storeId?: string };
  const where = storeId
    ? { OR: [{ storeId }, { storeId: null }] }
    : {};
  const items = await prisma.hotFoodMenuItem.findMany({
    where,
    include: { store: { select: { id: true, name: true } } },
    orderBy: [{ isAvailable: 'desc' }, { name: 'asc' }],
  });
  res.json({ success: true, data: items });
}

// POST /hot-food/menu
export async function createItem(req: AuthRequest, res: Response) {
  const { name, description, category, price, estimatedMinutes, isAvailable } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }
  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    res.status(400).json({ success: false, error: 'price must be a non-negative number' });
    return;
  }

  // Employees/managers are scoped to their own store(s) — prefer an explicit
  // storeId from the client if it's actually one of their assigned stores,
  // only falling back to their first store otherwise.
  const user = req.user!;
  const requestedStoreId: string | undefined = req.body.storeId;
  const storeId: string | null =
    (user.role === 'EMPLOYEE' || user.role === 'STORE_MANAGER')
      ? ((requestedStoreId && (user as any).storeIds?.includes(requestedStoreId))
          ? requestedStoreId
          : ((user as any).storeIds?.[0] ?? null))
      : (req.body.storeId ?? null);

  let imageUrl: string | null = null;
  if (req.file) {
    imageUrl = await uploadToCloudinary(req.file.buffer);
  }

  const item = await prisma.hotFoodMenuItem.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      category: category?.trim() || null,
      price: parsedPrice,
      storeId,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      isAvailable: isAvailable !== false && isAvailable !== 'false',
      imageUrl,
    },
    include: { store: { select: { id: true, name: true } } },
  });
  res.status(201).json({ success: true, data: item });
}

// PATCH /hot-food/menu/:id
export async function updateItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { name, description, category, price, estimatedMinutes, isAvailable } = req.body;

  const existing = await prisma.hotFoodMenuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  // Employees may only edit items belonging to one of their stores
  const user = req.user!;
  if (user.role === 'EMPLOYEE' || user.role === 'STORE_MANAGER') {
    const employeeStoreIds: string[] = (user as any).storeIds ?? [];
    if (existing.storeId && !employeeStoreIds.includes(existing.storeId)) {
      res.status(403).json({ success: false, error: 'Cannot edit items from other stores' });
      return;
    }
  }

  const data: any = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (category !== undefined) data.category = category?.trim() || null;
  if (price !== undefined) {
    const p = parseFloat(price);
    if (!isNaN(p)) data.price = p;
  }
  if (estimatedMinutes !== undefined) data.estimatedMinutes = estimatedMinutes ? parseInt(estimatedMinutes) : null;
  if (isAvailable !== undefined) data.isAvailable = isAvailable === true || isAvailable === 'true';

  // Image file uploaded — replace via Cloudinary
  if (req.file) {
    data.imageUrl = await uploadToCloudinary(req.file.buffer);
  }

  const item = await prisma.hotFoodMenuItem.update({
    where: { id },
    data,
    include: { store: { select: { id: true, name: true } } },
  });
  res.json({ success: true, data: item });
}

// DELETE /hot-food/menu/:id
export async function deleteItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.hotFoodMenuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  // Employees may only delete items belonging to one of their stores
  const user = req.user!;
  if (user.role === 'EMPLOYEE' || user.role === 'STORE_MANAGER') {
    const employeeStoreIds: string[] = (user as any).storeIds ?? [];
    if (existing.storeId && !employeeStoreIds.includes(existing.storeId)) {
      res.status(403).json({ success: false, error: 'Cannot delete items from other stores' });
      return;
    }
  }

  await prisma.hotFoodMenuItem.delete({ where: { id } });
  res.json({ success: true });
}

// GET /hot-food/menu/categories — distinct category values for autocomplete
export async function getMenuCategories(req: AuthRequest, res: Response) {
  const { storeId } = req.query as { storeId?: string };
  const items = await prisma.hotFoodMenuItem.findMany({
    where: {
      category: { not: null },
      ...(storeId ? { OR: [{ storeId }, { storeId: null }] } : {}),
    },
    select: { category: true },
    distinct: ['category'],
    orderBy: { category: 'asc' },
  });
  const categories = items.map(i => i.category).filter(Boolean) as string[];
  res.json({ success: true, data: categories });
}

// ─── Orders (admin) ───────────────────────────────────────────────────────────

// GET /hot-food/orders/admin?storeId=xxx&status=PENDING
export async function getAllOrders(req: AuthRequest, res: Response) {
  const { storeId, status } = req.query as { storeId?: string; status?: string };
  const user = req.user!;

  // StoreManager: restrict to their own stores (check allStoresAccess flag in DB)
  let storeFilter: string | undefined = storeId;
  if (user.role === 'STORE_MANAGER') {
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { allStoresAccess: true, storeRoles: { select: { storeId: true } } },
    });
    if (!dbUser?.allStoresAccess) {
      const managerStoreIds = dbUser?.storeRoles.map(r => r.storeId) ?? [];
      if (storeId && !managerStoreIds.includes(storeId)) {
        res.status(403).json({ success: false, error: 'Access denied to this store' });
        return;
      }
      storeFilter = storeId || (managerStoreIds.length === 1 ? managerStoreIds[0] : undefined);
    }
  }

  const where: any = {};
  if (storeFilter) where.storeId = storeFilter;
  if (status) where.status = status;

  const orders = await prisma.hotFoodOrder.findMany({
    where,
    include: {
      store: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ success: true, data: orders });
}

// PATCH /hot-food/orders/:id — move an order to its next step. Only staff of the order's own store (or HQ) may, and only along
// NEXT_STATUS. Asking for the step it is already at does nothing (a double tap), so the customer is never told twice. Two people
// pressing at once: the first wins and the second is told what happened.
export async function updateOrderStatus(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { status, estimatedMinutes } = req.body;

  if (!Object.prototype.hasOwnProperty.call(NEXT_STATUS, status)) {
    res.status(400).json({ success: false, error: 'Invalid status' });
    return;
  }
  const next = status as OrderStatus;

  const order = await prisma.hotFoodOrder.findUnique({
    where: { id },
    include: { store: { select: { id: true, name: true } } },
  });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }
  if (!(await canActOnStore(req.user!.id, req.user!.role, order.storeId))) {
    res.status(403).json({ success: false, error: "You can only update orders at your own store." });
    return;
  }

  const include = {
    store: { select: { id: true, name: true } },
    customer: { select: { id: true, name: true, phone: true } },
    items: true,
  };
  const current = order.status as OrderStatus;
  if (current === next) {
    const same = await prisma.hotFoodOrder.findUnique({ where: { id }, include });
    res.json({ success: true, data: same, changed: false });
    return;
  }
  if (!NEXT_STATUS[current].includes(next)) {
    res.status(409).json({ success: false, error: `This order is already ${STATUS_WORD[current]}, so it cannot be marked ${STATUS_WORD[next]}.` });
    return;
  }

  const updateData: { status: OrderStatus; estimatedMinutes?: number } = { status: next };
  if (next === 'ACCEPTED' && estimatedMinutes != null) {
    const mins = parseInt(estimatedMinutes);
    if (!isNaN(mins) && mins > 0 && mins <= 240) updateData.estimatedMinutes = mins;
  }

  // Only moves the order if nobody else moved it first
  const moved = await prisma.hotFoodOrder.updateMany({ where: { id, status: current }, data: updateData });
  if (moved.count === 0) {
    const fresh = await prisma.hotFoodOrder.findUnique({ where: { id }, select: { status: true } });
    const now = (fresh?.status ?? current) as OrderStatus;
    res.status(409).json({ success: false, error: `Someone else just changed this order. It is ${STATUS_WORD[now]} now.` });
    return;
  }
  const updated = await prisma.hotFoodOrder.findUnique({ where: { id }, include });

  // Push to customer when their order is ready for pickup
  if (next === 'READY') {
    sendPushToUser(
      order.customerId,
      '✅ Your food is ready!',
      `Order #${order.orderNumber} is ready. Head to the counter at ${order.store.name}.`,
      'HOT_FOOD_ORDER',
    );
  }

  res.json({ success: true, data: updated, changed: true });
}

// ─── Menu (customer / mobile) ─────────────────────────────────────────────────

// GET /hot-food/store/:storeId/menu — available items only (customer ordering)
export async function getStoreMenu(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { hotFoodEnabled: true } });
  if (!store?.hotFoodEnabled) {
    res.json({ success: true, data: [], hotFoodEnabled: false });
    return;
  }
  // Outside the hours the menu can still be looked at; placing an order is refused (placeOrder)
  const hours = hotFoodState(await schedulesFor(storeId));

  const menuItems = await prisma.hotFoodMenuItem.findMany({
    where: { isAvailable: true, OR: [{ storeId }, { storeId: null }] },
    select: { id: true, name: true, description: true, price: true, estimatedMinutes: true, imageUrl: true },
    orderBy: { name: 'asc' },
  });

  // Only catalog items that are available at this store
  const catalogAssignments = await prisma.hotFoodCatalogStore.findMany({
    where: { storeId, isAvailable: true },
    select: {
      catalogItem: {
        select: { id: true, name: true, description: true, price: true, estimatedMinutes: true, imageUrl: true },
      },
    },
  });
  const catalogItems = catalogAssignments.map(a => a.catalogItem);

  const catalogNames = new Set(catalogItems.map(c => c.name.toLowerCase()));
  const dedupedMenu = menuItems.filter(m => !catalogNames.has(m.name.toLowerCase()));

  const all = [...dedupedMenu, ...catalogItems].sort((a, b) => a.name.localeCompare(b.name));
  res.json({ success: true, data: all, hours });
}

// GET /hot-food/store/:storeId/all-items — all items with availability (employee management view)
export async function getStoreAllItems(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const menuItems = await prisma.hotFoodMenuItem.findMany({
    where: { OR: [{ storeId }, { storeId: null }] },
    select: { id: true, name: true, description: true, category: true, price: true, estimatedMinutes: true, imageUrl: true, isAvailable: true },
    orderBy: [{ isAvailable: 'desc' }, { name: 'asc' }],
  });

  const catalogAssignments = await prisma.hotFoodCatalogStore.findMany({
    where: { storeId },
    select: {
      isAvailable: true,
      catalogItem: {
        select: { id: true, name: true, description: true, price: true, estimatedMinutes: true, imageUrl: true },
      },
    },
  });

  const catalogNames = new Set(catalogAssignments.map(a => a.catalogItem.name.toLowerCase()));
  const dedupedMenu = menuItems.filter(m => !catalogNames.has(m.name.toLowerCase()));

  const legacyItems = dedupedMenu.map(m => ({ ...m, source: 'menu' as const }));
  const catalogItems = catalogAssignments.map(a => ({
    ...a.catalogItem,
    isAvailable: a.isAvailable,
    source: 'catalog' as const,
  }));

  const all = [...legacyItems, ...catalogItems].sort((a, b) => {
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  res.json({ success: true, data: all });
}

// PATCH /hot-food/store/:storeId/catalog/:catalogItemId/availability — employee toggles per-store catalog availability
export async function updateCatalogStoreAvailability(req: AuthRequest, res: Response) {
  const { storeId, catalogItemId } = req.params;
  const { isAvailable } = req.body;

  if (typeof isAvailable !== 'boolean') {
    res.status(400).json({ success: false, error: 'isAvailable must be a boolean' });
    return;
  }

  const assignment = await prisma.hotFoodCatalogStore.findUnique({
    where: { catalogItemId_storeId: { catalogItemId, storeId } },
  });

  if (!assignment) {
    res.status(404).json({ success: false, error: 'Item not assigned to this store' });
    return;
  }

  const updated = await prisma.hotFoodCatalogStore.update({
    where: { catalogItemId_storeId: { catalogItemId, storeId } },
    data: { isAvailable },
  });

  res.json({ success: true, data: updated });
}

// ─── Orders (customer / mobile) ───────────────────────────────────────────────

// POST /hot-food/orders — place order
export async function placeOrder(req: AuthRequest, res: Response) {
  const customerId = req.user!.id;
  const { storeId, items, note } = req.body;

  if (!storeId || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'storeId and items[] are required' });
    return;
  }
  if (items.length > MAX_ORDER_LINES) {
    res.status(400).json({ success: false, error: `An order can have at most ${MAX_ORDER_LINES} different items.` });
    return;
  }
  if (note != null && (typeof note !== 'string' || note.trim().length > MAX_NOTE_LENGTH)) {
    res.status(400).json({ success: false, error: `Keep the note under ${MAX_NOTE_LENGTH} characters.` });
    return;
  }
  // Each line: an item id and a whole number from 1 to MAX_QTY_PER_ITEM (the same item on two lines counts together)
  const qtyById = new Map<string, number>();
  for (const line of items) {
    const itemId = line?.menuItemId;
    const qty = Number(line?.quantity ?? 1);
    if (typeof itemId !== 'string' || !itemId) {
      res.status(400).json({ success: false, error: 'Each item needs its menu id.' });
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      res.status(400).json({ success: false, error: 'Each item needs a quantity of at least 1.' });
      return;
    }
    qtyById.set(itemId, (qtyById.get(itemId) ?? 0) + qty);
    if (qtyById.get(itemId)! > MAX_QTY_PER_ITEM) {
      res.status(400).json({ success: false, error: `You can order up to ${MAX_QTY_PER_ITEM} of one item at a time.` });
      return;
    }
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { hotFoodEnabled: true, name: true } });
  if (!store?.hotFoodEnabled) {
    res.status(403).json({ success: false, error: 'Hot food ordering is not available at this location' });
    return;
  }
  const hours = hotFoodState(await schedulesFor(storeId));
  if (!hours.open) {
    const why = hours.holiday ? ` today (${hours.holiday})` : ' right now';
    res.status(403).json({ success: false, code: 'HOT_FOOD_CLOSED', error: `Hot food at ${store.name} is closed${why}.${opensSentence(hours)}`, hours });
    return;
  }

  // Validate + price each item — check legacy menu table then catalog table
  const itemIds: string[] = [...qtyById.keys()];

  const menuItemRows = await prisma.hotFoodMenuItem.findMany({
    where: { id: { in: itemIds }, isAvailable: true, OR: [{ storeId }, { storeId: null }] },
  });
  const menuMap = new Map(menuItemRows.map(m => [m.id, m]));

  // Any IDs not found in the legacy table — try catalog (must be assigned to this store)
  const unmatchedIds = itemIds.filter(id => !menuMap.has(id));
  const catalogMap = new Map<string, any>();
  if (unmatchedIds.length > 0) {
    const catalogRows = await prisma.hotFoodCatalogStore.findMany({
      where: { storeId, catalogItemId: { in: unmatchedIds }, isAvailable: true },   // not one the store has switched off
      include: { catalogItem: true },
    });
    for (const row of catalogRows) catalogMap.set(row.catalogItemId, row.catalogItem);
  }

  const orderLines: { menuItemId?: string; catalogItemId?: string; name: string; price: number; quantity: number }[] = [];
  for (const [itemId, qty] of qtyById) {
    const menuItem   = menuMap.get(itemId);
    const catalogItem = catalogMap.get(itemId);
    const resolved   = menuItem || catalogItem;
    if (!resolved) {
      res.status(400).json({ success: false, error: 'One of the items is not available right now. Refresh the menu and try again.' });
      return;
    }
    orderLines.push({
      ...(menuItem ? { menuItemId: menuItem.id } : { catalogItemId: catalogItem.id }),
      name: resolved.name,
      price: resolved.price,
      quantity: qty,
    });
  }

  const totalAmount = orderLines.reduce((s, l) => s + l.price * l.quantity, 0);

  // Generate unique order number with retry on collision
  let orderNumber = generateOrderNumber();
  let attempts = 0;
  while (attempts < 5) {
    const exists = await prisma.hotFoodOrder.findUnique({ where: { orderNumber } });
    if (!exists) break;
    orderNumber = generateOrderNumber();
    attempts++;
  }

  const order = await prisma.hotFoodOrder.create({
    data: {
      orderNumber,
      storeId,
      customerId,
      note: note?.trim() || null,
      totalAmount,
      items: {
        create: orderLines,
      },
    },
    include: {
      store: { select: { id: true, name: true } },
      items: true,
    },
  });

  // Notify employees only — hot food is an employee task, not an inventory item
  const itemSummary = orderLines.map(l => `${l.quantity}× ${l.name}`).join(', ');
  sendPushToStoreEmployees(
    storeId,
    `🔥 New Order #${order.orderNumber}`,
    itemSummary,
    'HOT_FOOD_ORDER',
    hotFoodOrderUrl(order.id),
  );

  res.status(201).json({ success: true, data: order });
}

// GET /hot-food/orders/mine — customer's own orders
export async function getMyOrders(req: AuthRequest, res: Response) {
  const customerId = req.user!.id;
  const orders = await prisma.hotFoodOrder.findMany({
    where: { customerId },
    select: {
      id: true, orderNumber: true, status: true, totalAmount: true,
      note: true, estimatedMinutes: true,
      createdAt: true, updatedAt: true,
      store: { select: { id: true, name: true } },
      items: { select: { name: true, quantity: true, price: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ success: true, data: orders });
}

// ─── Orders (mobile — per store) ─────────────────────────────────────────────

// GET /hot-food/orders/store/:storeId — for manager/employee mobile
export async function getStoreOrders(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const orders = await prisma.hotFoodOrder.findMany({
    where: { storeId },
    include: {
      store: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  res.json({ success: true, data: orders });
}

// GET /hot-food/orders/store/:storeId/pending-count — badge count for mobile nav
export async function getStorePendingCount(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const count = await prisma.hotFoodOrder.count({
    where: { storeId, status: 'PENDING' },
  });
  res.json({ success: true, data: { count } });
}

// GET /hot-food/orders/my-stores/pending-count — badge count across every
// store the caller is assigned to (an employee/manager working more than
// one store previously only ever saw their first store's count).
export async function getMyStoresPendingCount(req: AuthRequest, res: Response) {
  const storeIds = req.user!.storeIds ?? [];
  if (storeIds.length === 0) { res.json({ success: true, data: { count: 0 } }); return; }
  const count = await prisma.hotFoodOrder.count({
    where: { storeId: { in: storeIds }, status: 'PENDING' },
  });
  res.json({ success: true, data: { count } });
}

// GET /hot-food/orders/admin/pending-count — badge count for DevAdmin/SuperAdmin, all stores
export async function getAdminPendingCount(req: AuthRequest, res: Response) {
  const count = await prisma.hotFoodOrder.count({ where: { status: 'PENDING' } });
  res.json({ success: true, data: { count } });
}

// ─── Catalog (admin) ──────────────────────────────────────────────────────────

async function uploadToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'luckystop/hot-food-catalog', resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve((result as { secure_url: string }).secure_url))
    ).end(buffer);
  });
}

// GET /hot-food/catalog
export async function getCatalog(_req: AuthRequest, res: Response) {
  const items = await prisma.hotFoodCatalogItem.findMany({
    include: { _count: { select: { stores: true } } },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: items.map(i => ({ ...i, storeCount: i._count.stores })) });
}

// POST /hot-food/catalog
export async function createCatalogItem(req: AuthRequest, res: Response) {
  const { name, description, price, estimatedMinutes } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }
  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice <= 0) {
    res.status(400).json({ success: false, error: 'price must be a positive number' });
    return;
  }

  let imageUrl: string | undefined;
  if (req.file) {
    imageUrl = await uploadToCloudinary(req.file.buffer);
  }

  const item = await prisma.hotFoodCatalogItem.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      price: parsedPrice,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      imageUrl: imageUrl ?? null,
    },
    include: { _count: { select: { stores: true } } },
  });
  res.status(201).json({ success: true, data: { ...item, storeCount: item._count.stores } });
}

// PATCH /hot-food/catalog/:id
export async function updateCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.hotFoodCatalogItem.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Item not found' }); return; }

  const data: any = {};
  if (req.body.name !== undefined) data.name = req.body.name.trim();
  if (req.body.description !== undefined) data.description = req.body.description?.trim() || null;
  if (req.body.price !== undefined) {
    const p = parseFloat(req.body.price);
    if (!isNaN(p) && p > 0) data.price = p;
  }
  if (req.body.estimatedMinutes !== undefined) {
    data.estimatedMinutes = req.body.estimatedMinutes ? parseInt(req.body.estimatedMinutes) : null;
  }

  const item = await prisma.hotFoodCatalogItem.update({
    where: { id },
    data,
    include: { _count: { select: { stores: true } } },
  });
  res.json({ success: true, data: { ...item, storeCount: item._count.stores } });
}

// PATCH /hot-food/catalog/:id/image
export async function updateCatalogItemImage(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.hotFoodCatalogItem.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: 'image file is required' }); return; }

  const imageUrl = await uploadToCloudinary(req.file.buffer);
  const item = await prisma.hotFoodCatalogItem.update({
    where: { id },
    data: { imageUrl },
    include: { _count: { select: { stores: true } } },
  });
  res.json({ success: true, data: { ...item, storeCount: item._count.stores } });
}

// DELETE /hot-food/catalog/:id
export async function deleteCatalogItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const existing = await prisma.hotFoodCatalogItem.findUnique({ where: { id } });
  if (!existing) { res.status(404).json({ success: false, error: 'Item not found' }); return; }
  await prisma.hotFoodCatalogItem.delete({ where: { id } });
  res.json({ success: true });
}

// GET /hot-food/catalog/:id/stores
export async function getCatalogItemStores(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const assignments = await prisma.hotFoodCatalogStore.findMany({
    where: { catalogItemId: id },
    select: { storeId: true },
  });
  res.json({ success: true, data: { assignedStoreIds: assignments.map(a => a.storeId) } });
}

// POST /hot-food/catalog/:id/stores
export async function assignCatalogItemToStore(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { storeId } = req.body;
  if (!storeId) { res.status(400).json({ success: false, error: 'storeId is required' }); return; }

  await prisma.hotFoodCatalogStore.upsert({
    where: { catalogItemId_storeId: { catalogItemId: id, storeId } },
    create: { catalogItemId: id, storeId },
    update: {},
  });
  res.status(201).json({ success: true });
}

// DELETE /hot-food/catalog/:id/stores/:storeId
export async function removeCatalogItemFromStore(req: AuthRequest, res: Response) {
  const { id, storeId } = req.params;
  await prisma.hotFoodCatalogStore.deleteMany({
    where: { catalogItemId: id, storeId },
  });
  res.json({ success: true });
}

// ─── Hot food hours ───────────────────────────────────────────────────────────

// GET /stores/:storeId/hot-food-hours — the week as set (empty = follows the store's hours) and whether ordering is open now
export async function getHotFoodHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const schedules = await schedulesFor(storeId);
  res.json({ success: true, data: { weekly: schedules.hotFood, followsStore: schedules.hotFood.length === 0, storeHoursSet: schedules.storeWeekly.length > 0, now: hotFoodState(schedules) } });
}

// PUT /stores/:storeId/hot-food-hours — the whole week at once, checked like store hours
export async function updateHotFoodHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const parsed = updateHoursSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  if (new Set(parsed.data.days.map((d) => d.dayOfWeek)).size !== 7) {
    res.status(400).json({ success: false, error: 'Each day of the week must appear exactly once.' });
    return;
  }
  for (const day of parsed.data.days) {
    const problem = dayProblem(day);
    if (problem) { res.status(400).json({ success: false, error: problem }); return; }
  }
  const [store, existing] = await Promise.all([
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true } }),
    prisma.hotFoodHours.findMany({ where: { storeId } }),
  ]);
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  const was = new Map(existing.map((e) => [e.dayOfWeek as string, e]));
  const diffs = parsed.data.days
    .filter((d) => dayWords(was.get(d.dayOfWeek)) !== dayWords(d))
    .map((d) => `${DAY_NAMES[d.dayOfWeek] ?? d.dayOfWeek}: ${dayWords(was.get(d.dayOfWeek))} to ${dayWords(d)}`);

  await prisma.$transaction(parsed.data.days.map((day) => prisma.hotFoodHours.upsert({
    where: { storeId_dayOfWeek: { storeId, dayOfWeek: day.dayOfWeek } },
    create: { storeId, ...day },
    update: { isClosed: day.isClosed, isOpen24Hours: day.isOpen24Hours, openTime: day.openTime, closeTime: day.closeTime },
  })));
  if (diffs.length > 0) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'UPDATE_HOT_FOOD_HOURS', entity: 'store', entityId: storeId,
      details: { summary: `${store.name} hot food hours: ${diffs.join('; ')}`, changedDays: diffs.length },
      storeId, storeName: store.name,
    });
  }
  const schedules = await schedulesFor(storeId);
  res.json({ success: true, data: { weekly: schedules.hotFood, followsStore: false, storeHoursSet: schedules.storeWeekly.length > 0, now: hotFoodState(schedules) }, changed: diffs.length > 0 });
}

// DELETE /stores/:storeId/hot-food-hours — back to following the store's own hours
export async function clearHotFoodHours(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true } });
  if (!store) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }
  const removed = await prisma.hotFoodHours.deleteMany({ where: { storeId } });
  if (removed.count > 0) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'UPDATE_HOT_FOOD_HOURS', entity: 'store', entityId: storeId,
      details: { summary: `${store.name} hot food hours: now the same as the store's hours` },
      storeId, storeName: store.name,
    });
  }
  const schedules = await schedulesFor(storeId);
  res.json({ success: true, data: { weekly: [], followsStore: true, storeHoursSet: schedules.storeWeekly.length > 0, now: hotFoodState(schedules) } });
}

// GET /hot-food/stores-status — every store: hot food on or off, and whether ordering is open right now (HQ's Availability view)
export async function getHotFoodStoresStatus(_req: AuthRequest, res: Response) {
  const soon = new Date(Date.now() + 10 * 86_400_000);
  const recent = new Date(Date.now() - 2 * 86_400_000);
  const stores = await prisma.store.findMany({
    select: {
      id: true, hotFoodEnabled: true,
      hotFoodHours: true, storeHours: true,
      storeHolidays: { where: { date: { gte: recent, lte: soon } } },
    },
  });
  const now = new Date();
  const data: Record<string, { hotFoodEnabled: boolean; hasOwnHours: boolean; now: HotFoodState }> = {};
  for (const st of stores) {
    data[st.id] = {
      hotFoodEnabled: st.hotFoodEnabled,
      hasOwnHours: st.hotFoodHours.length > 0,
      now: hotFoodState({ hotFood: st.hotFoodHours, storeWeekly: st.storeHours, storeHolidays: st.storeHolidays }, now),
    };
  }
  res.json({ success: true, data });
}
