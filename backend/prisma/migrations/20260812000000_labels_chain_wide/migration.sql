-- DropForeignKey
ALTER TABLE "labels" DROP CONSTRAINT "labels_storeId_fkey";

-- DropIndex
DROP INDEX "labels_storeId_idx";

-- AlterTable
ALTER TABLE "labels" DROP COLUMN "storeId";
