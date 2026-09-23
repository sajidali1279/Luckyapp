-- Hand-written (not run via `prisma migrate dev` against the live database this session).
-- Adds one nullable column; safe to run with the app already deployed (no backfill needed, null
-- simply means "never signed in since this column existed").
ALTER TABLE "users" ADD COLUMN "lastSignInAt" TIMESTAMP(3);
