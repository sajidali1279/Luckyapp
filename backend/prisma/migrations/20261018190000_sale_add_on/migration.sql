-- A receipt the customer left behind, added to their sale from the cashier's Recent tab (2026-10-18)
-- AlterTable
ALTER TABLE "points_transactions" ADD COLUMN     "addOn" BOOLEAN NOT NULL DEFAULT false;
