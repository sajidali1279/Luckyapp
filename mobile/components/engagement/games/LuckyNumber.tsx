// Lucky number (2026-10-25): pick a number from 1 to 9, then the server draws. The prize is drawn first with HQ's chances; a play that won
// shows the customer's own number, one that did not shows another, so the number only tells the result. The drum rolls through the
// numbers and stops on it; with Reduce Motion it shows at once.
import { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ScaledText';
import { COLORS } from '../../../constants';
import { haptic } from '../../../utils/haptics';
import { useReduceMotion } from '../../../utils/motion';
import type { PlayResult } from './types';

export default function LuckyNumber({ result, locked, busy, onPlay, onDone }: {
  result: PlayResult | null; locked: boolean; busy: boolean; onPlay: (pick: number) => void; onDone: () => void;
}) {
  const { t } = useTranslation();
  const reduce = useReduceMotion();
  const [pick, setPick] = useState<number | null>(null);
  const [drum, setDrum] = useState<number | null>(null);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    if (!result || result.number == null) return;
    const end = result.number;
    if (reduce) { setDrum(end); setLanded(true); onDone(); return; }
    let i = 0, cancelled = false;
    const tick = () => {
      if (cancelled) return;
      i++;
      if (i >= 18) { setDrum(end); setLanded(true); haptic.select(); onDone(); return; }
      setDrum(((i * 7 + 3) % 9) + 1);
      if (i % 3 === 0) haptic.select();
      setTimeout(tick, 45 + i * i * 1.4);   // slows down as it goes
    };
    tick();
    return () => { cancelled = true; };
  }, [result]);   // eslint-disable-line react-hooks/exhaustive-deps

  const won = landed && !!result && result.pts > 0;
  const off = locked || busy || !!result;
  return (
    <View style={s.wrap}>
      <View style={[s.drum, landed && (won ? s.drumWon : s.drumLost)]} accessible accessibilityLabel={landed && drum ? t('games.luckyDrawn', { n: drum }) : t('games.pickNumber')}>
        <Text style={[s.drumText, landed && { color: '#fff' }]}>{drum ?? '?'}</Text>
      </View>
      <Text style={s.head}>{t('games.pickNumber')}</Text>
      <View style={s.grid}>
        {Array.from({ length: 9 }, (_, k) => k + 1).map((n) => (
          <TouchableOpacity key={n} disabled={off} onPress={() => { haptic.select(); setPick(n); }} accessibilityRole="button" accessibilityState={{ selected: pick === n, disabled: off }}
            style={[s.num, pick === n && s.numOn, off && pick !== n && { opacity: 0.45 }]}>
            <Text style={[s.numText, pick === n && { color: '#fff' }]}>{n}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {!locked && !result && (
        <TouchableOpacity style={[s.btn, (pick === null || busy) && { opacity: 0.6 }]} disabled={pick === null || busy} onPress={() => pick !== null && onPlay(pick)} accessibilityRole="button" activeOpacity={0.85}>
          <Text style={s.btnText}>{busy ? t('games.drawing') : t('games.draw')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 12, width: '100%' },
  drum: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#fff', borderWidth: 5, borderColor: '#1D3557', alignItems: 'center', justifyContent: 'center' },
  drumWon: { backgroundColor: '#2DC653', borderColor: '#1A9A41' },
  drumLost: { backgroundColor: '#1D3557', borderColor: '#0F2038' },
  drumText: { fontSize: 56, fontWeight: '900', color: '#1D3557' },
  head: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, width: 3 * 64 + 2 * 10 },
  num: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', borderWidth: 2, borderColor: '#D3DCEA', alignItems: 'center', justifyContent: 'center' },
  numOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  numText: { fontSize: 24, fontWeight: '900', color: COLORS.text },
  btn: { alignSelf: 'stretch', backgroundColor: COLORS.primary, borderRadius: 16, paddingVertical: 15, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900', fontSize: 17 },
});
