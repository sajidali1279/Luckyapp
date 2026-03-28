-- AlterTable: add email recovery fields and PIN history to users
ALTER TABLE "users" ADD COLUMN "email" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "pinHistory" TEXT[] NOT NULL DEFAULT '{}';

-- CreateIndex: unique email
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateTable: OTP codes for PIN recovery
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "code" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: fast lookup by phone + purpose
CREATE INDEX "otp_codes_phone_purpose_idx" ON "otp_codes"("phone", "purpose");
