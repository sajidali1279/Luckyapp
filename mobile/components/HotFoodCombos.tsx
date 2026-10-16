// Hot food combos on the customer's menu (2026-10-12): the combos on at this store now (featured first), as a row of cards above the
// menu. Add opens the drink choice (only the drinks HQ allowed for that combo); each combo with a drink is its own line in the order.
// A multi-buy deal (2026-10-16) holds more than one of the item ("2 corn dogs for $3.50") and may have no drink: then Add puts it straight in.
import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import ModalCloseButton from './ModalCloseButton';
import { FlameIcon } from './Icons';
import { COLORS } from '../constants';
import { sized } from '../utils/imageUrl';
import { haptic } from '../utils/haptics';

export interface Combo {
  id: string;
  name: string;
  nameEs?: string | null;
  description?: string | null;
  price: number;
  regularPrice?: number | null;
  itemQuantity?: number;   // how many of the item (1 when an older server does not say)
  drinks: string[];        // none: a deal with no drink
  isFeatured: boolean;
  fromTime?: string | null;
  toTime?: string | null;
  item: { id: string; name: string; imageUrl?: string | null };
  estimatedMinutes?: number | null;
}

/** The cart line of a combo with a drink (the server reads the same key); '' for a deal with no drink. */
export const comboCartId = (comboId: string, drink: string) => `combo:${comboId}:${drink}`;
const money = (n: number) => `$${n.toFixed(2)}`;
function hourText(hhmm: string, lang: string) {
  const [h, m] = hhmm.split(':').map(Number);
  if (lang === 'es') return `${h}:${String(m).padStart(2, '0')}`;
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

export function useComboWords() {
  const { t, i18n } = useTranslation();
  const es = i18n.language?.startsWith('es');
  return {
    name: (c: Combo) => (es && c.nameEs ? c.nameEs : c.name),
    drink: (code: string) => t(`hotFoodCombos.drink_${code}`, { defaultValue: code }),
    hours: (c: Combo) => (c.fromTime && c.toTime ? t('hotFoodCombos.hours', { from: hourText(c.fromTime, es ? 'es' : 'en'), to: hourText(c.toTime, es ? 'es' : 'en') }) : null),
    /** What is in it: "2 × Corn Dog", "2 × Corn Dog · With a drink: …", or "With a drink: …" */
    contents: (c: Combo) => {
      const qty = c.itemQuantity ?? 1;
      const items = qty > 1 ? t('hotFoodCombos.dealOf', { count: qty, item: c.item.name }) : null;
      const drinks = c.drinks.length ? t('hotFoodCombos.withDrink', { drinks: c.drinks.map((d) => t(`hotFoodCombos.drink_${d}`, { defaultValue: d })).join(', ') }) : null;
      return [items, drinks].filter(Boolean).join(' · ');
    },
  };
}

export function ComboStrip({ combos, closed, countOf, onAdd, openComboId, onOpened }: {
  combos: Combo[]; closed: boolean; countOf: (comboId: string) => number; onAdd: (combo: Combo, drink: string) => void;
  /** A combo tapped on Home: its drink choice opens by itself (once); onOpened says whether it is on here */
  openComboId?: string | null; onOpened?: (found: boolean) => void;
}) {
  const { t } = useTranslation();
  const w = useComboWords();
  const [picking, setPicking] = useState<Combo | null>(null);
  useEffect(() => {
    if (!openComboId) return;
    const c = combos.find((x) => x.id === openComboId);
    if (c && !closed) setPicking(c);
    onOpened?.(!!c);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openComboId]);
  if (combos.length === 0) return null;
  return (
    <View style={st.wrap}>
      <Text style={st.title} accessibilityRole="header">{t('hotFoodCombos.title')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.row}>
        {combos.map((c) => {
          const n = countOf(c.id);
          const save = c.regularPrice != null && c.regularPrice > c.price ? c.regularPrice - c.price : null;
          const hours = w.hours(c);
          return (
            <View key={c.id} style={st.card}>
              {c.isFeatured && <View style={st.tag}><Text style={st.tagText}>{t('hotFoodCombos.featured')}</Text></View>}
              {c.item.imageUrl
                ? <Image source={{ uri: sized(c.item.imageUrl, 400) }} style={st.img} contentFit="cover" accessibilityIgnoresInvertColors />
                : <View style={[st.img, st.imgEmpty]}><FlameIcon size={28} color={COLORS.primary} /></View>}
              <Text style={st.name} numberOfLines={2}>{w.name(c)}</Text>
              <Text style={st.with} numberOfLines={2}>{w.contents(c)}</Text>
              <View style={st.priceRow}>
                <Text style={st.price}>{money(c.price)}</Text>
                {save != null && <Text style={st.save}>{t('hotFoodCombos.save', { amount: money(save) })}</Text>}
              </View>
              {hours && <Text style={st.hours}>{hours}</Text>}
              <TouchableOpacity
                style={[st.add, closed && st.addOff]}
                onPress={() => { haptic.tap(); if (c.drinks.length === 0) onAdd(c, ''); else setPicking(c); }}
                disabled={closed}
                accessibilityRole="button"
                accessibilityState={{ disabled: closed }}
                accessibilityLabel={t('hotFoodCombos.addA11y', { name: w.name(c), price: money(c.price) })}
              >
                <Text style={[st.addText, closed && st.addOffText]}>{closed ? t('customerHotFood.closedBtn') : n > 0 ? t('hotFoodCombos.addAnother', { count: n }) : t('hotFoodCombos.add')}</Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>
      {picking && (
        <DrinkSheet combo={picking} onClose={() => setPicking(null)} onPick={(drink) => { onAdd(picking, drink); setPicking(null); }} />
      )}
    </View>
  );
}

function DrinkSheet({ combo, onClose, onPick }: { combo: Combo; onClose: () => void; onPick: (drink: string) => void }) {
  const { t } = useTranslation();
  const w = useComboWords();
  // No drinks (a multi-buy deal opened from Home): nothing to choose, Add is ready
  const [drink, setDrink] = useState<string | null>(combo.drinks.length === 0 ? '' : combo.drinks.length === 1 ? combo.drinks[0] : null);
  const ready = drink !== null;
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={st.overlay}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} activeOpacity={1} accessibilityRole="button" accessibilityLabel={t('hotFoodCombos.closeA11y')} />
        <View style={st.sheet}>
          <View style={st.sheetHead}>
            <Text style={st.sheetTitle} accessibilityRole="header">{w.name(combo)}</Text>
            <ModalCloseButton onPress={onClose} label={t('hotFoodCombos.closeA11y')} size={20} color={COLORS.textMuted} />
          </View>
          {combo.description ? <Text style={st.desc}>{combo.description}</Text> : null}
          {(combo.itemQuantity ?? 1) > 1 && <Text style={st.desc}>{t('hotFoodCombos.dealOf', { count: combo.itemQuantity, item: combo.item.name })}</Text>}
          {combo.drinks.length > 0 && <Text style={st.pickLabel}>{t('hotFoodCombos.chooseDrink')}</Text>}
          <View accessibilityRole="radiogroup">
            {combo.drinks.map((d) => (
              <TouchableOpacity key={d} style={[st.option, drink === d && st.optionOn]} onPress={() => setDrink(d)} accessibilityRole="radio" accessibilityState={{ checked: drink === d }}>
                <View style={[st.radio, drink === d && st.radioOn]}>{drink === d && <View style={st.radioDot} />}</View>
                <Text style={st.optionText}>{w.drink(d)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={[st.confirm, !ready && { opacity: 0.5 }]}
            onPress={() => ready && onPick(drink!)}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={st.confirmText}>{t('hotFoodCombos.addToOrder', { price: money(combo.price) })}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  wrap: { marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '900', color: COLORS.text, marginBottom: 8, marginLeft: 2 },
  row: { gap: 10, paddingRight: 4 },
  card: { width: 200, backgroundColor: '#fff', borderRadius: 16, padding: 10, borderWidth: 1, borderColor: '#E6E8EB' },
  tag: { position: 'absolute', top: 16, left: 16, zIndex: 2, backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  img: { width: '100%', height: 120, borderRadius: 12, backgroundColor: '#1F2328' },
  imgEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF1F0' },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginTop: 8 },
  with: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  price: { fontSize: 17, fontWeight: '900', color: COLORS.primary },
  save: { fontSize: 12, fontWeight: '800', color: '#17663A', backgroundColor: '#EDF7F0', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, overflow: 'hidden' },
  hours: { fontSize: 11.5, color: '#8A5300', fontWeight: '700', marginTop: 4 },
  add: { marginTop: 8, backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 9, alignItems: 'center' },
  addOff: { backgroundColor: '#E5E7EB' },
  addText: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  addOffText: { color: '#6B7280' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32, gap: 8 },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: COLORS.text },
  desc: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20 },
  pickLabel: { fontSize: 13, fontWeight: '800', color: COLORS.textMuted, marginTop: 6 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EB', marginTop: 8 },
  optionOn: { borderColor: COLORS.primary, backgroundColor: '#FFF5F5' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: COLORS.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  optionText: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  confirm: { marginTop: 14, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  confirmText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
