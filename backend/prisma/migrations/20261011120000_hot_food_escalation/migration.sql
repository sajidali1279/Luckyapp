-- When a hot food order nobody accepted was escalated to the store's managers (once)
ALTER TABLE "hot_food_orders" ADD COLUMN "escalatedAt" TIMESTAMP(3);
