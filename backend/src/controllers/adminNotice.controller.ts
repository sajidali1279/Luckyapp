import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';

// POST /admin/notices  (StoreManager+)
export async function createNotice(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { title, body, endDate } = req.body;

  if (!title?.trim() || !body?.trim() || !endDate) {
    res.status(400).json({ success: false, error: 'title, body, and endDate are required' });
    return;
  }

  // A Store Manager can only ever post a notice scoped to their own store
  // — never a chain-wide one, regardless of what storeId was requested.
  let storeId: string | null = req.body.storeId || null;
  if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const ownStoreId = user.storeIds?.[0];
    if (!ownStoreId) { res.status(400).json({ success: false, error: 'No store assigned to your account' }); return; }
    storeId = ownStoreId;
  }

  const notice = await prisma.adminNotice.create({
    data: {
      title: title.trim(),
      body: body.trim(),
      storeId,
      endDate: new Date(endDate),
      createdById: user.id,
    },
    include: { store: { select: { id: true, name: true } } },
  });

  res.status(201).json({ success: true, data: notice });
}

// GET /admin/notices  (StoreManager+) — management list, includes inactive/expired
export async function getAllNotices(req: AuthRequest, res: Response) {
  const user = req.user!;
  // A Store Manager only sees chain-wide notices plus their own store's —
  // never another store's.
  const where = hasMinRole(user.role, Role.SUPER_ADMIN)
    ? {}
    : { OR: [{ storeId: null }, ...(user.storeIds?.length ? [{ storeId: { in: user.storeIds } }] : [])] };

  const notices = await prisma.adminNotice.findMany({
    where,
    include: {
      store: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: notices });
}

// PATCH /admin/notices/:id  (StoreManager+) — deactivate early
export async function deactivateNotice(req: AuthRequest, res: Response) {
  const user = req.user!;

  if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const existing = await prisma.adminNotice.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Notice not found' }); return; }
    if (existing.storeId === null || !user.storeIds?.includes(existing.storeId)) {
      res.status(403).json({ success: false, error: "You can only manage your own store's notices" });
      return;
    }
  }

  const notice = await prisma.adminNotice.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ success: true, data: notice });
}

// DELETE /admin/notices/:id  (StoreManager+)
export async function deleteNotice(req: AuthRequest, res: Response) {
  const user = req.user!;

  if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const existing = await prisma.adminNotice.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
    if (!existing) { res.status(404).json({ success: false, error: 'Notice not found' }); return; }
    if (existing.storeId === null || !user.storeIds?.includes(existing.storeId)) {
      res.status(403).json({ success: false, error: "You can only manage your own store's notices" });
      return;
    }
  }

  await prisma.adminNotice.delete({ where: { id: req.params.id } });
  res.json({ success: true, message: 'Notice deleted' });
}

// GET /notices/active  (staff — EMPLOYEE+) — active notices relevant to the caller's stores
export async function getActiveNotices(req: AuthRequest, res: Response) {
  const user = req.user!;
  const storeIds = user.storeIds || [];
  const now = new Date();

  const notices = await prisma.adminNotice.findMany({
    where: {
      isActive: true,
      endDate: { gte: now },
      OR: [
        { storeId: null },
        ...(storeIds.length ? [{ storeId: { in: storeIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({ success: true, data: notices });
}
