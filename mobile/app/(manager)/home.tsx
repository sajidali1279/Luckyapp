import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator, Animated, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { managerApi, storesApi, employeeRequestApi, orderCategoriesApi, notificationsApi, orderListApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  PackageIcon, ClipboardIcon, TrendingUpIcon, InboxIcon, ChevronRightIcon, BellIcon,
} from '../../components/Icons';
import ErrorState from '../../components/ErrorState';
import DashboardWatermark from '../../components/DashboardWatermark';

const BAR_COLORS = [
  '#1D3557', '#E63946', '#F4A261', '#2DC653', '#6A4C93',
  '#1CBEC0', '#F7B731', '#FC5C65', '#45AAF2', '#26DE81',
];

const RANK = [
  { bg: '#FEF9C3', color: '#A16207', border: '#FDE047' }, // 1 - gold
  { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' }, // 2 - silver
  { bg: '#FEF0E6', color: '#C2410C', border: '#FED7AA' }, // 3 - bronze
];

function getGreeting(t: (key: string) => string) {
  const h = new Date().getHours();
  if (h < 12) return t('managerHome.goodMorning');
  if (h < 17) return t('managerHome.goodAfternoon');
  return t('managerHome.goodEvening');
}

const PERIODS = [
  { label: '7d',  value: '7'   },
  { label: '30d', value: '30'  },
  { label: '90d', value: '90'  },
  { label: 'All', value: 'all' },
];

function CategoryBar({ name, pct, count, color }: { name: string; pct: number; count: number; color: string }) {
  return (
    <View style={s.catRow}>
      <View style={[s.catDot, { backgroundColor: color }]} />
      <Text style={s.catName} numberOfLines={1}>{name}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.max(pct, 2)}%` as any, backgroundColor: color }]} />
      </View>
      <Text style={s.catCount}>{count}<Text style={s.catPct}> · {pct}%</Text></Text>
    </View>
  );
}

export default function ManagerHome() {
  const { t } = useTranslation();
  const user = useAuthStore(s => s.user);
  const [period, setPeriod] = useState('30');
  const [category, setCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Staggered entrance — 4 groups fade + slide up on mount
  const fadeAnims  = useRef([...Array(4)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(4)].map(() => new Animated.Value(18))).current;
  useEffect(() => {
    Animated.stagger(65, fadeAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim,        { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 380, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  const { data: storesData, refetch: refetchStores } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60 * 1000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];
  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores]);
  // Order List and Inventory Analytics below are scoped to one store at a
  // time - a multi-store manager picks which via the chip row in the
  // header, same pattern as Offers/Banners/Schedule.
  const storeId = selectedStoreId || user?.storeIds?.[0];

  const { data: activeListData } = useQuery({
    queryKey: ['order-list-active', storeId],
    queryFn: () => orderListApi.getActive(storeId!),
    enabled: !!storeId,
    staleTime: 60000,
    refetchInterval: 60000,
  });
  const activeListItems: { status: string }[] = activeListData?.data?.data?.items ?? [];
  const neededCount  = activeListItems.filter(i => i.status === 'PENDING').length;
  const orderedCount = activeListItems.filter(i => i.status === 'ORDERED').length;

  const { data: catListData, refetch: refetchCategories } = useQuery({
    queryKey: ['order-categories-approved'],
    queryFn: () => orderCategoriesApi.getApproved(),
    staleTime: 10 * 60 * 1000,
  });
  const categoryOptions: string[] = catListData?.data?.data ?? [];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['inventory-analytics', storeId, period, category],
    queryFn: () => managerApi.getInventoryAnalytics({ storeId, period, category: category || undefined }),
    enabled: true,
  });
  const analytics = data?.data?.data;

  const { data: pendingData } = useQuery({
    queryKey: ['employee-requests-pending-count'],
    queryFn: () => employeeRequestApi.getPendingCount(),
    refetchInterval: 60000,
  });
  const pendingCount: number = pendingData?.data?.data?.count ?? analytics?.pendingRequestsCount ?? 0;

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([refetch(), refetchStores(), refetchCategories()]);
    setRefreshing(false);
  }

  const topItems: { name: string; category: string | null; orderCount: number }[] = analytics?.topItems ?? [];
  const categories: { category: string; count: number; pct: number }[] = analytics?.categoryBreakdown ?? [];
  const totalItems: number = analytics?.totalItems ?? 0;

  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();

  return (
    <View style={{ flex: 1 }}>
      <DashboardWatermark color={COLORS.managerPrimary} />
      <SafeAreaView style={s.headerSafe} edges={['top']}>
        <StatusBar barStyle="light-content" backgroundColor="#0a3323" />

        {/* ── Header with SVG gradient ── */}
        <View style={s.header}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#0a3323" />
              <Stop offset="1" stopColor="#1f7a52" />
            </SvgGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#hg)" />
        </Svg>

        <View style={s.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 }}>
            <Image source={require('../../assets/store-icon-512.png')} style={s.headerLogo} />
            <View>
              <Text style={s.greeting}>{getGreeting(t)}</Text>
              <Text style={s.name}>{user?.name?.split(' ')[0] ?? t('managerHome.managerFallback')}</Text>
              {stores.length === 1
                ? <Text style={s.storeName}>{stores[0].name}</Text>
                : stores.length > 1
                  ? <Text style={s.storeName}>{t('managerHome.storesCount', { count: stores.length })}</Text>
                  : null
              }
            </View>
          </View>

          {/* Bell + avatar */}
          <View style={s.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/(manager)/notifications')}
              style={s.bellBtn}
              accessibilityRole="button"
              accessibilityLabel={unreadCount > 0 ? t('managerHome.viewNotificationsUnreadLabel', { count: unreadCount }) : t('managerHome.viewNotificationsLabel')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <BellIcon size={20} color="#fff" strokeWidth={2} />
              {unreadCount > 0 && (
                <View style={s.bellBadge}>
                  <Text style={s.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={s.avatarRing}
              onPress={() => router.push('/(manager)/profile')}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={t('managerHome.openProfileLabel')}
            >
              {user?.avatarUrl ? (
                <Image source={{ uri: user.avatarUrl, cache: 'reload' }} style={s.avatarPhoto} />
              ) : (
                <View style={s.avatarCircle}>
                  <Text style={s.avatarText}>{initial}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {stores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storePickerRow}>
            {stores.map(store => (
              <TouchableOpacity
                key={store.id}
                style={[s.storeChip, store.id === storeId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(store.id)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityLabel={t('managerHome.showDashboardForStore', { store: store.name })}
                accessibilityState={{ selected: store.id === storeId }}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              >
                <Text style={[s.storeChipText, store.id === storeId && s.storeChipTextActive]}>
                  {store.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

      </View>
      </SafeAreaView>

      <View style={s.safe}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.managerPrimary} colors={[COLORS.managerPrimary]} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Quick stat cards - overlap header ── */}
        <Animated.View style={{ opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }}>
          <View style={s.quickRow}>
            {/* Order List - wide card with needed/ordered breakdown */}
            <TouchableOpacity
              style={[s.quickCard, s.quickCardWide]}
              onPress={() => router.push('/(manager)/order-list')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('managerHome.viewOrderListLabel', { count: activeListItems.length })}
            >
              <View style={s.quickTop}>
                <View style={[s.quickIconBox, { backgroundColor: COLORS.managerPrimary + '15' }]}>
                  <PackageIcon size={20} color={COLORS.managerPrimary} />
                </View>
                <ChevronRightIcon size={14} color="#ADB5BD" />
              </View>
              <Text style={s.quickLabel}>{t('managerHome.orderListLabel')}</Text>
              {activeListItems.length > 0 ? (
                <>
                  <Text style={s.quickValue}>{activeListItems.length}</Text>
                  <View style={s.miniPillRow}>
                    {neededCount > 0 && (
                      <View style={[s.miniPill, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                        <Text style={[s.miniPillText, { color: '#C2410C' }]}>{t('managerHome.neededCount', { count: neededCount })}</Text>
                      </View>
                    )}
                    {orderedCount > 0 && (
                      <View style={[s.miniPill, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}>
                        <Text style={[s.miniPillText, { color: '#059669' }]}>{t('managerHome.orderedCount', { count: orderedCount })}</Text>
                      </View>
                    )}
                    {neededCount === 0 && orderedCount === 0 && (
                      <Text style={s.quickSub}>{t('managerHome.allReceived')}</Text>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.quickValue}> - </Text>
                  <Text style={s.quickSub}>{t('managerHome.noOpenList')}</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Pending employee requests */}
            <TouchableOpacity
              style={s.quickCard}
              onPress={() => router.push('/(manager)/requests')}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('managerHome.viewRequestsLabel', { count: pendingCount })}
            >
              <View style={s.quickTop}>
                <View style={[s.quickIconBox, { backgroundColor: pendingCount > 0 ? '#FFF7ED' : COLORS.managerPrimary + '15' }]}>
                  <ClipboardIcon size={20} color={pendingCount > 0 ? '#EA580C' : COLORS.managerPrimary} />
                </View>
                <ChevronRightIcon size={14} color="#ADB5BD" />
              </View>
              <Text style={s.quickLabel}>{t('managerHome.requestsLabel')}</Text>
              <Text style={[s.quickValue, pendingCount > 0 && { color: '#EA580C' }]}>
                {pendingCount}
              </Text>
              {pendingCount > 0 ? (
                <View style={[s.quickBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                  <Text style={[s.quickBadgeText, { color: '#C2410C' }]}>{t('managerHome.reviewBadge')}</Text>
                </View>
              ) : (
                <Text style={s.quickSub}>{t('managerHome.allClear')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Pending alert banner ── */}
        {pendingCount > 0 && (
          <Animated.View style={{ opacity: fadeAnims[1], transform: [{ translateY: slideAnims[1] }] }}>
            <TouchableOpacity
              style={s.alertCard}
              onPress={() => router.push('/(manager)/requests')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('managerHome.reviewPendingLabel', { count: pendingCount })}
            >
              <View style={s.alertIcon}>
                <InboxIcon size={18} color="#C2410C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.alertTitle}>
                  {t('managerHome.pendingItemsTitle', { count: pendingCount })}
                </Text>
                <Text style={s.alertSub}>{t('managerHome.tapToReview')}</Text>
              </View>
              <ChevronRightIcon size={16} color="#C2410C" />
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* ── Inventory Intelligence header ── */}
        <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }] }}>
          <View style={s.sectionHeader}>
            <TrendingUpIcon size={15} color={COLORS.managerPrimary} />
            <Text style={s.sectionTitle}>{t('managerHome.orderHistory')}</Text>
            <View style={s.periodPicker}>
              {PERIODS.map(p => {
                const periodLabel = p.value === 'all' ? t('managerHome.periodAll') : p.label;
                return (
                <TouchableOpacity
                  key={p.value}
                  style={[s.periodBtn, period === p.value && s.periodBtnActive]}
                  onPress={() => setPeriod(p.value)}
                  accessibilityRole="tab"
                  accessibilityLabel={t('managerHome.showOrderHistoryForPeriod', { period: periodLabel })}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <Text style={[s.periodBtnText, period === p.value && s.periodBtnTextActive]}>
                    {periodLabel}
                  </Text>
                </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* Category filter chips */}
          {categoryOptions.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.chipScroll}
              contentContainerStyle={s.chipRow}
            >
              <TouchableOpacity
                key="__all__"
                style={[s.chip, category === '' && s.chipActive]}
                onPress={() => setCategory('')}
                accessibilityRole="tab"
                accessibilityLabel={t('managerHome.filterAllCategoriesLabel')}
                hitSlop={{ top: 9, bottom: 9, left: 8, right: 8 }}
              >
                <Text style={[s.chipText, category === '' && s.chipTextActive]}>{t('managerHome.categoryAll')}</Text>
              </TouchableOpacity>
              {categoryOptions.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.chip, category === c && s.chipActive]}
                  onPress={() => setCategory(category === c ? '' : c)}
                  accessibilityRole="tab"
                  accessibilityLabel={t('managerHome.filterByCategoryLabel', { category: c })}
                  hitSlop={{ top: 9, bottom: 9, left: 8, right: 8 }}
                >
                  <Text style={[s.chipText, category === c && s.chipTextActive]} numberOfLines={1}>
                    {c}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </Animated.View>

        {/* ── Analytics cards ── */}
        <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
          {isLoading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator color={COLORS.managerPrimary} />
              <Text style={s.loadingText}>{t('managerHome.loadingAnalytics')}</Text>
            </View>
          ) : isError ? (
            <View style={s.card}>
              <ErrorState message={t('managerHome.loadAnalyticsError')} onRetry={() => refetch()} />
            </View>
          ) : (
            <>
              {/* Top ordered items */}
              <View style={s.card}>
                <View style={s.cardHeader}>
                  <Text style={s.cardTitle}>{t('managerHome.mostOrderedItems')}</Text>
                  {totalItems > 0 && <Text style={s.cardSub}>{t('managerHome.totalCount', { count: totalItems })}</Text>}
                </View>
                {topItems.length === 0 ? (
                  <View style={s.emptyBox}>
                    <View style={s.emptyIcon}><PackageIcon size={28} color={COLORS.border} /></View>
                    <Text style={s.empty}>{t('managerHome.noOrdersYet')}</Text>
                    <Text style={s.emptySub}>{t('managerHome.startTrackingHint')}</Text>
                    <TouchableOpacity
                      style={s.emptyAction}
                      onPress={() => router.push('/(manager)/order-list')}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={t('managerHome.openOrderListLabel')}
                      hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
                    >
                      <Text style={s.emptyActionText}>{t('managerHome.openOrderListArrow')}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  topItems.slice(0, 10).map((item, i) => {
                    const rank = RANK[i] ?? null;
                    return (
                      <View key={`${item.name}-${i}`} style={[s.itemRow, i === topItems.slice(0, 10).length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[s.itemRank, rank && { backgroundColor: rank.bg, borderColor: rank.border, borderWidth: 1 }]}>
                          <Text style={[s.itemRankText, rank && { color: rank.color }]}>{i + 1}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.itemName}>{item.name}</Text>
                          {item.category && (
                            <Text style={s.itemCat}>{item.category}</Text>
                          )}
                        </View>
                        <View style={s.itemCountBox}>
                          <Text style={s.itemCount}>{item.orderCount}</Text>
                          <Text style={s.itemCountLabel}>{t('managerHome.ordersLabel')}</Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>

              {/* Category breakdown */}
              {categories.length > 0 && (
                <View style={s.card}>
                  <View style={s.cardHeader}>
                    <Text style={s.cardTitle}>{t('managerHome.byCategory')}</Text>
                    <Text style={s.cardSub}>{t('managerHome.categoriesCount', { count: categories.length })}</Text>
                  </View>
                  {categories.map((cat, i) => (
                    <CategoryBar
                      key={cat.category}
                      name={cat.category}
                      pct={cat.pct}
                      count={cat.count}
                      color={BAR_COLORS[i % BAR_COLORS.length]}
                    />
                  ))}
                </View>
              )}
            </>
          )}
        </Animated.View>
      </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  headerSafe: { backgroundColor: '#0a3323' },
  safe:   { flex: 1, backgroundColor: '#EDF1F7' },
  scroll: { flex: 1 },
  content: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 48 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 64,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', zIndex: 1,
  },
  headerLogo: {
    width: 44, height: 44, borderRadius: 12,
    flexShrink: 0,
  },
  greeting:  { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500', letterSpacing: 0.3 },
  name:      { fontSize: 24, color: '#FFFFFF', fontWeight: '800', marginTop: 1, letterSpacing: -0.3 },
  storeName: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3, fontWeight: '400' },

  storePickerRow: {
    flexDirection: 'row', gap: 8, paddingTop: 14, zIndex: 1,
  },
  storeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.55)' },
  storeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff', fontWeight: '700' },

  // Bell + avatar
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 4, right: 4,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  avatarRing: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden', alignItems: 'center', justifyContent: 'center',
  },
  avatarPhoto: { width: 44, height: 44, borderRadius: 22 },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2DC653',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  // ── Quick cards (overlap header) ─────────────────────────────────────────────
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: -52,
    marginBottom: 10,
  },
  quickCardWide: { flex: 1.5 },
  quickCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: COLORS.managerPrimary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    gap: 4,
  },
  quickTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quickIconBox:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel:  { fontSize: 10, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  quickValue:  { fontSize: 26, fontWeight: '800', color: '#111827', lineHeight: 30, letterSpacing: -0.5 },
  quickSub:    { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  quickBadge:  {
    alignSelf: 'flex-start', marginTop: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7',
  },
  quickBadgeText: { fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },
  miniPillRow:  { flexDirection: 'row', gap: 5, flexWrap: 'wrap', marginTop: 5 },
  miniPill:     { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  miniPillText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.2 },

  // ── Alert banner ────────────────────────────────────────────────────────────
  alertCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1, borderColor: '#FED7AA',
    borderRadius: 14, padding: 14,
    marginBottom: 16, gap: 12,
  },
  alertIcon:  { width: 34, height: 34, borderRadius: 10, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 13, fontWeight: '700', color: '#92400E' },
  alertSub:   { fontSize: 12, color: '#B45309', marginTop: 2 },

  // ── Section header ──────────────────────────────────────────────────────────
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10, marginTop: 6 },
  sectionTitle:  { fontSize: 13, fontWeight: '800', color: '#374151', flex: 1, textTransform: 'uppercase', letterSpacing: 0.5 },

  periodPicker:       { flexDirection: 'row', backgroundColor: '#E5E7EB', borderRadius: 8, padding: 2 },
  periodBtn:          { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 6 },
  periodBtnActive:    { backgroundColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2, elevation: 2 },
  periodBtnText:      { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  periodBtnTextActive:{ color: '#111827', fontWeight: '700' },

  // ── Category chips ──────────────────────────────────────────────────────────
  chipScroll: { marginBottom: 14, marginHorizontal: -16 },
  chipRow:    { paddingHorizontal: 16, gap: 8, flexDirection: 'row' },
  chip:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: COLORS.managerPrimary, borderColor: COLORS.managerPrimary },
  chipText:   { fontSize: 12, color: '#4B5563', fontWeight: '500' },
  chipTextActive: { color: '#FFFFFF', fontWeight: '700' },

  // ── Cards ──────────────────────────────────────────────────────────────────
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  cardTitle:  { fontSize: 15, fontWeight: '800', color: '#111827' },
  cardSub:    { fontSize: 12, color: '#9CA3AF', fontWeight: '500' },
  emptyBox:   { alignItems: 'center', paddingVertical: 28, gap: 8 },
  emptyIcon:  { width: 56, height: 56, borderRadius: 16, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  empty:      { fontSize: 14, color: '#9CA3AF', textAlign: 'center', fontWeight: '600' },
  emptySub:   { fontSize: 12, color: '#D1D5DB', textAlign: 'center', lineHeight: 18, paddingHorizontal: 16 },
  emptyAction:     { marginTop: 6, paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, backgroundColor: COLORS.managerPrimary + '18' },
  emptyActionText: { fontSize: 13, color: COLORS.managerPrimary, fontWeight: '700' },

  // ── Loading ────────────────────────────────────────────────────────────────
  loadingBox:  { alignItems: 'center', paddingVertical: 48, gap: 10 },
  loadingText: { fontSize: 13, color: '#9CA3AF' },

  // ── Item rows ──────────────────────────────────────────────────────────────
  itemRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 12 },
  itemRank:     { width: 26, height: 26, borderRadius: 8, backgroundColor: '#F9FAFB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemRankText: { fontSize: 11, fontWeight: '800', color: '#6B7280' },
  itemName:     { fontSize: 14, fontWeight: '600', color: '#111827' },
  itemCat:      { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  itemCountBox: { alignItems: 'flex-end' },
  itemCount:    { fontSize: 16, fontWeight: '800', color: COLORS.managerPrimary },
  itemCountLabel:{ fontSize: 9, color: '#9CA3AF', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },

  // ── Category bars ──────────────────────────────────────────────────────────
  catRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, gap: 10 },
  catDot:   { width: 9, height: 9, borderRadius: 5, flexShrink: 0 },
  catName:  { fontSize: 12, color: '#4B5563', width: 96, flexShrink: 0, fontWeight: '500' },
  barTrack: { flex: 1, height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, overflow: 'hidden' },
  barFill:  { height: 8, borderRadius: 4 },
  catCount: { fontSize: 11, fontWeight: '700', color: '#374151', minWidth: 58, textAlign: 'right' },
  catPct:   { fontWeight: '400', color: '#9CA3AF' },
});
