// One short email to HQ each morning (Central time) with what is waiting: sales held for review, missing-points reports, store alerts, requests and
// unpaid bills. It does not depend on the server being awake at one moment: it runs every hour and once after start-up, and sends at most one per
// store day (the Activity Log entry it writes is the record), so the first run after 8 am sends it even if the server was asleep at 8:00.

import cron from 'node-cron';
import prisma from '../config/prisma';
import { audit } from './audit';
import { emailHQ } from './adminEmail';
import { STORE_TIMEZONE, storeDayStart } from './storeTime';

const HOUR_FORMAT = new Intl.DateTimeFormat('en-US', { timeZone: STORE_TIMEZONE, hour: 'numeric', hourCycle: 'h23' });

export type SummaryResult = 'sent' | 'not-yet' | 'already' | 'nothing-waiting';

export async function runMorningSummary(now: Date = new Date()): Promise<SummaryResult> {
  if (Number(HOUR_FORMAT.format(now)) < 8) return 'not-yet';
  const dayStart = storeDayStart(now);
  const done = await prisma.auditLog.findFirst({ where: { action: 'MORNING_SUMMARY', createdAt: { gte: dayStart } }, select: { id: true } });
  if (done) return 'already';

  const count = (p: Promise<number>) => p.catch(() => 0);
  const [flagged, disputes, alerts, urgentAlerts, stock, shifts, products, unpaid] = await Promise.all([
    count(prisma.pointsTransaction.count({ where: { status: 'FLAGGED' } })),
    count(prisma.pointsDispute.count({ where: { status: 'PENDING' } })),
    count(prisma.storeRequest.count({ where: { status: 'PENDING' } })),
    count(prisma.storeRequest.count({ where: { status: 'PENDING', priority: 'HIGH' } })),
    count(prisma.employeeItemRequest.count({ where: { status: 'PENDING' } })),
    count(prisma.shiftRequest.count({ where: { status: 'PENDING' } })),
    count(prisma.productRequest.count({ where: { status: 'PENDING', expiresAt: { gte: now } } })),
    count(prisma.billingRecord.count({ where: { isPaid: false } })),
  ]);

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const lines: string[] = [];
  if (flagged) lines.push(`${plural(flagged, 'sale is', 'sales are')} held for review.`);
  if (disputes) lines.push(`${plural(disputes, 'missing-points report is', 'missing-points reports are')} waiting.`);
  if (alerts) lines.push(`${plural(alerts, 'store alert is', 'store alerts are')} open${urgentAlerts ? ` (${urgentAlerts} high priority)` : ''}.`);
  if (stock) lines.push(`${plural(stock, 'stock request is', 'stock requests are')} waiting.`);
  if (products) lines.push(`${plural(products, 'product request is', 'product requests are')} waiting.`);
  if (shifts) lines.push(`${plural(shifts, 'schedule request is', 'schedule requests are')} waiting.`);
  if (unpaid) lines.push(`${plural(unpaid, 'bill is', 'bills are')} unpaid.`);
  if (lines.length === 0) return 'nothing-waiting';

  await emailHQ('Lucky Stop: what is waiting this morning', 'Good morning. This is what is waiting:', lines, { path: '/', label: 'Open the dashboard' });
  audit({
    actorId: 'system', actorName: 'Morning summary (automatic)', actorRole: 'DEV_ADMIN',
    action: 'MORNING_SUMMARY', entity: 'notification', entityId: null,
    details: { summary: lines.join(' '), flagged, disputes, alerts, urgentAlerts, stock, shifts, products, unpaid },
  });
  return 'sent';
}

export function startMorningSummaryCron() {
  cron.schedule('25 * * * *', () => {
    runMorningSummary().catch((e) => console.error('[morning-summary] run failed:', e?.message ?? e));
  }, { timezone: 'UTC' });
  setTimeout(() => {
    runMorningSummary().catch((e) => console.error('[morning-summary] start-up run failed:', e?.message ?? e));
  }, 150_000);
  console.log('[morning-summary] Morning summary email scheduled (checks every hour at :25 UTC, sends once a day after 8 am Central; also once after start-up)');
}
