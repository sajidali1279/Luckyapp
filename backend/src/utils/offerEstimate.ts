// What a promotion would cost before it is posted (HQ's form, and each manager request): the extra cashback it would have paid on the
// same kind of sales over the last 4 weeks, scaled to its length. Same stores, same category, and for a happy-hour promotion only the
// sales inside its hours. A per-tier bonus uses each customer's current tier (sales do not keep the tier they were made at); a
// cents-per-gallon bonus uses the gallons the sale recorded. It is an estimate of the most it adds: the 10% ceiling on a sale can only
// take some of it back.

import prisma from '../config/prisma';
import { ProductCategory } from '@prisma/client';
import { offerPaysAt, OfferHours } from './offerHours';
import { getTierBonusRate } from './tier';

export const ESTIMATE_BASIS_DAYS = 28;

export interface EstimateInput extends OfferHours {
  storeId?: string | null;               // one store; none = every open store
  category?: ProductCategory | null;     // none = every category
  bonusRate?: number | null;
  tierBonusRates?: Record<string, number> | null;
  gasBonusCentsPerGallon?: number | null;
  startDate: Date;
  endDate: Date;
}

export interface Estimate {
  basisDays: number;
  basisSales: number;
  basisAmount: number;
  basisExtra: number;
  days: number;
  estimatedExtra: number;
  perDay: number;
}

const money = (n: number) => Math.round(n * 100) / 100;

export async function estimateOffer(input: EstimateInput, now: Date = new Date()): Promise<Estimate> {
  const since = new Date(now.getTime() - ESTIMATE_BASIS_DAYS * 86_400_000);
  const sales = await prisma.pointsTransaction.findMany({
    where: {
      status: 'APPROVED',
      isTestData: false,
      createdAt: { gte: since, lt: now },
      ...(input.storeId ? { storeId: input.storeId } : { store: { isActive: true } }),
      ...(input.category ? { category: input.category } : {}),
    },
    select: { purchaseAmount: true, gasGallons: true, createdAt: true, customer: { select: { tier: true } } },
  });
  let extra = 0, amount = 0, count = 0;
  for (const s of sales) {
    if (!offerPaysAt(input, s.createdAt)) continue;   // outside the happy hour, it would not have paid
    count += 1;
    amount += s.purchaseAmount;
    if (input.gasBonusCentsPerGallon != null) {
      extra += (s.gasGallons ?? 0) * input.gasBonusCentsPerGallon / 100;
    } else {
      // The till's own rule (utils/tier.ts): per tier, a tier left out gets no bonus, not the top tier's rate that bonusRate carries
      const perTier = input.tierBonusRates && Object.keys(input.tierBonusRates).length > 0 ? input.tierBonusRates : null;
      extra += s.purchaseAmount * getTierBonusRate({ bonusRate: input.bonusRate ?? null, tierBonusRates: perTier }, s.customer?.tier ?? '');
    }
  }
  const days = Math.max(1, Math.round((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000));
  const perDay = extra / ESTIMATE_BASIS_DAYS;
  return {
    basisDays: ESTIMATE_BASIS_DAYS,
    basisSales: count,
    basisAmount: money(amount),
    basisExtra: money(extra),
    days,
    estimatedExtra: money(perDay * days),
    perDay: money(perDay),
  };
}
