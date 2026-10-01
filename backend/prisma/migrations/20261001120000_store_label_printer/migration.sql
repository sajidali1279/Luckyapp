-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "labelNudgeDown" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "labelNudgeRight" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "labelNudgeUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "labelNudgeUpdatedBy" TEXT;

