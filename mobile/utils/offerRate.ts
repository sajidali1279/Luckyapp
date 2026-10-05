// What a promotion pays THIS customer, in words. A per-tier promotion pays each tier its own rate and a tier left out nothing (the till,
// backend getTierBonusRate), so a customer sees their own rate, not the top tier's. Percentages keep a decimal: 1.5% is "1.5%", not "2%".
import { useAuthStore } from '../store/authStore';
import { TIER_CONFIG } from '../constants';

type TFunction = (key: string, opts?: Record<string, unknown>) => string;
export interface RatedOffer { bonusRate?: number | null; tierBonusRates?: Record<string, number> | null }

/** 0.015 -> "1.5", 0.03 -> "3" */
export function pctLabel(fraction: number): string {
  const v = Math.round(fraction * 1000) / 10;
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** The rate this customer gets (their tier's in a per-tier promotion, 0 when their tier is left out), or null when it has none. */
export function myOfferRate(o: RatedOffer, tier = useAuthStore.getState().user?.tier || 'BRONZE'): number | null {
  const tiers = o.tierBonusRates && Object.keys(o.tierBonusRates).length > 0 ? o.tierBonusRates : null;
  if (tiers) return tiers[tier] ?? 0;
  return o.bonusRate ?? null;
}

/** "Gold, Diamond, Platinum": the tiers a per-tier promotion pays. */
export function tiersWithBonus(o: RatedOffer): string {
  const order = Object.keys(TIER_CONFIG);
  return Object.entries(o.tierBonusRates ?? {}).filter(([, r]) => r > 0).map(([k]) => k)
    .sort((a, b) => order.indexOf(a) - order.indexOf(b)).map((k) => TIER_CONFIG[k]?.label ?? k).join(', ');
}

/** The bonus line for a promotion card: "+1.5% cashback" (key), "+1.5%" (no key), or "For Gold, Platinum" when their tier gets none. */
export function offerBonusText(o: RatedOffer, t: TFunction, key?: 'cashbackPill' | 'offerCashbackBadge'): string {
  const r = myOfferRate(o) ?? 0;
  if (r <= 0 && o.tierBonusRates && Object.keys(o.tierBonusRates).length > 0) return t('customerHome.offerForTiers', { tiers: tiersWithBonus(o) });
  return key ? t(`customerHome.${key}`, { pct: pctLabel(r) }) : `+${pctLabel(r)}%`;
}
