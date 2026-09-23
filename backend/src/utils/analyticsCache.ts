// A short, in-process cache for the Analytics endpoint's aggregation. GetAnalytics scans every
// approved, non-test sale in the requested window and groups it in JavaScript (by day, store,
// category, hour and weekday) - fine at today's volume, but repeated page loads and refreshes of the
// same range, or two admins looking at the same store at once, redo that whole scan from scratch each
// time. This absorbs that: a hit within TTL_MS reuses the last computed result instead of re-querying.
//
// Deliberately short-lived (60s) and in-process (no Redis, no shared cache across server instances):
// the goal is to soften a burst of near-identical requests, not to serve stale data. A write (a sale
// approved, voided, rejected) is not actively invalidated here - within 60 seconds the next request
// naturally recomputes, which matches "a short cache", the audit's own words for this batch, and keeps
// the change small. If Analytics ever needs to reflect a change the instant it happens, invalidate
// explicitly at the write site instead of shortening this further.
const TTL_MS = 60_000;

// A preset range's window ends at "now" (compareWindows' current.end is the literal request instant,
// not rounded to a day boundary), which is a different millisecond on every single call - a cache key
// built from that raw value would never collide with an earlier one and would never actually hit.
// bucketTime() coarsens a Date for the PURPOSE OF THE CACHE KEY ONLY (the real query still uses the
// exact Date) so that requests landing within the same short window share one key and reuse one result.
export const CACHE_BUCKET_MS = 30_000;
export const bucketTime = (d: Date): number => Math.floor(d.getTime() / CACHE_BUCKET_MS);

type Entry = { expiresAt: number; value: unknown };
const store = new Map<string, Entry>();

export async function cachedAnalytics<T>(key: string, compute: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expiresAt > now) return hit.value as T;
  const value = await compute();
  store.set(key, { expiresAt: now + TTL_MS, value });
  // Nothing evicts an expired entry on its own (no timers) - sweep them out whenever the map is
  // getting large, so a long-running server doesn't accumulate one entry per distinct query forever.
  if (store.size > 200) {
    for (const [k, e] of store) if (e.expiresAt <= now) store.delete(k);
  }
  return value;
}

// Test-only: clears every cached entry. Fake-DB tests reuse this module across cases and must not see
// a previous case's cached result for a query string that happens to match.
export function clearAnalyticsCache(): void {
  store.clear();
}
