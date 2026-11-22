import cron from 'node-cron';
import { sendDueReminders } from './dealTeasers';

// Coming soon deals (2026-11-22): every 5 minutes, deals that have started tell the people who tapped Remind me. Runs only while the server
// is awake (free plan); after a sleep it catches up on the first run.
export function startDealReminderCron() {
  let running = false;
  cron.schedule('*/5 * * * *', () => {
    if (running) return;
    running = true;
    sendDueReminders().catch((e) => console.error('[deal-reminders] run failed:', e?.message ?? e)).finally(() => { running = false; });
  });
}
