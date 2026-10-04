-- CreateTable
CREATE TABLE "deal_suggestion_edits" (
    "id" TEXT NOT NULL,
    "labelId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "category" TEXT,
    "price" DOUBLE PRECISION NOT NULL,
    "suggested" TEXT NOT NULL,
    "chosen" TEXT NOT NULL,
    "editedById" TEXT NOT NULL,
    "editedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_suggestion_edits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_suggestion_edits_createdAt_idx" ON "deal_suggestion_edits"("createdAt");

