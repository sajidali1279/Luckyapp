// The engagement cards on the customer's Home (2026-10-23): a visit streak, the daily check-in, a store goal and the latest badges. Each shows
// only while HQ has it switched on (admin > Engagement); with nothing on, this draws nothing at all.
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

const APP_LINK = 'https://luckystop.cliffindus.com';
const FLAME = '#F97316';

function Bar({ pct, color = COLORS.primary }: { pct: number; color?: string }) {
  return <View style={s.barBg}><View style={[s.bar, { width: `${Math.max(3, Math.min(100, pct))}%`, backgroundColor: color }]} /></View>;
}

function StreakCard({ streak, share }: { streak: Streak; share: string | null }) {
  const { t, i18n } = useTranslation();
  const next = streak.next;
  const reachedAll = streak.weeks > 0 && !next;
  const sunday = streak.endsOn ? new Date(`${streak.endsOn}T12:00:00`).toLocaleDateString(i18n.language === 'es' ? 'es-US' : 'en-US', { weekday: 'long' }) : '';
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

function CheckInCard({ c }: { c: CheckIn }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const go = useMutation({
    mutationFn: async () => (await engagementApi.checkIn()).data.data as { pts: number; streakDays: number },
    onSuccess: (r) => {
      haptic.success();
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
  const week = Array.from({ length: 7 }, (_, i) => i + 1);
  const run = c.streakDays;   // days already done in the current run (today included once checked in)
  return (
    <View style={s.card}>
      <View style={s.head}>
        <Text style={s.flame}>📅</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{t('engagement.checkInTitle')}</Text>
          <Text style={s.sub}>
            {c.doneToday ? t('engagement.checkInDone', { n: c.streakDays })
              : c.available ? (c.mode === 'FIXED' ? t('engagement.checkInFixed', { pts: c.todayPts ?? 0 }) : t('engagement.checkInMystery'))
              : t(`engagement.checkInWhy_${c.reason ?? 'OFF'}`, { defaultValue: t('engagement.checkInFailed') })}
          </Text>
        </View>
        {c.available && (
          <TouchableOpacity style={[s.btn, go.isPending && { opacity: 0.6 }]} disabled={go.isPending} onPress={() => go.mutate()} accessibilityRole="button" activeOpacity={0.85}>
            {go.isPending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>{c.mode === 'MYSTERY' ? t('engagement.reveal') : t('engagement.checkIn')}</Text>}
          </TouchableOpacity>
        )}
      </View>
      <View style={s.dots}>
        {week.map((d) => {
          const done = d <= (run % 7 === 0 && run > 0 ? 7 : run % 7);
          return <View key={d} style={s.dotCol}><View style={[s.dotSm, done && { backgroundColor: COLORS.success, borderColor: COLORS.success }]}>{d === 7 ? <Text style={[s.dotText, done && { color: '#fff' }]}>🎁</Text> : done ? <Text style={[s.dotText, { color: '#fff' }]}>✓</Text> : null}</View></View>;
        })}
      </View>
      {c.weekBonusPts > 0 && <Text style={s.small}>{t('engagement.dayBonus', { pts: c.weekBonusPts })}</Text>}
    </View>
  );
}

function GoalCard({ g }: { g: Goal }) {
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

export default function EngagementHome({ storeId, enabled }: { storeId?: string; enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const q = useEngagement(storeId, enabled);
  const d = q.data;
  if (!d) return null;
  const es = i18n.language === 'es';
  const goals = d.goals ?? [];
  const badges = d.badges;
  if (!d.streak && !d.checkIn && goals.length === 0 && !badges) return null;
  // the badges worth showing: what is earned, then what is closest
  const shown = badges ? [...badges.badges].sort((a, b) => Number(b.earned) - Number(a.earned) || b.progress / b.target - a.progress / a.target).slice(0, 6) : [];
  return (
    <View style={s.wrap}>
      {d.streak && <StreakCard streak={d.streak} share={d.config.sharing.enabled ? d.config.sharing.message : null} />}
      {d.checkIn && <CheckInCard c={d.checkIn} />}
      {goals.map((g) => <GoalCard key={g.id} g={g} />)}
      {badges && (
        <TouchableOpacity style={s.card} onPress={() => router.push('/(customer)/badges' as any)} accessibilityRole="button" accessibilityLabel={t('engagement.badgesA11y', { earned: badges.earned, total: badges.total })} activeOpacity={0.85}>
          <View style={s.rowBetween}>
            <Text style={s.title}>{t('engagement.badgesTitle')}</Text>
            <Text style={s.small}>{t('engagement.badgesCount', { earned: badges.earned, total: badges.total })}  ›</Text>
          </View>
          <View style={s.badgeRow}>
            {shown.map((b) => (
              <View key={b.key} style={s.badgeCol}>
                <View style={[s.badge, !b.earned && s.badgeLocked]}><Text style={[s.badgeEmoji, !b.earned && { opacity: 0.35 }]}>{b.emoji}</Text></View>
                <Text style={s.badgeName} numberOfLines={2}>{es ? b.nameEs : b.name}</Text>
              </View>
            ))}
          </View>
        </TouchableOpacity>
      )}
    </View>
  );
}

export const shadow = Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.07, shadowRadius: 10 }, android: { borderWidth: 1, borderColor: '#EEF1F5' } });
const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 18, gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 14, gap: 8, ...(shadow as object) },
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
  dotSm: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  dotText: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  dotLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, minWidth: 92, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  linkBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  link: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  badgeRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  badgeCol: { alignItems: 'center', width: 52, gap: 4 },
  badge: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFF7ED', borderWidth: 2, borderColor: '#FDBA74', alignItems: 'center', justifyContent: 'center' },
  badgeLocked: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  badgeEmoji: { fontSize: 22 },
  badgeName: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', fontWeight: '600' },
});
