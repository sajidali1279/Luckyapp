// Sizes and add-ons on a hot food item (2026-11-14, "build your own" loaded chips): the customer picks a size and ticks add-ons, each
// priced for the size picked, and sees the total before adding it to the order. The server prices it again (utils/hotFoodOptions.ts).
import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Image } from 'expo-image';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { sized } from '../utils/imageUrl';
import ModalCloseButton from './ModalCloseButton';
import ModalToastHost from './ModalToastHost';

export interface ChoiceOptions {
  sizes: { id: string; name: string; nameEs?: string | null; price: number }[];
  addOns: { id: string; name: string; nameEs?: string | null; prices: Record<string, number>; active?: boolean }[];
  maxAddOns: number | null;
}
export interface ChoiceItem { id: string; name: string; price: number; imageUrl?: string; description?: string; options?: ChoiceOptions | null }
export interface Chosen { sizeId: string | null; addOnIds: string[]; unit: number; label: string; qty: number }

const ONE = 'one';
const money = (n: number) => `$${n.toFixed(2)}`;

/** The price of one and the words for it, the way the server works them out */
export function priceChosen(item: ChoiceItem, sizeId: string | null, addOnIds: string[], es = false): { unit: number; label: string } {
  const o = item.options;
  const size = o?.sizes.find((s) => s.id === sizeId) ?? null;
  const key = size ? size.id : ONE;
  const adds = (o?.addOns ?? []).filter((a) => addOnIds.includes(a.id));
  const unit = Math.round((item.price + (size?.price ?? 0) + adds.reduce((n, a) => n + (a.prices[key] ?? 0), 0)) * 100) / 100;
  const nm = (x: { name: string; nameEs?: string | null }) => (es && x.nameEs ? x.nameEs : x.name);
  const words = [size ? nm(size) : null, adds.length ? adds.map(nm).join(', ') : null].filter(Boolean).join(': ');
  return { unit, label: words ? `${item.name} (${words})` : item.name };
}
/** The cart key: the same as the server's line key, so a changed price is matched to its line */
export const choiceKey = (itemId: string, sizeId: string | null, addOnIds: string[]) => `opt:${itemId}|${sizeId ?? ''}|${[...new Set(addOnIds)].sort().join(',')}`;

export default function HotFoodChoiceSheet({ item, maxQty, onClose, onAdd }: { item: ChoiceItem; maxQty: number; onClose: () => void; onAdd: (c: Chosen) => void }) {
  const { t, i18n } = useTranslation();
  const es = (i18n.language ?? '').startsWith('es');
  const o = item.options!;
  const [sizeId, setSizeId] = useState<string | null>(o.sizes.length ? null : null);
  const [adds, setAdds] = useState<string[]>([]);
  const [qty, setQty] = useState(1);
  const key = sizeId ?? ONE;
  const needSize = o.sizes.length > 0 && !sizeId;
  const full = !!o.maxAddOns && adds.length >= o.maxAddOns;
  const { unit, label } = priceChosen(item, sizeId, adds, es);
  const nm = (x: { name: string; nameEs?: string | null }) => (es && x.nameEs ? x.nameEs : x.name);
  const toggle = (id: string) => setAdds((p) => (p.includes(id) ? p.filter((x) => x !== id) : full ? p : [...p, id]));
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.overlay}>
        <TouchableOpacity style={st.backdrop} onPress={onClose} activeOpacity={1} accessibilityRole="button" accessibilityLabel={t('customerHotFood.choiceCloseA11y')} />
        <View style={st.sheet}>
          <View style={st.header}>
            {item.imageUrl ? <Image source={{ uri: sized(item.imageUrl, 160) }} style={st.img} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={st.title}>{item.name}</Text>
              {item.description ? <Text style={st.desc} numberOfLines={2}>{item.description}</Text> : null}
            </View>
            <ModalCloseButton onPress={onClose} label={t('customerHotFood.choiceCloseA11y')} size={20} color={COLORS.textMuted} />
          </View>
          <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: 8 }}>
            {o.sizes.length > 0 && (
              <>
                <Text style={st.section}>{t('customerHotFood.chooseSize')}</Text>
                <View style={st.sizes} accessibilityRole="radiogroup">
                  {o.sizes.map((s) => {
                    const on = s.id === sizeId;
                    return (
                      <TouchableOpacity key={s.id} style={[st.size, on && st.sizeOn]} onPress={() => setSizeId(s.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}>
                        <Text style={[st.sizeName, on && st.sizeNameOn]}>{nm(s)}</Text>
                        <Text style={[st.sizePrice, on && st.sizeNameOn]}>{money(item.price + s.price)}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
            {o.addOns.length > 0 && (
              <>
                <Text style={st.section}>{t('customerHotFood.addOnsTitle')}{o.maxAddOns ? `  ·  ${t('customerHotFood.addOnsMax', { count: o.maxAddOns })}` : ''}</Text>
                {o.sizes.length > 0 && !sizeId ? <Text style={st.hint}>{t('customerHotFood.addOnsPickSize')}</Text> : null}
                {o.addOns.map((a) => {
                  const on = adds.includes(a.id);
                  const price = a.prices[key] ?? 0;
                  const off = !on && full;
                  return (
                    <TouchableOpacity key={a.id} style={[st.addOn, off && { opacity: 0.45 }]} onPress={() => toggle(a.id)} disabled={off}
                      accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: off }} accessibilityLabel={`${nm(a)} ${price ? '+' + money(price) : ''}`}>
                      <View style={[st.box, on && st.boxOn]}>{on ? <Text style={st.tick}>✓</Text> : null}</View>
                      <Text style={st.addName}>{nm(a)}</Text>
                      <Text style={st.addPrice}>{sizeId || !o.sizes.length ? (price ? `+${money(price)}` : t('customerHotFood.addOnFree')) : ''}</Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
          <View style={st.footer}>
            <View style={st.stepper}>
              <TouchableOpacity style={st.stepBtn} onPress={() => setQty((q) => Math.max(1, q - 1))} accessibilityRole="button" accessibilityLabel={t('customerHotFood.choiceLessA11y')}><Text style={st.stepText}>−</Text></TouchableOpacity>
              <Text style={st.qty}>{qty}</Text>
              <TouchableOpacity style={st.stepBtn} onPress={() => setQty((q) => Math.min(maxQty, q + 1))} accessibilityRole="button" accessibilityLabel={t('customerHotFood.choiceMoreA11y')}><Text style={st.stepText}>+</Text></TouchableOpacity>
            </View>
            <TouchableOpacity style={[st.addBtn, needSize && { opacity: 0.5 }]} disabled={needSize} onPress={() => onAdd({ sizeId, addOnIds: adds, unit, label, qty })}
              accessibilityRole="button" accessibilityState={{ disabled: needSize }}>
              <Text style={st.addBtnText} numberOfLines={1}>{needSize ? t('customerHotFood.chooseSizeFirst') : t('customerHotFood.addToOrderBtn', { total: money(unit * qty) })}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <ModalToastHost />
    </Modal>
  );
}

const st = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 16, paddingBottom: 26 },
  header: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 8 },
  img: { width: 64, height: 64, borderRadius: 12, backgroundColor: '#111' },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  desc: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  section: { fontSize: 14, fontWeight: '800', color: COLORS.text, marginTop: 12, marginBottom: 8 },
  hint: { fontSize: 12, color: COLORS.textMuted, marginBottom: 6 },
  sizes: { flexDirection: 'row', gap: 10 },
  size: { flex: 1, borderWidth: 1.5, borderColor: '#E2E8F0', borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F8FAFC' },
  sizeOn: { borderColor: COLORS.primary, backgroundColor: COLORS.primary },
  sizeName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  sizeNameOn: { color: '#fff' },
  sizePrice: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginTop: 2 },
  addOn: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E2E8F0' },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tick: { color: '#fff', fontWeight: '900', fontSize: 14 },
  addName: { flex: 1, fontSize: 15, color: COLORS.text, fontWeight: '600' },
  addPrice: { fontSize: 14, color: COLORS.textMuted, fontWeight: '700' },
  footer: { flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F1F5F9', borderRadius: 14, paddingHorizontal: 6, paddingVertical: 4 },
  stepBtn: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
  stepText: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  qty: { fontSize: 16, fontWeight: '800', color: COLORS.text, minWidth: 18, textAlign: 'center' },
  addBtn: { flex: 1, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
