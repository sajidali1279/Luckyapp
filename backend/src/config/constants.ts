// Shared runtime constants — read once from env at startup
export const DEFAULT_CASHBACK_RATE = parseFloat(process.env.DEFAULT_CASHBACK_RATE || '0.05'); // fallback only
// The platform fee is a share of the CASHBACK issued (the deal is 10%). This is the rate a store gets when none is set; every store has its own
// rate (Billing > Stores) and that is the one billed. A store added later starts here.
export const DEFAULT_DEV_CUT_RATE  = parseFloat(process.env.DEV_CUT_RATE          || '0.10');
// The most a store's fee can be set to, so a slip (1 for 0.1) cannot bill 100% of a store's cashback.
export const MAX_STORE_FEE_RATE    = 0.25;

// Default tier-based cashback rates (used when TierCashbackRate rows not yet seeded in DB)
// Bronze=1%, Silver=2%, Gold=3%, Diamond=4%, Platinum=5%
export const DEFAULT_TIER_RATES: Record<string, number> = {
  BRONZE:   0.01,
  SILVER:   0.02,
  GOLD:     0.03,
  DIAMOND:  0.04,
  PLATINUM: 0.05,
};

// Compound cashback rate guard — prevents misconfigured category/promo rates from over-issuing.
// Warn flag added above WARN, hard-cap applied at CAP (transaction still processes, just capped).
export const CASHBACK_RATE_WARN = 0.075; // 7.5% — flag for admin review
export const CASHBACK_RATE_CAP  = 0.10;  // 10% — hard ceiling, never exceeded
