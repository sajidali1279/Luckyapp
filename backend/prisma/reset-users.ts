import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../src/config/prisma';
import { Role } from '@prisma/client';

const PIN = '1234';

const USERS: { role: Role; prefix: string; label: string }[] = [
  { role: Role.DEV_ADMIN,     prefix: '111000000', label: 'DevAdmin'      },
  { role: Role.SUPER_ADMIN,   prefix: '222000000', label: 'SuperAdmin'    },
  { role: Role.STORE_MANAGER, prefix: '333000000', label: 'StoreManager'  },
  { role: Role.EMPLOYEE,      prefix: '444000000', label: 'Employee'      },
  { role: Role.CUSTOMER,      prefix: '555000000', label: 'Customer'      },
];

async function run() {
  console.log('⚠️  Clearing all user-related data...\n');

  // Delete in dependency order
  await prisma.auditLog.deleteMany();
  await prisma.pushToken.deleteMany();
  await prisma.creditRedemption.deleteMany();
  await prisma.pointsTransaction.deleteMany();
  await prisma.userStoreRole.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ All users + transactions cleared\n');

  const pinHash = await bcrypt.hash(PIN, 12);

  // Fetch stores to assign managers + employees
  const stores = await prisma.store.findMany({ orderBy: { name: 'asc' }, take: 5 });
  if (stores.length < 5) {
    console.warn(`⚠️  Only ${stores.length} stores found — some roles may share a store`);
  }

  const credentials: { role: string; name: string; phone: string; pin: string; store?: string }[] = [];

  for (const { role, prefix, label } of USERS) {
    console.log(`Creating 5 × ${label}...`);

    for (let i = 1; i <= 5; i++) {
      const phone = `${prefix}${i}`;
      const name  = `${label} ${i}`;
      const needsQr = role === Role.CUSTOMER;

      const user = await prisma.user.create({
        data: {
          phone,
          name,
          pinHash,
          role,
          isProfileComplete: true,
          qrCode: needsQr ? uuidv4() : undefined,
        },
      });

      // Assign store to STORE_MANAGER and EMPLOYEE (use stores[i-1], cycling if needed)
      let storeName: string | undefined;
      if (role === Role.STORE_MANAGER || role === Role.EMPLOYEE) {
        const store = stores[(i - 1) % stores.length];
        await prisma.userStoreRole.create({
          data: { userId: user.id, storeId: store.id, role },
        });
        storeName = store.name;
      }

      credentials.push({ role: label, name, phone, pin: PIN, store: storeName });
      console.log(`  ✅ ${name.padEnd(18)} ${phone}`);
    }
    console.log();
  }

  // ── Print credentials table ──────────────────────────────────────────────────
  console.log('═'.repeat(75));
  console.log('  CREDENTIALS (all PINs = 1234)');
  console.log('═'.repeat(75));

  let lastRole = '';
  for (const c of credentials) {
    if (c.role !== lastRole) {
      console.log(`\n  ── ${c.role.toUpperCase()} ${'─'.repeat(50 - c.role.length)}`);
      lastRole = c.role;
    }
    const storeCol = c.store ? `  → ${c.store}` : '';
    console.log(`  ${c.name.padEnd(18)}  Phone: ${c.phone.padEnd(12)}  PIN: ${PIN}${storeCol}`);
  }

  console.log('\n' + '═'.repeat(75));
  console.log(`  Total: ${credentials.length} users created`);
  console.log('═'.repeat(75) + '\n');
}

run()
  .catch((e) => { console.error('Failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
