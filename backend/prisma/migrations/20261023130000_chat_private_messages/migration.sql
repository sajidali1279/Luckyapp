-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "toUserId" TEXT,
ADD COLUMN     "toUserName" TEXT;

-- CreateIndex
CREATE INDEX "chat_messages_storeId_toUserId_idx" ON "chat_messages"("storeId", "toUserId");
