import { useState, useCallback, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Modal, ActivityIndicator, Image,
  RefreshControl, ScrollView, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Location from 'expo-location';
import { hotFoodApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import { FlameIcon, ClockIcon, CheckCircleIcon, XIcon, MapPinIcon } from '../../components/Icons';

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
  store: { name: string };
  items: { name: string; quantity: number; price: number }[];
}

type Tab = 'menu' | 'orders';

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS: Record<OrderStatus, { label: string; color: string; bg: string; emoji: string; detail: string }> = {
  PENDING:   { label: 'Pending',   color: '#F97316', bg: '#FFF7ED', emoji: '⏳', detail: 'Your order was received — waiting for the kitchen to accept' },
  ACCEPTED:  { label: 'Preparing', color: '#3B82F6', bg: '#EFF6FF', emoji: '👨‍🍳', detail: 'The kitchen is working on your order' },
  READY:     { label: 'Ready!',    color: '#16A34A', bg: '#F0FDF4', emoji: '✅', detail: 'Your order is ready — head to the counter to pick it up' },
  COMPLETED: { label: 'Picked Up', color: '#94A3B8', bg: '#F8FAFC', emoji: '🎉', detail: 'Enjoy your food!' },
  CANCELLED: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2', emoji: '❌', detail: 'This order was cancelled' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function fmtPrice(n: number) {
  return `$${n.toFixed(2)}`;
}

const MAX_NEARBY_MILES = 2;

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Menu Item Card ───────────────────────────────────────────────────────────

function MenuCard({ item, qty, onAdd, onRemove }: {
  item: MenuItem; qty: number; onAdd: () => void; onRemove: () => void;
}) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <View style={mc.card}>
      <View style={mc.left}>
        {item.imageUrl && !imgErr ? (
          <Image
            source={{ uri: item.imageUrl }}
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
              <Text style={mc.waitText}>~{item.estimatedMinutes} min</Text>
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
              accessibilityLabel={`Remove one ${item.name} from cart`}
              hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            >
              <Text style={mc.stepBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={mc.stepQty}>{qty}</Text>
            <TouchableOpacity
              style={[mc.stepBtn, mc.stepBtnAdd]}
              onPress={onAdd}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Add one more ${item.name} to cart`}
              hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
            >
              <Text style={[mc.stepBtnText, { color: '#fff' }]}>+</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={mc.addBtn}
            onPress={onAdd}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.name} to cart`}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={mc.addBtnText}>Add</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── ETA Countdown ────────────────────────────────────────────────────────────

function useEtaCountdown(order: FoodOrder): string | null {
  const getRemaining = () => {
    if (order.status !== 'ACCEPTED' || !order.estimatedMinutes) return null;
    const acceptedAt = new Date(order.updatedAt).getTime();
    const eta = acceptedAt + order.estimatedMinutes * 60_000;
    const remaining = Math.ceil((eta - Date.now()) / 60_000);
    return remaining > 0 ? `~${remaining} min left` : 'Almost ready!';
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

function OrderCard({ order }: { order: FoodOrder }) {
  const cfg = STATUS[order.status];
  const etaLabel = useEtaCountdown(order);
  const [expanded, setExpanded] = useState(order.status === 'READY');

  return (
    <TouchableOpacity
      style={[oc.card, { borderLeftColor: cfg.color }]}
      onPress={() => setExpanded(v => !v)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Order #${order.orderNumber}, ${cfg.label}. ${expanded ? 'Collapse' : 'Expand'} details`}
    >
      <View style={oc.top}>
        <View style={oc.topLeft}>
          <Text style={oc.emoji}>{cfg.emoji}</Text>
          <View>
            <Text style={oc.orderNum}>#{order.orderNumber}</Text>
            <Text style={oc.store}>{order.store.name}</Text>
          </View>
        </View>
        <View style={[oc.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[oc.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <Text style={oc.detail}>{cfg.detail}</Text>

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
            <Text style={oc.totalLabel}>Total</Text>
            <Text style={oc.totalVal}>{fmtPrice(order.totalAmount)}</Text>
          </View>
          {order.note ? (
            <View style={oc.noteRow}>
              <Text style={oc.noteLabel}>Note: </Text>
              <Text style={oc.noteText}>{order.note}</Text>
            </View>
          ) : null}
          {etaLabel ? (
            <Text style={oc.eta}>{etaLabel}</Text>
          ) : null}
          <Text style={oc.time}>{timeAgo(order.createdAt)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Cart Sheet ───────────────────────────────────────────────────────────────

function CartSheet({ cart, storeId, onClose, onOrderPlaced }: {
  cart: CartItem[];
  storeId: string;
  onClose: () => void;
  onOrderPlaced: () => void;
}) {
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const qc = useQueryClient();
  const [note, setNote] = useState('');

  const placeMutation = useMutation({
    mutationFn: () => hotFoodApi.placeOrder({
      storeId,
      items: cart.map(i => ({ menuItemId: i.id, quantity: i.qty })),
      ...(note.trim() ? { note: note.trim() } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-hot-food-orders'] });
      onOrderPlaced();
    },
    onError: (e: any) => {
      Toast.show({ type: 'error', text1: e.response?.data?.error || 'Failed to place order' });
    },
  });

  return (
    <Modal transparent animationType="slide" onRequestClose={onClose}>
      <View style={cs.overlay}>
        <TouchableOpacity
          style={cs.backdrop}
          onPress={onClose}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Dismiss order sheet"
        />
        <View style={cs.sheet}>
          <View style={cs.handle} />

          <View style={cs.header}>
            <Text style={cs.title}>Your Order</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close order sheet"
            >
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={cs.body} showsVerticalScrollIndicator={false}>
            {cart.map(item => (
              <View key={item.id} style={cs.lineRow}>
                <Text style={cs.lineQty}>{item.qty}×</Text>
                <Text style={cs.lineName}>{item.name}</Text>
                <Text style={cs.linePrice}>{fmtPrice(item.price * item.qty)}</Text>
              </View>
            ))}

            <View style={cs.totalRow}>
              <Text style={cs.totalLabel}>Total</Text>
              <Text style={cs.totalVal}>{fmtPrice(total)}</Text>
            </View>

            <View style={cs.noteSection}>
              <Text style={cs.noteLabel}>Special instructions (optional)</Text>
              <TextInput
                style={cs.noteInput}
                value={note}
                onChangeText={setNote}
                placeholder="e.g. no onions, extra sauce…"
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={120}
                returnKeyType="done"
                blurOnSubmit
              />
            </View>

            <View style={cs.infoBox}>
              <Text style={cs.infoText}>
                Pay at the counter when your order is ready. You'll see status updates here in real time.
              </Text>
            </View>
          </ScrollView>

          <View style={cs.footer}>
            <TouchableOpacity
              style={[cs.placeBtn, placeMutation.isPending && { opacity: 0.65 }]}
              onPress={() => placeMutation.mutate()}
              disabled={placeMutation.isPending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={placeMutation.isPending ? 'Placing order' : `Place order for ${fmtPrice(total)}`}
            >
              {placeMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={cs.placeBtnText}>Place Order — {fmtPrice(total)}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Order Success Sheet ──────────────────────────────────────────────────────

function OrderSuccessSheet({ onClose }: { onClose: () => void }) {
  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <View style={ss.overlay}>
        <View style={ss.sheet}>
          <Text style={ss.emoji}>🎉</Text>
          <Text style={ss.title}>Order Placed!</Text>
          <Text style={ss.sub}>
            Your order was sent to the kitchen. Check the{' '}
            <Text style={{ fontWeight: '800', color: COLORS.primary }}>My Orders</Text>{' '}
            tab to track its status in real time.
          </Text>
          <TouchableOpacity
            style={ss.btn}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Dismiss order confirmation"
          >
            <Text style={ss.btnText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function CustomerHotFoodScreen() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('menu');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Location-based store detection
  const [nearestStore, setNearestStore] = useState<{ id: string; name: string; hotFoodEnabled: boolean } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'detecting' | 'found' | 'none'>('detecting');

  const { data: storesData } = useQuery({
    queryKey: ['stores-gas-prices'],
    queryFn: storesApi.getGasPrices,
    staleTime: 5 * 60 * 1000,
  });
  const allStores: any[] = storesData?.data?.data || [];

  useEffect(() => {
    let cancelled = false;
    async function detect() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) { if (!cancelled) setLocationStatus('none'); return; }
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const { latitude: uLat, longitude: uLon } = pos.coords;
        const withCoords = allStores.filter((s: any) => s.latitude != null && s.longitude != null);
        if (!withCoords.length || cancelled) { if (!cancelled) setLocationStatus('none'); return; }
        let closest: any = null;
        let closestDist = Infinity;
        for (const s of withCoords) {
          const d = haversineMiles(uLat, uLon, s.latitude, s.longitude);
          if (d < closestDist) { closestDist = d; closest = s; }
        }
        if (!cancelled && closest && closestDist <= MAX_NEARBY_MILES) {
          setNearestStore({ id: closest.id, name: closest.name, hotFoodEnabled: closest.hotFoodEnabled !== false });
          setLocationStatus('found');
        } else if (!cancelled) {
          setLocationStatus('none');
        }
      } catch {
        if (!cancelled) setLocationStatus('none');
      }
    }
    if (allStores.length > 0) detect();
    return () => { cancelled = true; };
  }, [allStores.length]);

  const effectiveStore = nearestStore?.id || '';

  // Menu for detected store
  const { data: menuData, isLoading: menuLoading, refetch: refetchMenu, isRefetching: menuRefetching } = useQuery({
    queryKey: ['customer-hot-food-menu', effectiveStore],
    queryFn: () => hotFoodApi.getCustomerMenu(effectiveStore),
    enabled: !!effectiveStore,
    staleTime: 60_000,
  });
  const menuItems: MenuItem[] = menuData?.data?.data || [];

  // My orders
  const { data: ordersData, isLoading: ordersLoading, refetch: refetchOrders, isRefetching: ordersRefetching } = useQuery({
    queryKey: ['my-hot-food-orders'],
    queryFn: hotFoodApi.getMyOrders,
    refetchInterval: tab === 'orders' ? 15_000 : false,
  });
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
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <View style={s.flameBadge}>
              <FlameIcon size={18} color="#fff" />
            </View>
            <View>
              <Text style={s.headerTitle}>Hot Food</Text>
              <Text style={s.headerSub}>Order from the kitchen</Text>
            </View>
          </View>

          {/* Active order indicator */}
          {hasActive && (
            <TouchableOpacity
              style={s.activePill}
              onPress={() => setTab('orders')}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={`${activeOrders.length} active orders. View my orders`}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <View style={s.activeDot} />
              <Text style={s.activePillText}>{activeOrders.length} active</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Tab bar */}
        <View style={s.tabs}>
          {(['menu', 'orders'] as Tab[]).map(t => (
            <TouchableOpacity
              key={t}
              style={[s.tab, tab === t && s.tabActive]}
              onPress={() => setTab(t)}
              activeOpacity={0.8}
              accessibilityRole="tab"
              accessibilityLabel={t === 'menu' ? 'Menu tab' : 'My Orders tab'}
              accessibilityState={{ selected: tab === t }}
              hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
            >
              <Text style={[s.tabText, tab === t && s.tabTextActive]}>
                {t === 'menu' ? '🍽️  Menu' : `📋  My Orders${orders.length ? ` (${orders.length})` : ''}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* ── MENU TAB ── */}
      {tab === 'menu' && (
        <>
          {/* Location status banner */}
          <View style={s.locationBanner}>
            <MapPinIcon size={14} color={locationStatus === 'found' ? COLORS.primary : COLORS.textMuted} />
            <Text style={[s.locationText, locationStatus === 'found' && s.locationTextFound]}>
              {locationStatus === 'detecting'
                ? 'Detecting your location…'
                : locationStatus === 'found'
                ? nearestStore!.name
                : 'No Lucky Stop nearby'}
            </Text>
          </View>

          {locationStatus === 'detecting' ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={s.loadingText}>Finding your nearest store…</Text>
            </View>
          ) : locationStatus === 'none' ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>📍</Text>
              <Text style={s.emptyTitle}>No store nearby</Text>
              <Text style={s.emptySub}>Visit a Lucky Stop location to browse and order hot food.</Text>
            </View>
          ) : nearestStore && !nearestStore.hotFoodEnabled ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>🍽️</Text>
              <Text style={s.emptyTitle}>Not available here</Text>
              <Text style={s.emptySub}>{nearestStore.name} doesn't offer hot food ordering. Check another Lucky Stop location.</Text>
            </View>
          ) : menuLoading ? (
            <View style={s.loadingBox}>
              <ActivityIndicator size="large" color={COLORS.primary} />
              <Text style={s.loadingText}>Loading…</Text>
            </View>
          ) : menuItems.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyEmoji}>🍽️</Text>
              <Text style={s.emptyTitle}>No items available</Text>
              <Text style={s.emptySub}>Hot food isn't available at this store right now — check back later.</Text>
            </View>
          ) : (
            <FlatList
              data={menuItems}
              keyExtractor={item => item.id}
              contentContainerStyle={s.menuList}
              refreshControl={
                <RefreshControl refreshing={menuRefetching} onRefresh={refetchMenu} tintColor={COLORS.primary} />
              }
              renderItem={({ item }) => (
                <MenuCard
                  item={item}
                  qty={getQty(item.id)}
                  onAdd={() => addToCart(item)}
                  onRemove={() => removeFromCart(item)}
                />
              )}
              ListFooterComponent={<View style={{ height: cartCount > 0 ? 110 : 32 }} />}
            />
          )}

          {/* Floating cart button */}
          {cartCount > 0 && (
            <TouchableOpacity
              style={s.cartFab}
              onPress={() => setShowCart(true)}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`View order, ${cartCount} items, ${fmtPrice(cartTotal)}`}
            >
              <View style={s.cartFabBadge}>
                <Text style={s.cartFabBadgeText}>{cartCount}</Text>
              </View>
              <Text style={s.cartFabText}>View Order</Text>
              <Text style={s.cartFabTotal}>{fmtPrice(cartTotal)}</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {/* ── ORDERS TAB ── */}
      {tab === 'orders' && (
        <FlatList
          data={[...activeOrders, ...pastOrders]}
          keyExtractor={o => o.id}
          contentContainerStyle={s.ordersList}
          refreshControl={
            <RefreshControl refreshing={ordersRefetching} onRefresh={refetchOrders} tintColor={COLORS.primary} />
          }
          ListEmptyComponent={
            ordersLoading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator size="large" color={COLORS.primary} />
              </View>
            ) : (
              <View style={s.emptyBox}>
                <Text style={s.emptyEmoji}>📋</Text>
                <Text style={s.emptyTitle}>No orders yet</Text>
                <Text style={s.emptySub}>Head to the Menu tab to order hot food from the kitchen.</Text>
                <TouchableOpacity
                  style={s.goMenuBtn}
                  onPress={() => setTab('menu')}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel="Browse menu"
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={s.goMenuBtnText}>Browse Menu</Text>
                </TouchableOpacity>
              </View>
            )
          }
          ListHeaderComponent={
            activeOrders.length > 0 ? (
              <Text style={s.sectionLabel}>Active Orders</Text>
            ) : null
          }
          renderItem={({ item, index }) => (
            <>
              {index === activeOrders.length && pastOrders.length > 0 && (
                <Text style={[s.sectionLabel, { marginTop: 20 }]}>Past Orders</Text>
              )}
              <OrderCard order={item} />
            </>
          )}
        />
      )}

      {/* Cart sheet */}
      {showCart && cart.length > 0 && (
        <CartSheet
          cart={cart}
          storeId={effectiveStore}
          onClose={() => setShowCart(false)}
          onOrderPlaced={handleOrderPlaced}
        />
      )}

      {/* Success sheet */}
      {showSuccess && (
        <OrderSuccessSheet onClose={() => setShowSuccess(false)} />
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

// ─── Menu card styles ─────────────────────────────────────────────────────────
const mc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    borderWidth: 1, borderColor: '#F0F1F2',
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
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderWidth: 1, borderColor: '#F0F1F2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
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
