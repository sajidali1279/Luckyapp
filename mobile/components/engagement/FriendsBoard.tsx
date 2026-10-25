// Friends leaderboard (2026-10-24, admin > Engagement): a private race inside each invite circle, on the Leaderboard's Friends tab. Nobody
// shows until they tap Join; names only along invite lines (other friends of the same inviter are "A friend"); visit days or points, this
// week (or month) and the one before. The server applies every rule (backend utils/friendsBoard.ts); this draws its answer.
import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, type NativeSyntheticEvent, type NativeScrollEvent } from 'react-native';
import { router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from '../ScaledText';
import RefreshControl from '../AppRefreshControl';
import { COLORS } from '../../constants';
import { engagementApi } from '../../services/api';
import { haptic } from '../../utils/haptics';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import ErrorState from '../ErrorState';

type Row = { rank: number | null; name: string | null; value: number; isMe: boolean };
type Circle = { key: 'own' | 'inviter'; headName: string | null; size: number; need: number; locked: boolean; rows: Row[]; more: number };
type Board = { enabled: false } | { enabled: true; joined: boolean; metric: 'VISITS' | 'POINTS'; period: 'WEEK' | 'MONTH'; when: 'this' | 'last'; circles: Circle[] };

const initials = (name: string | null) => (name ? name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase() : '🙂');

export default function FriendsBoard({ onScroll, scrollEventThrottle }: { onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void; scrollEventThrottle?: number }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [when, setWhen] = useState<'this' | 'last'>('this');
  const q = useQuery({ queryKey: ['friends-board', when], queryFn: async () => (await engagementApi.friends(when)).data.data as Board, staleTime: 60_000 });
  const { refreshing, onRefresh } = usePullRefresh([() => q.refetch()]);
  const refresh = () => qc.invalidateQueries({ queryKey: ['friends-board'] });
  const failed = (e: any) => { Toast.show({ type: 'info', text1: e?.response?.status === 400 ? t('friends.off') : t('friends.tryAgain') }); refresh(); };   // 400: HQ switched it off
  const join = useMutation({ mutationFn: () => engagementApi.friendsJoin(), onSuccess: () => { haptic.success(); refresh(); }, onError: failed });
  const leave = useMutation({ mutationFn: () => engagementApi.friendsLeave(), onSuccess: () => { haptic.tap(); refresh(); }, onError: failed });
  const askLeave = () => Alert.alert(t('friends.leaveTitle'), t('friends.leaveBody'), [
    { text: t('friends.cancel'), style: 'cancel' },
    { text: t('friends.leaveYes'), style: 'destructive', onPress: () => leave.mutate() },
  ]);
  const invite = () => { haptic.tap(); router.push('/(customer)/invite-friends'); };

  if (q.isLoading) return <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>;
  if (q.isError || !q.data) return <ErrorState message={t('friends.loadError')} onRetry={() => q.refetch()} />;
  const b = q.data;
  if (!b.enabled) return <View style={s.center}><Text style={s.muted}>{t('friends.off')}</Text></View>;

  const value = (v: number) => (b.metric === 'POINTS' ? t('friends.pts', { pts: v.toLocaleString('en-US') }) : t('friends.days', { count: v }));
  const periods = b.period === 'MONTH' ? [t('friends.thisMonth'), t('friends.lastMonth')] : [t('friends.thisWeek'), t('friends.lastWeek')];

  return (
    <ScrollView contentContainerStyle={s.body} onScroll={onScroll} scrollEventThrottle={scrollEventThrottle} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}>
      {!b.joined ? (
        <View style={s.card}>
          <Text style={s.big}>🏁</Text>
          <Text style={s.title}>{t('friends.joinTitle')}</Text>
          <Text style={s.text}>{t('friends.joinBody')}</Text>
          <TouchableOpacity style={[s.btn, join.isPending && { opacity: 0.6 }]} disabled={join.isPending} onPress={() => join.mutate()} accessibilityRole="button" activeOpacity={0.85}>
            {join.isPending ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t('friends.joinBtn')}</Text>}
          </TouchableOpacity>
        </View>
      ) : b.circles.length === 0 ? (
        <View style={s.card}>
          <Text style={s.big}>👋</Text>
          <Text style={s.title}>{t('friends.noneTitle')}</Text>
          <Text style={s.text}>{t('friends.noneBody')}</Text>
          <TouchableOpacity style={s.btn} onPress={invite} accessibilityRole="button" activeOpacity={0.85}><Text style={s.btnText}>{t('friends.invite')}</Text></TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={s.chips}>
            {(['this', 'last'] as const).map((w, i) => (
              <TouchableOpacity key={w} style={[s.chip, when === w && s.chipOn]} onPress={() => { haptic.select(); setWhen(w); }} accessibilityRole="tab" accessibilityState={{ selected: when === w }}>
                <Text style={[s.chipText, when === w && s.chipTextOn]}>{periods[i]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.muted}>{b.metric === 'POINTS' ? t('friends.metricPoints') : t('friends.metricVisits')}</Text>
          {b.circles.map((c) => (
            <View key={c.key} style={s.card}>
              <Text style={s.circleTitle}>{c.key === 'own' ? t('friends.ownCircle') : t('friends.inviterCircle', { name: c.headName ?? '' })}</Text>
              {c.locked ? (
                <>
                  <Text style={s.text}>{t('friends.locked', { joined: c.size, total: c.size + c.need })}</Text>
                  <Text style={s.muted}>{t('friends.lockedHint', { count: c.need })}</Text>
                  <TouchableOpacity style={s.btnSecondary} onPress={invite} accessibilityRole="button"><Text style={s.btnSecondaryText}>{t('friends.invite')}</Text></TouchableOpacity>
                </>
              ) : (
                <>
                  {c.rows.every((r) => r.value <= 0) && <Text style={s.muted}>{t('friends.nobody')}</Text>}
                  {c.rows.map((r, i) => {
                    const name = r.name ?? t('friends.aFriend');
                    return (
                      <View key={i} style={[s.row, r.isMe && s.rowMe]} accessible accessibilityLabel={`${r.rank ? `#${r.rank}, ` : ''}${name}${r.isMe ? ` ${t('friends.you')}` : ''}, ${value(r.value)}`}>
                        <Text style={s.rank}>{r.rank ? `#${r.rank}` : '-'}</Text>
                        <View style={[s.avatar, r.isMe && { backgroundColor: COLORS.primary }]}><Text style={[s.avatarText, r.isMe && { color: '#fff' }]}>{initials(r.name)}</Text></View>
                        <Text style={[s.name, r.isMe && s.nameMe]} numberOfLines={1}>{name}{r.isMe ? ` ${t('friends.you')}` : ''}</Text>
                        <Text style={[s.value, r.isMe && s.nameMe]}>{value(r.value)}</Text>
                      </View>
                    );
                  })}
                  {c.more > 0 && <Text style={s.muted}>{t('friends.more', { count: c.more })}</Text>}
                </>
              )}
            </View>
          ))}
        </>
      )}
      {b.joined && (
        <TouchableOpacity style={s.leave} onPress={askLeave} disabled={leave.isPending} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.leaveText}>{t('friends.leave')}</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16, gap: 12, paddingBottom: 48 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: '#EEF1F5' },
  big: { fontSize: 34, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  text: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  muted: { fontSize: 12, color: COLORS.textMuted },
  btn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 4 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnSecondary: { alignSelf: 'flex-start', borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 8, marginTop: 2 },
  btnSecondaryText: { color: COLORS.primary, fontWeight: '800', fontSize: 13 },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  chipOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  chipTextOn: { color: '#fff' },
  circleTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 12 },
  rowMe: { backgroundColor: '#FFF1F2' },
  rank: { width: 34, fontSize: 14, fontWeight: '900', color: COLORS.textMuted },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 12, fontWeight: '800', color: COLORS.text },
  name: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  nameMe: { color: COLORS.primary, fontWeight: '900' },
  value: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  leave: { alignSelf: 'center', paddingVertical: 8 },
  leaveText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textDecorationLine: 'underline' },
});
