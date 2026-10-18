// Missing person posters (2026-10-18). Only HQ posts them, and only from an official source (a police case number, an AMBER Alert):
// anyone can call a person "missing", including someone looking for a person who fled from them, so a poster needs an agency and a case
// number HQ has checked. Customers see an active poster on Home at the stores it is for, and can call the agency or 911; tips go to the
// police, never to the app. HQ can send one push to those stores' customers. A poster stays up until HQ marks it found or resolved; every
// 30 days HQ confirms it is still active, or it stops showing. When it ends, the photo is deleted and the personal details are cleared.
// Customers can ask HQ to post someone, with the police case number (see Customer requests below); HQ checks it with the agency first.
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import cloudinary from '../config/cloudinary';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { resolveAudience, type AudienceMember } from '../utils/audience';
import { saveNotificationMany, sendPushToUser } from '../utils/push';
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

// ── Customer requests (2026-10-18) ──
// A customer can ask HQ to post someone, but only with a police case number: HQ checks it with the agency before anything shows. One open
// request per person, at most 3 in 30 days, none from a restricted account. The requester's phone is for HQ's call back only.

const RELATIONSHIPS = ['FAMILY', 'FRIEND', 'OTHER'] as const;
const REQUESTS_PER_MONTH = 3;
const requestSchema = z.object({
  name: fields.name, age: fields.age, lastSeenAt: fields.lastSeenAt, lastSeenPlace: fields.lastSeenPlace, description: fields.description,
  agencyName: fields.agencyName,
  agencyPhone: z.string().trim().optional().transform((v) => (v ? phoneDigits(v) : null)).refine((v) => v === null || v.length === 10, 'Enter the agency\'s 10-digit phone number, or leave it empty.'),
  caseNumber: z.string().trim().min(3, 'Enter the police case or report number.').max(40),
  relationship: z.enum(RELATIONSHIPS, { errorMap: () => ({ message: 'Choose how you know them.' }) }),
  contactPhone: z.string().trim().optional().transform((v) => (v ? phoneDigits(v) : null)).refine((v) => v === null || v.length === 10, 'Enter a 10-digit phone number HQ can call you on.'),
  storeId: z.string().uuid().optional().or(z.literal('').transform(() => undefined)),
  // the requester says they have reported it to the police: required, like the case number
  policeReported: z.preprocess((v) => v === true || v === 'true', z.literal(true, { errorMap: () => ({ message: 'Report it to the police first. We can only post a person the police have a report for.' }) })),
});
/** What a request keeps once HQ has decided (or it expired): no person, no photo, no phone. */
const CLEARED = { name: '', age: null, photoUrl: null, photoPublicId: null, lastSeenPlace: '', description: null, requesterPhone: '' };

/** Tells the requester what happened, in their language. */
async function tellRequester(userId: string, kind: 'APPROVED' | 'DECLINED' | 'EXPIRED', info: { name: string; reason?: string | null; posterId?: string }) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { language: true } });
  const es = u?.language === 'es';
  const text = {
    APPROVED: es ? ['Tu cartel de persona desaparecida está publicado', `HQ lo verificó con la policía y publicó el cartel de ${info.name}. Gracias.`]
                 : ['Your missing person poster is up', `HQ checked it with the police and posted the poster for ${info.name}. Thank you.`],
    DECLINED: es ? ['No pudimos publicar tu solicitud', `${info.reason ?? ''} Por favor sigue en contacto con la policía.`.trim()]
                 : ['We could not post your missing person request', `${info.reason ?? ''} Please keep working with the police.`.trim()],
    EXPIRED: es ? ['No pudimos verificar tu solicitud a tiempo', 'Tu solicitud de persona desaparecida se borró. Sigue en contacto con la policía; puedes enviar una nueva.']
                : ['We could not check your request in time', 'Your missing person request was deleted. Please keep working with the police; you can send a new one.'],
  }[kind];
  await sendPushToUser(userId, text[0], text[1], 'GENERAL', kind === 'APPROVED' && info.posterId ? `/(customer)/missing/${info.posterId}` : undefined);
}

/** POST /missing-persons/requests (customer, multipart: photo + fields): ask HQ to post someone. */
export async function requestMissing(req: AuthRequest, res: Response) {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: firstError(parsed.error) }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: 'Add a recent photo of the person.' }); return; }
  const d = parsed.data;
  if (new Date(d.lastSeenAt).getTime() > Date.now() + DAY) { res.status(400).json({ success: false, error: 'The last-seen date cannot be in the future.' }); return; }
  const me = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { phone: true, isActive: true, fraudNote: true } });
  if (!me || !me.isActive || me.fraudNote) { res.status(403).json({ success: false, error: 'This account cannot send requests. Please call the police directly.' }); return; }
  const open = await prisma.missingPersonRequest.count({ where: { requesterId: req.user!.id, status: 'PENDING' } });
  if (open > 0) { res.status(409).json({ success: false, error: 'HQ is still checking your last request. You can send another once they have answered.' }); return; }
  const recent = await prisma.missingPersonRequest.count({ where: { requesterId: req.user!.id, createdAt: { gt: new Date(Date.now() - 30 * DAY) } } });
  if (recent >= REQUESTS_PER_MONTH) { res.status(429).json({ success: false, error: 'You have sent the most requests allowed for this month. Please work with the police directly.' }); return; }
  if (d.storeId && !(await prisma.store.findUnique({ where: { id: d.storeId }, select: { id: true } }))) { res.status(400).json({ success: false, error: 'That store was not found.' }); return; }
  let photo: { url: string; publicId: string };
  try { photo = await uploadPhoto(req.file.buffer); } catch { res.status(502).json({ success: false, error: 'The photo could not be saved. Try again.' }); return; }
  const r = await prisma.missingPersonRequest.create({
    data: {
      requesterId: req.user!.id, requesterPhone: d.contactPhone ?? phoneDigits(me.phone), relationship: d.relationship, storeId: d.storeId ?? null,
      name: d.name, age: d.age, lastSeenAt: new Date(d.lastSeenAt), lastSeenPlace: d.lastSeenPlace, description: d.description,
      agencyName: d.agencyName, agencyPhone: d.agencyPhone, caseNumber: d.caseNumber, photoUrl: photo.url, photoPublicId: photo.publicId,
    },
  });
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_REQUESTED', entity: 'missing_person_request', entityId: r.id,
    details: { caseNumber: r.caseNumber, agency: r.agencyName }, storeId: r.storeId });
  emailHQ(`A customer asked to post a missing person: ${r.name}`, 'A customer asked HQ to post a missing person',
    [`${r.name}${r.age != null ? `, ${r.age}` : ''}, last seen ${r.lastSeenPlace}.`, `Police: ${r.agencyName}, case ${r.caseNumber}.`,
     'Check the case with the agency before posting it. If nobody answers it, it is deleted after 30 days.'],
    { path: '/missing-persons', label: 'Open missing persons' }, 'STORE_ALERT').catch(() => {});
  res.status(201).json({ success: true, data: { id: r.id } });
}

/** GET /missing-persons/requests/mine : the requester's open request (so the app shows "HQ is checking it"), if any. */
export async function getMyMissingRequest(req: AuthRequest, res: Response) {
  const r = await prisma.missingPersonRequest.findFirst({ where: { requesterId: req.user!.id, status: 'PENDING' }, orderBy: { createdAt: 'desc' }, select: { id: true, name: true, createdAt: true } });
  res.json({ success: true, data: r });
}

/** GET /missing-persons/requests (HQ): requests waiting for a check (oldest first, with the requester), then the last decided ones. */
export async function listMissingRequests(_req: AuthRequest, res: Response) {
  const [pending, decided] = await Promise.all([
    prisma.missingPersonRequest.findMany({ where: { status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 100 }),
    prisma.missingPersonRequest.findMany({ where: { status: { not: 'PENDING' } }, orderBy: { decidedAt: 'desc' }, take: 30 }),
  ]);
  const ids = [...new Set([...pending, ...decided].map((r) => r.requesterId))];
  const people = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(people.map((u) => [u.id, u.name ?? 'Customer']));
  const storeIds = [...new Set(pending.map((r) => r.storeId).filter((s): s is string => !!s))];
  const stores = storeIds.length ? await prisma.store.findMany({ where: { id: { in: storeIds } }, select: { id: true, name: true } }) : [];
  const storeOf = new Map(stores.map((s) => [s.id, s.name]));
  res.json({ success: true, data: {
    pending: pending.map((r) => ({ ...r, requesterName: nameOf.get(r.requesterId) ?? 'Customer', storeName: r.storeId ? storeOf.get(r.storeId) ?? null : null,
      expiresAt: new Date(r.createdAt.getTime() + REVIEW_DAYS * DAY) })),
    decided: decided.map((r) => ({ id: r.id, status: r.status, caseNumber: r.caseNumber, agencyName: r.agencyName, declineReason: r.declineReason, posterId: r.posterId,
      decidedAt: r.decidedAt, createdAt: r.createdAt, requesterName: nameOf.get(r.requesterId) ?? 'Customer' })),
  } });
}

/**
 * POST /missing-persons/requests/:id/approve (HQ, multipart: the poster fields, photo optional): HQ checked the case with the agency and
 * posts it. The poster takes the request's photo unless HQ picks a better one. The requester is told.
 */
export async function approveMissingRequest(req: AuthRequest, res: Response) {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: firstError(parsed.error) }); return; }
  const d = parsed.data;
  if (new Date(d.lastSeenAt).getTime() > Date.now() + DAY) { res.status(400).json({ success: false, error: 'The last-seen date cannot be in the future.' }); return; }
  const stores = d.storeIds.length ? await prisma.store.count({ where: { id: { in: d.storeIds } } }) : 0;
  if (stores !== d.storeIds.length) { res.status(400).json({ success: false, error: 'One of the stores was not found.' }); return; }
  const r = await prisma.missingPersonRequest.findUnique({ where: { id: req.params.id } });
  if (!r || r.status !== 'PENDING') { res.status(404).json({ success: false, error: 'This request has already been answered.' }); return; }
  const requestPhoto = { url: r.photoUrl, publicId: r.photoPublicId }, requesterId = r.requesterId;   // read before the request is cleared
  if (!req.file && !requestPhoto.url) { res.status(400).json({ success: false, error: 'Add a photo.' }); return; }
  const now = new Date();
  const claimed = await prisma.missingPersonRequest.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: 'APPROVED', decidedAt: now, decidedById: req.user!.id } });
  if (claimed.count === 0) { res.status(409).json({ success: false, error: 'This request has already been answered.' }); return; }
  let photo = { url: requestPhoto.url!, publicId: requestPhoto.publicId };
  if (req.file) {
    try { photo = await uploadPhoto(req.file.buffer); }
    catch {
      await prisma.missingPersonRequest.update({ where: { id: r.id }, data: { status: 'PENDING', decidedAt: null, decidedById: null } });
      res.status(502).json({ success: false, error: 'The photo could not be saved. Try again.' }); return;
    }
  }
  const p = await prisma.missingPerson.create({
    data: {
      name: d.name, age: d.age, lastSeenAt: new Date(d.lastSeenAt), lastSeenPlace: d.lastSeenPlace, description: d.description, descriptionEs: d.descriptionEs,
      agencyName: d.agencyName, agencyPhone: phoneDigits(d.agencyPhone), caseNumber: d.caseNumber, sourceUrl: d.sourceUrl, urgent: d.urgent, storeIds: d.storeIds,
      photoUrl: photo.url, photoPublicId: photo.publicId, reviewDueAt: new Date(now.getTime() + REVIEW_DAYS * DAY), createdById: req.user!.id,
    },
  });
  await prisma.missingPersonRequest.update({ where: { id: r.id }, data: { ...CLEARED, posterId: p.id } });
  if (req.file) await deletePhoto(requestPhoto.publicId);   // HQ chose a better photo: the requester's copy goes
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_POSTED', entity: 'missing_person', entityId: p.id,
    details: { name: p.name, caseNumber: p.caseNumber, agency: p.agencyName, stores: d.storeIds.length || 'all', fromRequest: r.id }, storeId: null });
  tellRequester(requesterId, 'APPROVED', { name: p.name, posterId: p.id }).catch(() => {});
  res.status(201).json({ success: true, data: p });
}

/** POST /missing-persons/requests/:id/decline { reason } (HQ): not posted; the photo and details are deleted and the requester is told why. */
export async function declineMissingRequest(req: AuthRequest, res: Response) {
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 300) : '';
  if (reason.length < 3) { res.status(400).json({ success: false, error: 'Say why, so the customer knows (they are sent this).' }); return; }
  const r = await prisma.missingPersonRequest.findUnique({ where: { id: req.params.id } });
  if (!r || r.status !== 'PENDING') { res.status(404).json({ success: false, error: 'This request has already been answered.' }); return; }
  const photoId = r.photoPublicId, requesterId = r.requesterId, name = r.name, caseNumber = r.caseNumber, agency = r.agencyName;   // read before the request is cleared
  const { count } = await prisma.missingPersonRequest.updateMany({ where: { id: r.id, status: 'PENDING' },
    data: { ...CLEARED, status: 'DECLINED', declineReason: reason, decidedAt: new Date(), decidedById: req.user!.id } });
  if (count === 0) { res.status(409).json({ success: false, error: 'This request has already been answered.' }); return; }
  await deletePhoto(photoId);
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'MISSING_PERSON_REQUEST_DECLINED', entity: 'missing_person_request', entityId: r.id,
    details: { caseNumber, agency, reason }, storeId: null });
  tellRequester(requesterId, 'DECLINED', { name, reason }).catch(() => {});
  res.json({ success: true });
}

/**
 * Daily: a request nobody answered in 30 days is cleared (photo deleted) and the requester told; cleared records go 30 days after.
 * Returns { expired, deleted }.
 */
export async function purgeMissingRequests(now: Date = new Date()): Promise<{ expired: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - REVIEW_DAYS * DAY);
  const stale = await prisma.missingPersonRequest.findMany({ where: { status: 'PENDING', createdAt: { lt: cutoff } } });
  let expired = 0;
  for (const r of stale) {
    const photoId = r.photoPublicId, requesterId = r.requesterId, name = r.name;   // read before the request is cleared
    const { count } = await prisma.missingPersonRequest.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { ...CLEARED, status: 'EXPIRED', decidedAt: now } });
    if (count === 0) continue;
    expired++;
    await deletePhoto(photoId);
    tellRequester(requesterId, 'EXPIRED', { name }).catch(() => {});
  }
  const { count: deleted } = await prisma.missingPersonRequest.deleteMany({ where: { status: { not: 'PENDING' }, decidedAt: { lt: cutoff } } });
  return { expired, deleted };
}
