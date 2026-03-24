import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { offersApi, managerApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function ManagerHomeScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const firstName = user?.name?.split(' ')[0] || 'Manager';
  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();

  const {
    data: offersData, isLoading: offersLoading,
    refetch: refetchOffers, isRefetching: offersRefetching,
  } = useQuery({
    queryKey: ['manager-offers', storeId],
    queryFn: () => offersApi.getActive(storeId),
    enabled: !!storeId,
  });

  const {
    data: statsData,
    refetch: refetchStats, isRefetching: statsRefetching,
  } = useQuery({
    queryKey: ['manager-stats', storeId],
    queryFn: () => managerApi.getStoreStats(storeId!),
    enabled: !!storeId,
  });

  const offers: any[] = offersData?.data?.data || [];
  const stats = statsData?.data?.data?.today;
  const isRefreshing = offersRefetching || statsRefetching;

  function onRefresh() {
    refetchOffers();
    refetchStats();
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.storeLine}>🏪 Store Manager</Text>
            <Text style={s.greeting}>{getGreeting()}, {firstName}!</Text>
          </View>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Stats ── */}
        <Text style={s.sectionLabel}>Today's Overview</Text>
        <View style={s.statsRow}>
          <StatCard
            label="Transactions"
            value={stats ? String(stats.transactions) : '—'}
            icon="🧾"
            loading={!stats}
          />
          <StatCard
            label="Points Granted"
            value={stats ? `$${Number(stats.purchaseVolume || 0).toFixed(0)}` : '—'}
            icon="💰"
            loading={!stats}
          />
          <StatCard
            label="Active Offers"
            value={String(offers.length)}
            icon="📢"
            loading={offersLoading}
          />
        </View>

        {/* ── Active Offers ── */}
        <View style={s.sectionHeader}>
          <Text style={s.sectionLabel}>Active Offers</Text>
        </View>

        {offersLoading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : offers.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitle}>No active offers</Text>
            <Text style={s.emptySub}>Tap the Offers tab to create promotions for your store</Text>
          </View>
        ) : (
          offers.map((offer: any) => (
            <View key={offer.id} style={s.offerCard}>
              <View style={s.offerLeft}>
                <Text style={s.offerTitle}>{offer.title}</Text>
                {offer.description ? (
                  <Text style={s.offerDesc} numberOfLines={2}>{offer.description}</Text>
                ) : null}
                {offer.dealText ? (
                  <View style={s.dealBadge}>
                    <Text style={s.dealBadgeText}>{offer.dealText}</Text>
                  </View>
                ) : null}
                <Text style={s.offerDates}>
                  Ends {new Date(offer.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </Text>
              </View>
              {offer.bonusRate ? (
                <View style={s.rateBadge}>
                  <Text style={s.rateNum}>{Math.round(offer.bonusRate * 100)}</Text>
                  <Text style={s.ratePct}>%</Text>
                </View>
              ) : null}
            </View>
          ))
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

function StatCard({ label, value, icon, loading }: { label: string; value: string; icon: string; loading: boolean }) {
  return (
    <View style={s.statCard}>
      <Text style={s.statIcon}>{icon}</Text>
      {loading ? (
        <ActivityIndicator size="small" color={COLORS.primary} />
      ) : (
        <Text style={s.statValue}>{value}</Text>
      )}
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, gap: 12,
  },
  storeLine: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  greeting: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 3 },
  avatarCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },

  body: { padding: 16, paddingBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },

  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 4 },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  statIcon: { fontSize: 22 },
  statValue: { fontSize: 20, fontWeight: '800', color: COLORS.secondary },
  statLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },

  loadingCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 28, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 38, marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },

  offerCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  offerLeft: { flex: 1, paddingRight: 12 },
  offerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  offerDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, lineHeight: 18 },
  offerDates: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },
  dealBadge: { backgroundColor: COLORS.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6, alignSelf: 'flex-start' },
  dealBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  rateBadge: {
    width: 58, height: 58, borderRadius: 29, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rateNum: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 24 },
  ratePct: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', marginTop: -2 },
});
