// Shared runtime constants — read once from env at startup
export const DEFAULT_CASHBACK_RATE = parseFloat(process.env.DEFAULT_CASHBACK_RATE || '0.05'); // fallback only
export const DEFAULT_DEV_CUT_RATE  = parseFloat(process.env.DEV_CUT_RATE          || '0.02'); // per-store override takes precedence

// Default tier-based cashback rates (used when TierCashbackRate rows not yet seeded in DB)
// Bronze=1%, Silver=2%, Gold=3%, Diamond=4%, Platinum=5%
export const DEFAULT_TIER_RATES: Record<string, number> = {
  BRONZE:   0.01,
  SILVER:   0.02,
  GOLD:     0.03,
  DIAMOND:  0.04,
  PLATINUM: 0.05,
};
