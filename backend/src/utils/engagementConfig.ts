// What HQ has switched on in admin > Engagement (2026-10-23), and how: streaks, punch cards, daily check-in, badges, store goals, reorder,
// gas price alerts, sharing and the smart nudges. Stored as one JSON row (AppConfig key ENGAGEMENT, no migration), read like the other HQ
// settings (utils/appSettings.ts). EVERYTHING IS OFF until HQ turns it on, and every number is clamped here, so a typo in the admin page
// can never make a reward unlimited. Points are always whole points (100 pts = $1); only the engine converts to dollars.

export const ENGAGEMENT_LIMITS = {
  streakMilestones: 8, streakWeeks: { min: 1, max: 52 }, streakPts: { min: 0, max: 1000 }, streakMinPurchase: { min: 0, max: 100 },
  checkInPts: { min: 0, max: 50 }, checkInWeekBonus: { min: 0, max: 200 }, checkInMonthlyCap: { min: 0, max: 1000 }, checkInVisitDays: { min: 0, max: 365 },
  mysteryEntries: 6, mysteryPts: { min: 0, max: 100 }, mysteryWeight: { min: 1, max: 100 },
  nudgeHour: { min: 0, max: 23 }, nudgesPerWeek: { min: 1, max: 7 }, nearRewardPts: { min: 10, max: 1000 },
  tierResetDays: { min: 3, max: 60 }, comebackDays: { min: 7, max: 180 }, shareMessage: 140,
  ratePurchases: { min: 1, max: 50 }, rateDays: { min: 0, max: 365 },
} as const;

export interface Milestone { weeks: number; pts: number }
export interface MysteryPrize { pts: number; weight: number }
export interface EngagementConfig {
  // since: the store day HQ switched streaks on (set by the server). Weeks before it do not count, so switching on never pays out old history.
  streaks: { enabled: boolean; minPurchase: number; milestones: Milestone[]; since: string | null };
  punchCards: { enabled: boolean };
  checkIn: { enabled: boolean; mode: 'FIXED' | 'MYSTERY'; pts: number; weekBonusPts: number; mystery: MysteryPrize[]; monthlyCapPts: number; needVisitDays: number };
  badges: { enabled: boolean; off: string[] };
  storeGoals: { enabled: boolean };
  reorder: { enabled: boolean };
  gasAlerts: { enabled: boolean };
  sharing: { enabled: boolean; message: string };
  // "Rate the app" (2026-10-24): the phone's own rating sheet, once per customer, after a good moment, once they have bought a few times
  ratePrompt: { enabled: boolean; minPurchases: number; minDays: number };
  nudges: {
    enabled: boolean; quietFrom: number; quietTo: number; maxPerWeek: number;
    nearReward: { enabled: boolean; withinPts: number };
    streakRisk: { enabled: boolean };
    tierReset: { enabled: boolean; daysBefore: number };
    comeback: { enabled: boolean; quietDays: number };
  };
}

export const DEFAULT_ENGAGEMENT: EngagementConfig = {
  streaks: { enabled: false, minPurchase: 2, milestones: [{ weeks: 3, pts: 50 }, { weeks: 6, pts: 100 }, { weeks: 12, pts: 250 }], since: null },
  punchCards: { enabled: false },
  checkIn: { enabled: false, mode: 'FIXED', pts: 2, weekBonusPts: 10, mystery: [{ pts: 1, weight: 60 }, { pts: 3, weight: 30 }, { pts: 5, weight: 9 }, { pts: 25, weight: 1 }], monthlyCapPts: 100, needVisitDays: 30 },
  badges: { enabled: false, off: [] },
  storeGoals: { enabled: false },
  reorder: { enabled: false },
  gasAlerts: { enabled: false },
  sharing: { enabled: false, message: 'I am on a streak with Lucky Stop Rewards. Get the free app:' },
  ratePrompt: { enabled: false, minPurchases: 3, minDays: 7 },
  nudges: {
    enabled: false, quietFrom: 21, quietTo: 8, maxPerWeek: 2,
    nearReward: { enabled: true, withinPts: 150 },
    streakRisk: { enabled: true },
    tierReset: { enabled: true, daysBefore: 14 },
    comeback: { enabled: true, quietDays: 21 },
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const bool = (v: unknown, def: boolean) => (typeof v === 'boolean' ? v : def);
// A number that is not a number gets the default; one that is too big or too small is held at the limit (a typo of 1500 becomes the
// largest allowed, not the default, so the saved setting never silently turns into something else).
const int = (v: unknown, r: { min: number; max: number }, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN;
  return Number.isNaN(n) ? def : Math.min(r.max, Math.max(r.min, n));
};
const num = (v: unknown, r: { min: number; max: number }, def: number) => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : NaN;
  return Number.isNaN(n) ? def : Math.min(r.max, Math.max(r.min, n));
};

/** Everything that is stored goes through here: unknown keys dropped, numbers clamped, lists kept in order and within their size. */
export function cleanEngagement(stored: unknown): EngagementConfig {
  const d = DEFAULT_ENGAGEMENT, L = ENGAGEMENT_LIMITS;
  const s = isObj(stored) ? stored : {};
  const st = isObj(s.streaks) ? s.streaks : {};
  const ci = isObj(s.checkIn) ? s.checkIn : {};
  const bd = isObj(s.badges) ? s.badges : {};
  const sh = isObj(s.sharing) ? s.sharing : {};
  const rp = isObj(s.ratePrompt) ? s.ratePrompt : {};
  const nu = isObj(s.nudges) ? s.nudges : {};
  const nr = isObj(nu.nearReward) ? nu.nearReward : {};
  const sr = isObj(nu.streakRisk) ? nu.streakRisk : {};
  const tr = isObj(nu.tierReset) ? nu.tierReset : {};
  const cb = isObj(nu.comeback) ? nu.comeback : {};

  // milestones: increasing weeks, no repeats, at most 8; none given (or all bad) keeps the defaults
  let milestones: Milestone[] = [];
  if (Array.isArray(st.milestones)) {
    const seen = new Set<number>();
    for (const m of st.milestones) {
      if (!isObj(m)) continue;
      if (typeof m.weeks !== 'number' || typeof m.pts !== 'number' || m.weeks < L.streakWeeks.min || m.pts < L.streakPts.min) continue;   // too small is dropped, too big is held at the limit
      const weeks = int(m.weeks, L.streakWeeks, 0), pts = int(m.pts, L.streakPts, -1);
      if (weeks < 1 || pts < 0 || seen.has(weeks)) continue;
      seen.add(weeks); milestones.push({ weeks, pts });
    }
    milestones = milestones.sort((a, b) => a.weeks - b.weeks).slice(0, L.streakMilestones);
  }
  if (milestones.length === 0) milestones = d.streaks.milestones.map((m) => ({ ...m }));

  let mystery: MysteryPrize[] = [];
  if (Array.isArray(ci.mystery)) {
    for (const m of ci.mystery) {
      if (!isObj(m)) continue;
      if (typeof m.pts !== 'number' || typeof m.weight !== 'number' || m.pts < L.mysteryPts.min || m.weight < L.mysteryWeight.min) continue;
      const pts = int(m.pts, L.mysteryPts, -1), weight = int(m.weight, L.mysteryWeight, 0);
      if (pts >= 0 && weight > 0) mystery.push({ pts, weight });
    }
    mystery = mystery.slice(0, L.mysteryEntries);
  }
  if (mystery.length === 0) mystery = d.checkIn.mystery.map((m) => ({ ...m }));

  const off = Array.isArray(bd.off) ? [...new Set(bd.off.filter((k): k is string => typeof k === 'string' && /^[a-z0-9_]{1,40}$/.test(k)))].slice(0, 60) : [];
  const message = typeof sh.message === 'string' && sh.message.trim() ? sh.message.trim().slice(0, L.shareMessage) : d.sharing.message;

  return {
    streaks: { enabled: bool(st.enabled, false), minPurchase: num(st.minPurchase, L.streakMinPurchase, d.streaks.minPurchase), milestones, since: typeof st.since === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(st.since) ? st.since : null },
    punchCards: { enabled: bool(isObj(s.punchCards) ? s.punchCards.enabled : false, false) },
    checkIn: {
      enabled: bool(ci.enabled, false), mode: ci.mode === 'MYSTERY' ? 'MYSTERY' : 'FIXED',
      pts: int(ci.pts, L.checkInPts, d.checkIn.pts), weekBonusPts: int(ci.weekBonusPts, L.checkInWeekBonus, d.checkIn.weekBonusPts), mystery,
      monthlyCapPts: int(ci.monthlyCapPts, L.checkInMonthlyCap, d.checkIn.monthlyCapPts), needVisitDays: int(ci.needVisitDays, L.checkInVisitDays, d.checkIn.needVisitDays),
    },
    badges: { enabled: bool(bd.enabled, false), off },
    storeGoals: { enabled: bool(isObj(s.storeGoals) ? s.storeGoals.enabled : false, false) },
    reorder: { enabled: bool(isObj(s.reorder) ? s.reorder.enabled : false, false) },
    gasAlerts: { enabled: bool(isObj(s.gasAlerts) ? s.gasAlerts.enabled : false, false) },
    sharing: { enabled: bool(sh.enabled, false), message },
    ratePrompt: { enabled: bool(rp.enabled, false), minPurchases: int(rp.minPurchases, L.ratePurchases, d.ratePrompt.minPurchases), minDays: int(rp.minDays, L.rateDays, d.ratePrompt.minDays) },
    nudges: {
      enabled: bool(nu.enabled, false), quietFrom: int(nu.quietFrom, L.nudgeHour, d.nudges.quietFrom), quietTo: int(nu.quietTo, L.nudgeHour, d.nudges.quietTo),
      maxPerWeek: int(nu.maxPerWeek, L.nudgesPerWeek, d.nudges.maxPerWeek),
      nearReward: { enabled: bool(nr.enabled, d.nudges.nearReward.enabled), withinPts: int(nr.withinPts, L.nearRewardPts, d.nudges.nearReward.withinPts) },
      streakRisk: { enabled: bool(sr.enabled, d.nudges.streakRisk.enabled) },
      tierReset: { enabled: bool(tr.enabled, d.nudges.tierReset.enabled), daysBefore: int(tr.daysBefore, L.tierResetDays, d.nudges.tierReset.daysBefore) },
      comeback: { enabled: bool(cb.enabled, d.nudges.comeback.enabled), quietDays: int(cb.quietDays, L.comebackDays, d.nudges.comeback.quietDays) },
    },
  };
}

/** What the phones are told (the switches, and the numbers their words repeat): nothing here is a secret or a cost control. */
export function publicEngagement(c: EngagementConfig) {
  return {
    streaks: { enabled: c.streaks.enabled, milestones: c.streaks.milestones, minPurchase: c.streaks.minPurchase },
    punchCards: c.punchCards.enabled,
    checkIn: { enabled: c.checkIn.enabled, mode: c.checkIn.mode },
    badges: c.badges.enabled,
    storeGoals: c.storeGoals.enabled,
    reorder: c.reorder.enabled,
    gasAlerts: c.gasAlerts.enabled,
    sharing: { enabled: c.sharing.enabled, message: c.sharing.message },
    ratePrompt: c.ratePrompt.enabled,
  };
}
