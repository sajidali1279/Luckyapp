-- CreateEnum
CREATE TYPE "NoticePriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "NoticeAudience" AS ENUM ('ALL_STAFF', 'MANAGERS', 'EMPLOYEES');

-- AlterTable
ALTER TABLE "admin_notices" ADD COLUMN     "announcedAt" TIMESTAMP(3),
ADD COLUMN     "announcedTo" INTEGER,
ADD COLUMN     "audience" "NoticeAudience" NOT NULL DEFAULT 'ALL_STAFF',
ADD COLUMN     "notify" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "priority" "NoticePriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "storeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedById" TEXT;

-- CreateIndex
CREATE INDEX "admin_notices_isActive_startDate_idx" ON "admin_notices"("isActive", "startDate");


-- Existing notices: their one store becomes the store list, they started when they were posted,
-- and they count as announced already (the new job must not push notices that went up before it existed)
UPDATE "admin_notices" SET "storeIds" = ARRAY["storeId"] WHERE "storeId" IS NOT NULL;
UPDATE "admin_notices" SET "startDate" = "createdAt", "announcedAt" = "createdAt";
