import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { offersApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function EmployeeHomeScreen() {
  const { user } = useAuthStore();
  const firstName = user?.name?.split(' ')[0] || 'there';
  const initial = (user?.name || user?.phone || '?')[0].toUpperCase();

  const {
    data: offersData, isLoading: offersLoading,
    refetch: refetchOffers, isRefetching: offersRefetching,
  } = useQuery({ queryKey: ['offers'], queryFn: () => offersApi.getActive() });

  const {
    data: bannersData,
    refetch: refetchBanners, isRefetching: bannersRefetching,
  } = useQuery({ queryKey: ['banners'], queryFn: () => offersApi.getBanners() });

  const allOffers: any[] = offersData?.data?.data || [];
  const promotions = allOffers.filter((o: any) => o.bonusRate);
  const deals = allOffers.filter((o: any) => o.dealText);
  const banners: any[] = bannersData?.data?.data || [];
  const isRefreshing = offersRefetching || bannersRefetching;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.storeLine}>⛽ LUCKY STOP STAFF</Text>
            <Text style={s.greeting}>{getGreeting()},</Text>
            <Text style={s.greetingName}>{firstName}!</Text>
          </View>
          <View style={s.avatarRing}>
            <View style={s.avatarCircle}>
              <Text style={s.avatarText}>{initial}</Text>
            </View>
          </View>
        </View>

        <View style={s.statusPill}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>On Duty · {user?.role?.replace(/_/g, ' ')}</Text>
        </View>

        {promotions.length > 0 && (
          <View style={s.promoStrip}>
            <Text style={s.promoStripIcon}>🔥</Text>
            <Text style={s.promoStripText}>
              {promotions.length} promo{promotions.length > 1 ? 's' : ''} active — bonus cashback applied automatically
            </Text>
          </View>
        )}
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { refetchOffers(); refetchBanners(); }}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >
        {/* ── Quick Actions ── */}
        <Text style={s.sectionLabel}>Quick Actions</Text>
        <View style={s.actionsRow}>
          <TouchableOpacity
            style={[s.actionCard, { backgroundColor: '#1D3557' }]}
            onPress={() => router.push('/(employee)/scan')}
            activeOpacity={0.82}
          >
            <View style={s.actionIconBg}>
              <Text style={s.actionEmoji}>📱</Text>
            </View>
            <Text style={s.actionTitle}>Grant Points</Text>
            <Text style={s.actionSub}>Scan QR · Enter amount · Upload receipt</Text>
            <View style={s.actionArrow}><Text style={s.actionArrowText}>→</Text></View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.actionCard, { backgroundColor: '#b45309' }]}
            onPress={() => router.push('/(employee)/scan')}
            activeOpacity={0.82}
          >
            <View style={[s.actionIconBg, { backgroundColor: 'rgba(255,255,255,0.15)' }]}>
              <Text style={s.actionEmoji}>🎁</Text>
            </View>
            <Text style={s.actionTitle}>Redeem Credits</Text>
            <Text style={s.actionSub}>Apply balance toward purchase</Text>
            <View style={s.actionArrow}><Text style={s.actionArrowText}>→</Text></View>
          </TouchableOpacity>
        </View>

        {/* ── Active Promotions ── */}
        <Text style={[s.sectionLabel, { marginTop: 28 }]}>📢 Active Promotions</Text>

        {offersLoading ? (
          <View style={s.loadingCard}><ActivityIndicator color={COLORS.primary} /></View>
        ) : promotions.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitle}>No active promotions</Text>
            <Text style={s.emptySub}>Standard 5% cashback applies to all purchases</Text>
          </View>
        ) : (
          promotions.map((p: any) => (
            <View key={p.id} style={s.promoCard}>
              <View style={s.promoInfo}>
                <Text style={s.promoTitle}>{p.title}</Text>
                {p.description ? <Text style={s.promoDesc} numberOfLines={2}>{p.description}</Text> : null}
                {p.category ? (
                  <View style={s.promoTag}>
                    <Text style={s.promoTagText}>{p.category.replace(/_/g, ' ')}</Text>
                  </View>
                ) : null}
              </View>
              <View style={s.promoBadge}>
                <Text style={s.promoBadgeRate}>{Math.round(p.bonusRate * 100)}</Text>
                <Text style={s.promoBadgePct}>%</Text>
              </View>
            </View>
          ))
        )}

        {/* ── Today's Deals ── */}
        {deals.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 28 }]}>🏷️ Today's Deals</Text>
            {deals.map((d: any) => (
              <View key={d.id} style={s.dealCard}>
                <View style={s.dealBadge}>
                  <Text style={s.dealBadgeText}>{d.dealText}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dealTitle}>{d.title}</Text>
                  {d.description && d.description !== d.dealText
                    ? <Text style={s.dealSub} numberOfLines={1}>{d.description}</Text>
                    : null}
                  {d.category ? <Text style={s.dealCat}>{d.category.replace(/_/g, ' ')}</Text> : null}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Store Banners ── */}
        {banners.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 28 }]}>🎟️ Store Banners</Text>
            <ScrollView
              horizontal showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingRight: 4 }}
            >
              {banners.map((b: any) => (
                <View key={b.id} style={s.bannerCard}>
                  {b.imageUrl ? (
                    <Image source={{ uri: b.imageUrl }} style={s.bannerImg} resizeMode="cover" />
                  ) : (
                    <View style={[s.bannerImg, s.bannerPlaceholder]}>
                      <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>Banner</Text>
                    </View>
                  )}
                  {b.title ? <Text style={s.bannerLabel} numberOfLines={1}>{b.title}</Text> : null}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Info Footer ── */}
        <View style={s.infoFooter}>
          {[
            { icon: '💰', text: 'Standard cashback: 5¢ per $1 spent' },
            { icon: '📸', text: 'Always upload a receipt to complete the transaction' },
            ...(promotions.length > 0 ? [{ icon: '🔥', text: 'Active promotions apply automatically' }] : []),
          ].map((row, i) => (
            <View key={i} style={s.infoRow}>
              <Text style={s.infoIcon}>{row.icon}</Text>
              <Text style={s.infoText}>{row.text}</Text>
            </View>
          ))}
        </View>

        <View style={{ height: 20 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },

  // Header
  headerBg: { backgroundColor: '#1D3557' },
  headerRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  storeLine: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10,
    fontWeight: '800', letterSpacing: 1.5, marginBottom: 4,
  },
  greeting: { color: 'rgba(255,255,255,0.75)', fontSize: 16, fontWeight: '600' },
  greetingName: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5, marginTop: -2 },
  avatarRing: {
    width: 52, height: 52, borderRadius: 26,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center', justifyContent: 'center', marginTop: 4,
  },
  avatarCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#F4A261',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '900' },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginHorizontal: 20, marginBottom: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  statusText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  promoStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: '#F4A261',
    paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12,
  },
  promoStripIcon: { fontSize: 16 },
  promoStripText: { color: '#fff', fontSize: 12.5, fontWeight: '700', flex: 1 },

  // Body
  body: { padding: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },

  // Action cards — full width tiles
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1, borderRadius: 20, padding: 18,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 12, elevation: 5,
  },
  actionIconBg: {
    width: 44, height: 44, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 14,
  },
  actionEmoji: { fontSize: 22 },
  actionTitle: { color: '#fff', fontSize: 15, fontWeight: '800', marginBottom: 4 },
  actionSub: { color: 'rgba(255,255,255,0.65)', fontSize: 11.5, lineHeight: 16 },
  actionArrow: {
    marginTop: 16, width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-end',
  },
  actionArrowText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Cards
  loadingCard: { backgroundColor: '#fff', borderRadius: 16, padding: 32, alignItems: 'center' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 16, padding: 28, alignItems: 'center', gap: 6 },
  emptyEmoji: { fontSize: 38, marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 19 },

  promoCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10, borderWidth: 1, borderColor: '#f0f1f2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  promoInfo: { flex: 1, paddingRight: 14 },
  promoTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  promoDesc: { color: '#6b7280', fontSize: 13, marginTop: 4, lineHeight: 18 },
  promoTag: {
    backgroundColor: '#f0fdf4', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 7, alignSelf: 'flex-start',
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  promoTagText: { color: '#16a34a', fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  promoBadge: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#1D3557',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  promoBadgeRate: { color: '#fff', fontSize: 22, fontWeight: '800', lineHeight: 24 },
  promoBadgePct: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700' },

  dealCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10, borderWidth: 1, borderColor: '#f0f1f2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  dealBadge: {
    backgroundColor: '#b45309', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 8, minWidth: 76, alignItems: 'center',
  },
  dealBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
  dealTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  dealSub: { color: '#6b7280', fontSize: 12, marginTop: 2 },
  dealCat: { color: '#b45309', fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },

  bannerCard: { width: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' },
  bannerImg: { width: 200, height: 116 },
  bannerPlaceholder: { backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' },
  bannerLabel: { padding: 10, fontWeight: '600', fontSize: 13, color: '#111827' },

  infoFooter: {
    backgroundColor: '#f0f9ff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#bae6fd', marginTop: 24, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { fontSize: 15, marginTop: 1 },
  infoText: { flex: 1, fontSize: 13, color: '#0369a1', lineHeight: 20 },
});
