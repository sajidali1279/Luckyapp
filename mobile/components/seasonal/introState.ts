// Whether the seasonal opening (SeasonalHost) is still to come this app run (2026-11-17). Cuatro's holiday scene (the turkey chase, the
// sled run) waits for it: the opening starts about 3 seconds after the app opens, so the chase used to start first, the opening covered
// it half way and the joke never finished (the owner). The host says what it decided; the scene waits until the opening is over,
// skipped, or not playing at all.
type State = 'unknown' | 'none' | 'pending' | 'playing' | 'done';
let state: State = 'unknown';
const subs = new Set<() => void>();

export function setIntroState(s: State) { state = s; subs.forEach((f) => f()); }
export const introState = () => state;

/** Resolves once the opening is over or will not play; also after `maxMs` (the theme never loaded: no reason to keep him waiting). */
export function introSettled(maxMs = 12_000): Promise<void> {
  if (state === 'none' || state === 'done') return Promise.resolve();
  return new Promise((res) => {
    const t = setTimeout(done, maxMs);
    function done() { clearTimeout(t); subs.delete(check); res(); }
    function check() { if (state === 'none' || state === 'done') done(); }
    subs.add(check);
  });
}
