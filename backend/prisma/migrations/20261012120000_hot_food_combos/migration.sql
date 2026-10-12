-- Hot food combos: an item with a drink the customer chooses, one price (utils/hotFoodCombos.ts)
CREATE TABLE "hot_food_combos" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEs" TEXT,
    "description" TEXT,
    "catalogItemId" TEXT NOT NULL,
    "drinks" TEXT[],
    "price" DOUBLE PRECISION NOT NULL,
    "regularPrice" DOUBLE PRECISION,
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "fromTime" TEXT,
    "toTime" TEXT,
    "isFeatured" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "hot_food_combos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hot_food_combos_isActive_idx" ON "hot_food_combos"("isActive");
ALTER TABLE "hot_food_combos" ADD CONSTRAINT "hot_food_combos_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "hot_food_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "hot_food_order_items" ADD COLUMN "comboId" TEXT;
ALTER TABLE "hot_food_order_items" ADD COLUMN "drink" TEXT;
