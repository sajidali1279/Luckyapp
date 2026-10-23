-- Chat photos and PDFs (2026-10-24): the file lives in Cloudinary (private, signed links); the message keeps only its id, kind, name and size.
ALTER TABLE "chat_messages" ADD COLUMN "attachmentId" TEXT,
ADD COLUMN "attachmentKind" TEXT,
ADD COLUMN "attachmentName" TEXT,
ADD COLUMN "attachmentBytes" INTEGER;
