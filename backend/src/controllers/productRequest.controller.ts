import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { canUseStore } from '../utils/storeAccess';
import { sendPushToUser } from '../utils/push';
import { productRequestUrlManager, productRequestUrlCustomer } from '../utils/notificationRoutes';
import { hasMinRole } from '../middleware/auth';
import { Role, OrderItemSource } from '@prisma/client';
import { generateListName } from './orderList.controller';
import { rule } from '../utils/appSettings';
import { catalogOrNull } from '../utils/itemCatalog';
import { askedFor } from '../utils/itemInsights';
import { storeIdsFor } from './pdiItems.controller';

const DECLINE_MESSAGE =
  'Product supply unavailable with current set of vendors but request is identified, validated, stored for future references.';

// ─── POST /product-requests  (Customer) ──────────────────────────────────────

export async function submitProductRequest(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { storeId, productName, category, description } = req.body as {
    storeId: string;
    productName: string;
    category?: string;
    description?: string;
  };

  if (!storeId || !productName?.trim()) {
    res.status(400).json({ success: false, error: 'storeId and productName are required' });
    return;
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } });
  if (!store) {
    res.status(404).json({ success: false, error: 'Store not found' });
    return;
  }

  // Prevent duplicate active requests for the same product at the same store
  const existing = await prisma.productRequest.findFirst({
    where: {
      customerId: user.id,
      storeId,
      productName: { equals: productName.trim(), mode: 'insensitive' },
      status: 'PENDING',
      expiresAt: { gte: new Date() },
    },
  });
  if (existing) {
    res.status(409).json({ success: false, error: 'You already have an active request for this product at this store' });
    return;
  }

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + rule('productRequestDays'));   // HQ's days (Settings > Customer care); it was a fixed 7

  const request = await prisma.productRequest.create({
    data: {
      customerId: user.id,
      storeId,
      productName: productName.trim(),
      category: category?.trim() || null,
      description: description?.trim() || null,
      expiresAt,
    },
    include: { store: { select: { name: true } } },
  });

  // Push to store managers so their badge + notification tab updates
  const assignments = await prisma.userStoreRole.findMany({
    where: { storeId },
    select: { userId: true, user: { select: { role: true } } },
  });
  const managerIds = assignments
    .filter((a) => a.user.role === Role.STORE_MANAGER)
    .map((a) => a.userId);
  managerIds.forEach((id) =>
    sendPushToUser(id, '🛍️ New Product Request', `A customer is requesting "${request.productName}" at ${request.store.name}`, 'PRODUCT_REQUEST', productRequestUrlManager(request.id))
  );

  res.status(201).json({ success: true, data: request });
}

// ─── GET /product-requests/mine  (Customer) ──────────────────────────────────

export async function getMyProductRequests(req: AuthRequest, res: Response) {
  const requests = await prisma.productRequest.findMany({
    where: { customerId: req.user!.id },
    include: { store: { select: { name: true, city: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: requests });
}

// ─── GET /product-requests/store/:storeId  (StoreManager+) ───────────────────

export async function getStoreProductRequests(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status } = req.query as { status?: string };

  if (!(await canUseStore(req.user!.id, req.user!.role, storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  const where: Record<string, unknown> = { storeId, expiresAt: { gte: new Date() } };
  if (status && ['PENDING', 'ACCEPTED', 'DECLINED'].includes(status)) where.status = status;   // anything else is ignored (it was a 500)

  const requests = await prisma.productRequest.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // what the stores' PDI item lists say about each product asked for (2026-11-11): this store may already sell it (out of stock, or the
  // customer missed it), or another of the person's stores does (same vendor). Left out when the lists cannot be read.
  const cat = requests.length ? await catalogOrNull() : null;
  const scopeIds = cat ? await storeIdsFor(req.user!) : null;
  const scope = scopeIds ? new Set(scopeIds) : null;
  res.json({ success: true, data: requests.map((r) => ({ ...r, pdi: cat ? askedFor(cat, r.productName, storeId, scope) : null })) });
}

// ─── GET /product-requests/check?storeId&q  (Customer, 2026-11-11) ────────────
// While a customer types the product they want: does the store already sell it (the stores' PDI item lists)? Then the app says so, with
// the register price, before they send a request (it may be out of stock or on another shelf); else the other stores that sell it. Never
// tobacco, alcohol, lottery, CBD or propane. Empty when the lists cannot be read or the name has no usable word.

export async function checkProductAtStore(req: AuthRequest, res: Response) {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId.slice(0, 64) : '';
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const none = { here: [] as { name: string; priceCents: number | null }[], elsewhere: [] as { storeName: string }[] };
  if (!storeId || q.length < 3) { res.json({ success: true, data: none }); return; }
  const cat = await catalogOrNull();
  const found = cat ? askedFor(cat, q, storeId, null, { noRestricted: true }) : null;
  if (!found) { res.json({ success: true, data: none }); return; }
  res.json({ success: true, data: { here: found.here, elsewhere: found.elsewhere.slice(0, 3).map((e) => ({ storeName: e.storeName })) } });
}

// ─── PATCH /product-requests/:id/respond  (StoreManager+) ────────────────────

export async function respondToProductRequest(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const { status, responseNote } = req.body as {
    status: 'ACCEPTED' | 'DECLINED';
    responseNote?: string;
  };

  if (!['ACCEPTED', 'DECLINED'].includes(status)) {
    res.status(400).json({ success: false, error: 'status must be ACCEPTED or DECLINED' });
    return;
  }

  const request = await prisma.productRequest.findUnique({
    where: { id },
    include: { store: { select: { name: true } }, customer: { select: { id: true, name: true } } },
  });

  if (!request) {
    res.status(404).json({ success: false, error: 'Request not found' });
    return;
  }

  if (request.status !== 'PENDING') {
    res.status(409).json({ success: false, error: 'Request already responded to' });
    return;
  }

  if (!(await canUseStore(req.user!.id, req.user!.role, request.storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  const finalNote = status === 'DECLINED' ? (responseNote?.trim() || DECLINE_MESSAGE) : responseNote?.trim() || null;

  // Only once: two managers answering at the same moment used to add the item to the order list twice and tell the customer twice
  const claimed = await prisma.productRequest.updateMany({
    where: { id, status: 'PENDING' },
    data: {
      status,
      responseNote: finalNote,
      respondedById: req.user!.id,
      respondedAt: new Date(),
    },
  });
  if (claimed.count === 0) {
    res.status(409).json({ success: false, error: 'Request already responded to' });
    return;
  }
  const updated = await prisma.productRequest.findUniqueOrThrow({ where: { id } });

  // When accepted, auto-add to the store's active order list
  if (status === 'ACCEPTED') {
    let openList = await prisma.orderList.findFirst({
      where: { storeId: request.storeId, status: 'OPEN' },
    });
    if (!openList) {
      const name = await generateListName(request.storeId);
      openList = await prisma.orderList.create({
        data: { storeId: request.storeId, name, openedById: req.user!.id },
      });
    }
    const maxOrder = await prisma.orderListItem.aggregate({
      where: { listId: openList.id },
      _max: { sortOrder: true },
    });
    await prisma.orderListItem.create({
      data: {
        listId: openList.id,
        name: request.productName,
        category: request.category || null,
        notes: request.description ? `Customer note: ${request.description}` : null,
        source: OrderItemSource.CUSTOMER_REQUEST,
        addedById: req.user!.id,
        sortOrder: (maxOrder._max.sortOrder ?? 0) + 1,
        productRequestId: request.id,
      },
    });
  }

  const notifTitle = status === 'ACCEPTED'
    ? '🎉 Product Request Accepted!'
    : '📦 Product Request Update';
  const notifBody = status === 'ACCEPTED'
    ? `Great news! Your request for "${request.productName}" at ${request.store.name} has been accepted. We'll work on getting it in stock!`
    : DECLINE_MESSAGE;

  sendPushToUser(request.customerId, notifTitle, notifBody, 'PRODUCT_REQUEST', productRequestUrlCustomer(request.id));

  res.json({ success: true, data: updated });
}

// ─── GET /product-requests/pending-count  (StoreManager+) ────────────────────

export async function getPendingProductRequestCount(req: AuthRequest, res: Response) {
  const user = req.user!;

  let storeIds: string[];
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
    storeIds = stores.map((s) => s.id);
  } else {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { userId: user.id },
      select: { storeId: true },
    });
    storeIds = storeRoles.map((sr) => sr.storeId);
  }

  const count = await prisma.productRequest.count({
    where: {
      storeId: { in: storeIds },
      status: 'PENDING',
      expiresAt: { gte: new Date() },
    },
  });

  res.json({ success: true, data: { count } });
}

// ─── GET /product-requests/pending-by-store  (StoreManager+) ─────────────────
// Same as getPendingProductRequestCount, but broken out per store so a
// multi-store viewer's store list can show which store(s) actually have a
// pending request, instead of one combined number with no indication of where.

export async function getPendingProductRequestCountByStore(req: AuthRequest, res: Response) {
  const user = req.user!;

  let storeIds: string[];
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
    storeIds = stores.map((s) => s.id);
  } else {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { userId: user.id },
      select: { storeId: true },
    });
    storeIds = storeRoles.map((sr) => sr.storeId);
  }

  if (storeIds.length === 0) {
    res.json({ success: true, data: {} });
    return;
  }

  const grouped = await prisma.productRequest.groupBy({
    by: ['storeId'],
    where: { storeId: { in: storeIds }, status: 'PENDING', expiresAt: { gte: new Date() } },
    _count: { _all: true },
  });

  res.json({ success: true, data: Object.fromEntries(grouped.map((g) => [g.storeId, g._count._all])) });
}
