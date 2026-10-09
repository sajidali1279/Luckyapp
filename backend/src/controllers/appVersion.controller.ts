// App versions (2026-10-09). Google Play and the App Store never ask anyone to update, so the app asks when it opens. Whether a
// newer version is out comes from the stores themselves, never typed by hand: on Android, Google Play tells each phone (in-app
// updates, which also follow the rollout percentage); on iPhone, the App Store's public lookup. What is set here is only the
// OLDEST VERSION ALLOWED per platform: an app older than it shows a screen that only updates. Set by the Dev Admin in Billing >
// Platform Settings; stored as one AppConfig row. The iPhone one can never be set above the version live on the App Store, so a
// slip cannot lock everyone out.
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';

export const APP_VERSIONS_KEY = 'APP_VERSIONS';
export const APP_STORE_ID = '6787270736';
export const STORE_URLS = {
  android: 'https://play.google.com/store/apps/details?id=com.luckystop.app',
  ios: `https://apps.apple.com/app/id${APP_STORE_ID}`,
} as const;

const VERSION = /^\d{1,4}(\.\d{1,4}){0,3}$/;

/** -1, 0 or 1, comparing "1.2.10" and "1.2.9" as numbers part by part ("1.2" is "1.2.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type Minimums = { android: string | null; ios: string | null; updatedAt: string | null };

export async function readMinimums(): Promise<Minimums> {
  const row = await prisma.appConfig.findUnique({ where: { key: APP_VERSIONS_KEY } });
  if (!row) return { android: null, ios: null, updatedAt: null };
  try {
    const v = JSON.parse(row.value);
    const ok = (s: unknown) => (typeof s === 'string' && VERSION.test(s) ? s : null);
    // Older rows kept { latest, minimum } per platform: only the minimum is used now
    return { android: ok(v.android?.minimum ?? v.android), ios: ok(v.ios?.minimum ?? v.ios), updatedAt: row.updatedAt.toISOString() };
  } catch {
    return { android: null, ios: null, updatedAt: null };
  }
}

// ─── The version live on the App Store ───────────────────────────────────────

type Live = { version: string | null; checkedAt: number };
let live: Live = { version: null, checkedAt: 0 };
const LIVE_FOR_MS = 60 * 60_000;

/** The App Store's current version of the app (public lookup), cached for an hour; null when it cannot be reached. */
export async function appStoreVersion(fresh = false): Promise<{ version: string | null; checkedAt: string | null }> {
  if (!fresh && live.checkedAt && Date.now() - live.checkedAt < LIVE_FOR_MS) {
    return { version: live.version, checkedAt: new Date(live.checkedAt).toISOString() };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    const res = await fetch(`https://itunes.apple.com/lookup?id=${APP_STORE_ID}&country=us&_=${Date.now()}`, { signal: ctrl.signal });
    clearTimeout(timer);
    const v = res.ok ? ((await res.json()) as any)?.results?.[0]?.version : null;
    if (typeof v === 'string' && VERSION.test(v)) live = { version: v, checkedAt: Date.now() };
    else if (!live.version) return { version: null, checkedAt: null };
  } catch {
    if (!live.version) return { version: null, checkedAt: null };
  }
  return { version: live.version, checkedAt: new Date(live.checkedAt).toISOString() };
}

export function resetAppStoreCache() { live = { version: null, checkedAt: 0 }; }   // tests

/** GET /app/version (no sign-in: the app asks before anyone signs in). */
export async function getAppVersion(_req: Request, res: Response) {
  const [min, store] = await Promise.all([readMinimums(), appStoreVersion()]);
  res.set('Cache-Control', 'no-store');   // the admin reads it back right after saving; the app asks at most once an hour
  res.json({
    success: true,
    data: {
      android: { minimum: min.android, storeUrl: STORE_URLS.android },
      ios: { minimum: min.ios, storeUrl: STORE_URLS.ios, storeVersion: store.version, checkedAt: store.checkedAt },
      updatedAt: min.updatedAt,
    },
  });
}

const minimum = z.string().trim().regex(VERSION, 'Write a version like 1.2.8.').nullable();
const bodySchema = z.object({ android: minimum, ios: minimum });

/** PUT /app/versions (Dev Admin): the oldest version allowed on each platform; an empty box is null (nobody is blocked). */
export async function updateAppVersions(req: AuthRequest, res: Response) {
  const pick = (p: any) => (typeof p === 'string' ? p : p?.minimum)?.trim?.() || null;
  const parsed = bodySchema.safeParse({ android: pick(req.body?.android), ios: pick(req.body?.ios) });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.message.endsWith('.')) {   // our own sentence: say which platform it is about
      res.status(400).json({ success: false, error: `${first.path[0] === 'ios' ? 'iPhone' : 'Android'}: ${first.message}`, details: parsed.error.flatten() });
      return;
    }
    refuse(res, parsed.error); return;
  }
  const before = await readMinimums();
  if (parsed.data.ios && parsed.data.ios !== before.ios) {
    const store = await appStoreVersion(true);
    if (!store.version) {
      res.status(503).json({ success: false, error: 'iPhone: Could not reach the App Store to check that version is live. Try again in a minute.' });
      return;
    }
    if (compareVersions(parsed.data.ios, store.version) > 0) {
      res.status(400).json({ success: false, error: `iPhone: The App Store has ${store.version}. The oldest version allowed cannot be newer than that, or nobody could use the app.` });
      return;
    }
  }
  const value = JSON.stringify({ android: parsed.data.android, ios: parsed.data.ios });
  await prisma.appConfig.upsert({ where: { key: APP_VERSIONS_KEY }, update: { value }, create: { key: APP_VERSIONS_KEY, value } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'APP_VERSIONS_UPDATE', entity: 'settings',
    details: { before: { android: before.android, ios: before.ios }, after: parsed.data },
  });
  res.json({ success: true, data: await readMinimums() });
}
