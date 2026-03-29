import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, StatusBar,
  TouchableOpacity, ActivityIndicator, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { catalogApi } from '../../services/api';
import { COLORS } from '../../constants';

type Category = 'ALL' | 'IN_STORE' | 'GAS' | 'HOT_FOODS';

const CATEGORIES: { key: Category; label: string; emoji: string; color: string; bg: string }[] = [
  { key: 'ALL',      label: 'All',       emoji: '🏷️', color: COLORS.secondary, bg: COLORS.secondary + '12' },
  { key: 'IN_STORE', label: 'In-Store',  emoji: '🛒', color: '#2A9D8F',        bg: '#2A9D8F12' },
  { key: 'GAS',      label: 'Gas',       emoji: '⛽', color: '#F4A226',        bg: '#F4A22612' },
  { key: 'HOT_FOODS',label: 'Hot Foods', emoji: '🌮', color: '#E63946',        bg: '#E6394612' },
];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  IN_STORE:  'Drinks, snacks, and everyday essentials',
  GAS:       'Fuel discounts and pump rewards',
  HOT_FOODS: 'Fresh hot food items · available at select locations',
};

export default function CatalogScreen() {
  const { user } = useAuthStore();
  const pts = Math.round(Number(user?.pointsBalance || 0) * 100);
  const [activeCategory, setActiveCategory] = useState<Category>('ALL');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['catalog'],
    queryFn: () => catalogApi.getActive(),
  });

  const allItems: any[] = data?.data?.data || [];
  const filtered = activeCategory === 'ALL'
    ? allItems
    : allItems.filter(i => i.category === activeCategory);

  // Group ALL view by category for section headers
  const grouped: { cat: typeof CATEGORIES[0]; items: any[] }[] = activeCategory === 'ALL'
    ? CATEGORIES.slice(1)
        .map(cat => ({ cat, items: allItems.filter(i => i.category === cat.key) }))
        .filter(g => g.items.length > 0)
    : [];

  const activeCat = CATEGORIES.find(c => c.key === activeCategory)!;

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>🏷️ Catalog</Text>
            <Text style={s.headerSub}>Redeem your points for rewards</Text>
          </View>
          <View style={s.ptsPill}>
            <Text style={s.ptsPillNum}>{pts.toLocaleString()}</Text>
            <Text style={s.ptsPillLabel}> pts</Text>
          </View>
        </View>

        {/* Category pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.catRow}
        >
          {CATEGORIES.map(cat => {
            const active = activeCategory === cat.key;
            const count = cat.key === 'ALL'
              ? allItems.length
              : allItems.filter(i => i.category === cat.key).length;
            return (
              <TouchableOpacity
                key={cat.key}
                style={[s.catPill, active && s.catPillActive]}
                onPress={() => setActiveCategory(cat.key)}
                activeOpacity={0.75}
              >
                <Text style={s.catPillEmoji}>{cat.emoji}</Text>
                <Text style={[s.catPillLabel, active && s.catPillLabelActive]}>{cat.label}</Text>
                {count > 0 && (
                  <View style={[s.catCount, active && s.catCountActive]}>
                    <Text style={[s.catCountText, active && s.catCountTextActive]}>{count}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={s.loadingText}>Loading catalog…</Text>
        </View>
      ) : allItems.length === 0 ? (
        <View style={s.emptyBox}>
          <Text style={s.emptyEmoji}>🏷️</Text>
          <Text style={s.emptyTitle}>No rewards yet</Text>
          <Text style={s.emptySub}>Check back soon — new rewards are added regularly</Text>
        </View>
      ) : activeCategory === 'ALL' ? (
        // ── Grouped view ──────────────────────────────────────────────────
        <ScrollView
          contentContainerStyle={s.body}
          showsVerticalScrollIndicator={false}
          refreshing={isRefetching}
          onScrollEndDrag={() => refetch()}
        >
          <View style={s.balanceBar}>
            <Text style={s.balanceBarText}>
              Your balance: <Text style={s.balanceBarPts}>{pts.toLocaleString()} pts</Text>
            </Text>
            <Text style={s.balanceBarValue}>${(pts / 100).toFixed(2)} value</Text>
          </View>

          {grouped.map(({ cat, items }) => (
            <View key={cat.key} style={s.section}>
              <TouchableOpacity
                style={[s.sectionHeader, { borderLeftColor: cat.color }]}
                onPress={() => setActiveCategory(cat.key)}
                activeOpacity={0.8}
              >
                <View style={[s.sectionIconBg, { backgroundColor: cat.bg }]}>
                  <Text style={s.sectionIcon}>{cat.emoji}</Text>
                </View>
                <View style={s.sectionHeaderText}>
                  <Text style={[s.sectionTitle, { color: cat.color }]}>{cat.label}</Text>
                  <Text style={s.sectionDesc}>{CATEGORY_DESCRIPTIONS[cat.key]}</Text>
                </View>
                <Text style={[s.sectionArrow, { color: cat.color }]}>›</Text>
              </TouchableOpacity>

              <View style={s.cardGrid}>
                {items.map(item => (
                  <CatalogCard key={item.id} item={item} pts={pts} accentColor={cat.color} />
                ))}
              </View>
            </View>
          ))}

          <RedeemHint />
          <View style={{ height: 24 }} />
        </ScrollView>
      ) : (
        // ── Filtered single-category view ──────────────────────────────────
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          contentContainerStyle={s.body}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListHeaderComponent={
            <View>
              <View style={s.balanceBar}>
                <Text style={s.balanceBarText}>
                  Your balance: <Text style={s.balanceBarPts}>{pts.toLocaleString()} pts</Text>
                </Text>
                <Text style={s.balanceBarValue}>${(pts / 100).toFixed(2)} value</Text>
              </View>
              {activeCategory !== 'ALL' && (
                <View style={[s.catDescCard, { borderLeftColor: activeCat.color, backgroundColor: activeCat.bg }]}>
                  <Text style={s.catDescIcon}>{activeCat.emoji}</Text>
                  <Text style={[s.catDescText, { color: activeCat.color }]}>
                    {CATEGORY_DESCRIPTIONS[activeCategory]}
                  </Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>{activeCat.emoji}</Text>
              <Text style={s.emptyTitle}>No {activeCat.label} rewards yet</Text>
              <Text style={s.emptySub}>Check back soon</Text>
            </View>
          }
          ListFooterComponent={filtered.length > 0 ? <RedeemHint /> : null}
          renderItem={({ item }) => (
            <CatalogCard item={item} pts={pts} accentColor={activeCat.color} wide />
          )}
        />
      )}
    </View>
  );
}

// ─── Catalog Card ──────────────────────────────────────────────────────────────

function CatalogCard({
  item,
  pts,
  accentColor,
  wide = false,
}: {
  item: any;
  pts: number;
  accentColor: string;
  wide?: boolean;
}) {
  const canAfford = pts >= item.pointsCost;
  const shortage = item.pointsCost - pts;
  const isHotFood = item.category === 'HOT_FOODS';

  return (
    <View style={[
      s.card,
      wide && s.cardWide,
      canAfford && { borderColor: accentColor + '40' },
      !canAfford && s.cardLocked,
    ]}>
      {/* Emoji circle */}
      <View style={[s.cardEmojiRing, { backgroundColor: accentColor + (canAfford ? '18' : '0d') }]}>
        <Text style={s.cardEmoji}>{item.emoji || '🎁'}</Text>
      </View>

      <View style={s.cardBody}>
        <Text style={[s.cardTitle, !canAfford && s.cardTitleMuted]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.description ? (
          <Text style={s.cardDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        {isHotFood && (
          <View style={s.locationTag}>
            <Text style={s.locationTagText}>📍 Select locations</Text>
          </View>
        )}
      </View>

      <View style={s.cardFooter}>
        <View style={[
          s.costBadge,
          canAfford
            ? { backgroundColor: accentColor, borderColor: accentColor }
            : { backgroundColor: '#f0f0f0', borderColor: COLORS.border },
        ]}>
          <Text style={[s.costPts, !canAfford && { color: COLORS.textMuted }]}>
            {item.pointsCost.toLocaleString()}
          </Text>
          <Text style={[s.costLabel, !canAfford && { color: COLORS.textMuted }]}>pts</Text>
        </View>
        {!canAfford && (
          <Text style={s.shortageText}>-{shortage.toLocaleString()} pts</Text>
        )}
      </View>
    </View>
  );
}

// ─── Redeem Hint ───────────────────────────────────────────────────────────────

function RedeemHint() {
  return (
    <View style={s.redeemHint}>
      <Text style={s.redeemHintIcon}>💡</Text>
      <Text style={s.redeemHintText}>
        To redeem a reward, show your QR code to the cashier and ask them to process your catalog reward.
      </Text>
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // Header
  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10,
  },
  headerTitle: { color: '#fff', fontSize: 24, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3, fontWeight: '600' },
  ptsPill: {
    flexDirection: 'row', alignItems: 'baseline',
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  ptsPillNum: { color: '#fff', fontSize: 17, fontWeight: '900' },
  ptsPillLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '700' },

  // Category pills
  catRow: { paddingHorizontal: 16, paddingBottom: 14, gap: 8, flexDirection: 'row' },
  catPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: 'transparent',
  },
  catPillActive: { backgroundColor: '#fff', borderColor: '#fff' },
  catPillEmoji: { fontSize: 14 },
  catPillLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '700' },
  catPillLabelActive: { color: COLORS.secondary },
  catCount: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, minWidth: 20, alignItems: 'center',
  },
  catCountActive: { backgroundColor: COLORS.secondary + '15' },
  catCountText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800' },
  catCountTextActive: { color: COLORS.secondary },

  // Body
  body: { padding: 16, gap: 20, paddingBottom: 32 },

  // Balance bar
  balanceBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 14, padding: '12px 16px' as any,
    paddingHorizontal: 16, paddingVertical: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  balanceBarText: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  balanceBarPts: { color: COLORS.secondary, fontWeight: '900' },
  balanceBarValue: { fontSize: 13, color: COLORS.success, fontWeight: '700' },

  // Category description card
  catDescCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 14, padding: 14, borderLeftWidth: 4,
    marginBottom: 4,
  },
  catDescIcon: { fontSize: 22 },
  catDescText: { flex: 1, fontSize: 13, fontWeight: '700', lineHeight: 18 },

  // Section (grouped view)
  section: { gap: 10 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  sectionIconBg: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionIcon: { fontSize: 22 },
  sectionHeaderText: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 16 },
  sectionArrow: { fontSize: 28, fontWeight: '300', marginTop: -2 },

  cardGrid: { gap: 10 },

  // Card
  card: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 5, elevation: 2,
  },
  cardWide: {},
  cardLocked: { opacity: 0.6 },
  cardEmojiRing: {
    width: 54, height: 54, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  cardEmoji: { fontSize: 26 },
  cardBody: { flex: 1, gap: 3 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, lineHeight: 20 },
  cardTitleMuted: { color: COLORS.textMuted },
  cardDesc: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16 },
  locationTag: {
    alignSelf: 'flex-start', marginTop: 4,
    backgroundColor: '#FFF3E0', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  locationTagText: { fontSize: 10, color: '#E65100', fontWeight: '700' },
  cardFooter: { alignItems: 'center', gap: 4 },
  costBadge: {
    alignItems: 'center', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1.5, minWidth: 58,
  },
  costPts: { fontSize: 15, fontWeight: '900', color: '#fff' },
  costLabel: { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.75)', marginTop: 1 },
  shortageText: { fontSize: 10, color: COLORS.error, fontWeight: '700' },

  // Redeem hint
  redeemHint: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.secondary + '18',
  },
  redeemHintIcon: { fontSize: 18 },
  redeemHintText: { flex: 1, fontSize: 13, color: COLORS.text, lineHeight: 19 },

  // Loading / empty
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
