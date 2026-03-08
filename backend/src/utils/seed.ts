import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../config/prisma';
import { Role, BillingType } from '@prisma/client';

// ─── YOUR DEVADMIN CREDENTIALS ────────────────────────────────────────────────
// Change these before going live!
const DEV_ADMIN_PHONE = '9999999999';
const DEV_ADMIN_PIN   = '0000';
const DEV_ADMIN_NAME  = 'Dev Admin';

// ─── 14 LUCKY STOP STORES ─────────────────────────────────────────────────────
// Update names/addresses with real store info before launching
const STORES = [
  { name: 'Lucky Stop #1',  address: '100 Main St',       city: 'Houston',      state: 'TX', zipCode: '77001' },
  { name: 'Lucky Stop #2',  address: '200 Oak Ave',        city: 'Houston',      state: 'TX', zipCode: '77002' },
  { name: 'Lucky Stop #3',  address: '300 Pine Blvd',      city: 'Houston',      state: 'TX', zipCode: '77003' },
  { name: 'Lucky Stop #4',  address: '400 Elm Dr',         city: 'Pasadena',     state: 'TX', zipCode: '77504' },
  { name: 'Lucky Stop #5',  address: '500 Cedar Ln',       city: 'Pasadena',     state: 'TX', zipCode: '77505' },
  { name: 'Lucky Stop #6',  address: '600 Maple St',       city: 'Pearland',     state: 'TX', zipCode: '77581' },
  { name: 'Lucky Stop #7',  address: '700 Birch Rd',       city: 'Pearland',     state: 'TX', zipCode: '77584' },
  { name: 'Lucky Stop #8',  address: '800 Walnut Ave',     city: 'Sugar Land',   state: 'TX', zipCode: '77478' },
  { name: 'Lucky Stop #9',  address: '900 Spruce Blvd',    city: 'Sugar Land',   state: 'TX', zipCode: '77479' },
  { name: 'Lucky Stop #10', address: '1000 Willow Way',    city: 'Katy',         state: 'TX', zipCode: '77449' },
  { name: 'Lucky Stop #11', address: '1100 Cypress Creek', city: 'Katy',         state: 'TX', zipCode: '77450' },
  { name: 'Lucky Stop #12', address: '1200 Bay Area Blvd', city: 'League City',  state: 'TX', zipCode: '77573' },
  { name: 'Lucky Stop #13', address: '1300 NASA Rd',       city: 'Webster',      state: 'TX', zipCode: '77598' },
  { name: 'Lucky Stop #14', address: '1400 Gulf Fwy',      city: 'Friendswood',  state: 'TX', zipCode: '77546' },
];

async function seed() {
  console.log('🌱 Seeding Lucky Stop database...\n');

  // ── DevAdmin account ────────────────────────────────────────────────────────
  const existingAdmin = await prisma.user.findUnique({ where: { phone: DEV_ADMIN_PHONE } });

  let devAdmin;
  if (existingAdmin) {
    console.log(`⚠️  DevAdmin (${DEV_ADMIN_PHONE}) already exists — skipping`);
    devAdmin = existingAdmin;
  } else {
    const pinHash = await bcrypt.hash(DEV_ADMIN_PIN, 12);
    devAdmin = await prisma.user.create({
      data: {
        phone: DEV_ADMIN_PHONE,
        name: DEV_ADMIN_NAME,
        pinHash,
        role: Role.DEV_ADMIN,
        isProfileComplete: true,
        // No QR code — DevAdmin doesn't earn points
      },
    });
    console.log(`✅ DevAdmin created`);
    console.log(`   Phone : ${DEV_ADMIN_PHONE}`);
    console.log(`   PIN   : ${DEV_ADMIN_PIN}  ← change this before going live!\n`);
  }

  // ── Stores ──────────────────────────────────────────────────────────────────
  console.log('Creating 14 stores...');
  const createdStores = [];

  for (const store of STORES) {
    const existing = await prisma.store.findFirst({ where: { name: store.name } });
    if (existing) {
      console.log(`  ⚠️  ${store.name} already exists — skipping`);
      createdStores.push(existing);
    } else {
      const created = await prisma.store.create({
        data: {
          ...store,
          billingType: BillingType.MONTHLY_SUBSCRIPTION,
          subscriptionPrice: 99.00,
          transactionFeeRate: 0.02,
        },
      });
      console.log(`  ✅ ${created.name} — ${created.city}, ${created.state}`);
      createdStores.push(created);
    }
  }

  console.log(`\n✅ All done! Summary:`);
  console.log(`   DevAdmin account : ${DEV_ADMIN_PHONE} / PIN: ${DEV_ADMIN_PIN}`);
  console.log(`   Stores created   : ${createdStores.length}`);
  console.log(`\n📌 Next steps:`);
  console.log(`   1. Update store addresses in seed.ts with real Lucky Stop locations`);
  console.log(`   2. Change DevAdmin PIN before going live`);
  console.log(`   3. Use the admin dashboard to create employee accounts per store`);
  console.log(`   4. Log in at the API: POST /api/auth/login with phone=${DEV_ADMIN_PHONE} pin=${DEV_ADMIN_PIN}`);
}

seed()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
