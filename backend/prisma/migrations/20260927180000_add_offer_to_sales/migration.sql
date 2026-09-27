-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN     "offerCashback" DOUBLE PRECISION,
ADD COLUMN     "offerId" TEXT;

-- CreateIndex
CREATE INDEX "points_transactions_offerId_idx" ON "points_transactions"("offerId");

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

