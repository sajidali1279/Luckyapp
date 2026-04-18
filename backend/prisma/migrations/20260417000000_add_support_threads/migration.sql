-- CreateTable: support_threads
CREATE TABLE IF NOT EXISTS "support_threads" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "fromName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_threads_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: support_messages
CREATE TABLE IF NOT EXISTS "support_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "senderName" TEXT NOT NULL,
    "senderRole" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "support_messages_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "support_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "support_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "support_threads_fromUserId_idx" ON "support_threads"("fromUserId");
CREATE INDEX IF NOT EXISTS "support_threads_status_idx" ON "support_threads"("status");
CREATE INDEX IF NOT EXISTS "support_messages_threadId_createdAt_idx" ON "support_messages"("threadId", "createdAt");
