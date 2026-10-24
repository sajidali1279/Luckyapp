// What HQ has switched on in admin > Engagement (2026-10-23), and how: streaks, punch cards, daily check-in, badges, store goals, reorder,
// gas price alerts, sharing, the rate-the-app prompt, the welcome series and the smart nudges. Stored as one JSON row (AppConfig key ENGAGEMENT, no migration), read like the other HQ
// settings (utils/appSettings.ts). EVERYTHING IS OFF until HQ turns it on, and every number is clamped here, so a typo in the admin page
// can never make a reward unlimited. Points are always whole points (100 pts = $1); only the engine converts to dollars.

export const ENGAGEMENT_LIMITS = {
  streakMilestones: 8, streakWeeks: { min: 1, max: 52 }, streakPts: { min: 0, max: 1000 }, streakMinPurchase: { min: 0, max: 100 },
  checkInPts: { min: 0, max: 50 }, checkInWeekBonus: { min: 0, max: 200 }, checkInMonthlyCap: { min: 0, max: 1000 }, checkInVisitDays: { min: 0, max: 365 },
  mysteryEntries: 6, mysteryPts: { min: 0, max: 100 }, mysteryWeight: { min: 1, max: 100 },
  nudgeHour: { min: 0, max: 23 }, nudgesPerWeek: { min: 1, max: 7 }, nearRewardPts: { min: 10, max: 1000 },
  tierResetDays: { min: 3, max: 60 }, comebackDays: { min: 7, max: 180 }, shareMessage: 140,
  ratePurchases: { min: 1, max: 50 }, rateDays: { min: 0, max: 365 },
  welcomeDay: { min: 1, max: 30 }, welcomeTitle: 60, welcomeBody: 200,
  birthdayPts: { min: 0, max: 500 }, birthdayBoughtDays: { min: 0, max: 365 }, birthdayBudget: { min: 0, max: 200000 }, pushTitle: 60, pushBody: 200,
} as const;

export interface Milestone { weeks: number; pts: number }
export interface MysteryPrize { pts: number; weight: number }

// The welcome series (2026-10-24): three steps, each with message choices; the server sends the first choice that fits the person
// (utils/engagementWelcome.ts says when each one fits). HQ edits the day of each step and every text, in English and Spanish.
export type WelcomeKey = 'qrBonus' | 'qr' | 'hotFood' | 'checkIn' | 'invite' | 'tier';
export const WELCOME_KEYS: WelcomeKey[] = ['qrBonus', 'qr', 'hotFood', 'checkIn', 'invite', 'tier'];
export interface PushText { titleEn: string; bodyEn: string; titleEs: string; bodyEs: string }
export type WelcomeText = PushText;
export interface WelcomeStep { day: number; enabled: boolean }
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
  // since: the store day HQ switched it on (set by the server). Only people who sign up from that day on get the series, so switching it
  // on never messages the customers who joined before.
  welcome: { enabled: boolean; since: string | null; steps: WelcomeStep[]; texts: Record<WelcomeKey, WelcomeText> };
  // Tier celebration (2026-10-24): the app's one-time celebration when a customer reaches a higher tier (the tier-up push itself always goes out)
  tierUp: { enabled: boolean };
  // Birthday gift (2026-10-24): a greeting push on the day and, when bonusPts is more than 0, a bonus once a year for people who bought in
  // the last needBoughtDays days (0: anyone who has ever bought), inside a hard monthly budget. {name} and {pts} in the texts are filled in.
  birthday: { enabled: boolean; bonusPts: number; needBoughtDays: number; monthlyBudgetPts: number; gift: PushText; greeting: PushText };
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
  welcome: {
    enabled: false, since: null,
    steps: [{ day: 1, enabled: true }, { day: 3, enabled: true }, { day: 7, enabled: true }],
    texts: {
      qrBonus: { titleEn: 'Your welcome treats are waiting 🎁', bodyEn: 'Show the QR code in the app at the register. You earn points, and for your first days you also get one free item a day.', titleEs: 'Tus regalos de bienvenida te esperan 🎁', bodyEs: 'Muestra el código QR de la app en la caja. Ganas puntos y, en tus primeros días, también un producto gratis al día.' },
      qr: { titleEn: 'Your Lucky Stop card is ready 🍀', bodyEn: 'Show the QR code in the app at the register and you earn points on every purchase.', titleEs: 'Tu tarjeta Lucky Stop está lista 🍀', bodyEs: 'Muestra el código QR de la app en la caja y ganas puntos en cada compra.' },
      hotFood: { titleEn: 'Hungry? Order ahead 🍗', bodyEn: 'Order hot food in the app and pick it up at the counter, no waiting in line.', titleEs: '¿Tienes hambre? Pide antes 🍗', bodyEs: 'Pide comida caliente en la app y recógela en el mostrador, sin hacer fila.' },
      checkIn: { titleEn: 'Free points every day 📅', bodyEn: 'Open the app once a day and tap Check in on Home for bonus points.', titleEs: 'Puntos gratis cada día 📅', bodyEs: 'Abre la app una vez al día y toca Registrarme en Inicio para ganar puntos extra.' },
      invite: { titleEn: 'Share the luck 🎁', bodyEn: 'Invite a friend from the app. When they make their first purchase, you both get points.', titleEs: 'Comparte la suerte 🎁', bodyEs: 'Invita a un amigo desde la app. Cuando haga su primera compra, los dos ganan puntos.' },
      tier: { titleEn: 'See what you unlock next ⭐', bodyEn: 'Your tier grows as you shop. Open Rewards to see your perks and how close the next level is.', titleEs: 'Mira lo que desbloqueas ⭐', bodyEs: 'Tu nivel sube con tus compras. Abre Recompensas para ver tus beneficios y cuánto te falta para el siguiente.' },
    },
  },
  tierUp: { enabled: false },
  birthday: {
    enabled: false, bonusPts: 25, needBoughtDays: 180, monthlyBudgetPts: 5000,
    gift: { titleEn: 'Happy birthday, {name}! 🎂', bodyEn: 'A little gift from Lucky Stop: {pts} points are in your account. Have a great day!', titleEs: '¡Feliz cumpleaños, {name}! 🎂', bodyEs: 'Un pequeño regalo de Lucky Stop: {pts} puntos ya están en tu cuenta. ¡Que tengas un gran día!' },
    greeting: { titleEn: 'Happy birthday, {name}! 🎂', bodyEn: 'Everyone at Lucky Stop wishes you a great day.', titleEs: '¡Feliz cumpleaños, {name}! 🎂', bodyEs: 'Todo el equipo de Lucky Stop te desea un gran día.' },
  },
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
/** A line of text: trimmed, spaces squeezed, cut to `max` characters (whole emoji, never half of one); empty keeps the default. */
const text = (v: unknown, max: number, def: string) => {
  const t = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  return t ? Array.from(t).slice(0, max).join('') : def;
};
const dayKey = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

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

  // welcome series: always three steps, in order and at least a day apart (step 1 on day 1 to 28, step 2 on 2 to 29, step 3 on 3 to 30)
  const we = isObj(s.welcome) ? s.welcome : {};
  const rawSteps = Array.isArray(we.steps) ? we.steps : [];
  const steps: WelcomeStep[] = d.welcome.steps.map((def, i) => {
    const r = isObj(rawSteps[i]) ? rawSteps[i] : {};
    return { day: int(r.day, { min: L.welcomeDay.min + i, max: L.welcomeDay.max - (d.welcome.steps.length - 1 - i) }, def.day), enabled: bool(r.enabled, def.enabled) };
  });
  for (let i = 1; i < steps.length; i++) if (steps[i].day <= steps[i - 1].day) steps[i].day = steps[i - 1].day + 1;
  const wt = isObj(we.texts) ? we.texts : {};
  const texts = Object.fromEntries(WELCOME_KEYS.map((k) => {
    const r = isObj(wt[k]) ? wt[k] : {}, def = d.welcome.texts[k];
    return [k, { titleEn: text(r.titleEn, L.welcomeTitle, def.titleEn), bodyEn: text(r.bodyEn, L.welcomeBody, def.bodyEn), titleEs: text(r.titleEs, L.welcomeTitle, def.titleEs), bodyEs: text(r.bodyEs, L.welcomeBody, def.bodyEs) }];
  })) as Record<WelcomeKey, WelcomeText>;

  const bd2 = isObj(s.birthday) ? s.birthday : {};
  const pushText = (v: unknown, def: PushText): PushText => {
    const r = isObj(v) ? v : {};
    return { titleEn: text(r.titleEn, L.pushTitle, def.titleEn), bodyEn: text(r.bodyEn, L.pushBody, def.bodyEn), titleEs: text(r.titleEs, L.pushTitle, def.titleEs), bodyEs: text(r.bodyEs, L.pushBody, def.bodyEs) };
  };

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
    welcome: { enabled: bool(we.enabled, false), since: dayKey(we.since), steps, texts },
    tierUp: { enabled: bool(isObj(s.tierUp) ? s.tierUp.enabled : false, false) },
    birthday: {
      enabled: bool(bd2.enabled, false), bonusPts: int(bd2.bonusPts, L.birthdayPts, d.birthday.bonusPts), needBoughtDays: int(bd2.needBoughtDays, L.birthdayBoughtDays, d.birthday.needBoughtDays),
      monthlyBudgetPts: int(bd2.monthlyBudgetPts, L.birthdayBudget, d.birthday.monthlyBudgetPts), gift: pushText(bd2.gift, d.birthday.gift), greeting: pushText(bd2.greeting, d.birthday.greeting),
    },
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
    birthday: c.birthday.enabled,
    tierUp: c.tierUp.enabled,
  };
}
