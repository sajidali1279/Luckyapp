/**
 * Seed approved order categories.
 * Run: npx ts-node prisma/seed-categories.ts
 * Safe to re-run — uses upsert by name (case-insensitive).
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATEGORIES = [
  'Dairy',
  'Cold Beverages',
  'Hot Beverages',
  'Candy',
  'Snacks',
  'Bakery',
  'Hot Food',
  'Fresh Food',
  'Frozen',
  'Grocery Staples',
  'Tobacco',
  'Tobacco Accessories',
  'Medicine',
  'Supplements & Nutrition',
  'Personal Care',
  'Baby & Infant',
  'Wipes & Sanitizers',
  'Household',
  'Automotive',
  'Car Wash',
  'Outdoor & Seasonal',
  'Disposables',
  'Electronics',
  'Office & School',
  'Clothing & Accessories',
  'Pet Supplies',
  'Seasonal & Novelty',
  'Grocery',
  'Other',
];

async function main() {
  console.log(`Seeding ${CATEGORIES.length} categories…`);
  let created = 0;
  let skipped = 0;

  for (const name of CATEGORIES) {
    const existing = await prisma.orderCategory.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      // Already exists — ensure it is approved
      if (existing.status !== 'APPROVED') {
        await prisma.orderCategory.update({ where: { id: existing.id }, data: { status: 'APPROVED' } });
        console.log(`  ✓ approved  ${name}`);
        created++;
      } else {
        skipped++;
      }
    } else {
      await prisma.orderCategory.create({ data: { name, status: 'APPROVED' } });
      console.log(`  + created   ${name}`);
      created++;
    }
  }

  console.log(`\nDone — ${created} upserted, ${skipped} already approved.`);
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
