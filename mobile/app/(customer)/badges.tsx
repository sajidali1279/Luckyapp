// The customer's badges (2026-10-23, HQ switch in admin > Engagement). Worked out from their own purchase history, so nothing is paid and nothing can be double counted.
import { View, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
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

export default function BadgesScreen() {
  const { t, i18n } = useTranslation();
  const es = i18n.language === 'es';
  const largeTitle = useLargeTitleScroll();
  const q = useEngagement(undefined, true);
  const { refreshing, onRefresh } = usePullRefresh([() => q.refetch()]);
  const b = q.data?.badges ?? null;
  const list: BadgeRow[] = b ? [...b.badges].sort((x, y) => Number(y.earned) - Number(x.earned) || y.progress / y.target - x.progress / x.target) : [];

  return (
    <View style={s.root}>
      <LargeTitleHeader title={t('engagement.badgesTitle')} subtitle={b ? t('engagement.badgesCount', { earned: b.earned, total: b.total }) : undefined} scrollY={largeTitle.scrollY} left={<BackButton variant="light" />} />
      {q.isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : q.isError ? (
        <ErrorState message={t('engagement.loadError')} onRetry={() => q.refetch()} />
      ) : !b ? (
        <View style={s.center}><Text style={s.emptyTitle}>{t('engagement.badgesOff')}</Text></View>
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
          <FlatList
            data={list}
            numColumns={2}
            keyExtractor={(x) => x.key}
            columnWrapperStyle={{ gap: 10 }}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            onScroll={largeTitle.onScroll}
            scrollEventThrottle={largeTitle.scrollEventThrottle}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
            renderItem={({ item }) => {
              const name = es ? item.nameEs : item.name;
              const desc = es ? item.descEs : item.desc;
              return (
                <View style={[s.card, !item.earned && s.cardLocked]} accessible accessibilityLabel={`${name}. ${desc}. ${item.earned ? t('engagement.earned') : `${item.progress} / ${item.target}`}`}>
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
            }}
          />
        </FadeSlideIn>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  list: { padding: 16, gap: 10, paddingBottom: 40 },
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 14, alignItems: 'center', gap: 6, borderWidth: 1, borderColor: '#EEF1F5' },
  cardLocked: { backgroundColor: '#F8FAFC' },
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
