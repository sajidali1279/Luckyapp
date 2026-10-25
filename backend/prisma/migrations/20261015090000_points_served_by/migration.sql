-- Grant & Redeem for HQ (2026-10-15): the employee who served the customer when HQ entered the sale for them from photos
ALTER TABLE "points_transactions" ADD COLUMN "servedById" TEXT;
CREATE INDEX "points_transactions_servedById_idx" ON "points_transactions"("servedById");
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_servedById_fkey" FOREIGN KEY ("servedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
