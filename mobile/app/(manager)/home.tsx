import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Rect } from 'react-native-svg';
import { managerApi, storesApi, employeeRequestApi, orderCategoriesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  PackageIcon, ClipboardIcon, TrendingUpIcon, InboxIcon, ChevronRightIcon,
} from '../../components/Icons';

const BAR_COLORS = [
  '#1D3557', '#E63946', '#F4A261', '#2DC653', '#6A4C93',
  '#1CBEC0', '#F7B731', '#FC5C65', '#45AAF2', '#26DE81',
];

const RANK = [
  { bg: '#FEF9C3', color: '#A16207', border: '#FDE047' }, // 1 — gold
  { bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' }, // 2 — silver
  { bg: '#FEF0E6', color: '#C2410C', border: '#FED7AA' }, // 3 — bronze
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
  const user = useAuthStore(s => s.user);
  const [period, setPeriod] = useState('30');
  const [category, setCategory] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60 * 1000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];
  const storeId = stores.length === 1 ? stores[0].id : undefined;

  const { data: catListData } = useQuery({
    queryKey: ['order-categories-approved'],
    queryFn: () => orderCategoriesApi.getApproved(),
    staleTime: 10 * 60 * 1000,
  });
  const categoryOptions: { id: string; name: string }[] = catListData?.data?.data ?? [];

  const { data, isLoading, refetch } = useQuery({
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

  async function onRefresh() {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }

  const topItems: { name: string; category: string | null; orderCount: number }[] = analytics?.topItems ?? [];
  const categories: { category: string; count: number; pct: number }[] = analytics?.categoryBreakdown ?? [];
  const activeList = analytics?.activeListSummary;
  const totalItems: number = analytics?.totalItems ?? 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* Header with SVG gradient */}
      <View style={s.header}>
        <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none">
          <Defs>
            <SvgGradient id="hg" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#0f1f35" />
              <Stop offset="1" stopColor="#2a4a73" />
            </SvgGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#hg)" />
        </Svg>

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* LS logo mark */}
            <View style={s.headerLogo}>
              <Text style={s.headerLogoText}>LS</Text>
            </View>
            <View>
              <Text style={s.greeting}>{getGreeting()}</Text>
              <Text style={s.name}>{user?.name?.split(' ')[0] ?? 'Manager'}</Text>
              {stores.length === 1 && <Text style={s.storeName}>{stores[0].name}</Text>}
            </View>
          </View>
          {totalItems > 0 && (
            <View style={s.headerBadge}>
              <Text style={s.headerBadgeText}>{totalItems} tracked</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Quick stat cards — overlap the header */}
        <View style={s.quickRow}>
          <TouchableOpacity style={[s.quickCard, s.quickCardWide]} onPress={() => router.push('/(manager)/order-list')} activeOpacity={0.85}>
            <View style={s.quickTop}>
              <View style={[s.quickIconBox, { backgroundColor: COLORS.primary + '15' }]}>
                <TrendingUpIcon size={20} color={COLORS.primary} />
              </View>
              <Text style={[s.quickBadgeText, { color: COLORS.textMuted, fontSize: 10 }]}>
                {PERIODS.find(p => p.value === period)?.label}
              </Text>
            </View>
            <Text style={s.quickLabel}>Total Orders</Text>
            <Text style={s.quickValue}>{topItems.reduce((a, b) => a + b.orderCount, 0) || '—'}</Text>
            <Text style={s.quickSub}>{categories.length} categories</Text>
          </TouchableOpacity>
        </View>

        <View style={s.quickRow}>
          <TouchableOpacity
            style={s.quickCard}
            onPress={() => router.push('/(manager)/order-list')}
            activeOpacity={0.85}
          >
            <View style={s.quickTop}>
              <View style={[s.quickIconBox, { backgroundColor: COLORS.secondary + '15' }]}>
                <PackageIcon size={20} color={COLORS.secondary} />
              </View>
              <ChevronRightIcon size={14} color="#ADB5BD" />
            </View>
            <Text style={s.quickLabel}>Active List</Text>
            {activeList ? (
              <>
                <Text style={s.quickValue}>{activeList.itemCount}</Text>
                <View style={s.quickBadge}>
                  <Text style={s.quickBadgeText}>OPEN</Text>
                </View>
              </>
            ) : (
              <>
                <Text style={s.quickValue}>—</Text>
                <Text style={s.quickSub}>No open list</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={s.quickCard}
            onPress={() => router.push('/(manager)/requests')}
            activeOpacity={0.85}
          >
            <View style={s.quickTop}>
              <View style={[s.quickIconBox, { backgroundColor: pendingCount > 0 ? '#FFF7ED' : COLORS.secondary + '15' }]}>
                <ClipboardIcon size={20} color={pendingCount > 0 ? '#EA580C' : COLORS.secondary} />
              </View>
              <ChevronRightIcon size={14} color="#ADB5BD" />
            </View>
            <Text style={s.quickLabel}>Requests</Text>
            <Text style={[s.quickValue, pendingCount > 0 && { color: '#EA580C' }]}>
              {pendingCount}
            </Text>
            {pendingCount > 0 ? (
              <View style={[s.quickBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                <Text style={[s.quickBadgeText, { color: '#C2410C' }]}>REVIEW</Text>
              </View>
            ) : (
              <Text style={s.quickSub}>All clear</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Pending alert banner */}
        {pendingCount > 0 && (
          <TouchableOpacity
            style={s.alertCard}
            onPress={() => router.push('/(manager)/requests')}
            activeOpacity={0.8}
          >
            <View style={s.alertIcon}>
              <InboxIcon size={18} color="#C2410C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>
                {pendingCount} pending item {pendingCount === 1 ? 'request' : 'requests'}
              </Text>
              <Text style={s.alertSub}>Tap to review and add to order list</Text>
            </View>
            <ChevronRightIcon size={16} color="#C2410C" />
          </TouchableOpacity>
        )}

        {/* Inventory Intelligence header */}
        <View style={s.sectionHeader}>
          <TrendingUpIcon size={15} color={COLORS.secondary} />
          <Text style={s.sectionTitle}>Inventory Intelligence</Text>
          <View style={s.periodPicker}>
            {PERIODS.map(p => (
              <TouchableOpacity
                key={p.value}
                style={[s.periodBtn, period === p.value && s.periodBtnActive]}
                onPress={() => setPeriod(p.value)}
              >
                <Text style={[s.periodBtnText, period === p.value && s.periodBtnTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
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
              style={[s.chip, category === '' && s.chipActive]}
              onPress={() => setCategory('')}
            >
              <Text style={[s.chipText, category === '' && s.chipTextActive]}>All</Text>
            </TouchableOpacity>
            {categoryOptions.map(c => (
              <TouchableOpacity
                key={c.id}
                style={[s.chip, category === c.name && s.chipActive]}
                onPress={() => setCategory(category === c.name ? '' : c.name)}
              >
                <Text style={[s.chipText, category === c.name && s.chipTextActive]} numberOfLines={1}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {isLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={COLORS.secondary} />
            <Text style={s.loadingText}>Loading analytics…</Text>
          </View>
        ) : (
          <>
            {/* Top ordered items */}
            <View style={s.card}>
              <View style={s.cardHeader}>
                <Text style={s.cardTitle}>Most Ordered Items</Text>
                {totalItems > 0 && <Text style={s.cardSub}>{totalItems} total</Text>}
              </View>
              {topItems.length === 0 ? (
                <View style={s.emptyBox}>
                  <View style={s.emptyIcon}><PackageIcon size={28} color={COLORS.border} /></View>
                  <Text style={s.empty}>No orders yet for this period</Text>
                  <Text style={s.emptySub}>Orders will appear here as your team logs inventory requests</Text>
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
                        <Text style={s.itemCountLabel}>orders</Text>
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
                  <Text style={s.cardTitle}>By Category</Text>
                  <Text style={s.cardSub}>{categories.length} categories</Text>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: '#F1F3F5' },
  scroll: { flex: 1 },
  content: { paddingTop: 0, paddingHorizontal: 16, paddingBottom: 48 },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 64,
    overflow: 'hidden',
  },
  headerLogo: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  headerLogoText: { color: '#fff', fontSize: 14, fontWeight: '900', letterSpacing: 0.5 },
  greeting:  { fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: '500', letterSpacing: 0.3 },
  name:      { fontSize: 24, color: '#FFFFFF', fontWeight: '800', marginTop: 1, letterSpacing: -0.3 },
  storeName: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 3, fontWeight: '400' },
  headerBadge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
    alignSelf: 'flex-start', marginTop: 4,
  },
  headerBadgeText: { fontSize: 11, color: 'rgba(255,255,255,0.85)', fontWeight: '600' },

  // ── Quick cards (overlap header) ─────────────────────────────────────────────
  quickRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: -52,
    marginBottom: 10,
  },
  quickCardWide: { flex: 1 },
  quickCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#1D3557',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
    gap: 4,
  },
  quickTop:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  quickIconBox:{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickLabel:  { fontSize: 10, color: '#9CA3AF', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  quickValue:  { fontSize: 30, fontWeight: '800', color: '#111827', lineHeight: 34, letterSpacing: -0.5 },
  quickSub:    { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  quickBadge:  {
    alignSelf: 'flex-start', marginTop: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7',
  },
  quickBadgeText: { fontSize: 9, fontWeight: '800', color: '#059669', letterSpacing: 0.8 },

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
  chipActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
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
  itemCount:    { fontSize: 16, fontWeight: '800', color: COLORS.secondary },
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
