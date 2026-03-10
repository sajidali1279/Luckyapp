import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView } from 'react-native';
import { router } from 'expo-router';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

export default function RewardsScreen() {
  const { user } = useAuthStore();
  const balance = Number(user?.pointsBalance || 0);

  const steps = [
    { icon: '🛒', title: 'Shop at Lucky Stop', desc: 'Buy anything at any Lucky Stop location.' },
    { icon: '📱', title: 'Earn 5¢ per $1', desc: 'Show your QR code — cashier grants your points automatically.' },
    { icon: '💰', title: 'Redeem at the register', desc: 'Tell the cashier you want to use your credits. They\'ll scan your QR and deduct the amount.' },
  ];

  return (
    <SafeAreaView style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Text style={s.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Rewards</Text>
        <View style={{ width: 64 }} />
      </View>

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
            <TouchableOpacity style={s.ctaBtn} onPress={() => router.back()}>
              <Text style={s.ctaBtnText}>Go to My QR Code →</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={s.emptyCard}>
            <Text style={s.emptyIcon}>🏪</Text>
            <Text style={s.emptyTitle}>Start earning today!</Text>
            <Text style={s.emptyDesc}>Visit any Lucky Stop and show your QR code to start building your balance.</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: COLORS.primary },
  backBtn: { padding: 8 },
  backText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },

  body: { padding: 20, gap: 16, paddingBottom: 40 },

  balanceCard: { backgroundColor: COLORS.secondary, borderRadius: 20, padding: 28, alignItems: 'center' },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  balanceAmount: { fontSize: 52, fontWeight: '800', color: '#fff', marginVertical: 8 },
  balanceSub: { color: 'rgba(255,255,255,0.6)', fontSize: 13 },

  sectionTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },

  stepCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 14 },
  stepNum: { width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  stepNumText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepIcon: { fontSize: 28 },
  stepContent: { flex: 1 },
  stepTitle: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  stepDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, lineHeight: 18 },

  ctaCard: { backgroundColor: COLORS.primary + '15', borderRadius: 18, padding: 22, borderWidth: 1.5, borderColor: COLORS.primary + '30' },
  ctaTitle: { fontSize: 18, fontWeight: '800', color: COLORS.primary, marginBottom: 8 },
  ctaDesc: { fontSize: 14, color: COLORS.text, lineHeight: 21 },
  ctaBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 14 },
  ctaBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  emptyCard: { backgroundColor: COLORS.white, borderRadius: 18, padding: 28, alignItems: 'center', gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptyDesc: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
