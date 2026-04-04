import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, FlatList, ActivityIndicator, Modal, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { catalogApi, pointsApi } from '../../services/api';
import { COLORS } from '../../constants';

// ─── Tier config ───────────────────────────────────────────────────────────────
const TIER_CONFIG: Record<string, { label: string; color: string; emoji: string; next?: string }> = {
  BRONZE:   { label: 'Bronze',   color: '#CD7F32', emoji: '🥉', next: 'SILVER' },
  SILVER:   { label: 'Silver',   color: '#A0A0B0', emoji: '🥈', next: 'GOLD' },
  GOLD:     { label: 'Gold',     color: '#F4A226', emoji: '🥇', next: 'DIAMOND' },
  DIAMOND:  { label: 'Diamond',  color: '#00B4D8', emoji: '💎', next: 'PLATINUM' },
  PLATINUM: { label: 'Platinum', color: '#9B5DE5', emoji: '👑' },
};

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

// ─── Catalog config ────────────────────────────────────────────────────────────
type Category = 'ALL' | 'IN_STORE' | 'GAS' | 'HOT_FOODS';

const CATEGORIES: { key: Category; label: string; emoji: string; color: string }[] = [
  { key: 'ALL',       label: 'All',       emoji: '🏷️', color: COLORS.secondary },
  { key: 'IN_STORE',  label: 'In-Store',  emoji: '🛒', color: '#2A9D8F' },
  { key: 'GAS',       label: 'Gas',       emoji: '⛽', color: '#F4A226' },
  { key: 'HOT_FOODS', label: 'Hot Foods', emoji: '🌮', color: '#E63946' },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// ─── Countdown hook ────────────────────────────────────────────────────────────
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return { remaining, mins, secs, expired: remaining === 0 };
}

// ─── Tier progress bar ─────────────────────────────────────────────────────────
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
        <View style={pb.track}><View style={[pb.fill, { width: '100%', backgroundColor: cfg.color }]} /></View>
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

// ─── Active redemption banner ──────────────────────────────────────────────────
function ActiveRedemptionBanner({ redemption, onCancel }: { redemption: any; onCancel: () => void }) {
  const { mins, secs, expired } = useCountdown(redemption.expiresAt);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1.03, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]));
    anim.start();
    return () => anim.stop();
  }, []);
  if (expired) return null;
  const urgency = mins < 5;
  return (
    <Animated.View style={[r.activeBanner, urgency && r.activeBannerUrgent, { transform: [{ scale: pulse }] }]}>
      <View style={r.activeBannerLeft}>
        <Text style={r.activeBannerEmoji}>{redemption.catalogItem?.emoji || '🎁'}</Text>
        <View style={r.activeBannerInfo}>
          <Text style={r.activeBannerTitle}>{redemption.catalogItem?.title}</Text>
          <Text style={r.activeBannerSub}>Show code to cashier</Text>
        </View>
      </View>
      <View style={r.activeBannerRight}>
        <View style={r.codeBox}><Text style={r.codeText}>{redemption.redemptionCode}</Text></View>
        <Text style={[r.timerText, urgency && { color: '#E63946' }]}>
          {mins}:{secs.toString().padStart(2, '0')}
        </Text>
        <TouchableOpacity onPress={onCancel} style={r.cancelSmall}>
          <Text style={r.cancelSmallText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Catalog tile ──────────────────────────────────────────────────────────────
function CatalogTile({ item, pts, onRedeem }: { item: any; pts: number; onRedeem: (item: any) => void }) {
  const catCfg = CAT_MAP[item.category as Category] || CAT_MAP.IN_STORE;
  const canAfford = pts >= item.pointsCost;
  const shortage = item.pointsCost - pts;
  return (
    <View style={[ct.tile, canAfford && { borderColor: catCfg.color + '40' }, !canAfford && ct.tileLocked]}>
      <View style={[ct.catTag, { backgroundColor: catCfg.color + '15' }]}>
        <Text style={[ct.catTagText, { color: catCfg.color }]}>{catCfg.emoji} {catCfg.label}</Text>
      </View>
      <View style={[ct.emojiRing, { backgroundColor: catCfg.color + (canAfford ? '20' : '0d') }]}>
        <Text style={ct.emoji}>{item.emoji || '🎁'}</Text>
      </View>
      <Text style={ct.title} numberOfLines={2}>{item.title}</Text>
      {item.description ? <Text style={ct.desc} numberOfLines={2}>{item.description}</Text> : null}
      {item.category === 'HOT_FOODS' && <Text style={ct.locationNote}>📍 Select locations</Text>}
      <View style={ct.footer}>
        <View style={[ct.costBadge, canAfford && { backgroundColor: catCfg.color }]}>
          <Text style={[ct.costPts, !canAfford && { color: COLORS.textMuted }]}>{item.pointsCost.toLocaleString()}</Text>
          <Text style={[ct.costLabel, !canAfford && { color: COLORS.textMuted }]}>pts</Text>
        </View>
        {canAfford ? (
          <TouchableOpacity style={[ct.redeemBtn, { backgroundColor: catCfg.color }]} onPress={() => onRedeem(item)} activeOpacity={0.8}>
            <Text style={ct.redeemBtnText}>Redeem</Text>
          </TouchableOpacity>
        ) : (
          <Text style={ct.shortage}>-{shortage.toLocaleString()} pts</Text>
        )}
      </View>
    </View>
  );
}

// ─── Redeem confirmation modal ─────────────────────────────────────────────────
function RedeemModal({ item, pts, onConfirm, onClose, loading }: {
  item: any; pts: number; onConfirm: () => void; onClose: () => void; loading: boolean;
}) {
  const catCfg = CAT_MAP[item.category as Category] || CAT_MAP.IN_STORE;
  const remaining = pts - item.pointsCost;
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={[md.itemIcon, { backgroundColor: catCfg.color + '18' }]}>
            <Text style={md.itemEmoji}>{item.emoji || '🎁'}</Text>
          </View>
          <Text style={md.itemTitle}>{item.title}</Text>
          {item.description ? <Text style={md.itemDesc}>{item.description}</Text> : null}
          <View style={md.costRow}>
            <View style={md.costBox}>
              <Text style={md.costLabel}>Cost</Text>
              <Text style={md.costVal}>{item.pointsCost.toLocaleString()} pts</Text>
            </View>
            <Text style={md.arrow}>→</Text>
            <View style={md.costBox}>
              <Text style={md.costLabel}>Remaining</Text>
              <Text style={[md.costVal, { color: remaining < 0 ? '#E63946' : COLORS.success }]}>
                {remaining.toLocaleString()} pts
              </Text>
            </View>
          </View>
          <View style={md.warningBox}>
            <Text style={md.warningIcon}>⏱️</Text>
            <Text style={md.warningText}>
              Points deducted immediately. Show the code to the cashier within <Text style={{ fontWeight: '800' }}>30 minutes</Text> or points are refunded.
            </Text>
          </View>
          <TouchableOpacity
            style={[md.confirmBtn, { backgroundColor: catCfg.color }, loading && { opacity: 0.6 }]}
            onPress={onConfirm} disabled={loading} activeOpacity={0.85}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={md.confirmBtnText}>Redeem Now — {item.pointsCost.toLocaleString()} pts</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={md.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={md.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Success modal ─────────────────────────────────────────────────────────────
function SuccessModal({ data, onClose }: { data: any; onClose: () => void }) {
  const { mins, secs, expired } = useCountdown(data.expiresAt);
  const urgency = mins < 5;
  if (expired) {
    return (
      <Modal transparent animationType="fade" onRequestClose={onClose}>
        <View style={md.overlay}>
          <View style={[md.sheet, { paddingTop: 32 }]}>
            <View style={[md.itemIcon, { backgroundColor: '#FFF0F0', width: 80, height: 80, borderRadius: 24 }]}>
              <Text style={{ fontSize: 40 }}>⏰</Text>
            </View>
            <Text style={[md.itemTitle, { marginTop: 12, color: '#E63946' }]}>Redemption Expired</Text>
            <Text style={md.itemDesc}>The 30-minute window passed before the cashier scanned your code.</Text>
            <View style={suc.refundCard}>
              <Text style={suc.refundIcon}>✅</Text>
              <View>
                <Text style={suc.refundTitle}>Points Refunded</Text>
                <Text style={suc.refundSub}>{data.pointsSpent} pts returned to your balance</Text>
              </View>
            </View>
            <TouchableOpacity style={[md.confirmBtn, { backgroundColor: COLORS.primary }]} onPress={onClose}>
              <Text style={md.confirmBtnText}>Redeem Again</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={md.overlay}>
        <View style={[md.sheet, { paddingTop: 32 }]}>
          <View style={[md.itemIcon, { backgroundColor: '#2DC65318', width: 80, height: 80, borderRadius: 24 }]}>
            <Text style={{ fontSize: 40 }}>✅</Text>
          </View>
          <Text style={[md.itemTitle, { marginTop: 12 }]}>Redemption Active!</Text>
          <Text style={md.itemDesc}>Show this code to the cashier to complete your reward</Text>
          <View style={suc.codeCard}>
            <Text style={suc.codeLabel}>YOUR CODE</Text>
            <Text style={suc.code}>{data.redemptionCode}</Text>
            <Text style={suc.codeHint}>Cashier will scan your QR + enter this code</Text>
          </View>
          <View style={[suc.timerCard, urgency && { borderColor: '#E63946', backgroundColor: '#FFF0F0' }]}>
            <Text style={suc.timerLabel}>Expires in</Text>
            <Text style={[suc.timer, urgency && { color: '#E63946' }]}>
              {mins}:{secs.toString().padStart(2, '0')}
            </Text>
            <Text style={suc.timerSub}>Points are refunded if not scanned in time</Text>
          </View>
          <TouchableOpacity style={[md.confirmBtn, { backgroundColor: COLORS.secondary }]} onPress={onClose}>
            <Text style={md.confirmBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ───────────────────────────────────────────────────────────────
export default function RewardsScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const pts = Math.round(Number(user?.pointsBalance || 0) * 100);
  const tier = user?.tier || 'BRONZE';
  const periodPts = Math.round(Number(user?.periodPoints || 0) * 100);
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;
  const benefits = TIER_BENEFITS[tier] || [];

  const [activeCategory, setActiveCategory] = useState<Category>('ALL');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [successData, setSuccessData] = useState<any>(null);
  const [benefitModal, setBenefitModal] = useState(false);

  const { data: benefitData } = useQuery({
    queryKey: ['my-benefit-status'],
    queryFn: () => pointsApi.getMyBenefitStatus(),
    enabled: tier !== 'BRONZE',
    refetchInterval: 60000,
  });
  const benefitStatus = benefitData?.data?.data;

  const { data: catalogData, isLoading: catalogLoading, refetch, isRefetching } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => catalogApi.getActive(),
  });

  const { data: redemptionsData } = useQuery({
    queryKey: ['my-redemptions'],
    queryFn: () => catalogApi.getMyRedemptions(),
    refetchInterval: 15000,
  });

  const redeemMutation = useMutation({
    mutationFn: (catalogItemId: string) => catalogApi.initiateRedemption(catalogItemId),
    onSuccess: (res) => {
      setSelectedItem(null);
      setSuccessData(res.data.data);
      qc.invalidateQueries({ queryKey: ['my-redemptions'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e.response?.data?.error || 'Redemption failed' }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => catalogApi.cancelRedemption(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-redemptions'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
      Toast.show({ type: 'success', text1: 'Redemption cancelled', text2: 'Points refunded to your balance' });
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e.response?.data?.error || 'Cancel failed' }),
  });

  const allItems: any[] = catalogData?.data?.data || [];
  const filtered = activeCategory === 'ALL' ? allItems : allItems.filter(i => i.category === activeCategory);
  const now = new Date();
  const pendingRedemptions: any[] = (redemptionsData?.data?.data || [])
    .filter((r: any) => r.status === 'PENDING' && new Date(r.expiresAt) > now);

  function handleCancelRedemption(redemption: any) {
    Alert.alert(
      'Cancel Redemption?',
      `Cancel "${redemption.catalogItem?.title}"? Your ${redemption.pointsSpent} pts will be refunded.`,
      [
        { text: 'Keep It', style: 'cancel' },
        { text: 'Cancel Redemption', style: 'destructive', onPress: () => cancelMutation.mutate(redemption.id) },
      ]
    );
  }

  return (
    <View style={r.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* ── Header ── */}
      <SafeAreaView style={r.headerBg}>
        <View style={r.headerInner}>
          <Text style={r.headerTitle}>⭐ Rewards</Text>
          <View style={[r.ptsPill, { backgroundColor: tierCfg.color }]}>
            <Text style={r.ptsPillText}>{pts.toLocaleString()} pts</Text>
          </View>
        </View>
      </SafeAreaView>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={r.row}
        contentContainerStyle={r.body}
        onRefresh={refetch}
        refreshing={isRefetching}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <>
            {/* ── Balance card + tier ── */}
            <View style={[r.balanceCard, { backgroundColor: tierCfg.color }]}>
              <View style={r.balanceCardTop}>
                <View>
                  <Text style={r.balanceLabel}>Your Points Balance</Text>
                  <Text style={r.balanceAmount}>{pts.toLocaleString()}</Text>
                  <Text style={r.balanceSub}>points</Text>
                </View>
                <View style={r.tierBadgeLarge}>
                  <Text style={r.tierBadgeLargeEmoji}>{tierCfg.emoji}</Text>
                  <Text style={r.tierBadgeLargeLabel}>{tierCfg.label}</Text>
                </View>
              </View>
              <TierProgressBar tier={tier} periodPts={periodPts} />
            </View>

            {/* ── Tier benefits ── */}
            {benefits.length > 0 && (
              <TouchableOpacity style={r.sectionCard} onPress={() => setBenefitModal(true)} activeOpacity={0.8}>
                <View style={r.sectionTitleRow}>
                  <Text style={[r.sectionTitle, { color: tierCfg.color }]}>{tierCfg.emoji} Your {tierCfg.label} Benefits</Text>
                  <Text style={[r.howToUse, { color: tierCfg.color }]}>How to use →</Text>
                </View>
                {benefits.map((b, i) => {
                  const isDaily = b.includes('free drink') || b.includes('free fountain');
                  const available = benefitStatus?.available;
                  const remaining = benefitStatus?.silverRemaining;
                  return (
                    <View key={i} style={r.benefitRow}>
                      <Text style={[r.benefitDot, { color: tierCfg.color }]}>●</Text>
                      <Text style={r.benefitText}>{b}</Text>
                      {isDaily && benefitStatus && (
                        <View style={[r.benefitStatusPill, { backgroundColor: available ? '#E8F5E9' : '#FFF3E0' }]}>
                          <Text style={[r.benefitStatusText, { color: available ? COLORS.success : '#F4A226' }]}>
                            {tier === 'SILVER' ? `${remaining} left` : available ? 'Available' : 'Used today'}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </TouchableOpacity>
            )}

            {/* ── Active redemption banners ── */}
            {pendingRedemptions.map(rd => (
              <ActiveRedemptionBanner key={rd.id} redemption={rd} onCancel={() => handleCancelRedemption(rd)} />
            ))}

            {/* ── Redeem Rewards header + category filter ── */}
            <View style={r.redeemHeader}>
              <Text style={r.redeemTitle}>🏷️ Redeem Rewards</Text>
              <Text style={r.redeemSub}>Use your points for free items</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={r.catRow}>
              {CATEGORIES.map(cat => {
                const active = activeCategory === cat.key;
                const count = cat.key === 'ALL' ? allItems.length : allItems.filter(i => i.category === cat.key).length;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    style={[r.catPill, active && { backgroundColor: cat.color, borderColor: cat.color }]}
                    onPress={() => setActiveCategory(cat.key)}
                    activeOpacity={0.75}
                  >
                    <Text style={r.catPillEmoji}>{cat.emoji}</Text>
                    <Text style={[r.catPillLabel, active && { color: '#fff' }]}>{cat.label}</Text>
                    {count > 0 && (
                      <View style={[r.catCount, active && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                        <Text style={[r.catCountText, active && { color: '#fff' }]}>{count}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {catalogLoading && (
              <View style={r.loadingRow}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={r.loadingText}>Loading rewards…</Text>
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !catalogLoading ? (
            <View style={r.emptyBox}>
              <Text style={r.emptyEmoji}>{CATEGORIES.find(c => c.key === activeCategory)?.emoji || '🏷️'}</Text>
              <Text style={r.emptyTitle}>
                {activeCategory === 'ALL' ? 'No rewards yet' : `No ${CATEGORIES.find(c => c.key === activeCategory)?.label} rewards yet`}
              </Text>
              <Text style={r.emptySub}>Check back soon — new rewards are added regularly</Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          filtered.length > 0 ? (
            <View style={r.hint}>
              <Text style={r.hintIcon}>💡</Text>
              <Text style={r.hintText}>Tap Redeem → show the code to the cashier → they scan your QR to confirm.</Text>
            </View>
          ) : <View style={{ height: 32 }} />
        }
        renderItem={({ item }) => (
          <CatalogTile item={item} pts={pts} onRedeem={setSelectedItem} />
        )}
      />

      {selectedItem && (
        <RedeemModal
          item={selectedItem} pts={pts}
          loading={redeemMutation.isPending}
          onConfirm={() => redeemMutation.mutate(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
        />
      )}
      {successData && (
        <SuccessModal data={successData} onClose={() => setSuccessData(null)} />
      )}

      {/* ── Benefit How-to Modal ── */}
      <Modal transparent animationType="slide" visible={benefitModal} onRequestClose={() => setBenefitModal(false)}>
        <View style={md.overlay}>
          <View style={[md.sheet, { paddingTop: 28 }]}>
            <View style={[md.itemIcon, { backgroundColor: tierCfg.color + '18', width: 72, height: 72, borderRadius: 22 }]}>
              <Text style={{ fontSize: 36 }}>{tierCfg.emoji}</Text>
            </View>
            <Text style={[md.itemTitle, { color: tierCfg.color }]}>{tierCfg.label} Benefits</Text>

            {/* Status pill */}
            {benefitStatus && (
              <View style={[bm.statusPill, { backgroundColor: benefitStatus.available ? '#E8F5E9' : '#FFF3E0' }]}>
                <Text style={[bm.statusText, { color: benefitStatus.available ? COLORS.success : '#F4A226' }]}>
                  {tier === 'SILVER'
                    ? `${benefitStatus.silverRemaining} fountain drinks remaining this period`
                    : benefitStatus.available ? '✓ Benefit available today' : '✗ Already used today — resets tomorrow'}
                </Text>
              </View>
            )}

            {/* Steps */}
            <View style={bm.stepsBox}>
              <Text style={bm.stepsTitle}>How to claim at the register</Text>
              {[
                { n: '1', text: 'Open the app and go to your QR code on the Home tab' },
                { n: '2', text: 'Show the cashier your QR code and ask for your ' + (tier === 'SILVER' ? 'free fountain drink' : 'free drink or coffee') },
                { n: '3', text: 'The cashier will scan your QR and apply the benefit — nothing else needed' },
              ].map(step => (
                <View key={step.n} style={bm.stepRow}>
                  <View style={[bm.stepNum, { backgroundColor: tierCfg.color }]}>
                    <Text style={bm.stepNumText}>{step.n}</Text>
                  </View>
                  <Text style={bm.stepText}>{step.text}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[md.confirmBtn, { backgroundColor: tierCfg.color }]} onPress={() => setBenefitModal(false)}>
              <Text style={md.confirmBtnText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const pb = StyleSheet.create({
  container: { gap: 6, marginTop: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tierLabel: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
  nextLabel: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.6)' },
  maxLabel: { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '600' },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.2)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  ptsLabel: { fontSize: 11, color: 'rgba(255,255,255,0.65)', fontWeight: '600' },
  remainLabel: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.9)' },
});

const r = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  headerBg: { backgroundColor: COLORS.secondary },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  ptsPill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 },
  ptsPillText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  body: { padding: 12, paddingBottom: 40 },
  row: { gap: 10, marginBottom: 10 },

  // Balance card
  balanceCard: {
    borderRadius: 22, padding: 22, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 5,
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
  tierBadgeLargeLabel: { color: '#fff', fontSize: 12, fontWeight: '800', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Section card (benefits)
  sectionCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18, gap: 10, marginBottom: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  howToUse: { fontSize: 12, fontWeight: '700' },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  benefitDot: { fontSize: 10, fontWeight: '800' },
  benefitText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 21 },
  benefitStatusPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  benefitStatusText: { fontSize: 11, fontWeight: '800' },

  // Active redemption banner
  activeBanner: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#E8F5E9', borderRadius: 16, padding: 14, marginBottom: 10,
    borderWidth: 2, borderColor: COLORS.success + '60',
  },
  activeBannerUrgent: { backgroundColor: '#FFF3E0', borderColor: '#F4A226' },
  activeBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  activeBannerEmoji: { fontSize: 26 },
  activeBannerInfo: { flex: 1 },
  activeBannerTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  activeBannerSub: { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  activeBannerRight: { alignItems: 'center', gap: 4, marginLeft: 8 },
  codeBox: { backgroundColor: COLORS.secondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6 },
  codeText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  timerText: { fontSize: 14, fontWeight: '900', color: COLORS.success },
  cancelSmall: { paddingVertical: 2, paddingHorizontal: 6 },
  cancelSmallText: { fontSize: 11, color: COLORS.error, fontWeight: '700' },

  // Redeem section header
  redeemHeader: { marginBottom: 12, marginTop: 4 },
  redeemTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  redeemSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, fontWeight: '600' },

  // Category pills
  catRow: { gap: 8, paddingBottom: 14, flexDirection: 'row' },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.white, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  catPillEmoji: { fontSize: 13 },
  catPillLabel: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  catCount: {
    backgroundColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  catCountText: { color: COLORS.textMuted, fontSize: 10, fontWeight: '800' },

  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16, justifyContent: 'center' },
  loadingText: { color: COLORS.textMuted, fontSize: 13 },

  emptyBox: { alignItems: 'center', padding: 40, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  hint: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.secondary + '18',
    marginTop: 4,
  },
  hintIcon: { fontSize: 18 },
  hintText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },
});

const ct = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 18,
    padding: 14, borderWidth: 1.5, borderColor: COLORS.border,
    gap: 8, alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  tileLocked: { opacity: 0.65 },
  catTag: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  catTagText: { fontSize: 10, fontWeight: '800' },
  emojiRing: { width: 54, height: 54, borderRadius: 16, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  emoji: { fontSize: 28 },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text, lineHeight: 19, width: '100%' },
  desc: { fontSize: 11, color: COLORS.textMuted, lineHeight: 15, width: '100%' },
  locationNote: { fontSize: 10, color: '#E65100', fontWeight: '700' },
  footer: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  costBadge: { backgroundColor: COLORS.border, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center' },
  costPts: { fontSize: 13, fontWeight: '900', color: '#fff' },
  costLabel: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  redeemBtn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  redeemBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  shortage: { fontSize: 11, color: COLORS.error, fontWeight: '700' },
});

const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36, alignItems: 'center', gap: 12,
  },
  itemIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  itemEmoji: { fontSize: 36 },
  itemTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  itemDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'center', marginTop: 4 },
  costBox: { alignItems: 'center', flex: 1 },
  costLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  costVal: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  arrow: { fontSize: 22, color: COLORS.textMuted },
  warningBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FFE082', width: '100%',
  },
  warningIcon: { fontSize: 20 },
  warningText: { flex: 1, fontSize: 13, color: '#5D4037', lineHeight: 19 },
  confirmBtn: {
    width: '100%', borderRadius: 16, padding: 17, alignItems: 'center', marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },
});

const suc = StyleSheet.create({
  codeCard: {
    width: '100%', backgroundColor: COLORS.secondary, borderRadius: 18,
    padding: 20, alignItems: 'center', gap: 6,
  },
  codeLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  code: { color: '#fff', fontSize: 40, fontWeight: '900', letterSpacing: 8 },
  codeHint: { color: 'rgba(255,255,255,0.55)', fontSize: 11, textAlign: 'center', marginTop: 4 },
  timerCard: {
    width: '100%', backgroundColor: '#F0FFF4', borderRadius: 16,
    padding: 16, alignItems: 'center', gap: 4,
    borderWidth: 1.5, borderColor: COLORS.success + '50',
  },
  timerLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  timer: { fontSize: 36, fontWeight: '900', color: COLORS.success },
  timerSub: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  refundCard: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F0FFF4', borderRadius: 16, padding: 16,
    borderWidth: 1.5, borderColor: COLORS.success + '50',
  },
  refundIcon: { fontSize: 28 },
  refundTitle: { fontSize: 15, fontWeight: '800', color: COLORS.success },
  refundSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
});

const bm = StyleSheet.create({
  statusPill: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, width: '100%', alignItems: 'center' },
  statusText: { fontSize: 13, fontWeight: '800', textAlign: 'center' },
  stepsBox: {
    width: '100%', backgroundColor: COLORS.background, borderRadius: 16,
    padding: 16, gap: 14,
  },
  stepsTitle: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  stepNumText: { color: '#fff', fontSize: 13, fontWeight: '900' },
  stepText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20 },
});
