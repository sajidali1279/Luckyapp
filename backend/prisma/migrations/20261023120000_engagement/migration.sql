-- CreateTable
CREATE TABLE "engagement_events" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "points" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_goals" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "title" TEXT NOT NULL,
    "titleEs" TEXT,
    "metric" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "rewardPoints" INTEGER NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "paidAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gas_alerts" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "fuel" TEXT NOT NULL,
    "maxPrice" DOUBLE PRECISION NOT NULL,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gas_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engagement_events_kind_createdAt_idx" ON "engagement_events"("kind", "createdAt");

-- CreateIndex
CREATE INDEX "engagement_events_customerId_createdAt_idx" ON "engagement_events"("customerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "engagement_events_customerId_kind_key_key" ON "engagement_events"("customerId", "kind", "key");

-- CreateIndex
CREATE INDEX "store_goals_isActive_endDate_idx" ON "store_goals"("isActive", "endDate");

-- CreateIndex
CREATE INDEX "gas_alerts_storeId_fuel_idx" ON "gas_alerts"("storeId", "fuel");

-- CreateIndex
CREATE UNIQUE INDEX "gas_alerts_customerId_storeId_fuel_key" ON "gas_alerts"("customerId", "storeId", "fuel");

