// Store managers ask HQ for a cashback promotion at their store (they cannot post cashback themselves). HQ sees the request with a cost
// estimate, can change it (the bonus, the dates, the hours), then approves it, which creates the real promotion and announces it like any
// other, or declines it with a reason. The manager gets a push either way, and can withdraw a request while it is waiting.
//
// Requests live in their own table (OfferRequest), so nothing pending can ever pay a sale or be shown to a customer.

import { Response } from 'express';
import { z } from 'zod';
import { OfferType, Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { sendPushToUser } from '../utils/push';
import { announceOffer } from '../utils/offerAnnounce';
import { checkHours, hoursText } from '../utils/offerHours';
import { offerSchema } from './offers.controller';

const MANAGER_URL = '/(manager)/offers?tab=requests';
const pct = (r: number | null | undefined) => (r == null ? null : `${Math.round(r * 1000) / 10}%`);

/** "+5% on groceries" / "+10c a gallon on gas" / "+3% (by tier)" for messages and the log. */
export function bonusWords(r: { bonusRate?: number | null; tierBonusRates?: unknown; gasBonusCentsPerGallon?: number | null; category?: string | null }): string {
  const what = r.category ? ` on ${r.category.toLowerCase().replace(/_/g, ' ')}` : '';
  if (r.gasBonusCentsPerGallon != null) return `+${r.gasBonusCentsPerGallon}c a gallon${what}`;
  if (r.tierBonusRates && typeof r.tierBonusRates === 'object' && Object.keys(r.tierBonusRates as object).length) return `+${pct(r.bonusRate)} (by tier)${what}`;
  return `+${pct(r.bonusRate)}${what}`;
}

/** True when the fields ask for cashback (a request must; a deal is posted directly, not requested). */
function paysCashback(d: { bonusRate?: number | null; tierBonusRates?: Record<string, number> | null; gasBonusCentsPerGallon?: number | null }): boolean {
  return (d.bonusRate ?? 0) > 0 || (d.gasBonusCentsPerGallon ?? 0) > 0 || Object.values(d.tierBonusRates ?? {}).some((v) => v > 0);
}

const noteField = z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(300, 'The note for HQ can be at most 300 characters.').optional());

// ─── Manager: ask ─────────────────────────────────────────────────────────────

/** POST /offer-requests: a store manager asks for a cashback promotion at one of their stores. */
export async function createOfferRequest(req: AuthRequest, res: Response) {
  const body = req.body ?? {};
  const managerStores = req.user!.storeIds ?? [];
  const storeId = typeof body.storeId === 'string' && managerStores.includes(body.storeId) ? body.storeId : managerStores[0];
  if (!storeId) { res.status(403).json({ success: false, error: 'No store assigned to your account' }); return; }

  // A request is for cashback; a deal is posted straight away. Said before the general form rules, which would also mention a deal.
  let tiers: unknown = body.tierBonusRates;
  if (typeof tiers === 'string') { try { tiers = JSON.parse(tiers); } catch { tiers = null; } }
  const asks = Number(body.bonusRate) > 0 || Number(body.gasBonusCentsPerGallon) > 0
    || (!!tiers && typeof tiers === 'object' && Object.values(tiers as Record<string, unknown>).some((v) => Number(v) > 0));
  if (!asks) { res.status(400).json({ success: false, error: 'A request is for cashback: add a bonus (a percentage or cents per gallon). A deal can be posted straight away.' }); return; }

  // The same rules as an offer HQ posts, for one store
  const parsed = offerSchema.safeParse({ ...body, type: OfferType.SPECIFIC_STORE, storeId, dealText: undefined });
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const d = parsed.data;
  if (!paysCashback(d)) { res.status(400).json({ success: false, error: 'A request is for cashback: add a bonus (a percentage or cents per gallon). A deal can be posted straight away.' }); return; }
  const hours = checkHours(body);
  if (!hours.ok) { res.status(400).json({ success: false, error: hours.message }); return; }
  const note = noteField.safeParse(body.note);
  if (!note.success) { refuse(res, note.error); return; }

  const request = await prisma.offerRequest.create({
    data: {
      storeId, requestedById: req.user!.id, requestedByName: req.user!.name || null,
      title: d.title, description: d.description ?? '', category: d.category ?? null,
      bonusRate: d.bonusRate ?? null, tierBonusRates: d.tierBonusRates ?? undefined, gasBonusCentsPerGallon: d.gasBonusCentsPerGallon ?? null,
      requires21: d.requires21 ?? false, startDate: new Date(d.startDate), endDate: new Date(d.endDate),
      ...hours.hours, note: note.data ?? null,
    },
    include: { store: { select: { name: true } } },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'OFFER_REQUESTED', entity: 'offer_request', entityId: request.id,
    details: { summary: `Asked HQ for "${request.title}" at ${request.store.name}: ${bonusWords(request)}${hoursText(request) ? `, ${hoursText(request)}` : ''}.` },
    storeId,
  });
  res.status(201).json({ success: true, data: request });
}

/** GET /offer-requests: a manager sees their stores' requests; HQ sees every store's (?status=PENDING for the queue). */
export async function listOfferRequests(req: AuthRequest, res: Response) {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const statuses = ['PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN'];
  if (status && !statuses.includes(status)) { res.status(400).json({ success: false, error: 'Unknown status.' }); return; }
  const mine = req.user!.role === Role.STORE_MANAGER;
  const requests = await prisma.offerRequest.findMany({
    where: { ...(status ? { status: status as never } : {}), ...(mine ? { storeId: { in: req.user!.storeIds ?? [] } } : {}) },
    orderBy: [{ createdAt: 'desc' }],
    take: 100,
    include: { store: { select: { name: true } } },
  });
  res.json({ success: true, data: requests.map((r) => ({ ...r, bonusText: bonusWords(r), hoursText: hoursText(r) })) });
}

/** POST /offer-requests/:id/withdraw: the manager takes back a request HQ has not decided yet. */
export async function withdrawOfferRequest(req: AuthRequest, res: Response) {
  const r = await prisma.offerRequest.findUnique({ where: { id: req.params.id } });
  if (!r || !(req.user!.storeIds ?? []).includes(r.storeId)) { res.status(404).json({ success: false, error: 'That request was not found.' }); return; }
  const { count } = await prisma.offerRequest.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'WITHDRAWN' } });
  if (count === 0) { res.status(409).json({ success: false, error: 'HQ has already decided on this request.' }); return; }
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'OFFER_REQUEST_WITHDRAWN', entity: 'offer_request', entityId: r.id,
    details: { summary: `Withdrew the request for "${r.title}".` }, storeId: r.storeId,
  });
  res.json({ success: true });
}

// ─── HQ: decide ───────────────────────────────────────────────────────────────

/**
 * POST /offer-requests/:id/approve: HQ, with any changes in the body (the same fields as an offer). Creates the promotion for the request's
 * store, announces it like any other, tells the manager. Decided once: two clicks or two people approving make one promotion.
 */
export async function approveOfferRequest(req: AuthRequest, res: Response) {
  const r = await prisma.offerRequest.findUnique({ where: { id: req.params.id }, include: { store: { select: { name: true } } } });
  if (!r) { res.status(404).json({ success: false, error: 'That request was not found.' }); return; }
  if (r.status !== 'PENDING') { res.status(409).json({ success: false, error: r.status === 'WITHDRAWN' ? 'The manager withdrew this request.' : 'This request has already been decided.' }); return; }

  // The request as it stands, with HQ's changes on top
  const b = req.body ?? {};
  const pick = <T>(k: string, fallback: T) => (k in b ? b[k] : fallback);
  const merged = {
    title: pick('title', r.title),
    description: pick('description', r.description),
    type: OfferType.SPECIFIC_STORE,
    storeId: r.storeId,
    category: pick('category', r.category ?? undefined),
    bonusRate: pick('bonusRate', r.bonusRate ?? undefined),
    tierBonusRates: pick('tierBonusRates', r.tierBonusRates ?? undefined),
    gasBonusCentsPerGallon: pick('gasBonusCentsPerGallon', r.gasBonusCentsPerGallon ?? undefined),
    requires21: pick('requires21', r.requires21),
    startDate: pick('startDate', r.startDate.toISOString()),
    endDate: pick('endDate', r.endDate.toISOString()),
  };
  const parsed = offerSchema.safeParse(merged);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const d = parsed.data;
  if (!paysCashback(d)) { res.status(400).json({ success: false, error: 'Add a bonus (a percentage or cents per gallon).' }); return; }
  const hours = checkHours({ happyDays: pick('happyDays', r.happyDays), happyFrom: pick('happyFrom', r.happyFrom), happyTo: pick('happyTo', r.happyTo) });
  if (!hours.ok) { res.status(400).json({ success: false, error: hours.message }); return; }

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    // Claimed while still waiting, so it is approved once
    const claimed = await tx.offerRequest.updateMany({
      where: { id: r.id, status: 'PENDING' },
      data: { status: 'APPROVED', decidedById: req.user!.id, decidedByName: req.user!.name || null, decidedAt: now },
    });
    if (claimed.count === 0) return null;
    const offer = await tx.offer.create({
      data: {
        title: d.title, description: d.description ?? '', type: OfferType.SPECIFIC_STORE, storeId: r.storeId,
        category: d.category ?? null, bonusRate: d.bonusRate ?? null, tierBonusRates: d.tierBonusRates ?? undefined,
        gasBonusCentsPerGallon: d.gasBonusCentsPerGallon ?? null, requires21: d.requires21 ?? false,
        startDate: new Date(d.startDate), endDate: new Date(d.endDate), ...hours.hours,
      },
    });
    await tx.offerRequest.update({ where: { id: r.id }, data: { offerId: offer.id } });
    return offer;
  });
  if (!created) { res.status(409).json({ success: false, error: 'This request has already been decided.' }); return; }

  if (created.startDate.getTime() <= Date.now() + 60_000) {
    announceOffer({ id: created.id, title: created.title, storeId: created.storeId, endDate: created.endDate, createdAt: created.createdAt })
      .catch((e) => console.error('[offer-requests] announcement failed:', e?.message ?? e));
  }
  const changed = (['title', 'bonusRate', 'tierBonusRates', 'gasBonusCentsPerGallon', 'category', 'startDate', 'endDate', 'happyDays', 'happyFrom', 'happyTo'] as const)
    .some((k) => k in b);
  sendPushToUser(r.requestedById, 'Promotion approved',
    `"${created.title}" at ${r.store.name} is approved${changed ? ' with changes from HQ' : ''}: ${bonusWords(created)}.`, 'OFFER', MANAGER_URL)
    .catch(() => {});
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'OFFER_REQUEST_APPROVED', entity: 'offer', entityId: created.id,
    details: { summary: `Approved ${r.requestedByName ?? 'a manager'}'s request "${created.title}" at ${r.store.name}${changed ? ' with changes' : ''}: ${bonusWords(created)}${hoursText(created) ? `, ${hoursText(created)}` : ''}.`, requestId: r.id },
    storeId: r.storeId, storeName: r.store.name,
  });
  res.json({ success: true, data: created });
}

/** POST /offer-requests/:id/decline: HQ, with a reason the manager sees. Decided once. */
export async function declineOfferRequest(req: AuthRequest, res: Response) {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
  if (!reason) { res.status(400).json({ success: false, error: 'Say why, so the manager knows what to change.' }); return; }
  if (reason.length > 300) { res.status(400).json({ success: false, error: 'The reason can be at most 300 characters.' }); return; }
  const r = await prisma.offerRequest.findUnique({ where: { id: req.params.id }, include: { store: { select: { name: true } } } });
  if (!r) { res.status(404).json({ success: false, error: 'That request was not found.' }); return; }
  const { count } = await prisma.offerRequest.updateMany({
    where: { id: r.id, status: 'PENDING' },
    data: { status: 'DECLINED', declineReason: reason, decidedById: req.user!.id, decidedByName: req.user!.name || null, decidedAt: new Date() },
  });
  if (count === 0) { res.status(409).json({ success: false, error: r.status === 'WITHDRAWN' ? 'The manager withdrew this request.' : 'This request has already been decided.' }); return; }
  sendPushToUser(r.requestedById, 'Promotion not approved', `"${r.title}" at ${r.store.name}: ${reason}`, 'OFFER', MANAGER_URL).catch(() => {});
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'OFFER_REQUEST_DECLINED', entity: 'offer_request', entityId: r.id,
    details: { summary: `Declined ${r.requestedByName ?? 'a manager'}'s request "${r.title}" at ${r.store.name}: ${reason}` },
    storeId: r.storeId, storeName: r.store.name,
  });
  res.json({ success: true });
}
