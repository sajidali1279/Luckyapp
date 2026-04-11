/**
 * Catalog seed — adds redeemable items to the redemption catalog.
 * Safe to run multiple times (upserts by title).
 *
 * Run from backend/:
 *   npx ts-node prisma/seed-catalog.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// pointsCost = cents (e.g. 89 pts = $0.89 redeemable value)
const CATALOG_ITEMS = [

  // ── Fountain Drinks ────────────────────────────────────────────────────────
  {
    title: 'Small Fountain Drink',
    description: '16 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 79,
    category: 'HOT_FOODS',
    sortOrder: 10,
  },
  {
    title: 'Medium Fountain Drink',
    description: '24 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 99,
    category: 'HOT_FOODS',
    sortOrder: 11,
  },
  {
    title: 'Large Fountain Drink',
    description: '32 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 129,
    category: 'HOT_FOODS',
    sortOrder: 12,
  },
  {
    title: 'XL Fountain Drink',
    description: '44 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 149,
    category: 'HOT_FOODS',
    sortOrder: 13,
  },

];

async function main() {
  console.log('\n🥤  Seeding catalog items…\n');

  let created = 0;
  let skipped = 0;

  for (const item of CATALOG_ITEMS) {
    const existing = await prisma.redemptionCatalogItem.findFirst({
      where: { title: item.title },
    });

    if (existing) {
      console.log(`  ⏭  Skipped (already exists): ${item.emoji} ${item.title}`);
      skipped++;
    } else {
      await prisma.redemptionCatalogItem.create({
        data: { ...item, chain: 'Lucky Stop', isActive: true },
      });
      console.log(`  ✅  Created: ${item.emoji} ${item.title} — ${item.pointsCost} pts ($${(item.pointsCost / 100).toFixed(2)})`);
      created++;
    }
  }

  console.log(`\n  Done — ${created} created, ${skipped} skipped.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
