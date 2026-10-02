import { Response } from 'express';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import cloudinary from '../config/cloudinary';
import { audit } from '../utils/audit';
import { endOfStoreDate, isRealDateKey, storeDateKey } from '../utils/storeTime';
import { sendPushToUser } from '../utils/push';
import { Role } from '@prisma/client';

// ─── Checks ───────────────────────────────────────────────────────────────────

class Refusal extends Error {}

// A text field from the form: must be text, trimmed, not longer than max (and there when required)
function text(v: unknown, name: string, max: number, required = false): string | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) {
    if (required) throw new Refusal(`Enter the ${name}.`);
    return null;
  }
  if (typeof v !== 'string') throw new Refusal(`The ${name} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new Refusal(`The ${name} is too long (${max} characters at most).`);
  return t;
}

// A website as the customer app can open it: "mystore.com" becomes https://mystore.com, and only web addresses are kept
// (the app opens it as-is; "www.mystore.com" gave a button that did nothing)
export function cleanWebsite(v: unknown): string | null {
  const t = text(v, 'website', 200);
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { throw new Refusal('Enter the website like mystore.com.'); }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.')) throw new Refusal('Enter the website like mystore.com.');
  return u.toString();
}
const websiteOrNull = (v: string | null) => { try { return cleanWebsite(v); } catch { return null; } };

function imageUrl(v: unknown): string | null {
  const t = text(v, 'image link', 500);
  if (!t) return null;
  if (!/^https?:\/\//i.test(t)) throw new Refusal('The image link must start with https://');
  return t;
}

// The ad's last day. A plain day (the admin's date box, "2026-10-05") means through 11:59 pm at the store on that day: it used to
// be read as midnight UTC, 7 pm the evening before in Texas, so every ad ended a day early and "today" was refused.
function expiry(v: unknown): Date | null {
  if (v === undefined || v === null || v === '') return null;
  const raw = String(v).trim();
  const d = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? (isRealDateKey(raw) ? endOfStoreDate(raw) : new Date(NaN)) : new Date(raw);
  if (isNaN(d.getTime())) throw new Refusal('Pick a real end date for the ad.');
  if (d.getTime() < Date.now()) throw new Refusal('The end date has already passed, so the ad would never show.');
  return d;
}

// A Refusal from the checks becomes a 400 with its sentence
function refused(res: Response, e: unknown): boolean {
  if (e instanceof Refusal) { res.status(400).json({ success: false, error: e.message }); return true; }
  return false;
}

async function uploadToCloudinary(buffer: Buffer, folder: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve((result as any).secure_url))
    ).end(buffer);
  });
}

// POST /promotions/request — customer submits a promotion request
export async function submitPromotionRequest(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  let fields;
  try {
    fields = {
      requesterName: text(req.body.requesterName, 'your name', 60, true)!,
      requesterPhone: text(req.body.requesterPhone, 'phone number', 30, true)!,
      businessName: text(req.body.businessName, 'business name', 80, true)!,
      businessDescription: text(req.body.businessDescription, 'business description', 1000, true)!,
      website: cleanWebsite(req.body.website),
      location: text(req.body.location, 'location', 200),
    };
  } catch (e) { if (refused(res, e)) return; throw e; }

  // One pending/approved request per user at a time
  const existing = await prisma.businessPromotion.findFirst({
    where: { requesterId: userId, status: { in: ['PENDING', 'APPROVED'] } },
  });
  if (existing) {
    res.status(409).json({ success: false, error: 'You already have an active promotion request. Contact support to update it.' });
    return;
  }

  // Optional business logo upload
  let logoUrl: string | null = null;
  if (req.file) {
    logoUrl = await uploadToCloudinary(req.file.buffer, 'luckystop/business-logos');
  }

  const promo = await prisma.businessPromotion.create({
    data: {
      requesterId: userId,
      ...fields,
      adImageUrl: logoUrl, // store logo at submission; DevAdmin can override at publish time
    },
  });

  res.status(201).json({ success: true, data: promo });
}

// GET /promotions — published ads visible to all customers
// How many of the newest live ads are "featured" in the app (its Featured tab); the rest are under All Businesses. Set by the developer
// account on the Business Promotions page. Kept in app_config.
const FEATURED_ADS_KEY = 'FEATURED_ADS_LIMIT';
export const FEATURED_ADS_DEFAULT = 5;
export const FEATURED_ADS_MAX = 50;

export async function featuredAdsLimit(): Promise<number> {
  const row = await prisma.appConfig.findUnique({ where: { key: FEATURED_ADS_KEY } });
  const n = row ? Number(row.value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= FEATURED_ADS_MAX ? n : FEATURED_ADS_DEFAULT;
}

// GET /promotions: every live ad, newest first. Each carries `featured` (one of the newest `featuredLimit`), so the app can show a
// Featured tab and an All Businesses tab. The list itself is unchanged, so an older app that ignores `featured` still shows them all.
export async function getPublishedPromotions(_req: AuthRequest, res: Response) {
  const now = new Date();
  const limit = await featuredAdsLimit();
  const promos = await prisma.businessPromotion.findMany({
    where: {
      status: 'APPROVED',
      OR: [
        { adExpiresAt: null },
        { adExpiresAt: { gt: now } },
      ],
    },
    orderBy: { publishedAt: 'desc' },
    select: {
      id: true,
      businessName: true,
      adTitle: true,
      adBody: true,
      adImageUrl: true,
      website: true,
      location: true,
      publishedAt: true,
      adExpiresAt: true,
    },
  });
  // An ad saved before websites were checked still opens: "www.mystore.com" is sent as https://www.mystore.com, a non-web one not at all
  res.json({ success: true, data: promos.map((p, i) => ({ ...p, website: websiteOrNull(p.website), featured: i < limit })), featuredLimit: limit });
}

// GET /promotions/settings: DevAdmin. The featured limit and how many ads are live now.
export async function getPromotionSettings(_req: AuthRequest, res: Response) {
  const now = new Date();
  const [featuredLimit, live] = await Promise.all([
    featuredAdsLimit(),
    prisma.businessPromotion.count({ where: { status: 'APPROVED', OR: [{ adExpiresAt: null }, { adExpiresAt: { gt: now } }] } }),
  ]);
  res.json({ success: true, data: { featuredLimit, live, max: FEATURED_ADS_MAX } });
}

// PUT /promotions/settings: DevAdmin. { featuredLimit: 1..50 }
export async function updatePromotionSettings(req: AuthRequest, res: Response) {
  const n = (req.body ?? {}).featuredLimit;
  if (!Number.isInteger(n) || n < 1 || n > FEATURED_ADS_MAX) {
    res.status(400).json({ success: false, error: `The number of featured ads must be a whole number from 1 to ${FEATURED_ADS_MAX}.` });
    return;
  }
  const before = await featuredAdsLimit();
  await prisma.appConfig.upsert({ where: { key: FEATURED_ADS_KEY }, update: { value: String(n) }, create: { key: FEATURED_ADS_KEY, value: String(n) } });
  if (before !== n) {
    audit({
      actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
      action: 'PROMOTION_SETTINGS', entity: 'business_promotion', entityId: null,
      details: { summary: `Featured local-business ads in the app: ${before} to ${n} (the newest ones).`, from: before, to: n },
      storeId: null,
    });
  }
  res.json({ success: true, data: { featuredLimit: n } });
}

// GET /promotions/my — customer checks their own request status
export async function getMyPromotionRequest(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const promo = await prisma.businessPromotion.findFirst({
    where: { requesterId: userId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ success: true, data: promo || null });
}

// GET /promotions/requests — DevAdmin sees all requests
export async function getAllPromotionRequests(req: AuthRequest, res: Response) {
  const { status } = req.query;
  const promos = await prisma.businessPromotion.findMany({
    where: status ? { status: status as any } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      requester: { select: { id: true, name: true, phone: true } },
    },
  });
  res.json({ success: true, data: promos });
}

// GET /promotions/requests/pending-count — badge count for DevAdmin
export async function getPendingPromotionCount(req: AuthRequest, res: Response) {
  const count = await prisma.businessPromotion.count({ where: { status: 'PENDING' } });
  res.json({ success: true, data: { count } });
}

// POST /promotions/:id/publish — DevAdmin approves and publishes an ad
/** A push and an inbox entry for the customer who asked for an ad. Only customers: an ad HQ made itself has the Dev Admin as its requester. */
function tellRequester(requesterId: string, title: string, body: string) {
  // Never allowed to fail the publish or decline that caused it
  Promise.resolve()
    .then(() => prisma.user.findUnique({ where: { id: requesterId }, select: { role: true, isActive: true } }))
    .then((u) => { if (u?.role === Role.CUSTOMER && u.isActive) return sendPushToUser(requesterId, title, body, 'PROMOTION', '/(customer)/ads'); })
    .catch((e) => console.error('[promotion-push]', e?.message ?? e));
}

export async function publishPromotion(req: AuthRequest, res: Response) {
  const { id } = req.params;
  let ad;
  try {
    ad = {
      adTitle: text(req.body.adTitle, 'ad title', 80, true)!,
      adBody: text(req.body.adBody, 'ad text', 500, true)!,
      adExpiresAt: expiry(req.body.adExpiresAt),
      devAdminNote: text(req.body.devAdminNote, 'note', 500),
      bodyImage: req.body.adImageUrl !== undefined ? imageUrl(req.body.adImageUrl) : undefined,
    };
  } catch (e) { if (refused(res, e)) return; throw e; }

  const current = await prisma.businessPromotion.findUnique({ where: { id }, select: { adImageUrl: true, businessName: true, requesterId: true, status: true } });
  if (!current) { res.status(404).json({ success: false, error: 'That promotion request does not exist.' }); return; }

  // Upload new banner image if provided, otherwise keep existing (undefined = no change)
  let adImageUrl: string | null | undefined = ad.bodyImage;
  if (req.file) {
    adImageUrl = await uploadToCloudinary(req.file.buffer, 'luckystop/promo-banners');
  }

  const promo = await prisma.businessPromotion.update({
    where: { id },
    data: {
      status: 'APPROVED',
      adTitle: ad.adTitle,
      adBody: ad.adBody,
      adImageUrl: adImageUrl !== undefined ? adImageUrl : current.adImageUrl,
      adExpiresAt: ad.adExpiresAt,
      devAdminNote: ad.devAdminNote,
      publishedAt: new Date(),
    },
  });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PROMOTION_PUBLISH', entity: 'business_promotion', entityId: id,
    details: { summary: `Local business ad published: ${current.businessName}, "${ad.adTitle}"${ad.adExpiresAt ? `, until ${storeDateKey(ad.adExpiresAt)}` : ''}` }, storeId: null,
  });
  // The customer who asked for the ad is told it is live (once: not again when an already published ad is edited)
  if (current.status !== 'APPROVED') {
    tellRequester(current.requesterId, 'Your ad is live',
      `"${ad.adTitle}" for ${current.businessName} now shows in the Lucky Stop app${ad.adExpiresAt ? ` until ${storeDateKey(ad.adExpiresAt)}` : ''}.`);
  }
  res.json({ success: true, data: promo });
}

// POST /promotions/manual — DevAdmin creates and publishes a promotion
// directly, with no preceding customer request at all (an in-house promo,
// or a business that called in rather than using the app's own request
// flow). requesterId is set to the creating DevAdmin purely to satisfy the
// schema's foreign key — it does not need to represent whoever the ad is
// actually for.
export async function createManualPromotion(req: AuthRequest, res: Response) {
  const user = req.user!;
  let f;
  try {
    f = {
      requesterName: text(req.body.requesterName, 'contact name', 60, true)!,
      requesterPhone: text(req.body.requesterPhone, 'phone number', 30, true)!,
      businessName: text(req.body.businessName, 'business name', 80, true)!,
      businessDescription: text(req.body.businessDescription, 'business description', 1000, true)!,
      website: cleanWebsite(req.body.website),
      location: text(req.body.location, 'location', 200),
      adTitle: text(req.body.adTitle, 'ad title', 80, true)!,
      adBody: text(req.body.adBody, 'ad text', 500, true)!,
      adExpiresAt: expiry(req.body.adExpiresAt),
      devAdminNote: text(req.body.devAdminNote, 'note', 500),
    };
  } catch (e) { if (refused(res, e)) return; throw e; }

  let adImageUrl: string | null = null;
  if (req.file) {
    adImageUrl = await uploadToCloudinary(req.file.buffer, 'luckystop/promo-banners');
  }

  const promo = await prisma.businessPromotion.create({
    data: {
      requesterId: user.id,
      ...f,
      status: 'APPROVED',
      adImageUrl,
      publishedAt: new Date(),
    },
  });
  audit({
    actorId: user.id, actorName: user.name, actorRole: user.role,
    action: 'PROMOTION_PUBLISH', entity: 'business_promotion', entityId: promo.id,
    details: { summary: `Local business ad added and published: ${f.businessName}, "${f.adTitle}"` }, storeId: null,
  });
  res.status(201).json({ success: true, data: promo });
}

// PATCH /promotions/:id/reject — DevAdmin rejects a request
export async function rejectPromotion(req: AuthRequest, res: Response) {
  const { id } = req.params;
  let note: string | null;
  try { note = text(req.body.devAdminNote, 'note', 500); } catch (e) { if (refused(res, e)) return; throw e; }
  const current = await prisma.businessPromotion.findUnique({ where: { id }, select: { businessName: true, requesterId: true, status: true } });
  if (!current) { res.status(404).json({ success: false, error: 'That promotion request does not exist.' }); return; }

  const promo = await prisma.businessPromotion.update({
    where: { id },
    data: { status: 'REJECTED', devAdminNote: note },
  });
  if (current.status !== 'REJECTED') {
    tellRequester(current.requesterId, 'About your ad request',
      `Your ad request for ${current.businessName} was not approved.${note ? ` ${note}` : ''} You can send a new request from Ads & Promotions in the app.`);
  }
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PROMOTION_REJECT', entity: 'business_promotion', entityId: id,
    details: { summary: `Local business ad request declined: ${current.businessName}` }, storeId: null,
  });
  res.json({ success: true, data: promo });
}

// DELETE /promotions/:id — DevAdmin deletes a promotion
export async function deletePromotion(req: AuthRequest, res: Response) {
  const { id } = req.params;
  const current = await prisma.businessPromotion.findUnique({ where: { id }, select: { businessName: true } });
  if (!current) { res.status(404).json({ success: false, error: 'That promotion does not exist.' }); return; }
  await prisma.businessPromotion.delete({ where: { id } });
  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'PROMOTION_DELETE', entity: 'business_promotion', entityId: id,
    details: { summary: `Local business ad deleted: ${current.businessName}` }, storeId: null,
  });
  res.json({ success: true });
}
