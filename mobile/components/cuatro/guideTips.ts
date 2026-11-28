// What Cuatro tells people (2026-10-27): his "Psst! Check this out" tips and his answers when asked about offers, challenges, deals,
// rewards or how to earn. Built only from what the app has already loaded (the react-query cache), like the Home tip card: he asks the
// server for nothing new, so a screen he has not seen yet just gives him less to say. Age-restricted offers are never mentioned.
import type { QueryClient } from '@tanstack/react-query';
import type { Face } from './art';
import { offerBonusText, myOfferRate } from '../../utils/offerRate';
import { spanishOffer } from '../../utils/offerText';
import type { HqLine } from '../../hooks/useEngagement';

type T = (key: string, opts?: Record<string, unknown>) => string;
export type Go = { pathname: string; params?: Record<string, string> };
// sign: a business promotion he holds up on a sign (2026-11-08); with no adId it is his own "Your business here" sign (2026-11-27)
// serious: no hop or fun pose when he says it (a missing person, 2026-11-17)
// gesture: what he does while he says it (2026-11-27, the owner: "more gestures"); none = he points at it as before
export type Gesture = 'hug' | 'joyTears' | 'jumpJoy' | 'clap' | 'dance' | 'pointTap' | 'thumbs' | 'kiss' | 'shrug' | 'bow' | 'shout';
export interface Line {
  key: string; text: string; face: Face; cta?: { label: string; go: Go }; prio: number;
  sign?: { business: string; adId?: string; tag?: string }; serious?: boolean; gesture?: Gesture;
}
/** How many different "promote your business" lines there are (tipPitch1..6) */
export const PITCH_LINES = 6;
export type Topic = 'offers' | 'challenges' | 'deals' | 'rewards' | 'earn' | 'surprise';
export const TOPICS: Topic[] = ['offers', 'challenges', 'deals', 'rewards', 'earn', 'surprise'];

export interface Ctx {
  qc: QueryClient; t: T; es: boolean;
  pts: number;            // the balance in points
  gasAlerts: boolean;     // HQ's switches the tips depend on
  hotFood: boolean;
  lastAd?: string | null;  // the promotion on his sign last time (another one comes first)
  promoDone?: boolean;     // a promotion was already shown this time the app is open (one per opening)
  // 2026-11-17 (the owner's feature tips)
  birthdayOn?: boolean;    // HQ's birthday treats switched on
  birthdaySet?: boolean;   // the customer gave their birthday
  notifOff?: boolean;      // notifications are off on this phone
  pitchDue?: boolean;      // "Own a local business?" is due (every few days, HQ's number, 2026-11-27)
  pitchN?: number;         // how many times he has asked: picks the next of his lines
  prevSeenAt?: number | null;   // when the app was last used before this time (ms): offers that started since are "new"
  now?: number;             // the time to judge "last day" by (tests)
  hqLines?: HqLine[];      // what HQ wrote for him to say (admin Engagement > Cuatro)
  tour?: TourStop | null;  // today's first-week tour stop, if any (tourStop below)
  today?: string;          // the phone's day, YYYY-MM-DD (HQ's lines are checked against their dates again here)
}

/** A new customer's first week with Cuatro (2026-11-17, the owner): one stop a day, in this order, each skipped when it does not apply
 *  or the customer already does it; the tour ends after the last stop or 14 days after sign-up, whichever comes first. */
export type TourStop = 'qr' | 'rewards' | 'hotfood' | 'deals' | 'invite';
export const TOUR: TourStop[] = ['qr', 'rewards', 'hotfood', 'deals', 'invite'];
export function tourStop(c: Ctx, done: number, joinedAt: string | null | undefined, now = Date.now()): { stop: TourStop; index: number } | null {
  if (!joinedAt) return null;
  const joined = new Date(joinedAt).getTime();
  if (!Number.isFinite(joined) || now - joined > 14 * 86_400_000) return null;
  for (let i = Math.max(0, done); i < TOUR.length; i++) {
    const s = TOUR[i];
    if (s === 'qr' && c.pts > 0) continue;                                   // already earning: they know the code
    if (s === 'rewards' && (cached<any>(c.qc, 'my-redemptions')?.data?.data ?? []).length > 0) continue;   // already redeemed
    if (s === 'hotfood') {
      const hf = cached<any>(c.qc, 'hot-food-customer-menu')?.data;
      if (!c.hotFood || !hf || ((hf.data ?? []).length === 0 && (hf.combos ?? []).length === 0)) continue;
    }
    if (s === 'invite' && !cached<any>(c.qc, 'my-referrals')?.data?.data?.settings?.enabled) continue;
    return { stop: s, index: i };
  }
  return null;
}

/** Where an HQ line's button goes, and its label key. A target this app does not know: no button (2026-11-17). */
const TARGETS: Record<string, { go: Go; label: string }> = {
  HOME: { go: { pathname: '/(customer)/home' }, label: 'guide.ctaSeeIt' },
  DEALS: { go: { pathname: '/(customer)/home', params: { scrollTo: 'offers' } }, label: 'guide.ctaDeals' },
  GAS: { go: { pathname: '/(customer)/home', params: { scrollTo: 'gas' } }, label: 'guide.ctaGasPrices' },
  CHALLENGES: { go: { pathname: '/(customer)/home', params: { scrollTo: 'challenges' } }, label: 'guide.ctaChallenges' },
  REWARDS: { go: { pathname: '/(customer)/rewards' }, label: 'guide.ctaRewards' },
  HOT_FOOD: { go: { pathname: '/(customer)/hot-food' }, label: 'guide.ctaOrder' },
  CAREERS: { go: { pathname: '/(customer)/careers' }, label: 'guide.ctaCareers' },
  REQUEST_PRODUCT: { go: { pathname: '/(customer)/request-product' }, label: 'guide.ctaRequest' },
  LOCAL_BUSINESSES: { go: { pathname: '/(customer)/ads' }, label: 'guide.ctaAds' },
  INVITE: { go: { pathname: '/(customer)/invite-friends' }, label: 'guide.ctaInvite' },
  GAMES: { go: { pathname: '/(customer)/games' }, label: 'guide.ctaPlay' },
  PROGRESS: { go: { pathname: '/(customer)/progress' }, label: 'guide.ctaStreak' },
  SCAN_RECEIPT: { go: { pathname: '/(customer)/receipt-photo' }, label: 'guide.ctaReceipt' },
  LEADERBOARD: { go: { pathname: '/(customer)/leaderboard' }, label: 'guide.ctaLeaderboard' },
  PROFILE: { go: { pathname: '/(customer)/profile' }, label: 'guide.ctaProfile' },
};

const HOME_OFFERS: Go = { pathname: '/(customer)/home', params: { scrollTo: 'offers' } };
const HOME_CHALLENGES: Go = { pathname: '/(customer)/home', params: { scrollTo: 'challenges' } };
const HOME_GAS: Go = { pathname: '/(customer)/home', params: { scrollTo: 'gas' } };
const go = (pathname: string): Go => ({ pathname });

/** The store Home is showing (its offers are asked for that store): the newest cached offers query's store id. */
function homeStoreId(qc: QueryClient): string | null {
  const found = qc.getQueryCache().findAll({ queryKey: ['offers'] }).filter((q) => q.state.data !== undefined && typeof q.queryKey[1] === 'string');
  found.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return (found[0]?.queryKey[1] as string | undefined) ?? null;
}

/** The newest cached answer for a query, whatever store it was asked for. */
function cached<D>(qc: QueryClient, key: string): D | undefined {
  const found = qc.getQueryCache().findAll({ queryKey: [key] }).filter((q) => q.state.data !== undefined);
  found.sort((a, b) => b.state.dataUpdatedAt - a.state.dataUpdatedAt);
  return found[0]?.state.data as D | undefined;
}

type Offer = { id: string; title: string; dealText?: string | null; requires21?: boolean; bonusRate?: number | null; tierBonusRates?: Record<string, number> | null; gasBonusCentsPerGallon?: number | null; startDate?: string | null; endDate?: string | null };
type Challenge = { id: string; kind: 'SPEND' | 'VISITS'; title: string; titleEs: string | null; target: number; progress: number; reward: number; done: boolean };

// Never put on his sign: alcohol, tobacco and vape businesses (Google Play and the App Store forbid those ads). Promotions have no
// category, so this goes by the words in them; HQ approves every promotion before it is published.
const NOT_ADVERTISED = /\b(beer|wine|wines|liquor|liquors|spirits|vodka|whiskey|whisky|tequila|brewery|brewing|winery|tobacco|cigar|cigars|cigarette|cigarettes|smoke shop|vape|vapes|vaping|vapor|hookah|cbd|kratom|delta[ -]?8)\b/i;
type Promo = { id: string; businessName: string; adTitle: string; adBody?: string | null; featured?: boolean };
function promotionFor(c: Ctx): Promo | null {
  const list: Promo[] = cached<any>(c.qc, 'published-promotions')?.data?.data ?? [];
  const ok = list.filter((a) => a?.id && a.businessName?.trim() && a.adTitle?.trim() && !NOT_ADVERTISED.test(`${a.businessName} ${a.adTitle} ${a.adBody ?? ''}`));
  if (!ok.length) return null;
  const featured = ok.filter((a) => a.featured !== false);
  const pool = featured.length ? featured : ok;
  return pool.find((a) => a.id !== c.lastAd) ?? pool[0];
}

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

/** Its last day is today, on the phone's calendar (stores and customers are on Central time) */
function lastDay(o: Offer, now: number): boolean {
  if (!o.endDate) return false;
  const end = new Date(o.endDate), d = new Date(now);
  return end.getTime() > now && end.getFullYear() === d.getFullYear() && end.getMonth() === d.getMonth() && end.getDate() === d.getDate();
}
/** Started since the customer last used the app */
const isNew = (o: Offer, since: number | null | undefined) => !!since && !!o.startDate && new Date(o.startDate).getTime() > since;
type Soon = { id: string; kind: string; title: string; titleEs: string | null; startsAt: string };
/** The next coming-soon teaser (2026-11-22) for the store Home shows, if it has not started yet */
function comingSoon(c: Ctx, now: number): Soon | null {
  const list: Soon[] = cached<any>(c.qc, 'coming-soon') ?? [];
  const ahead = (Array.isArray(list) ? list : []).filter((x) => x?.id && x.title && new Date(x.startsAt).getTime() > now)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  return ahead[0] ?? null;
}
/** "today", "tomorrow" or the weekday it starts, in the customer's language */
function whenWords(c: Ctx, iso: string, now: number): string {
  const at = new Date(iso), d = new Date(now);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(at) - day(d)) / 86_400_000);
  if (diff <= 0) return c.t('guide.whenToday');
  if (diff === 1) return c.t('guide.whenTomorrow');
  return at.toLocaleDateString(c.es ? 'es-US' : 'en-US', { weekday: 'long' });
}

function nearReward(c: Ctx) {
  const rs = rewards(c);
  const ready = rs.filter((r) => c.pts >= r.pointsCost).sort((a, b) => b.pointsCost - a.pointsCost)[0];
  const next = rs.filter((r) => r.pointsCost > c.pts).sort((a, b) => a.pointsCost - b.pointsCost)[0];
  return { ready, next };
}

/** Everything he could bring up on his own, most worth saying first (prio). The guide skips what it already said today. */
export function tips(c: Ctx): Line[] {
  const storeIdNow = homeStoreId(c.qc);   // the store Home shows
  const { t } = c;
  const out: Line[] = [];
  const f = flash(c);
  if (f) out.push({ key: `flash:${f.id}`, prio: 9, face: 'wow', gesture: 'shout', text: t('guide.tipFlash', { title: (c.es && f.titleEs) || f.title }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } });
  const { ready, next } = nearReward(c);
  if (ready) out.push({ key: `ready:${ready.id}`, prio: 8, face: 'love', gesture: 'clap', text: t('guide.tipReady', { reward: ready.title }), cta: { label: t('guide.ctaRewards'), go: go('/(customer)/rewards') } });
  else if (next && next.pointsCost - c.pts <= Math.max(150, next.pointsCost * 0.25)) {
    out.push({ key: `near:${next.id}`, prio: 6, face: 'wow', text: t('guide.tipNear', { need: n(next.pointsCost - c.pts), reward: next.title }), cta: { label: t('guide.ctaRewards'), go: go('/(customer)/rewards') } });
  }
  const g = cached<any>(c.qc, 'prize-game');
  if (g?.enabled && g.open && !g.played) out.push({ key: 'game', prio: 7, face: 'joy', gesture: 'jumpJoy', text: t('guide.tipGame'), cta: { label: t('guide.ctaPlay'), go: go('/(customer)/games') } });
  const e = cached<any>(c.qc, 'engagement');
  if (e?.checkIn?.available) out.push({ key: 'checkin', prio: 7, face: 'joy', gesture: 'dance', text: t('guide.tipCheckIn'), cta: { label: t('guide.ctaCheckIn'), go: go('/(customer)/home') } });
  if (e?.streak?.atRisk) out.push({ key: 'streak', prio: 7, face: 'wow', text: t('guide.tipStreak', { weeks: e.streak.weeks }), cta: { label: t('guide.ctaStreak'), go: go('/(customer)/progress') } });
  const open = challenges(c).filter((x) => !x.done);
  const doing = open.filter((x) => x.progress > 0).sort((a, b) => b.progress / b.target - a.progress / a.target)[0];
  if (doing) out.push({ key: `ch:${doing.id}`, prio: 6, face: 'joy', gesture: 'thumbs', text: t('guide.tipChallenge', { title: chTitle(doing, c), progress: progress(doing, c), pts: chPts(doing) }), cta: { label: t('guide.ctaChallenges'), go: HOME_CHALLENGES } });
  else if (open[0]) out.push({ key: `chnew:${open[0].id}`, prio: 5, face: 'wow', text: t('guide.tipChallengeNew', { title: chTitle(open[0], c), pts: chPts(open[0]) }), cta: { label: t('guide.ctaChallenges'), go: HOME_CHALLENGES } });
  // Offers (2026-11-27, the owner: "more about offers"): every live one in turn (each once a day), the last day and the new ones first
  const all = offers(c);
  const now = c.now ?? Date.now();
  for (const promo of all.filter(isPromo).slice(0, 8)) {
    const b = bonus(promo, c);
    const what = b ? `${promo.title} (${b})` : promo.title;
    if (lastDay(promo, now)) out.push({ key: `offer:${promo.id}`, prio: 8, face: 'wow', gesture: 'shout', text: t('guide.tipOfferLastDay', { title: what }), cta: { label: t('guide.ctaOffers'), go: HOME_OFFERS } });
    else if (isNew(promo, c.prevSeenAt)) out.push({ key: `offer:${promo.id}`, prio: 7, face: 'joy', gesture: 'jumpJoy', text: t('guide.tipOfferNew', { title: what }), cta: { label: t('guide.ctaOffers'), go: HOME_OFFERS } });
    else out.push({ key: `offer:${promo.id}`, prio: 5, face: 'wow', gesture: 'pointTap', text: b ? t('guide.tipOffer', { title: promo.title, bonus: b }) : t('guide.tipOfferPlain', { title: promo.title }), cta: { label: t('guide.ctaOffers'), go: HOME_OFFERS } });
  }
  for (const deal of all.filter((o) => o.dealText).slice(0, 6)) {
    if (lastDay(deal, now)) out.push({ key: `deal:${deal.id}`, prio: 7, face: 'wow', gesture: 'shout', text: t('guide.tipDealLastDay', { title: deal.title, deal: deal.dealText }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } });
    else if (isNew(deal, c.prevSeenAt)) out.push({ key: `deal:${deal.id}`, prio: 6, face: 'joy', gesture: 'clap', text: t('guide.tipDealNew', { title: deal.title, deal: deal.dealText }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } });
    else out.push({ key: `deal:${deal.id}`, prio: 5, face: 'cool', gesture: 'thumbs', text: t('guide.tipDeal', { title: deal.title, deal: deal.dealText }), cta: { label: t('guide.ctaDeals'), go: HOME_OFFERS } });
  }
  const soon = comingSoon(c, now);
  if (soon) out.push({ key: `soon:${soon.id}`, prio: 6, face: 'wink', gesture: 'dance', text: t('guide.tipComingSoon', { title: (c.es && soon.titleEs) || soon.title, when: whenWords(c, soon.startsAt, now) }), cta: { label: t('guide.ctaSeeIt'), go: HOME_OFFERS } });
  const hf = cached<any>(c.qc, 'hot-food-customer-menu')?.data;
  if (c.hotFood && hf && hf.hours?.open !== false && ((hf.data ?? []).length > 0 || (hf.combos ?? []).length > 0)) {
    out.push({ key: 'hotfood', prio: 4, face: 'love', gesture: 'kiss', text: t('guide.tipHotFood'), cta: { label: t('guide.ctaOrder'), go: go('/(customer)/hot-food') } });
  }
  // a business promotion on his sign (2026-11-08): one per app opening, featured ones first, not the one he showed last time. (It read
  // ad.title, which promotions do not have, so it never showed before.)
  const ad = c.promoDone ? null : promotionFor(c);
  if (ad) {
    out.push({ key: `ad:${ad.id}`, prio: 6, face: 'wow', text: t('guide.tipPromoSign', { business: ad.businessName, title: ad.adTitle }),
      cta: { label: t('guide.ctaSeeIt'), go: { pathname: '/(customer)/ads', params: { focus: ad.id } } }, sign: { business: ad.businessName, adId: ad.id } });
  }
  // a new customer's tour stop for today: above the everyday tips (only HQ's urgent lines go first)
  if (c.tour) {
    const go1: Record<TourStop, Go> = { qr: go('/(customer)/home'), rewards: go('/(customer)/rewards'), hotfood: go('/(customer)/hot-food'), deals: HOME_OFFERS, invite: go('/(customer)/invite-friends') };
    const cta: Record<TourStop, string> = { qr: 'guide.ctaCode', rewards: 'guide.ctaRewards', hotfood: 'guide.ctaOrder', deals: 'guide.ctaDeals', invite: 'guide.ctaInvite' };
    out.push({ key: `tour:${c.tour}`, prio: 9, face: 'joy', text: t(`guide.tour_${c.tour}`), cta: { label: t(cta[c.tour]), go: go1[c.tour] } });
  }

  // HQ's own lines first in line (urgent ones above everything): for this store (or every store), in their dates, in the customer's
  // language when HQ wrote it
  for (const l of c.hqLines ?? []) {
    if (!l?.id || !l.text) continue;
    if (l.stores?.length && !(storeIdNow && l.stores.includes(storeIdNow))) continue;
    if (c.today && ((l.start && l.start > c.today) || (l.end && l.end < c.today))) continue;
    const tg = TARGETS[l.target];
    out.push({ key: `hq:${l.id}`, prio: l.urgent ? 10 : 7, face: l.urgent ? 'wow' : 'joy', text: (c.es && l.textEs) || l.text,
      ...(tg ? { cta: { label: t(tg.label), go: tg.go } } : {}) });
  }

  // 2026-11-17, the owner's list: gas price, hot food combos, hiring, scan a receipt, birthday, notifications, missing persons, and
  // (once a month) "own a local business?". Each only when its feature is on and has something to say.
  const storeId = storeIdNow;
  const pumps: any[] = cached<any>(c.qc, 'gas-prices')?.data?.data ?? [];
  const here = pumps.find((s) => s?.id === storeId);
  if (here?.gasPricePerGallon) {
    const price = `$${Number(here.gasPricePerGallon).toFixed(3)}`;
    const gasPromo = all.find((o) => o.gasBonusCentsPerGallon != null && o.gasBonusCentsPerGallon > 0);
    out.push({ key: `gasprice:${here.id}`, prio: 3, face: 'cool',
      text: gasPromo ? t('guide.tipGasPriceBonus', { store: here.name, price, cents: gasPromo.gasBonusCentsPerGallon }) : t('guide.tipGasPrice', { store: here.name, price }),
      cta: { label: t('guide.ctaGasPrices'), go: HOME_GAS } });
  }
  if (c.hotFood && hf && hf.hours?.open !== false && (hf.combos ?? []).length > 0) {
    out.push({ key: 'hfcombo', prio: 4, face: 'love', text: t('guide.tipHotFoodCombos'), cta: { label: t('guide.ctaOrder'), go: go('/(customer)/hot-food') } });
  }
  const jobs: any[] = cached<any>(c.qc, 'job-openings')?.data?.data ?? [];
  if (jobs.length) {
    const job = jobs.find((j) => j?.storeId && j.storeId === storeId) ?? jobs[0];
    out.push({ key: 'jobs', prio: 2, face: 'joy',
      text: job?.store?.name ? t('guide.tipHiring', { store: job.store.name, title: job.title }) : t('guide.tipHiringAny', { title: job?.title ?? '' }),
      cta: { label: t('guide.ctaCareers'), go: go('/(customer)/careers') } });
  }
  if (cached<any>(c.qc, 'receipt-scan-access')?.data?.data?.enabled === true) {
    out.push({ key: 'receipt', prio: 2, face: 'happy', text: t('guide.tipReceipt'), cta: { label: t('guide.ctaReceipt'), go: go('/(customer)/receipt-photo') } });
  }
  if (c.birthdayOn && !c.birthdaySet) out.push({ key: 'birthday', prio: 2, face: 'love', text: t('guide.tipBirthday'), cta: { label: t('guide.ctaProfile'), go: go('/(customer)/profile') } });
  if (c.notifOff) out.push({ key: 'notif', prio: 3, face: 'wow', text: t('guide.tipNotif'), cta: { label: t('guide.ctaProfile'), go: go('/(customer)/profile') } });
  const missing: any[] = cached<any>(c.qc, 'missing-active')?.data?.data ?? [];
  const poster = missing.find((p) => p?.urgent) ?? missing[0];
  if (poster?.id && poster.name) {
    out.push({ key: `missing:${poster.id}`, prio: poster.urgent ? 6 : 3, face: 'sad', serious: true,
      text: t(poster.urgent ? 'guide.tipMissingUrgent' : 'guide.tipMissing', { name: poster.name }),
      cta: { label: t('guide.ctaMissing'), go: { pathname: '/(customer)/missing/[id]', params: { id: poster.id } } } });
  }
  if (c.pitchDue) {
    // the owner (2026-11-27): "more focus on letting people know to promote their businesses": every few days (HQ's number), up with
    // the offers, his own "Your business here" sign or a shout, a different line each time; right after a promotion on his sign, "yours too?"
    const v = (c.pitchN ?? 0) % PITCH_LINES;
    const promote: Go = { pathname: '/(customer)/ads', params: { promote: String(now) } };
    const signed = c.promoDone || v % 2 === 0;
    out.push({ key: 'pitch', prio: 5, face: c.promoDone ? 'wink' : v % 2 ? 'wow' : 'joy', ...(signed ? {} : { gesture: 'shout' as Gesture }),
      text: c.promoDone ? t('guide.tipPitchAfterAd') : t(`guide.tipPitch${v + 1}`), cta: { label: t('guide.ctaPitch'), go: promote },
      ...(signed ? { sign: { business: t('guide.signYours'), tag: t('guide.signYoursTag') } } : {}) });
  }

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
    if (!ps.length) return { key: 'a:offers', prio: 0, face: 'sad', gesture: 'shrug', text: t('guide.offersNone') };
    const b = bonus(ps[0], c);
    return { key: 'a:offers', prio: 0, face: 'wow', gesture: 'pointTap', text: t('guide.offersSome', { count: ps.length, title: b ? `${ps[0].title} (${b})` : ps[0].title }), cta: { label: t('guide.ctaOffers'), go: HOME_OFFERS } };
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
    return { key: 'a:deals', prio: 0, face: 'wink', gesture: 'shrug', text: t('guide.dealsNone'), cta: { label: t('guide.ctaAds'), go: go('/(customer)/ads') } };
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
