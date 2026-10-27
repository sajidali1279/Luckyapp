// The photos of an invoice for PDI (2026-10-27). Kept in Cloudinary as PRIVATE ("authenticated") images, like the chat's files
// (utils/chatAttachments.ts): a supplier's prices are not for an open link. A photo is checked by what its bytes are, turned upright, kept
// at up to 2400 px on its long side (enough to read it again later) and saved as a JPEG with its hidden details removed.
import sharp from 'sharp';
import cloudinary from '../config/cloudinary';
import { sniff } from './chatAttachments';

const FOLDER = 'luckystop/pdi-invoices';
const KEEP_SIDE = 2400;

/** A photo ready to store and read, or why it cannot be used. */
export async function preparePhoto(buffer: Buffer): Promise<{ data: Buffer } | { error: string }> {
  if (sniff(buffer) !== 'IMAGE') return { error: 'Each photo must be a JPEG, PNG or WebP picture.' };
  try {
    const data = await sharp(buffer, { failOn: 'error' }).rotate()
      .resize({ width: KEEP_SIDE, height: KEEP_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return { data };
  } catch {
    return { error: 'A photo could not be opened. Take it again.' };
  }
}

/** Stores it privately and returns Cloudinary's id for it. */
export function storePhoto(data: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: FOLDER, resource_type: 'image', type: 'authenticated', overwrite: false }, (err, result) => {
      if (err || !result) reject(err ?? new Error('upload failed'));
      else resolve((result as any).public_id as string);
    }).end(data);
  });
}

const sign = (id: string, extra: Record<string, unknown> = {}) => cloudinary.url(id, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, format: 'jpg', ...extra });

/** Signed links for the review page: the photo, and a small copy for the strip of thumbnails. */
export function photoLinks(id: string): { url: string; thumbUrl: string } {
  return { url: sign(id), thumbUrl: sign(id, { transformation: [{ width: 320, height: 320, crop: 'limit', quality: 'auto' }] }) };
}

/** The stored photo's bytes, to read it again. */
export async function fetchPhoto(id: string): Promise<Buffer> {
  const res = await fetch(sign(id));
  if (!res.ok) throw new Error(`photo ${id}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Removes photos (an invoice deleted). A miss is logged, never thrown. */
export async function destroyPhotos(ids: string[]): Promise<void> {
  for (const id of ids) {
    try { await cloudinary.uploader.destroy(id, { resource_type: 'image', type: 'authenticated', invalidate: true }); }
    catch (e: any) { console.error('[pdi] photo not deleted:', id, e?.message ?? e); }
  }
}
