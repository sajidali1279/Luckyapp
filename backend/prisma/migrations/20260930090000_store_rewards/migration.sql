-- AlterTable
ALTER TABLE "redemption_catalog_items" ADD COLUMN     "storeId" TEXT;

-- CreateIndex
CREATE INDEX "redemption_catalog_items_storeId_idx" ON "redemption_catalog_items"("storeId");

-- AddForeignKey
ALTER TABLE "redemption_catalog_items" ADD CONSTRAINT "redemption_catalog_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

