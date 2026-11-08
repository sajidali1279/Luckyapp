-- An HQ announcement can also show as a card on the customer's Home until this time (2026-11-08)
ALTER TABLE "user_notifications" ADD COLUMN "homeUntil" TIMESTAMP(3);
