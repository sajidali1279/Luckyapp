/**
 * Test Store Manager account seed — for manual/UI testing.
 * Safe to run multiple times (checks before creating).
 * Run: cd backend && npx ts-node src/utils/seed-manager-test.ts
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import prisma from '../config/prisma';
import { Role } from '@prisma/client';

const TEST_MANAGER = { phone: '5559990002', name: 'Test Manager', pin: '1234' };

async function seed() {
  console.log('🧑‍💼 Seeding test store manager...\n');

  const stores = await prisma.store.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  if (stores.length === 0) {
    console.error('❌ No stores found! Run the main seed first: npm run db:seed');
    process.exit(1);
  }

  let manager = await prisma.user.findUnique({ where: { phone: TEST_MANAGER.phone } });
  if (!manager) {
    const pinHash = await bcrypt.hash(TEST_MANAGER.pin, 12);
    manager = await prisma.user.create({
      data: {
        phone: TEST_MANAGER.phone, name: TEST_MANAGER.name,
        pinHash, role: Role.STORE_MANAGER, isProfileComplete: true,
      },
    });
    console.log(`✅ ${TEST_MANAGER.name} created (phone: ${TEST_MANAGER.phone}, PIN: ${TEST_MANAGER.pin})`);
  } else {
    console.log(`⚠️  Test manager already exists (phone: ${TEST_MANAGER.phone})`);
  }

  await prisma.userStoreRole.upsert({
    where: { userId_storeId: { userId: manager.id, storeId: stores[0].id } },
    update: {},
    create: { userId: manager.id, storeId: stores[0].id, role: Role.STORE_MANAGER },
  });
  console.log(`✅ Assigned to store: ${stores[0].name}`);

  console.log('\n✅ Done.');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
