// Photos and PDFs in the store chat (2026-10-24). The file is kept in Cloudinary as a PRIVATE ("authenticated") asset, so its address does not
// work without a signature, and the server only signs it for people who can read the message (the message list does that: see
// chat.controller.ts, so a private line's file is as private as its text). The message row keeps only the id, kind, name and size.
//
// What goes in is checked by what the bytes ARE, not by what the phone says: a photo (JPEG, PNG, WebP or GIF) is turned upright, shrunk to
// at most 1600 px on a side and saved as a JPEG with all its hidden details removed (the place a photo was taken is never kept); a PDF is
// kept as sent, up to 5 MB. Anything else is refused.
import sharp from 'sharp';
import cloudinary from '../config/cloudinary';

export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;   // what the upload route accepts at all; a photo is shrunk below
export const ATTACHMENTS_PER_DAY = 40;              // per person: stops one phone from filling the storage
const IMAGE_SIDE = 1600;
const FOLDER = 'luckystop/chat';

export type AttachmentKind = 'IMAGE' | 'PDF';

/** What the bytes are, from their first few: null when it is neither a photo nor a PDF. */
export function sniff(b: Buffer): AttachmentKind | null {
  if (b.length < 12) return null;
  if (b.subarray(0, 5).toString('latin1') === '%PDF-') return 'PDF';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'IMAGE';                                                    // JPEG
  if (b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG') return 'IMAGE';                                      // PNG
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'IMAGE';   // WebP
  if (b.subarray(0, 3).toString('latin1') === 'GIF') return 'IMAGE';                                                       // GIF
  return null;
}

/** A name to show: no folders, no odd characters, not too long; a PDF always ends in .pdf and a photo in .jpg. */
export function cleanName(raw: unknown, kind: AttachmentKind): string {
  const base = String(raw ?? '').split(/[\\/]/).pop() ?? '';
  const noExt = base.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^\p{L}\p{N} ._()-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 60);
  const stem = noExt || (kind === 'PDF' ? 'Document' : 'Photo');
  return `${stem}.${kind === 'PDF' ? 'pdf' : 'jpg'}`;
}

export interface Prepared { kind: AttachmentKind; data: Buffer }
export type Refusal = { error: string };

/** Checks the file and makes it ready to store. A refusal says why in words the person can act on. */
export async function prepareAttachment(buffer: Buffer): Promise<Prepared | Refusal> {
  const kind = sniff(buffer);
  if (!kind) return { error: 'Send a photo (JPEG, PNG or WebP) or a PDF.' };
  if (kind === 'PDF') {
    if (buffer.length > MAX_PDF_BYTES) return { error: 'That PDF is over 5 MB. Send a smaller one.' };
    return { kind, data: buffer };
  }
  try {
    const data = await sharp(buffer, { failOn: 'error' }).rotate().resize({ width: IMAGE_SIDE, height: IMAGE_SIDE, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();   // rotate() applies the camera's turn, and no metadata is kept
    return { kind, data };
  } catch {
    return { error: 'That photo could not be read. Try another.' };
  }
}

/** Stores it privately and returns Cloudinary's id for it. */
export function storeAttachment(p: Prepared): Promise<string> {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream({ folder: FOLDER, resource_type: 'image', type: 'authenticated', overwrite: false }, (err, result) => {
      if (err || !result) reject(err ?? new Error('upload failed'));
      else resolve((result as any).public_id as string);
    }).end(p.data);
  });
}

/** Removes files from Cloudinary (the daily 90 day clean-up and "clear the chat"). A miss is logged, never thrown: the message rows are the record. */
export async function destroyAttachments(ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) {
    try { await cloudinary.uploader.destroy(id, { resource_type: 'image', type: 'authenticated', invalidate: true }); n++; }
    catch (e: any) { console.error('[chat] attachment not deleted:', id, e?.message ?? e); }
  }
  return n;
}

// A PDF cannot be delivered by an ordinary signed link on this Cloudinary account (it blocks PDF delivery, checked 2026-10-24), but a signed
// DOWNLOAD link works, and it expires. Rounded to the hour so the same message gives the same link for a while, and long enough that a phone
// that has sat on the chat for a few hours can still open it (the chat reloads the list each time it is opened).
const PDF_LINK_HOURS = 6;
const pdfLink = (id: string, now = Date.now()) => cloudinary.utils.private_download_url(id, 'pdf', { resource_type: 'image', type: 'authenticated', expires_at: Math.ceil(now / 3_600_000) * 3600 + PDF_LINK_HOURS * 3600 });

const sign = (id: string, extra: Record<string, unknown> = {}) => cloudinary.url(id, { resource_type: 'image', type: 'authenticated', sign_url: true, secure: true, ...extra });

interface Row { attachmentId: string | null; attachmentKind: string | null; attachmentName: string | null; attachmentBytes: number | null }
export interface AttachmentOut { kind: AttachmentKind; name: string; bytes: number | null; url: string; thumbUrl: string }

/** What a viewer is given for a message's file: signed links (the same link every time, so a phone caches it). null when there is none. */
export function attachmentOf(m: Row): AttachmentOut | null {
  if (!m.attachmentId || (m.attachmentKind !== 'IMAGE' && m.attachmentKind !== 'PDF')) return null;
  const pdf = m.attachmentKind === 'PDF';
  return {
    kind: m.attachmentKind, name: m.attachmentName ?? (pdf ? 'Document.pdf' : 'Photo.jpg'), bytes: m.attachmentBytes,
    url: pdf ? pdfLink(m.attachmentId) : sign(m.attachmentId, { format: 'jpg' }),
    thumbUrl: sign(m.attachmentId, { format: 'jpg', ...(pdf ? { page: 1 } : {}), transformation: [{ width: 480, height: 480, crop: 'limit', quality: 'auto' }] }),
  };
}

/** A message as the app and the admin page receive it: the file's private id is replaced by links this viewer may use. */
export function presentMessage<T extends Row>(m: T): Omit<T, 'attachmentId' | 'attachmentKind' | 'attachmentName' | 'attachmentBytes'> & { attachment: AttachmentOut | null } {
  const { attachmentId: _i, attachmentKind: _k, attachmentName: _n, attachmentBytes: _b, ...rest } = m;
  return { ...rest, attachment: attachmentOf(m) };
}
