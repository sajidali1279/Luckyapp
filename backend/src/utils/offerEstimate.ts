// What a promotion would cost before it is posted (HQ's form, and each manager request): the extra cashback it would have paid on the
// same kind of sales over the last 4 weeks, scaled to its length. Same stores, same category, and for a happy-hour promotion only the
// sales inside its hours. A per-tier bonus uses each customer's current tier (sales do not keep the tier they were made at); a
// cents-per-gallon bonus uses the gallons the sale recorded. It is an estimate of the most it adds: the 10% ceiling on a sale can only
// take some of it back.

import { inAudience, DEFAULT_LAPSED_DAYS } from './offerAudience';
import { storeDateKey } from './storeTime';
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
  // who it is for and its limits (utils/offerAudience.ts, utils/offerBudget.ts)
  audience?: string | null;
  audienceTier?: string | null;
  audienceDays?: number | null;
  budgetCap?: number | null;
  dailyCapPerCustomer?: number | null;
}

export interface Estimate {
  basisDays: number;
  basisSales: number;
  basisAmount: number;
  basisExtra: number;
  days: number;
  estimatedExtra: number;
  perDay: number;
  cappedByBudget?: boolean;    // the estimate is more than the budget: it would stop at the budget
  approximate?: boolean;       // a win-back audience is worked out from the visits on record, so it is a rough figure
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
    select: { purchaseAmount: true, gasGallons: true, createdAt: true, customerId: true, customer: { select: { tier: true, createdAt: true, birthMonth: true } } },
  });
  // A win-back needs each customer's visits before each sale: the approved sales on record from N days before the basis
  const lapsedDays = input.audience === 'LAPSED' ? (input.audienceDays ?? DEFAULT_LAPSED_DAYS) : 0;
  const visits = new Map<string, number[]>();
  if (lapsedDays) {
    const rows = await prisma.pointsTransaction.findMany({
      where: { status: 'APPROVED', customerId: { in: [...new Set(sales.map((s) => s.customerId))] }, createdAt: { gte: new Date(since.getTime() - lapsedDays * 86_400_000), lt: now } },
      select: { customerId: true, createdAt: true },
    });
    for (const r of rows) visits.set(r.customerId, [...(visits.get(r.customerId) ?? []), r.createdAt.getTime()]);
  }
  const inIt = (s: (typeof sales)[number]) => {
    if (!input.audience || input.audience === 'EVERYONE') return true;
    const before = (visits.get(s.customerId) ?? []).filter((v) => v < s.createdAt.getTime()).sort((a, b) => b - a)[0];
    return inAudience(input, { id: s.customerId, tier: s.customer?.tier ?? 'BRONZE', createdAt: s.customer?.createdAt ?? s.createdAt, birthMonth: s.customer?.birthMonth ?? null,
      lastPurchaseAt: before != null ? new Date(before) : null }, s.createdAt);
  };
  const perCustomerDay = new Map<string, number>();   // within the daily limit per customer
  let extra = 0, amount = 0, count = 0;
  for (const s of sales) {
    if (!offerPaysAt(input, s.createdAt)) continue;   // outside the happy hour, it would not have paid
    if (!inIt(s)) continue;                           // not in the promotion's audience
    count += 1;
    amount += s.purchaseAmount;
    let add: number;
    if (input.gasBonusCentsPerGallon != null) {
      add = (s.gasGallons ?? 0) * input.gasBonusCentsPerGallon / 100;
    } else {
      // The till's own rule (utils/tier.ts): per tier, a tier left out gets no bonus, not the top tier's rate that bonusRate carries
      const perTier = input.tierBonusRates && Object.keys(input.tierBonusRates).length > 0 ? input.tierBonusRates : null;
      add = s.purchaseAmount * getTierBonusRate({ bonusRate: input.bonusRate ?? null, tierBonusRates: perTier }, s.customer?.tier ?? '');
    }
    if (input.dailyCapPerCustomer != null) {
      const k = `${s.customerId}|${storeDateKey(s.createdAt)}`;
      const had = perCustomerDay.get(k) ?? 0;
      add = Math.max(0, Math.min(add, input.dailyCapPerCustomer - had));
      perCustomerDay.set(k, had + add);
    }
    extra += add;
  }
  const days = Math.max(1, Math.round((input.endDate.getTime() - input.startDate.getTime()) / 86_400_000));
  const perDay = extra / ESTIMATE_BASIS_DAYS;
  const est = perDay * days;
  const capped = input.budgetCap != null && est > input.budgetCap;
  return {
    basisDays: ESTIMATE_BASIS_DAYS,
    basisSales: count,
    basisAmount: money(amount),
    basisExtra: money(extra),
    days,
    estimatedExtra: money(capped ? input.budgetCap! : est),
    perDay: money(perDay),
    ...(capped ? { cappedByBudget: true } : {}),
    ...(lapsedDays ? { approximate: true } : {}),
  };
}
