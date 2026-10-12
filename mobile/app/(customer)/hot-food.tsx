import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  ActivityIndicator,
  ScrollView,
  Alert,
  Linking,
  Platform,
  Switch,
} from 'react-native';
import { Text, TextInput } from '../../components/ScaledText';
import RefreshControl from '../../components/AppRefreshControl';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { hotFoodApi, storesApi, authApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import { FlameIcon, ClockIcon, CheckCircleIcon, MapPinIcon } from '../../components/Icons';
import ErrorState from '../../components/ErrorState';
import ModalCloseButton from '../../components/ModalCloseButton';
import FadeSlideIn from '../../components/FadeSlideIn';
import KeyboardSafe from '../../components/KeyboardSafe';
import ModalToastHost from '../../components/ModalToastHost';
import LargeTitleHeader, { useLargeTitleScroll } from '../../components/LargeTitleHeader';
import { sized } from '../../utils/imageUrl';
import { byDistance, choosePickup, closerStore, locationQuality, loadSavedPickup, savePickup, addressLine, openDirections, milesText, FAR_MILES, type Here, type PickupStore } from '../../utils/pickupStore';
import { LocationLine, PickupBar, AskCard, PickupStoreSheet, PickupSummary } from '../../components/HotFoodPickup';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  estimatedMinutes?: number;
  imageUrl?: string;
}

interface CartItem extends MenuItem { qty: number }

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';

interface FoodOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  note?: string;
  estimatedMinutes?: number;
  createdAt: string;
  updatedAt: string;
  store: { name: string; address?: string | null; city?: string | null; state?: string | null; latitude?: number | null; longitude?: number | null };
  items: { name: string; quantity: number; price: number }[];
  /** STORE (declined), CUSTOMER or AUTO (nobody accepted it in time) */
  cancelledBy?: string | null;
  cancelReason?: string | null;
  /** Paid with points (the whole order); they go back when it is cancelled */
  paidWithPoints?: boolean;
  pointsAmount?: number | null;
  pointsReturnedAt?: string | null;
}

const toPts = (dollars: number) => Math.round(dollars * 100);

type Tab = 'menu' | 'orders';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS: Record<OrderStatus, { labelKey: string; color: string; bg: string; emoji: string; detailKey: string }> = {
  PENDING:   { labelKey: 'customerHotFood.statusPending',   color: '#F97316', bg: '#FFF7ED', emoji: '⏳', detailKey: 'customerHotFood.statusPendingDetail' },
  ACCEPTED:  { labelKey: 'customerHotFood.statusPreparing', color: '#3B82F6', bg: '#EFF6FF', emoji: '👨‍🍳', detailKey: 'customerHotFood.statusPreparingDetail' },
  READY:     { labelKey: 'customerHotFood.statusReady',     color: '#16A34A', bg: '#F0FDF4', emoji: '✅', detailKey: 'customerHotFood.statusReadyDetail' },
  COMPLETED: { labelKey: 'customerHotFood.statusPickedUp',  color: '#94A3B8', bg: '#F8FAFC', emoji: '🎉', detailKey: 'customerHotFood.statusPickedUpDetail' },
  CANCELLED: { labelKey: 'customerHotFood.statusCancelled', color: '#EF4444', bg: '#FEF2F2', emoji: '❌', detailKey: 'customerHotFood.statusCancelledDetail' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string, t: (key: string, options?: Record<string, unknown>) => string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return t('customerHotFood.justNow');
  if (mins < 60) return t('customerHotFood.minutesAgo', { count: mins });
  return t('customerHotFood.hoursMinutesAgo', { hours: Math.floor(mins / 60), minutes: mins % 60 });
}

function fmtPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

// Whether this store is taking hot food orders right now (the server works it out from its hot food hours, the store's hours and
// holidays; outside them it refuses orders from everyone)
interface HotFoodHours {
  open: boolean; limited: boolean;
  closesAt: string | null; opensAt: string | null; opensDay: string | null; holiday: string | null;
}

function hoursLine(t: (k: string, o?: any) => string, h: HotFoodHours): string {
  if (h.open) return h.closesAt ? t('customerHotFood.openUntil', { time: h.closesAt }) : t('customerHotFood.openNow');
  const head = h.holiday ? t('customerHotFood.closedHoliday', { holiday: h.holiday }) : t('customerHotFood.closedNow');
  if (!h.opensAt || !h.opensDay) return head;
  const when = h.opensDay === 'today' ? t('customerHotFood.whenToday') : h.opensDay === 'tomorrow' ? t('customerHotFood.whenTomorrow') : t(`customerHotFood.when${h.opensDay}`);
  return t('customerHotFood.closedOpens', { head, when, time: h.opensAt });
}

// ─── Menu Item Card ───────────────────────────────────────────────────────────

function MenuCard({ item, qty, onAdd, onRemove, closed = false }: {
  item: MenuItem; qty: number; onAdd: () => void; onRemove: () => void; closed?: boolean;
}) {
  const { t } = useTranslation();
  const [imgErr, setImgErr] = useState(false);

  return (
    <View style={mc.card}>
      <View style={mc.left}>
        {item.imageUrl && !imgErr ? (
          <Image
            source={{ uri: sized(item.imageUrl, 200) }}
            style={mc.itemImage}
            onError={() => setImgErr(true)}
          />
        ) : (
          <View style={mc.iconRing}>
            <FlameIcon size={22} color={COLORS.primary} />
          </View>
        )}
      </View>
      <View style={mc.info}>
        <Text style={mc.name}>{item.name}</Text>
        {item.description ? (
          <Text style={mc.desc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <View style={mc.meta}>
          <Text style={mc.price}>{fmtPrice(item.price)}</Text>
          {item.estimatedMinutes ? (
            <View style={mc.waitPill}>
              <ClockIcon size={11} color="#F97316" />
              <Text style={mc.waitText}>{t('customerHotFood.estimatedMinutes', { count: item.estimatedMinutes })}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={mc.controls}>
        {qty > 0 ? (
          <View style={mc.stepper}>
            <TouchableOpacity
              style={mc.stepBtn}
              onPress={onRemove}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('customerHotFood.removeOneA11y', { name: item.name })}
              hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            >
              <Text style={mc.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={mc.stepQty}>{qty}</Text>
            <TouchableOpacity
              style={[mc.stepBtn, mc.stepBtnAdd, closed && mc.btnClosed]}
              onPress={onAdd}
              disabled={closed}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('customerHotFood.addOneMoreA11y', { name: item.name })}
              hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            >
              <Text style={[mc.stepBtnText, { color: '#fff' }]}>+</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[mc.addBtn, closed && mc.btnClosed]}
            onPress={onAdd}
            disabled={closed}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ disabled: closed }}
            accessibilityLabel={closed ? t('customerHotFood.closedAddA11y', { name: item.name }) : t('customerHotFood.addToCartA11y', { name: item.name })}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={[mc.addBtnText, closed && mc.btnClosedText]}>{closed ? t('customerHotFood.closedBtn') : t('customerHotFood.addBtn')}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── ETA Countdown ────────────────────────────────────────────────────────────

function useEtaCountdown(order: FoodOrder): string | null {
  const { t } = useTranslation();
  const getRemaining = () => {
    if (order.status !== 'ACCEPTED' || !order.estimatedMinutes) return null;
    const acceptedAt = new Date(order.updatedAt).getTime();
    const eta = acceptedAt + order.estimatedMinutes * 60_000;
    const remaining = Math.ceil((eta - Date.now()) / 60_000);
    return remaining > 0 ? t('customerHotFood.minLeft', { count: remaining }) : t('customerHotFood.almostReady');
  };

  const [label, setLabel] = useState<string | null>(getRemaining);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (order.status !== 'ACCEPTED' || !order.estimatedMinutes) {
      setLabel(null);
      return;
    }
    setLabel(getRemaining());
    timerRef.current = setInterval(() => setLabel(getRemaining()), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.status, order.estimatedMinutes, order.updatedAt]);

  return label;
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onCancel, cancelling }: { order: FoodOrder; onCancel?: (order: FoodOrder) => void; cancelling?: boolean }) {
  const { t } = useTranslation();
  const cfg = STATUS[order.status];
  const etaLabel = useEtaCountdown(order);
  const [expanded, setExpanded] = useState(order.status === 'READY');
  const statusLabel = t(cfg.labelKey);

  return (
    <TouchableOpacity
      style={[oc.card, { borderLeftColor: cfg.color }]}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={t('customerHotFood.orderCardA11y', {
        number: order.orderNumber,
        status: statusLabel,
        action: expanded ? t('customerHotFood.collapse') : t('customerHotFood.expand'),
      })}
    >
      <View style={oc.top}>
        <View style={oc.topLeft}>
          <Text style={oc.emoji}>{cfg.emoji}</Text>
          <View>
            <Text style={oc.orderNum}>#{order.orderNumber}</Text>
            <Text style={oc.store}>{order.store.name}</Text>
            {(order.status === 'PENDING' || order.status === 'ACCEPTED' || order.status === 'READY') && addressLine(order.store) ? (
              <Text style={oc.storeAddr}>{addressLine(order.store)}</Text>
            ) : null}
          </View>
        </View>
        <View style={[oc.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[oc.badgeText, { color: cfg.color }]}>{statusLabel}</Text>
        </View>
      </View>

      <Text style={oc.detail}>{t(cfg.detailKey)}</Text>
      {order.paidWithPoints && order.pointsAmount ? (
        <Text style={oc.points}>
          {order.status === 'CANCELLED'
            ? (order.pointsReturnedAt ? t('customerHotFood.pointsReturned', { points: toPts(order.pointsAmount) }) : t('customerHotFood.paidWithPointsLine', { points: toPts(order.pointsAmount) }))
            : t('customerHotFood.paidWithPointsNothingToPay', { points: toPts(order.pointsAmount) })}
        </Text>
      ) : null}
      {order.status === 'CANCELLED' && order.cancelledBy && order.cancelledBy !== 'CUSTOMER' && (
        <Text style={oc.cancelReason}>
          {order.cancelledBy === 'AUTO'
            ? t('customerHotFood.cancelledAuto')
            : order.cancelReason ? t('customerHotFood.declinedReason', { reason: order.cancelReason }) : t('customerHotFood.declinedNoReason')}
        </Text>
      )}
      {order.status === 'PENDING' && onCancel && (
        <TouchableOpacity
          style={[oc.cancelBtn, cancelling && { opacity: 0.5 }]}
          onPress={() => onCancel(order)}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel={t('customerHotFood.cancelOrderA11y', { number: order.orderNumber })}
        >
          <Text style={oc.cancelBtnText}>{cancelling ? t('customerHotFood.cancelling') : t('customerHotFood.cancelOrder')}</Text>
        </TouchableOpacity>
      )}

      {(order.status === 'ACCEPTED' || order.status === 'READY') && (
        <TouchableOpacity
          style={oc.dirBtn}
          onPress={() => openDirections(order.store)}
          accessibilityRole="link"
          accessibilityLabel={t('customerHotFood.directionsA11y', { store: order.store.name })}
        >
          <MapPinIcon size={13} color={COLORS.secondary} />
          <Text style={oc.dirBtnText}>{t('customerHotFood.directionsTo', { store: order.store.name })}</Text>
        </TouchableOpacity>
      )}

      {etaLabel ? (
        <View style={oc.etaBadge}>
          <ClockIcon size={12} color="#3B82F6" />
          <Text style={oc.etaBadgeText}>{etaLabel}</Text>
        </View>
      ) : null}

      {expanded && (
        <View style={oc.body}>
          <View style={oc.divider} />
          {order.items.map((item, i) => (
            <View key={i} style={oc.itemRow}>
              <Text style={oc.itemQty}>{item.quantity}×</Text>
              <Text style={oc.itemName}>{item.name}</Text>
              <Text style={oc.itemPrice}>{fmtPrice(item.price * item.quantity)}</Text>
            </View>
          ))}
          <View style={oc.totalRow}>
            <Text style={oc.totalLabel}>{t('customerHotFood.total')}</Text>
            <Text style={oc.totalVal}>{fmtPrice(order.totalAmount)}</Text>
          </View>
          {order.note ? (
            <View style={oc.noteRow}>
              <Text style={oc.noteLabel}>{t('customerHotFood.noteLabel')}</Text>
              <Text style={oc.noteText}>{order.note}</Text>
            </View>
          ) : null}
          {etaLabel ? (
            <Text style={oc.eta}>{etaLabel}</Text>
          ) : null}
          <Text style={oc.time}>{timeAgo(order.createdAt, t)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Cart Sheet ───────────────────────────────────────────────────────────────

function CartSheet({ cart, store, closedText, onClose, onOrderPlaced }: {
  cart: CartItem[];
  store: PickupStore;
  closedText: string | null;
  onClose: () => void;
  onOrderPlaced: () => void;
}) {
  const { t } = useTranslation();
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  // Points pay only for the whole order: the choice is there only when the balance covers all of it
  const balance = useAuthStore((st) => st.user?.pointsBalance ?? 0);
  const updateBalance = useAuthStore((st) => st.updateBalance);
  const needPts = toPts(total);
  const havePts = toPts(balance);
  const canUsePoints = needPts > 0 && havePts >= needPts;
  const [usePoints, setUsePoints] = useState(false);
  const payWithPoints = usePoints && canUsePoints;
  // The balance in the app can be old (points approved since it opened): read it again when the order sheet opens
  useEffect(() => {
    authApi.getMe().then(({ data }) => {
      if (typeof data?.data?.pointsBalance === 'number') updateBalance(data.data.pointsBalance);
    }).catch(() => {});
  }, [updateBalance]);

  const placeMutation = useMutation({
    mutationFn: () => hotFoodApi.placeOrder({
      storeId: store.id,
      items: cart.map(i => ({ menuItemId: i.id, quantity: i.qty })),
      ...(note.trim() ? { note: note.trim() } : {}),
      ...(payWithPoints ? { payWithPoints: true } : {}),
    }),
    onSuccess: (res: any) => {
      if (typeof res?.data?.pointsBalance === 'number') updateBalance(res.data.pointsBalance);
      qc.invalidateQueries({ queryKey: ['my-hot-food-orders'] });
      onOrderPlaced();
    },
    onError: (e: any) => {
      const d = e.response?.data;
      if (d?.code === 'NOT_ENOUGH_POINTS') {
        if (typeof d.have === 'number') updateBalance(d.have / 100);   // the balance in the app was out of date
        setUsePoints(false);
        Toast.show({ type: 'error', text1: t('customerHotFood.notEnoughPointsTitle'), text2: t('customerHotFood.notEnoughPoints', { need: d.need, have: d.have }) });
        return;
      }
      if (d?.code === 'TOO_MANY_OPEN_ORDERS') {
        Toast.show({ type: 'error', text1: t('customerHotFood.tooManyOpenTitle'), text2: t('customerHotFood.tooManyOpenSub') });
        return;
      }
      if (d?.code === 'HOT_FOOD_CLOSED') {
        // It closed while the order was being made: say so in the app's language and show the new state
        Toast.show({ type: 'error', text1: t('customerHotFood.closedToast'), text2: d.hours ? hoursLine(t, d.hours) : undefined });
        qc.invalidateQueries({ queryKey: ['customer-hot-food-menu'] });
        return;
      }
      Toast.show({ type: 'error', text1: d?.error || t('customerHotFood.placeOrderError') });
    },
  });

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardSafe style={{ flex: 1 }}>
      <View style={cs.overlay}>
        <TouchableOpacity
          style={cs.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel={t('customerHotFood.dismissOrderSheetA11y')}
        />
        <View style={cs.sheet}>
          <View style={cs.handle} />

          <View style={cs.header}>
            <Text style={cs.title}>{t('customerHotFood.cartTitle')}</Text>
            <ModalCloseButton onPress={onClose} label={t('customerHotFood.closeOrderSheetA11y')} size={20} color={COLORS.textMuted} />
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={cs.body} showsVerticalScrollIndicator={false}>
            <PickupSummary store={store} />
            {cart.map(item => (
              <View key={item.id} style={cs.lineRow}>
                <Text style={cs.lineQty}>{item.qty}×</Text>
                <Text style={cs.lineName}>{item.name}</Text>
                <Text style={cs.linePrice}>{fmtPrice(item.price * item.qty)}</Text>
              </View>
            ))}

            <View style={cs.totalRow}>
              <Text style={cs.totalLabel}>{t('customerHotFood.total')}</Text>
              <Text style={cs.totalVal}>{fmtPrice(total)}</Text>
            </View>

            <View style={[cs.pointsRow, !canUsePoints && { opacity: 0.6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={cs.pointsTitle}>{t('customerHotFood.payWithPoints', { points: needPts })}</Text>
                <Text style={cs.pointsSub}>
                  {canUsePoints ? t('customerHotFood.payWithPointsHave', { have: havePts }) : t('customerHotFood.payWithPointsShort', { more: needPts - havePts, have: havePts })}
                </Text>
              </View>
              <Switch
                value={payWithPoints}
                onValueChange={setUsePoints}
                disabled={!canUsePoints}
                trackColor={{ true: COLORS.primary, false: '#D1D5DB' }}
                thumbColor="#fff"
                accessibilityLabel={t('customerHotFood.payWithPoints', { points: needPts })}
              />
            </View>

            <View style={cs.noteSection}>
              <Text style={cs.noteLabel}>{t('customerHotFood.specialInstructions')}</Text>
              <TextInput
                style={cs.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder={t('customerHotFood.notePlaceholder')}
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={120}
                returnKeyType="done"
                blurOnSubmit
              />
            </View>

            <View style={cs.infoBox}>
              <Text style={cs.infoText}>
                {payWithPoints ? t('customerHotFood.paidWithPointsInfo') : t('customerHotFood.payAtCounterInfo')}
              </Text>
            </View>
          </ScrollView>

          <View style={cs.footer}>
            {closedText ? <Text style={cs.closedNote} accessibilityRole="alert">{closedText}</Text> : null}
            <TouchableOpacity
              style={[cs.placeBtn, (placeMutation.isPending || !!closedText) && { opacity: 0.5 }]}
              onPress={() => {
                if (store.distance != null && store.distance > FAR_MILES) {
                  Alert.alert(t('customerHotFood.farTitle'), t('customerHotFood.farBody', { store: store.name, distance: milesText(store.distance) }), [
                    { text: t('customerHotFood.farCancel'), style: 'cancel' },
                    { text: t('customerHotFood.farConfirm'), onPress: () => placeMutation.mutate() },
                  ]);
                  return;
                }
                placeMutation.mutate();
              }}
              disabled={placeMutation.isPending || !!closedText}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ disabled: placeMutation.isPending || !!closedText }}
              accessibilityLabel={closedText ? t('customerHotFood.orderingClosedBtn') : placeMutation.isPending ? t('customerHotFood.placingOrderA11y') : t('customerHotFood.placeOrderAtA11y', { total: fmtPrice(total), store: store.name, address: addressLine(store) })}
            >
              {placeMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={cs.placeBtnText} numberOfLines={2}>{closedText ? t('customerHotFood.orderingClosedBtn') : payWithPoints ? t('customerHotFood.placeOrderPointsBtn', { points: needPts, store: store.name }) : t('customerHotFood.placeOrderAtBtn', { total: fmtPrice(total), store: store.name })}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
      </KeyboardSafe>
      <ModalToastHost />
    </Modal>
  );
}

// ─── Order Success Sheet ──────────────────────────────────────────────────────

function OrderSuccessSheet({ store, onClose }: { store: PickupStore | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={ss.overlay}>
        <View style={ss.sheet}>
          <Text style={ss.emoji}>🎉</Text>
          <Text style={ss.title}>{t('customerHotFood.orderPlacedTitle')}</Text>
          <Text style={ss.sub}>
            {t('customerHotFood.orderPlacedSub1')}{' '}
            <Text style={{ fontWeight: '800', color: COLORS.primary }}>{t('customerHotFood.orderPlacedTabName')}</Text>{' '}
            {t('customerHotFood.orderPlacedSub2')}
          </Text>
          {store && <View style={{ alignSelf: 'stretch', marginTop: 4 }}><PickupSummary store={store} compact /></View>}
          <TouchableOpacity
            style={ss.btn}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('customerHotFood.dismissConfirmationA11y')}
          >
            <Text style={ss.btnText}>{t('customerHotFood.gotIt')}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <ModalToastHost />
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CustomerHotFoodScreen() {
  const { t } = useTranslation();
  const largeTitle = useLargeTitleScroll();
  const setTab = (v: Tab) => { largeTitle.scrollY.setValue(0); setTabState(v); };
  const qc = useQueryClient();
  const [tab, setTabState] = useState<Tab>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // ── Where the order is picked up (2026-10-11): the customer chooses; the app opens on the closest store, asks when two are about the
  // same distance or the location cannot tell, remembers the store they chose, and says how good the location is
  const [here, setHere] = useState<Here | null>(null);
  const [locStatus, setLocStatus] = useState<'detecting' | 'ok' | 'denied' | 'error'>('detecting');
  const [savedId, setSavedId] = useState<string | null | undefined>(undefined);   // undefined until read
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [placedAt, setPlacedAt] = useState<PickupStore | null>(null);

  const locate = useCallback(async () => {
    setLocStatus('detecting');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { setLocStatus('denied'); setHere(null); return; }
      // A precise fix, but never a long wait indoors: after 10 seconds the phone's last known location (its accuracy is shown)
      const precise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000));
      const pos = (await Promise.race([precise, timeout])) ?? (await Location.getLastKnownPositionAsync());
      if (!pos) { setLocStatus('error'); return; }
      setHere({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null, at: Date.now() });
      setLocStatus('ok');
    } catch {
      setLocStatus('error');
    }
  }, []);
  useEffect(() => { locate(); loadSavedPickup().then(setSavedId); }, [locate]);

  const { data: pickupData, isError: pickupError } = useQuery({
    queryKey: ['hot-food-pickup-stores'],
    queryFn: hotFoodApi.getPickupStores,
    staleTime: 60_000,
    refetchInterval: 60_000,   // open / closed follows the clock
  });
  // A server from before the pickup list: the stores' own list, those with hot food on (no hours in it)
  const { data: storesData } = useQuery({
    queryKey: ['stores-gas-prices'],
    queryFn: storesApi.getGasPrices,
    staleTime: 5 * 60 * 1000,
    enabled: pickupError,
  });
  const pickupStores: PickupStore[] = pickupError
    ? ((storesData?.data?.data ?? []) as any[]).filter((st) => st.hotFoodEnabled !== false)
    : (pickupData?.data?.data ?? []);
  const sorted = byDistance(pickupStores, here);
  const quality = locationQuality(locStatus === 'ok' ? here : null);
  const storesReady = pickupError ? !!storesData : !!pickupData;
  const choice = storesReady && locStatus !== 'detecting' && savedId !== undefined ? choosePickup(sorted, locStatus === 'ok' ? here : null, savedId) : null;
  // The store in use: the one the customer chose, else the one the rules picked (the screen asks when they do not pick)
  const autoId = choice?.kind === 'chosen' ? choice.id : null;
  const storeId = chosenId ?? autoId;
  const store = sorted.find((st) => st.id === storeId) ?? null;
  const closer = closerStore(sorted, storeId, locStatus === 'ok' ? here : null);
  // Once the screen settles on a store it stays there: a later location update never moves an order in the making to another store
  // (the customer sees "not your closest store" and decides)
  useEffect(() => { if (!chosenId && autoId) setChosenId(autoId); }, [chosenId, autoId]);

  function pickStore(id: string) {
    const apply = () => { setChosenId(id); setSavedId(id); savePickup(id); setShowPicker(false); };
    if (cart.length > 0 && id !== storeId) {
      const to = sorted.find((st) => st.id === id);
      setShowPicker(false);
      Alert.alert(t('customerHotFood.switchStoreTitle'), t('customerHotFood.switchStoreBody', { from: store?.name ?? '', to: to?.name ?? '' }), [
        { text: t('customerHotFood.keepStore', { store: store?.name ?? '' }), style: 'cancel' },
        { text: t('customerHotFood.switchStoreYes'), style: 'destructive', onPress: () => { setCart([]); apply(); } },
      ]);
      return;
    }
    apply();
  }

  const effectiveStore = store?.id || '';

  // Menu for detected store
  const { data: menuData, isLoading: menuLoading, isError: menuIsError, refetch: refetchMenu, isRefetching: menuRefetching } = useQuery({
    queryKey: ['customer-hot-food-menu', effectiveStore],
    queryFn: () => hotFoodApi.getCustomerMenu(effectiveStore),
    enabled: !!effectiveStore,
    staleTime: 60_000,
    refetchInterval: 60_000,   // the open / closed line follows the clock
  });
  const menuItems: MenuItem[] = menuData?.data?.data || [];
  const hours: HotFoodHours | undefined = menuData?.data?.hours;
  const closed = !!hours && !hours.open;

  // My orders
  const { data: ordersData, isLoading: ordersLoading, isError: ordersIsError, refetch: refetchOrders, isRefetching: ordersRefetching } = useQuery({
    queryKey: ['my-hot-food-orders'],
    queryFn: hotFoodApi.getMyOrders,
    refetchInterval: tab === 'orders' ? 15_000 : false,
  });

  // Cancel an order the store has not started (the store is told not to make it)
  const cancelMutation = useMutation({
    mutationFn: (orderId: string) => hotFoodApi.cancelMyOrder(orderId),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['my-hot-food-orders'] });
      const back = Number(res?.data?.pointsReturned) || 0;   // paid with points: they went back
      if (back > 0) {
        const st = useAuthStore.getState();
        st.updateBalance((st.user?.pointsBalance ?? 0) + back / 100);
      }
      Toast.show({ type: 'success', text1: t('customerHotFood.cancelledToast'), text2: back > 0 ? t('customerHotFood.pointsBackToast', { points: back }) : undefined });
    },
    onError: (e: any) => {
      Toast.show({ type: 'error', text1: e?.response?.data?.error || t('customerHotFood.cancelFailed') });
      qc.invalidateQueries({ queryKey: ['my-hot-food-orders'] });
    },
  });
  function askCancel(order: FoodOrder) {
    Alert.alert(t('customerHotFood.cancelConfirmTitle'), t('customerHotFood.cancelConfirmBody', { number: order.orderNumber }), [
      { text: t('customerHotFood.keepOrder'), style: 'cancel' },
      { text: t('customerHotFood.cancelOrder'), style: 'destructive', onPress: () => cancelMutation.mutate(order.id) },
    ]);
  }
  const orders: FoodOrder[] = ordersData?.data?.data || [];
  const activeOrders = orders.filter(o => o.status === 'PENDING' || o.status === 'ACCEPTED' || o.status === 'READY');
  const pastOrders = orders.filter(o => o.status === 'COMPLETED' || o.status === 'CANCELLED');

  // Cart helpers
  const cartTotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const getQty = useCallback((id: string) => cart.find(c => c.id === id)?.qty || 0, [cart]);

  const addToCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (existing) return prev.map(c => c.id === item.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { ...item, qty: 1 }];
    });
  }, []);

  const removeFromCart = useCallback((item: MenuItem) => {
    setCart(prev => {
      const existing = prev.find(c => c.id === item.id);
      if (!existing || existing.qty <= 1) return prev.filter(c => c.id !== item.id);
      return prev.map(c => c.id === item.id ? { ...c, qty: c.qty - 1 } : c);
    });
  }, []);

  function handleOrderPlaced() {
    if (store) { setPlacedAt(store); savePickup(store.id); setSavedId(store.id); setChosenId(store.id); }
    setShowCart(false);
    setCart([]);
    setShowSuccess(true);
    setTab('orders');
    qc.invalidateQueries({ queryKey: ['my-hot-food-orders'] });
  }

  const hasActive = activeOrders.length > 0;

  return (
    <View style={s.root}>
      {/* Header */}
      <LargeTitleHeader
        title={t('customerHotFood.headerTitle')}
        subtitle={t('customerHotFood.headerSub')}
        scrollY={largeTitle.scrollY}
        color={COLORS.primary}
        icon={<View style={s.flameBadge}><FlameIcon size={18} color="#fff" /></View>}
        right={hasActive ? (
          <TouchableOpacity
            style={s.activePill}
            onPress={() => setTab('orders')}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={t('customerHotFood.activeOrdersA11y', { count: activeOrders.length })}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          >
            <View style={s.activeDot} />
            <Text style={s.activePillText} maxFontSizeMultiplier={1.2}>{t('customerHotFood.activeCount', { count: activeOrders.length })}</Text>
          </TouchableOpacity>
        ) : undefined}
      >

        {/* Tab bar */}
        <View style={s.tabs}>
          {(['menu', 'orders'] as Tab[]).map(tabValue => (
            <TouchableOpacity
              key={tabValue}
              style={[s.tab, tab === tabValue && s.tabActive]}
              onPress={() => setTab(tabValue)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={tabValue === 'menu' ? t('customerHotFood.menuTabA11y') : t('customerHotFood.myOrdersTabA11y')}
              accessibilityState={{ selected: tab === tabValue }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={[s.tabText, tab === tabValue && s.tabTextActive]}>
                {tabValue === 'menu'
                  ? t('customerHotFood.menuTabLabel')
                  : orders.length
                    ? t('customerHotFood.myOrdersTabLabelWithCount', { count: orders.length })
                    : t('customerHotFood.myOrdersTabLabel')}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </LargeTitleHeader>

      {/* ── MENU TAB ── */}
      {tab === 'menu' && (
        <>
          {/* How good the location is, then the store the order goes to (or the question which one) */}
          <LocationLine status={locStatus} here={here} quality={quality} onUpdate={locate} onTurnOn={() => Linking.openSettings().catch(() => {})} />
          {store && (
            <PickupBar store={store} closer={closer} onChange={() => setShowPicker(true)} onSwitchToCloser={() => closer && pickStore(closer.id)} />
          )}

          {store && hours?.limited && (
            <View style={[s.hoursBanner, closed ? s.hoursBannerClosed : s.hoursBannerOpen]} accessibilityRole="text">
              <ClockIcon size={14} color={closed ? '#9A3412' : '#166534'} />
              <Text style={[s.hoursText, { color: closed ? '#9A3412' : '#166534' }]}>{hoursLine(t, hours)}</Text>
            </View>
          )}

          {!store && !choice ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={s.loadingText}>{t('customerHotFood.findingStore')}</Text>
            </View>
          ) : !store && choice?.kind === 'none' ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>🍽️</Text>
              <Text style={s.emptyTitle}>{t('customerHotFood.noPickupStoresTitle')}</Text>
              <Text style={s.emptySub}>{t('customerHotFood.noPickupStores')}</Text>
            </View>
          ) : !store && choice?.kind === 'ask' ? (
            <AskCard why={choice.why} candidates={choice.candidates} onPick={pickStore} onSeeAll={() => setShowPicker(true)} />
          ) : menuLoading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={s.loadingText}>{t('customerHotFood.loadingGeneric')}</Text>
            </View>
          ) : menuIsError ? (
            <ErrorState message={t('customerHotFood.menuLoadError')} onRetry={() => refetchMenu()} />
          ) : menuItems.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>🍽️</Text>
              <Text style={s.emptyTitle}>{t('customerHotFood.noItemsTitle')}</Text>
              <Text style={s.emptySub}>{t('customerHotFood.noItemsSub')}</Text>
            </View>
          ) : (
            <FadeSlideIn style={{ flex: 1 }}>
              <FlatList
                data={menuItems}
                keyExtractor={item => item.id}
                contentContainerStyle={s.menuList}
                onScroll={largeTitle.onScroll}
                scrollEventThrottle={largeTitle.scrollEventThrottle}
                refreshControl={
                  <RefreshControl refreshing={menuRefetching} onRefresh={refetchMenu} tintColor={COLORS.primary} colors={[COLORS.primary]} />
                }
                renderItem={({ item }) => (
                  <MenuCard
                    item={item}
                    qty={getQty(item.id)}
                    onAdd={() => addToCart(item)}
                    onRemove={() => removeFromCart(item)}
                    closed={closed}
                  />
                )}
                ListFooterComponent={<View style={{ height: cartCount > 0 ? 110 : 32 }} />}
              />
            </FadeSlideIn>
          )}

          {/* Floating cart button */}
          {cartCount > 0 && (
            <TouchableOpacity
              style={s.cartFab}
              onPress={() => setShowCart(true)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={t('customerHotFood.viewOrderA11y', { count: cartCount, total: fmtPrice(cartTotal) })}
            >
              <View style={s.cartFabBadge}>
                <Text style={s.cartFabBadgeText}>{cartCount}</Text>
              </View>
              <Text style={s.cartFabText}>{t('customerHotFood.viewOrderBtn')}</Text>
              <Text style={s.cartFabTotal}>{fmtPrice(cartTotal)}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── ORDERS TAB ── */}
      {tab === 'orders' && (
        <FadeSlideIn style={{ flex: 1 }}>
          <FlatList
            data={[...activeOrders, ...pastOrders]}
            keyExtractor={o => o.id}
            contentContainerStyle={s.ordersList}
            onScroll={largeTitle.onScroll}
            scrollEventThrottle={largeTitle.scrollEventThrottle}
            refreshControl={
              <RefreshControl refreshing={ordersRefetching} onRefresh={refetchOrders} tintColor={COLORS.primary} colors={[COLORS.primary]} />
            }
            ListEmptyComponent={
              ordersLoading ? (
                <View style={s.loadingBox}>
                  <ActivityIndicator size="large" color={COLORS.primary} />
                </View>
              ) : ordersIsError ? (
                <ErrorState message={t('customerHotFood.ordersLoadError')} onRetry={() => refetchOrders()} />
              ) : (
                <View style={s.emptyBox}>
                  <Text style={s.emptyEmoji}>📋</Text>
                  <Text style={s.emptyTitle}>{t('customerHotFood.noOrdersTitle')}</Text>
                  <Text style={s.emptySub}>{t('customerHotFood.noOrdersSub')}</Text>
                  <TouchableOpacity
                    style={s.goMenuBtn}
                    onPress={() => setTab('menu')}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('customerHotFood.browseMenuA11y')}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Text style={s.goMenuBtnText}>{t('customerHotFood.browseMenuBtn')}</Text>
                  </TouchableOpacity>
                </View>
              )
            }
            ListHeaderComponent={
              activeOrders.length > 0 ? (
                <Text style={s.sectionLabel}>{t('customerHotFood.activeOrdersSection')}</Text>
              ) : null
            }
            renderItem={({ item, index }) => (
              <>
                {index === activeOrders.length && pastOrders.length > 0 && (
                  <Text style={[s.sectionLabel, { marginTop: 20 }]}>{t('customerHotFood.pastOrdersSection')}</Text>
                )}
                <OrderCard order={item} onCancel={askCancel} cancelling={cancelMutation.isPending && cancelMutation.variables === item.id} />
              </>
            )}
          />
        </FadeSlideIn>
      )}

      {/* Cart sheet */}
      {showCart && cart.length > 0 && store && (
        <CartSheet
          cart={cart}
          closedText={closed && hours ? hoursLine(t, hours) : null}
          store={store!}
          onClose={() => setShowCart(false)}
          onOrderPlaced={handleOrderPlaced}
        />
      )}

      {/* Every pickup store, closest first */}
      {showPicker && (
        <PickupStoreSheet stores={sorted} selectedId={storeId} onPick={pickStore} onClose={() => setShowPicker(false)} />
      )}

      {/* Success sheet */}
      {showSuccess && (
        <OrderSuccessSheet store={placedAt} onClose={() => setShowSuccess(false)} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  // Header
  headerBg: { backgroundColor: COLORS.primary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flameBadge: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, fontWeight: '600', marginTop: 1 },

  activePill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#86EFAC' },
  activePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  tabs: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  tab: {
    flex: 1, paddingVertical: 9, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center',
  },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  tabTextActive: { color: COLORS.primary },

  // Location banner
  hoursBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  hoursBannerOpen: { backgroundColor: '#F0FDF4', borderBottomColor: '#DCFCE7' },
  hoursBannerClosed: { backgroundColor: '#FFF7ED', borderBottomColor: '#FFEDD5' },
  hoursText: { fontSize: 13, fontWeight: '700', flex: 1 },
  locationBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F0F1F2',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  locationText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  locationTextFound: { color: COLORS.text },

  // Menu
  menuList: { padding: 12, paddingBottom: 32 },

  // Cart FAB
  cartFab: {
    position: 'absolute', bottom: 24, left: 16, right: 16,
    backgroundColor: COLORS.primary, borderRadius: 18,
    flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 18,
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 10, elevation: 6,
  },
  cartFabBadge: {
    backgroundColor: '#fff', borderRadius: 12, width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  cartFabBadgeText: { color: COLORS.primary, fontSize: 13, fontWeight: '900' },
  cartFabText: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '800' },
  cartFabTotal: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '800' },

  // Orders
  ordersList: { padding: 12, paddingBottom: 32 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10, paddingLeft: 2,
  },

  // Shared
  loadingBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: 12 },
  loadingText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },
  emptyBox: { alignItems: 'center', justifyContent: 'center', paddingTop: 80, paddingHorizontal: 32, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  goMenuBtn: {
    marginTop: 10, backgroundColor: COLORS.primary,
    borderRadius: 14, paddingVertical: 12, paddingHorizontal: 28,
  },
  goMenuBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});

// A card's soft shadow on iPhone only. On Android the elevation shadow drew a pale white and gray band under some cards inside the
// list's fade-in, so there the card keeps just its border (2026-10-11).
const cardShadow = Platform.select({
  ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
  default: { elevation: 0 },
});

// ─── Menu card styles ─────────────────────────────────────────────────────────
const mc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    ...cardShadow,
    borderWidth: 1, borderColor: Platform.OS === 'ios' ? '#F0F1F2' : '#E6E8EB',
  },
  left: { flexShrink: 0 },
  iconRing: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: '#FFF1F0', alignItems: 'center', justifyContent: 'center',
  },
  itemImage: {
    width: 48, height: 48, borderRadius: 14,
  },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  desc: { fontSize: 12, color: COLORS.textMuted, lineHeight: 16, marginBottom: 6 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 15, fontWeight: '900', color: COLORS.primary },
  waitPill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FFF7ED', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
  },
  waitText: { fontSize: 10, fontWeight: '700', color: '#F97316' },
  controls: { flexShrink: 0 },
  addBtn: {
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  btnClosed: { backgroundColor: '#E5E7EB' },
  btnClosedText: { color: '#6B7280' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 9, borderWidth: 1.5,
    borderColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  stepBtnAdd: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  stepBtnText: { fontSize: 18, fontWeight: '900', color: COLORS.primary, lineHeight: 22 },
  stepQty: { fontSize: 15, fontWeight: '900', color: COLORS.text, width: 22, textAlign: 'center' },
});

// ─── Order card styles ────────────────────────────────────────────────────────
const oc = StyleSheet.create({
  storeAddr: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  dirBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#F8FAFC' },
  dirBtnText: { fontSize: 12.5, fontWeight: '800', color: COLORS.secondary },
  cancelReason: { fontSize: 13, color: '#a51b28', marginTop: 4, lineHeight: 18 },
  points: { fontSize: 13, fontWeight: '700', color: '#17663A', marginTop: 4 },
  cancelBtn: {
    alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: '#f3cdd1', backgroundColor: '#fdf2f2',
  },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: '#a51b28' },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: Platform.OS === 'ios' ? '#F0F1F2' : '#E6E8EB',
    ...cardShadow,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 24 },
  orderNum: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  store: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  badge: { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 12, fontWeight: '800' },
  detail: { fontSize: 13, color: COLORS.textMuted, marginTop: 8, lineHeight: 18 },
  body: { marginTop: 8 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginBottom: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  itemQty: { fontSize: 13, fontWeight: '800', color: COLORS.primary, width: 22 },
  itemName: { flex: 1, fontSize: 13, color: COLORS.text },
  itemPrice: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1, borderTopColor: '#F3F4F6', paddingTop: 8, marginTop: 4, marginBottom: 6,
  },
  totalLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '700' },
  totalVal: { fontSize: 14, fontWeight: '900', color: COLORS.text },
  noteRow: { flexDirection: 'row', marginBottom: 4 },
  noteLabel: { fontSize: 12, fontWeight: '800', color: COLORS.textMuted },
  noteText: { fontSize: 12, color: COLORS.textMuted, flex: 1 },
  etaBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start' },
  etaBadgeText: { fontSize: 13, color: '#3B82F6', fontWeight: '800' },
  eta: { fontSize: 12, color: '#3B82F6', fontWeight: '700', marginBottom: 4 },
  time: { fontSize: 11, color: COLORS.textMuted, textAlign: 'right', marginTop: 4 },
});

// ─── Cart sheet styles ────────────────────────────────────────────────────────
const cs = StyleSheet.create({
  closedNote: { fontSize: 13, fontWeight: '700', color: '#9A3412', textAlign: 'center', marginBottom: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  body: { paddingHorizontal: 20, paddingTop: 10 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  lineQty: { fontSize: 14, fontWeight: '900', color: COLORS.primary, width: 26 },
  lineName: { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '600' },
  linePrice: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    borderTopWidth: 1.5, borderTopColor: '#F3F4F6', paddingTop: 12, marginTop: 4, marginBottom: 16,
  },
  totalLabel: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  totalVal: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  noteSection: { marginBottom: 14 },
  noteLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6 },
  noteInput: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: COLORS.text, minHeight: 60, textAlignVertical: 'top',
  },
  infoBox: {
    backgroundColor: '#F8F9FA', borderRadius: 12, padding: 12, marginBottom: 20,
  },
  pointsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16, padding: 12,
    borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EB', backgroundColor: '#FAFBFC',
  },
  pointsTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  pointsSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2, lineHeight: 16 },
  infoText: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17, textAlign: 'center' },
  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  placeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  placeBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
});

// ─── Success sheet styles ─────────────────────────────────────────────────────
const ss = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  sheet: {
    backgroundColor: '#fff', borderRadius: 24, padding: 28,
    alignItems: 'center', width: '100%', gap: 10,
  },
  emoji: { fontSize: 52, marginBottom: 4 },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.text },
  sub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 21 },
  btn: {
    marginTop: 10, backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 40, width: '100%', alignItems: 'center',
  },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
