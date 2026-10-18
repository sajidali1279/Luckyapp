// HQ's settings (2026-10-12, admin Settings): the rules that used to be fixed numbers in the code (hot food times and limits, when a sale is
// held for review, receipt scanning limits, offer timing, staff check-in), chain-wide feature switches, and the business contact details
// the app shows. Each rule has its default (the number it always was, so nothing changes until HQ changes it), its range and its words.
//
// The values are kept in memory and read without waiting (rule(), feature(), business()): loaded when the server starts, refreshed every
// 30 seconds (another server instance's change arrives within that), and at once on this instance when HQ saves.
import prisma from '../config/prisma';

export type RuleGroup = 'hotFood' | 'review' | 'receipts' | 'offers' | 'perks' | 'care' | 'staff';
/** section: a heading inside the group's card on the Settings page, for a long group (2026-10-17) */
export interface RuleMeta { group: RuleGroup; label: string; help: string; unit: string; def: number; min: number; max: number; int: boolean; section?: string }

export const RULES = {
  hotFoodAutoCancelMinutes: { group: 'hotFood', label: 'Cancel an order nobody accepts after', unit: 'minutes', def: 20, min: 5, max: 120, int: true, help: 'The customer is told it was cancelled; points paid for it go back.' },
  hotFoodEscalateMinutes: { group: 'hotFood', label: 'Tell the managers when an order has waited', unit: 'minutes', def: 5, min: 1, max: 60, int: true, help: 'The store\'s managers and everyone there hear once. Must be less than the cancel time.' },
  hotFoodReadyRemindMinutes: { group: 'hotFood', label: 'Remind the customer to pick up a ready order after', unit: 'minutes', def: 15, min: 5, max: 240, int: true, help: 'Once per order.' },
  // 2026-10-16: a ready order nobody picks up was open until staff cancelled it by hand
  hotFoodReadyCloseMinutes: { group: 'hotFood', label: 'Close a ready order nobody picks up after', unit: 'minutes', def: 120, min: 30, max: 720, int: true, help: 'From when it was marked ready. The customer and the store are told. Must be more than the reminder.' },
  hotFoodMaxOpenOrders: { group: 'hotFood', label: 'Open orders one customer can have', unit: 'orders', def: 3, min: 1, max: 20, int: true, help: 'Waiting, being made or ready, at any store.' },
  hotFoodMaxPerItem: { group: 'hotFood', label: 'Most of one item in an order', unit: 'items', def: 20, min: 1, max: 99, int: true, help: 'The app stops at this number too.' },
  reviewHighAmount: { group: 'review', section: 'Amounts', label: 'Hold a sale (not gas) over', unit: '$', def: 500, min: 50, max: 5000, int: false, help: 'A manager or HQ approves it before the points are added.' },
  reviewLargePurchase: { group: 'review', section: 'Amounts', label: 'Only HQ can approve a sale over', unit: '$', def: 800, min: 100, max: 10000, int: false, help: 'Store managers cannot approve these.' },
  reviewMaxSale: { group: 'review', section: 'Amounts', label: 'Largest sale a cashier can enter', unit: '$', def: 2000, min: 100, max: 20000, int: false, help: 'Above this the sale is refused at the register.' },
  reviewCustomerSalesPerDay: { group: 'review', section: 'How often', label: 'Hold a customer\'s sale once they have this many at one store in a day', unit: 'sales', def: 4, min: 2, max: 50, int: true, help: 'Catches the same customer being scanned again and again.' },
  reviewCashierGrantsPerHour: { group: 'review', section: 'How often', label: 'Hold a cashier\'s sale once they have granted this many in an hour', unit: 'sales', def: 15, min: 3, max: 200, int: true, help: 'Busy stores may need a higher number.' },
  // 2026-10-17: it was a fixed $500 in utils/adminEmail.ts, so lowering the hold amount still emailed only from $500
  reviewEmailHQAmount: { group: 'review', section: 'Amounts', label: 'Also email HQ about a held sale of at least', unit: '$', def: 500, min: 50, max: 20000, int: false, help: 'Held sales below this are only shown here and in the app.' },
  // A sale the cashier never finished (Grant pressed, no receipt photo) is cancelled after this (2026-10-18; was 24 hours, rejected)
  // A receipt the customer left behind, added to their sale from the cashier's Recent tab after they had gone (2026-10-18)
  addOnWindowMinutes: { group: 'review', section: 'Customer left a receipt', label: 'A receipt can be added to a customer\'s sale for', unit: 'minutes', def: 60, min: 10, max: 240, int: true, help: 'From the cashier\'s Recent tab, after the customer has gone. Only the cashier who served them, at that store.' },
  addOnsPerDay: { group: 'review', section: 'Customer left a receipt', label: 'Receipts one cashier can add this way a day', unit: 'receipts', def: 3, min: 0, max: 20, int: true, help: '0 switches it off. A new receipt photo is always required, and the customer is told.' },
  addOnHoldAmount: { group: 'review', section: 'Customer left a receipt', label: 'An added receipt waits for a manager from', unit: '$', def: 50, min: 0, max: 2000, int: false, help: 'Below this it is credited at once. 0 holds every one.' },
  reviewUnfinishedMinutes: { group: 'review', section: 'Receipt photo', label: 'A sale with no receipt photo is cancelled after', unit: 'minutes', def: 30, min: 10, max: 1440, int: true, help: 'Nothing was credited, so nothing is taken back and nobody is told. Until the photo arrives, the sale is not shown to HQ, the managers or the customer.' },
  receiptScansPerDay: { group: 'receipts', section: 'Limits', label: 'Receipts one customer can scan a day', unit: 'receipts', def: 3, min: 1, max: 20, int: true, help: 'Failed reads count up to 8 tries a day.' },
  receiptMaxDays: { group: 'receipts', section: 'Limits', label: 'How old a scanned receipt can be', unit: 'days', def: 3, min: 0, max: 14, int: true, help: '0 means today only.' },
  receiptMaxTotal: { group: 'receipts', section: 'Limits', label: 'Largest receipt total that can be scanned', unit: '$', def: 2000, min: 50, max: 20000, int: false, help: 'Bigger receipts are refused; the cashier can grant them.' },
  receiptAutoApproveMax: { group: 'receipts', section: 'Approved at once', label: 'Approve a clean scan at once when its total is up to', unit: '$', def: 30, min: 0, max: 500, int: false, help: 'Clean: store, date, time and receipt number read, the lines add up, nothing odd. Anything else waits for a manager. 0 holds every scan.' },
  receiptSpotCheckPercent: { group: 'receipts', section: 'Approved at once', label: 'Still hold this share of clean scans at random', unit: 'percent', def: 10, min: 0, max: 100, int: true, help: 'A spot check a manager approves, so nobody can count on never being looked at.' },
  receiptAutoMinAccountDays: { group: 'receipts', section: 'Approved at once', label: 'Approve at once only for accounts at least this old', unit: 'days', def: 7, min: 0, max: 90, int: true, help: "Scans from a brand new account wait for a manager." },
  receiptMaxCards30d: { group: 'receipts', section: 'Cards and cash', label: "Different cards on one customer's receipts in 30 days before their scans are held", unit: 'cards', def: 3, min: 1, max: 10, int: true, help: 'Cards proven at the register do not count. Someone scanning receipts picked up off the floor shows many cards.' },
  receiptOneTimeCards: { group: 'receipts', section: 'Cards and cash', label: 'Hold a new card once a customer has this many cards seen only once (90 days)', unit: 'cards', def: 2, min: 1, max: 10, int: true, help: 'A real customer pays with the same card again and again. A new card is otherwise approved; every card is counted.' },
  receiptCashPerWeek: { group: 'receipts', section: 'Cards and cash', label: 'Cash receipts one customer can scan a week', unit: 'receipts', def: 3, min: 0, max: 20, int: true, help: 'Receipts with no card on them. They are never approved at once. 0 means only card receipts can be scanned.' },
  receiptRejectHoldDays: { group: 'receipts', section: 'Cards and cash', label: 'After a rejected scan, hold every scan from that customer for', unit: 'days', def: 60, min: 0, max: 365, int: true, help: '0 turns this off.' },
  receiptAutoPerWeek: { group: 'receipts', section: 'Approved at once', label: 'Scans one customer can have approved at once in a week', unit: 'scans', def: 3, min: 0, max: 20, int: true, help: 'More than this in 7 days waits for a manager.' },
  offerLastDayHour: { group: 'offers', label: 'Send the "last day" reminder at', unit: 'o\'clock', def: 10, min: 6, max: 20, int: true, help: 'Store time, 24-hour clock (10 = 10 AM, 14 = 2 PM).' },
  offerLapsedDays: { group: 'offers', label: 'A customer counts as "away" after', unit: 'days', def: 30, min: 7, max: 365, int: true, help: 'For win-back promotions that do not set their own days.' },
  offerNewDays: { group: 'offers', label: 'A customer counts as "new" for', unit: 'days', def: 14, min: 1, max: 90, int: true, help: 'For new-customer promotions that do not set their own days.' },
  // 2026-10-17: what were fixed numbers in the code (points.controller, tier.ts, catalog, referrals, audience, auth, disputes, product requests, price reminders)
  // 2026-10-18: it was a fixed 30 in utils/shelfDeals.ts, and the Offers page said every label deal was "showing"
  shelfDealsPerStore: { group: 'offers', label: "Label deals a store's customers see in Today's Deals", unit: 'deals', def: 30, min: 0, max: 100, int: true, help: 'From the labels the store carries, the most recently changed first. Deals posted on the Offers page always show. 0: no label deals.' },
  audienceRecentMonths: { group: 'offers', label: "A store's customers are those who bought there in the last", unit: 'months', def: 6, min: 1, max: 24, int: true, help: "For pushes and promotion announcements sent to one store's customers." },
  refillSilverPerPeriod: { group: 'perks', section: 'Free refills', label: 'Free fountain refills a Silver member gets each half-year', unit: 'refills', def: 7, min: 0, max: 60, int: true, help: 'Their own cup, any day. 0 turns the Silver refill off. The app shows this number.' },
  refillDailyPerDay: { group: 'perks', section: 'Free refills', label: 'Free fountain refills a day for Gold, Diamond and Platinum', unit: 'refills', def: 1, min: 0, max: 5, int: true, help: '0 turns the daily refill off. The app shows this number.' },
  gasBonusGoldCents: { group: 'perks', section: 'Gas bonus', label: 'Gold: extra cashback per gallon of gas', unit: 'cents', def: 5, min: 0, max: 50, int: true, help: 'Earned on gas when the cashier scans the QR (or a receipt is scanned). Not a pump price discount.' },
  gasBonusDiamondCents: { group: 'perks', section: 'Gas bonus', label: 'Diamond: extra cashback per gallon of gas', unit: 'cents', def: 7, min: 0, max: 50, int: true, help: 'The tier cards in the app show this number.' },
  gasBonusPlatinumCents: { group: 'perks', section: 'Gas bonus', label: 'Platinum: extra cashback per gallon of gas', unit: 'cents', def: 10, min: 0, max: 50, int: true, help: 'The printed posters say +5¢, +7¢ and +10¢.' },
  rewardHoldMinutes: { group: 'perks', section: 'Rewards', label: 'A reward code from the app is good for', unit: 'minutes', def: 30, min: 10, max: 240, int: true, help: 'After this the reward is released and the points go back. The app shows this time.' },
  referralLateDays: { group: 'perks', section: 'Refer a friend', label: "A new customer can still add a friend's invite code for", unit: 'days', def: 7, min: 0, max: 60, int: true, help: 'Counted from signing up, and only before their first purchase is approved. 0: only while signing up.' },
  goodwillCreditMax: { group: 'care', section: 'Credits', label: 'Largest goodwill credit HQ can give a customer at once', unit: '$', def: 25, min: 5, max: 500, int: false, help: 'From a customer\'s profile, with a reason. For a missed purchase, use a missing-points report.' },
  disputeCreditMax: { group: 'care', section: 'Credits', label: 'Largest credit for one missing-points report', unit: '$', def: 50, min: 10, max: 1000, int: false, help: 'What a manager or HQ can approve on one report.' },
  disputeMaxDays: { group: 'care', section: 'Reports and requests', label: 'A customer can report a problem with a sale for', unit: 'days', def: 60, min: 7, max: 365, int: true, help: 'Counted from the sale. The terms of service say 60 days.' },
  productRequestDays: { group: 'care', section: 'Reports and requests', label: 'A product request stays open for', unit: 'days', def: 7, min: 1, max: 60, int: true, help: 'Then it closes if the store has not answered. The app shows this number.' },
  staffEarlyMinutes: { group: 'staff', section: 'Check-in', label: 'A shift counts from this many minutes before it starts', unit: 'minutes', def: 30, min: 0, max: 120, int: true, help: 'For check-ins and who hears about hot food orders.' },
  staffAtStoreFeet: { group: 'staff', section: 'Check-in', label: 'A phone counts as "at the store" within', unit: 'feet', def: 800, min: 200, max: 3000, int: true, help: 'Read by the app from version 1.3.4.' },
  priceStaleDays: { group: 'staff', section: 'Gas prices', label: 'Remind the managers when a gas or diesel price is older than', unit: 'days', def: 2, min: 1, max: 14, int: true, help: 'Sent at 9 AM. The Stores page marks the price as out of date after the same time (it was 3 days there, 2 for the reminder).' },
} satisfies Record<string, RuleMeta>;
export type RuleKey = keyof typeof RULES;

export const FEATURES = {
  hotFoodOrdering: { label: 'Hot food ordering', help: 'Off: the app shows no hot food and the server takes no orders. Orders already placed carry on.' },
  hotFoodPayWithPoints: { label: 'Pay for hot food with points', help: 'Off: orders are paid at the counter only.' },
  hotFoodCombos: { label: 'Hot food combos', help: 'Off: no combo deals in the app; the combos are kept.' },
  challenges: { label: 'Challenges', help: 'Off: customers do not see challenges and no challenge rewards are paid.' },
  hotFoodNoShowPointsBack: { label: 'Points back for a hot food order not picked up', help: 'An order paid with points that nobody picks up is closed; on: its points go back to the customer; off: the store keeps them (the food was made).' },
} as const;
export type FeatureKey = keyof typeof FEATURES;
/** Every feature is on until HQ switches it off (one list, so a new one cannot be missed in one place) */
const featureDefaults = () => Object.fromEntries(Object.keys(FEATURES).map((k) => [k, true])) as Record<FeatureKey, boolean>;

export interface BusinessInfo { supportPhone: string; supportEmail: string; supportHours: string }

export const RULES_KEY = 'APP_RULES';
export const FEATURES_KEY = 'APP_FEATURES';
export const BUSINESS_KEY = 'BUSINESS_INFO';
export const WELCOME_KEY = 'WELCOME_BONUS';
export const EXPIRY_KEY = 'POINTS_EXPIRY';

// Points expiry (2026-10-17, Settings > Rewards & offers > Points expiry): off until HQ switches it on. Then every batch of points
// (utils/pointLots.ts) expires `days` after it was earned, or after `startedAt` (the day it was switched on) if that is later, so nobody
// loses points the day it starts. A push goes out `warnDays` before (0: none).
export const EXPIRY_LIMITS = { days: { min: 30, max: 730, def: 90 }, warnDays: { min: 0, max: 30, def: 7 } };
export interface ExpiryConfig { enabled: boolean; startedAt: string | null; days: number; warnDays: number }

// The joining bonus (2026-10-17, admin Settings > Joining bonus): on or off, how many days, and the free items to choose from. It was
// fixed in the code (7 days, 4 items). Items are never deleted, only switched off, so a gift already given still shows its name.
export const WELCOME_EMOJIS = ['🥤', '☕', '🥫', '🧃', '🌮', '🍕', '🌭', '🍔', '🍗', '🍩', '🍪', '🍫', '🍦', '🍿', '🎁'];
export const WELCOME_DAYS = { min: 1, max: 14, def: 7 };
export const WELCOME_MAX_ITEMS = 12;
export interface WelcomeItem { key: string; name: string; nameEs: string; emoji: string; active: boolean }
/** offSince: when HQ switched it off. Customers who joined before then keep their days; nobody who joins while it is off gets it. */
export interface WelcomeConfig { enabled: boolean; offSince: string | null; days: number; items: WelcomeItem[] }
const BUILT_IN_ITEMS: WelcomeItem[] = [
  { key: 'FOUNTAIN_DRINK', name: 'Free Fountain Drink', nameEs: 'Refresco de Fuente Gratis', emoji: '🥤', active: true },
  { key: 'COFFEE', name: 'Free Coffee', nameEs: 'Café Gratis', emoji: '☕', active: true },
  { key: 'SODA_12OZ', name: 'Free 12oz Soda', nameEs: 'Refresco de 12 oz Gratis', emoji: '🥤', active: true },
  { key: 'HOT_SNACK', name: 'Free Hot Food Snack', nameEs: 'Snack de Comida Caliente Gratis', emoji: '🌮', active: true },
];

const defaults = () => Object.fromEntries(Object.entries(RULES).map(([k, m]) => [k, m.def])) as Record<RuleKey, number>;
let rules: Record<RuleKey, number> = defaults();
let features: Record<FeatureKey, boolean> = featureDefaults();
let businessInfo: BusinessInfo = { supportPhone: '', supportEmail: '', supportHours: '' };
let welcomeConfig: WelcomeConfig = cleanWelcome(null);
let expiryConfig: ExpiryConfig = cleanExpiry(null);

/** A rule's value now (its default until HQ changes it). */
export const rule = (k: RuleKey): number => rules[k];
/** Whether a feature is on now (on until HQ switches it off). */
export const feature = (k: FeatureKey): boolean => features[k];
export const business = (): BusinessInfo => businessInfo;
/** The joining bonus settings now. */
export const welcome = (): WelcomeConfig => welcomeConfig;
/** Points expiry now (off until HQ switches it on). */
export const pointsExpiry = (): ExpiryConfig => expiryConfig;
export const allRules = () => ({ ...rules });
export const allFeatures = () => ({ ...features });

/** Only values that are known, numbers and in range are kept; anything else is the default. */
export function cleanRules(stored: unknown): Record<RuleKey, number> {
  const out = defaults();
  if (stored && typeof stored === 'object') {
    for (const [k, v] of Object.entries(stored as Record<string, unknown>)) {
      const m = (RULES as Record<string, RuleMeta>)[k];
      if (m && typeof v === 'number' && Number.isFinite(v) && v >= m.min && v <= m.max) out[k as RuleKey] = m.int ? Math.round(v) : Math.round(v * 100) / 100;
    }
  }
  return out;
}
export function cleanFeatures(stored: unknown): Record<FeatureKey, boolean> {
  const out = featureDefaults();
  if (stored && typeof stored === 'object') for (const k of Object.keys(out) as FeatureKey[]) if (typeof (stored as any)[k] === 'boolean') out[k] = (stored as any)[k];
  return out;
}
export function cleanBusiness(stored: unknown): BusinessInfo {
  const s = (stored ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return { supportPhone: str(s.supportPhone, 30), supportEmail: str(s.supportEmail, 120), supportHours: str(s.supportHours, 120) };
}

/** Only sensible values are kept: the four first items are always there (HQ can switch them off and rename them), extra items need a
 *  key, a name and an emoji from the list; anything else falls back to the default. */
export function cleanWelcome(stored: unknown): WelcomeConfig {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const enabled = typeof s.enabled === 'boolean' ? s.enabled : true;
  const offSince = !enabled && typeof s.offSince === 'string' && !Number.isNaN(Date.parse(s.offSince)) ? s.offSince : null;
  const d = typeof s.days === 'number' ? Math.round(s.days) : NaN;
  const days = d >= WELCOME_DAYS.min && d <= WELCOME_DAYS.max ? d : WELCOME_DAYS.def;
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 40) : '');
  const items: WelcomeItem[] = BUILT_IN_ITEMS.map((i) => ({ ...i }));
  for (const raw of Array.isArray(s.items) ? s.items : []) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const key = typeof r.key === 'string' && /^[A-Z0-9_]{2,24}$/.test(r.key) ? r.key : null;
    if (!key) continue;
    const name = text(r.name);
    const at = items.findIndex((i) => i.key === key);
    const base = at >= 0 ? items[at] : null;
    if (!base && (!name || items.length >= WELCOME_MAX_ITEMS)) continue;
    const item: WelcomeItem = {
      key,
      name: name || base!.name,
      nameEs: text(r.nameEs) || base?.nameEs || name,   // no Spanish name given: the English one
      emoji: typeof r.emoji === 'string' && WELCOME_EMOJIS.includes(r.emoji) ? r.emoji : base?.emoji ?? '🎁',
      active: typeof r.active === 'boolean' ? r.active : true,
    };
    if (at >= 0) items[at] = item; else items.push(item);
  }
  return { enabled, offSince, days, items };
}

/** Off unless clearly switched on with a start date; days and warning days in range, else the defaults. */
export function cleanExpiry(stored: unknown): ExpiryConfig {
  const s = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const startedAt = typeof s.startedAt === 'string' && !Number.isNaN(Date.parse(s.startedAt)) ? s.startedAt : null;
  const enabled = s.enabled === true && !!startedAt;
  const num = (v: unknown, m: { min: number; max: number; def: number }) => { const n = typeof v === 'number' ? Math.round(v) : NaN; return n >= m.min && n <= m.max ? n : m.def; };
  return { enabled, startedAt: enabled ? startedAt : null, days: num(s.days, EXPIRY_LIMITS.days), warnDays: num(s.warnDays, EXPIRY_LIMITS.warnDays) };
}

const parse = (v: string | undefined) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

/** Reads all three from the database. A failure keeps what was there (the server runs on the last known values). */
export async function refreshSettings(): Promise<void> {
  try {
    const rows = await prisma.appConfig.findMany({ where: { key: { in: [RULES_KEY, FEATURES_KEY, BUSINESS_KEY, WELCOME_KEY, EXPIRY_KEY] } } });
    const by = new Map(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
    rules = cleanRules(parse(by.get(RULES_KEY)));
    features = cleanFeatures(parse(by.get(FEATURES_KEY)));
    businessInfo = cleanBusiness(parse(by.get(BUSINESS_KEY)));
    welcomeConfig = cleanWelcome(parse(by.get(WELCOME_KEY)));
    expiryConfig = cleanExpiry(parse(by.get(EXPIRY_KEY)));
  } catch (e: any) {
    console.error('[settings] could not load, keeping the last values:', e?.message ?? e);
  }
}

/** Saved by the settings controller: this instance uses the new values at once. */
export function applySettings(next: { rules?: Record<RuleKey, number>; features?: Record<FeatureKey, boolean>; business?: BusinessInfo; welcome?: WelcomeConfig; expiry?: ExpiryConfig }) {
  if (next.rules) rules = next.rules;
  if (next.features) features = next.features;
  if (next.business) businessInfo = next.business;
  if (next.welcome) welcomeConfig = next.welcome;
  if (next.expiry) expiryConfig = next.expiry;
}

export function startSettingsRefresh() {
  refreshSettings();
  const t = setInterval(() => { refreshSettings(); }, 30_000);
  t.unref?.();
  console.log('[settings] HQ settings are read now and every 30 seconds');
}

/** For tests: set values directly, or put the defaults back. */
export function setSettingsForTest(next: { rules?: Partial<Record<RuleKey, number>>; features?: Partial<Record<FeatureKey, boolean>>; business?: Partial<BusinessInfo>; welcome?: unknown; expiry?: unknown } | null) {
  if (next === null) { rules = defaults(); features = cleanFeatures(null); businessInfo = cleanBusiness(null); welcomeConfig = cleanWelcome(null); expiryConfig = cleanExpiry(null); return; }
  if (next.welcome !== undefined) welcomeConfig = cleanWelcome(next.welcome);
  if (next.expiry !== undefined) expiryConfig = cleanExpiry(next.expiry);
  if (next.rules) rules = { ...rules, ...next.rules };
  if (next.features) features = { ...features, ...next.features };
  if (next.business) businessInfo = { ...businessInfo, ...next.business };
}
