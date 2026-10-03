-- CreateTable
CREATE TABLE "admin_notification_reads" (
    "notificationId" TEXT NOT NULL,
    "readById" TEXT NOT NULL,
    "readByName" TEXT,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_notification_reads_pkey" PRIMARY KEY ("notificationId")
);

