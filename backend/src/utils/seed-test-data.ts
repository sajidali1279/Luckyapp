/**
 * Test data seed — populates billing, transactions, redemptions, and category rates
 * Safe to run multiple times (uses upsert / checks before creating).
 * Run: cd backend && npx ts-node src/utils/seed-test-data.ts
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { Role, BillingType, ProductCategory, TransactionStatus } from '@prisma/client';

// ─── Category Rates ────────────────────────────────────────────────────────────
const CATEGORY_RATES: { category: ProductCategory; cashbackRate: number }[] = [
  { category: ProductCategory.GROCERIES,    cashbackRate: 0.05 },
  { category: ProductCategory.FROZEN_FOODS, cashbackRate: 0.05 },
  { category: ProductCategory.FRESH_FOODS,  cashbackRate: 0.05 },
  { category: ProductCategory.GAS,          cashbackRate: 0.03 }, // Gas = 3%
  { category: ProductCategory.DIESEL,       cashbackRate: 0.03 },
  { category: ProductCategory.TOBACCO_VAPES,cashbackRate: 0.04 },
  { category: ProductCategory.HOT_FOODS,    cashbackRate: 0.07 }, // Hot foods = 7%
  { category: ProductCategory.OTHER,        cashbackRate: 0.05 },
];

// ─── Test Customers ────────────────────────────────────────────────────────────
const TEST_CUSTOMERS = [
  { phone: '5550000001', name: 'Alice Johnson' },
  { phone: '5550000002', name: 'Bob Martinez' },
  { phone: '5550000003', name: 'Carol Williams' },
  { phone: '5550000004', name: 'David Kim' },
  { phone: '5550000005', name: 'Emma Davis' },
];

// ─── Test Employee (store #1 — used for all test transactions) ─────────────────
const TEST_EMPLOYEE = { phone: '5559990001', name: 'Test Cashier', pin: '1234' };

// ─── Helpers ───────────────────────────────────────────────────────────────────
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max + 1)); }
function randItem<T>(arr: T[]): T { return arr[randInt(0, arr.length - 1)]; }
function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }

// Weighted random category (gas and groceries are most common)
const WEIGHTED_CATEGORIES: ProductCategory[] = [
  ...Array(12).fill(ProductCategory.GAS),
  ...Array(10).fill(ProductCategory.GROCERIES),
  ...Array(5).fill(ProductCategory.HOT_FOODS),
  ...Array(4).fill(ProductCategory.TOBACCO_VAPES),
  ...Array(3).fill(ProductCategory.FRESH_FOODS),
  ...Array(3).fill(ProductCategory.FROZEN_FOODS),
  ...Array(3).fill(ProductCategory.DIESEL),
  ...Array(2).fill(ProductCategory.OTHER),
];

// Purchase amount ranges per category (realistic gas station amounts)
const AMOUNT_RANGES: Record<ProductCategory, [number, number]> = {
  GAS:          [25, 110],
  DIESEL:       [60, 200],
  GROCERIES:    [8, 65],
  HOT_FOODS:    [4, 18],
  FROZEN_FOODS: [3, 22],
  FRESH_FOODS:  [5, 30],
  TOBACCO_VAPES:[10, 45],
  OTHER:        [2, 40],
};

async function seed() {
  console.log('🧪 Seeding test data for Lucky Stop billing dashboard...\n');

  // ── 1. Category Rates ──────────────────────────────────────────────────────
  console.log('📊 Setting category cashback rates...');
  for (const { category, cashbackRate } of CATEGORY_RATES) {
    await prisma.categoryRate.upsert({
      where: { category },
      update: { cashbackRate },
      create: { category, cashbackRate },
    });
    console.log(`  ✅ ${category}: ${(cashbackRate * 100).toFixed(0)}%`);
  }

  // ── 2. Get all stores ──────────────────────────────────────────────────────
  const stores = await prisma.store.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  if (stores.length === 0) {
    console.error('\n❌ No stores found! Run the main seed first: npm run db:seed');
    process.exit(1);
  }
  console.log(`\n🏪 Found ${stores.length} stores`);

  // ── 3. Test customers ──────────────────────────────────────────────────────
  console.log('\n👤 Creating test customers...');
  const customers = [];
  const pinHash = await bcrypt.hash('1234', 12);

  for (const c of TEST_CUSTOMERS) {
    const existing = await prisma.user.findUnique({ where: { phone: c.phone } });
    if (existing) {
      console.log(`  ⚠️  ${c.name} (${c.phone}) already exists`);
      customers.push(existing);
    } else {
      const qrCode = `TEST-${uuidv4().slice(0, 8).toUpperCase()}`;
      const created = await prisma.user.create({
        data: {
          phone: c.phone, name: c.name, pinHash,
          role: Role.CUSTOMER, qrCode,
          isProfileComplete: true, pointsBalance: 0,
        },
      });
      console.log(`  ✅ ${c.name} — QR: ${qrCode}`);
      customers.push(created);
    }
  }

  // ── 4. Test employee ───────────────────────────────────────────────────────
  console.log('\n👷 Creating test employee...');
  const empPinHash = await bcrypt.hash(TEST_EMPLOYEE.pin, 12);
  let employee = await prisma.user.findUnique({ where: { phone: TEST_EMPLOYEE.phone } });
  if (!employee) {
    employee = await prisma.user.create({
      data: {
        phone: TEST_EMPLOYEE.phone, name: TEST_EMPLOYEE.name,
        pinHash: empPinHash, role: Role.EMPLOYEE, isProfileComplete: true,
      },
    });
    console.log(`  ✅ ${TEST_EMPLOYEE.name} created (PIN: ${TEST_EMPLOYEE.pin})`);
  } else {
    console.log(`  ⚠️  Test employee already exists`);
  }

  // Assign employee to first 3 stores
  for (const store of stores.slice(0, 3)) {
    await prisma.userStoreRole.upsert({
      where: { userId_storeId: { userId: employee.id, storeId: store.id } },
      update: {},
      create: { userId: employee.id, storeId: store.id, role: Role.EMPLOYEE },
    });
  }
  console.log(`  ✅ Assigned to stores: ${stores.slice(0, 3).map(s => s.name).join(', ')}`);

  // ── 5. Point Transactions (90 days of history) ─────────────────────────────
  console.log('\n🧾 Creating approved transactions (90 days)...');

  const rateMap = Object.fromEntries(CATEGORY_RATES.map(r => [r.category, r.cashbackRate]));
  const DEV_REDEMPTION_RATE = 0.05;

  let txCreated = 0;
  let txSkipped = 0;

  // Create 5–15 transactions per day for a realistic spread
  for (let day = 90; day >= 0; day--) {
    const txDate = daysAgo(day);
    // More transactions on weekends
    const txCount = txDate.getDay() === 0 || txDate.getDay() === 6
      ? randInt(10, 18)
      : randInt(5, 12);

    for (let i = 0; i < txCount; i++) {
      const category = randItem(WEIGHTED_CATEGORIES);
      const store = randItem(stores);
      const customer = randItem(customers);
      const [minAmt, maxAmt] = AMOUNT_RANGES[category];
      const purchaseAmount = parseFloat(rand(minAmt, maxAmt).toFixed(2));
      const cashbackRate = rateMap[category] ?? 0.05;
      const pointsAwarded = parseFloat((purchaseAmount * cashbackRate).toFixed(2));

      // Randomize the time within the day
      const createdAt = new Date(txDate);
      createdAt.setHours(randInt(6, 22), randInt(0, 59), randInt(0, 59));

      await prisma.pointsTransaction.create({
        data: {
          customerId: customer.id,
          grantedById: employee.id,
          storeId: store.id,
          purchaseAmount,
          pointsAwarded,
          devCut: 0,
          storeCost: pointsAwarded,
          cashbackRate,
          category,
          status: TransactionStatus.APPROVED,
          receiptImageUrl: `https://placehold.co/400x200?text=Receipt`,
          createdAt,
          updatedAt: createdAt,
        },
      });
      txCreated++;

      // Credit customer balance
      await prisma.user.update({
        where: { id: customer.id },
        data: { pointsBalance: { increment: pointsAwarded } },
      });
    }
  }
  console.log(`  ✅ Created ${txCreated} transactions (skipped ${txSkipped})`);

  // ── 6. Credit Redemptions ──────────────────────────────────────────────────
  console.log('\n🎁 Creating credit redemptions...');
  let redemptionCount = 0;

  // Reset customer balances to reasonable values first, then create redemptions
  for (let day = 85; day >= 5; day -= randInt(3, 8)) {
    const redeemDate = daysAgo(day);
    const customer = randItem(customers);
    const store = randItem(stores);

    // Check current balance
    const freshCustomer = await prisma.user.findUnique({ where: { id: customer.id } });
    const balance = Number(freshCustomer?.pointsBalance ?? 0);
    if (balance < 2) continue;

    const amount = parseFloat(Math.min(rand(2, 20), balance * 0.4).toFixed(2));
    const devCut = parseFloat((amount * DEV_REDEMPTION_RATE).toFixed(2));

    const createdAt = new Date(redeemDate);
    createdAt.setHours(randInt(8, 20), randInt(0, 59));

    await prisma.creditRedemption.create({
      data: {
        customerId: customer.id,
        storeId: store.id,
        amount,
        devCut,
        processedBy: employee.id,
        createdAt,
      },
    });

    await prisma.user.update({
      where: { id: customer.id },
      data: { pointsBalance: { decrement: amount } },
    });

    redemptionCount++;
  }
  console.log(`  ✅ Created ${redemptionCount} credit redemptions`);

  // ── 7. Billing Records (subscription payments — 3 months) ─────────────────
  console.log('\n💳 Creating billing records (3 months of subscription payments)...');
  const months = ['2025-12', '2026-01', '2026-02'];
  let billingCreated = 0;

  for (const store of stores) {
    for (const period of months) {
      const existing = await prisma.billingRecord.findFirst({
        where: { storeId: store.id, period },
      });
      if (existing) continue;

      const [year, month] = period.split('-').map(Number);
      const paidAt = new Date(year, month - 1, randInt(1, 10)); // paid early in the month

      await prisma.billingRecord.create({
        data: {
          storeId: store.id,
          billingType: BillingType.MONTHLY_SUBSCRIPTION,
          amount: store.subscriptionPrice,
          period,
          isPaid: true,
          paidAt,
        },
      });
      billingCreated++;
    }
  }
  console.log(`  ✅ Created ${billingCreated} billing records (${months.join(', ')})`);

  // ── Summary ────────────────────────────────────────────────────────────────
  const [totalTx, totalRedemptions, totalBilling, totalCustomers] = await Promise.all([
    prisma.pointsTransaction.count({ where: { status: 'APPROVED' } }),
    prisma.creditRedemption.count(),
    prisma.billingRecord.count({ where: { isPaid: true } }),
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
  ]);

  const devCutTotal = await prisma.creditRedemption.aggregate({ _sum: { devCut: true } });
  const subTotal = await prisma.billingRecord.aggregate({ _sum: { amount: true }, where: { isPaid: true } });

  console.log(`
╔══════════════════════════════════════════╗
║        TEST DATA SEED COMPLETE           ║
╠══════════════════════════════════════════╣
║  Approved Transactions : ${String(totalTx).padEnd(14)}║
║  Credit Redemptions    : ${String(totalRedemptions).padEnd(14)}║
║  Paid Billing Records  : ${String(totalBilling).padEnd(14)}║
║  Total Customers       : ${String(totalCustomers).padEnd(14)}║
╠══════════════════════════════════════════╣
║  Dev Cut Earned        : $${String((devCutTotal._sum.devCut ?? 0).toFixed(2)).padEnd(13)}║
║  Subscription Revenue  : $${String((subTotal._sum.amount ?? 0).toFixed(2)).padEnd(13)}║
╚══════════════════════════════════════════╝

Test accounts:
  Customers: 5550000001–5550000005 / PIN: 1234
  Employee:  5559990001 / PIN: ${TEST_EMPLOYEE.pin}
`);
}

seed()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
