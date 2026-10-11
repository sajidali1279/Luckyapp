// The hot food pickup store, on the customer's Hot Food screen (2026-10-11): how good the phone's location is, the store the order goes
// to (with its address and Directions), a nudge when it is not the closest, a card that asks when two stores are about the same distance
// or the location cannot tell, and the list of every store to choose from. See utils/pickupStore.ts for the rules.
import { Modal, View, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { MapPinIcon, RefreshIcon, CheckCircleIcon, ChevronDownIcon, AlertTriangleIcon } from './Icons';
import ModalCloseButton from './ModalCloseButton';
import { addressLine, milesText, openDirections, type HotFoodHours, type Here, type LocationQuality, type PickupStore } from '../utils/pickupStore';

type T = (k: string, o?: Record<string, unknown>) => string;

/** "about 30 ft" / "about 0.4 mi": how far off the phone's location may be */
function accuracyText(t: T, meters: number | null): string {
  if (meters == null) return '';
  const ft = meters * 3.28084;
  return ft < 1000 ? t('customerHotFood.aboutFeet', { n: Math.max(10, Math.round(ft / 10) * 10) }) : t('customerHotFood.aboutMiles', { n: (meters / 1609.34).toFixed(1) });
}

export function hoursShort(t: T, h?: HotFoodHours): { text: string; open: boolean } | null {
  if (!h) return null;
  if (h.open) return { text: h.closesAt ? t('customerHotFood.openUntil', { time: h.closesAt }) : t('customerHotFood.openNow'), open: true };
  if (h.opensAt && h.opensDay) {
    const when = h.opensDay === 'today' ? t('customerHotFood.whenToday') : h.opensDay === 'tomorrow' ? t('customerHotFood.whenTomorrow') : t(`customerHotFood.when${h.opensDay}`);
    return { text: t('customerHotFood.closedOpensShort', { when, time: h.opensAt }), open: false };
  }
  return { text: t('customerHotFood.closedNow'), open: false };
}

// ── The location line ────────────────────────────────────────────────────────

export function LocationLine({ status, here, quality, onUpdate, onTurnOn }: {
  status: 'detecting' | 'ok' | 'denied' | 'error'; here: Here | null; quality: LocationQuality; onUpdate: () => void; onTurnOn: () => void;
}) {
  const { t } = useTranslation();
  const tone = status === 'detecting' ? 'muted' : quality === 'good' ? 'good' : quality === 'rough' ? 'warn' : 'muted';
  const color = tone === 'good' ? '#166534' : tone === 'warn' ? '#92400E' : COLORS.textMuted;
  const text = status === 'detecting' ? t('customerHotFood.locDetecting')
    : status === 'denied' ? t('customerHotFood.locOff')
    : status === 'error' || !here ? t('customerHotFood.locError')
    : quality === 'rough' ? t('customerHotFood.locRough', { distance: accuracyText(t, here.accuracy) })
    : here.accuracy != null ? t('customerHotFood.locGood', { distance: accuracyText(t, here.accuracy) }) : t('customerHotFood.locGoodNoAccuracy');
  return (
    <View style={[p.locRow, tone === 'warn' && p.locRowWarn]} accessibilityRole="text" accessibilityLiveRegion="polite">
      {status === 'detecting' ? <ActivityIndicator size="small" color={COLORS.textMuted} />
        : tone === 'warn' ? <AlertTriangleIcon size={14} color={color} /> : <MapPinIcon size={14} color={color} />}
      <Text style={[p.locText, { color }]}>{text}</Text>
      {status === 'denied' ? (
        <TouchableOpacity onPress={onTurnOn} style={p.locBtn} accessibilityRole="button" accessibilityLabel={t('customerHotFood.turnOnLocationA11y')} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
          <Text style={p.locBtnText}>{t('customerHotFood.turnOnLocation')}</Text>
        </TouchableOpacity>
      ) : status !== 'detecting' ? (
        <TouchableOpacity onPress={onUpdate} style={p.locBtn} accessibilityRole="button" accessibilityLabel={t('customerHotFood.updateLocationA11y')} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
          <RefreshIcon size={13} color={COLORS.primary} />
          <Text style={p.locBtnText}>{t('customerHotFood.updateLocation')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ── The pickup store bar ─────────────────────────────────────────────────────

export function PickupBar({ store, closer, onChange, onSwitchToCloser }: {
  store: PickupStore; closer: PickupStore | null; onChange: () => void; onSwitchToCloser: () => void;
}) {
  const { t } = useTranslation();
  const dist = milesText(store.distance);
  return (
    <View style={p.bar}>
      <View style={p.barTop}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={p.barLabel}>{t('customerHotFood.pickupAt')}</Text>
          <Text style={p.barName} numberOfLines={1}>{store.name}</Text>
          <Text style={p.barAddr} numberOfLines={2}>{[addressLine(store), dist].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={p.barBtns}>
          <TouchableOpacity onPress={onChange} style={p.changeBtn} accessibilityRole="button" accessibilityLabel={t('customerHotFood.changeStoreA11y', { store: store.name })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={p.changeBtnText}>{t('customerHotFood.changeStore')}</Text>
            <ChevronDownIcon size={14} color={COLORS.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => openDirections(store)} style={p.dirBtn} accessibilityRole="link" accessibilityLabel={t('customerHotFood.directionsA11y', { store: store.name })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <MapPinIcon size={13} color={COLORS.secondary} />
            <Text style={p.dirBtnText}>{t('customerHotFood.directions')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      {closer && (
        <View style={p.nudge} accessibilityRole="alert">
          <AlertTriangleIcon size={14} color="#92400E" />
          <Text style={p.nudgeText}>{t('customerHotFood.notClosest', { store: closer.name, distance: milesText(closer.distance) })}</Text>
          <TouchableOpacity onPress={onSwitchToCloser} accessibilityRole="button" accessibilityLabel={t('customerHotFood.switchToA11y', { store: closer.name })} hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}>
            <Text style={p.nudgeBtn}>{t('customerHotFood.switchTo')}</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ── A store row (in the ask card and the list) ──────────────────────────────

function StoreRow({ store, selected, onPick }: { store: PickupStore; selected?: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const dist = milesText(store.distance);
  const hrs = hoursShort(t, store.hours);
  return (
    <TouchableOpacity
      style={[p.row, selected && p.rowSelected]}
      onPress={onPick}
      activeOpacity={0.8}
      accessibilityRole="radio"
      accessibilityState={{ checked: !!selected }}
      accessibilityLabel={[store.name, addressLine(store), dist ? t('customerHotFood.distanceAway', { distance: dist }) : null, hrs?.text].filter(Boolean).join('. ')}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={p.rowName} numberOfLines={1}>{store.name}</Text>
        <Text style={p.rowAddr} numberOfLines={2}>{addressLine(store)}</Text>
        {hrs && <Text style={[p.rowHours, { color: hrs.open ? '#166534' : '#9A3412' }]}>{hrs.text}</Text>}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {dist && <Text style={p.rowDist}>{dist}</Text>}
        {selected ? <CheckCircleIcon size={20} color={COLORS.primary} /> : <Text style={p.rowPick}>{t('customerHotFood.pickHere')}</Text>}
      </View>
    </TouchableOpacity>
  );
}

// ── The ask card: two at the same distance, or no location to go by ─────────

export function AskCard({ why, candidates, onPick, onSeeAll }: {
  why: 'tie' | 'no-location' | 'rough'; candidates: PickupStore[]; onPick: (id: string) => void; onSeeAll: () => void;
}) {
  const { t } = useTranslation();
  const shown = why === 'tie' ? candidates : candidates.slice(0, 4);
  return (
    <ScrollView contentContainerStyle={p.askWrap}>
      <Text style={p.askTitle}>{why === 'tie' ? t('customerHotFood.tieTitle') : why === 'rough' ? t('customerHotFood.roughTitle') : t('customerHotFood.chooseStoreTitle')}</Text>
      <Text style={p.askSub}>{why === 'tie' ? t('customerHotFood.tieSub') : why === 'rough' ? t('customerHotFood.roughSub') : t('customerHotFood.chooseStoreSub')}</Text>
      <View style={{ gap: 10, marginTop: 6 }}>
        {shown.map((s) => <StoreRow key={s.id} store={s} onPick={() => onPick(s.id)} />)}
      </View>
      {candidates.length > shown.length || why === 'tie' ? (
        <TouchableOpacity onPress={onSeeAll} style={p.seeAll} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={p.seeAllText}>{t('customerHotFood.seeAllStores')}</Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

// ── The list of every store ─────────────────────────────────────────────────

export function PickupStoreSheet({ stores, selectedId, onPick, onClose }: {
  stores: PickupStore[]; selectedId: string | null; onPick: (id: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={p.overlay}>
        <TouchableOpacity style={p.backdrop} onPress={onClose} activeOpacity={1} accessibilityRole="button" accessibilityLabel={t('customerHotFood.closeStoreListA11y')} />
        <View style={p.sheet}>
          <View style={p.handle} />
          <View style={p.sheetHead}>
            <Text style={p.sheetTitle}>{t('customerHotFood.chooseStoreTitle')}</Text>
            <ModalCloseButton onPress={onClose} label={t('customerHotFood.closeStoreListA11y')} size={20} color={COLORS.textMuted} />
          </View>
          <ScrollView contentContainerStyle={{ gap: 10, padding: 16, paddingBottom: 32 }} accessibilityRole="radiogroup">
            {stores.length === 0
              ? <Text style={p.askSub}>{t('customerHotFood.noPickupStores')}</Text>
              : stores.map((s) => <StoreRow key={s.id} store={s} selected={s.id === selectedId} onPick={() => onPick(s.id)} />)}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** The "pick up at" block in the cart and the order confirmation: name, address, distance and Directions. */
export function PickupSummary({ store, compact }: { store: PickupStore; compact?: boolean }) {
  const { t } = useTranslation();
  const dist = milesText(store.distance);
  return (
    <View style={[p.summary, compact && { marginBottom: 0 }]}>
      <MapPinIcon size={18} color={COLORS.primary} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={p.barLabel}>{t('customerHotFood.pickupAt')}</Text>
        <Text style={p.summaryName}>{store.name}</Text>
        {(addressLine(store) || dist) ? <Text style={p.barAddr}>{[addressLine(store), dist].filter(Boolean).join(' · ')}</Text> : null}
      </View>
      <TouchableOpacity onPress={() => openDirections(store)} style={p.dirBtn} accessibilityRole="link" accessibilityLabel={t('customerHotFood.directionsA11y', { store: store.name })} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
        <MapPinIcon size={13} color={COLORS.secondary} />
        <Text style={p.dirBtnText}>{t('customerHotFood.directions')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const p = StyleSheet.create({
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F1F2' },
  locRowWarn: { backgroundColor: '#FFFBEB', borderBottomColor: '#FDE68A' },
  locText: { flex: 1, fontSize: 12.5, fontWeight: '600' },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  locBtnText: { fontSize: 12.5, fontWeight: '800', color: COLORS.primary },

  bar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F1F2', paddingHorizontal: 16, paddingVertical: 12 },
  barTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  barLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.6, textTransform: 'uppercase' },
  barName: { fontSize: 17, fontWeight: '800', color: COLORS.text, marginTop: 1 },
  barAddr: { fontSize: 13, color: COLORS.textMuted, marginTop: 1, lineHeight: 18 },
  barHours: { fontSize: 12.5, fontWeight: '700', marginTop: 3 },
  barBtns: { alignItems: 'flex-end', gap: 8 },
  changeBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, borderWidth: 1, borderColor: '#F3C6CB', backgroundColor: '#FFF5F6', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  changeBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },
  dirBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  dirBtnText: { fontSize: 12.5, fontWeight: '700', color: COLORS.secondary },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  nudgeText: { flex: 1, fontSize: 12.5, color: '#92400E', fontWeight: '600', lineHeight: 17 },
  nudgeBtn: { fontSize: 13, fontWeight: '800', color: COLORS.primary },

  row: { flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, padding: 14 },
  rowSelected: { borderColor: COLORS.primary, borderWidth: 2, backgroundColor: '#FFF8F8' },
  rowName: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  rowAddr: { fontSize: 13, color: COLORS.textMuted, marginTop: 2, lineHeight: 18 },
  rowHours: { fontSize: 12.5, fontWeight: '700', marginTop: 4 },
  rowDist: { fontSize: 14, fontWeight: '800', color: COLORS.secondary },
  rowPick: { fontSize: 12.5, fontWeight: '800', color: COLORS.primary },

  askWrap: { padding: 16, paddingBottom: 40 },
  askTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  askSub: { fontSize: 14, color: COLORS.textMuted, lineHeight: 20, marginTop: 4 },
  seeAll: { alignSelf: 'center', marginTop: 16, paddingVertical: 6 },
  seeAllText: { fontSize: 14, fontWeight: '800', color: COLORS.primary },

  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: COLORS.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '85%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', marginTop: 8 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },

  summary: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFF8F8', borderWidth: 1, borderColor: '#F3C6CB', borderRadius: 14, padding: 12, marginBottom: 14 },
  summaryName: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginTop: 1 },
});
