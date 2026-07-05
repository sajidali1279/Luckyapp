import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { leaderboardApi, storesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import { TrophyIcon } from '../../components/Icons';
import ErrorState from '../../components/ErrorState';
import BackButton from '../../components/BackButton';

const TIER_ICONS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function CustomerLeaderboardScreen() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'chain' | 'store'>('chain');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Reuse the gas-prices cache (same data as home screen) to get store list
  const { data: storesData } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 30 * 60 * 1000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores]);

  const chainQuery = useQuery({
    queryKey: ['leaderboard-customers-chain'],
    queryFn: () => leaderboardApi.getCustomers(),
    staleTime: 5 * 60 * 1000,
  });

  const storeQuery = useQuery({
    queryKey: ['leaderboard-customers-store', selectedStoreId],
    queryFn: () => leaderboardApi.getCustomers(selectedStoreId!),
    enabled: tab === 'store' && !!selectedStoreId,
    staleTime: 5 * 60 * 1000,
  });

  const activeQuery = tab === 'chain' ? chainQuery : storeQuery;
  const entries: any[] = activeQuery.data?.data?.data || [];

  const myEntry = entries.find((e: any) => e.isCurrentUser);
  const myRank = myEntry?.rank;

  function renderItem({ item }: { item: any }) {
    const isMine = item.isCurrentUser;
    const rankIcon = TIER_ICONS[item.rank] || null;
    return (
      <View style={[st.row, isMine && st.rowMine]}>
        <View style={st.rankBox}>
          {rankIcon
            ? <Text style={st.rankIcon}>{rankIcon}</Text>
            : <Text style={[st.rankNum, isMine && { color: COLORS.primary }]}>#{item.rank}</Text>
          }
        </View>
        <View style={st.namePts}>
          <Text style={[st.name, isMine && { color: COLORS.primary, fontWeight: '900' }]}>
            {item.firstName}{isMine ? ' (You)' : ''}
          </Text>
        </View>
        <View style={st.ptsBadge}>
          <Text style={[st.ptsText, isMine && { color: COLORS.primary }]}>
            {item.totalPoints.toLocaleString()} pts
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={{ backgroundColor: COLORS.secondary }}>
        <View style={st.header}>
          <BackButton variant="light" />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TrophyIcon size={18} color="rgba(255,255,255,0.8)" strokeWidth={1.75} />
              <Text style={st.headerTitle}>Leaderboard</Text>
            </View>
            <Text style={st.headerSub}>
            {tab === 'chain' ? 'Top Lucky Stop customers' : (stores.find(s => s.id === selectedStoreId)?.name ?? 'Store rankings')}
          </Text>
          </View>
          {myRank && (
            <View style={st.myRankPill}>
              <Text style={st.myRankLabel}>Your rank</Text>
              <Text style={st.myRankNum}>#{myRank}</Text>
            </View>
          )}
        </View>

        {/* Tab bar */}
        <View style={st.tabBar}>
          {(['chain', 'store'] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[st.tab, tab === t && st.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={t === 'chain' ? 'Show all stores leaderboard' : 'Show by-store leaderboard'}
              accessibilityState={{ selected: tab === t }}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={[st.tabText, tab === t && st.tabTextActive]}>
                {t === 'chain' ? 'All Stores' : 'By Store'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Store picker — only when store tab active */}
        {tab === 'store' && stores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.storePickerRow}>
            {stores.map((store: any) => (
              <TouchableOpacity
                key={store.id}
                style={[st.storeChip, store.id === selectedStoreId && st.storeChipActive]}
                onPress={() => setSelectedStoreId(store.id)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityLabel={`Filter by ${store.name}`}
                accessibilityState={{ selected: store.id === selectedStoreId }}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              >
                <Text style={[st.storeChipText, store.id === selectedStoreId && st.storeChipTextActive]}>
                  {store.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {activeQuery.isLoading ? (
        <View style={st.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : activeQuery.isError ? (
        <ErrorState message="Failed to load leaderboard." onRetry={() => activeQuery.refetch()} />
      ) : entries.length === 0 && !activeQuery.isLoading ? (
        <View style={st.center}>
          <View style={st.emptyIconRing}>
            <TrophyIcon size={32} color={COLORS.primary} strokeWidth={1.5} />
          </View>
          <Text style={st.emptyTitle}>No rankings yet</Text>
          <Text style={st.emptySub}>Be the first to earn points!</Text>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.customerId}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={st.podium}>
              {entries.slice(0, 3).map((e: any) => (
                <View key={e.customerId} style={[st.podiumCol, e.rank === 1 && st.podiumColFirst]}>
                  <Text style={st.podiumIcon}>{TIER_ICONS[e.rank]}</Text>
                  <Text style={st.podiumName} numberOfLines={1}>{e.firstName}</Text>
                  <Text style={st.podiumPts}>{(e.totalPoints / 1000).toFixed(1)}k</Text>
                </View>
              ))}
            </View>
          }
          renderItem={renderItem}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyIconRing: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: COLORS.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 4 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  myRankPill: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
  },
  myRankLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  myRankNum: { color: '#fff', fontSize: 18, fontWeight: '900' },

  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff', borderColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: COLORS.secondary, fontWeight: '800' },
  storePickerRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  storeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.55)' },
  storeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff', fontWeight: '700' },

  list: { padding: 16, paddingBottom: 32 },

  podium: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end',
    gap: 12, marginBottom: 24, paddingTop: 8,
  },
  podiumCol: {
    alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16,
    padding: 14, flex: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  podiumColFirst: {
    paddingVertical: 20,
    shadowOpacity: 0.14, elevation: 6,
    borderWidth: 2, borderColor: '#FFD700',
  },
  podiumIcon: { fontSize: 32, marginBottom: 6 },
  podiumName: { fontSize: 13, fontWeight: '800', color: COLORS.text },
  podiumPts: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', marginTop: 3 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rowMine: { borderWidth: 2, borderColor: COLORS.primary + '40', backgroundColor: COLORS.primary + '08' },
  rankBox: { width: 36, alignItems: 'center' },
  rankIcon: { fontSize: 22 },
  rankNum: { fontSize: 15, fontWeight: '800', color: COLORS.textMuted },
  namePts: { flex: 1 },
  name: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  ptsBadge: { backgroundColor: COLORS.secondary + '12', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  ptsText: { fontSize: 13, fontWeight: '800', color: COLORS.secondary },
});
