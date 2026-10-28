// Screens' own pop-ups drawn in the screen (Home's InlineModal: a native Modal fails to draw on this Android build) sit under the
// layer Cuatro walks on, so while one is open he steps away (2026-10-27). A pop-up calls useGuideCover(); the guide reads
// useGuideCovered().
import { useEffect, useState } from 'react';

let open = 0;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach((f) => f());

/** Keeps Cuatro off the screen while the calling pop-up is shown. */
export function useGuideCover(active = true) {
  useEffect(() => {
    if (!active) return;
    open += 1; tell();
    return () => { open -= 1; tell(); };
  }, [active]);
}

/** True while any pop-up asked Cuatro to step away. */
export function useGuideCovered(): boolean {
  const [covered, setCovered] = useState(open > 0);
  useEffect(() => {
    const f = () => setCovered(open > 0);
    listeners.add(f); f();
    return () => { listeners.delete(f); };
  }, []);
  return covered;
}
