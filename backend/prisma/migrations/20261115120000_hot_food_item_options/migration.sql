-- Hot food sizes and add-ons (2026-11-14): the sizes and add-ons HQ sets on a catalog item (loaded chips: small or large bag, toppings
-- priced per size), and what the customer chose on an order line. Nullable columns only.

-- AlterTable
ALTER TABLE "hot_food_order_items" ADD COLUMN     "options" JSONB;

-- AlterTable
ALTER TABLE "hot_food_catalog_items" ADD COLUMN     "options" JSONB;

