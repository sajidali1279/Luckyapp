// Win-back gifts for HQ (2026-10-16, admin Customers > Win back): who a campaign would reach, sending it, and how each one did.
// The rules are in utils/winBack.ts.
import { Response } from 'express';
import { z } from 'zod';
import { ProductCategory, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { refuse } from '../utils/refusal';
import { audit } from '../utils/audit';
import { sendPushToUsers } from '../utils/push';
import { pointsUrl } from '../utils/notificationRoutes';
import { DEFAULT_DEV_CUT_RATE } from '../config/constants';
import { calculateTier, getCurrentPeriod, getStoredThresholds, rollCustomerPeriod, TIER_LADDER, updateCustomerTierIfNeeded } from '../utils/tier';
import { WINBACK, WINBACK_LIMITS as L, winBackRecipients, winBackResults } from '../utils/winBack';

const r2 = (n: number) => Math.round(n * 100) / 100;
const BATCH = 200;

const pickSchema = z.object({
  quietDays: z.coerce.number({ message: 'Give the number of days.' }).int('Give a whole number of days.')
    .min(L.minQuietDays, `At least ${L.minQuietDays} days.`).max(L.maxQuietDays, `At most ${L.maxQuietDays} days.`),
  storeId: z.string().max(64).nullish().transform((v) => v || null),
});
const sendSchema = pickSchema.extend({
  title: z.string().trim().min(1, 'Give the gift a short name.').max(60, 'Keep the name under 60 characters.'),
  titleEs: z.string().trim().max(60, 'Keep the Spanish name under 60 characters.').nullish(),
  message: z.string().trim().min(1, 'Write the message the customers get.').max(160, 'Keep the message under 160 characters (it is a push).'),
  messageEs: z.string().trim().max(160, 'Keep the Spanish message under 160 characters.').nullish(),
  amount: z.number({ message: 'Give the gift in dollars.' }).min(L.minAmount, `At least $${L.minAmount.toFixed(2)}.`).max(L.maxAmount, `At most $${L.maxAmount.toFixed(2)} a customer.`),
  expectedCount: z.number().int().min(0),
});

/** GET /winback/preview?quietDays=30&storeId= : how many it would reach, by store, and the first few, before sending */
export async function previewWinBack(req: AuthRequest, res: Response) {
  const parsed = pickSchema.safeParse(req.query);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const list = await winBackRecipients(parsed.data);
  const byStore = new Map<string, { storeId: string; store: string; count: number }>();
  for (const r of list) {
    const row = byStore.get(r.storeId) ?? { storeId: r.storeId, store: r.storeName, count: 0 };
    row.count++; byStore.set(r.storeId, row);
  }
  res.json({ success: true, data: {
    count: list.length,
    byStore: [...byStore.values()].sort((a, b) => b.count - a.count),
    sample: list.slice(0, 8).map((r) => ({ name: r.name, lastVisit: r.lastVisit, store: r.storeName })),
    limits: L,
  } });
}

/** POST /winback : send the gifts. The list is worked out again; when it changed since the preview, nothing is sent. */
export async function sendWinBack(req: AuthRequest, res: Response) {
  const parsed = sendSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const d = parsed.data;
  const amount = r2(d.amount);

  // A double click or a second HQ person a moment later: one campaign
  const recent = await prisma.challenge.findFirst({ where: { kind: WINBACK, createdAt: { gte: new Date(Date.now() - 2 * 60_000) } }, select: { id: true } });
  if (recent) { res.status(409).json({ success: false, code: 'JUST_SENT', error: 'A win-back gift was sent a moment ago. Check the list below before sending another.' }); return; }

  const list = await winBackRecipients(d);
  if (list.length === 0) { res.status(400).json({ success: false, error: 'Nobody fits right now. Try fewer days, or every store.' }); return; }
  if (list.length !== d.expectedCount) { res.status(409).json({ success: false, code: 'LIST_CHANGED', count: list.length, error: `The list changed since you looked: it is ${list.length} customers now. Check it and send again.` }); return; }
  if (list.length > L.maxRecipients) { res.status(400).json({ success: false, error: `That is ${list.length} customers; one campaign can reach ${L.maxRecipients}. Pick a store or more days.` }); return; }
  const total = r2(amount * list.length);
  if (total > L.maxTotal) { res.status(400).json({ success: false, error: `That is $${total.toFixed(2)} of gifts; one campaign can give $${L.maxTotal}. Give less each, or reach fewer customers.` }); return; }

  const now = new Date();
  const campaign = await prisma.challenge.create({ data: {
    kind: WINBACK, title: d.title, titleEs: d.titleEs || null, description: d.message, descriptionEs: d.messageEs || null,
    storeId: d.storeId, target: 0, reward: amount, repeats: false, quietDays: d.quietDays,
    startDate: now, endDate: now, isActive: false, announcedAt: now, createdById: req.user!.id,
  } });

  const stores = await prisma.store.findMany({ where: { id: { in: [...new Set(list.map((r) => r.storeId))] } }, select: { id: true, transactionFeeRate: true } });
  const feeOf = new Map(stores.map((s) => [s.id, r2(amount * (s.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE))]));
  const thresholds = await getStoredThresholds();
  const period = getCurrentPeriod(now);
  const tierUps: { id: string; periodPoints: number; tier: any }[] = [];
  let given = 0;
  for (let i = 0; i < list.length; i += BATCH) {
    const batch = list.slice(i, i + BATCH);
    const ids = batch.map((r) => r.id);
    await prisma.$transaction(async (db) => {
      // A half-year that turned and has not reached these customers yet is applied first, so the gift counts in the new one
      const stale = await db.user.findMany({ where: { id: { in: ids }, NOT: { tierPeriod: period } }, select: { id: true } });
      for (const s of stale) await rollCustomerPeriod(db, s.id, now);
      await db.pointsTransaction.createMany({ data: batch.map((r) => ({
        customerId: r.id, grantedById: r.id, storeId: r.storeId,
        purchaseAmount: 0, pointsAwarded: amount, devCut: feeOf.get(r.storeId) ?? 0, storeCost: feeOf.get(r.storeId) ?? 0, cashbackRate: 0,
        category: ProductCategory.OTHER, status: TransactionStatus.APPROVED, notes: `Win-back gift: ${d.title}`, challengeId: campaign.id,
      })) });
      await db.user.updateMany({ where: { id: { in: ids } }, data: { pointsBalance: { increment: amount }, periodPoints: { increment: amount } } });
      const after = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, periodPoints: true, tier: true } });
      for (const u of after) if (TIER_LADDER.indexOf(calculateTier(u.periodPoints, thresholds)) > TIER_LADDER.indexOf(u.tier)) tierUps.push(u);
    }, { timeout: 60_000 });
    given += batch.length;
  }
  for (const u of tierUps) await updateCustomerTierIfNeeded(u.id, u.periodPoints, u.tier).catch(() => {});

  // The push, in each customer's language
  const pts = Math.round(amount * 100);
  const es = list.filter((r) => r.language === 'es').map((r) => r.id);
  const en = list.filter((r) => r.language !== 'es').map((r) => r.id);
  sendPushToUsers(en, `🎁 ${d.title}`, `${d.message} ${pts} pts added to your balance.`, 'POINTS', pointsUrl()).catch(() => {});
  sendPushToUsers(es, `🎁 ${d.titleEs || d.title}`, `${d.messageEs || d.message} Se agregaron ${pts} puntos a tu saldo.`, 'POINTS', pointsUrl()).catch(() => {});

  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'WINBACK_SEND', entity: 'challenge', entityId: campaign.id,
    details: { summary: `Win-back gift "${d.title}": $${amount.toFixed(2)} to ${given} customers with no purchase in ${d.quietDays} days ($${total.toFixed(2)} in all)`, amount, count: given, quietDays: d.quietDays },
    storeId: d.storeId });
  res.status(201).json({ success: true, data: { id: campaign.id, sent: given, total } });
}

/** GET /winback : the campaigns, newest first, with how many came back */
export async function listWinBacks(_req: AuthRequest, res: Response) {
  const rows = await prisma.challenge.findMany({
    where: { kind: WINBACK }, orderBy: { createdAt: 'desc' }, take: 30,
    select: { id: true, title: true, description: true, reward: true, quietDays: true, startDate: true, createdById: true, store: { select: { name: true } } },
  });
  const people = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, name: true } });
  const nameOf = new Map(people.map((p) => [p.id, p.name]));
  const now = new Date();
  const data = [];
  for (const r of rows) data.push({ ...r, sentBy: nameOf.get(r.createdById) ?? null, results: await winBackResults(r, now) });
  res.json({ success: true, data, limits: L });
}
