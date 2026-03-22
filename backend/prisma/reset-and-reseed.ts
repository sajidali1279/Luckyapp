/**
 * 1. Deletes all PointsTransactions and BillingRecords
 * 2. Resets all customer pointsBalance to 0
 * 3. Re-seeds 90 days of random transactions
 * 4. Regenerates billing records for all stores/periods
 *
 * Run from backend/:
 *   npx ts-node prisma/reset-and-reseed.ts
 */
import 'dotenv/config';
import { ProductCategory, TransactionStatus, BillingType } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

if (process.env.DATABASE_URL?.startsWith('prisma://') && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const prisma = new PrismaClient();

// ── Weighted category distribution ───────────────────────────────────────────
const WEIGHTED_CATEGORIES: ProductCategory[] = [
  ...Array(12).fill('GAS' as ProductCategory),
  ...Array(8).fill('GROCERIES' as ProductCategory),
  ...Array(6).fill('DIESEL' as ProductCategory),
  ...Array(5).fill('HOT_FOODS' as ProductCategory),
  ...Array(4).fill('TOBACCO_VAPES' as ProductCategory),
  ...Array(3).fill('FRESH_FOODS' as ProductCategory),
  ...Array(3).fill('FROZEN_FOODS' as ProductCategory),
  ...Array(2).fill('OTHER' as ProductCategory),
];

const AMOUNT_RANGES: Record<ProductCategory, [number, number]> = {
  GAS:          [25, 110],
  DIESEL:       [60, 200],
  GROCERIES:    [8,   65],
  HOT_FOODS:    [4,   18],
  FROZEN_FOODS: [3,   22],
  FRESH_FOODS:  [5,   30],
  TOBACCO_VAPES:[10,  45],
  OTHER:        [2,   40],
};

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

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

async function buildBill(
  store: { id: string; billingType: string; subscriptionPrice: number; transactionFeeRate: number },
  period: string,
  devCutRate: number,
) {
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
    purchaseVolume:   parseFloat((r._sum?.purchaseAmount ?? 0).toFixed(2)),
    cashbackIssued:   parseFloat((r._sum?.storeCost      ?? 0).toFixed(2)),
    devCutEarned:     parseFloat((r._sum?.devCut         ?? 0).toFixed(2)),
    customerCashback: parseFloat((r._sum?.pointsAwarded  ?? 0).toFixed(2)),
  })).sort((a, b) => b.purchaseVolume - a.purchaseVolume);

  const needsSub        = store.billingType === 'MONTHLY_SUBSCRIPTION' || store.billingType === 'HYBRID';
  const subscriptionFee = needsSub ? store.subscriptionPrice : 0;
  const totalAmountOwed = parseFloat((subscriptionFee + devCutEarned).toFixed(2));

  if (subscriptionFee === 0 && txCount === 0) return null;

  const { start: s, end: e } = periodBounds(period);
  const notes = {
    txCount, purchaseVolume, cashbackIssued, devCutEarned, customerCashback,
    effectiveCashbackRate: purchaseVolume > 0 ? parseFloat((cashbackIssued / purchaseVolume).toFixed(4)) : 0,
    effectiveDevCutRate:   cashbackIssued > 0 ? parseFloat((devCutEarned / cashbackIssued).toFixed(4)) : 0,
    categories,
    subscriptionFee, transactionFeeRate: store.transactionFeeRate,
    transactionFee: 0, cashbackFee: cashbackIssued, totalAmountOwed,
    periodStart: s.toISOString().slice(0, 10),
    periodEnd:   e.toISOString().slice(0, 10),
  };

  return { amount: totalAmountOwed, notes };
}

async function main() {
  // ── STEP 1: Wipe old data ─────────────────────────────────────────────────
  console.log('\n🗑️   Deleting old transactions and billing records...');
  const [deletedTx, deletedBills] = await Promise.all([
    prisma.pointsTransaction.deleteMany({}),
    prisma.billingRecord.deleteMany({}),
  ]);
  console.log(`    Deleted ${deletedTx.count} transactions, ${deletedBills.count} billing records`);

  // Reset all customer balances to 0
  const resetResult = await prisma.user.updateMany({
    where: { role: 'CUSTOMER' },
    data: { pointsBalance: 0 },
  });
  console.log(`    Reset ${resetResult.count} customer balances to $0.00\n`);

  // ── STEP 2: Load stores, employees, customers ─────────────────────────────
  const [stores, employees, customers, config] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true } }),
    prisma.user.findMany({ where: { role: { in: ['EMPLOYEE', 'STORE_MANAGER', 'DEV_ADMIN'] } } }),
    prisma.user.findMany({ where: { role: 'CUSTOMER' } }),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  if (!stores.length)    { console.error('❌  No stores found.'); process.exit(1); }
  if (!employees.length) { console.error('❌  No employees found.'); process.exit(1); }
  if (!customers.length) { console.error('❌  No customers found.'); process.exit(1); }

  const devCutRate    = parseFloat(config?.value ?? '0.04');
  const CASHBACK_RATE = 0.05;

  console.log(`🏪  ${stores.length} stores  |  👥  ${employees.length} employees  |  🙋  ${customers.length} customers`);
  console.log(`💰  Dev cut rate: ${(devCutRate * 100).toFixed(0)}% of cashback\n`);

  // ── STEP 3: Generate 90 days of transactions ──────────────────────────────
  console.log('🧾  Generating 90 days of transactions...');

  const txRows: {
    customerId: string; grantedById: string; storeId: string;
    purchaseAmount: number; pointsAwarded: number; devCut: number;
    storeCost: number; cashbackRate: number; category: ProductCategory;
    status: TransactionStatus; receiptImageUrl: string;
    createdAt: Date; updatedAt: Date;
  }[] = [];

  const balanceMap: Record<string, number> = {};

  for (let day = 90; day >= 0; day--) {
    const txDate = new Date();
    txDate.setDate(txDate.getDate() - day);
    txDate.setHours(Math.floor(rand(7, 21)), Math.floor(rand(0, 59)), Math.floor(rand(0, 59)));

    const isWeekend = txDate.getDay() === 0 || txDate.getDay() === 6;
    const count = Math.floor(rand(isWeekend ? 12 : 8, isWeekend ? 20 : 16));

    for (let i = 0; i < count; i++) {
      const customer       = pick(customers);
      const employee       = pick(employees);
      const store          = pick(stores);
      const category       = pick(WEIGHTED_CATEGORIES);
      const [min, max]     = AMOUNT_RANGES[category];
      const purchaseAmount = parseFloat(rand(min, max).toFixed(2));
      const cashbackIssued = parseFloat((purchaseAmount * CASHBACK_RATE).toFixed(4));
      const devCut         = parseFloat((cashbackIssued * devCutRate).toFixed(4));
      const pointsAwarded  = parseFloat((cashbackIssued - devCut).toFixed(2));
      const createdAt      = new Date(txDate);
      createdAt.setMinutes(Math.floor(rand(0, 59)));

      balanceMap[customer.id] = (balanceMap[customer.id] ?? 0) + pointsAwarded;

      txRows.push({
        customerId: customer.id, grantedById: employee.id, storeId: store.id,
        purchaseAmount, pointsAwarded, devCut,
        storeCost: cashbackIssued, cashbackRate: CASHBACK_RATE,
        category, status: 'APPROVED',
        receiptImageUrl: 'https://placehold.co/400x600/png?text=Receipt',
        createdAt, updatedAt: createdAt,
      });
    }
  }

  await prisma.pointsTransaction.createMany({ data: txRows });
  console.log(`    Created ${txRows.length} transactions\n`);

  // Update customer balances
  for (const [id, balance] of Object.entries(balanceMap)) {
    await prisma.user.update({
      where: { id },
      data: { pointsBalance: parseFloat(balance.toFixed(2)) },
    });
  }
  console.log(`    Updated ${Object.keys(balanceMap).length} customer balances\n`);

  // ── STEP 4: Generate billing records ─────────────────────────────────────
  console.log('📊  Generating billing records...');
  const currentPeriod = toPeriod(new Date());

  let created = 0; let skipped = 0;

  for (const store of stores) {
    const periods = allPeriodsSince(store.createdAt, currentPeriod);
    for (const period of periods) {
      const bill = await buildBill(store, period, devCutRate);
      if (!bill) { skipped++; continue; }
      await (prisma.billingRecord as any).create({
        data: {
          storeId: store.id, billingType: store.billingType as BillingType,
          amount: bill.amount, period, notes: JSON.stringify(bill.notes),
        },
      });
      created++;
    }
    process.stdout.write(`  ✓ ${store.name.padEnd(22)} ${periods.length} period(s)\n`);
  }

  console.log(`\n✅  Done — ${txRows.length} transactions · ${created} billing records created · ${skipped} skipped (no activity)`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
