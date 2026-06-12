-- CreateTable
CREATE TABLE "scanned_products" (
    "id" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "brand" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "scanCount" INTEGER NOT NULL DEFAULT 1,
    "lastScannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scanned_products_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "scanned_products_barcode_key" ON "scanned_products"("barcode");

-- CreateIndex
CREATE INDEX "scanned_products_barcode_idx" ON "scanned_products"("barcode");
