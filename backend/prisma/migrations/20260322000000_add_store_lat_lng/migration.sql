-- AddColumn: latitude and longitude to stores for customer proximity detection
ALTER TABLE "stores" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "stores" ADD COLUMN "longitude" DOUBLE PRECISION;
