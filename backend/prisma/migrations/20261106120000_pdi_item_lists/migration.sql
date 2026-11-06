-- Invoices to PDI (2026-11-06): each store's item list as PDI knows it, uploaded by HQ from PDI's "Current inventory by item" report,
-- so every invoice UPC is checked against what PDI will accept, and a line with no UPC can find its item by name. New tables only.

-- CreateTable
CREATE TABLE "pdi_items" (
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "upcKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT,
    "vendor" TEXT,
    "costCents" INTEGER,
    "priceCents" INTEGER,

    CONSTRAINT "pdi_items_pkey" PRIMARY KEY ("storeId","code")
);

-- CreateTable
CREATE TABLE "pdi_item_imports" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fileName" TEXT,
    "items" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pdi_item_imports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pdi_items_storeId_upcKey_idx" ON "pdi_items"("storeId", "upcKey");

-- CreateIndex
CREATE INDEX "pdi_item_imports_storeId_createdAt_idx" ON "pdi_item_imports"("storeId", "createdAt");

-- AddForeignKey
ALTER TABLE "pdi_items" ADD CONSTRAINT "pdi_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pdi_item_imports" ADD CONSTRAINT "pdi_item_imports_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
