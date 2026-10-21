// HQ settings (2026-10-12, admin Settings): the rules, the feature switches, the business details, and the history of every settings change.
// The app reads what it needs from GET /settings/app. The values themselves live in utils/appSettings.ts.
import { Request, Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { previewExpiry } from '../utils/pointLots';
import {
  RULES, FEATURES, RULES_KEY, FEATURES_KEY, BUSINESS_KEY, allRules, allFeatures, business, cleanRules, cleanFeatures, cleanBusiness, applySettings,
  WELCOME_KEY, WELCOME_EMOJIS, WELCOME_DAYS, WELCOME_MAX_ITEMS, WELCOME_MAX_SPEND, welcome, cleanWelcome, type WelcomeItem, type WelcomeStoreRule,
  EXPIRY_KEY, EXPIRY_LIMITS, pointsExpiry, cleanExpiry,
  THEME_KEY, THEME_PRESETS, themeSetting, activeTheme, cleanTheme,
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
    theme: { ...themeSetting(), presets: THEME_PRESETS, active: activeTheme() },
    welcome: { ...welcome(), emojis: WELCOME_EMOJIS, minDays: WELCOME_DAYS.min, maxDays: WELCOME_DAYS.max, maxItems: WELCOME_MAX_ITEMS, maxSpend: WELCOME_MAX_SPEND },
    expiry: { ...pointsExpiry(), limits: EXPIRY_LIMITS },
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

/** GET /app/theme (no sign-in, like the version check): what the phones show today. Nothing private in it. */
export async function getAppTheme(_req: Request, res: Response) {
  res.json({ success: true, data: activeTheme() });
}

/** PUT /settings/theme (HQ) { preset: 'NONE' | 'HALLOWEEN', startsOn?, endsOn?, intro?, background? }: the app's seasonal theme. */
export async function putTheme(req: AuthRequest, res: Response) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const before = themeSetting();
  const preset = b.preset === undefined ? before.preset : b.preset;
  if (preset !== 'NONE' && !(THEME_PRESETS as readonly string[]).includes(preset as string)) { res.status(400).json({ success: false, error: 'Choose a theme from the list, or None.' }); return; }
  for (const k of ['intro', 'background'] as const) {
    if (b[k] !== undefined && typeof b[k] !== 'boolean') { res.status(400).json({ success: false, error: 'On or off must be true or false.' }); return; }
  }
  const day = (v: unknown, label: string): string | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    const ok = cleanTheme({ preset: 'HALLOWEEN', startsOn: v }).startsOn;
    if (!ok) throw new Error(`${label} must be a real date.`);
    return ok;
  };
  let startsOn: string | null | undefined, endsOn: string | null | undefined;
  try { startsOn = day(b.startsOn, 'The start date'); endsOn = day(b.endsOn, 'The end date'); } catch (e: any) { res.status(400).json({ success: false, error: e.message }); return; }
  const wantStart = startsOn === undefined ? before.startsOn : startsOn, wantEnd = endsOn === undefined ? before.endsOn : endsOn;
  if (wantStart && wantEnd && wantEnd < wantStart) { res.status(400).json({ success: false, error: 'The end date cannot be before the start date.' }); return; }
  const next = cleanTheme({
    preset,
    startsOn: wantStart,
    endsOn: wantEnd,
    intro: b.intro === undefined ? before.intro : b.intro,
    background: b.background === undefined ? before.background : b.background,
  });
  const changes: string[] = [];
  if (next.preset !== before.preset) changes.push(`Theme: ${before.preset === 'NONE' ? 'none' : before.preset.toLowerCase()} to ${next.preset === 'NONE' ? 'none' : next.preset.toLowerCase()}`);
  if (next.startsOn !== before.startsOn) changes.push(`Starts: ${before.startsOn ?? 'now'} to ${next.startsOn ?? 'now'}`);
  if (next.endsOn !== before.endsOn) changes.push(`Ends: ${before.endsOn ?? 'when switched off'} to ${next.endsOn ?? 'when switched off'}`);
  if (next.intro !== before.intro) changes.push(`Opening animation: ${next.intro ? 'on' : 'off'}`);
  if (next.background !== before.background) changes.push(`Background creatures: ${next.background ? 'on' : 'off'}`);
  if (changes.length === 0) { res.json({ success: true, data: { ...next, presets: THEME_PRESETS, active: activeTheme(new Date(), next) }, changed: false }); return; }
  await save(THEME_KEY, next);
  applySettings({ theme: next });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_THEME_UPDATE', entity: 'app_config', entityId: THEME_KEY,
    details: { summary: changes.join('; '), keys: ['theme'] }, storeId: null });
  res.json({ success: true, data: { ...next, presets: THEME_PRESETS, active: activeTheme(new Date(), next) }, changed: true });
}

/** PUT /settings/welcome (HQ) { enabled, days, items: [{ key?, name, nameEs, emoji, active }] }: the joining bonus. An item sent without
 *  a key is new. Items are never deleted (switch them off), so the four first items and any added before are always kept. */
export async function putWelcome(req: AuthRequest, res: Response) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const before = welcome();
  if (b.enabled !== undefined && typeof b.enabled !== 'boolean') { res.status(400).json({ success: false, error: 'On or off must be true or false.' }); return; }
  const enabled = b.enabled === undefined ? before.enabled : b.enabled;
  const days = b.days === undefined ? before.days : Number(b.days);
  if (!Number.isInteger(days) || days < WELCOME_DAYS.min || days > WELCOME_DAYS.max) {
    res.status(400).json({ success: false, error: `The number of days must be a whole number from ${WELCOME_DAYS.min} to ${WELCOME_DAYS.max}.` }); return;
  }
  let items: WelcomeItem[] = before.items;
  if (b.items !== undefined) {
    if (!Array.isArray(b.items)) { res.status(400).json({ success: false, error: 'Send the items as a list.' }); return; }
    const sent = b.items as Record<string, unknown>[];
    const next = before.items.map((i) => ({ ...i }));
    for (const r of sent) {
      const name = typeof r?.name === 'string' ? r.name.replace(/\s+/g, ' ').trim() : '';
      const nameEs = typeof r?.nameEs === 'string' ? r.nameEs.replace(/\s+/g, ' ').trim() : '';
      if (!name) { res.status(400).json({ success: false, error: 'Every item needs a name.' }); return; }
      if (name.length > 40 || nameEs.length > 40) { res.status(400).json({ success: false, error: `"${name.slice(0, 40)}": names can be up to 40 characters.` }); return; }
      if (r.emoji !== undefined && !WELCOME_EMOJIS.includes(r.emoji as string)) { res.status(400).json({ success: false, error: `"${name}": choose one of the pictures shown.` }); return; }
      const active = r.active === undefined ? true : r.active === true;
      const at = typeof r.key === 'string' ? next.findIndex((i) => i.key === r.key) : -1;
      if (typeof r.key === 'string' && at < 0) { res.status(400).json({ success: false, error: `There is no item "${r.key}".` }); return; }
      if (at >= 0) { next[at] = { ...next[at], name, nameEs: nameEs || name, emoji: (r.emoji as string) ?? next[at].emoji, active }; continue; }
      if (next.length >= WELCOME_MAX_ITEMS) { res.status(400).json({ success: false, error: `There can be up to ${WELCOME_MAX_ITEMS} items. Switch an old one off and rename it instead.` }); return; }
      let key = '';
      do key = `ITEM_${Math.random().toString(36).slice(2, 8).toUpperCase()}`; while (next.some((i) => i.key === key));
      next.push({ key, name, nameEs: nameEs || name, emoji: (r.emoji as string) ?? '🎁', active });
    }
    const seen = new Set<string>();
    for (const i of next) {
      const n = i.name.toLowerCase();
      if (seen.has(n)) { res.status(400).json({ success: false, error: `Two items are called "${i.name}". Give each a different name.` }); return; }
      seen.add(n);
    }
    items = next;
  }
  if (enabled && !items.some((i) => i.active)) { res.status(400).json({ success: false, error: 'Switch on at least one item, or switch the joining bonus off.' }); return; }
  // What a customer must spend first (dollars, 0 = nothing), chain-wide
  let minSpend = before.minSpend;
  if (b.minSpend !== undefined) {
    const v = Number(b.minSpend);
    if (!Number.isFinite(v) || v < 0 || v > WELCOME_MAX_SPEND) { res.status(400).json({ success: false, error: `The amount to spend must be from $0 to $${WELCOME_MAX_SPEND}. Use 0 for no purchase needed.` }); return; }
    minSpend = Math.round(v * 100) / 100;
  }
  // Stores that differ: { [storeId]: { enabled?, minSpend?: number | null, items?: string[] | null } }; sent whole, a store left out follows the chain
  let stores: Record<string, WelcomeStoreRule> = before.stores;
  if (b.stores !== undefined) {
    if (!b.stores || typeof b.stores !== 'object' || Array.isArray(b.stores)) { res.status(400).json({ success: false, error: 'Send the stores as a list of rules.' }); return; }
    const sent = b.stores as Record<string, Record<string, unknown>>;
    const ids = Object.keys(sent);
    const found = ids.length ? await prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
    const nameOf = new Map(found.map((s) => [s.id, s.name]));
    const next: Record<string, WelcomeStoreRule> = {};
    for (const id of ids) {
      const r = sent[id] ?? {};
      const name = nameOf.get(id);
      if (!name) { res.status(400).json({ success: false, error: 'One of the stores does not exist. Reload the page.' }); return; }
      if (r.enabled !== undefined && typeof r.enabled !== 'boolean') { res.status(400).json({ success: false, error: `${name}: on or off must be true or false.` }); return; }
      let ms: number | null = null;
      if (r.minSpend !== undefined && r.minSpend !== null) {
        const v = Number(r.minSpend);
        if (!Number.isFinite(v) || v < 0 || v > WELCOME_MAX_SPEND) { res.status(400).json({ success: false, error: `${name}: the amount to spend must be from $0 to $${WELCOME_MAX_SPEND}.` }); return; }
        ms = Math.round(v * 100) / 100;
      }
      let keys: string[] | null = null;
      if (r.items !== undefined && r.items !== null) {
        if (!Array.isArray(r.items) || r.items.some((k) => typeof k !== 'string' || !items.some((i) => i.key === k))) { res.status(400).json({ success: false, error: `${name}: choose items from the list.` }); return; }
        keys = [...new Set(r.items as string[])];
        if (keys.length === 0) keys = null;
        else if (r.enabled !== false && !keys.some((k) => items.find((i) => i.key === k)?.active)) { res.status(400).json({ success: false, error: `${name}: switch on at least one of its items, or switch the store off.` }); return; }
      }
      next[id] = { enabled: r.enabled !== false, minSpend: ms, items: keys };
    }
    stores = next;
  }
  // Switched off now: customers who already joined keep their days; switched on: everyone from now on gets it
  const offSince = enabled ? null : before.enabled ? new Date().toISOString() : before.offSince;
  const clean = cleanWelcome({ enabled, offSince, days, items, minSpend, stores });
  const changes: string[] = [];
  if (clean.enabled !== before.enabled) changes.push(clean.enabled ? 'Switched on' : 'Switched off for new sign-ups');
  if (clean.days !== before.days) changes.push(`Days: ${before.days} to ${clean.days}`);
  for (const i of clean.items) {
    const was = before.items.find((x) => x.key === i.key);
    if (!was) { changes.push(`Added ${i.emoji} ${i.name}${i.active ? '' : ' (off)'}`); continue; }
    if (was.name !== i.name) changes.push(`Renamed ${was.name} to ${i.name}`);
    else if (was.nameEs !== i.nameEs) changes.push(`${i.name}: Spanish name ${i.nameEs}`);
    if (was.emoji !== i.emoji) changes.push(`${i.name}: picture ${i.emoji}`);
    if (was.active !== i.active) changes.push(`${i.name}: ${i.active ? 'on' : 'off'}`);
  }
  if (clean.minSpend !== before.minSpend) changes.push(clean.minSpend > 0 ? `Spend first: $${before.minSpend.toFixed(2)} to $${clean.minSpend.toFixed(2)}` : 'Spend first: nothing needed any more');
  {
    const ids = [...new Set([...Object.keys(before.stores), ...Object.keys(clean.stores)])];
    const names = new Map((ids.length ? await prisma.store.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : []).map((s) => [s.id, s.name]));
    const itemNames = (keys: string[] | null) => (keys ?? ['every offered item']).map((k) => clean.items.find((i) => i.key === k)?.name ?? k).join(', ');
    const rule = (r?: WelcomeStoreRule) => (!r ? 'follows the chain' : `${r.enabled ? 'on' : 'off'}${r.minSpend !== null ? `, spend $${r.minSpend.toFixed(2)}` : ''}${r.items ? `, items ${itemNames(r.items)}` : ''}`);
    for (const id of ids) {
      const was = before.stores[id], now = clean.stores[id];
      if (JSON.stringify(was ?? null) !== JSON.stringify(now ?? null)) changes.push(`${names.get(id) ?? 'A store'}: ${rule(now)}`);
    }
  }
  if (changes.length === 0) { res.json({ success: true, data: clean, changed: false }); return; }
  await save(WELCOME_KEY, clean);
  applySettings({ welcome: clean });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_WELCOME_UPDATE', entity: 'app_config', entityId: WELCOME_KEY,
    details: { summary: changes.join('; '), keys: ['welcome'] }, storeId: null });
  res.json({ success: true, data: clean, changed: true });
}

/**
 * PUT /settings/points-expiry (HQ) { enabled?, days?, warnDays? }: points expiry (utils/pointLots.ts). Switching it on starts every clock
 * today (nobody loses points on the day it starts); switching it off stops it, and switching on again later starts the clocks again from
 * that day. The admin page shows a preview and asks before switching it on.
 */
export async function putPointsExpiry(req: AuthRequest, res: Response) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const before = pointsExpiry();
  if (b.enabled !== undefined && typeof b.enabled !== 'boolean') { res.status(400).json({ success: false, error: 'On or off must be true or false.' }); return; }
  const num = (v: unknown, m: { min: number; max: number }, label: string) => {
    if (v === undefined) return undefined;
    const n = Number(v);
    if (!Number.isInteger(n) || n < m.min || n > m.max) throw new Error(`${label} must be a whole number from ${m.min} to ${m.max}.`);
    return n;
  };
  let days: number | undefined, warnDays: number | undefined;
  try {
    days = num(b.days, EXPIRY_LIMITS.days, 'The number of days');
    warnDays = num(b.warnDays, EXPIRY_LIMITS.warnDays, 'The warning days');
  } catch (e: any) { res.status(400).json({ success: false, error: e.message }); return; }
  const enabled = b.enabled === undefined ? before.enabled : (b.enabled as boolean);
  const startedAt = enabled ? (before.enabled && before.startedAt ? before.startedAt : new Date().toISOString()) : null;
  const clean = cleanExpiry({ enabled, startedAt, days: days ?? before.days, warnDays: warnDays ?? before.warnDays });
  const changes: string[] = [];
  if (clean.enabled !== before.enabled) changes.push(clean.enabled ? `Switched on: points expire ${clean.days} days after they are earned, counting from today` : 'Switched off: no points expire');
  if (clean.days !== before.days) changes.push(`Days: ${before.days} to ${clean.days}`);
  if (clean.warnDays !== before.warnDays) changes.push(`Warning push: ${before.warnDays} to ${clean.warnDays} days before`);
  if (changes.length === 0) { res.json({ success: true, data: clean, changed: false }); return; }
  await save(EXPIRY_KEY, clean);
  applySettings({ expiry: clean });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'SETTINGS_EXPIRY_UPDATE', entity: 'app_config', entityId: EXPIRY_KEY,
    details: { summary: changes.join('; '), keys: ['pointsExpiry'] }, storeId: null });
  res.json({ success: true, data: clean, changed: true });
}

/** GET /settings/points-expiry/preview?days=90 (HQ): what would expire, by date, with these days (from today, or from when it was switched on). */
export async function getPointsExpiryPreview(req: AuthRequest, res: Response) {
  const cfg = pointsExpiry();
  const days = Number(req.query.days ?? cfg.days);
  if (!Number.isInteger(days) || days < EXPIRY_LIMITS.days.min || days > EXPIRY_LIMITS.days.max) {
    res.status(400).json({ success: false, error: `The number of days must be from ${EXPIRY_LIMITS.days.min} to ${EXPIRY_LIMITS.days.max}.` }); return;
  }
  const from = cfg.enabled && cfg.startedAt ? new Date(cfg.startedAt) : new Date();
  res.json({ success: true, data: { ...(await previewExpiry(days, from)), days, from: from.toISOString() } });
}

/** Every settings change HQ or the Dev Admin made, wherever it was made, and which Settings tab it belongs to. */
export const SETTINGS_ACTIONS: Record<string, string> = {
  SETTINGS_RULES_UPDATE: 'Rules', SETTINGS_FEATURES_UPDATE: 'Features', SETTINGS_BUSINESS_UPDATE: 'Business details', SETTINGS_WELCOME_UPDATE: 'Joining bonus', SETTINGS_THEME_UPDATE: 'App theme',
  SETTINGS_EXPIRY_UPDATE: 'Points expiry',
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
      // 2026-10-17: numbers the app's words repeat, so a change here is what customers read
      refillSilverPerPeriod: rule('refillSilverPerPeriod'), refillDailyPerDay: rule('refillDailyPerDay'), rewardHoldMinutes: rule('rewardHoldMinutes'),
      productRequestDays: rule('productRequestDays'), referralLateDays: rule('referralLateDays'), disputeMaxDays: rule('disputeMaxDays'),
      audienceRecentMonths: rule('audienceRecentMonths'), goodwillCreditMax: rule('goodwillCreditMax'), disputeCreditMax: rule('disputeCreditMax'),
    },
    payWithPoints: feature('hotFoodPayWithPoints'),
    pointsExpiry: { enabled: pointsExpiry().enabled, days: pointsExpiry().days },   // the app's words (2026-10-17)
  } });
}
