/**
 * Add random sales to existing stores/users — no stores, users, or billing records created.
 * Shows per-store monthly billing preview at the end.
 *
 * Run from backend/:
 *   npx ts-node prisma/add-sales.ts
 */
import 'dotenv/config';
import { ProductCategory, TransactionStatus } from '@prisma/client';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(Math.floor(rand(7, 21)), Math.floor(rand(0, 59)), Math.floor(rand(0, 59)));
  return d;
}

async function main() {
  // ── Load existing data (no creation) ──────────────────────────────────────
  const [stores, employees, customers, config] = await Promise.all([
    prisma.store.findMany({ where: { isActive: true } }),
    prisma.user.findMany({ where: { role: { in: ['EMPLOYEE', 'STORE_MANAGER', 'DEV_ADMIN'] } } }),
    prisma.user.findMany({ where: { role: 'CUSTOMER' } }),
    prisma.appConfig.findUnique({ where: { key: 'DEV_CUT_RATE' } }),
  ]);

  if (!stores.length)    { console.error('❌  No stores found. Run npm run db:seed first.'); process.exit(1); }
  if (!employees.length) { console.error('❌  No employees found. Run npm run db:seed first.'); process.exit(1); }
  if (!customers.length) { console.error('❌  No customers found. Run npm run db:seed first.'); process.exit(1); }

  const devCutRate   = parseFloat(config?.value ?? '0.04');
  const CASHBACK_RATE = 0.05;

  console.log(`\n🏪  ${stores.length} stores  |  👥  ${employees.length} employees  |  🙋  ${customers.length} customers`);
  console.log(`💰  Dev cut rate: ${(devCutRate * 100).toFixed(0)}% of cashback\n`);

  // ── Generate transactions (90 days of history) ───────────────────────────
  let totalPurchase = 0;
  let totalDevCut   = 0;
  let txCount       = 0;

  const txRows: {
    customerId: string; grantedById: string; storeId: string;
    purchaseAmount: number; pointsAwarded: number; devCut: number;
    storeCost: number; cashbackRate: number; category: ProductCategory;
    status: TransactionStatus; receiptImageUrl: string;
    createdAt: Date; updatedAt: Date;
  }[] = [];

  const balanceMap: Record<string, number> = {};

  for (let day = 90; day >= 0; day--) {
    // 8–16 transactions per day; slightly more on weekends
    const txDate = daysAgo(day);
    const isWeekend = txDate.getDay() === 0 || txDate.getDay() === 6;
    const count = Math.floor(rand(isWeekend ? 12 : 8, isWeekend ? 20 : 16));

    for (let i = 0; i < count; i++) {
      const customer = pick(customers);
      const employee = pick(employees);
      const store    = pick(stores);
      const category = pick(WEIGHTED_CATEGORIES);
      const [min, max] = AMOUNT_RANGES[category];
      const purchaseAmount  = parseFloat(rand(min, max).toFixed(2));
      const cashbackIssued  = parseFloat((purchaseAmount * CASHBACK_RATE).toFixed(4));
      const devCut          = parseFloat((cashbackIssued * devCutRate).toFixed(4));
      const pointsAwarded   = parseFloat((cashbackIssued - devCut).toFixed(2));
      const createdAt       = new Date(txDate);
      createdAt.setMinutes(Math.floor(rand(0, 59)));

      totalPurchase += purchaseAmount;
      totalDevCut   += devCut;
      txCount++;
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

  // Batch-insert transactions
  await prisma.pointsTransaction.createMany({ data: txRows });
  console.log(`🧾  Created ${txCount} transactions\n`);

  // Update customer balances
  for (const [id, balance] of Object.entries(balanceMap)) {
    await prisma.user.update({
      where: { id },
      data: { pointsBalance: { increment: parseFloat(balance.toFixed(2)) } },
    });
  }

  // ── Per-store billing preview (current month) ──────────────────────────────
  const now        = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const period     = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const storeStats = await prisma.pointsTransaction.groupBy({
    by: ['storeId'],
    where: { status: 'APPROVED', createdAt: { gte: monthStart } },
    _sum: { purchaseAmount: true, devCut: true },
    _count: true,
  });

  const storeMap = Object.fromEntries(stores.map((s) => [s.id, s]));

  console.log(`═══ Monthly Billing Preview — ${period} ═══`);
  let monthlyBillingTotal = 0;

  const sorted = storeStats.sort((a, b) => (b._sum.purchaseAmount ?? 0) - (a._sum.purchaseAmount ?? 0));
  for (const stat of sorted) {
    const store   = storeMap[stat.storeId];
    if (!store) continue;
    const volume  = stat._sum.purchaseAmount ?? 0;
    const fee     = parseFloat((volume * store.transactionFeeRate).toFixed(2));
    monthlyBillingTotal += fee;
    console.log(
      `  ${store.name.padEnd(18)} ${stat._count} txns · ` +
      `$${volume.toFixed(0).padStart(6)} volume × ${(store.transactionFeeRate * 100).toFixed(1)}% = ` +
      `$${fee.toFixed(2)} owed`
    );
  }

  const cashbackDevCutMonth = storeStats.reduce((s, r) => s + (r._sum.devCut ?? 0), 0);

  console.log('');
  console.log(`  Stores with this-month data : ${sorted.length} of ${stores.length}`);
  console.log(`  Billing fees owed this month: $${monthlyBillingTotal.toFixed(2)}`);
  console.log(`  Dev cut from cashback (month): $${cashbackDevCutMonth.toFixed(2)}`);
  console.log('');
  console.log('═══ All-Time Summary ═══');
  console.log(`  Total transactions  : ${txCount}`);
  console.log(`  Total purchase vol  : $${totalPurchase.toFixed(2)}`);
  console.log(`  Total cashback cut  : $${totalDevCut.toFixed(2)}  (${(devCutRate * 100).toFixed(0)}% of 5% cashback)`);
  console.log('');
  console.log('✅  Done! Go to Admin → Billing → Monthly Bills → Generate Bills');
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
