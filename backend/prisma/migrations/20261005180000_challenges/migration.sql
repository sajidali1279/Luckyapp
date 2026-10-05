-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN     "challengeId" TEXT,
ADD COLUMN     "rewardForSaleId" TEXT;

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEs" TEXT,
    "description" TEXT NOT NULL DEFAULT '',
    "descriptionEs" TEXT,
    "category" "ProductCategory",
    "storeId" TEXT,
    "target" DOUBLE PRECISION NOT NULL,
    "minPurchase" DOUBLE PRECISION,
    "reward" DOUBLE PRECISION NOT NULL,
    "repeats" BOOLEAN NOT NULL DEFAULT false,
    "audience" TEXT NOT NULL DEFAULT 'EVERYONE',
    "audienceTier" "Tier",
    "audienceDays" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "announcedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_progress" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "timesEarned" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenge_progress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "challenges_isActive_endDate_idx" ON "challenges"("isActive", "endDate");

-- CreateIndex
CREATE INDEX "challenge_progress_customerId_idx" ON "challenge_progress"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_progress_challengeId_customerId_key" ON "challenge_progress"("challengeId", "customerId");

-- CreateIndex
CREATE INDEX "points_transactions_challengeId_idx" ON "points_transactions"("challengeId");

-- CreateIndex
CREATE INDEX "points_transactions_rewardForSaleId_idx" ON "points_transactions"("rewardForSaleId");

-- AddForeignKey
ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_progress" ADD CONSTRAINT "challenge_progress_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

