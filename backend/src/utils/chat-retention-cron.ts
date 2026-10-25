import cron from 'node-cron';
import prisma from '../config/prisma';
import { destroyAttachments } from './chatAttachments';

// Store chat is kept 3 months (2026-10-17, HQ's decision; the staff privacy notice says so). Before this nothing deleted it, while the
// notice promised 6 months. Runs once a day and permanently deletes messages sent more than 90 days ago, and (since 2026-10-24) their photos and
// PDFs from Cloudinary too; who read what (chat_reads) is a single "last read" time per person and store and stays.
export const CHAT_KEEP_DAYS = 90;

export async function purgeOldChat(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - CHAT_KEEP_DAYS * 24 * 60 * 60 * 1000);
  const files = (await prisma.chatMessage.findMany({ where: { createdAt: { lt: cutoff }, attachmentId: { not: null } }, select: { attachmentId: true } })).map((m) => m.attachmentId as string);
  const { count } = await prisma.chatMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  if (files.length) await destroyAttachments(files);
  if (count > 0) console.log(`[chat-retention] Deleted ${count} chat message(s) older than ${CHAT_KEEP_DAYS} days`);
  return count;
}

export function startChatRetentionCron() {
  cron.schedule('15 3 * * *', () => { purgeOldChat().catch((err) => console.error('[chat-retention] Error:', err)); }, { timezone: 'UTC' });
}
