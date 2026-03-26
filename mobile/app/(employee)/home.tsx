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

  function onRefresh() {
    refetchOffers();
    refetchBanners();
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.storeLine}>⛽ Lucky Stop Staff</Text>
            <Text style={s.greeting}>{getGreeting()}, {firstName}!</Text>
          </View>
          <View style={s.avatarCircle}>
            <Text style={s.avatarText}>{initial}</Text>
          </View>
        </View>
        <View style={s.statusRow}>
          <View style={s.statusDot} />
          <Text style={s.statusText}>
            On Duty · {user?.role?.replace(/_/g, ' ')}
          </Text>
        </View>
      </SafeAreaView>

      {/* ── Active promotions strip ── */}
      {promotions.length > 0 && (
        <View style={s.promoStrip}>
          <Text style={s.promoStripText}>
            🔥 {promotions.length} promo{promotions.length > 1 ? 's' : ''} active today — bonus cashback applied automatically
          </Text>
        </View>
      )}

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
        {/* ── Quick Actions ── */}
        <Text style={s.sectionLabel}>Quick Actions</Text>

        <TouchableOpacity
          style={s.actionCard}
          onPress={() => router.push('/(employee)/scan')}
          activeOpacity={0.86}
        >
          <View style={[s.actionIconBg, { backgroundColor: COLORS.primary + '18' }]}>
            <Text style={s.actionEmoji}>📱</Text>
          </View>
          <View style={s.actionBody}>
            <Text style={s.actionTitle}>Grant Points</Text>
            <Text style={s.actionSub}>Scan QR · Enter purchase · Upload receipt</Text>
          </View>
          <View style={[s.actionBadge, { backgroundColor: COLORS.primary }]}>
            <Text style={s.actionBadgeText}>›</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.actionCard, s.actionCardAlt]}
          onPress={() => router.push('/(employee)/scan')}
          activeOpacity={0.86}
        >
          <View style={[s.actionIconBg, { backgroundColor: COLORS.accent + '20' }]}>
            <Text style={s.actionEmoji}>🎁</Text>
          </View>
          <View style={s.actionBody}>
            <Text style={[s.actionTitle, { color: COLORS.accent }]}>Redeem Credits</Text>
            <Text style={s.actionSub}>Apply customer balance toward purchase</Text>
          </View>
          <View style={[s.actionBadge, { backgroundColor: COLORS.accent }]}>
            <Text style={s.actionBadgeText}>›</Text>
          </View>
        </TouchableOpacity>

        {/* ── Active Promotions ── */}
        <Text style={[s.sectionLabel, { marginTop: 24 }]}>📢 Active Promotions</Text>

        {offersLoading ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
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
                {p.description ? (
                  <Text style={s.promoDesc} numberOfLines={2}>{p.description}</Text>
                ) : null}
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
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>🏷️ Today's Deals</Text>
            {deals.map((d: any) => (
              <View key={d.id} style={s.dealCard}>
                <View style={s.dealBadge}>
                  <Text style={s.dealBadgeText}>{d.dealText}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dealTitle}>{d.title}</Text>
                  {d.description && d.description !== d.dealText ? (
                    <Text style={s.dealSub} numberOfLines={1}>{d.description}</Text>
                  ) : null}
                  {d.category ? (
                    <Text style={s.dealCat}>{d.category.replace(/_/g, ' ')}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        )}

        {/* ── Store Banners ── */}
        {banners.length > 0 && (
          <>
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>🎟️ Store Banners</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
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
                  {b.title ? (
                    <Text style={s.bannerLabel} numberOfLines={1}>{b.title}</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Info Footer ── */}
        <View style={s.infoFooter}>
          <InfoRow icon="💰" text={<>Standard cashback: <Text style={s.infoBold}>5¢ per $1</Text> spent</>} />
          <InfoRow icon="📸" text="Always upload a receipt to complete the transaction" />
          {promotions.length > 0 && (
            <InfoRow icon="🔥" text={<>Active promotions <Text style={s.infoBold}>apply automatically</Text></>} />
          )}
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

function InfoRow({ icon, text }: { icon: string; text: any }) {
  return (
    <View style={s.infoRow}>
      <Text style={s.infoIcon}>{icon}</Text>
      <Text style={s.infoText}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // Header
  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4,
  },
  storeLine: {
    color: 'rgba(255,255,255,0.55)', fontSize: 11,
    fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  greeting: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 3 },
  avatarCircle: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.25)',
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  statusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.success },
  statusText: {
    color: 'rgba(255,255,255,0.6)', fontSize: 12,
    fontWeight: '600', textTransform: 'capitalize',
  },

  // Promo strip
  promoStrip: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16, paddingVertical: 11,
  },
  promoStripText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Body
  body: { padding: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10,
  },

  // Action cards
  actionCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  actionCardAlt: { borderLeftColor: COLORS.accent },
  actionIconBg: {
    width: 50, height: 50, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionEmoji: { fontSize: 24 },
  actionBody: { flex: 1 },
  actionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  actionSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  actionBadge: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionBadgeText: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },

  // Promotions
  loadingCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 32,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 28,
    alignItems: 'center', gap: 6,
  },
  emptyEmoji: { fontSize: 38, marginBottom: 4 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },

  promoCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  promoInfo: { flex: 1, paddingRight: 14 },
  promoTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  promoDesc: { color: COLORS.textMuted, fontSize: 13, marginTop: 4, lineHeight: 18 },
  promoTag: {
    backgroundColor: COLORS.success + '20', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3, marginTop: 7, alignSelf: 'flex-start',
  },
  promoTagText: { color: COLORS.success, fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  promoBadge: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  promoBadgeRate: { color: '#fff', fontSize: 24, fontWeight: '800', lineHeight: 26 },
  promoBadgePct: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', marginTop: -2 },

  // Deals
  dealCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  dealBadge: {
    backgroundColor: COLORS.accent, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10, minWidth: 82, alignItems: 'center',
  },
  dealBadgeText: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  dealTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  dealSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  dealCat: { color: COLORS.accent, fontSize: 11, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },

  // Banners
  bannerCard: { width: 200, borderRadius: 16, overflow: 'hidden', backgroundColor: COLORS.white },
  bannerImg: { width: 200, height: 116 },
  bannerPlaceholder: {
    backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center',
  },
  bannerLabel: { padding: 10, fontWeight: '600', fontSize: 13, color: COLORS.text },

  // Info footer
  infoFooter: {
    backgroundColor: COLORS.secondary + '0d', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.secondary + '18', marginTop: 24, gap: 10,
  },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  infoIcon: { fontSize: 15, marginTop: 1 },
  infoText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 20 },
  infoBold: { fontWeight: '700', color: COLORS.secondary },
});
