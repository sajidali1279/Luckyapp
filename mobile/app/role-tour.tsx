import { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, FlatList, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useAuthStore, UserRole } from '../store/authStore';
import { COLORS } from '../constants';

const { width } = Dimensions.get('window');

type Slide = { emoji: string; title: string; subtitle: string };

const TOURS: Record<UserRole, { color: string; roleLabel: string; slides: Slide[] }> = {
  CUSTOMER: {
    color: COLORS.primary,
    roleLabel: 'Customer',
    slides: [
      {
        emoji: '📱',
        title: 'Show Your QR Code',
        subtitle: 'Your unique QR code lives on your home screen. Show it to any cashier before you pay — they scan it and you earn points automatically.',
      },
      {
        emoji: '🎁',
        title: 'Redeem from the Catalog',
        subtitle: 'Browse the Catalog tab to see available rewards. Tap Redeem, get a 6-char code, and show it to the cashier within 30 minutes.',
      },
      {
        emoji: '👑',
        title: 'Level Up Your Tier',
        subtitle: 'Earn more points each period to unlock higher tiers — from Bronze all the way to Platinum. Better tier = better perks like free drinks and gas bonuses.',
      },
    ],
  },
  EMPLOYEE: {
    color: '#157A6E',
    roleLabel: 'Employee',
    slides: [
      {
        emoji: '📷',
        title: 'Scan Customer QR Codes',
        subtitle: 'Open the Scan screen and point your camera at the customer\'s QR code before or after their purchase. The app will load their account instantly.',
      },
      {
        emoji: '💵',
        title: 'Grant Points for Purchases',
        subtitle: 'Select "Grant Points", enter the purchase total, pick a category, then take a receipt photo. Points are added to the customer\'s account immediately.',
      },
      {
        emoji: '✅',
        title: 'Confirm Catalog Redemptions',
        subtitle: 'When a customer redeems a catalog item, their QR scan shows you a pending redemption with a code. Verify the code matches and tap Confirm.',
      },
    ],
  },
  STORE_MANAGER: {
    color: '#E63946',
    roleLabel: 'Store Manager',
    slides: [
      {
        emoji: '📢',
        title: 'Create Offers & Banners',
        subtitle: 'Use the admin web dashboard to post special offers (bonus cashback, deals) and banners that show up directly in your customers\' and employees\' apps.',
      },
      {
        emoji: '📅',
        title: 'Manage Your Team Schedule',
        subtitle: 'Assign Opening, Middle, and Closing shifts to your employees. Approve or reject time-off and shift-swap requests from the Scheduling page.',
      },
      {
        emoji: '📊',
        title: 'Track Store Performance',
        subtitle: 'View daily transaction volume, cashback issued, and customer activity for your store. Reject invalid transactions from the Transactions page.',
      },
    ],
  },
  SUPER_ADMIN: {
    color: '#F4A226',
    roleLabel: 'HQ Admin',
    slides: [
      {
        emoji: '👥',
        title: 'Manage All Staff',
        subtitle: 'Create and manage employee, cashier, and manager accounts across all 12 stores. Reset PINs, toggle accounts active/inactive, and manage store assignments.',
      },
      {
        emoji: '🏪',
        title: 'Oversee All 12 Stores',
        subtitle: 'Create platform-wide offers and banners visible to all customers. View transactions, performance stats, and activity across every Lucky Stop location.',
      },
      {
        emoji: '🔔',
        title: 'Stay on Top of Alerts',
        subtitle: 'Your Notifications tab shows billing status, pending shift requests from employees, and important platform alerts — all in one place.',
      },
    ],
  },
  DEV_ADMIN: {
    color: '#2DC653',
    roleLabel: 'Developer Admin',
    slides: [
      {
        emoji: '💳',
        title: 'Manage Store Billing',
        subtitle: 'Set subscription prices and fee rates for each store. Generate monthly invoices, mark payments received, and track your platform revenue in real time.',
      },
      {
        emoji: '📈',
        title: 'Platform Analytics',
        subtitle: 'View transaction volumes, cashback totals, and performance by store. Adjust category cashback rates and your developer cut percentage from the Billing settings.',
      },
      {
        emoji: '🔍',
        title: 'Full Audit Access',
        subtitle: 'The Activity Log tracks every action across all stores and all users — who did what, when, and on which record. Full platform control from one dashboard.',
      },
    ],
  },
};

export default function RoleTourScreen() {
  const { user } = useAuthStore();
  const role = user?.role ?? 'CUSTOMER';
  const tour = TOURS[role] ?? TOURS.CUSTOMER;
  const [currentSlide, setCurrentSlide] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  function handleNext() {
    if (currentSlide < tour.slides.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentSlide + 1, animated: true });
      setCurrentSlide(currentSlide + 1);
    } else {
      handleFinish();
    }
  }

  async function handleFinish() {
    await AsyncStorage.setItem(`tour_seen_${role}`, 'true');
    if (role === 'STORE_MANAGER') {
      router.replace('/(manager)/home');
    } else if (['EMPLOYEE', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(role)) {
      router.replace('/(employee)/home');
    } else {
      router.replace('/(customer)/home');
    }
  }

  return (
    <View style={[s.root, { backgroundColor: tour.color }]}>
      <StatusBar barStyle="light-content" backgroundColor={tour.color} />

      {/* Role badge */}
      <SafeAreaView edges={['top']} style={s.topSafe}>
        <View style={s.roleBadgeRow}>
          <View style={s.roleBadge}>
            <Text style={s.roleBadgeText}>{tour.roleLabel}</Text>
          </View>
          <TouchableOpacity onPress={handleFinish} activeOpacity={0.7}>
            <Text style={s.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Slides */}
      <FlatList
        ref={flatListRef}
        data={tour.slides}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        style={s.slideList}
        renderItem={({ item }) => (
          <View style={[s.slide, { width }]}>
            <View style={s.emojiRing}>
              <Text style={s.emoji}>{item.emoji}</Text>
            </View>
            <Text style={s.slideTitle}>{item.title}</Text>
            <Text style={s.slideSub}>{item.subtitle}</Text>
          </View>
        )}
      />

      {/* Step dots */}
      <View style={s.dots}>
        {tour.slides.map((_, i) => (
          <View
            key={i}
            style={[s.dot, { backgroundColor: i === currentSlide ? '#fff' : 'rgba(255,255,255,0.35)', width: i === currentSlide ? 24 : 8 }]}
          />
        ))}
      </View>

      {/* Bottom */}
      <SafeAreaView edges={['bottom']} style={s.bottomSafe}>
        <View style={s.bottom}>
          <View style={s.stepLabel}>
            <Text style={s.stepText}>{currentSlide + 1} of {tour.slides.length}</Text>
          </View>
          <TouchableOpacity style={s.nextBtn} onPress={handleNext} activeOpacity={0.85}>
            <Text style={s.nextBtnText}>
              {currentSlide === tour.slides.length - 1 ? "Let's Go! →" : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  topSafe: { paddingHorizontal: 20, paddingTop: 8 },
  roleBadgeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roleBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  roleBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
  skipText: { color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: '600' },

  slideList: { flex: 1 },
  slide: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 36, paddingBottom: 60 },
  emojiRing: {
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 36,
  },
  emoji: { fontSize: 60 },
  slideTitle: { fontSize: 28, fontWeight: '900', color: '#fff', textAlign: 'center', marginBottom: 16, lineHeight: 34 },
  slideSub: { fontSize: 16, color: 'rgba(255,255,255,0.8)', textAlign: 'center', lineHeight: 24 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 16 },
  dot: { height: 8, borderRadius: 4 },

  bottomSafe: { paddingHorizontal: 24, paddingBottom: 8 },
  bottom: { gap: 12 },
  stepLabel: { alignItems: 'center' },
  stepText: { color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: '600' },
  nextBtn: {
    backgroundColor: '#fff', borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 6,
  },
  nextBtnText: { fontSize: 17, fontWeight: '800', color: '#1D3557' },
});
