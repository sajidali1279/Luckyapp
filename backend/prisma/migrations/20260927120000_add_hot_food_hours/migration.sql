-- CreateTable
CREATE TABLE "hot_food_hours" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isOpen24Hours" BOOLEAN NOT NULL DEFAULT false,
    "openTime" TEXT,
    "closeTime" TEXT,

    CONSTRAINT "hot_food_hours_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hot_food_hours_storeId_dayOfWeek_key" ON "hot_food_hours"("storeId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "hot_food_hours" ADD CONSTRAINT "hot_food_hours_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE CASCADE ON UPDATE CASCADE;

