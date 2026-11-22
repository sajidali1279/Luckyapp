-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "teaseFrom" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "hot_food_combos" ADD COLUMN     "startsAt" TIMESTAMP(3),
ADD COLUMN     "teaseFrom" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "deal_reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "deal_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_reminders_kind_dealId_sentAt_idx" ON "deal_reminders"("kind", "dealId", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_reminders_userId_kind_dealId_key" ON "deal_reminders"("userId", "kind", "dealId");
