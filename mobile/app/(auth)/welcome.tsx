import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Dimensions, FlatList, Animated, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { COLORS } from '../../constants';

const { width } = Dimensions.get('window');

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

const TERMS = `LUCKY STOP REWARDS — TERMS & CONDITIONS

Last updated: March 2026

1. ACCEPTANCE
By creating an account and using the Lucky Stop Rewards app ("App"), you agree to these Terms & Conditions. If you do not agree, do not use the App.

2. ELIGIBILITY
The App is available to individuals 13 years of age or older. By registering, you confirm you meet this requirement.

3. ACCOUNT & SECURITY
You are responsible for maintaining the confidentiality of your PIN and account. Notify us immediately of any unauthorized use. Lucky Stop is not liable for losses from unauthorized access due to your failure to secure your account.

4. POINTS & REWARDS
- Points are earned on qualifying purchases at participating Lucky Stop locations.
- Points have no cash value and cannot be transferred between accounts.
- Lucky Stop reserves the right to adjust point values, expiration policies, and redemption rules at any time.
- Points may expire if your account is inactive for 12 consecutive months.
- Fraudulent transactions will result in point forfeiture and account termination.

5. RECEIPT REQUIREMENTS
Points grants require a valid receipt photo upload. Submitting fraudulent or altered receipts is grounds for immediate account termination and may be reported to authorities.

6. CATALOG REDEMPTIONS
- Catalog rewards are subject to availability at your local store.
- Pending redemptions expire after 30 minutes if not confirmed by an employee.
- Points are refunded automatically on expiry.

7. TIER PROGRAM
- Tiers are calculated based on points earned in 6-month periods.
- Tier benefits are subject to change with 30 days' notice.
- Tier downgrades occur at the start of each new period if thresholds are not maintained.

8. PRIVACY
We collect your phone number, purchase history, and device push notification token to provide the service. We do not sell your personal data to third parties. Push notifications can be disabled in your device settings at any time.

9. MODIFICATIONS
Lucky Stop reserves the right to modify or discontinue the rewards program at any time with reasonable notice to users via in-app notification or email.

10. LIMITATION OF LIABILITY
Lucky Stop is not liable for any indirect, incidental, or consequential damages arising from your use of the App or inability to redeem rewards.

11. GOVERNING LAW
These Terms are governed by the laws of the State of Texas, without regard to conflict of law provisions.

12. CONTACT
For questions or disputes, contact Lucky Stop support through the app or at your local store.

By tapping "I Agree & Continue", you confirm you have read, understood, and agree to these Terms & Conditions.`;

type Step = 'slides' | 'terms';

export default function WelcomeScreen() {
  const [step, setStep] = useState<Step>('slides');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const [agreed, setAgreed] = useState(false);
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
              <Text style={ts.termsText}>{TERMS}</Text>
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

          <TouchableOpacity
            style={[ts.agreeBtn, (!agreed) && ts.agreeBtnOff]}
            onPress={handleAgree}
            disabled={!agreed}
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
              <View style={[ss.emojiRing, { borderColor: item.accent + '40', backgroundColor: item.accent + '18' }]}>
                <Text style={ss.slideEmoji}>{item.emoji}</Text>
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

// ─── Slide styles ──────────────────────────────────────────────────────────────
const ss = StyleSheet.create({
  root: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  slideInner: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 120 },
  emojiRing: {
    width: 130, height: 130, borderRadius: 65,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
    marginBottom: 36,
  },
  slideEmoji: { fontSize: 64 },
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
