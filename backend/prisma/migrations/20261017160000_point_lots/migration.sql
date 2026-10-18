-- Points expiry (2026-10-17): every credit is a batch with its own date; spending takes the oldest first. See utils/pointLots.ts.
-- CreateTable
CREATE TABLE "point_lots" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remaining" DOUBLE PRECISION NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "expiredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expiredAt" TIMESTAMP(3),
    "expiryUndoneAt" TIMESTAMP(3),
    "removedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "warnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_lots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_lot_uses" (
    "id" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT,
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_lot_uses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "point_lots_userId_earnedAt_idx" ON "point_lots"("userId", "earnedAt");

-- CreateIndex
CREATE INDEX "point_lots_remaining_earnedAt_idx" ON "point_lots"("remaining", "earnedAt");

-- CreateIndex
CREATE INDEX "point_lots_sourceId_idx" ON "point_lots"("sourceId");

-- CreateIndex
CREATE INDEX "point_lot_uses_userId_refType_refId_idx" ON "point_lot_uses"("userId", "refType", "refId");

-- CreateIndex
CREATE INDEX "point_lot_uses_lotId_idx" ON "point_lot_uses"("lotId");

-- AddForeignKey
ALTER TABLE "point_lots" ADD CONSTRAINT "point_lots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_lot_uses" ADD CONSTRAINT "point_lot_uses_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "point_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_lot_uses" ADD CONSTRAINT "point_lot_uses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- What customers have today becomes one starting batch each. Nothing expires until HQ switches expiry on, and the clock of every batch
-- starts no earlier than that day, so these get the full number of days from then.
INSERT INTO "point_lots" ("id", "userId", "amount", "remaining", "earnedAt", "source", "createdAt")
SELECT gen_random_uuid()::text, "id", ROUND("pointsBalance"::numeric, 2)::double precision, ROUND("pointsBalance"::numeric, 2)::double precision,
       CURRENT_TIMESTAMP, 'OPENING', CURRENT_TIMESTAMP
FROM "users"
WHERE "role" = 'CUSTOMER' AND "pointsBalance" > 0;
