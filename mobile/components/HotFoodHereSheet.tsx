// "I'm here" (2026-11-15, the owner's OK of the kitchen screen): the customer says where they are waiting for their hot food order, at a
// pump or inside the store, and the kitchen sees it on the order. Drawn inside the app (no native Modal).
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text, TextInput } from './ScaledText';
import { COLORS } from '../constants';

export default function HotFoodHereSheet({ number, current, busy, onPick, onClose }: {
  number: string;
  /** where they said they are already: a pump, 0 = inside, null = not said */
  current: number | null;
  busy?: boolean;
  onPick: (pump: number) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [other, setOther] = useState('');
  const n = Number(other);
  const otherOk = Number.isInteger(n) && n >= 1 && n <= 40;
  return (
    <View style={h.backdrop} accessibilityViewIsModal>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('customerHotFood.hereClose')} />
      <View style={h.sheet}>
        <Text style={h.title}>{t('customerHotFood.hereTitle', { n: number })}</Text>
        <Text style={h.sub}>{t('customerHotFood.hereSub')}</Text>
        <TouchableOpacity style={[h.inside, current === 0 && h.on]} onPress={() => onPick(0)} disabled={busy} accessibilityRole="button">
          <Text style={[h.insideText, current === 0 && h.onText]}>🚶 {t('customerHotFood.hereInsideBtn')}</Text>
        </TouchableOpacity>
        <Text style={h.label}>{t('customerHotFood.hereAtPumpLabel')}</Text>
        <View style={h.grid}>
          {Array.from({ length: 16 }, (_, i) => i + 1).map((p) => (
            <TouchableOpacity key={p} style={[h.pump, current === p && h.on]} onPress={() => onPick(p)} disabled={busy} accessibilityRole="button"
              accessibilityLabel={t('customerHotFood.herePumpA11y', { pump: p })}>
              <Text style={[h.pumpText, current === p && h.onText]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={h.otherRow}>
          <TextInput style={h.otherInput} value={other} onChangeText={(v) => setOther(v.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad"
            placeholder={t('customerHotFood.hereOtherPump')} placeholderTextColor="#94A3B8" accessibilityLabel={t('customerHotFood.hereOtherPump')} />
          <TouchableOpacity style={[h.otherBtn, !otherOk && { opacity: 0.4 }]} disabled={!otherOk || busy} onPress={() => onPick(n)} accessibilityRole="button">
            <Text style={h.otherBtnText}>{t('customerHotFood.hereSend')}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={h.cancel} onPress={onClose} accessibilityRole="button"><Text style={h.cancelText}>{t('customerHotFood.hereClose')}</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const h = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end', zIndex: 60, elevation: 60 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 28, gap: 10 },
  title: { fontSize: 19, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textMuted },
  inside: { minHeight: 50, borderRadius: 14, borderWidth: 1.5, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  insideText: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  label: { fontSize: 12, fontWeight: '900', color: COLORS.textMuted, letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pump: { width: '22%', flexGrow: 1, minHeight: 50, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  pumpText: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  on: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  onText: { color: '#fff' },
  otherRow: { flexDirection: 'row', gap: 8 },
  otherInput: { flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: '#CBD5E1', paddingHorizontal: 14, fontSize: 16, color: COLORS.text },
  otherBtn: { minHeight: 48, paddingHorizontal: 18, borderRadius: 12, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  otherBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  cancel: { minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: 15, fontWeight: '800', color: COLORS.textMuted },
});
