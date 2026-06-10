-- CreateTable
CREATE TABLE "job_openings" (
    "id"           TEXT NOT NULL,
    "title"        TEXT NOT NULL,
    "position"     TEXT NOT NULL,
    "storeId"      TEXT,
    "description"  TEXT,
    "requirements" TEXT,
    "payRange"     TEXT,
    "employType"   TEXT NOT NULL DEFAULT 'BOTH',
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdById"  TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_openings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "job_openings_isActive_idx" ON "job_openings"("isActive");
CREATE INDEX "job_openings_createdAt_idx" ON "job_openings"("createdAt");

-- AddForeignKey
ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "job_openings" ADD CONSTRAINT "job_openings_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
