-- The starting label-printer numbers for Letter sheets become what HQ found prints right on Avery 5160 sheets (2026-10-02):
-- move right 1 mm, labels 65 x 25 mm, 4.9 mm between columns, 0.6 mm between rows.

-- AlterTable
ALTER TABLE "stores" ALTER COLUMN "labelNudgeRight" SET DEFAULT 1,
ALTER COLUMN "labelWidth" SET DEFAULT 65,
ALTER COLUMN "labelHeight" SET DEFAULT 25,
ALTER COLUMN "labelGapX" SET DEFAULT 4.9,
ALTER COLUMN "labelGapY" SET DEFAULT 0.6;

-- Stores nobody has set yet start at the same numbers (a store HQ already set keeps its own)
UPDATE "stores"
SET "labelNudgeDown" = 0, "labelNudgeRight" = 1, "labelWidth" = 65, "labelHeight" = 25, "labelGapX" = 4.9, "labelGapY" = 0.6
WHERE "labelNudgeUpdatedAt" IS NULL;
