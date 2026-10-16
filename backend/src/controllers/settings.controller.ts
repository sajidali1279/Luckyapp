// HQ settings (2026-10-12, admin Settings): the rules, the feature switches, the business details, and the history of every settings change.
// The app reads what it needs from GET /settings/app. The values themselves live in utils/appSettings.ts.
import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import {
  RULES, FEATURES, RULES_KEY, FEATURES_KEY, BUSINESS_KEY, allRules, allFeatures, business, cleanRules, cleanFeatures, cleanBusiness, applySettings,
  rule, feature, type RuleKey, type RuleMeta, type FeatureKey,
} from '../utils/appSettings';

const save = (key: string, value: unknown) =>
  prisma.appConfig.upsert({ where: { key }, create: { key, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
const words = (k: RuleKey, v: number) => {
  const m = RULES[k] as RuleMeta;
  return m.unit === '$' ? `$${v.toFixed(2)}` : `${v} ${v === 1 && m.unit.endsWith('s') ? m.unit.slice(0, -1) : m.unit}`;   // 1 minute, 2 minutes
};

/** GET /settings (HQ): every rule with its words, range and value, the switches and the business details. */
export async function getSettings(_req: AuthRequest, res: Response) {
  const values = allRules();
  res.json({ success: true, data: {
    rules: (Object.entries(RULES) as [RuleKey, RuleMeta][]).map(([key, m]) => ({ key, ...m, value: values[key] })),
    features: (Object.entries(FEATURES) as [FeatureKey, { label: string; help: string }][]).map(([key, m]) => ({ key, ...m, on: allFeatures()[key] })),
    business: business(),
  } });
}

/** PUT /settings/rules (HQ) { values: { key: number } }: only the rules sent change; each is checked against its range. */
export async function putRules(req: AuthRequest, res: Response) {
  const sent = (req.body?.values ?? null) as Record<string, unknown> | null;
  if (!sent || typeof sent !== 'object' || Array.isArray(sent)) { res.status(400).json({ success: false, error: 'Send the values to change.' }); return; }
  const before = allRules();
  const next = { ...before };
  for (const [k, v] of Object.entries(sent)) {
    const m = (RULES as Record<string, RuleMeta>)[k];
    if (!m) { res.status(400).json({ success: false, error: `There is no setting called "${k}".` }); return; }
    const n = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(n)) { res.status(400).json({ success: false, error: `"${m.label}" must be a number.` }); return; }
    if (m.int && !Number.isInteger(n)) { res.status(400).json({ success: false, error: `"${m.label}" must be a whole number.` }); return; }
    if (n < m.min || n > m.max) {
      const range = m.unit === '$' ? `$${m.min} to $${m.max}` : `${m.min} to ${m.max} ${m.unit}`;
      res.status(400).json({ success: false, error: `"${m.label}" must be from ${range}.` });
      return;
    }
    next[k as RuleKey] = m.int ? n : Math.round(n * 100) / 100;
  }
  // The rules that depend on each other
  if (next.hotFoodEscalateMinutes >= next.hotFoodAutoCancelMinutes) {
    res.status(400).json({ success: false, error: 'Managers must be told before the order cancels: make the manager time less than the cancel time.' }); return;
  }
  if (next.hotFoodReadyCloseMinutes <= next.hotFoodReadyRemindMinutes) {
    res.status(400).json({ success: false, error: 'The customer must be reminded before a ready order is closed: make the close time more than the reminder time.' }); return;
  }
  if (next.reviewLargePurchase < next.reviewHighAmount) {
    res.status(400).json({ success: false, error: 'The HQ-only amount cannot be below the hold amount.' }); return;
  }
  if (next.reviewMaxSale < next.reviewLargePurchase) {
    res.status(400).json({ success: false, error: 'The largest sale a cashier can enter cannot be below the HQ-only amount.' }); return;
  }
  const changed = (Object.keys(next) as RuleKey[]).filter((k) => next[k] !== before[k]);
  if (changed.length === 0) { res.json({ success: true, data: next, changed: false }); return; }
  const clean = cleanRules(next);
  await save(RULES_KEY, clean);
  applySettings({ rules: clean });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_RULES_UPDATE', entity: 'app_config', entityId: RULES_KEY,
    details: { summary: changed.map((k) => `${(RULES[k] as RuleMeta).label}: ${words(k, before[k])} to ${words(k, clean[k])}`).join('; '), keys: changed }, storeId: null });
  res.json({ success: true, data: clean, changed: true });
}

/** PUT /settings/features (HQ) { features: { key: boolean } } */
export async function putFeatures(req: AuthRequest, res: Response) {
  const sent = (req.body?.features ?? null) as Record<string, unknown> | null;
  if (!sent || typeof sent !== 'object') { res.status(400).json({ success: false, error: 'Send the switches to change.' }); return; }
  const before = allFeatures();
  const next = { ...before };
  for (const [k, v] of Object.entries(sent)) {
    if (!(k in FEATURES)) { res.status(400).json({ success: false, error: `There is no switch called "${k}".` }); return; }
    if (typeof v !== 'boolean') { res.status(400).json({ success: false, error: 'A switch is on or off.' }); return; }
    next[k as FeatureKey] = v;
  }
  const changed = (Object.keys(next) as FeatureKey[]).filter((k) => next[k] !== before[k]);
  if (changed.length === 0) { res.json({ success: true, data: next, changed: false }); return; }
  const clean = cleanFeatures(next);
  await save(FEATURES_KEY, clean);
  applySettings({ features: clean });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_FEATURES_UPDATE', entity: 'app_config', entityId: FEATURES_KEY,
    details: { summary: changed.map((k) => `${FEATURES[k].label}: ${clean[k] ? 'on' : 'off'}`).join('; '), keys: changed }, storeId: null });
  res.json({ success: true, data: clean, changed: true });
}

/** PUT /settings/business (HQ) { supportPhone, supportEmail, supportHours }: what the app's Help screen shows. Empty hides a line. */
export async function putBusiness(req: AuthRequest, res: Response) {
  const next = cleanBusiness(req.body);
  const digits = next.supportPhone.replace(/\D/g, '');
  if (next.supportPhone && !(digits.length === 10 || (digits.length === 11 && digits.startsWith('1')))) {
    res.status(400).json({ success: false, error: 'The support phone must be a 10-digit US number.' }); return;
  }
  if (next.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.supportEmail)) {
    res.status(400).json({ success: false, error: 'The support email does not look like an email address.' }); return;
  }
  const before = business();
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== before[k]);
  if (changed.length === 0) { res.json({ success: true, data: next, changed: false }); return; }
  await save(BUSINESS_KEY, next);
  applySettings({ business: next });
  const label = { supportPhone: 'Support phone', supportEmail: 'Support email', supportHours: 'Support hours' };
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_BUSINESS_UPDATE', entity: 'app_config', entityId: BUSINESS_KEY,
    details: { summary: changed.map((k) => `${label[k]}: ${next[k] || '(none)'}`).join('; '), keys: changed }, storeId: null });
  res.json({ success: true, data: next, changed: true });
}

/** Every settings change HQ or the Dev Admin made, wherever it was made, and which Settings tab it belongs to. */
export const SETTINGS_ACTIONS: Record<string, string> = {
  SETTINGS_RULES_UPDATE: 'Rules', SETTINGS_FEATURES_UPDATE: 'Features', SETTINGS_BUSINESS_UPDATE: 'Business details',
  RECEIPT_SCAN_SETTINGS: 'Receipt scanning', REFERRAL_SETTINGS_UPDATE: 'Refer a friend', DEAL_LIMITS: 'Deal limits',
  APP_VERSIONS_UPDATE: 'App updates', PROMOTION_SETTINGS: 'Featured ads', DEV_CUT_RATE_UPDATE: 'Default fee',
  RATE_TIER_UPDATE: 'Cashback rates', RATE_CATEGORY_UPDATE: 'Cashback rates',
};

/** GET /settings/history (HQ): the latest settings changes, newest first. */
export async function getSettingsHistory(req: AuthRequest, res: Response) {
  const take = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
  const rows = await prisma.auditLog.findMany({
    where: { action: { in: Object.keys(SETTINGS_ACTIONS) } },
    orderBy: { createdAt: 'desc' }, take,
    select: { id: true, action: true, actorName: true, actorRole: true, details: true, createdAt: true },
  });
  res.json({ success: true, data: rows.map((r) => {
    let summary = '';
    let keys: string[] = [];
    try {
      const d = r.details ? JSON.parse(r.details) : null;
      summary = typeof d?.summary === 'string' ? d.summary : '';
      keys = Array.isArray(d?.keys) ? d.keys.filter((k: unknown) => typeof k === 'string') : [];
    } catch { /* old rows */ }
    return { id: r.id, area: SETTINGS_ACTIONS[r.action] ?? r.action, action: r.action, by: r.actorName ?? r.actorRole, at: r.createdAt, summary, keys };
  }) });
}

/** GET /settings/app (anyone signed in): what the app needs to know. */
export async function getAppSettings(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: {
    features: allFeatures(),
    business: business(),
    limits: {
      hotFoodMaxPerItem: rule('hotFoodMaxPerItem'), receiptScansPerDay: rule('receiptScansPerDay'), receiptMaxDays: rule('receiptMaxDays'),
      staffAtStoreFeet: rule('staffAtStoreFeet'),
    },
    payWithPoints: feature('hotFoodPayWithPoints'),
  } });
}
