export const API_URL = 'https://api.luckystop.cliffindus.com/api';

export const COLORS = {
  primary: '#CC2936',      // Lucky Stop sign red (matches physical store logo)
  secondary: '#1D3557',    // Deep navy
  accent: '#F4A261',       // Warm orange for highlights
  background: '#F8F9FA',
  white: '#FFFFFF',
  text: '#212529',
  textMuted: '#6C757D',
  success: '#2DC653',
  error: '#A01020',        // Distinct darker red — NOT the same as primary
  border: '#DEE2E6',
  // Status tokens (pending/accepted/declined) — text/bg/border/dot shades
  statusPendingText: '#b45309',
  statusPendingBg: '#fffbeb',
  statusPendingBorder: '#fde68a',
  statusPendingDot: '#f59e0b',
  statusAcceptedText: '#065f46',
  statusAcceptedBg: '#f0fdf4',
  statusAcceptedBorder: '#86efac',
  statusAcceptedDot: '#22c55e',
  statusDeclinedText: '#9f1239',
  statusDeclinedBg: '#fff1f2',
  statusDeclinedBorder: '#fecaca',
  statusDeclinedDot: '#ef4444',
};

export const CASHBACK_RATE = 0.05; // 5% shown to customers

export const TIER_CONFIG: Record<string, {
  color: string; label: string; icon: string; emoji: string;
  next?: string; nextLabel: string | null;
  thresholdPts: number; nextThresholdPts: number | null;
  benefits: string[];
}> = {
  BRONZE:   { color: '#CD7F32', label: 'Bronze',   icon: '🥉', emoji: '🥉', next: 'SILVER',   nextLabel: 'Silver',   thresholdPts: 0,     nextThresholdPts: 5000,  benefits: ['1% cashback on all purchases', 'Access to all 12 Lucky Stop locations', 'Member-only deals & promotions'] },
  SILVER:   { color: '#A8A9AD', label: 'Silver',   icon: '🥈', emoji: '🥈', next: 'GOLD',     nextLabel: 'Gold',     thresholdPts: 5000,  nextThresholdPts: 15000, benefits: ['2% cashback (2× Bronze rate)', '7 free fountain refills this period — use any time, bring your own cup', 'Silver-exclusive offers & rewards'] },
  GOLD:     { color: '#FFD700', label: 'Gold',     icon: '🥇', emoji: '🥇', next: 'DIAMOND',  nextLabel: 'Diamond',  thresholdPts: 15000, nextThresholdPts: 30000, benefits: ['3% cashback on all purchases', '1 free fountain refill daily (bring your own cup)', '+5¢ bonus per gallon on gas', 'Gold-exclusive catalog items'] },
  DIAMOND:  { color: '#7dd8f8', label: 'Diamond',  icon: '💎', emoji: '💎', next: 'PLATINUM', nextLabel: 'Platinum', thresholdPts: 30000, nextThresholdPts: 45000, benefits: ['4% cashback on all purchases', '1 free fountain refill daily (bring your own cup)', '+7¢ bonus per gallon on gas', 'Diamond-exclusive limited drops', 'Early access to new rewards'] },
  PLATINUM: { color: '#E5E4E2', label: 'Platinum', icon: '👑', emoji: '👑', next: undefined,  nextLabel: null,       thresholdPts: 45000, nextThresholdPts: null,  benefits: ['5% cashback — maximum rate', '1 free fountain refill daily (bring your own cup)', '+10¢ bonus per gallon on gas', 'Platinum vault — top-tier rewards only', 'Highest loyalty status'] },
};
