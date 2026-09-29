-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailAlertsOff" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "previousSignInAt" TIMESTAMP(3);

