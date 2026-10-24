// Engagement (2026-10-23): what customers see (streak, check-in, badges, store goals, gas alerts) and what HQ controls (the switches, the
// numbers, store goals, and suggestions worked out from real data). The money rules live in utils/engagement.ts.
import { Response } from 'express';
import { TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { applySettings, engagement, ENGAGEMENT_KEY } from '../utils/appSettings';
import { cleanEngagement, DEFAULT_ENGAGEMENT, ENGAGEMENT_LIMITS, publicEngagement, type EngagementConfig } from '../utils/engagementConfig';
import { BADGES, badgesFor, checkInFor, doCheckIn, goalProgress, goalValue, goalsFor, streakFor } from '../utils/engagement';
import { excludeDeletedCustomers } from '../utils/accountDeletion';
import { storeDateKey } from '../utils/storeTime';
import { WELCOME_STEPS } from '../utils/engagementWelcome';
import { birthdayFor, birthdaysOn } from '../utils/engagementBirthday';
import { spentThisMonth } from '../utils/engagementBudget';

const DAY = 86_400_000;
const uuidOnly = (v: unknown): string | undefined => (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v) ? v : undefined);

// ─── customers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

/** GET /engagement/config: just the switches (the app menu and cards need to know what is on before anything is worked out). */
export async function getEngagementConfig(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: publicEngagement(engagement()) });
}

/** GET /engagement/me?storeId= : the switches, and only the parts HQ has on, worked out for this customer. */
export async function getMyEngagement(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  const id = req.user!.id;
  const cfg = engagement();
  const [streak, checkIn, badges, goals, gasAlerts, birthday] = await Promise.all([
    streakFor(id), checkInFor(id), badgesFor(id), goalsFor(id, uuidOnly(req.query.storeId) ?? null),
    cfg.gasAlerts.enabled ? prisma.gasAlert.findMany({ where: { customerId: id }, select: { id: true, storeId: true, fuel: true, maxPrice: true } }) : Promise.resolve(null),
    birthdayFor(id),
  ]);
  res.json({ success: true, data: { config: publicEngagement(cfg), streak, checkIn, badges, goals, gasAlerts, birthday } });
}

const CHECKIN_WORDS: Record<string, string> = {
  OFF: 'Daily check-in is not on right now.',
  ALREADY: 'You already checked in today. Come back tomorrow.',
  NO_VISIT: 'Make a purchase with the app first, then you can check in each day.',
  CAP: 'You have reached this month\'s check-in limit. It starts again next month.',
};
export async function postCheckIn(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  const r = await doCheckIn(req.user!.id);
  if (!r.ok) { res.status(r.reason === 'ALREADY' ? 409 : 400).json({ success: false, code: r.reason, error: CHECKIN_WORDS[r.reason] }); return; }
  res.json({ success: true, data: { pts: r.pts, streakDays: r.streakDays, mode: r.mode } });
}

/**
 * POST /engagement/rate-prompt (2026-10-24): the app asks this right after a good moment (a reward redeemed, a check-in paid). The answer is yes
 * at most ONCE for a customer, ever (the row is the guard, so two phones or two taps cannot both be told yes), and only once HQ has the
 * prompt on and the customer has bought enough times and has had the app long enough. The phone then shows its own rating sheet.
 */
export async function postRatePrompt(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  const cfg = engagement().ratePrompt;
  if (!cfg.enabled) { res.json({ success: true, data: { ask: false } }); return; }
  const id = req.user!.id;
  const [u, bought, asked] = await Promise.all([
    prisma.user.findUnique({ where: { id }, select: { createdAt: true } }),
    prisma.pointsTransaction.count({ where: { customerId: id, status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 } } }),
    prisma.engagementEvent.findFirst({ where: { customerId: id, kind: 'RATE_PROMPT' }, select: { id: true } }),
  ]);
  const oldEnough = !!u && Date.now() - u.createdAt.getTime() >= cfg.minDays * DAY;
  if (asked || !oldEnough || bought < cfg.minPurchases) { res.json({ success: true, data: { ask: false } }); return; }
  const made = await prisma.engagementEvent.createMany({ data: [{ customerId: id, kind: 'RATE_PROMPT', key: 'once' }], skipDuplicates: true });
  res.json({ success: true, data: { ask: made.count === 1 } });
}

// gas price alerts
const MAX_ALERTS = 6;
export async function putGasAlert(req: AuthRequest, res: Response) {
  if (!isCustomerAccount(req.user)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  if (!engagement().gasAlerts.enabled) { res.status(400).json({ success: false, error: 'Gas price alerts are not on right now.' }); return; }
  const storeId = uuidOnly(req.body?.storeId);
  const fuel = req.body?.fuel === 'DIESEL' ? 'DIESEL' : req.body?.fuel === 'GAS' ? 'GAS' : null;
  const maxPrice = Number(req.body?.maxPrice);
  if (!storeId || !fuel) { res.status(400).json({ success: false, error: 'Choose a store and a fuel.' }); return; }
  if (!Number.isFinite(maxPrice) || maxPrice < 0.5 || maxPrice > 20) { res.status(400).json({ success: false, error: 'Enter the price per gallon you want to hear about, from $0.50 to $20.' }); return; }
  const store = await prisma.store.findFirst({ where: { id: storeId, isActive: true }, select: { id: true } });
  if (!store) { res.status(404).json({ success: false, error: 'That store was not found.' }); return; }
  const customerId = req.user!.id;
  const have = await prisma.gasAlert.findMany({ where: { customerId }, select: { storeId: true, fuel: true } });
  if (!have.some((a) => a.storeId === storeId && a.fuel === fuel) && have.length >= MAX_ALERTS) { res.status(400).json({ success: false, error: `You can have ${MAX_ALERTS} price alerts. Remove one first.` }); return; }
  const price = Math.round(maxPrice * 1000) / 1000;
  const a = await prisma.gasAlert.upsert({ where: { customerId_storeId_fuel: { customerId, storeId, fuel } }, create: { customerId, storeId, fuel, maxPrice: price }, update: { maxPrice: price, lastSentAt: null } });
  res.json({ success: true, data: { id: a.id, storeId: a.storeId, fuel: a.fuel, maxPrice: a.maxPrice } });
}
export async function deleteGasAlert(req: AuthRequest, res: Response) {
  await prisma.gasAlert.deleteMany({ where: { id: req.params.id, customerId: req.user!.id } });
  res.json({ success: true });
}

// ─── HQ ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const merge = (a: any, b: any): any => {
  if (Array.isArray(b) || b === null || typeof b !== 'object') return b === undefined ? a : b;
  const out: any = { ...(a && typeof a === 'object' && !Array.isArray(a) ? a : {}) };
  for (const k of Object.keys(b)) out[k] = merge(out[k], b[k]);
  return out;
};
const NAMES: Record<string, string> = {
  streaks: 'Visit streaks', punchCards: 'Punch cards', checkIn: 'Daily check-in', badges: 'Badges', storeGoals: 'Store goals', reorder: 'Order your usual',
  gasAlerts: 'Gas price alerts', sharing: 'Sharing', ratePrompt: 'Rate the app', welcome: 'Welcome series', birthday: 'Birthday gift', nudges: 'Smart nudges',
};
/** What changed, in words, for the Activity Log. */
function changesIn(before: EngagementConfig, after: EngagementConfig): string[] {
  const out: string[] = [];
  for (const k of Object.keys(NAMES) as (keyof EngagementConfig)[]) {
    const a: any = before[k], b: any = after[k];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (a.enabled !== b.enabled && (b.enabled !== undefined)) { out.push(`${NAMES[k]}: ${b.enabled ? 'on' : 'off'}`); }
    const rest = (o: any) => { const { enabled: _e, since: _s, ...r } = o ?? {}; return JSON.stringify(r); };
    if (rest(a) !== rest(b)) out.push(`${NAMES[k]}: settings changed`);
  }
  return out;
}

/** PUT /settings/engagement (HQ): any part of the settings; what is sent is merged onto what is saved, then cleaned and clamped. */
export async function putEngagement(req: AuthRequest, res: Response) {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) { res.status(400).json({ success: false, error: 'Send the settings to change.' }); return; }
  const before = engagement();
  const next = cleanEngagement(merge(before, body));
  // the day streaks were switched on is the server's to set: weeks before it never count, so turning streaks on cannot pay out old history
  next.streaks.since = next.streaks.enabled ? (before.streaks.enabled && before.streaks.since ? before.streaks.since : storeDateKey(new Date())) : null;
  // the same for the welcome series: only people who sign up from the day it is switched on get it
  next.welcome.since = next.welcome.enabled ? (before.welcome.enabled && before.welcome.since ? before.welcome.since : storeDateKey(new Date())) : null;
  const changes = changesIn(before, next);
  if (changes.length === 0) { res.json({ success: true, data: next, changed: false }); return; }
  await prisma.appConfig.upsert({ where: { key: ENGAGEMENT_KEY }, create: { key: ENGAGEMENT_KEY, value: JSON.stringify(next) }, update: { value: JSON.stringify(next) } });
  applySettings({ engagement: next });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_ENGAGEMENT_UPDATE', entity: 'app_config', entityId: ENGAGEMENT_KEY, details: { summary: changes.join('; '), keys: ['engagement'] }, storeId: null });
  res.json({ success: true, data: next, changed: true });
}

// store goals
const goalSchema = (b: any, stores: Set<string>) => {
  const title = typeof b?.title === 'string' ? b.title.trim().slice(0, 80) : '';
  const titleEs = typeof b?.titleEs === 'string' && b.titleEs.trim() ? b.titleEs.trim().slice(0, 80) : null;
  const metric = b?.metric === 'CUSTOMERS' ? 'CUSTOMERS' : 'SALES';
  const target = Math.round(Number(b?.target)), rewardPoints = Math.round(Number(b?.rewardPoints));
  const start = new Date(b?.startDate), end = new Date(b?.endDate);
  const storeId = b?.storeId ? uuidOnly(b.storeId) : null;
  if (!title) return 'Give the goal a title.';
  if (!(target >= 1 && target <= 100_000)) return 'The target must be from 1 to 100,000.';
  if (!(rewardPoints >= 1 && rewardPoints <= 500)) return 'The reward must be from 1 to 500 points for each customer.';
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Choose a start and an end date.';
  if (end <= start) return 'The end must be after the start.';
  if (end <= new Date()) return 'The end date must be in the future. A goal that has already ended would pay out right away.';
  if (end.getTime() - start.getTime() > 62 * DAY) return 'A goal can run for at most about two months.';
  if (b?.storeId && (!storeId || !stores.has(storeId))) return 'That store was not found.';
  return { title, titleEs, metric, target, rewardPoints, startDate: start, endDate: end, storeId: storeId ?? null };
};
export async function createGoal(req: AuthRequest, res: Response) {
  const stores = new Set((await prisma.store.findMany({ select: { id: true } })).map((s) => s.id));
  const g = goalSchema(req.body, stores);
  if (typeof g === 'string') { res.status(400).json({ success: false, error: g }); return; }
  const row = await prisma.storeGoal.create({ data: { ...g, createdById: req.user!.id } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'STORE_GOAL_CREATE', entity: 'store_goal', entityId: row.id, details: { title: g.title, metric: g.metric, target: g.target, rewardPoints: g.rewardPoints }, storeId: g.storeId });
  res.status(201).json({ success: true, data: row });
}
export async function updateGoal(req: AuthRequest, res: Response) {
  const g = await prisma.storeGoal.findUnique({ where: { id: req.params.id } });
  if (!g) { res.status(404).json({ success: false, error: 'Goal not found.' }); return; }
  if (g.paidAt) { res.status(400).json({ success: false, error: 'This goal has already been paid out.' }); return; }
  const data: { isActive?: boolean; endDate?: Date } = {};
  if (typeof req.body?.isActive === 'boolean') data.isActive = req.body.isActive;
  if (req.body?.endDate) {
    const end = new Date(req.body.endDate);
    if (Number.isNaN(end.getTime()) || end <= g.startDate || end.getTime() - g.startDate.getTime() > 62 * DAY) { res.status(400).json({ success: false, error: 'Choose an end date after the start, within about two months.' }); return; }
    data.endDate = end;
  }
  if (Object.keys(data).length === 0) { res.json({ success: true, data: g }); return; }
  const row = await prisma.storeGoal.update({ where: { id: g.id }, data });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'STORE_GOAL_UPDATE', entity: 'store_goal', entityId: g.id, details: { title: g.title, ...data }, storeId: g.storeId });
  res.json({ success: true, data: row });
}

// ─── suggestions and results ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Suggestion { id: string; tone: 'tip' | 'info'; title: string; detail: string; feature: string }

const nthWeekday = (year: number, month: number, weekday: number, nth: number) => {   // month 1-12, weekday 0 = Sunday; nth = -1 for the last
  if (nth > 0) { const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); return new Date(Date.UTC(year, month - 1, 1 + ((weekday - first + 7) % 7) + (nth - 1) * 7)); }
  const last = new Date(Date.UTC(year, month, 0)); return new Date(Date.UTC(year, month - 1, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7)));
};
export function upcomingHolidays(now: Date, withinDays = 25): { name: string; on: string; inDays: number }[] {
  const y = now.getUTCFullYear();
  const list: [string, Date][] = [];
  for (const yr of [y, y + 1]) {
    list.push(['Halloween', new Date(Date.UTC(yr, 9, 31))], ['Thanksgiving', nthWeekday(yr, 11, 4, 4)], ['Christmas', new Date(Date.UTC(yr, 11, 25))], ["New Year's", new Date(Date.UTC(yr, 0, 1))],
      ["Valentine's Day", new Date(Date.UTC(yr, 1, 14))], ['Memorial Day', nthWeekday(yr, 5, 1, -1)], ['the 4th of July', new Date(Date.UTC(yr, 6, 4))], ['Labor Day', nthWeekday(yr, 9, 1, 1)]);
  }
  const today = Date.parse(`${storeDateKey(now)}T12:00:00Z`);
  return list.map(([name, d]) => ({ name, on: d.toISOString().slice(0, 10), inDays: Math.round((d.getTime() + 12 * 3600_000 - today) / DAY) }))
    .filter((h) => h.inDays >= 0 && h.inDays <= withinDays).sort((a, b) => a.inDays - b.inDays);
}

export async function suggestionsFor(cfg: EngagementConfig, now: Date = new Date()): Promise<Suggestion[]> {
  const out: Suggestion[] = [];
  const live = { role: 'CUSTOMER' as const, isActive: true, ...excludeDeletedCustomers };
  const money = (n: number) => `$${n.toFixed(2)}`;

  // customers close to a reward
  const items = await prisma.redemptionCatalogItem.findMany({ where: { isActive: true }, select: { pointsCost: true } });
  if (items.length && !(cfg.nudges.enabled && cfg.nudges.nearReward.enabled)) {
    const w = cfg.nudges.nearReward.withinPts;
    const near = await prisma.user.count({ where: { ...live, OR: items.map((i) => ({ pointsBalance: { gte: (i.pointsCost - w) / 100, lt: i.pointsCost / 100 } })) } });
    if (near > 0) out.push({ id: 'near-reward', tone: 'tip', feature: 'nudges', title: `${near} customers are within ${w} pts of a reward`, detail: 'A short push ("You are 120 pts from a free coffee") brings them back for the last stretch. Turn on Smart nudges and keep "Near a reward" on.' });
  }
  // quiet customers with points
  if (!(cfg.nudges.enabled && cfg.nudges.comeback.enabled)) {
    const cutoff = new Date(now.getTime() - cfg.nudges.comeback.quietDays * DAY);
    const quiet = await prisma.user.count({ where: { ...live, pointsBalance: { gte: 1 }, AND: [{ pointsEarned: { some: { status: TransactionStatus.APPROVED, purchaseAmount: { gt: 0 } } } }, { pointsEarned: { none: { status: TransactionStatus.APPROVED, createdAt: { gte: cutoff } } } }] } });
    if (quiet > 0) out.push({ id: 'comeback', tone: 'tip', feature: 'nudges', title: `${quiet} customers have points but have not been in for ${cfg.nudges.comeback.quietDays} days`, detail: 'A gentle "we miss you, you have X pts" nudge once a month is the cheapest way to win them back. It costs nothing unless they come in.' });
  }
  // regulars who could start a streak
  if (!cfg.streaks.enabled) {
    const g = await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gte: Math.max(0.01, cfg.streaks.minPurchase) }, createdAt: { gte: new Date(now.getTime() - 28 * DAY) } }, having: { customerId: { _count: { gte: 3 } } }, _count: { _all: true } });
    if (g.length > 0) out.push({ id: 'streaks', tone: 'tip', feature: 'streaks', title: `${g.length} customers already shop 3 or more times a month`, detail: 'They are your best candidates for a weekly streak. The default bonuses are small (50 pts at 3 weeks, 100 at 6, 250 at 12) and capped, so the cost stays predictable.' });
  }
  // stores that are behind
  const week = await prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 }, createdAt: { gte: new Date(now.getTime() - 7 * DAY) } }, _count: { _all: true } });
  if (week.length >= 3) {
    const avg = week.reduce((t, w) => t + w._count._all, 0) / week.length;
    const slow = week.filter((w) => w._count._all < avg * 0.6);
    if (slow.length) {
      const names = (await prisma.store.findMany({ where: { id: { in: slow.map((s) => s.storeId) } }, select: { name: true } })).map((s) => s.name).slice(0, 3);
      out.push({ id: 'store-goals', tone: 'tip', feature: 'storeGoals', title: `${names.join(', ')} ${slow.length === 1 ? 'is' : 'are'} well behind the chain this week`, detail: `A store goal ("hit ${Math.round(avg)} sales this week and everyone who bought there gets a small bonus") gives staff and customers something to rally around. Create one for ${slow.length === 1 ? 'that store' : 'those stores'} below.` });
    }
  }
  // check-in cost estimate
  if (!cfg.checkIn.enabled) {
    const active = (await prisma.pointsTransaction.groupBy({ by: ['customerId'], where: { status: TransactionStatus.APPROVED, challengeId: null, referralId: null, isTestData: false, purchaseAmount: { gt: 0 }, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } }, _count: { _all: true } })).length;
    if (active > 0) {
      const each = Math.min(30 * cfg.checkIn.pts + 4 * cfg.checkIn.weekBonusPts, cfg.checkIn.monthlyCapPts);
      out.push({ id: 'checkin', tone: 'info', feature: 'checkIn', title: `Daily check-in: about ${money((active * 0.3 * each) / 100)} a month`, detail: `${active} customers bought in the last 30 days. If 30% of them checked in every day at ${cfg.checkIn.pts} pts, with a ${cfg.checkIn.weekBonusPts} pt bonus on day 7, it would cost about that much, and never more than ${money(cfg.checkIn.monthlyCapPts / 100)} per customer a month. People must have bought in the last ${cfg.checkIn.needVisitDays} days to check in.` });
    }
  }
  // order your usual
  if (!cfg.reorder.enabled) {
    const repeat = await prisma.hotFoodOrder.groupBy({ by: ['customerId'], where: { status: 'COMPLETED', createdAt: { gte: new Date(now.getTime() - 60 * DAY) } }, having: { customerId: { _count: { gte: 2 } } }, _count: { _all: true } });
    if (repeat.length > 0) out.push({ id: 'reorder', tone: 'tip', feature: 'reorder', title: `${repeat.length} customers have ordered hot food twice or more`, detail: 'A one-tap "Your usual" row makes the next order effortless. It costs nothing and uses their own order history.' });
  }
  // the next holiday
  const next = upcomingHolidays(now, 25)[0];
  if (next) out.push({ id: `holiday-${next.name}`, tone: 'info', feature: 'events', title: `${next.name} is ${next.inDays === 0 ? 'today' : `in ${next.inDays} day${next.inDays === 1 ? '' : 's'}`}`, detail: `Start a themed punch card for it with the event kit below, and think about a seasonal theme (Settings, App${next.name === 'Halloween' ? ': Halloween is ready' : ': only Halloween is drawn so far'}).` });
  // a welcome series for the people who keep joining
  if (!cfg.welcome.enabled) {
    const joined = await prisma.user.count({ where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, createdAt: { gte: new Date(now.getTime() - 30 * DAY) } } });
    if (joined > 0) out.push({ id: 'welcome', tone: 'tip', feature: 'welcome', title: `${joined} ${joined === 1 ? 'person' : 'people'} joined in the last 30 days`, detail: 'A welcome series sends up to three friendly pushes in their first week (how to earn at the register, order ahead or check in, invite a friend) and skips anything they have already done. It costs nothing, and only people who join after you switch it on get it.' });
  }
  // birthdays this month
  if (!cfg.birthday.enabled) {
    const born = await prisma.user.count({ where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, birthMonth: birthdaysOn(now).month } });
    if (born > 0) out.push({ id: 'birthday', tone: 'tip', feature: 'birthday', title: `${born} ${born === 1 ? 'customer has' : 'customers have'} a birthday this month`, detail: `A birthday greeting on the day, with an optional small gift (${cfg.birthday.bonusPts} pts suggested, only for people who bought lately), inside a monthly budget you set. Customers add their birthday in Profile.` });
  }
  // badges are free
  if (!cfg.badges.enabled) out.push({ id: 'badges', tone: 'info', feature: 'badges', title: 'Badges cost nothing to run', detail: 'Nobody is paid for a badge. They give regulars goals between tier steps and something to share. Turn them on and switch off any you do not want.' });
  return out.slice(0, 8);
}

/** GET /engagement/hq: the settings, what has happened in the last 30 days, the goals and the suggestions. */
export async function getEngagementHq(_req: AuthRequest, res: Response) {
  const cfg = engagement();
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY);
  const kinds = ['STREAK_AWARD', 'CHECKIN', 'GOAL_AWARD', 'RATE_PROMPT', 'BIRTHDAY', 'NUDGE_NEAR_REWARD', 'NUDGE_STREAK_RISK', 'NUDGE_TIER_RESET', 'NUDGE_COMEBACK'];
  const [events, goals, alerts, suggestions, stores, welcomeSteps, birthdaySpent, birthdayPaid, withBirthday, customers] = await Promise.all([
    prisma.engagementEvent.groupBy({ by: ['kind'], where: { kind: { in: kinds }, createdAt: { gte: since } }, _count: { _all: true }, _sum: { points: true } }),
    prisma.storeGoal.findMany({ orderBy: { endDate: 'desc' }, take: 40 }),
    prisma.gasAlert.count(),
    suggestionsFor(cfg, now),
    prisma.store.findMany({ select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.engagementEvent.groupBy({ by: ['key'], where: { kind: 'WELCOME', createdAt: { gte: since } }, _count: { _all: true } }),
    spentThisMonth(prisma, 'BIRTHDAY', now),
    prisma.engagementEvent.count({ where: { kind: 'BIRTHDAY', points: { gt: 0 }, createdAt: { gte: since } } }),
    prisma.user.count({ where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers, birthMonth: { not: null } } }),
    prisma.user.count({ where: { role: 'CUSTOMER', isActive: true, ...excludeDeletedCustomers } }),
  ]);
  const names = new Map(stores.map((s) => [s.id, s.name]));
  const welcomeBy = WELCOME_STEPS.map((_k, i) => welcomeSteps.find((w) => w.key === `step${i + 1}`)?._count._all ?? 0);
  const byKind = new Map(events.map((e) => [e.kind, e]));
  const count = (k: string) => byKind.get(k)?._count._all ?? 0;
  const paid = (k: string) => Math.round((byKind.get(k)?._sum.points ?? 0) * 100);
  const goalRows = [];
  for (const g of goals) {
    const scope = g.storeId ? [g.storeId] : stores.filter((s) => s.isActive).map((s) => s.id);
    const upTo = g.endDate < now ? g.endDate : now;
    let best = 0, bestStore = '';
    for (const sid of scope.slice(0, 20)) {
      const v = goalValue(g.metric, await goalProgress(prisma, sid, g.startDate, upTo));
      if (v > best) { best = v; bestStore = names.get(sid) ?? ''; }
    }
    goalRows.push({ id: g.id, title: g.title, titleEs: g.titleEs, metric: g.metric, target: g.target, rewardPoints: g.rewardPoints, startDate: g.startDate, endDate: g.endDate, isActive: g.isActive, paidAt: g.paidAt, store: g.storeId ? names.get(g.storeId) ?? null : null, storeId: g.storeId, leading: { value: best, store: bestStore } });
  }
  res.json({ success: true, data: {
    config: cfg, defaults: DEFAULT_ENGAGEMENT, limits: ENGAGEMENT_LIMITS,
    badges: BADGES.map((b) => ({ key: b.key, emoji: b.emoji, name: b.name, desc: b.desc })),
    stores: stores.filter((s) => s.isActive).map((s) => ({ id: s.id, name: s.name })),
    results: {
      streaks: { awards: count('STREAK_AWARD'), pts: paid('STREAK_AWARD') },
      checkIn: { checkIns: count('CHECKIN'), pts: paid('CHECKIN') },
      goals: { awards: count('GOAL_AWARD'), pts: paid('GOAL_AWARD') },
      nudges: { nearReward: count('NUDGE_NEAR_REWARD'), streakRisk: count('NUDGE_STREAK_RISK'), tierReset: count('NUDGE_TIER_RESET'), comeback: count('NUDGE_COMEBACK') },
      gasAlerts: alerts,
      ratePrompt: count('RATE_PROMPT'),
      welcome: { sent: welcomeBy.reduce((t, n) => t + n, 0), byStep: welcomeBy },
      birthday: { greeted: count('BIRTHDAY'), paid: birthdayPaid, pts: paid('BIRTHDAY'), spentThisMonth: birthdaySpent, withBirthday, customers },
    },
    goals: goalRows, suggestions,
  } });
}
