-- Hot food: when an order was marked ready, and the one reminder to pick it up
ALTER TABLE "hot_food_orders" ADD COLUMN "readyAt" TIMESTAMP(3);
ALTER TABLE "hot_food_orders" ADD COLUMN "readyRemindedAt" TIMESTAMP(3);
