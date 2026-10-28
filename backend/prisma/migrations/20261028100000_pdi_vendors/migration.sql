-- Invoices to PDI by vendor (2026-10-28): the vendor is read off the invoice and matched by its names, not picked from a list (the owner:
-- there will be many vendors). Each vendor's PDI code and rules are kept once in pdi_vendors; the three vendors confirmed so far come
-- with their rules and the notes on their layouts the reader had in code. Invoices and remembered units per case move from the PDI code
-- to the vendor.

-- CreateTable
CREATE TABLE "pdi_vendors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pdiCode" TEXT,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sellsBy" TEXT NOT NULL DEFAULT 'CASE',
    "itemDigits" TEXT NOT NULL DEFAULT 'FIRST6',
    "itemLength" INTEGER,
    "readerNotes" TEXT,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pdi_vendors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pdi_vendors_pdiCode_key" ON "pdi_vendors"("pdiCode");

-- The three vendors confirmed with the owner (Frito-Lay, Ed F. Davis, PepsiCo)
INSERT INTO "pdi_vendors" ("id", "name", "pdiCode", "aliases", "sellsBy", "itemDigits", "itemLength", "readerNotes", "updatedAt") VALUES
  ('f1a0c000-0000-4000-8000-000000000001', 'Frito-Lay', 'FRITO', ARRAY['ROLLING FRITO LAY SALES', 'FRITOLAY']::TEXT[], 'EACH', 'FIRST6', 8, 'Route invoice from a thermal printer. INVOICE # is the invoice number; DATE (like 01 Aug 2026) is the date; TOTAL DUE is the total. Columns: QTY EACH is the quantity (single items); UPC holds only the last digits of the UPC, under a line MANUFACTURER: 28400 FRITOLAY (give 28400 as manufacturer on every line under it); DESCRIPTION; ITEM is 8 digits, on some rows printed on the row below next to case-pack text such as 1 5REG (not part of it); EACH COST is the price (4 decimals, like 1.9500); TOTAL AMOUNT is the amount. Rows under **RETURNS** are returns. summary.units is TOTAL EXTENDED EACHES SOLD.', CURRENT_TIMESTAMP),
  ('f1a0c000-0000-4000-8000-000000000002', 'Ed F. Davis', 'EFDINC', ARRAY[]::TEXT[], 'CASE', 'FIRST6', 6, 'Beer invoice in dot-matrix print. Invoice is the invoice number; the year of the Date may be cut off (08/04/202): give the full date you can tell and say so in unreadable; Total Sale is the total. Columns: ID is the item, QTY the quantity (cases), PRODUCT the description, UPC (like 0-18200-20038-0), then PRICE, DEP, DISC, NET (the price) and TOTAL (the amount). A long product name can run into the UPC column: BDL CHELADA 24/12oz. 2/10-18200-20351-0 is the product BDL CHELADA 24/12oz. 2/1 and the UPC 0-18200-20351-0; the UPC is always the last 0-00000-00000-0 group right before the price. summary.cases is the number printed after Totals.', CURRENT_TIMESTAMP),
  ('f1a0c000-0000-4000-8000-000000000003', 'PepsiCo', 'PEPSIC', ARRAY['PEPSICO BEVERAGES', 'PEPSI']::TEXT[], 'CASE', 'NONE', NULL, 'Thermal invoice. INVOICE # is the invoice number (a leading digit may be faint); the date is like 08/19/2026; Amount Due is the total. Items are grouped under bold package headers such as 11OZ PL 1/12 TBG or 5G BIB (the group), each group ending with SUBTOTAL cases units amount. Each item takes two printed lines: DESCRIPTION UPC, then Whlsl Cases Units Net Amount (for example 33.00 1 12 25.15 25.15; units and net can print run together, like 1225.15: units 12, net 25.15). quantity is Cases, units is Units, price is Net. summary.cases and summary.units are Cases and Total Units in the SALES SUMMARY near the top.', CURRENT_TIMESTAMP);

-- Invoices: from the PDI code to the vendor
ALTER TABLE "pdi_invoices" ADD COLUMN "vendorId" TEXT,
ADD COLUMN "vendorRead" TEXT;
UPDATE "pdi_invoices" i SET "vendorId" = v."id", "vendorRead" = v."name" FROM "pdi_vendors" v WHERE v."pdiCode" = i."supplier";
DROP INDEX "pdi_invoices_supplier_invoiceNumber_idx";
ALTER TABLE "pdi_invoices" DROP COLUMN "supplier";
CREATE INDEX "pdi_invoices_vendorId_invoiceNumber_idx" ON "pdi_invoices"("vendorId", "invoiceNumber");
ALTER TABLE "pdi_invoices" ADD CONSTRAINT "pdi_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "pdi_vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Units per case: from the PDI code to the vendor (a row for a code no vendor has cannot be kept)
ALTER TABLE "pdi_product_units" ADD COLUMN "vendorId" TEXT;
UPDATE "pdi_product_units" u SET "vendorId" = v."id" FROM "pdi_vendors" v WHERE v."pdiCode" = u."supplier";
DELETE FROM "pdi_product_units" WHERE "vendorId" IS NULL;
ALTER TABLE "pdi_product_units" DROP CONSTRAINT "pdi_product_units_pkey";
ALTER TABLE "pdi_product_units" DROP COLUMN "supplier";
ALTER TABLE "pdi_product_units" ALTER COLUMN "vendorId" SET NOT NULL;
ALTER TABLE "pdi_product_units" ADD CONSTRAINT "pdi_product_units_pkey" PRIMARY KEY ("vendorId", "upc");
ALTER TABLE "pdi_product_units" ADD CONSTRAINT "pdi_product_units_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "pdi_vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
