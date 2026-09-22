import { useSyncExternalStore } from 'react';

// Pages opened through the command palette, most recent first. Read by the palette itself (its own "Recent"
// group) and by AppSidebar's compact "Recent" row at the top of the menu, so both surfaces agree.
const RECENTS_KEY = 'admin-palette-recents';
const RECENTS_MAX = 5;
const EMPTY: string[] = [];

// Same caching trick as usePinnedPages.ts: useSyncExternalStore needs the same array reference back until
// the value really changes, so a fresh JSON.parse() on every call would spin it into an infinite render.
let cachedRaw: string | null = null;
let cachedArr: string[] = EMPTY;

export function readRecents(): string[] {
  const raw = (() => { try { return localStorage.getItem(RECENTS_KEY) || '[]'; } catch { return '[]'; } })();
  if (raw === cachedRaw) return cachedArr;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw);
    cachedArr = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch { cachedArr = []; }
  return cachedArr;
}

export function pushRecent(to: string) {
  try {
    const next = [to, ...readRecents().filter((r) => r !== to)].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
    cachedRaw = null; // force the next readRecents() to re-parse instead of returning the stale cache
  } catch { /* storage unavailable, quietly skip remembering */ }
  // Tell this tab's own listeners by hand — a localStorage write never raises the "storage" event in the
  // same tab that made it, only in other tabs.
  window.dispatchEvent(new Event('admin-recent-pages-changed'));
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener('admin-recent-pages-changed', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('admin-recent-pages-changed', onChange);
  };
}

/** Live view of the same list `readRecents()`/`pushRecent()` read and write, for a component (like the sidebar)
 * that needs to notice a page opened elsewhere just now, not only whenever it happens to remount. */
export function useRecentPages(): string[] {
  return useSyncExternalStore(subscribe, readRecents, () => EMPTY);
}
