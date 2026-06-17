-- CreateTable
CREATE TABLE "daily_tasks" (
    "id" TEXT NOT NULL,
    "shift" "ShiftType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "storeId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_tasks_shift_isActive_idx" ON "daily_tasks"("shift", "isActive");

-- CreateIndex
CREATE INDEX "daily_tasks_storeId_idx" ON "daily_tasks"("storeId");

-- AddForeignKey
ALTER TABLE "daily_tasks" ADD CONSTRAINT "daily_tasks_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
