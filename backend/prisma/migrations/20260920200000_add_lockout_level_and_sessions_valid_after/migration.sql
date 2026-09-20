-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lockoutLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "sessionsValidAfter" TIMESTAMP(3);
