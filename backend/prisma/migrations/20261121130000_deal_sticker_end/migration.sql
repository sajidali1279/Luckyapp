-- AlterTable
ALTER TABLE "deal_stickers" ADD COLUMN     "endsOn" TEXT,
ADD COLUMN     "showEnd" BOOLEAN NOT NULL DEFAULT true;
