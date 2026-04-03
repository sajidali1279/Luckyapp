import { View, Text, FlatList, StyleSheet, ActivityIndicator, StatusBar, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { pointsApi } from '../../services/api';
import { COLORS } from '../../constants';
import { format } from 'date-fns';

const CATEGORY_ICONS: Record<string, string> = {
  GAS: '⛽', DIESEL: '🚛', HOT_FOODS: '🌮', GROCERIES: '🛒',
  FROZEN_FOODS: '🧊', FRESH_FOODS: '🥗', TOBACCO_VAPES: '🚬', OTHER: '🏪',
};

export default function HistoryScreen() {
  const [selected, setSelected] = useState<any>(null);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['my-history'],
    queryFn: ({ pageParam = 1 }) => pointsApi.getMyHistory(pageParam),
    getNextPageParam: (lastPage, allPages) => {
      const { total, limit } = lastPage.data.data;
      return allPages.length * limit < total ? allPages.length + 1 : undefined;
    },
    initialPageParam: 1,
  });

  const transactions = data?.pages.flatMap((p) => p.data.data.transactions) || [];

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>📋 History</Text>
          {!isLoading && (
            <View style={s.countPill}>
              <Text style={s.countPillText}>{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.center}>
          <ActivityIndicator color={COLORS.primary} size="large" />
          <Text style={s.loadingText}>Loading history…</Text>
        </View>
      ) : (
        <FlatList
          data={transactions}
          keyExtractor={(item) => item.id}
          contentContainerStyle={transactions.length === 0 ? s.emptyContainer : s.list}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyCard}>
              <Text style={s.emptyIcon}>🧾</Text>
              <Text style={s.emptyTitle}>No transactions yet</Text>
              <Text style={s.emptySub}>Visit a Lucky Stop and show your QR code to earn your first credits!</Text>
            </View>
          }
          ListFooterComponent={
            isFetchingNextPage
              ? <View style={s.footerLoader}><ActivityIndicator color={COLORS.primary} /></View>
              : transactions.length > 0
                ? <Text style={s.footerEnd}>— All transactions loaded —</Text>
                : null
          }
          renderItem={({ item }) => {
            const icon = CATEGORY_ICONS[item.category] || '🏪';
            const catLabel = item.category?.replace(/_/g, ' ') || 'Other';
            return (
              <TouchableOpacity style={s.card} onPress={() => setSelected(item)} activeOpacity={0.75}>
                <View style={s.cardIconBg}>
                  <Text style={s.cardIcon}>{icon}</Text>
                </View>
                <View style={s.cardBody}>
                  <Text style={s.storeName}>{item.store?.name || 'Lucky Stop'}</Text>
                  <Text style={s.date}>{format(new Date(item.createdAt), 'MMM d, yyyy · h:mm a')}</Text>
                  <View style={s.catTag}>
                    <Text style={s.catTagText}>{catLabel}</Text>
                  </View>
                </View>
                <View style={s.cardRight}>
                  <Text style={s.points}>+{Math.round(Number(item.pointsAwarded) * 100).toLocaleString()} pts</Text>
                  <Text style={s.tapHint}>tap for details</Text>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── Transaction Detail Modal ── */}
      {selected && (
        <Modal transparent animationType="slide" onRequestClose={() => setSelected(null)}>
          <View style={d.overlay}>
            <View style={d.sheet}>
              <View style={d.iconBg}>
                <Text style={d.icon}>{CATEGORY_ICONS[selected.category] || '🏪'}</Text>
              </View>
              <Text style={d.storeName}>{selected.store?.name || 'Lucky Stop'}</Text>
              <Text style={d.date}>{format(new Date(selected.createdAt), 'EEEE, MMM d yyyy · h:mm a')}</Text>

              <View style={d.divider} />

              <View style={d.row}>
                <Text style={d.rowLabel}>Category</Text>
                <Text style={d.rowValue}>{selected.category?.replace(/_/g, ' ') || 'Other'}</Text>
              </View>
              <View style={d.row}>
                <Text style={d.rowLabel}>Purchase Amount</Text>
                <Text style={d.rowValue}>${Number(selected.purchaseAmount || 0).toFixed(2)}</Text>
              </View>
              <View style={d.row}>
                <Text style={d.rowLabel}>Points Earned</Text>
                <Text style={[d.rowValue, { color: COLORS.success, fontWeight: '900' }]}>
                  +{Math.round(Number(selected.pointsAwarded) * 100).toLocaleString()} pts
                </Text>
              </View>
              {selected.gasBonusAwarded > 0 && (
                <View style={d.row}>
                  <Text style={d.rowLabel}>Tier Gas Bonus</Text>
                  <Text style={[d.rowValue, { color: '#F4A226', fontWeight: '800' }]}>
                    +{Math.round(Number(selected.gasBonusAwarded) * 100)} pts
                  </Text>
                </View>
              )}
              {selected.notes ? (
                <View style={d.row}>
                  <Text style={d.rowLabel}>Notes</Text>
                  <Text style={d.rowValue}>{selected.notes}</Text>
                </View>
              ) : null}

              <TouchableOpacity style={d.closeBtn} onPress={() => setSelected(null)}>
                <Text style={d.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14 },

  // Header
  headerBg: { backgroundColor: COLORS.secondary },
  headerInner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  countPill: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  countPillText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // List
  list: { padding: 14, paddingBottom: 32 },
  emptyContainer: { flex: 1, justifyContent: 'center', padding: 24 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardIconBg: {
    width: 46, height: 46, borderRadius: 14,
    backgroundColor: COLORS.primary + '12',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardIcon: { fontSize: 22 },
  cardBody: { flex: 1 },
  storeName: { fontWeight: '700', fontSize: 15, color: COLORS.text },
  date: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  catTag: {
    backgroundColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 5, alignSelf: 'flex-start',
  },
  catTagText: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },
  cardRight: { alignItems: 'flex-end', flexShrink: 0 },
  points: { fontSize: 18, fontWeight: '800', color: COLORS.success },
  purchase: { color: COLORS.textMuted, fontSize: 12, marginTop: 3 },
  tapHint: { color: COLORS.textMuted, fontSize: 10, marginTop: 4, fontWeight: '600' },

  // Empty state
  emptyCard: { alignItems: 'center', gap: 12, padding: 20 },
  emptyIcon: { fontSize: 64 },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },

  // Footer
  footerLoader: { paddingVertical: 20, alignItems: 'center' },
  footerEnd: { textAlign: 'center', color: COLORS.textMuted, fontSize: 12, paddingVertical: 20 },
});

const d = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40, alignItems: 'center', gap: 4,
  },
  iconBg: {
    width: 64, height: 64, borderRadius: 20,
    backgroundColor: COLORS.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  icon: { fontSize: 30 },
  storeName: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  date: { fontSize: 13, color: COLORS.textMuted, marginBottom: 4 },
  divider: { width: '100%', height: 1, backgroundColor: COLORS.border, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  rowValue: { fontSize: 14, color: COLORS.text, fontWeight: '700', textAlign: 'right', flex: 1, marginLeft: 16 },
  closeBtn: {
    marginTop: 16, width: '100%', backgroundColor: COLORS.primary,
    borderRadius: 16, padding: 16, alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
