import cron from 'node-cron';
import prisma from '../config/prisma';
import cloudinary from '../config/cloudinary';

// Receipt photos are kept for 2 years from the sale (2026-10-10), as the Privacy Policy and the Data Processing Agreement say; then the
// photo is deleted from Cloudinary and the sale keeps everything else. Its fingerprint (receiptImageHash) stays, so the same photo still
// cannot be used for another sale. A photo on a sale with a missing-points report still open is kept until the report is decided.
// Runs daily; a run handles at most MAX_PER_RUN photos, so a backlog is worked through over a few nights.
export const RECEIPT_RETENTION_DAYS = Number(process.env.RECEIPT_RETENTION_DAYS) > 0 ? Number(process.env.RECEIPT_RETENTION_DAYS) : 730;
const BATCH = 100;
const MAX_PER_RUN = 2000;

/** "https://res.cloudinary.com/x/image/upload/v1712/luckystop/receipts/abc.jpg" is "luckystop/receipts/abc". */
export function cloudinaryPublicId(url: string): string | null {
  const m = url.match(/\/image\/upload\/(?:[^/]+\/)*?(?:v\d+\/)?(luckystop\/receipts\/[^.?#]+)(?:\.[a-z0-9]+)?(?:[?#].*)?$/i);
  return m ? m[1] : null;
}

type Destroy = (publicId: string) => Promise<{ result?: string }>;

export async function purgeOldReceipts(now: Date = new Date(), destroy: Destroy = (id) => cloudinary.uploader.destroy(id, { resource_type: 'image', invalidate: true })) {
  const cutoff = new Date(now.getTime() - RECEIPT_RETENTION_DAYS * 86_400_000);
  let removed = 0, failed = 0, done = 0;
  const skipIds: string[] = [];   // ones that could not be deleted this run: not asked again until tomorrow
  while (done < MAX_PER_RUN) {
    const rows = await prisma.pointsTransaction.findMany({
      where: { receiptImageUrl: { not: null }, createdAt: { lt: cutoff }, disputes: { none: { status: 'PENDING' } }, ...(skipIds.length ? { id: { notIn: skipIds } } : {}) },
      select: { id: true, receiptImageUrl: true },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (rows.length === 0) break;
    const cleared: string[] = [];
    for (const r of rows) {
      const publicId = cloudinaryPublicId(r.receiptImageUrl!);
      try {
        // A URL that is not one of our receipt uploads has no photo of ours to delete: only the link is cleared
        if (publicId) {
          const out = await destroy(publicId);
          if (out?.result !== 'ok' && out?.result !== 'not found') throw new Error(`Cloudinary said ${out?.result}`);
        }
        cleared.push(r.id);
      } catch (e) {
        failed++; skipIds.push(r.id);
        console.error('[receipt-retention] could not delete', r.id, (e as Error).message);
      }
    }
    if (cleared.length) {
      const res = await prisma.pointsTransaction.updateMany({ where: { id: { in: cleared } }, data: { receiptImageUrl: null } });
      removed += res.count;
    }
    done += rows.length;
  }
  if (removed || failed) console.log(`[receipt-retention] ${removed} receipt photo(s) older than ${RECEIPT_RETENTION_DAYS} days deleted${failed ? `, ${failed} to retry tomorrow` : ''}`);
  return { removed, failed };
}

export function startReceiptRetentionCron() {
  cron.schedule('30 3 * * *', () => { purgeOldReceipts().catch((err) => console.error('[receipt-retention] Error:', err)); }, { timezone: 'UTC' });
}
