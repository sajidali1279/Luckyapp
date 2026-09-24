import { useQuery } from '@tanstack/react-query';
import { storesApi } from '../services/api';
import { TIER_CONFIG, mergeLiveTierConfig, LiveTierRate } from '../constants';

/**
 * TIER_CONFIG merged with live rates from the server, so a customer always sees the percentages,
 * thresholds and gas bonus the server will actually pay them, not fixed text from when the app was built.
 * Refetched on every mount rather than cached long-term: a rate change should reach the app the next time
 * someone opens the tier card, not after a long staleTime window.
 */
export function useLiveTierConfig() {
  const { data, isLoading } = useQuery({
    queryKey: ['tier-rates'],
    queryFn: () => storesApi.getTierRates(),
    staleTime: 5 * 60_000,
  });

  const liveRates: Record<string, LiveTierRate> | undefined = data?.data?.data
    ? Object.fromEntries((data.data.data as LiveTierRate[]).map((r) => [r.tier, r]))
    : undefined;

  return { tierConfig: mergeLiveTierConfig(liveRates), liveRates, liveRatesLoaded: !isLoading && !!liveRates, TIER_CONFIG };
}
