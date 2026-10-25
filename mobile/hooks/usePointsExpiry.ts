// The customer's points expiry (2026-10-17, GET /points/my-expiry): the next points to expire and what expired. Null until it loads, on an
// older server, or for a signed-out user; `enabled` false while HQ has expiry switched off (then nothing is shown about it).
import { useQuery } from '@tanstack/react-query';
import { pointsApi } from '../services/api';

export interface PointsExpiry {
  enabled: boolean;
  days: number;
  next: { date: string; points: number } | null;
  upcoming: { date: string; points: number }[];
  expired: { date: string; points: number }[];
}

export function usePointsExpiry(enabled = true): PointsExpiry | null {
  const q = useQuery({ queryKey: ['my-expiry'], queryFn: () => pointsApi.getMyExpiry(), staleTime: 5 * 60_000, retry: 1, enabled });
  return (q.data?.data?.data as PointsExpiry | undefined) ?? null;
}

/** "Jan 30" in the app's language, for a YYYY-MM-DD store date. */
export function expiryDate(date: string, language?: string): string {
  return new Date(`${date}T18:00:00Z`).toLocaleDateString((language ?? '').startsWith('es') ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
}
