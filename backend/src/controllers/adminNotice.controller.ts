import { Response } from 'express';
import { Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import { audit } from '../utils/audit';

const MAX_TITLE = 100;   // the admin form's own limit
const MAX_BODY = 500;
const MAX_DAYS_AHEAD = 366;

// The one place both removal routes look a notice up: a 404 for one that does not exist (it used to be a 500 for HQ), and a
// manager may only touch their own store's
async function noticeFor(req: AuthRequest, res: Response) {
  const existing = await prisma.adminNotice.findUnique({ where: { id: req.params.id }, select: { id: true, title: true, storeId: true, isActive: true } });
  if (!existing) { res.status(404).json({ success: false, error: 'That notice does not exist.' }); return null; }
  const user = req.user!;
  if (!hasMinRole(user.role, Role.SUPER_ADMIN) && (existing.storeId === null || !user.storeIds?.includes(existing.storeId))) {
    res.status(403).json({ success: false, error: "You can only manage your own store's notices" });
    return null;
  }
  return existing;
}

// POST /admin/notices  (StoreManager+)
export async function createNotice(req: AuthRequest, res: Response) {
  const user = req.user!;
  const { title, body, endDate } = req.body;

  if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim() || !endDate) {
    res.status(400).json({ success: false, error: 'Enter a title, the notice text and the last day.' });
    return;
  }
  if (title.trim().length > MAX_TITLE) { res.status(400).json({ success: false, error: `Keep the title under ${MAX_TITLE} characters.` }); return; }
  if (body.trim().length > MAX_BODY) { res.status(400).json({ success: false, error: `Keep the notice under ${MAX_BODY} characters.` }); return; }
  const ends = new Date(endDate);
  if (isNaN(ends.getTime())) { res.status(400).json({ success: false, error: 'Pick a real last day.' }); return; }
  if (ends.getTime() < Date.now()) { res.status(400).json({ success: false, error: 'The last day has already passed. Pick today or a later day.' }); return; }
  if (ends.getTime() > Date.now() + MAX_DAYS_AHEAD * 86_400_000) { res.status(400).json({ success: false, error: 'A notice can run for up to a year.' }); return; }

  // A Store Manager can only ever post a notice scoped to one of their own
  // stores — never chain-wide, and never a store they're not assigned to.
  // Honor a requested storeId if it's genuinely one of theirs (a manager
  // with more than one store picks which); otherwise fall back to their
  // first store.
  let storeId: string | null = req.body.storeId || null;
  if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const requested = req.body.storeId as string | undefined;
    const ownStoreId = requested && user.storeIds?.includes(requested) ? requested : user.storeIds?.[0];
    if (!ownStoreId) { res.status(400).json({ success: false, error: 'No store assigned to your account' }); return; }
    storeId = ownStoreId;
  } else if (storeId && !(await prisma.store.findUnique({ where: { id: storeId }, select: { id: true } }))) {
    res.status(400).json({ success: false, error: 'That store does not exist.' });
    return;
  }

  const notice = await prisma.adminNotice.create({
    data: {
      title: title.trim(),
      body: body.trim(),
      storeId,
      endDate: ends,
      createdById: user.id,
    },
    include: { store: { select: { id: true, name: true } } },
  });
  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'NOTICE_CREATE', entity: 'notice', entityId: notice.id,
    details: { summary: `Notice posted${notice.store ? ` for ${notice.store.name}` : ' for all stores'}: ${notice.title}` },
    storeId: notice.storeId, storeName: notice.store?.name,
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
  const existing = await noticeFor(req, res);
  if (!existing) return;
  const notice = await prisma.adminNotice.update({ where: { id: existing.id }, data: { isActive: false } });
  if (existing.isActive) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'NOTICE_DEACTIVATE', entity: 'notice', entityId: existing.id,
      details: { summary: `Notice taken down: ${existing.title}` }, storeId: existing.storeId,
    });
  }
  res.json({ success: true, data: notice });
}

// DELETE /admin/notices/:id  (StoreManager+)
export async function deleteNotice(req: AuthRequest, res: Response) {
  const existing = await noticeFor(req, res);
  if (!existing) return;
  await prisma.adminNotice.delete({ where: { id: existing.id } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'NOTICE_DELETE', entity: 'notice', entityId: existing.id,
    details: { summary: `Notice deleted: ${existing.title}` }, storeId: existing.storeId,
  });
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
