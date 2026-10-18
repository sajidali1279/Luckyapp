// What HQ set in admin Settings that the app needs (2026-10-12, GET /settings/app): which features are on, the contact details for the
// Help screen, and a few limits. An older server (no such route) or no connection: everything on, today's limits, no contact details.
import { useQuery } from '@tanstack/react-query';
import { settingsAppApi } from '../services/api';

export interface AppSettings {
  features: { hotFoodOrdering: boolean; hotFoodPayWithPoints: boolean; hotFoodCombos: boolean; challenges: boolean };
  business: { supportPhone: string; supportEmail: string; supportHours: string };
  limits: {
    hotFoodMaxPerItem: number; receiptScansPerDay: number; receiptMaxDays: number; staffAtStoreFeet: number;
    // 2026-10-17: HQ's numbers that customers read (Settings > Rewards & offers, Customer care)
    refillSilverPerPeriod: number; refillDailyPerDay: number; rewardHoldMinutes: number; productRequestDays: number; referralLateDays: number; disputeMaxDays: number;
  };
}

export const APP_SETTINGS_DEFAULT: AppSettings = {
  features: { hotFoodOrdering: true, hotFoodPayWithPoints: true, hotFoodCombos: true, challenges: true },
  business: { supportPhone: '', supportEmail: '', supportHours: '' },
  limits: { hotFoodMaxPerItem: 20, receiptScansPerDay: 3, receiptMaxDays: 3, staffAtStoreFeet: 800,
    refillSilverPerPeriod: 7, refillDailyPerDay: 1, rewardHoldMinutes: 30, productRequestDays: 7, referralLateDays: 7, disputeMaxDays: 60 },
};

export function useAppSettings(enabled = true): AppSettings {
  const q = useQuery({ queryKey: ['app-settings'], queryFn: () => settingsAppApi.get(), staleTime: 5 * 60 * 1000, retry: 1, enabled });
  const d = q.data?.data?.data;
  if (!d) return APP_SETTINGS_DEFAULT;
  return {
    features: { ...APP_SETTINGS_DEFAULT.features, ...(d.features ?? {}) },
    business: { ...APP_SETTINGS_DEFAULT.business, ...(d.business ?? {}) },
    limits: { ...APP_SETTINGS_DEFAULT.limits, ...(d.limits ?? {}) },
  };
}
