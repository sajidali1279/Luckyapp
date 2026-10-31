import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export const NEARBY_STORE_MAX_MILES = 2;

export function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * The phone's position, or null, never waiting long (2026-10-31): a fresh fix can take forever indoors or with location switched off,
 * and Home's offers waited on it. Waits at most `ms`, then takes the last known position (null if there is none).
 */
export async function quickPosition(ms = 8000, accuracy: Location.Accuracy = Location.Accuracy.Balanced): Promise<Location.LocationObject | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ms); });
  const fresh = Location.getCurrentPositionAsync({ accuracy }).catch(() => null);
  const pos = await Promise.race([fresh, timeout]);
  clearTimeout(timer);
  return pos ?? (await Location.getLastKnownPositionAsync().catch(() => null));
}

export interface StoreWithLocation {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Resolves which of an employee's assigned stores they're currently working
 * at. Employees assigned to just one store never touch Location at all , 
 * there's no ambiguity to resolve, so no permission prompt, no GPS wait.
 * Multi-store employees get GPS-nearest-of-their-own-stores, falling back to
 * their first assigned store on denied permission, GPS failure, or no
 * assigned store within range, never blocks, never leaves the caller with
 * no store id at all as long as they have at least one assignment.
 */
// The store the GPS last picked for an assignment list, for this app run: a screen opened again starts there instead of at the first
// store and flipping over a moment later
const remembered = new Map<string, string>();

export function useCurrentStoreId(
  allStores: StoreWithLocation[],
  assignedStoreIds: string[] | undefined
): string | undefined {
  const ids = assignedStoreIds ?? [];
  const idsKey = ids.join(',');
  const [resolvedId, setResolvedId] = useState<string | undefined>(() => remembered.get(idsKey) ?? ids[0]);

  useEffect(() => {
    // Kept while it is still one of theirs: this runs again when the store list loads, and used to flip back to the first store
    setResolvedId((cur) => (cur && ids.includes(cur) ? cur : remembered.get(idsKey) ?? ids[0]));
    if (ids.length <= 1 || allStores.length === 0) return;   // the stores' locations not loaded yet: nothing to compare

    let cancelled = false;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;
        const pos = await quickPosition();
        if (!pos || cancelled) return;
        const candidates = allStores.filter(
          (s) => ids.includes(s.id) && s.latitude != null && s.longitude != null
        );
        if (candidates.length === 0 || cancelled) return;

        let closest = candidates[0];
        let closestDist = Infinity;
        for (const s of candidates) {
          const d = haversineMiles(pos.coords.latitude, pos.coords.longitude, s.latitude!, s.longitude!);
          if (d < closestDist) { closestDist = d; closest = s; }
        }
        if (!cancelled && closestDist <= NEARBY_STORE_MAX_MILES) { remembered.set(idsKey, closest.id); setResolvedId(closest.id); }
      } catch {
        // Keep the storeIds[0] fallback already set above.
      }
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, allStores.length]);

  return resolvedId;
}

/** True while `updatedAt` is within the last `windowMinutes`, re-checks
 * every few seconds so a "change needed" indicator settles on its own once
 * the window elapses, without needing the screen to be reopened. */
export function useRecentlyChanged(updatedAt: string | Date | null | undefined, windowMinutes = 10): boolean {
  const [isRecent, setIsRecent] = useState(false);
  const time = updatedAt ? new Date(updatedAt).getTime() : null;

  useEffect(() => {
    if (!time) { setIsRecent(false); return; }
    const check = () => setIsRecent(Date.now() - time < windowMinutes * 60 * 1000);
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [time, windowMinutes]);

  return isRecent;
}
