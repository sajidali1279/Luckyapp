-- AlterTable
ALTER TABLE "users" ADD COLUMN     "birthDay" INTEGER,
ADD COLUMN     "birthMonth" INTEGER;

-- AlterTable
ALTER TABLE "offers" ADD COLUMN     "audience" TEXT NOT NULL DEFAULT 'EVERYONE',
ADD COLUMN     "audienceDays" INTEGER,
ADD COLUMN     "audienceTier" "Tier",
ADD COLUMN     "budgetCap" DOUBLE PRECISION,
ADD COLUMN     "budgetReachedAt" TIMESTAMP(3),
ADD COLUMN     "dailyCapPerCustomer" DOUBLE PRECISION;

