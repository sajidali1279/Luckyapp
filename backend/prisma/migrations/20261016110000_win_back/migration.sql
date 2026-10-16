-- Win-back gifts (2026-10-16): a campaign is a Challenge of kind WINBACK (never active); its gifts are reward lines on it
ALTER TABLE "challenges" ADD COLUMN "quietDays" INTEGER;
