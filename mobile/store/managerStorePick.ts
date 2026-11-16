// The store a manager picked in a screen's store chips, shared by the manager screens (2026-11-15). Each screen kept its own pick, so a
// manager who chose Lucky Stop #9 on Order List saw the dashboard's Order List card still counting the first store (Lucky Truck Stop:
// "2 to order" instead of 38). Now picking a store on one screen picks it on the others. Kept per signed-in person: someone else signing
// in on the same phone starts fresh. Lives only while the app is open, like the screens' own picks did.
import { useCallback } from 'react';
import { create } from 'zustand';
import { useAuthStore } from './authStore';

const usePick = create<{ userId: string | null; storeId: string | null; set: (userId: string, storeId: string | null) => void }>((set) => ({
  userId: null,
  storeId: null,
  set: (userId, storeId) => set({ userId, storeId }),
}));

/** Drop-in for useState<string | null>(null) in a manager screen's store chips */
export function useManagerStorePick(): [string | null, (id: string | null) => void] {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const pickUser = usePick((s) => s.userId);
  const storeId = usePick((s) => s.storeId);
  const setPick = usePick((s) => s.set);
  const set = useCallback((id: string | null) => { if (userId) setPick(userId, id); }, [userId, setPick]);
  return [userId && pickUser === userId ? storeId : null, set];
}
