import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  FlatList,
  Dimensions,
  Modal,
  Animated,
  Linking,
  Easing,
  useWindowDimensions,
  Pressable,
  BackHandler,
  Platform,
} from 'react-native';
import { Text } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import { Image } from 'expo-image';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import Toast from 'react-native-toast-message';
import QRCode from 'react-native-qrcode-svg';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { hoursText } from '../../utils/offerHours';
import { useCallback, useMemo, useRef, useState, useEffect, memo } from 'react';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { ratingsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { offerBonusText } from '../../utils/offerRate';
import { spanishOffer } from '../../utils/offerText';
import ChallengesSection from '../../components/ChallengesSection';
import { offersApi, authApi, notificationsApi, storesApi, hotFoodApi, catalogApi, promotionsApi, referralsApi, receiptScanApi } from '../../services/api';
import WelcomeBonusCard from '../../components/WelcomeBonusCard';
import NotificationsOffBanner from '../../components/NotificationsOffBanner';
import ErrorState from '../../components/ErrorState';
import PromoFlipCard from '../../components/PromoFlipCard';
import { COLORS, RECEIPT_QR_LIVE } from '../../constants';
import { useLiveTierConfig } from '../../hooks/useLiveTierConfig';
import {
  BellIcon, MapPinIcon, GlobeIcon, GasPumpIcon, TruckIcon, FlameIcon, TagIcon, ReceiptIcon, CameraIcon, ChevronRightIcon, StarIcon, PercentIcon, GiftIcon, ClockIcon,
} from '../../components/Icons';
import { SkeletonOfferCard, SkeletonBannerCard, SkeletonGasPriceCard } from '../../components/SkeletonLoader';
import DashboardWatermark from '../../components/DashboardWatermark';
import ModalToastHost from '../../components/ModalToastHost';
import { haptic } from '../../utils/haptics';
import { useFullBrightness } from '../../hooks/useFullBrightness';
import { sized } from '../../utils/imageUrl';

const MAX_NEARBY_MILES = 2;

// enabledCategories is empty on most stores, meaning "everything enabled":
// only a non-empty list actually restricts anything. Matches the same
// convention used for the category picker in scan.tsx.
function categoryEnabled(store: any, category: 'GAS' | 'DIESEL'): boolean {
  const enabled: string[] = store?.enabledCategories ?? [];
  return enabled.length === 0 || enabled.includes(category);
}

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

// One soft look for Home's cards (2026-10-12): a hairline border, and a faint shadow on iPhone only. On Android the elevation shadow drew
// grey blocks and square corners (a carousel clips it at its bottom edge; a card stretched taller than its white part shows it).
const SOFT_SHADOW = Platform.select({
  ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 },
  default: {},
}) as object;
const SOFT_BORDER = { borderWidth: 1, borderColor: '#EEF0F3' };
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
const BannerCarousel = memo(function BannerCarousel({ banners, onSelect }: { banners: any[]; onSelect: (banner: any) => void }) {
  const { t } = useTranslation();
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
    <TouchableOpacity
      style={bc.slide}
      activeOpacity={0.9}
      onPress={() => onSelect(item)}
      accessibilityRole="button"
      accessibilityLabel={item.title ? `View banner: ${item.title}` : 'View banner'}
    >
      <View style={bc.slideClip}>
        <Image source={{ uri: sized(item.imageUrl) }} style={bc.image} contentFit="cover" />
        {item.title ? (
          <View style={bc.titleBar}>
            <Text style={bc.titleText} numberOfLines={1}>{item.title}</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  ), [onSelect]);

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
        onScrollToIndexFailed={() => {}}
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

/* ─── Age-restricted offer lock overlay ───────────────────── */
// A real blur, not a flat tint - Android needs blurMethod explicitly set
// to 'dimezisBlurView' or it silently renders as a plain semi-transparent
// view (its own default). iOS always blurs natively regardless of this
// prop. The badge below stays fully opaque so it's legible over any
// image, light or dark, sitting behind the blur.
function AgeGateOverlay() {
  const { t } = useTranslation();
  return (
    <BlurView intensity={35} tint="dark" blurMethod="dimezisBlurView" style={styles.ageLockOverlay}>
      <View style={styles.ageLockBadge}>
        <Text style={styles.ageLockEmoji}>🔞</Text>
        <Text style={styles.ageLockText}>{t('customerHome.ageLockTitle')}</Text>
        <Text style={styles.ageLockSubtext}>{t('customerHome.ageLockTap')}</Text>
      </View>
    </BlurView>
  );
}

/* ─── Press-scale wrapper ─────────────────────────────────── */
// A small tactile "give" on press - scales and dims slightly on touch
// down, springs back on release - used on offer cards so tapping one
// feels responsive rather than an inert opacity flash.
function PressScale({
  onPress, style, children, accessibilityRole, accessibilityLabel,
}: {
  onPress: () => void;
  style?: any;
  children: React.ReactNode;
  accessibilityRole?: 'button';
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const pressIn = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 0.96, useNativeDriver: true, speed: 60, bounciness: 0 }),
      Animated.timing(opacity, { toValue: 0.88, duration: 100, useNativeDriver: true }),
    ]).start();
  };
  const pressOut = () => {
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 9 }),
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} accessibilityRole={accessibilityRole} accessibilityLabel={accessibilityLabel}>
      <Animated.View style={[style, { transform: [{ scale }], opacity }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* ─── Staggered entrance ───────────────────────────────────── */
// Each offer card fades and slides up on its own, a beat after the one
// before it, so the list feels like it's arriving rather than just
// appearing all at once.
function StaggeredFadeIn({ index, children }: { index: number; children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(14)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 70, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, delay: index * 70, useNativeDriver: true, speed: 14, bounciness: 6 }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

/* ─── In-tree overlay (Modal replacement) ─────────────────── */
// RN's <Modal> opens a genuinely separate native Android Window/Dialog.
// On this app's build (New Architecture / Fabric enabled), content mounted
// inside that separate window reliably fails to commit - confirmed via a
// UI hierarchy dump showing the Modal's backdrop present but zero content
// nodes underneath, on a plain, never-chained single open (not just the
// "open a second Modal right after closing one" case suspected earlier).
// Rendering the overlay in-tree instead (an absolutely-positioned sibling
// of the ScrollView, same native window as the rest of the screen) avoids
// that broken integration entirely. Must live OUTSIDE any ScrollView so
// "cover the whole screen" isn't relative to scrollable content height.
function InlineModal({
  onRequestClose, animation, overlay, children,
}: {
  onRequestClose: () => void;
  animation: 'fade' | 'slide';
  overlay: any;
  children: React.ReactNode;
}) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onRequestClose(); return true; });
    return () => sub.remove();
  }, [onRequestClose]);
  const transform = animation === 'slide'
    ? [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [60, 0] }) }]
    : [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }];
  return (
    // No `elevation` here - on this device/Fabric build it forces the
    // transform-animated child below into its own compositing layer sized
    // from a stale pre-transform measurement, rendering as a narrow column
    // instead of full width. Sibling paint order (last in the JSX tree)
    // already puts this on top without it.
    <Animated.View style={[StyleSheet.absoluteFillObject, overlay, { opacity: progress, zIndex: 60 }]}>
      {/* width:'100%' is required, not decorative - alignSelf:'stretch' silently
          collapses to content width in this same layer, same root cause as above. */}
      <Animated.View style={{ width: '100%', transform }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** "2026-H2" as the months it covers ("Jul to Dec 2026"); anything else as it is. */
function periodWords(p: string, t: (k: string, o?: any) => string): string {
  const m = /^(\d{4})-H([12])$/.exec(p);
  return m ? t(m[2] === '1' ? 'customerHome.periodH1' : 'customerHome.periodH2', { year: m[1] }) : p;
}

/* ─── Promo slideshow ──────────────────────────────────────── */
const SLIDE_W = SCREEN_W - 32;
const PLACEHOLDER_COLORS_FS = ['#FFF7ED', '#F0FDF4', '#EFF6FF', '#FEF9C3', '#FDF2F8', '#F0F9FF'];

type PromoKind = 'cashback' | 'rewards' | 'tiers' | 'network';
type PromoSlide = { id: PromoKind; bg: string; deco: string; eyebrow: string; headline: string; body: string; cta: string | null; route: string | null };

// bg is a soft tint and deco the accent (2026-10-12; they were full-colour blocks)
const PROMO_SLIDES: PromoSlide[] = [
  { id: 'cashback', bg: '#FEF2F2', deco: '#B91C1C', eyebrow: 'EARN CASH BACK',     headline: 'Every Visit Pays Off',          body: 'Get 1–5% back on every purchase - automatically added when the cashier scans your QR',  cta: 'View Earnings',  route: '/(customer)/history' },
  { id: 'rewards',  bg: '#FFF7ED', deco: '#C2410C', eyebrow: 'REDEEM POINTS',     headline: 'Free Products Await You',      body: 'Trade your points for real in-store items - no catch, no extra purchase',     cta: 'Browse Rewards', route: '/(customer)/rewards' },
  { id: 'tiers',   bg: '#F5F3FF', deco: '#6D28D9', eyebrow: 'LOYALTY TIERS',     headline: 'Rise from Bronze to Platinum', body: 'Higher tier = higher cashback rate + free refills + gas bonuses. Climb every period', cta: 'My Status',      route: '/(customer)/profile' },
  { id: 'network', bg: '#F0FDFA', deco: '#0F766E', eyebrow: '12 LOCATIONS',      headline: '1 Account. Every Location.',   body: 'Your balance and rewards follow you to any Lucky Stop - shop anywhere',       cta: null,             route: null },
];

function promoIcon(kind: PromoKind, size: number, color = '#fff') {
  switch (kind) {
    case 'cashback': return <PercentIcon size={size} color={color} strokeWidth={2} />;
    case 'rewards':  return <GiftIcon    size={size} color={color} strokeWidth={2} />;
    case 'tiers':    return <StarIcon    size={size} color={color} strokeWidth={1.75} />;
    case 'network':  return <MapPinIcon  size={size} color={color} strokeWidth={2} />;
  }
}

const PromoSlideshow = memo(function PromoSlideshow() {
  const { t } = useTranslation();
  // Slide copy comes from i18n (keyed by slide id); the English text in
  // PROMO_SLIDES stays as the fallback.
  const slides = useMemo(() => PROMO_SLIDES.map((sl) => {
    const k = `customerHome.promo${sl.id[0].toUpperCase()}${sl.id.slice(1)}`;
    return {
      ...sl,
      eyebrow: t(`${k}Eyebrow`, { defaultValue: sl.eyebrow }),
      headline: t(`${k}Headline`, { defaultValue: sl.headline }),
      body: t(`${k}Body`, { defaultValue: sl.body }),
      cta: sl.cta ? t(`${k}Cta`, { defaultValue: sl.cta }) : null,
    };
  }), [t]);
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
      style={ps.slide}
      activeOpacity={item.route ? 0.88 : 1}
      onPress={() => { if (item.route) router.push(item.route as any); }}
      accessibilityRole={item.route ? 'button' : undefined}
      accessibilityLabel={item.route ? `${item.headline}${item.cta ? `: ${item.cta}` : ''}` : undefined}
    >
      <View style={[ps.slideClip, { backgroundColor: item.bg, borderWidth: 1, borderColor: item.deco + '1F' }]}>
        <View style={[ps.decoCircleLg, { backgroundColor: item.deco + '0F' }]} />
        <View style={[ps.decoCircleSm, { backgroundColor: item.deco + '0A' }]} />
        <View style={ps.slideInner}>
          <View style={[ps.iconBadge, { backgroundColor: item.deco + '14' }]}>{promoIcon(item.id, 22, item.deco)}</View>
          <Text style={[ps.eyebrow, { color: item.deco }]}>{item.eyebrow}</Text>
          <Text style={[ps.headline, { color: COLORS.text }]}>{item.headline}</Text>
          <Text style={[ps.body, { color: COLORS.textMuted }]} numberOfLines={2}>{item.body}</Text>
          {item.cta && (
            <View style={[ps.cta, { backgroundColor: item.deco }]}>
              <Text style={[ps.ctaText, { color: '#fff' }]}>{item.cta} →</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  ), []);

  return (
    <View style={ps.root}>
      <FlatList
        ref={flatRef}
        data={slides}
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
        onScrollToIndexFailed={() => {}}
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

/* ─── Deals slideshow ──────────────────────────────────────── */
// Soft tints with a strong accent for the price (2026-10-12; they were full red, orange, purple, teal and pink blocks)
const DEAL_SLIDE_PALETTE = [
  { bg: '#FEF2F2', accent: '#B91C1C' },
  { bg: '#FFF7ED', accent: '#C2410C' },
  { bg: '#F5F3FF', accent: '#6D28D9' },
  { bg: '#ECFEFF', accent: '#0E7490' },
  { bg: '#FDF2F8', accent: '#BE185D' },
];
const MAX_DOTS = 8;   // more slides than this: "3 / 30" instead of a row of dots

const DealSlideshow = memo(function DealSlideshow({ deals, onSelectOffer }: { deals: any[]; onSelectOffer: (offer: any) => void }) {
  const { t } = useTranslation();
  const [activeIndex, setActiveIndex] = useState(0);
  const flatRef = useRef<FlatList>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (deals.length <= 1) return;
    timerRef.current = setInterval(() => {
      setActiveIndex(prev => {
        const next = (prev + 1) % deals.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        return next;
      });
    }, 4000);
  }, [deals.length]);

  useEffect(() => {
    startTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [startTimer]);

  const renderSlide = useCallback(({ item, index }: { item: any; index: number }) => {
    const palette = DEAL_SLIDE_PALETTE[index % DEAL_SLIDE_PALETTE.length];
    return (
      <TouchableOpacity
        style={ds.slide}
        activeOpacity={0.9}
        onPress={() => onSelectOffer(item)}
        accessibilityRole="button"
        accessibilityLabel={t('customerHome.viewDealA11y', { title: item.title, deal: item.dealText })}
      >
        <View style={[ds.slideClip, !item.imageUrl && { backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.accent + '1F' }]}>
          {item.imageUrl ? (
            <>
              <Image source={{ uri: sized(item.imageUrl) }} style={ds.slideImage} contentFit="cover" />
              <View style={ds.imageScrim} />
            </>
          ) : (
            <>
              <View style={[ds.decoCircleLg, { backgroundColor: palette.accent + '0F' }]} />
              <View style={[ds.decoCircleSm, { backgroundColor: palette.accent + '0A' }]} />
            </>
          )}
          <View style={ds.slideInner}>
            <View style={[ds.iconBadge, !item.imageUrl && { backgroundColor: palette.accent + '14' }]}>
              <TagIcon size={16} color={item.imageUrl ? '#fff' : palette.accent} strokeWidth={2.5} />
            </View>
            <Text style={[ds.dealTextBig, !item.imageUrl && { color: palette.accent }]} numberOfLines={1}>{item.dealText}</Text>
            <Text style={[ds.title, !item.imageUrl && { color: COLORS.text }]} numberOfLines={1}>{item.title}</Text>
            {item.regularPrice ? <Text style={[ds.body, !item.imageUrl && { color: COLORS.textMuted }]} numberOfLines={1}>{t('customerHome.regularPrice', { price: priceText(item.regularPrice) })}</Text> : null}
            {item.description && item.description !== item.dealText && (
              <Text style={[ds.body, !item.imageUrl && { color: COLORS.textMuted }]} numberOfLines={1}>{item.description}</Text>
            )}
          </View>
        </View>
      </TouchableOpacity>
    );
  }, [onSelectOffer, t]);

  return (
    <View style={ds.root}>
      <FlatList
        ref={flatRef}
        data={deals}
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
        onScrollToIndexFailed={() => {}}
        renderItem={renderSlide}
      />
      {deals.length > MAX_DOTS ? (
        <View style={ds.dots}>
          <Text style={ds.counter} accessibilityLabel={t('customerHome.dealOfA11y', { n: activeIndex + 1, total: deals.length })}>{activeIndex + 1} / {deals.length}</Text>
        </View>
      ) : deals.length > 1 && (
        <View style={ds.dots}>
          {deals.map((_, i) => (
            <AnimatedDot key={i} active={i === activeIndex} color={COLORS.accent} />
          ))}
        </View>
      )}
    </View>
  );
});

/* ─── Rewards shelf ────────────────────────────────────────── */
const CAT_DISPLAY: Record<string, { label: string; emoji: string; color: string }> = {
  IN_STORE:  { label: 'In-Store',  emoji: '🛒', color: '#2A9D8F' },
  GAS:       { label: 'Gas',       emoji: '⛽', color: '#F4A226' },
  HOT_FOODS: { label: 'Hot Foods', emoji: '🌮', color: '#E63946' },
};
const CAT_LABEL_KEYS: Record<string, string> = {
  IN_STORE: 'customerRewards.categoryInStore',
  GAS: 'customerRewards.categoryGas',
  HOT_FOODS: 'customerRewards.categoryHotFoods',
};
const CAT_FALLBACK_COLORS = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#6366F1'];

/** "Scan a receipt" (2026-10-11, in testing): only for the customers HQ allows; everyone else never sees it. */
const ReceiptPhotoCard = memo(function ReceiptPhotoCard() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['receipt-scan-access'], queryFn: () => receiptScanApi.access(), staleTime: 10 * 60 * 1000 });
  if (q.data?.data?.data?.enabled !== true) return null;
  return (
    <TouchableOpacity style={inv.card} activeOpacity={0.85} accessibilityRole="button" onPress={() => { haptic.tap(); router.push('/(customer)/receipt-photo'); }}>
      <View style={[inv.icon, { backgroundColor: COLORS.secondary }]}><ReceiptIcon size={22} color={COLORS.white} /></View>
      <View style={{ flex: 1 }}>
        <Text style={inv.title}>{t('receiptPhoto.cardTitle')}</Text>
        <Text style={inv.body}>{t('receiptPhoto.cardBody')}</Text>
      </View>
      <ChevronRightIcon size={20} color={COLORS.secondary} />
    </TouchableOpacity>
  );
});

/** "Invite friends, get $5": opens Invite friends. Hidden while invites are switched off or before the deal has loaded. */
const InviteCard = memo(function InviteCard() {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['my-referrals'], queryFn: () => referralsApi.me(), staleTime: 10 * 60 * 1000 });
  const s = q.data?.data?.data?.settings;
  if (!s?.enabled) return null;
  const amt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  return (
    <TouchableOpacity style={inv.card} activeOpacity={0.85} accessibilityRole="button" onPress={() => { haptic.tap(); router.push('/(customer)/invite-friends'); }}>
      <View style={inv.icon}><GiftIcon size={22} color={COLORS.white} /></View>
      <View style={{ flex: 1 }}>
        <Text style={inv.title}>{t('invite.cardTitle', { amount: amt(s.referrerReward) })}</Text>
        <Text style={inv.body}>{t('invite.cardBody', { amount: amt(s.friendReward) })}</Text>
      </View>
      <ChevronRightIcon size={20} color={COLORS.secondary} />
    </TouchableOpacity>
  );
});
const inv = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 4, marginBottom: 14, padding: 14, borderRadius: 16, backgroundColor: '#EEF2F7', borderWidth: 1, borderColor: '#D3DCEA' },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.secondary },
  body: { fontSize: 13, color: COLORS.textMuted, marginTop: 1 },
});

const RewardsShelf = memo(function RewardsShelf({ items, userPts }: { items: any[]; userPts: number }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  // One scrolling row: what the customer can redeem now first (cheapest first), then the closest ones to reach
  const sorted = [...items].sort((a: any, b: any) => {
    const ra = userPts >= a.pointsCost ? 0 : 1, rb = userPts >= b.pointsCost ? 0 : 1;
    return ra - rb || a.pointsCost - b.pointsCost;
  }).slice(0, 10);
  const colorOf = (key: string, idx: number) => (CAT_DISPLAY[key]?.color ?? CAT_FALLBACK_COLORS[idx % CAT_FALLBACK_COLORS.length]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rs.row} decelerationRate="fast" snapToInterval={146} snapToAlignment="start">
      {sorted.map((item: any, idx: number) => {
        const color = colorOf(item.category, idx);
        const canAfford = userPts >= item.pointsCost;
        const progress = Math.max(0.04, Math.min(1, userPts / Math.max(1, item.pointsCost)));
        return (
          <TouchableOpacity
            key={item.id}
            style={rs.card}
            onPress={() => { haptic.tap(); router.push({ pathname: '/(customer)/rewards', params: { redeem: item.id } }); }}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('customerHome.rewardTileA11y', { title: item.title, points: item.pointsCost.toLocaleString() })}
          >
            <View style={[rs.iconWrap, { backgroundColor: color + '1A' }]}>
              <Text style={rs.emoji}>{item.emoji || '🎁'}</Text>
            </View>
            <Text style={rs.name} numberOfLines={2}>{item.title}</Text>
            <Text style={[rs.pts, { color: canAfford ? color : COLORS.text }]}>{t('customerHome.ptsSuffix', { pts: item.pointsCost.toLocaleString() })}</Text>
            <View style={rs.track}><View style={[rs.fill, { width: `${progress * 100}%`, backgroundColor: canAfford ? color : '#C9CED6' }]} /></View>
            <Text style={[rs.status, canAfford && { color, fontWeight: '800' }]} numberOfLines={1}>
              {canAfford ? t('customerHome.shelfReady') : t('customerHome.shelfToGo', { pts: (item.pointsCost - userPts).toLocaleString() })}
            </Text>
          </TouchableOpacity>
        );
      })}
      <TouchableOpacity
        style={[rs.card, rs.seeAll]}
        onPress={() => router.push('/(customer)/rewards')}
        activeOpacity={0.85}
        accessibilityRole="link"
        accessibilityLabel={t('customerHome.seeAllRewardsA11y')}
      >
        <View style={rs.seeAllCircle}><ChevronRightIcon size={22} color="#fff" strokeWidth={2.5} /></View>
        <Text style={rs.seeAllText}>{t('customerHome.shelfSeeAll')}</Text>
        <Text style={rs.status}>{t('customerHome.shelfSeeAllSub', { count: items.length })}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
});

/* ─── Main screen ─────────────────────────────────────────── */
export default function CustomerHome() {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === 'es' ? 'es-US' : 'en-US';
  const qc = useQueryClient();
  const { user, token, setAuth } = useAuthStore();
  const { tierConfig: TIER_CONFIG } = useLiveTierConfig();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const sheetMaxHeight = windowHeight - insets.top - 24;
  const modalImageHeight = Math.min(190, windowHeight * 0.24);

  // Staggered entrance — 7 sections fade + slide up on mount
  const fadeAnims = useRef([...Array(9)].map(() => new Animated.Value(0))).current;
  const slideAnims = useRef([...Array(9)].map(() => new Animated.Value(18))).current;
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
  useFullBrightness(showQR);   // full brightness for the scanner while My QR is open, the phone's own brightness back after (hooks/useFullBrightness.ts)

  // Scroll-to-section support (triggered from notification taps)
  const scrollViewRef = useRef<ScrollView>(null);
  const gasSectionRef = useRef<View>(null);
  const offersSectionRef = useRef<View>(null);
  const challengesSectionRef = useRef<View>(null);
  const { scrollTo, lastDay } = useLocalSearchParams<{ scrollTo?: string; lastDay?: string }>();

  useFocusEffect(useCallback(() => {
    if (!scrollTo) return;
    const sectionRef = scrollTo === 'gas' ? gasSectionRef : scrollTo === 'offers' ? offersSectionRef : scrollTo === 'challenges' ? challengesSectionRef : null;
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
            age21Confirmed: data.data.age21Confirmed,
            age21Declined: data.data.age21Declined,
            birthMonth: data.data.birthMonth ?? null,   // the birthday they gave (Profile), for birthday-month promotions
            birthDay: data.data.birthDay ?? null,
          }, data.data.token ?? t);   // a renewed session when the server sent one (GET /auth/me)
        }
      }).catch((err: any) => {
        // Account no longer exists or was deactivated server-side — a locally
        // cached session shouldn't keep showing the app as usable.
        // (A refused session, 401, is signed out by the API layer for every screen.)
        if (err.response?.status === 404) useAuthStore.getState().endSession();
      });
    }, [t])
  );

  const { data: notifData } = useQuery({
    queryKey: ['unread-count'],
    queryFn: () => notificationsApi.getUnreadCount(),
    refetchInterval: 30000,
  });
  const unreadCount: number = notifData?.data?.data?.count ?? 0;

  const { data: gasPricesData, refetch: refetchGasPrices } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
  const allStores: any[] = gasPricesData?.data?.data ?? [];

  const [nearestStore, setNearestStore] = useState<{ id: string; name: string } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'found' | 'none'>('detecting');
  const [pendingAgeGateStore, setPendingAgeGateStore] = useState<{ id: string; name: string } | null>(null);
  const [show21Gate, setShow21Gate] = useState(false);
  const [confirming21, setConfirming21] = useState(false);
  const { setAge21Confirmed, setAge21Declined } = useAuthStore();

  const storesWithPrices = allStores.filter(
    (s: any) =>
      (categoryEnabled(s, 'GAS') && s.gasPricePerGallon != null) ||
      (categoryEnabled(s, 'DIESEL') && s.dieselPricePerGallon != null)
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
    data: offersData, isLoading: offersLoading, isError: offersIsError, isRefetching: offersRefetching, refetch: refetchOffers,
  } = useQuery({
    queryKey: ['offers', nearestStore?.id],
    queryFn: () => offersApi.getActive(nearestStore?.id),
    enabled: locationReady,
    // In Spanish, an offer's Spanish words where HQ wrote them (the English where it did not)
    select: (res: any) => (i18n.language === 'es' ? { ...res, data: { ...res.data, data: (res.data?.data ?? []).map(spanishOffer) } } : res),
  });

  const { data: hotFoodData, refetch: refetchHotFoodMenu } = useQuery({
    queryKey: ['hot-food-customer-menu', nearestStore?.id],
    queryFn: () => hotFoodApi.getCustomerMenu(nearestStore!.id),
    enabled: !!nearestStore,
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,   // open / closed follows the clock while Home is open
  });
  const hotFoodMenu: any[] = hotFoodData?.data?.data ?? [];
  // Outside the store's hot food hours the section is not shown (the menu still comes back, so ordering would only fail);
  // an older server sends no hours: shown as before
  const hotFoodOpen = hotFoodData?.data?.hours?.open !== false;
  // The store's hot food combos (2026-10-12): when it has some, Home shows them instead of the items, with "See all hot food"
  const hotFoodCombos: any[] = Array.isArray(hotFoodData?.data?.combos) ? hotFoodData.data.combos : [];
  const hotFoodEs = i18n.language?.startsWith('es');

  const { data: catalogData, refetch: refetchCatalog } = useQuery({
    queryKey: ['catalog-active'],
    queryFn: () => catalogApi.getActive(),
    staleTime: 10 * 60 * 1000,
  });
  const catalogItems: any[] = catalogData?.data?.data ?? [];

  // Same query key as the Ads tab (published-promotions) so the two share
  // one cached fetch — Home just features the single most recent one.
  const { data: promoData } = useQuery({
    queryKey: ['published-promotions'],
    queryFn: () => promotionsApi.getPublished(),
    staleTime: 5 * 60 * 1000,
  });
  const featuredAd = promoData?.data?.data?.[0] ?? null;

  const banners = bannersData?.data?.data || [];
  const allOffersRaw: any[] = offersData?.data?.data || [];
  // A customer who explicitly declined stays declined until they opt back
  // in from Profile - restricted offers are left out entirely rather than
  // shown blurred again. The backend already excludes these when declined,
  // this is just belt-and-suspenders for the current session's cache.
  const allOffers = allOffersRaw.filter((o: any) => !(o.requires21 && user?.age21Declined && !user?.age21Confirmed));
  const isOfferLocked = (offer: any) => offer.requires21 && !user?.age21Confirmed;
  // Every cashback promotion is listed here, gas ones included (they are also the banner by the gas prices): a gas promotion
  // posted in admin was otherwise only visible down in the gas section, and looked missing
  const promotions = allOffers.filter((o: any) => !o.dealText && (o.bonusRate || o.gasBonusCentsPerGallon != null || (o.tierBonusRates && Object.keys(o.tierBonusRates).length > 0)));
  const gasOffers  = allOffers.filter((o: any) => o.gasBonusCentsPerGallon != null);
  // A chain-wide gas promotion is shown once above the stores; one for a single store is a tag inside that store's card
  // (it used to sit beside every store, squeezing the prices, even at stores it does not pay at)
  const byCents = (a: any, b: any) => (b.gasBonusCentsPerGallon ?? 0) - (a.gasBonusCentsPerGallon ?? 0);
  const chainGasOffer: any | null = [...gasOffers].filter((o: any) => !o.storeId).sort(byCents)[0] ?? null;
  const storeGasOffer = (storeId: string): any | null => [...gasOffers].filter((o: any) => o.storeId === storeId).sort(byCents)[0] ?? null;
  const deals = allOffers.filter((o: any) => o.dealText);
  const isRefreshing = bannersRefetching || offersRefetching;
  const contentLoading = !locationReady || offersLoading;
  const [selectedOffer, setSelectedOffer] = useState<any>(null);
  const [selectedBanner, setSelectedBanner] = useState<any>(null);
  const [ageGateOffer, setAgeGateOffer] = useState<any>(null);
  const [confirmingOfferAge, setConfirmingOfferAge] = useState(false);
  const [decliningOfferAge, setDecliningOfferAge] = useState(false);

  function onOfferPress(offer: any) {
    if (isOfferLocked(offer)) { setAgeGateOffer(offer); return; }
    setSelectedOffer(offer);
  }
  // The "Last day!" push opens its promotion once the offers are in (if it is still running here)
  useEffect(() => {
    if (!lastDay || contentLoading || !offersData) return;
    const offer = allOffers.find((o: any) => o.id === lastDay);
    if (offer) onOfferPress(offer);
    router.setParams({ lastDay: '' });
  }, [lastDay, contentLoading, offersData]);
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
    refetchGasPrices();
    refetchHotFoodMenu();
    refetchCatalog();
    qc.invalidateQueries({ queryKey: ['welcome-bonus'] });
    qc.invalidateQueries({ queryKey: ['my-challenges'] });
  }

  const tier = TIER_CONFIG[user?.tier || 'BRONZE'];
  const userPts   = Math.round(Number(user?.pointsBalance || 0) * 100);
  const periodPts = Math.round(Number(user?.periodPoints  || 0) * 100);
  const tierProgress = tier.nextThresholdPts != null
    ? Math.min(1, Math.max(0, (periodPts - tier.thresholdPts) / (tier.nextThresholdPts - tier.thresholdPts)))
    : 1;

  return (
    <View style={styles.container}>
      <DashboardWatermark color={COLORS.primary} />
      <StatusBar barStyle="light-content" />

      {/* ── Fixed header ── */}
      <Animated.View style={{ opacity: fadeAnims[0], transform: [{ translateY: slideAnims[0] }] }}>
        <SafeAreaView style={styles.headerBg}>
          <View style={styles.header}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.greeting} numberOfLines={1}>{user?.name ? t('customerHome.greeting', { name: user.name }) : t('customerHome.greetingNoName')}</Text>
              <Text style={styles.storeName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t('customerHome.headerTitle')}</Text>
              {locationStatus !== 'detecting' && (
                <View style={[styles.nearbyPill, locationStatus === 'found' && styles.nearbyPillFound]}>
                  <View style={[styles.nearbyDot, locationStatus === 'found' && styles.nearbyDotFound]} />
                  {locationStatus === 'found'
                    ? <MapPinIcon size={11} color="#fff" strokeWidth={2.5} />
                    : <GlobeIcon size={11} color="rgba(255,255,255,0.7)" strokeWidth={2.5} />
                  }
                  <Text style={styles.nearbyPillText} numberOfLines={1}>
                    {locationStatus === 'found' ? (nearestStore?.name ?? pendingAgeGateStore?.name ?? t('customerHome.allStores')) : t('customerHome.allStores')}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                onPress={() => router.push('/(customer)/notifications')}
                style={styles.bellBtn}
                accessibilityRole="button"
                accessibilityLabel={unreadCount > 0 ? t('customerHome.notificationsUnreadA11y', { count: unreadCount }) : t('customerHome.notificationsA11y')}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                <BellIcon size={20} color="#fff" strokeWidth={2} />
                {unreadCount > 0 && (
                  <View style={styles.bellBadge}>
                    <Text style={styles.bellBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => router.push('/(customer)/profile')}
                style={styles.profileBtn}
                accessibilityRole="button"
                accessibilityLabel={t('customerHome.viewProfileA11y')}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {user?.avatarUrl ? (
                  <Image source={{ uri: user.avatarUrl }} style={styles.profileBtnAvatar} cachePolicy="none" />
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
              <Text style={styles.tierBadgeText}>{t('customerHome.tierMember', { tier: tier?.label ?? 'Bronze' })}</Text>
            </View>
            {user?.tierPeriod && <Text style={styles.tierPeriod}>{periodWords(user.tierPeriod, t)}</Text>}
          </View>
          <Text style={styles.balanceLabel}>{t('customerHome.pointsBalance')}</Text>
          <Text style={styles.balanceAmount}>{Math.round(Number(user?.pointsBalance || 0) * 100).toLocaleString()}</Text>
          <Text style={styles.balanceSubtext}>{t('customerHome.redeemablePoints')}</Text>
          <TouchableOpacity
            style={styles.redeemButton}
            onPress={() => router.push('/(customer)/rewards')}
            accessibilityRole="button"
            accessibilityLabel={t('customerHome.redeemRewardsA11y')}
          >
            <Text style={styles.redeemButtonText}>{t('customerHome.redeemRewards')}</Text>
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
                  <TouchableOpacity
                    onPress={() => setSelectedTier(key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={t('customerHome.viewTierDetailsA11y', { tier: cfg.label })}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
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
                {t('customerHome.ptsToTier', { pts: (tier.nextThresholdPts! - periodPts).toLocaleString(), tier: tier.nextLabel })}
              </Text>
            </View>
          ) : (
            <Text style={styles.tierProgressMaxText}>{t('customerHome.maxTierReached')}</Text>
          )}

          <TouchableOpacity
            style={styles.qrFab}
            onPress={() => setShowQR(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('customerHome.showQrA11y')}
          >
            <View style={styles.qrFabInner}>
              <Text style={styles.qrFabIcon}>▦</Text>
              <Text style={styles.qrFabLabel}>{t('customerHome.myQr')}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </Animated.View>

      <Animated.View style={{ opacity: fadeAnims[2], transform: [{ translateY: slideAnims[2] }] }}>
        <NotificationsOffBanner dismissible />
        <WelcomeBonusCard />
      </Animated.View>

      {/* Order (2026-10-12): hot food, today's deals, promotions, gas, HQ banners, rewards, challenges, invite, local businesses */}
      {/* ── Hot Food: the store's combo deals, or its items; a tap opens the Hot Food screen (pickup store, hours, points) ── */}
      {nearestStore && hotFoodOpen && hotFoodMenu.length > 0 && (
        <Animated.View style={{ opacity: fadeAnims[6], transform: [{ translateY: slideAnims[6] }] }}>
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <SectionTitle icon={<FlameIcon size={17} color="#EA580C" strokeWidth={2} />} label={hotFoodCombos.length > 0 ? t('customerHome.hotFoodDeals') : t('customerHome.hotFood')} />
              <Text style={styles.sectionSubLabel}>{t('customerHome.orderAheadAt', { store: nearestStore.name })}</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hotFoodRow}>
              {(hotFoodCombos.length > 0 ? hotFoodCombos : hotFoodMenu).map((item: any) => {
                const isCombo = hotFoodCombos.length > 0;
                const name = isCombo && hotFoodEs && item.nameEs ? item.nameEs : item.name;
                const img = isCombo ? item.item?.imageUrl : item.imageUrl;
                const save = isCombo && item.regularPrice != null && item.regularPrice > item.price ? item.regularPrice - item.price : null;
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.hotFoodCard}
                    onPress={() => { haptic.tap(); router.push({ pathname: '/(customer)/hot-food', params: isCombo ? { combo: item.id } : { add: item.id } }); }}
                    activeOpacity={0.82}
                    accessibilityRole="button"
                    accessibilityLabel={isCombo
                      ? t('customerHome.comboA11y', { name, price: `$${Number(item.price).toFixed(2)}` })
                      : t('customerHome.orderItemA11y', { name, price: `$${Number(item.price).toFixed(2)}` })}
                  >
                    <View style={styles.hotFoodClip}>
                      {img
                        ? <Image source={{ uri: sized(img, 200) }} style={styles.hotFoodImg} contentFit="cover" />
                        : (
                          <View style={styles.hotFoodImgPlaceholder}>
                            <FlameIcon size={30} color="#EA580C" strokeWidth={1.5} />
                          </View>
                        )
                      }
                      {isCombo && item.isFeatured ? <View style={styles.hotFoodTag}><Text style={styles.hotFoodTagText}>{t('customerHome.comboTag')}</Text></View> : null}
                      <View style={styles.hotFoodCardBody}>
                        <Text style={styles.hotFoodItemName} numberOfLines={2}>{name}</Text>
                        {isCombo
                          ? <Text style={styles.hotFoodItemDesc} numberOfLines={1}>{t('customerHome.comboWithDrink')}</Text>
                          : item.description ? <Text style={styles.hotFoodItemDesc} numberOfLines={1}>{item.description}</Text> : null}
                        <View style={styles.hotFoodPriceRow}>
                          <Text style={styles.hotFoodItemPrice}>${Number(item.price).toFixed(2)}</Text>
                          {save != null ? <Text style={styles.hotFoodSave}>{t('customerHome.comboSave', { amount: `$${save.toFixed(2)}` })}</Text> : null}
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.hotFoodCard, styles.hotFoodMore]}
                onPress={() => { haptic.tap(); router.push('/(customer)/hot-food'); }}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={t('customerHome.seeAllHotFood')}
              >
                <FlameIcon size={26} color="#EA580C" strokeWidth={1.75} />
                <Text style={styles.hotFoodMoreText}>{t('customerHome.seeAllHotFood')}</Text>
                <ChevronRightIcon size={18} color={COLORS.secondary} />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Animated.View>
      )}

      {/* ── Today's Deals + History ── */}
      <Animated.View style={{ opacity: fadeAnims[7], transform: [{ translateY: slideAnims[7] }] }}>
        {!contentLoading && deals.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <SectionTitle icon={<TagIcon size={17} color={COLORS.accent} />} label={t('customerHome.todaysDeals')} />
              {deals.length > 1 && (
                <Text style={styles.sectionCount}>{t('customerHome.dealsCount', { count: deals.length })}</Text>
              )}
            </View>
            <DealSlideshow deals={deals} onSelectOffer={setSelectedOffer} />
          </View>
        )}

      </Animated.View>

      {/* ── Active Promotions ── */}
      <Animated.View style={{ opacity: fadeAnims[5], transform: [{ translateY: slideAnims[5] }] }}>
        {contentLoading
          ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<FlameIcon size={17} color={COLORS.primary} />} label={t('customerHome.activePromotions')} />
              </View>
              <SkeletonOfferCard />
              <SkeletonOfferCard />
            </View>
          )
          : offersIsError
          ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<FlameIcon size={17} color={COLORS.primary} />} label={t('customerHome.activePromotions')} />
              </View>
              <ErrorState message={t('customerHome.loadPromotionsFailed')} onRetry={() => refetchOffers()} />
            </View>
          )
          : promotions.length > 0 && (
            <View ref={offersSectionRef} style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<FlameIcon size={17} color={COLORS.primary} />} label={t('customerHome.activePromotions')} />
                {promotions.length > 2 && (
                  <Text style={styles.sectionCount}>{t('customerHome.offersCount', { count: promotions.length })}</Text>
                )}
              </View>
              {promotions.length <= 2 ? (
                promotions.map((offer: any, idx: number) => (
                  <StaggeredFadeIn key={offer.id} index={idx}>
                  <PressScale
                    style={styles.offerCard}
                    onPress={() => onOfferPress(offer)}
                    accessibilityRole="button"
                    accessibilityLabel={isOfferLocked(offer) ? t('customerHome.ageRestrictedOfferA11y', { title: offer.title }) : t('customerHome.viewPromotionA11y', { title: offer.title })}
                  >
                    <View style={styles.offerCardClip}>
                      {isOfferLocked(offer) && <AgeGateOverlay />}
                      {offer.imageUrl
                        ? <Image source={{ uri: sized(offer.imageUrl) }} style={styles.offerImage} contentFit="cover" />
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
                              {offer.store ? `${offer.store.name}` : t('customerHome.allLuckyStopStores')}
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
                              ? t('customerHome.bonusPerGal', { cents: offer.gasBonusCentsPerGallon })
                              : offerBonusText(offer, t, 'cashbackPill')}
                          </Text>
                        </View>
                        <OfferHoursLine offer={offer} />
                      </View>
                      <ChevronRightIcon size={20} color={COLORS.border} strokeWidth={2.5} />
                    </View>
                  </PressScale>
                  </StaggeredFadeIn>
                ))
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sliderRow}>
                  {promotions.map((offer: any, idx: number) => (
                    <StaggeredFadeIn key={offer.id} index={idx}>
                    <PressScale
                      style={styles.offerSlideCard}
                      onPress={() => onOfferPress(offer)}
                      accessibilityRole="button"
                      accessibilityLabel={isOfferLocked(offer) ? t('customerHome.ageRestrictedOfferA11y', { title: offer.title }) : t('customerHome.viewPromotionA11y', { title: offer.title })}
                    >
                      <View style={styles.offerSlideClip}>
                        {isOfferLocked(offer) && <AgeGateOverlay />}
                        {offer.imageUrl
                          ? <Image source={{ uri: sized(offer.imageUrl) }} style={styles.offerSlideImage} contentFit="cover" />
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
                                {offer.store ? offer.store.name : t('customerHome.allStores')}
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
                                : offerBonusText(offer, t)}
                            </Text>
                          </View>
                          <OfferHoursLine offer={offer} compact />
                        </View>
                      </View>
                    </PressScale>
                    </StaggeredFadeIn>
                  ))}
                </ScrollView>
              )}
            </View>
          )
        }
      </Animated.View>

      {/* ── Gas Prices + Active Gas Offers ── */}
      <Animated.View style={{ opacity: fadeAnims[4], transform: [{ translateY: slideAnims[4] }] }}>
        {contentLoading
          ? (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<GasPumpIcon size={17} color={COLORS.text} />} label={t('customerHome.todaysGasPrices')} />
              </View>
              <View style={gp.row}>
                <SkeletonGasPriceCard />
              </View>
            </View>
          )
          : gasPrices.length > 0 && (
            <View ref={gasSectionRef} style={styles.section}>
              <View style={styles.sectionRow}>
                <SectionTitle icon={<GasPumpIcon size={17} color={COLORS.text} />} label={t('customerHome.todaysGasPrices')} />
              </View>
              {chainGasOffer && (
                <PressScale
                  style={gp.promoBanner}
                  onPress={() => onOfferPress(chainGasOffer)}
                  accessibilityRole="button"
                  accessibilityLabel={t('customerHome.viewGasOfferA11y', { title: chainGasOffer.title })}
                >
                  <View style={gp.promoIcon}><GasPumpIcon size={18} color="#fff" strokeWidth={2} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={gp.promoTitle} numberOfLines={2}>{chainGasOffer.title}</Text>
                    <Text style={gp.promoSub} numberOfLines={2}>{t('customerHome.gasPromoAllStores')}</Text>
                  </View>
                  <View style={gp.promoAmount}>
                    <Text style={gp.promoBonus}>+{chainGasOffer.gasBonusCentsPerGallon}¢</Text>
                    <Text style={gp.promoUnit}>{t('customerHome.perGallon')}</Text>
                  </View>
                </PressScale>
              )}
              {gasPrices.some((store: any) => store.todayHours) && (
                <Text style={gp.hoursDisclaimer}>{t('customerHome.hoursDisclaimer')}</Text>
              )}
              {gasPrices.map((store: any) => {
                const hereOffer = storeGasOffer(store.id);
                return (
                <View key={store.id} style={gp.row}>
                  <View style={gp.priceCard}>
                    <Text style={gp.storeName} numberOfLines={1}>{store.name}</Text>
                    {!nearestStore && store.address && (
                      <Text style={gp.storeAddr} numberOfLines={1}>{store.address}, {store.city}</Text>
                    )}
                    {store.todayHours && (
                      <Text style={gp.storeHours} numberOfLines={1}>🕐 {store.todayHours}</Text>
                    )}
                    {!nearestStore && store.phone && (
                      <TouchableOpacity
                        onPress={() => Linking.openURL(`tel:${store.phone.replace(/\D/g, '')}`)}
                        activeOpacity={0.7}
                        style={{ alignSelf: 'flex-start', marginBottom: 5 }}
                        accessibilityRole="link"
                        accessibilityLabel={t('customerHome.callStoreA11y', { name: store.name, phone: store.phone })}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.gasStorePhone}>📞 {store.phone}</Text>
                      </TouchableOpacity>
                    )}
                    {/* Gas and diesel side by side, so each price has room */}
                    <View style={gp.priceLines}>
                      {store.gasPricePerGallon != null && categoryEnabled(store, 'GAS') && (
                        <View style={gp.priceTile}>
                          <View style={gp.priceTileHead}>
                            <GasPumpIcon size={13} color={COLORS.accent} strokeWidth={2} />
                            <Text style={gp.priceLabel}>{t('customerHome.gas')}</Text>
                          </View>
                          <Text style={gp.priceVal} adjustsFontSizeToFit numberOfLines={1}>
                            ${Number(store.gasPricePerGallon).toFixed(3)}<Text style={gp.priceUnit}> /gal</Text>
                          </Text>
                        </View>
                      )}
                      {store.dieselPricePerGallon != null && categoryEnabled(store, 'DIESEL') && (
                        <View style={gp.priceTile}>
                          <View style={gp.priceTileHead}>
                            <TruckIcon size={13} color={COLORS.secondary} strokeWidth={2} />
                            <Text style={gp.priceLabel}>{t('customerHome.diesel')}</Text>
                          </View>
                          <Text style={gp.priceVal} adjustsFontSizeToFit numberOfLines={1}>
                            ${Number(store.dieselPricePerGallon).toFixed(3)}<Text style={gp.priceUnit}> /gal</Text>
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={gp.cardFoot}>
                      {store.gasPriceUpdatedAt ? (
                        <Text style={gp.updatedAt}>
                          {t('customerHome.updatedOn', { date: new Date(store.gasPriceUpdatedAt).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }) })}
                        </Text>
                      ) : <View />}
                      {hereOffer && (
                        <TouchableOpacity
                          onPress={() => onOfferPress(hereOffer)}
                          style={gp.herePill}
                          accessibilityRole="button"
                          accessibilityLabel={t('customerHome.viewGasOfferA11y', { title: hereOffer.title })}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <GasPumpIcon size={11} color="#92400E" strokeWidth={2.5} />
                          <Text style={gp.herePillText}>{t('customerHome.gasPromoHere', { cents: hereOffer.gasBonusCentsPerGallon })}</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                </View>
                );
              })}
            </View>
          )
        }
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
              <BannerCarousel banners={banners} onSelect={setSelectedBanner} />
            </View>
          )
        }
      </Animated.View>

      {/* ── Redeem with Points ── */}
      {catalogItems.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <SectionTitle icon={<GiftIcon size={17} color={COLORS.primary} strokeWidth={1.75} />} label={t('customerHome.redeemWithPoints')} />
            <TouchableOpacity
              onPress={() => router.push('/(customer)/rewards')}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel={t('customerHome.seeAllRewardsA11y')}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.primary }}>{t('customerHome.seeAllArrow')}</Text>
            </TouchableOpacity>
          </View>
          <RewardsShelf items={catalogItems} userPts={userPts} />
        </View>
      )}

      {/* ── Challenges: the customer's own, with their progress ── */}
      <View ref={challengesSectionRef}>
        <ChallengesSection storeId={nearestStore?.id} enabled={locationReady} />
      </View>

      {/* ── Invite friends (2026-10-09): both get the bonus when the friend makes a first purchase ── */}
      <InviteCard />
      <ReceiptPhotoCard />

      {/* ── Local Businesses (distinct from "Active Promotions" above, which
          is Lucky Stop's own store offers — this is third-party local
          business ads) ── */}
      <Animated.View style={{ opacity: fadeAnims[8], transform: [{ translateY: slideAnims[8] }] }}>
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <SectionTitle icon={<GlobeIcon size={17} color="#f97316" />} label={t('customerHome.localBusinesses')} />
            {featuredAd && (
              <TouchableOpacity onPress={() => router.push('/(customer)/ads')} accessibilityRole="link" accessibilityLabel={t('customerHome.seeAllLocalAdsA11y')}>
                <Text style={styles.sectionCount}>{t('customerHome.seeAll')}</Text>
              </TouchableOpacity>
            )}
          </View>
          <PromoFlipCard ad={featuredAd} />
        </View>
      </Animated.View>


      {/* ── Why Lucky Stop: for someone new (no points yet) ── */}
      {userPts === 0 && periodPts === 0 && (
      <Animated.View style={{ opacity: fadeAnims[3], transform: [{ translateY: slideAnims[3] }] }}>
        <View style={styles.section}>
          <View style={styles.sectionRow}>
            <SectionTitle icon={<StarIcon size={17} color={COLORS.primary} strokeWidth={2} />} label={t('customerHome.whyLuckyStop')} />
          </View>
          <PromoSlideshow />
        </View>
      </Animated.View>
      )}

      {/* ── Rating prompt ── */}
      {pendingRating && (
        <Modal transparent animationType="slide" onRequestClose={() => setPendingRating(null)}>
          <View style={rm.overlay}>
            <View style={rm.sheet}>
              <View style={rm.starIconWrap}>
                <StarIcon size={36} color="#F59E0B" strokeWidth={1.5} filled />
              </View>
              <Text style={rm.title}>{t('customerHome.ratingTitle')}</Text>
              <Text style={rm.sub}>
                {t('customerHome.ratingAtStore', { store: pendingRating.store?.name || 'Lucky Stop' })}
                {pendingRating.grantedBy?.name ? ` · ${t('customerHome.ratingServedBy', { name: pendingRating.grantedBy.name.split(' ')[0] })}` : ''}
              </Text>
              <View style={rm.stars}>
                {[1, 2, 3, 4, 5].map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => { setHoveredStar(s); submitRating(s); }}
                    activeOpacity={0.7}
                    style={rm.starBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('customerHome.rateStarsA11y', { count: s })}
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
              <TouchableOpacity
                onPress={() => setPendingRating(null)}
                style={rm.skipBtn}
                accessibilityRole="button"
                accessibilityLabel={t('customerHome.skipRatingA11y')}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={rm.skipText}>{t('customerHome.skip')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ModalToastHost />
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
              <Text style={ag.title}>{t('customerHome.ageStoreTitle')}</Text>
              <Text style={ag.storeName}>{pendingAgeGateStore.name}</Text>
              <Text style={ag.body}>
                {t('customerHome.ageStoreBody')}{'\n\n'}
                {t('customerHome.ageStoreLegal')}
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
                accessibilityRole="button"
                accessibilityLabel={confirming21 ? t('customerHome.confirmingAgeA11y') : t('customerHome.confirmAge21A11y')}
              >
                <Text style={ag.confirmBtnText}>{confirming21 ? t('customerHome.confirming') : t('customerHome.age21Continue')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={ag.backBtn}
                onPress={() => {
                  setPendingAgeGateStore(null);
                  setShow21Gate(false);
                  setLocationStatus('none');
                }}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('customerHome.goBackAgeA11y')}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              >
                <Text style={ag.backBtnText}>{t('customerHome.goBack')}</Text>
              </TouchableOpacity>
            </View>
          </View>
          <ModalToastHost />
        </Modal>
      )}

      {/* ── 21+ age gate modal (offers) ── */}
      {/* ── Banner detail modal ── */}
      {selectedBanner && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelectedBanner(null)}>
          <View style={om.overlay}>
            <View style={[om.sheet, { maxHeight: sheetMaxHeight }]}>
              <Image source={{ uri: sized(selectedBanner.imageUrl) }} style={[om.image, { height: modalImageHeight }]} contentFit="cover" />
              <ScrollView
                style={om.bodyScroll}
                contentContainerStyle={[om.bodyContent, { paddingBottom: 20 + insets.bottom }]}
                showsVerticalScrollIndicator={false}
              >
                <Text style={om.title}>{selectedBanner.title}</Text>
                {selectedBanner.linkUrl ? (
                  <TouchableOpacity
                    style={om.closeBtn}
                    onPress={() => Linking.openURL(selectedBanner.linkUrl).catch(() => {})}
                    accessibilityRole="link"
                    accessibilityLabel={t('customerHome.visitLinkA11y')}
                  >
                    <Text style={om.closeBtnText}>{t('customerHome.visitArrow')}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  style={[om.closeBtn, selectedBanner.linkUrl ? { backgroundColor: COLORS.background, marginTop: 10 } : null]}
                  onPress={() => setSelectedBanner(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('customerHome.closeBannerA11y')}
                >
                  <Text style={[om.closeBtnText, selectedBanner.linkUrl ? { color: COLORS.textMuted } : null]}>
                    {selectedBanner.linkUrl ? t('customerHome.close') : t('customerHome.gotIt')}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>
          </View>
          <ModalToastHost />
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
            <TouchableOpacity
              style={ti.backdrop}
              activeOpacity={1}
              onPress={() => setSelectedTier(null)}
              accessibilityRole="button"
              accessibilityLabel={t('customerHome.dismissTierA11y')}
            >
              <TouchableOpacity style={ti.card} activeOpacity={1} onPress={() => {}}>
                <View style={[ti.iconWrap, { backgroundColor: cfg.color + '22' }]}>
                  <Text style={ti.icon}>{cfg.icon}</Text>
                </View>
                <Text style={[ti.tierName, { color: cfg.color }]}>{cfg.label}</Text>
                {cfg.thresholdPts > 0 && (
                  <Text style={ti.threshold}>{t('customerHome.tierThreshold', { pts: cfg.thresholdPts.toLocaleString() })}</Text>
                )}
                {isCurrent && (
                  <View style={[ti.badge, { backgroundColor: COLORS.secondary + '18' }]}>
                    <Text style={[ti.badgeText, { color: COLORS.secondary }]}>{t('customerHome.yourCurrentTier')}</Text>
                  </View>
                )}
                {isPast && (
                  <View style={[ti.badge, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={[ti.badgeText, { color: '#2E7D32' }]}>{t('customerHome.achieved')}</Text>
                  </View>
                )}
                {!isCurrent && !isPast && ptsAway > 0 && (
                  <View style={[ti.badge, { backgroundColor: '#FFF3E0' }]}>
                    <Text style={[ti.badgeText, { color: '#E65100' }]}>{t('customerHome.ptsAway', { pts: ptsAway.toLocaleString() })}</Text>
                  </View>
                )}
                <View style={ti.divider} />
                <View style={ti.benefitsWrap}>
                  {cfg.benefits.map((b, idx) => (
                    <View key={idx} style={ti.benefitRow}>
                      <View style={[ti.dot, { backgroundColor: cfg.color }]} />
                      <Text style={ti.benefitText}>{t(`customerHome.benefit_${selectedTier}_${idx}`, { defaultValue: b })}</Text>
                    </View>
                  ))}
                </View>
                <TouchableOpacity
                  style={ti.closeBtn}
                  onPress={() => setSelectedTier(null)}
                  accessibilityRole="button"
                  accessibilityLabel={t('customerHome.closeTierA11y')}
                >
                  <Text style={ti.closeBtnText}>{t('customerHome.gotIt')}</Text>
                </TouchableOpacity>
              </TouchableOpacity>
            </TouchableOpacity>
            <ModalToastHost />
          </Modal>
        );
      })()}

      </Animated.ScrollView>

      {/* ── Age-gate confirm popup (in-tree overlay, not Modal - see InlineModal) ── */}
      {ageGateOffer && (
        <InlineModal onRequestClose={() => setAgeGateOffer(null)} animation="fade" overlay={ag.overlay}>
          <View style={ag.card}>
            <View style={ag.badge}>
              <Text style={ag.badgeText}>21+</Text>
            </View>
            <Text style={ag.title}>{t('customerHome.ageOfferTitle')}</Text>
            <Text style={ag.storeName}>{ageGateOffer.title}</Text>
            <Text style={ag.body}>
              {t('customerHome.ageOfferBody')}{'\n\n'}
              {t('customerHome.ageOfferLegal')}
            </Text>
            <TouchableOpacity
              style={[ag.confirmBtn, confirmingOfferAge && { opacity: 0.6 }]}
              onPress={async () => {
                if (confirmingOfferAge) return;
                setConfirmingOfferAge(true);
                try {
                  await authApi.confirm21();
                  setAge21Confirmed();
                  setAgeGateOffer(null);
                  setSelectedOffer(ageGateOffer);
                } catch {
                  // silent, gate stays open, user can retry
                } finally {
                  setConfirmingOfferAge(false);
                }
              }}
              disabled={confirmingOfferAge}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={confirmingOfferAge ? t('customerHome.confirmingAgeA11y') : t('customerHome.confirmAge21A11y')}
            >
              <Text style={ag.confirmBtnText}>{confirmingOfferAge ? t('customerHome.confirming') : t('customerHome.age21ContinueOffer')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={ag.backBtn}
              onPress={async () => {
                if (decliningOfferAge) return;
                setDecliningOfferAge(true);
                try {
                  await authApi.decline21();
                  setAge21Declined();
                } catch {
                  // silent, worst case they see the blurred card again next time
                } finally {
                  setDecliningOfferAge(false);
                  setAgeGateOffer(null);
                }
              }}
              disabled={decliningOfferAge}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('customerHome.notInterestedA11y')}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            >
              <Text style={ag.backBtnText}>{decliningOfferAge ? t('customerHome.pleaseWait') : t('customerHome.notInterested')}</Text>
            </TouchableOpacity>
          </View>
        </InlineModal>
      )}

      {/* ── Offer detail overlay (in-tree, see InlineModal) ── */}
      {selectedOffer && (
        <InlineModal onRequestClose={() => setSelectedOffer(null)} animation="slide" overlay={om.overlay}>
          <View style={[om.sheet, { maxHeight: sheetMaxHeight }]}>
            {selectedOffer.dealText && !selectedOffer.imageUrl ? (
              <View style={om.dealHeader}>
                <TagIcon size={18} color="#fff" strokeWidth={2} />
                <Text style={om.dealHeaderText} numberOfLines={1}>{selectedOffer.dealText}</Text>
              </View>
            ) : null}
            {selectedOffer.imageUrl ? (
              <Image source={{ uri: sized(selectedOffer.imageUrl) }} style={[om.image, { height: modalImageHeight }]} contentFit="cover" />
            ) : null}
            {/* om.bodyScroll's flex:1 needs a definite-height ancestor, which a real
                <Modal> window used to seed for free. This overlay's sheet is sized
                to its own content instead (via InlineModal), so flex:1 here has
                nothing to resolve against and collapses to zero - use maxHeight. */}
            <ScrollView
              style={{ maxHeight: sheetMaxHeight }}
              contentContainerStyle={[om.bodyContent, { paddingBottom: 20 + insets.bottom }]}
              showsVerticalScrollIndicator={false}
            >
              {selectedOffer.gasBonusCentsPerGallon != null ? (
                <View style={om.badgeRow}>
                  <View style={[om.badge, { backgroundColor: '#fff3e0' }]}>
                    <GasPumpIcon size={13} color="#c04000" strokeWidth={2} />
                    <Text style={[om.badgeText, { color: '#c04000' }]}>{t('customerHome.offerGasBadge', { cents: selectedOffer.gasBonusCentsPerGallon })}</Text>
                  </View>
                </View>
              ) : selectedOffer.bonusRate ? (
                <View style={om.badgeRow}>
                  <View style={om.badge}>
                    <PercentIcon size={13} color={COLORS.primary} strokeWidth={2} />
                    <Text style={om.badgeText}>{offerBonusText(selectedOffer, t, 'offerCashbackBadge')}</Text>
                  </View>
                </View>
              ) : selectedOffer.dealText && selectedOffer.imageUrl ? (
                <Text style={om.dealText}>{selectedOffer.dealText}</Text>
              ) : null}
              <Text style={om.title}>{selectedOffer.title}</Text>
              {selectedOffer.description ? <Text style={om.desc}>{selectedOffer.description}</Text> : null}
              {selectedOffer.source === 'SHELF' ? (
                <View style={om.dateRow}>
                  <Text style={om.dateText}>
                    {selectedOffer.regularPrice ? `${t('customerHome.regularPrice', { price: priceText(selectedOffer.regularPrice) })}. ` : ''}{t('customerHome.shelfDealNote')}
                  </Text>
                </View>
              ) : (
              <View style={om.dateRow}>
                <Text style={om.dateText}>
                  {t('customerHome.validRange', {
                    start: new Date(selectedOffer.startDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
                    end: new Date(selectedOffer.endDate).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' }),
                  })}
                </Text>
              </View>
              )}
              {hoursText(selectedOffer, t) ? (
                <View style={om.dateRow}>
                  <Text style={[om.dateText, { fontWeight: '700' }]}>
                    {t('customerHome.happyHoursOnly', { hours: hoursText(selectedOffer, t) })}
                    {selectedOffer.onNow === true ? ` ${t('customerHome.onNowShort')}` : selectedOffer.onNow === false ? ` ${t('customerHome.notOnNowShort')}` : ''}
                  </Text>
                </View>
              ) : null}
              <View style={om.howBox}>
                <Text style={om.howTitle}>{t('customerHome.howItWorks')}</Text>
                <Text style={om.howText}>
                  {selectedOffer.gasBonusCentsPerGallon != null
                    ? t('customerHome.howGas', { cents: selectedOffer.gasBonusCentsPerGallon })
                    : selectedOffer.bonusRate
                      ? t('customerHome.howCashback')
                      : t('customerHome.howDeal')}
                </Text>
              </View>
              <TouchableOpacity
                style={om.closeBtn}
                onPress={() => setSelectedOffer(null)}
                accessibilityRole="button"
                accessibilityLabel={t('customerHome.closeOfferA11y')}
              >
                <Text style={om.closeBtnText}>{t('customerHome.gotIt')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </InlineModal>
      )}


      {/* ── QR Modal ── */}
      <Modal visible={showQR} transparent animationType="slide" onRequestClose={() => setShowQR(false)}>
        <View style={styles.qrModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={() => setShowQR(false)}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel={t('customerHome.dismissQrA11y')}
          />
          <View style={styles.qrModalSheet}>
            {/* Handle + header */}
            <View style={styles.qrModalHeader}>
              <View style={styles.qrModalPill} />
              <View style={styles.qrModalLogoRow}>
                <Image source={require('../../assets/store-icon-512.png')} style={styles.qrModalLogo} />
                <View>
                  <Text style={styles.qrModalTitle}>{t('customerHome.yourQrCode')}</Text>
                  <Text style={styles.qrModalSub}>{t('customerHome.qrSub')}</Text>
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
                <Text style={{ color: COLORS.textMuted }}>{t('customerHome.qrLoading')}</Text>
              </View>
            )}
            <Text style={styles.qrHint}>{t('customerHome.qrUnique')}</Text>
            {RECEIPT_QR_LIVE && (
              <TouchableOpacity
                style={styles.scanReceiptLink}
                onPress={() => { setShowQR(false); router.push('/(customer)/scan-receipt'); }}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={t('customerHome.scanReceiptA11y')}
              >
                <Text style={styles.scanReceiptLinkText}>{t('customerHome.scanReceiptLink')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.qrModalClose}
              onPress={() => setShowQR(false)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('customerHome.closeQrA11y')}
            >
              <Text style={styles.qrModalCloseText}>{t('customerHome.close')}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <ModalToastHost />
      </Modal>

    </View>
  );
}

/** "$2.79" from a label price, whether or not it was typed with the dollar sign. */
function priceText(p: string): string {
  return `$${String(p).replace(/^\$/, '')}`;
}

/** A happy-hour promotion's hours under its bonus, and whether it pays right now. Nothing for one that pays all day. */
function OfferHoursLine({ offer, compact }: { offer: any; compact?: boolean }) {
  const { t } = useTranslation();
  const hours = hoursText(offer, t);
  // Who it is for (only they see it: utils offerAudience on the server), and the most one customer gets from it in a day
  const who = offer.audience === 'TIER_UP' ? (offer.audienceTier === 'PLATINUM' ? t('customerHome.audTierTop') : t('customerHome.audTier', { tier: String(offer.audienceTier ?? 'GOLD').charAt(0) + String(offer.audienceTier ?? 'GOLD').slice(1).toLowerCase() }))
    : offer.audience === 'LAPSED' ? t('customerHome.audLapsed') : offer.audience === 'NEW' ? t('customerHome.audNew') : offer.audience === 'BIRTHDAY' ? t('customerHome.audBirthday') : null;
  const cap = offer.dailyCapPerCustomer != null ? t('customerHome.dailyCap', { amount: Number(offer.dailyCapPerCustomer).toFixed(2) }) : null;
  if (!hours && !who && !cap) return null;
  const on = offer.onNow !== false;
  return (
    <>
      {hours && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
          <ClockIcon size={11} color={on ? COLORS.success : COLORS.textMuted} strokeWidth={2.5} />
          <Text style={{ fontSize: 11, fontWeight: '700', color: on ? COLORS.success : COLORS.textMuted }} numberOfLines={compact ? 2 : undefined}>
            {hours}{offer.onNow === true ? ` · ${t('customerHome.onNowShort')}` : offer.onNow === false ? ` · ${t('customerHome.notOnNowShort')}` : ''}
          </Text>
        </View>
      )}
      {who && <Text style={{ fontSize: 11, fontWeight: '700', color: COLORS.secondary, marginTop: 4 }} numberOfLines={1}>{t('customerHome.justForYou', { who })}</Text>}
      {cap && <Text style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }} numberOfLines={1}>{cap}</Text>}
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#EDF1F7' },
  scroll: { flex: 1 },
  headerBg: { backgroundColor: COLORS.primary },
  // QR floating button
  qrFab: {
    marginTop: 16,
  },
  qrFabInner: {
    backgroundColor: COLORS.primary,
    borderRadius: 28, paddingHorizontal: 22, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', ...SOFT_SHADOW,
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
    marginTop: 12, paddingVertical: 14, paddingHorizontal: 48,
    backgroundColor: '#f1f5f9', borderRadius: 16,
  },
  qrModalCloseText: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  scanReceiptLink: { marginTop: 20, paddingVertical: 4 },
  scanReceiptLinkText: { fontSize: 14, fontWeight: '700', color: COLORS.primary },
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
    backgroundColor: COLORS.secondary, borderRadius: 24, padding: 24, alignItems: 'center', ...SOFT_SHADOW,
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
  // The card itself is white and the shadow is iPhone only: the row makes every card as tall as the tallest, and on Android the elevation
  // of a card shorter inside drew a white and gray block under it (2026-10-12)
  hotFoodCard:         { width: 148, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: Platform.OS === 'android' ? 1 : 0, borderColor: '#E6E8EB',
                         ...(Platform.OS === 'ios' ? { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6 } : {}) },
  hotFoodClip:         { flex: 1, backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden' },
  hotFoodTag:          { position: 'absolute', top: 8, left: 8, backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  hotFoodTagText:      { color: '#fff', fontSize: 10.5, fontWeight: '800' },
  hotFoodPriceRow:     { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  hotFoodSave:         { fontSize: 10.5, fontWeight: '800', color: '#17663A', backgroundColor: '#EDF7F0', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1, overflow: 'hidden' },
  hotFoodMore:         { width: 112, alignItems: 'center', justifyContent: 'center', gap: 6, padding: 12, backgroundColor: '#FFF7ED', borderColor: '#FED7AA', borderWidth: 1 },
  hotFoodMoreText:     { fontSize: 13, fontWeight: '800', color: COLORS.secondary, textAlign: 'center' },
  hotFoodImg:          { width: 148, height: 96 },
  hotFoodImgPlaceholder:{ width: 148, height: 96, backgroundColor: '#FFF7ED', alignItems: 'center', justifyContent: 'center' },
  hotFoodCardBody:     { padding: 10 },
  hotFoodItemName:     { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 2, lineHeight: 17 },
  hotFoodItemDesc:     { fontSize: 11, color: COLORS.textMuted, marginBottom: 5 },
  hotFoodItemPrice:    { fontSize: 14, fontWeight: '800', color: '#EA580C' },

  sliderRow: { gap: 10, paddingBottom: 4 },
  offerSlideCard: {
    width: 220, borderRadius: 18, ...SOFT_SHADOW, ...SOFT_BORDER,
  },
  offerSlideClip: { backgroundColor: COLORS.white, borderRadius: 18, overflow: 'hidden' },
  offerSlideImage: { width: 220, height: 110 },
  offerSlidePlaceholder: {
    width: 220, height: 110, alignItems: 'center', justifyContent: 'center',
  },
  offerSlideContent: { padding: 12, gap: 4 },

  offerCard: {
    borderRadius: 18, marginBottom: 10, ...SOFT_SHADOW, ...SOFT_BORDER,
  },
  offerCardClip: {
    backgroundColor: COLORS.white, borderRadius: 18, overflow: 'hidden',
    flexDirection: 'row', alignItems: 'center',
  },
  ageLockOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
  },
  ageLockBadge: {
    backgroundColor: 'rgba(20,20,25,0.88)',
    borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 14,
    alignItems: 'center', gap: 2,
    maxWidth: '84%',
  },
  ageLockEmoji: { fontSize: 22, marginBottom: 2 },
  ageLockText: { color: '#fff', fontWeight: '800', fontSize: 13, textAlign: 'center' },
  ageLockSubtext: { color: 'rgba(255,255,255,0.85)', fontWeight: '600', fontSize: 11, textAlign: 'center' },
  offerImage: { width: 84, height: 84 },
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

  gasPriceRow: { gap: 10, paddingBottom: 4, paddingTop: 8 },
  gasPriceCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 14, minWidth: 155,
    ...SOFT_SHADOW, ...SOFT_BORDER,
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
    width: SLIDE_W, marginRight: 12, borderRadius: 22,
    height: 196, ...SOFT_SHADOW,
  },
  slideClip: { flex: 1, borderRadius: 22, overflow: 'hidden' },
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

const ds = StyleSheet.create({
  root: { gap: 10 },
  slide: {
    width: SLIDE_W, marginRight: 12, borderRadius: 22,
    height: 176, ...SOFT_SHADOW,
  },
  slideClip: { flex: 1, borderRadius: 22, overflow: 'hidden' },
  slideImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined },
  imageScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%', backgroundColor: 'rgba(0,0,0,0.55)' },
  decoCircleLg: { position: 'absolute', width: 200, height: 200, borderRadius: 100, top: -60, right: -50 },
  decoCircleSm: { position: 'absolute', width: 100, height: 100, borderRadius: 50, bottom: -30, left: -20 },
  slideInner: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, padding: 18, justifyContent: 'flex-end', gap: 3 },
  iconBadge: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  dealTextBig: { color: '#fff', fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },
  title:       { color: 'rgba(255,255,255,0.92)', fontSize: 14, fontWeight: '700', marginTop: 2 },
  body:        { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 2 },
  dots:        { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingTop: 10 },
  counter:     { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, backgroundColor: '#F1F3F5', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
});

const rs = StyleSheet.create({
  row:      { gap: 10, paddingRight: 16 },
  card: {
    width: 136, backgroundColor: COLORS.white, borderRadius: 18, padding: 12, gap: 6, ...SOFT_SHADOW, ...SOFT_BORDER,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  emoji:    { fontSize: 24 },
  name:     { fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 17, height: 34 },
  pts:      { fontSize: 15, fontWeight: '900' },
  track:    { height: 5, borderRadius: 3, backgroundColor: '#EEF0F3', overflow: 'hidden' },
  fill:     { height: 5, borderRadius: 3 },
  status:   { fontSize: 11, fontWeight: '600', color: COLORS.textMuted },
  seeAll:   { alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F8FA' },
  seeAllCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  seeAllText:   { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 4 },
});

const gp = StyleSheet.create({
  row:               { marginBottom: 10 },
  promoBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1D3557', borderRadius: 18, padding: 14, marginBottom: 12, ...SOFT_SHADOW,
  },
  promoIcon:   { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  promoTitle:  { color: '#fff', fontSize: 14, fontWeight: '800' },
  promoSub:    { color: 'rgba(255,255,255,0.72)', fontSize: 11.5, fontWeight: '600', marginTop: 2 },
  promoAmount: { alignItems: 'flex-end' },
  promoBonus:  { color: '#F4A226', fontSize: 24, fontWeight: '900', lineHeight: 28 },
  promoUnit:   { color: 'rgba(255,255,255,0.65)', fontSize: 10.5, fontWeight: '700' },
  priceTile:     { flex: 1, backgroundColor: '#F7F8FA', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, gap: 4 },
  priceTileHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  cardFoot:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  herePill:      { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  herePillText:  { fontSize: 11, fontWeight: '800', color: '#92400E' },
  priceCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    ...SOFT_SHADOW, ...SOFT_BORDER,
  },
  storeName:   { fontSize: 14, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  storeAddr:   { fontSize: 11, color: COLORS.textMuted, marginBottom: 5 },
  storeHours:  { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginBottom: 5 },
  hoursDisclaimer: { fontSize: 11, fontStyle: 'italic', color: COLORS.textMuted, marginBottom: 8, paddingHorizontal: 2 },
  priceLines:  { flexDirection: 'row', gap: 10, marginTop: 4 },
  priceLabel:  { fontSize: 12, color: COLORS.textMuted, fontWeight: '700' },
  priceVal:    { fontSize: 22, fontWeight: '900', color: COLORS.text },
  priceUnit:   { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  updatedAt:   { fontSize: 10.5, color: COLORS.textMuted, fontWeight: '600' },
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
    width: BANNER_W, marginRight: 12, borderRadius: 20, ...SOFT_SHADOW,
  },
  slideClip: { borderRadius: 20, overflow: 'hidden' },
  image: { width: BANNER_W, height: 190 },
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
  image: { width: '100%', height: 190 },
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

