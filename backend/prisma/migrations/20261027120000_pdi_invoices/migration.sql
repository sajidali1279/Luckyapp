-- Invoices to PDI (2026-10-27): vendor invoices read from photos into the file PDI imports, and the units per case each product comes in.

-- CreateTable
CREATE TABLE "pdi_invoices" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "photoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "invoiceNumber" TEXT,
    "invoiceDate" TEXT,
    "totalCents" INTEGER,
    "paper" JSONB,
    "checked" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "readModel" TEXT,
    "readUsage" JSONB,
    "readError" TEXT,
    "readStartedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "updatedById" TEXT,
    "downloadedAt" TIMESTAMP(3),
    "downloadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdi_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pdi_product_units" (
    "supplier" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "unitsPerCase" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdi_product_units_pkey" PRIMARY KEY ("supplier","upc")
);

-- CreateIndex
CREATE INDEX "pdi_invoices_storeId_createdAt_idx" ON "pdi_invoices"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "pdi_invoices_supplier_invoiceNumber_idx" ON "pdi_invoices"("supplier", "invoiceNumber");

-- AddForeignKey
ALTER TABLE "pdi_invoices" ADD CONSTRAINT "pdi_invoices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

