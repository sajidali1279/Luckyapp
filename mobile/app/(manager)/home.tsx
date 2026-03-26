import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
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

const STAT_CONFIG = [
  { key: 'transactions', label: 'Transactions', icon: '🧾', bg: '#eff6ff', value: (s: any) => String(s?.transactions ?? '—') },
  { key: 'volume',       label: 'Purchase Vol.', icon: '💵', bg: '#f0fdf4', value: (s: any) => s ? `$${Number(s.purchaseVolume || 0).toFixed(0)}` : '—' },
  { key: 'cashback',     label: 'Cashback Out',  icon: '⭐', bg: '#fefce8', value: (s: any) => s ? `$${Number(s.cashbackIssued || 0).toFixed(0)}` : '—' },
];

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

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.storeLine}>🏪 STORE MANAGER</Text>
            <Text style={s.greeting}>{getGreeting()},</Text>
            <Text style={s.greetingName}>{firstName}!</Text>
          </View>
          <View style={s.avatarRing}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={offersRefetching || statsRefetching}
            onRefresh={() => { refetchOffers(); refetchStats(); }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Today's Stats ── */}
        <Text style={s.sectionLabel}>Today's Overview</Text>
        <View style={s.statsRow}>
          {STAT_CONFIG.map((cfg) => (
            <View key={cfg.key} style={[s.statCard, { backgroundColor: cfg.bg }]}>
              <Text style={s.statEmoji}>{cfg.icon}</Text>
              {!stats && !statsData ? (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginVertical: 4 }} />
              ) : (
                <Text style={s.statValue}>{cfg.value(stats)}</Text>
              )}
              <Text style={s.statLabel}>{cfg.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>Quick Actions</Text>
        <View style={s.quickGrid}>
          {[
            { icon: '📋', label: 'Requests',  color: '#7c3aed', route: '/(manager)/requests' },
            { icon: '📅', label: 'Schedule',  color: '#0369a1', route: '/(manager)/schedule' },
            { icon: '📢', label: 'Offers',    color: '#16a34a', route: '/(manager)/offers' },
            { icon: '🖼️', label: 'Banners',   color: '#b45309', route: '/(manager)/banners' },
          ].map((item) => (
            <TouchableOpacity
              key={item.label}
              style={s.quickCard}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
            >
              <View style={[s.quickIconWrap, { backgroundColor: item.color + '15' }]}>
                <Text style={s.quickEmoji}>{item.icon}</Text>
              </View>
              <Text style={[s.quickLabel, { color: item.color }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Active Offers ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={[s.sectionLabel, { marginBottom: 0 }]}>Active Offers</Text>
          <View style={s.offerCountBadge}>
            <Text style={s.offerCountText}>{offers.length}</Text>
          </View>
        </View>

        <View style={{ height: 12 }} />

        {offersLoading ? (
          <View style={s.loadingCard}><ActivityIndicator color={COLORS.primary} /></View>
        ) : offers.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitle}>No active offers</Text>
            <Text style={s.emptySub}>Tap Offers above to create promotions for your store</Text>
          </View>
        ) : (
          offers.map((offer: any, i: number) => {
            const colors = ['#1D3557', '#7c3aed', '#0369a1', '#16a34a', '#b45309'];
            const accent = colors[i % colors.length];
            return (
              <View key={offer.id} style={s.offerCard}>
                <View style={[s.offerAccent, { backgroundColor: accent }]} />
                <View style={s.offerBody}>
                  <View style={s.offerTopRow}>
                    <Text style={s.offerTitle} numberOfLines={1}>{offer.title}</Text>
                    {offer.bonusRate ? (
                      <View style={[s.rateBadge, { backgroundColor: accent }]}>
                        <Text style={s.rateText}>{Math.round(offer.bonusRate * 100)}%</Text>
                      </View>
                    ) : null}
                  </View>
                  {offer.description ? (
                    <Text style={s.offerDesc} numberOfLines={2}>{offer.description}</Text>
                  ) : null}
                  <View style={s.offerFooter}>
                    {offer.dealText ? (
                      <View style={s.dealChip}>
                        <Text style={s.dealChipText}>{offer.dealText}</Text>
                      </View>
                    ) : null}
                    <Text style={s.offerDates}>
                      Ends {new Date(offer.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })
        )}

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  headerBg: { backgroundColor: '#0f5132' },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18, gap: 12,
  },
  storeLine: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10,
    fontWeight: '800', letterSpacing: 1.5, marginBottom: 4,
  },
  greeting: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '600' },
  greetingName: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: -2 },
  avatarRing: {
    width: 52, height: 52, borderRadius: 26, marginTop: 4,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#2DC653', alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },

  // Body
  body: { padding: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 },
  offerCountBadge: {
    backgroundColor: '#1D3557', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  offerCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, borderRadius: 16, padding: 14,
    alignItems: 'center', gap: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  statEmoji: { fontSize: 22 },
  statValue: { fontSize: 18, fontWeight: '800', color: '#111827' },
  statLabel: { fontSize: 10, color: '#6b7280', fontWeight: '700', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3 },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  quickIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  quickEmoji: { fontSize: 24 },
  quickLabel: { fontSize: 13, fontWeight: '800' },

  // Offer cards
  loadingCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 38, marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 },

  offerCard: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 10,
    flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  offerAccent: { width: 5 },
  offerBody: { flex: 1, padding: 14 },
  offerTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  offerTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  offerDesc: { fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 18 },
  offerFooter: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  offerDates: { fontSize: 11, color: '#9ca3af' },
  rateBadge: {
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0,
  },
  rateText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  dealChip: {
    backgroundColor: '#fff7ed', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  dealChipText: { color: '#b45309', fontSize: 11, fontWeight: '700' },
});
