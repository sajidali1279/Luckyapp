// Things that happen elsewhere in the app that Cuatro reacts to (2026-10-31). A screen's own pop-up hides him while it is open
// (guideCover.ts), so the news waits here until he is back on the bar to see it, and goes stale after a minute and a half.
export type GuideEvent = 'redeemed';

let pending: { kind: GuideEvent; at: number } | null = null;

/** Tells Cuatro something happened (a reward redeemed, ...). The latest one wins. */
export function tellGuide(kind: GuideEvent) {
  pending = { kind, at: Date.now() };
}

/** Whether fresh news is waiting, without using it up. */
export function hasGuideEvent(maxAgeMs = 90_000): boolean {
  return !!pending && Date.now() - pending.at <= maxAgeMs;
}

/** The news waiting for him, once: null when there is none or it is too old to react to. */
export function takeGuideEvent(maxAgeMs = 90_000): GuideEvent | null {
  const p = pending;
  pending = null;
  return p && Date.now() - p.at <= maxAgeMs ? p.kind : null;
}
