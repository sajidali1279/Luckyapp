// The kitchen screen (2026-11-15, the owner's OK): a phone standing on the counter shows the store's hot food orders in columns, New,
// Cooking, Ready and Later (placed ahead), with the store's number of the day big on each order, timers that turn amber and red, the
// items to cook now added up at the top, a sound and a buzz every 30 seconds while a new order waits (mute button), "+5 min" on an order
// being made, and where the customer is waiting ("At pump 4"). The screen stays on while it is open. It is drawn inside the app (no
// native Modal, which can fail to draw on Android builds).
import { useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, TouchableOpacity, StyleSheet, Vibration, useWindowDimensions, Alert, ActivityIndicator } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { useTimeWords } from './HotFoodTimes';

export type KitchenStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';
export interface KitchenOrder {
  id: string;
  orderNumber: string;
  ticket?: number | null;
  status: KitchenStatus;
  createdAt: string;
  customer: { name: string; phone?: string };
  items: { name: string; quantity: number; price: number }[];
  note?: string | null;
  pickupAt?: string | null;
  startAt?: string | null;
  readyBy?: string | null;
  readyAt?: string | null;
  hereAt?: string | null;
  herePump?: number | null;
  paidWithPoints?: boolean;
}

/** The number said at the counter: the store's number of the day, else the end of the long order number (older orders). */
export const tagOf = (o: { ticket?: number | null; orderNumber: string }) => (o.ticket ? String(o.ticket) : o.orderNumber.replace(/^HF-/, '').slice(-4));
/** An order placed ahead whose kitchen start is more than 5 minutes away */
export const isLaterOrder = (o: { startAt?: string | null; status: string }) => (o.status === 'PENDING' || o.status === 'ACCEPTED') && !!o.startAt && new Date(o.startAt).getTime() > Date.now() + 5 * 60_000;

const NAVY = '#1D3557';
const COLS = [
  { key: 'NEW', labelKey: 'employeeHotFood.kitchenColNew', color: '#F97316' },
  { key: 'COOKING', labelKey: 'employeeHotFood.kitchenColCooking', color: '#3B82F6' },
  { key: 'READY', labelKey: 'employeeHotFood.kitchenColReady', color: '#16A34A' },
  { key: 'LATER', labelKey: 'employeeHotFood.kitchenColLater', color: '#7C3AED' },
] as const;
type ColKey = (typeof COLS)[number]['key'];

function colOf(o: KitchenOrder): ColKey | null {
  if (o.status === 'READY') return 'READY';
  if (o.status !== 'PENDING' && o.status !== 'ACCEPTED') return null;
  if (isLaterOrder(o)) return 'LATER';
  return o.status === 'PENDING' ? 'NEW' : 'COOKING';
}

/** The six "ready in" choices, drawn in the app (an Android alert shows only three buttons) */
export function AcceptTimeSheet({ number, onPick, onClose }: { number: string; onPick: (minutes?: number) => void; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={a.backdrop} accessibilityViewIsModal>
      <TouchableOpacity style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('employeeHotFood.cancel')} />
      <View style={a.sheet}>
        <Text style={a.title}>{t('employeeHotFood.acceptPickTitle', { n: number })}</Text>
        <Text style={a.sub}>{t('employeeHotFood.acceptPickSub')}</Text>
        <View style={a.grid}>
          {[5, 10, 15, 20, 30, 45].map((m) => (
            <TouchableOpacity key={m} style={a.btn} onPress={() => onPick(m)} accessibilityRole="button" accessibilityLabel={t('employeeHotFood.minutesN', { count: m })}>
              <Text style={a.btnBig}>{m}</Text>
              <Text style={a.btnSmall}>{t('employeeHotFood.minShort')}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={a.row}>
          <TouchableOpacity style={[a.wide, a.ghost]} onPress={() => onPick(undefined)} accessibilityRole="button"><Text style={a.ghostText}>{t('employeeHotFood.acceptNoTime')}</Text></TouchableOpacity>
          <TouchableOpacity style={[a.wide, a.ghost]} onPress={onClose} accessibilityRole="button"><Text style={a.ghostText}>{t('employeeHotFood.cancel')}</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function KitchenView({ orders, storeName, updatingId, onClose, onAccept, onStatus, onDecline, onMoreTime }: {
  orders: KitchenOrder[];
  storeName?: string;
  updatingId: string | null;
  onClose: () => void;
  onAccept: (o: KitchenOrder) => void;
  onStatus: (o: KitchenOrder, status: KitchenStatus) => void;
  onDecline: (o: KitchenOrder) => void;
  onMoreTime: (o: KitchenOrder) => void;
}) {
  useKeepAwake();
  const { t } = useTranslation();
  const tw = useTimeWords();
  const { width } = useWindowDimensions();
  const wide = width >= 720;
  const [muted, setMuted] = useState(false);
  const [page, setPage] = useState(0);
  const [, tick] = useState(0);
  const pager = useRef<ScrollView>(null);
  useEffect(() => { const i = setInterval(() => tick((n) => n + 1), 15_000); return () => clearInterval(i); }, []);

  const byCol = useMemo(() => {
    const m: Record<ColKey, KitchenOrder[]> = { NEW: [], COOKING: [], READY: [], LATER: [] };
    for (const o of orders) { const c = colOf(o); if (c) m[c].push(o); }
    m.NEW.sort((x, y) => +new Date(x.createdAt) - +new Date(y.createdAt));
    m.COOKING.sort((x, y) => +new Date(x.readyBy ?? x.createdAt) - +new Date(y.readyBy ?? y.createdAt));
    m.READY.sort((x, y) => +new Date(x.readyAt ?? x.createdAt) - +new Date(y.readyAt ?? y.createdAt));
    m.LATER.sort((x, y) => +new Date(x.startAt!) - +new Date(y.startAt!));
    return m;
  }, [orders]);

  // What to cook now: the items of the new orders and the ones being made, added up by name
  const cookNow = useMemo(() => {
    const sum = new Map<string, number>();
    for (const o of [...byCol.NEW, ...byCol.COOKING]) for (const l of o.items) sum.set(l.name, (sum.get(l.name) ?? 0) + l.quantity);
    return [...sum.entries()].sort((x, y) => y[1] - x[1]);
  }, [byCol]);

  // A new order waiting: a sound and a buzz now and every 30 seconds until someone accepts it (not when muted)
  const waiting = byCol.NEW.length;
  const seen = useRef<number>(waiting);
  useEffect(() => {
    const ring = () => {
      if (muted || byCol.NEW.length === 0) return;
      Vibration.vibrate([0, 400, 200, 400]);
      Notifications.scheduleNotificationAsync({
        content: { title: t('employeeHotFood.kitchenAlertTitle'), body: t('employeeHotFood.kitchenAlertBody', { n: tagOf(byCol.NEW[0]), count: byCol.NEW.length }), sound: true },
        trigger: null,
      }).catch(() => {});
    };
    if (waiting > seen.current) ring();
    seen.current = waiting;
    const i = setInterval(ring, 30_000);
    return () => clearInterval(i);
  }, [waiting, muted]);   // eslint-disable-line react-hooks/exhaustive-deps

  const mins = (fromIso: string) => Math.floor((Date.now() - new Date(fromIso).getTime()) / 60_000);

  const card = (o: KitchenOrder, col: ColKey) => {
    const busy = updatingId === o.id;
    const first = (o.customer?.name ?? '').split(' ')[0];
    let clock = ''; let clockColor = '#64748B';
    if (col === 'NEW') { const m = mins(o.createdAt); clock = t('employeeHotFood.kitchenWaiting', { count: m }); clockColor = m >= 15 ? '#DC2626' : m >= 10 ? '#D97706' : '#64748B'; }
    if (col === 'COOKING' && o.readyBy) {
      const left = Math.ceil((new Date(o.readyBy).getTime() - Date.now()) / 60_000);
      clock = left >= 0 ? t('employeeHotFood.kitchenLeft', { count: left }) : t('employeeHotFood.kitchenLate', { count: -left });
      clockColor = left < 0 ? '#DC2626' : left <= 2 ? '#D97706' : '#2563EB';
    }
    if (col === 'READY' && o.readyAt) { const m = mins(o.readyAt); clock = t('employeeHotFood.kitchenReadyFor', { count: m }); clockColor = m >= 15 ? '#DC2626' : '#16A34A'; }
    if (col === 'LATER' && o.startAt) clock = t('employeeHotFood.pickupStartAt', { time: tw.time(o.startAt) });
    return (
      <View key={o.id} style={[k.card, col === 'NEW' && k.cardNew]}>
        <View style={k.cardTop}>
          <Text style={k.ticket} accessibilityLabel={t('employeeHotFood.kitchenOrderA11y', { n: tagOf(o) })}>#{tagOf(o)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={k.name} numberOfLines={1}>{first}</Text>
            {o.pickupAt ? <Text style={k.pickup}>{t('employeeHotFood.pickupBadge', { when: tw.when(o.pickupAt) })}</Text> : null}
          </View>
          {clock ? <Text style={[k.clock, { color: clockColor }]}>{clock}</Text> : null}
        </View>
        {o.hereAt && o.herePump != null ? (
          <View style={k.here}><Text style={k.hereText}>{o.herePump ? t('employeeHotFood.kitchenAtPump', { pump: o.herePump }) : t('employeeHotFood.kitchenInside')}</Text></View>
        ) : null}
        {o.items.map((l, i) => (
          <View key={i} style={k.line}>
            <Text style={k.qty}>{l.quantity}×</Text>
            <Text style={k.item}>{l.name}</Text>
          </View>
        ))}
        {o.note ? <Text style={k.note}>{o.note}</Text> : null}
        {o.paidWithPoints ? <Text style={k.points}>{t('employeeHotFood.paidWithPoints')}</Text> : null}
        <View style={k.actions}>
          {busy ? <ActivityIndicator color={NAVY} /> : col === 'NEW' || (col === 'LATER' && o.status === 'PENDING') ? (<>
            <TouchableOpacity style={[k.btn, { backgroundColor: '#F97316' }]} onPress={() => onAccept(o)} accessibilityRole="button"><Text style={k.btnText}>{t('employeeHotFood.acceptOrderBtn')}</Text></TouchableOpacity>
            <TouchableOpacity style={[k.btn, k.btnGhost]} onPress={() => onDecline(o)} accessibilityRole="button"><Text style={k.btnGhostText}>{t('employeeHotFood.declineShort')}</Text></TouchableOpacity>
          </>) : col === 'COOKING' ? (<>
            <TouchableOpacity style={[k.btn, { backgroundColor: '#2563EB' }]} onPress={() => onStatus(o, 'READY')} accessibilityRole="button"><Text style={k.btnText}>{t('employeeHotFood.markReadyBtn')}</Text></TouchableOpacity>
            <TouchableOpacity style={[k.btn, k.btnGhost]} onPress={() => onMoreTime(o)} accessibilityRole="button" accessibilityLabel={t('employeeHotFood.plus5A11y', { n: tagOf(o) })}><Text style={k.btnGhostText}>{t('employeeHotFood.plus5')}</Text></TouchableOpacity>
          </>) : col === 'READY' ? (
            <TouchableOpacity style={[k.btn, { backgroundColor: '#16A34A' }]} onPress={() => onStatus(o, 'COMPLETED')} accessibilityRole="button"><Text style={k.btnText}>{t('employeeHotFood.completeBtn')}</Text></TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  };

  const column = (c: (typeof COLS)[number], w: number) => (
    <View key={c.key} style={[k.col, { width: w }]}>
      {wide ? <Text style={[k.colHead, { color: c.color }]}>{t(c.labelKey)} · {byCol[c.key].length}</Text> : null}
      <ScrollView contentContainerStyle={{ paddingBottom: 40, gap: 10 }}>
        {byCol[c.key].length === 0 ? <Text style={k.empty}>{t('employeeHotFood.kitchenEmpty')}</Text> : byCol[c.key].map((o) => card(o, c.key))}
      </ScrollView>
    </View>
  );

  return (
    <View style={k.root}>
      <View style={k.top}>
        <View style={{ flex: 1 }}>
          <Text style={k.title}>{t('employeeHotFood.kitchenTitle')}</Text>
          {storeName ? <Text style={k.sub}>{storeName}</Text> : null}
        </View>
        <TouchableOpacity style={k.topBtn} onPress={() => setMuted((m) => !m)} accessibilityRole="button" accessibilityLabel={muted ? t('employeeHotFood.kitchenUnmute') : t('employeeHotFood.kitchenMute')}>
          <Text style={k.topBtnText}>{muted ? '🔕' : '🔔'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={k.topBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('employeeHotFood.kitchenClose')}>
          <Text style={k.topBtnText}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={k.cook}>
        <Text style={k.cookLabel}>{t('employeeHotFood.kitchenCookNow')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 12 }}>
          {cookNow.length === 0 ? <Text style={k.cookNone}>{t('employeeHotFood.kitchenNothingToCook')}</Text>
            : cookNow.map(([name, n]) => <View key={name} style={k.cookChip}><Text style={k.cookChipText}>{n}× {name}</Text></View>)}
        </ScrollView>
      </View>
      {wide ? (
        <View style={{ flex: 1, flexDirection: 'row', gap: 10, padding: 10 }}>{COLS.map((c) => column(c, (width - 50) / 4))}</View>
      ) : (
        <>
          <View style={k.tabs}>
            {COLS.map((c, i) => (
              <TouchableOpacity key={c.key} style={[k.tab, page === i && { borderBottomColor: c.color }]} accessibilityRole="tab" accessibilityState={{ selected: page === i }}
                onPress={() => { setPage(i); pager.current?.scrollTo({ x: i * width, animated: true }); }}>
                <Text style={[k.tabText, page === i && { color: c.color }]}>{t(c.labelKey)}</Text>
                <Text style={[k.tabCount, byCol[c.key].length > 0 && { backgroundColor: c.color, color: '#fff' }]}>{byCol[c.key].length}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ flex: 1 }}
            onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}>
            {COLS.map((c) => <View key={c.key} style={{ width, padding: 10 }}>{column(c, width - 20)}</View>)}
          </ScrollView>
        </>
      )}
    </View>
  );
}

export function confirmDecline(t: (k: string, o?: any) => string, o: KitchenOrder, go: (reason?: string) => void) {
  Alert.alert(
    o.status === 'PENDING' ? t('employeeHotFood.declineOrderTitle') : t('employeeHotFood.cancelOrderTitle'),
    o.status === 'PENDING' ? t('employeeHotFood.declineOrderBody') : t('employeeHotFood.cancelOrderBody'),
    [
      { text: t('employeeHotFood.no') },
      { text: t('employeeHotFood.declineOutOfStock'), onPress: () => go(t('employeeHotFood.reasonOutOfStock')) },
      { text: o.status === 'PENDING' ? t('employeeHotFood.declineOrderBtn') : t('employeeHotFood.cancelOrderBtn'), style: 'destructive', onPress: () => go() },
    ],
  );
}

const k = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: '#EEF1F6', zIndex: 50, elevation: 50 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: NAVY, paddingHorizontal: 14, paddingVertical: 10 },
  title: { color: '#fff', fontSize: 20, fontWeight: '900' },
  sub: { color: '#C7D2E3', fontSize: 13, fontWeight: '600' },
  topBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  topBtnText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  cook: { backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 6 },
  cookLabel: { fontSize: 11, fontWeight: '900', color: '#64748B', letterSpacing: 0.6, textTransform: 'uppercase' },
  cookNone: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  cookChip: { backgroundColor: '#FFF7ED', borderColor: '#FDBA74', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  cookChipText: { fontSize: 15, fontWeight: '900', color: '#9A3412' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: 'transparent', gap: 3 },
  tabText: { fontSize: 13, fontWeight: '800', color: '#475569' },
  tabCount: { fontSize: 12, fontWeight: '900', color: '#64748B', backgroundColor: '#E2E8F0', borderRadius: 999, paddingHorizontal: 8, overflow: 'hidden' },
  col: { flex: 1 },
  colHead: { fontSize: 15, fontWeight: '900', marginBottom: 8 },
  empty: { textAlign: 'center', color: '#94A3B8', fontSize: 14, marginTop: 30 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', gap: 6 },
  cardNew: { borderColor: '#FDBA74', borderWidth: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ticket: { fontSize: 30, fontWeight: '900', color: NAVY, minWidth: 64 },
  name: { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  pickup: { fontSize: 12, fontWeight: '700', color: '#1D4ED8' },
  clock: { fontSize: 14, fontWeight: '900' },
  here: { alignSelf: 'flex-start', backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  hereText: { color: '#166534', fontWeight: '900', fontSize: 14 },
  line: { flexDirection: 'row', gap: 8 },
  qty: { fontSize: 17, fontWeight: '900', color: '#CC2936', minWidth: 30 },
  item: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0F172A' },
  note: { fontSize: 14, color: '#92400E', backgroundColor: '#FFFBEB', borderRadius: 8, padding: 8, fontWeight: '600' },
  points: { fontSize: 12, color: '#6D28D9', fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4, minHeight: 44, alignItems: 'center' },
  btn: { flex: 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
  btnGhost: { flex: 0, flexShrink: 0, minWidth: 104, paddingHorizontal: 14, backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#CBD5E1' },
  btnGhostText: { color: '#334155', fontSize: 15, fontWeight: '800' },
});

const a = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end', zIndex: 100, elevation: 100 },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 28, gap: 10 },
  title: { fontSize: 19, fontWeight: '900', color: '#0F172A' },
  sub: { fontSize: 13, color: '#64748B' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  btn: { width: '31%', flexGrow: 1, minHeight: 64, borderRadius: 14, backgroundColor: '#FFF7ED', borderWidth: 1.5, borderColor: '#FDBA74', alignItems: 'center', justifyContent: 'center' },
  btnBig: { fontSize: 24, fontWeight: '900', color: '#9A3412' },
  btnSmall: { fontSize: 12, fontWeight: '700', color: '#9A3412' },
  row: { flexDirection: 'row', gap: 10 },
  wide: { flex: 1, minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  ghost: { borderWidth: 1.5, borderColor: '#CBD5E1' },
  ghostText: { fontSize: 15, fontWeight: '800', color: '#334155' },
});
