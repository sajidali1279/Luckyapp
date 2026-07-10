import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
  TouchableOpacity, ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { leaderboardApi, storesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS, AVATAR_PALETTE, TEXT_GRAY } from '../../constants';
import { TrophyIcon, StarIcon } from '../../components/Icons';
import FadeSlideIn from '../../components/FadeSlideIn';
import ErrorState from '../../components/ErrorState';
import ManagerHeader from '../../components/ManagerHeader';

interface Store { id: string; name: string }

type Tab = 'customers' | 'staff';

const RANK_COLORS = ['#F59E0B', '#9CA3AF', '#B45309']; // gold, silver, bronze

function Stars({ rating }: { rating: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1 }}>
      {[1, 2, 3, 4, 5].map((s) => (
        <StarIcon key={s} size={13} color={s <= Math.round(rating) ? '#F59E0B' : '#E5E7EB'} strokeWidth={1.5} filled={s <= Math.round(rating)} />
      ))}
    </View>
  );
}

export default function ManagerLeaderboardScreen() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<Tab>('customers');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: () => storesApi.accessible(),
  });
  const stores: Store[] = storesData?.data?.data || [];
  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores]);
  const storeId = selectedStoreId || user?.storeIds?.[0];

  // Customer leaderboard — filtered to the selected store (store chips above change storeId and re-trigger this query)
  const { data: custData, isLoading: custLoading, isError: custError, refetch: refetchCust } = useQuery({
    queryKey: ['leaderboard-customers-mgr', storeId],
    queryFn: () => leaderboardApi.getCustomers(storeId),
    enabled: tab === 'customers',
    staleTime: 5 * 60 * 1000,
  });
  const customers: any[] = custData?.data?.data?.leaderboard || [];

  // Staff leaderboard
  const { data: staffData, isLoading: staffLoading, isError: staffError, refetch: refetchStaff } = useQuery({
    queryKey: ['leaderboard-employees', storeId],
    queryFn: () => leaderboardApi.getEmployees(storeId!),
    enabled: tab === 'staff' && !!storeId,
    staleTime: 5 * 60 * 1000,
  });
  const { storeName, leaderboard: staff = [], employeeOfMonthId } = staffData?.data?.data || {};

  const isLoading = tab === 'customers' ? custLoading : staffLoading;
  const isError = tab === 'customers' ? custError : staffError;
  const refetchCurrent = tab === 'customers' ? refetchCust : refetchStaff;

  return (
    <View style={s.root}>
      <ManagerHeader
        title="Leaderboard"
        subtitle={storeName || stores.find(st => st.id === storeId)?.name || 'Your store'}
        showBack
        paddingHorizontal={16}
        rightSlot={<TrophyIcon size={24} color="rgba(255,255,255,0.55)" strokeWidth={1.75} />}
      >
        {/* Store selector */}
        {stores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storePickerRow}>
            {stores.map(store => (
              <TouchableOpacity
                key={store.id}
                style={[s.storeChip, store.id === storeId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(store.id)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityLabel={`Filter by ${store.name}`}
                accessibilityState={{ selected: store.id === storeId }}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              >
                <Text style={[s.storeChipText, store.id === storeId && s.storeChipTextActive]}>{store.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Tab bar */}
        <View style={s.tabBar}>
          {(['customers', 'staff'] as Tab[]).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={t === 'customers' ? 'Top Customers' : 'Staff Ratings'}
              accessibilityState={{ selected: tab === t }}
              hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'customers' ? 'Top Customers' : 'Staff Ratings'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ManagerHeader>

      {isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : isError ? (
        <ErrorState message="Failed to load the leaderboard." onRetry={() => refetchCurrent()} />
      ) : tab === 'customers' ? (
        <FadeSlideIn style={{ flex: 1 }}>
        <FlatList
          data={customers}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyText}>No customer data yet</Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={s.customerRow}>
              <View style={s.rankWrap}>
                {index < 3
                  ? <TrophyIcon size={18} color={RANK_COLORS[index]} strokeWidth={2} />
                  : <Text style={s.rank}>#{index + 1}</Text>}
              </View>
              <View style={[s.avatar, { backgroundColor: custAvatarColor(index) }]}>
                <Text style={s.avatarText}>{(item.name || item.phone || '?')[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.customerName} numberOfLines={1}>{item.name || item.phone}</Text>
                <Text style={s.customerSub}>{item.transactionCount} visits</Text>
              </View>
              <View style={s.pointsBadge}>
                <Text style={s.pointsNum}>{Math.round(Number(item.pointsBalance || 0) * 100).toLocaleString()}</Text>
                <Text style={s.pointsLbl}>pts</Text>
              </View>
            </View>
          )}
        />
        </FadeSlideIn>
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
        <FlatList
          data={staff}
          keyExtractor={(item: any) => item.id}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.centered}>
              <Text style={s.emptyText}>No staff ratings yet</Text>
            </View>
          }
          renderItem={({ item, index }: { item: any; index: number }) => {
            const isEOM = item.id === employeeOfMonthId;
            return (
              <View style={[s.staffRow, isEOM && s.staffRowEOM]}>
                <View style={s.rankWrap}>
                  {index < 3
                    ? <TrophyIcon size={18} color={RANK_COLORS[index]} strokeWidth={2} />
                    : <Text style={s.rank}>#{index + 1}</Text>}
                </View>
                <View style={[s.avatar, { backgroundColor: custAvatarColor(index) }]}>
                  <Text style={s.avatarText}>{(item.name || '?')[0].toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={s.staffName} numberOfLines={1}>{item.name || item.phone}</Text>
                    {isEOM && (
                      <View style={s.eomBadge}>
                        <StarIcon size={10} color="#B45309" strokeWidth={2} />
                        <Text style={s.eomText}>Month</Text>
                      </View>
                    )}
                  </View>
                  {item.allTime?.count > 0
                    ? <Stars rating={item.allTime.avg} />
                    : <Text style={s.customerSub}>No ratings yet</Text>}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  {item.allTime?.count > 0 && (
                    <Text style={s.ratingNum}>{item.allTime.avg.toFixed(1)}</Text>
                  )}
                  <Text style={s.ratingCount}>{item.allTime?.count ?? 0} reviews</Text>
                </View>
              </View>
            );
          }}
        />
        </FadeSlideIn>
      )}
    </View>
  );
}

function custAvatarColor(i: number) { return AVATAR_PALETTE[i % AVATAR_PALETTE.length]; }

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  storePickerRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  storeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.55)' },
  storeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff', fontWeight: '700' },

  tabBar: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff', borderColor: '#fff' },
  tabText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: COLORS.managerPrimary, fontWeight: '800' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { fontSize: 14, color: TEXT_GRAY[500], textAlign: 'center' },
  list: { padding: 16, gap: 10 },

  // Customer rows
  customerRow: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  rankWrap: { width: 28, alignItems: 'center' },
  rank: { fontSize: 13, fontWeight: '800', color: TEXT_GRAY[400] },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  customerName: { fontSize: 14, fontWeight: '700', color: TEXT_GRAY[900] },
  customerSub: { fontSize: 12, color: TEXT_GRAY[400], marginTop: 2 },
  pointsBadge: { alignItems: 'flex-end' },
  pointsNum: { fontSize: 16, fontWeight: '800', color: COLORS.primary },
  pointsLbl: { fontSize: 10, color: TEXT_GRAY[400], fontWeight: '700', textTransform: 'uppercase' },

  // Staff rows
  staffRow: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  staffRowEOM: { borderWidth: 1.5, borderColor: '#F59E0B' },
  staffName: { fontSize: 14, fontWeight: '700', color: TEXT_GRAY[900], marginBottom: 2 },
  eomBadge: { backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, flexDirection: 'row', alignItems: 'center', gap: 3 },
  eomText: { fontSize: 10, fontWeight: '800', color: '#B45309' },
  ratingNum: { fontSize: 18, fontWeight: '800', color: '#F59E0B' },
  ratingCount: { fontSize: 11, color: TEXT_GRAY[400], fontWeight: '600' },
});
