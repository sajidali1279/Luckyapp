import { View, FlatList, StyleSheet, ActivityIndicator, StatusBar, TouchableOpacity, Modal } from 'react-native';
import { Text } from '../../components/ScaledText';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { FlatList as FlatListType } from 'react-native';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocalSearchParams, useFocusEffect, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { pointsApi } from '../../services/api';
import { COLORS } from '../../constants';
import EmptyState from '../../components/EmptyState';
import FadeSlideIn from '../../components/FadeSlideIn';
import { ReceiptIcon, ClipboardIcon, ChevronRightIcon } from '../../components/Icons';
import PulseHighlight from '../../components/PulseHighlight';
import DisputeTransactionModal from '../../components/DisputeTransactionModal';
import { format } from 'date-fns';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import RefreshControl from '../../components/AppRefreshControl';
import { useAuthStore } from '../../store/authStore';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { usePointsExpiry, expiryDate } from '../../hooks/usePointsExpiry';

const CATEGORY_ICONS: Record<string, string> = {
  GAS: '⛽', DIESEL: '🚛', HOT_FOODS: '🌮', GROCERIES: '🛒',
  FROZEN_FOODS: '🧊', FRESH_FOODS: '🥗', TOBACCO_VAPES: '🚬', ALCOHOL: '🍺', OTHER: '🏪',
};

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const largeTitle = useLargeTitleScroll();
  const [selected, setSelected] = useState<any>(null);
  const [disputeTarget, setDisputeTarget] = useState<any>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ['my-history'],
    queryFn: ({ pageParam = 1 }) => pointsApi.getMyHistory(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      const { total, limit } = lastPage.data.data;
      return allPages.length * limit < total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const transactions = data?.pages.flatMap((p) => p.data.data.transactions) || [];

  // Up to date (2026-10-17): the list only loaded once, so a sale an employee just granted, or a pending sale turning approved, did
  // not show until the app was restarted. Re-read when the tab is opened and on pull down (the balance too); app/_layout.tsx also
  // refreshes it when the app comes back to the front and when a notification arrives.
  const firstFocus = useRef(true);
  useFocusEffect(useCallback(() => {
    if (firstFocus.current) { firstFocus.current = false; return; }   // the first visit has just loaded it
    refetch();
  }, [refetch]));
  const qc = useQueryClient();
  const expiry = usePointsExpiry();
  const { refreshing, onRefresh } = usePullRefresh([() => refetch(), () => useAuthStore.getState().refreshAccount(), () => qc.invalidateQueries({ queryKey: ['my-expiry'] })]);

  // A dispute/points push can target a transaction older than whatever page(s)
  // of this paginated history are already loaded. `searchId` stays set for as
  // long as it takes to page through and find it (independent of how long the
  // pulse itself lasts); `pulseId` only turns on once the row is actually found.
  const { highlightId } = useLocalSearchParams<{ highlightId?: string }>();
  const [searchId, setSearchId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const listRef = useRef<FlatListType<any>>(null);

  useFocusEffect(
    useCallback(() => {
      if (!highlightId) return;
      setSearchId(highlightId);
    }, [highlightId])
  );

  useEffect(() => {
    if (!searchId) return;
    const index = transactions.findIndex((t: any) => t.id === searchId);
    if (index >= 0) {
      const timer = setTimeout(() => {
        listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: true });
        setPulseId(searchId);
        setSearchId(null);
        router.setParams({ highlightId: '' });
        setTimeout(() => setPulseId(null), 1700);
      }, 300);
      return () => clearTimeout(timer);
    }
    if (isLoading) return; // first page hasn't resolved yet, nothing to page through yet
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    } else if (!hasNextPage) {
      // Paged through everything and it's still not there, give up gracefully.
      setSearchId(null);
      router.setParams({ highlightId: '' });
    }
  }, [searchId, transactions, hasNextPage, isFetchingNextPage, isLoading]);

  return (
    <View style={s.root}>
      <LargeTitleHeader
        title={t('customerHistory.headerTitle')}
        scrollY={largeTitle.scrollY}
        icon={<ClipboardIcon size={24} color="#fff" strokeWidth={2} />}
        right={!isLoading ? (
          <View style={s.countPill}>
            <Text style={s.countPillText} maxFontSizeMultiplier={1.2}>{t('customerHistory.transactionCount', { count: transactions.length })}</Text>
          </View>
        ) : undefined}
      />

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={s.loadingText}>{t('customerHistory.loading')}</Text>
        </View>
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
        <FlatList
          ref={listRef}
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={transactions.length === 0 ? s.emptyContainer : s.list}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          onScroll={largeTitle.onScroll}
          scrollEventThrottle={largeTitle.scrollEventThrottle}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={expiry && ((expiry.enabled && expiry.upcoming.length > 0) || expiry.expired.length > 0) ? (
            <View style={s.expiryBox}>
              {expiry.enabled && expiry.upcoming.length > 0 && (
                <>
                  <Text style={s.expiryTitle}>{t('customerHistory.expiringTitle')}</Text>
                  {expiry.upcoming.slice(0, 3).map((u) => (
                    <Text key={u.date} style={s.expiryLine}>{t('customerHistory.expiringLine', { points: u.points.toLocaleString(), date: expiryDate(u.date, i18n.language) })}</Text>
                  ))}
                  <Text style={s.expiryNote}>{t('customerHistory.expiryNote', { days: expiry.days })}</Text>
                </>
              )}
              {expiry.expired.slice(0, 5).map((e) => (
                <Text key={`x${e.date}`} style={[s.expiryLine, s.expiredLine]}>{t('customerHistory.expiredLine', { points: e.points.toLocaleString(), date: expiryDate(e.date, i18n.language) })}</Text>
              ))}
            </View>
          ) : null}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          onScrollToIndexFailed={(info) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index: info.index, viewPosition: 0.3, animated: true }), 200);
          }}
          ListEmptyComponent={
            <EmptyState icon={<ReceiptIcon size={52} color="#C4CAD4" strokeWidth={1.25} />} title={t('customerHistory.emptyTitle')} subtitle={t('customerHistory.emptySubtitle')} />
          }
          ListFooterComponent={
            isFetchingNextPage
              ? <View style={s.footerLoader}><ActivityIndicator color={COLORS.primary} /></View>
              : transactions.length > 0
                ? <Text style={s.footerEnd}>{t('customerHistory.footerEnd')}</Text>
                : null
          }
          renderItem={({ item }) => {
            // A challenge's reward is its own line: no purchase, so it says what it is (and is not a purchase to report)
            const isGift = item.challenge?.kind === 'WINBACK';   // a win-back gift from HQ (2026-10-16), kept as a reward line too
            const icon = isGift ? '🎁' : item.challengeId ? '🏆' : CATEGORY_ICONS[item.category] || '🏪';
            const catLabel = isGift ? t('customerHistory.giftReward') : item.challengeId ? t('customerHistory.challengeReward') : item.category?.replace(/_/g, ' ') || t('customerHistory.otherCategory');
            const storeName = item.store?.name || t('customerHistory.defaultStoreName');
            return (
              <PulseHighlight active={item.id === pulseId}>
                <TouchableOpacity
                  style={s.card}
                  onPress={() => setSelected(item)}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={t('customerHistory.viewDetailsA11y', { store: storeName, date: format(new Date(item.createdAt), 'MMM d, yyyy') })}
                >
                  <View style={s.cardIconBg}>
                    <Text style={s.cardIcon}>{icon}</Text>
                  </View>
                  <View style={s.cardBody}>
                    <Text style={s.storeName}>{storeName}</Text>
                    <Text style={s.date}>{format(new Date(item.createdAt), 'MMM d, yyyy · h:mm a')}</Text>
                    <View style={s.catTag}>
                      <Text style={s.catTagText}>{catLabel}</Text>
                    </View>
                  </View>
                  <View style={s.cardRight}>
                    {item.status === 'APPROVED' ? (
                      <Text style={s.points}>{t('customerHistory.pointsValue', { points: Math.round((Number(item.pointsAwarded) + Number(item.gasBonusPoints || 0)) * 100).toLocaleString() })}</Text>
                    ) : item.status === 'PENDING' || item.status === 'FLAGGED' ? (
                      <Text style={[s.points, { color: '#B45309', fontSize: 12 }]}>{t('customerHistory.statusUnderReview')}</Text>
                    ) : item.status === 'VOIDED' ? (
                      <Text style={[s.points, { color: '#6B7280', fontSize: 12 }]}>{t('customerHistory.statusVoided')}</Text>
                    ) : (
                      <Text style={[s.points, { color: '#E63946', fontSize: 12 }]}>{t('customerHistory.statusRejected')}</Text>
                    )}
                    <ChevronRightIcon size={20} color={COLORS.border} strokeWidth={1.5} />
                  </View>
                </TouchableOpacity>
              </PulseHighlight>
            );
          }}
        />
        </FadeSlideIn>
      )}

      {/* ── Transaction Detail Modal ── */}
      {selected && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelected(null)}>
          <View style={d.overlay}>
            <View style={d.sheet}>
              <View style={d.iconBg}>
                <Text style={d.icon}>{selected.challenge?.kind === 'WINBACK' ? '🎁' : selected.challengeId ? '🏆' : CATEGORY_ICONS[selected.category] || '🏪'}</Text>
              </View>
              <Text style={d.storeName}>{selected.store?.name || t('customerHistory.defaultStoreName')}</Text>
              <Text style={d.date}>{format(new Date(selected.createdAt), 'EEEE, MMM d yyyy · h:mm a')}</Text>

              <View style={d.divider} />

              {selected.challengeId ? (
                <View style={d.row}>
                  <Text style={d.rowLabel}>{selected.challenge?.kind === 'WINBACK' ? t('customerHistory.detailGift') : t('customerHistory.detailChallenge')}</Text>
                  <Text style={d.rowValue}>{(i18n.language === 'es' && selected.challenge?.titleEs) || selected.challenge?.title || t('customerHistory.challengeReward')}</Text>
                </View>
              ) : (
                <>
                  <View style={d.row}>
                    <Text style={d.rowLabel}>{t('customerHistory.detailCategory')}</Text>
                    <Text style={d.rowValue}>{selected.category?.replace(/_/g, ' ') || t('customerHistory.otherCategory')}</Text>
                  </View>
                  <View style={d.row}>
                    <Text style={d.rowLabel}>{t('customerHistory.detailPurchaseAmount')}</Text>
                    <Text style={d.rowValue}>${Number(selected.purchaseAmount || 0).toFixed(2)}</Text>
                  </View>
                </>
              )}
              {/* Points earned only for a sale that was credited; a held, voided or rejected one says what happened instead (2026-10-18) */}
              {selected.status === 'APPROVED' ? (
                <View style={d.row}>
                  <Text style={d.rowLabel}>{t('customerHistory.detailPointsEarned')}</Text>
                  <Text style={[d.rowValue, { color: COLORS.success, fontWeight: '900' }]}>
                    {t('customerHistory.pointsValue', { points: Math.round(Number(selected.pointsAwarded) * 100).toLocaleString() })}
                  </Text>
                </View>
              ) : (
                <View style={d.row}>
                  <Text style={d.rowLabel}>{t('customerHistory.detailStatus')}</Text>
                  <Text style={[d.rowValue, { color: selected.status === 'REJECTED' ? '#E63946' : selected.status === 'VOIDED' ? '#6B7280' : '#B45309', fontWeight: '700', flexShrink: 1, textAlign: 'right' }]}>
                    {selected.status === 'REJECTED' ? t('customerHistory.rejectedNote') : selected.status === 'VOIDED' ? t('customerHistory.voidedNote') : t('customerHistory.underReviewNote')}
                  </Text>
                </View>
              )}
              {selected.status === 'APPROVED' && Number(selected.gasBonusPoints) > 0 && (
                <View style={d.row}>
                  <Text style={d.rowLabel}>{t('customerHistory.detailGasBonus')}</Text>
                  <Text style={[d.rowValue, { color: '#F4A226', fontWeight: '800' }]}>
                    {t('customerHistory.pointsValue', { points: Math.round(Number(selected.gasBonusPoints) * 100) })}
                  </Text>
                </View>
              )}
              {selected.notes && !selected.challengeId ? (
                <View style={d.row}>
                  <Text style={d.rowLabel}>{t('customerHistory.detailNotes')}</Text>
                  <Text style={d.rowValue}>{selected.notes}</Text>
                </View>
              ) : null}

              {selected.receiptImageUrl ? (
                <Image source={{ uri: selected.receiptImageUrl }} style={d.receiptImg} contentFit="cover" />
              ) : null}

              {!selected.challengeId && <TouchableOpacity
                style={d.disputeBtn}
                onPress={() => { setDisputeTarget(selected); setSelected(null); }}
                accessibilityRole="button"
                accessibilityLabel={t('customerHistory.disputeA11y')}
              >
                <Text style={d.disputeBtnText}>{t('customerHistory.disputeBtn')}</Text>
              </TouchableOpacity>}

              <TouchableOpacity
                style={d.closeBtn}
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                accessibilityLabel={t('customerHistory.closeA11y')}
              >
                <Text style={d.closeBtnText}>{t('customerHistory.close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <DisputeTransactionModal
        visible={!!disputeTarget}
        onClose={() => setDisputeTarget(null)}
        transaction={disputeTarget}
      />
    </View>
  );
}

const s = StyleSheet.create({
  expiryBox: { marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 14, borderRadius: 14, backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  expiryTitle: { fontSize: 14, fontWeight: '800', color: '#92400E', marginBottom: 4 },
  expiryLine: { fontSize: 13, fontWeight: '600', color: '#78350F', marginTop: 2 },
  expiredLine: { color: '#9CA3AF' },
  expiryNote: { fontSize: 12, color: '#92400E', marginTop: 6 },
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },

  // Header
  headerBg: { backgroundColor: COLORS.secondary },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  countPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // List
  list: { padding: 14, paddingBottom: 32 },
  emptyContainer: { flex: 1, justifyContent: 'center', padding: 24 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardIconBg: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: COLORS.primary + '12',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardIcon: { fontSize: 22 },
  cardBody: { flex: 1 },
  storeName: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  date: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  catTag: {
    backgroundColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 5, alignSelf: 'flex-start',
  },
  catTagText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardRight: { alignItems: 'flex-end', flexShrink: 0 },
  points: { fontSize: 18, fontWeight: '800', color: COLORS.success },
  purchase: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },

  // Footer
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
  footerEnd: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, paddingVertical: 20 },
});

const d = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, alignItems: 'center', gap: 4,
  },
  iconBg: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: COLORS.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  icon: { fontSize: 30 },
  storeName: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  date: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  divider: { width: '100%', height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  rowValue: { fontSize: 14, color: COLORS.text, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 16 },
  receiptImg: { width: '100%', height: 180, borderRadius: 16, marginTop: 12, backgroundColor: COLORS.border },
  disputeBtn: {
    marginTop: 16, width: '100%', backgroundColor: 'transparent',
    borderRadius: 16, padding: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  disputeBtnText: { color: COLORS.error, fontSize: 15, fontWeight: '800' },
  closeBtn: {
    marginTop: 16, width: '100%', backgroundColor: COLORS.primary,
    borderRadius: 16, padding: 16, alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
