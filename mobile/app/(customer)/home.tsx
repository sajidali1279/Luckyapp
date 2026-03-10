import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { offersApi } from '../../services/api';
import { COLORS } from '../../constants';

export default function CustomerHome() {
  const { user } = useAuthStore();

  const { data: bannersData } = useQuery({
    queryKey: ['banners'],
    queryFn: () => offersApi.getBanners(),
  });

  const { data: offersData } = useQuery({
    queryKey: ['offers'],
    queryFn: () => offersApi.getActive(),
  });

  const banners = bannersData?.data?.data || [];
  const offers = offersData?.data?.data || [];

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hey {user?.name || 'there'}! 👋</Text>
          <Text style={styles.storeName}>Lucky Stop Rewards</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/(customer)/profile')} style={styles.profileBtn}>
          <Text style={styles.profileBtnText}>{(user?.name || user?.phone || '?')[0].toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      {/* Points Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your Balance</Text>
        <Text style={styles.balanceAmount}>${Number(user?.pointsBalance || 0).toFixed(2)}</Text>
        <Text style={styles.balanceSubtext}>Earn 5¢ for every $1 spent</Text>

        <TouchableOpacity style={styles.redeemButton} onPress={() => router.push('/(customer)/rewards')}>
          <Text style={styles.redeemButtonText}>Redeem Rewards</Text>
        </TouchableOpacity>
      </View>

      {/* QR Code */}
      <View style={styles.qrSection}>
        <Text style={styles.sectionTitle}>Your QR Code</Text>
        <Text style={styles.qrSubtext}>Show this to the cashier to earn points</Text>
        {user?.qrCode && (
          <View style={styles.qrContainer}>
            <QRCode value={user.qrCode} size={180} color={COLORS.secondary} />
          </View>
        )}
      </View>

      {/* Banners */}
      {banners.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Promotions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {banners.map((banner: any) => (
              <View key={banner.id} style={styles.bannerCard}>
                <Image source={{ uri: banner.imageUrl }} style={styles.bannerImage} />
                <Text style={styles.bannerTitle}>{banner.title}</Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Active Offers */}
      {offers.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Offers</Text>
          {offers.map((offer: any) => (
            <View key={offer.id} style={styles.offerCard}>
              {offer.imageUrl && <Image source={{ uri: offer.imageUrl }} style={styles.offerImage} />}
              <View style={styles.offerContent}>
                <Text style={styles.offerTitle}>{offer.title}</Text>
                <Text style={styles.offerDesc}>{offer.description}</Text>
                {offer.bonusRate && (
                  <Text style={styles.offerBonus}>
                    🔥 {Math.round(offer.bonusRate * 100)}% cashback on this!
                  </Text>
                )}
              </View>
            </View>
          ))}
        </View>
      )}

      {/* History link */}
      <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/(customer)/history')}>
        <Text style={styles.historyLinkText}>View Points History →</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 60, backgroundColor: COLORS.primary,
  },
  greeting: { fontSize: 14, color: 'rgba(255,255,255,0.8)' },
  storeName: { fontSize: 22, fontWeight: '800', color: '#fff' },
  profileBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  profileBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  balanceCard: {
    margin: 16, backgroundColor: COLORS.secondary, borderRadius: 20, padding: 24, alignItems: 'center',
  },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  balanceAmount: { fontSize: 48, fontWeight: '800', color: '#fff', marginVertical: 8 },
  balanceSubtext: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  redeemButton: {
    backgroundColor: COLORS.accent, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, marginTop: 16,
  },
  redeemButtonText: { fontWeight: '700', color: '#fff' },

  qrSection: { alignItems: 'center', padding: 16, backgroundColor: COLORS.white, margin: 16, borderRadius: 20 },
  qrContainer: { padding: 16, backgroundColor: '#fff', borderRadius: 12, marginTop: 12 },
  qrSubtext: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },

  section: { padding: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text, marginBottom: 12 },

  bannerCard: { marginRight: 12, borderRadius: 12, overflow: 'hidden', width: 240 },
  bannerImage: { width: 240, height: 130, resizeMode: 'cover' },
  bannerTitle: { padding: 8, fontWeight: '600', color: COLORS.text, backgroundColor: COLORS.white },

  offerCard: {
    backgroundColor: COLORS.white, borderRadius: 12, overflow: 'hidden', marginBottom: 12,
    flexDirection: 'row',
  },
  offerImage: { width: 80, height: 80, resizeMode: 'cover' },
  offerContent: { flex: 1, padding: 12 },
  offerTitle: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  offerDesc: { color: COLORS.textMuted, fontSize: 13, marginTop: 4 },
  offerBonus: { color: COLORS.primary, fontWeight: '600', fontSize: 13, marginTop: 6 },

  historyLink: { padding: 20, alignItems: 'center' },
  historyLinkText: { color: COLORS.primary, fontWeight: '600' },
});
