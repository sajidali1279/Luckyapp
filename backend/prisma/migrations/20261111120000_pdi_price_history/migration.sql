-- PDI price history (2026-11-11): what changed between a store's last PDI item list and the new one (prices, costs, new and gone items),
-- with counts on each upload; and the words that find a reward or a hot food item in the PDI lists (what a reward costs the store, the
-- hot food menu against the register). New table and nullable columns only.

-- AlterTable
ALTER TABLE "pdi_item_imports" ADD COLUMN "pricesUp" INTEGER,
ADD COLUMN "pricesDown" INTEGER,
ADD COLUMN "costsUp" INTEGER,
ADD COLUMN "newItems" INTEGER,
ADD COLUMN "goneItems" INTEGER;

-- AlterTable
ALTER TABLE "redemption_catalog_items" ADD COLUMN "pdiQuery" TEXT;

-- AlterTable
ALTER TABLE "hot_food_catalog_items" ADD COLUMN "pdiQuery" TEXT;

-- CreateTable
CREATE TABLE "pdi_price_changes" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "upcKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "oldPriceCents" INTEGER,
    "newPriceCents" INTEGER,
    "oldCostCents" INTEGER,
    "newCostCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdi_price_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pdi_price_changes_storeId_createdAt_idx" ON "pdi_price_changes"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "pdi_price_changes_importId_idx" ON "pdi_price_changes"("importId");

-- CreateIndex
CREATE INDEX "pdi_price_changes_upcKey_idx" ON "pdi_price_changes"("upcKey");

-- AddForeignKey
ALTER TABLE "pdi_price_changes" ADD CONSTRAINT "pdi_price_changes_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdi_price_changes" ADD CONSTRAINT "pdi_price_changes_importId_fkey" FOREIGN KEY ("importId") REFERENCES "pdi_item_imports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
