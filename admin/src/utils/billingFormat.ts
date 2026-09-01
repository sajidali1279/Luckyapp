export interface BillNotes {
  txCount: number; purchaseVolume: number;
  cashbackIssued: number; devCutEarned: number; customerCashback: number;
  effectiveCashbackRate: number; effectiveDevCutRate: number;
  categories: { category: string; txCount: number; purchaseVolume: number; cashbackIssued: number; devCutEarned: number; customerCashback: number }[];
  subscriptionFee: number; transactionFeeRate: number; transactionFee: number;
  cashbackFee: number; totalAmountOwed: number; periodStart: string; periodEnd: string;
  generatedBy?: 'cron' | 'manual';
}

export function fmt$(n: number) { return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
export function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }
