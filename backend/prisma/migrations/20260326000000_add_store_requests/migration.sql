-- CreateEnum
CREATE TYPE "StoreRequestType" AS ENUM ('LOW_STOCK', 'STORE_SUPPLIES', 'CUSTOMER_REQUESTED_PRODUCT', 'WORK_ORDER');

-- CreateEnum
CREATE TYPE "StoreRequestPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "StoreRequestStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED');

-- CreateTable
CREATE TABLE "store_requests" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "submitterName" TEXT NOT NULL,
    "submitterRole" TEXT NOT NULL,
    "type" "StoreRequestType" NOT NULL,
    "priority" "StoreRequestPriority" NOT NULL,
    "notes" TEXT,
    "status" "StoreRequestStatus" NOT NULL DEFAULT 'PENDING',
    "acknowledgedById" TEXT,
    "acknowledgerName" TEXT,
    "acknowledgerNote" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "store_requests_storeId_status_idx" ON "store_requests"("storeId", "status");

-- CreateIndex
CREATE INDEX "store_requests_submittedById_idx" ON "store_requests"("submittedById");

-- AddForeignKey
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_requests" ADD CONSTRAINT "store_requests_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
