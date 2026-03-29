-- Catalog redemption hold system
-- Status: PENDING (customer initiated, 30-min hold) | COMPLETED | EXPIRED | CANCELLED
-- Make storeId + processedById optional (null until employee confirms)

ALTER TABLE "catalog_redemptions"
  ADD COLUMN IF NOT EXISTS "status"          VARCHAR(20)  NOT NULL DEFAULT 'COMPLETED',
  ADD COLUMN IF NOT EXISTS "expiresAt"       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "redemptionCode"  VARCHAR(12)  UNIQUE,
  ALTER COLUMN "storeId"       DROP NOT NULL,
  ALTER COLUMN "processedById" DROP NOT NULL;
