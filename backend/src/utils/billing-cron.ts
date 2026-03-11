/**
 * Monthly billing cron — runs on the 1st of every month at 00:05 UTC.
 * Creates a BillingRecord for each active store based on their billing type:
 *   MONTHLY_SUBSCRIPTION  → flat subscriptionPrice
 *   PER_TRANSACTION       → prior-month transaction count × transactionFeeRate × avg purchase
 *   HYBRID                → subscription + per-transaction fees
 *
 * Safe to run multiple times — skips stores that already have a record for the period.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { BillingType } from '@prisma/client';

function currentPeriod(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function lastMonthRange(): { from: Date; to: Date } {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const to   = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { from, to };
}

export async function runMonthlyBilling() {
  const period = currentPeriod();
  console.log(`[billing-cron] Running monthly billing for period ${period}…`);

  const stores = await prisma.store.findMany({ where: { isActive: true } });
  const { from, to } = lastMonthRange();

  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    // Idempotency — skip if already billed for this period
    const existing = await prisma.billingRecord.findFirst({
      where: { storeId: store.id, period },
    });
    if (existing) { skipped++; continue; }

    let amount = 0;

    if (store.billingType === BillingType.MONTHLY_SUBSCRIPTION) {
      amount = Number(store.subscriptionPrice);

    } else if (store.billingType === BillingType.PER_TRANSACTION) {
      const stats = await prisma.pointsTransaction.aggregate({
        where: { storeId: store.id, status: 'APPROVED', createdAt: { gte: from, lt: to } },
        _sum: { purchaseAmount: true },
      });
      amount = parseFloat(((stats._sum.purchaseAmount ?? 0) * Number(store.transactionFeeRate)).toFixed(2));

    } else {
      // HYBRID: flat fee + per-transaction fees on last month's volume
      const stats = await prisma.pointsTransaction.aggregate({
        where: { storeId: store.id, status: 'APPROVED', createdAt: { gte: from, lt: to } },
        _sum: { purchaseAmount: true },
      });
      const txFees = parseFloat(((stats._sum.purchaseAmount ?? 0) * Number(store.transactionFeeRate)).toFixed(2));
      amount = parseFloat((Number(store.subscriptionPrice) + txFees).toFixed(2));
    }

    await prisma.billingRecord.create({
      data: {
        storeId: store.id,
        billingType: store.billingType,
        amount,
        period,
        isPaid: false,  // pending payment
      },
    });
    created++;
    console.log(`[billing-cron]   ✅ ${store.name} — $${amount.toFixed(2)} (${store.billingType})`);
  }

  console.log(`[billing-cron] Done. Created: ${created}, Skipped: ${skipped}`);
}

// Schedule: 1st of every month at 00:05 UTC
export function startBillingCron() {
  cron.schedule('5 0 1 * *', runMonthlyBilling, { timezone: 'UTC' });
  console.log('[billing-cron] Monthly billing job scheduled (1st of month, 00:05 UTC)');
}
