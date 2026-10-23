// My progress (2026-10-24, replaces the Badges screen): the visit streak with its milestones, the store goals running now, and every badge with how
// close it is. Home shows only the two small cards and a link here. Each part appears only while HQ has it on (admin > Engagement).
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { Text } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../../constants';
import ErrorState from '../../components/ErrorState';
import BackButton from '../../components/BackButton';
import FadeSlideIn from '../../components/FadeSlideIn';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import { useEngagement, type BadgeRow } from '../../hooks/useEngagement';
import { StreakCard, GoalCard } from '../../components/engagement/EngagementHome';
import { useCurrentStoreId } from '../../utils/geo';
import { useQuery } from '@tanstack/react-query';
import { storesApi } from '../../services/api';

export default function ProgressScreen() {
  const { t, i18n } = useTranslation();
  const es = i18n.language === 'es';
  const largeTitle = useLargeTitleScroll();
  // the goals are for the store the customer is at (or last bought at), like on Home
  const stores = useQuery({ queryKey: ['gas-prices'], queryFn: () => storesApi.getGasPrices(), staleTime: 30 * 60_000 });
  const list: { id: string }[] = stores.data?.data?.data ?? [];
  const nearest = useCurrentStoreId(list as any, list.map((x) => x.id));
  const q = useEngagement(nearest, true);
  const { refreshing, onRefresh } = usePullRefresh([() => q.refetch()]);
  const d = q.data;
  const b = d?.badges ?? null;
  const goals = d?.goals ?? [];
  const sorted: BadgeRow[] = b ? [...b.badges].sort((x, y) => Number(y.earned) - Number(x.earned) || y.progress / y.target - x.progress / x.target) : [];
  const nothing = !!d && !d.streak && !b && goals.length === 0;

  return (
    <View style={s.root}>
      <LargeTitleHeader title={t('engagement.progressTitle')} subtitle={b ? t('engagement.badgesCount', { earned: b.earned, total: b.total }) : undefined} scrollY={largeTitle.scrollY} left={<BackButton variant="light" />} />
      {q.isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : q.isError ? (
        <ErrorState message={t('engagement.loadError')} onRetry={() => q.refetch()} />
      ) : nothing ? (
        <View style={s.center}><Text style={s.emptyTitle}>{t('engagement.progressOff')}</Text></View>
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={s.body}
            showsVerticalScrollIndicator={false}
            onScroll={largeTitle.onScroll}
            scrollEventThrottle={largeTitle.scrollEventThrottle}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
          >
            {d?.streak && <StreakCard streak={d.streak} share={d.config.sharing.enabled ? d.config.sharing.message : null} />}
            {goals.length > 0 && <Text style={s.section}>{t('engagement.goalsTitle')}</Text>}
            {goals.map((g) => <GoalCard key={g.id} g={g} />)}
            {b && <Text style={s.section}>{t('engagement.badgesTitle')}</Text>}
            {b && (
              <View style={s.grid}>
                {sorted.map((item) => {
                  const name = es ? item.nameEs : item.name;
                  const desc = es ? item.descEs : item.desc;
                  return (
                    <View key={item.key} style={[s.badgeCard, !item.earned && s.badgeCardLocked]} accessible accessibilityLabel={`${name}. ${desc}. ${item.earned ? t('engagement.earned') : `${item.progress} / ${item.target}`}`}>
                      <View style={[s.badge, !item.earned && s.badgeLocked]}><Text style={[s.emoji, !item.earned && { opacity: 0.35 }]}>{item.emoji}</Text></View>
                      <Text style={s.name} numberOfLines={2}>{name}</Text>
                      <Text style={s.desc} numberOfLines={3}>{desc}</Text>
                      {item.earned ? <Text style={s.earned}>{t('engagement.earned')}</Text> : (
                        <View style={{ alignSelf: 'stretch', gap: 3 }}>
                          <View style={s.barBg}><View style={[s.bar, { width: `${Math.max(3, (item.progress / item.target) * 100)}%` }]} /></View>
                          <Text style={s.prog}>{item.progress} / {item.target}</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
        </FadeSlideIn>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  body: { padding: 16, gap: 10, paddingBottom: 40 },
  section: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginTop: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  badgeCard: { width: '48%', flexGrow: 1, backgroundColor: '#fff', borderRadius: 18, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#EEF1F5' },
  badgeCardLocked: { backgroundColor: '#F8FAFC' },
  badge: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF7ED', borderWidth: 2, borderColor: '#FDBA74', alignItems: 'center', justifyContent: 'center' },
  badgeLocked: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  emoji: { fontSize: 30 },
  name: { fontSize: 14, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  desc: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
  earned: { fontSize: 12, fontWeight: '800', color: COLORS.success },
  barBg: { height: 6, borderRadius: 3, backgroundColor: '#EEF1F5', overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: COLORS.primary },
  prog: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', fontWeight: '600' },
});
