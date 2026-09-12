-- Baseline migration: hot_food_menu_items, hot_food_orders, and
-- hot_food_order_items were created directly against the real database
-- (via `prisma db push`, not through a migration file) at some point
-- before this repo's migration history was fully tracked. This migration
-- exists purely to make migration HISTORY match reality -- it will be
-- marked as already-applied via `prisma migrate resolve --applied`, never
-- actually run against the real database. Its SQL was written by
-- introspecting the real, live table definitions (columns, indexes,
-- foreign keys, delete/update rules) so that a fresh environment replaying
-- migration history from scratch produces the exact same schema. Dated
-- before 20260612200000_add_hot_food_category so replay order stays
-- correct (create the tables, then that migration adds the category
-- column on top).

-- CreateEnum
CREATE TYPE "HotFoodOrderStatus" AS ENUM ('PENDING', 'ACCEPTED', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "hot_food_menu_items" (
    "id" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "estimatedMinutes" INTEGER,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hot_food_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_food_orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "status" "HotFoodOrderStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "estimatedMinutes" INTEGER,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hot_food_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_food_order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT,
    "catalogItemId" TEXT,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "hot_food_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "hot_food_menu_items_storeId_isAvailable_idx" ON "hot_food_menu_items"("storeId", "isAvailable");

-- CreateIndex
CREATE UNIQUE INDEX "hot_food_orders_orderNumber_key" ON "hot_food_orders"("orderNumber");

-- CreateIndex
CREATE INDEX "hot_food_orders_storeId_status_idx" ON "hot_food_orders"("storeId", "status");

-- CreateIndex
CREATE INDEX "hot_food_orders_customerId_idx" ON "hot_food_orders"("customerId");

-- AddForeignKey
ALTER TABLE "hot_food_menu_items" ADD CONSTRAINT "hot_food_menu_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_food_orders" ADD CONSTRAINT "hot_food_orders_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_food_orders" ADD CONSTRAINT "hot_food_orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_food_order_items" ADD CONSTRAINT "hot_food_order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "hot_food_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_food_order_items" ADD CONSTRAINT "hot_food_order_items_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "hot_food_menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
