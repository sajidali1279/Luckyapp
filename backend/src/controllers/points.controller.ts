import { createHash } from 'crypto';
import { gallonsFit, GAS_PRICE_MIN, GAS_PRICE_MAX } from '../utils/storeRules';
import { offerPaysAt } from '../utils/offerHours';
import { forCustomer } from '../utils/offerAudience';
import { promotionRoom, noteBudgetUse } from '../utils/offerBudget';
import { pushChallengeAwards } from '../utils/challenges';
import { pushReferralAwards } from '../utils/referrals';
import { Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma';
import { AuthRequest } from '../types';
import { OfferType, Prisma, ProductCategory, Role, TransactionStatus, Tier } from '@prisma/client';
import { hasMinRole } from '../middleware/auth';
import cloudinary from '../config/cloudinary';
import { audit } from '../utils/audit';
import { sendPushToUser } from '../utils/push';
import { pointsUrl, redemptionUrl } from '../utils/notificationRoutes';
import { CASHBACK_RATE_CAP, CASHBACK_RATE_WARN, DEFAULT_DEV_CUT_RATE, DEFAULT_TIER_RATES } from '../config/constants';
import { getCurrentPeriod, gasBonusPerGallon, getNextTierProgress, getStoredThresholds, updateCustomerTierIfNeeded, effectiveTier, rollCustomerPeriod } from '../utils/tier';
import { pickOffer, percentBonus, isCentsPerGallon } from '../utils/offerPick';
import { storeDayStart, storeDayEnd, storeMonthStart, storeDateKey, addStoreDays, startOfStoreDate, endOfStoreDate, isRealDateKey, storeDateText, storeTimeText } from '../utils/storeTime';
import { approveAndCredit, rejectIfStill, ALREADY_DECIDED_MESSAGE } from '../utils/saleDecision';
import { csvText } from '../utils/csv';
import { flaggedSaleRecipientIds } from '../utils/alertRecipients';
import { refuseIfStoreClosed } from '../utils/storeRules';
import { emailHQ } from '../utils/adminEmail';
import { COMPARE_RANGES, CompareRange, compareWindows, summarize } from '../utils/dashboardWindows';
import { classifyCashbackRatio } from './billing.controller';
import { transactionSearchWhere } from '../utils/transactionSearch';
import { lockCustomer, REPEAT_WINDOW_MS } from '../utils/moneyGuards';
import { isCustomerAccount, NOT_A_CUSTOMER } from '../utils/customerOnly';
import { computeSaleCashback } from '../utils/saleCashback';
import { rule } from '../utils/appSettings';
import { resolveServedBy, servedByDetails, storeStaff } from '../utils/servedBy';
import { customerSearchWhere } from '../utils/customerSearch';
import { excludeDeletedCustomers } from '../utils/accountDeletion';
import { useLots, voidSaleLots, expiredPartOfSale, expirySummary, lotsMatch, undoExpiry } from '../utils/pointLots';
import { UNFINISHED, SHOWN, AWAITING_DECISION, NOT_A_SALE, cancelUnfinished } from '../utils/unfinishedSales';

// A challenge's reward line (utils/challenges.ts) is cashback but not a sale: the counts of sales leave it out, the sums keep it
const saleCount = (c: unknown) => { const n = (c ?? {}) as { _all?: number; challengeId?: number; referralId?: number }; return (n._all ?? 0) - (n.challengeId ?? 0) - (n.referralId ?? 0); };

// Employee: initiate a points grant (before receipt upload)
const grantSchema = z.object({
  customerQrCode: z.string().optional(),
  // Instead of the QR: a receipt the customer left behind, added to their sale (any line of it) from the Recent tab (2026-10-18)
  addToSaleId: z.string().uuid().optional(),
  storeId: z.string().uuid(),
  purchaseAmount: z.number().positive(),
  category: z.nativeEnum(ProductCategory).optional().default(ProductCategory.OTHER),
  notes: z.string().optional(),
  // Gas fields
  isGas: z.boolean().optional().default(false),
  gasGallons: z.number().positive().optional(),
  gasPricePerGallon: z.number().positive().optional(),
  // HQ's Grant & Redeem page: the employee who served the customer (utils/servedBy.ts). HQ only.
  servedById: z.string().max(64).optional(),
  // The lines of this same sale already created (HQ's page sends a multi-line sale one line at a time, so a retry carries on where it
  // stopped): they are not a duplicate of this line nor a repeat sale. Only this granter's own unfinished lines for this customer count.
  siblingIds: z.array(z.string().uuid()).max(19).optional(),
});

// The cashier's points preview (2026-10-12): what a grant of these lines would pay this customer at this store now, worked out by the
// same code as the grant (tier, category, the promotion that applies to them, the 10% ceiling, the Gold+ gas bonus). Nothing is saved.
const previewSchema = z.object({
  customerQrCode: z.string().min(1),
  storeId: z.string().uuid(),
  lines: z.array(z.object({
    category: z.nativeEnum(ProductCategory),
    amount: z.number().positive().max(100_000),
    gasGallons: z.number().positive().optional(),
  })).min(1).max(20),
});

/** POST /points/preview */
export async function previewGrant(req: AuthRequest, res: Response) {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: parsed.error.flatten() }); return; }
  const { customerQrCode, storeId, lines } = parsed.data;
  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer || !isCustomerAccount(customer)) { res.status(404).json({ success: false, error: 'Customer QR code not found' }); return; }
  const now = new Date();
  const out: { points: number; promotion: string | null; capped: boolean; gallonsFit: boolean }[] = [];
  for (const l of lines) {
    const isGasLine = l.category === ProductCategory.GAS || l.category === ProductCategory.DIESEL;
    const fits = !isGasLine || l.gasGallons == null || gallonsFit(l.amount, l.gasGallons);
    const p = await computeSaleCashback({ customer, storeId, purchaseAmount: l.amount, category: l.category, gasGallons: fits ? l.gasGallons ?? null : null, now });
    out.push({ points: Math.round((p.pointsAwarded + p.gasBonusPoints) * 10000) / 100, promotion: p.promotionApplied, capped: p.rateCappedFlags.length > 0, gallonsFit: fits });
  }
  res.json({ success: true, data: { lines: out, total: Math.round(out.reduce((n, l) => n + l.points, 0)) } });
}

export async function initiateGrant(req: AuthRequest, res: Response) {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { customerQrCode, addToSaleId, storeId, purchaseAmount, category, notes, isGas, gasGallons, gasPricePerGallon, servedById, siblingIds } = parsed.data;
  const employee = req.user!;
  if (!customerQrCode && !addToSaleId) { res.status(400).json({ success: false, error: 'Scan the customer\'s QR code.' }); return; }
  if (addToSaleId && servedById) { res.status(400).json({ success: false, error: 'A receipt the customer left is added by the cashier who served them.' }); return; }
  // A receipt the customer left behind: no QR, so only to this cashier's own sale of the last hour, at this store, a few a day
  const addOnOf = addToSaleId ? await addOnTarget(employee.id, addToSaleId, storeId) : null;
  if (addOnOf && !addOnOf.ok) { res.status(addOnOf.status).json({ success: false, code: addOnOf.code, error: addOnOf.error }); return; }
  const served = await resolveServedBy(employee, servedById, storeId);
  if (!served.ok) { res.status(served.status).json({ success: false, error: served.error }); return; }
  const servedBy = served.servedBy;
  // The cashier the checks below are about: the employee HQ entered it for, or whoever is granting
  const cashierId = servedBy?.id ?? employee.id;
  const byCashier: Prisma.PointsTransactionWhereInput = servedBy ? { OR: [{ grantedById: cashierId }, { servedById: cashierId }] } : { grantedById: cashierId };

  // Prevent employee from granting to themselves
  const customer = addOnOf?.ok ? addOnOf.customer : await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR code not found' });
    return;
  }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  if (customer.id === employee.id) {
    res.status(403).json({ success: false, error: 'Cannot grant points to yourself' });
    return;
  }

  // Gallons that make an impossible price per gallon are a slip in the price box: refused, so the cashier fixes it (utils/storeRules.ts)
  if ((category === 'GAS' || category === 'DIESEL') && gasGallons != null && !gallonsFit(purchaseAmount, gasGallons)) {
    res.status(400).json({ success: false, code: 'GALLONS_DO_NOT_FIT',
      error: `${gasGallons.toFixed(3)} gallons for $${purchaseAmount.toFixed(2)} is $${(purchaseAmount / gasGallons).toFixed(3)} a gallon. Check the price per gallon (it must be $${GAS_PRICE_MIN.toFixed(2)} to $${GAS_PRICE_MAX.toFixed(2)}).` });
    return;
  }

  // The cashback, the promotion that applies, the ceiling and the platform fee (utils/saleCashback.ts, shared with receipt scans)
  const now = new Date();
  const priced = await computeSaleCashback({ customer, storeId, purchaseAmount, category, gasGallons: gasGallons ?? null, now });
  const {
    store, customerTier, tierBaseRate, promoBonus, effectiveCashbackRate, pointsAwarded, devCut, storeCost, isGasCategory, effectiveGallons,
    gasBonusPoints, offerCashback, promotionApplied, activeOffer, rateCappedFlags, usePerGallonMode, gasPerGallonRate,
  } = priced;
  const allActiveOffers = { length: priced.allActiveOffersCount };
  const allStoreOffers = { length: priced.allStoreOffersCount };

  if (store && store.isActive === false) {
    res.status(409).json({ success: false, error: `${store.name} is closed, so sales cannot be recorded there. Ask HQ to reopen it.` });
    return;
  }

  // ── Fraud detection ──────────────────────────────────────────────────────
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const oneHourAgo    = new Date(Date.now() - 60 * 60 * 1000);
  const startOfToday  = storeDayStart();

  // The earlier lines of this same sale (siblingIds above), checked: this granter's own unfinished lines for this customer, made just now
  const siblingRows = siblingIds?.length ? await prisma.pointsTransaction.findMany({
    where: { id: { in: siblingIds }, customerId: customer.id, grantedById: employee.id, storeId, receiptImageUrl: null,
      status: { in: [TransactionStatus.PENDING, TransactionStatus.FLAGGED] }, createdAt: { gte: new Date(Date.now() - rule('reviewUnfinishedMinutes') * 60_000) } },   // any time until it would be cancelled (HQ fixes a refused line minutes later)
    select: { id: true, saleId: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  }) : [];
  const siblings = siblingRows.map((t) => t.id);
  // An added receipt belongs to the sale it is added to: its lines are not a duplicate of it nor another sale today
  const sameVisit = [...siblings, ...(addOnOf?.ok ? addOnOf.lineIds : [])];
  // One sale id for all its lines: the first line's id (HQ's Transactions page shows them as one sale)
  const saleId = addOnOf?.ok ? addOnOf.root : siblingRows.length ? siblingRows.find((t) => t.saleId)?.saleId ?? siblingRows[0].id : null;
  const notSibling: Prisma.PointsTransactionWhereInput = sameVisit.length ? { id: { notIn: sameVisit } } : {};

  // Starting this customer's sale again (a wrong category, Cancel and scan again) leaves the earlier attempt waiting for a photo that
  // will never come. This granter's own unfinished lines for this customer at this store, not part of this sale, are cancelled first:
  // nothing was credited, and they would otherwise refuse this sale as a duplicate and count as more sales today. Lines made in the last
  // 5 seconds are left alone (an older app sends a sale's lines at the same moment, without siblingIds).
  const abandoned = await prisma.pointsTransaction.findMany({
    where: { AND: [{ customerId: customer.id, grantedById: employee.id, storeId, id: { notIn: [...(siblingIds ?? []), ...sameVisit] }, createdAt: { lt: new Date(Date.now() - 5000) } }, UNFINISHED] },
    select: { id: true },
  });
  if (abandoned.length) await cancelUnfinished({ id: { in: abandoned.map((t) => t.id) } }, 'NEW_SCAN');
  // The counts below are of sales: not rejected or cancelled ones, and not a line still waiting for its photo
  const counted: Prisma.PointsTransactionWhereInput = { status: { notIn: NOT_A_SALE }, NOT: UNFINISHED };

  const [recentDuplicate, customerTodayCount, employeeHourCount, pairTodayCount] = await Promise.all([
    prisma.pointsTransaction.findFirst({
      where: { customerId: customer.id, ...byCashier, ...notSibling, createdAt: { gte: twoMinutesAgo }, status: { notIn: NOT_A_SALE } },
    }),
    prisma.pointsTransaction.count({
      where: { customerId: customer.id, storeId, ...notSibling, createdAt: { gte: startOfToday }, ...counted },
    }),
    prisma.pointsTransaction.count({
      where: { ...byCashier, ...notSibling, createdAt: { gte: oneHourAgo }, ...counted },
    }),
    prisma.pointsTransaction.count({
      where: { customerId: customer.id, ...byCashier, ...notSibling, createdAt: { gte: startOfToday }, ...counted },
    }),
  ]);

  // Hard auto-reject
  if (recentDuplicate) {
    res.status(409).json({ success: false, error: servedBy
      ? `Duplicate transaction detected. A sale for this customer by ${servedBy.name || 'this employee'} was entered in the last 2 minutes. Check Transactions before entering it again.`
      : 'Duplicate transaction detected. This customer was just served by you within the last 2 minutes.' });
    return;
  }
  if (purchaseAmount > rule('reviewMaxSale')) {
    res.status(400).json({ success: false, error: `Transaction amount exceeds the maximum allowed ($${rule('reviewMaxSale').toLocaleString('en-US')}). Contact your manager.` });
    return;
  }

  // Soft flags — create as FLAGGED, hold points for manager review
  const fraudFlags: string[] = [...rateCappedFlags];
  // The amounts and counts are HQ's (Settings > Sales review); the defaults are $500, $800, 4 a day and 15 an hour
  if (purchaseAmount > rule('reviewHighAmount') && !isGasCategory) fraudFlags.push('HIGH_AMOUNT');
  if (purchaseAmount > rule('reviewLargePurchase'))                fraudFlags.push('LARGE_PURCHASE');
  if (customerTodayCount >= rule('reviewCustomerSalesPerDay'))     fraudFlags.push('CUSTOMER_VELOCITY');
  if (employeeHourCount >= rule('reviewCashierGrantsPerHour'))     fraudFlags.push('EMPLOYEE_VELOCITY');
  if (pairTodayCount >= 2)                    fraudFlags.push('REPEAT_PAIR');
  // The customer already scanned a receipt at this store in the last 3 hours: this may be the same purchase twice (2026-10-12)
  // (a scan whose sale was rejected does not count: HELD stays on the scan after its lines are decided)
  const scansHere = await prisma.receiptScan.findMany({
    where: { customerId: customer.id, storeId, status: { in: ['HELD', 'AUTO'] }, createdAt: { gte: new Date(Date.now() - 3 * 3600_000) } }, select: { transactionIds: true },
  });
  const scanIds = scansHere.flatMap((s) => s.transactionIds);
  const scannedHere = scanIds.length > 0 && (await prisma.pointsTransaction.count({ where: { id: { in: scanIds }, status: { notIn: [...NOT_A_SALE, TransactionStatus.VOIDED] } } })) > 0;
  if (scannedHere)                            fraudFlags.push('RECEIPT_SCANNED');
  // Added after the customer left: held for a manager from HQ's amount (Settings > Sales review > Customer left a receipt)
  if (addOnOf?.ok && purchaseAmount >= rule('addOnHoldAmount')) fraudFlags.push('ADDED_AFTER_LEFT');

  const isFlagged = fraudFlags.length > 0;

  // Create transaction in PENDING (or FLAGGED) state — no points credited yet
  const transaction = await prisma.pointsTransaction.create({
    data: {
      customerId: customer.id,
      grantedById: employee.id,
      servedById: servedBy?.id ?? null,
      storeId,
      purchaseAmount,
      pointsAwarded,
      devCut,
      storeCost,
      cashbackRate: effectiveCashbackRate,
      category,
      notes,
      status: isFlagged ? TransactionStatus.FLAGGED : TransactionStatus.PENDING,
      fraudFlags: isFlagged ? JSON.stringify(fraudFlags) : null,
      isGas: isGasCategory,
      gasGallons: effectiveGallons ?? null,
      gasPricePerGallon: gasPricePerGallon ?? null,
      gasBonusPoints,
      offerId: promotionApplied ? activeOffer!.id : null,
      offerCashback,
      saleId,
      addOn: !!addOnOf?.ok,
    },
  });
  // The first line did not know it would have company: it gets the sale id now
  if (saleId) await prisma.pointsTransaction.updateMany({ where: { id: { in: addOnOf?.ok ? [addOnOf.root, ...siblings] : siblings }, saleId: null }, data: { saleId } });

  // This sale may have used up the promotion's budget: then it stops, and HQ is told
  if (promotionApplied && activeOffer?.budgetCap != null) noteBudgetUse(activeOffer, now).catch((e) => console.error('[offers] budget check failed:', e?.message ?? e));

  // The managers and HQ are told about a held sale when its receipt photo arrives (uploadReceiptAndApprove), not now: a sale the cashier
  // never finishes is cancelled and nobody needs to look at it (2026-10-18).

  res.status(201).json({
    success: true,
    message: isFlagged ? 'Transaction flagged for manager review. Upload receipt to continue.' : 'Transaction created. Upload receipt to complete.',
    flagged: isFlagged,
    fraudFlags,
    addOn: transaction.addOn,
    data: {
      transactionId: transaction.id,
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      pointsAwarded,
      purchaseAmount,
      tier: customerTier,
      gasMode: usePerGallonMode ? 'PER_GALLON' : 'PERCENTAGE',
      gasCentsPerGallon: usePerGallonMode ? gasPerGallonRate : null,
      tierBaseRate,
      promoBonus,
      cashbackRate: effectiveCashbackRate,
      promotionApplied,
      gasBonusPoints,
      _debug: {
        allActiveOffersCount: allActiveOffers.length,
        allStoreOffersCount: allStoreOffers.length,
        activeOfferFound: !!activeOffer,
        activeOfferTitle: activeOffer?.title ?? null,
        activeOfferCpg: activeOffer?.gasBonusCentsPerGallon ?? null,
        category,
        effectiveGallons,
        gasPerGallonRate,
        usePerGallonMode,
      },
    },
  });
}

// Employee: upload receipt and approve the transaction
export async function uploadReceiptAndApprove(req: AuthRequest, res: Response) {
  const { transactionId } = req.params;
  const employee = req.user!;

  const transaction = await prisma.pointsTransaction.findUnique({
    where: { id: transactionId },
  });

  if (!transaction) {
    res.status(404).json({ success: false, error: 'Transaction not found' });
    return;
  }
  const canOverride = hasMinRole(employee.role, Role.STORE_MANAGER);
  if (transaction.grantedById !== employee.id && !canOverride) {
    res.status(403).json({ success: false, error: 'Not your transaction' });
    return;
  }
  // Store managers can only approve transactions belonging to their own store
  if (canOverride && !hasMinRole(employee.role, Role.SUPER_ADMIN)) {
    if (!employee.storeIds?.includes(transaction.storeId)) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }
  if (transaction.status === TransactionStatus.CANCELLED) {
    res.status(409).json({ success: false, code: 'SALE_CANCELLED', error: 'This sale was cancelled because its receipt photo did not arrive in time. Nothing was credited: start the sale again.' });
    return;
  }
  if (transaction.status !== TransactionStatus.PENDING && transaction.status !== TransactionStatus.FLAGGED) {
    res.status(400).json({ success: false, error: 'Transaction already processed' });
    return;
  }
  // HQ's Grant & Redeem page (2026-10-20): HQ enters a sale from photos an employee sends, so it needs no receipt photo (send noReceipt),
  // is not held for review (HQ is the one who would review it) and is not refused for a photo used before. A photo it does send is kept.
  const hqEntry = hasMinRole(employee.role, Role.SUPER_ADMIN);
  const noReceipt = hqEntry && !req.file && (req.body?.noReceipt === true || req.body?.noReceipt === 'true');
  if (!req.file && !noReceipt) {
    res.status(400).json({ success: false, error: 'Receipt image is required' });
    return;
  }

  // Duplicate receipt detection — hash file bytes to prevent reusing the same photo
  const receiptHash = req.file ? createHash('sha256').update(req.file.buffer).digest('hex') : null;
  // A multi-item sale (gas + groceries on one receipt) is one transaction per item, and the phone sends the same photo to each. Those
  // siblings (same customer, cashier and store, made within two minutes of each other) may share it; any other sale may not. Before,
  // the siblings only got through when their uploads happened to overlap: if one finished first, the next was refused as a reused
  // receipt and the cashier could not complete the sale.
  const SALE_WINDOW_MS = 2 * 60 * 1000;
  // Lines of the same sale (same saleId) may share it at any time apart: HQ's Grant & Redeem page can fix a refused line and finish the
  // sale minutes later (2026-10-18). A cancelled or rejected sale's photo does not block anything.
  const sameHash = !receiptHash || hqEntry ? [] : await prisma.pointsTransaction.findMany({
    where: { receiptImageHash: receiptHash, id: { not: transactionId }, status: { notIn: NOT_A_SALE } },
    select: { id: true, customerId: true, grantedById: true, storeId: true, createdAt: true, saleId: true, addOn: true },
  });
  const sameSale = (t: { id: string; saleId: string | null }) => {
    const mine = transaction.saleId ?? transaction.id;
    return (t.saleId ?? t.id) === mine || t.id === transaction.saleId || t.saleId === transaction.id;
  };
  const duplicateReceipt = sameHash.find((t) => !(
    t.customerId === transaction.customerId && t.grantedById === transaction.grantedById && t.storeId === transaction.storeId
    && (sameSale(t) || Math.abs(t.createdAt.getTime() - transaction.createdAt.getTime()) <= SALE_WINDOW_MS)
    && !transaction.addOn && !t.addOn   // a receipt added after the customer left needs its own photo, never the first one
  ));
  if (duplicateReceipt) {
    res.status(409).json({ success: false, error: 'This receipt image has already been used for another transaction. Upload the original receipt photo.' });
    return;
  }

  // Upload receipt to Cloudinary
  const uploadResult = !req.file ? { secure_url: null as string | null } : await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'luckystop/receipts', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result as { secure_url: string });
      }
    );
    stream.end(req.file!.buffer);
  });

  const wasFlagged = transaction.status === TransactionStatus.FLAGGED && !hqEntry;

  if (wasFlagged) {
    // Flagged: save receipt but hold points — manager must review
    // Only while it is still waiting (it may have been cancelled or decided while the photo uploaded)
    const saved = await prisma.pointsTransaction.updateMany({
      where: { id: transactionId, status: TransactionStatus.FLAGGED },
      data: { receiptImageUrl: uploadResult.secure_url, receiptImageHash: receiptHash },
    });
    if (saved.count === 0) { res.status(409).json({ success: false, error: ALREADY_DECIDED_MESSAGE }); return; }
    const updatedTransaction = await prisma.pointsTransaction.findUniqueOrThrow({ where: { id: transactionId } });
    await alertHeldSale(updatedTransaction, employee).catch((e) => console.error('[points] held-sale alert failed:', e?.message ?? e));
    if (transaction.addOn) tellAddOn(transaction, employee, true).catch(() => {});
    res.json({
      success: true,
      message: 'Receipt uploaded. This transaction is flagged - a manager must approve it before points are credited.',
      flagged: true,
      data: updatedTransaction,
    });
    return;
  }

  // Normal path: approve and credit balance atomically, and only if the sale is still waiting
  // (an admin may have rejected it while the receipt was uploading)
  const totalPoints = transaction.pointsAwarded + transaction.gasBonusPoints;
  const settled = await prisma.$transaction(async (db) => {
    const customer = await approveAndCredit(db, transaction, hqEntry ? transaction.status : TransactionStatus.PENDING, req.file ? {
      receiptImageUrl: uploadResult.secure_url,
      receiptImageHash: receiptHash,
    } : {});
    if (!customer) return null;
    return { customer, sale: await db.pointsTransaction.findUniqueOrThrow({ where: { id: transactionId } }) };
  });
  if (!settled) {
    res.status(409).json({ success: false, error: ALREADY_DECIDED_MESSAGE });
    return;
  }
  const updatedTransaction = settled.sale;
  const updatedCustomer = settled.customer;
  await updateCustomerTierIfNeeded(transaction.customerId, updatedCustomer.periodPoints, updatedCustomer.tier);
  pushChallengeAwards(updatedCustomer.challengeAwards).catch((e) => console.error('[challenges] push failed:', e?.message ?? e));
  pushReferralAwards(updatedCustomer.referralAwards).catch((e) => console.error('[referrals] push failed:', e?.message ?? e));   // a challenge this sale completed

  if (transaction.addOn) tellAddOn(transaction, employee, false).catch(() => {});
  else sendPushToUser(
    transaction.customerId,
    '💰 Points Credited!',
    `${Math.round(totalPoints * 100)} pts added to your Lucky Stop balance.`,
    'POINTS',
    pointsUrl(transaction.id)
  );

  audit({
    actorId: employee.id, actorName: employee.name, actorRole: employee.role,
    action: 'GRANT_POINTS', entity: 'transaction', entityId: transactionId,
    details: {
      purchaseAmount: transaction.purchaseAmount,
      pointsAwarded: transaction.pointsAwarded,
      category: transaction.category,
      customerId: transaction.customerId,
      ...(transaction.addOn ? { addedAfterCustomerLeft: true, sale: transaction.saleId } : {}),
      ...(noReceipt ? { noReceipt: true } : {}),
      ...(hqEntry && transaction.status === TransactionStatus.FLAGGED ? { heldFlagsWaived: true } : {}),
      ...(transaction.servedById ? servedByDetails(await prisma.user.findUnique({ where: { id: transaction.servedById }, select: { id: true, name: true } })) : {}),
    },
    storeId: transaction.storeId,
  });

  res.json({
    success: true,
    message: `$${transaction.pointsAwarded.toFixed(2)} credited to customer account`,
    data: updatedTransaction,
  });
}

// Employee: redeem customer credits (deduct from balance)
const redeemSchema = z.object({
  customerQrCode: z.string(),
  storeId: z.string().uuid(),
  amount: z.number().positive(),
  servedById: z.string().max(64).optional(),   // HQ's Grant & Redeem page (utils/servedBy.ts)
});

export async function redeemCredits(req: AuthRequest, res: Response) {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { customerQrCode, storeId, amount, servedById } = parsed.data;
  const employee = req.user!;
  if (await refuseIfStoreClosed(res, storeId)) return;
  const served = await resolveServedBy(employee, servedById, storeId);
  if (!served.ok) { res.status(served.status).json({ success: false, error: served.error }); return; }

  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR code not found' });
    return;
  }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  // Dev cut is taken at grant time — no cut applied on redemption.
  // One customer at a time, the balance read inside the lock, and the same redemption a moment ago refused: a double tap used to pass
  // the balance check twice and deduct twice, even below zero.
  const outcome = await prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customer.id);
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: customer.id }, select: { pointsBalance: true } });
    if (fresh.pointsBalance < amount) return { kind: 'short' as const, balance: fresh.pointsBalance };
    const repeat = await tx.creditRedemption.findFirst({
      where: { customerId: customer.id, storeId, amount, processedBy: employee.id, createdAt: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) } },
      select: { id: true },
    });
    if (repeat) return { kind: 'repeat' as const };
    const updatedCustomer = await tx.user.update({
      where: { id: customer.id },
      data: { pointsBalance: { decrement: amount } },
      select: { id: true, name: true, phone: true, pointsBalance: true },
    });
    const redemption = await tx.creditRedemption.create({
      data: { customerId: customer.id, storeId, amount, devCut: 0, processedBy: employee.id },
    });
    await useLots(tx, customer.id, amount, 'CREDIT_REDEMPTION', redemption.id);   // oldest points first (utils/pointLots.ts)
    return { kind: 'done' as const, updated: updatedCustomer };
  });
  if (outcome.kind === 'short') {
    res.status(400).json({ success: false, error: `Insufficient balance. Customer has $${outcome.balance.toFixed(2)}.` });
    return;
  }
  if (outcome.kind === 'repeat') {
    res.status(409).json({ success: false, code: 'REPEATED', error: 'This redemption was just recorded. Check the customer balance before redeeming again.' });
    return;
  }
  const updated = outcome.updated;

  sendPushToUser(
    customer.id,
    '🎉 Redemption Successful!',
    `$${amount.toFixed(2)} redeemed at Lucky Stop. Remaining balance: $${updated.pointsBalance.toFixed(2)}.`,
    'REDEMPTION',
    redemptionUrl()
  );

  audit({
    actorId: employee.id, actorName: employee.name, actorRole: employee.role,
    action: 'REDEEM_CREDITS', entity: 'credit_redemption',
    details: { amount, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone, ...servedByDetails(served.servedBy) },
    storeId,
  });

  res.json({
    success: true,
    message: `$${amount.toFixed(2)} redeemed successfully`,
    data: { customer: { ...updated, pointsBalance: Number(updated.pointsBalance) }, amountRedeemed: amount },
  });
}

// Customer: view their own points history
export async function getMyTransactions(req: AuthRequest, res: Response) {
  const { page = '1', limit = '20' } = req.query as { page?: string; limit?: string };
  const skip = (parseInt(page) - 1) * parseInt(limit);

  // Not a sale still waiting for its photo, nor a cancelled one (2026-10-18); and only the fields the customer's history uses: never
  // the review flags, the platform fee, the receipt fingerprint, a void reason or the staff's notes.
  const mine: Prisma.PointsTransactionWhereInput = { customerId: req.user!.id, ...SHOWN };
  const [transactions, total] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where: mine,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
      select: {
        id: true, storeId: true, purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true, cashbackRate: true, category: true, status: true,
        isGas: true, gasGallons: true, gasPricePerGallon: true, receiptImageUrl: true, offerId: true, offerCashback: true, challengeId: true,
        referralId: true, rewardForSaleId: true, saleId: true, createdAt: true, updatedAt: true, voidedAt: true,
        store: { select: { name: true } }, challenge: { select: { title: true, titleEs: true, kind: true } },   // a reward line names its challenge (kind WINBACK: a gift)
      },
    }),
    prisma.pointsTransaction.count({ where: mine }),
  ]);

  res.json({ success: true, data: { transactions, total, page: parseInt(page), limit: parseInt(limit) } });
}

// A reason typed on Reject is optional, kept in the audit log, and told to the customer when given (a plain
// "could not be verified" otherwise). Shared by both reject paths (pending and flagged) so they refuse the
// same way.
function parseRejectReason(body: unknown): { reason?: string } | { error: string } {
  const raw = (body as { reason?: unknown } | null)?.reason;
  if (raw === undefined || raw === null || raw === '') return {};
  if (typeof raw !== 'string') return { error: '"reason" must be text' };
  const reason = raw.trim();
  if (reason.length > 300) return { error: '"reason" is too long (300 characters at most)' };
  return reason ? { reason } : {};
}

// Admin: reject a pending transaction
export async function rejectTransaction(req: AuthRequest, res: Response) {
  const { transactionId } = req.params;
  const parsedReason = parseRejectReason(req.body);
  if ('error' in parsedReason) { res.status(400).json({ success: false, error: parsedReason.error }); return; }
  const { reason } = parsedReason;

  const transaction = await prisma.pointsTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== TransactionStatus.PENDING) {
    res.status(400).json({ success: false, error: 'Transaction not found or already processed' });
    return;
  }

  // Store managers can only reject transactions belonging to their own store
  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    if (!req.user!.storeIds?.includes(transaction.storeId)) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }

  if (!(await rejectIfStill(transactionId, TransactionStatus.PENDING))) {
    res.status(409).json({ success: false, error: ALREADY_DECIDED_MESSAGE });
    return;
  }

  sendPushToUser(
    transaction.customerId,
    '❌ Transaction Rejected',
    `Your $${transaction.purchaseAmount.toFixed(2)} ${transaction.category.replace(/_/g, ' ').toLowerCase()} transaction could not be verified.${reason ? ` Reason: ${reason}.` : ''} Visit the store if you have questions.`,
    'POINTS',
    pointsUrl(transactionId)
  );

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'REJECT_TRANSACTION', entity: 'transaction', entityId: transactionId,
    details: {
      purchaseAmount: transaction.purchaseAmount,
      pointsAwarded: transaction.pointsAwarded,
      category: transaction.category,
      customerId: transaction.customerId,
      ...(reason ? { reason } : {}),
    },
    storeId: transaction.storeId,
  });

  res.json({ success: true, message: 'Transaction rejected' });
}

// Manager: approve or reject a flagged transaction
export async function reviewFlaggedTransaction(req: AuthRequest, res: Response) {
  const { transactionId } = req.params;
  const { action } = req.body as { action: 'APPROVE' | 'REJECT' };

  if (!['APPROVE', 'REJECT'].includes(action)) {
    res.status(400).json({ success: false, error: 'action must be APPROVE or REJECT' });
    return;
  }
  const parsedReason = parseRejectReason(req.body);
  if ('error' in parsedReason) { res.status(400).json({ success: false, error: parsedReason.error }); return; }
  const { reason } = parsedReason;

  const transaction = await prisma.pointsTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== TransactionStatus.FLAGGED) {
    res.status(400).json({ success: false, error: 'Transaction not found or not flagged' });
    return;
  }

  if (!hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    if (!req.user!.storeIds?.includes(transaction.storeId)) {
      res.status(403).json({ success: false, error: 'No access to this store' });
      return;
    }
  }

  // High-value flagged transactions require SUPER_ADMIN to approve — prevents colluding manager sign-off
  let flags: string[] = [];
  try { flags = transaction.fraudFlags ? JSON.parse(transaction.fraudFlags) : []; } catch { /* unreadable flag text: treat as no flags */ }
  if (action === 'APPROVE' && flags.includes('LARGE_PURCHASE') && !hasMinRole(req.user!.role, Role.SUPER_ADMIN)) {
    res.status(403).json({ success: false, error: 'Transactions over $800 require Super Admin approval.' });
    return;
  }

  // The receipt is mandatory. A flagged sale exists from the moment the cashier starts the grant, before the
  // receipt is uploaded, so approving it too early would credit points with nothing to check them against.
  if (action === 'APPROVE' && !transaction.receiptImageUrl) {
    res.status(400).json({ success: false, error: 'No receipt has been uploaded for this sale yet. Ask the cashier to upload it before approving.' });
    return;
  }

  if (action === 'REJECT') {
    if (!(await rejectIfStill(transactionId, TransactionStatus.FLAGGED))) {
      res.status(409).json({ success: false, error: ALREADY_DECIDED_MESSAGE });
      return;
    }
    sendPushToUser(transaction.customerId, '❌ Transaction Rejected', `Your $${transaction.purchaseAmount.toFixed(2)} transaction was reviewed and rejected.${reason ? ` Reason: ${reason}.` : ''}`, 'POINTS', pointsUrl(transactionId));
    audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'REJECT_FLAGGED', entity: 'transaction', entityId: transactionId, details: { purchaseAmount: transaction.purchaseAmount, fraudFlags: transaction.fraudFlags, ...(reason ? { reason } : {}) }, storeId: transaction.storeId });
    res.json({ success: true, message: 'Flagged transaction rejected' });
    return;
  }

  // APPROVE — credit points now, once: the update only happens if the sale is still flagged
  const totalPoints = transaction.pointsAwarded + transaction.gasBonusPoints;
  const updatedCustomer = await prisma.$transaction((db) => approveAndCredit(db, transaction, TransactionStatus.FLAGGED));
  if (!updatedCustomer) {
    res.status(409).json({ success: false, error: ALREADY_DECIDED_MESSAGE });
    return;
  }
  await updateCustomerTierIfNeeded(transaction.customerId, updatedCustomer.periodPoints, updatedCustomer.tier);
  pushChallengeAwards(updatedCustomer.challengeAwards).catch((e) => console.error('[challenges] push failed:', e?.message ?? e));
  pushReferralAwards(updatedCustomer.referralAwards).catch((e) => console.error('[referrals] push failed:', e?.message ?? e));   // a challenge this sale completed
  sendPushToUser(transaction.customerId, '💰 Points Credited!', `Your $${transaction.purchaseAmount.toFixed(2)} transaction was approved. ${Math.round(totalPoints * 100)} pts added.`, 'POINTS', pointsUrl(transactionId));
  audit({ actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role, action: 'APPROVE_FLAGGED', entity: 'transaction', entityId: transactionId, details: { purchaseAmount: transaction.purchaseAmount, fraudFlags: transaction.fraudFlags }, storeId: transaction.storeId });
  res.json({ success: true, message: 'Flagged transaction approved and points credited' });
}

const VOID_REASON_MAX = 300;

// SuperAdmin+: undo an approved sale after the fact. Unlike Reject (which never credited anything), voiding
// claws the points back from the customer's current balance. A reason is REQUIRED here, not optional like a
// reject's — this is the one action on this page that takes money back from a customer after the fact, and
// it needs a real explanation on the record every time. The policy for a balance already partly or fully
// spent: it is simply decremented, and can go negative (the response says so) rather than the admin having to
// chase a partial recovery by hand; there is no separate debt-repayment mechanism.
export async function voidTransaction(req: AuthRequest, res: Response) {
  const { transactionId } = req.params;
  const { reason } = req.body as { reason?: unknown };
  if (typeof reason !== 'string' || !reason.trim()) {
    res.status(400).json({ success: false, error: 'A reason is required to void a sale.' });
    return;
  }
  const cleanReason = reason.trim();
  if (cleanReason.length > VOID_REASON_MAX) {
    res.status(400).json({ success: false, error: `"reason" is too long (${VOID_REASON_MAX} characters at most)` });
    return;
  }

  const transaction = await prisma.pointsTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== TransactionStatus.APPROVED) {
    res.status(400).json({ success: false, error: 'Only an approved sale can be voided.' });
    return;
  }

  const actor = req.user!;
  const totalPoints = transaction.pointsAwarded + transaction.gasBonusPoints;

  const updatedCustomer = await prisma.$transaction(async (db) => {
    // Decide-once: only if the sale is still APPROVED (a double click, or someone else voiding the same sale
    // at the same moment, must not claw points back twice).
    const moved = await db.pointsTransaction.updateMany({
      where: { id: transactionId, status: TransactionStatus.APPROVED },
      data: { status: TransactionStatus.VOIDED, voidedAt: new Date(), voidedById: actor.id, voidReason: cleanReason },
    });
    if (moved.count === 0) return null;
    // The half-year count only loses the points when the sale is in the current half-year (the reset already took it out otherwise)
    await rollCustomerPeriod(db, transaction.customerId);
    const inPeriod = getCurrentPeriod(transaction.createdAt) === getCurrentPeriod();
    // Points of this sale that already expired left the balance then: only the rest is taken back now
    const takeBack = Math.max(0, Math.round((totalPoints - await expiredPartOfSale(db, transaction.customerId, transactionId)) * 10000) / 10000);
    const after = await db.user.update({
      where: { id: transaction.customerId },
      data: { pointsBalance: { decrement: takeBack }, ...(inPeriod ? { periodPoints: { decrement: totalPoints } } : {}) },
    });
    await voidSaleLots(db, transaction.customerId, transactionId, takeBack);   // its batch back out (utils/pointLots.ts)
    return after;
  });

  if (!updatedCustomer) {
    res.status(409).json({ success: false, error: ALREADY_DECIDED_MESSAGE });
    return;
  }

  const wentNegative = updatedCustomer.pointsBalance < 0;

  sendPushToUser(
    transaction.customerId,
    '⚠️ Transaction Voided',
    `Your $${transaction.purchaseAmount.toFixed(2)} transaction was reviewed and voided. ${Math.round(totalPoints * 100)} pts were removed from your balance. Visit the store if you have questions.`,
    'POINTS',
    pointsUrl(transactionId)
  );

  audit({
    actorId: actor.id, actorName: actor.name, actorRole: actor.role,
    action: 'VOID_TRANSACTION', entity: 'transaction', entityId: transactionId,
    details: {
      purchaseAmount: transaction.purchaseAmount,
      pointsClawedBack: totalPoints,
      customerId: transaction.customerId,
      reason: cleanReason,
      customerBalanceWentNegative: wentNegative,
    },
    storeId: transaction.storeId,
  });

  res.json({ success: true, message: 'Transaction voided', data: { customerBalanceWentNegative: wentNegative } });
}

// Manager: store dashboard summary stats
export async function getStoreSummary(req: AuthRequest, res: Response) {
  const { storeId } = req.params;

  const todayStart = storeDayStart();

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { name: true, address: true, city: true } });
  if (!store) { res.status(404).json({ success: false, error: 'Store not found' }); return; }

  const [todayStats, pendingCount, allTimeStats] = await prisma.$transaction([
    prisma.pointsTransaction.aggregate({
      where: { storeId, status: TransactionStatus.APPROVED, createdAt: { gte: todayStart } },
      _count: { _all: true, challengeId: true, referralId: true },
      _sum: { pointsAwarded: true, gasBonusPoints: true, purchaseAmount: true },
    }),
    prisma.pointsTransaction.count({ where: { storeId, ...AWAITING_DECISION } }),
    prisma.pointsTransaction.aggregate({
      where: { storeId, status: TransactionStatus.APPROVED },
      _count: { _all: true, challengeId: true, referralId: true },
      _sum: { pointsAwarded: true, gasBonusPoints: true, purchaseAmount: true },
    }),
  ]);

  const recent = await prisma.pointsTransaction.findMany({
    where: { storeId, ...SHOWN },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { customer: { select: { name: true, phone: true } }, grantedBy: { select: { name: true } }, servedBy: { select: { name: true } } },
  });

  res.json({
    success: true,
    data: {
      store,
      today: {
        transactions: saleCount(todayStats._count),
        pointsAwarded: (todayStats._sum.pointsAwarded || 0) + (todayStats._sum.gasBonusPoints || 0),
        purchaseVolume: todayStats._sum.purchaseAmount || 0,
      },
      pending: pendingCount,
      allTime: {
        transactions: saleCount(allTimeStats._count),
        pointsAwarded: (allTimeStats._sum.pointsAwarded || 0) + (allTimeStats._sum.gasBonusPoints || 0),
        purchaseVolume: allTimeStats._sum.purchaseAmount || 0,
      },
      recent,
    },
  });
}

// Admin: view all transactions for a store with receipt photos
export async function getStoreTransactions(req: AuthRequest, res: Response) {
  const { storeId } = req.params;
  const { status, page = '1', limit = '20' } = req.query as {
    status?: string;
    page?: string;
    limit?: string;
  };
  // NEEDS_REVIEW = held or waiting sales that have their photo (what the managers are pushed about); an unknown status is a 400, not a
  // database error. Sales still waiting for their photo, and cancelled ones, show only under their own CANCELLED filter.
  if (status && status !== NEEDS_REVIEW && !(Object.values(TransactionStatus) as string[]).includes(status)) {
    res.status(400).json({ success: false, error: `"status" must be ${[NEEDS_REVIEW, ...Object.values(TransactionStatus)].join(', ')}` });
    return;
  }
  const storeWhere: Prisma.PointsTransactionWhereInput = status === NEEDS_REVIEW ? { storeId, ...AWAITING_DECISION }
    : status === TransactionStatus.CANCELLED ? { storeId, status: TransactionStatus.CANCELLED }
    : { storeId, ...SHOWN, ...(status ? { status: status as TransactionStatus } : {}) };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where: storeWhere,
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        grantedBy: { select: { id: true, name: true, phone: true } },
        servedBy: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.pointsTransaction.count({ where: storeWhere }),
  ]);

  res.json({ success: true, data: { transactions, total, page: parseInt(page), limit: parseInt(limit) } });
}

// SuperAdmin+: platform-wide summary stats. "Today" and "this month" are cut on the store calendar
// (Central time), not the server clock. Every active store is ranked, including one with no sales
// this month, so a quiet store shows up as a $0 row instead of vanishing from the list.
export async function getPlatformSummary(_req: AuthRequest, res: Response) {
  const now = new Date();
  const todayStart = storeDayStart(now);
  const monthStart = storeMonthStart(now);

  const [todayStats, monthStats, pendingCount, flaggedCount, oldestReview, allTimeStats, perStore, lastSales, creditsOut, allStores] = await prisma.$transaction([
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED', createdAt: { gte: todayStart } },
      _count: { _all: true, challengeId: true, referralId: true }, _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true },
    }),
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED', createdAt: { gte: monthStart } },
      _count: { _all: true, challengeId: true, referralId: true }, _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true },
    }),
    prisma.pointsTransaction.count({ where: { ...AWAITING_DECISION, status: 'PENDING' } }),
    prisma.pointsTransaction.count({ where: { ...AWAITING_DECISION, status: 'FLAGGED' } }),
    prisma.pointsTransaction.aggregate({ where: AWAITING_DECISION, _min: { createdAt: true } }),
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED' },
      _count: { _all: true, challengeId: true, referralId: true }, _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true },
    }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', createdAt: { gte: monthStart } },
      _count: { _all: true, challengeId: true, referralId: true },
      _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true },
      orderBy: { _sum: { purchaseAmount: 'desc' } },
    }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', challengeId: null, referralId: null },
      _max: { createdAt: true },
      orderBy: { storeId: 'asc' },
    }),
    prisma.user.aggregate({
      where: { role: 'CUSTOMER' },
      _sum: { pointsBalance: true },
    }),
    prisma.store.findMany({ select: { id: true, name: true, city: true, isActive: true } }),
  ]);

  const monthByStore = new Map(perStore.map((r) => [r.storeId, r]));
  const lastSaleByStore = new Map(lastSales.map((r) => [r.storeId, r._max?.createdAt ?? null]));
  const storeRanking = allStores
    .filter((s) => s.isActive || monthByStore.has(s.id))
    .map((s) => {
      const m = monthByStore.get(s.id);
      return {
        id: s.id,
        name: s.name,
        city: s.city,
        transactions: m ? saleCount(m._count) : 0,
        purchaseVolume: parseFloat(((m?._sum?.purchaseAmount) ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((((m?._sum?.pointsAwarded) ?? 0) + ((m?._sum?.gasBonusPoints) ?? 0)).toFixed(2)),
        lastSaleAt: lastSaleByStore.get(s.id)?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.purchaseVolume - a.purchaseVolume || a.name.localeCompare(b.name));

  res.json({
    success: true,
    data: {
      today: {
        transactions: saleCount(todayStats._count),
        purchaseVolume: parseFloat((todayStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat(((todayStats._sum.pointsAwarded ?? 0) + (todayStats._sum.gasBonusPoints ?? 0)).toFixed(2)),
      },
      thisMonth: {
        transactions: saleCount(monthStats._count),
        purchaseVolume: parseFloat((monthStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat(((monthStats._sum.pointsAwarded ?? 0) + (monthStats._sum.gasBonusPoints ?? 0)).toFixed(2)),
      },
      pending: pendingCount,   // PENDING only (kept for older admin builds)
      flagged: flaggedCount,   // fraud-flagged, also waiting on a reviewer (the sidebar badge counts both)
      oldestReviewAt: oldestReview._min?.createdAt?.toISOString() ?? null, // when the longest-waiting pending or flagged item arrived
      allTime: {
        transactions: saleCount(allTimeStats._count),
        purchaseVolume: parseFloat((allTimeStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat(((allTimeStats._sum.pointsAwarded ?? 0) + (allTimeStats._sum.gasBonusPoints ?? 0)).toFixed(2)),
      },
      totalCreditsOutstanding: parseFloat((creditsOut._sum.pointsBalance ?? 0).toFixed(2)),
      storeRanking,
    },
  });
}

// SuperAdmin+: approved sales per store day for the last N days (default 30, max 90), oldest first,
// with quiet days filled in as zeros. The dashboard chart reads this instead of paging raw
// transactions (the list endpoint caps at 100 rows, which silently truncated the old chart).
export async function getPlatformTrend(req: AuthRequest, res: Response) {
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? '30'), 10) || 30, 1), 90);
  const firstKey = addStoreDays(storeDateKey(), -(days - 1));

  const rows = await prisma.pointsTransaction.findMany({
    where: { status: 'APPROVED', createdAt: { gte: startOfStoreDate(firstKey) } },
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true, challengeId: true, referralId: true },
  });

  const byDate: Record<string, { date: string; transactions: number; purchaseVolume: number; cashbackIssued: number }> = {};
  for (let i = 0; i < days; i++) {
    const key = addStoreDays(firstKey, i);
    byDate[key] = { date: key, transactions: 0, purchaseVolume: 0, cashbackIssued: 0 };
  }
  for (const r of rows) {
    const b = byDate[storeDateKey(r.createdAt)];
    if (!b) continue;
    if (!r.challengeId && !r.referralId) b.transactions++;
    b.purchaseVolume += r.purchaseAmount;
    b.cashbackIssued += r.pointsAwarded + (r.gasBonusPoints ?? 0);
  }
  const daily = Object.values(byDate).map((d) => ({
    ...d,
    purchaseVolume: parseFloat(d.purchaseVolume.toFixed(2)),
    cashbackIssued: parseFloat(d.cashbackIssued.toFixed(2)),
  }));

  res.json({ success: true, data: { days, daily } });
}

// SuperAdmin+: this period against the same stretch of the previous one. ?range=today|7d|30d|month.
// Both windows end at the same point in their period (see utils/dashboardWindows.ts), so a half-finished
// day is compared with the same half of the day it is compared to. Today is hourly, the rest daily.
export async function getPlatformCompare(req: AuthRequest, res: Response) {
  const asked = String(req.query.range ?? 'today');
  const range: CompareRange = (COMPARE_RANGES as string[]).includes(asked) ? (asked as CompareRange) : 'today';
  const now = new Date();
  const w = compareWindows(range, now);

  const rows = await prisma.pointsTransaction.findMany({
    where: { status: 'APPROVED', createdAt: { gte: w.previous.start, lte: now } },
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true, challengeId: true, referralId: true },
  });

  res.json({
    success: true,
    data: { range, granularity: w.granularity, nowIndex: w.nowIndex, ...summarize(w, rows), generatedAt: now.toISOString() },
  });
}

// SuperAdmin+: one row per active store with what an owner needs to decide who to call: sales today against
// the same time last week, month to date, cashback as a share of sales (30 days), what is waiting for review,
// and when the last sale was. `status` is alert / watch / ok and `reasons` spells out why.
export async function getStoreHealth(_req: AuthRequest, res: Response) {
  const now = new Date();
  const todayKey = storeDateKey(now);
  const todayStart = storeDayStart(now);
  const lastWeekStart = startOfStoreDate(addStoreDays(todayKey, -7));
  const lastWeekEnd = new Date(lastWeekStart.getTime() + (now.getTime() - todayStart.getTime()));
  const monthStart = storeMonthStart(now);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86_400_000);
  const approved = { status: TransactionStatus.APPROVED };

  const [stores, today, lastWeek, month, ratio, waiting, last] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true }, select: { id: true, name: true, city: true } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: todayStart } }, _count: { _all: true, challengeId: true, referralId: true }, _sum: { purchaseAmount: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: lastWeekStart, lte: lastWeekEnd } }, _sum: { purchaseAmount: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: monthStart } }, _count: { _all: true, challengeId: true, referralId: true }, _sum: { purchaseAmount: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: thirtyDaysAgo } }, _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId', 'status'], where: AWAITING_DECISION, _count: true, orderBy: [{ storeId: 'asc' }, { status: 'asc' }] }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, challengeId: null, referralId: null }, _max: { createdAt: true }, orderBy: { storeId: 'asc' } }),
  ]);

  const byStore = <T extends { storeId: string }>(rows: T[]) => new Map(rows.map((r) => [r.storeId, r]));
  const todayBy = byStore(today), lastWeekBy = byStore(lastWeek), monthBy = byStore(month), ratioBy = byStore(ratio), lastBy = byStore(last);
  const pendingBy = new Map<string, number>();
  const flaggedBy = new Map<string, number>();
  for (const w of waiting) (w.status === TransactionStatus.FLAGGED ? flaggedBy : pendingBy).set(w.storeId, Number(w._count));
  const r2 = (n: number) => parseFloat(n.toFixed(2));

  const data = stores.map((s) => {
    const t = todayBy.get(s.id);
    const m = monthBy.get(s.id);
    const todayVolume = r2(t?._sum?.purchaseAmount ?? 0);
    const lastWeekVolume = r2(lastWeekBy.get(s.id)?._sum?.purchaseAmount ?? 0);
    const sales30 = ratioBy.get(s.id)?._sum?.purchaseAmount ?? 0;
    const cash30 = (ratioBy.get(s.id)?._sum?.pointsAwarded ?? 0) + (ratioBy.get(s.id)?._sum?.gasBonusPoints ?? 0);
    const cashbackRatio30d = sales30 > 0 ? parseFloat((cash30 / sales30).toFixed(4)) : 0;
    const lastSaleAt = lastBy.get(s.id)?._max?.createdAt ?? null;
    const pending = pendingBy.get(s.id) ?? 0;
    const flagged = flaggedBy.get(s.id) ?? 0;
    const hoursSince = lastSaleAt ? (now.getTime() - lastSaleAt.getTime()) / 3_600_000 : null;

    const reasons: { level: 'alert' | 'watch'; text: string }[] = [];
    if (flagged > 0) reasons.push({ level: 'alert', text: `${flagged} flagged transaction${flagged > 1 ? 's' : ''} to review` });
    const health = classifyCashbackRatio(cashbackRatio30d);
    if (health === 'critical') reasons.push({ level: 'alert', text: `Cashback is ${(cashbackRatio30d * 100).toFixed(1)}% of sales (30 days)` });
    else if (health === 'warn') reasons.push({ level: 'watch', text: `Cashback is ${(cashbackRatio30d * 100).toFixed(1)}% of sales (30 days)` });
    if (hoursSince == null) reasons.push({ level: 'watch', text: 'No sales yet' });
    else if (hoursSince > 24 * 14) reasons.push({ level: 'watch', text: `No sales in ${Math.floor(hoursSince / 24)} days` });
    else if (hoursSince > 24) reasons.push({ level: 'alert', text: `No sale in ${Math.floor(hoursSince)} hours` });
    if (pending > 0) reasons.push({ level: 'watch', text: `${pending} pending review` });
    if (lastWeekVolume >= 100 && todayVolume < lastWeekVolume * 0.5) {
      reasons.push({ level: 'watch', text: `Sales down ${Math.round((1 - todayVolume / lastWeekVolume) * 100)}% on this time last week` });
    }

    return {
      id: s.id, name: s.name, city: s.city,
      todayTransactions: t ? saleCount(t._count) : 0, todayVolume, lastWeekVolume,
      monthTransactions: m ? saleCount(m._count) : 0, monthVolume: r2(m?._sum?.purchaseAmount ?? 0),
      cashbackRatio30d, pending, flagged,
      lastSaleAt: lastSaleAt ? lastSaleAt.toISOString() : null,
      hoursSinceLastSale: hoursSince == null ? null : Math.floor(hoursSince),
      status: reasons.some((x) => x.level === 'alert') ? 'alert' : reasons.length > 0 ? 'watch' : 'ok',
      reasons: reasons.map((x) => x.text),
    };
  });

  const rank: Record<string, number> = { alert: 0, watch: 1, ok: 2 };
  data.sort((a, b) => rank[a.status] - rank[b.status] || b.todayVolume - a.todayVolume || a.name.localeCompare(b.name));
  res.json({ success: true, data });
}

// GET /points/pending-count — badge count: transactions with an action waiting (PENDING + FLAGGED).
// All stores for platform admins, own stores for manager.
export async function getTransactionsPendingCount(req: AuthRequest, res: Response) {
  const user = req.user!;

  const storeIds = hasMinRole(user.role, Role.SUPER_ADMIN)
    ? (await prisma.store.findMany({ where: { isActive: true }, select: { id: true } })).map((s) => s.id)
    : (await prisma.userStoreRole.findMany({ where: { userId: user.id }, select: { storeId: true } })).map((r) => r.storeId);

  if (storeIds.length === 0) {
    res.json({ success: true, data: { count: 0 } });
    return;
  }

  const count = await prisma.pointsTransaction.count({
    where: { storeId: { in: storeIds }, ...AWAITING_DECISION, isTestData: false },
  });
  res.json({ success: true, data: { count } });
}

// GET /points/customer-info/:qrCode — cashier fetches customer tier + benefit status before choosing action
export async function getCustomerInfo(req: AuthRequest, res: Response) {
  const { qrCode } = req.params;
  const customer = await prisma.user.findUnique({ where: { qrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR not found' });
    return;
  }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }

  // The tier and progress as they stand now: after a half-year turns, one tier down and no progress (utils/tier.ts effectiveTier)
  const { tier, periodPoints, period } = effectiveTier(customer);

  // Check today's daily benefit (Gold+)
  const todayStart = storeDayStart();
  const todayEnd   = storeDayEnd();

  let benefitAvailable = false;
  let benefitType: string | null = null;
  let silverRemaining = 0;

  if (tier === 'SILVER') {
    const used = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'SILVER_FOUNTAIN' },
    });
    silverRemaining = Math.max(0, rule('refillSilverPerPeriod') - used);   // HQ's number (Settings, 2026-10-17); it was 7
    benefitAvailable = silverRemaining > 0;
    benefitType = 'SILVER_FOUNTAIN';
  } else if (['GOLD', 'DIAMOND', 'PLATINUM'].includes(tier)) {
    const usedToday = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'DAILY_REFILL', claimedAt: { gte: todayStart, lte: todayEnd } },
    });
    benefitAvailable = usedToday < rule('refillDailyPerDay');
    benefitType = 'DAILY_REFILL';
  }

  const thresholds = await getStoredThresholds();
  const progress = getNextTierProgress(periodPoints, thresholds);

  res.json({
    success: true,
    data: {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      pointsBalance: Math.round(customer.pointsBalance * 100), // in pts
      tier,
      periodPts: progress.pts,
      nextTier: progress.nextTier,
      nextPts: progress.nextPts,
      benefit: { available: benefitAvailable, type: benefitType, silverRemaining },
    },
  });
}

// GET /points/hq/customers?q= (HQ only, the Grant & Redeem page): find a customer by phone or name when the QR photo will not read.
// Answers their QR code, which every other step of the page uses, as the cashier's app does.
export async function hqFindCustomers(req: AuthRequest, res: Response) {
  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q.length < 3 || q.length > 60) { res.status(400).json({ success: false, error: 'Type at least 3 letters of the name or digits of the phone number.' }); return; }
  const rows = await prisma.user.findMany({
    where: { AND: [{ role: Role.CUSTOMER, qrCode: { not: null } }, excludeDeletedCustomers, customerSearchWhere(q)] },
    select: { id: true, name: true, phone: true, qrCode: true, isActive: true },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  res.json({ success: true, data: rows });
}

// GET /points/hq/staff/:storeId (HQ only): who may be named as "Served by" at this store (utils/servedBy.ts)
export async function hqStoreStaff(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await storeStaff(req.params.storeId) });
}

// GET /points/my-benefit-status — customer checks their own benefit availability
export async function getMyBenefitStatus(req: AuthRequest, res: Response) {
  const userId = req.user!.id;
  const customer = await prisma.user.findUnique({ where: { id: userId } });
  if (!customer) { res.status(404).json({ success: false, error: 'User not found' }); return; }

  const { tier, period } = effectiveTier(customer);

  const todayStart = storeDayStart();
  const todayEnd   = storeDayEnd();

  let available = false;
  let benefitType: string | null = null;
  let silverRemaining = 0;

  if (tier === 'SILVER') {
    const used = await prisma.tierBenefitClaim.count({
      where: { userId, period, benefitType: 'SILVER_FOUNTAIN' },
    });
    silverRemaining = Math.max(0, rule('refillSilverPerPeriod') - used);
    available = silverRemaining > 0;
    benefitType = 'SILVER_FOUNTAIN';
  } else if (['GOLD', 'DIAMOND', 'PLATINUM'].includes(tier)) {
    const usedToday = await prisma.tierBenefitClaim.count({
      where: { userId, period, benefitType: 'DAILY_REFILL', claimedAt: { gte: todayStart, lte: todayEnd } },
    });
    available = usedToday < rule('refillDailyPerDay');
    benefitType = 'DAILY_REFILL';
  }

  res.json({ success: true, data: { tier, available, benefitType, silverRemaining } });
}

export async function claimTierBenefit(req: AuthRequest, res: Response) {
  const { customerQrCode, storeId, servedById } = req.body as { customerQrCode: string; storeId: string; servedById?: string };
  if (!customerQrCode || !storeId) {
    res.status(400).json({ success: false, error: 'customerQrCode and storeId required' });
    return;
  }
  if (await refuseIfStoreClosed(res, storeId)) return;
  const served = await resolveServedBy(req.user!, servedById, storeId);
  if (!served.ok) { res.status(served.status).json({ success: false, error: served.error }); return; }

  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }

  const { tier, period } = effectiveTier(customer);

  if (tier === 'BRONZE') {
    res.status(400).json({ success: false, error: 'No tier benefit available for Bronze' });
    return;
  }

  // Count and claim inside one customer lock: a double tap used to pass the count twice and give two refills (or an eighth Silver one)
  const benefitType = tier === 'SILVER' ? 'SILVER_FOUNTAIN' : 'DAILY_REFILL';
  const refusal = await prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customer.id);
    if (benefitType === 'SILVER_FOUNTAIN') {
      const used = await tx.tierBenefitClaim.count({ where: { userId: customer.id, period, benefitType } });
      const most = rule('refillSilverPerPeriod');
      if (used >= most) return most === 0 ? 'The Silver refill is switched off.' : `Silver benefit limit reached (${most} refills this period)`;
    } else {
      const usedToday = await tx.tierBenefitClaim.count({
        where: { userId: customer.id, period, benefitType, claimedAt: { gte: storeDayStart(), lte: storeDayEnd() } },
      });
      const most = rule('refillDailyPerDay');
      if (usedToday >= most) return most === 0 ? 'The daily refill is switched off.' : most === 1 ? 'Daily refill already claimed today' : `All ${most} refills for today were already used`;
    }
    await tx.tierBenefitClaim.create({ data: { userId: customer.id, period, benefitType } });
    return null;
  });
  if (refusal) {
    res.status(400).json({ success: false, error: refusal });
    return;
  }

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CLAIM_TIER_BENEFIT', entity: 'tier_benefit_claim', entityId: customer.id,
    details: { tier, benefitType, customerName: customer.name, customerPhone: customer.phone, ...servedByDetails(served.servedBy) },
    storeId,
  });

  res.json({ success: true, message: `${tier} benefit claimed`, data: { benefitType } });
}

export async function processCatalogRedemption(req: AuthRequest, res: Response) {
  const { customerQrCode, catalogItemId, storeId, servedById } = req.body as { customerQrCode: string; catalogItemId: string; storeId: string; servedById?: string };
  if (!customerQrCode || !catalogItemId || !storeId) {
    res.status(400).json({ success: false, error: 'customerQrCode, catalogItemId, storeId required' });
    return;
  }
  if (await refuseIfStoreClosed(res, storeId)) return;
  const served = await resolveServedBy(req.user!, servedById, storeId);
  if (!served.ok) { res.status(served.status).json({ success: false, error: served.error }); return; }

  const [customer, item] = await Promise.all([
    prisma.user.findUnique({ where: { qrCode: customerQrCode } }),
    prisma.redemptionCatalogItem.findUnique({ where: { id: catalogItemId } }),
  ]);

  if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }
  if (!isCustomerAccount(customer)) { res.status(403).json({ success: false, error: NOT_A_CUSTOMER }); return; }
  if (!item || !item.isActive) { res.status(404).json({ success: false, error: 'Catalog item not found or inactive' }); return; }
  if (item.storeId && item.storeId !== storeId) {
    const only = await prisma.store.findUnique({ where: { id: item.storeId }, select: { name: true } });
    res.status(409).json({ success: false, error: `"${item.title}" is a reward of ${only?.name ?? 'another store'} only, so it cannot be redeemed here.` });
    return;
  }

  // pointsCost is in points; convert to dollars for balance deduction
  const costInDollars = item.pointsCost / 100;

  // Same guard as redeemCredits: one customer at a time, balance read inside the lock, a repeated tap refused
  const outcome = await prisma.$transaction(async (tx) => {
    await lockCustomer(tx, customer.id);
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: customer.id }, select: { pointsBalance: true } });
    if (fresh.pointsBalance < costInDollars) return { kind: 'short' as const, balance: fresh.pointsBalance };
    const repeat = await tx.catalogRedemption.findFirst({
      where: { customerId: customer.id, catalogItemId, storeId, processedById: req.user!.id, createdAt: { gte: new Date(Date.now() - REPEAT_WINDOW_MS) } },
      select: { id: true },
    });
    if (repeat) return { kind: 'repeat' as const, balance: fresh.pointsBalance };
    await tx.user.update({ where: { id: customer.id }, data: { pointsBalance: { decrement: costInDollars } } });
    const given = await tx.catalogRedemption.create({
      data: { customerId: customer.id, catalogItemId, pointsSpent: item.pointsCost, storeId, processedById: req.user!.id },
    });
    await useLots(tx, customer.id, costInDollars, 'CATALOG', given.id);
    return { kind: 'done' as const, balance: fresh.pointsBalance - costInDollars };
  });
  if (outcome.kind === 'short') {
    res.status(400).json({ success: false, error: `Insufficient points. Need ${item.pointsCost} pts, have ${Math.round(outcome.balance * 100)} pts` });
    return;
  }
  if (outcome.kind === 'repeat') {
    res.status(409).json({ success: false, code: 'REPEATED', error: 'This reward was just redeemed for this customer.' });
    return;
  }

  sendPushToUser(customer.id, '🎁 Reward Redeemed!', `You redeemed "${item.title}" for ${item.pointsCost} pts.`, 'REDEMPTION', redemptionUrl());

  audit({
    actorId: req.user!.id, actorName: req.user!.name, actorRole: req.user!.role,
    action: 'CATALOG_REDEMPTION', entity: 'catalog_redemption', entityId: customer.id,
    details: { item: item.title, pointsCost: item.pointsCost, customerName: customer.name, ...servedByDetails(served.servedBy) },
    storeId,
  });

  res.json({ success: true, message: `${item.title} redeemed`, data: { remainingPts: Math.round(outcome.balance * 100) } });
}

// status=NEEDS_REVIEW is the admin's default view: held sales that have their receipt photo, what the sidebar badge counts. A sale still
// waiting for its photo is shown nowhere (the cashier may still be taking it); a cancelled one only under status=CANCELLED (2026-10-18).
const NEEDS_REVIEW = 'NEEDS_REVIEW';

// Turns the list / CSV query string into a database filter. The admin page only sends valid values; anything else
// (a typed URL, a script) gets a clear 400 instead of a database error and a 500.
function parseTransactionFilters(q: Record<string, unknown>):
  | { where: Prisma.PointsTransactionWhereInput; needsReview: boolean }
  | { error: string } {
  for (const key of ['storeId', 'status', 'category', 'from', 'to', 'search', 'customerId', 'grantedById', 'minAmount', 'maxAmount', 'includeTestData', 'addOn']) {
    if (q[key] !== undefined && typeof q[key] !== 'string') return { error: `"${key}" may be given only once` };
  }
  const { storeId, status, category, from, to, search, customerId, grantedById, minAmount, maxAmount, includeTestData, addOn } = q as Record<string, string | undefined>;
  const where: Prisma.PointsTransactionWhereInput = {};
  let needsReview = false;

  if (storeId) where.storeId = storeId;
  if (status) {
    if (status === NEEDS_REVIEW) {
      needsReview = true;
      Object.assign(where, AWAITING_DECISION);
    } else if ((Object.values(TransactionStatus) as string[]).includes(status)) {
      where.status = status as TransactionStatus;
    } else {
      return { error: `"status" must be ${[NEEDS_REVIEW, ...Object.values(TransactionStatus)].join(', ')}` };
    }
  }
  if (category) {
    if (!(Object.values(ProductCategory) as string[]).includes(category)) return { error: `"category" must be ${Object.values(ProductCategory).join(', ')}` };
    where.category = category as ProductCategory;
  }
  const fromDay = from?.slice(0, 10);
  const toDay = to?.slice(0, 10);
  if ((fromDay && !isRealDateKey(fromDay)) || (toDay && !isRealDateKey(toDay))) {
    return { error: '"from" and "to" must be real dates written YYYY-MM-DD' };
  }
  if (fromDay || toDay) {
    const range: Prisma.DateTimeFilter = {};
    if (fromDay) range.gte = startOfStoreDate(fromDay);
    if (toDay)   range.lte = endOfStoreDate(toDay);
    where.createdAt = range;
  }

  if (customerId) where.customerId = customerId;
  // An employee's sales include the ones HQ entered for them (utils/servedBy.ts). AND, so it never collides with the search's OR.
  if (grantedById) where.AND = [{ OR: [{ grantedById }, { servedById: grantedById }] }];

  if (search !== undefined && search.trim() !== '') {
    if (search.length > 100) return { error: '"search" is too long (100 characters at most)' };
    Object.assign(where, transactionSearchWhere(search));
  }

  if (minAmount !== undefined || maxAmount !== undefined) {
    const min = minAmount !== undefined ? Number(minAmount) : undefined;
    const max = maxAmount !== undefined ? Number(maxAmount) : undefined;
    if (minAmount !== undefined && !(Number.isFinite(min) && min! >= 0)) return { error: '"minAmount" must be a number of 0 or more' };
    if (maxAmount !== undefined && !(Number.isFinite(max) && max! >= 0)) return { error: '"maxAmount" must be a number of 0 or more' };
    if (min !== undefined && max !== undefined && min > max) return { error: '"minAmount" cannot be more than "maxAmount"' };
    const range: Prisma.FloatFilter = {};
    if (min !== undefined) range.gte = min;
    if (max !== undefined) range.lte = max;
    where.purchaseAmount = range;
  }

  // Test sales (the seed-test-data route, or a sale flagged by hand) are left out by default, the same as
  // Analytics, billing and the store health figures — this page's own numbers should match those without
  // asking. "includeTestData=true" shows both; there is no "test data only" mode, since nothing needs it yet.
  if (includeTestData !== 'true') where.isTestData = false;
  // Only receipts a cashier added after the customer left (2026-10-18)
  if (addOn === 'true') where.addOn = true;

  // Unfinished and cancelled sales stay out unless asked for by name
  if (status !== TransactionStatus.CANCELLED) where.AND = [...((where.AND as Prisma.PointsTransactionWhereInput[] | undefined) ?? []), ...(SHOWN.AND as Prisma.PointsTransactionWhereInput[])];

  return { where, needsReview };
}

function parsePaging(q: Record<string, unknown>): { page: number; take: number; skip: number } | { error: string } {
  const page = q.page === undefined ? 1 : Number(q.page);
  const limit = q.limit === undefined ? 25 : Number(q.limit);
  if (!Number.isInteger(page) || page < 1 || page > 100_000) return { error: '"page" must be a whole number of 1 or more' };
  if (!Number.isInteger(limit) || limit < 1) return { error: '"limit" must be a whole number of 1 or more' };
  const take = Math.min(limit, 100);
  return { page, take, skip: (page - 1) * take };
}

// SuperAdmin+: all-store transactions with filters
export async function getAllTransactions(req: AuthRequest, res: Response) {
  const filters = parseTransactionFilters(req.query);
  if ('error' in filters) { res.status(400).json({ success: false, error: filters.error }); return; }
  const paging = parsePaging(req.query);
  if ('error' in paging) { res.status(400).json({ success: false, error: paging.error }); return; }
  const { where, needsReview } = filters;
  const { page, take, skip } = paging;

  // Flagged before pending (the status enum sorts PENDING, APPROVED, REJECTED, FLAGGED), newest first within each
  const orderBy: Prisma.PointsTransactionOrderByWithRelationInput[] = needsReview
    ? [{ status: 'desc' }, { createdAt: 'desc' }]
    : [{ createdAt: 'desc' }];

  const [transactions, total, aggStats] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where,
      orderBy,
      skip,
      take,
      include: {
        customer:  { select: { id: true, name: true, phone: true } },
        grantedBy: { select: { id: true, name: true, phone: true } },
        servedBy:  { select: { id: true, name: true, phone: true } },
        store:     { select: { id: true, name: true } },
      },
    }),
    prisma.pointsTransaction.count({ where }),
    prisma.pointsTransaction.aggregate({
      where: { ...where, status: 'APPROVED' },
      // gasBonusPoints too: a Gold+ customer's per-gallon bonus is real cashback, credited on top of
      // pointsAwarded, not folded into it (docs/confidential/admin-audit/04-transactions.md finding #10 —
      // this summary used to under-count it).
      _sum: { purchaseAmount: true, pointsAwarded: true, gasBonusPoints: true },
    }),
  ]);

  res.json({
    success: true,
    data: {
      transactions, total,
      page, limit: take,
      summary: {
        purchaseVolume: parseFloat((aggStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat(((aggStats._sum.pointsAwarded ?? 0) + (aggStats._sum.gasBonusPoints ?? 0)).toFixed(2)),
      },
    },
  });
}

// SuperAdmin / StoreManager: export transactions as CSV
// Dates and times are written in the stores' own (Central) time, like every screen, so a late-evening sale is on the
// right day. Customer-typed text is defused so a spreadsheet never reads it as a formula.
export async function exportTransactionsCsv(req: AuthRequest, res: Response) {
  const filters = parseTransactionFilters(req.query);
  if ('error' in filters) { res.status(400).json({ success: false, error: filters.error }); return; }
  const storeId = req.query.storeId as string | undefined;

  const user = req.user!;
  // StoreManager can only export their own store
  if (user.role === Role.STORE_MANAGER) {
    if (!storeId || !user.storeIds?.includes(storeId)) {
      res.status(403).json({ success: false, error: 'Specify a store you manage' });
      return;
    }
  }

  const TAKE = 10000;
  const rows = await prisma.pointsTransaction.findMany({
    where: filters.where,
    orderBy: { createdAt: 'desc' },
    take: TAKE,
    include: {
      customer:  { select: { name: true, phone: true } },
      grantedBy: { select: { name: true, phone: true } },
      servedBy:  { select: { name: true, phone: true } },
      store:     { select: { name: true } },
    },
  });
  const truncated = rows.length === TAKE;

  const header = 'Transaction ID,Date (Central),Time (Central),Store,Customer Name,Customer Phone,Employee Name,Employee Phone,Category,Purchase Amount,Points Awarded,Gallons,Status,Fraud Flags,Receipt Link,Test Data,Entered By HQ\n';
  const lines = rows.map(t => {
    const d = new Date(t.createdAt);
    let flags: string[] = [];
    try { flags = t.fraudFlags ? JSON.parse(t.fraudFlags) : []; } catch { /* unreadable flag text: leave blank rather than fail the whole export */ }
    return [
      t.id,
      storeDateText(d),
      storeTimeText(d),
      csvText(t.store.name),
      csvText(t.customer.name),
      csvText(t.customer.phone),
      // The employee who served: the one HQ entered the sale for, when it did (last column names HQ)
      csvText((t.servedBy ?? t.grantedBy)?.name),
      csvText((t.servedBy ?? t.grantedBy)?.phone),
      t.category,
      Number(t.purchaseAmount).toFixed(2),
      Number(t.pointsAwarded).toFixed(2),
      t.isGas && t.gasGallons != null ? Number(t.gasGallons).toFixed(3) : '',
      t.status,
      csvText(flags.join('; ')),
      csvText(t.receiptImageUrl),
      t.isTestData ? 'Yes' : '',
      t.servedBy ? csvText(t.grantedBy?.name) : '',
    ].join(',');
  }).join('\n');
  const notice = truncated ? `\n"Showing the first ${TAKE.toLocaleString()} rows for this filter. Narrow the dates or store to see the rest."\n` : '';

  const storePart = storeId ? (rows[0]?.store?.name ?? 'store').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'store' : 'all';
  const filename = `transactions-${storePart}-${storeDateKey()}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(header + lines + notice);
}

// ── Points expiry (2026-10-17, utils/pointLots.ts) ──

/** GET /points/my-expiry (customer): the next points to expire, the next few dates, and what expired in the last year. */
export async function getMyExpiry(req: AuthRequest, res: Response) {
  res.json({ success: true, data: await expirySummary(req.user!.id) });
}

/** GET /points/expiry/customer/:userId (HQ): the same for one customer, and whether their batches add up to their balance. */
export async function getCustomerExpiry(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  const [summary, check] = await Promise.all([expirySummary(userId), lotsMatch(prisma, userId)]);
  res.json({ success: true, data: { ...summary, batchesMatchBalance: check.ok, balance: check.balance, inBatches: check.inLots } });
}

/** POST /points/expiry/undo/:userId (HQ) { lotIds? }: gives a customer's expired points back as a fresh batch. */
export async function undoCustomerExpiry(req: AuthRequest, res: Response) {
  const { userId } = req.params;
  const lotIds = Array.isArray(req.body?.lotIds) ? (req.body.lotIds as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 500) : undefined;
  const given = await undoExpiry(userId, { id: req.user!.id, name: req.user!.name, role: req.user!.role }, lotIds);
  if (given <= 0) { res.status(400).json({ success: false, error: 'This customer has no expired points to give back.' }); return; }
  res.json({ success: true, data: { points: Math.round(given * 100), dollars: given } });
}

/**
 * A held sale's alert (2026-10-18): sent when its receipt photo arrives, not when the cashier pressed Grant, so a sale that is never
 * finished alerts nobody. Once per sale: the first held line of a multi-line sale sends it, for the whole sale.
 */
async function alertHeldSale(t: { id: string; saleId: string | null; storeId: string; customerId: string; grantedById: string; servedById: string | null; purchaseAmount: number; fraudFlags: string | null }, employee: { id: string; name?: string | null }) {
  const lines = t.saleId
    ? await prisma.pointsTransaction.findMany({ where: { OR: [{ id: t.saleId }, { saleId: t.saleId }], status: { notIn: NOT_A_SALE } }, select: { id: true, status: true, purchaseAmount: true, createdAt: true }, orderBy: { createdAt: 'asc' } })
    : [{ id: t.id, status: TransactionStatus.FLAGGED, purchaseAmount: t.purchaseAmount, createdAt: new Date() }];
  const firstHeld = lines.find((l) => l.status === TransactionStatus.FLAGGED);
  if (firstHeld && firstHeld.id !== t.id) return;
  const total = lines.reduce((n, l) => n + l.purchaseAmount, 0);
  const [store, customer, served] = await Promise.all([
    prisma.store.findUnique({ where: { id: t.storeId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: t.customerId }, select: { name: true, phone: true } }),
    t.servedById ? prisma.user.findUnique({ where: { id: t.servedById }, select: { name: true } }) : Promise.resolve(null),
  ]);
  let flags: string[] = [];
  try { flags = t.fraudFlags ? JSON.parse(t.fraudFlags) : []; } catch { /* unreadable flag text */ }
  // Tell the people who can decide: this store's active managers and every active Super Admin (not every store's managers, and not anyone who has left)
  for (const id of await flaggedSaleRecipientIds(t.storeId)) {
    sendPushToUser(id, '🚨 Sale held for review', `$${total.toFixed(2)} sale held for review at ${store?.name ?? 'your store'}.`, 'ALERT');
  }
  // A large one also goes to HQ's email: an admin who is not looking at the page or the phone would not hear about it until much later
  if (total >= rule('reviewEmailHQAmount')) {   // HQ's amount (Settings > Sales review)
    const by = served ? `${served.name || 'an employee'} (entered by HQ, ${employee.name || 'HQ'})` : employee.name || 'a cashier';
    emailHQ(
      `Sale held for review: $${total.toFixed(2)} at ${store?.name ?? 'a store'}`,
      'A large sale is held for review',
      [`$${total.toFixed(2)} at ${store?.name ?? 'a store'}, granted by ${by} for ${customer?.name || customer?.phone || 'a customer'}.`, `Held because: ${flags.join(', ') || 'review'}.`, 'It is not credited until a manager or HQ approves it.'],
      { path: '/transactions', label: 'Review the sale' },
      'LARGE_SALE',
    );
  }
}

/**
 * POST /points/grant/cancel { ids } (cashier, 2026-10-18): the cashier pressed Cancel after Grant and before the receipt photo. Their own
 * lines still waiting for a photo are cancelled; nothing was credited and nobody is told. A manager or HQ may cancel any unfinished line
 * at their stores. Lines that already have their photo, or were decided, are left as they are.
 */
export async function cancelGrant(req: AuthRequest, res: Response) {
  const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 20) : [];
  if (!ids.length) { res.status(400).json({ success: false, error: 'Say which sale to cancel.' }); return; }
  const user = req.user!;
  const who: Prisma.PointsTransactionWhereInput = hasMinRole(user.role, Role.SUPER_ADMIN) ? {}
    : hasMinRole(user.role, Role.STORE_MANAGER) ? { OR: [{ grantedById: user.id }, { storeId: { in: user.storeIds ?? [] } }] }
    : { grantedById: user.id };
  const reason = hasMinRole(user.role, Role.STORE_MANAGER) ? 'MANAGER' : 'CASHIER';
  const cancelled = await cancelUnfinished({ id: { in: ids }, ...who }, reason);
  if (cancelled) audit({ actorId: user.id, actorName: user.name, actorRole: user.role, action: 'CANCEL_UNFINISHED_SALES', entity: 'transaction', details: { count: cancelled, ids, reason }, storeId: null });
  res.json({ success: true, data: { cancelled } });
}

// ── A receipt the customer left behind (2026-10-18) ──
// The QR scan is what proves the customer was there. Without it, a receipt can only go to a customer this cashier served at this store
// in the last hour (HQ's minutes), as part of that sale, with a new photo, a few a day (HQ's number), held for a manager from HQ's amount,
// and the customer is told who added it. HQ sees it labelled on the Transactions page.

const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || 'A cashier';
const lastFour = (phone?: string | null) => (phone ?? '').replace(/\D/g, '').slice(-4);

type AddOnCheck =
  | { ok: true; root: string; lineIds: string[]; customer: NonNullable<Awaited<ReturnType<typeof prisma.user.findUnique>>> }
  | { ok: false; status: number; code: string; error: string };

/** Can this cashier add a receipt to the sale that `lineId` is a line of? */
async function addOnTarget(employeeId: string, lineId: string, storeId?: string, now: Date = new Date()): Promise<AddOnCheck> {
  const perDay = rule('addOnsPerDay');
  if (perDay <= 0) return { ok: false, status: 403, code: 'ADD_ON_OFF', error: 'Adding a receipt after the customer left is switched off. Ask your manager.' };
  const line = await prisma.pointsTransaction.findUnique({ where: { id: lineId } });
  if (!line || line.grantedById !== employeeId || line.challengeId || line.referralId) {
    return { ok: false, status: 404, code: 'NOT_YOUR_SALE', error: 'You can only add a receipt to a sale you entered.' };
  }
  if (storeId && line.storeId !== storeId) return { ok: false, status: 400, code: 'OTHER_STORE', error: 'That sale was at another store.' };
  const root = line.saleId ?? line.id;
  const lines = await prisma.pointsTransaction.findMany({ where: { OR: [{ id: root }, { saleId: root }] }, select: { id: true, createdAt: true, status: true, receiptImageUrl: true } });
  const first = lines.reduce((a, b) => (b.createdAt < a.createdAt ? b : a), lines[0] ?? { ...line });
  const live = lines.some((l) => l.receiptImageUrl && ([TransactionStatus.APPROVED, TransactionStatus.PENDING, TransactionStatus.FLAGGED] as TransactionStatus[]).includes(l.status));
  if (!live) return { ok: false, status: 409, code: 'SALE_NOT_LIVE', error: 'That sale was not finished or was rejected, so a receipt cannot be added to it.' };
  const minutes = rule('addOnWindowMinutes');
  if (now.getTime() - first.createdAt.getTime() > minutes * 60_000) {
    return { ok: false, status: 409, code: 'TOO_LATE', error: `A receipt can be added only within ${minutes} minutes of the sale. Ask the customer to report missing points in the app.` };
  }
  const used = await prisma.pointsTransaction.count({ where: { grantedById: employeeId, addOn: true, createdAt: { gte: storeDayStart(now) }, status: { not: TransactionStatus.CANCELLED } } });
  if (used >= perDay) return { ok: false, status: 429, code: 'ADD_ON_LIMIT', error: `You have added ${perDay} receipts this way today, the most allowed. Ask your manager.` };
  const customer = await prisma.user.findUnique({ where: { id: line.customerId } });
  if (!customer || !isCustomerAccount(customer)) return { ok: false, status: 404, code: 'NO_CUSTOMER', error: 'That customer account is no longer active.' };
  return { ok: true, root, lineIds: lines.map((l) => l.id), customer };
}

/** The customer hears who added a receipt they left, and whether it is credited or being checked. */
async function tellAddOn(t: { id: string; customerId: string; storeId: string; purchaseAmount: number; pointsAwarded: number; gasBonusPoints: number }, employee: { name?: string | null }, held: boolean) {
  const [store, customer] = await Promise.all([
    prisma.store.findUnique({ where: { id: t.storeId }, select: { name: true } }),
    prisma.user.findUnique({ where: { id: t.customerId }, select: { language: true } }),
  ]);
  const es = customer?.language === 'es';
  const who = firstName(employee.name), where = store?.name ?? 'Lucky Stop', amount = `$${t.purchaseAmount.toFixed(2)}`, pts = Math.round((t.pointsAwarded + t.gasBonusPoints) * 100);
  const [title, body] = held
    ? (es ? ['Recibo agregado', `${who} agregó tu compra de ${amount} de hoy en ${where}. Un gerente la revisa antes de agregar los puntos.`]
          : ['Receipt added', `${who} added your ${amount} purchase from today at ${where}. A manager checks it before the points are added.`])
    : (es ? ['💰 ¡Puntos acreditados!', `${who} agregó tu compra de ${amount} de hoy en ${where}. ${pts} pts agregados.`]
          : ['💰 Points Credited!', `${who} added your ${amount} purchase from today at ${where}. ${pts} pts added.`]);
  sendPushToUser(t.customerId, title, body, 'POINTS', pointsUrl(t.id));
}

/**
 * GET /points/cashier/recent (2026-10-18): the cashier's own sales and redemptions today, newest first, a sale's lines together, so they
 * can check "did that go through?" and add a receipt the customer left behind. The customer shows as first name and the last 4 digits
 * of their phone. Cancelled attempts are left out.
 */
export async function getCashierRecent(req: AuthRequest, res: Response) {
  const me = req.user!;
  const now = new Date();
  const since = storeDayStart(now);
  const [sales, credits, rewards, used] = await Promise.all([
    prisma.pointsTransaction.findMany({
      where: { OR: [{ grantedById: me.id }, { servedById: me.id }], createdAt: { gte: since }, challengeId: null, referralId: null, status: { not: TransactionStatus.CANCELLED } },
      include: { customer: { select: { name: true, phone: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: 'desc' }, take: 200,
    }),
    prisma.creditRedemption.findMany({ where: { processedBy: me.id, createdAt: { gte: since } }, include: { customer: { select: { name: true, phone: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.catalogRedemption.findMany({ where: { processedById: me.id, createdAt: { gte: since }, status: 'COMPLETED' }, include: { customer: { select: { name: true, phone: true } }, catalogItem: { select: { title: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.pointsTransaction.count({ where: { grantedById: me.id, addOn: true, createdAt: { gte: since }, status: { not: TransactionStatus.CANCELLED } } }),
  ]);
  const who = (c?: { name: string | null; phone: string | null } | null) => ({ name: firstName(c?.name ?? '') === 'A cashier' ? '' : firstName(c?.name ?? ''), last4: lastFour(c?.phone) });
  const status = (t: { status: TransactionStatus; receiptImageUrl: string | null }) =>
    t.status === TransactionStatus.APPROVED ? 'CREDITED'
    : (t.status === TransactionStatus.PENDING || t.status === TransactionStatus.FLAGGED) && !t.receiptImageUrl ? 'NOT_FINISHED'
    : t.status === TransactionStatus.PENDING || t.status === TransactionStatus.FLAGGED ? 'HELD'
    : t.status;   // REJECTED, VOIDED
  const perDay = rule('addOnsPerDay'), minutes = rule('addOnWindowMinutes');
  const left = Math.max(0, perDay - used);
  const bySale = new Map<string, typeof sales>();
  for (const t of sales) { const k = t.saleId ?? t.id; bySale.set(k, [...(bySale.get(k) ?? []), t]); }
  const out = [...bySale.entries()].map(([saleId, lines]) => {
    const first = lines.reduce((a, b) => (b.createdAt < a.createdAt ? b : a));
    const until = new Date(first.createdAt.getTime() + minutes * 60_000);
    const live = lines.some((l) => l.receiptImageUrl && l.status !== TransactionStatus.REJECTED && l.status !== TransactionStatus.VOIDED);
    return {
      saleId, createdAt: first.createdAt, store: first.store?.name ?? null, customer: who(first.customer),
      lines: lines.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).map((l) => ({
        id: l.id, category: l.category, purchaseAmount: l.purchaseAmount, points: Math.round((l.pointsAwarded + l.gasBonusPoints) * 100), status: status(l), addOn: l.addOn,
      })),
      canAddReceipt: perDay > 0 && left > 0 && live && first.grantedById === me.id && until > now,
      addReceiptUntil: until,
    };
  }).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  res.json({ success: true, data: {
    sales: out,
    redemptions: [
      ...credits.map((c) => ({ id: c.id, kind: 'CREDITS', createdAt: c.createdAt, customer: who(c.customer), points: Math.round(c.amount * 100), title: null as string | null })),
      ...rewards.map((r) => ({ id: r.id, kind: 'REWARD', createdAt: r.createdAt, customer: who(r.customer), points: r.pointsSpent, title: r.catalogItem?.title ?? null })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    addReceipts: { left, perDay, minutes, holdFrom: rule('addOnHoldAmount') },
  } });
}
