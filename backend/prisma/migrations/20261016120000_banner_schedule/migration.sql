-- Banners can be edited and scheduled (2026-10-16): shown from startAt until endAt (store days); empty = from now / no end
ALTER TABLE "banners" ADD COLUMN "startAt" TIMESTAMP(3);
ALTER TABLE "banners" ADD COLUMN "endAt" TIMESTAMP(3);
