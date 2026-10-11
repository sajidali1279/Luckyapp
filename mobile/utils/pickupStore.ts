// Where a customer picks up hot food (2026-10-11). The customer chooses the store; the app helps: it lists the stores closest first,
// opens on the closest one, and asks instead of guessing when two stores are about the same distance. It also says how good the phone's
// location is, so a rough fix does not quietly pick the wrong store, and it shows the store's address and Directions everywhere the
// order is, so nobody orders at one Lucky Stop and drives to another.
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface HotFoodHours {
  open: boolean; limited: boolean;
  closesAt: string | null; opensAt: string | null; opensDay: string | null; holiday: string | null;
}

export interface PickupStore {
  id: string; name: string;
  address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null; phone?: string | null;
  latitude?: number | null; longitude?: number | null;
  hours?: HotFoodHours;
  distance?: number | null;   // miles from the customer, when the location is known
}

export interface Here { latitude: number; longitude: number; accuracy: number | null; at: number }

/** Two stores whose distances differ by less than this (miles) are "about the same distance": the customer chooses. */
export const TIE_MILES = 0.5;
/** A store this much further (miles) than the closest one is pointed out ("not your closest store"). */
export const NOT_CLOSEST_MILES = 1;
/** A location fix rougher than this (meters) is "approximate": the app says so and does not pick on its own. */
export const ROUGH_METERS = 500;

export function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** The stores with their distance from `here`, closest first; without a location (or a store without one), by name. */
export function byDistance(stores: PickupStore[], here: Here | null): PickupStore[] {
  const withD = stores.map((s) => ({
    ...s,
    distance: here && s.latitude != null && s.longitude != null ? milesBetween(here.latitude, here.longitude, s.latitude, s.longitude) : null,
  }));
  return withD.sort((a, b) => {
    if (a.distance != null && b.distance != null) return a.distance - b.distance || a.name.localeCompare(b.name);
    if (a.distance != null) return -1;
    if (b.distance != null) return 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });
}

export type LocationQuality = 'good' | 'rough' | 'off';
export function locationQuality(here: Here | null): LocationQuality {
  if (!here) return 'off';
  return here.accuracy != null && here.accuracy > ROUGH_METERS ? 'rough' : 'good';
}

export type PickupChoice =
  | { kind: 'none' }                                                    // no store takes hot food orders
  | { kind: 'chosen'; id: string; why: 'only' | 'saved' | 'closest' }
  | { kind: 'ask'; why: 'tie' | 'no-location' | 'rough'; candidates: PickupStore[] };

/**
 * Which store the screen opens on. `sorted` comes from byDistance. A store the customer chose before wins (they may always order from
 * the one near work); otherwise the closest, unless two are about the same distance or the location is off or rough: then the customer
 * chooses, from the tied stores or from the whole list.
 */
export function choosePickup(sorted: PickupStore[], here: Here | null, savedId: string | null): PickupChoice {
  if (sorted.length === 0) return { kind: 'none' };
  if (sorted.length === 1) return { kind: 'chosen', id: sorted[0].id, why: 'only' };
  if (savedId && sorted.some((s) => s.id === savedId)) return { kind: 'chosen', id: savedId, why: 'saved' };
  const q = locationQuality(here);
  if (q === 'off' || sorted[0].distance == null) return { kind: 'ask', why: 'no-location', candidates: sorted };
  if (q === 'rough') return { kind: 'ask', why: 'rough', candidates: sorted };
  const first = sorted[0].distance!;
  const tied = sorted.filter((s) => s.distance != null && s.distance - first < TIE_MILES);
  if (tied.length > 1) return { kind: 'ask', why: 'tie', candidates: tied };
  return { kind: 'chosen', id: sorted[0].id, why: 'closest' };
}

/** The closest store when the chosen one is clearly further away (location good): "not your closest store". */
export function closerStore(sorted: PickupStore[], chosenId: string | null, here: Here | null): PickupStore | null {
  if (!chosenId || locationQuality(here) !== 'good') return null;
  const chosen = sorted.find((s) => s.id === chosenId);
  const closest = sorted[0];
  if (!chosen || !closest || closest.id === chosenId || chosen.distance == null || closest.distance == null) return null;
  return chosen.distance - closest.distance >= NOT_CLOSEST_MILES ? closest : null;
}

/** "0.3 mi", "2.4 mi", "18 mi" */
export function milesText(d: number | null | undefined): string | null {
  if (d == null) return null;
  return d < 10 ? `${d.toFixed(1)} mi` : `${Math.round(d)} mi`;
}

/** "1234 Main St, Katy, TX" */
export function addressLine(s: Pick<PickupStore, 'address' | 'city' | 'state'> | null | undefined): string {
  if (!s) return '';
  return [s.address, s.city, s.state].filter(Boolean).join(', ');
}

/** Opens turn-by-turn directions to the store in the phone's maps app. */
export function openDirections(s: Pick<PickupStore, 'name' | 'address' | 'city' | 'state' | 'latitude' | 'longitude'>): void {
  const where = s.latitude != null && s.longitude != null ? `${s.latitude},${s.longitude}` : encodeURIComponent(addressLine(s) || s.name);
  const url = Platform.OS === 'ios'
    ? `http://maps.apple.com/?daddr=${where}&q=${encodeURIComponent(s.name)}`
    : `https://www.google.com/maps/dir/?api=1&destination=${where}`;
  Linking.openURL(url).catch(() => {});
}

const SAVED_KEY = 'hotFoodPickupStore';
export async function loadSavedPickup(): Promise<string | null> {
  try { return await AsyncStorage.getItem(SAVED_KEY); } catch { return null; }
}
export async function savePickup(id: string): Promise<void> {
  try { await AsyncStorage.setItem(SAVED_KEY, id); } catch { /* a convenience only */ }
}
