-- gen_random_uuid() is used below for the backfill's generated ids (Prisma
-- normally generates @default(uuid()) ids client-side in JS, so there's no
-- column-level DB default to fall back on for this raw-SQL insert). This
-- extension has never been enabled by a prior migration in this project —
-- CREATE EXTENSION IF NOT EXISTS is idempotent and safe even if the
-- function is already available natively (Postgres 13+ ships it in core).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- CreateTable
CREATE TABLE "store_labels" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "priceText" TEXT,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_labels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_labels_labelId_storeId_key" ON "store_labels"("labelId", "storeId");

-- CreateIndex
CREATE INDEX "store_labels_storeId_printedAt_idx" ON "store_labels"("storeId", "printedAt");

-- AddForeignKey
ALTER TABLE "store_labels" ADD CONSTRAINT "store_labels_labelId_fkey" FOREIGN KEY ("labelId") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_labels" ADD CONSTRAINT "store_labels_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every existing label created by a store gets that store's own
-- StoreLabel row, carrying over its current printedAt so nothing suddenly
-- looks unprinted. priceText is left NULL (inherit the base) — no store's
-- effective price actually changes as a result of this migration.
INSERT INTO "store_labels" ("id", "labelId", "storeId", "priceText", "printedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", "createdByStoreId", NULL, "printedAt", "createdAt", "updatedAt"
FROM "labels"
WHERE "createdByStoreId" IS NOT NULL;

-- AlterTable
ALTER TABLE "labels" DROP COLUMN "printedAt";
