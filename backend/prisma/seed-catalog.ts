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
// Points are priced ~15-20% above retail so redemptions feel rewarding
const CATALOG_ITEMS = [

  // ── Fountain Drinks ────────────────────────────────────────────────────────
  {
    title: 'Small Fountain Drink',
    description: '16 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 79,
    category: 'IN_STORE',
    sortOrder: 10,
  },
  {
    title: 'Medium Fountain Drink',
    description: '24 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 99,
    category: 'IN_STORE',
    sortOrder: 11,
  },
  {
    title: 'Large Fountain Drink',
    description: '32 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 129,
    category: 'IN_STORE',
    sortOrder: 12,
  },
  {
    title: 'XL Fountain Drink',
    description: '44 oz fountain drink — any flavor',
    emoji: '🥤',
    pointsCost: 149,
    category: 'IN_STORE',
    sortOrder: 13,
  },

  // ── Coffee ─────────────────────────────────────────────────────────────────
  {
    title: 'Coffee — Small',
    description: '12 oz fresh-brewed coffee — any roast',
    emoji: '☕',
    pointsCost: 179,
    category: 'HOT_FOODS',
    sortOrder: 20,
  },
  {
    title: 'Coffee — Large',
    description: '16 oz fresh-brewed coffee — any roast',
    emoji: '☕',
    pointsCost: 219,
    category: 'HOT_FOODS',
    sortOrder: 21,
  },

  // ── Slurpees ───────────────────────────────────────────────────────────────
  {
    title: 'Slurpee — 12 oz',
    description: '12 oz Slurpee — any flavor',
    emoji: '🧊',
    pointsCost: 199,
    category: 'IN_STORE',
    sortOrder: 30,
  },
  {
    title: 'Slurpee — 20 oz',
    description: '20 oz Slurpee — any flavor',
    emoji: '🧊',
    pointsCost: 249,
    category: 'IN_STORE',
    sortOrder: 31,
  },
  {
    title: 'Slurpee — 32 oz',
    description: '32 oz Slurpee — any flavor',
    emoji: '🧊',
    pointsCost: 299,
    category: 'IN_STORE',
    sortOrder: 32,
  },
  {
    title: 'Slurpee — 40 oz',
    description: '40 oz Slurpee — any flavor',
    emoji: '🧊',
    pointsCost: 359,
    category: 'IN_STORE',
    sortOrder: 33,
  },
  {
    title: 'Coffee Slurpee — 16 oz',
    description: '16 oz Coffee Slurpee — creamy frozen coffee',
    emoji: '🧋',
    pointsCost: 259,
    category: 'IN_STORE',
    sortOrder: 34,
  },
  {
    title: 'Coffee Slurpee — 24 oz',
    description: '24 oz Coffee Slurpee — creamy frozen coffee',
    emoji: '🧋',
    pointsCost: 319,
    category: 'IN_STORE',
    sortOrder: 35,
  },

  // ── Sodas ──────────────────────────────────────────────────────────────────
  {
    title: 'Pepsi — 20 oz',
    description: '20 oz Pepsi bottle, ice cold',
    emoji: '🥤',
    pointsCost: 289,
    category: 'IN_STORE',
    sortOrder: 50,
  },
  {
    title: 'Coca-Cola — 20 oz',
    description: '20 oz Coca-Cola bottle, ice cold',
    emoji: '🥤',
    pointsCost: 289,
    category: 'IN_STORE',
    sortOrder: 51,
  },
  {
    title: 'Dr. Pepper — 20 oz',
    description: '20 oz Dr. Pepper bottle, ice cold',
    emoji: '🥤',
    pointsCost: 289,
    category: 'IN_STORE',
    sortOrder: 52,
  },
  {
    title: 'Mountain Dew — 20 oz',
    description: '20 oz Mountain Dew bottle, ice cold',
    emoji: '🥤',
    pointsCost: 289,
    category: 'IN_STORE',
    sortOrder: 53,
  },
  {
    title: 'Gatorade — 28 oz',
    description: '28 oz Gatorade sports drink — any flavor',
    emoji: '🏃',
    pointsCost: 299,
    category: 'IN_STORE',
    sortOrder: 54,
  },
  {
    title: 'Gatorade — 32 oz',
    description: '32 oz Gatorade sports drink — any flavor',
    emoji: '🏃',
    pointsCost: 329,
    category: 'IN_STORE',
    sortOrder: 55,
  },

  // ── Energy Drinks ──────────────────────────────────────────────────────────
  {
    title: 'Red Bull — 8.4 oz',
    description: '8.4 oz Red Bull Energy Drink (original)',
    emoji: '🐂',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 70,
  },
  {
    title: 'Red Bull — 12 oz',
    description: '12 oz Red Bull Energy Drink',
    emoji: '🐂',
    pointsCost: 459,
    category: 'IN_STORE',
    sortOrder: 71,
  },
  {
    title: 'Red Bull — 16 oz',
    description: '16 oz Red Bull Energy Drink — any flavor',
    emoji: '🐂',
    pointsCost: 529,
    category: 'IN_STORE',
    sortOrder: 72,
  },
  {
    title: 'Monster Energy — 16 oz',
    description: '16 oz Monster Energy — any flavor',
    emoji: '👾',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 73,
  },
  {
    title: 'Monster Energy — 24 oz',
    description: '24 oz Monster Energy — any flavor',
    emoji: '👾',
    pointsCost: 519,
    category: 'IN_STORE',
    sortOrder: 74,
  },
  {
    title: 'Alani Nu — 12 oz',
    description: '12 oz Alani Nu Energy Drink — any flavor',
    emoji: '💪',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 75,
  },
  {
    title: 'Celsius — 12 oz',
    description: '12 oz Celsius Live Fit Energy Drink — any flavor',
    emoji: '🔥',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 76,
  },

  // ── Starbucks (bottled / canned) ───────────────────────────────────────────
  {
    title: 'Starbucks Frappuccino — 9.5 oz',
    description: '9.5 oz Starbucks bottled Frappuccino — any flavor',
    emoji: '⭐',
    pointsCost: 459,
    category: 'IN_STORE',
    sortOrder: 80,
  },
  {
    title: 'Starbucks Doubleshot Espresso — 6.5 oz',
    description: '6.5 oz Starbucks Doubleshot canned espresso + cream',
    emoji: '⭐',
    pointsCost: 379,
    category: 'IN_STORE',
    sortOrder: 81,
  },
  {
    title: 'Starbucks Cold Brew — 11 oz',
    description: '11 oz Starbucks bottled Cold Brew coffee',
    emoji: '⭐',
    pointsCost: 519,
    category: 'IN_STORE',
    sortOrder: 82,
  },

  // ── Frito-Lay Snacks ───────────────────────────────────────────────────────
  {
    title: "Lay's Classic — Snack Bag",
    description: "1.875 oz Lay's Classic potato chips",
    emoji: '🥔',
    pointsCost: 239,
    category: 'IN_STORE',
    sortOrder: 90,
  },
  {
    title: 'Doritos Nacho Cheese — Snack Bag',
    description: '1.75 oz Doritos Nacho Cheese tortilla chips',
    emoji: '🌽',
    pointsCost: 239,
    category: 'IN_STORE',
    sortOrder: 91,
  },
  {
    title: 'Cheetos Crunchy — Snack Bag',
    description: '2 oz Cheetos Crunchy cheese puffs',
    emoji: '🧡',
    pointsCost: 239,
    category: 'IN_STORE',
    sortOrder: 92,
  },
  {
    title: 'Fritos Original — Snack Bag',
    description: '2 oz Fritos Original corn chips',
    emoji: '🌽',
    pointsCost: 239,
    category: 'IN_STORE',
    sortOrder: 93,
  },
  {
    title: 'Doritos Cool Ranch — Snack Bag',
    description: '1.75 oz Doritos Cool Ranch tortilla chips',
    emoji: '🌽',
    pointsCost: 239,
    category: 'IN_STORE',
    sortOrder: 94,
  },
  {
    title: "Lay's Barbecue — Snack Bag",
    description: "1.875 oz Lay's Barbecue potato chips",
    emoji: '🥔',
    pointsCost: 239,
    category: 'IN_STORE',
    sortOrder: 95,
  },

  // ── Jack Link's Jerky ──────────────────────────────────────────────────────
  {
    title: "Jack Link's Beef Jerky — Original",
    description: '1.25 oz Jack Link\'s Original beef jerky snack bag',
    emoji: '🥩',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 100,
  },
  {
    title: "Jack Link's Beef Jerky — Peppered",
    description: "1.25 oz Jack Link's Peppered beef jerky snack bag",
    emoji: '🥩',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 101,
  },
  {
    title: "Jack Link's Beef Jerky — Teriyaki",
    description: "1.25 oz Jack Link's Teriyaki beef jerky snack bag",
    emoji: '🥩',
    pointsCost: 399,
    category: 'IN_STORE',
    sortOrder: 102,
  },

  // ── Pringles ───────────────────────────────────────────────────────────────
  {
    title: 'Pringles Original — 2.36 oz',
    description: '2.36 oz Pringles Original crisps can',
    emoji: '🥫',
    pointsCost: 299,
    category: 'IN_STORE',
    sortOrder: 110,
  },
  {
    title: 'Pringles Sour Cream & Onion — 2.36 oz',
    description: '2.36 oz Pringles Sour Cream & Onion crisps can',
    emoji: '🥫',
    pointsCost: 299,
    category: 'IN_STORE',
    sortOrder: 111,
  },
  {
    title: 'Pringles BBQ — 2.36 oz',
    description: '2.36 oz Pringles BBQ crisps can',
    emoji: '🥫',
    pointsCost: 299,
    category: 'IN_STORE',
    sortOrder: 112,
  },
  {
    title: 'Pringles Ranch — 2.36 oz',
    description: '2.36 oz Pringles Ranch crisps can',
    emoji: '🥫',
    pointsCost: 299,
    category: 'IN_STORE',
    sortOrder: 113,
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
