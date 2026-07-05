import { useQuery } from '@tanstack/react-query';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { disputeApi } from '../../services/api';
import { COLORS } from '../../constants';

function StatusPill({ status }: { status: string }) {
  const cfg = {
    PENDING:  { bg: '#fffbeb', color: '#b45309', label: 'Pending' },
    APPROVED: { bg: '#f0fdf4', color: '#16a34a', label: 'Approved' },
    REJECTED: { bg: '#fff1f2', color: '#e63946', label: 'Rejected' },
  }[status] ?? { bg: '#f1f5f9', color: '#64748b', label: status };
  return <Text style={[s.pill, { backgroundColor: cfg.bg, color: cfg.color }]}>{cfg.label}</Text>;
}

export default function MyDisputesScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-disputes'],
    queryFn: () => disputeApi.getMine(),
  });

  const disputes: any[] = data?.data?.data || [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={s.backBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.backArrow}>←</Text>
        </TouchableOpacity>
        <Text style={s.title}>My Reports</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : disputes.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>✅</Text>
          <Text style={s.emptyTitle}>No reports yet</Text>
          <Text style={s.emptySub}>Missing points reports you submit will appear here</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {disputes.map((d) => (
            <View key={d.id} style={s.card}>
              <View style={s.cardTop}>
                <Text style={s.storeName}>{d.store?.name ?? 'Unknown store'}</Text>
                <StatusPill status={d.status} />
              </View>
              <Text style={s.desc}>{d.description}</Text>
              {d.estimatedAmt != null && (
                <Text style={s.meta}>Claimed purchase: ${Number(d.estimatedAmt).toFixed(2)}</Text>
              )}
              {d.resolvedNote ? (
                <Text style={[s.meta, s.note]}>Note: {d.resolvedNote}</Text>
              ) : null}
              {d.creditedAmt != null && d.status === 'APPROVED' && (
                <Text style={s.credited}>+${Number(d.creditedAmt).toFixed(2)} credited</Text>
              )}
              <Text style={s.date}>
                Submitted {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  backArrow: { fontSize: 18, color: COLORS.text, lineHeight: 22 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  list: { padding: 20, gap: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  storeName: { fontSize: 14, fontWeight: '800', color: COLORS.text, flex: 1, marginRight: 8 },
  pill: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, textTransform: 'uppercase', overflow: 'hidden' },
  desc: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  meta: { fontSize: 12, color: '#9ca3af' },
  note: { fontStyle: 'italic' },
  credited: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  date: { fontSize: 11, color: '#c4c9d0', marginTop: 4 },
});
