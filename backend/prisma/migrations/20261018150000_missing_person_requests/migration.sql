-- Customer requests to post a missing person (2026-10-18); see the model comment in schema.prisma.
-- CreateTable
CREATE TABLE "missing_person_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "requesterPhone" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "age" INTEGER,
    "photoUrl" TEXT,
    "photoPublicId" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenPlace" TEXT NOT NULL,
    "description" TEXT,
    "agencyName" TEXT NOT NULL,
    "agencyPhone" TEXT,
    "caseNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "declineReason" TEXT,
    "posterId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "missing_person_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "missing_person_requests_status_createdAt_idx" ON "missing_person_requests"("status", "createdAt");

-- CreateIndex
CREATE INDEX "missing_person_requests_requesterId_createdAt_idx" ON "missing_person_requests"("requesterId", "createdAt");

