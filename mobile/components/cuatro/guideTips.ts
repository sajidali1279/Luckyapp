// What Cuatro tells people (2026-10-27): his "Psst! Check this out" tips and his answers when asked about offers, challenges, deals,
// rewards or how to earn. Built only from what the app has already loaded (the react-query cache), like the Home tip card: he asks the
// server for nothing new, so a screen he has not seen yet just gives him less to say. Age-restricted offers are never mentioned.
import type { QueryClient } from '@tanstack/react-query';
import type { Face } from './art';
import { offerBonusText, myOfferRate } from '../../utils/offerRate';
import { spanishOffer } from '../../utils/offerText';

type T = (key: string, opts?: Record<string, unknown>) => string;
export type Go = { pathname: string; params?: Record<string, string> };
export interface Line { key: string; text: string; face: Face; cta?: { label: string; go: Go }; prio: number }
export type Topic = 'offers' | 'challenges' | 'deals' | 'rewards' | 'earn' | 'surprise';
export const TOPICS: Topic[] = ['offers', 'challenges', 'deals', 'rewards', 'earn', 'surprise'];

export interface Ctx {
  qc: QueryClient; t: T; es: boolean;
  pts: number;            // the balance in points
  gasAlerts: boolean;     // HQ's switches the tips depend on
  hotFood: boolean;
}

const HOME_OFFERS: Go = { pathname: '/(customer)/home', params: { scrollTo: 'offers' } };
const HOME_CHALLENGES: Go = { pathname: '/(customer)/home', params: { scrollTo: 'challenges' } };
const go = (pathname: string): Go => ({ pathname });

/** The newest cached answer for a query, whatever store it was asked for. */
function cached<D>(qc: QueryClient, key: string): D | undefined {
  const found = qc.getQueryCache().findAll({ queryKey: [key] }).filter((q) => q.state.data !== undefined);
  found.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return found[0]?.state.data as D | undefined;
}

type Offer = { id: string; title: string; dealText?: string | null; requires21?: boolean; bonusRate?: number | null; tierBonusRates?: Record<string, number> | null; gasBonusCentsPerGallon?: number | null };
type Challenge = { id: string; kind: 'SPEND' | 'VISITS'; title: string; titleEs: string | null; target: number; progress: number; reward: number; done: boolean };

function offers(c: Ctx): Offer[] {
  const res = cached<any>(c.qc, 'offers');
  const list: Offer[] = Array.isArray(res?.data?.data) ? res.data.data : [];
  return list.filter((o) => o && o.title && !o.requires21).map((o) => (c.es ? spanishOffer(o) : o));
}
const isPromo = (o: Offer) => !o.dealText && (!!o.bonusRate || o.gasBonusCentsPerGallon != null || (!!o.tierBonusRates && Object.keys(o.tierBonusRates).length > 0));
function bonus(o: Offer, c: Ctx): string {
  if (o.gasBonusCentsPerGallon != null) return c.t('guide.gasBonus', { cents: o.gasBonusCentsPerGallon });
  return (myOfferRate(o) ?? 0) > 0 || o.tierBonusRates ? offerBonusText(o, c.t, 'cashbackPill') : '';
}
function rewards(c: Ctx): { id: string; title: string; pointsCost: number }[] {
  const res = cached<any>(c.qc, 'catalog-active');
  return (Array.isArray(res?.data?.data) ? res.data.data : []).filter((r: any) => r && r.title && r.pointsCost > 0);
}
function challenges(c: Ctx): Challenge[] {
  const res = cached<any>(c.qc, 'my-challenges');
  return Array.isArray(res?.data?.data) ? res.data.data : [];
}
const chTitle = (x: Challenge, c: Ctx) => (c.es && x.titleEs) || x.title;
const chPts = (x: Challenge) => Math.round(x.reward * 100).toLocaleString('en-US');   // rewards are stored in dollars, shown in points
const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
function progress(x: Challenge, c: Ctx): string {
  const done = Math.min(x.progress, x.target);
  return x.kind === 'SPEND' ? c.t('guide.progressSpend', { done: money(done), target: money(x.target) }) : c.t('guide.progressVisits', { done, target: x.target });
}
function flash(c: Ctx): { id: string; title: string; titleEs: string | null } | null {
  const d = cached<any>(c.qc, 'flash-deal');
  return d && d.id && new Date(d.endsAt).getTime() > Date.now() ? d : null;
}
const n = (v: number) => v.toLocaleString('en-US');

function nearReward(c: Ctx) {
  const rs = rewards(c);
  const ready = rs.filter((r) => c.pts >= r.pointsCost).sort((a, b) => b.pointsCost - a.pointsCost)[0];
  const next = rs.filter((r) => r.pointsCost > c.pts).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  return { ready, next };
}

/** Everything he could bring up on his own, most worth saying first (prio). The guide skips what it already said today. */
export function tips(c: Ctx): Line[] {
  const { t } = c;
  const out: Line[] = [];
  const f = flash(c);
  if (f) out.push({ key: `flash:${f.id}`, prio: 9, face: 'wow', text: t('guide.tipFlash', { title: (c.es && f.titleEs) || f.title }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } });
  const { ready, next } = nearReward(c);
  if (ready) out.push({ key: `ready:${ready.id}`, prio: 8, face: 'love', text: t('guide.tipReady', { reward: ready.title }), cta: { label: t('guide.ctaRewards'), go: go('/(customer)/rewards') } });
  else if (next && next.pointsCost - c.pts <= Math.max(150, next.pointsCost * 0.25)) {
    out.push({ key: `near:${next.id}`, prio: 6, face: 'wow', text: t('guide.tipNear', { need: n(next.pointsCost - c.pts), reward: next.title }), cta: { label: t('guide.ctaRewards'), go: go('/(customer)/rewards') } });
  }
  const g = cached<any>(c.qc, 'prize-game');
  if (g?.enabled && g.open && !g.played) out.push({ key: 'game', prio: 7, face: 'joy', text: t('guide.tipGame'), cta: { label: t('guide.ctaPlay'), go: go('/(customer)/games') } });
  const e = cached<any>(c.qc, 'engagement');
  if (e?.checkIn?.available) out.push({ key: 'checkin', prio: 7, face: 'joy', text: t('guide.tipCheckIn'), cta: { label: t('guide.ctaCheckIn'), go: go('/(customer)/home') } });
  if (e?.streak?.atRisk) out.push({ key: 'streak', prio: 7, face: 'wow', text: t('guide.tipStreak', { weeks: e.streak.weeks }), cta: { label: t('guide.ctaStreak'), go: go('/(customer)/progress') } });
  const open = challenges(c).filter((x) => !x.done);
  const doing = open.filter((x) => x.progress > 0).sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
  if (doing) out.push({ key: `ch:${doing.id}`, prio: 6, face: 'joy', text: t('guide.tipChallenge', { title: chTitle(doing, c), progress: progress(doing, c), pts: chPts(doing) }), cta: { label: t('guide.ctaChallenges'), go: HOME_CHALLENGES } });
  else if (open[0]) out.push({ key: `chnew:${open[0].id}`, prio: 5, face: 'wow', text: t('guide.tipChallengeNew', { title: chTitle(open[0], c), pts: chPts(open[0]) }), cta: { label: t('guide.ctaChallenges'), go: HOME_CHALLENGES } });
  const all = offers(c);
  const promo = all.find(isPromo);
  if (promo) {
    const b = bonus(promo, c);
    out.push({ key: `offer:${promo.id}`, prio: 5, face: 'wow', text: b ? t('guide.tipOffer', { title: promo.title, bonus: b }) : t('guide.tipOfferPlain', { title: promo.title }), cta: { label: t('guide.ctaOffers'), go: HOME_OFFERS } });
  }
  const deal = all.find((o) => o.dealText);
  if (deal) out.push({ key: `deal:${deal.id}`, prio: 5, face: 'cool', text: t('guide.tipDeal', { title: deal.title, deal: deal.dealText }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } });
  const hf = cached<any>(c.qc, 'hot-food-customer-menu')?.data;
  if (c.hotFood && hf && hf.hours?.open !== false && ((hf.data ?? []).length > 0 || (hf.combos ?? []).length > 0)) {
    out.push({ key: 'hotfood', prio: 4, face: 'love', text: t('guide.tipHotFood'), cta: { label: t('guide.ctaOrder'), go: go('/(customer)/hot-food') } });
  }
  const ad = cached<any>(c.qc, 'published-promotions')?.data?.data?.[0];
  if (ad?.title) out.push({ key: `ad:${ad.id}`, prio: 3, face: 'wow', text: t('guide.tipPromo', { title: ad.title }), cta: { label: t('guide.ctaAds'), go: go('/(customer)/ads') } });
  // the everyday ones
  out.push({ key: 'qr', prio: 2, face: 'happy', text: t('guide.tipQr'), cta: { label: t('guide.ctaCode'), go: go('/(customer)/home') } });
  if (cached<any>(c.qc, 'my-referrals')?.data?.data?.settings?.enabled) {
    out.push({ key: 'invite', prio: 2, face: 'joy', text: t('guide.tipInvite'), cta: { label: t('guide.ctaInvite'), go: go('/(customer)/invite-friends') } });
  }
  out.push({ key: 'tier', prio: 1, face: 'cool', text: t('guide.tipTier'), cta: { label: t('guide.ctaTier'), go: go('/(customer)/rewards') } });
  out.push({ key: 'leaderboard', prio: 1, face: 'wink', text: t('guide.tipLeaderboard'), cta: { label: t('guide.ctaLeaderboard'), go: go('/(customer)/leaderboard') } });
  if (c.gasAlerts) out.push({ key: 'gas', prio: 1, face: 'happy', text: t('guide.tipGasAlerts'), cta: { label: t('guide.ctaGasAlerts'), go: go('/(customer)/gas-alerts') } });
  out.push({ key: 'request', prio: 1, face: 'wink', text: t('guide.tipRequest'), cta: { label: t('guide.ctaRequest'), go: go('/(customer)/request-product') } });
  out.push({ key: 'guide', prio: 1, face: 'happy', text: t('guide.tipGuide'), cta: { label: t('guide.ctaGuide'), go: go('/(customer)/guide') } });
  out.push({ key: 'language', prio: 1, face: 'wink', text: t('guide.tipLanguage'), cta: { label: t('guide.ctaProfile'), go: go('/(customer)/profile') } });
  return out;
}

/** His answer when asked about a topic from his help menu. */
export function answer(topic: Topic, c: Ctx): Line {
  const { t } = c;
  if (topic === 'surprise') {
    const pool = tips(c);
    return { ...pool[Math.floor(Math.random() * pool.length)], key: 'a:surprise' };
  }
  if (topic === 'offers') {
    const ps = offers(c).filter(isPromo);
    if (!ps.length) return { key: 'a:offers', prio: 0, face: 'sad', text: t('guide.offersNone') };
    const b = bonus(ps[0], c);
    return { key: 'a:offers', prio: 0, face: 'wow', text: t('guide.offersSome', { count: ps.length, title: b ? `${ps[0].title} (${b})` : ps[0].title }), cta: { label: t('guide.ctaOffers'), go: HOME_OFFERS } };
  }
  if (topic === 'challenges') {
    const all = challenges(c);
    const open = all.filter((x) => !x.done);
    if (!all.length) return { key: 'a:ch', prio: 0, face: 'sad', text: t('guide.challengesNone') };
    if (!open.length) return { key: 'a:ch', prio: 0, face: 'cool', text: t('guide.challengesAllDone'), cta: { label: t('guide.ctaChallenges'), go: HOME_CHALLENGES } };
    const best = [...open].sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
    return {
      key: 'a:ch', prio: 0, face: 'joy',
      text: t('guide.challengesSome', { count: open.length, title: chTitle(best, c), progress: progress(best, c), pts: chPts(best) }),
      cta: { label: t('guide.ctaChallenges'), go: HOME_CHALLENGES },
    };
  }
  if (topic === 'deals') {
    const f = flash(c);
    if (f) return { key: 'a:deals', prio: 0, face: 'wow', text: t('guide.tipFlash', { title: (c.es && f.titleEs) || f.title }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } };
    const ds = offers(c).filter((o) => o.dealText);
    if (ds.length) return { key: 'a:deals', prio: 0, face: 'cool', text: t('guide.dealsSome', { count: ds.length, title: ds[0].title, deal: ds[0].dealText }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } };
    const hf = cached<any>(c.qc, 'hot-food-customer-menu')?.data;
    if (c.hotFood && hf && hf.hours?.open !== false && (hf.combos ?? []).length > 0) {
      return { key: 'a:deals', prio: 0, face: 'love', text: t('guide.dealsCombos'), cta: { label: t('guide.ctaOrder'), go: go('/(customer)/hot-food') } };
    }
    return { key: 'a:deals', prio: 0, face: 'wink', text: t('guide.dealsNone'), cta: { label: t('guide.ctaAds'), go: go('/(customer)/ads') } };
  }
  if (topic === 'rewards') {
    const { ready, next } = nearReward(c);
    const pts = n(c.pts);
    const text = ready ? t('guide.rewardsReady', { pts, reward: ready.title })
      : next ? t('guide.rewardsNear', { pts, need: n(next.pointsCost - c.pts), reward: next.title })
      : t('guide.rewardsSome', { pts });
    return { key: 'a:rewards', prio: 0, face: ready ? 'love' : 'joy', text, cta: { label: t('guide.ctaRewards'), go: go('/(customer)/rewards') } };
  }
  return { key: 'a:earn', prio: 0, face: 'cool', text: t('guide.earn'), cta: { label: t('guide.ctaCode'), go: go('/(customer)/home') } };
}
