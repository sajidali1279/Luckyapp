import cron from 'node-cron';
import { closeInactiveHqSessions } from './hqPresence';

// HQ presence (2026-11-21): every 5 minutes, a Super Admin with no HQ signal for 30 minutes is marked inactive and the Dev Admin emailed.
// Runs only while the server is awake (free plan); after a sleep it catches up on the first run.
export function startHqPresenceCron() {
  cron.schedule('*/5 * * * *', () => {
    closeInactiveHqSessions().catch((e) => console.error('[hq-presence] inactive check failed:', e?.message ?? e));
  });
}
