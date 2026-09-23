/**
 * Monthly billing job. Bills each active store for the last FINISHED month on the store calendar (Central time), using the same
 * buildBillForPeriod logic the manual "Generate" route uses, so the job and the page can never disagree on what a store owes.
 *
 * It runs at :05 past every hour (UTC) and once a minute after the server starts, and it is safe to run any number of times: a store
 * that already has its usage bill for the month is skipped (an extra charge does not count as a bill). That means the September
 * bills are made by the first run after midnight on October 1 in Texas, even if the server was asleep at that hour, and nothing is
 * ever created twice. It never deletes or changes an existing bill.
 *
 * Two things added in batch B3 "Reach":
 *  - A heartbeat: every tick (not only one that creates bills) records when it last ran, in AppConfig (a
 *    plain key/value row, no schema change needed) - GET /billing/heartbeat reads it back so HQ can see
 *    the job is actually alive, distinct from asking "did last month get billed" (a $0 month with no
 *    sales is a legitimate, not a failure).
 *  - A quiet per-store invoice email the moment a bill is made, to that store's own Super Admin(s) - see
 *    notifyNewBills(). This is NOT the existing manual "Notify Super Admin" button (Billing.tsx), which
 *    resends every record in a period, paid ones included, on demand.
 */
import cron from 'node-cron';
import prisma from '../config/prisma';
import { BillingType, Role } from '@prisma/client';
import { buildBillForPeriod, BILLING_HEARTBEAT_KEY } from '../controllers/billing.controller';
import { lastFinishedPeriod, periodLabel } from './billingPeriods';
import { audit } from './audit';
import { sendBillingInvoiceEmail } from './email';

let running = false; // two runs at once would race to create the same bill

async function recordHeartbeat(at: Date) {
  try {
    await prisma.appConfig.upsert({
      where: { key: BILLING_HEARTBEAT_KEY },
      update: { value: at.toISOString() },
      create: { key: BILLING_HEARTBEAT_KEY, value: at.toISOString() },
    });
  } catch (e) {
    // A heartbeat write failing must never stop real bills from being made
    console.error('[billing-cron] heartbeat write failed:', (e as Error).message);
  }
}

export async function runMonthlyBilling(now: Date = new Date()) {
  if (running) return;
  running = true;
  try {
    await recordHeartbeat(now);

    const period = lastFinishedPeriod(now);
    const stores = await prisma.store.findMany({ where: { isActive: true } });

    let alreadyBilled = 0;
    let nothingToBill = 0;
    const createdBills: { storeId: string; storeName: string; amount: number }[] = [];

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
      createdBills.push({ storeId: store.id, storeName: store.name, amount: bill.amount });
      console.log(`[billing-cron]   made ${store.name}: $${bill.amount.toFixed(2)} (${store.billingType}) for ${period}`);
    }

    if (createdBills.length > 0) {
      console.log(`[billing-cron] ${periodLabel(period)}: made ${createdBills.length} bill(s), ${alreadyBilled} already existed, ${nothingToBill} had nothing to bill`);
      audit({
        actorId: 'system', actorName: 'Monthly billing job (automatic)', actorRole: 'DEV_ADMIN',
        action: 'BILLING_GENERATE', entity: 'billing', entityId: period,
        details: { period, created: createdBills.length, alreadyBilled, nothingToBill, source: 'cron' },
      });
      await notifyNewBills(period, createdBills);
    }
  } finally {
    running = false;
  }
}

async function notifyNewBills(period: string, bills: { storeId: string; storeName: string; amount: number }[]) {
  const storeIds = bills.map((b) => b.storeId);
  const links = await prisma.userStoreRole.findMany({
    where: { storeId: { in: storeIds }, user: { role: Role.SUPER_ADMIN, isActive: true, email: { not: null } } },
    select: { storeId: true, user: { select: { email: true } } },
  });
  const emailsByStore = new Map<string, Set<string>>();
  for (const link of links) {
    if (!link.user.email) continue;
    if (!emailsByStore.has(link.storeId)) emailsByStore.set(link.storeId, new Set());
    emailsByStore.get(link.storeId)!.add(link.user.email);
  }
  for (const bill of bills) {
    for (const email of emailsByStore.get(bill.storeId) ?? []) {
      sendBillingInvoiceEmail(email, { period, storeName: bill.storeName, amount: bill.amount, isPaid: false }).catch(() => {});
    }
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
