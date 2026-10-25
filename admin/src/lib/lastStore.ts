// The store a page was last looked at for (2026-10-12): pages that need a store (Requests, Scheduling, Chat, Leaderboard) open on it next
// time instead of an empty "Select a store". Kept in this browser only; a store that no longer exists is ignored by the caller.
const KEY = (page: string) => `last-store:${page}`;

export function recallStore(page: string): string | null {
  try { return localStorage.getItem(KEY(page)); } catch { return null; }
}

export function rememberStore(page: string, storeId: string | null | undefined) {
  if (!storeId) return;
  try { localStorage.setItem(KEY(page), storeId); } catch { /* storage unavailable */ }
}

/** The remembered store when it is still in the list, else the first one, else null. */
export function pickStore(page: string, storeIds: string[]): string | null {
  const last = recallStore(page);
  return last && storeIds.includes(last) ? last : storeIds[0] ?? null;
}
