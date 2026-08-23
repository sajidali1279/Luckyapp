-- Allow BillingRecord.storeId to be NULL, meaning a chain-wide charge
-- billed to the SuperAdmin/chain as a whole rather than one specific store
-- (same convention already used by admin_notices.storeId / daily_tasks.storeId).

-- DropForeignKey
ALTER TABLE "billing_records" DROP CONSTRAINT "billing_records_storeId_fkey";

-- AlterTable
ALTER TABLE "billing_records" ALTER COLUMN "storeId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
