import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { StoreRequestType, StoreRequestPriority } from '@prisma/client';
import { audit } from '../utils/audit';

const PLATFORM_ADMIN_ROLES = ['DEV_ADMIN', 'SUPER_ADMIN'];

async function canAccessStore(userId: string, role: string, storeId: string): Promise<boolean> {
  if (PLATFORM_ADMIN_ROLES.includes(role)) return true;
  const access = await prisma.userStoreRole.findUnique({
    where: { userId_storeId: { userId, storeId } },
  });
  return !!access;
}

// ─── POST /store-requests ────────────────────────────────────────────────────

export async function submitRequest(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { storeId, type, priority, notes } = req.body as {
    storeId: string;
    type: string;
    priority: string;
    notes?: string;
  };

  if (!storeId || !type || !priority) {
    res.status(400).json({ success: false, error: 'storeId, type and priority are required' });
    return;
  }

  if (!Object.values(StoreRequestType).includes(type as StoreRequestType)) {
    res.status(400).json({ success: false, error: 'Invalid request type' });
    return;
  }

  if (!Object.values(StoreRequestPriority).includes(priority as StoreRequestPriority)) {
    res.status(400).json({ success: false, error: 'Invalid priority' });
    return;
  }

  if (!(await canAccessStore(user.id, user.role, storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  const request = await prisma.storeRequest.create({
    data: {
      storeId,
      submittedById: user.id,
      submitterName: user.name || user.phone,
      submitterRole: user.role,
      type: type as StoreRequestType,
      priority: priority as StoreRequestPriority,
      notes: notes?.trim() || null,
    },
    include: { store: { select: { name: true } } },
  });

  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'SUBMIT_STORE_REQUEST', entity: 'store_request', entityId: request.id,
    details: { type: request.type, priority: request.priority },
    storeId, storeName: request.store.name,
  });

  res.status(201).json({ success: true, data: request });
}

// ─── GET /store-requests/mine ────────────────────────────────────────────────

export async function getMyRequests(req: AuthRequest, res: Response) {
  const user = req.user!;

  const requests = await prisma.storeRequest.findMany({
    where: { submittedById: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { store: { select: { name: true } } },
  });

  res.json({ success: true, data: requests });
}

// ─── GET /store-requests/store/:storeId ──────────────────────────────────────

export async function getStoreRequestsList(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status } = req.query as { status?: string };
  const user = req.user!;

  if (!(await canAccessStore(user.id, user.role, storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  const requests = await prisma.storeRequest.findMany({
    where: {
      storeId,
      ...(status ? { status: status as any } : {}),
    },
    orderBy: [{ status: 'asc' }, { priority: 'desc' }, { createdAt: 'desc' }],
    take: 200,
    include: { store: { select: { name: true } } },
  });

  res.json({ success: true, data: requests });
}

// ─── GET /store-requests/pending-count ───────────────────────────────────────

export async function getPendingCount(req: AuthRequest, res: Response) {
  const user = req.user!;

  let storeIds: string[];
  if (PLATFORM_ADMIN_ROLES.includes(user.role)) {
    const stores = await prisma.store.findMany({ where: { isActive: true }, select: { id: true } });
    storeIds = stores.map((s) => s.id);
  } else {
    const storeRoles = await prisma.userStoreRole.findMany({
      where: { userId: user.id },
      select: { storeId: true },
    });
    storeIds = storeRoles.map((sr) => sr.storeId);
  }

  const count = await prisma.storeRequest.count({
    where: { storeId: { in: storeIds }, status: 'PENDING' },
  });

  res.json({ success: true, data: { count } });
}

// ─── PATCH /store-requests/:requestId/acknowledge ────────────────────────────

export async function acknowledgeRequest(req: AuthRequest, res: Response) {
  const { requestId } = req.params;
  const { note } = req.body as { note?: string };
  const user = req.user!;

  const existing = await prisma.storeRequest.findUnique({ where: { id: requestId } });
  if (!existing) {
    res.status(404).json({ success: false, error: 'Request not found' });
    return;
  }

  if (!(await canAccessStore(user.id, user.role, existing.storeId))) {
    res.status(403).json({ success: false, error: 'No access to this store' });
    return;
  }

  const updated = await prisma.storeRequest.update({
    where: { id: requestId },
    data: {
      status: 'ACKNOWLEDGED',
      acknowledgedById: user.id,
      acknowledgerName: user.name || user.phone,
      acknowledgerNote: note?.trim() || null,
      acknowledgedAt: new Date(),
    },
    include: { store: { select: { name: true } } },
  });

  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'ACKNOWLEDGE_STORE_REQUEST', entity: 'store_request', entityId: requestId,
    details: { type: existing.type, priority: existing.priority, submitterName: existing.submitterName },
    storeId: existing.storeId, storeName: updated.store.name,
  });

  res.json({ success: true, data: updated });
}
