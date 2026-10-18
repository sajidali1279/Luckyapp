// Customer receipt scanning, in testing (2026-10-11). See utils/receiptScan.ts. A scan that passes every check becomes held sales (FLAGGED,
// one per category, with the photo) for the store's managers and HQ to approve or reject in the usual review; nothing is credited before.
import { createHash } from 'crypto';
import { Response } from 'express';
import { z } from 'zod';
import { ProductCategory, TransactionStatus } from '@prisma/client';
import prisma from '../config/prisma';
import cloudinary from '../config/cloudinary';
import { AuthRequest } from '../types';
import { refuse } from '../utils/refusal';
import { audit } from '../utils/audit';
import { sendPushToUser } from '../utils/push';
import { flaggedSaleRecipientIds } from '../utils/alertRecipients';
import { computeSaleCashback } from '../utils/saleCashback';
import { gallonsFit } from '../utils/storeRules';
import { noteBudgetUse } from '../utils/offerBudget';
import { storeDateKey, storeDayStart, storeDaysBetween, startOfStoreDate } from '../utils/storeTime';
import { rule } from '../utils/appSettings';
import { sameReceipt, cleanRead, factsOf, receiptIdentity, receiptMoment, sequenceProblems, type SequencePoint } from '../utils/receiptScan';
import { checkScanCard, cardBrandOf } from '../utils/receiptCards';
import { approveAndCredit } from '../utils/saleDecision';
import { cropForReading, imageTokens } from '../utils/receiptCrop';
import { pushChallengeAwards } from '../utils/challenges';
import { pushReferralAwards } from '../utils/referrals';
import { updateCustomerTierIfNeeded } from '../utils/tier';
import {
  RECEIPT_SCAN_KEY, READ_PROMPT, canScan, loadScanSettings, matchStore, parseRead, phoneKey, saleLines, type ReceiptRead,
  HQ_ENTERED, HQ_SCAN_STATUSES,
} from '../utils/receiptScan';

export const MAX_SCANS_PER_DAY = 3;          // per customer, per store day (held or refused)
export const MAX_TRIES_PER_DAY = 8;          // counting the ones the reader could not read, so failures cannot run up the AI bill
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024; // the AI's limit for one image; the app sends a smaller one
export const MAX_RECEIPT_DAYS = 3;           // a receipt from today or up to this many days back
export const MAX_RECEIPT_TOTAL = 2000;       // like the cashier's hard limit
const READ_MODEL = 'claude-sonnet-5';

/** GET /receipt-scan/access: whether this person can scan receipts (the app shows the scanner only then). */
export async function getScanAccess(req: AuthRequest, res: Response) {
  const settings = await loadScanSettings();
  const user = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { phone: true, role: true } });
  res.json({ success: true, data: { enabled: !!user && canScan(settings, user), testing: settings.mode !== 'ALL', perDay: rule('receiptScansPerDay'), maxDays: rule('receiptMaxDays') } });
}

/** What the AI reads on a receipt photo (also HQ's Grant & Redeem page, controllers/hqReceipt.controller.ts). */
export async function readReceipt(buffer: Buffer, mediaType: string): Promise<ReceiptRead | null> {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  // Only the receipt goes to the reader, not the counter around it (utils/receiptCrop.ts): about 40% fewer image tokens (2026-10-16)
  const cut = await cropForReading(buffer, mediaType);
  if (cut.cropped) console.log(`[receipt-read] cut ${cut.from.w}x${cut.from.h} to ${cut.to.w}x${cut.to.h} (about ${imageTokens(cut.from.w, cut.from.h)} to ${imageTokens(cut.to.w, cut.to.h)} image tokens)`);
  const msg = await client.messages.create({
    model: READ_MODEL,
    max_tokens: 2500,
    messages: [{ role: 'user', content: [
      { type: 'image', source: { type: 'base64', media_type: cut.mediaType as 'image/jpeg', data: cut.buffer.toString('base64') } },
      { type: 'text', text: READ_PROMPT },
    ] }],
  }, { timeout: 45_000 });
  const text = msg.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
  return parseRead(text);
}

function upload(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder: 'luckystop/receipts', resource_type: 'image' }, (error, result) => {
      if (error || !result) reject(error ?? new Error('upload failed')); else resolve(result.secure_url);
    });
    stream.end(buffer);
  });
}

/** POST /receipt-scan (customer, multipart "image"): read the receipt, check it, and hold it for review. */
export async function scanReceipt(req: AuthRequest, res: Response) {
  const settings = await loadScanSettings();
  const customer = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!customer || !canScan(settings, customer)) { res.status(403).json({ success: false, code: 'RECEIPT_SCAN_OFF', error: 'Receipt scanning is not available for your account yet.' }); return; }
  if (!req.file) { res.status(400).json({ success: false, error: 'Take a photo of the receipt.' }); return; }
  if (!/^image\/(jpeg|png|webp)$/.test(req.file.mimetype)) { res.status(400).json({ success: false, error: 'The photo must be a JPG, PNG or WebP image.' }); return; }
  if (req.file.size > MAX_PHOTO_BYTES) { res.status(413).json({ success: false, error: 'The photo is too large. Take it again.' }); return; }
  if (!process.env.ANTHROPIC_API_KEY) { res.status(503).json({ success: false, error: 'Receipt reading is not set up on the server.' }); return; }

  // HQ's rows for this customer (receipts an employee sent HQ) are not the customer's own scans: not counted
  const todays = await prisma.receiptScan.findMany({ where: { customerId: customer.id, createdAt: { gte: storeDayStart() }, status: { notIn: HQ_SCAN_STATUSES } }, select: { status: true } });
  const perDay = rule('receiptScansPerDay');
  if (todays.filter((t) => t.status !== 'ERROR').length >= perDay || todays.length >= Math.max(MAX_TRIES_PER_DAY, perDay + 5)) { res.status(429).json({ success: false, code: 'TOO_MANY_SCANS', error: `You can scan ${perDay} receipts a day. Try again tomorrow.` }); return; }

  const imageHash = createHash('sha256').update(req.file.buffer).digest('hex');
  const used = await prisma.receiptScan.findUnique({ where: { imageHash }, select: { id: true } })
    ?? await prisma.pointsTransaction.findFirst({ where: { receiptImageHash: imageHash }, select: { id: true } });
  if (used) { res.status(409).json({ success: false, code: 'ALREADY_USED', error: 'This photo has already been used.' }); return; }

  let read: ReceiptRead | null;
  try { read = await readReceipt(req.file.buffer, req.file.mimetype); } catch (e: any) {
    console.error('[receipt-scan] read failed:', e?.message ?? e);
    // Kept for the daily limit; the fingerprint is changed so the same photo can be tried again
    await prisma.receiptScan.create({ data: { customerId: customer.id, imageHash: `${imageHash}:error:${Date.now()}`, status: 'ERROR', reason: String(e?.message ?? e).slice(0, 300) } });
    res.status(502).json({ success: false, code: 'READ_FAILED', error: 'We could not read the receipt right now. Try again in a minute.' });
    return;
  }

  // A refusal is kept (with the photo's fingerprint) so the testing shows what was read and why it was refused
  // The card on it is kept too (utils/receiptCards.ts counts every card tried, refused ones included)
  const refuseScan = async (reason: string, extra: { storeId?: string | null; receiptAt?: Date | null; total?: number | null; flags?: string[] } = {}) => {
    try {
      await prisma.receiptScan.create({ data: {
        customerId: customer.id, imageHash, status: 'REFUSED', reason, read: (read ?? undefined) as any, storeId: extra.storeId ?? null, receiptAt: extra.receiptAt ?? null, total: extra.total ?? null,
        ...(extra.flags?.length ? { flags: JSON.stringify(extra.flags) } : {}),
        ...(read?.cardLast4 ? { paymentMethod: read.paymentMethod, cardLast4: read.cardLast4, cardBrand: cardBrandOf(read) } : {}),
      } });
    } catch (e: any) {
      if (e?.code === 'P2002') { res.status(409).json({ success: false, code: 'ALREADY_USED', error: 'This photo has already been used.' }); return; }
      throw e;
    }
    res.status(422).json({ success: false, code: 'REFUSED', error: reason });
  };

  if (!read || !read.isReceipt) return refuseScan("That doesn't look like a store receipt. Take a photo of the whole paper receipt.");
  if (read.readable === 'poor') return refuseScan('The receipt could not be read. Lay it flat in good light and take the photo again, with the whole receipt in it.');
  const stores = await prisma.store.findMany({ select: { id: true, name: true, address: true, city: true, zipCode: true, phone: true, isActive: true, enabledCategories: true } });
  const store = matchStore(read, stores);
  if (!store) return refuseScan("We couldn't tell which Lucky Stop this receipt is from. Make sure the top of the receipt, with the store's address, is in the photo.");
  const full = stores.find((s) => s.id === store.id)!;
  // A cancelled or refunded sale earns nothing (a VOID TICKET is printed like any receipt, 2026-10-16)
  if (read.kind === 'VOID') return refuseScan('This is a void ticket: the sale was cancelled, so it does not earn points.', { storeId: store.id });
  if (read.kind === 'REFUND') return refuseScan('This is a refund or return receipt, so it does not earn points.', { storeId: store.id });
  if (!read.date) return refuseScan("We couldn't read the date on the receipt. Take the photo again with the date in it.", { storeId: store.id });
  // The transaction number is the receipt's identity: without it the same receipt could be scanned again by someone else
  const receiptKey = receiptIdentity(store.id, read);
  if (!receiptKey) return refuseScan("We couldn't read the transaction number (TRAN#) at the bottom of the receipt. Take the photo again with the whole bottom of the receipt in it.", { storeId: store.id });

  const todayKey = storeDateKey();
  const age = storeDaysBetween(read.date, todayKey);
  const receiptAt = receiptMoment(read, startOfStoreDate)!;
  if (age < 0) return refuseScan('The date on the receipt is in the future.', { storeId: store.id, receiptAt });
  const maxDays = rule('receiptMaxDays');
  if (age > maxDays) return refuseScan(maxDays === 0 ? `Only today's receipts can be scanned. This one is from ${read.date}.` : `Receipts can be scanned for ${maxDays} days. This one is from ${read.date}.`, { storeId: store.id, receiptAt });
  const total = read.total ?? (read.subtotal != null ? read.subtotal + (read.tax ?? 0) : null);
  if (total == null || total <= 0) return refuseScan("We couldn't read the total on the receipt.", { storeId: store.id, receiptAt });
  if (total > rule('receiptMaxTotal')) return refuseScan(`Receipts over $${rule('receiptMaxTotal')} can't be scanned. Ask the cashier.`, { storeId: store.id, receiptAt, total });

  // The same receipt photographed again (a different photo of it), by anyone. Its identity is the store and transaction number; a misread
  // number is caught by the near match (utils/receiptScan.ts sameReceipt): Stan, Invoice #, approval code, the time to the second, the money
  if (await prisma.receiptScan.findUnique({ where: { receiptKey }, select: { id: true } })) {
    return refuseScan('This receipt has already been scanned.', { storeId: store.id, receiptAt, total });
  }
  const dayStart = startOfStoreDate(read.date);
  // Every held or approved scan of that store's day, whatever total was read (a misread total skipped this check before 2026-10-13),
  // and the receipts HQ entered points from (2026-10-16)
  const sameDay = await prisma.receiptScan.findMany({
    where: { storeId: store.id, status: { in: ['HELD', 'AUTO', HQ_ENTERED] }, receiptAt: { gte: dayStart, lt: new Date(dayStart.getTime() + 30 * 3600_000) } },
    select: { customerId: true, read: true, total: true },
  });
  const here = factsOf(customer.id, read, total);
  if (sameDay.some((s) => sameReceipt(here, factsOf(s.customerId, s.read, s.total)))) {
    return refuseScan('This receipt has already been scanned.', { storeId: store.id, receiptAt, total });
  }
  // The numbers that only go up (TRAN#, Stan, Invoice #) against the store's other real receipts of that week: a made-up or edited
  // receipt rarely fits. One number out of place may be a misread (held for a manager); two or more is refused.
  const seqProblems = await storeSequenceProblems(store.id, read, receiptAt);
  if (seqProblems.length >= 2) {
    return refuseScan("The numbers on this receipt don't match the store's register. If it is your receipt, show it to the cashier.", { storeId: store.id, receiptAt, total, flags: ['SEQUENCE_MISMATCH', ...seqProblems] });
  }
  // Points already given at the register for this purchase
  const from = read.time ? new Date(receiptAt.getTime() - 45 * 60_000) : startOfStoreDate(read.date);
  const to = read.time ? new Date(receiptAt.getTime() + 120 * 60_000) : new Date(startOfStoreDate(read.date).getTime() + 30 * 3600_000);
  const atRegister = await prisma.pointsTransaction.findFirst({
    where: { customerId: customer.id, storeId: store.id, createdAt: { gte: from, lte: to }, status: { notIn: [TransactionStatus.REJECTED, TransactionStatus.CANCELLED] }, grantedById: { not: customer.id }, challengeId: null, referralId: null },
    select: { id: true },
  });
  if (atRegister) {
    // The cashier scanned this customer's QR for this very sale: the card on the receipt is theirs, proven in person (utils/receiptCards.ts)
    const sameSale = read.time && read.cardLast4 && await prisma.pointsTransaction.findFirst({
      where: { customerId: customer.id, storeId: store.id, createdAt: { gte: new Date(receiptAt.getTime() - 10 * 60_000), lte: new Date(receiptAt.getTime() + 10 * 60_000) }, status: { notIn: [TransactionStatus.REJECTED, TransactionStatus.CANCELLED] }, grantedById: { not: customer.id }, challengeId: null, referralId: null },
      select: { id: true },
    });
    return refuseScan('This purchase already earned points at the register.', { storeId: store.id, receiptAt, total, flags: sameSale ? ['AT_REGISTER', 'AT_REGISTER_CARD'] : ['AT_REGISTER'] });
  }

  // The cards this customer's receipts were paid with (utils/receiptCards.ts): how often each is seen, on which accounts, cash
  const card = { last4: read.cardLast4, brand: cardBrandOf(read), method: read.paymentMethod };
  const cardCheck = await checkScanCard(customer.id, card);
  if (cardCheck.refuse) return refuseScan(cardCheck.refuse, { storeId: store.id, receiptAt, total });

  const { lines, leftOut } = saleLines(read, full.enabledCategories);
  const prepayOnly = read.items.length > 0 && read.items.every((it) => it.prepay || it.category === 'NOT_ELIGIBLE');
  const flags: string[] = ['RECEIPT_SCAN'];
  let saleRows = lines;
  if (read.items.length === 0) {
    // A prepay receipt whose lines were not read is still fuel not pumped yet
    if (read.kind === 'PREPAY') return refuseScan('Prepaid gas earns points at the register: show your QR code when you pay, or scan the receipt printed after pumping.', { storeId: store.id, receiptAt, total });
    saleRows = [{ category: ProductCategory.OTHER, amount: read.subtotal ?? total, gallons: null }]; flags.push('ITEMS_UNREAD');
  }
  if (saleRows.length === 0) {
    return refuseScan(prepayOnly && read.items.some((it) => it.prepay)
      ? 'Prepaid gas earns points at the register: show your QR code when you pay, or scan the receipt printed after pumping.'
      : 'Nothing on this receipt earns points (for example lottery or gift cards).', { storeId: store.id, receiptAt, total });
  }
  if (read.items.some((it) => it.prepay)) flags.push('PREPAY_LEFT_OUT');
  if (read.copy === 'MERCHANT') flags.push('MERCHANT_COPY');
  if (read.readable === 'partial') flags.push('READ_PARTIAL');
  if (read.concerns.length) flags.push('READER_CONCERNS');
  if (!read.time) flags.push('NO_TIME');
  if (seqProblems.length) flags.push('SEQUENCE_ODD');
  flags.push(...cardCheck.flags);
  const itemsSum = read.items.reduce((n, it) => n + it.amount, 0);
  const expected = read.subtotal ?? (read.total != null && read.tax != null ? read.total - read.tax : null);
  if (expected != null && read.items.length && Math.abs(itemsSum - expected) > Math.max(1, expected * 0.05)) flags.push('TOTALS_DIFFER');

  // The scan is saved first: the same photo or receipt sent twice at once stops here, so it makes one set of sales
  let scanId: string;
  try {
    scanId = (await prisma.receiptScan.create({ data: {
      customerId: customer.id, storeId: store.id, imageHash, receiptKey, receiptAt, total, status: 'HELD', flags: JSON.stringify(flags), read: read as any,
      paymentMethod: read.paymentMethod, cardLast4: read.cardLast4, cardBrand: cardBrandOf(read),
    }, select: { id: true } })).id;
  } catch (e: any) {
    if (e?.code === 'P2002') { res.status(409).json({ success: false, code: 'ALREADY_USED', error: 'This receipt has already been scanned.' }); return; }
    throw e;
  }

  // Price each line like a cashier's grant, then hold every one for review
  const now = new Date();
  const created: { id: string; category: ProductCategory; amount: number; points: number }[] = [];
  let imageUrl: string;
  try { imageUrl = await upload(req.file.buffer); } catch (e: any) {
    await prisma.receiptScan.update({ where: { id: scanId }, data: { status: 'ERROR', reason: `Photo upload failed: ${String(e?.message ?? e).slice(0, 200)}`, imageHash: `${imageHash}:error:${Date.now()}`, receiptKey: null } });
    res.status(502).json({ success: false, code: 'UPLOAD_FAILED', error: 'The photo could not be saved. Try again in a minute.' });
    return;
  }
  for (const [i, line] of saleRows.entries()) {
    const gallons = line.gallons != null && gallonsFit(line.amount, line.gallons) ? line.gallons : null;   // a misread is estimated from the store price instead
    const priced = await computeSaleCashback({ customer, storeId: store.id, purchaseAmount: line.amount, category: line.category, gasGallons: gallons, now });
    const lineFlags = [...flags, ...priced.rateCappedFlags];
    if (line.amount > rule('reviewHighAmount') && !priced.isGasCategory) lineFlags.push('HIGH_AMOUNT');
    if (line.amount > rule('reviewLargePurchase')) lineFlags.push('LARGE_PURCHASE');
    const sale = await prisma.pointsTransaction.create({
      data: {
        customerId: customer.id, grantedById: customer.id, storeId: store.id,
        purchaseAmount: line.amount, pointsAwarded: priced.pointsAwarded, devCut: priced.devCut, storeCost: priced.storeCost,
        cashbackRate: priced.effectiveCashbackRate, category: line.category, status: TransactionStatus.FLAGGED, fraudFlags: JSON.stringify(lineFlags),
        notes: `Receipt scan: ${read.date}${read.time ? ` ${read.time}` : ''}${read.receiptNumber ? `, receipt ${read.receiptNumber}` : ''}, total $${total.toFixed(2)} (read by AI)${leftOut.length ? `. Left out: ${leftOut.slice(0, 5).join(', ')}` : ''}${read.concerns.length ? `. Reader notes: ${read.concerns.join('; ')}` : ''}`,
        isGas: priced.isGasCategory, gasGallons: priced.effectiveGallons ?? null, gasBonusPoints: priced.gasBonusPoints,
        offerId: priced.promotionApplied ? priced.activeOffer!.id : null, offerCashback: priced.offerCashback,
        receiptImageUrl: imageUrl, receiptImageHash: i === 0 ? imageHash : null,
      },
    });
    if (priced.promotionApplied && priced.activeOffer?.budgetCap != null) noteBudgetUse(priced.activeOffer, now).catch(() => {});
    created.push({ id: sale.id, category: line.category, amount: line.amount, points: Math.round((priced.pointsAwarded + priced.gasBonusPoints) * 100) });
  }
  // One receipt with several categories is one sale: its lines share the first line's id (HQ's Transactions page shows them together)
  if (created.length > 1) await prisma.pointsTransaction.updateMany({ where: { id: { in: created.map((c) => c.id) } }, data: { saleId: created[0].id } });
  await prisma.receiptScan.update({ where: { id: scanId }, data: { imageUrl, transactionIds: created.map((c) => c.id) } });

  // A clean scan is credited at once (Settings > Receipt scanning): clearly read, nothing odd, under the amount, an account that is not
  // brand new, under the weekly number, and not picked for the random spot check. Everything else waits for a manager.
  const lineFlagsAll = await prisma.pointsTransaction.findMany({ where: { id: { in: created.map((c) => c.id) } }, select: { fraudFlags: true } });
  const allFlags = [...new Set(lineFlagsAll.flatMap((l) => { try { return JSON.parse(l.fraudFlags ?? '[]') as string[]; } catch { return ['UNREADABLE']; } }))];
  const accountDays = customer.createdAt ? (now.getTime() - new Date(customer.createdAt).getTime()) / 86_400_000 : 0;
  const autoThisWeek = await prisma.receiptScan.count({ where: { customerId: customer.id, status: 'AUTO', createdAt: { gte: new Date(now.getTime() - 7 * 86_400_000) } } });
  const clean = cleanRead(read, allFlags) && total <= rule('receiptAutoApproveMax') && accountDays >= rule('receiptAutoMinAccountDays') && autoThisWeek < rule('receiptAutoPerWeek');
  const spotCheck = clean && Math.random() * 100 < rule('receiptSpotCheckPercent');
  let approved = false;
  if (clean && !spotCheck) {
    let latest: any = null;
    for (const c of created) {
      const sale = await prisma.pointsTransaction.findUnique({ where: { id: c.id } });
      if (!sale) continue;
      const credited = await prisma.$transaction((db) => approveAndCredit(db, sale, TransactionStatus.FLAGGED));
      if (credited) {
        latest = credited;
        pushChallengeAwards(credited.challengeAwards).catch(() => {});
        pushReferralAwards(credited.referralAwards).catch(() => {});
      }
    }
    if (latest) {
      approved = true;
      await updateCustomerTierIfNeeded(customer.id, latest.periodPoints, latest.tier).catch(() => {});
      await prisma.receiptScan.update({ where: { id: scanId }, data: { status: 'AUTO', flags: JSON.stringify([...flags, 'AUTO_APPROVED']) } });
      sendPushToUser(customer.id, '💰 Receipt approved', `Your $${total.toFixed(2)} receipt from ${store.name} was approved. ${created.reduce((n, c) => n + c.points, 0)} pts added.`, 'POINTS');
    }
  }
  if (!approved) {
    if (spotCheck) {
      await prisma.receiptScan.update({ where: { id: scanId }, data: { flags: JSON.stringify([...flags, 'SPOT_CHECK']) } });
      for (const c of created) {
        const sale = await prisma.pointsTransaction.findUnique({ where: { id: c.id }, select: { fraudFlags: true } });
        const f = (() => { try { return JSON.parse(sale?.fraudFlags ?? '[]') as string[]; } catch { return [] as string[]; } })();
        await prisma.pointsTransaction.update({ where: { id: c.id }, data: { fraudFlags: JSON.stringify([...f, 'SPOT_CHECK']) } });
      }
    }
    // The people who review held sales at that store are told
    const who = customer.name || 'A customer';
    for (const id of await flaggedSaleRecipientIds(store.id)) {
      sendPushToUser(id, '📸 Receipt scan to review', `${who} scanned a $${total.toFixed(2)} receipt from ${store.name}. Check the photo and approve or reject it.`, 'ALERT');
    }
  }
  audit({ actorId: customer.id, actorName: customer.name, actorRole: customer.role, action: 'RECEIPT_SCAN', entity: 'transaction', entityId: created[0].id,
    details: { summary: `Scanned a $${total.toFixed(2)} receipt from ${store.name} (${read.date}); ${approved ? 'approved at once' : spotCheck ? 'held as a spot check' : 'held for review'}`, flags }, storeId: store.id });

  res.status(201).json({ success: true, data: {
    status: approved ? 'APPROVED' : 'HELD', store: store.name, date: read.date, time: read.time, total,
    lines: created.map(({ category, amount, points }) => ({ category, amount, points })),
    points: created.reduce((n, c) => n + c.points, 0),
  } });
}

/**
 * The store's real receipts around this one (a week each way: scans held or approved, and receipts HQ entered; never rejected ones, so a
 * fake cannot set the pattern), and which of this receipt's always-rising numbers do not fit them (utils/receiptScan.ts sequenceProblems).
 */
export async function storeSequenceProblems(storeId: string, read: ReceiptRead, at: Date): Promise<string[]> {
  if (!read.receiptNumber && !read.stan && !read.invoice) return [];
  const rows = await prisma.receiptScan.findMany({
    where: { storeId, status: { in: ['HELD', 'AUTO', HQ_ENTERED] }, receiptAt: { gte: new Date(at.getTime() - 7 * 86_400_000), lte: new Date(at.getTime() + 7 * 86_400_000) } },
    select: { receiptAt: true, read: true, transactionIds: true },
    take: 500,
  });
  const ids = rows.flatMap((r) => r.transactionIds ?? []);
  const rejected = new Set(ids.length ? (await prisma.pointsTransaction.findMany({ where: { id: { in: ids }, status: TransactionStatus.REJECTED }, select: { id: true } })).map((x) => x.id) : []);
  const known: SequencePoint[] = rows
    .filter((r) => r.receiptAt && !(r.transactionIds?.length && r.transactionIds.every((t) => rejected.has(t))))
    .map((r) => { const k = r.read as any; return { at: r.receiptAt!, receiptNumber: k?.receiptNumber ?? null, stan: k?.stan ?? null, invoice: k?.invoice ?? null, register: k?.register ?? null }; });
  return sequenceProblems({ at, receiptNumber: read.receiptNumber, stan: read.stan, invoice: read.invoice, register: read.register }, known);
}

/** GET /receipt-scan/mine: the customer's latest scans and what became of them. */
export async function getMyScans(req: AuthRequest, res: Response) {
  const scans = await prisma.receiptScan.findMany({
    where: { customerId: req.user!.id, status: { notIn: HQ_SCAN_STATUSES } }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, status: true, reason: true, total: true, receiptAt: true, createdAt: true, transactionIds: true, store: { select: { name: true } } },
  });
  const ids = scans.flatMap((s) => s.transactionIds);
  const sales = ids.length ? await prisma.pointsTransaction.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, pointsAwarded: true, gasBonusPoints: true } }) : [];
  res.json({ success: true, data: scans.map((s) => {
    const mine = sales.filter((x) => s.transactionIds.includes(x.id));
    const outcome = s.status !== 'HELD' && s.status !== 'AUTO' ? s.status : mine.every((x) => x.status === 'APPROVED') ? 'APPROVED' : mine.some((x) => x.status === 'REJECTED') ? 'REJECTED' : 'WAITING';
    return { id: s.id, status: outcome, reason: s.reason, store: s.store?.name ?? null, total: s.total, receiptAt: s.receiptAt, createdAt: s.createdAt,
      points: Math.round(mine.reduce((n, x) => n + x.pointsAwarded + x.gasBonusPoints, 0) * 100) };
  }) });
}

const settingsSchema = z.object({
  mode: z.enum(['OFF', 'TEST', 'ALL'], { message: 'Choose Off, Test accounts or Everyone.' }),
  testPhones: z.array(z.string()).max(50, 'At most 50 test phones.'),
});

/** GET /receipt-scan/settings (HQ) */
export async function getScanSettings(_req: AuthRequest, res: Response) {
  res.json({ success: true, data: await loadScanSettings() });
}

/** PUT /receipt-scan/settings (HQ): who can scan receipts. Turning it on for everyone is its own step, after testing. */
export async function putScanSettings(req: AuthRequest, res: Response) {
  const parsed = settingsSchema.safeParse(req.body ?? {});
  if (!parsed.success) { refuse(res, parsed.error); return; }
  const testPhones = [...new Set(parsed.data.testPhones.map(phoneKey))];
  const bad = parsed.data.testPhones.filter((p) => phoneKey(p).length !== 10);
  if (bad.length) { res.status(400).json({ success: false, error: `Not a phone number: ${bad.slice(0, 3).join(', ')}` }); return; }
  const before = await loadScanSettings();
  const value = { mode: parsed.data.mode, testPhones };
  await prisma.appConfig.upsert({ where: { key: RECEIPT_SCAN_KEY }, create: { key: RECEIPT_SCAN_KEY, value: JSON.stringify(value) }, update: { value: JSON.stringify(value) } });
  const word = { OFF: 'off', TEST: 'test accounts only', ALL: 'everyone' };
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'RECEIPT_SCAN_SETTINGS', entity: 'app_config', entityId: RECEIPT_SCAN_KEY,
    details: { summary: `Receipt scanning: ${word[before.mode]} to ${word[value.mode]}; ${testPhones.length} test phone${testPhones.length === 1 ? '' : 's'}` }, storeId: null });
  res.json({ success: true, data: value });
}

/** GET /receipt-scan/recent (HQ): the latest scans with what the AI read, for checking how well it reads while testing. */
export async function getRecentScans(req: AuthRequest, res: Response) {
  const take = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const scans = await prisma.receiptScan.findMany({
    where: { status: { notIn: HQ_SCAN_STATUSES } },   // the customers' own scans; HQ's are on its sales
    orderBy: { createdAt: 'desc' }, take,
    select: { id: true, status: true, reason: true, flags: true, total: true, receiptAt: true, createdAt: true, imageUrl: true, read: true, transactionIds: true,
      customer: { select: { id: true, name: true, phone: true } }, store: { select: { name: true } } },
  });
  const ids = scans.flatMap((s) => s.transactionIds);
  const sales = ids.length ? await prisma.pointsTransaction.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, category: true, purchaseAmount: true, pointsAwarded: true } }) : [];
  res.json({ success: true, data: scans.map((s) => ({ ...s, flags: s.flags ? JSON.parse(s.flags) : [], sales: sales.filter((x) => s.transactionIds.includes(x.id)) })) });
}
