// A customer's full profile for HQ (2026-10-09): everything support needs on one page. Who they are and their tier, what they have
// bought, earned and redeemed (one timeline across sales, rewards, redemptions, missing-points reports, hot food and goodwill
// credits), the phones they use, their referrals, HQ's private notes, a sign-in lockout to clear, and what staff did on the account.
// Dev Admin and Super Admin only (routes/index.ts), like the rest of Customers.
import { Response } from 'express';
import { z } from 'zod';
import { Role, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { excludeDeletedCustomers } from '../utils/accountDeletion';
import { getNextTierProgress, getStoredThresholds } from '../utils/tier';
import { shortName } from '../utils/referrals';
import { isTestPhone } from '../utils/testAccounts';

const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;
const SALE_ONLY = { challengeId: null, referralId: null };

async function findCustomer(id: string) {
  return prisma.user.findFirst({ where: { id, role: Role.CUSTOMER, ...excludeDeletedCustomers } });
}

/** GET /users/customers/:userId/profile */
export async function getCustomerProfile(req: AuthRequest, res: Response) {
  const c = await findCustomer(req.params.userId);
  if (!c) { res.status(404).json({ success: false, error: 'That customer no longer exists.' }); return; }
  const id = c.id;
  const since30 = new Date(Date.now() - 30 * DAY);
  const [sales, last30, pending, flagged, firstLast, earned, credits, catalog, byStore, disputes, hotFood, tokens, thresholds, invitedBy, invited, notes] = await Promise.all([
    prisma.pointsTransaction.aggregate({ where: { customerId: id, status: TransactionStatus.APPROVED, ...SALE_ONLY }, _count: { _all: true }, _sum: { purchaseAmount: true } }),
    prisma.pointsTransaction.count({ where: { customerId: id, status: TransactionStatus.APPROVED, ...SALE_ONLY, createdAt: { gte: since30 } } }),
    prisma.pointsTransaction.count({ where: { customerId: id, status: TransactionStatus.PENDING, ...SALE_ONLY } }),
    prisma.pointsTransaction.count({ where: { customerId: id, status: TransactionStatus.FLAGGED, ...SALE_ONLY } }),
    prisma.pointsTransaction.aggregate({ where: { customerId: id, status: TransactionStatus.APPROVED, ...SALE_ONLY }, _min: { createdAt: true }, _max: { createdAt: true } }),
    prisma.pointsTransaction.aggregate({ where: { customerId: id, status: TransactionStatus.APPROVED }, _sum: { pointsAwarded: true, gasBonusPoints: true } }),
    prisma.creditRedemption.aggregate({ where: { customerId: id }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.catalogRedemption.aggregate({ where: { customerId: id, status: 'COMPLETED' }, _sum: { pointsSpent: true }, _count: { _all: true } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { customerId: id, status: TransactionStatus.APPROVED, ...SALE_ONLY }, _count: { _all: true }, orderBy: { _count: { storeId: 'desc' } }, take: 1 }),
    prisma.pointsDispute.groupBy({ by: ['status'], where: { customerId: id }, _count: { _all: true } }),
    prisma.hotFoodOrder.count({ where: { customerId: id } }),
    prisma.pushToken.findMany({ where: { userId: id }, select: { platform: true, appVersion: true, createdAt: true, lastSeenAt: true }, orderBy: { lastSeenAt: 'desc' } }),
    getStoredThresholds(),
    prisma.referral.findUnique({ where: { friendId: id }, include: { referrer: { select: { id: true, name: true } } } }),
    prisma.referral.groupBy({ by: ['status'], where: { referrerId: id }, _count: { _all: true } }),
    prisma.customerNote.count({ where: { customerId: id } }),
  ]);
  const favStore = byStore[0] ? await prisma.store.findUnique({ where: { id: byStore[0].storeId }, select: { name: true } }) : null;
  const paidAsReferrer = await prisma.referral.aggregate({ where: { referrerId: id, referrerRewarded: true }, _sum: { referrerReward: true } });
  const count = sales._count._all, spent = sales._sum.purchaseAmount ?? 0;
  const lockedNow = !!c.lockedUntil && c.lockedUntil > new Date();
  res.json({
    success: true,
    data: {
      customer: {
        id, name: c.name, phone: c.phone, email: c.email, emailVerified: c.emailVerified, avatarUrl: c.avatarUrl, isTest: isTestPhone(c.phone),
        isActive: c.isActive, fraudNote: c.fraudNote, createdAt: c.createdAt, lastSignInAt: (c as any).lastSignInAt ?? null,
        language: c.language ?? 'en', birthMonth: c.birthMonth, birthDay: c.birthDay, age21Confirmed: c.age21Confirmed, referralCode: c.referralCode,
      },
      tier: { ...getNextTierProgress(c.periodPoints, thresholds), period: c.tierPeriod, balance: r2(c.pointsBalance) },
      stats: {
        sales: count, spent: r2(spent), avgTicket: count ? r2(spent / count) : 0, salesLast30: last30, pending, flagged,
        firstPurchaseAt: firstLast._min.createdAt, lastPurchaseAt: firstLast._max.createdAt, favoriteStore: favStore?.name ?? null,
        earned: r2((earned._sum.pointsAwarded ?? 0) + (earned._sum.gasBonusPoints ?? 0)),
        redeemed: r2((credits._sum.amount ?? 0) + (catalog._sum.pointsSpent ?? 0) / 100), redemptions: credits._count._all + catalog._count._all,
        disputes: Object.fromEntries(disputes.map((d) => [d.status, d._count._all])), hotFoodOrders: hotFood,
      },
      signIn: { locked: lockedNow, lockedUntil: lockedNow ? c.lockedUntil : null, failedAttempts: c.failedLoginAttempts, lockoutLevel: (c as any).lockoutLevel ?? 0 },
      devices: tokens,
      referral: {
        code: c.referralCode,
        invitedBy: invitedBy ? { id: invitedBy.referrer.id, name: shortName(invitedBy.referrer.name), status: invitedBy.status, at: invitedBy.createdAt } : null,
        invited: Object.fromEntries(invited.map((g) => [g.status, g._count._all])),
        earnedAsReferrer: r2(paidAsReferrer._sum.referrerReward ?? 0),
      },
      notes,
    },
  });
}

// ─── Timeline ────────────────────────────────────────────────────────────────

const KINDS = ['all', 'sales', 'rewards', 'redemptions', 'disputes', 'hotfood', 'credits'] as const;
type Kind = typeof KINDS[number];
interface Item { kind: Exclude<Kind, 'all'>; id: string; at: Date; title: string; amount: number | null; points: number | null; status: string | null; store: string | null; by: string | null; detail: string | null; receiptImageUrl?: string | null }

/** GET /users/customers/:userId/activity?kind=all|sales|rewards|redemptions|disputes|hotfood|credits&page=1 (25 a page, newest first) */
export async function getCustomerActivity(req: AuthRequest, res: Response) {
  const c = await findCustomer(req.params.userId);
  if (!c) { res.status(404).json({ success: false, error: 'That customer no longer exists.' }); return; }
  const kind = (KINDS as readonly string[]).includes(String(req.query.kind)) ? (req.query.kind as Kind) : 'all';
  const page = Math.max(1, Math.min(200, Number(req.query.page) || 1));
  const PER = 25, take = page * PER + 1;   // each source gives enough for this page once merged
  const want = (k: Kind) => kind === 'all' || kind === k;
  const id = c.id;
  const [sales, rewards, credits, catalog, disputes, hot, goodwill] = await Promise.all([
    want('sales') ? prisma.pointsTransaction.findMany({
      where: { customerId: id, ...SALE_ONLY }, orderBy: { createdAt: 'desc' }, take,
      select: { id: true, createdAt: true, purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true, status: true, category: true, receiptImageUrl: true, voidReason: true, fraudFlags: true,
        store: { select: { name: true } }, grantedBy: { select: { name: true } }, offer: { select: { title: true } } },
    }) : [],
    want('rewards') ? prisma.pointsTransaction.findMany({
      where: { customerId: id, OR: [{ challengeId: { not: null } }, { referralId: { not: null } }] }, orderBy: { createdAt: 'desc' }, take,
      select: { id: true, createdAt: true, pointsAwarded: true, status: true, notes: true, store: { select: { name: true } } },
    }) : [],
    want('redemptions') ? prisma.creditRedemption.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take, select: { id: true, createdAt: true, amount: true, store: { select: { name: true } }, processor: { select: { name: true } } } }) : [],
    want('redemptions') ? prisma.catalogRedemption.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take, select: { id: true, createdAt: true, pointsSpent: true, status: true, store: { select: { name: true } }, processedBy: { select: { name: true } }, catalogItem: { select: { title: true } } } }) : [],
    want('disputes') ? prisma.pointsDispute.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take, select: { id: true, createdAt: true, description: true, estimatedAmt: true, status: true, creditedAmt: true, resolvedNote: true, store: { select: { name: true } }, resolvedBy: { select: { name: true } } } }) : [],
    want('hotfood') ? prisma.hotFoodOrder.findMany({ where: { customerId: id }, orderBy: { createdAt: 'desc' }, take, select: { id: true, createdAt: true, orderNumber: true, totalAmount: true, status: true, cancelReason: true, store: { select: { name: true } }, items: { select: { name: true, quantity: true } } } }) : [],
    want('credits') ? prisma.auditLog.findMany({ where: { entityId: id, action: 'GOODWILL_CREDIT' }, orderBy: { createdAt: 'desc' }, take, select: { id: true, createdAt: true, actorName: true, details: true } }) : [],
  ]);
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : {}; } catch { return {}; } };
  const items: Item[] = [
    ...sales.map((t): Item => ({
      kind: 'sales', id: t.id, at: t.createdAt, title: `Purchase${t.category ? `, ${String(t.category).replace(/_/g, ' ').toLowerCase()}` : ''}`,
      amount: t.purchaseAmount, points: r2(t.pointsAwarded + t.gasBonusPoints), status: t.status, store: t.store?.name ?? null, by: t.grantedBy?.name ?? null,
      detail: [t.offer?.title ? `Promotion: ${t.offer.title}` : null, t.voidReason ? `Voided: ${t.voidReason}` : null, t.fraudFlags ? 'Flagged for review' : null].filter(Boolean).join(' · ') || null,
      receiptImageUrl: t.receiptImageUrl,
    })),
    ...rewards.map((t): Item => ({ kind: 'rewards', id: t.id, at: t.createdAt, title: t.notes || 'Reward', amount: null, points: t.pointsAwarded, status: t.status, store: t.store?.name ?? null, by: null, detail: null })),
    ...credits.map((r): Item => ({ kind: 'redemptions', id: r.id, at: r.createdAt, title: 'Credits used at the counter', amount: null, points: -r.amount, status: 'COMPLETED', store: r.store?.name ?? null, by: r.processor?.name ?? null, detail: null })),
    ...catalog.map((r): Item => ({ kind: 'redemptions', id: r.id, at: r.createdAt, title: `Reward: ${r.catalogItem?.title ?? 'item'}`, amount: null, points: -(r.pointsSpent / 100), status: r.status, store: r.store?.name ?? null, by: r.processedBy?.name ?? null, detail: null })),
    ...disputes.map((d): Item => ({ kind: 'disputes', id: d.id, at: d.createdAt, title: 'Missing-points report', amount: d.estimatedAmt, points: d.creditedAmt, status: d.status, store: d.store?.name ?? null, by: d.resolvedBy?.name ?? null, detail: [d.description, d.resolvedNote ? `Answer: ${d.resolvedNote}` : null].filter(Boolean).join(' · ') })),
    ...hot.map((o): Item => ({ kind: 'hotfood', id: o.id, at: o.createdAt, title: `Hot food order ${o.orderNumber}`, amount: o.totalAmount, points: null, status: o.status, store: o.store?.name ?? null, by: null, detail: [o.items.map((i) => `${i.quantity} × ${i.name}`).join(', '), o.cancelReason].filter(Boolean).join(' · ') })),
    ...goodwill.map((g): Item => { const d = parse(g.details); return { kind: 'credits', id: g.id, at: g.createdAt, title: 'Goodwill credit', amount: null, points: typeof d.amount === 'number' ? d.amount : null, status: 'COMPLETED', store: null, by: g.actorName, detail: d.reason ?? null }; }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());
  const slice = items.slice((page - 1) * PER, page * PER);
  res.json({ success: true, data: { items: slice, page, hasMore: items.length > page * PER, kind } });
}

// ─── Notes, sign-in, history ─────────────────────────────────────────────────

export async function listCustomerNotes(req: AuthRequest, res: Response) {
  const notes = await prisma.customerNote.findMany({ where: { customerId: req.params.userId }, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ success: true, data: notes });
}

const noteSchema = z.object({ text: z.string({ message: 'Write the note first.' }).trim().min(1, 'Write the note first.').max(1000, 'A note can be at most 1,000 characters.') });

export async function addCustomerNote(req: AuthRequest, res: Response) {
  const parsed = noteSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0].message }); return; }
  const c = await findCustomer(req.params.userId);
  if (!c) { res.status(404).json({ success: false, error: 'That customer no longer exists.' }); return; }
  const note = await prisma.customerNote.create({ data: { customerId: c.id, authorId: req.user!.id, authorName: req.user!.name ?? null, text: parsed.data.text } });
  res.status(201).json({ success: true, data: note });
}

/** Your own note, or any note for a Dev Admin. */
export async function deleteCustomerNote(req: AuthRequest, res: Response) {
  const note = await prisma.customerNote.findFirst({ where: { id: req.params.noteId, customerId: req.params.userId } });
  if (!note) { res.status(404).json({ success: false, error: 'That note is already gone.' }); return; }
  if (note.authorId !== req.user!.id && req.user!.role !== Role.DEV_ADMIN) { res.status(403).json({ success: false, error: 'Only the person who wrote a note can delete it.' }); return; }
  await prisma.customerNote.delete({ where: { id: note.id } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'CUSTOMER_NOTE_DELETE', entity: 'user', entityId: req.params.userId, details: { summary: 'Deleted a support note', text: note.text.slice(0, 200), author: note.authorName } });
  res.json({ success: true });
}

/** POST /users/customers/:userId/unlock: clears a sign-in lockout after too many wrong PINs. */
export async function unlockCustomer(req: AuthRequest, res: Response) {
  const c = await findCustomer(req.params.userId);
  if (!c) { res.status(404).json({ success: false, error: 'That customer no longer exists.' }); return; }
  await prisma.user.update({ where: { id: c.id }, data: { failedLoginAttempts: 0, lockedUntil: null, lockoutLevel: 0 } as any });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'CUSTOMER_UNLOCK', entity: 'user', entityId: c.id,
    details: { summary: `Unlocked sign-in for ${c.name || c.phone}`, wasLockedUntil: c.lockedUntil, failedAttempts: c.failedLoginAttempts } });
  res.json({ success: true });
}

/** GET /users/customers/:userId/history: what staff did on this account, from the Activity Log. */
export async function getCustomerHistory(req: AuthRequest, res: Response) {
  const rows = await prisma.auditLog.findMany({ where: { entityId: req.params.userId }, orderBy: { createdAt: 'desc' }, take: 100,
    select: { id: true, createdAt: true, actorName: true, actorRole: true, action: true, details: true, storeName: true } });
  res.json({ success: true, data: rows.map((r) => {
    let summary: string | null = null;
    try { summary = r.details ? JSON.parse(r.details).summary ?? null : null; } catch { /* keep null */ }
    return { id: r.id, at: r.createdAt, who: r.actorName, role: r.actorRole, action: r.action, summary, store: r.storeName };
  }) });
}
