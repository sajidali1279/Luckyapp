-- Add cashbackRate column to points_transactions (was in schema but missing from init migration)
ALTER TABLE "points_transactions" ADD COLUMN IF NOT EXISTS "cashbackRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05;

-- Create category_rates table (DevAdmin-configurable per-category cashback rates)
CREATE TABLE IF NOT EXISTS "category_rates" (
    "category" "ProductCategory" NOT NULL,
    "cashbackRate" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "category_rates_pkey" PRIMARY KEY ("category")
);

-- Create app_config table (key-value store for platform settings like DEV_CUT_RATE)
CREATE TABLE IF NOT EXISTS "app_config" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);

-- Create credit_redemptions table (tracks when customers redeem credits in-store)
CREATE TABLE IF NOT EXISTS "credit_redemptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "devCut" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "processedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "credit_redemptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "credit_redemptions_customerId_idx" ON "credit_redemptions"("customerId");
CREATE INDEX IF NOT EXISTS "credit_redemptions_createdAt_idx" ON "credit_redemptions"("createdAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_redemptions_customerId_fkey') THEN
    ALTER TABLE "credit_redemptions" ADD CONSTRAINT "credit_redemptions_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_redemptions_storeId_fkey') THEN
    ALTER TABLE "credit_redemptions" ADD CONSTRAINT "credit_redemptions_storeId_fkey"
      FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'credit_redemptions_processedBy_fkey') THEN
    ALTER TABLE "credit_redemptions" ADD CONSTRAINT "credit_redemptions_processedBy_fkey"
      FOREIGN KEY ("processedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
