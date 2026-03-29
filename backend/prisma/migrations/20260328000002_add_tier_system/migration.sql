-- Add Tier enum
DO $$ BEGIN
  CREATE TYPE "Tier" AS ENUM ('BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- Add tier fields to users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tier') THEN
    ALTER TABLE "users" ADD COLUMN "tier" "Tier" NOT NULL DEFAULT 'BRONZE';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='periodPoints') THEN
    ALTER TABLE "users" ADD COLUMN "periodPoints" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='users' AND column_name='tierPeriod') THEN
    ALTER TABLE "users" ADD COLUMN "tierPeriod" TEXT NOT NULL DEFAULT '2026-H1';
  END IF;
END $$;

-- Add gas fields to points_transactions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_transactions' AND column_name='isGas') THEN
    ALTER TABLE "points_transactions" ADD COLUMN "isGas" BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_transactions' AND column_name='gasGallons') THEN
    ALTER TABLE "points_transactions" ADD COLUMN "gasGallons" DOUBLE PRECISION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_transactions' AND column_name='gasPricePerGallon') THEN
    ALTER TABLE "points_transactions" ADD COLUMN "gasPricePerGallon" DOUBLE PRECISION;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='points_transactions' AND column_name='gasBonusPoints') THEN
    ALTER TABLE "points_transactions" ADD COLUMN "gasBonusPoints" DOUBLE PRECISION NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Create redemption_catalog_items table
CREATE TABLE IF NOT EXISTS "redemption_catalog_items" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "emoji" TEXT NOT NULL DEFAULT '🎁',
    "pointsCost" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "redemption_catalog_items_pkey" PRIMARY KEY ("id")
);

-- Create catalog_redemptions table
CREATE TABLE IF NOT EXISTS "catalog_redemptions" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "storeId" TEXT NOT NULL,
    "processedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "catalog_redemptions_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "catalog_redemptions"
    ADD CONSTRAINT "catalog_redemptions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_redemptions"
    ADD CONSTRAINT "catalog_redemptions_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "redemption_catalog_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_redemptions"
    ADD CONSTRAINT "catalog_redemptions_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "catalog_redemptions"
    ADD CONSTRAINT "catalog_redemptions_processedById_fkey" FOREIGN KEY ("processedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "catalog_redemptions_customerId_idx" ON "catalog_redemptions"("customerId");

-- Create tier_benefit_claims table
CREATE TABLE IF NOT EXISTS "tier_benefit_claims" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "benefitType" TEXT NOT NULL,
    CONSTRAINT "tier_benefit_claims_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "tier_benefit_claims"
    ADD CONSTRAINT "tier_benefit_claims_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "tier_benefit_claims_userId_period_idx" ON "tier_benefit_claims"("userId", "period");
