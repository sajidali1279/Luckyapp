// App versions (2026-10-09). Google Play and the App Store never ask anyone to update, so the app asks here when it opens: below
// the LATEST version it offers the update (the customer can say Not now), below the MINIMUM it shows a screen that only opens the
// store. Kept per platform, because an Android and an iPhone release reach the stores on different days. Set by the Dev Admin in
// Billing > Platform Settings; stored as one AppConfig row. A platform with no version set never prompts.
import { Request, Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';

export const APP_VERSIONS_KEY = 'APP_VERSIONS';
export const STORE_URLS = {
  android: 'https://play.google.com/store/apps/details?id=com.luckystop.app',
  ios: 'https://apps.apple.com/app/id6787270736',
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

type Pair = { latest: string | null; minimum: string | null };
export type AppVersions = { android: Pair; ios: Pair; updatedAt: string | null };
const EMPTY: AppVersions = { android: { latest: null, minimum: null }, ios: { latest: null, minimum: null }, updatedAt: null };

export async function readAppVersions(): Promise<AppVersions> {
  const row = await prisma.appConfig.findUnique({ where: { key: APP_VERSIONS_KEY } });
  if (!row) return EMPTY;
  try {
    const v = JSON.parse(row.value);
    const pair = (p: any): Pair => ({ latest: VERSION.test(p?.latest ?? '') ? p.latest : null, minimum: VERSION.test(p?.minimum ?? '') ? p.minimum : null });
    return { android: pair(v.android), ios: pair(v.ios), updatedAt: row.updatedAt.toISOString() };
  } catch {
    return EMPTY;
  }
}

/** GET /app/version (no sign-in: the app asks before anyone signs in). */
export async function getAppVersion(_req: Request, res: Response) {
  const v = await readAppVersions();
  res.set('Cache-Control', 'no-store');   // the admin reads it back right after saving; the app asks at most once an hour
  res.json({ success: true, data: { android: { ...v.android, storeUrl: STORE_URLS.android }, ios: { ...v.ios, storeUrl: STORE_URLS.ios } } });
}

const pairSchema = z.object({
  latest: z.string().trim().regex(VERSION, 'Write a version like 1.2.8.').nullable(),
  minimum: z.string().trim().regex(VERSION, 'Write a version like 1.2.8.').nullable(),
}).refine((p) => !p.minimum || p.latest, { message: 'Set the newest version too, not only the oldest one allowed.' })
  .refine((p) => !p.minimum || !p.latest || compareVersions(p.minimum, p.latest) <= 0, { message: 'The oldest version allowed cannot be newer than the newest version.' });
const bodySchema = z.object({ android: pairSchema, ios: pairSchema });

/** PUT /app/versions (Dev Admin): both platforms at once; an empty box is null (no prompt). */
export async function updateAppVersions(req: AuthRequest, res: Response) {
  const blankToNull = (p: any) => ({ latest: p?.latest?.trim?.() || null, minimum: p?.minimum?.trim?.() || null });
  const parsed = bodySchema.safeParse({ android: blankToNull(req.body?.android), ios: blankToNull(req.body?.ios) });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.message.endsWith('.')) {   // our own sentence: say which platform it is about
      res.status(400).json({ success: false, error: `${first.path[0] === 'ios' ? 'iPhone' : 'Android'}: ${first.message}`, details: parsed.error.flatten() });
      return;
    }
    refuse(res, parsed.error); return;
  }
  const before = await readAppVersions();
  const value = JSON.stringify({ android: parsed.data.android, ios: parsed.data.ios });
  await prisma.appConfig.upsert({ where: { key: APP_VERSIONS_KEY }, update: { value }, create: { key: APP_VERSIONS_KEY, value } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'APP_VERSIONS_UPDATE', entity: 'settings',
    details: { before: { android: before.android, ios: before.ios }, after: parsed.data },
  });
  res.json({ success: true, data: await readAppVersions() });
}
