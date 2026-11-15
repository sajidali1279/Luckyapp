// Cashier receipts read in the background (2026-11-15, the owner): a cashier grants points with a receipt photo; that paper receipt
// must not earn again when someone else (a friend, a spouse) scans it in the app. The cashier's sale is never slowed: the photo is
// queued as the sale is saved and read a minute or so later, by the cheapest model, for its identity only (store, TRAN#, date, time,
// total). A customer scan with that TRAN# is then refused at once (controllers/receiptScan.controller.ts). A scan that comes before the
// queue has got to it reads the waiting photos of that store and time first.
import cron from 'node-cron';
import prisma from '../config/prisma';
import { cropForReading } from './receiptCrop';
import { receiptIdentity, receiptMoment } from './receiptScan';
import { startOfStoreDate } from './storeTime';
import { feature } from './appSettings';

export const REGISTER_READ_MODEL = 'claude-haiku-4-5';   // identity only: the cheapest model is enough
const MAX_TRIES = 3;
const PER_RUN = 15;

/** Put a cashier's receipt photo in the queue (one row per photo: the lines of one sale share it). Never throws. */
export async function queueRegisterReceipt(r: { transactionId: string; storeId: string; customerId: string; imageUrl: string; imageHash: string }): Promise<void> {
  try {
    await prisma.registerReceipt.createMany({ data: [{ ...r, status: 'PENDING' }], skipDuplicates: true });
  } catch (e: any) { console.error('[register-receipt] not queued:', e?.message ?? e); }
}

const PROMPT = `This is a photo of a store receipt. Read only these, exactly as printed, and answer with JSON and nothing else:
{"date":"YYYY-MM-DD or null","time":"HH:MM 24-hour or null","seconds":number or null,"receiptNumber":"the transaction number (TRAN#, Trans, Receipt #) or null",
"total":number or null,"subtotal":number or null,"tax":number or null,"cardLast4":"4 digits or null","stan":"or null","invoice":"or null","authCode":"or null"}`;

export interface RegisterRead { date: string | null; time: string | null; seconds: number | null; receiptNumber: string | null; total: number | null; subtotal: number | null;
  tax: number | null; cardLast4: string | null; stan: string | null; invoice: string | null; authCode: string | null }

export function parseRegisterRead(text: string): RegisterRead | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o: any;
  try { o = JSON.parse(m[0]); } catch { return null; }
  const str = (v: unknown, re?: RegExp) => (typeof v === 'string' && v.trim() && (!re || re.test(v.trim())) ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v.replace(/[$,]/g, ''))) ? Number(v.replace(/[$,]/g, '')) : null);
  return {
    date: str(o.date, /^\d{4}-\d{2}-\d{2}$/), time: str(o.time, /^\d{2}:\d{2}$/), seconds: Number.isInteger(o.seconds) && o.seconds >= 0 && o.seconds < 60 ? o.seconds : null,
    receiptNumber: str(o.receiptNumber), total: num(o.total), subtotal: num(o.subtotal), tax: num(o.tax),
    cardLast4: str(o.cardLast4, /^\d{4}$/), stan: str(o.stan), invoice: str(o.invoice), authCode: str(o.authCode),
  };
}

/** Read one photo (the Anthropic call; a test passes its own) */
export type Reader = (buffer: Buffer, mediaType: string) => Promise<string>;
const anthropicReader: Reader = async (buffer, mediaType) => {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const cut = await cropForReading(buffer, mediaType);
  const msg = await client.messages.create({
    model: REGISTER_READ_MODEL, max_tokens: 300,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: cut.mediaType as 'image/jpeg', data: cut.buffer.toString('base64') } },
      { type: 'text', text: PROMPT },
    ] }],
  }, { timeout: 30_000 });
  return msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
};
let reader: Reader = anthropicReader;
let fetchPhoto = async (url: string): Promise<{ buffer: Buffer; mediaType: string }> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`photo ${r.status}`);
  return { buffer: Buffer.from(await r.arrayBuffer()), mediaType: r.headers.get('content-type')?.split(';')[0] || 'image/jpeg' };
};
/** For tests */
export function setRegisterReaderForTest(r: Reader, f: typeof fetchPhoto) { reader = r; fetchPhoto = f; }

/** Read one queued receipt and keep its identity. Claims it first, so two runs never read the same photo. */
export async function readRegisterReceipt(id: string): Promise<'READ' | 'NO_NUMBER' | 'FAILED' | 'SKIPPED'> {
  const claim = await prisma.registerReceipt.updateMany({ where: { id, status: 'PENDING', tries: { lt: MAX_TRIES } }, data: { tries: { increment: 1 } } });
  if (!claim.count) return 'SKIPPED';
  const row = await prisma.registerReceipt.findUnique({ where: { id } });
  if (!row) return 'SKIPPED';
  try {
    const photo = await fetchPhoto(row.imageUrl);
    const read = parseRegisterRead(await reader(photo.buffer, photo.mediaType));
    if (!read) throw new Error('nothing read');
    const key = receiptIdentity(row.storeId, read);
    const at = receiptMoment(read, startOfStoreDate);
    await prisma.registerReceipt.update({ where: { id }, data: {
      status: key ? 'READ' : 'NO_NUMBER', receiptKey: key, receiptAt: at && Number.isFinite(at.getTime()) ? at : null, total: read.total, read: read as any, readAt: new Date(),
    } });
    return key ? 'READ' : 'NO_NUMBER';
  } catch (e: any) {
    const failed = row.tries >= MAX_TRIES;   // row.tries already counts this try (the claim above)
    await prisma.registerReceipt.update({ where: { id }, data: { status: failed ? 'FAILED' : 'PENDING', error: String(e?.message ?? e).slice(0, 200) } }).catch(() => {});
    return failed ? 'FAILED' : 'SKIPPED';
  }
}

/** The queue, oldest first: what one run reads. */
export async function readRegisterQueue(limit = PER_RUN): Promise<number> {
  if (!feature('registerReceiptReading') || !process.env.ANTHROPIC_API_KEY) return 0;
  const rows = await prisma.registerReceipt.findMany({ where: { status: 'PENDING', tries: { lt: MAX_TRIES } }, orderBy: { createdAt: 'asc' }, take: limit, select: { id: true } });
  let n = 0;
  for (const r of rows) if ((await readRegisterReceipt(r.id)) === 'READ') n++;
  return n;
}

/** A customer scan arrived before the queue got there: the waiting photos of that store around that time are read now (at most 6). */
export async function readWaitingNear(storeId: string, from: Date, to: Date): Promise<void> {
  if (!feature('registerReceiptReading')) return;
  const rows = await prisma.registerReceipt.findMany({ where: { storeId, status: 'PENDING', tries: { lt: MAX_TRIES }, createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, take: 6, select: { id: true } });
  await Promise.all(rows.map((r) => readRegisterReceipt(r.id).catch(() => 'FAILED')));
}

export function startRegisterReceiptCron() {
  let running = false;
  cron.schedule('* * * * *', () => {
    if (running) return;
    running = true;
    readRegisterQueue().catch((e) => console.error('[register-receipt] run failed:', e?.message ?? e)).finally(() => { running = false; });
  }, { timezone: 'UTC' });
  console.log('[register-receipt] Cashier receipt photos are read for their receipt number in the background (every minute)');
}
