-- Age-restricted offers: a per-offer switch, plus a customer-level
-- "declined" state distinct from "never asked" (declining hides restricted
-- content instead of prompting again every time, until the customer opts
-- in from Profile).
ALTER TABLE "offers" ADD COLUMN "requires21" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "age21Declined" BOOLEAN NOT NULL DEFAULT false;
