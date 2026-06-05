import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  StatusBar, RefreshControl, FlatList, Dimensions, Modal, Animated, Linking, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState, useEffect, memo } from 'react';
import { router } from 'expo-router';
import * as Location from 'expo-location';
import { ratingsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { offersApi, authApi, notificationsApi, storesApi } from '../../services/api';
import WelcomeBonusCard from '../../components/WelcomeBonusCard';
import { COLORS } from '../../constants';
import {
  BellIcon, MapPinIcon, GlobeIcon, GasPumpIcon, TruckIcon,
  FlameIcon, TagIcon, ReceiptIcon, CameraIcon, ChevronRightIcon, StarIcon,
  PercentIcon,
} from '../../components/Icons';
import { SkeletonOfferCard, SkeletonBannerCard, SkeletonGasPriceCard } from '../../components/SkeletonLoader';
import Svg, { Path, Defs, LinearGradient as SvgGrad, Stop } from 'react-native-svg';

const MAX_NEARBY_MILES = 2;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const TIER_CONFIG: Record<string, { color: string; label: string; icon: string; nextLabel: string | null; thresholdPts: number; nextThresholdPts: number | null }> = {
  BRONZE:   { color: '#CD7F32', label: 'Bronze',   icon: '🥉', nextLabel: 'Silver',   thresholdPts: 0,      nextThresholdPts: 5000  },
  SILVER:   { color: '#A8A9AD', label: 'Silver',   icon: '🥈', nextLabel: 'Gold',     thresholdPts: 5000,   nextThresholdPts: 15000 },
  GOLD:     { color: '#FFD700', label: 'Gold',     icon: '🥇', nextLabel: 'Diamond',  thresholdPts: 15000,  nextThresholdPts: 30000 },
  DIAMOND:  { color: '#7dd8f8', label: 'Diamond',  icon: '💎', nextLabel: 'Platinum', thresholdPts: 30000,  nextThresholdPts: 60000 },
  PLATINUM: { color: '#E5E4E2', label: 'Platinum', icon: '👑', nextLabel: null,       thresholdPts: 60000,  nextThresholdPts: null  },
};

const SCREEN_W = Dimensions.get('window').width;
const BANNER_W = SCREEN_W - 32;

/* ─── Animated dot indicator ─────────────────────────────── */
const AnimatedDot = memo(function AnimatedDot({ active, color }: { active: boolean; color: string }) {
  const width = useRef(new Animated.Value(active ? 20 : 7)).current;
  const opacity = useRef(new Animated.Value(active ? 1 : 0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(width, { toValue: active ? 20 : 7, useNativeDriver: false, bounciness: 10 }),
      Animated.timing(opacity, { toValue: active ? 1 : 0.35, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [active]);

  return (
    <Animated.View style={{ width, height: 6, borderRadius: 3, backgroundColor: color, opacity, marginHorizontal: 2 }} />
  );
});

/* ─── Banner carousel ─────────────────────────────────────── */
const BannerCarousel = memo(function BannerCarousel({ banners }: { banners: any[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback((index: number) => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % banners.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 3800);
  }, [banners.length]);

  useEffect(() => {
    if (banners.length <= 1) return;
    startTimer(0);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [banners.length, startTimer]);

  const renderBannerItem = useCallback(({ item }: { item: any }) => (
    <View style={bc.slide}>
      <Image source={{ uri: item.imageUrl }} style={bc.image} />
      {item.title ? (
        <View style={bc.titleBar}>
          <Text style={bc.titleText} numberOfLines={1}>{item.title}</Text>
        </View>
      ) : null}
    </View>
  ), []);

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
        renderItem={renderBannerItem}
      />
      {banners.length > 1 && (
        <View style={bc.dots}>
          {banners.map((_, i) => (
            <AnimatedDot key={i} active={i === activeIndex} color={COLORS.primary} />
          ))}
        </View>
      )}
    </View>
  );
});

/* ─── Section title row ───────────────────────────────────── */
function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <View style={styles.sectionTitleRow}>
      {icon}
      <Text style={styles.sectionTitleText}>{label}</Text>
    </View>
  );
}

/* ─── Offer image placeholder ─────────────────────────────── */
function OfferPlaceholder({ isGas }: { isGas?: boolean }) {
  return (
    <View style={[styles.offerPlaceholder, { backgroundColor: isGas ? '#fff7ed' : COLORS.primary + '10' }]}>
      {isGas
        ? <GasPumpIcon size={28} color={COLORS.accent} strokeWidth={1.75} />
        : <FlameIcon size={28} color={COLORS.primary} strokeWidth={1.75} />
      }
    </View>
  );
}

/* ─── Main screen ─────────────────────────────────────────── */
export default function CustomerHome() {
  const { user, token, setAuth } = useAuthStore();

  // Staggered entrance — 7 sections fade + slide up on mount
  const fadeAnims = useRef([...Array(7)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(7)].map(() => new Animated.Value(18))).current;
  useEffect(() => {
    Animated.stagger(55, fadeAnims.map((anim, i) =>
      Animated.parallel([
        Animated.timing(anim, { toValue: 1, duration: 380, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 380, useNativeDriver: true }),
      ])
    )).start();
  }, []);

  // QR scan line animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scanLineAnim, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(scanLineAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Wave animations
  const waveEntrance = useRef(new Animated.Value(0)).current;
  const waveLateral  = useRef(new Animated.Value(0)).current;
  const scrollY      = useRef(new Animated.Value(0)).current;
  const [showQR, setShowQR] = useState(false);

  useEffect(() => {
    // Entrance only — slide up + fade in, then hold still
    Animated.parallel([
      Animated.timing(waveEntrance, { toValue: 1, duration: 800, delay: 200, useNativeDriver: true }),
      Animated.timing(waveLateral,  { toValue: 0.3, duration: 1200, delay: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, []);

  const waveTranslateX = waveLateral.interpolate({ inputRange: [0, 0.3], outputRange: [-SCREEN_W * 0.15, 0] });
  const waveOpacity    = waveEntrance.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const waveSlideUp    = waveEntrance.interpolate({ inputRange: [0, 1], outputRange: [30, 0] });

  // 4× wide wave path (seamless loop every SCREEN_W)
  const W = SCREEN_W, H = 44, A = 18;
  const WAVE_PATH = `M0,${A} C${W*.25},0 ${W*.75},0 ${W},${A} C${W*1.25},${A*2} ${W*1.75},${A*2} ${W*2},${A} C${W*2.25},0 ${W*2.75},0 ${W*3},${A} C${W*3.25},${A*2} ${W*3.75},${A*2} ${W*4},${A} L${W*4},${H} L0,${H} Z`;

  useFocusEffect(
    useCallback(() => {
      authApi.getMe().then(({ data }) => {
        // Use getState() for a fresh reference — avoids stale closure overwriting
        // fields (like avatarUrl) that were updated after this callback was created.
        const { user: u, token: t, setAuth: sa } = useAuthStore.getState();
        if (data?.data && u && t) {
          sa({
            ...u,
            pointsBalance: data.data.pointsBalance,
            tier: data.data.tier,
            periodPoints: data.data.periodPoints,
            tierPeriod: data.data.tierPeriod,
            avatarUrl: data.data.avatarUrl ?? u.avatarUrl,
          }, t);
        }
      }).catch(() => {});
    }, [])
  );

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const { data: gasPricesData } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 30 * 60 * 1000,
  });
  const allStores: any[] = gasPricesData?.data?.data ?? [];

  const [nearestStore, setNearestStore] = useState<{ id: string; name: string } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'found' | 'none'>('detecting');
  const [pendingAgeGateStore, setPendingAgeGateStore] = useState<{ id: string; name: string } | null>(null);
  const [show21Gate, setShow21Gate] = useState(false);
  const [confirming21, setConfirming21] = useState(false);
  const { setAge21Confirmed } = useAuthStore();

  const storesWithPrices = allStores.filter(
    (s: any) => s.gasPricePerGallon != null || s.dieselPricePerGallon != null
  );
  // When near a store — show only that store's prices. Otherwise show all.
  const gasPrices: any[] = nearestStore
    ? storesWithPrices.filter((s: any) => s.id === nearestStore.id)
    : storesWithPrices;

  useEffect(() => {
    let cancelled = false;
    async function detect() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) { if (!cancelled) setLocationStatus('none'); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: uLat, longitude: uLon } = pos.coords;
        const storesWithCoords = allStores.filter((s: any) => s.latitude != null && s.longitude != null);
        if (storesWithCoords.length === 0 || cancelled) { if (!cancelled) setLocationStatus('none'); return; }
        let closest: any = null;
        let closestDist = Infinity;
        for (const s of storesWithCoords) {
          const d = haversineMiles(uLat, uLon, s.latitude, s.longitude);
          if (d < closestDist) { closestDist = d; closest = s; }
        }
        if (!cancelled && closest && closestDist <= MAX_NEARBY_MILES) {
          if (closest.minimumAge === 21 && !user?.age21Confirmed) {
            setPendingAgeGateStore({ id: closest.id, name: closest.name });
            setShow21Gate(true);
            setLocationStatus('found');
          } else {
            setNearestStore({ id: closest.id, name: closest.name });
            setLocationStatus('found');
          }
        } else if (!cancelled) {
          setLocationStatus('none');
        }
      } catch {
        if (!cancelled) setLocationStatus('none');
      }
    }
    if (allStores.length > 0) detect();
    return () => { cancelled = true; };
  }, [allStores.length]);

  const locationReady = locationStatus !== 'detecting';

  const {
    data: bannersData, isRefetching: bannersRefetching, refetch: refetchBanners,
  } = useQuery({
    queryKey: ['banners', nearestStore?.id],
    queryFn: () => offersApi.getBanners(nearestStore?.id),
    enabled: locationReady,
  });

  const {
    data: offersData, isLoading: offersLoading, isRefetching: offersRefetching, refetch: refetchOffers,
  } = useQuery({
    queryKey: ['offers', nearestStore?.id],
    queryFn: () => offersApi.getActive(nearestStore?.id),
    enabled: locationReady,
  });

  const banners = bannersData?.data?.data || [];
  const allOffers: any[] = offersData?.data?.data || [];
  const promotions = allOffers.filter((o: any) => o.bonusRate || o.gasBonusCentsPerGallon != null);
  const deals = allOffers.filter((o: any) => o.dealText);
  const isRefreshing = bannersRefetching || offersRefetching;
  const contentLoading = !locationReady || offersLoading;
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [pendingRating, setPendingRating] = useState<any>(null);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [submittingRating, setSubmittingRating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      ratingsApi.getPending().then(({ data }) => {
        const items = data?.data;
        if (items && items.length > 0) setPendingRating(items[0]);
      }).catch(() => {});
    }, [])
  );

  async function submitRating(rating: number) {
    if (!pendingRating || submittingRating) return;
    setSubmittingRating(true);
    try {
      await ratingsApi.submit(pendingRating.id, rating);
    } catch {
      // silent
    } finally {
      setSubmittingRating(false);
      setPendingRating(null);
      setHoveredStar(0);
    }
  }

  function onRefresh() {
    refetchBanners();
    refetchOffers();
  }

  const tier = TIER_CONFIG[user?.tier || 'BRONZE'];
  const periodPts = Math.round(Number(user?.periodPoints || 0) * 100);
  const tierProgress = tier.nextThresholdPts != null
    ? Math.min(1, Math.max(0, (periodPts - tier.thresholdPts) / (tier.nextThresholdPts - tier.thresholdPts)))
    : 1;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* ── Fixed header ── */}
      <Animated.View style={{ opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }}>
        <SafeAreaView style={styles.headerBg}>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Hey {user?.name || 'there'}!</Text>
              <Text style={styles.storeName}>Lucky Stop Rewards</Text>
              {locationStatus !== 'detecting' && (
                <View style={[styles.nearbyPill, locationStatus === 'found' && styles.nearbyPillFound]}>
                  <View style={[styles.nearbyDot, locationStatus === 'found' && styles.nearbyDotFound]} />
                  {locationStatus === 'found'
                    ? <MapPinIcon size={11} color="#fff" strokeWidth={2.5} />
                    : <GlobeIcon size={11} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                  }
                  <Text style={styles.nearbyPillText}>
                    {locationStatus === 'found' ? (nearestStore?.name ?? pendingAgeGateStore?.name ?? 'All Stores') : 'All Stores'}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => router.push('/(customer)/notifications')}
                style={styles.bellBtn}
              >
                <BellIcon size={20} color="#fff" strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push('/(customer)/profile')} style={styles.profileBtn}>
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl, cache: 'reload' }} style={styles.profileBtnAvatar} />
                ) : (
                  <Text style={styles.profileBtnText}>{(user?.name || user?.phone || '?')[0].toUpperCase()}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Animated.View>

      {/* ── Animated wave transition ── */}
      <Animated.View style={[styles.waveOuter, { opacity: waveOpacity, transform: [{ translateY: waveSlideUp }] }]}>
        <Animated.View style={{ transform: [{ translateX: waveTranslateX }] }}>
          <Svg width={SCREEN_W * 4} height={H} viewBox={`0 0 ${SCREEN_W * 4} ${H}`}>
            <Path d={WAVE_PATH} fill="#EDF1F7" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* ── Scrollable content ── */}
      <Animated.ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 80 }}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            tintColor={COLORS.primary}
            colors={[COLORS.primary]}
          />
        }
      >

      {/* ── Balance Card ── */}
      <Animated.View style={{ opacity: fadeAnims[1], transform: [{ translateY: slideAnims[1] }] }}>
        <View style={styles.balanceCard}>
          <View style={styles.tierRow}>
            <View style={[styles.tierBadge, { backgroundColor: (tier?.color ?? '#CD7F32') + '30' }]}>
              <View style={[styles.tierDot, { backgroundColor: tier?.color ?? '#CD7F32' }]} />
              <Text style={styles.tierBadgeText}>{tier?.label ?? 'Bronze'} Member</Text>
            </View>
            {user?.tierPeriod && <Text style={styles.tierPeriod}>{user.tierPeriod}</Text>}
          </View>
          <Text style={styles.balanceLabel}>Points Balance</Text>
          <Text style={styles.balanceAmount}>{Math.round(Number(user?.pointsBalance || 0) * 100).toLocaleString()}</Text>
          <Text style={styles.balanceSubtext}>redeemable points</Text>
          <TouchableOpacity style={styles.redeemButton} onPress={() => router.push('/(customer)/rewards')}>
            <Text style={styles.redeemButtonText}>Redeem Rewards</Text>
          </TouchableOpacity>

          {/* Tier track */}
          <View style={styles.tierTrack}>
            {Object.entries(TIER_CONFIG).map(([key, cfg], i, arr) => {
              const isCurrent = (user?.tier || 'BRONZE') === key;
              const isPast = i < Object.keys(TIER_CONFIG).indexOf(user?.tier || 'BRONZE');
              const isNext = i === Object.keys(TIER_CONFIG).indexOf(user?.tier || 'BRONZE') + 1;
              return (
                <View key={key} style={styles.tierTrackItem}>
                  {i > 0 && (
                    <View style={[styles.tierConnector, { backgroundColor: isPast ? cfg.color : 'rgba(255,255,255,0.15)' }]} />
                  )}
                  <View style={[
                    styles.tierBubble,
                    isCurrent && { backgroundColor: cfg.color + '30', borderColor: cfg.color, transform: [{ scale: 1.3 }] },
                    isPast && { backgroundColor: cfg.color + '25', borderColor: cfg.color + '60' },
                    !isCurrent && !isPast && { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' },
                  ]}>
                    <Text style={[
                      styles.tierBubbleText,
                      !isCurrent && !isPast && { opacity: 0.4 },
                    ]}>
                      {cfg.icon}
                    </Text>
                  </View>
                  {isCurrent && <View style={[styles.tierBubbleDot, { backgroundColor: cfg.color }]} />}
                </View>
              );
            })}
          </View>
          {tier.nextLabel ? (
            <View style={styles.tierProgressWrap}>
              <View style={styles.tierProgressTrack}>
                <View style={[styles.tierProgressFill, { width: `${Math.round(tierProgress * 100)}%` as any, backgroundColor: tier.color }]} />
              </View>
              <Text style={styles.tierProgressRight}>
                {(tier.nextThresholdPts! - periodPts).toLocaleString()} pts to {tier.nextLabel}
              </Text>
            </View>
          ) : (
            <Text style={styles.tierProgressMaxText}>✦ Platinum — Max tier achieved</Text>
          )}
        </View>
      </Animated.View>

      {/* QR section removed — accessible via floating QR button */}
      <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }] }}>
        <WelcomeBonusCard />
      </Animated.View>

      {/* ── Banners ── */}
      <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
        {contentLoading
          ? (
            <View style={styles.bannerWrapper}>
              <SkeletonBannerCard />
            </View>
          )
          : banners.length > 0 && (
            <View style={styles.bannerWrapper}>
              <BannerCarousel banners={banners} />
            </View>
          )
        }
      </Animated.View>

      {/* ── Gas Prices ── */}
      <Animated.View style={{ opacity: fadeAnims[4], transform: [{ translateY: slideAnims[4] }] }}>
        {contentLoading
          ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<GasPumpIcon size={17} color={COLORS.text} />} label="Today's Gas Prices" />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gasPriceRow}>
                <SkeletonGasPriceCard />
                <SkeletonGasPriceCard />
              </ScrollView>
            </View>
          )
          : gasPrices.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<GasPumpIcon size={17} color={COLORS.text} />} label="Today's Gas Prices" />
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gasPriceRow}>
                {gasPrices.map((store: any) => (
                  <View key={store.id} style={styles.gasPriceCard}>
                    <Text style={styles.gasStoreName} numberOfLines={1}>{store.name}</Text>
                    {!nearestStore && store.address && (
                      <Text style={styles.gasStoreAddress} numberOfLines={1}>{store.address}, {store.city}</Text>
                    )}
                    {!nearestStore && store.phone && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${store.phone.replace(/\D/g, '')}`)}
                        activeOpacity={0.7}
                        style={styles.gasPhoneBtn}
                      >
                        <Text style={styles.gasStorePhone}>📞 {store.phone}</Text>
                      </TouchableOpacity>
                    )}
                    {store.gasPricePerGallon != null && (
                      <View style={styles.gasPriceLine}>
                        <GasPumpIcon size={14} color={COLORS.accent} strokeWidth={2} />
                        <Text style={styles.gasPriceLabel}>Gas</Text>
                        <Text style={styles.gasPriceValue}>${Number(store.gasPricePerGallon).toFixed(3)}</Text>
                        <Text style={styles.gasPriceUnit}>/gal</Text>
                      </View>
                    )}
                    {store.dieselPricePerGallon != null && (
                      <View style={styles.gasPriceLine}>
                        <TruckIcon size={14} color={COLORS.secondary} strokeWidth={2} />
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
          )
        }
      </Animated.View>

      {/* ── Active Promotions ── */}
      <Animated.View style={{ opacity: fadeAnims[5], transform: [{ translateY: slideAnims[5] }] }}>
        {contentLoading
          ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<FlameIcon size={17} color={COLORS.primary} />} label="Active Promotions" />
              </View>
              <SkeletonOfferCard />
              <SkeletonOfferCard />
            </View>
          )
          : promotions.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<FlameIcon size={17} color={COLORS.primary} />} label="Active Promotions" />
                {promotions.length > 2 && (
                  <Text style={styles.sectionCount}>{promotions.length} offers</Text>
                )}
              </View>
              {promotions.length <= 2 ? (
                promotions.map((offer: any) => (
                  <TouchableOpacity key={offer.id} style={styles.offerCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                    {offer.imageUrl
                      ? <Image source={{ uri: offer.imageUrl }} style={styles.offerImage} />
                      : <OfferPlaceholder isGas={offer.gasBonusCentsPerGallon != null} />
                    }
                    <View style={styles.offerContent}>
                      <Text style={styles.offerTitle}>{offer.title}</Text>
                      {!nearestStore && (
                        <View style={styles.offerStoreBadge}>
                          {offer.store
                            ? <MapPinIcon size={10} color={COLORS.secondary} strokeWidth={2.5} />
                            : <GlobeIcon size={10} color={COLORS.textMuted} strokeWidth={2.5} />
                          }
                          <Text style={styles.offerStoreText}>
                            {offer.store ? `${offer.store.name}` : 'All Lucky Stop Stores'}
                          </Text>
                        </View>
                      )}
                      <Text style={styles.offerDesc}>{offer.description}</Text>
                      <View style={styles.offerBonusPill}>
                        {offer.gasBonusCentsPerGallon != null
                          ? <GasPumpIcon size={11} color="#fff" strokeWidth={2.5} />
                          : <PercentIcon size={11} color="#fff" strokeWidth={2.5} />
                        }
                        <Text style={styles.offerBonusText}>
                          {offer.gasBonusCentsPerGallon != null
                            ? `+${offer.gasBonusCentsPerGallon}¢/gal bonus`
                            : `+${Math.round(offer.bonusRate * 100)}% cashback`}
                        </Text>
                      </View>
                    </View>
                    <ChevronRightIcon size={20} color={COLORS.border} strokeWidth={2.5} />
                  </TouchableOpacity>
                ))
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sliderRow}>
                  {promotions.map((offer: any) => (
                    <TouchableOpacity key={offer.id} style={styles.offerSlideCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                      {offer.imageUrl
                        ? <Image source={{ uri: offer.imageUrl }} style={styles.offerSlideImage} />
                        : (
                          <View style={[styles.offerSlidePlaceholder, { backgroundColor: offer.gasBonusCentsPerGallon != null ? '#fff7ed' : COLORS.primary + '0f' }]}>
                            {offer.gasBonusCentsPerGallon != null
                              ? <GasPumpIcon size={32} color={COLORS.accent} strokeWidth={1.5} />
                              : <FlameIcon size={32} color={COLORS.primary} strokeWidth={1.5} />
                            }
                          </View>
                        )
                      }
                      <View style={styles.offerSlideContent}>
                        <Text style={styles.offerTitle} numberOfLines={2}>{offer.title}</Text>
                        {!nearestStore && (
                          <View style={styles.offerStoreBadge}>
                            {offer.store
                              ? <MapPinIcon size={10} color={COLORS.secondary} strokeWidth={2.5} />
                              : <GlobeIcon size={10} color={COLORS.textMuted} strokeWidth={2.5} />
                            }
                            <Text style={styles.offerStoreText} numberOfLines={1}>
                              {offer.store ? offer.store.name : 'All Stores'}
                            </Text>
                          </View>
                        )}
                        <Text style={styles.offerDesc} numberOfLines={2}>{offer.description}</Text>
                        <View style={[styles.offerBonusPill, { alignSelf: 'flex-start' }]}>
                          {offer.gasBonusCentsPerGallon != null
                            ? <GasPumpIcon size={10} color="#fff" strokeWidth={2.5} />
                            : <PercentIcon size={10} color="#fff" strokeWidth={2.5} />
                          }
                          <Text style={styles.offerBonusText}>
                            {offer.gasBonusCentsPerGallon != null
                              ? `+${offer.gasBonusCentsPerGallon}¢/gal`
                              : `+${Math.round(offer.bonusRate * 100)}%`}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )
        }
      </Animated.View>

      {/* ── Today's Deals + History ── */}
      <Animated.View style={{ opacity: fadeAnims[6], transform: [{ translateY: slideAnims[6] }] }}>
        {!contentLoading && deals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <SectionTitle icon={<TagIcon size={17} color={COLORS.accent} />} label="Today's Deals" />
              {deals.length > 2 && (
                <Text style={styles.sectionCount}>{deals.length} deals</Text>
              )}
            </View>
            {deals.length <= 2 ? (
              deals.map((offer: any) => (
                <TouchableOpacity key={offer.id} style={styles.dealCard} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                  {offer.imageUrl
                    ? <Image source={{ uri: offer.imageUrl }} style={styles.offerImage} />
                    : (
                      <View style={[styles.offerPlaceholder, { backgroundColor: COLORS.accent + '15' }]}>
                        <TagIcon size={26} color={COLORS.accent} strokeWidth={1.75} />
                      </View>
                    )
                  }
                  <View style={styles.offerContent}>
                    <Text style={styles.dealText}>{offer.dealText}</Text>
                    <Text style={styles.offerTitle}>{offer.title}</Text>
                    {offer.description ? <Text style={styles.offerDesc}>{offer.description}</Text> : null}
                  </View>
                  <ChevronRightIcon size={20} color={COLORS.border} strokeWidth={2.5} />
                </TouchableOpacity>
              ))
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sliderRow}>
                {deals.map((offer: any) => (
                  <TouchableOpacity key={offer.id} style={[styles.offerSlideCard, styles.dealSlideCard]} onPress={() => setSelectedOffer(offer)} activeOpacity={0.8}>
                    {offer.imageUrl
                      ? <Image source={{ uri: offer.imageUrl }} style={styles.offerSlideImage} />
                      : (
                        <View style={[styles.offerSlidePlaceholder, { backgroundColor: COLORS.accent + '15' }]}>
                          <TagIcon size={32} color={COLORS.accent} strokeWidth={1.5} />
                        </View>
                      )
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

        <TouchableOpacity style={styles.historyLink} onPress={() => router.push('/(customer)/history')}>
          <Text style={styles.historyLinkText}>View Points History</Text>
          <ChevronRightIcon size={16} color={COLORS.primary} strokeWidth={2.5} />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Rating prompt ── */}
      {pendingRating && (
        <Modal transparent animationType="slide" onRequestClose={() => setPendingRating(null)}>
          <View style={rm.overlay}>
            <View style={rm.sheet}>
              <View style={rm.starIconWrap}>
                <StarIcon size={36} color="#F59E0B" strokeWidth={1.5} filled />
              </View>
              <Text style={rm.title}>How was your experience?</Text>
              <Text style={rm.sub}>
                At {pendingRating.store?.name || 'Lucky Stop'}
                {pendingRating.grantedBy?.name ? ` · served by ${pendingRating.grantedBy.name.split(' ')[0]}` : ''}
              </Text>
              <View style={rm.stars}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => { setHoveredStar(s); submitRating(s); }}
                    activeOpacity={0.7}
                    style={rm.starBtn}
                  >
                    <StarIcon
                      size={44}
                      color={s <= hoveredStar ? '#F59E0B' : '#E5E7EB'}
                      strokeWidth={1.5}
                      filled={s <= hoveredStar}
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity onPress={() => setPendingRating(null)} style={rm.skipBtn}>
                <Text style={rm.skipText}>Skip</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── 21+ age gate modal ── */}
      {show21Gate && pendingAgeGateStore && (
        <Modal transparent animationType="fade" onRequestClose={() => {}}>
          <View style={ag.overlay}>
            <View style={ag.card}>
              <View style={ag.badge}>
                <Text style={ag.badgeText}>21+</Text>
              </View>
              <Text style={ag.title}>Age-Restricted Store</Text>
              <Text style={ag.storeName}>{pendingAgeGateStore.name}</Text>
              <Text style={ag.body}>
                This store sells age-restricted products. You must be 21 or older to earn rewards here.{'\n\n'}
                By confirming, you declare under penalty of law that you are at least 21 years of age. This confirmation is stored on your account.
              </Text>
              <TouchableOpacity
                style={[ag.confirmBtn, confirming21 && { opacity: 0.6 }]}
                onPress={async () => {
                  if (confirming21) return;
                  setConfirming21(true);
                  try {
                    await authApi.confirm21();
                    setAge21Confirmed();
                    setNearestStore(pendingAgeGateStore);
                    setPendingAgeGateStore(null);
                    setShow21Gate(false);
                  } catch {
                    // silent — gate stays open, user can retry
                  } finally {
                    setConfirming21(false);
                  }
                }}
                disabled={confirming21}
                activeOpacity={0.85}
              >
                <Text style={ag.confirmBtnText}>{confirming21 ? 'Confirming…' : 'I am 21 or older — Continue'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ag.backBtn}
                onPress={() => {
                  setPendingAgeGateStore(null);
                  setShow21Gate(false);
                  setLocationStatus('none');
                }}
                activeOpacity={0.7}
              >
                <Text style={ag.backBtnText}>Go back</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Offer detail modal ── */}
      {selectedOffer && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedOffer(null)}>
          <View style={om.overlay}>
            <View style={om.sheet}>
              {selectedOffer.imageUrl && (
                <Image source={{ uri: selectedOffer.imageUrl }} style={om.image} />
              )}
              <View style={om.body}>
                {selectedOffer.gasBonusCentsPerGallon != null ? (
                  <View style={om.badgeRow}>
                    <View style={[om.badge, { backgroundColor: '#fff3e0' }]}>
                      <GasPumpIcon size={13} color="#c04000" strokeWidth={2} />
                      <Text style={[om.badgeText, { color: '#c04000' }]}>+{selectedOffer.gasBonusCentsPerGallon}¢ per gallon — auto-applied</Text>
                    </View>
                  </View>
                ) : selectedOffer.bonusRate ? (
                  <View style={om.badgeRow}>
                    <View style={om.badge}>
                      <PercentIcon size={13} color={COLORS.primary} strokeWidth={2} />
                      <Text style={om.badgeText}>+{Math.round(selectedOffer.bonusRate * 100)}% cashback — auto-applied</Text>
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
                    {selectedOffer.gasBonusCentsPerGallon != null
                      ? `You earn an extra ${selectedOffer.gasBonusCentsPerGallon}¢ per gallon on gas purchases. Automatically applied when the cashier scans your QR code.`
                      : selectedOffer.bonusRate
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

      </Animated.ScrollView>

      {/* ── QR floating button ── */}
      <TouchableOpacity style={styles.qrFab} onPress={() => setShowQR(true)} activeOpacity={0.85}>
        <View style={styles.qrFabInner}>
          <Text style={styles.qrFabIcon}>▦</Text>
          <Text style={styles.qrFabLabel}>My QR</Text>
        </View>
      </TouchableOpacity>

      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="slide" onRequestClose={() => setShowQR(false)}>
        <View style={styles.qrModalBackdrop}>
          <TouchableOpacity style={StyleSheet.absoluteFill} onPress={() => setShowQR(false)} activeOpacity={1} />
          <View style={styles.qrModalSheet}>
            {/* Handle + header */}
            <View style={styles.qrModalHeader}>
              <View style={styles.qrModalPill} />
              <View style={styles.qrModalLogoRow}>
                <View style={styles.qrModalLogo}><Text style={styles.qrModalLogoText}>LS</Text></View>
                <View>
                  <Text style={styles.qrModalTitle}>Your QR Code</Text>
                  <Text style={styles.qrModalSub}>Show this to the cashier to earn points</Text>
                </View>
              </View>
            </View>
            {/* QR code */}
            {user?.qrCode ? (
              <View style={styles.qrModalFrame}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
                <View style={styles.qrInner}>
                  <QRCode value={user.qrCode} size={220} color={COLORS.secondary} backgroundColor="transparent" />
                </View>
                <Animated.View style={[styles.scanLine, {
                  transform: [{ translateY: scanLineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 220] }) }],
                }]} />
              </View>
            ) : (
              <View style={[styles.qrModalFrame, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: COLORS.textMuted }}>QR code loading…</Text>
              </View>
            )}
            <Text style={styles.qrHint}>🔒 Unique to your account</Text>
            <TouchableOpacity style={styles.qrModalClose} onPress={() => setShowQR(false)} activeOpacity={0.8}>
              <Text style={styles.qrModalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDF1F7' },
  scroll: { flex: 1 },
  headerBg: { backgroundColor: COLORS.primary },
  waveOuter: {
    backgroundColor: COLORS.primary,
    overflow: 'hidden',
    width: SCREEN_W,
  },

  // QR floating button
  qrFab: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    left: '50%',
    marginLeft: -52,
  },
  qrFabInner: {
    backgroundColor: COLORS.primary,
    borderRadius: 28, paddingHorizontal: 22, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45, shadowRadius: 14, elevation: 10,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)',
  },
  qrFabIcon: { fontSize: 18, color: '#fff' },
  qrFabLabel: { color: '#fff', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // QR modal
  qrModalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  qrModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingBottom: 32, alignItems: 'center',
    overflow: 'hidden',
  },
  qrModalHeader: {
    width: '100%',
    backgroundColor: COLORS.primary,
    paddingTop: 12, paddingBottom: 20, paddingHorizontal: 20,
    alignItems: 'center',
  },
  qrModalPill: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.4)', marginBottom: 16,
  },
  qrModalLogoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  qrModalLogo: {
    width: 42, height: 42, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  qrModalLogoText: { color: '#fff', fontSize: 14, fontWeight: '900' },
  qrModalTitle: { fontSize: 17, fontWeight: '900', color: '#fff' },
  qrModalSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  qrModalFrame: {
    width: 256, height: 256,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fafafa', borderRadius: 16,
    overflow: 'hidden', position: 'relative',
    marginTop: 24,
  },
  qrModalClose: {
    marginTop: 20, paddingVertical: 14, paddingHorizontal: 48,
    backgroundColor: '#f1f5f9', borderRadius: 16,
  },
  qrModalCloseText: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, backgroundColor: COLORS.primary,
  },
  greeting: { fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  storeName: { fontSize: 22, fontWeight: '900', color: '#fff', marginTop: 2 },
  nearbyPill: {
    marginTop: 7, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  nearbyPillFound: { backgroundColor: 'rgba(52,211,153,0.22)' },
  nearbyDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.4)' },
  nearbyDotFound: { backgroundColor: '#34d399' },
  nearbyPillText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bellBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  bellBadge: {
    position: 'absolute', top: 0, right: 0,
    backgroundColor: '#E63946', borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
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
  profileBtnAvatar: { width: 40, height: 40, borderRadius: 20 },

  balanceCard: {
    marginHorizontal: 16, marginTop: 16, marginBottom: 12,
    backgroundColor: COLORS.secondary, borderRadius: 24, padding: 24, alignItems: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28, shadowRadius: 18, elevation: 10,
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 14 },
  tierBadge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 5 },
  tierDot: { width: 8, height: 8, borderRadius: 4 },
  tierBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  tierPeriod: { color: 'rgba(255,255,255,0.4)', fontSize: 11, fontWeight: '600' },
  balanceLabel: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  balanceAmount: { fontSize: 54, fontWeight: '900', color: '#fff', marginVertical: 6, letterSpacing: -1.5 },
  balanceSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: '600' },
  redeemButton: {
    backgroundColor: COLORS.accent, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 12, marginTop: 18,
  },
  redeemButtonText: { fontWeight: '800', color: '#fff', fontSize: 14 },
  tierTrack: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    width: '100%', marginTop: 20, marginBottom: 14,
  },
  tierTrackItem: { alignItems: 'center', flex: 1, position: 'relative' },
  tierConnector: {
    position: 'absolute', left: '-50%', right: '50%', top: 13,
    height: 2, backgroundColor: 'rgba(255,255,255,0.15)',
  },
  tierBubble: {
    width: 34, height: 34, borderRadius: 17,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  tierBubbleText: {
    fontSize: 16,
  },
  tierBubbleDot: {
    width: 5, height: 5, borderRadius: 3, marginTop: 4,
  },
  tierProgressWrap: { width: '100%', gap: 6 },
  tierProgressRight: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '600', textAlign: 'center' },
  tierProgressTrack: {
    height: 5, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 3, overflow: 'hidden',
  },
  tierProgressFill: { height: '100%', borderRadius: 3 },
  tierProgressMaxText: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', marginTop: 4, letterSpacing: 0.5, textAlign: 'center' },

  qrSection: {
    alignItems: 'center', paddingTop: 20, paddingBottom: 18, paddingHorizontal: 20,
    backgroundColor: COLORS.white, marginHorizontal: 16, marginBottom: 12, borderRadius: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07, shadowRadius: 12, elevation: 4,
  },
  qrHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    width: '100%', marginBottom: 20,
  },
  qrLogoMark: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  qrLogoText: { color: '#fff', fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  qrTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  qrSubtext: { color: COLORS.textMuted, fontSize: 12, fontWeight: '500', marginTop: 1 },
  qrFrame: {
    width: 220, height: 220,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fafafa',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  qrInner: { padding: 16 },
  corner: {
    position: 'absolute', width: 22, height: 22,
    borderColor: COLORS.primary, borderWidth: 3,
  },
  cornerTL: { top: 8, left: 8, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  cornerTR: { top: 8, right: 8, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  cornerBL: { bottom: 8, left: 8, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 8, right: 8, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  scanLine: {
    position: 'absolute', top: 16, left: 16, right: 16, height: 2,
    backgroundColor: COLORS.primary, opacity: 0.6,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8, shadowRadius: 4, elevation: 2,
  },
  qrHint: {
    marginTop: 14, fontSize: 11, fontWeight: '600',
    color: COLORS.textMuted, letterSpacing: 0.2,
  },
  qrEmpty: {
    width: 220, height: 220, borderRadius: 16,
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  qrEmptyInner: {
    width: 60, height: 60, borderRadius: 12,
    borderWidth: 3, borderColor: COLORS.border,
  },
  qrEmptyText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  qrEmptySub: { fontSize: 11, color: COLORS.border, fontWeight: '600' },

  bannerWrapper: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  section: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitleText: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  sectionCount: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },

  sliderRow: { gap: 10, paddingBottom: 4 },
  offerSlideCard: {
    width: 220, backgroundColor: COLORS.white, borderRadius: 18, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  dealSlideCard: { borderWidth: 1.5, borderColor: COLORS.accent + '45', backgroundColor: COLORS.accent + '08' },
  offerSlideImage: { width: 220, height: 110, resizeMode: 'cover' },
  offerSlidePlaceholder: {
    width: 220, height: 110, alignItems: 'center', justifyContent: 'center',
  },
  offerSlideContent: { padding: 12, gap: 4 },

  offerCard: {
    backgroundColor: COLORS.white, borderRadius: 18, overflow: 'hidden', marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  offerImage: { width: 84, height: 84, resizeMode: 'cover' },
  offerPlaceholder: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
  offerContent: { flex: 1, padding: 12, gap: 2 },
  offerTitle: { fontWeight: '700', fontSize: 14, color: COLORS.text },
  offerDesc: { color: COLORS.textMuted, fontSize: 12, marginTop: 3, lineHeight: 17 },
  offerBonusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.primary, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, marginTop: 6, alignSelf: 'flex-start',
  },
  offerBonusText: { color: '#fff', fontWeight: '700', fontSize: 11 },

  dealCard: {
    backgroundColor: COLORS.accent + '08', borderRadius: 18, overflow: 'hidden', marginBottom: 10,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.accent + '45',
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  dealText: { fontSize: 20, fontWeight: '900', color: COLORS.accent, marginBottom: 2, letterSpacing: -0.5 },

  gasPriceRow: { gap: 10, paddingBottom: 4, paddingTop: 8 },
  gasPriceCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 14, minWidth: 155,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
    borderTopWidth: 3, borderTopColor: '#f97316',
  },
  gasStoreName: { fontSize: 13, fontWeight: '800', color: COLORS.text, marginBottom: 10 },
  gasPriceLine: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 },
  gasPriceLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', flex: 1 },
  gasPriceValue: { fontSize: 16, fontWeight: '900', color: COLORS.text },
  gasPriceUnit: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  gasUpdatedAt: { fontSize: 10, color: COLORS.border, marginTop: 6, fontWeight: '600' },
  gasStoreAddress: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500', marginBottom: 6 },
  gasPhoneBtn: { alignSelf: 'flex-start', marginBottom: 6 },
  gasStorePhone: { fontSize: 11, color: COLORS.primary, fontWeight: '700' },

  offerStoreBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 3, marginTop: 1 },
  offerStoreText: { fontSize: 11, fontWeight: '700', color: COLORS.secondary },

  historyLink: { paddingVertical: 20, paddingHorizontal: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 4 },
  historyLinkText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },

  scanReceiptCard: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: COLORS.accent + '08', borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.accent + '40',
    shadowColor: COLORS.accent, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 10, elevation: 4,
  },
  scanReceiptLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14 },
  scanReceiptIconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: COLORS.accent + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  scanReceiptTitle: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  scanReceiptSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
});

const bc = StyleSheet.create({
  root: { gap: 10 },
  slide: {
    width: BANNER_W, marginRight: 12, borderRadius: 20, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14, shadowRadius: 12, elevation: 6,
  },
  image: { width: BANNER_W, height: 190, resizeMode: 'cover' },
  titleBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.48)', paddingHorizontal: 16, paddingVertical: 12,
  },
  titleText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.1 },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 10 },
});

const rm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 44, alignItems: 'center', gap: 8,
  },
  starIconWrap: { marginBottom: 4 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  stars: { flexDirection: 'row', gap: 6, marginTop: 14, marginBottom: 4 },
  starBtn: { padding: 4 },
  skipBtn: { marginTop: 12, padding: 8 },
  skipText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});

const om = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  image: { width: '100%', height: 190, resizeMode: 'cover' },
  body: { padding: 24, gap: 10 },
  badgeRow: { flexDirection: 'row' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary + '14', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  badgeText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  dealText: { fontSize: 26, fontWeight: '900', color: COLORS.accent, letterSpacing: -0.5 },
  title: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  desc: { fontSize: 14, color: COLORS.textMuted, lineHeight: 21 },
  dateRow: { backgroundColor: COLORS.background, borderRadius: 10, padding: 10 },
  dateText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600', textAlign: 'center' },
  howBox: {
    backgroundColor: COLORS.secondary + '0c', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.secondary + '18',
  },
  howTitle: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  howText: { fontSize: 14, color: COLORS.text, lineHeight: 21 },
  closeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    padding: 16, alignItems: 'center', marginTop: 4,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

const ag = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25, shadowRadius: 24, elevation: 20,
  },
  badge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: '#1D3557', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  badgeText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  title: { fontSize: 20, fontWeight: '900', color: '#1D3557', marginBottom: 4 },
  storeName: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted, marginBottom: 16 },
  body: { fontSize: 14, color: '#444', lineHeight: 22, textAlign: 'center', marginBottom: 24 },
  confirmBtn: {
    backgroundColor: '#1D3557', borderRadius: 16,
    paddingVertical: 16, paddingHorizontal: 20,
    width: '100%', alignItems: 'center', marginBottom: 10,
  },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  backBtn: { paddingVertical: 10, width: '100%', alignItems: 'center' },
  backBtnText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
});
