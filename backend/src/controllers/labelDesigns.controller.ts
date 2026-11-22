// Label designs, the picture library and deal stickers (2026-11-21, admin Labels > Designs and Deal stickers). HQ makes them; every
// store reads them to print. A design changed or removed tells the stores whose labels use it to reprint those labels.
import { Response } from 'express';
import { z } from 'zod';
import cloudinary from '../config/cloudinary';
import { LabelTemplate, Role } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { audit } from '../utils/audit';
import { refuse } from '../utils/refusal';
import { hasMinRole } from '../middleware/auth';
import { designSchema, textScaleField } from '../utils/labelDesign';

const actor = (req: AuthRequest) => ({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function canTouchStore(userId: string, userRole: Role, storeId: string): Promise<boolean> {
  if (hasMinRole(userRole, Role.SUPER_ADMIN)) return true;
  const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { allStoresAccess: true } });
  if (dbUser?.allStoresAccess) return true;
  return !!(await prisma.userStoreRole.findUnique({ where: { userId_storeId: { userId, storeId } } }));
}

/** Every store holding a printed label of this design is told to reprint it. How many store copies that was. */
async function reprintDesign(designId: string): Promise<number> {
  const { count } = await prisma.storeLabel.updateMany({ where: { label: { designId }, printedAt: { not: null } }, data: { printedAt: null } });
  return count;
}

// ─── Designs ──────────────────────────────────────────────────────────────

/** GET /labels/designs: every design, with how many items and stickers use it (everyone who prints reads these). */
export async function listDesigns(_req: AuthRequest, res: Response) {
  const designs = await prisma.labelDesign.findMany({ orderBy: { name: 'asc' }, include: { _count: { select: { labels: true, stickers: true } } } });
  res.json({ success: true, data: designs.map(({ _count, ...d }) => ({ ...d, itemCount: _count.labels, stickerCount: _count.stickers })) });
}

/** POST /labels/designs { name, settings }: HQ makes a design. */
export async function createDesign(req: AuthRequest, res: Response) {
  const parsed = designSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  if (await prisma.labelDesign.findFirst({ where: { name: { equals: parsed.data.name, mode: 'insensitive' } }, select: { id: true } })) {
    res.status(409).json({ success: false, error: `There is already a design called "${parsed.data.name}".` }); return;
  }
  const design = await prisma.labelDesign.create({ data: { name: parsed.data.name, settings: parsed.data.settings, createdById: req.user!.id } });
  audit({ ...actor(req), action: 'LABEL_DESIGN', entity: 'label', entityId: design.id, details: { summary: `Label design "${design.name}" made`, settings: parsed.data.settings }, storeId: null });
  res.status(201).json({ success: true, data: { ...design, itemCount: 0, stickerCount: 0 } });
}

/** PUT /labels/designs/:id { name, settings }: HQ changes a design. Stores that printed labels in it are told to reprint them. */
export async function updateDesign(req: AuthRequest, res: Response) {
  const parsed = designSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const before = await prisma.labelDesign.findUnique({ where: { id: req.params.id } });
  if (!before) { res.status(404).json({ success: false, error: 'That design no longer exists.' }); return; }
  if (await prisma.labelDesign.findFirst({ where: { id: { not: before.id }, name: { equals: parsed.data.name, mode: 'insensitive' } }, select: { id: true } })) {
    res.status(409).json({ success: false, error: `There is already a design called "${parsed.data.name}".` }); return;
  }
  const looksSame = JSON.stringify(before.settings) === JSON.stringify(parsed.data.settings);
  const design = await prisma.labelDesign.update({ where: { id: before.id }, data: { name: parsed.data.name, settings: parsed.data.settings } });
  const reprint = looksSame ? 0 : await reprintDesign(design.id);
  audit({ ...actor(req), action: 'LABEL_DESIGN', entity: 'label', entityId: design.id,
    details: { summary: `Label design "${before.name}" changed${design.name !== before.name ? ` (now "${design.name}")` : ''}; ${plural(reprint, 'store label', 'store labels')} to reprint`, before: before.settings, after: parsed.data.settings }, storeId: null });
  res.json({ success: true, data: design, reprint });
}

/** DELETE /labels/designs/:id: its items go back to their built-in design and are reprinted; its stickers too. */
export async function deleteDesign(req: AuthRequest, res: Response) {
  const before = await prisma.labelDesign.findUnique({ where: { id: req.params.id }, include: { _count: { select: { labels: true, stickers: true } } } });
  if (!before) { res.status(404).json({ success: false, error: 'That design no longer exists.' }); return; }
  const reprint = await reprintDesign(before.id);
  await prisma.labelDesign.delete({ where: { id: before.id } });   // labels and stickers keep their built-in design (designId set to null)
  audit({ ...actor(req), action: 'LABEL_DESIGN', entity: 'label', entityId: before.id,
    details: { summary: `Label design "${before.name}" removed; ${plural(before._count.labels, 'item', 'items')} and ${plural(before._count.stickers, 'sticker', 'stickers')} back on their built-in design; ${plural(reprint, 'store label', 'store labels')} to reprint` }, storeId: null });
  res.json({ success: true, data: { reprint } });
}

// ─── Picture library ──────────────────────────────────────────────────────

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

/** GET /labels/images */
export async function listImages(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: await prisma.labelImage.findMany({ orderBy: { name: 'asc' } }) });
}

/** POST /labels/images (form: image, name): HQ adds a picture. Kept small (at most 600 px), with its photo details (place, camera) dropped. */
export async function uploadImage(req: AuthRequest, res: Response) {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) { res.status(400).json({ success: false, error: 'Give the picture a name, like "Chips bag".' }); return; }
  if (name.length > 40) { res.status(400).json({ success: false, error: 'Keep the name under 40 characters.' }); return; }
  const file = req.file;
  if (!file) { res.status(400).json({ success: false, error: 'Choose a picture to upload.' }); return; }
  if (!IMAGE_TYPES.includes(file.mimetype)) { res.status(400).json({ success: false, error: 'Use a PNG, JPG or WebP picture.' }); return; }
  const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'luckystop/label-images', resource_type: 'image', transformation: [{ width: 600, height: 600, crop: 'limit' }], image_metadata: false },
      (err, r) => (err || !r ? reject(err) : resolve(r as unknown as { secure_url: string; public_id: string })),
    ).end(file.buffer);
  });
  // Every delivered copy without its photo details (place, camera): the URL asks for the stripped version
  const url = result.secure_url.replace('/image/upload/', '/image/upload/fl_strip_profile/');
  const image = await prisma.labelImage.create({ data: { name, url, publicId: result.public_id } });
  audit({ ...actor(req), action: 'LABEL_IMAGE', entity: 'label', entityId: image.id, details: { summary: `Sticker picture "${name}" added` }, storeId: null });
  res.status(201).json({ success: true, data: image });
}

/** DELETE /labels/images/:id: stickers using it simply show one picture fewer. */
export async function deleteImage(req: AuthRequest, res: Response) {
  const image = await prisma.labelImage.findUnique({ where: { id: req.params.id } });
  if (!image) { res.status(404).json({ success: false, error: 'That picture no longer exists.' }); return; }
  await prisma.labelImage.delete({ where: { id: image.id } });
  if (image.publicId) cloudinary.uploader.destroy(image.publicId, { resource_type: 'image', invalidate: true }).catch(() => undefined);
  const used = await prisma.dealSticker.count({ where: { imageIds: { has: image.id } } });
  audit({ ...actor(req), action: 'LABEL_IMAGE', entity: 'label', entityId: image.id, details: { summary: `Sticker picture "${image.name}" removed (${plural(used, 'sticker', 'stickers')} used it)` }, storeId: null });
  res.json({ success: true, data: { stickersUsing: used } });
}

// ─── Deal stickers ────────────────────────────────────────────────────────

const stickerSchema = z.object({
  words: z.string({ message: 'Write the deal, like "Chips + 24oz".' }).trim().min(1, 'Write the deal, like "Chips + 24oz".').max(30, 'Keep the deal under 30 characters (it has to fit on the sticker).'),
  subText: z.string().trim().max(48, 'Keep the small line under 48 characters.').nullish().transform((v) => (v ? v : null)),
  priceText: z.string({ message: 'Give the price, like 5.00.' }).trim().min(1, 'Give the price, like 5.00.').max(10, 'Keep the price under 10 characters.')
    .regex(/^[0-9A-Za-z$./ ]+$/, 'The price can have numbers, letters, $, . and / (like 5.00 or 2/$5).'),
  imageIds: z.array(z.string().uuid()).max(3, 'A sticker holds at most 3 pictures.').default([]),
  designId: z.string().uuid().nullish().transform((v) => v ?? null),
  template: z.nativeEnum(LabelTemplate).default(LabelTemplate.CLASSIC_RED_BLACK),
  textScale: textScaleField.optional().transform((v) => v ?? null),
  storeIds: z.array(z.string().uuid()).max(100).default([]),
  isActive: z.boolean().default(true),
}).strict();

async function stickerProblem(d: z.infer<typeof stickerSchema>): Promise<string | null> {
  if (d.imageIds.length && (await prisma.labelImage.count({ where: { id: { in: d.imageIds } } })) !== new Set(d.imageIds).size) return 'One of the pictures is no longer in the library.';
  if (d.designId && !(await prisma.labelDesign.findUnique({ where: { id: d.designId }, select: { id: true } }))) return 'That design no longer exists.';
  if (d.storeIds.length && (await prisma.store.count({ where: { id: { in: d.storeIds } } })) !== new Set(d.storeIds).size) return 'One of the stores does not exist.';
  return null;
}

/** The stickers with their pictures (in order; a removed picture is left out). */
async function withImages<T extends { imageIds: string[] }>(rows: T[]) {
  const ids = [...new Set(rows.flatMap((r) => r.imageIds))];
  const images = new Map((ids.length ? await prisma.labelImage.findMany({ where: { id: { in: ids } } }) : []).map((i) => [i.id, i]));
  return rows.map((r) => ({ ...r, images: r.imageIds.map((id) => images.get(id)).filter(Boolean).map((i) => ({ id: i!.id, name: i!.name, url: i!.url })) }));
}

/** GET /labels/stickers[?storeId=]: HQ sees every sticker; a store sees the switched-on ones for it. */
export async function listStickers(req: AuthRequest, res: Response) {
  const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : '';
  const hq = hasMinRole(req.user!.role, Role.SUPER_ADMIN);
  if (!hq) {
    if (!storeId) { res.status(400).json({ success: false, error: 'Choose a store.' }); return; }
    if (!(await canTouchStore(req.user!.id, req.user!.role, storeId))) { res.status(403).json({ success: false, error: "You don't have access to that store" }); return; }
  }
  const where = hq && !storeId ? {} : { isActive: true, OR: [{ storeIds: { isEmpty: true } }, { storeIds: { has: storeId } }] };
  const rows = await prisma.dealSticker.findMany({ where, orderBy: [{ isActive: 'desc' }, { updatedAt: 'desc' }] });
  res.json({ success: true, data: await withImages(rows) });
}

/** POST /labels/stickers */
export async function createSticker(req: AuthRequest, res: Response) {
  const parsed = stickerSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const d = { ...parsed.data, imageIds: [...new Set(parsed.data.imageIds)], storeIds: [...new Set(parsed.data.storeIds)] };
  const problem = await stickerProblem(d);
  if (problem) { res.status(400).json({ success: false, error: problem }); return; }
  const sticker = await prisma.dealSticker.create({ data: d });
  audit({ ...actor(req), action: 'DEAL_STICKER', entity: 'label', entityId: sticker.id, details: { summary: `Deal sticker "${sticker.words}" $${sticker.priceText} made` }, storeId: null });
  res.status(201).json({ success: true, data: (await withImages([sticker]))[0] });
}

/** PUT /labels/stickers/:id */
export async function updateSticker(req: AuthRequest, res: Response) {
  const parsed = stickerSchema.safeParse(req.body);
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const before = await prisma.dealSticker.findUnique({ where: { id: req.params.id } });
  if (!before) { res.status(404).json({ success: false, error: 'That sticker no longer exists.' }); return; }
  const d = { ...parsed.data, imageIds: [...new Set(parsed.data.imageIds)], storeIds: [...new Set(parsed.data.storeIds)] };
  const problem = await stickerProblem(d);
  if (problem) { res.status(400).json({ success: false, error: problem }); return; }
  const sticker = await prisma.dealSticker.update({ where: { id: before.id }, data: d });
  audit({ ...actor(req), action: 'DEAL_STICKER', entity: 'label', entityId: sticker.id, details: { summary: `Deal sticker "${before.words}" changed`, before, after: sticker }, storeId: null });
  res.json({ success: true, data: (await withImages([sticker]))[0] });
}

/** DELETE /labels/stickers/:id */
export async function deleteSticker(req: AuthRequest, res: Response) {
  const before = await prisma.dealSticker.findUnique({ where: { id: req.params.id } });
  if (!before) { res.status(404).json({ success: false, error: 'That sticker no longer exists.' }); return; }
  await prisma.dealSticker.delete({ where: { id: before.id } });
  audit({ ...actor(req), action: 'DEAL_STICKER', entity: 'label', entityId: before.id, details: { summary: `Deal sticker "${before.words}" removed` }, storeId: null });
  res.json({ success: true });
}
