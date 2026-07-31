/**
 * Test offers/deals seed — for manual UI testing of the customer home
 * "Today's Deals" section. Safe to run multiple times (checks before creating).
 * Run: cd backend && npx ts-node src/utils/seed-deals-test.ts
 */
import 'dotenv/config';
import prisma from '../config/prisma';
import { OfferType } from '@prisma/client';

const now = new Date();
const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const end = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

const DEALS = [
  { title: 'Hot Dog Combo', description: 'Any hot dog plus a fountain drink.', dealText: '2 for $5', type: OfferType.ALL_STORES },
  { title: 'Weekend Grocery Bonus', description: 'Extra cashback on groceries this weekend.', dealText: 'Extra 3% back', type: OfferType.ALL_STORES },
  { title: 'Fountain Drink Special', description: 'Any size fountain drink.', dealText: '$1.00 flat', type: OfferType.ALL_STORES },
];

async function seed() {
  console.log('🏷️  Seeding test deals...\n');
  for (const d of DEALS) {
    const existing = await prisma.offer.findFirst({ where: { title: d.title } });
    if (existing) {
      console.log(`  ⚠️  ${d.title} already exists — skipping`);
      continue;
    }
    await prisma.offer.create({
      data: {
        title: d.title,
        description: d.description,
        dealText: d.dealText,
        type: d.type,
        startDate: start,
        endDate: end,
        isActive: true,
      },
    });
    console.log(`  ✅ ${d.title} — ${d.dealText}`);
  }
  console.log('\n✅ Done.');
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
