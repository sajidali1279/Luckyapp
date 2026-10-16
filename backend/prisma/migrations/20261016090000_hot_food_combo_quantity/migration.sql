-- Multi-buy hot food deals (2026-10-16): how many of the item a combo holds (2 corn dogs for $3.50); a combo may now have no drink
ALTER TABLE "hot_food_combos" ADD COLUMN "itemQuantity" INTEGER NOT NULL DEFAULT 1;
