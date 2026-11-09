-- Offers autopilot (2026-11-09): offers posted by the weekly job carry the idea they came from, their week and why; quiet ones are not announced.
ALTER TABLE "offers" ADD COLUMN "autoIdea" TEXT;
ALTER TABLE "offers" ADD COLUMN "autoWeek" TEXT;
ALTER TABLE "offers" ADD COLUMN "autoNote" TEXT;
ALTER TABLE "offers" ADD COLUMN "quiet" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "offers_autoWeek_idx" ON "offers"("autoWeek");
