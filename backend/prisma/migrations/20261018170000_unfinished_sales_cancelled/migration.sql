-- Unfinished sales (2026-10-18): a sale the cashier never finished (no receipt photo) becomes CANCELLED instead of waiting forever.
-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3);
