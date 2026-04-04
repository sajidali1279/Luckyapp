import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, StatusBar, RefreshControl, ActivityIndicator, FlatList, Dimensions, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, useEffect } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { offersApi, authApi, notificationsApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';

const SCREEN_W = Dimensions.get('window').width;
const BANNER_W = SCREEN_W - 32; // 16px margin each side

function BannerCarousel({ banners }: { banners: any[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function startTimer(index: number) {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % banners.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3500);
  }

  useEffect(() => {
    if (banners.length <= 1) return;
    startTimer(0);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length]);

  if (banners.length === 0) return null;

  return (
    <View style={bc.root}>
      <FlatList
        ref={flatRef}
        data={banners}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={BANNER_W + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (BANNER_W + 12));
          setActiveIndex(idx);
          startTimer(idx);
        }}
        getItemLayout={(_, index) => ({ length: BANNER_W + 12, offset: (BANNER_W + 12) * index, index })}
        renderItem={({ item }) => (
          <View style={bc.slide}>
            <Image source={{ uri: item.imageUrl }} style={bc.image} />
            {item.title ? (
              <View style={bc.titleBar}>
                <Text style={bc.titleText} numberOfLines={1}>{item.title}</Text>
              </View>
            ) : null}
          </View>
        )}
      />
      {banners.length > 1 && (
        <View style={bc.dots}>
          {banners.map((_, i) => (
            <View key={i} style={[bc.dot, i === activeIndex && bc.dotActive]} />
          ))}
        </View>
      )}
    </View>
  );
}

export default function CustomerHome() {
  const { user, token, setAuth } = useAuthStore();

  // Refresh balance every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      authApi.getMe().then(({ data }) => {
        if (data?.data && user && token) {
          setAuth({
            ...user,
            pointsBalance: data.data.pointsBalance,
            tier: data.data.tier,
            periodPoints: data.data.periodPoints,
            tierPeriod: data.data.tierPeriod,
          }, token);
        }
      }).catch(() => {});
    }, [])
  );

  const {
    data: bannersData, isRefetching: bannersRefetching, refetch: refetchBanners,
  } = useQuery({
    queryKey: ['banners'],
    queryFn: () => offersApi.getBanners(),
  });

  const {
    data: offersData, isLoading: offersLoading, isRefetching: offersRefetching, refetch: refetchOffers,
  } = useQuery({
    queryKey: ['offers'],
    queryFn: () => offersApi.getActive(),
  });

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const { data: gasPricesData } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 5 * 60 * 1000, // 5 min
  });
  const gasPrices: any[] = (gasPricesData?.data?.data ?? []).filter(
    (s: any) => s.gasPricePerGallon != null || s.dieselPricePerGallon != null
  );

  const banners = bannersData?.data?.data || [];
  const allOffers: any[] = offersData?.data?.data || [];
  const promotions = allOffers.filter((o: any) => o.bonusRate);
  const deals = allOffers.filter((o: any) => o.dealText);
  const isRefreshing = bannersRefetching || offersRefetching;
  const [selectedOffer, setSelectedOffer] = useState<any>(null);

  function onRefresh() {
    refetchBanners();
    refetchOffers();
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={COLORS.primary}
          colors={[COLORS.primary]}
        />
      }
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />
      {/* Header */}
      <SafeAreaView style={styles.headerBg}>
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hey {user?.name || 'there'}! 👋</Text>
            <Text style={styles.storeName}>Lucky Stop Rewards</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity
              onPress={() => router.push('/(customer)/notifications')}
              style={styles.bellBtn}
            >
              <Text style={styles.bellIcon}>🔔</Text>
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push('/(customer)/profile')} style={styles.profileBtn}>
              <Text style={styles.profileBtnText}>{(user?.name || user?.phone || '?')[0].toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* Points Balance Card */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your Points Balance</Text>
        <Text style={styles.balanceAmount}>{Math.round(Number(user?.pointsBalance || 0) * 100).toLocaleString()}</Text>
        <Text style={styles.balanceSubtext}>points balance</Text>

        <TouchableOpacity style={styles.redeemButton} onPress={() => router.push('/(customer)/rewards')}>
          <Text style={styles.redeemButtonText}>Redeem Rewards</Text>
        </TouchableOpacity>
      </View>

      {/* Scan Receipt — coming soon (printer QR integration pending) */}

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

      {/* Offers loading indicator */}
      {offersLoading && (
        <View style={styles.offersLoading}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.offersLoadingText}>Loading promotions…</Text>
        </View>
      )}

      {/* Banners — auto-advancing carousel */}
      {banners.length > 0 && (
        <View style={styles.bannerWrapper}>
          <BannerCarousel banners={banners} />
        </View>
      )}

      {/* Gas Prices */}
      {gasPrices.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⛽ Today's Gas Prices</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gasPriceRow}>
            {gasPrices.map((store: any) => (
              <View key={store.id} style={styles.gasPriceCard}>
                <Text style={styles.gasStoreName} numberOfLines={1}>{store.name}</Text>
                {store.gasPricePerGallon != null && (
                  <View style={styles.gasPriceLine}>
                    <Text style={styles.gasPriceIcon}>⛽</Text>
                    <Text style={styles.gasPriceLabel}>Gas</Text>
                    <Text style={styles.gasPriceValue}>${Number(store.gasPricePerGallon).toFixed(3)}</Text>
                    <Text style={styles.gasPriceUnit}>/gal</Text>
                  </View>
                )}
                {store.dieselPricePerGallon != null && (
                  <View style={styles.gasPriceLine}>
                    <Text style={styles.gasPriceIcon}>🚛</Text>
                    <Text style={styles.gasPriceLabel}>Diesel</Text>
                    <Text style={styles.gasPriceValue}>${Number(store.dieselPricePerGallon).toFixed(3)}</Text>
                    <Text style={styles.gasPriceUnit}>/gal</Text>
                  </View>
                )}
                {store.gasPriceUpdatedAt && (
                  <Text style={styles.gasUpdatedAt}>
                    Updated {new Date(store.gasPriceUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                )}
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Cashback Promotions */}
      {/* Active Promotions — show 2, slider if more */}
      {promotions.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>🔥 Active Promotions</Text>
            {promotions.length > 2 && (
              <Text style={styles.sectionCount}>{promotions.length} offers</Text>
            )}
          </View>
          {promotions.length <= 2 ? (
            promotions.map((offer: any) => (
              <TouchableOpacity key={offer.id} style={styles.offerCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                {offer.imageUrl && <Image source={{ uri: offer.imageUrl }} style={styles.offerImage} />}
                <View style={styles.offerContent}>
                  <Text style={styles.offerTitle}>{offer.title}</Text>
                  <Text style={styles.offerDesc}>{offer.description}</Text>
                  <Text style={styles.offerBonus}>🔥 {Math.round(offer.bonusRate * 100)}% cashback — auto-applied!</Text>
                </View>
                <Text style={styles.offerArrow}>›</Text>
              </TouchableOpacity>
            ))
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sliderRow}>
              {promotions.map((offer: any) => (
                <TouchableOpacity key={offer.id} style={styles.offerSlideCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                  {offer.imageUrl
                    ? <Image source={{ uri: offer.imageUrl }} style={styles.offerSlideImage} />
                    : <View style={styles.offerSlideImagePlaceholder}><Text style={{ fontSize: 32 }}>🔥</Text></View>
                  }
                  <View style={styles.offerSlideContent}>
                    <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                    <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
                    <Text style={styles.offerBonus}>🔥 {Math.round(offer.bonusRate * 100)}% cashback</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* Price Deals — show 2, slider if more */}
      {deals.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <Text style={styles.sectionTitle}>🏷️ Today's Deals</Text>
            {deals.length > 2 && (
              <Text style={styles.sectionCount}>{deals.length} deals</Text>
            )}
          </View>
          {deals.length <= 2 ? (
            deals.map((offer: any) => (
              <TouchableOpacity key={offer.id} style={styles.dealCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                {offer.imageUrl && <Image source={{ uri: offer.imageUrl }} style={styles.offerImage} />}
                <View style={styles.offerContent}>
                  <Text style={styles.dealText}>{offer.dealText}</Text>
                  <Text style={styles.offerTitle}>{offer.title}</Text>
                  {offer.description ? <Text style={styles.offerDesc}>{offer.description}</Text> : null}
                </View>
                <Text style={styles.offerArrow}>›</Text>
              </TouchableOpacity>
            ))
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sliderRow}>
              {deals.map((offer: any) => (
                <TouchableOpacity key={offer.id} style={[styles.offerSlideCard, styles.dealSlideCard]} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                  {offer.imageUrl
                    ? <Image source={{ uri: offer.imageUrl }} style={styles.offerSlideImage} />
                    : <View style={styles.offerSlideImagePlaceholder}><Text style={{ fontSize: 32 }}>🏷️</Text></View>
                  }
                  <View style={styles.offerSlideContent}>
                    <Text style={styles.dealText}>{offer.dealText}</Text>
                    <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                    {offer.description ? <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      {/* History link */}
      <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/(customer)/history')}>
        <Text style={styles.historyLinkText}>View Points History →</Text>
      </TouchableOpacity>

      {/* Offer detail modal */}
      {selectedOffer && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedOffer(null)}>
          <View style={om.overlay}>
            <View style={om.sheet}>
              {selectedOffer.imageUrl && (
                <Image source={{ uri: selectedOffer.imageUrl }} style={om.image} />
              )}
              <View style={om.body}>
                {selectedOffer.bonusRate ? (
                  <View style={om.badgeRow}>
                    <View style={om.badge}>
                      <Text style={om.badgeText}>🔥 {Math.round(selectedOffer.bonusRate * 100)}% cashback — auto-applied</Text>
                    </View>
                  </View>
                ) : selectedOffer.dealText ? (
                  <Text style={om.dealText}>{selectedOffer.dealText}</Text>
                ) : null}
                <Text style={om.title}>{selectedOffer.title}</Text>
                {selectedOffer.description ? <Text style={om.desc}>{selectedOffer.description}</Text> : null}
                <View style={om.dateRow}>
                  <Text style={om.dateText}>
                    Valid {new Date(selectedOffer.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} –{' '}
                    {new Date(selectedOffer.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <View style={om.howBox}>
                  <Text style={om.howTitle}>How it works</Text>
                  <Text style={om.howText}>
                    {selectedOffer.bonusRate
                      ? 'Cashback is automatically applied when the cashier scans your QR code. No action needed!'
                      : 'Show your QR code to the cashier and mention this deal to claim it.'}
                  </Text>
                </View>
                <TouchableOpacity style={om.closeBtn} onPress={() => setSelectedOffer(null)}>
                  <Text style={om.closeBtnText}>Got it</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  headerBg: { backgroundColor: COLORS.primary },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, backgroundColor: COLORS.primary,
  },
  greeting: { fontSize: 12, color: 'rgba(255,255,255,0.65)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  storeName: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
    position: 'relative',
  },
  bellIcon: { fontSize: 18 },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: COLORS.primary,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  bellBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800', lineHeight: 13 },
  profileBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  profileBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  balanceCard: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 12,
    backgroundColor: COLORS.secondary, borderRadius: 22, padding: 24, alignItems: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3, shadowRadius: 16, elevation: 8,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  balanceAmount: { fontSize: 52, fontWeight: '900', color: '#fff', marginVertical: 6, letterSpacing: -1 },
  balanceSubtext: { color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: '600' },
  redeemButton: {
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 12, marginTop: 18,
  },
  redeemButtonText: { fontWeight: '800', color: '#fff', fontSize: 14 },

  qrSection: {
    alignItems: 'center', paddingVertical: 20, paddingHorizontal: 16,
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 12, borderRadius: 22,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  qrContainer: {
    padding: 16, backgroundColor: '#fff', borderRadius: 16, marginTop: 12,
    borderWidth: 1, borderColor: COLORS.border,
  },
  qrSubtext: { color: COLORS.textMuted, fontSize: 13, marginTop: 6, fontWeight: '500' },

  bannerWrapper: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  section: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  sectionCount: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  sliderRow: { gap: 10, paddingBottom: 4 },
  offerSlideCard: {
    width: 220, backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  dealSlideCard: { borderLeftWidth: 4, borderLeftColor: COLORS.accent },
  offerSlideImage: { width: 220, height: 100, resizeMode: 'cover' },
  offerSlideImagePlaceholder: {
    width: 220, height: 100, backgroundColor: COLORS.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  offerSlideContent: { padding: 12, gap: 4 },

  bannerCard: { marginRight: 12, borderRadius: 14, overflow: 'hidden', width: 240 },
  bannerImage: { width: 240, height: 130, resizeMode: 'cover' },
  bannerTitle: { padding: 10, fontWeight: '700', fontSize: 13, color: COLORS.text, backgroundColor: COLORS.white },

  offerCard: {
    backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden', marginBottom: 10,
    flexDirection: 'row',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  offerImage: { width: 80, height: 80, resizeMode: 'cover' },
  offerContent: { flex: 1, padding: 12 },
  offerArrow: { fontSize: 22, color: COLORS.textMuted, alignSelf: 'center', paddingRight: 12 },
  offerTitle: { fontWeight: '700', fontSize: 14, color: COLORS.text },
  offerDesc: { color: COLORS.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  offerBonus: {
    color: '#fff', backgroundColor: COLORS.primary, fontWeight: '700', fontSize: 11,
    marginTop: 7, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, alignSelf: 'flex-start',
  },
  dealCard: {
    backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden', marginBottom: 10,
    flexDirection: 'row', borderLeftWidth: 4, borderLeftColor: COLORS.accent,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  dealText: { fontSize: 22, fontWeight: '900', color: COLORS.accent, marginBottom: 4, letterSpacing: -0.5 },

  gasPriceRow: { gap: 10, paddingBottom: 4, paddingTop: 8 },
  gasPriceCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14, minWidth: 150,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
    borderTopWidth: 3, borderTopColor: '#f97316',
  },
  gasStoreName: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  gasPriceLine: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  gasPriceIcon: { fontSize: 14 },
  gasPriceLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', flex: 1 },
  gasPriceValue: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  gasPriceUnit: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  gasUpdatedAt: { fontSize: 10, color: COLORS.border, marginTop: 6, fontWeight: '600' },

  historyLink: { paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center' },
  historyLinkText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },

  offersLoading: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 16,
  },
  offersLoadingText: { color: COLORS.textMuted, fontSize: 13 },

  // old bannerCard/bannerImage/bannerTitle removed — replaced by BannerCarousel
  scanReceiptCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    borderLeftWidth: 4, borderLeftColor: COLORS.accent,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  scanReceiptLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  scanReceiptIcon: { fontSize: 28 },
  scanReceiptTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  scanReceiptSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  scanReceiptArrow: { fontSize: 24, color: COLORS.accent, fontWeight: '600' },
});

const bc = StyleSheet.create({
  root: { gap: 10 },
  slide: {
    width: BANNER_W, marginRight: 12, borderRadius: 16, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 4,
  },
  image: { width: BANNER_W, height: 110, resizeMode: 'cover' },
  titleBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 14, paddingVertical: 10,
  },
  titleText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.border },
  dotActive: { width: 20, backgroundColor: COLORS.primary },
});

const om = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 180, resizeMode: 'cover' },
  body: { padding: 24, gap: 10 },
  badgeRow: { flexDirection: 'row' },
  badge: {
    backgroundColor: COLORS.primary + '15', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  badgeText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  dealText: { fontSize: 28, fontWeight: '900', color: COLORS.accent, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  desc: { fontSize: 14, color: COLORS.textMuted, lineHeight: 21 },
  dateRow: { backgroundColor: COLORS.background, borderRadius: 10, padding: 10 },
  dateText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },
  howBox: {
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.secondary + '18',
  },
  howTitle: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  howText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  closeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
