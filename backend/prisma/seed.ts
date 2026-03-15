/**
 * Seed script — clears all transaction/billing data and generates
 * fresh random sales so the dev cut can be verified in the admin portal.
 *
 * Run from backend/:
 *   npx ts-node prisma/seed.ts
 */

import { PrismaClient, ProductCategory, TransactionStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── helpers ─────────────────────────────────────────────────────────────────
const rand = (min: number, max: number) =>
  Math.round((Math.random() * (max - min) + min) * 100) / 100;

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

const CATEGORIES: ProductCategory[] = [
  'GAS', 'DIESEL', 'HOT_FOODS', 'GROCERIES',
  'FROZEN_FOODS', 'FRESH_FOODS', 'TOBACCO_VAPES', 'OTHER',
];

// Spread 60 transactions across the last 45 days
function randomDate(daysBack = 45): Date {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor(Math.random() * daysBack));
  d.setHours(Math.floor(Math.random() * 14) + 7); // 7am–9pm
  return d;
}

async function main() {
  console.log('\n🗑️  Clearing transaction & billing data…');

  await prisma.creditRedemption.deleteMany();
  await prisma.redemption.deleteMany();
  await prisma.billingRecord.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.creditRedemption.deleteMany();

  // Delete all stores (and cascading relations) then recreate fresh
  await prisma.userStoreRole.deleteMany();
  await prisma.store.deleteMany();

  // Reset all customer balances to 0
  await prisma.user.updateMany({ where: { role: 'CUSTOMER' }, data: { pointsBalance: 0 } });

  console.log('✅  Cleared.\n');

  // ── Ensure AppConfig has the dev cut rate ─────────────────────────────────
  await prisma.appConfig.upsert({
    where: { key: 'DEV_CUT_RATE' },
    update: {},
    create: { key: 'DEV_CUT_RATE', value: '0.04' },
  });
  const devCutRate = 0.04;
  console.log(`💰  Dev cut rate: ${(devCutRate * 100).toFixed(0)}%\n`);

  // ── Upsert stores ─────────────────────────────────────────────────────────
  console.log('🏪  Ensuring stores exist…');
  const storeData = [
    { name: 'Lucky Stop #1',  address: '412 Main St',        city: 'Houston',     state: 'TX', zipCode: '77002' },
    { name: 'Lucky Stop #2',  address: '839 Westheimer Rd',  city: 'Houston',     state: 'TX', zipCode: '77006' },
    { name: 'Lucky Stop #3',  address: '1205 Oak Lawn Ave',  city: 'Dallas',      state: 'TX', zipCode: '75207' },
    { name: 'Lucky Stop #4',  address: '567 Commerce St',    city: 'Dallas',      state: 'TX', zipCode: '75202' },
    { name: 'Lucky Stop #5',  address: '2301 Lamar Blvd',    city: 'Austin',      state: 'TX', zipCode: '78705' },
    { name: 'Lucky Stop #6',  address: '748 N Loop 1604 W',  city: 'San Antonio', state: 'TX', zipCode: '78249' },
    { name: 'Lucky Stop #7',  address: '310 Throckmorton St',city: 'Fort Worth',  state: 'TX', zipCode: '76102' },
    { name: 'Lucky Stop #8',  address: '9820 Gateway Blvd N',city: 'El Paso',     state: 'TX', zipCode: '79924' },
    { name: 'Lucky Stop #9',  address: '4455 Fredericksburg Rd', city: 'San Antonio', state: 'TX', zipCode: '78201' },
    { name: 'Lucky Stop #10', address: '1876 Airline Dr',    city: 'Houston',     state: 'TX', zipCode: '77009' },
    { name: 'Lucky Stop #11', address: '623 S Congress Ave', city: 'Austin',      state: 'TX', zipCode: '78704' },
    { name: 'Lucky Stop #12', address: '190 E Stassney Ln',  city: 'Austin',      state: 'TX', zipCode: '78745' },
  ];

  await prisma.store.createMany({
    data: storeData.map((s) => ({ ...s, billingType: 'MONTHLY_SUBSCRIPTION', subscriptionPrice: 99 })),
  });

  const allStores = await prisma.store.findMany({ where: { isActive: true } });
  console.log(`   ${allStores.length} stores created.\n`);

  // ── Upsert users (DEV_ADMIN + SUPER_ADMIN + 3 employees + 8 customers) ───
  console.log('👥  Ensuring users exist…');
  const pin = await bcrypt.hash('1234', 10);

  const devAdmin = await prisma.user.upsert({
    where: { phone: '0000000000' },
    update: {},
    create: { phone: '0000000000', name: 'Dev Admin', role: 'DEV_ADMIN', pinHash: pin, isProfileComplete: true },
  });

  const superAdmin = await prisma.user.upsert({
    where: { phone: '1111111111' },
    update: {},
    create: { phone: '1111111111', name: 'HQ Manager', role: 'SUPER_ADMIN', pinHash: pin, isProfileComplete: true },
  });

  const employeeData = [
    { phone: '2000000001', name: 'Alex Rivera' },
    { phone: '2000000002', name: 'Jamie Chen' },
    { phone: '2000000003', name: 'Sam Williams' },
  ];

  const employees = await Promise.all(
    employeeData.map((e) =>
      prisma.user.upsert({
        where: { phone: e.phone },
        update: {},
        create: { ...e, role: 'EMPLOYEE', pinHash: pin, isProfileComplete: true },
      })
    )
  );

  // Assign employees to stores
  for (let i = 0; i < employees.length && i < allStores.length; i++) {
    await prisma.userStoreRole.upsert({
      where: { userId_storeId: { userId: employees[i].id, storeId: allStores[i].id } },
      update: {},
      create: { userId: employees[i].id, storeId: allStores[i].id, role: 'EMPLOYEE' },
    });
  }

  const customerData = [
    { phone: '3000000001', name: 'Maria Garcia' },
    { phone: '3000000002', name: 'James Johnson' },
    { phone: '3000000003', name: 'Emily Davis' },
    { phone: '3000000004', name: 'Chris Martinez' },
    { phone: '3000000005', name: 'Ashley Wilson' },
    { phone: '3000000006', name: 'Michael Brown' },
    { phone: '3000000007', name: 'Sarah Taylor' },
    { phone: '3000000008', name: 'David Anderson' },
  ];

  const customers = await Promise.all(
    customerData.map((c, i) =>
      prisma.user.upsert({
        where: { phone: c.phone },
        update: {},
        create: {
          ...c,
          role: 'CUSTOMER',
          pinHash: pin,
          isProfileComplete: true,
          qrCode: `QR_${c.phone}_${i + 1}`,
        },
      })
    )
  );

  console.log(`   ${employees.length} employees, ${customers.length} customers.\n`);

  // ── Category rates ────────────────────────────────────────────────────────
  await prisma.categoryRate.createMany({
    data: [
      { category: 'GAS',          cashbackRate: 0.05 },
      { category: 'DIESEL',       cashbackRate: 0.05 },
      { category: 'HOT_FOODS',    cashbackRate: 0.05 },
      { category: 'GROCERIES',    cashbackRate: 0.05 },
      { category: 'FROZEN_FOODS', cashbackRate: 0.05 },
      { category: 'FRESH_FOODS',  cashbackRate: 0.05 },
      { category: 'TOBACCO_VAPES',cashbackRate: 0.05 },
      { category: 'OTHER',        cashbackRate: 0.05 },
    ],
    skipDuplicates: true,
  });

  // ── Generate 60 random transactions ──────────────────────────────────────
  console.log('🧾  Generating 60 random transactions…\n');

  const CASHBACK_RATE = 0.05;
  let totalPurchase = 0;
  let totalCashbackIssued = 0;
  let totalDevCut = 0;
  let totalCustomerCashback = 0;

  const txRows: {
    customerId: string;
    grantedById: string;
    storeId: string;
    purchaseAmount: number;
    pointsAwarded: number;
    devCut: number;
    storeCost: number;
    cashbackRate: number;
    category: ProductCategory;
    status: TransactionStatus;
    receiptImageUrl: string;
    createdAt: Date;
    updatedAt: Date;
  }[] = [];

  const balanceAccumulator: Record<string, number> = {};
  customers.forEach((c) => { balanceAccumulator[c.id] = 0; });

  for (let i = 0; i < 60; i++) {
    const customer  = pick(customers);
    const employee  = pick(employees);
    const store     = pick(allStores);
    const category  = pick(CATEGORIES);
    const purchaseAmount = parseFloat(rand(5, 120).toFixed(2));
    const cashbackIssued = parseFloat((purchaseAmount * CASHBACK_RATE).toFixed(4));
    const devCut         = parseFloat((cashbackIssued * devCutRate).toFixed(2));
    const pointsAwarded  = parseFloat((cashbackIssued - devCut).toFixed(2));
    const storeCost      = cashbackIssued;
    const createdAt      = randomDate(45);

    totalPurchase         += purchaseAmount;
    totalCashbackIssued   += cashbackIssued;
    totalDevCut           += devCut;
    totalCustomerCashback += pointsAwarded;
    balanceAccumulator[customer.id] += pointsAwarded;

    txRows.push({
      customerId: customer.id,
      grantedById: employee.id,
      storeId: store.id,
      purchaseAmount,
      pointsAwarded,
      devCut,
      storeCost,
      cashbackRate: CASHBACK_RATE,
      category,
      status: 'APPROVED',
      receiptImageUrl: 'https://placehold.co/400x600/png?text=Receipt',
      createdAt,
      updatedAt: createdAt,
    });
  }

  await prisma.pointsTransaction.createMany({ data: txRows });

  // Update customer balances
  for (const [customerId, balance] of Object.entries(balanceAccumulator)) {
    if (balance > 0) {
      await prisma.user.update({
        where: { id: customerId },
        data: { pointsBalance: parseFloat(balance.toFixed(2)) },
      });
    }
  }

  // ── Add a few credit redemptions ──────────────────────────────────────────
  console.log('💳  Adding 5 sample redemptions…');
  const redeemCustomers = customers.slice(0, 5);
  for (const customer of redeemCustomers) {
    const store = pick(allStores);
    const employee = pick(employees);
    const amount = parseFloat(rand(1, 5).toFixed(2));
    await prisma.creditRedemption.create({
      data: {
        customerId: customer.id,
        storeId: store.id,
        amount,
        devCut: 0,
        processedBy: employee.id,
      },
    });
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '═'.repeat(52));
  console.log('📊  SEED SUMMARY');
  console.log('═'.repeat(52));
  console.log(`  Transactions created : 60`);
  console.log(`  Total purchase volume: $${totalPurchase.toFixed(2)}`);
  console.log(`  Total cashback issued: $${totalCashbackIssued.toFixed(2)}  (5% of purchases)`);
  console.log(`  ─── split ──────────────────────────────────────`);
  console.log(`  → Customer cashback  : $${totalCustomerCashback.toFixed(2)}  (96% of cashback issued)`);
  console.log(`  → Dev cut earned     : $${totalDevCut.toFixed(2)}  (4% of cashback issued)`);
  console.log(`  Store pays           : $${totalCashbackIssued.toFixed(2)}  (full cashback, no extra charge)`);
  console.log('═'.repeat(52));

  console.log('\n📝  Login credentials (all PINs: 1234)');
  console.log(`  Dev Admin   : phone 0000000000`);
  console.log(`  Super Admin : phone 1111111111`);
  console.log(`  Employees   : phones 2000000001 → 2000000003`);
  console.log(`  Customers   : phones 3000000001 → 3000000008`);
  console.log();
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
