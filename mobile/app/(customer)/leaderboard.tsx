import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { router } from 'expo-router';
import { leaderboardApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

const TIER_ICONS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function CustomerLeaderboardScreen() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'chain' | 'store'>('chain');

  // Nearest store id stored in a global — passed from home screen via navigation params
  // or we just rely on the chain-wide view as primary
  const storeId = undefined; // TODO: pass nearestStore.id via route params when navigating

  const chainQuery = useQuery({
    queryKey: ['leaderboard-customers-chain'],
    queryFn: () => leaderboardApi.getCustomers(),
    staleTime: 5 * 60 * 1000,
  });

  const entries: any[] = chainQuery.data?.data?.data || [];

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
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Text style={st.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>🏆 Leaderboard</Text>
            <Text style={st.headerSub}>Top Lucky Stop customers</Text>
          </View>
          {myRank && (
            <View style={st.myRankPill}>
              <Text style={st.myRankLabel}>Your rank</Text>
              <Text style={st.myRankNum}>#{myRank}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {chainQuery.isLoading ? (
        <View style={st.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
        </View>
      ) : entries.length === 0 ? (
        <View style={st.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🏁</Text>
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, marginTop: 6 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  myRankPill: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center',
  },
  myRankLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 10, fontWeight: '700', textTransform: 'uppercase' },
  myRankNum: { color: '#fff', fontSize: 18, fontWeight: '900' },

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
