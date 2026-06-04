import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, FlatList, Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import Markdown from 'react-native-markdown-display';
import Svg, { Polygon, Circle, Path, Rect, G, Ellipse } from 'react-native-svg';
import { COLORS } from '../../constants';
import { TERMS_OF_SERVICE } from '../../constants/termsOfService';

const { width } = Dimensions.get('window');

// ─── Slide SVG illustrations ───────────────────────────────────────────────────

function IllustrationStore({ accent }: { accent: string }) {
  return (
    <Svg width={120} height={120} viewBox="0 0 100 100">
      {/* Hexagon (store sign) */}
      <Polygon points="50,8 91,31 91,69 50,92 9,69 9,31" fill="#CC2936" />
      <Polygon points="50,15 83,34 83,66 50,85 17,66 17,34" fill="none" stroke="#fff" strokeWidth="2" opacity={0.9} />
      {/* Car */}
      <Path d="M26,60 L26,51 L32,42 L40,37 L60,37 L68,42 L74,51 L74,60 Z" fill="#fff" />
      <Path d="M33,50 L37,42 L58,42 L65,50 Z" fill="#CC2936" opacity={0.85} />
      <Circle cx="35" cy="60" r="7" fill="#8B1520" />
      <Circle cx="65" cy="60" r="7" fill="#8B1520" />
      <Circle cx="35" cy="60" r="3" fill="#fff" />
      <Circle cx="65" cy="60" r="3" fill="#fff" />
    </Svg>
  );
}

function IllustrationEarn({ accent }: { accent: string }) {
  return (
    <Svg width={120} height={120} viewBox="0 0 100 100">
      {/* Coin stack */}
      <Ellipse cx="50" cy="76" rx="28" ry="9" fill={accent} opacity={0.5} />
      <Ellipse cx="50" cy="68" rx="28" ry="9" fill={accent} opacity={0.7} />
      <Ellipse cx="50" cy="60" rx="28" ry="9" fill={accent} />
      <Ellipse cx="50" cy="60" rx="18" ry="5" fill="#fff" opacity={0.25} />
      {/* Dollar sign */}
      <Path d="M50,52 L50,68" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      <Path d="M44,56 Q44,52 50,52 Q56,52 56,56 Q56,60 50,60 Q44,60 44,64 Q44,68 50,68 Q56,68 56,64" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" />
      {/* Arrow up */}
      <Path d="M68,38 L68,20 M62,26 L68,20 L74,26" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      {/* Sparkles */}
      <Circle cx="24" cy="28" r="4" fill="#fff" opacity={0.7} />
      <Circle cx="80" cy="45" r="3" fill="#fff" opacity={0.5} />
      <Circle cx="18" cy="52" r="2.5" fill="#fff" opacity={0.4} />
    </Svg>
  );
}

function IllustrationRedeem({ accent }: { accent: string }) {
  return (
    <Svg width={120} height={120} viewBox="0 0 100 100">
      {/* Gift box body */}
      <Rect x="22" y="50" width="56" height="38" rx="4" fill="#fff" opacity={0.9} />
      {/* Lid */}
      <Rect x="18" y="42" width="64" height="14" rx="4" fill="#fff" />
      {/* Ribbon vertical */}
      <Rect x="46" y="42" width="8" height="46" rx="2" fill={accent} opacity={0.8} />
      {/* Ribbon horizontal on lid */}
      <Rect x="18" y="46" width="64" height="6" rx="2" fill={accent} opacity={0.8} />
      {/* Bow left loop */}
      <Ellipse cx="38" cy="38" rx="12" ry="7" fill={accent} transform="rotate(-25,38,38)" />
      {/* Bow right loop */}
      <Ellipse cx="62" cy="38" rx="12" ry="7" fill={accent} transform="rotate(25,62,38)" />
      {/* Bow center */}
      <Circle cx="50" cy="40" r="6" fill={accent} />
      <Circle cx="50" cy="40" r="3" fill="#fff" opacity={0.5} />
      {/* Stars */}
      <Circle cx="20" cy="28" r="3.5" fill="#fff" opacity={0.6} />
      <Circle cx="82" cy="32" r="2.5" fill="#fff" opacity={0.5} />
      <Circle cx="75" cy="18" r="3" fill="#fff" opacity={0.4} />
    </Svg>
  );
}

function IllustrationTiers({ accent }: { accent: string }) {
  return (
    <Svg width={120} height={120} viewBox="0 0 100 100">
      {/* Trophy cup */}
      <Path d="M35,25 L35,58 Q35,70 50,72 Q65,70 65,58 L65,25 Z" fill="#FFD700" />
      {/* Trophy shine */}
      <Path d="M40,30 Q44,26 50,28" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" opacity={0.6} />
      {/* Trophy handles */}
      <Path d="M35,35 Q20,38 22,50 Q24,58 35,55" fill="none" stroke="#FFD700" strokeWidth="5" strokeLinecap="round" />
      <Path d="M65,35 Q80,38 78,50 Q76,58 65,55" fill="none" stroke="#FFD700" strokeWidth="5" strokeLinecap="round" />
      {/* Base */}
      <Rect x="42" y="72" width="16" height="8" rx="2" fill="#FFD700" opacity={0.8} />
      <Rect x="34" y="78" width="32" height="6" rx="3" fill="#FFD700" />
      {/* Star inside */}
      <Path d="M50,35 L52.5,42 L60,42 L54,46 L56,53 L50,49 L44,53 L46,46 L40,42 L47.5,42 Z" fill="#fff" opacity={0.9} />
      {/* Tier dots */}
      <Circle cx="26" cy="80" r="5" fill="#CD7F32" />
      <Circle cx="38" cy="88" r="5" fill="#A8A9AD" />
      <Circle cx="50" cy="91" r="6" fill="#FFD700" />
      <Circle cx="62" cy="88" r="5" fill="#7dd8f8" />
      <Circle cx="74" cy="80" r="5" fill="#E5E4E2" />
    </Svg>
  );
}

const SLIDE_ILLUSTRATIONS: Record<string, (accent: string) => React.ReactNode> = {
  welcome: (a) => <IllustrationStore accent={a} />,
  earn:    (a) => <IllustrationEarn accent={a} />,
  redeem:  (a) => <IllustrationRedeem accent={a} />,
  tiers:   (a) => <IllustrationTiers accent={a} />,
};

const SLIDES = [
  {
    key: 'welcome',
    emoji: '⛽',
    title: 'Welcome to\nLucky Stop Rewards',
    subtitle: 'Your loyalty program for all 12 Lucky Stop locations across the region.',
    bg: '#1D3557',
    accent: '#F4A261',
  },
  {
    key: 'earn',
    emoji: '💵',
    title: 'Earn Cashback\non Every Purchase',
    subtitle: 'Shop at any Lucky Stop — gas, groceries, hot foods and more — and earn points automatically.',
    bg: '#157A6E',
    accent: '#A8DADC',
  },
  {
    key: 'redeem',
    emoji: '🎁',
    title: 'Redeem for\nFree Products',
    subtitle: 'Use your points to claim free coffees, snacks, gas discounts, and more from our reward catalog.',
    bg: '#9B5DE5',
    accent: '#F8F0FF',
  },
  {
    key: 'tiers',
    emoji: '👑',
    title: 'Level Up Your\nLoyalty Tier',
    subtitle: 'From Bronze to Platinum — unlock daily free drinks, gas bonuses, and exclusive perks as you grow.',
    bg: '#F4A226',
    accent: '#1D3557',
  },
];


type Step = 'slides' | 'terms';

export default function WelcomeScreen() {
  const [step, setStep] = useState<Step>('slides');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  function handleNext() {
    if (currentSlide < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentSlide + 1, animated: true });
      setCurrentSlide(currentSlide + 1);
    } else {
      setStep('terms');
    }
  }

  function handleScroll(e: any) {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const isAtBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 40;
    if (isAtBottom) setScrolledToBottom(true);
  }

  async function handleAgree() {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.replace('/(auth)/login');
  }

  const slide = SLIDES[currentSlide];

  if (step === 'terms') {
    return (
      <View style={[ts.root, { backgroundColor: '#f8f9fa' }]}>
        <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />
        <SafeAreaView style={ts.safeArea}>
          <View style={ts.termsHeader}>
            <Text style={ts.termsIcon}>📋</Text>
            <Text style={ts.termsTitle}>Terms & Conditions</Text>
            <Text style={ts.termsSub}>Please read carefully before continuing</Text>
          </View>

          <View style={ts.termsBox}>
            <ScrollView
              style={ts.termsScroll}
              onScroll={handleScroll}
              scrollEventThrottle={100}
              showsVerticalScrollIndicator={true}
            >
              <Markdown style={mdStyles}>{TERMS_OF_SERVICE}</Markdown>
              <View style={{ height: 32 }} />
            </ScrollView>
            {!scrolledToBottom && (
              <View style={ts.scrollHint}>
                <Text style={ts.scrollHintText}>↓ Scroll to read all terms</Text>
              </View>
            )}
          </View>

          <View style={ts.agreeRow}>
            <TouchableOpacity
              style={[ts.checkbox, agreed && ts.checkboxChecked]}
              onPress={() => scrolledToBottom && setAgreed(!agreed)}
              activeOpacity={scrolledToBottom ? 0.7 : 1}
            >
              {agreed && <Text style={ts.checkmark}>✓</Text>}
            </TouchableOpacity>
            <Text style={[ts.agreeLabel, !scrolledToBottom && { color: '#aaa' }]}>
              I have read and agree to the Terms & Conditions
            </Text>
          </View>

          <View style={ts.agreeRow}>
            <TouchableOpacity
              style={[ts.checkbox, ageConfirmed && ts.checkboxChecked]}
              onPress={() => setAgeConfirmed(!ageConfirmed)}
              activeOpacity={0.7}
            >
              {ageConfirmed && <Text style={ts.checkmark}>✓</Text>}
            </TouchableOpacity>
            <Text style={ts.agreeLabel}>
              I confirm I am 18 years of age or older
            </Text>
          </View>

          <TouchableOpacity
            style={[ts.agreeBtn, (!agreed || !ageConfirmed) && ts.agreeBtnOff]}
            onPress={handleAgree}
            disabled={!agreed || !ageConfirmed}
            activeOpacity={0.85}
          >
            <Text style={ts.agreeBtnText}>I Agree & Continue →</Text>
          </TouchableOpacity>

          <TouchableOpacity style={ts.backBtn} onPress={() => setStep('slides')}>
            <Text style={ts.backBtnText}>← Back</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={[ss.root, { backgroundColor: slide.bg }]}>
      <StatusBar barStyle="light-content" backgroundColor={slide.bg} />

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        keyExtractor={(item) => item.key}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => (
          <View style={[ss.slide, { width, backgroundColor: item.bg }]}>
            <SafeAreaView style={ss.slideInner}>
              <View style={[ss.illustrationRing, { borderColor: item.accent + '40', backgroundColor: item.accent + '18' }]}>
                {SLIDE_ILLUSTRATIONS[item.key]?.(item.accent)}
              </View>
              <Text style={[ss.slideTitle, { color: '#fff' }]}>{item.title}</Text>
              <Text style={[ss.slideSub, { color: 'rgba(255,255,255,0.75)' }]}>{item.subtitle}</Text>
            </SafeAreaView>
          </View>
        )}
      />

      {/* Dots */}
      <View style={ss.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[ss.dot, i === currentSlide && ss.dotActive, { backgroundColor: i === currentSlide ? '#fff' : 'rgba(255,255,255,0.35)' }]}
          />
        ))}
      </View>

      {/* Bottom actions */}
      <SafeAreaView edges={['bottom']} style={ss.bottomSafe}>
        <View style={ss.bottom}>
          <TouchableOpacity style={ss.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={ss.nextBtnText}>
              {currentSlide === SLIDES.length - 1 ? 'Get Started →' : 'Next →'}
            </Text>
          </TouchableOpacity>

          {currentSlide < SLIDES.length - 1 && (
            <TouchableOpacity
              onPress={async () => {
                await AsyncStorage.setItem('onboarding_complete', 'true');
                setStep('terms');
              }}
              activeOpacity={0.7}
            >
              <Text style={ss.skipText}>Skip</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

// ─── Markdown styles ──────────────────────────────────────────────────────────
const mdStyles = {
  body:        { fontSize: 13, color: '#444', lineHeight: 22 },
  heading1:    { fontSize: 15, fontWeight: '900' as const, color: '#1D3557', marginTop: 8, marginBottom: 6 },
  heading2:    { fontSize: 14, fontWeight: '800' as const, color: '#1D3557', marginTop: 16, marginBottom: 4 },
  strong:      { fontWeight: '700' as const, color: '#1D3557' },
  hr:          { backgroundColor: '#e9ecef', height: 1, marginVertical: 12 },
  bullet_list: { marginBottom: 8 },
  list_item:   { marginBottom: 3 },
  em:          { fontStyle: 'italic' as const },
};

// ─── Slide styles ──────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slideInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 120 },
  illustrationRing: {
    width: 160, height: 160, borderRadius: 80,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginBottom: 36,
  },
  slideTitle: { fontSize: 32, fontWeight: '900', textAlign: 'center', lineHeight: 40, marginBottom: 16 },
  slideSub: { fontSize: 16, textAlign: 'center', lineHeight: 24 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, position: 'absolute', bottom: 140, left: 0, right: 0 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 24 },

  bottomSafe: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  bottom: { paddingHorizontal: 28, paddingBottom: 16, gap: 12 },
  nextBtn: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  nextBtnText: { fontSize: 17, fontWeight: '800', color: '#1D3557' },
  skipText: { color: 'rgba(255,255,255,0.55)', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingVertical: 4 },
});

// ─── Terms styles ──────────────────────────────────────────────────────────────
const ts = StyleSheet.create({
  root: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  termsHeader: { alignItems: 'center', marginBottom: 16, gap: 6 },
  termsIcon: { fontSize: 40 },
  termsTitle: { fontSize: 24, fontWeight: '900', color: '#1D3557' },
  termsSub: { fontSize: 13, color: '#6c757d', textAlign: 'center' },
  termsBox: { flex: 1, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e9ecef', marginBottom: 16 },
  termsScroll: { flex: 1, padding: 18 },
  termsText: { fontSize: 13, color: '#444', lineHeight: 22 },
  scrollHint: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 10,
    alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e9ecef',
  },
  scrollHintText: { fontSize: 12, color: '#6c757d', fontWeight: '600' },
  agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, paddingHorizontal: 4 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 2, borderColor: '#ced4da',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '900' },
  agreeLabel: { flex: 1, fontSize: 13, color: '#444', lineHeight: 18 },
  agreeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', marginBottom: 10,
  },
  agreeBtnOff: { opacity: 0.4 },
  agreeBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  backBtn: { alignItems: 'center', paddingVertical: 8, marginBottom: 4 },
  backBtnText: { color: '#6c757d', fontSize: 14, fontWeight: '600' },
});
