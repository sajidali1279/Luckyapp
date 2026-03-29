import { View, Text, StyleSheet, TouchableOpacity, ScrollView, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

const TIER_CONFIG: Record<string, { label: string; color: string; emoji: string; next?: string }> = {
  BRONZE:   { label: 'Bronze',   color: '#CD7F32', emoji: '🥉', next: 'SILVER' },
  SILVER:   { label: 'Silver',   color: '#A0A0B0', emoji: '🥈', next: 'GOLD' },
  GOLD:     { label: 'Gold',     color: '#F4A226', emoji: '🥇', next: 'DIAMOND' },
  DIAMOND:  { label: 'Diamond',  color: '#00B4D8', emoji: '💎', next: 'PLATINUM' },
  PLATINUM: { label: 'Platinum', color: '#9B5DE5', emoji: '👑' },
};

// Thresholds in pts (dollars × 100)
const TIER_THRESHOLDS: Record<string, number> = {
  BRONZE: 0, SILVER: 5000, GOLD: 15000, DIAMOND: 30000, PLATINUM: 45000,
};

const TIER_BENEFITS: Record<string, string[]> = {
  BRONZE:   [],
  SILVER:   ['30 free fountain drinks this period'],
  GOLD:     ['1 free drink or coffee per day', '+5 pts per gallon on gas'],
  DIAMOND:  ['1 free drink or coffee per day', '+7 pts per gallon on gas'],
  PLATINUM: ['1 free drink or coffee per day', '+10 pts per gallon on gas'],
};

function TierProgressBar({ tier, periodPts }: { tier: string; periodPts: number }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;
  const nextTier = cfg.next;
  if (!nextTier) {
    return (
      <View style={pb.container}>
        <View style={pb.row}>
          <Text style={pb.tierLabel}>{cfg.emoji} {cfg.label}</Text>
          <Text style={pb.maxLabel}>Max tier — Platinum!</Text>
        </View>
        <View style={pb.track}>
          <View style={[pb.fill, { width: '100%', backgroundColor: cfg.color }]} />
        </View>
      </View>
    );
  }
  const nextCfg = TIER_CONFIG[nextTier];
  const from = TIER_THRESHOLDS[tier];
  const to = TIER_THRESHOLDS[nextTier];
  const progress = Math.min(1, Math.max(0, (periodPts - from) / (to - from)));
  const remaining = Math.max(0, to - periodPts);

  return (
    <View style={pb.container}>
      <View style={pb.row}>
        <Text style={pb.tierLabel}>{cfg.emoji} {cfg.label}</Text>
        <Text style={pb.nextLabel}>{nextCfg.emoji} {nextCfg.label}</Text>
      </View>
      <View style={pb.track}>
        <View style={[pb.fill, { width: `${Math.round(progress * 100)}%`, backgroundColor: cfg.color }]} />
      </View>
      <View style={pb.row}>
        <Text style={pb.ptsLabel}>{periodPts.toLocaleString()} pts this period</Text>
        <Text style={pb.remainLabel}>{remaining.toLocaleString()} to go</Text>
      </View>
    </View>
  );
}

export default function RewardsScreen() {
  const { user } = useAuthStore();
  const pts = Math.round(Number(user?.pointsBalance || 0) * 100);
  const tier = user?.tier || 'BRONZE';
  const periodPts = Math.round(Number(user?.periodPoints || 0) * 100);
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;
  const benefits = TIER_BENEFITS[tier] || TIER_BENEFITS.BRONZE;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>🎁 Rewards</Text>
          <View style={[s.ptsPill, { backgroundColor: tierCfg.color }]}>
            <Text style={s.ptsPillText}>{pts.toLocaleString()} pts</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

        {/* Balance card */}
        <View style={[s.balanceCard, { backgroundColor: tierCfg.color }]}>
          <View style={s.balanceCardTop}>
            <View>
              <Text style={s.balanceLabel}>Your Points Balance</Text>
              <Text style={s.balanceAmount}>{pts.toLocaleString()}</Text>
              <Text style={s.balanceSub}>points</Text>
            </View>
            <View style={s.tierBadgeLarge}>
              <Text style={s.tierBadgeLargeEmoji}>{tierCfg.emoji}</Text>
              <Text style={s.tierBadgeLargeLabel}>{tierCfg.label}</Text>
            </View>
          </View>
          <TierProgressBar tier={tier} periodPts={periodPts} />
        </View>

        {/* Tier benefits — only shown for Silver and above */}
        {benefits.length > 0 && (
          <View style={s.sectionCard}>
            <Text style={[s.sectionTitle, { color: tierCfg.color }]}>
              {tierCfg.emoji} Your {tierCfg.label} Benefits
            </Text>
            {benefits.map((b, i) => (
              <View key={i} style={s.benefitRow}>
                <Text style={[s.benefitDot, { color: tierCfg.color }]}>●</Text>
                <Text style={s.benefitText}>{b}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Catalog CTA */}
        <TouchableOpacity
          style={s.catalogCta}
          onPress={() => router.push('/(customer)/catalog')}
          activeOpacity={0.85}
        >
          <View style={s.catalogCtaLeft}>
            <Text style={s.catalogCtaEmoji}>🏷️</Text>
            <View>
              <Text style={s.catalogCtaTitle}>Browse Reward Catalog</Text>
              <Text style={s.catalogCtaSub}>Gas, in-store, hot foods & more</Text>
            </View>
          </View>
          <View style={s.catalogCtaArrow}>
            <Text style={s.catalogCtaArrowText}>›</Text>
          </View>
        </TouchableOpacity>

        {/* How it works */}
        <Text style={[s.listTitle, { marginTop: 4 }]}>How points work</Text>
        <View style={s.sectionCard}>
          {[
            { icon: '🛒', title: 'Shop at Lucky Stop', desc: 'Buy anything at any Lucky Stop location.' },
            { icon: '📱', title: 'Show your QR code', desc: 'Cashier scans it to grant points to your account.' },
            { icon: '🎁', title: 'Redeem at the register', desc: 'Ask the cashier to process your catalog reward using your QR code.' },
          ].map((step, i) => (
            <View key={i} style={[s.stepRow, i > 0 && s.stepRowBorder]}>
              <View style={s.stepNum}><Text style={s.stepNumText}>{i + 1}</Text></View>
              <Text style={s.stepIcon}>{step.icon}</Text>
              <View style={s.stepContent}>
                <Text style={s.stepTitle}>{step.title}</Text>
                <Text style={s.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {pts > 0 && (
          <TouchableOpacity style={s.qrBtn} onPress={() => router.push('/(customer)/home')}>
            <Text style={s.qrBtnText}>Show My QR Code →</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

const pb = StyleSheet.create({
  container: { gap: 6, marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  nextLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  maxLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  track: {
    height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  ptsLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  remainLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  headerBg: { backgroundColor: COLORS.secondary },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  ptsPill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  ptsPillText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  body: { padding: 16, gap: 14, paddingBottom: 32 },

  balanceCard: {
    borderRadius: 22, padding: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
  },
  balanceCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  balanceLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  balanceAmount: { fontSize: 52, fontWeight: '900', color: '#fff', marginTop: 4, letterSpacing: -1.5 },
  balanceSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600', marginTop: 2 },

  tierBadgeLarge: {
    alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
  },
  tierBadgeLargeEmoji: { fontSize: 28 },
  tierBadgeLargeLabel: {
    color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 4,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },

  sectionCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18, gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },

  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  benefitDot: { fontSize: 10, marginTop: 4, fontWeight: '800' },
  benefitText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 21 },

  listTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },

  catalogCta: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#9B5DE5' + '35',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  catalogCtaLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  catalogCtaEmoji: { fontSize: 30 },
  catalogCtaTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  catalogCtaSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  catalogCtaArrow: {
    width: 36, height: 36, borderRadius: 12,
    backgroundColor: '#9B5DE5', alignItems: 'center', justifyContent: 'center',
  },
  catalogCtaArrowText: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },

  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 10 },
  stepRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepIcon: { fontSize: 24, flexShrink: 0 },
  stepContent: { flex: 1 },
  stepTitle: { fontWeight: '700', fontSize: 14, color: COLORS.text },
  stepDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 17 },

  qrBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 4,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  qrBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
