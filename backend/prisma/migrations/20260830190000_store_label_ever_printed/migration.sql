-- Track "has this store's copy ever been printed" separately from
-- printedAt, which resets to NULL on every reprint-triggering edit and so
-- can't distinguish "never printed" (new) from "was printed, now stale"
-- (needs reprint). Backfill: anything currently printed has, by definition,
-- been printed before.
ALTER TABLE "store_labels" ADD COLUMN "everPrinted" BOOLEAN NOT NULL DEFAULT false;

UPDATE "store_labels" SET "everPrinted" = true WHERE "printedAt" IS NOT NULL;
