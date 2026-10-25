-- Missing person posters (2026-10-18): HQ posts them from an official source; see the model's comment in schema.prisma.
-- CreateTable
CREATE TABLE "missing_persons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenPlace" TEXT NOT NULL,
    "description" TEXT,
    "descriptionEs" TEXT,
    "agencyName" TEXT NOT NULL,
    "agencyPhone" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "reviewDueAt" TIMESTAMP(3) NOT NULL,
    "reviewNotifiedAt" TIMESTAMP(3),
    "pushSentAt" TIMESTAMP(3),
    "pushCount" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "endNote" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missing_persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "missing_persons_status_reviewDueAt_idx" ON "missing_persons"("status", "reviewDueAt");

