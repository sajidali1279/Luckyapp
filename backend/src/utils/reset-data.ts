/**
 * reset-data.ts — clears all sale/billing data for a clean demo
 *
 * Deletes:
 *   - points_transactions
 *   - credit_redemptions
 *   - billing_records
 *   - receipt_tokens
 *   - audit_logs
 *   - Resets all customer pointsBalance → 0
 *
 * Preserves:
 *   - Users & staff accounts
 *   - Stores
 *   - Offers & banners
 *   - Category rates
 *
 * Run: npx ts-node -r tsconfig-paths/register src/utils/reset-data.ts
 */

import 'dotenv/config';
import prisma from '../config/prisma';

async function reset() {
  console.log('🗑️  Resetting sale & billing data...\n');

  const [txns, redemptions, credits, tokens, audits] = await Promise.all([
    prisma.pointsTransaction.deleteMany(),
    prisma.redemption.deleteMany(),
    prisma.creditRedemption.deleteMany(),
    prisma.receiptToken.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);

  console.log(`  ✅ Deleted ${txns.count} points transactions`);
  console.log(`  ✅ Deleted ${redemptions.count} reward redemptions`);
  console.log(`  ✅ Deleted ${credits.count} credit redemptions`);
  console.log(`  ✅ Deleted ${tokens.count} receipt tokens`);
  console.log(`  ✅ Deleted ${audits.count} audit log entries`);

  const billing = await prisma.billingRecord.deleteMany();
  console.log(`  ✅ Deleted ${billing.count} billing records`);

  const reset = await prisma.user.updateMany({
    where: { role: 'CUSTOMER' },
    data: { pointsBalance: 0 },
  });
  console.log(`  ✅ Reset pointsBalance to 0 for ${reset.count} customers`);

  console.log('\n✅ Done! Database is clean for demo.\n');
  console.log('👉 Now run: npx ts-node -r tsconfig-paths/register src/utils/seed.ts');
}

reset()
  .catch((e) => { console.error('Reset failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
