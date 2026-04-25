import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { sendPushToUser } from '../utils/push';
import { hasMinRole } from '../middleware/auth';
import { Role } from '@prisma/client';

const DECLINE_MESSAGE =
  'Product supply unavailable with current set of vendors but request is identified, validated, stored for future references.';

// ─── POST /product-requests  (Customer) ──────────────────────────────────────

export async function submitProductRequest(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { storeId, productName, description } = req.body as {
    storeId: string;
    productName: string;
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
  expiresAt.setDate(expiresAt.getDate() + 7);

  const request = await prisma.productRequest.create({
    data: {
      customerId: user.id,
      storeId,
      productName: productName.trim(),
      description: description?.trim() || null,
      expiresAt,
    },
    include: { store: { select: { name: true } } },
  });

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

  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    const access = await prisma.userStoreRole.findUnique({
      where: { userId_storeId: { userId: req.user!.id, storeId } },
    });
    if (!access) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }

  const where: Record<string, unknown> = { storeId, expiresAt: { gte: new Date() } };
  if (status) where.status = status;

  const requests = await prisma.productRequest.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: requests });
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

  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    const access = await prisma.userStoreRole.findUnique({
      where: { userId_storeId: { userId: req.user!.id, storeId: request.storeId } },
    });
    if (!access) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }

  const finalNote = status === 'DECLINED' ? (responseNote?.trim() || DECLINE_MESSAGE) : responseNote?.trim() || null;

  const updated = await prisma.productRequest.update({
    where: { id },
    data: {
      status,
      responseNote: finalNote,
      respondedById: req.user!.id,
      respondedAt: new Date(),
    },
  });

  const notifTitle = status === 'ACCEPTED'
    ? '🎉 Product Request Accepted!'
    : '📦 Product Request Update';
  const notifBody = status === 'ACCEPTED'
    ? `Great news! Your request for "${request.productName}" at ${request.store.name} has been accepted. We'll work on getting it in stock!`
    : DECLINE_MESSAGE;

  await sendPushToUser(request.customerId, notifTitle, notifBody, 'PRODUCT_REQUEST');

  res.json({ success: true, data: updated });
}
