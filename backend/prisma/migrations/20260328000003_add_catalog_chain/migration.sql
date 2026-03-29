-- Add chain (company/brand) to redemption catalog items
-- Defaults to 'Lucky Stop' for all existing items
ALTER TABLE "redemption_catalog_items"
  ADD COLUMN IF NOT EXISTS "chain" VARCHAR(100) NOT NULL DEFAULT 'Lucky Stop';
