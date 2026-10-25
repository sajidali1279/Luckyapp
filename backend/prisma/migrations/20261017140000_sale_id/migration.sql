-- The lines of one sale share a sale id (the id of its first line), so HQ sees a multi-item sale as one sale.
ALTER TABLE "points_transactions" ADD COLUMN "saleId" TEXT;
CREATE INDEX "points_transactions_saleId_idx" ON "points_transactions"("saleId");
