// The engagement features HQ has switched on (admin > Engagement, 2026-10-23): streak, daily check-in, badges, store goals, gas alerts.
// Only customers have them. `flags` is cheap (just the switches) and decides what the menu shows; `useEngagement` works out the customer's
// own numbers and is only asked for on screens that show them.
import { useQuery } from '@tanstack/react-query';
import { engagementApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

export interface EngagementFlags {
  streaks: { enabled: boolean; milestones: { weeks: number; pts: number }[]; minPurchase: number };
  punchCards: boolean;
  checkIn: { enabled: boolean; mode: 'FIXED' | 'MYSTERY' };
  badges: boolean;
  storeGoals: boolean;
  reorder: boolean;
  gasAlerts: boolean;
  sharing: { enabled: boolean; message: string };
  ratePrompt: boolean;
  birthday: boolean;
  tierUp: boolean;
  weeklyChallenge: boolean;
  flashDeals: boolean;
  friendsBoard?: { enabled: boolean; metric: 'VISITS' | 'POINTS'; period: 'WEEK' | 'MONTH' };
  mascot?: { home: boolean; empty: boolean; name: string; guide?: boolean };   // Cuatro (2026-10-25): the Home tip card and the empty screens; guide: on screen (2026-10-27)
  games?: boolean;   // the prize game (2026-10-25)
}
export interface Streak { weeks: number; current: boolean; atRisk: boolean; endsOn: string | null; best: number; minPurchase: number; next: { weeks: number; pts: number } | null; milestones: { weeks: number; pts: number; reached: boolean; paid: boolean }[] }
export interface CheckIn { available: boolean; reason: 'OFF' | 'ALREADY' | 'NO_VISIT' | 'CAP' | null; doneToday: boolean; streakDays: number; mode: 'FIXED' | 'MYSTERY'; todayPts: number | null; weekBonusPts: number; monthLeftPts: number }
export interface BadgeRow { key: string; emoji: string; name: string; nameEs: string; desc: string; descEs: string; target: number; progress: number; earned: boolean }
export interface Goal { id: string; title: string; titleEs: string | null; metric: string; target: number; rewardPts: number; endDate: string; store: string; progress: number; reached: boolean; joined: boolean }
export interface Engagement { config: EngagementFlags; streak: Streak | null; checkIn: CheckIn | null; badges: { earned: number; total: number; badges: BadgeRow[] } | null; goals: Goal[] | null; gasAlerts: { id: string; storeId: string; fuel: 'GAS' | 'DIESEL'; maxPrice: number }[] | null; birthday?: { today: boolean; pts: number; name: string | null } | null }

const isCustomer = () => useAuthStore.getState().user?.role === 'CUSTOMER';

/** Just the switches. A server from before this feature (or no connection) is "everything off", so nothing shows. */
export function useEngagementFlags(): EngagementFlags | null {
  const user = useAuthStore((s) => s.user);
  const q = useQuery({ queryKey: ['engagement-flags'], queryFn: async () => (await engagementApi.config()).data.data as EngagementFlags, staleTime: 60_000, retry: 1, enabled: user?.role === 'CUSTOMER' });
  return q.data ?? null;
}

export function useEngagement(storeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['engagement', storeId ?? ''],
    queryFn: async () => (await engagementApi.me(storeId)).data.data as Engagement,
    enabled: enabled && isCustomer(),
    staleTime: 60_000,
    retry: 1,
  });
}
