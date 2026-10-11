-- Where a staff member is working: one row per check-in (utils/staffCheckIn.ts). No coordinates are stored.
CREATE TABLE "staff_check_ins" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeDay" TEXT NOT NULL,
    "scheduledStoreId" TEXT,
    "method" TEXT NOT NULL,
    "distanceFeet" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "staff_check_ins_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "staff_check_ins_userId_storeDay_idx" ON "staff_check_ins"("userId", "storeDay");
CREATE INDEX "staff_check_ins_storeId_storeDay_idx" ON "staff_check_ins"("storeId", "storeDay");
ALTER TABLE "staff_check_ins" ADD CONSTRAINT "staff_check_ins_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_check_ins" ADD CONSTRAINT "staff_check_ins_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
