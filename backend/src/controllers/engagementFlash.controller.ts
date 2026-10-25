// Flash deals for HQ and the app (2026-10-24). The rules (words, audience, one at a time, the weekly number, the once-only push) are in
// utils/engagementFlash.ts.
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { isCustomerAccount } from '../utils/customerOnly';
import { engagement } from '../utils/appSettings';
import { activeFlashFor, announceDueFlashDeals, draftFlash } from '../utils/engagementFlash';
import { weekStartKey } from '../utils/engagement';
import { addStoreDays, startOfStoreDate } from '../utils/storeTime';

const uuidOnly = (v: unknown): string | undefined => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined);

/** GET /engagement/flash/active?storeId= : the deal running now for this customer, or null (staff get null). */
export async function getActiveFlash(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.json({ success: true, data: null }); return; }
  res.json({ success: true, data: await activeFlashFor(req.user!.id, uuidOnly(req.query.storeId) ?? null) });
}

/** GET /engagement/flash (HQ): the last 30 deals with their state and reach, and how many this week of the most HQ allows. */
export async function listFlash(_req: AuthRequest, res: Response) {
  const now = new Date();
  const week = weekStartKey(now);
  const [rows, stores, thisWeek] = await Promise.all([
    prisma.flashDeal.findMany({ orderBy: { startsAt: 'desc' }, take: 30 }),
    prisma.store.findMany({ select: { id: true, name: true } }),
    prisma.flashDeal.count({ where: { cancelledAt: null, startsAt: { gte: startOfStoreDate(week), lt: startOfStoreDate(addStoreDays(week, 7)) } } }),
  ]);
  const names = new Map(stores.map((s) => [s.id, s.name]));
  res.json({ success: true, data: {
    thisWeek, maxPerWeek: engagement().flashDeals.maxPerWeek,
    deals: rows.map((d) => ({ ...d, store: d.storeId ? names.get(d.storeId) ?? null : null, state: d.cancelledAt ? 'CANCELLED' : d.startsAt > now ? 'SCHEDULED' : d.endsAt > now ? 'LIVE' : 'ENDED' })),
  } });
}

/** POST /engagement/flash (HQ): a new flash deal; one that starts now is pushed right away (outside quiet hours). */
export async function createFlash(req: AuthRequest, res: Response) {
  const d = await draftFlash(req.body);
  if (typeof d === 'string') { res.status(400).json({ success: false, error: d }); return; }
  const row = await prisma.flashDeal.create({ data: { ...d, createdById: req.user!.id } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'FLASH_DEAL_CREATE', entity: 'flash_deal', entityId: row.id, details: { title: row.title, audience: row.audience, startsAt: row.startsAt, endsAt: row.endsAt }, storeId: row.storeId });
  if (row.startsAt.getTime() <= Date.now()) await announceDueFlashDeals().catch((e) => console.error('[flash] push failed:', e?.message ?? e));
  res.status(201).json({ success: true, data: await prisma.flashDeal.findUnique({ where: { id: row.id } }) });
}

/** POST /engagement/flash/:id/end (HQ): a live deal ends now (its Home card and inbox lines go); a scheduled one is cancelled. */
export async function endFlash(req: AuthRequest, res: Response) {
  const d = await prisma.flashDeal.findUnique({ where: { id: req.params.id } });
  if (!d) { res.status(404).json({ success: false, error: 'That flash deal was not found.' }); return; }
  const now = new Date();
  if (d.cancelledAt || d.endsAt <= now) { res.json({ success: true, data: d, changed: false }); return; }
  const endedAt = d.endsAt, wasPushed = !!d.announcedAt, cancel = d.startsAt > now;   // read before the update
  const row = await prisma.flashDeal.update({ where: { id: d.id }, data: cancel ? { cancelledAt: now } : { endsAt: now } });
  if (wasPushed) {
    // the inbox lines it left (they were set to leave when it ended) leave now
    await prisma.userNotification.updateMany({ where: { type: 'OFFER', expiresAt: endedAt, title: { in: [`⚡ ${d.title}`, `⚡ ${d.titleEs || d.title}`] } }, data: { expiresAt: now } }).catch(() => {});
  }
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'FLASH_DEAL_END', entity: 'flash_deal', entityId: d.id, details: { title: d.title, cancelled: cancel }, storeId: d.storeId });
  res.json({ success: true, data: row, changed: true });
}
