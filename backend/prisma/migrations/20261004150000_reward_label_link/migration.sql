-- AlterTable
ALTER TABLE "redemption_catalog_items" ADD COLUMN     "labelId" TEXT;

-- CreateIndex
CREATE INDEX "redemption_catalog_items_labelId_idx" ON "redemption_catalog_items"("labelId");

-- AddForeignKey
ALTER TABLE "redemption_catalog_items" ADD CONSTRAINT "redemption_catalog_items_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

