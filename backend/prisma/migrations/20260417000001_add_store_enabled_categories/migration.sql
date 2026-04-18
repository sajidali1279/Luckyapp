ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "enabledCategories" "ProductCategory"[] NOT NULL DEFAULT '{}';
