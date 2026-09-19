import { useQuery } from '@tanstack/react-query';
import { billingApi, offersApi, bannersApi, customersApi, staffApi, storesApi, pointsApi, labelsApi } from '../../services/api';

// The dashboard's data hooks. React Query shares each result by key, so the inbox, the KPI row and the
// store board can each ask for the same thing without a second request.

export const usePlatform = (enabled = true) =>
  useQuery({ queryKey: ['platform-summary'], queryFn: () => pointsApi.getPlatformSummary(), enabled, refetchInterval: 60_000 });

export const useCompare = (range: string, enabled = true) =>
  useQuery({ queryKey: ['platform-compare', range], queryFn: () => pointsApi.getPlatformCompare(range), enabled, refetchInterval: 60_000 });

export const useTrend = (enabled = true) =>
  useQuery({ queryKey: ['platform-trend-30d'], queryFn: () => pointsApi.getPlatformTrend(30), enabled, refetchInterval: 300_000 });

export const useStoreHealth = (enabled = true) =>
  useQuery({ queryKey: ['store-health'], queryFn: () => pointsApi.getStoreHealth(), enabled, refetchInterval: 60_000 });

export const useOffers = () => useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });
export const useBanners = () => useQuery({ queryKey: ['banners'], queryFn: () => bannersApi.getActive() });
export const useCustomers = () => useQuery({ queryKey: ['customers'], queryFn: () => customersApi.list() });
export const useStaff = () => useQuery({ queryKey: ['staff'], queryFn: () => staffApi.list() });
export const useStores = () => useQuery({ queryKey: ['stores'], queryFn: () => storesApi.getAll() });
export const useLabelHealth = () => useQuery({ queryKey: ['labels-health-summary'], queryFn: () => labelsApi.getHealthSummary() });
export const useRevenue = (period: string, enabled = true) =>
  useQuery({ queryKey: ['revenue', period], queryFn: () => billingApi.getRevenue(period), enabled });
export const useAnalytics = (enabled = true) =>
  useQuery({ queryKey: ['analytics-30d'], queryFn: () => billingApi.getAnalytics(), enabled });
export const useCategoryRates = (enabled = true) =>
  useQuery({ queryKey: ['category-rates'], queryFn: () => billingApi.getCategoryRates(), enabled });
export const useTierRates = (enabled = true) =>
  useQuery({ queryKey: ['tier-rates'], queryFn: () => billingApi.getTierRates(), enabled });
export const useCashbackHealth = (enabled = true) =>
  useQuery({ queryKey: ['cashback-health'], queryFn: () => billingApi.getCashbackHealth(), enabled, staleTime: 5 * 60_000 });

// Transactions that need a decision, and the latest activity. Refreshed every 30 seconds.
export const useFeed = (kind: 'FLAGGED' | 'PENDING' | 'LATEST', enabled = true) =>
  useQuery({
    queryKey: ['feed', kind],
    queryFn: () => pointsApi.getAllTransactions(kind === 'LATEST' ? { limit: '8' } : { status: kind, limit: '6' }),
    enabled,
    refetchInterval: 30_000,
  });
