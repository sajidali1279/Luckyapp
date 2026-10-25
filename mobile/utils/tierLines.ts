// What a tier gets, as the customer reads it (2026-10-17): the cashback and gas bonus from the live rates (admin Rates page / Settings),
// the refill counts from HQ's settings (GET /settings/app), and the tier's own extras. The Home tier card used to translate its lines by
// position, so the live numbers never showed there and a perk HQ switched off was still listed.
import type { TFunction } from 'i18next';
import type { LiveTierRate } from '../constants';
import type { AppSettings } from '../hooks/useAppSettings';

const STATIC_RATE: Record<string, number> = { BRONZE: 0.01, SILVER: 0.02, GOLD: 0.03, DIAMOND: 0.04, PLATINUM: 0.05 };
// Only until the live rates load: today's values
const GAS_FALLBACK: Record<string, number> = { GOLD: 5, DIAMOND: 7, PLATINUM: 10 };
// The lines that are not numbers (customerHome.benefit_<TIER>_<n>): exclusive items, early access, all stores
const EXTRAS: Record<string, number[]> = { BRONZE: [1, 2], SILVER: [2], GOLD: [3], DIAMOND: [3, 4], PLATINUM: [3, 4] };

const pct = (rate: number) => `${Number((rate * 100).toFixed(2))}%`;

export function tierBenefitLines(tier: string, t: TFunction, liveRates: Record<string, LiveTierRate> | undefined, limits: AppSettings['limits']): string[] {
  const rate = liveRates?.[tier]?.cashbackRate ?? STATIC_RATE[tier] ?? 0;
  const bronze = liveRates?.BRONZE?.cashbackRate ?? STATIC_RATE.BRONZE;
  const lines: string[] = [];
  if (tier === 'SILVER' && bronze > 0) lines.push(t('customerHome.tierCashbackSilver', { pct: pct(rate), times: Math.round(rate / bronze) }));
  else if (tier === 'PLATINUM') lines.push(t('customerHome.tierCashbackTop', { pct: pct(rate) }));
  else lines.push(t('customerHome.tierCashback', { pct: pct(rate) }));
  if (tier === 'SILVER' && limits.refillSilverPerPeriod > 0) lines.push(t('customerRewards.benefitSilverRefills', { count: limits.refillSilverPerPeriod }));
  if (tier === 'GOLD' || tier === 'DIAMOND' || tier === 'PLATINUM') {
    if (limits.refillDailyPerDay > 0) lines.push(t('customerRewards.benefitDailyRefill', { count: limits.refillDailyPerDay }));
    const cents = liveRates?.[tier]?.gasBonusCentsPerGallon ?? GAS_FALLBACK[tier];
    if (cents > 0) lines.push(t('customerRewards.benefitGasBonus', { cents }));
  }
  for (const i of EXTRAS[tier] ?? []) lines.push(t(`customerHome.benefit_${tier}_${i}`));
  return lines;
}
