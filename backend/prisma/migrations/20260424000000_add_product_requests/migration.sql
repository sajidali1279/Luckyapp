-- CreateEnum
CREATE TYPE "ProductRequestStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

-- CreateTable
CREATE TABLE "product_requests" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductRequestStatus" NOT NULL DEFAULT 'PENDING',
    "responseNote" TEXT,
    "respondedById" TEXT,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_requests_customerId_idx" ON "product_requests"("customerId");

-- CreateIndex
CREATE INDEX "product_requests_storeId_idx" ON "product_requests"("storeId");

-- CreateIndex
CREATE INDEX "product_requests_status_idx" ON "product_requests"("status");

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_requests" ADD CONSTRAINT "product_requests_respondedById_fkey" FOREIGN KEY ("respondedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
