-- Scheduled/promotional pricing: a per-store price override can carry an
-- optional expiry, after which the price-expiry cron reverts it back to the
-- base price automatically, so a sale nobody remembers to end doesn't quietly
-- keep running.
ALTER TABLE "store_labels" ADD COLUMN "overrideExpiresAt" TIMESTAMP(3);

CREATE INDEX "store_labels_overrideExpiresAt_idx" ON "store_labels"("overrideExpiresAt");
