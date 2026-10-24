// The engagement cards on the customer's Home (2026-10-23, compacted 2026-10-24): the visit streak and the daily check-in side by side as two
// small cards, and one "My progress" row that opens the full picture (streak milestones, store goals, badges). Each shows only while HQ has it
// switched on (admin > Engagement); with nothing on, this draws nothing at all. The full cards (StreakCard, GoalCard) are exported for the
// My progress screen.
import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Share, Platform, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from '../ScaledText';
import { COLORS } from '../../constants';
import { engagementApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { haptic } from '../../utils/haptics';
import { useEngagement, type CheckIn, type Goal, type Streak } from '../../hooks/useEngagement';
import Burst from './Burst';
import { askForRatingSoon } from '../../utils/ratePrompt';

const APP_LINK = 'https://luckystop.cliffindus.com';
const FLAME = '#F97316';

export function Bar({ pct, color = COLORS.primary }: { pct: number; color?: string }) {
  return <View style={s.barBg}><View style={[s.bar, { width: `${Math.max(3, Math.min(100, pct))}%`, backgroundColor: color }]} /></View>;
}

const dayName = (endsOn: string | null, lang: string) => (endsOn ? new Date(`${endsOn}T12:00:00`).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'long' }) : '');

// ─── the full streak card (My progress) ─────────────────────────────────────────────────────────────────────────────────────────────
export function StreakCard({ streak, share }: { streak: Streak; share: string | null }) {
  const { t, i18n } = useTranslation();
  const next = streak.next;
  const reachedAll = streak.weeks > 0 && !next;
  const sunday = dayName(streak.endsOn, i18n.language);
  const shareIt = () => { haptic.tap(); Share.share({ message: `${share} ${APP_LINK}` }).catch(() => {}); };
  return (
    <View style={s.card} accessible accessibilityLabel={streak.weeks > 0 ? t('engagement.streakA11y', { weeks: streak.weeks }) : t('engagement.streakNoneA11y')}>
      <View style={s.head}>
        <Text style={s.flame}>🔥</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{streak.weeks > 0 ? t('engagement.streakTitle', { count: streak.weeks }) : t('engagement.streakStart')}</Text>
          <Text style={s.sub}>
            {streak.weeks === 0 ? t('engagement.streakStartSub', { min: streak.minPurchase })
              : streak.atRisk ? t('engagement.streakAtRisk', { day: sunday })
              : reachedAll ? t('engagement.streakAll')
              : t('engagement.streakNext', { weeks: next!.weeks, pts: next!.pts })}
          </Text>
        </View>
      </View>
      {streak.milestones.length > 0 && (
        <View style={s.dots}>
          {streak.milestones.map((m) => (
            <View key={m.weeks} style={s.dotCol}>
              <View style={[s.dot, m.reached && { backgroundColor: FLAME, borderColor: FLAME }]}><Text style={[s.dotText, m.reached && { color: '#fff' }]}>{m.reached ? '✓' : m.weeks}</Text></View>
              <Text style={s.dotLabel}>{t('engagement.plusPts', { pts: m.pts })}</Text>
            </View>
          ))}
        </View>
      )}
      {streak.atRisk && <Text style={s.warn}>{t('engagement.streakWarn')}</Text>}
      {share && streak.weeks > 0 && (
        <TouchableOpacity onPress={shareIt} style={s.linkBtn} accessibilityRole="button"><Text style={s.link}>{t('engagement.share')}</Text></TouchableOpacity>
      )}
    </View>
  );
}

// ─── the two small cards on Home ────────────────────────────────────────────────────────────────────────────────────────────────────
function StreakMini({ streak, full }: { streak: Streak; full: boolean }) {
  const { t, i18n } = useTranslation();
  const next = streak.next;
  const sunday = dayName(streak.endsOn, i18n.language);
  const risk = streak.atRisk && streak.weeks > 0;
  const line = streak.weeks === 0 ? t('engagement.miniStart', { min: streak.minPurchase })
    : risk ? t('engagement.miniAtRisk', { day: sunday })
    : next ? t('engagement.miniNext', { weeks: next.weeks, pts: next.pts })
    : t('engagement.miniAll');
  return (
    <TouchableOpacity
      style={[s.mini, full && s.miniFull, risk && s.miniWarn]}
      activeOpacity={0.85}
      onPress={() => { haptic.tap(); router.push('/(customer)/progress' as any); }}
      accessibilityRole="button"
      accessibilityLabel={`${streak.weeks > 0 ? t('engagement.streakA11y', { weeks: streak.weeks }) : t('engagement.streakNoneA11y')}. ${line}`}
    >
      <View style={s.miniTop}>
        <Text style={s.miniFlame}>🔥</Text>
        <Text style={s.miniBig} maxFontSizeMultiplier={1.2}>{streak.weeks}</Text>
        <Text style={s.miniUnit} numberOfLines={1}>{t('engagement.miniWeeks', { count: streak.weeks })}</Text>
      </View>
      <Text style={[s.miniLine, risk && { color: '#B45309', fontWeight: '700' }]} numberOfLines={3}>{line}</Text>
    </TouchableOpacity>
  );
}

function CheckInMini({ c, full }: { c: CheckIn; full: boolean }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [burst, setBurst] = useState(0);
  const go = useMutation({
    mutationFn: async () => (await engagementApi.checkIn()).data.data as { pts: number; streakDays: number },
    onSuccess: (r) => {
      haptic.success();
      setBurst((n) => n + 1);
      askForRatingSoon();   // a bonus just paid is a good moment to ask (once ever, HQ's switch)
      Toast.show({ type: 'success', text1: r.pts > 0 ? t('engagement.checkedIn', { pts: r.pts }) : t('engagement.checkedInNone'), text2: t('engagement.dayN', { n: r.streakDays }) });
      qc.invalidateQueries({ queryKey: ['engagement'] });
      useAuthStore.getState().refreshAccount();
    },
    onError: (e: any) => {
      const code = e?.response?.data?.code as string | undefined;
      Toast.show({ type: 'info', text1: code ? t(`engagement.checkInWhy_${code}`, { defaultValue: e?.response?.data?.error || t('engagement.checkInFailed') }) : t('engagement.checkInFailed') });
      qc.invalidateQueries({ queryKey: ['engagement'] });
    },
  });
  const run = c.streakDays;
  const filled = c.doneToday && run > 0 && run % 7 === 0 ? 7 : run % 7;   // a finished week of 7 starts again empty the next day
  const why = c.doneToday ? t('engagement.miniDone', { n: c.streakDays })
    : c.available ? (c.mode === 'FIXED' ? t('engagement.miniFixed', { pts: c.todayPts ?? 0 }) : t('engagement.miniMystery'))
    : t(`engagement.checkInWhy_${c.reason ?? 'OFF'}`, { defaultValue: t('engagement.checkInFailed') });
  return (
    <View style={[s.mini, full && s.miniFull]}>
      <View style={s.miniTop}>
        <Text style={s.miniFlame}>📅</Text>
        <Text style={s.miniUnit} numberOfLines={1}>{t('engagement.checkInTitle')}</Text>
      </View>
      {c.available ? (
        <TouchableOpacity style={[s.btn, go.isPending && { opacity: 0.6 }]} disabled={go.isPending} onPress={() => go.mutate()} accessibilityRole="button" accessibilityLabel={`${t('engagement.checkInTitle')}. ${why}`} activeOpacity={0.85}>
          {go.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{c.mode === 'MYSTERY' ? t('engagement.reveal') : t('engagement.checkInPts', { pts: c.todayPts ?? 0 })}</Text>}
        </TouchableOpacity>
      ) : (
        <Text style={[s.miniLine, c.doneToday && { color: COLORS.success, fontWeight: '800' }]} numberOfLines={3}>{c.doneToday ? '✓ ' : ''}{why}</Text>
      )}
      <View style={s.miniDots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: 7 }, (_, i) => (
          <View key={i} style={[s.tiny, i < filled && { backgroundColor: COLORS.success, borderColor: COLORS.success }]}>{i === 6 && i >= filled ? <Text style={{ fontSize: 8 }}>🎁</Text> : null}</View>
        ))}
      </View>
      <Burst fire={burst} />
    </View>
  );
}

// ─── store goals (My progress) ──────────────────────────────────────────────────────────────────────────────────────────────────────
export function GoalCard({ g }: { g: Goal }) {
  const { t, i18n } = useTranslation();
  const es = i18n.language === 'es';
  const date = new Date(g.endDate).toLocaleDateString(es ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' });
  return (
    <View style={s.card} accessible accessibilityLabel={t('engagement.goalA11y', { title: (es && g.titleEs) || g.title, done: g.progress, target: g.target })}>
      <View style={s.head}>
        <Text style={s.flame}>🏪</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{(es && g.titleEs) || g.title}</Text>
          <Text style={s.sub}>{g.reached ? t('engagement.goalReached', { store: g.store }) : t('engagement.goalSub', { store: g.store, pts: g.rewardPts, date })}</Text>
        </View>
      </View>
      <Bar pct={(g.progress / g.target) * 100} color={g.reached ? COLORS.success : COLORS.primary} />
      <View style={s.rowBetween}>
        <Text style={s.small}>{t(g.metric === 'CUSTOMERS' ? 'engagement.goalCustomers' : 'engagement.goalSales', { done: g.progress, target: g.target })}</Text>
        <Text style={[s.small, { fontWeight: '700', color: g.joined ? COLORS.success : COLORS.textMuted }]}>{g.joined ? t('engagement.goalIn') : t('engagement.goalJoin')}</Text>
      </View>
    </View>
  );
}

// ─── Home ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export default function EngagementHome({ storeId, enabled }: { storeId?: string; enabled: boolean }) {
  const { t } = useTranslation();
  const q = useEngagement(storeId, enabled);
  const d = q.data;
  if (!d) return null;
  const goals = d.goals ?? [];
  const badges = d.badges;
  if (!d.streak && !d.checkIn && goals.length === 0 && !badges) return null;
  const both = !!d.streak && !!d.checkIn;
  const lead = goals.find((g) => !g.reached) ?? goals[0];
  const parts = [
    badges ? t('engagement.progressBadges', { earned: badges.earned, total: badges.total }) : null,
    lead ? t('engagement.progressGoal', { done: lead.progress, target: lead.target }) : null,
  ].filter(Boolean).join('  ·  ');
  return (
    <View style={s.wrap}>
      {(d.streak || d.checkIn) && (
        <View style={s.pair}>
          {d.streak && <StreakMini streak={d.streak} full={!both} />}
          {d.checkIn && <CheckInMini c={d.checkIn} full={!both} />}
        </View>
      )}
      {(badges || goals.length > 0) && (
        <TouchableOpacity style={s.progressRow} onPress={() => { haptic.tap(); router.push('/(customer)/progress' as any); }} accessibilityRole="button" accessibilityLabel={`${t('engagement.progressTitle')}. ${parts}`} activeOpacity={0.85}>
          <Text style={s.flame}>🏅</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t('engagement.progressTitle')}</Text>
            <Text style={s.sub} numberOfLines={2}>{parts}</Text>
          </View>
          <Text style={s.chev}>›</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export const shadow = Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10 }, android: { borderWidth: 1, borderColor: '#EEF1F5' } });
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 18, gap: 10 },
  pair: { flexDirection: 'row', gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 8, ...(shadow as object) },
  mini: { flex: 1, backgroundColor: '#fff', borderRadius: 18, padding: 12, gap: 6, minHeight: 124, ...(shadow as object) },
  miniFull: { flex: undefined, alignSelf: 'stretch' },
  miniWarn: { borderWidth: 1.5, borderColor: '#FCD34D', backgroundColor: '#FFFBEB' },
  miniTop: { flexDirection: 'row', alignItems: 'baseline', gap: 5 },
  miniFlame: { fontSize: 20 },
  miniBig: { fontSize: 30, fontWeight: '900', color: COLORS.text, lineHeight: 34 },
  miniUnit: { fontSize: 13, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  miniLine: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16 },
  miniDots: { flexDirection: 'row', gap: 4, marginTop: 'auto' },
  tiny: { width: 14, height: 14, borderRadius: 7, borderWidth: 1.5, borderColor: '#E2E8F0', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 18, padding: 14, ...(shadow as object) },
  chev: { fontSize: 26, color: COLORS.textMuted, marginTop: -3 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flame: { fontSize: 26 },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textMuted, marginTop: 1 },
  small: { fontSize: 12, color: COLORS.textMuted },
  warn: { fontSize: 12, fontWeight: '700', color: '#B45309' },
  barBg: { height: 8, borderRadius: 4, backgroundColor: '#EEF1F5', overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  dotCol: { alignItems: 'center', gap: 3 },
  dot: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  dotText: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  dotLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  link: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
});
