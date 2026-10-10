// Refer a friend (2026-10-09): the customer's Invite friends screen, the code check at sign-up, adding a code a few days late, and
// HQ's list and settings (Customers > Referrals). The paying is in utils/referrals.ts, inside each sale's approval.
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import {
  REFERRAL_SETTINGS_KEY, attachReferral, expireReferrals, readReferralSettings, referralMonthStart, referralSummaryFor, referrerByCode, shortName,
} from '../utils/referrals';

const r2 = (n: number) => Math.round(n * 100) / 100;

/** GET /referrals/me (customer): their code, the deal, their invited friends, and whether they can still add a code of their own. */
export async function getMyReferrals(req: AuthRequest, res: Response) {
  if (req.user!.role !== 'CUSTOMER') { res.status(403).json({ success: false, error: 'Invite friends is for customer accounts.' }); return; }
  res.json({ success: true, data: await referralSummaryFor(req.user!.id) });
}

/** GET /referrals/check?code= (no sign-in: the sign-up screen): whose code it is, as "Maria G.", or not valid. */
export async function checkReferralCode(req: Request, res: Response) {
  const settings = await readReferralSettings();
  const who = settings.enabled ? await referrerByCode(String(req.query.code ?? '')) : null;
  res.json({ success: true, data: who ? { valid: true, name: shortName(who.name), friendReward: settings.friendReward, minPurchase: settings.minPurchase } : { valid: false } });
}

/** POST /referrals/claim { code } (customer): add an invite code after signing up, within 7 days and before the first purchase. */
export async function claimReferral(req: AuthRequest, res: Response) {
  if (req.user!.role !== 'CUSTOMER') { res.status(403).json({ success: false, error: 'Invite codes are for customer accounts.' }); return; }
  const r = await attachReferral(prisma, req.user!.id, String(req.body?.code ?? ''), new Date(), true);
  if (!r.ok) { res.status(400).json({ success: false, error: r.error }); return; }
  res.json({ success: true, data: { invitedBy: r.referrerName, summary: await referralSummaryFor(req.user!.id) } });
}

// ─── HQ ──────────────────────────────────────────────────────────────────────

/** GET /referrals?status=&page= (HQ): every referral, newest first, with the totals. */
export async function listReferrals(req: AuthRequest, res: Response) {
  await expireReferrals();
  const status = ['PENDING', 'REWARDED', 'EXPIRED', 'CANCELLED'].includes(String(req.query.status)) ? String(req.query.status) : undefined;
  const page = Math.max(1, Number(req.query.page) || 1), PER = 50;
  const [rows, total, byStatus, paid, month, settings, top] = await Promise.all([
    prisma.referral.findMany({
      where: status ? { status } : {}, orderBy: { createdAt: 'desc' }, skip: (page - 1) * PER, take: PER,
      include: { referrer: { select: { id: true, name: true, phone: true } }, friend: { select: { id: true, name: true, phone: true } } },
    }),
    prisma.referral.count({ where: status ? { status } : {} }),
    prisma.referral.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.referral.aggregate({ where: { status: 'REWARDED' }, _sum: { referrerReward: true, friendReward: true } }),
    prisma.referral.count({ where: { status: 'REWARDED', rewardedAt: { gte: referralMonthStart(new Date()) } } }),
    readReferralSettings(),
    prisma.referral.groupBy({ by: ['referrerId'], where: { status: 'REWARDED', referrerRewarded: true }, _count: { _all: true }, orderBy: { _count: { referrerId: 'desc' } }, take: 5 }),
  ]);
  const stores = new Map((await prisma.store.findMany({ where: { id: { in: rows.map((r) => r.storeId).filter((s): s is string => !!s) } }, select: { id: true, name: true } })).map((s) => [s.id, s.name]));
  const topPeople = new Map((await prisma.user.findMany({ where: { id: { in: top.map((t) => t.referrerId) } }, select: { id: true, name: true, phone: true } })).map((u) => [u.id, u]));
  res.json({
    success: true,
    data: {
      settings,
      totals: {
        byStatus: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
        paid: r2((paid._sum.referrerReward ?? 0) + (paid._sum.friendReward ?? 0)),
        rewardedThisMonth: month,
      },
      topReferrers: top.map((t) => ({ id: t.referrerId, name: topPeople.get(t.referrerId)?.name ?? 'Customer', phone: topPeople.get(t.referrerId)?.phone ?? '', friends: t._count._all })),
      referrals: rows.map((r) => ({
        id: r.id, status: r.status, createdAt: r.createdAt, rewardedAt: r.rewardedAt, code: r.code, note: r.note,
        referrer: { id: r.referrer.id, name: r.referrer.name, phone: r.referrer.phone },
        friend: { id: r.friend.id, name: r.friend.name, phone: r.friend.phone },
        referrerReward: r.referrerRewarded ? r.referrerReward : 0, friendReward: r.status === 'REWARDED' ? r.friendReward : null,
        store: r.storeId ? stores.get(r.storeId) ?? null : null,
      })),
      page, total, hasMore: page * PER < total,
    },
  });
}

const settingsSchema = z.object({
  enabled: z.boolean(),
  referrerReward: z.number().min(0, 'A reward cannot be negative.').max(25, 'A reward can be at most $25.'),
  friendReward: z.number().min(0, 'A reward cannot be negative.').max(25, 'A reward can be at most $25.'),
  minPurchase: z.number().min(0, 'The purchase cannot be negative.').max(200, 'The purchase can be at most $200.'),
  monthlyLimit: z.number().int('Whole friends only.').min(1, 'Pay at least 1 friend a month.').max(100, 'At most 100 friends a month.'),
  windowDays: z.number().int('Whole days only.').min(1, 'At least 1 day.').max(180, 'At most 180 days.'),
});

/** PUT /referrals/settings (HQ). Changes apply to rewards paid from now on; rewards already paid stay as they were. */
export async function updateReferralSettings(req: AuthRequest, res: Response) {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.issues[0].message }); return; }
  const before = await readReferralSettings();
  await prisma.appConfig.upsert({ where: { key: REFERRAL_SETTINGS_KEY }, update: { value: JSON.stringify(parsed.data) }, create: { key: REFERRAL_SETTINGS_KEY, value: JSON.stringify(parsed.data) } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'REFERRAL_SETTINGS_UPDATE', entity: 'settings', details: { before, after: parsed.data } });
  res.json({ success: true, data: parsed.data });
}
