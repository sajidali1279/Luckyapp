-- Add category to redemption catalog items
-- Supports: IN_STORE, GAS, HOT_FOODS
ALTER TABLE "redemption_catalog_items"
  ADD COLUMN IF NOT EXISTS "category" VARCHAR(50) NOT NULL DEFAULT 'IN_STORE';
