-- Hot food paid with points (utils/hotFoodPoints.ts)
ALTER TABLE "hot_food_orders" ADD COLUMN "paidWithPoints" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "hot_food_orders" ADD COLUMN "pointsAmount" DOUBLE PRECISION;
ALTER TABLE "hot_food_orders" ADD COLUMN "pointsReturnedAt" TIMESTAMP(3);
