import cron from 'node-cron';
import prisma from '../config/prisma';

// Run once daily — permanently delete notifications older than 30 days.
// Replaces the old manual "clear all" action with an automatic retention
// policy so nobody's inbox grows forever and nobody has to remember to clear it.
export function startNotificationRetentionCron() {
  cron.schedule('0 3 * * *', async () => {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const result = await prisma.userNotification.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });

      if (result.count > 0) {
        console.log(`[notification-retention] Deleted ${result.count} notification(s) older than 30 days`);
      }
    } catch (err) {
      console.error('[notification-retention] Error:', err);
    }
  }, { timezone: 'UTC' });
}
