-- Hot food menus by time and ordering ahead (2026-11-10): menus like Breakfast with their hours (and a store's own hours, set by HQ),
-- the menus each catalog item is in, and an order's pickup time and kitchen start time. New tables and nullable or defaulted columns only.

-- AlterTable
ALTER TABLE "hot_food_orders" ADD COLUMN     "pickupAt" TIMESTAMP(3),
ADD COLUMN     "startAt" TIMESTAMP(3),
ADD COLUMN     "startToldAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hot_food_catalog_items" ADD COLUMN     "daypartIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable: "Ran out" at a store, until the end of the store day
ALTER TABLE "hot_food_catalog_stores" ADD COLUMN     "soldOutUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "hot_food_dayparts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEs" TEXT,
    "fromTime" TEXT NOT NULL,
    "toTime" TEXT NOT NULL,
    "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "lastCallMinutes" INTEGER NOT NULL DEFAULT 15,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hot_food_dayparts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_food_daypart_stores" (
    "id" TEXT NOT NULL,
    "daypartId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fromTime" TEXT,
    "toTime" TEXT,
    "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isOff" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hot_food_daypart_stores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hot_food_daypart_stores_daypartId_storeId_key" ON "hot_food_daypart_stores"("daypartId", "storeId");

-- CreateIndex
CREATE INDEX "hot_food_orders_status_startAt_idx" ON "hot_food_orders"("status", "startAt");

-- AddForeignKey
ALTER TABLE "hot_food_daypart_stores" ADD CONSTRAINT "hot_food_daypart_stores_daypartId_fkey" FOREIGN KEY ("daypartId") REFERENCES "hot_food_dayparts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_food_daypart_stores" ADD CONSTRAINT "hot_food_daypart_stores_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

