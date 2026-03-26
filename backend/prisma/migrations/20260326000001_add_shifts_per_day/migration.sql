-- AlterTable: add shiftsPerDay column to stores (default 3)
ALTER TABLE "stores" ADD COLUMN "shiftsPerDay" INTEGER NOT NULL DEFAULT 3;
