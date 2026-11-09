// Offers autopilot (2026-11-09, the owner: "both, with an auto toggle that changes offers every week").
//
// Two parts:
//  - "It worked last time" ideas (workedBeforeIdeas): cashback promotions that ended in the last 8 weeks and brought at least
//    WORKED_PER_DOLLAR of extra sales for every $1 of extra cashback (utils/offerLift.ts, the same figures as promotion Results). They join
//    the Promotion ideas list (allIdeas), so HQ can post them by hand like any idea.
//  - The weekly run (runAutopilot): when HQ has it on (Offers > Autopilot), every Monday from 6 AM store time it looks at how last week's
//    auto offers did, then posts up to `perWeek` new ones from the ideas for this week only (Monday, or now, to Sunday night): ideas that
//    worked before first, never one that did not work in the last 4 weeks, never two on the same sales, never one on the same sales as a
//    promotion HQ already runs. The weekly budget is split between them as each one's own budget (utils/offerBudget.ts), so the week
//    can never pay more than the budget (by at most one sale's bonus, as with any budget). Bonuses come sized under the 10% ceiling
//    (utils/promotionIdeas.ts sizeBonus); categories hold no tobacco, alcohol or lottery. Only the week's biggest auto offer is announced
//    with a push; the others are quiet (shown in the app, no push, no last-day reminder).
//
// Once a week: the run claims the row OFFER_AUTOPILOT_RUN:<Monday> in app_config (a unique key), so two server copies cannot both post,
// and that row keeps what it did (shown on the Autopilot card and in HQ's notifications). A run that fails before posting anything gives
// the claim back so the next check tries again. Switched on mid-week, it runs at once for the rest of the week (Monday to Friday); on a
// Saturday or Sunday it waits for Monday.

import cron from 'node-cron';
import { ProductCategory } from '@prisma/client';
import prisma from '../config/prisma';
import { audit } from './audit';
import { addStoreDays, endOfStoreDate, startOfStoreDate, storeDateKey, storeDaysBetween, storeHour, storeWeekday } from './storeTime';
import { estimateOffer } from './offerEstimate';
import { offerLift } from './offerLift';
import { budgetSpentMany } from './offerBudget';
import { announceOffer } from './offerAnnounce';
import { CAT_EN, IdeaOffer, IdeasResult, PromotionIdea, promotionIdeas } from './promotionIdeas';

export const AUTOPILOT_KEY = 'OFFER_AUTOPILOT';
export const RUN_PREFIX = 'OFFER_AUTOPILOT_RUN:';
export const AUTOPILOT_LIMITS = { weeklyBudget: { min: 5, max: 5000, def: 50 }, perWeek: { min: 1, max: 5, def: 3 } };
export const WORKED_PER_DOLLAR = 3;     // "it worked": at least $3 of extra sales for every $1 of extra cashback
export const RUN_HOUR = 6;              // Monday, store time
const LOOK_BACK_DAYS = 56;
const BAN_WEEKS = 4;                    // an auto offer that did not work is not tried again for this many weeks
const MAX_PAST_CHECKED = 12;
const RECORDING_START = new Date('2026-09-28T05:00:00Z');   // offers record their sales from then (offers.controller OFFER_RECORDING_START)

export interface AutopilotConfig { enabled: boolean; weeklyBudget: number; perWeek: number; changedAt: string | null; changedBy: string | null }
export type Verdict = 'WORKED' | 'DID_NOT' | 'TOO_FEW';
export interface Reviewed { offerId: string; title: string; signature: string; verdict: Verdict; perDollar: number | null; paid: number; extraSales: number }
export interface Posted { offerId: string; title: string; ideaId: string; note: string; budgetCap: number; estimate: number; announced: boolean }
export interface RunRecord {
  status: 'RUNNING' | 'DONE' | 'FAILED';
  week: { from: string; to: string };
  ranAt: string;
  budget: number;
  posted: Posted[];
  reviewed: Reviewed[];
  note: string;
  error?: string;
}

const money = (n: number) => Math.round(n * 100) / 100;
const usd = (n: number) => `$${n.toFixed(2)}`;

export function cleanAutopilot(v: unknown): AutopilotConfig {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const num = (x: unknown, l: { min: number; max: number; def: number }, int = false) => {
    const n = Number(x);
    if (!Number.isFinite(n)) return l.def;
    const c = Math.min(l.max, Math.max(l.min, n));
    return int ? Math.round(c) : money(c);
  };
  return {
    enabled: o.enabled === true,
    weeklyBudget: num(o.weeklyBudget, AUTOPILOT_LIMITS.weeklyBudget),
    perWeek: num(o.perWeek, AUTOPILOT_LIMITS.perWeek, true),
    changedAt: typeof o.changedAt === 'string' ? o.changedAt : null,
    changedBy: typeof o.changedBy === 'string' ? o.changedBy : null,
  };
}

export async function loadAutopilot(): Promise<AutopilotConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: AUTOPILOT_KEY } });
  try { return cleanAutopilot(row ? JSON.parse(row.value) : null); } catch { return cleanAutopilot(null); }
}

export async function saveAutopilot(cfg: AutopilotConfig): Promise<void> {
  const value = JSON.stringify(cfg);
  await prisma.appConfig.upsert({ where: { key: AUTOPILOT_KEY }, create: { key: AUTOPILOT_KEY, value }, update: { value } });
}

/** The store week `now` is in: its Monday and Sunday (store dates). */
export function weekOf(now: Date): { from: string; to: string } {
  const today = storeDateKey(now);
  const from = addStoreDays(today, -((storeWeekday(now) + 6) % 7));
  return { from, to: addStoreDays(from, 6) };
}

/** May this week's run happen now: Monday from 6 AM, or later Tuesday to Friday (a missed Monday, or switched on mid-week). */
export function canRunNow(now: Date, switchedOn = false): boolean {
  const wd = storeWeekday(now);
  if (wd === 0 || wd === 6) return false;            // a weekend: too little of the week left, wait for Monday
  if (wd === 1 && storeHour(now) < RUN_HOUR && !switchedOn) return false;
  return true;
}

type SigOffer = { category: string | null; storeId: string | null; audience?: string | null; happyDays?: number[] | null; happyFrom?: string | null; happyTo?: string | null };
/** What sales an offer pays on, as one string: two offers with the same signature are the same promotion. */
export function signature(o: SigOffer): string {
  return [o.category ?? '*', o.storeId ?? '*', o.audience || 'EVERYONE', (o.happyDays ?? []).join(''), `${o.happyFrom ?? ''}-${o.happyTo ?? ''}`].join('|');
}
/** Would the two pay on some of the same sales (for the same people)? A sale gets one promotion, so they would compete. */
export function overlaps(a: SigOffer, b: SigOffer): boolean {
  if ((a.audience || 'EVERYONE') !== (b.audience || 'EVERYONE')) return false;
  return (a.category == null || b.category == null || a.category === b.category) && (a.storeId == null || b.storeId == null || a.storeId === b.storeId);
}

const paysCashback = (o: { bonusRate: number | null; gasBonusCentsPerGallon: number | null }) => (o.bonusRate ?? 0) > 0 || (o.gasBonusCentsPerGallon ?? 0) > 0;

/** Did a past offer work? Its lift against the time before (and the other stores or categories), over the extra cashback it paid. */
async function judge(o: { id: string; storeId: string | null; category: string | null; startDate: Date; endDate: Date }, paid: number, now: Date): Promise<{ verdict: Verdict; perDollar: number | null; extraSales: number; controlText: string | null }> {
  const end = o.endDate < now ? o.endDate : now;
  const r = await offerLift({ storeId: o.storeId, category: o.category }, o.startDate, end, paid);
  const per = r.lift.perDollar;
  const verdict: Verdict = r.lift.tooFewToTell ? 'TOO_FEW' : per != null && per >= WORKED_PER_DOLLAR ? 'WORKED' : 'DID_NOT';
  return { verdict, perDollar: per, extraSales: r.lift.extraSales, controlText: r.lift.controlText };
}

const dayText = (d: Date) => d.toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

/** "It worked last time": cashback promotions that ended in the last 8 weeks and paid back, ready to run again (newest first per kind). */
export async function workedBeforeIdeas(now: Date = new Date()): Promise<PromotionIdea[]> {
  const since = new Date(Math.max(now.getTime() - LOOK_BACK_DAYS * 86_400_000, RECORDING_START.getTime()));
  const [past, live, stores] = await Promise.all([
    prisma.offer.findMany({
      where: { endDate: { gte: since, lt: now }, startDate: { gte: RECORDING_START }, requires21: false, dealText: null, audience: { in: ['EVERYONE', 'LAPSED'] } },
      orderBy: { endDate: 'desc' }, take: 40,
    }),
    prisma.offer.findMany({ where: { isActive: true, endDate: { gt: now } }, select: { title: true, category: true, storeId: true, audience: true, bonusRate: true, gasBonusCentsPerGallon: true } }),
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
  ]);
  const storeName = new Map(stores.map((s) => [s.id, s.name]));
  const candidates = past.filter((o) => paysCashback(o) && !(o.tierBonusRates && Object.keys(o.tierBonusRates as object).length > 0)
    && (o.storeId == null || storeName.has(o.storeId)) && o.endDate.getTime() - o.startDate.getTime() >= 2 * 86_400_000)
    .slice(0, MAX_PAST_CHECKED);
  if (candidates.length === 0) return [];
  const paidBy = await budgetSpentMany(candidates.map((o) => o.id));
  const best = new Map<string, { o: (typeof candidates)[number]; j: Awaited<ReturnType<typeof judge>>; paid: number }>();
  for (const o of candidates) {
    const paid = paidBy.get(o.id) ?? 0;
    if (paid <= 0) continue;
    const j = await judge(o, paid, now);
    if (j.verdict !== 'WORKED') continue;
    const sig = signature(o);
    const had = best.get(sig);
    if (!had || (j.perDollar ?? 0) > (had.j.perDollar ?? 0)) best.set(sig, { o, j, paid });
  }
  const liveCashback = live.filter(paysCashback);
  const tomorrow = addStoreDays(storeDateKey(now), 1);
  const ideas: PromotionIdea[] = [];
  for (const [sig, { o, j, paid }] of [...best.entries()].sort((a, b) => (b[1].j.perDollar ?? 0) - (a[1].j.perDollar ?? 0))) {
    if (liveCashback.some((l) => signature(l) === sig)) continue;   // the same promotion is already running
    const offer: IdeaOffer = {
      title: o.title, titleEs: o.titleEs ?? '', description: o.description, descriptionEs: o.descriptionEs ?? '',
      category: o.category, storeId: o.storeId, storeName: o.storeId ? storeName.get(o.storeId) ?? null : null,
      bonusRate: o.gasBonusCentsPerGallon != null ? null : o.bonusRate, gasBonusCentsPerGallon: o.gasBonusCentsPerGallon,
      happyDays: o.happyDays ?? [], happyFrom: o.happyFrom, happyTo: o.happyTo,
      startDate: tomorrow, endDate: addStoreDays(tomorrow, 13),
      audience: o.audience === 'LAPSED' ? 'LAPSED' : 'EVERYONE', audienceDays: o.audience === 'LAPSED' ? o.audienceDays : null,
    };
    const what = o.category ? CAT_EN[o.category] ?? 'these' : 'all';
    const estimate = await estimateOffer({
      storeId: offer.storeId, category: offer.category as ProductCategory | null, bonusRate: offer.bonusRate, tierBonusRates: null, gasBonusCentsPerGallon: offer.gasBonusCentsPerGallon,
      startDate: startOfStoreDate(offer.startDate), endDate: endOfStoreDate(offer.endDate), happyDays: offer.happyDays, happyFrom: offer.happyFrom, happyTo: offer.happyTo,
      audience: offer.audience, audienceTier: null, audienceDays: offer.audienceDays, budgetCap: null, dailyCapPerCustomer: null,
    }, now);
    ideas.push({
      id: `again:${o.id}`,
      kind: 'WORKED_BEFORE',
      headline: `"${o.title}" worked: $${(j.perDollar ?? 0).toFixed(2)} of extra sales for every $1 of cashback`,
      why: `It ran ${dayText(o.startDate)} to ${dayText(o.endDate)} and brought about ${usd(Math.max(0, j.extraSales))} more ${what} sales than expected${j.controlText ? ` (set against ${j.controlText})` : ''}, for ${usd(paid)} of extra cashback.`,
      sizing: 'The same bonus as last time.',
      offer, estimate, alongside: liveCashback.filter((l) => overlaps(l, offer)).map((l) => l.title),
    });
  }
  return ideas;
}

/** Promotion ideas plus "It worked last time", for the Ideas panel and the weekly run. */
export async function allIdeas(now: Date = new Date()): Promise<IdeasResult> {
  const [base, again] = await Promise.all([promotionIdeas(now), workedBeforeIdeas(now).catch((e) => { console.error('[autopilot] worked-before ideas failed:', e?.message ?? e); return [] as PromotionIdea[]; })]);
  return { ...base, ideas: [...again, ...base.ideas], tooFew: base.tooFew && again.length === 0 };
}

/** The idea's words for one week: "for two weeks" becomes "this week" (English and Spanish). */
export function weekWords(o: IdeaOffer): { description: string; descriptionEs: string } {
  return {
    description: o.description.replace(/every day for two weeks/g, 'every day this week').replace(/ for two weeks/g, ' this week'),
    descriptionEs: o.descriptionEs.replace(/todos los días por dos semanas/g, 'todos los días esta semana').replace(/ por dos semanas/g, ' esta semana'),
  };
}

async function readRun(from: string): Promise<RunRecord | null> {
  const row = await prisma.appConfig.findUnique({ where: { key: RUN_PREFIX + from } });
  if (!row) return null;
  try { return JSON.parse(row.value) as RunRecord; } catch { return null; }
}
async function writeRun(from: string, rec: RunRecord) {
  await prisma.appConfig.update({ where: { key: RUN_PREFIX + from }, data: { value: JSON.stringify(rec) } });
}

/** The last few runs, newest first (the card and HQ's notifications). */
export async function recentRuns(limit = 5): Promise<RunRecord[]> {
  const rows = await prisma.appConfig.findMany({ where: { key: { startsWith: RUN_PREFIX } }, orderBy: { key: 'desc' }, take: limit });
  return rows.map((r) => { try { return JSON.parse(r.value) as RunRecord; } catch { return null; } }).filter((r): r is RunRecord => !!r);
}

export interface RunOutcome { ran: boolean; reason?: string; record?: RunRecord }

/**
 * This week's run, once: review last week's auto offers, then post this week's. `switchedOn` lets HQ's switch start it at once on a
 * Monday before 6 AM. Returns ran false (with why) when it is off, already done this week, or a weekend.
 */
export async function runAutopilot(now: Date = new Date(), opts: { switchedOn?: boolean } = {}): Promise<RunOutcome> {
  const cfg = await loadAutopilot();
  if (!cfg.enabled) return { ran: false, reason: 'off' };
  if (!canRunNow(now, opts.switchedOn)) return { ran: false, reason: 'not now' };
  const week = weekOf(now);
  const rec: RunRecord = { status: 'RUNNING', week, ranAt: now.toISOString(), budget: cfg.weeklyBudget, posted: [], reviewed: [], note: '' };
  try {
    await prisma.appConfig.create({ data: { key: RUN_PREFIX + week.from, value: JSON.stringify(rec) } });
  } catch (e: any) {
    if (e?.code === 'P2002') return { ran: false, reason: 'already ran this week' };
    throw e;
  }
  try {
    // 1. How last week's auto offers did
    const lastWeek = addStoreDays(week.from, -7);
    const last = await prisma.offer.findMany({ where: { autoWeek: lastWeek } });
    const paidLast = await budgetSpentMany(last.map((o) => o.id));
    for (const o of last) {
      const paid = paidLast.get(o.id) ?? 0;
      const j = paid > 0 ? await judge(o, paid, now) : { verdict: 'DID_NOT' as Verdict, perDollar: null, extraSales: 0, controlText: null };
      rec.reviewed.push({ offerId: o.id, title: o.title, signature: signature(o), verdict: j.verdict, perDollar: j.perDollar, paid: money(paid), extraSales: money(j.extraSales) });
    }
    // 2. What did not work in the last 4 weeks is not tried again
    const banned = new Set(rec.reviewed.filter((r) => r.verdict === 'DID_NOT').map((r) => r.signature));
    for (let w = 1; w < BAN_WEEKS; w++) {
      const old = await readRun(addStoreDays(week.from, -7 * (w + 1)));
      for (const r of old?.reviewed ?? []) if (r.verdict === 'DID_NOT') banned.add(r.signature);
    }
    // 3. The ideas: worked before first, then the rest in the ideas' own order
    const { ideas } = await allIdeas(now);
    const live = (await prisma.offer.findMany({ where: { isActive: true, endDate: { gt: now }, startDate: { lte: endOfStoreDate(week.to) } } }))
      .filter(paysCashback);
    const chosen: PromotionIdea[] = [];
    for (const idea of ideas) {
      if (chosen.length >= cfg.perWeek) break;
      const o = idea.offer;
      if (!paysCashback(o)) continue;
      if (banned.has(signature(o))) continue;
      if (live.some((l) => overlaps(l, o))) continue;                  // HQ already runs a promotion on these sales
      if (chosen.some((c) => overlaps(c.offer, o))) continue;          // two of ours would compete for the same sales
      chosen.push(idea);
    }
    // 4. The budget, shared: at least $1 each
    let n = chosen.length;
    while (n > 0 && cfg.weeklyBudget / n < 1) n -= 1;
    const picks = chosen.slice(0, n);
    const share = n > 0 ? Math.floor((cfg.weeklyBudget / n) * 100) / 100 : 0;
    const endDate = endOfStoreDate(week.to);
    const startDate = now;
    const loud = picks.reduce<PromotionIdea | null>((a, b) => (!a || b.estimate.estimatedExtra > a.estimate.estimatedExtra ? b : a), null);
    for (const idea of picks) {
      const o = idea.offer;
      const words = weekWords(o);
      const quiet = idea !== loud;
      const again = rec.reviewed.find((r) => r.signature === signature(o) && r.verdict === 'WORKED');
      const note = idea.id.startsWith('again:') || again
        ? `It worked before: ${idea.headline.replace(/^".*" worked: /, '')}.`
        : `${idea.headline}.`;
      const created = await prisma.offer.create({
        data: {
          title: o.title, description: words.description, titleEs: o.titleEs || null, descriptionEs: words.descriptionEs || null,
          type: o.storeId ? 'SPECIFIC_STORE' : 'ALL_STORES', storeId: o.storeId, category: o.category as ProductCategory | null,
          bonusRate: o.gasBonusCentsPerGallon != null ? null : o.bonusRate, gasBonusCentsPerGallon: o.gasBonusCentsPerGallon,
          happyDays: o.happyDays, happyFrom: o.happyFrom, happyTo: o.happyTo,
          audience: o.audience, audienceDays: o.audience === 'LAPSED' ? o.audienceDays : null,
          budgetCap: share, startDate, endDate, isActive: true,
          lastDayReminder: !quiet, quiet, autoIdea: idea.id, autoWeek: week.from, autoNote: note,
        },
      });
      rec.posted.push({ offerId: created.id, title: created.title, ideaId: idea.id, note, budgetCap: share, estimate: money(Math.min(idea.estimate.perDay * 7, share)), announced: !quiet });
      if (!quiet) {
        announceOffer({ id: created.id, title: created.title, titleEs: created.titleEs, storeId: created.storeId, endDate: created.endDate, createdAt: created.createdAt, audience: created.audience, audienceTier: created.audienceTier, audienceDays: created.audienceDays })
          .catch((e) => console.error('[autopilot] announcement failed:', e?.message ?? e));
      }
    }
    const worked = rec.reviewed.filter((r) => r.verdict === 'WORKED').length;
    const didNot = rec.reviewed.filter((r) => r.verdict === 'DID_NOT').length;
    rec.note = [
      rec.reviewed.length ? `Last week: ${worked} of ${rec.reviewed.length} auto offer${rec.reviewed.length === 1 ? '' : 's'} worked${didNot ? `, ${didNot} did not (not tried again for ${BAN_WEEKS} weeks)` : ''}.` : '',
      picks.length ? `This week: ${picks.length} offer${picks.length === 1 ? '' : 's'}, up to ${usd(share)} each (${usd(cfg.weeklyBudget)} in all).`
        : ideas.length === 0 ? 'This week: no offers. The sales show nothing that needs one.' : 'This week: no offers. Every idea runs on the same sales as a promotion already on, or did not work lately.',
    ].filter(Boolean).join(' ');
    rec.status = 'DONE';
    await writeRun(week.from, rec);
    audit({
      actorId: 'system', actorName: 'Offers autopilot (automatic)', actorRole: 'DEV_ADMIN',
      action: 'OFFER_AUTOPILOT_RUN', entity: 'offer', entityId: 'autopilot',
      details: { summary: rec.note, week, posted: rec.posted.map((p) => p.title), budget: cfg.weeklyBudget }, storeId: null,
    });
    return { ran: true, record: rec };
  } catch (e: any) {
    console.error('[autopilot] run failed:', e?.message ?? e);
    if (rec.posted.length === 0) {
      await prisma.appConfig.delete({ where: { key: RUN_PREFIX + week.from } }).catch(() => {});   // give the claim back: the next check tries again
    } else {
      rec.status = 'FAILED'; rec.error = String(e?.message ?? e).slice(0, 300);
      rec.note = `Posted ${rec.posted.length}, then stopped on an error.`;
      await writeRun(week.from, rec).catch(() => {});
    }
    return { ran: false, reason: 'failed' };
  }
}

/** HQ's "Stop all": this week's auto offers end now. Returns how many. */
export async function stopAutoOffers(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.offer.updateMany({ where: { autoWeek: { not: null }, endDate: { gt: now } }, data: { endDate: now } });
  return count;
}

/** HQ's notifications: each run of the last 14 days, once. */
export async function autopilotNotifications(now: Date) {
  const runs = await recentRuns(3).catch(() => [] as RunRecord[]);
  return runs.filter((r) => r.status !== 'RUNNING' && now.getTime() - new Date(r.ranAt).getTime() < 14 * 86_400_000).map((r) => ({
    id: `offer-autopilot-${r.week.from}`,
    type: 'PLATFORM',
    category: 'requests',
    title: r.posted.length ? `Autopilot posted ${r.posted.length} offer${r.posted.length === 1 ? '' : 's'} for this week` : 'Autopilot: no offers this week',
    message: r.note + (r.posted.length ? ` ${r.posted.map((p) => p.title).join('; ')}.` : ''),
    createdAt: r.ranAt,
    isRead: false,
    severity: r.status === 'FAILED' ? 'warning' : 'info',
    actionUrl: '/offers',
    actionLabel: 'Open Offers',
  }));
}

export function startOfferAutopilotCron() {
  const tick = () => { runAutopilot().catch((e) => console.error('[autopilot] check failed:', e?.message ?? e)); };
  cron.schedule('*/15 * * * *', tick, { timezone: 'UTC' });
  setTimeout(tick, 150_000);
  console.log('[autopilot] Offers autopilot checks every 15 minutes (runs once a week, Monday from 6 AM store time, while HQ has it on)');
}
