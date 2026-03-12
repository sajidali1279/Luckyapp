import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

export default function RewardsScreen() {
  const { user } = useAuthStore();
  const balance = Number(user?.pointsBalance || 0);

  const steps = [
    { icon: '🛒', title: 'Shop at Lucky Stop', desc: 'Buy anything at any Lucky Stop location.' },
    { icon: '📱', title: 'Earn 5¢ per $1', desc: 'Show your QR code — cashier grants your points automatically.' },
    { icon: '💰', title: 'Redeem at the register', desc: 'Tell the cashier you want to use your credits. They\'ll scan your QR and apply it to your purchase.' },
  ];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>🎁 Rewards</Text>
          <View style={s.balancePill}>
            <Text style={s.balancePillText}>${balance.toFixed(2)}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        {/* Balance card */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Available Balance</Text>
          <Text style={s.balanceAmount}>${balance.toFixed(2)}</Text>
          <Text style={s.balanceSub}>Ready to use at any Lucky Stop</Text>
        </View>

        {/* How it works */}
        <Text style={s.sectionTitle}>How it works</Text>
        {steps.map((step, i) => (
          <View key={i} style={s.stepCard}>
            <View style={s.stepNum}>
              <Text style={s.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={s.stepIcon}>{step.icon}</Text>
            <View style={s.stepContent}>
              <Text style={s.stepTitle}>{step.title}</Text>
              <Text style={s.stepDesc}>{step.desc}</Text>
            </View>
          </View>
        ))}

        {/* Redeem CTA */}
        {balance > 0 ? (
          <View style={s.ctaCard}>
            <Text style={s.ctaTitle}>Ready to redeem?</Text>
            <Text style={s.ctaDesc}>
              Show your QR code to the cashier and tell them you want to use your ${balance.toFixed(2)} balance. They'll scan it and apply it to your purchase.
            </Text>
            <TouchableOpacity style={s.ctaBtn} onPress={() => router.push('/(customer)/home')}>
              <Text style={s.ctaBtnText}>Show My QR Code →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🏪</Text>
            <Text style={s.emptyTitle}>Start earning today!</Text>
            <Text style={s.emptyDesc}>Visit any Lucky Stop and show your QR code to start building your balance.</Text>
          </View>
        )}

        <View style={{ height: 16 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  headerBg: { backgroundColor: COLORS.secondary },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  balancePill: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  balancePillText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  body: { padding: 16, gap: 14, paddingBottom: 32 },

  balanceCard: {
    backgroundColor: COLORS.secondary, borderRadius: 20, padding: 28, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12, shadowRadius: 12, elevation: 4,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  balanceAmount: { fontSize: 56, fontWeight: '800', color: '#fff', marginVertical: 8 },
  balanceSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  sectionTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginTop: 4 },

  stepCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  stepNum: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  stepIcon: { fontSize: 28, flexShrink: 0 },
  stepContent: { flex: 1 },
  stepTitle: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  stepDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, lineHeight: 18 },

  ctaCard: {
    backgroundColor: COLORS.primary + '12', borderRadius: 18, padding: 22,
    borderWidth: 1.5, borderColor: COLORS.primary + '30',
  },
  ctaTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginBottom: 8 },
  ctaDesc: { fontSize: 14, color: COLORS.text, lineHeight: 21 },
  ctaBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 16,
    alignItems: 'center', marginTop: 16,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  ctaBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  emptyCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 32,
    alignItems: 'center', gap: 10,
  },
  emptyIcon: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
