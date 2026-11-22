-- AlterTable
ALTER TABLE "labels" ADD COLUMN     "designId" TEXT,
ADD COLUMN     "textScale" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "label_designs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "label_designs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "label_images" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "label_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_stickers" (
    "id" TEXT NOT NULL,
    "words" TEXT NOT NULL,
    "subText" TEXT,
    "priceText" TEXT NOT NULL,
    "imageIds" TEXT[],
    "designId" TEXT,
    "template" "LabelTemplate" NOT NULL DEFAULT 'CLASSIC_RED_BLACK',
    "textScale" DOUBLE PRECISION,
    "storeIds" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deal_stickers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_designId_fkey" FOREIGN KEY ("designId") REFERENCES "label_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_stickers" ADD CONSTRAINT "deal_stickers_designId_fkey" FOREIGN KEY ("designId") REFERENCES "label_designs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
