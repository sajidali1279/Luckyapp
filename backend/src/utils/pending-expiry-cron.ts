// Sales the cashier never finished (2026-10-18; was "pending-sale expiry"). A cashier's sale is saved when they press Grant, before the
// receipt photo; one that never gets its photo is cancelled after HQ's minutes (Settings > Sales review, default 30): nothing was ever
// credited, so nothing is clawed back and nobody is told. Before, PENDING sales were rejected after 24 hours (with a push to the managers
// and the cashier's notes overwritten) and a held (FLAGGED) one with no photo was never cleared at all. See utils/unfinishedSales.ts.

import cron from 'node-cron';
import { cancelAbandonedSales } from './unfinishedSales';

let running = false;

export async function expireAbandonedPendingSales(now: Date = new Date()): Promise<{ expired: number }> {
  if (running) return { expired: 0 };
  running = true;
  try { return { expired: await cancelAbandonedSales(now) }; } finally { running = false; }
}

export function startPendingExpiryCron() {
  const run = async () => {
    try {
      const result = await expireAbandonedPendingSales();
      if (result.expired > 0) console.log(`[unfinished-sales] Cancelled ${result.expired} sale(s) that never got a receipt photo`);
    } catch (err) {
      console.error('[unfinished-sales] Error:', err);
    }
  };
  cron.schedule('*/5 * * * *', run);
  // A server that slept catches up as soon as it wakes
  setTimeout(run, 110_000).unref?.();
}
