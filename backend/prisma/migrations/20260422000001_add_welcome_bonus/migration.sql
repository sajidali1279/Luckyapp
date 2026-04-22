-- CreateTable
CREATE TABLE "welcome_bonus_claims" (
    "id"            TEXT NOT NULL,
    "customerId"    TEXT NOT NULL,
    "day"           INTEGER NOT NULL,
    "rewardType"    TEXT NOT NULL,
    "claimCode"     TEXT NOT NULL,
    "claimedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt"   TIMESTAMP(3),
    "confirmedById" TEXT,
    "storeId"       TEXT,

    CONSTRAINT "welcome_bonus_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "welcome_bonus_claims_claimCode_key"       ON "welcome_bonus_claims"("claimCode");
CREATE UNIQUE INDEX "welcome_bonus_claims_customerId_day_key"  ON "welcome_bonus_claims"("customerId", "day");
CREATE INDEX        "welcome_bonus_claims_customerId_idx"       ON "welcome_bonus_claims"("customerId");
CREATE INDEX        "welcome_bonus_claims_claimCode_idx"        ON "welcome_bonus_claims"("claimCode");

-- AddForeignKey
ALTER TABLE "welcome_bonus_claims" ADD CONSTRAINT "welcome_bonus_claims_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
