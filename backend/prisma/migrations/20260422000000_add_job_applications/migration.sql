-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('NEW', 'REVIEWED', 'INTERVIEW', 'HIRED', 'REJECTED');

-- CreateTable
CREATE TABLE "job_applications" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "position" TEXT NOT NULL,
    "storeId" TEXT,
    "availability" JSONB NOT NULL,
    "experience" TEXT,
    "message" TEXT,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'NEW',
    "reviewNotes" TEXT,
    "customerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_applications_status_idx" ON "job_applications"("status");

-- CreateIndex
CREATE INDEX "job_applications_phone_idx" ON "job_applications"("phone");

-- CreateIndex
CREATE INDEX "job_applications_createdAt_idx" ON "job_applications"("createdAt");

-- AddForeignKey
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
