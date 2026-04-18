-- CreateTable: employee_ratings
CREATE TABLE "employee_ratings" (
    "id"            TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "customerId"    TEXT NOT NULL,
    "employeeId"    TEXT NOT NULL,
    "storeId"       TEXT NOT NULL,
    "rating"        INTEGER NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employee_ratings_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one rating per transaction
CREATE UNIQUE INDEX "employee_ratings_transactionId_key" ON "employee_ratings"("transactionId");

-- Indexes
CREATE INDEX "employee_ratings_employeeId_storeId_idx" ON "employee_ratings"("employeeId", "storeId");
CREATE INDEX "employee_ratings_customerId_idx"          ON "employee_ratings"("customerId");
CREATE INDEX "employee_ratings_createdAt_idx"           ON "employee_ratings"("createdAt");

-- Foreign Keys
ALTER TABLE "employee_ratings"
    ADD CONSTRAINT "employee_ratings_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "points_transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_ratings"
    ADD CONSTRAINT "employee_ratings_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_ratings"
    ADD CONSTRAINT "employee_ratings_employeeId_fkey"
    FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_ratings"
    ADD CONSTRAINT "employee_ratings_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
