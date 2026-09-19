// Generic helpers with no React Native imports.

// Runs `worker` over `items` with at most `limit` in flight at once and never
// rejects: each slot reports its own outcome, in input order. Used to record
// a big print job's per-item server rows without either firing hundreds of
// requests at once or stopping at the first failure.
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function lane() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: 'fulfilled', value: await worker(items[i], i) };
      } catch (reason) {
        results[i] = { status: 'rejected', reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, lane));
  return results;
}
