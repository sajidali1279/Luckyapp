-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'VOIDED';

-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT,
ADD COLUMN     "voidReason" TEXT;
