// The customer's challenges on the home screen (backend utils/challenges.ts): each with its rule, their progress and the reward. Only
// approved sales count, so a purchase shows here once its receipt is approved. In Spanish where HQ wrote it.
import { View, Text, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { challengesApi } from '../services/api';
import { COLORS } from '../constants';
import { TrophyIcon } from './Icons';

type Challenge = { id: string; kind: 'SPEND' | 'VISITS'; title: string; titleEs: string | null; description: string; descriptionEs: string | null; category: string | null;
  store: string | null; target: number; minPurchase: number | null; reward: number; repeats: boolean; endDate: string; progress: number; timesEarned: number; done: boolean };

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

export default function ChallengesSection({ storeId, enabled }: { storeId?: string; enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const es = i18n.language === 'es';
  const { data } = useQuery({ queryKey: ['my-challenges', storeId ?? ''], queryFn: () => challengesApi.mine(storeId), enabled, staleTime: 30_000 });
  const list: Challenge[] = data?.data?.data ?? [];
  if (list.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.head}><TrophyIcon size={17} color={COLORS.primary} /><Text style={s.headText}>{t('challenges.title')}</Text></View>
      {list.map((c) => {
        const cat = c.category ? t('challenges.on', { cat: t(`challenges.cat_${c.category}`) }) : '';
        const rule = c.kind === 'SPEND' ? t('challenges.spendRule', { target: money(c.target), reward: money(c.reward), cat })
          : t(c.repeats ? 'challenges.visitsRepeat' : 'challenges.visitsOnce', { n: c.target, reward: money(c.reward), cat });
        const shown = Math.min(c.progress, c.target);
        const progressText = c.kind === 'SPEND' ? t('challenges.progressSpend', { done: money(shown), target: money(c.target) }) : t('challenges.progressVisits', { done: shown, target: c.target });
        const pct = Math.max(0, Math.min(100, (shown / c.target) * 100));
        const title = (es && c.titleEs) || c.title;
        return (
          <View key={c.id} style={s.card} accessible accessibilityLabel={t('challenges.a11y', { title, progress: c.done ? t('challenges.done', { reward: money(c.reward) }) : progressText })}>
            <Text style={s.title} numberOfLines={2}>{title}</Text>
            <Text style={s.rule}>{rule}</Text>
            {c.kind === 'VISITS' && c.minPurchase ? <Text style={s.small}>{t('challenges.minEach', { min: money(c.minPurchase) })}</Text> : null}
            <View style={s.barBg}><View style={[s.bar, { width: `${pct}%` }, c.done && { backgroundColor: COLORS.success }]} /></View>
            <View style={s.row}>
              <Text style={[s.small, { fontWeight: '700', color: c.done ? COLORS.success : COLORS.text }]}>{c.done ? t('challenges.done', { reward: money(c.reward) }) : progressText}</Text>
              <Text style={s.small}>{t('challenges.endsOn', { date: new Date(c.endDate).toLocaleDateString(es ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' }) })}</Text>
            </View>
            {c.repeats && c.timesEarned > 0 ? <Text style={s.small}>{t('challenges.earned', { count: c.timesEarned })}</Text> : null}
            {c.store ? <Text style={s.small}>{t('challenges.store', { store: c.store })}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 16, marginTop: 18, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 3 },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  rule: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  small: { fontSize: 12, color: COLORS.textMuted },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#EEF1F5', overflow: 'hidden', marginTop: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
});
