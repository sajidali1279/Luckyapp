/**
 * Monthly billing job. Bills each active store for the last FINISHED month on the store calendar (Central time), using the same
 * buildBillForPeriod logic the manual "Generate" route uses, so the job and the page can never disagree on what a store owes.
 *
 * It runs at :05 past every hour (UTC) and once a minute after the server starts, and it is safe to run any number of times: a store
 * that already has its usage bill for the month is skipped (an extra charge does not count as a bill). That means the September
 * bills are made by the first run after midnight on October 1 in Texas, even if the server was asleep at that hour, and nothing is
 * ever created twice. It never deletes or changes an existing bill.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { BillingType } from '@prisma/client';
import { buildBillForPeriod } from '../controllers/billing.controller';
import { lastFinishedPeriod, periodLabel } from './billingPeriods';
import { audit } from './audit';

let running = false; // two runs at once would race to create the same bill

export async function runMonthlyBilling(now: Date = new Date()) {
  if (running) return;
  running = true;
  try {
    const period = lastFinishedPeriod(now);
    const stores = await prisma.store.findMany({ where: { isActive: true } });

    let created = 0;
    let alreadyBilled = 0;
    let nothingToBill = 0;

    for (const store of stores) {
      // Idempotency: skip if this store already has its USAGE bill for the period (an extra charge is not a usage bill)
      const existing = await prisma.billingRecord.findFirst({
        where: { storeId: store.id, period, billingType: { not: BillingType.CUSTOM } },
      });
      if (existing) { alreadyBilled++; continue; }

      const bill = await buildBillForPeriod(store, period);
      if (!bill) { nothingToBill++; continue; }

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
      console.log(`[billing-cron]   made ${store.name}: $${bill.amount.toFixed(2)} (${store.billingType}) for ${period}`);
    }

    if (created > 0) {
      console.log(`[billing-cron] ${periodLabel(period)}: made ${created} bill(s), ${alreadyBilled} already existed, ${nothingToBill} had nothing to bill`);
      audit({
        actorId: 'system', actorName: 'Monthly billing job (automatic)', actorRole: 'DEV_ADMIN',
        action: 'BILLING_GENERATE', entity: 'billing', entityId: period,
        details: { period, created, alreadyBilled, nothingToBill, source: 'cron' },
      });
    }
  } finally {
    running = false;
  }
}

export function startBillingCron() {
  cron.schedule('5 * * * *', () => {
    runMonthlyBilling().catch((e) => console.error('[billing-cron] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  // Catch-up after a restart or a sleep: if last month has no bills yet, make them now
  setTimeout(() => {
    runMonthlyBilling().catch((e) => console.error('[billing-cron] start-up run failed:', e?.message ?? e));
  }, 60_000);
  console.log('[billing-cron] Monthly billing job scheduled (every hour at :05 UTC, idempotent; also once after start-up)');
}
