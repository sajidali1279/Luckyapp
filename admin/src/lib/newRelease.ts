// A tab opened before a new release still asks for the old release's page files, and those are gone from the server after the
// release (2026-10-28: "Failed to fetch dynamically imported module: .../assets/Transactions-CQwYGzGb.js"). One reload fetches
// the new release. React also remembers a failed page load, so "Try again" alone could never fix it. Never loops: a second
// failure within a minute of the reload shows the error page instead.
import { lazy, type ComponentType } from 'react';

const KEY = 'reloadedForNewReleaseAt';

/** True when the error is a page file (or its stylesheet) that could not be fetched, in any browser's wording. */
export function isNewReleaseError(e: unknown): boolean {
  const m = String((e as { message?: string })?.message ?? e ?? '');
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading chunk \S+ failed|ChunkLoadError/i.test(m);
}

/** Reloads the page to pick up the new release, unless it already did that in the last minute. True when it reloads. */
export function reloadForNewRelease(): boolean {
  try {
    const last = Number(sessionStorage.getItem(KEY) || 0);
    if (Date.now() - last < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch { /* no session storage: still reload, the browser keeps nothing to loop on */ }
  window.location.reload();
  return true;
}

/** React.lazy for a page, reloading once when the page file belongs to an older release. */
export function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() => load().then(
    // undefined: the failed fetch was already caught by main.tsx's vite:preloadError listener, which is reloading the page
    (m) => m ?? new Promise<{ default: T }>(() => {}),
    (e) => {
      if (isNewReleaseError(e) && reloadForNewRelease()) return new Promise<{ default: T }>(() => {});   // reloading
      throw e;
    },
  ));
}
