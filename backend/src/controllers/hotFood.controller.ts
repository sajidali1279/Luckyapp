import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  const { name, description, price, storeId, estimatedMinutes, isAvailable, imageUrl } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ success: false, error: 'name is required' });
    return;
  }
  const parsedPrice = parseFloat(price);
  if (isNaN(parsedPrice) || parsedPrice < 0) {
    res.status(400).json({ success: false, error: 'price must be a non-negative number' });
    return;
  }
  const item = await prisma.hotFoodMenuItem.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      price: parsedPrice,
      storeId: storeId || null,
      estimatedMinutes: estimatedMinutes ? parseInt(estimatedMinutes) : null,
      isAvailable: isAvailable !== false,
      imageUrl: imageUrl || null,
    },
    include: { store: { select: { id: true, name: true } } },
  });
  res.status(201).json({ success: true, data: item });
}

// PATCH /hot-food/menu/:id
export async function updateItem(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { name, description, price, storeId, estimatedMinutes, isAvailable, imageUrl } = req.body;

  const existing = await prisma.hotFoodMenuItem.findUnique({ where: { id } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Menu item not found' });
    return;
  }

  const data: any = {};
  if (name !== undefined) data.name = name.trim();
  if (description !== undefined) data.description = description?.trim() || null;
  if (price !== undefined) {
    const p = parseFloat(price);
    if (!isNaN(p)) data.price = p;
  }
  if (storeId !== undefined) data.storeId = storeId || null;
  if (estimatedMinutes !== undefined) data.estimatedMinutes = estimatedMinutes ? parseInt(estimatedMinutes) : null;
  if (isAvailable !== undefined) data.isAvailable = Boolean(isAvailable);
  if (imageUrl !== undefined) data.imageUrl = imageUrl || null;

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
  await prisma.hotFoodMenuItem.delete({ where: { id } });
  res.json({ success: true });
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

// PATCH /hot-food/orders/:id — update status
export async function updateOrderStatus(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { status } = req.body;

  const validStatuses = ['PENDING', 'ACCEPTED', 'READY', 'COMPLETED', 'CANCELLED'];
  if (!validStatuses.includes(status)) {
    res.status(400).json({ success: false, error: 'Invalid status' });
    return;
  }

  const order = await prisma.hotFoodOrder.findUnique({ where: { id } });
  if (!order) {
    res.status(404).json({ success: false, error: 'Order not found' });
    return;
  }

  const updated = await prisma.hotFoodOrder.update({
    where: { id },
    data: { status },
    include: {
      store: { select: { id: true, name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      items: true,
    },
  });
  res.json({ success: true, data: updated });
}

// ─── Menu (customer / mobile) ─────────────────────────────────────────────────

// GET /hot-food/store/:storeId/menu — available items for a store
export async function getStoreMenu(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const items = await prisma.hotFoodMenuItem.findMany({
    where: {
      isAvailable: true,
      OR: [{ storeId }, { storeId: null }],
    },
    select: { id: true, name: true, description: true, price: true, estimatedMinutes: true, imageUrl: true },
    orderBy: { name: 'asc' },
  });
  res.json({ success: true, data: items });
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

  // Validate + price each item from the current menu
  const menuItemIds: string[] = items.map((i: any) => i.menuItemId);
  const menuItems = await prisma.hotFoodMenuItem.findMany({
    where: {
      id: { in: menuItemIds },
      isAvailable: true,
      OR: [{ storeId }, { storeId: null }],
    },
  });

  const menuMap = new Map(menuItems.map(m => [m.id, m]));
  const orderLines: { menuItemId: string; name: string; price: number; quantity: number }[] = [];
  for (const line of items) {
    const menu = menuMap.get(line.menuItemId);
    if (!menu) {
      res.status(400).json({ success: false, error: `Item not available: ${line.menuItemId}` });
      return;
    }
    const qty = parseInt(line.quantity) || 1;
    orderLines.push({ menuItemId: menu.id, name: menu.name, price: menu.price, quantity: qty });
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

  res.status(201).json({ success: true, data: order });
}

// GET /hot-food/orders/mine — customer's own orders
export async function getMyOrders(req: AuthRequest, res: Response) {
  const customerId = req.user!.id;
  const orders = await prisma.hotFoodOrder.findMany({
    where: { customerId },
    include: {
      store: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  res.json({ success: true, data: orders });
}
