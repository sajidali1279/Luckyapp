-- Hot food deals by day of the week (2026-10-16): 0 = Sunday .. 6 = Saturday, store time; empty = every day
ALTER TABLE "hot_food_combos" ADD COLUMN "days" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
