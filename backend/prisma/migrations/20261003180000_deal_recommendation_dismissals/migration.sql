-- CreateTable
CREATE TABLE "deal_recommendation_dismissals" (
    "key" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "dismissedById" TEXT NOT NULL,
    "dismissedByName" TEXT,
    "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_recommendation_dismissals_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "deal_recommendation_dismissals_labelId_idx" ON "deal_recommendation_dismissals"("labelId");

