-- Add apiKey to stores (printer agent authentication)
ALTER TABLE "stores" ADD COLUMN "apiKey" TEXT;
CREATE UNIQUE INDEX "stores_apiKey_key" ON "stores"("apiKey");

-- CreateTable: receipt_tokens
CREATE TABLE "receipt_tokens" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "txRef" TEXT NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "items" TEXT NOT NULL,
    "usedBy" TEXT,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "receipt_tokens_storeId_txRef_key" ON "receipt_tokens"("storeId", "txRef");
CREATE INDEX "receipt_tokens_expiresAt_idx" ON "receipt_tokens"("expiresAt");

ALTER TABLE "receipt_tokens" ADD CONSTRAINT "receipt_tokens_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: audit_logs
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorRole" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "details" TEXT,
    "storeId" TEXT,
    "storeName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");
CREATE INDEX "audit_logs_storeId_idx" ON "audit_logs"("storeId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");
