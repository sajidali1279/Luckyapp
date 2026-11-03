-- Invoices to PDI (2026-11-03): the UPC of each vendor item code, learned from the files people download, so vendors that print only their
-- own item codes (no UPC) need a UPC typed once per product instead of on every invoice. A new table only; nothing else changes.

-- CreateTable
CREATE TABLE "pdi_product_upcs" (
    "vendorId" TEXT NOT NULL,
    "itemKey" TEXT NOT NULL,
    "upc" TEXT NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdi_product_upcs_pkey" PRIMARY KEY ("vendorId","itemKey")
);

-- AddForeignKey
ALTER TABLE "pdi_product_upcs" ADD CONSTRAINT "pdi_product_upcs_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "pdi_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
