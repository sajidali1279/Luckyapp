// A hot food order's progress as steps: placed, accepted, ready, picked up. The current step is highlighted and the ones behind it are filled in,
// so a customer sees at a glance how far the kitchen is. Not shown for a cancelled order.
import { View, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';

const ORDER = ['PENDING', 'ACCEPTED', 'READY', 'COMPLETED'] as const;
const KEYS = ['placed', 'accepted', 'ready', 'pickedUp'] as const;

export default function OrderSteps({ status }: { status: string }) {
  const { t } = useTranslation();
  const at = ORDER.indexOf(status as (typeof ORDER)[number]);
  if (at < 0) return null;
  return (
    <View style={s.row} accessible accessibilityLabel={t('customerHotFood.stepsA11y', { step: t(`customerHotFood.step_${KEYS[at]}`), n: at + 1, total: ORDER.length })}>
      {KEYS.map((k, i) => {
        const done = i < at || status === 'COMPLETED';
        const current = i === at && status !== 'COMPLETED';
        return (
          <View key={k} style={s.col}>
            <View style={s.line}>
              <View style={[s.seg, i > 0 && (i <= at ? s.segOn : null), i === 0 && { backgroundColor: 'transparent' }]} />
              <View style={[s.dot, (done || current) && s.dotOn, current && s.dotNow]}>
                {done ? <Text style={s.tick}>✓</Text> : current ? <View style={s.pulse} /> : null}
              </View>
              <View style={[s.seg, i < KEYS.length - 1 && (i < at ? s.segOn : null), i === KEYS.length - 1 && { backgroundColor: 'transparent' }]} />
            </View>
            <Text style={[s.label, (done || current) && s.labelOn, current && { color: COLORS.primary }]} numberOfLines={1} maxFontSizeMultiplier={1.15}>{t(`customerHotFood.step_${k}`)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', marginTop: 12 },
  col: { flex: 1, alignItems: 'center' },
  line: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  seg: { flex: 1, height: 3, backgroundColor: '#E2E8F0' },
  segOn: { backgroundColor: COLORS.success },
  dot: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  dotOn: { backgroundColor: COLORS.success, borderColor: COLORS.success },
  dotNow: { backgroundColor: '#fff', borderColor: COLORS.primary, borderWidth: 3 },
  pulse: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  tick: { color: '#fff', fontSize: 12, fontWeight: '800' },
  label: { fontSize: 11, marginTop: 4, color: '#94A3B8', fontWeight: '600' },
  labelOn: { color: COLORS.text, fontWeight: '800' },
});
