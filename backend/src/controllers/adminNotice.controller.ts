import { Response } from 'express';
import { NoticeAudience, NoticePriority, Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { hasMinRole } from '../middleware/auth';
import { audit } from '../utils/audit';
import { usableStoreIds } from '../utils/storeAccess';
import { announceNotice } from '../utils/noticeAnnounce';

const MAX_TITLE = 100;   // the admin form's own limit
const MAX_BODY = 500;
const MAX_DAYS_AHEAD = 366;
const PRIORITIES = Object.values(NoticePriority) as string[];
const AUDIENCES = Object.values(NoticeAudience) as string[];

type Fail = { status: number; error: string };
const isFail = (x: unknown): x is Fail => !!x && typeof x === 'object' && 'error' in (x as any) && 'status' in (x as any);

/** Which audiences a signed-in person belongs to. HQ sees every notice. */
function audiencesFor(role: Role | string): NoticeAudience[] {
  if (role === Role.EMPLOYEE) return [NoticeAudience.ALL_STAFF, NoticeAudience.EMPLOYEES];
  if (role === Role.STORE_MANAGER) return [NoticeAudience.ALL_STAFF, NoticeAudience.MANAGERS];
  return [NoticeAudience.ALL_STAFF, NoticeAudience.MANAGERS, NoticeAudience.EMPLOYEES];
}

/** The one store an older app build reads, or null (every store, or several). */
function legacyStoreId(storeIds: string[]): string | null {
  return storeIds.length === 1 ? storeIds[0] : null;
}

/** A manager may act on a notice only when it is for their stores alone (never a chain-wide one, never another store's). */
async function mayManage(req: AuthRequest, storeIds: string[]): Promise<boolean> {
  const user = req.user!;
  if (hasMinRole(user.role, Role.SUPER_ADMIN)) return true;
  if (storeIds.length === 0) return false;
  const mine = await usableStoreIds(user.id, user.role);
  return storeIds.every((id) => mine.includes(id));
}

/**
 * Reads and checks what the form sent, on top of the notice as it is (for an edit). Everything that can be wrong is said in plain words.
 * A Store Manager's notice is always for some of their own stores: none chosen means all of theirs.
 */
async function readNotice(req: AuthRequest, existing?: {
  title: string; body: string; storeIds: string[]; audience: NoticeAudience; priority: NoticePriority; startDate: Date; endDate: Date; isActive: boolean;
}) {
  const user = req.user!;
  const b = req.body ?? {};
  const now = Date.now();

  const title = b.title !== undefined ? (typeof b.title === 'string' ? b.title.trim() : '') : existing?.title ?? '';
  const text = b.body !== undefined ? (typeof b.body === 'string' ? b.body.trim() : '') : existing?.body ?? '';
  if (!title || !text) return { status: 400, error: 'Enter a title and the notice text.' } as Fail;
  if (title.length > MAX_TITLE) return { status: 400, error: `Keep the title under ${MAX_TITLE} characters.` } as Fail;
  if (text.length > MAX_BODY) return { status: 400, error: `Keep the notice under ${MAX_BODY} characters.` } as Fail;

  const priority = b.priority !== undefined ? String(b.priority) : existing?.priority ?? NoticePriority.NORMAL;
  if (!PRIORITIES.includes(priority)) return { status: 400, error: 'Pick Normal or Urgent.' } as Fail;
  const audience = b.audience !== undefined ? String(b.audience) : existing?.audience ?? NoticeAudience.ALL_STAFF;
  if (!AUDIENCES.includes(audience)) return { status: 400, error: 'Pick who the notice is for: everyone, managers or employees.' } as Fail;

  const start = b.startDate !== undefined && b.startDate !== null && b.startDate !== '' ? new Date(b.startDate) : existing?.startDate ?? new Date(now);
  if (isNaN(start.getTime())) return { status: 400, error: 'Pick a real first day.' } as Fail;
  if (b.endDate === undefined && !existing) return { status: 400, error: 'Pick the last day.' } as Fail;
  const end = b.endDate !== undefined ? new Date(b.endDate) : existing!.endDate;
  if (isNaN(end.getTime())) return { status: 400, error: 'Pick a real last day.' } as Fail;
  if (start.getTime() > now + MAX_DAYS_AHEAD * 86_400_000) return { status: 400, error: 'A notice can be scheduled up to a year ahead.' } as Fail;
  const isActive = b.isActive !== undefined ? b.isActive === true : existing?.isActive ?? true;
  // A live notice has to end in the future (a new one, one brought back, or one whose last day is being changed). Said first: it is the clearer reason.
  if (isActive && end.getTime() < now && (!existing || b.endDate !== undefined || (b.isActive === true && !existing.isActive))) {
    return { status: 400, error: 'The last day has already passed. Pick today or a later day.' } as Fail;
  }
  if (end.getTime() < start.getTime()) return { status: 400, error: 'The last day is before the first day.' } as Fail;
  if (end.getTime() > start.getTime() + MAX_DAYS_AHEAD * 86_400_000) return { status: 400, error: 'A notice can run for up to a year.' } as Fail;

  // The stores: a list (the new form), a single one (older callers), or none (every store)
  let storeIds: string[];
  if (Array.isArray(b.storeIds)) storeIds = [...new Set((b.storeIds as unknown[]).filter((x): x is string => typeof x === 'string' && !!x))];
  else if (b.storeId !== undefined) storeIds = b.storeId ? [String(b.storeId)] : [];
  else storeIds = existing?.storeIds ?? [];

  if (!hasMinRole(user.role, Role.SUPER_ADMIN)) {
    const mine = await usableStoreIds(user.id, user.role);
    if (mine.length === 0) return { status: 400, error: 'No store assigned to your account' } as Fail;
    if (storeIds.length === 0) storeIds = mine;
    if (!storeIds.every((id) => mine.includes(id))) return { status: 403, error: "You can only post notices for your own stores." } as Fail;
  }
  if (storeIds.length > 0) {
    const found = await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true } });
    if (found.length !== storeIds.length) return { status: 400, error: 'One of the chosen stores does not exist.' } as Fail;
  }

  return { title, body: text, priority: priority as NoticePriority, audience: audience as NoticeAudience, startDate: start, endDate: end, isActive, storeIds };
}

async function storeNames(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.store.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, name: true } });
  return new Map(rows.map((r) => [r.id, r.name]));
}

function whereWords(storeIds: string[], names: Map<string, string>): string {
  if (storeIds.length === 0) return 'all stores';
  if (storeIds.length === 1) return names.get(storeIds[0]) ?? 'one store';
  return `${storeIds.length} stores`;
}

// The one place the edit and removal routes look a notice up: a 404 for one that does not exist, and a manager may only touch their own stores'
async function noticeFor(req: AuthRequest, res: Response) {
  const existing = await prisma.adminNotice.findUnique({ where: { id: req.params.id } });
  if (!existing) { res.status(404).json({ success: false, error: 'That notice does not exist.' }); return null; }
  if (!(await mayManage(req, existing.storeIds))) {
    res.status(403).json({ success: false, error: "You can only manage your own store's notices" });
    return null;
  }
  return existing;
}

// POST /admin/notices  (StoreManager+)
export async function createNotice(req: AuthRequest, res: Response) {
  const user = req.user!;
  const input = await readNotice(req);
  if (isFail(input)) { res.status(input.status).json({ success: false, error: input.error }); return; }
  const notify = req.body?.notify !== false;

  const notice = await prisma.adminNotice.create({
    data: {
      title: input.title, body: input.body, priority: input.priority, audience: input.audience,
      storeIds: input.storeIds, storeId: legacyStoreId(input.storeIds),
      startDate: input.startDate, endDate: input.endDate, notify,
      createdById: user.id,
    },
  });
  const names = await storeNames(input.storeIds);
  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'NOTICE_CREATE', entity: 'notice', entityId: notice.id,
    details: { summary: `${notice.priority === 'URGENT' ? 'Urgent notice' : 'Notice'} posted for ${whereWords(input.storeIds, names)}: ${notice.title}` },
    storeId: notice.storeId, storeName: notice.storeId ? names.get(notice.storeId) : undefined,
  });

  // Started already: push now. Scheduled: the job pushes it when its first day begins.
  let sentTo: number | null = null;
  if (notify && notice.startDate.getTime() <= Date.now()) sentTo = await announceNotice(notice);
  res.status(201).json({ success: true, data: { ...notice, sentTo } });
}

// PUT /admin/notices/:id  (StoreManager+) — edit, extend, bring back; `notify: true` tells staff again
export async function updateNotice(req: AuthRequest, res: Response) {
  const existing = await noticeFor(req, res);
  if (!existing) return;
  const input = await readNotice(req, existing);
  if (isFail(input)) { res.status(input.status).json({ success: false, error: input.error }); return; }
  const user = req.user!;
  const started = input.startDate.getTime() <= Date.now();
  // For one that has not started, `notify` is whether to push when it starts; for a live one, `notify: true` pushes again now
  const notifyFlag = req.body?.notify === undefined ? existing.notify : req.body.notify === true;

  const notice = await prisma.adminNotice.update({
    where: { id: existing.id },
    data: {
      title: input.title, body: input.body, priority: input.priority, audience: input.audience,
      storeIds: input.storeIds, storeId: legacyStoreId(input.storeIds),
      startDate: input.startDate, endDate: input.endDate, isActive: input.isActive,
      notify: started ? existing.notify : notifyFlag,
      updatedById: user.id,
    },
  });

  const broughtBack = input.isActive && !existing.isActive;
  const names = await storeNames(input.storeIds);
  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: broughtBack ? 'NOTICE_REACTIVATE' : 'NOTICE_UPDATE', entity: 'notice', entityId: notice.id,
    details: { summary: `${broughtBack ? 'Notice brought back' : 'Notice edited'} (${whereWords(input.storeIds, names)}): ${notice.title}` },
    storeId: notice.storeId, storeName: notice.storeId ? names.get(notice.storeId) : undefined,
  });

  let sentTo: number | null = null;
  if (notice.isActive && started && notice.endDate.getTime() >= Date.now()) {
    if (req.body?.notify === true) sentTo = await announceNotice(notice, new Date(), true);          // tell staff again
    else if (notice.notify && notice.announcedAt === null) sentTo = await announceNotice(notice);    // was waiting for its first day
  }
  res.json({ success: true, data: { ...notice, sentTo } });
}

// GET /admin/notices  (StoreManager+) — management list, includes scheduled, ended and taken-down ones
export async function getAllNotices(req: AuthRequest, res: Response) {
  const user = req.user!;
  // A Store Manager sees chain-wide notices plus any that include one of their stores, never another store's alone
  const where = hasMinRole(user.role, Role.SUPER_ADMIN)
    ? {}
    : await (async () => {
        const mine = await usableStoreIds(user.id, user.role);
        return { OR: [{ storeIds: { isEmpty: true } }, ...(mine.length ? [{ storeIds: { hasSome: mine } }] : [])] };
      })();

  const notices = await prisma.adminNotice.findMany({
    where,
    include: { createdBy: { select: { id: true, name: true, phone: true } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  const names = await storeNames(notices.flatMap((n) => n.storeIds));
  const mine = hasMinRole(user.role, Role.SUPER_ADMIN) ? null : await usableStoreIds(user.id, user.role);
  res.json({
    success: true,
    data: notices.map((n) => ({
      ...n,
      storeNames: n.storeIds.map((id) => names.get(id) ?? 'Unknown store'),
      canManage: mine === null || (n.storeIds.length > 0 && n.storeIds.every((id) => mine.includes(id))),
    })),
  });
}

// PATCH /admin/notices/:id  (StoreManager+) — take down early (PUT with isActive: true brings it back)
export async function deactivateNotice(req: AuthRequest, res: Response) {
  const existing = await noticeFor(req, res);
  if (!existing) return;
  const notice = await prisma.adminNotice.update({ where: { id: existing.id }, data: { isActive: false, updatedById: req.user!.id } });
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

// GET /notices/active  (staff — EMPLOYEE+) — the live notices for the caller's stores and role, urgent ones first
export async function getActiveNotices(req: AuthRequest, res: Response) {
  const user = req.user!;
  const now = new Date();
  const everyStore = hasMinRole(user.role, Role.SUPER_ADMIN);
  const mine = everyStore ? [] : await usableStoreIds(user.id, user.role);

  const notices = await prisma.adminNotice.findMany({
    where: {
      isActive: true,
      startDate: { lte: now },
      endDate: { gte: now },
      audience: { in: audiencesFor(user.role) },
      ...(everyStore ? {} : { OR: [{ storeIds: { isEmpty: true } }, ...(mine.length ? [{ storeIds: { hasSome: mine } }] : [])] }),
    },
    select: { id: true, title: true, body: true, storeId: true, storeIds: true, priority: true, audience: true, startDate: true, endDate: true, createdAt: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  res.json({ success: true, data: notices });
}
