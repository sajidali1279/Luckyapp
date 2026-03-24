-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN');
CREATE TYPE "ShiftType" AS ENUM ('OPENING', 'MIDDLE', 'CLOSING');
CREATE TYPE "ShiftRequestType" AS ENUM ('TIME_OFF', 'FILL_IN');
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- CreateTable: shift_templates
CREATE TABLE "shift_templates" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: shift_requests
CREATE TABLE "shift_requests" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "requestType" "ShiftRequestType" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "status" "RequestStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "shift_requests_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "shift_requests" ADD CONSTRAINT "shift_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Unique + Indexes
CREATE UNIQUE INDEX "shift_templates_employeeId_storeId_dayOfWeek_key" ON "shift_templates"("employeeId", "storeId", "dayOfWeek");
CREATE INDEX "shift_templates_storeId_idx" ON "shift_templates"("storeId");
CREATE INDEX "shift_templates_employeeId_idx" ON "shift_templates"("employeeId");
CREATE INDEX "shift_requests_storeId_date_idx" ON "shift_requests"("storeId", "date");
CREATE INDEX "shift_requests_employeeId_idx" ON "shift_requests"("employeeId");
