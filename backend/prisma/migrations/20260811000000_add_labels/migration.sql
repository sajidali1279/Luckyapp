-- CreateEnum
CREATE TYPE "LabelTemplate" AS ENUM ('CLASSIC_RED_BLACK');

-- CreateTable
CREATE TABLE "labels" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "priceText" TEXT NOT NULL,
    "template" "LabelTemplate" NOT NULL DEFAULT 'CLASSIC_RED_BLACK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "labels_storeId_idx" ON "labels"("storeId");

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
