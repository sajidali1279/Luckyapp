-- AlterTable
ALTER TABLE "points_disputes" ADD COLUMN "transactionId" TEXT;

-- AddForeignKey
ALTER TABLE "points_disputes" ADD CONSTRAINT "points_disputes_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "points_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
