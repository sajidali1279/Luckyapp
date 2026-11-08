-- Business promotions (2026-11-08): who saw or tapped each promotion, once per person per store day, so a business can be shown real
-- numbers when it pays for an ad. A new table only.

-- CreateTable
CREATE TABLE "promotion_seen" (
    "promotionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_seen_pkey" PRIMARY KEY ("promotionId","userId","day","kind")
);

-- CreateIndex
CREATE INDEX "promotion_seen_promotionId_day_idx" ON "promotion_seen"("promotionId", "day");

-- AddForeignKey
ALTER TABLE "promotion_seen" ADD CONSTRAINT "promotion_seen_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "business_promotions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
