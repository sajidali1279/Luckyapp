import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import cloudinary from '../config/cloudinary';

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
