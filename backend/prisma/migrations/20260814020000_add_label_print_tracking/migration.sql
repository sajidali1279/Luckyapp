-- AlterTable
ALTER TABLE "labels" ADD COLUMN     "createdByStoreId" TEXT,
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "printedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "labels_createdByStoreId_printedAt_idx" ON "labels"("createdByStoreId", "printedAt");
