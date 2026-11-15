-- AlterTable
ALTER TABLE "stores" ADD COLUMN     "hotFoodAutoCancelMinutes" INTEGER;

-- AlterTable
ALTER TABLE "hot_food_orders" ADD COLUMN     "hereAt" TIMESTAMP(3),
ADD COLUMN     "herePump" INTEGER,
ADD COLUMN     "readyBy" TIMESTAMP(3),
ADD COLUMN     "ticket" INTEGER,
ADD COLUMN     "ticketDay" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "hot_food_orders_storeId_ticketDay_ticket_key" ON "hot_food_orders"("storeId", "ticketDay", "ticket");

