// HQ's settings (2026-10-12, admin Settings): the rules that used to be fixed numbers in the code (hot food times and limits, when a sale is
// held for review, receipt scanning limits, offer timing, staff check-in), chain-wide feature switches, and the business contact details
// the app shows. Each rule has its default (the number it always was, so nothing changes until HQ changes it), its range and its words.
//
// The values are kept in memory and read without waiting (rule(), feature(), business()): loaded when the server starts, refreshed every
// 30 seconds (another server instance's change arrives within that), and at once on this instance when HQ saves.
import prisma from '../config/prisma';

export type RuleGroup = 'hotFood' | 'review' | 'receipts' | 'offers' | 'staff';
export interface RuleMeta { group: RuleGroup; label: string; help: string; unit: string; def: number; min: number; max: number; int: boolean }

export const RULES = {
  hotFoodAutoCancelMinutes: { group: 'hotFood', label: 'Cancel an order nobody accepts after', unit: 'minutes', def: 20, min: 5, max: 120, int: true, help: 'The customer is told it was cancelled; points paid for it go back.' },
  hotFoodEscalateMinutes: { group: 'hotFood', label: 'Tell the managers when an order has waited', unit: 'minutes', def: 5, min: 1, max: 60, int: true, help: 'The store\'s managers and everyone there hear once. Must be less than the cancel time.' },
  hotFoodReadyRemindMinutes: { group: 'hotFood', label: 'Remind the customer to pick up a ready order after', unit: 'minutes', def: 15, min: 5, max: 240, int: true, help: 'Once per order.' },
  hotFoodMaxOpenOrders: { group: 'hotFood', label: 'Open orders one customer can have', unit: 'orders', def: 3, min: 1, max: 20, int: true, help: 'Waiting, being made or ready, at any store.' },
  hotFoodMaxPerItem: { group: 'hotFood', label: 'Most of one item in an order', unit: 'items', def: 20, min: 1, max: 99, int: true, help: 'The app stops at this number too.' },
  reviewHighAmount: { group: 'review', label: 'Hold a sale (not gas) over', unit: '$', def: 500, min: 50, max: 5000, int: false, help: 'A manager or HQ approves it before the points are added.' },
  reviewLargePurchase: { group: 'review', label: 'Only HQ can approve a sale over', unit: '$', def: 800, min: 100, max: 10000, int: false, help: 'Store managers cannot approve these.' },
  reviewMaxSale: { group: 'review', label: 'Largest sale a cashier can enter', unit: '$', def: 2000, min: 100, max: 20000, int: false, help: 'Above this the sale is refused at the register.' },
  reviewCustomerSalesPerDay: { group: 'review', label: 'Hold a customer\'s sale once they have this many at one store in a day', unit: 'sales', def: 4, min: 2, max: 50, int: true, help: 'Catches the same customer being scanned again and again.' },
  reviewCashierGrantsPerHour: { group: 'review', label: 'Hold a cashier\'s sale once they have granted this many in an hour', unit: 'sales', def: 15, min: 3, max: 200, int: true, help: 'Busy stores may need a higher number.' },
  reviewPendingExpiryHours: { group: 'review', label: 'A sale with no receipt photo expires after', unit: 'hours', def: 24, min: 1, max: 168, int: true, help: 'It is rejected and nothing is credited.' },
  receiptScansPerDay: { group: 'receipts', label: 'Receipts one customer can scan a day', unit: 'receipts', def: 3, min: 1, max: 20, int: true, help: 'Failed reads count up to 8 tries a day.' },
  receiptMaxDays: { group: 'receipts', label: 'How old a scanned receipt can be', unit: 'days', def: 3, min: 0, max: 14, int: true, help: '0 means today only.' },
  receiptMaxTotal: { group: 'receipts', label: 'Largest receipt total that can be scanned', unit: '$', def: 2000, min: 50, max: 20000, int: false, help: 'Bigger receipts are refused; the cashier can grant them.' },
  receiptAutoApproveMax: { group: 'receipts', label: 'Approve a clean scan at once when its total is up to', unit: '$', def: 30, min: 0, max: 500, int: false, help: 'Clean: store, date, time and receipt number read, the lines add up, nothing odd. Anything else waits for a manager. 0 holds every scan.' },
  receiptSpotCheckPercent: { group: 'receipts', label: 'Still hold this share of clean scans at random', unit: 'percent', def: 10, min: 0, max: 100, int: true, help: 'A spot check a manager approves, so nobody can count on never being looked at.' },
  receiptAutoMinAccountDays: { group: 'receipts', label: 'Approve at once only for accounts at least this old', unit: 'days', def: 7, min: 0, max: 90, int: true, help: "Scans from a brand new account wait for a manager." },
  receiptAutoPerWeek: { group: 'receipts', label: 'Scans one customer can have approved at once in a week', unit: 'scans', def: 3, min: 0, max: 20, int: true, help: 'More than this in 7 days waits for a manager.' },
  offerLastDayHour: { group: 'offers', label: 'Send the "last day" reminder at', unit: 'o\'clock', def: 10, min: 6, max: 20, int: true, help: 'Store time, 24-hour clock (10 = 10 AM, 14 = 2 PM).' },
  offerLapsedDays: { group: 'offers', label: 'A customer counts as "away" after', unit: 'days', def: 30, min: 7, max: 365, int: true, help: 'For win-back promotions that do not set their own days.' },
  offerNewDays: { group: 'offers', label: 'A customer counts as "new" for', unit: 'days', def: 14, min: 1, max: 90, int: true, help: 'For new-customer promotions that do not set their own days.' },
  staffEarlyMinutes: { group: 'staff', label: 'A shift counts from this many minutes before it starts', unit: 'minutes', def: 30, min: 0, max: 120, int: true, help: 'For check-ins and who hears about hot food orders.' },
  staffAtStoreFeet: { group: 'staff', label: 'A phone counts as "at the store" within', unit: 'feet', def: 800, min: 200, max: 3000, int: true, help: 'Read by the app from version 1.3.4.' },
} satisfies Record<string, RuleMeta>;
export type RuleKey = keyof typeof RULES;

export const FEATURES = {
  hotFoodOrdering: { label: 'Hot food ordering', help: 'Off: the app shows no hot food and the server takes no orders. Orders already placed carry on.' },
  hotFoodPayWithPoints: { label: 'Pay for hot food with points', help: 'Off: orders are paid at the counter only.' },
  hotFoodCombos: { label: 'Hot food combos', help: 'Off: no combo deals in the app; the combos are kept.' },
  challenges: { label: 'Challenges', help: 'Off: customers do not see challenges and no challenge rewards are paid.' },
} as const;
export type FeatureKey = keyof typeof FEATURES;

export interface BusinessInfo { supportPhone: string; supportEmail: string; supportHours: string }

export const RULES_KEY = 'APP_RULES';
export const FEATURES_KEY = 'APP_FEATURES';
export const BUSINESS_KEY = 'BUSINESS_INFO';

const defaults = () => Object.fromEntries(Object.entries(RULES).map(([k, m]) => [k, m.def])) as Record<RuleKey, number>;
let rules: Record<RuleKey, number> = defaults();
let features: Record<FeatureKey, boolean> = { hotFoodOrdering: true, hotFoodPayWithPoints: true, hotFoodCombos: true, challenges: true };
let businessInfo: BusinessInfo = { supportPhone: '', supportEmail: '', supportHours: '' };

/** A rule's value now (its default until HQ changes it). */
export const rule = (k: RuleKey): number => rules[k];
/** Whether a feature is on now (on until HQ switches it off). */
export const feature = (k: FeatureKey): boolean => features[k];
export const business = (): BusinessInfo => businessInfo;
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
  const out = { hotFoodOrdering: true, hotFoodPayWithPoints: true, hotFoodCombos: true, challenges: true };
  if (stored && typeof stored === 'object') for (const k of Object.keys(out) as FeatureKey[]) if (typeof (stored as any)[k] === 'boolean') out[k] = (stored as any)[k];
  return out;
}
export function cleanBusiness(stored: unknown): BusinessInfo {
  const s = (stored ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  return { supportPhone: str(s.supportPhone, 30), supportEmail: str(s.supportEmail, 120), supportHours: str(s.supportHours, 120) };
}

const parse = (v: string | undefined) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };

/** Reads all three from the database. A failure keeps what was there (the server runs on the last known values). */
export async function refreshSettings(): Promise<void> {
  try {
    const rows = await prisma.appConfig.findMany({ where: { key: { in: [RULES_KEY, FEATURES_KEY, BUSINESS_KEY] } } });
    const by = new Map(rows.map((r: { key: string; value: string }) => [r.key, r.value]));
    rules = cleanRules(parse(by.get(RULES_KEY)));
    features = cleanFeatures(parse(by.get(FEATURES_KEY)));
    businessInfo = cleanBusiness(parse(by.get(BUSINESS_KEY)));
  } catch (e: any) {
    console.error('[settings] could not load, keeping the last values:', e?.message ?? e);
  }
}

/** Saved by the settings controller: this instance uses the new values at once. */
export function applySettings(next: { rules?: Record<RuleKey, number>; features?: Record<FeatureKey, boolean>; business?: BusinessInfo }) {
  if (next.rules) rules = next.rules;
  if (next.features) features = next.features;
  if (next.business) businessInfo = next.business;
}

export function startSettingsRefresh() {
  refreshSettings();
  const t = setInterval(() => { refreshSettings(); }, 30_000);
  t.unref?.();
  console.log('[settings] HQ settings are read now and every 30 seconds');
}

/** For tests: set values directly, or put the defaults back. */
export function setSettingsForTest(next: { rules?: Partial<Record<RuleKey, number>>; features?: Partial<Record<FeatureKey, boolean>>; business?: Partial<BusinessInfo> } | null) {
  if (next === null) { rules = defaults(); features = cleanFeatures(null); businessInfo = cleanBusiness(null); return; }
  if (next.rules) rules = { ...rules, ...next.rules };
  if (next.features) features = { ...features, ...next.features };
  if (next.business) businessInfo = { ...businessInfo, ...next.business };
}
