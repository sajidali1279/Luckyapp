-- Customer receipt photos read by AI (testing; utils/receiptScan.ts)
CREATE TABLE "receipt_scans" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT,
    "imageUrl" TEXT,
    "imageHash" TEXT NOT NULL,
    "receiptKey" TEXT,
    "receiptAt" TIMESTAMP(3),
    "total" DOUBLE PRECISION,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "flags" TEXT,
    "read" JSONB,
    "transactionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "receipt_scans_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "receipt_scans_imageHash_key" ON "receipt_scans"("imageHash");
CREATE UNIQUE INDEX "receipt_scans_receiptKey_key" ON "receipt_scans"("receiptKey");
CREATE INDEX "receipt_scans_customerId_createdAt_idx" ON "receipt_scans"("customerId", "createdAt");
CREATE INDEX "receipt_scans_status_createdAt_idx" ON "receipt_scans"("status", "createdAt");
ALTER TABLE "receipt_scans" ADD CONSTRAINT "receipt_scans_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "receipt_scans" ADD CONSTRAINT "receipt_scans_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
