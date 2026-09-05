-- The single daily schedule from the previous migration turned out to be
-- the wrong shape: stores need different hours per day of week, plus
-- one-off overrides for holidays. Replacing it with two real tables.
ALTER TABLE "stores" DROP COLUMN "isOpen24Hours";
ALTER TABLE "stores" DROP COLUMN "openTime";
ALTER TABLE "stores" DROP COLUMN "closeTime";

-- CreateTable
CREATE TABLE "store_hours" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isOpen24Hours" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,

    CONSTRAINT "store_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_hours_storeId_dayOfWeek_key" ON "store_hours"("storeId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "store_holidays" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isOpen24Hours" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "store_holidays_storeId_date_key" ON "store_holidays"("storeId", "date");

-- AddForeignKey
ALTER TABLE "store_holidays" ADD CONSTRAINT "store_holidays_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;
