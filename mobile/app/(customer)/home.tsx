import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Image,
  StatusBar, RefreshControl, FlatList, Dimensions, Modal, Animated, Linking,
  TextInput, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useCallback, useRef, useState, useEffect, memo } from 'react';
import * as Location from 'expo-location';
import { ratingsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { offersApi, authApi, notificationsApi, storesApi, hotFoodApi, catalogApi } from '../../services/api';
import WelcomeBonusCard from '../../components/WelcomeBonusCard';
import { COLORS, TIER_CONFIG } from '../../constants';
import {
  BellIcon, MapPinIcon, GlobeIcon, GasPumpIcon, TruckIcon,
  FlameIcon, TagIcon, ReceiptIcon, CameraIcon, ChevronRightIcon, StarIcon,
  PercentIcon, GiftIcon,
} from '../../components/Icons';
import { SkeletonOfferCard, SkeletonBannerCard, SkeletonGasPriceCard } from '../../components/SkeletonLoader';

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


const SCREEN_W = Dimensions.get('window').width;
const BANNER_W = SCREEN_W - 32;

/* ─── Animated dot indicator ─────────────────────────────── */
const AnimatedDot = memo(function AnimatedDot({ active, color }: { active: boolean; color: string }) {
  const width = useRef(new Animated.Value(active ? 20 : 7)).current;
  const opacity = useRef(new Animated.Value(active ? 1 : 0.35)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(width, { toValue: active ? 20 : 7, useNativeDriver: false, bounciness: 10 }),
      Animated.timing(opacity, { toValue: active ? 1 : 0.35, duration: 200, useNativeDriver: false }),
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

/* ─── Promo slideshow ──────────────────────────────────────── */
const SLIDE_W = SCREEN_W - 32;
const PLACEHOLDER_COLORS_FS = ['#FFF7ED', '#F0FDF4', '#EFF6FF', '#FEF9C3', '#FDF2F8', '#F0F9FF'];

type PromoKind = 'cashback' | 'rewards' | 'tiers' | 'network';
type PromoSlide = { id: PromoKind; bg: string; deco: string; eyebrow: string; headline: string; body: string; cta: string | null; route: string | null };

const PROMO_SLIDES: PromoSlide[] = [
  { id: 'cashback', bg: '#B91C1C', deco: '#FDE68A', eyebrow: 'EARN CASH BACK',     headline: 'Every Visit Pays Off',          body: 'Get 1–5% back on every purchase — automatically added when the cashier scans your QR',  cta: 'View Earnings',  route: '/(customer)/history' },
  { id: 'rewards',  bg: '#C2410C', deco: '#FCD34D', eyebrow: 'REDEEM POINTS',     headline: 'Free Products Await You',      body: 'Trade your points for real in-store items — no catch, no extra purchase',     cta: 'Browse Rewards', route: '/(customer)/rewards' },
  { id: 'tiers',   bg: '#5B21B6', deco: '#C4B5FD', eyebrow: 'LOYALTY TIERS',     headline: 'Rise from Bronze to Platinum', body: 'Higher tier = higher cashback rate + free refills + gas bonuses. Climb every period', cta: 'My Status',      route: '/(customer)/profile' },
  { id: 'network', bg: '#0F766E', deco: '#5EEAD4', eyebrow: '12 LOCATIONS',      headline: '1 Account. Every Location.',   body: 'Your balance and rewards follow you to any Lucky Stop — shop anywhere',       cta: null,             route: null },
];

function promoIcon(kind: PromoKind, size: number) {
  switch (kind) {
    case 'cashback': return <PercentIcon size={size} color="#fff" strokeWidth={2} />;
    case 'rewards':  return <GiftIcon    size={size} color="#fff" strokeWidth={2} />;
    case 'tiers':    return <StarIcon    size={size} color="#fff" strokeWidth={1.75} />;
    case 'network':  return <MapPinIcon  size={size} color="#fff" strokeWidth={2} />;
  }
}

const PromoSlideshow = memo(function PromoSlideshow() {
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % PROMO_SLIDES.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
  }, []);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const renderSlide = useCallback(({ item }: { item: PromoSlide }) => (
    <TouchableOpacity
      style={[ps.slide, { backgroundColor: item.bg }]}
      activeOpacity={item.route ? 0.88 : 1}
      onPress={() => { if (item.route) router.push(item.route as any); }}
    >
      <View style={[ps.decoCircleLg, { backgroundColor: item.deco + '22' }]} />
      <View style={[ps.decoCircleSm, { backgroundColor: item.deco + '33' }]} />
      <View style={ps.slideInner}>
        <View style={ps.iconBadge}>{promoIcon(item.id, 22)}</View>
        <Text style={ps.eyebrow}>{item.eyebrow}</Text>
        <Text style={ps.headline}>{item.headline}</Text>
        <Text style={ps.body} numberOfLines={2}>{item.body}</Text>
        {item.cta && (
          <View style={[ps.cta, { backgroundColor: item.deco }]}>
            <Text style={[ps.ctaText, { color: item.bg }]}>{item.cta} →</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  ), []);

  return (
    <View style={ps.root}>
      <FlatList
        ref={flatRef}
        data={PROMO_SLIDES}
        keyExtractor={item => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={SLIDE_W + 12}
        decelerationRate="fast"
        onMomentumScrollEnd={e => {
          const idx = Math.round(e.nativeEvent.contentOffset.x / (SLIDE_W + 12));
          setActiveIndex(idx);
          startTimer();
        }}
        getItemLayout={(_, index) => ({ length: SLIDE_W + 12, offset: (SLIDE_W + 12) * index, index })}
        renderItem={renderSlide}
      />
      <View style={ps.dots}>
        {PROMO_SLIDES.map((_, i) => (
          <AnimatedDot key={i} active={i === activeIndex} color={COLORS.primary} />
        ))}
      </View>
    </View>
  );
});

/* ─── Rewards shelf ────────────────────────────────────────── */
const CAT_DISPLAY: Record<string, { label: string; emoji: string; color: string }> = {
  IN_STORE:  { label: 'In-Store',  emoji: '🛒', color: '#2A9D8F' },
  GAS:       { label: 'Gas',       emoji: '⛽', color: '#F4A226' },
  HOT_FOODS: { label: 'Hot Foods', emoji: '🌮', color: '#E63946' },
};
const CAT_FALLBACK_COLORS = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#6366F1'];

const RewardsShelf = memo(function RewardsShelf({ items, userPts }: { items: any[]; userPts: number }) {
  if (items.length === 0) return null;

  // Derive category order from actual data so new categories appear automatically
  const seenKeys: string[] = [];
  items.forEach((i: any) => { if (i.category && !seenKeys.includes(i.category)) seenKeys.push(i.category); });

  const sections = seenKeys.map((key, idx) => {
    const cfg = CAT_DISPLAY[key] ?? {
      label: key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      emoji: '🏷️',
      color: CAT_FALLBACK_COLORS[idx % CAT_FALLBACK_COLORS.length],
    };
    return { key, ...cfg, items: items.filter((i: any) => i.category === key).slice(0, 2) };
  }).filter(s => s.items.length > 0);
  if (sections.length === 0) return null;
  return (
    <View style={rs.root}>
      {sections.map(section => (
        <View key={section.key} style={rs.section}>
          <View style={[rs.catHeader, { backgroundColor: section.color + '18' }]}>
            <Text style={rs.catEmoji}>{section.emoji}</Text>
            <Text style={[rs.catLabel, { color: section.color }]}>{section.label}</Text>
          </View>
          <View style={rs.tileRow}>
            {section.items.map((item: any) => {
              const canAfford = userPts >= item.pointsCost;
              return (
                <TouchableOpacity
                  key={item.id}
                  style={[rs.tile, canAfford && { borderColor: section.color + '55' }]}
                  onPress={() => router.push('/(customer)/rewards')}
                  activeOpacity={0.82}
                >
                  <View style={[rs.tileIconWrap, { backgroundColor: section.color + '18' }]}>
                    <Text style={rs.tileEmoji}>{item.emoji || '🎁'}</Text>
                  </View>
                  <Text style={rs.tileName} numberOfLines={2}>{item.title}</Text>
                  <View style={[rs.ptsBadge, canAfford && { backgroundColor: section.color }]}>
                    <Text style={[rs.ptsText, !canAfford && { color: COLORS.textMuted }]}>
                      {item.pointsCost.toLocaleString()} pts
                    </Text>
                  </View>
                  {!canAfford && (
                    <Text style={rs.shortage}>−{(item.pointsCost - userPts).toLocaleString()}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
});

/* ─── Main screen ─────────────────────────────────────────── */
export default function CustomerHome() {
  const { user, token, setAuth } = useAuthStore();

  // Staggered entrance — 7 sections fade + slide up on mount
  const fadeAnims = useRef([...Array(8)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(8)].map(() => new Animated.Value(18))).current;
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

  // Tier track animations
  const tierPulse = useRef(new Animated.Value(1.3)).current;
  const tierShine = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(tierPulse, { toValue: 1.47, duration: 1000, useNativeDriver: true }),
      Animated.timing(tierPulse, { toValue: 1.3, duration: 1000, useNativeDriver: true }),
    ])).start();
    Animated.loop(Animated.sequence([
      Animated.timing(tierShine, { toValue: 0.8, duration: 1600, useNativeDriver: true }),
      Animated.timing(tierShine, { toValue: 0, duration: 1600, useNativeDriver: true }),
    ])).start();
  }, []);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const [showQR, setShowQR] = useState(false);

  // Scroll-to-section support (triggered from notification taps)
  const scrollViewRef = useRef<ScrollView>(null);
  const gasSectionRef = useRef<View>(null);
  const offersSectionRef = useRef<View>(null);
  const { scrollTo } = useLocalSearchParams<{ scrollTo?: string }>();

  useFocusEffect(useCallback(() => {
    if (!scrollTo) return;
    const sectionRef = scrollTo === 'gas' ? gasSectionRef : scrollTo === 'offers' ? offersSectionRef : null;
    if (!sectionRef) return;
    const t = setTimeout(() => {
      sectionRef.current?.measureLayout(
        scrollViewRef.current as any,
        (_x: number, y: number) => {
          scrollViewRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
        },
        () => {},
      );
      // Clear the param so back-navigation doesn't re-trigger scroll
      router.setParams({ scrollTo: '' });
    }, 380);
    return () => clearTimeout(t);
  }, [scrollTo]));

  // Hot food order state
  const [selectedFoodItem, setSelectedFoodItem] = useState<any>(null);
  const [foodQty, setFoodQty] = useState(1);
  const [foodNote, setFoodNote] = useState('');
  const [foodOrdering, setFoodOrdering] = useState(false);

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

  const { data: hotFoodData } = useQuery({
    queryKey: ['hot-food-customer-menu', nearestStore?.id],
    queryFn: () => hotFoodApi.getCustomerMenu(nearestStore!.id),
    enabled: !!nearestStore,
    staleTime: 5 * 60 * 1000,
  });
  const hotFoodMenu: any[] = hotFoodData?.data?.data ?? [];

  const { data: catalogData } = useQuery({
    queryKey: ['catalog-active'],
    queryFn: () => catalogApi.getActive(),
    staleTime: 10 * 60 * 1000,
  });
  const catalogItems: any[] = catalogData?.data?.data ?? [];

  const banners = bannersData?.data?.data || [];
  const allOffers: any[] = offersData?.data?.data || [];
  const promotions = allOffers.filter((o: any) => o.bonusRate && o.gasBonusCentsPerGallon == null);
  const gasOffers  = allOffers.filter((o: any) => o.gasBonusCentsPerGallon != null);
  const bestGasOffer: any | null = gasOffers[0] ?? null;
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

  async function placeHotFoodOrder() {
    if (!nearestStore || !selectedFoodItem || foodOrdering) return;
    setFoodOrdering(true);
    try {
      await hotFoodApi.placeOrder({
        storeId: nearestStore.id,
        items: [{ menuItemId: selectedFoodItem.id, quantity: foodQty }],
        note: foodNote.trim() || undefined,
      });
      setSelectedFoodItem(null);
      Alert.alert('Order Placed!', "Your order has been sent to the team. They'll have it ready for you shortly.");
    } catch {
      Alert.alert('Error', 'Could not place your order. Please try again.');
    } finally {
      setFoodOrdering(false);
    }
  }

  const tier = TIER_CONFIG[user?.tier || 'BRONZE'];
  const userPts   = Math.round(Number(user?.pointsBalance || 0) * 100);
  const periodPts = Math.round(Number(user?.periodPoints  || 0) * 100);
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

      {/* ── Scrollable content ── */}
      <Animated.ScrollView
        ref={scrollViewRef as any}
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 80 }}
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
            {Object.entries(TIER_CONFIG).map(([key, cfg], i) => {
              const isCurrent = (user?.tier || 'BRONZE') === key;
              const isPast = i < Object.keys(TIER_CONFIG).indexOf(user?.tier || 'BRONZE');
              return (
                <View key={key} style={styles.tierTrackItem}>
                  {i > 0 && (
                    <View style={[styles.tierConnector, { backgroundColor: isPast ? cfg.color : 'rgba(255,255,255,0.15)' }]}>
                      {isPast && (
                        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.38)', opacity: tierShine }]} />
                      )}
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setSelectedTier(key)} activeOpacity={0.7}>
                    {isCurrent ? (
                      <Animated.View style={[
                        styles.tierBubble,
                        { backgroundColor: cfg.color + '30', borderColor: cfg.color, transform: [{ scale: tierPulse }] },
                      ]}>
                        <Text style={styles.tierBubbleText}>{cfg.icon}</Text>
                      </Animated.View>
                    ) : (
                      <View style={[
                        styles.tierBubble,
                        isPast && { backgroundColor: cfg.color + '25', borderColor: cfg.color + '60' },
                        !isPast && { borderColor: 'rgba(255,255,255,0.15)', backgroundColor: 'rgba(255,255,255,0.05)' },
                      ]}>
                        <Text style={[styles.tierBubbleText, !isPast && { opacity: 0.4 }]}>{cfg.icon}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
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

      {/* ── Promo Slideshow ── */}
      <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <SectionTitle icon={<StarIcon size={17} color={COLORS.primary} strokeWidth={2} />} label="Why Lucky Stop?" />
          </View>
          <PromoSlideshow />
        </View>
      </Animated.View>

      {/* ── Redeem with Points ── */}
      {catalogItems.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <SectionTitle icon={<GiftIcon size={17} color={COLORS.primary} strokeWidth={1.75} />} label="Redeem with Points" />
            <TouchableOpacity onPress={() => router.push('/(customer)/rewards')} activeOpacity={0.7}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>See all →</Text>
            </TouchableOpacity>
          </View>
          <RewardsShelf items={catalogItems} userPts={userPts} />
        </View>
      )}

      {/* ── Gas Prices + Active Gas Offers ── */}
      <Animated.View style={{ opacity: fadeAnims[4], transform: [{ translateY: slideAnims[4] }] }}>
        {contentLoading
          ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<GasPumpIcon size={17} color={COLORS.text} />} label="Today's Gas Prices" />
              </View>
              <View style={gp.row}>
                <SkeletonGasPriceCard />
              </View>
            </View>
          )
          : gasPrices.length > 0 && (
            <View ref={gasSectionRef} style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<GasPumpIcon size={17} color={COLORS.text} />} label="Today's Gas Prices" />
                {bestGasOffer && (
                  <View style={gp.sectionOfferChip}>
                    <GasPumpIcon size={10} color="#F4A226" strokeWidth={2.5} />
                    <Text style={gp.sectionOfferChipText}>Gas offer active</Text>
                  </View>
                )}
              </View>
              {gasPrices.map((store: any) => (
                <View key={store.id} style={gp.row}>
                  {/* ─ Price card ─ */}
                  <View style={gp.priceCard}>
                    <Text style={gp.storeName} numberOfLines={1}>{store.name}</Text>
                    {!nearestStore && store.address && (
                      <Text style={gp.storeAddr} numberOfLines={1}>{store.address}, {store.city}</Text>
                    )}
                    {!nearestStore && store.phone && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${store.phone.replace(/\D/g, '')}`)}
                        activeOpacity={0.7}
                        style={{ alignSelf: 'flex-start', marginBottom: 5 }}
                      >
                        <Text style={styles.gasStorePhone}>📞 {store.phone}</Text>
                      </TouchableOpacity>
                    )}
                    <View style={gp.priceLines}>
                      {store.gasPricePerGallon != null && (
                        <View style={gp.priceLine}>
                          <GasPumpIcon size={13} color={COLORS.accent} strokeWidth={2} />
                          <Text style={gp.priceLabel}>Gas</Text>
                          <Text style={gp.priceVal}>${Number(store.gasPricePerGallon).toFixed(3)}</Text>
                          <Text style={gp.priceUnit}>/gal</Text>
                        </View>
                      )}
                      {store.dieselPricePerGallon != null && (
                        <View style={gp.priceLine}>
                          <TruckIcon size={13} color={COLORS.secondary} strokeWidth={2} />
                          <Text style={gp.priceLabel}>Diesel</Text>
                          <Text style={gp.priceVal}>${Number(store.dieselPricePerGallon).toFixed(3)}</Text>
                          <Text style={gp.priceUnit}>/gal</Text>
                        </View>
                      )}
                    </View>
                    {store.gasPriceUpdatedAt && (
                      <Text style={gp.updatedAt}>
                        Updated {new Date(store.gasPriceUpdatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                    )}
                  </View>

                  {/* ─ Gas offer tile ─ */}
                  {bestGasOffer && (
                    <TouchableOpacity style={gp.offerCard} onPress={() => setSelectedOffer(bestGasOffer)} activeOpacity={0.85}>
                      <View style={gp.offerIconWrap}>
                        <GasPumpIcon size={18} color="#fff" strokeWidth={2} />
                      </View>
                      <Text style={gp.offerBonus}>+{bestGasOffer.gasBonusCentsPerGallon}¢</Text>
                      <Text style={gp.offerUnit}>per gallon</Text>
                      <Text style={gp.offerTitle} numberOfLines={2}>{bestGasOffer.title}</Text>
                      <View style={gp.autoAppliedBadge}>
                        <Text style={gp.autoAppliedText}>Auto-applied</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
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
            <View ref={offersSectionRef} style={styles.section}>
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

      {/* ── Hot Food ── */}
      {nearestStore && hotFoodMenu.length > 0 && (
        <Animated.View style={{ opacity: fadeAnims[6], transform: [{ translateY: slideAnims[6] }] }}>
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <SectionTitle icon={<FlameIcon size={17} color="#EA580C" strokeWidth={2} />} label="Hot Food" />
              <Text style={styles.sectionSubLabel}>Order ahead at {nearestStore.name}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hotFoodRow}>
              {hotFoodMenu.map((item: any) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.hotFoodCard}
                  onPress={() => { setSelectedFoodItem(item); setFoodQty(1); setFoodNote(''); }}
                  activeOpacity={0.82}
                >
                  {item.imageUrl
                    ? <Image source={{ uri: item.imageUrl }} style={styles.hotFoodImg} />
                    : (
                      <View style={styles.hotFoodImgPlaceholder}>
                        <FlameIcon size={30} color="#EA580C" strokeWidth={1.5} />
                      </View>
                    )
                  }
                  <View style={styles.hotFoodCardBody}>
                    <Text style={styles.hotFoodItemName} numberOfLines={2}>{item.name}</Text>
                    {item.description
                      ? <Text style={styles.hotFoodItemDesc} numberOfLines={1}>{item.description}</Text>
                      : null}
                    <Text style={styles.hotFoodItemPrice}>${Number(item.price).toFixed(2)}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Animated.View>
      )}

      {/* ── Today's Deals + History ── */}
      <Animated.View style={{ opacity: fadeAnims[7], transform: [{ translateY: slideAnims[7] }] }}>
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
                    <Text style={styles.offerTitle} numberOfLines={1}>{offer.title}</Text>
                    <View style={styles.dealBadgePill}>
                      <TagIcon size={10} color="#fff" strokeWidth={2.5} />
                      <Text style={styles.dealBadgeText} numberOfLines={1}>{offer.dealText}</Text>
                    </View>
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
                        <View style={[styles.offerSlidePlaceholder, styles.dealSlidePlaceholder]}>
                          <TagIcon size={14} color={COLORS.accent} strokeWidth={2.5} />
                          <Text style={styles.dealSlidePlaceholderText} numberOfLines={1}>{offer.dealText}</Text>
                        </View>
                      )
                    }
                    <View style={styles.offerSlideContent}>
                      <Text style={styles.offerTitle} numberOfLines={1}>{offer.title}</Text>
                      <View style={[styles.dealBadgePill, { alignSelf: 'flex-start' }]}>
                        <TagIcon size={10} color="#fff" strokeWidth={2.5} />
                        <Text style={styles.dealBadgeText} numberOfLines={1}>{offer.dealText}</Text>
                      </View>
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

      {/* ── Hot Food Order Modal ── */}
      <Modal visible={!!selectedFoodItem} transparent animationType="slide" onRequestClose={() => setSelectedFoodItem(null)}>
        <View style={hf.overlay}>
          <View style={hf.sheet}>
            <View style={hf.handle} />
            {selectedFoodItem && (
              <>
                {selectedFoodItem.imageUrl
                  ? <Image source={{ uri: selectedFoodItem.imageUrl }} style={hf.itemImg} />
                  : (
                    <View style={hf.itemImgPlaceholder}>
                      <FlameIcon size={40} color="#EA580C" strokeWidth={1.5} />
                    </View>
                  )
                }
                <Text style={hf.itemName}>{selectedFoodItem.name}</Text>
                {selectedFoodItem.description
                  ? <Text style={hf.itemDesc}>{selectedFoodItem.description}</Text>
                  : null}

                <View style={hf.qtyRow}>
                  <TouchableOpacity onPress={() => setFoodQty(q => Math.max(1, q - 1))} style={hf.qtyBtn}>
                    <Text style={hf.qtyBtnText}>−</Text>
                  </TouchableOpacity>
                  <Text style={hf.qty}>{foodQty}</Text>
                  <TouchableOpacity onPress={() => setFoodQty(q => Math.min(10, q + 1))} style={hf.qtyBtn}>
                    <Text style={hf.qtyBtnText}>+</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={hf.noteInput}
                  placeholder="Special instructions (optional)"
                  placeholderTextColor={COLORS.textMuted}
                  value={foodNote}
                  onChangeText={setFoodNote}
                  multiline
                  maxLength={200}
                />

                <View style={hf.totalRow}>
                  <Text style={hf.totalLabel}>Total</Text>
                  <Text style={hf.totalValue}>${(Number(selectedFoodItem.price) * foodQty).toFixed(2)}</Text>
                </View>

                <TouchableOpacity
                  style={[hf.orderBtn, foodOrdering && { opacity: 0.6 }]}
                  onPress={placeHotFoodOrder}
                  disabled={foodOrdering}
                  activeOpacity={0.85}
                >
                  <FlameIcon size={16} color="#fff" strokeWidth={2} />
                  <Text style={hf.orderBtnText}>{foodOrdering ? 'Placing Order…' : 'Place Order'}</Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setSelectedFoodItem(null)} style={hf.cancelLink}>
                  <Text style={hf.cancelLinkText}>Cancel</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

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
        <Modal transparent animationType="fade" onRequestClose={() => { setPendingAgeGateStore(null); setShow21Gate(false); setLocationStatus('none'); }}>
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
              {selectedOffer.dealText && !selectedOffer.imageUrl ? (
                <View style={om.dealHeader}>
                  <TagIcon size={18} color="#fff" strokeWidth={2} />
                  <Text style={om.dealHeaderText} numberOfLines={1}>{selectedOffer.dealText}</Text>
                </View>
              ) : null}
              {selectedOffer.imageUrl ? (
                <Image source={{ uri: selectedOffer.imageUrl }} style={om.image} />
              ) : null}
              <ScrollView style={om.bodyScroll} contentContainerStyle={om.bodyContent} showsVerticalScrollIndicator={false}>
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
                ) : selectedOffer.dealText && selectedOffer.imageUrl ? (
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
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── Tier info modal ── */}
      {selectedTier && (() => {
        const cfg = TIER_CONFIG[selectedTier];
        const tierKeys = Object.keys(TIER_CONFIG);
        const tierIdx = tierKeys.indexOf(selectedTier);
        const userTierIdx = tierKeys.indexOf(user?.tier || 'BRONZE');
        const isCurrent = tierIdx === userTierIdx;
        const isPast = tierIdx < userTierIdx;
        const ptsAway = Math.max(0, cfg.thresholdPts - periodPts);
        return (
          <Modal transparent animationType="fade" onRequestClose={() => setSelectedTier(null)}>
            <TouchableOpacity style={ti.backdrop} activeOpacity={1} onPress={() => setSelectedTier(null)}>
              <TouchableOpacity style={ti.card} activeOpacity={1} onPress={() => {}}>
                <View style={[ti.iconWrap, { backgroundColor: cfg.color + '22' }]}>
                  <Text style={ti.icon}>{cfg.icon}</Text>
                </View>
                <Text style={[ti.tierName, { color: cfg.color }]}>{cfg.label}</Text>
                {cfg.thresholdPts > 0 && (
                  <Text style={ti.threshold}>{cfg.thresholdPts.toLocaleString()} pts earned in a period</Text>
                )}
                {isCurrent && (
                  <View style={[ti.badge, { backgroundColor: COLORS.secondary + '18' }]}>
                    <Text style={[ti.badgeText, { color: COLORS.secondary }]}>Your Current Tier</Text>
                  </View>
                )}
                {isPast && (
                  <View style={[ti.badge, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={[ti.badgeText, { color: '#2E7D32' }]}>✓ Achieved</Text>
                  </View>
                )}
                {!isCurrent && !isPast && ptsAway > 0 && (
                  <View style={[ti.badge, { backgroundColor: '#FFF3E0' }]}>
                    <Text style={[ti.badgeText, { color: '#E65100' }]}>{ptsAway.toLocaleString()} pts away</Text>
                  </View>
                )}
                <View style={ti.divider} />
                <View style={ti.benefitsWrap}>
                  {cfg.benefits.map((b, idx) => (
                    <View key={idx} style={ti.benefitRow}>
                      <View style={[ti.dot, { backgroundColor: cfg.color }]} />
                      <Text style={ti.benefitText}>{b}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity style={ti.closeBtn} onPress={() => setSelectedTier(null)}>
                  <Text style={ti.closeBtnText}>Got it</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
          </Modal>
        );
      })()}

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
                <Image source={require('../../assets/store-icon-512.png')} style={styles.qrModalLogo} />
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
  },
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
  sectionCount:    { fontSize: 12, fontWeight: '700', color: COLORS.textMuted },
  sectionSubLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '500' },

  // Hot food cards
  hotFoodRow:          { paddingHorizontal: 16, gap: 12, paddingBottom: 4 },
  hotFoodCard:         { width: 148, backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  hotFoodImg:          { width: 148, height: 96, resizeMode: 'cover' },
  hotFoodImgPlaceholder:{ width: 148, height: 96, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  hotFoodCardBody:     { padding: 10 },
  hotFoodItemName:     { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 2, lineHeight: 17 },
  hotFoodItemDesc:     { fontSize: 11, color: COLORS.textMuted, marginBottom: 5 },
  hotFoodItemPrice:    { fontSize: 14, fontWeight: '800', color: '#EA580C' },

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
  dealBadgePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.accent, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4, marginTop: 4, alignSelf: 'flex-start',
  },
  dealBadgeText: { color: '#fff', fontWeight: '800', fontSize: 12, letterSpacing: 0.2 },
  dealSlidePlaceholder: {
    backgroundColor: COLORS.accent + '12',
    justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  dealSlidePlaceholderText: {
    fontSize: 22, fontWeight: '900', color: COLORS.accent,
    letterSpacing: -0.5, paddingHorizontal: 16, textAlign: 'center',
  },

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
});

const ps = StyleSheet.create({
  root:         { gap: 10 },
  slide: {
    width: SLIDE_W, marginRight: 12, borderRadius: 22, overflow: 'hidden',
    height: 196,
    shadowColor: '#000', shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.22, shadowRadius: 14, elevation: 8,
  },
  decoCircleLg: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -70, right: -55 },
  decoCircleSm: { position: 'absolute', width: 110, height: 110, borderRadius: 55, top: 16, right: 62 },
  slideInner:   { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 20, justifyContent: 'flex-end', gap: 5 },
  iconBadge: {
    width: 46, height: 46, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  eyebrow:  { color: 'rgba(255,255,255,0.58)', fontSize: 10, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
  headline: { color: '#fff', fontSize: 20, fontWeight: '900', lineHeight: 25, letterSpacing: -0.4 },
  body:     { color: 'rgba(255,255,255,0.7)', fontSize: 12, lineHeight: 17 },
  cta:      { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 13, paddingVertical: 6, marginTop: 5 },
  ctaText:  { fontSize: 12, fontWeight: '800' },
  dots:     { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 10 },
});

const rs = StyleSheet.create({
  root:         { gap: 14 },
  section:      { gap: 0 },
  catHeader:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 8, alignSelf: 'flex-start' },
  catEmoji:     { fontSize: 13 },
  catLabel:     { fontSize: 12, fontWeight: '800' },
  tileRow:      { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 14, padding: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 5, elevation: 2,
    gap: 6,
  },
  tileIconWrap: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  tileEmoji:    { fontSize: 20 },
  tileName:     { fontSize: 12, fontWeight: '700', color: COLORS.text, lineHeight: 16 },
  ptsBadge:     { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: COLORS.border, alignSelf: 'flex-start' },
  ptsText:      { fontSize: 11, fontWeight: '800', color: '#fff' },
  shortage:     { fontSize: 10, fontWeight: '600', color: '#E63946', marginTop: -2 },
});

const gp = StyleSheet.create({
  row:               { flexDirection: 'row', gap: 10, marginBottom: 6 },
  sectionOfferChip:  { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  sectionOfferChipText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  priceCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    borderTopWidth: 3, borderTopColor: '#f97316',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 3,
  },
  storeName:   { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  storeAddr:   { fontSize: 11, color: COLORS.textMuted, marginBottom: 5 },
  priceLines:  { gap: 6, marginBottom: 2 },
  priceLine:   { flexDirection: 'row', alignItems: 'center', gap: 5 },
  priceLabel:  { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', flex: 1 },
  priceVal:    { fontSize: 20, fontWeight: '900', color: COLORS.text },
  priceUnit:   { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  updatedAt:   { fontSize: 10, color: COLORS.border, marginTop: 8, fontWeight: '600' },
  offerCard: {
    width: 128, backgroundColor: '#1D3557', borderRadius: 18, padding: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#1D3557', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
    gap: 3,
  },
  offerIconWrap:    { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  offerBonus:       { color: '#fff', fontSize: 28, fontWeight: '900', lineHeight: 32 },
  offerUnit:        { color: 'rgba(255,255,255,0.58)', fontSize: 11, fontWeight: '600' },
  offerTitle:       { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center', marginTop: 4, lineHeight: 14 },
  autoAppliedBadge: { backgroundColor: '#F4A226', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, marginTop: 6 },
  autoAppliedText:  { color: '#fff', fontSize: 10, fontWeight: '800' },
});

const ti = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.52)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    backgroundColor: '#fff', borderRadius: 24, padding: 24, width: '100%',
    alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.18, shadowRadius: 28, elevation: 24,
  },
  iconWrap: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  icon: { fontSize: 38 },
  tierName: { fontSize: 23, fontWeight: '900', letterSpacing: -0.4 },
  threshold: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  badge: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5, marginTop: 2 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  divider: { height: 1, backgroundColor: COLORS.border, width: '100%', marginVertical: 10 },
  benefitsWrap: { width: '100%', gap: 11 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  benefitText: { flex: 1, fontSize: 14, color: COLORS.text, lineHeight: 20, fontWeight: '500' },
  closeBtn: { marginTop: 10, backgroundColor: COLORS.background, borderRadius: 14, paddingVertical: 13, width: '100%', alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
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
    overflow: 'hidden', maxHeight: '88%',
  },
  image: { width: '100%', height: 190, resizeMode: 'cover' },
  dealHeader: {
    backgroundColor: COLORS.accent, flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 24, paddingVertical: 16,
  },
  dealHeaderText: { fontSize: 22, fontWeight: '900', color: '#fff', letterSpacing: -0.5, flex: 1 },
  body: { padding: 24, gap: 10 },
  bodyScroll: { flex: 1 },
  bodyContent: { padding: 24, gap: 10, paddingBottom: 20 },
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

const hf = StyleSheet.create({
  overlay:          { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet:            { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle:           { width: 36, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  itemImg:          { width: '100%', height: 160, borderRadius: 14, marginBottom: 16, resizeMode: 'cover' },
  itemImgPlaceholder:{ width: '100%', height: 120, backgroundColor: '#FFF7ED', borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  itemName:         { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  itemDesc:         { fontSize: 13, color: COLORS.textMuted, marginBottom: 16, lineHeight: 18 },
  qtyRow:           { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginVertical: 16 },
  qtyBtn:           { width: 42, height: 42, borderRadius: 21, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  qtyBtnText:       { fontSize: 24, fontWeight: '300', color: COLORS.text, lineHeight: 28 },
  qty:              { fontSize: 26, fontWeight: '800', color: COLORS.text, minWidth: 36, textAlign: 'center' },
  noteInput:        { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, padding: 12, fontSize: 14, color: COLORS.text, minHeight: 56, textAlignVertical: 'top', marginBottom: 16 },
  totalRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  totalLabel:       { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  totalValue:       { fontSize: 22, fontWeight: '900', color: COLORS.text },
  orderBtn:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#EA580C', borderRadius: 14, paddingVertical: 16, marginBottom: 12 },
  orderBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelLink:       { alignItems: 'center', paddingVertical: 8 },
  cancelLinkText:   { color: COLORS.textMuted, fontSize: 14 },
});
