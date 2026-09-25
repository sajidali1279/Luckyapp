import { createHash } from 'crypto';
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
import { getCurrentPeriod, GAS_BONUS_PER_GALLON, getNextTierProgress, getStoredThresholds, updateCustomerTierIfNeeded, effectiveTier } from '../utils/tier';
import { pickOffer, percentBonus, isCentsPerGallon } from '../utils/offerPick';
import { storeDayStart, storeDayEnd, storeMonthStart, storeDateKey, addStoreDays, startOfStoreDate, endOfStoreDate, isRealDateKey, storeDateText, storeTimeText } from '../utils/storeTime';
import { approveAndCredit, rejectIfStill, ALREADY_DECIDED_MESSAGE } from '../utils/saleDecision';
import { csvText } from '../utils/csv';
import { flaggedSaleRecipientIds } from '../utils/alertRecipients';
import { refuseIfStoreClosed } from '../utils/storeRules';
import { emailHQ, URGENT_SALE_AMOUNT } from '../utils/adminEmail';
import { COMPARE_RANGES, CompareRange, compareWindows, summarize } from '../utils/dashboardWindows';
import { classifyCashbackRatio } from './billing.controller';
import { transactionSearchWhere } from '../utils/transactionSearch';
import { lockCustomer, REPEAT_WINDOW_MS } from '../utils/moneyGuards';

// Employee: initiate a points grant (before receipt upload)
const grantSchema = z.object({
  customerQrCode: z.string(),
  storeId: z.string().uuid(),
  purchaseAmount: z.number().positive(),
  category: z.nativeEnum(ProductCategory).optional().default(ProductCategory.OTHER),
  notes: z.string().optional(),
  // Gas fields
  isGas: z.boolean().optional().default(false),
  gasGallons: z.number().positive().optional(),
  gasPricePerGallon: z.number().positive().optional(),
});

export async function initiateGrant(req: AuthRequest, res: Response) {
  const parsed = grantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { customerQrCode, storeId, purchaseAmount, category, notes, isGas, gasGallons, gasPricePerGallon } = parsed.data;
  const employee = req.user!;

  // Prevent employee from granting to themselves
  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR code not found' });
    return;
  }
  if (customer.id === employee.id) {
    res.status(403).json({ success: false, error: 'Cannot grant points to yourself' });
    return;
  }

  // Look up tier base rate, active promo offer, and store dev-cut rate simultaneously
  const now = new Date();
  const customerTier = effectiveTier(customer).tier; // the tier after any half-year step down that has not been written yet

  const [tierRate, categoryRate, allActiveOffers, store] = await Promise.all([
    prisma.tierCashbackRate.findUnique({ where: { tier: customerTier } }),
    prisma.categoryRate.findUnique({ where: { category: category as any } }),
    prisma.offer.findMany({
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now } },
      select: { id: true, createdAt: true, bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, title: true, category: true, type: true, storeId: true },
    }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true, isActive: true, transactionFeeRate: true, gasPricePerGallon: true, dieselPricePerGallon: true } }),
  ]);

  if (store && store.isActive === false) {
    res.status(409).json({ success: false, error: `${store.name} is closed, so sales cannot be recorded there. Ask HQ to reopen it.` });
    return;
  }

  // Filter to relevant offers for this store (JS filter — avoids Prisma AND/OR nesting bugs)
  const allStoreOffers = allActiveOffers.filter((o) =>
    (o.bonusRate !== null || o.gasBonusCentsPerGallon !== null) &&
    (o.type === OfferType.ALL_STORES || o.storeId === storeId)
  );

  // Tier base rate + optional per-category bonus (additive)
  const tierBaseRate = tierRate?.cashbackRate ?? DEFAULT_TIER_RATES[customerTier] ?? 0.01;
  const categoryBonus = categoryRate?.cashbackRate ?? 0;

  // Gas ¢/gallon mode — category is authoritative; gallons come from mobile or are estimated from store price
  const isGasCategory = category === ProductCategory.GAS || category === ProductCategory.DIESEL;
  const gasPerGallonRate = tierRate?.gasCentsPerGallon ?? null;

  // If gallons weren't sent by mobile, estimate from the store's posted price
  let effectiveGallons = (gasGallons != null && gasGallons > 0) ? gasGallons : null;
  if (isGasCategory && effectiveGallons == null && store) {
    const storeGasPrice = category === ProductCategory.GAS ? store.gasPricePerGallon : store.dieselPricePerGallon;
    if (storeGasPrice && storeGasPrice > 0) effectiveGallons = purchaseAmount / storeGasPrice;
  }

  const usePerGallonMode = isGasCategory && effectiveGallons != null && gasPerGallonRate != null && gasPerGallonRate > 0;

  // Only one promotion applies to a sale; utils/offerPick.ts says which (same answer whatever order the rows come back in)
  const activeOffer = pickOffer(allStoreOffers, { storeId, category, tier: customerTier, purchaseAmount, gallons: effectiveGallons });

  let cashbackIssued: number;
  let effectiveCashbackRate: number;
  let promotionApplied: string | null = null;
  let promotionCashback = 0; // the part of the cashback that comes from the promotion, in dollars

  // A cents-per-gallon promotion pays cents only: its percentage is 0 here even if an old row still carries one
  const promoBonus = activeOffer ? percentBonus(activeOffer, customerTier) : 0;
  const cpgPays = activeOffer != null && isCentsPerGallon(activeOffer) && effectiveGallons != null;
  promotionApplied = promoBonus > 0 || cpgPays ? activeOffer!.title : null;

  if (usePerGallonMode) {
    const perGallonCashback = parseFloat((effectiveGallons! * gasPerGallonRate / 100).toFixed(4));
    let promoCashback: number;
    if (activeOffer?.gasBonusCentsPerGallon != null) {
      promoCashback = parseFloat((effectiveGallons! * activeOffer.gasBonusCentsPerGallon / 100).toFixed(4));
    } else {
      promoCashback = parseFloat((purchaseAmount * promoBonus).toFixed(4));
    }
    promotionCashback     = promoCashback;
    cashbackIssued        = parseFloat((perGallonCashback + promoCashback).toFixed(4));
    effectiveCashbackRate = purchaseAmount > 0 ? parseFloat((cashbackIssued / purchaseAmount).toFixed(4)) : 0;
  } else {
    // % mode — for gas with ¢/gal offer and known gallons, apply the ¢/gal offer bonus additively
    const gasCpgBonus = isGasCategory && effectiveGallons != null && activeOffer?.gasBonusCentsPerGallon != null
      ? parseFloat((effectiveGallons * activeOffer.gasBonusCentsPerGallon / 100).toFixed(4))
      : 0;
    const pctRate = parseFloat((tierBaseRate + categoryBonus + (gasCpgBonus > 0 ? 0 : promoBonus)).toFixed(4));
    const pctCashback = parseFloat((purchaseAmount * pctRate).toFixed(4));
    promotionCashback     = gasCpgBonus > 0 ? gasCpgBonus : parseFloat((purchaseAmount * promoBonus).toFixed(4));
    cashbackIssued        = parseFloat((pctCashback + gasCpgBonus).toFixed(4));
    effectiveCashbackRate = purchaseAmount > 0 ? parseFloat((cashbackIssued / purchaseAmount).toFixed(4)) : 0;
  }

  // ── Compound rate cap — hard ceiling to protect against misconfigured category/promo rates ──
  // The warn and cap lines are there to catch a tier or category rate set too high. When the excess comes from a
  // live promotion (its size is limited when it is posted), the ceiling still applies but the sale is not held:
  // otherwise every sale a +7% or +10% promotion touches would wait for a manager and bury the real alerts.
  const rateCappedFlags: string[] = [];
  const standingRate = purchaseAmount > 0 ? (cashbackIssued - promotionCashback) / purchaseAmount : 0;
  const promoExplainsRate = promotionCashback > 0 && standingRate <= CASHBACK_RATE_WARN;
  if (effectiveCashbackRate > CASHBACK_RATE_CAP) {
    cashbackIssued        = parseFloat((purchaseAmount * CASHBACK_RATE_CAP).toFixed(4));
    effectiveCashbackRate = CASHBACK_RATE_CAP;
    if (!promoExplainsRate) rateCappedFlags.push('CASHBACK_RATE_CAPPED');
  } else if (effectiveCashbackRate > CASHBACK_RATE_WARN) {
    if (!promoExplainsRate) rateCappedFlags.push('HIGH_CASHBACK_RATE');
  }

  // Gas tier bonus (Gold+ extra per-gallon bonus — stacks on top regardless of mode). Computed BEFORE the
  // platform fee, not after: this money is credited to the customer exactly like the rest of their cashback,
  // so the store's fee has to be taken on the full total, not just the base rate. Before this fix, devCut was
  // computed on cashbackIssued alone, so a Gold+ customer's gas bonus was credited to them at the store's full
  // cost with no platform fee collected on that portion at all (docs/confidential/admin-audit/04-transactions.md
  // finding #10 — no live exposure yet, since no real customer had reached Gold when this was found).
  const gasBonusRate = (isGasCategory && effectiveGallons) ? (GAS_BONUS_PER_GALLON[customerTier] ?? 0) : 0;
  const gasBonusPoints = parseFloat(((effectiveGallons ?? 0) * gasBonusRate).toFixed(2));

  const devCutRate = store?.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const devCut = parseFloat(((cashbackIssued + gasBonusPoints) * devCutRate).toFixed(4));
  const pointsAwarded = cashbackIssued;
  const storeCost = devCut;

  // ── Fraud detection ──────────────────────────────────────────────────────
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
  const oneHourAgo    = new Date(Date.now() - 60 * 60 * 1000);
  const startOfToday  = storeDayStart();

  const [recentDuplicate, customerTodayCount, employeeHourCount, pairTodayCount] = await Promise.all([
    prisma.pointsTransaction.findFirst({
      where: { customerId: customer.id, grantedById: employee.id, createdAt: { gte: twoMinutesAgo }, status: { not: TransactionStatus.REJECTED } },
    }),
    prisma.pointsTransaction.count({
      where: { customerId: customer.id, storeId, createdAt: { gte: startOfToday }, status: { not: TransactionStatus.REJECTED } },
    }),
    prisma.pointsTransaction.count({
      where: { grantedById: employee.id, createdAt: { gte: oneHourAgo }, status: { not: TransactionStatus.REJECTED } },
    }),
    prisma.pointsTransaction.count({
      where: { customerId: customer.id, grantedById: employee.id, createdAt: { gte: startOfToday }, status: { not: TransactionStatus.REJECTED } },
    }),
  ]);

  // Hard auto-reject
  if (recentDuplicate) {
    res.status(409).json({ success: false, error: 'Duplicate transaction detected. This customer was just served by you within the last 2 minutes.' });
    return;
  }
  if (purchaseAmount > 2000) {
    res.status(400).json({ success: false, error: 'Transaction amount exceeds the maximum allowed ($2,000). Contact your manager.' });
    return;
  }

  // Soft flags — create as FLAGGED, hold points for manager review
  const fraudFlags: string[] = [...rateCappedFlags];
  if (purchaseAmount > 500 && !isGasCategory) fraudFlags.push('HIGH_AMOUNT');
  if (purchaseAmount > 800)                   fraudFlags.push('LARGE_PURCHASE');
  if (customerTodayCount >= 4)                fraudFlags.push('CUSTOMER_VELOCITY');
  if (employeeHourCount >= 15)                fraudFlags.push('EMPLOYEE_VELOCITY');
  if (pairTodayCount >= 2)                    fraudFlags.push('REPEAT_PAIR');

  const isFlagged = fraudFlags.length > 0;

  // Create transaction in PENDING (or FLAGGED) state — no points credited yet
  const transaction = await prisma.pointsTransaction.create({
    data: {
      customerId: customer.id,
      grantedById: employee.id,
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
    },
  });

  // Tell the people who can decide: this store's active managers and every active Super Admin (not every store's managers, and not anyone who has left)
  if (isFlagged) {
    const recipients = await flaggedSaleRecipientIds(storeId);
    for (const id of recipients) {
      sendPushToUser(id, '🚨 Sale held for review', `$${purchaseAmount.toFixed(2)} sale held for review at ${store?.name ?? 'your store'}.`, 'ALERT');
    }
    // A large one also goes to HQ's email: an admin who is not looking at the page or the phone would not hear about it until much later
    if (purchaseAmount >= URGENT_SALE_AMOUNT) {
      emailHQ(
        `Sale held for review: $${purchaseAmount.toFixed(2)} at ${store?.name ?? 'a store'}`,
        'A large sale is held for review',
        [`$${purchaseAmount.toFixed(2)} at ${store?.name ?? 'a store'}, granted by ${employee.name || 'a cashier'} for ${customer.name || customer.phone}.`, `Held because: ${fraudFlags.join(', ')}.`, 'It is not credited until a manager or HQ approves it.'],
        { path: '/transactions', label: 'Review the sale' },
      );
    }
  }

  res.status(201).json({
    success: true,
    message: isFlagged ? 'Transaction flagged for manager review. Upload receipt to continue.' : 'Transaction created. Upload receipt to complete.',
    flagged: isFlagged,
    fraudFlags,
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
  if (transaction.status !== TransactionStatus.PENDING && transaction.status !== TransactionStatus.FLAGGED) {
    res.status(400).json({ success: false, error: 'Transaction already processed' });
    return;
  }
  if (!req.file) {
    res.status(400).json({ success: false, error: 'Receipt image is required' });
    return;
  }

  // Duplicate receipt detection — hash file bytes to prevent reusing the same photo
  const receiptHash = createHash('sha256').update(req.file!.buffer).digest('hex');
  // A multi-item sale (gas + groceries on one receipt) is one transaction per item, and the phone sends the same photo to each. Those
  // siblings (same customer, cashier and store, made within two minutes of each other) may share it; any other sale may not. Before,
  // the siblings only got through when their uploads happened to overlap: if one finished first, the next was refused as a reused
  // receipt and the cashier could not complete the sale.
  const SALE_WINDOW_MS = 2 * 60 * 1000;
  const sameHash = await prisma.pointsTransaction.findMany({
    where: { receiptImageHash: receiptHash, id: { not: transactionId } },
    select: { id: true, customerId: true, grantedById: true, storeId: true, createdAt: true },
  });
  const duplicateReceipt = sameHash.find((t) => !(
    t.customerId === transaction.customerId && t.grantedById === transaction.grantedById && t.storeId === transaction.storeId
    && Math.abs(t.createdAt.getTime() - transaction.createdAt.getTime()) <= SALE_WINDOW_MS
  ));
  if (duplicateReceipt) {
    res.status(409).json({ success: false, error: 'This receipt image has already been used for another transaction. Upload the original receipt photo.' });
    return;
  }

  // Upload receipt to Cloudinary
  const uploadResult = await new Promise<{ secure_url: string }>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'luckystop/receipts', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result as { secure_url: string });
      }
    );
    stream.end(req.file!.buffer);
  });

  const wasFlagged = transaction.status === TransactionStatus.FLAGGED;

  if (wasFlagged) {
    // Flagged: save receipt but hold points — manager must review
    const updatedTransaction = await prisma.pointsTransaction.update({
      where: { id: transactionId },
      data: { receiptImageUrl: uploadResult.secure_url, receiptImageHash: receiptHash },
    });
    res.json({
      success: true,
      message: 'Receipt uploaded. This transaction is flagged — a manager must approve it before points are credited.',
      flagged: true,
      data: updatedTransaction,
    });
    return;
  }

  // Normal path: approve and credit balance atomically, and only if the sale is still waiting
  // (an admin may have rejected it while the receipt was uploading)
  const totalPoints = transaction.pointsAwarded + transaction.gasBonusPoints;
  const settled = await prisma.$transaction(async (db) => {
    const customer = await approveAndCredit(db, transaction, TransactionStatus.PENDING, {
      receiptImageUrl: uploadResult.secure_url,
      receiptImageHash: receiptHash,
    });
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

  sendPushToUser(
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
});

export async function redeemCredits(req: AuthRequest, res: Response) {
  const parsed = redeemSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { customerQrCode, storeId, amount } = parsed.data;
  const employee = req.user!;
  if (await refuseIfStoreClosed(res, storeId)) return;

  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer QR code not found' });
    return;
  }
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
    await tx.creditRedemption.create({
      data: { customerId: customer.id, storeId, amount, devCut: 0, processedBy: employee.id },
    });
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
    details: { amount, customerId: customer.id, customerName: customer.name, customerPhone: customer.phone },
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

  const [transactions, total] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where: { customerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
      include: { store: { select: { name: true } } },
    }),
    prisma.pointsTransaction.count({
      where: { customerId: req.user!.id },
    }),
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
    return db.user.update({
      where: { id: transaction.customerId },
      data: { pointsBalance: { decrement: totalPoints }, periodPoints: { decrement: totalPoints } },
    });
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
      _count: true,
      _sum: { pointsAwarded: true, purchaseAmount: true },
    }),
    prisma.pointsTransaction.count({ where: { storeId, status: TransactionStatus.PENDING } }),
    prisma.pointsTransaction.aggregate({
      where: { storeId, status: TransactionStatus.APPROVED },
      _count: true,
      _sum: { pointsAwarded: true, purchaseAmount: true },
    }),
  ]);

  const recent = await prisma.pointsTransaction.findMany({
    where: { storeId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { customer: { select: { name: true, phone: true } }, grantedBy: { select: { name: true } } },
  });

  res.json({
    success: true,
    data: {
      store,
      today: {
        transactions: todayStats._count,
        pointsAwarded: todayStats._sum.pointsAwarded || 0,
        purchaseVolume: todayStats._sum.purchaseAmount || 0,
      },
      pending: pendingCount,
      allTime: {
        transactions: allTimeStats._count,
        pointsAwarded: allTimeStats._sum.pointsAwarded || 0,
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
    status?: TransactionStatus;
    page?: string;
    limit?: string;
  };

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [transactions, total] = await prisma.$transaction([
    prisma.pointsTransaction.findMany({
      where: { storeId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit),
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        grantedBy: { select: { id: true, name: true, phone: true } },
      },
    }),
    prisma.pointsTransaction.count({ where: { storeId, ...(status && { status }) } }),
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
      _count: true, _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED', createdAt: { gte: monthStart } },
      _count: true, _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
    prisma.pointsTransaction.count({ where: { status: 'PENDING' } }),
    prisma.pointsTransaction.count({ where: { status: 'FLAGGED' } }),
    prisma.pointsTransaction.aggregate({ where: { status: { in: ['PENDING', 'FLAGGED'] } }, _min: { createdAt: true } }),
    prisma.pointsTransaction.aggregate({
      where: { status: 'APPROVED' },
      _count: true, _sum: { purchaseAmount: true, pointsAwarded: true },
    }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED', createdAt: { gte: monthStart } },
      _count: true,
      _sum: { purchaseAmount: true, pointsAwarded: true },
      orderBy: { _sum: { purchaseAmount: 'desc' } },
    }),
    prisma.pointsTransaction.groupBy({
      by: ['storeId'],
      where: { status: 'APPROVED' },
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
        transactions: m?._count ?? 0,
        purchaseVolume: parseFloat(((m?._sum?.purchaseAmount) ?? 0).toFixed(2)),
        cashbackIssued: parseFloat(((m?._sum?.pointsAwarded) ?? 0).toFixed(2)),
        lastSaleAt: lastSaleByStore.get(s.id)?.toISOString() ?? null,
      };
    })
    .sort((a, b) => b.purchaseVolume - a.purchaseVolume || a.name.localeCompare(b.name));

  res.json({
    success: true,
    data: {
      today: {
        transactions: todayStats._count,
        purchaseVolume: parseFloat((todayStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((todayStats._sum.pointsAwarded ?? 0).toFixed(2)),
      },
      thisMonth: {
        transactions: monthStats._count,
        purchaseVolume: parseFloat((monthStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((monthStats._sum.pointsAwarded ?? 0).toFixed(2)),
      },
      pending: pendingCount,   // PENDING only (kept for older admin builds)
      flagged: flaggedCount,   // fraud-flagged, also waiting on a reviewer (the sidebar badge counts both)
      oldestReviewAt: oldestReview._min?.createdAt?.toISOString() ?? null, // when the longest-waiting pending or flagged item arrived
      allTime: {
        transactions: allTimeStats._count,
        purchaseVolume: parseFloat((allTimeStats._sum.purchaseAmount ?? 0).toFixed(2)),
        cashbackIssued: parseFloat((allTimeStats._sum.pointsAwarded ?? 0).toFixed(2)),
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
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true },
  });

  const byDate: Record<string, { date: string; transactions: number; purchaseVolume: number; cashbackIssued: number }> = {};
  for (let i = 0; i < days; i++) {
    const key = addStoreDays(firstKey, i);
    byDate[key] = { date: key, transactions: 0, purchaseVolume: 0, cashbackIssued: 0 };
  }
  for (const r of rows) {
    const b = byDate[storeDateKey(r.createdAt)];
    if (!b) continue;
    b.transactions++;
    b.purchaseVolume += r.purchaseAmount;
    b.cashbackIssued += r.pointsAwarded;
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
    select: { createdAt: true, purchaseAmount: true, pointsAwarded: true },
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
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: todayStart } }, _count: true, _sum: { purchaseAmount: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: lastWeekStart, lte: lastWeekEnd } }, _sum: { purchaseAmount: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: monthStart } }, _count: true, _sum: { purchaseAmount: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: { ...approved, createdAt: { gte: thirtyDaysAgo } }, _sum: { purchaseAmount: true, pointsAwarded: true }, orderBy: { storeId: 'asc' } }),
    prisma.pointsTransaction.groupBy({ by: ['storeId', 'status'], where: { status: { in: [TransactionStatus.PENDING, TransactionStatus.FLAGGED] } }, _count: true, orderBy: [{ storeId: 'asc' }, { status: 'asc' }] }),
    prisma.pointsTransaction.groupBy({ by: ['storeId'], where: approved, _max: { createdAt: true }, orderBy: { storeId: 'asc' } }),
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
    const cash30 = ratioBy.get(s.id)?._sum?.pointsAwarded ?? 0;
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
      todayTransactions: t?._count ?? 0, todayVolume, lastWeekVolume,
      monthTransactions: m?._count ?? 0, monthVolume: r2(m?._sum?.purchaseAmount ?? 0),
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
    where: { storeId: { in: storeIds }, status: { in: ['PENDING', 'FLAGGED'] } },
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
    silverRemaining = Math.max(0, 7 - used);
    benefitAvailable = silverRemaining > 0;
    benefitType = 'SILVER_FOUNTAIN';
  } else if (['GOLD', 'DIAMOND', 'PLATINUM'].includes(tier)) {
    const usedToday = await prisma.tierBenefitClaim.count({
      where: { userId: customer.id, period, benefitType: 'DAILY_REFILL', claimedAt: { gte: todayStart, lte: todayEnd } },
    });
    benefitAvailable = usedToday === 0;
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
    silverRemaining = Math.max(0, 7 - used);
    available = silverRemaining > 0;
    benefitType = 'SILVER_FOUNTAIN';
  } else if (['GOLD', 'DIAMOND', 'PLATINUM'].includes(tier)) {
    const usedToday = await prisma.tierBenefitClaim.count({
      where: { userId, period, benefitType: 'DAILY_REFILL', claimedAt: { gte: todayStart, lte: todayEnd } },
    });
    available = usedToday === 0;
    benefitType = 'DAILY_REFILL';
  }

  res.json({ success: true, data: { tier, available, benefitType, silverRemaining } });
}

export async function claimTierBenefit(req: AuthRequest, res: Response) {
  const { customerQrCode, storeId } = req.body as { customerQrCode: string; storeId: string };
  if (!customerQrCode || !storeId) {
    res.status(400).json({ success: false, error: 'customerQrCode and storeId required' });
    return;
  }
  if (await refuseIfStoreClosed(res, storeId)) return;

  const customer = await prisma.user.findUnique({ where: { qrCode: customerQrCode } });
  if (!customer) {
    res.status(404).json({ success: false, error: 'Customer not found' });
    return;
  }

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
      if (used >= 7) return 'Silver benefit limit reached (7 refills this period)';
    } else {
      const usedToday = await tx.tierBenefitClaim.count({
        where: { userId: customer.id, period, benefitType, claimedAt: { gte: storeDayStart(), lte: storeDayEnd() } },
      });
      if (usedToday > 0) return 'Daily refill already claimed today';
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
    details: { tier, benefitType, customerName: customer.name, customerPhone: customer.phone },
    storeId,
  });

  res.json({ success: true, message: `${tier} benefit claimed`, data: { benefitType } });
}

export async function processCatalogRedemption(req: AuthRequest, res: Response) {
  const { customerQrCode, catalogItemId, storeId } = req.body as { customerQrCode: string; catalogItemId: string; storeId: string };
  if (!customerQrCode || !catalogItemId || !storeId) {
    res.status(400).json({ success: false, error: 'customerQrCode, catalogItemId, storeId required' });
    return;
  }
  if (await refuseIfStoreClosed(res, storeId)) return;

  const [customer, item] = await Promise.all([
    prisma.user.findUnique({ where: { qrCode: customerQrCode } }),
    prisma.redemptionCatalogItem.findUnique({ where: { id: catalogItemId } }),
  ]);

  if (!customer) { res.status(404).json({ success: false, error: 'Customer not found' }); return; }
  if (!item || !item.isActive) { res.status(404).json({ success: false, error: 'Catalog item not found or inactive' }); return; }

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
    await tx.catalogRedemption.create({
      data: { customerId: customer.id, catalogItemId, pointsSpent: item.pointsCost, storeId, processedById: req.user!.id },
    });
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
    details: { item: item.title, pointsCost: item.pointsCost, customerName: customer.name },
    storeId,
  });

  res.json({ success: true, message: `${item.title} redeemed`, data: { remainingPts: Math.round(outcome.balance * 100) } });
}

// status=NEEDS_REVIEW is the admin's default view: flagged sales first, then sales still waiting for a receipt.
// It is the same set the sidebar badge counts (PENDING + FLAGGED).
const NEEDS_REVIEW = 'NEEDS_REVIEW';

// Turns the list / CSV query string into a database filter. The admin page only sends valid values; anything else
// (a typed URL, a script) gets a clear 400 instead of a database error and a 500.
function parseTransactionFilters(q: Record<string, unknown>):
  | { where: Prisma.PointsTransactionWhereInput; needsReview: boolean }
  | { error: string } {
  for (const key of ['storeId', 'status', 'category', 'from', 'to', 'search', 'customerId', 'grantedById', 'minAmount', 'maxAmount', 'includeTestData']) {
    if (q[key] !== undefined && typeof q[key] !== 'string') return { error: `"${key}" may be given only once` };
  }
  const { storeId, status, category, from, to, search, customerId, grantedById, minAmount, maxAmount, includeTestData } = q as Record<string, string | undefined>;
  const where: Prisma.PointsTransactionWhereInput = {};
  let needsReview = false;

  if (storeId) where.storeId = storeId;
  if (status) {
    if (status === NEEDS_REVIEW) {
      needsReview = true;
      where.status = { in: [TransactionStatus.FLAGGED, TransactionStatus.PENDING] };
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
  if (grantedById) where.grantedById = grantedById;

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
      store:     { select: { name: true } },
    },
  });
  const truncated = rows.length === TAKE;

  const header = 'Transaction ID,Date (Central),Time (Central),Store,Customer Name,Customer Phone,Employee Name,Employee Phone,Category,Purchase Amount,Points Awarded,Gallons,Status,Fraud Flags,Receipt Link,Test Data\n';
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
      csvText(t.grantedBy?.name),
      csvText(t.grantedBy?.phone),
      t.category,
      Number(t.purchaseAmount).toFixed(2),
      Number(t.pointsAwarded).toFixed(2),
      t.isGas && t.gasGallons != null ? Number(t.gasGallons).toFixed(3) : '',
      t.status,
      csvText(flags.join('; ')),
      csvText(t.receiptImageUrl),
      t.isTestData ? 'Yes' : '',
    ].join(',');
  }).join('\n');
  const notice = truncated ? `\n"Showing the first ${TAKE.toLocaleString()} rows for this filter. Narrow the dates or store to see the rest."\n` : '';

  const storePart = storeId ? (rows[0]?.store?.name ?? 'store').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'store' : 'all';
  const filename = `transactions-${storePart}-${storeDateKey()}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(header + lines + notice);
}
