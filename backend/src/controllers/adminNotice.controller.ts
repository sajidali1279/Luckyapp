import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';

// POST /admin/notices  (SuperAdmin+)
export async function createNotice(req: AuthRequest, res: Response) {
  const { title, body, storeId, endDate } = req.body;

  if (!title?.trim() || !body?.trim() || !endDate) {
    res.status(400).json({ success: false, error: 'title, body, and endDate are required' });
    return;
  }

  const notice = await prisma.adminNotice.create({
    data: {
      title: title.trim(),
      body: body.trim(),
      storeId: storeId || null,
      endDate: new Date(endDate),
      createdById: req.user!.id,
    },
    include: { store: { select: { id: true, name: true } } },
  });

  res.status(201).json({ success: true, data: notice });
}

// GET /admin/notices  (SuperAdmin+) — management list, includes inactive/expired
export async function getAllNotices(req: AuthRequest, res: Response) {
  const notices = await prisma.adminNotice.findMany({
    include: {
      store: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true, phone: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  res.json({ success: true, data: notices });
}

// PATCH /admin/notices/:id  (SuperAdmin+) — deactivate early
export async function deactivateNotice(req: AuthRequest, res: Response) {
  const notice = await prisma.adminNotice.update({
    where: { id: req.params.id },
    data: { isActive: false },
  });

  res.json({ success: true, data: notice });
}

// DELETE /admin/notices/:id  (SuperAdmin+)
export async function deleteNotice(req: AuthRequest, res: Response) {
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
