// The customer's challenges on the home screen (backend utils/challenges.ts): each with its rule, their progress and the reward. Only
// approved sales count, so a purchase shows here once its receipt is approved. In Spanish where HQ wrote it.
// Challenge of the week (2026-10-24, admin > Engagement): the week's pick comes first from the server, drawn bigger with a countdown to the
// end of its week (the server sends that instant: the week of Nov 1 is 169 hours, and phones in other timezones would get it wrong). The
// end dates come as store dates (endsOn), so a Sunday 11:59 PM end never reads as Monday on a phone in another timezone.
import { useEffect, useState } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Text } from './ScaledText';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { challengesApi } from '../services/api';
import { COLORS } from '../constants';
import { TrophyIcon } from './Icons';
import { useEngagementFlags } from '../hooks/useEngagement';

type Challenge = { id: string; kind: 'SPEND' | 'VISITS'; title: string; titleEs: string | null; description: string; descriptionEs: string | null; category: string | null;
  store: string | null; target: number; minPurchase: number | null; reward: number; repeats: boolean; endDate: string; progress: number; timesEarned: number; done: boolean;
  endsOn?: string; featured?: boolean; endsAt?: string; weekEndsOn?: string };

const money = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
// A reward is stored in dollars and shown in points, like every other balance in the app: $2 is 200 pts (2026-10-20)
const pts = (dollars: number) => Math.round(dollars * 100).toLocaleString('en-US');
// HQ often uses the rule itself as the title ("Spend $30.00 on groceries, get $3.00 back"); then the rule line would just repeat it
const same = (a: string, b: string) => { const k = (x: string) => x.toLowerCase().replace(/\.00\b/g, '').replace(/[^a-z0-9]/g, ''); return k(a) === k(b); };
// a store date ('2026-11-01') read at noon, so no timezone can move it to another day
const storeDay = (key: string) => new Date(`${key}T12:00:00`);

/** Time left until `endsAt`, every minute; when it runs out the list is fetched again (next week's pick, or none). */
function useTimeLeft(endsAt?: string) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [endsAt]);
  const left = endsAt ? new Date(endsAt).getTime() - now : 0;
  useEffect(() => { if (endsAt && left <= 0) qc.invalidateQueries({ queryKey: ['my-challenges'] }); }, [endsAt, left <= 0]);   // eslint-disable-line react-hooks/exhaustive-deps
  return left;
}

function Countdown({ c }: { c: Challenge }) {
  const { t, i18n } = useTranslation();
  const left = useTimeLeft(c.endsAt);
  if (!c.endsAt || left <= 0) return null;
  const days = Math.floor(left / 86_400_000), hours = Math.floor(left / 3_600_000), minutes = Math.max(1, Math.floor(left / 60_000));
  const text = days >= 1 ? t('weeklyChallenge.leftDays', { count: days }) : hours >= 1 ? t('weeklyChallenge.leftHours', { count: hours }) : t('weeklyChallenge.leftMinutes', { count: minutes });
  const day = c.weekEndsOn ? storeDay(c.weekEndsOn).toLocaleDateString(i18n.language === 'es' ? 'es-US' : 'en-US', { weekday: 'long' }) : '';
  return (
    <View style={s.timer} accessible accessibilityLabel={`${text}. ${day ? t('weeklyChallenge.endsDay', { day }) : ''}`}>
      <Text style={s.timerText} maxFontSizeMultiplier={1.3}>⏳ {text}</Text>
      {day ? <Text style={s.timerDay} maxFontSizeMultiplier={1.3}>{t('weeklyChallenge.endsDay', { day })}</Text> : null}
    </View>
  );
}

export default function ChallengesSection({ storeId, enabled }: { storeId?: string; enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const es = i18n.language === 'es';
  const { data } = useQuery({ queryKey: ['my-challenges', storeId ?? ''], queryFn: () => challengesApi.mine(storeId), enabled, staleTime: 30_000 });
  const list: Challenge[] = data?.data?.data ?? [];
  const punch = !!useEngagementFlags()?.punchCards;   // punch cards (2026-10-23, admin > Engagement): a visits challenge drawn as stamps
  if (list.length === 0) return null;
  return (
    <View style={s.section}>
      <View style={s.head}><TrophyIcon size={17} color={COLORS.primary} /><Text style={s.headText}>{t('challenges.title')}</Text></View>
      {list.map((c) => {
        const featured = !!c.featured;
        const cat = c.category ? t('challenges.on', { cat: t(`challenges.cat_${c.category}`) }) : '';
        const rule = c.kind === 'SPEND' ? t('challenges.spendRule', { target: money(c.target), reward: pts(c.reward), cat })
          : t(c.repeats ? 'challenges.visitsRepeat' : 'challenges.visitsOnce', { n: c.target, reward: pts(c.reward), cat });
        const shown = Math.min(c.progress, c.target);
        const progressText = c.kind === 'SPEND' ? t('challenges.progressSpend', { done: money(shown), target: money(c.target) }) : t('challenges.progressVisits', { done: shown, target: c.target });
        const pct = Math.max(0, Math.min(100, (shown / c.target) * 100));
        const title = (es && c.titleEs) || c.title;
        const description = ((es && c.descriptionEs) || c.description || '').trim();
        const ends = (c.endsOn ? storeDay(c.endsOn) : new Date(c.endDate)).toLocaleDateString(es ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' });
        return (
          <View key={c.id} style={[s.card, featured && s.featured]} accessible accessibilityLabel={`${featured ? `${t('weeklyChallenge.kicker')}. ` : ''}${t('challenges.a11y', { title, progress: c.done ? t('challenges.done', { reward: pts(c.reward) }) : progressText })}`}>
            {featured && <Text style={s.kicker}>🏆 {t('weeklyChallenge.kicker')}</Text>}
            <Text style={[s.title, featured && s.titleBig]} numberOfLines={2}>{title}</Text>
            {!same(title, rule) && <Text style={s.rule}>{rule}</Text>}
            {description ? <Text style={s.desc} numberOfLines={featured ? 4 : 2}>{description}</Text> : null}
            {c.kind === 'VISITS' && c.minPurchase ? <Text style={s.small}>{t('challenges.minEach', { min: money(c.minPurchase) })}</Text> : null}
            {punch && c.kind === 'VISITS' && c.target <= 12 ? (
              <View style={s.stamps}>
                {Array.from({ length: c.target }, (_, i) => (
                  <View key={i} style={[s.stamp, i < shown && s.stampOn, c.done && { backgroundColor: COLORS.success, borderColor: COLORS.success }]}>
                    <Text style={[s.stampText, i < shown && { color: '#fff' }]}>{i < shown ? '✓' : i + 1}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={s.barBg}><View style={[s.bar, { width: `${pct}%` }, c.done && { backgroundColor: COLORS.success }]} /></View>
            )}
            <View style={s.row}>
              <Text style={[s.small, { fontWeight: '700', color: c.done ? COLORS.success : COLORS.text }]}>{c.done ? t('challenges.done', { reward: pts(c.reward) }) : progressText}</Text>
              {!featured && <Text style={s.small}>{t('challenges.endsOn', { date: ends })}</Text>}
            </View>
            {featured && !c.done && <Countdown c={c} />}
            {c.repeats && c.timesEarned > 0 ? <Text style={s.small}>{t('challenges.earned', { count: c.timesEarned })}</Text> : null}
            {c.store ? <Text style={s.small}>{t('challenges.store', { store: c.store })}</Text> : null}
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  stamps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stamp: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderStyle: 'dashed', borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stampOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary, borderStyle: 'solid' },
  stampText: { fontSize: 12, fontWeight: '800', color: '#94A3B8' },
  section: { paddingHorizontal: 16, marginTop: 18, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headText: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  // Soft card (2026-10-12): a hairline border, a faint shadow on iPhone only (Android's elevation drew grey edges)
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 4, ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 }, default: {} }), borderWidth: 1, borderColor: '#EEF0F3' },
  featured: { borderWidth: 2, borderColor: '#F4A261', backgroundColor: '#FFFBF5', padding: 16 },
  kicker: { fontSize: 12, fontWeight: '900', color: '#B45309', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  titleBig: { fontSize: 18 },
  rule: { fontSize: 13, fontWeight: '700', color: COLORS.primary },
  desc: { fontSize: 13, color: COLORS.text, lineHeight: 18 },
  small: { fontSize: 12, color: COLORS.textMuted },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#EEF1F5', overflow: 'hidden', marginTop: 6 },
  bar: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  timer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FEF3C7' },
  timerText: { fontSize: 13, fontWeight: '800', color: '#92400E' },
  timerDay: { fontSize: 12, fontWeight: '700', color: '#92400E' },
});
