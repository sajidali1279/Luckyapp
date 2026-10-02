-- CreateEnum
CREATE TYPE "OfferRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "happyDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "happyFrom" TEXT,
ADD COLUMN     "happyTo" TEXT,
ADD COLUMN     "lastDayRemindedAt" TIMESTAMP(3),
ADD COLUMN     "lastDayReminder" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "labels" ADD COLUMN     "dealHiddenInApp" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "offer_requests" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedByName" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" "ProductCategory",
    "bonusRate" DOUBLE PRECISION,
    "tierBonusRates" JSONB,
    "gasBonusCentsPerGallon" DOUBLE PRECISION,
    "requires21" BOOLEAN NOT NULL DEFAULT false,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "happyDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "happyFrom" TEXT,
    "happyTo" TEXT,
    "note" TEXT,
    "status" "OfferRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decidedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "offerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "offer_requests_offerId_key" ON "offer_requests"("offerId");

-- CreateIndex
CREATE INDEX "offer_requests_status_createdAt_idx" ON "offer_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "offer_requests_storeId_idx" ON "offer_requests"("storeId");

-- AddForeignKey
ALTER TABLE "offer_requests" ADD CONSTRAINT "offer_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offer_requests" ADD CONSTRAINT "offer_requests_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

