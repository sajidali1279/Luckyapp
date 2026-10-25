import cron from 'node-cron';
import { remindMissingChecks, purgeMissingRequests } from '../controllers/missingPersons.controller';

// Missing person posters (2026-10-18): HQ is reminded of each poster's 30-day check two days before, at 9 AM store time; customer requests
// nobody answered in 30 days are deleted (photo too) and the requester told.
export function startMissingCheckCron() {
  cron.schedule('0 9 * * *', () => {
    remindMissingChecks().catch((e) => console.error('[missing] check reminder failed:', e?.message ?? e));
    purgeMissingRequests().catch((e) => console.error('[missing] request clean-up failed:', e?.message ?? e));
  }, { timezone: 'America/Chicago' });
}
