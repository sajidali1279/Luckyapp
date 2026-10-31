-- One usage bill per store and month. The monthly job's "already billed?" check ran in one server copy at a time, so two copies
-- (or the job racing the Generate button) could each make the same bill. Extra charges (CUSTOM) stay unlimited, and chain-wide
-- charges have no store. Prisma cannot describe a partial index: it lives only in this migration (see BillingRecord in
-- schema.prisma), and a generated migration must never drop it.
CREATE UNIQUE INDEX "billing_records_usage_store_period_key" ON "billing_records" ("storeId", "period") WHERE "billingType" <> 'CUSTOM';
