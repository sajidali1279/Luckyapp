/**
 * Monthly billing cron — runs on the 1st of every month at 00:05 UTC.
 * Bills each active store for LAST month's activity, using the same
 * buildBillForPeriod logic the manual "Generate Monthly Billing" admin
 * route uses — so the cron and manual paths can never disagree on what
 * a store owes.
 *
 * Safe to run multiple times — skips stores that already have a record for the period.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { BillingType } from '@prisma/client';
import { buildBillForPeriod, toPeriod } from '../controllers/billing.controller';

function lastMonthPeriod(): string {
  const now = new Date();
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return toPeriod(lastMonth);
}

export async function runMonthlyBilling() {
  const period = lastMonthPeriod();
  console.log(`[billing-cron] Running monthly billing for period ${period}…`);

  const stores = await prisma.store.findMany({ where: { isActive: true } });

  let created = 0;
  let skipped = 0;

  for (const store of stores) {
    // Idempotency — skip if already billed for this period
    const existing = await prisma.billingRecord.findFirst({
      where: { storeId: store.id, period },
    });
    if (existing) { skipped++; continue; }

    const bill = await buildBillForPeriod(store, period);
    if (!bill) { skipped++; continue; }

    await (prisma.billingRecord as any).create({
      data: {
        storeId: store.id,
        billingType: store.billingType as BillingType,
        amount: bill.amount,
        period,
        notes: JSON.stringify({ ...bill.notes, generatedBy: 'cron' }),
        isPaid: false,
      },
    });
    created++;
    console.log(`[billing-cron]   ✅ ${store.name} — $${bill.amount.toFixed(2)} (${store.billingType})`);
  }

  console.log(`[billing-cron] Done. Created: ${created}, Skipped: ${skipped}`);
}

// Schedule: 1st of every month at 00:05 UTC
export function startBillingCron() {
  cron.schedule('5 0 1 * *', runMonthlyBilling, { timezone: 'UTC' });
  console.log('[billing-cron] Monthly billing job scheduled (1st of month, 00:05 UTC)');
}
