import { View, Text, FlatList, StyleSheet, ActivityIndicator, TouchableOpacity, StatusBar, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { router } from 'expo-router';
import { leaderboardApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

function Stars({ rating, size = 16 }: { rating: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <Text key={s} style={{ fontSize: size, color: s <= Math.round(rating) ? '#F59E0B' : '#E5E7EB' }}>★</Text>
      ))}
    </View>
  );
}

export default function EmployeeLeaderboardScreen() {
  const { user } = useAuthStore();
  const storeIds: string[] = user?.storeIds || [];
  const [selectedStore, setSelectedStore] = useState<string>(storeIds[0] || '');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard-employees', selectedStore],
    queryFn: () => leaderboardApi.getEmployees(selectedStore),
    enabled: !!selectedStore,
    staleTime: 5 * 60 * 1000,
  });

  const { storeName, leaderboard = [], employeeOfMonthId } = data?.data?.data || {};

  const myEntry = leaderboard.find((e: any) => e.isCurrentUser);

  return (
    <View style={st.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={{ backgroundColor: COLORS.secondary }}>
        <View style={st.header}>
          <TouchableOpacity onPress={() => router.back()} style={st.backBtn}>
            <Text style={st.backText}>‹</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={st.headerTitle}>⭐ Staff Rankings</Text>
            <Text style={st.headerSub}>{storeName || 'Employee ratings'}</Text>
          </View>
        </View>

        {/* Store selector — shown only if assigned to multiple stores */}
        {storeIds.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.storePills}>
            {storeIds.map((id) => (
              <TouchableOpacity
                key={id}
                style={[st.storePill, selectedStore === id && st.storePillActive]}
                onPress={() => setSelectedStore(id)}
              >
                <Text style={[st.storePillText, selectedStore === id && st.storePillTextActive]}>
                  Store
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      {/* My rating card */}
      {myEntry && (
        <View style={st.myCard}>
          <View style={{ flex: 1 }}>
            <Text style={st.myCardLabel}>Your Rating</Text>
            <Stars rating={myEntry.avgRating} size={20} />
            <Text style={st.myCardSub}>{myEntry.avgRating.toFixed(1)} avg · {myEntry.ratingCount} review{myEntry.ratingCount !== 1 ? 's' : ''}</Text>
          </View>
          <View style={st.myRankBubble}>
            <Text style={st.myRankNum}>#{myEntry.rank}</Text>
            <Text style={st.myRankLabel2}>ranking</Text>
          </View>
          {myEntry.isEmployeeOfMonth && (
            <View style={st.eomBadge}>
              <Text style={st.eomBadgeText}>🏅 Employee of the Month</Text>
            </View>
          )}
        </View>
      )}

      {isLoading ? (
        <View style={st.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : leaderboard.length === 0 ? (
        <View style={st.center}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>⭐</Text>
          <Text style={st.emptyTitle}>No ratings yet</Text>
          <Text style={st.emptySub}>Ratings appear after customers rate their experience</Text>
        </View>
      ) : (
        <FlatList
          data={leaderboard}
          keyExtractor={(item: any) => item.employeeId}
          contentContainerStyle={st.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => {
            const isMine = item.isCurrentUser;
            const isEOM = item.isEmployeeOfMonth;
            return (
              <View style={[st.row, isMine && st.rowMine]}>
                <Text style={st.rowRank}>
                  {item.rank === 1 ? '🥇' : item.rank === 2 ? '🥈' : item.rank === 3 ? '🥉' : `#${item.rank}`}
                </Text>
                <View style={st.rowBody}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[st.rowName, isMine && { color: COLORS.primary }]}>
                      {item.firstName}{isMine ? ' (You)' : ''}
                    </Text>
                    {isEOM && <Text style={st.eomChip}>🏅 Month</Text>}
                  </View>
                  <Stars rating={item.avgRating} size={13} />
                </View>
                <View style={st.rowRight}>
                  <Text style={[st.rowAvg, isMine && { color: COLORS.primary }]}>{item.avgRating.toFixed(1)}</Text>
                  <Text style={st.rowCount}>{item.ratingCount} ratings</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingHorizontal: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 16,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  storePills: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  storePill: {
    paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  storePillActive: { backgroundColor: '#fff' },
  storePillText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '700' },
  storePillTextActive: { color: COLORS.secondary },

  myCard: {
    margin: 16, marginBottom: 8,
    backgroundColor: COLORS.white, borderRadius: 20, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 5,
    borderWidth: 2, borderColor: COLORS.primary + '25',
  },
  myCardLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  myCardSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 5, fontWeight: '600' },
  myRankBubble: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary + '12', alignItems: 'center', justifyContent: 'center',
  },
  myRankNum: { fontSize: 18, fontWeight: '900', color: COLORS.primary },
  myRankLabel2: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
  eomBadge: {
    width: '100%', marginTop: 4,
    backgroundColor: '#FEF3C7', borderRadius: 10, padding: 8, alignItems: 'center',
  },
  eomBadgeText: { fontSize: 13, fontWeight: '800', color: '#92400E' },

  list: { padding: 16, paddingBottom: 32 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  rowMine: { borderWidth: 2, borderColor: COLORS.primary + '40', backgroundColor: COLORS.primary + '06' },
  rowRank: { fontSize: 20, width: 32, textAlign: 'center', fontWeight: '800', color: COLORS.textMuted },
  rowBody: { flex: 1, gap: 4 },
  rowName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  eomChip: {
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
    fontSize: 11, fontWeight: '700', color: '#92400E', overflow: 'hidden',
  },
  rowRight: { alignItems: 'flex-end' },
  rowAvg: { fontSize: 18, fontWeight: '900', color: COLORS.secondary },
  rowCount: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600', marginTop: 2 },
});
