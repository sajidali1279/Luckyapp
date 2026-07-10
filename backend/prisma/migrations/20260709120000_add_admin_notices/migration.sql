-- CreateTable
CREATE TABLE "admin_notices" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "storeId" TEXT,
    "createdById" TEXT NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "admin_notices_isActive_endDate_idx" ON "admin_notices"("isActive", "endDate");

-- CreateIndex
CREATE INDEX "admin_notices_storeId_idx" ON "admin_notices"("storeId");

-- AddForeignKey
ALTER TABLE "admin_notices" ADD CONSTRAINT "admin_notices_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_notices" ADD CONSTRAINT "admin_notices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
