// Refer a friend (2026-10-09). A customer shares their code; a new customer gives it when signing up (or within a few days after,
// before their first purchase). When the friend's first approved purchase of at least the minimum is made within the window, both
// are paid: each gets their own approved reward line (no purchase; PointsTransaction.referralId), like a challenge reward, at the
// store of that purchase and with its platform fee, so it shows in their history and in billing and voiding it takes it back. The
// sharer is paid for at most the monthly limit of friends (the friend still is). Paid inside the sale's approval (saleDecision), so a
// rejected sale never pays and an approval pays once; the referral is claimed with a conditional update, so two approvals at the
// same moment cannot both pay it. Amounts and limits: AppConfig REFERRAL_SETTINGS (HQ, Customers > Referrals).

import { Prisma, PrismaClient, Role, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { DEFAULT_DEV_CUT_RATE } from '../config/constants';
import { excludeDeletedCustomers } from './accountDeletion';
import { startOfStoreDate, storeDateKey } from './storeTime';
import { sendPushToUser } from './push';

type Db = Prisma.TransactionClient | PrismaClient;
const r2 = (n: number) => Math.round(n * 100) / 100;
const DAY = 86_400_000;

export const REFERRAL_SETTINGS_KEY = 'REFERRAL_SETTINGS';
export interface ReferralSettings {
  enabled: boolean;
  referrerReward: number;   // dollars to the person who shared
  friendReward: number;     // dollars to the new customer
  minPurchase: number;      // the friend's purchase that counts must be at least this
  monthlyLimit: number;     // a sharer is paid for at most this many friends a store month
  windowDays: number;       // the friend has this many days from giving the code to make that purchase
}
export const DEFAULT_REFERRAL_SETTINGS: ReferralSettings = { enabled: true, referrerReward: 5, friendReward: 5, minPurchase: 10, monthlyLimit: 10, windowDays: 30 };
export const CLAIM_LATE_DAYS = 7;   // a code can still be given this many days after signing up, if no purchase was approved yet

export async function readReferralSettings(db: Db = prisma): Promise<ReferralSettings> {
  const row = await db.appConfig.findUnique({ where: { key: REFERRAL_SETTINGS_KEY } });
  if (!row) return DEFAULT_REFERRAL_SETTINGS;
  try { return { ...DEFAULT_REFERRAL_SETTINGS, ...JSON.parse(row.value) }; } catch { return DEFAULT_REFERRAL_SETTINGS; }
}

// ─── Codes ───────────────────────────────────────────────────────────────────

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   // no 0/O, 1/I/L: easy to read out and type
export function makeCode(): string {
  let c = '';
  for (let i = 0; i < 6; i++) c += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return c;
}
/** "ab-c 23k" and "ABC23K" are the same code. */
export const normalizeCode = (s: unknown) => (typeof s === 'string' ? s.toUpperCase().replace(/[^A-Z0-9]/g, '') : '');

/** The customer's code, made the first time it is asked for. */
export async function ensureReferralCode(userId: string): Promise<string> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (u?.referralCode) return u.referralCode;
  for (let i = 0; i < 8; i++) {
    const code = makeCode();
    try {
      // Only if still empty: two first opens at the same moment keep the one that was saved first
      const set = await prisma.user.updateMany({ where: { id: userId, referralCode: null }, data: { referralCode: code } });
      if (set.count === 1) return code;
      const again = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
      if (again?.referralCode) return again.referralCode;
    } catch (e: any) {
      if (e?.code !== 'P2002') throw e;   // taken by someone else: try another
    }
  }
  throw new Error('Could not make a referral code');
}

/** Who a code belongs to, if it can be used: an active customer's. For the sign-up screen ("Invited by Maria G."). */
export async function referrerByCode(code: string) {
  const c = normalizeCode(code);
  if (c.length !== 6) return null;
  return prisma.user.findFirst({
    where: { referralCode: c, role: Role.CUSTOMER, isActive: true, ...excludeDeletedCustomers },
    select: { id: true, name: true },
  });
}
export const shortName = (name: string | null | undefined) => {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'A Lucky Stop customer';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : parts[0];
};

export type AttachResult = { ok: true; referrerName: string } | { ok: false; error: string };

/** Records that `friendId` was invited with `code`. Refused with a sentence the app shows. */
export async function attachReferral(db: Db, friendId: string, code: string, now: Date = new Date(), lateClaim = false): Promise<AttachResult> {
  const settings = await readReferralSettings(db);
  if (!settings.enabled) return { ok: false, error: 'Invite codes are not being accepted right now.' };
  const c = normalizeCode(code);
  if (c.length !== 6) return { ok: false, error: 'That invite code is not right. Check the 6 letters and numbers.' };
  const referrer = await db.user.findFirst({
    where: { referralCode: c, role: Role.CUSTOMER, isActive: true, ...excludeDeletedCustomers },
    select: { id: true, name: true },
  });
  if (!referrer) return { ok: false, error: 'That invite code is not right. Check the 6 letters and numbers.' };
  if (referrer.id === friendId) return { ok: false, error: 'You cannot use your own invite code.' };
  const friend = await db.user.findUnique({ where: { id: friendId }, select: { role: true, createdAt: true, referredBy: { select: { id: true } } } });
  if (!friend || friend.role !== Role.CUSTOMER) return { ok: false, error: 'Only customer accounts can use an invite code.' };
  if (friend.referredBy) return { ok: false, error: 'An invite code is already on your account.' };
  if (lateClaim) {
    if (now.getTime() - friend.createdAt.getTime() > CLAIM_LATE_DAYS * DAY) return { ok: false, error: `An invite code can only be added in the first ${CLAIM_LATE_DAYS} days after signing up.` };
    const bought = await db.pointsTransaction.count({ where: { customerId: friendId, status: TransactionStatus.APPROVED, challengeId: null, referralId: null } });
    if (bought > 0) return { ok: false, error: 'An invite code has to be added before your first purchase.' };
  }
  try {
    await db.referral.create({ data: { referrerId: referrer.id, friendId, code: c } });
  } catch (e: any) {
    if (e?.code === 'P2002') return { ok: false, error: 'An invite code is already on your account.' };
    throw e;
  }
  return { ok: true, referrerName: shortName(referrer.name) };
}

// ─── Paying ──────────────────────────────────────────────────────────────────

export interface ReferralAward { customerId: string; amount: number; role: 'REFERRER' | 'FRIEND'; otherName: string }

/** The month a store calendar date is in, as its first instant. */
const monthStart = (now: Date) => startOfStoreDate(storeDateKey(now).slice(0, 8) + '01');

/**
 * Pays the referral this approved sale completes, if any (credited here, in `db`). Returns the awards, for the push after the
 * transaction is saved (pushReferralAwards). The friend's own award is included, so the caller can show the right balance.
 */
export async function creditReferral(db: Db, saleId: string, now: Date = new Date()): Promise<ReferralAward[]> {
  const sale = await db.pointsTransaction.findUnique({
    where: { id: saleId },
    select: { id: true, customerId: true, storeId: true, category: true, purchaseAmount: true, createdAt: true, status: true, challengeId: true, referralId: true, isTestData: true, store: { select: { transactionFeeRate: true } } },
  });
  if (!sale || sale.status !== TransactionStatus.APPROVED || sale.challengeId || sale.referralId || sale.isTestData) return [];
  const ref = await db.referral.findUnique({ where: { friendId: sale.customerId } });
  if (!ref || ref.status !== 'PENDING') return [];
  const settings = await readReferralSettings(db);
  if (!settings.enabled) return [];
  if (sale.createdAt.getTime() - ref.createdAt.getTime() > settings.windowDays * DAY) {
    await db.referral.updateMany({ where: { id: ref.id, status: 'PENDING' }, data: { status: 'EXPIRED', note: `No purchase of $${settings.minPurchase} or more within ${settings.windowDays} days` } });
    return [];
  }
  if (sale.purchaseAmount + 1e-9 < settings.minPurchase) return [];   // a smaller purchase: a later one can still count

  const [referrer, friend] = await Promise.all([
    db.user.findUnique({ where: { id: ref.referrerId }, select: { id: true, name: true, isActive: true, phone: true } }),
    db.user.findUnique({ where: { id: ref.friendId }, select: { id: true, name: true } }),
  ]);
  const paidThisMonth = await db.referral.count({ where: { referrerId: ref.referrerId, referrerRewarded: true, rewardedAt: { gte: monthStart(now) } } });
  const referrerOk = !!referrer && referrer.isActive && !referrer.phone.startsWith('deleted-') && paidThisMonth < settings.monthlyLimit;

  // Claim it exactly once
  const claimed = await db.referral.updateMany({
    where: { id: ref.id, status: 'PENDING' },
    data: {
      status: 'REWARDED', rewardedAt: now, saleId: sale.id, storeId: sale.storeId,
      friendReward: settings.friendReward, referrerReward: referrerOk ? settings.referrerReward : 0, referrerRewarded: referrerOk,
      note: referrerOk ? null : (paidThisMonth >= settings.monthlyLimit ? `The person who shared was already paid for ${settings.monthlyLimit} friends this month` : 'The account that shared is no longer active'),
    },
  });
  if (claimed.count === 0) return [];

  const feeRate = sale.store?.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const pay = async (customerId: string, amount: number, note: string) => {
    if (amount <= 0) return;
    const fee = r2(amount * feeRate);
    await db.pointsTransaction.create({
      data: {
        customerId, grantedById: customerId, storeId: sale.storeId, purchaseAmount: 0, pointsAwarded: amount, devCut: fee, storeCost: fee,
        cashbackRate: 0, category: sale.category, status: TransactionStatus.APPROVED, notes: note, referralId: ref.id, rewardForSaleId: sale.id,
      },
    });
    await db.user.update({ where: { id: customerId }, data: { pointsBalance: { increment: amount }, periodPoints: { increment: amount } } });
  };
  const awards: ReferralAward[] = [];
  await pay(ref.friendId, settings.friendReward, `Referral reward: welcome bonus (invited by ${shortName(referrer?.name)})`);
  if (settings.friendReward > 0) awards.push({ customerId: ref.friendId, amount: settings.friendReward, role: 'FRIEND', otherName: shortName(referrer?.name) });
  if (referrerOk) {
    await pay(ref.referrerId, settings.referrerReward, `Referral reward: ${shortName(friend?.name)} joined`);
    if (settings.referrerReward > 0) awards.push({ customerId: ref.referrerId, amount: settings.referrerReward, role: 'REFERRER', otherName: shortName(friend?.name) });
  }
  return awards;
}

/** "You earned $5" pushes, in each person's language, once the approval is saved. */
export async function pushReferralAwards(awards: ReferralAward[]): Promise<void> {
  if (awards.length === 0) return;
  const langs = new Map((await prisma.user.findMany({ where: { id: { in: awards.map((a) => a.customerId) } }, select: { id: true, language: true } })).map((u) => [u.id, u.language]));
  for (const a of awards) {
    const es = langs.get(a.customerId) === 'es';
    const amt = `$${a.amount.toFixed(2)}`;
    const [title, body] = a.role === 'REFERRER'
      ? (es ? ['🎉 ¡Tu invitación funcionó!', `${a.otherName} hizo su primera compra. ${amt} agregados a tu saldo.`] : ['🎉 Your invite worked!', `${a.otherName} made their first purchase. ${amt} added to your balance.`])
      : (es ? ['🎁 Bono de bienvenida', `${amt} agregados a tu saldo por unirte con la invitación de ${a.otherName}.`] : ['🎁 Welcome bonus', `${amt} added to your balance for joining with ${a.otherName}'s invite.`]);
    sendPushToUser(a.customerId, title, body, 'OFFER', '/(customer)/invite-friends');
  }
}

/** What a customer sees on Invite friends: their code, the deal, and the friends they invited. */
export async function referralSummaryFor(userId: string, now: Date = new Date()) {
  const [code, settings, made, mine, me] = await Promise.all([
    ensureReferralCode(userId),
    readReferralSettings(),
    prisma.referral.findMany({ where: { referrerId: userId }, orderBy: { createdAt: 'desc' }, take: 50, include: { friend: { select: { name: true } } } }),
    prisma.referral.findUnique({ where: { friendId: userId }, include: { referrer: { select: { name: true } } } }),
    prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
  ]);
  const boughtYet = await prisma.pointsTransaction.count({ where: { customerId: userId, status: TransactionStatus.APPROVED, challengeId: null, referralId: null } });
  const canAddCode = !mine && !!me && boughtYet === 0 && now.getTime() - me.createdAt.getTime() <= CLAIM_LATE_DAYS * DAY && settings.enabled;
  const paidThisMonth = made.filter((r) => r.referrerRewarded && r.rewardedAt && r.rewardedAt >= monthStart(now)).length;
  return {
    code, settings,
    friends: made.map((r) => ({
      name: shortName(r.friend?.name), status: r.status, joinedAt: r.createdAt, rewardedAt: r.rewardedAt,
      earned: r.referrerRewarded ? r.referrerReward ?? 0 : 0, overLimit: r.status === 'REWARDED' && !r.referrerRewarded,
    })),
    earned: r2(made.reduce((n, r) => n + (r.referrerRewarded ? r.referrerReward ?? 0 : 0), 0)),
    paidThisMonth, limitLeft: Math.max(0, settings.monthlyLimit - paidThisMonth),
    invitedBy: mine ? { name: shortName(mine.referrer?.name), status: mine.status, reward: mine.friendReward ?? settings.friendReward,
      deadline: new Date(mine.createdAt.getTime() + settings.windowDays * DAY).toISOString() } : null,
    canAddCode,
  };
}

/** Expire the pending referrals whose window has passed (run with the daily jobs; the payment check also expires lazily). */
export async function expireReferrals(now: Date = new Date()) {
  const s = await readReferralSettings();
  const cutoff = new Date(now.getTime() - s.windowDays * DAY);
  return prisma.referral.updateMany({ where: { status: 'PENDING', createdAt: { lt: cutoff } }, data: { status: 'EXPIRED', note: `No purchase of $${s.minPurchase} or more within ${s.windowDays} days` } });
}

export const referralMonthStart = monthStart;
