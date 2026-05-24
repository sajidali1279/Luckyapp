import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { managerApi, storesApi, employeeRequestApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  PackageIcon, ClipboardIcon, TrendingUpIcon, InboxIcon,
} from '../../components/Icons';

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

// Compact horizontal bar for category breakdown
function CategoryBar({ name, pct, count }: { name: string; pct: number; count: number }) {
  return (
    <View style={s.catRow}>
      <Text style={s.catName} numberOfLines={1}>{name}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, { width: `${Math.max(pct, 2)}%` as any }]} />
      </View>
      <Text style={s.catCount}>{count}</Text>
    </View>
  );
}

export default function ManagerHome() {
  const user = useAuthStore(s => s.user);
  const [period, setPeriod] = useState('30');
  const [refreshing, setRefreshing] = useState(false);

  // Fetch store(s) for this manager
  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60 * 1000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];
  // For single-store managers take first; admins get aggregate
  const storeId = stores.length === 1 ? stores[0].id : undefined;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['inventory-analytics', storeId, period],
    queryFn: () => managerApi.getInventoryAnalytics({ storeId, period }),
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

  const topItems: { name: string; category: string | null; orderCount: number }[] =
    analytics?.topItems ?? [];
  const categories: { category: string; count: number; pct: number }[] =
    analytics?.categoryBreakdown ?? [];
  const activeList = analytics?.activeListSummary;
  const totalItems: number = analytics?.totalItems ?? 0;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* Header */}
      <View style={s.header}>
        <Text style={s.greeting}>{getGreeting()},</Text>
        <Text style={s.name}>{user?.name?.split(' ')[0] ?? 'Manager'}</Text>
        {stores.length === 1 && (
          <Text style={s.storeName}>{stores[0].name}</Text>
        )}
      </View>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.secondary} />}
        showsVerticalScrollIndicator={false}
      >
        {/* Pending requests alert — shown only when there are pending */}
        {pendingCount > 0 && (
          <TouchableOpacity
            style={s.alertCard}
            onPress={() => router.push('/(manager)/requests')}
            activeOpacity={0.8}
          >
            <View style={s.alertIcon}>
              <InboxIcon size={20} color="#C2410C" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.alertTitle}>
                {pendingCount} pending item {pendingCount === 1 ? 'request' : 'requests'}
              </Text>
              <Text style={s.alertSub}>Tap to review and add to order list</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* Active list status */}
        <View style={s.row}>
          <TouchableOpacity
            style={[s.quickCard, { flex: 1, marginRight: 8 }]}
            onPress={() => router.push('/(manager)/order-list')}
            activeOpacity={0.8}
          >
            <PackageIcon size={22} color={COLORS.secondary} />
            <Text style={s.quickLabel}>Active List</Text>
            {activeList ? (
              <>
                <Text style={s.quickValue}>{activeList.itemCount}</Text>
                <Text style={s.quickSub} numberOfLines={1}>{activeList.name}</Text>
              </>
            ) : (
              <Text style={s.quickSub}>No open list</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.quickCard, { flex: 1, marginLeft: 8 }]}
            onPress={() => router.push('/(manager)/requests')}
            activeOpacity={0.8}
          >
            <ClipboardIcon size={22} color={pendingCount > 0 ? '#EA580C' : COLORS.secondary} />
            <Text style={s.quickLabel}>Requests</Text>
            <Text style={[s.quickValue, pendingCount > 0 && { color: '#EA580C' }]}>
              {pendingCount}
            </Text>
            <Text style={s.quickSub}>Pending review</Text>
          </TouchableOpacity>
        </View>

        {/* Period selector */}
        <View style={s.sectionHeader}>
          <TrendingUpIcon size={16} color={COLORS.secondary} />
          <Text style={s.sectionTitle}>Order Intelligence</Text>
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

        {isLoading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={COLORS.secondary} />
        ) : (
          <>
            {/* Top ordered items */}
            <View style={s.card}>
              <Text style={s.cardTitle}>Most Ordered Items</Text>
              <Text style={s.cardSub}>{totalItems} orders tracked</Text>
              {topItems.length === 0 ? (
                <Text style={s.empty}>No order history yet</Text>
              ) : (
                topItems.slice(0, 10).map((item, i) => (
                  <View key={`${item.name}-${i}`} style={s.itemRow}>
                    <View style={s.itemRank}>
                      <Text style={s.itemRankText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.itemName}>{item.name}</Text>
                      {item.category && (
                        <Text style={s.itemCat}>{item.category}</Text>
                      )}
                    </View>
                    <Text style={s.itemCount}>{item.orderCount}×</Text>
                  </View>
                ))
              )}
            </View>

            {/* Category breakdown */}
            {categories.length > 0 && (
              <View style={s.card}>
                <Text style={s.cardTitle}>By Category</Text>
                {categories.map(cat => (
                  <CategoryBar
                    key={cat.category}
                    name={cat.category}
                    pct={cat.pct}
                    count={cat.count}
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
  safe:   { flex: 1, backgroundColor: '#F8F9FA' },
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },

  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 24,
  },
  greeting: { fontSize: 13, color: 'rgba(255,255,255,0.75)', fontWeight: '400', letterSpacing: 0.2 },
  name:     { fontSize: 24, color: '#FFFFFF', fontWeight: '700', marginTop: 2 },
  storeName:{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  alertCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    gap: 12,
  },
  alertIcon:  { width: 36, height: 36, borderRadius: 8, backgroundColor: '#FFEDD5', alignItems: 'center', justifyContent: 'center' },
  alertTitle: { fontSize: 14, fontWeight: '600', color: '#C2410C' },
  alertSub:   { fontSize: 12, color: '#9A3412', marginTop: 1 },

  row: { flexDirection: 'row', marginBottom: 14 },

  quickCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    alignItems: 'flex-start',
    gap: 4,
  },
  quickLabel: { fontSize: 11, color: '#6C757D', fontWeight: '500', marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  quickValue: { fontSize: 28, fontWeight: '700', color: '#212529', lineHeight: 32 },
  quickSub:   { fontSize: 12, color: '#6C757D' },

  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, marginTop: 4 },
  sectionTitle:  { fontSize: 14, fontWeight: '700', color: '#495057', flex: 1 },

  periodPicker: { flexDirection: 'row', backgroundColor: '#E9ECEF', borderRadius: 8, padding: 2 },
  periodBtn:     { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 6 },
  periodBtnActive: { backgroundColor: '#FFFFFF' },
  periodBtnText:   { fontSize: 12, color: '#6C757D', fontWeight: '500' },
  periodBtnTextActive: { color: '#212529', fontWeight: '600' },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E9ECEF',
    padding: 16,
    marginBottom: 14,
  },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#212529', marginBottom: 2 },
  cardSub:   { fontSize: 12, color: '#6C757D', marginBottom: 12 },
  empty:     { fontSize: 13, color: '#ADB5BD', textAlign: 'center', paddingVertical: 24 },

  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F3F5' },
  itemRank: { width: 24, height: 24, borderRadius: 6, backgroundColor: '#F1F3F5', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  itemRankText: { fontSize: 11, fontWeight: '700', color: '#495057' },
  itemName: { fontSize: 14, fontWeight: '500', color: '#212529' },
  itemCat:  { fontSize: 11, color: '#6C757D', marginTop: 1 },
  itemCount:{ fontSize: 14, fontWeight: '700', color: COLORS.secondary },

  catRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },
  catName: { fontSize: 12, color: '#495057', width: 100 },
  barTrack: { flex: 1, height: 6, backgroundColor: '#F1F3F5', borderRadius: 3, overflow: 'hidden' },
  barFill:  { height: 6, backgroundColor: COLORS.secondary, borderRadius: 3 },
  catCount: { fontSize: 12, fontWeight: '600', color: '#495057', width: 30, textAlign: 'right' },
});
