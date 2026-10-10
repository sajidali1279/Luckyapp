// Did a promotion bring extra sales? The sales it touched (its category at its stores) over the time it ran and the same length
// just before, set against sales it did not touch over the same two stretches: a one-store promotion against the other open
// stores (same category), an all-store category promotion against the other categories. What the control did is what was
// expected here without the promotion; the difference is the extra sales, and those over the extra cashback paid is the return.
// A store-wide promotion at every store has nothing it did not touch, so it is set against the time before only. Fewer than
// LIFT_MIN_SALES before (here or in the control) and it cannot tell yet. Used by promotion Results and by Analytics.
import prisma from '../config/prisma';
import { Prisma } from '@prisma/client';

export const LIFT_MIN_SALES = 20;
const money = (n: number) => Math.round(n * 100) / 100;

export interface LiftOffer { storeId: string | null; category: string | null }
export interface Lift {
  control: 'OTHER_STORES' | 'OTHER_CATEGORIES' | 'NONE';
  controlText: string | null;
  hereChangePct: number | null;
  controlChangePct: number | null;
  expected: number;
  extraSales: number;
  perDollar: number | null;
  tooFewToTell: boolean;
}
export interface LiftResult {
  during: { sales: number; amount: number };
  before: { sales: number; amount: number };
  lift: Lift;
}

export async function offerLift(offer: LiftOffer, start: Date, end: Date, extraCashbackPaid: number): Promise<LiftResult> {
  const lengthMs = Math.max(0, end.getTime() - start.getTime());
  const sale = { status: 'APPROVED' as const, isTestData: false, challengeId: null, referralId: null };   // a challenge's reward is not a sale
  const categoryWhere: Prisma.PointsTransactionWhereInput = {
    ...sale,
    ...(offer.storeId ? { storeId: offer.storeId } : {}),
    ...(offer.category ? { category: offer.category as any } : {}),
  };
  const duringAt = { gte: start, lt: end };
  const beforeAt = { gte: new Date(start.getTime() - lengthMs), lt: start };
  const [during, before] = await Promise.all([
    prisma.pointsTransaction.aggregate({ where: { ...categoryWhere, createdAt: duringAt }, _count: true, _sum: { purchaseAmount: true } }),
    prisma.pointsTransaction.aggregate({ where: { ...categoryWhere, createdAt: beforeAt }, _count: true, _sum: { purchaseAmount: true } }),
  ]);

  let control: { kind: 'OTHER_STORES' | 'OTHER_CATEGORIES'; text: string; where: Prisma.PointsTransactionWhereInput } | null = null;
  if (offer.storeId) {
    const others = await prisma.store.count({ where: { isActive: true, id: { not: offer.storeId } } });
    if (others > 0) control = { kind: 'OTHER_STORES', text: `the other ${others} store${others === 1 ? '' : 's'}${offer.category ? ', same category' : ''}`,
      where: { ...sale, storeId: { not: offer.storeId }, store: { isActive: true }, ...(offer.category ? { category: offer.category as any } : {}) } };
  } else if (offer.category) {
    control = { kind: 'OTHER_CATEGORIES', text: 'the other categories at the same stores', where: { ...sale, store: { isActive: true }, category: { not: offer.category as any } } };
  }
  const [cDuring, cBefore] = control ? await Promise.all([
    prisma.pointsTransaction.aggregate({ where: { ...control.where, createdAt: duringAt }, _count: true, _sum: { purchaseAmount: true } }),
    prisma.pointsTransaction.aggregate({ where: { ...control.where, createdAt: beforeAt }, _count: true, _sum: { purchaseAmount: true } }),
  ]) : [null, null];

  const hereBefore = before._sum.purchaseAmount ?? 0, hereDuring = during._sum.purchaseAmount ?? 0;
  const cB = cBefore?._sum.purchaseAmount ?? 0, cD = cDuring?._sum.purchaseAmount ?? 0;
  const controlRatio = control && cB > 0 ? cD / cB : null;
  const expected = hereBefore * (controlRatio ?? 1);
  const extraSales = hereDuring - expected;
  const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : null);
  return {
    during: { sales: during._count, amount: money(hereDuring) },
    before: { sales: before._count, amount: money(hereBefore) },
    lift: {
      control: control?.kind ?? 'NONE',
      controlText: control?.text ?? null,
      hereChangePct: pct(hereDuring, hereBefore),
      controlChangePct: control ? pct(cD, cB) : null,
      expected: money(expected),
      extraSales: money(extraSales),
      perDollar: extraCashbackPaid > 0 ? money(Math.max(0, extraSales) / extraCashbackPaid) : null,   // fewer sales than expected is $0 per $1, not less
      tooFewToTell: before._count < LIFT_MIN_SALES || (control != null && (cBefore?._count ?? 0) < LIFT_MIN_SALES),
    },
  };
}
