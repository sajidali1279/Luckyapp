// The prize game (2026-10-25, admin > Engagement > Prize game): today's free play, its chances and the official rules. The server draws the
// result first (POST /engagement/games/play); the game on screen only plays it out, then the result shows. One free play a day for every
// customer, with no purchase needed.
import { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import { COLORS } from '../../constants';
import { engagementApi } from '../../services/api';
import { haptic } from '../../utils/haptics';
import ErrorState from '../../components/ErrorState';
import BackButton from '../../components/BackButton';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import { useAuthStore } from '../../store/authStore';
import Burst from '../../components/engagement/Burst';
import SpinWheel from '../../components/engagement/games/SpinWheel';
import ScratchCard from '../../components/engagement/games/ScratchCard';
import LuckyNumber from '../../components/engagement/games/LuckyNumber';
import GameRules from '../../components/engagement/games/GameRules';
import type { GameKind, GameState, PlayResult } from '../../components/engagement/games/types';

/** The games this build can show; one HQ picks that a newer build added asks for an update. */
const SUPPORTED: GameKind[] = ['SPIN', 'SCRATCH', 'LUCKY'];
const PIECES = ['🪙', '✨', '🍀', '⭐', '🪙', '✨', '🍀', '⭐', '🪙', '✨', '🍀', '⭐'];

/** Whole minutes until `iso`, kept fresh every 30 s. */
function useMinutesTo(iso: string | null) {
  const calc = () => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 60_000)) : 0);
  const [m, setM] = useState(calc);
  useEffect(() => {
    setM(calc());
    if (!iso) return;
    const id = setInterval(() => setM(calc()), 30_000);
    return () => clearInterval(id);
  }, [iso]);   // eslint-disable-line react-hooks/exhaustive-deps
  return m;
}

export default function GamesScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { storeId } = useLocalSearchParams<{ storeId?: string }>();
  const largeTitle = useLargeTitleScroll();
  const q = useQuery({ queryKey: ['prize-game'], queryFn: async () => (await engagementApi.game()).data.data as GameState, staleTime: 30_000 });
  const [result, setResult] = useState<PlayResult | null>(null);   // this visit's play, drawn by the server
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);   // the game has played the result out
  const [burst, setBurst] = useState(0);
  const [attempt, setAttempt] = useState(0);   // a failed play starts the game over (a fresh card, nothing picked)
  const [lock, setLock] = useState(false);   // a finger on the scratch card: the page does not scroll
  const { refreshing, onRefresh } = usePullRefresh([() => q.refetch()]);
  const g = q.data;
  const minutes = useMinutesTo(g && g.enabled ? (result?.nextPlayAt ?? g.nextPlayAt) : null);

  const play = async (pick?: number) => {
    if (busy || result) return;
    setBusy(true);
    haptic.tap();
    try {
      setResult((await engagementApi.play({ storeId: storeId || undefined, pick })).data.data as PlayResult);
    } catch (e: any) {
      const code = e?.response?.data?.code as string | undefined;
      Toast.show({ type: 'info', text1: code ? t(`games.why_${code}`, { defaultValue: t('games.failed') }) : t('games.failed') });
      setBusy(false);
      setAttempt((n) => n + 1);
      qc.invalidateQueries({ queryKey: ['prize-game'] });
    }
  };
  const done = () => {
    setShown(true);
    setBusy(false);
    if (result && result.pts > 0) { setBurst((n) => n + 1); haptic.success(); } else haptic.tap();
    qc.invalidateQueries({ queryKey: ['prize-game'] });
    qc.invalidateQueries({ queryKey: ['my-history'] });
    useAuthStore.getState().refreshAccount();
  };

  const title = g && g.enabled ? t(`games.title_${g.game}`, { defaultValue: t('games.title_SPIN') }) : t('games.title_SPIN');
  const time = minutes >= 60 ? t('games.hm', { h: Math.floor(minutes / 60), m: minutes % 60 }) : t('games.m', { m: minutes });

  const body = () => {
    if (!g || !g.enabled) return null;
    const supported = SUPPORTED.includes(g.game);
    // what this customer won today: this visit's play once it has played out, else an earlier play today
    const pts = result ? (shown ? result.pts : null) : g.played ? g.played.pts : null;
    const landOn = result ? result.index : g.played ? g.prizes.findIndex((p) => p.pts === g.played!.pts) : null;
    const closed = !g.open && !g.played && !result;   // this month's prizes are all won and they have not played today
    const stage = () => {
      if (!supported) return <Text style={s.muted}>{t('games.updateApp')}</Text>;
      if (g.game === 'SCRATCH') return closed ? null : (
        <ScratchCard key={attempt} pts={result ? result.pts : g.played ? g.played.pts : null} uncovered={!!g.played && !result} onStart={() => play()} onDone={done} onTouch={setLock} />
      );
      if (g.game === 'LUCKY') return <LuckyNumber key={attempt} result={result} locked={closed || (!!g.played && !result)} busy={busy} onPlay={(n) => play(n)} onDone={done} />;
      return <SpinWheel prizes={g.prizes} landOn={landOn} animate={!!result} onDone={done} />;
    };
    return (
      <>
        <View style={s.stage}>
          {stage()}
          <Burst fire={burst} pieces={PIECES} />
        </View>
        {pts !== null ? (
          <View style={s.result} accessibilityLiveRegion="polite">
            {g.game === 'LUCKY' && result?.number != null && <Text style={s.lucky}>{pts > 0 ? t('games.luckyWon', { n: result.number }) : t('games.luckyLost', { n: result.number })}</Text>}
            <Text style={s.resultBig}>{result ? (pts > 0 ? t('games.won', { pts }) : t('games.lost')) : pts > 0 ? t('games.playedWon', { pts }) : t('games.playedLost')}</Text>
            {result && <Text style={s.resultSub}>{pts > 0 ? t('games.wonSub') : t('games.lostSub')}</Text>}
            <Text style={s.next}>{t('games.next', { time })}</Text>
          </View>
        ) : closed ? (
          <Text style={s.closed}>{t('games.closed')}</Text>
        ) : g.game === 'SCRATCH' ? (
          <Text style={s.muted}>{t('games.scratchHint')}</Text>
        ) : supported && g.game === 'SPIN' ? (
          <TouchableOpacity style={[s.btn, (busy || !!result) && { opacity: 0.7 }]} disabled={busy || !!result} onPress={() => play()} accessibilityRole="button" activeOpacity={0.85}>
            <Text style={s.btnText}>{busy || result ? t('games.spinning') : t('games.spin')}</Text>
          </TouchableOpacity>
        ) : null}
        <Text style={s.noPurchase}>{t('games.noPurchase')}</Text>
        <GameRules prizes={g.prizes} since={g.since} endsOn={g.endsOn} />
      </>
    );
  };

  return (
    <View style={s.root}>
      <LargeTitleHeader title={title} subtitle={t('games.subtitle')} scrollY={largeTitle.scrollY} left={<BackButton variant="light" />} />
      {q.isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : q.isError || !g ? (
        <ErrorState message={t('games.loadError')} onRetry={() => q.refetch()} />
      ) : !g.enabled ? (
        <View style={s.center}><Text style={s.muted}>{t('games.off')}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={s.body} scrollEnabled={!lock} showsVerticalScrollIndicator={false} onScroll={largeTitle.onScroll} scrollEventThrottle={largeTitle.scrollEventThrottle}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} colors={[COLORS.primary]} />}>
          {body()}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8F9FA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { padding: 16, gap: 14, paddingBottom: 48, alignItems: 'stretch' },
  stage: { alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  muted: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  result: { alignItems: 'center', gap: 4, paddingVertical: 4 },
  lucky: { fontSize: 15, fontWeight: '800', color: COLORS.textMuted, textAlign: 'center' },
  resultBig: { fontSize: 22, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  resultSub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  next: { fontSize: 13, fontWeight: '700', color: COLORS.primary, marginTop: 4 },
  closed: { fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  btn: { backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
  noPurchase: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center' },
});
