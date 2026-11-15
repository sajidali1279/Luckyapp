-- CreateTable
CREATE TABLE "register_receipts" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "imageHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tries" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "receiptKey" TEXT,
    "receiptAt" TIMESTAMP(3),
    "total" DOUBLE PRECISION,
    "read" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "register_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "register_receipts_imageHash_key" ON "register_receipts"("imageHash");

-- CreateIndex
CREATE INDEX "register_receipts_receiptKey_idx" ON "register_receipts"("receiptKey");

-- CreateIndex
CREATE INDEX "register_receipts_status_createdAt_idx" ON "register_receipts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "register_receipts_storeId_createdAt_idx" ON "register_receipts"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "register_receipts_storeId_receiptAt_idx" ON "register_receipts"("storeId", "receiptAt");

