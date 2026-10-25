-- The lines of one multi-item sale share their receipt photo, so the photo fingerprint cannot be unique: the unique index refused the
-- second line's upload ("That already exists") and the cashier could never finish the sale. The column and its unique index were
-- added to the database outside the migrations (May 2026), so every step here is safe to run whether or not they are there.
ALTER TABLE "points_transactions" ADD COLUMN IF NOT EXISTS "receiptImageHash" TEXT;
DROP INDEX IF EXISTS "points_transactions_receiptImageHash_key";
CREATE INDEX IF NOT EXISTS "points_transactions_receiptImageHash_idx" ON "points_transactions"("receiptImageHash");
