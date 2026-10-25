-- Receipt cards (2026-10-13): how a scanned receipt was paid, the card brand and its last 4 digits
ALTER TABLE "receipt_scans" ADD COLUMN "paymentMethod" TEXT;
ALTER TABLE "receipt_scans" ADD COLUMN "cardLast4" TEXT;
ALTER TABLE "receipt_scans" ADD COLUMN "cardBrand" TEXT;
CREATE INDEX "receipt_scans_cardLast4_idx" ON "receipt_scans"("cardLast4");
