import { useCallback, useSyncExternalStore } from 'react';

// A short, user-chosen list of pages pinned to the top of the sidebar and the command palette. Kept in
// localStorage (per browser, like the palette's "Recent" list), capped so the pinned row itself never grows
// into another long list.
const PINNED_KEY = 'admin-pinned-pages';
const PINNED_MAX = 8;
const EMPTY: string[] = [];

// useSyncExternalStore requires getSnapshot to return the SAME reference until the value really changes
// (a fresh array every call, even with identical contents, is an infinite-render bug). Cache the last
// parse and only build a new array when the raw localStorage string is different from last time.
let cachedRaw: string | null = null;
let cachedArr: string[] = [];

function readPinned(): string[] {
  const raw = (() => { try { return localStorage.getItem(PINNED_KEY) || '[]'; } catch { return '[]'; } })();
  if (raw === cachedRaw) return cachedArr;
  cachedRaw = raw;
  try {
    const parsed = JSON.parse(raw);
    cachedArr = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch { cachedArr = []; }
  return cachedArr;
}

function writePinned(next: string[]) {
  try { localStorage.setItem(PINNED_KEY, JSON.stringify(next)); } catch { /* storage unavailable */ }
  // Same-tab subscribers (useSyncExternalStore below) don't hear about a localStorage write in their own
  // tab — only other tabs get the native "storage" event — so tell this tab's own listeners by hand.
  window.dispatchEvent(new Event('admin-pinned-pages-changed'));
}

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener('admin-pinned-pages-changed', onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener('admin-pinned-pages-changed', onChange);
  };
}

/** `pinned`, in the order pinned (most recently pinned last); `isPinned(to)`; `togglePin(to)` pins or unpins one page. Silently
 * ignores a new pin once `PINNED_MAX` is already reached, rather than pushing an older pin out or refusing loudly. */
export function usePinnedPages() {
  const pinned = useSyncExternalStore(subscribe, readPinned, () => EMPTY);

  const togglePin = useCallback((to: string) => {
    const current = readPinned();
    if (current.includes(to)) {
      writePinned(current.filter((p) => p !== to));
    } else if (current.length < PINNED_MAX) {
      writePinned([...current, to]);
    }
  }, []);

  const isPinned = useCallback((to: string) => pinned.includes(to), [pinned]);

  return { pinned, isPinned, togglePin, max: PINNED_MAX };
}
