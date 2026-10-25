// Scratch card (2026-10-25): the prize sits under a silver coating of small tiles; a finger clears the tiles it passes over, and once most
// of them are gone the rest falls away. The server draws the prize at the first touch (onStart), so what is under the coating is fixed
// before anything shows. "Reveal it" clears it all at once, for anyone who cannot scratch or would rather not.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, PanResponder, StyleSheet, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ScaledText';
import { COLORS } from '../../../constants';
import { haptic } from '../../../utils/haptics';
import Cuatro from '../Cuatro';

const COLS = 12, ROWS = 7;
const ENOUGH = 0.55;   // this much scratched and the rest falls away

export default function ScratchCard({ pts, uncovered, onStart, onDone, onTouch }: {
  pts: number | null; uncovered: boolean; onStart: () => void; onDone: () => void; onTouch: (down: boolean) => void;
}) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();
  const W = Math.min(width - 48, 340), H = Math.round(W / 1.7);
  const tw = W / COLS, th = H / ROWS;
  const [gone, setGone] = useState<boolean[]>(() => new Array(COLS * ROWS).fill(uncovered));
  const [wantAll, setWantAll] = useState(false);
  const [finished, setFinished] = useState(uncovered);
  const goneRef = useRef(gone);
  goneRef.current = gone;
  const started = useRef(uncovered);
  const done = useRef(uncovered);
  const fade = useRef(new Animated.Value(1)).current;

  const start = () => { if (!started.current) { started.current = true; haptic.tap(); onStart(); } };
  const scratchAt = (x: number, y: number) => {
    const c0 = Math.max(0, Math.floor((x - tw * 0.8) / tw)), c1 = Math.min(COLS - 1, Math.floor((x + tw * 0.8) / tw));
    const r0 = Math.max(0, Math.floor((y - th * 0.8) / th)), r1 = Math.min(ROWS - 1, Math.floor((y + th * 0.8) / th));
    let next: boolean[] | null = null;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * COLS + c;
      if (!goneRef.current[i]) { next = next ?? goneRef.current.slice(); next[i] = true; }
    }
    if (next) { goneRef.current = next; setGone(next); }
  };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => !done.current,
    onMoveShouldSetPanResponder: () => !done.current,
    onPanResponderTerminationRequest: () => false,   // a scratch is not a scroll
    onPanResponderGrant: (e) => { onTouch(true); start(); scratchAt(e.nativeEvent.locationX, e.nativeEvent.locationY); },
    onPanResponderMove: (e) => scratchAt(e.nativeEvent.locationX, e.nativeEvent.locationY),
    onPanResponderRelease: () => onTouch(false),
    onPanResponderTerminate: () => onTouch(false),
  }), []);   // eslint-disable-line react-hooks/exhaustive-deps

  const share = gone.filter(Boolean).length / gone.length;
  useEffect(() => {
    // enough scratched (or "Reveal it"), and the prize is known: the rest of the coating falls away, then the result shows
    if (done.current || pts === null || (share < ENOUGH && !wantAll)) return;
    done.current = true;
    Animated.timing(fade, { toValue: 0, duration: 380, useNativeDriver: true }).start(() => { setFinished(true); onDone(); });
  }, [share >= ENOUGH, wantAll, pts]);   // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={{ alignItems: 'center', gap: 10 }}>
      <View style={[s.card, { width: W, height: H }]} {...(finished ? {} : pan.panHandlers)}
        accessible accessibilityLabel={finished && pts !== null ? (pts > 0 ? t('games.won', { pts }) : t('games.lost')) : t('games.scratchHint')}>
        {/* under the coating */}
        <View style={s.under} pointerEvents="none">
          {pts === null ? <ActivityIndicator color={COLORS.primary} /> : pts > 0 ? (
            <><Text style={s.big}>{t('games.prizePts', { pts })}</Text><Text style={s.small}>{t('games.underWon')}</Text></>
          ) : (
            <><Cuatro pose="peek" size={H * 0.5} /><Text style={s.small}>{t('games.underLost')}</Text></>
          )}
        </View>
        {/* the coating */}
        {!finished && (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
            {gone.map((g, i) => g ? null : (
              <View key={i} style={{ position: 'absolute', left: (i % COLS) * tw, top: Math.floor(i / COLS) * th, width: tw + 0.6, height: th + 0.6, backgroundColor: (i + Math.floor(i / COLS)) % 2 ? '#C3C9D2' : '#B5BCC7' }} />
            ))}
            <View style={[StyleSheet.absoluteFill, s.labelWrap, { opacity: Math.max(0, 1 - share * 2.5) }]}>
              <Text style={s.label}>{t('games.scratchHere')}</Text>
            </View>
          </Animated.View>
        )}
      </View>
      {!finished && (
        <TouchableOpacity onPress={() => { start(); setWantAll(true); }} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={s.reveal}>{t('games.reveal')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden', borderWidth: 4, borderColor: '#E9A23B', backgroundColor: '#FFF8E1' },
  under: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 4 },
  big: { fontSize: 40, fontWeight: '900', color: COLORS.primary },
  small: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  labelWrap: { alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 20, fontWeight: '900', color: '#5B6472', letterSpacing: 1 },
  reveal: { fontSize: 14, fontWeight: '800', color: COLORS.primary },
});
