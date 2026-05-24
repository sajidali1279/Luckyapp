import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  RefreshControl, StatusBar, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { offersApi, managerApi, storesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  ReceiptIcon, ShoppingBagIcon, StarIcon,
  PackageIcon, ClipboardIcon, CalendarIcon, MegaphoneIcon,
  InboxIcon,
} from '../../components/Icons';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

interface Store { id: string; name: string }

const STAT_CONFIG = [
  {
    key: 'transactions',
    label: 'Transactions',
    Icon: ReceiptIcon,
    iconColor: '#3B82F6',
    bg: '#EFF6FF',
    value: (s: any) => String(s?.transactions ?? '—'),
  },
  {
    key: 'volume',
    label: 'Purchase',
    Icon: ShoppingBagIcon,
    iconColor: '#16A34A',
    bg: '#F0FDF4',
    value: (s: any) => s ? `$${Number(s.purchaseVolume || 0).toFixed(0)}` : '—',
  },
  {
    key: 'cashback',
    label: 'Cashback',
    Icon: StarIcon,
    iconColor: '#CA8A04',
    bg: '#FEFCE8',
    value: (s: any) => s ? `$${Number(s.cashbackIssued || 0).toFixed(0)}` : '—',
  },
];

const QUICK_ACTIONS = [
  { Icon: PackageIcon,   label: 'Order List', color: '#0369A1', route: '/(manager)/order-list' },
  { Icon: ClipboardIcon, label: 'Requests',   color: '#7C3AED', route: '/(manager)/requests' },
  { Icon: CalendarIcon,  label: 'Schedule',   color: '#0284C7', route: '/(manager)/schedule' },
  { Icon: MegaphoneIcon, label: 'Offers',     color: '#16A34A', route: '/(manager)/offers' },
];

export default function ManagerHomeScreen() {
  const { user } = useAuthStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const firstName = user?.name?.split(' ')[0] || 'Manager';
  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: () => storesApi.accessible(),
  });
  const stores: Store[] = storesData?.data?.data || [];

  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores]);

  const storeId = selectedStoreId || user?.storeIds?.[0];
  const currentStore = stores.find(s => s.id === storeId);

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
            <Text style={s.greeting}>{getGreeting()},</Text>
            <Text style={s.greetingName}>{firstName}!</Text>
            {currentStore && <Text style={s.storeName}>{currentStore.name}</Text>}
          </View>
          <TouchableOpacity style={s.avatarRing} onPress={() => router.push('/(manager)/profile')} activeOpacity={0.75}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Store selector — shown only when manager has multiple stores */}
        {stores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storePickerRow}>
            {stores.map(store => (
              <TouchableOpacity
                key={store.id}
                style={[s.storeChip, store.id === storeId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(store.id)}
                activeOpacity={0.75}
              >
                <Text style={[s.storeChipText, store.id === storeId && s.storeChipTextActive]}>
                  {store.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
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
              <View style={[s.statIconWrap, { backgroundColor: cfg.iconColor + '22' }]}>
                <cfg.Icon size={17} color={cfg.iconColor} strokeWidth={2} />
              </View>
              {!stats && !statsData ? (
                <ActivityIndicator size="small" color={cfg.iconColor} style={{ marginVertical: 4 }} />
              ) : (
                <Text style={[s.statValue, { color: cfg.iconColor }]}>{cfg.value(stats)}</Text>
              )}
              <Text style={s.statLabel}>{cfg.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Quick Actions ── */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>Quick Actions</Text>
        <View style={s.quickGrid}>
          {QUICK_ACTIONS.map((item) => (
            <TouchableOpacity
              key={item.label}
              style={s.quickCard}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.75}
            >
              <View style={[s.quickIconWrap, { backgroundColor: item.color + '15' }]}>
                <item.Icon size={22} color={item.color} strokeWidth={2} />
              </View>
              <Text style={[s.quickLabel, { color: item.color }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Active Offers ── */}
        <View style={s.sectionHeaderRow}>
          <Text style={[s.sectionLabel, { marginBottom: 0 }]}>Active Offers</Text>
          {offers.length > 0 && (
            <View style={s.offerCountBadge}>
              <Text style={s.offerCountText}>{offers.length}</Text>
            </View>
          )}
          <TouchableOpacity onPress={() => router.push('/(manager)/offers')} activeOpacity={0.7} style={s.manageLink}>
            <Text style={s.manageLinkText}>Manage</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 12 }} />

        {offersLoading ? (
          <View style={s.loadingCard}><ActivityIndicator color={COLORS.primary} /></View>
        ) : offers.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconWrap}>
              <InboxIcon size={40} color={COLORS.textMuted} strokeWidth={1.25} />
            </View>
            <Text style={s.emptyTitle}>No active offers</Text>
            <Text style={s.emptySub}>Tap Manage to create promotions for your store</Text>
          </View>
        ) : (
          offers.map((offer: any, i: number) => {
            const accents = ['#1D3557', '#7C3AED', '#0369A1', '#16A34A', '#B45309'];
            const accent = accents[i % accents.length];
            return (
              <View key={offer.id} style={[s.offerCard, { borderTopColor: accent }]}>
                <View style={s.offerTopRow}>
                  <Text style={s.offerTitle} numberOfLines={1}>{offer.title}</Text>
                  {offer.bonusRate ? (
                    <View style={[s.rateBadge, { backgroundColor: accent + '14', borderColor: accent + '35' }]}>
                      <Text style={[s.rateText, { color: accent }]}>+{Math.round(offer.bonusRate * 100)}% cashback</Text>
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
                  {offer.category ? (
                    <View style={s.catChip}>
                      <Text style={s.catChipText}>{offer.category.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null}
                  <Text style={s.offerDates}>
                    Until {new Date(offer.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
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
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  headerBg: { backgroundColor: '#0F5132' },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, gap: 12,
  },
  greeting: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '600' },
  greetingName: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  storeName: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600', marginTop: 3 },

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

  storePickerRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  storeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.55)' },
  storeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff', fontWeight: '700' },

  // Body
  body: { padding: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24 },
  offerCountBadge: {
    backgroundColor: '#1D3557', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
  },
  offerCountText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  manageLink: { marginLeft: 'auto' },
  manageLinkText: { fontSize: 12, color: COLORS.primary, fontWeight: '700' },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, borderRadius: 16, padding: 14, alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 2,
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 18, fontWeight: '800' },
  statLabel: {
    fontSize: 10, color: '#6B7280', fontWeight: '700', textAlign: 'center',
    textTransform: 'uppercase', letterSpacing: 0.3,
  },

  // Quick actions
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  quickCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 16,
    alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: '#F0F1F2',
  },
  quickIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickLabel: { fontSize: 13, fontWeight: '800' },

  // Offer cards
  loadingCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', gap: 8 },
  emptyIconWrap: { marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 19 },

  offerCard: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 10,
    padding: 14, borderTopWidth: 3,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    borderWidth: 1, borderColor: '#F0F1F2',
  },
  offerTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  offerTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  offerDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18, marginBottom: 6 },
  offerFooter: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  rateBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, flexShrink: 0 },
  rateText: { fontSize: 11, fontWeight: '800' },
  offerDates: { fontSize: 11, color: '#9CA3AF', marginLeft: 'auto' },
  dealChip: {
    backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FED7AA',
  },
  dealChipText: { color: '#B45309', fontSize: 11, fontWeight: '700' },
  catChip: { backgroundColor: '#F3F4F6', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  catChipText: { color: '#6B7280', fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
});
