-- CreateTable
CREATE TABLE "hq_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,

    CONSTRAINT "hq_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hq_sessions_userId_endedAt_idx" ON "hq_sessions"("userId", "endedAt");

-- CreateIndex
CREATE INDEX "hq_sessions_endedAt_lastSeenAt_idx" ON "hq_sessions"("endedAt", "lastSeenAt");
