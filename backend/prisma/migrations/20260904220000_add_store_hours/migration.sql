-- Store hours: same schedule every day. isOpen24Hours bypasses open/close
-- times entirely instead of requiring "00:00"-"23:59" as a workaround.
ALTER TABLE "stores" ADD COLUMN "isOpen24Hours" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "stores" ADD COLUMN "openTime" TEXT;
ALTER TABLE "stores" ADD COLUMN "closeTime" TEXT;
