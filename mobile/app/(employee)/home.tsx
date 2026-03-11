import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, ActivityIndicator, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { offersApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function EmployeeHomeScreen() {
  const { user } = useAuthStore();

  const { data: offersData, isLoading: offersLoading } = useQuery({
    queryKey: ['offers'],
    queryFn: () => offersApi.getActive(),
  });

  const { data: bannersData } = useQuery({
    queryKey: ['banners'],
    queryFn: () => offersApi.getBanners(),
  });

  const offers: any[] = offersData?.data?.data || [];
  const banners: any[] = bannersData?.data?.data || [];

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.greeting}>{getGreeting()}, {user?.name?.split(' ')[0] || 'there'}!</Text>
          <Text style={s.subGreeting}>Lucky Stop Staff</Text>
        </View>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{(user?.name || user?.phone || '?')[0].toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Quick Actions */}
        <Text style={s.sectionTitle}>Quick Actions</Text>
        <View style={s.actionsRow}>
          <TouchableOpacity style={[s.actionCard, { backgroundColor: COLORS.primary }]} onPress={() => router.push('/(employee)/scan')}>
            <Text style={s.actionIcon}>📷</Text>
            <Text style={s.actionTitle}>Grant Points</Text>
            <Text style={s.actionSub}>Scan customer QR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actionCard, { backgroundColor: COLORS.secondary }]} onPress={() => router.push('/(employee)/scan')}>
            <Text style={s.actionIcon}>🎁</Text>
            <Text style={s.actionTitle}>Redeem Credits</Text>
            <Text style={s.actionSub}>Apply customer balance</Text>
          </TouchableOpacity>
        </View>

        {/* Active Offers */}
        <Text style={s.sectionTitle}>📢 Active Promotions</Text>
        {offersLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 20 }} />
        ) : offers.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyText}>No active promotions right now</Text>
          </View>
        ) : (
          offers.map((offer: any) => (
            <View key={offer.id} style={s.offerCard}>
              <View style={s.offerLeft}>
                <Text style={s.offerTitle}>{offer.title}</Text>
                {offer.description ? <Text style={s.offerDesc}>{offer.description}</Text> : null}
                {offer.category ? <Text style={s.offerTag}>{offer.category.replace('_', ' ')}</Text> : null}
              </View>
              {offer.bonusMultiplier && offer.bonusMultiplier > 1 ? (
                <View style={s.bonusBadge}>
                  <Text style={s.bonusText}>{offer.bonusMultiplier}x</Text>
                </View>
              ) : null}
            </View>
          ))
        )}

        {/* Banners */}
        {banners.length > 0 && (
          <>
            <Text style={s.sectionTitle}>🎟️ Store Banners</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.bannerScroll}>
              {banners.map((banner: any) => (
                <View key={banner.id} style={s.bannerCard}>
                  {banner.imageUrl ? (
                    <Image source={{ uri: banner.imageUrl }} style={s.bannerImage} resizeMode="cover" />
                  ) : (
                    <View style={[s.bannerImage, s.bannerPlaceholder]}>
                      <Text style={{ color: COLORS.textMuted }}>Banner</Text>
                    </View>
                  )}
                  {banner.title ? <Text style={s.bannerTitle}>{banner.title}</Text> : null}
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Info footer */}
        <View style={s.infoCard}>
          <Text style={s.infoIcon}>💡</Text>
          <Text style={s.infoText}>Customers earn <Text style={s.infoBold}>5¢ per $1</Text> spent. Always scan their QR and upload the receipt.</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  greeting: { fontSize: 22, fontWeight: '800', color: '#fff' },
  subGreeting: { fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: { padding: 16, gap: 12, paddingBottom: 32 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginTop: 8 },

  actionsRow: { flexDirection: 'row', gap: 12 },
  actionCard: {
    flex: 1, borderRadius: 16, padding: 18,
    alignItems: 'center', gap: 6,
  },
  actionIcon: { fontSize: 30 },
  actionTitle: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center' },
  actionSub: { color: 'rgba(255,255,255,0.75)', fontSize: 11, textAlign: 'center' },

  offerCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  offerLeft: { flex: 1 },
  offerTitle: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  offerDesc: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  offerTag: { color: COLORS.accent, fontSize: 12, fontWeight: '600', marginTop: 4, textTransform: 'capitalize' },
  bonusBadge: {
    backgroundColor: COLORS.accent, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, marginLeft: 12,
  },
  bonusText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  bannerScroll: { gap: 12, paddingRight: 4 },
  bannerCard: { width: 200, borderRadius: 14, overflow: 'hidden', backgroundColor: COLORS.white },
  bannerImage: { width: 200, height: 110 },
  bannerPlaceholder: { backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  bannerTitle: { padding: 10, fontWeight: '600', fontSize: 13, color: COLORS.text },

  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 24,
    alignItems: 'center',
  },
  emptyText: { color: COLORS.textMuted, fontSize: 14 },

  infoCard: {
    backgroundColor: COLORS.secondary + '15', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 8,
  },
  infoIcon: { fontSize: 20 },
  infoText: { flex: 1, color: COLORS.text, fontSize: 13, lineHeight: 20 },
  infoBold: { fontWeight: '700', color: COLORS.secondary },
});
