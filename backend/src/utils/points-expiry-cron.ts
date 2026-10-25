import cron from 'node-cron';
import { expireDueLots, warnSoonExpiring } from './pointLots';

// Points expiry (2026-10-17, utils/pointLots.ts): both jobs do nothing while HQ has expiry switched off. Points that are due are taken just
// after midnight store time, and the "expire soon" push goes out at 10 AM, never in the night.
export function startPointsExpiryCron() {
  cron.schedule('30 0 * * *', () => { expireDueLots().catch((e) => console.error('[points-expiry] run failed:', e?.message ?? e)); }, { timezone: 'America/Chicago' });
  cron.schedule('0 10 * * *', () => { warnSoonExpiring().catch((e) => console.error('[points-expiry] warning failed:', e?.message ?? e)); }, { timezone: 'America/Chicago' });
  console.log('[points-expiry] Expiry 00:30 and warnings 10:00 America/Chicago (only while HQ has it switched on)');
}
