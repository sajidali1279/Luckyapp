// Missing person posters (2026-10-18). Only HQ posts them, and only from an official source (a police case number, an AMBER Alert):
// anyone can call a person "missing", including someone looking for a person who fled from them, so a poster needs an agency and a case
// number HQ has checked. Customers see an active poster on Home at the stores it is for, and can call the agency or 911; tips go to the
// police, never to the app. HQ can send one push to those stores' customers. A poster stays up until HQ marks it found or resolved; every
// 30 days HQ confirms it is still active, or it stops showing. When it ends, the photo is deleted and the personal details are cleared.
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import cloudinary from '../config/cloudinary';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { resolveAudience, type AudienceMember } from '../utils/audience';
import { saveNotificationMany } from '../utils/push';
import { sendExpoBatch } from '../utils/pushSend';
import { emailHQ } from '../utils/adminEmail';

const DAY = 86_400_000;
export const REVIEW_DAYS = 30;
const ENDINGS = ['FOUND', 'RESOLVED', 'REMOVED'] as const;

const phoneDigits = (v: string) => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const fields = {
  name: z.string().trim().min(1, 'Enter the person\'s name.').max(80, 'The name can be at most 80 characters.'),
  age: z.preprocess((v) => (v === '' || v === null || v === undefined ? null : Number(v)), z.number().int().min(0).max(120, 'Enter an age from 0 to 120.').nullable()),
  lastSeenAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Enter the date they were last seen.'),
  lastSeenPlace: z.string().trim().min(1, 'Enter where they were last seen.').max(120, 'At most 120 characters for where they were last seen.'),
  description: z.string().trim().max(600, 'The description can be at most 600 characters.').optional().transform((v) => v || null),
  descriptionEs: z.string().trim().max(600, 'The Spanish description can be at most 600 characters.').optional().transform((v) => v || null),
  agencyName: z.string().trim().min(2, 'Enter the police department or agency.').max(80),
  agencyPhone: z.string().trim().refine((v) => phoneDigits(v).length === 10, 'Enter the agency\'s 10-digit phone number.'),
  caseNumber: z.string().trim().min(1, 'Enter the case number (or the AMBER Alert number).').max(40),
  sourceUrl: z.string().trim().max(300).optional().transform((v) => v || null).refine((v) => !v || /^https:\/\//i.test(v), 'The link must start with https://'),
  urgent: z.preprocess((v) => v === true || v === 'true', z.boolean()),
  storeIds: z.preprocess((v) => (typeof v === 'string' ? (v ? JSON.parse(v) : []) : v ?? []), z.array(z.string().uuid()).max(50)),
};
const createSchema = z.object({
  ...fields,
  // HQ checked the case with the agency or the official alert: required, so a poster is never put up on someone's word
  officialConfirmed: z.preprocess((v) => v === true || v === 'true', z.literal(true, { errorMap: () => ({ message: 'Confirm that you checked the case with the agency or the official alert.' }) })),
});
const updateSchema = z.object(fields).partial();

function firstError(e: z.ZodError) { return e.issues[0]?.message ?? 'Check the details.'; }

async function uploadPhoto(buffer: Buffer): Promise<{ url: string; publicId: string }> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: 'luckystop/missing', resource_type: 'image' }, (err, result) => {
      if (err || !result) reject(err ?? new Error('upload failed'));
      else resolve({ url: (result as any).secure_url, publicId: (result as any).public_id });
    }).end(buffer);
  });
}
async function deletePhoto(publicId: string | null | undefined) {
  if (!publicId) return;
  try { await cloudinary.uploader.destroy(publicId, { resource_type: 'image', invalidate: true }); } catch (e: any) { console.error('[missing] photo not deleted:', e?.message ?? e); }
}

/** What customers see (no HQ-only details). */
const forCustomer = (p: any) => ({
  id: p.id, name: p.name, age: p.age, photoUrl: p.photoUrl, lastSeenAt: p.lastSeenAt, lastSeenPlace: p.lastSeenPlace,
  description: p.description, descriptionEs: p.descriptionEs, agencyName: p.agencyName, agencyPhone: phoneDigits(p.agencyPhone),
  caseNumber: p.caseNumber, sourceUrl: p.sourceUrl, urgent: p.urgent,
});
const showing = (now: Date) => ({ status: 'ACTIVE', reviewDueAt: { gt: now } });

// ── Customers and staff ──

/** GET /missing-persons/active?storeId= : the posters showing at that store (all stores, or this one), urgent first. */
export async function getActiveMissing(req: AuthRequest, res: Response) {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : '';
  const rows = await prisma.missingPerson.findMany({ where: showing(new Date()), orderBy: [{ urgent: 'desc' }, { createdAt: 'desc' }] });
  const here = rows.filter((p) => p.storeIds.length === 0 || (storeId && p.storeIds.includes(storeId)));
  res.json({ success: true, data: here.map(forCustomer) });
}

/** GET /missing-persons/:id/public : one poster while it is showing (a push or a share opens it). */
export async function getMissingPublic(req: AuthRequest, res: Response) {
  const p = await prisma.missingPerson.findFirst({ where: { id: req.params.id, ...showing(new Date()) } });
  if (!p) { res.status(404).json({ success: false, error: 'This poster is no longer up. Thank you for looking.' }); return; }
  res.json({ success: true, data: forCustomer(p) });
}

/** POST /missing-persons/:id/report { reason } : "something is wrong with this poster" goes to HQ (never a sighting: that is the police). */
export async function reportMissing(req: AuthRequest, res: Response) {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
  if (!reason) { res.status(400).json({ success: false, error: 'Say what is wrong with the poster.' }); return; }
  const p = await prisma.missingPerson.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, caseNumber: true } });
  if (!p) { res.status(404).json({ success: false, error: 'This poster is no longer up.' }); return; }
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_REPORTED', entity: 'missing_person', entityId: p.id, details: { reason }, storeId: null });
  emailHQ(`A missing person poster was reported: ${p.name}`, 'Someone reported a problem with a missing person poster',
    [`Poster: ${p.name} (case ${p.caseNumber})`, `What they said: ${reason}`, 'Check it with the agency, and take it down or correct it if needed.'],
    { path: '/missing-persons', label: 'Open missing persons' }, 'STORE_ALERT').catch(() => {});
  res.json({ success: true });
}

// ── HQ ──

/** GET /missing-persons (HQ): every poster, newest first, with whether it is showing and when the next check is. */
export async function listMissing(_req: AuthRequest, res: Response) {
  const now = new Date();
  const rows = await prisma.missingPerson.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 });
  res.json({ success: true, data: rows.map((p) => ({ ...p, showing: p.status === 'ACTIVE' && p.reviewDueAt > now, needsCheck: p.status === 'ACTIVE' && p.reviewDueAt.getTime() - now.getTime() < 3 * DAY })) });
}

/** POST /missing-persons (HQ, multipart: photo + fields): a new poster, showing at once. */
export async function createMissing(req: AuthRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: firstError(parsed.error) }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: 'Add a recent photo from the official poster.' }); return; }
  const d = parsed.data;
  if (new Date(d.lastSeenAt).getTime() > Date.now() + DAY) { res.status(400).json({ success: false, error: 'The last-seen date cannot be in the future.' }); return; }
  const stores = d.storeIds.length ? await prisma.store.count({ where: { id: { in: d.storeIds } } }) : 0;
  if (stores !== d.storeIds.length) { res.status(400).json({ success: false, error: 'One of the stores was not found.' }); return; }
  let photo: { url: string; publicId: string };
  try { photo = await uploadPhoto(req.file.buffer); } catch { res.status(502).json({ success: false, error: 'The photo could not be saved. Try again.' }); return; }
  const now = new Date();
  const p = await prisma.missingPerson.create({
    data: {
      name: d.name, age: d.age, lastSeenAt: new Date(d.lastSeenAt), lastSeenPlace: d.lastSeenPlace, description: d.description, descriptionEs: d.descriptionEs,
      agencyName: d.agencyName, agencyPhone: phoneDigits(d.agencyPhone), caseNumber: d.caseNumber, sourceUrl: d.sourceUrl, urgent: d.urgent, storeIds: d.storeIds,
      photoUrl: photo.url, photoPublicId: photo.publicId, reviewDueAt: new Date(now.getTime() + REVIEW_DAYS * DAY), createdById: req.user!.id,
    },
  });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_POSTED', entity: 'missing_person', entityId: p.id,
    details: { name: p.name, caseNumber: p.caseNumber, agency: p.agencyName, stores: d.storeIds.length || 'all' }, storeId: null });
  res.status(201).json({ success: true, data: p });
}

/** PATCH /missing-persons/:id (HQ): correct the details of an active poster. */
export async function updateMissing(req: AuthRequest, res: Response) {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: firstError(parsed.error) }); return; }
  const p = await prisma.missingPerson.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'ACTIVE') { res.status(404).json({ success: false, error: 'Only an active poster can be changed.' }); return; }
  const d = parsed.data;
  const data: Record<string, unknown> = { ...d };
  if (d.lastSeenAt !== undefined) data.lastSeenAt = new Date(d.lastSeenAt);
  if (d.agencyPhone !== undefined) data.agencyPhone = phoneDigits(d.agencyPhone);
  const updated = await prisma.missingPerson.update({ where: { id: p.id }, data });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_EDITED', entity: 'missing_person', entityId: p.id, details: { changed: Object.keys(d) }, storeId: null });
  res.json({ success: true, data: updated });
}

/** POST /missing-persons/:id/photo (HQ, multipart photo): a better photo; the old one is deleted. */
export async function replaceMissingPhoto(req: AuthRequest, res: Response) {
  const p = await prisma.missingPerson.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'ACTIVE') { res.status(404).json({ success: false, error: 'Only an active poster can be changed.' }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: 'Choose a photo.' }); return; }
  let photo: { url: string; publicId: string };
  try { photo = await uploadPhoto(req.file.buffer); } catch { res.status(502).json({ success: false, error: 'The photo could not be saved. Try again.' }); return; }
  const oldPhoto = p.photoPublicId;
  const updated = await prisma.missingPerson.update({ where: { id: p.id }, data: { photoUrl: photo.url, photoPublicId: photo.publicId } });
  await deletePhoto(oldPhoto);
  res.json({ success: true, data: updated });
}

/** POST /missing-persons/:id/confirm (HQ): still active, checked with the agency: shows for another 30 days. */
export async function confirmMissing(req: AuthRequest, res: Response) {
  const p = await prisma.missingPerson.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'ACTIVE') { res.status(404).json({ success: false, error: 'Only an active poster can be confirmed.' }); return; }
  const updated = await prisma.missingPerson.update({ where: { id: p.id }, data: { reviewDueAt: new Date(Date.now() + REVIEW_DAYS * DAY), reviewNotifiedAt: null } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_CONFIRMED', entity: 'missing_person', entityId: p.id, details: { until: updated.reviewDueAt }, storeId: null });
  res.json({ success: true, data: updated });
}

/**
 * POST /missing-persons/:id/end (HQ) { status: FOUND | RESOLVED | REMOVED, note? }: the poster comes down everywhere at once. The photo is
 * deleted and the personal details cleared; the case number, agency, dates and note stay for the record.
 */
export async function endMissing(req: AuthRequest, res: Response) {
  const status = req.body?.status;
  if (!ENDINGS.includes(status)) { res.status(400).json({ success: false, error: 'Choose Found, Resolved or Remove.' }); return; }
  const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 300) || null : null;
  const p = await prisma.missingPerson.findUnique({ where: { id: req.params.id } });
  if (!p || p.status !== 'ACTIVE') { res.status(404).json({ success: false, error: 'This poster has already been taken down.' }); return; }
  const photoId = p.photoPublicId, caseNumber = p.caseNumber, agency = p.agencyName;   // read before the record is cleared
  const { count } = await prisma.missingPerson.updateMany({
    where: { id: p.id, status: 'ACTIVE' },
    data: { status, endedAt: new Date(), endNote: note, name: 'Poster taken down', age: null, photoUrl: null, photoPublicId: null, description: null, descriptionEs: null, lastSeenPlace: '' },
  });
  if (count === 0) { res.status(409).json({ success: false, error: 'This poster has already been taken down.' }); return; }
  await deletePhoto(photoId);
  // the notifications that pointed at it go too, so nobody opens a poster that is no longer up
  await prisma.userNotification.deleteMany({ where: { actionUrl: `/(customer)/missing/${p.id}` } }).catch(() => {});
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_ENDED', entity: 'missing_person', entityId: p.id,
    details: { status, caseNumber, agency, note }, storeId: null });
  res.json({ success: true, data: { id: p.id, status } });
}

/** Who a poster's push reaches: the customers of its stores (a purchase there in the last months), or every customer. */
async function audienceOf(storeIds: string[]): Promise<AudienceMember[]> {
  if (storeIds.length === 0) return resolveAudience('ALL_CUSTOMERS');
  const seen = new Map<string, AudienceMember>();
  for (const s of storeIds) for (const m of await resolveAudience('STORE_CUSTOMERS', s)) seen.set(m.id, m);
  return [...seen.values()];
}

/** GET /missing-persons/:id/alert-preview (HQ): how many customers a push would reach. */
export async function previewMissingAlert(req: AuthRequest, res: Response) {
  const p = await prisma.missingPerson.findUnique({ where: { id: req.params.id }, select: { storeIds: true } });
  if (!p) { res.status(404).json({ success: false, error: 'Poster not found.' }); return; }
  const people = await audienceOf(p.storeIds);
  res.json({ success: true, data: { customers: people.length, phones: people.reduce((n, m) => n + m.tokens.length, 0) } });
}

/** POST /missing-persons/:id/alert (HQ): one push to the customers of its stores, in each person's language. Once per poster. */
export async function sendMissingAlert(req: AuthRequest, res: Response) {
  const now = new Date();
  const p = await prisma.missingPerson.findFirst({ where: { id: req.params.id, ...showing(now) } });
  if (!p) { res.status(404).json({ success: false, error: 'Only a poster that is showing can be sent.' }); return; }
  const claimed = await prisma.missingPerson.updateMany({ where: { id: p.id, pushSentAt: null }, data: { pushSentAt: now } });
  if (claimed.count === 0) { res.status(409).json({ success: false, error: 'The alert for this poster was already sent.' }); return; }
  const people = await audienceOf(p.storeIds);
  const url = `/(customer)/missing/${p.id}`;
  const when = (lang: string) => p.lastSeenAt.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const groups = [
    { people: people.filter((m) => m.language !== 'es'), title: `${p.urgent ? 'Urgent: help' : 'Help'} find ${p.name}${p.age != null ? `, ${p.age}` : ''}`,
      body: `Missing since ${when('en')}, last seen ${p.lastSeenPlace}. If you see them, call 911. Tap for the photo.` },
    { people: people.filter((m) => m.language === 'es'), title: `${p.urgent ? 'Urgente: ayuda' : 'Ayuda'} a encontrar a ${p.name}${p.age != null ? `, ${p.age} años` : ''}`,
      body: `Desaparecido/a desde el ${when('es')}, visto/a por última vez en ${p.lastSeenPlace}. Si lo/la ves, llama al 911. Toca para ver la foto.` },
  ];
  let phones = 0;
  for (const g of groups) {
    if (!g.people.length) continue;
    await saveNotificationMany(g.people.map((m) => m.id), g.title, g.body, 'GENERAL', url, p.reviewDueAt);
    const tokens = g.people.flatMap((m) => m.tokens);
    phones += tokens.length;
    await sendExpoBatch(tokens, { title: g.title, body: g.body, actionUrl: url });
  }
  await prisma.missingPerson.update({ where: { id: p.id }, data: { pushCount: people.length } });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_ALERT', entity: 'missing_person', entityId: p.id,
    details: { customers: people.length, phones, stores: p.storeIds.length || 'all' }, storeId: null });
  res.json({ success: true, data: { customers: people.length, phones } });
}

// ── The 30-day check ──

/** HQ is told when a poster is 2 days from its check (once), so it never quietly stops showing. Returns how many were flagged. */
export async function remindMissingChecks(now: Date = new Date()): Promise<number> {
  const due = await prisma.missingPerson.findMany({ where: { status: 'ACTIVE', reviewNotifiedAt: null, reviewDueAt: { lte: new Date(now.getTime() + 2 * DAY) } } });
  for (const p of due) {
    const claimed = await prisma.missingPerson.updateMany({ where: { id: p.id, reviewNotifiedAt: null }, data: { reviewNotifiedAt: now } });
    if (claimed.count === 0) continue;
    const passed = p.reviewDueAt <= now;
    emailHQ(`Missing person poster needs a check: ${p.name}`, passed ? 'A missing person poster stopped showing: confirm it with the agency' : 'A missing person poster needs its 30-day check',
      [`${p.name} (case ${p.caseNumber}, ${p.agencyName}).`,
       passed ? 'It is no longer shown in the app because nobody confirmed it.' : `It stops showing on ${p.reviewDueAt.toDateString()} unless someone confirms it is still active.`,
       'Check with the agency, then press "Still missing" or mark it found or resolved.'],
      { path: '/missing-persons', label: 'Open missing persons' }, 'STORE_ALERT').catch(() => {});
  }
  return due.length;
}
