/**
 * Generate compound billing records for all stores, all periods since creation.
 * Replaces existing records, preserves isPaid/paidAt.
 *
 * Run from backend/:
 *   npx ts-node prisma/generate-bills.ts
 */
import 'dotenv/config';
import { PrismaClient, BillingType } from '@prisma/client';

// Swap to direct URL if needed (Accelerate isn't needed for scripts)
if (process.env.DATABASE_URL?.startsWith('prisma://') && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

function toPeriod(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function periodBounds(period: string) {
  const [y, m] = period.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0, 23, 59, 59, 999) };
}

function allPeriodsSince(storeCreated: Date, upTo: string): string[] {
  const periods: string[] = [];
  const cur = new Date(storeCreated.getFullYear(), storeCreated.getMonth(), 1);
  const [uy, um] = upTo.split('-').map(Number);
  const endMonth = new Date(uy, um - 1, 1);
  while (cur <= endMonth) { periods.push(toPeriod(cur)); cur.setMonth(cur.getMonth() + 1); }
  return periods;
}

async function buildBill(store: { id: string; billingType: string; subscriptionPrice: number; transactionFeeRate: number }, period: string) {
  const { start, end } = periodBounds(period);

  const txRows = await prisma.pointsTransaction.groupBy({
    by: ['category'],
    where: { storeId: store.id, status: 'APPROVED', createdAt: { gte: start, lte: end } },
    _count: { id: true },
    _sum: { purchaseAmount: true, storeCost: true, devCut: true, pointsAwarded: true },
  });

  const txCount          = txRows.reduce((s, r) => s + (r._count.id         ?? 0), 0);
  const purchaseVolume   = parseFloat(txRows.reduce((s, r) => s + (r._sum?.purchaseAmount ?? 0), 0).toFixed(2));
  const cashbackIssued   = parseFloat(txRows.reduce((s, r) => s + (r._sum?.storeCost      ?? 0), 0).toFixed(2));
  const devCutEarned     = parseFloat(txRows.reduce((s, r) => s + (r._sum?.devCut         ?? 0), 0).toFixed(2));
  const customerCashback = parseFloat(txRows.reduce((s, r) => s + (r._sum?.pointsAwarded  ?? 0), 0).toFixed(2));

  const categories = txRows.map((r) => ({
    category: String(r.category), txCount: r._count.id ?? 0,
    purchaseVolume:  parseFloat((r._sum?.purchaseAmount ?? 0).toFixed(2)),
    cashbackIssued:  parseFloat((r._sum?.storeCost      ?? 0).toFixed(2)),
    devCutEarned:    parseFloat((r._sum?.devCut         ?? 0).toFixed(2)),
    customerCashback:parseFloat((r._sum?.pointsAwarded  ?? 0).toFixed(2)),
  })).sort((a, b) => b.purchaseVolume - a.purchaseVolume);

  const needsSub        = store.billingType === 'MONTHLY_SUBSCRIPTION' || store.billingType === 'HYBRID';
  const subscriptionFee = needsSub ? store.subscriptionPrice : 0;
  const cashbackFee     = cashbackIssued;
  // Total owed to developer = subscription (if any) + dev cut from cashback pool
  const totalAmountOwed = parseFloat((subscriptionFee + devCutEarned).toFixed(2));

  if (subscriptionFee === 0 && txCount === 0) return null;

  const { start: s, end: e } = periodBounds(period);
  const notes = {
    txCount, purchaseVolume, cashbackIssued, devCutEarned, customerCashback,
    effectiveCashbackRate: purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0,
    effectiveDevCutRate:   cashbackIssued > 0 ? parseFloat((devCutEarned / cashbackIssued).toFixed(4)) : 0,
    categories,
    subscriptionFee, transactionFeeRate: store.transactionFeeRate,
    transactionFee: 0, cashbackFee, totalAmountOwed,
    periodStart: s.toISOString().slice(0, 10),
    periodEnd:   e.toISOString().slice(0, 10),
  };

  return { amount: totalAmountOwed, notes };
}

async function main() {
  const currentPeriod = toPeriod(new Date());

  const stores = await prisma.store.findMany({
    where: { isActive: true },
    select: { id: true, name: true, billingType: true, subscriptionPrice: true, transactionFeeRate: true, createdAt: true },
  });

  const existingBills = await prisma.billingRecord.findMany({
    select: { id: true, storeId: true, period: true, isPaid: true, paidAt: true },
  });
  const existingMap = new Map(
    existingBills.map((r) => [`${r.storeId}:${r.period}`, { id: r.id, isPaid: r.isPaid, paidAt: r.paidAt }]),
  );

  let created = 0; let replaced = 0; let skipped = 0;

  for (const store of stores) {
    const periods = allPeriodsSince(store.createdAt, currentPeriod);
    for (const period of periods) {
      const bill = await buildBill(store, period);
      const existing = existingMap.get(`${store.id}:${period}`);

      if (existing) {
        if (!bill) { skipped++; continue; }
        await prisma.billingRecord.delete({ where: { id: existing.id } });
        await (prisma.billingRecord as any).create({
          data: {
            storeId: store.id, billingType: store.billingType as BillingType,
            amount: bill.amount, period, notes: JSON.stringify(bill.notes),
            isPaid: existing.isPaid, paidAt: existing.paidAt,
          },
        });
        replaced++;
      } else {
        if (!bill) { skipped++; continue; }
        await (prisma.billingRecord as any).create({
          data: { storeId: store.id, billingType: store.billingType as BillingType, amount: bill.amount, period, notes: JSON.stringify(bill.notes) },
        });
        created++;
      }
    }
    process.stdout.write(`  ✓ ${store.name.padEnd(20)} ${periods.length} periods\n`);
  }

  console.log(`\n✅  Done — ${created} created, ${replaced} replaced, ${skipped} skipped (no activity)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
