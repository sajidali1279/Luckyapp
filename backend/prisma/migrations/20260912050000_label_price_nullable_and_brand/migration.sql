-- Label.priceText loses its NOT NULL constraint: a Label created from a scan
-- (see ensureLabelForBarcode, backend/src/utils/labelSync.ts) starts out
-- priceless ("known product, price not set yet") until someone fills one in.
-- Widening/additive only — existing rows keep their values, nothing is dropped.
ALTER TABLE "labels" ALTER COLUMN "priceText" DROP NOT NULL;

-- Label.brand: parity with ScannedProduct.brand, carried through by the new
-- scan<->label sync in both directions.
ALTER TABLE "labels" ADD COLUMN "brand" TEXT;
