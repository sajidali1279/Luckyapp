-- CreateTable
CREATE TABLE "store_keyword_mappings" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" "ProductCategory" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_keyword_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_keyword_mappings_storeId_keyword_key" ON "store_keyword_mappings"("storeId", "keyword");

-- AddForeignKey
ALTER TABLE "store_keyword_mappings" ADD CONSTRAINT "store_keyword_mappings_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
