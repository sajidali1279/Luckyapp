import { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar,
  TouchableOpacity, ActivityIndicator, FlatList,
  Modal, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { catalogApi } from '../../services/api';
import { COLORS } from '../../constants';

type Category = 'ALL' | 'IN_STORE' | 'GAS' | 'HOT_FOODS';

const CATEGORIES: { key: Category; label: string; emoji: string; color: string }[] = [
  { key: 'ALL',       label: 'All',       emoji: '🏷️', color: COLORS.secondary },
  { key: 'IN_STORE',  label: 'In-Store',  emoji: '🛒', color: '#2A9D8F' },
  { key: 'GAS',       label: 'Gas',       emoji: '⛽', color: '#F4A226' },
  { key: 'HOT_FOODS', label: 'Hot Foods', emoji: '🌮', color: '#E63946' },
];

const CAT_MAP = Object.fromEntries(CATEGORIES.map(c => [c.key, c]));

// ─── Countdown timer hook ──────────────────────────────────────────────────────
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      setRemaining(diff);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  return { remaining, mins, secs, expired: remaining === 0 };
}

// ─── Active Redemption Banner ──────────────────────────────────────────────────
function ActiveRedemptionBanner({ redemption, onCancel }: { redemption: any; onCancel: () => void }) {
  const { mins, secs, expired } = useCountdown(redemption.expiresAt);
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.03, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  if (expired) return null;

  const urgency = mins < 5;

  return (
    <Animated.View style={[s.activeBanner, urgency && s.activeBannerUrgent, { transform: [{ scale: pulse }] }]}>
      <View style={s.activeBannerLeft}>
        <Text style={s.activeBannerEmoji}>{redemption.catalogItem?.emoji || '🎁'}</Text>
        <View style={s.activeBannerInfo}>
          <Text style={s.activeBannerTitle}>{redemption.catalogItem?.title}</Text>
          <Text style={s.activeBannerSub}>Show code to cashier</Text>
        </View>
      </View>
      <View style={s.activeBannerRight}>
        <View style={s.codeBox}>
          <Text style={s.codeText}>{redemption.redemptionCode}</Text>
        </View>
        <Text style={[s.timerText, urgency && { color: '#E63946' }]}>
          {mins}:{secs.toString().padStart(2, '0')}
        </Text>
        <TouchableOpacity onPress={onCancel} style={s.cancelSmall}>
          <Text style={s.cancelSmallText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ─── Redeem Confirmation Modal ─────────────────────────────────────────────────
function RedeemModal({
  item,
  pts,
  onConfirm,
  onClose,
  loading,
}: {
  item: any;
  pts: number;
  onConfirm: () => void;
  onClose: () => void;
  loading: boolean;
}) {
  const catCfg = CAT_MAP[item.category as Category] || CAT_MAP.IN_STORE;
  const remaining = pts - item.pointsCost;

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={m.sheet}>
          <View style={[m.itemIcon, { backgroundColor: catCfg.color + '18' }]}>
            <Text style={m.itemEmoji}>{item.emoji || '🎁'}</Text>
          </View>
          <Text style={m.itemTitle}>{item.title}</Text>
          {item.description ? <Text style={m.itemDesc}>{item.description}</Text> : null}
          {item.category === 'HOT_FOODS' && (
            <View style={m.locationTag}>
              <Text style={m.locationTagText}>📍 Available at select locations</Text>
            </View>
          )}

          <View style={m.costRow}>
            <View style={m.costBox}>
              <Text style={m.costLabel}>Cost</Text>
              <Text style={m.costVal}>{item.pointsCost.toLocaleString()} pts</Text>
            </View>
            <View style={m.arrowBox}><Text style={m.arrow}>→</Text></View>
            <View style={m.costBox}>
              <Text style={m.costLabel}>Remaining</Text>
              <Text style={[m.costVal, { color: remaining < 0 ? '#E63946' : COLORS.success }]}>
                {remaining.toLocaleString()} pts
              </Text>
            </View>
          </View>

          <View style={m.warningBox}>
            <Text style={m.warningIcon}>⏱️</Text>
            <Text style={m.warningText}>
              Points are deducted immediately. Show the code to the cashier within <Text style={{ fontWeight: '800' }}>30 minutes</Text> or the redemption expires and points are refunded.
            </Text>
          </View>

          <TouchableOpacity
            style={[m.confirmBtn, { backgroundColor: catCfg.color }, loading && { opacity: 0.6 }]}
            onPress={onConfirm}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={m.confirmBtnText}>Redeem Now — {item.pointsCost.toLocaleString()} pts</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={m.cancelBtn} onPress={onClose} disabled={loading}>
            <Text style={m.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Redemption Success Modal ──────────────────────────────────────────────────
function SuccessModal({ data, onClose }: { data: any; onClose: () => void }) {
  const { mins, secs, expired } = useCountdown(data.expiresAt);
  const urgency = mins < 5;

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={m.overlay}>
        <View style={[m.sheet, { paddingTop: 32 }]}>
          <View style={[m.itemIcon, { backgroundColor: '#2DC65318', width: 80, height: 80, borderRadius: 24 }]}>
            <Text style={{ fontSize: 40 }}>✅</Text>
          </View>
          <Text style={[m.itemTitle, { marginTop: 12 }]}>Redemption Active!</Text>
          <Text style={m.itemDesc}>Show this code to the cashier to complete your reward</Text>

          <View style={suc.codeCard}>
            <Text style={suc.codeLabel}>YOUR CODE</Text>
            <Text style={suc.code}>{data.redemptionCode}</Text>
            <Text style={suc.codeHint}>Cashier will scan your QR + enter this code</Text>
          </View>

          <View style={[suc.timerCard, urgency && { borderColor: '#E63946', backgroundColor: '#FFF0F0' }]}>
            <Text style={suc.timerLabel}>Expires in</Text>
            {expired ? (
              <Text style={[suc.timer, { color: '#E63946' }]}>EXPIRED</Text>
            ) : (
              <Text style={[suc.timer, urgency && { color: '#E63946' }]}>
                {mins}:{secs.toString().padStart(2, '0')}
              </Text>
            )}
            <Text style={suc.timerSub}>Points are refunded if not scanned in time</Text>
          </View>

          <TouchableOpacity style={[m.confirmBtn, { backgroundColor: COLORS.secondary }]} onPress={onClose}>
            <Text style={m.confirmBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Catalog Tile ──────────────────────────────────────────────────────────────
function CatalogTile({ item, pts, onRedeem }: { item: any; pts: number; onRedeem: (item: any) => void }) {
  const catCfg = CAT_MAP[item.category as Category] || CAT_MAP.IN_STORE;
  const canAfford = pts >= item.pointsCost;
  const shortage = item.pointsCost - pts;

  return (
    <View style={[t.tile, canAfford && { borderColor: catCfg.color + '40' }, !canAfford && t.tileLocked]}>
      {/* Category tag */}
      <View style={[t.catTag, { backgroundColor: catCfg.color + '15' }]}>
        <Text style={[t.catTagText, { color: catCfg.color }]}>{catCfg.emoji} {catCfg.label}</Text>
      </View>

      {/* Emoji */}
      <View style={[t.emojiRing, { backgroundColor: catCfg.color + (canAfford ? '20' : '0d') }]}>
        <Text style={t.emoji}>{item.emoji || '🎁'}</Text>
      </View>

      {/* Info */}
      <Text style={t.title} numberOfLines={2}>{item.title}</Text>
      {item.description ? <Text style={t.desc} numberOfLines={2}>{item.description}</Text> : null}
      {item.category === 'HOT_FOODS' && (
        <Text style={t.locationNote}>📍 Select locations</Text>
      )}

      {/* Cost + button */}
      <View style={t.footer}>
        <View style={[t.costBadge, canAfford && { backgroundColor: catCfg.color }]}>
          <Text style={[t.costPts, !canAfford && { color: COLORS.textMuted }]}>
            {item.pointsCost.toLocaleString()}
          </Text>
          <Text style={[t.costLabel, !canAfford && { color: COLORS.textMuted }]}>pts</Text>
        </View>
        {canAfford ? (
          <TouchableOpacity
            style={[t.redeemBtn, { backgroundColor: catCfg.color }]}
            onPress={() => onRedeem(item)}
            activeOpacity={0.8}
          >
            <Text style={t.redeemBtnText}>Redeem</Text>
          </TouchableOpacity>
        ) : (
          <Text style={t.shortage}>-{shortage.toLocaleString()} pts</Text>
        )}
      </View>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function CatalogScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const pts = Math.round(Number(user?.pointsBalance || 0) * 100);
  const [activeCategory, setActiveCategory] = useState<Category>('ALL');
  const [selectedItem, setSelectedItem] = useState<any>(null);
  const [successData, setSuccessData] = useState<any>(null);

  const { data: catalogData, isLoading, refetch, isRefetching } = useQuery({
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
    },
    onError: (e: any) => {
      Toast.show({ type: 'error', text1: e.response?.data?.error || 'Redemption failed' });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => catalogApi.cancelRedemption(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-redemptions'] });
      Toast.show({ type: 'success', text1: 'Redemption cancelled', text2: 'Points refunded to your balance' });
    },
    onError: (e: any) => {
      Toast.show({ type: 'error', text1: e.response?.data?.error || 'Cancel failed' });
    },
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
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>🏷️ Catalog</Text>
            <Text style={s.headerSub}>Redeem your points for rewards</Text>
          </View>
          <View style={s.ptsPill}>
            <Text style={s.ptsPillNum}>{pts.toLocaleString()}</Text>
            <Text style={s.ptsPillLabel}> pts</Text>
          </View>
        </View>

        {/* Category pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.key;
            const count = cat.key === 'ALL' ? allItems.length : allItems.filter(i => i.category === cat.key).length;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[s.catPill, active && s.catPillActive]}
                onPress={() => setActiveCategory(cat.key)}
                activeOpacity={0.75}
              >
                <Text style={s.catPillEmoji}>{cat.emoji}</Text>
                <Text style={[s.catPillLabel, active && s.catPillLabelActive]}>{cat.label}</Text>
                {count > 0 && (
                  <View style={[s.catCount, active && s.catCountActive]}>
                    <Text style={[s.catCountText, active && s.catCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={s.loadingText}>Loading catalog…</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={s.row}
          contentContainerStyle={s.body}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListHeaderComponent={
            <>
              {/* Active redemptions */}
              {pendingRedemptions.map(r => (
                <ActiveRedemptionBanner
                  key={r.id}
                  redemption={r}
                  onCancel={() => handleCancelRedemption(r)}
                />
              ))}
              {/* Balance bar */}
              <View style={s.balanceBar}>
                <Text style={s.balanceBarText}>Balance: <Text style={s.balanceBarPts}>{pts.toLocaleString()} pts</Text></Text>
                <Text style={s.balanceBarValue}>${(pts / 100).toFixed(2)} value</Text>
              </View>
            </>
          }
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>{CATEGORIES.find(c => c.key === activeCategory)?.emoji || '🏷️'}</Text>
              <Text style={s.emptyTitle}>
                {activeCategory === 'ALL' ? 'No rewards yet' : `No ${CATEGORIES.find(c => c.key === activeCategory)?.label} rewards yet`}
              </Text>
              <Text style={s.emptySub}>Check back soon — new rewards are added regularly</Text>
            </View>
          }
          ListFooterComponent={
            filtered.length > 0 ? (
              <View style={s.redeemHint}>
                <Text style={s.redeemHintIcon}>💡</Text>
                <Text style={s.redeemHintText}>
                  Tap Redeem → show the code to the cashier → they scan your QR to confirm.
                </Text>
              </View>
            ) : null
          }
          renderItem={({ item }) => (
            <CatalogTile item={item} pts={pts} onRedeem={setSelectedItem} />
          )}
        />
      )}

      {/* Redeem confirmation modal */}
      {selectedItem && (
        <RedeemModal
          item={selectedItem}
          pts={pts}
          loading={redeemMutation.isPending}
          onConfirm={() => redeemMutation.mutate(selectedItem.id)}
          onClose={() => setSelectedItem(null)}
        />
      )}

      {/* Success + code modal */}
      {successData && (
        <SuccessModal
          data={successData}
          onClose={() => setSuccessData(null)}
        />
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  ptsPill: {
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  ptsPillNum: { color: '#fff', fontSize: 17, fontWeight: '900' },
  ptsPillLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },

  catRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 8, flexDirection: 'row' },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  catPillActive: { backgroundColor: '#fff', borderColor: '#fff' },
  catPillEmoji: { fontSize: 14 },
  catPillLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },
  catPillLabelActive: { color: COLORS.secondary },
  catCount: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  catCountActive: { backgroundColor: COLORS.secondary + '15' },
  catCountText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800' },
  catCountTextActive: { color: COLORS.secondary },

  body: { padding: 12, paddingBottom: 32, gap: 0 },
  row: { gap: 10, marginBottom: 10 },

  balanceBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 14,
    paddingHorizontal: 16, paddingVertical: 12, marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  balanceBarText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  balanceBarPts: { color: COLORS.secondary, fontWeight: '900' },
  balanceBarValue: { fontSize: 13, color: COLORS.success, fontWeight: '700' },

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
  codeBox: {
    backgroundColor: COLORS.secondary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  codeText: { color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  timerText: { fontSize: 14, fontWeight: '900', color: COLORS.success },
  cancelSmall: { paddingVertical: 2, paddingHorizontal: 6 },
  cancelSmallText: { fontSize: 11, color: COLORS.error, fontWeight: '700' },

  redeemHint: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.secondary + '18',
    marginTop: 4,
  },
  redeemHintIcon: { fontSize: 18 },
  redeemHintText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },

  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});

// ─── Tile styles ───────────────────────────────────────────────────────────────
const t = StyleSheet.create({
  tile: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 18,
    padding: 14, borderWidth: 1.5, borderColor: COLORS.border,
    gap: 8, alignItems: 'flex-start',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  tileLocked: { opacity: 0.65 },
  catTag: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start',
  },
  catTagText: { fontSize: 10, fontWeight: '800' },
  emojiRing: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center',
  },
  emoji: { fontSize: 28 },
  title: { fontSize: 14, fontWeight: '800', color: COLORS.text, lineHeight: 19, width: '100%' },
  desc: { fontSize: 11, color: COLORS.textMuted, lineHeight: 15, width: '100%' },
  locationNote: { fontSize: 10, color: '#E65100', fontWeight: '700' },
  footer: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  costBadge: {
    backgroundColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center',
  },
  costPts: { fontSize: 13, fontWeight: '900', color: '#fff' },
  costLabel: { fontSize: 8, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  redeemBtn: {
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
  },
  redeemBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  shortage: { fontSize: 11, color: COLORS.error, fontWeight: '700' },
});

// ─── Modal styles ──────────────────────────────────────────────────────────────
const m = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36, alignItems: 'center', gap: 12,
  },
  itemIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  itemEmoji: { fontSize: 36 },
  itemTitle: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  itemDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  locationTag: {
    backgroundColor: '#FFF3E0', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  locationTagText: { fontSize: 12, color: '#E65100', fontWeight: '700' },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%', justifyContent: 'center', marginTop: 4 },
  costBox: { alignItems: 'center', flex: 1 },
  costLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  costVal: { fontSize: 20, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  arrowBox: { paddingBottom: 0 },
  arrow: { fontSize: 22, color: COLORS.textMuted },
  warningBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#FFF8E1', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#FFE082', width: '100%',
  },
  warningIcon: { fontSize: 20 },
  warningText: { flex: 1, fontSize: 13, color: '#5D4037', lineHeight: 19 },
  confirmBtn: {
    width: '100%', borderRadius: 16, padding: 17,
    alignItems: 'center', marginTop: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15, shadowRadius: 6, elevation: 4,
  },
  confirmBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  cancelBtn: { padding: 12, alignItems: 'center' },
  cancelBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },
});

// ─── Success modal styles ──────────────────────────────────────────────────────
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
});
