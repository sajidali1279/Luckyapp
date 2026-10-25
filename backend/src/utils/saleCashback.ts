// The cashback of one sale (moved out of initiateGrant on 2026-10-11, unchanged, so a scanned receipt is priced exactly like a cashier's
// grant): the customer's tier rate plus the category bonus, the one promotion that applies (its hours, audience, budget and daily limit),
// gas by the gallon, the 10% ceiling, the Gold+ gas bonus and the store's platform fee.
import prisma from '../config/prisma';
import { OfferType, ProductCategory, User } from '@prisma/client';
import { offerPaysAt } from './offerHours';
import { forCustomer } from './offerAudience';
import { promotionRoom } from './offerBudget';
import { CASHBACK_RATE_CAP, CASHBACK_RATE_WARN, DEFAULT_DEV_CUT_RATE, DEFAULT_TIER_RATES } from '../config/constants';
import { gasBonusPerGallon, effectiveTier } from './tier';
import { pickOffer, percentBonus, isCentsPerGallon } from './offerPick';

export async function computeSaleCashback({ customer, storeId, purchaseAmount, category, gasGallons, now }: {
  customer: User; storeId: string; purchaseAmount: number; category: ProductCategory; gasGallons: number | null; now: Date;
}) {
  // Look up tier base rate, active promo offer, and store dev-cut rate simultaneously
  const customerTier = effectiveTier(customer).tier; // the tier after any half-year step down that has not been written yet

  const [tierRate, categoryRate, allActiveOffers, store] = await Promise.all([
    prisma.tierCashbackRate.findUnique({ where: { tier: customerTier } }),
    prisma.categoryRate.findUnique({ where: { category: category as any } }),
    prisma.offer.findMany({
      // a promotion whose budget is used up pays no more (utils/offerBudget.ts)
      where: { isActive: true, startDate: { lte: now }, endDate: { gte: now }, budgetReachedAt: null },
      select: {
        id: true, createdAt: true, bonusRate: true, tierBonusRates: true, gasBonusCentsPerGallon: true, title: true, category: true, type: true, storeId: true,
        happyDays: true, happyFrom: true, happyTo: true, audience: true, audienceTier: true, audienceDays: true, budgetCap: true, dailyCapPerCustomer: true,
      },
    }),
    prisma.store.findUnique({ where: { id: storeId }, select: { name: true, isActive: true, transactionFeeRate: true, gasPricePerGallon: true, dieselPricePerGallon: true } }),
  ]);

  // Filter to relevant offers for this store (JS filter: avoids Prisma AND/OR nesting bugs)
  // A happy-hour promotion pays only inside its hours (store time)
  const allStoreOffers = allActiveOffers.filter((o) =>
    (o.bonusRate !== null || o.gasBonusCentsPerGallon !== null) &&
    (o.type === OfferType.ALL_STORES || o.storeId === storeId) &&
    offerPaysAt(o, now)
  );

  // Tier base rate + optional per-category bonus (additive)
  const tierBaseRate = tierRate?.cashbackRate ?? DEFAULT_TIER_RATES[customerTier] ?? 0.01;
  const categoryBonus = categoryRate?.cashbackRate ?? 0;

  // Gas ¢/gallon mode: category is authoritative; gallons come from mobile or are estimated from store price
  const isGasCategory = category === ProductCategory.GAS || category === ProductCategory.DIESEL;
  const gasPerGallonRate = tierRate?.gasCentsPerGallon ?? null;

  // If gallons weren't sent by mobile, estimate from the store's posted price
  let effectiveGallons = (gasGallons != null && gasGallons > 0) ? gasGallons : null;
  if (isGasCategory && effectiveGallons == null && store) {
    const storeGasPrice = category === ProductCategory.GAS ? store.gasPricePerGallon : store.dieselPricePerGallon;
    if (storeGasPrice && storeGasPrice > 0) effectiveGallons = purchaseAmount / storeGasPrice;
  }

  const usePerGallonMode = isGasCategory && effectiveGallons != null && gasPerGallonRate != null && gasPerGallonRate > 0;

  // Only the promotions this customer is in the audience of (a tier and up, a win-back, new customers, birthday month: utils/offerAudience.ts)
  const customerOffers = await forCustomer(allStoreOffers, customer.id, now, customerTier);
  // Only one promotion applies to a sale; utils/offerPick.ts says which (same answer whatever order the rows come back in)
  const activeOffer = pickOffer(customerOffers, { storeId, category, tier: customerTier, purchaseAmount, gallons: effectiveGallons }) as (typeof customerOffers)[number] | null;

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
    // % mode: for gas with ¢/gal offer and known gallons, apply the ¢/gal offer bonus additively
    const gasCpgBonus = isGasCategory && effectiveGallons != null && activeOffer?.gasBonusCentsPerGallon != null
      ? parseFloat((effectiveGallons * activeOffer.gasBonusCentsPerGallon / 100).toFixed(4))
      : 0;
    const pctRate = parseFloat((tierBaseRate + categoryBonus + (gasCpgBonus > 0 ? 0 : promoBonus)).toFixed(4));
    const pctCashback = parseFloat((purchaseAmount * pctRate).toFixed(4));
    promotionCashback     = gasCpgBonus > 0 ? gasCpgBonus : parseFloat((purchaseAmount * promoBonus).toFixed(4));
    cashbackIssued        = parseFloat((pctCashback + gasCpgBonus).toFixed(4));
    effectiveCashbackRate = purchaseAmount > 0 ? parseFloat((cashbackIssued / purchaseAmount).toFixed(4)) : 0;
  }

  // A promotion with a budget or a daily limit per customer pays only what is left of them (utils/offerBudget.ts); the rest of the
  // cashback (tier, category) is not touched
  if (activeOffer && promotionCashback > 0) {
    const room = await promotionRoom(activeOffer, customer.id, now);
    if (room < promotionCashback) {
      cashbackIssued        = parseFloat((cashbackIssued - (promotionCashback - room)).toFixed(4));
      promotionCashback     = room;
      effectiveCashbackRate = purchaseAmount > 0 ? parseFloat((cashbackIssued / purchaseAmount).toFixed(4)) : 0;
    }
  }

  // ── Compound rate cap: a hard ceiling to protect against misconfigured category/promo rates ──
  // The warn and cap lines are there to catch a tier or category rate set too high. When the excess comes from a
  // live promotion (its size is limited when it is posted), the ceiling still applies but the sale is not held:
  // otherwise every sale a +7% or +10% promotion touches would wait for a manager and bury the real alerts.
  const rateCappedFlags: string[] = [];
  const precapCashback = cashbackIssued;
  const standingRate = purchaseAmount > 0 ? (cashbackIssued - promotionCashback) / purchaseAmount : 0;
  const promoExplainsRate = promotionCashback > 0 && standingRate <= CASHBACK_RATE_WARN;
  if (effectiveCashbackRate > CASHBACK_RATE_CAP) {
    cashbackIssued        = parseFloat((purchaseAmount * CASHBACK_RATE_CAP).toFixed(4));
    effectiveCashbackRate = CASHBACK_RATE_CAP;
    if (!promoExplainsRate) rateCappedFlags.push('CASHBACK_RATE_CAPPED');
  } else if (effectiveCashbackRate > CASHBACK_RATE_WARN) {
    if (!promoExplainsRate) rateCappedFlags.push('HIGH_CASHBACK_RATE');
  }

  // What the promotion really added to this sale: the ceiling takes back from the promotion first, so its share is what is left
  // above the tier and category cashback (0 when the ceiling took all of it). Recorded on the sale for the promotion's results.
  const offerCashback = promotionApplied
    ? parseFloat(Math.max(0, Math.min(promotionCashback, cashbackIssued - (precapCashback - promotionCashback))).toFixed(4))
    : null;

  // Gas tier bonus (Gold+ extra per-gallon bonus, stacks on top regardless of mode). Computed BEFORE the
  // platform fee, not after: this money is credited to the customer exactly like the rest of their cashback,
  // so the store's fee has to be taken on the full total, not just the base rate. Before this fix, devCut was
  // computed on cashbackIssued alone, so a Gold+ customer's gas bonus was credited to them at the store's full
  // cost with no platform fee collected on that portion at all (docs/confidential/admin-audit/04-transactions.md
  // finding #10; no live exposure yet, since no real customer had reached Gold when this was found).
  const gasBonusRate = (isGasCategory && effectiveGallons) ? gasBonusPerGallon(customerTier) : 0;
  const gasBonusPoints = parseFloat(((effectiveGallons ?? 0) * gasBonusRate).toFixed(2));

  const devCutRate = store?.transactionFeeRate ?? DEFAULT_DEV_CUT_RATE;
  const devCut = parseFloat(((cashbackIssued + gasBonusPoints) * devCutRate).toFixed(4));
  const pointsAwarded = cashbackIssued;
  const storeCost = devCut;


  return {
    store, customerTier, tierBaseRate, promoBonus, effectiveCashbackRate, pointsAwarded, devCut, storeCost, isGasCategory,
    effectiveGallons, gasBonusPoints, offerCashback, promotionApplied, activeOffer, rateCappedFlags, usePerGallonMode, gasPerGallonRate,
    allActiveOffersCount: allActiveOffers.length, allStoreOffersCount: allStoreOffers.length,
  };
}
