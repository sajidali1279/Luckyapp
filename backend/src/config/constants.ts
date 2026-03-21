// Shared runtime constants — read once from env at startup
export const DEFAULT_CASHBACK_RATE = parseFloat(process.env.DEFAULT_CASHBACK_RATE || '0.05');
export const DEFAULT_DEV_CUT_RATE  = parseFloat(process.env.DEV_CUT_RATE          || '0.04');
