// Hot food menus by time and ordering ahead (2026-11-10): the menu tabs (Breakfast, All day...), the last-call strip, the pickup time
// chooser in the order sheet, and the words for a pickup time. The server decides what is served when (backend utils/hotFoodMenus.ts);
// this only shows it. Times are store time (Central).
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { ClockIcon } from './Icons';

export interface MenuTime {
  id: string; name: string; nameEs: string | null; fromTime: string; toTime: string; days: number[]; lastCallMinutes: number;
  open: boolean; takingOrders: boolean; minutesLeft: number | null; nextStartAt: string | null;
}
export interface PickupSlot { at: string; day: string; menus: string[] }
export interface OrderAhead { on: boolean; days?: number; today?: string; slots?: PickupSlot[] }
/** What an item says about when it is served (a server from before menus by time sends none of it: served now) */
export interface Timed { daypartIds?: string[]; servedNow?: boolean; nextServedAt?: string | null; soldOut?: boolean; estimatedMinutes?: number | null }

export const ALL_DAY = '__all_day__';
const TZ = 'America/Chicago';
const loc = (lang: string) => (lang.startsWith('es') ? 'es-US' : 'en-US');

/** The store date ('2026-11-12') of a moment */
export function storeDay(d: Date): string {
  const [m, day, y] = d.toLocaleDateString('en-US', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).split('/');
  return `${y}-${m}-${day}`;
}
const nextDay = (key: string) => { const d = new Date(`${key}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };

export function useTimeWords() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language ?? 'en';
  const time = (iso: string) => new Date(iso).toLocaleTimeString(loc(lang), { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  const dayName = (key: string, today: string) => (key === today ? t('customerHotFood.pickupToday') : key === nextDay(today) ? t('customerHotFood.pickupTomorrow')
    : new Date(`${key}T12:00:00Z`).toLocaleDateString(loc(lang), { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }));
  /** "6:30 AM", "6:30 AM tomorrow", "Fri, Nov 14, 6:30 AM" */
  const when = (iso: string, today = storeDay(new Date())) => {
    const key = storeDay(new Date(iso));
    if (key === today) return time(iso);
    if (key === nextDay(today)) return t('customerHotFood.timeTomorrow', { time: time(iso) });
    return t('customerHotFood.timeOnDay', { time: time(iso), day: dayName(key, today) });
  };
  const menuName = (m: { name: string; nameEs: string | null }) => (lang.startsWith('es') && m.nameEs ? m.nameEs : m.name);
  return { time, dayName, when, menuName };
}

/** Breakfast / Lunch / All day, the one serving now first. Shown only when the store has menus by time. */
export function MenuTimeTabs({ menus, hasAllDay, value, onChange }: { menus: MenuTime[]; hasAllDay: boolean; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  const w = useTimeWords();
  const tabs = [...menus].sort((a, b) => Number(b.open) - Number(a.open)).map((m) => ({ id: m.id, label: w.menuName(m), on: m.open }));
  if (hasAllDay) tabs.push({ id: ALL_DAY, label: t('customerHotFood.menuAllDay'), on: true });
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.tabs} accessibilityRole="tablist">
      {tabs.map((x) => {
        const sel = x.id === value;
        return (
          <TouchableOpacity key={x.id} style={[st.tab, sel && st.tabSel]} onPress={() => onChange(x.id)} activeOpacity={0.85}
            accessibilityRole="tab" accessibilityState={{ selected: sel }} accessibilityLabel={x.label}>
            {x.on && x.id !== ALL_DAY && <View style={[st.dot, sel && { backgroundColor: '#fff' }]} />}
            <Text style={[st.tabText, sel && st.tabTextSel]}>{x.label}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

/** "Breakfast ends in 20 min. Order now." in the half hour before last call; "Last call for Breakfast has passed" after it */
export function LastCallStrip({ menu, ahead }: { menu: MenuTime | undefined; ahead: boolean }) {
  const { t } = useTranslation();
  const w = useTimeWords();
  if (!menu || !menu.open || menu.minutesLeft == null) return null;
  const toLastCall = menu.minutesLeft - menu.lastCallMinutes;
  if (menu.takingOrders && toLastCall > 30) return null;
  const text = menu.takingOrders
    ? t('customerHotFood.lastCallSoon', { menu: w.menuName(menu), minutes: Math.max(1, toLastCall) })
    : t(ahead ? 'customerHotFood.lastCallPassed' : 'customerHotFood.lastCallPassedNoAhead', { menu: w.menuName(menu) });
  return (
    <View style={st.strip} accessibilityRole="alert">
      <ClockIcon size={14} color="#9A3412" />
      <Text style={st.stripText}>{text}</Text>
    </View>
  );
}

/** The pickup times that suit the cart: after its cook time, inside every item's menus, and after a sold-out item is back */
export function slotsForCart(slots: PickupSlot[], cart: Timed[], today: string, now = Date.now()): PickupSlot[] {
  const lead = Math.max(15, ...cart.map((i) => (i.estimatedMinutes && i.estimatedMinutes > 0 ? i.estimatedMinutes : 0)));
  return slots.filter((s) => new Date(s.at).getTime() >= now + lead * 60_000
    && cart.every((i) => !i.daypartIds?.length || i.daypartIds.some((d) => s.menus.includes(d)))
    && cart.every((i) => !i.soldOut || s.day > today));
}

/** As soon as possible / Later, then the day and the time */
export function PickupChooser({ later, setLater, asapAllowed, slots, today, value, onChange }: {
  later: boolean; setLater: (v: boolean) => void; asapAllowed: boolean; slots: PickupSlot[]; today: string; value: string | null; onChange: (at: string | null) => void;
}) {
  const { t } = useTranslation();
  const w = useTimeWords();
  const days = [...new Set(slots.map((s) => s.day))];
  const chosenDay = value ? storeDay(new Date(value)) : days[0];
  const times = slots.filter((s) => s.day === chosenDay);
  return (
    <View style={st.chooser}>
      <Text style={st.chooserTitle}>{t('customerHotFood.pickupTitle')}</Text>
      <View style={st.modeRow} accessibilityRole="radiogroup">
        {[false, true].map((isLater) => {
          const sel = later === isLater, off = !isLater && !asapAllowed;
          return (
            <TouchableOpacity key={String(isLater)} style={[st.mode, sel && st.modeSel, off && { opacity: 0.45 }]} disabled={off}
              onPress={() => { setLater(isLater); if (!isLater) onChange(null); }}
              accessibilityRole="radio" accessibilityState={{ selected: sel, disabled: off }}>
              <Text style={[st.modeText, sel && st.modeTextSel]}>{isLater ? t('customerHotFood.pickupLater') : t('customerHotFood.pickupAsap')}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!asapAllowed && <Text style={st.hint}>{t('customerHotFood.pickupAsapOff')}</Text>}
      {later && (slots.length === 0 ? <Text style={st.hint}>{t('customerHotFood.pickupNoTimes')}</Text> : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {days.map((d) => (
              <TouchableOpacity key={d} style={[st.chip, d === chosenDay && st.chipSel]} accessibilityRole="button" accessibilityState={{ selected: d === chosenDay }}
                onPress={() => onChange(slots.find((s) => s.day === d)!.at)}>
                <Text style={[st.chipText, d === chosenDay && st.chipTextSel]}>{w.dayName(d, today)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips}>
            {times.map((s) => (
              <TouchableOpacity key={s.at} style={[st.chip, s.at === value && st.chipSel]} accessibilityRole="button" accessibilityState={{ selected: s.at === value }}
                onPress={() => onChange(s.at)}>
                <Text style={[st.chipText, s.at === value && st.chipTextSel]}>{w.time(s.at)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {value && <Text style={st.chosen}>{t('customerHotFood.pickupWhen', { when: w.when(value, today) })}</Text>}
        </>
      ))}
    </View>
  );
}

/** "Pickup 6:30 AM tomorrow" on an order placed ahead */
export function PickupLine({ at }: { at: string }) {
  const { t } = useTranslation();
  const w = useTimeWords();
  return (
    <View style={st.pickupLine}>
      <ClockIcon size={12} color="#1D4ED8" />
      <Text style={st.pickupLineText}>{t('customerHotFood.pickupWhen', { when: w.when(at) })}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  tabs: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  tabSel: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  tabText: { fontSize: 14, fontWeight: '700', color: '#9A3412' },
  tabTextSel: { color: '#fff' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#16A34A' },
  strip: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: '#FFEDD5' },
  stripText: { flex: 1, fontSize: 13, fontWeight: '700', color: '#9A3412' },
  chooser: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', gap: 8 },
  chooserTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  modeRow: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#fff', alignItems: 'center' },
  modeSel: { borderColor: COLORS.primary, backgroundColor: '#FFF7ED' },
  modeText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },
  modeTextSel: { color: COLORS.primary },
  hint: { fontSize: 12, color: COLORS.textMuted },
  chips: { gap: 6, paddingVertical: 2 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#CBD5E1' },
  chipSel: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextSel: { color: '#fff' },
  chosen: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
  pickupLine: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#EFF6FF' },
  pickupLineText: { fontSize: 13, fontWeight: '700', color: '#1D4ED8' },
});
