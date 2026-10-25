-- Hot food catalog items carry a category; the customer menu is grouped by it
ALTER TABLE "hot_food_catalog_items" ADD COLUMN "category" TEXT;
