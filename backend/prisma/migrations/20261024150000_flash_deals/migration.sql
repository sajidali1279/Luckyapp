-- Flash deals (2026-10-24): HQ's short, time-boxed messages with a once-only push and a Home countdown (admin > Engagement).
-- CreateTable
CREATE TABLE "flash_deals" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEs" TEXT,
    "body" TEXT NOT NULL,
    "bodyEs" TEXT,
    "link" TEXT NOT NULL DEFAULT 'NONE',
    "audience" TEXT NOT NULL DEFAULT 'ALL',
    "storeId" TEXT,
    "tier" "Tier",
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "announcedAt" TIMESTAMP(3),
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "cancelledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flash_deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "flash_deals_startsAt_endsAt_idx" ON "flash_deals"("startsAt", "endsAt");

