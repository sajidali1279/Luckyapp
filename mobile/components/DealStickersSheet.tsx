// Deal stickers on the phone (2026-11-21): HQ makes them (admin Labels > Deal stickers); staff pick which ones and how many, and print
// them on the same label sheets as the shelf labels. Drawn over the screen by the shell, not a native Modal (they can fail on Android).
import { useState } from 'react';
import { View, TouchableOpacity, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { XIcon, PlusIcon, PrinterIcon, CheckCircleIcon, CircleIcon } from './Icons';

export interface DealSticker {
  id: string; words: string; subText: string | null; priceText: string; designId: string | null; template: string; textScale: number | null;
  images: { id: string; name: string; url: string }[];
}

const priceShown = (p: string) => (/^\d+(\.\d{1,2})?$/.test(p.trim()) ? `$${p.trim()}` : p.trim());

export default function DealStickersSheet({ stickers, accentColor, printing, onPrint, onClose }: {
  stickers: DealSticker[]; accentColor: string; printing: boolean;
  onPrint: (picked: { sticker: DealSticker; quantity: number }[]) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [qty, setQty] = useState<Record<string, number>>({});
  const picked = stickers.filter((x) => (qty[x.id] ?? 0) > 0);
  const total = picked.reduce((n, x) => n + (qty[x.id] ?? 0), 0);
  const bump = (id: string, by: number) => setQty((p) => ({ ...p, [id]: Math.max(0, Math.min(90, (p[id] ?? 0) + by)) }));

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={st.backdrop} onPress={printing ? undefined : onClose} accessibilityRole="button" accessibilityLabel={t('dealStickers.close')} />
      <View style={[st.sheet, { paddingBottom: 12 + insets.bottom }]}>
        <View style={st.handle} />
        <View style={st.top}>
          <View style={{ flex: 1 }}>
            <Text style={st.title} accessibilityRole="header">{t('dealStickers.title')}</Text>
            <Text style={st.sub}>{t('dealStickers.hint')}</Text>
          </View>
          <TouchableOpacity onPress={onClose} disabled={printing} style={st.closeBtn} accessibilityRole="button" accessibilityLabel={t('dealStickers.close')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <XIcon size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        <ScrollView style={{ maxHeight: 440 }}>
          {stickers.length === 0 && <Text style={st.none}>{t('dealStickers.none')}</Text>}
          {stickers.map((x) => {
            const n = qty[x.id] ?? 0;
            return (
              <View key={x.id} style={[st.row, n > 0 && { borderColor: accentColor, backgroundColor: '#F8FAFF' }]}>
                <TouchableOpacity style={st.rowMain} onPress={() => bump(x.id, n > 0 ? -n : 1)} activeOpacity={0.8}
                  accessibilityRole="checkbox" accessibilityState={{ checked: n > 0 }} accessibilityLabel={`${x.words}, ${priceShown(x.priceText)}`}>
                  {n > 0 ? <CheckCircleIcon size={22} color={accentColor} /> : <CircleIcon size={22} color={COLORS.textMuted} />}
                  <View style={st.pics}>
                    {x.images.slice(0, 3).map((im) => <Image key={im.id} source={{ uri: im.url }} style={st.pic} contentFit="contain" accessibilityIgnoresInvertColors />)}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={st.words} numberOfLines={2}>{x.words}</Text>
                    <Text style={[st.price, { color: accentColor }]}>{priceShown(x.priceText)}</Text>
                  </View>
                </TouchableOpacity>
                <View style={st.stepper}>
                  <TouchableOpacity onPress={() => bump(x.id, -1)} disabled={n === 0} style={[st.stepBtn, n === 0 && { opacity: 0.35 }]}
                    accessibilityRole="button" accessibilityLabel={t('dealStickers.less', { name: x.words })}><Text style={st.stepText}>−</Text></TouchableOpacity>
                  <Text style={st.qty} accessibilityLabel={t('dealStickers.howMany', { count: n, name: x.words })}>{n}</Text>
                  <TouchableOpacity onPress={() => bump(x.id, 1)} style={st.stepBtn} accessibilityRole="button" accessibilityLabel={t('dealStickers.more', { name: x.words })}>
                    <PlusIcon size={16} color={COLORS.text} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </ScrollView>
        <TouchableOpacity style={[st.printBtn, { backgroundColor: accentColor }, (total === 0 || printing) && { opacity: 0.45 }]} disabled={total === 0 || printing}
          onPress={() => onPrint(picked.map((x) => ({ sticker: x, quantity: qty[x.id] ?? 1 })))} accessibilityRole="button"
          accessibilityLabel={t('dealStickers.printA11y', { count: total })}>
          {printing ? <ActivityIndicator color={COLORS.white} /> : <PrinterIcon size={18} color={COLORS.white} />}
          <Text style={st.printText}>{printing ? t('dealStickers.printing') : total > 0 ? t('dealStickers.print', { count: total }) : t('dealStickers.pickFirst')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DBE3', marginBottom: 8 },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F4F8' },
  none: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: COLORS.border, borderRadius: 14, padding: 10, marginBottom: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  pics: { flexDirection: 'row', gap: 2 },
  pic: { width: 34, height: 40 },
  words: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  price: { fontSize: 16, fontWeight: '900', marginTop: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F4F8', alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginTop: -2 },
  qty: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '800', color: COLORS.text },
  printBtn: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, paddingVertical: 14 },
  printText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
});
