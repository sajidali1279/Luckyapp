/**
 * Reset all activity data for a clean demo presentation.
 *
 * KEEPS:  users, stores, staff assignments, offers, banners, catalog items,
 *         tier/category rates, shift templates, store keyword mappings, app config.
 *
 * CLEARS: all transactions, redemptions, billing records, ratings, tier benefit
 *         claims, welcome bonuses, receipt tokens, notifications, audit logs,
 *         OTP codes, chat messages, store/shift requests, product requests,
 *         job applications, business promotions, support threads.
 *
 * RESETS: every customer's pointsBalance, periodPoints, tier → BRONZE.
 *
 * Run:  npx ts-node prisma/reset-for-demo.ts
 */

import prisma from '../src/config/prisma';

async function main() {
  console.log('🔄 Starting demo reset...\n');

  // ── 1. Delete in dependency order ────────────────────────────────────────────

  // Ratings reference transactions — must go first
  const ratings = await prisma.employeeRating.deleteMany({});
  console.log(`✅ Deleted ${ratings.count} employee ratings`);

  // Transactions (the main activity table)
  const txns = await prisma.pointsTransaction.deleteMany({});
  console.log(`✅ Deleted ${txns.count} points transactions`);

  // Redemptions
  const credRedemptions = await prisma.creditRedemption.deleteMany({});
  console.log(`✅ Deleted ${credRedemptions.count} credit redemptions`);

  const catRedemptions = await prisma.catalogRedemption.deleteMany({});
  console.log(`✅ Deleted ${catRedemptions.count} catalog redemptions`);

  const legacyRedemptions = await prisma.redemption.deleteMany({});
  console.log(`✅ Deleted ${legacyRedemptions.count} legacy redemptions`);

  // Tier & welcome bonus claims
  const tierClaims = await prisma.tierBenefitClaim.deleteMany({});
  console.log(`✅ Deleted ${tierClaims.count} tier benefit claims`);

  const welcomeClaims = await prisma.welcomeBonusClaim.deleteMany({});
  console.log(`✅ Deleted ${welcomeClaims.count} welcome bonus claims`);

  // Billing
  const billing = await prisma.billingRecord.deleteMany({});
  console.log(`✅ Deleted ${billing.count} billing records`);

  // Receipt QR tokens
  const receiptTokens = await prisma.receiptToken.deleteMany({});
  console.log(`✅ Deleted ${receiptTokens.count} receipt tokens`);

  // Notifications & OTP
  const notifications = await prisma.userNotification.deleteMany({});
  console.log(`✅ Deleted ${notifications.count} notifications`);

  const otps = await prisma.otpCode.deleteMany({});
  console.log(`✅ Deleted ${otps.count} OTP codes`);

  // Audit logs
  const auditLogs = await prisma.auditLog.deleteMany({});
  console.log(`✅ Deleted ${auditLogs.count} audit log entries`);

  // Chat, store requests, shift requests, product requests
  const chats = await prisma.chatMessage.deleteMany({});
  console.log(`✅ Deleted ${chats.count} chat messages`);

  const shiftRequests = await prisma.shiftRequest.deleteMany({});
  console.log(`✅ Deleted ${shiftRequests.count} shift requests`);

  const storeRequests = await prisma.storeRequest.deleteMany({});
  console.log(`✅ Deleted ${storeRequests.count} store requests`);

  const productRequests = await prisma.productRequest.deleteMany({});
  console.log(`✅ Deleted ${productRequests.count} product requests`);

  // Job applications & business promotions
  const jobApps = await prisma.jobApplication.deleteMany({});
  console.log(`✅ Deleted ${jobApps.count} job applications`);

  const promos = await prisma.businessPromotion.deleteMany({});
  console.log(`✅ Deleted ${promos.count} business promotions`);

  // Support threads (messages cascade)
  const threads = await prisma.supportThread.deleteMany({});
  console.log(`✅ Deleted ${threads.count} support threads`);

  // ── 2. Reset all customer balances & tiers ────────────────────────────────────

  const currentPeriod = (() => {
    const now = new Date();
    const half = now.getMonth() < 6 ? 'H1' : 'H2';
    return `${now.getFullYear()}-${half}`;
  })();

  const { count: resetCount } = await prisma.user.updateMany({
    where: { role: 'CUSTOMER' },
    data: {
      pointsBalance: 0,
      periodPoints: 0,
      tier: 'BRONZE',
      tierPeriod: currentPeriod,
      failedLoginAttempts: 0,
      lockedUntil: null,
    },
  });
  console.log(`✅ Reset ${resetCount} customers → balance $0, tier BRONZE, period ${currentPeriod}`);

  // ── 3. Summary ────────────────────────────────────────────────────────────────
  const [customerCount, storeCount, offerCount, catalogCount] = await Promise.all([
    prisma.user.count({ where: { role: 'CUSTOMER' } }),
    prisma.store.count(),
    prisma.offer.count({ where: { isActive: true } }),
    prisma.redemptionCatalogItem.count({ where: { isActive: true } }),
  ]);

  console.log('\n🎉 Reset complete. Current state:');
  console.log(`   👥 Customers ready:      ${customerCount}`);
  console.log(`   🏪 Stores active:        ${storeCount}`);
  console.log(`   📢 Active offers:        ${offerCount}`);
  console.log(`   🎁 Catalog items:        ${catalogCount}`);
  console.log(`   💰 All balances:         $0.00`);
  console.log(`   🥉 All tiers:            BRONZE`);
  console.log('\n✨ Ready for your demo presentation!\n');
}

main()
  .catch((e) => { console.error('❌ Reset failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
