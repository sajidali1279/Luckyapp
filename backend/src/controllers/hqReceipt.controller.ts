// Receipt auto-fill on HQ's Grant & Redeem page (2026-10-16). An employee with no phone sends HQ a photo of the receipt: the same AI
// reader as the customer's receipt scan (controllers/receiptScan.controller.ts) fills in the sale's lines, and the receipt is checked
// against everything that could mean it was already used: the same photo on another sale, the customer (or anyone) scanning it in the
// app, HQ entering it before, points already given at the register. HQ sees each warning and decides; nothing here gives points.
// Once HQ grants from it, the read is linked to the sales (status HQ), so a customer who later scans the same receipt is refused.
import { createHash } from 'crypto';
import { Response } from 'express';
import { ProductCategory, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { readReceipt, storeSequenceProblems } from './receiptScan.controller';
import { HQ_READ, HQ_ENTERED, factsOf, matchStore, sameReceipt, saleLines, receiptIdentity, receiptMoment, type ReceiptRead } from '../utils/receiptScan';
import { brandKey, cardBrandOf } from '../utils/receiptCards';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { storeDateKey, storeDaysBetween, startOfStoreDate, storeTimeText } from '../utils/storeTime';

export const MAX_HQ_READS_PER_HOUR = 120;     // all of HQ together: a stuck loop cannot run up the AI bill
const MAX_AI_PHOTO = 5 * 1024 * 1024;         // the reader's limit for one image; the page sends a smaller copy
const money = (n: number) => `$${n.toFixed(2)}`;

export type ReadWarning = { code: string; text: string; serious: boolean };


/** POST /points/hq/receipt-read (HQ, multipart "image" + customerQrCode, storeId, originalHash): read a receipt for the page. */
export async function hqReadReceipt(req: AuthRequest, res: Response) {
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ success: false, code: 'READER_OFF', error: 'Receipt reading is not set up on the server. Type the amounts in.' }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: 'Add the photo of the receipt.' }); return; }
  if (!/^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) { res.status(400).json({ success: false, error: 'The photo must be a JPG, PNG or WebP image.' }); return; }
  if (req.file.size > MAX_AI_PHOTO) { res.status(413).json({ success: false, error: 'The photo is too large to read. Use a smaller copy (a screenshot of it works).' }); return; }
  const { customerQrCode, storeId } = req.body as { customerQrCode?: string; storeId?: string };
  if (!customerQrCode || !storeId) { res.status(400).json({ success: false, error: 'Pick the store and the customer first.' }); return; }
  // The fingerprint of the photo as the employee sent it (the page reads a smaller copy): the one the sale's receipt upload will have
  const original = typeof req.body.originalHash === 'string' && /^[0-9a-f]{64}$/.test(req.body.originalHash) ? req.body.originalHash : null;
  const imageHash = original ?? createHash('sha256').update(req.file.buffer).digest('hex');

  const [customer, picked] = await Promise.all([
    prisma.user.findUnique({ where: { qrCode: customerQrCode }, select: { id: true, name: true, role: true } }),
    prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, enabledCategories: true } }),
  ]);
  if (!customer) { res.status(404).json({ success: false, error: 'Customer QR code not found' }); return; }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  if (!picked) { res.status(404).json({ success: false, error: 'That store does not exist.' }); return; }

  const lastHour = await prisma.receiptScan.count({ where: { status: { in: [HQ_READ, HQ_ENTERED] }, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (lastHour >= MAX_HQ_READS_PER_HOUR) { res.status(429).json({ success: false, error: 'Many receipts were read in the last hour. Type the amounts in, or try again later.' }); return; }

  const warnings: ReadWarning[] = [];
  const warn = (code: string, text: string, serious = false) => warnings.push({ code, text, serious });

  // The same photo already used
  const [onSale, scanned] = await Promise.all([
    prisma.pointsTransaction.findFirst({ where: { receiptImageHash: imageHash }, select: { createdAt: true, customer: { select: { name: true } }, store: { select: { name: true } } } }),
    prisma.receiptScan.findUnique({ where: { imageHash }, select: { id: true, status: true, customerId: true } }),
  ]);
  if (onSale) warn('PHOTO_USED', `This exact photo is already on a sale: ${onSale.customer?.name ?? 'a customer'} at ${onSale.store?.name ?? 'a store'}, ${storeTimeText(onSale.createdAt)} on ${storeDateKey(onSale.createdAt)}.`, true);
  else if (scanned && scanned.status !== HQ_READ) warn('PHOTO_USED', 'This exact photo was already scanned in the app.', true);

  let read: ReceiptRead | null;
  try { read = await readReceipt(req.file.buffer, req.file.mimetype); } catch (e: any) {
    console.error('[hq-receipt] read failed:', e?.message ?? e);
    res.status(502).json({ success: false, code: 'READ_FAILED', error: 'The receipt could not be read right now. Try again in a minute, or type the amounts in.' });
    return;
  }
  if (!read || !read.isReceipt) { res.status(422).json({ success: false, code: 'NOT_A_RECEIPT', error: "That doesn't look like a store receipt. Ask the employee for a photo of the whole paper receipt." }); return; }
  if (read.readable === 'poor') { res.status(422).json({ success: false, code: 'UNREADABLE', error: 'The receipt could not be read. Ask for a flat, well lit photo with the whole receipt in it, or type the amounts in.' }); return; }

  // Which store printed it
  const stores = await prisma.store.findMany({ select: { id: true, name: true, address: true, city: true, zipCode: true, phone: true, isActive: true, enabledCategories: true } });
  const match = matchStore(read, stores);
  if (!match) warn('STORE_UNKNOWN', "The store could not be told from the receipt. Check it is one of ours.");
  else if (match.id !== picked.id) warn('STORE_DIFFERENT', `This receipt is from ${match.name}, not ${picked.name}. Switch the store if the employee works there.`, true);
  const storeForLines = stores.find((s) => s.id === (match?.id ?? picked.id))!;

  // What kind of receipt (2026-10-16): a void or refund earns nothing; fuel prepaid before pumping is not counted
  if (read.kind === 'VOID') warn('VOID', 'This is a VOID TICKET: the sale was cancelled. It should not earn points.', true);
  if (read.kind === 'REFUND') warn('REFUND', 'This is a refund or return receipt. It should not earn points.', true);
  if (read.items.some((it) => it.prepay)) warn('PREPAY', 'Prepaid gas is not counted: what was pumped is not on this receipt. Ask for the receipt printed after pumping.');
  if (!read.receiptNumber) warn('NO_TRAN', 'The transaction number (TRAN#) could not be read, so this receipt cannot be marked as used. Check it was not entered before.');

  // When
  const at = receiptMoment(read, startOfStoreDate);
  if (!read.date) warn('NO_DATE', 'The date could not be read.');
  else {
    const age = storeDaysBetween(read.date, storeDateKey());
    if (age < 0) warn('FUTURE', `The date on the receipt (${read.date}) is in the future.`, true);
    else if (age > 0) warn('NOT_TODAY', `This receipt is from ${read.date}, ${age} day${age === 1 ? '' : 's'} ago.`, age > 3);
  }

  const total = read.total ?? (read.subtotal != null ? read.subtotal + (read.tax ?? 0) : null);
  if (total == null) warn('NO_TOTAL', 'The total could not be read.');

  // The same receipt already scanned in the app or entered by HQ (another photo of it), by anyone
  const checkStore = match?.id ?? picked.id;
  if (read.date && total != null) {
    const key = receiptIdentity(checkStore, read);
    const exact = key ? await prisma.receiptScan.findUnique({ where: { receiptKey: key }, select: { status: true, customer: { select: { name: true } } } }) : null;
    const dayStart = startOfStoreDate(read.date);
    const sameDay = exact ? [] : await prisma.receiptScan.findMany({
      where: { storeId: checkStore, status: { in: ['HELD', 'AUTO', HQ_ENTERED] }, receiptAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 30 * 3600_000) } },
      select: { customerId: true, read: true, total: true, status: true, customer: { select: { name: true } } },
    });
    const here = factsOf(customer.id, read, total);
    const twin = exact ?? sameDay.find((s) => sameReceipt(here, factsOf(s.customerId, s.read, s.total)));
    if (twin) {
      const who = twin.customer?.name ?? 'a customer';
      warn('ALREADY_USED', twin.status === HQ_ENTERED ? `HQ already entered this receipt, for ${who}.` : `${who} already scanned this receipt in the app.`, true);
    }
  }
  // The always-rising numbers against the store's other real receipts (a made-up or edited receipt rarely fits)
  if (at && read.time) {
    const off = await storeSequenceProblems(checkStore, read, at);
    const names: Record<string, string> = { receiptNumber: 'transaction number', stan: 'Stan', invoice: 'Invoice #' };
    if (off.length) warn('SEQUENCE', `The ${off.map((f) => names[f] ?? f).join(' and ')} do${off.length === 1 ? 'es' : ''} not fit the store's other receipts of that time. The receipt may be edited or misread: check the photo.`, off.length >= 2);
  }

  // Points already given for this purchase (at the register, or by HQ)
  if (at && read.date) {
    const from = read.time ? new Date(at.getTime() - 45 * 60_000) : at;
    const to = read.time ? new Date(at.getTime() + 120 * 60_000) : new Date(at.getTime() + 30 * 3600_000);
    const given = await prisma.pointsTransaction.findFirst({
      where: { customerId: customer.id, storeId: checkStore, createdAt: { gte: from, lte: to }, status: { not: TransactionStatus.REJECTED }, challengeId: null, referralId: null },
      select: { purchaseAmount: true, createdAt: true },
    });
    if (given) warn('ALREADY_GIVEN', `${customer.name ?? 'This customer'} already got points at that store around then (${money(given.purchaseAmount)} at ${storeTimeText(given.createdAt)}).`, true);
  }

  // The lines, as the customer's scan makes them
  const { lines, leftOut } = saleLines(read, storeForLines.enabledCategories);
  let suggested = lines;
  if (read.items.length === 0) {
    warn('ITEMS_UNREAD', 'The items could not be read: the whole amount is on one line. Split it by category if you can.');
    const amount = read.subtotal ?? total;
    suggested = amount != null && amount > 0 ? [{ category: ProductCategory.OTHER, amount, gallons: null }] : [];
  }
  if (read.readable === 'partial') warn('READ_PARTIAL', 'Part of the receipt was cut off or blurry. Check the amounts against the photo.');
  for (const c of read.concerns) warn('READER_NOTE', `The reader noticed: ${c}`, /edit|written over|screen|fake|alter/i.test(c));
  const itemsSum = read.items.reduce((n, it) => n + it.amount, 0);
  const expected = read.subtotal ?? (read.total != null && read.tax != null ? read.total - read.tax : null);
  if (expected != null && read.items.length && Math.abs(itemsSum - expected) > Math.max(1, expected * 0.05)) warn('TOTALS_DIFFER', `The lines add up to ${money(itemsSum)} but the receipt says ${money(expected)} before tax.`);
  if (leftOut.length) warn('LEFT_OUT', `Not counted (no points): ${leftOut.slice(0, 5).join(', ')}${leftOut.length > 5 ? '…' : ''}.`);

  // Kept until HQ grants from it (then linked) so the same receipt is caught both ways; the same photo read again updates the same row
  let readId: string | null = null;
  const data = {
    customerId: customer.id, storeId: checkStore, receiptAt: at, total, read: read as any, status: HQ_READ,
    flags: JSON.stringify(warnings.map((w) => w.code)), reason: `HQ:${req.user!.id}`,
    paymentMethod: read.paymentMethod, cardLast4: read.cardLast4, cardBrand: cardBrandOf(read),
  };
  if (scanned?.status === HQ_READ) readId = (await prisma.receiptScan.update({ where: { id: scanned.id }, data, select: { id: true } })).id;
  else if (!scanned) {
    try { readId = (await prisma.receiptScan.create({ data: { ...data, imageHash }, select: { id: true } })).id; } catch (e: any) { if (e?.code !== 'P2002') throw e; }
  }

  res.json({ success: true, data: {
    readId,
    store: match ? { id: match.id, name: match.name } : null,
    date: read.date, time: read.time, receiptNumber: read.receiptNumber, total, subtotal: read.subtotal, tax: read.tax,
    payment: read.paymentMethod ? { method: read.paymentMethod, brand: cardBrandOf(read) ?? brandKey(read.cardBrand), last4: read.cardLast4 } : null,
    lines: suggested.map((l) => ({ category: l.category, amount: l.amount, gallons: l.gallons })),
    readable: read.readable,
    warnings,
  } });
}

/** POST /points/hq/receipt-read/:id/link { transactionIds } (HQ): the sales granted from this read; the receipt now counts as used. */
export async function hqLinkReceipt(req: AuthRequest, res: Response) {
  const ids = Array.isArray(req.body?.transactionIds) ? (req.body.transactionIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  if (ids.length === 0) { res.status(400).json({ success: false, error: 'No sales to link.' }); return; }
  const scan = await prisma.receiptScan.findUnique({ where: { id: req.params.id } });
  if (!scan || scan.status !== HQ_READ) { res.status(409).json({ success: false, error: 'That receipt read is not waiting to be used.' }); return; }
  const sales = await prisma.pointsTransaction.findMany({ where: { id: { in: ids } }, select: { id: true, customerId: true, grantedById: true, storeId: true, receiptImageUrl: true } });
  const ok = sales.length === new Set(ids).size && sales.every((s) => s.customerId === scan.customerId && s.grantedById === req.user!.id && s.storeId === sales[0].storeId && !!s.receiptImageUrl);
  if (!ok) { res.status(400).json({ success: false, error: 'Those sales do not belong to this receipt read.' }); return; }
  const read = scan.read as unknown as ReceiptRead | null;
  const key = read ? receiptIdentity(sales[0].storeId, read) : null;
  const linked = { status: HQ_ENTERED, storeId: sales[0].storeId, transactionIds: sales.map((s) => s.id) };
  try {
    await prisma.receiptScan.update({ where: { id: scan.id }, data: { ...linked, receiptKey: key } });
  } catch (e: any) {
    if (e?.code !== 'P2002') throw e;
    await prisma.receiptScan.update({ where: { id: scan.id }, data: linked });   // the exact key is another scan's: the near match still finds it
  }
  res.json({ success: true });
}
