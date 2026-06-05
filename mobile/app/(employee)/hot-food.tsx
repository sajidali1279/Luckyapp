import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { hotFoodApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  FlameIcon, ClockIcon, CheckCircleIcon, XIcon, InboxIcon,
} from '../../components/Icons';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';
type TabKey = 'PENDING' | 'ACCEPTED' | 'READY' | 'ALL' | 'MENU';

interface OrderItem { menuItemId: string; name: string; quantity: number; price: number }
interface FoodOrder {
  id: string;
  orderNumber: string;
  customer: { name: string; phone: string };
  items: OrderItem[];
  note?: string;
  status: OrderStatus;
  createdAt: string;
}
interface MenuItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  isAvailable: boolean;
  estimatedMinutes?: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',   color: '#F97316', bg: '#FFF7ED' },
  ACCEPTED:  { label: 'Preparing', color: '#3B82F6', bg: '#EFF6FF' },
  READY:     { label: 'Ready',     color: '#16A34A', bg: '#F0FDF4' },
  COMPLETED: { label: 'Done',      color: '#94A3B8', bg: '#F8FAFC' },
  CANCELLED: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2' },
};

const TABS: { key: TabKey; label: string }[] = [
  { key: 'PENDING',  label: 'Pending'   },
  { key: 'ACCEPTED', label: 'Preparing' },
  { key: 'READY',    label: 'Ready'     },
  { key: 'ALL',      label: 'All'       },
  { key: 'MENU',     label: 'Menu'      },
];

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order, onUpdateStatus, updating,
}: { order: FoodOrder; onUpdateStatus: (id: string, status: OrderStatus) => void; updating: boolean }) {
  const cfg   = STATUS_CONFIG[order.status];
  const total = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardHeaderLeft}>
          <Text style={s.orderNum}>#{order.orderNumber}</Text>
          <View style={s.timePill}>
            <ClockIcon size={11} color={COLORS.textMuted} strokeWidth={2} />
            <Text style={s.timeText}>{timeAgo(order.createdAt)}</Text>
          </View>
        </View>
        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <Text style={s.customerName}>{order.customer.name}</Text>
      <Text style={s.customerPhone}>{order.customer.phone}</Text>

      <View style={s.itemsList}>
        {order.items.map((item, idx) => (
          <View key={idx} style={s.itemRow}>
            <Text style={s.itemQty}>{item.quantity}×</Text>
            <Text style={s.itemName}>{item.name}</Text>
            <Text style={s.itemPrice}>${(item.price * item.quantity).toFixed(2)}</Text>
          </View>
        ))}
      </View>

      <View style={s.totalRow}>
        <Text style={s.totalLabel}>Total</Text>
        <Text style={s.totalValue}>${total.toFixed(2)}</Text>
      </View>

      {order.note ? (
        <View style={s.noteBox}>
          <Text style={s.noteLabel}>Note</Text>
          <Text style={s.noteText}>{order.note}</Text>
        </View>
      ) : null}

      {order.status === 'PENDING' && (
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#F97316' }, updating && s.actionBtnDisabled]}
          onPress={() => onUpdateStatus(order.id, 'ACCEPTED')}
          disabled={updating}
          activeOpacity={0.82}
        >
          {updating
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.actionBtnText}>Accept Order</Text>}
        </TouchableOpacity>
      )}

      {order.status === 'ACCEPTED' && (
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#3B82F6' }, updating && s.actionBtnDisabled]}
          onPress={() => onUpdateStatus(order.id, 'READY')}
          disabled={updating}
          activeOpacity={0.82}
        >
          {updating
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.actionBtnText}>Mark Ready</Text>}
        </TouchableOpacity>
      )}

      {order.status === 'READY' && (
        <View style={s.readyActions}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#16A34A', flex: 1 }, updating && s.actionBtnDisabled]}
            onPress={() => onUpdateStatus(order.id, 'COMPLETED')}
            disabled={updating}
            activeOpacity={0.82}
          >
            {updating
              ? <ActivityIndicator color="#fff" size="small" />
              : <><CheckCircleIcon size={15} color="#fff" strokeWidth={2.5} /><Text style={s.actionBtnText}>Complete</Text></>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.cancelBtn, updating && s.actionBtnDisabled]}
            onPress={() => {
              Alert.alert('Cancel Order', 'Mark this order as cancelled?', [
                { text: 'No' },
                { text: 'Cancel Order', style: 'destructive', onPress: () => onUpdateStatus(order.id, 'CANCELLED') },
              ]);
            }}
            disabled={updating}
            activeOpacity={0.82}
          >
            <XIcon size={15} color="#EF4444" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {order.status === 'COMPLETED' && (
        <View style={s.doneBadge}>
          <CheckCircleIcon size={14} color="#16A34A" strokeWidth={2.5} />
          <Text style={s.doneText}>Completed</Text>
        </View>
      )}
    </View>
  );
}

// ─── Menu item availability card (employee only — no add/edit/delete) ─────────

function MenuItemCard({
  item, onToggle, updating,
}: { item: MenuItem; onToggle: (id: string, current: boolean) => void; updating: boolean }) {
  return (
    <View style={s.menuCard}>
      <View style={s.menuCardBody}>
        <Text style={s.menuItemName}>{item.name}</Text>
        {item.description ? <Text style={s.menuItemDesc} numberOfLines={1}>{item.description}</Text> : null}
        <View style={s.menuItemMeta}>
          <Text style={s.menuItemPrice}>${Number(item.price).toFixed(2)}</Text>
          {item.estimatedMinutes ? (
            <View style={s.menuItemEst}>
              <ClockIcon size={11} color={COLORS.textMuted} strokeWidth={2} />
              <Text style={s.menuItemEstText}>~{item.estimatedMinutes} min</Text>
            </View>
          ) : null}
        </View>
      </View>
      <TouchableOpacity
        style={[s.availBtn, item.isAvailable ? s.availBtnOn : s.availBtnOff, updating && { opacity: 0.5 }]}
        onPress={() => onToggle(item.id, item.isAvailable)}
        disabled={updating}
        activeOpacity={0.8}
      >
        {updating
          ? <ActivityIndicator size="small" color={item.isAvailable ? '#16A34A' : '#EF4444'} />
          : <Text style={[s.availBtnText, item.isAvailable ? s.availBtnTextOn : s.availBtnTextOff]}>
              {item.isAvailable ? 'Available' : 'Unavailable'}
            </Text>
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function HotFoodOrders() {
  const { user } = useAuthStore();
  const storeId  = user?.storeIds?.[0];
  const [activeTab,  setActiveTab]  = useState<TabKey>('PENDING');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Orders query
  const { data: ordersData, isLoading: ordersLoading, isRefetching, refetch } = useQuery({
    queryKey: ['hot-food-orders', storeId],
    queryFn: () => hotFoodApi.getStoreOrders(storeId!),
    enabled: !!storeId,
    refetchInterval: 20_000,
  });

  // Menu query (for availability management)
  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ['hot-food-menu-emp', storeId],
    queryFn: () => hotFoodApi.getMenu(storeId!),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  const allOrders: FoodOrder[] = ordersData?.data?.data ?? [];
  const menuItems: MenuItem[]  = menuData?.data?.data   ?? [];

  const pendingCount    = allOrders.filter(o => o.status === 'PENDING').length;
  const acceptedCount   = allOrders.filter(o => o.status === 'ACCEPTED').length;
  const readyCount      = allOrders.filter(o => o.status === 'READY').length;
  const unavailableCount = menuItems.filter(i => !i.isAvailable).length;

  const counts: Record<TabKey, number> = {
    PENDING: pendingCount, ACCEPTED: acceptedCount,
    READY: readyCount, ALL: allOrders.length,
    MENU: unavailableCount,
  };

  const filteredOrders = useMemo(() => {
    if (activeTab === 'ALL' || activeTab === 'MENU') return allOrders;
    return allOrders.filter(o => o.status === activeTab);
  }, [allOrders, activeTab]);

  async function handleUpdateStatus(orderId: string, status: OrderStatus) {
    if (updatingId) return;
    setUpdatingId(orderId);
    try {
      await hotFoodApi.updateStatus(orderId, status);
      queryClient.invalidateQueries({ queryKey: ['hot-food-orders'] });
      queryClient.invalidateQueries({ queryKey: ['hot-food-pending-count'] });
    } catch {
      Alert.alert('Error', 'Could not update order status. Try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleItem(itemId: string, currentAvail: boolean) {
    if (updatingId) return;
    setUpdatingId(itemId);
    try {
      await hotFoodApi.updateItemAvailability(itemId, !currentAvail);
      queryClient.invalidateQueries({ queryKey: ['hot-food-menu-emp'] });
    } catch {
      Alert.alert('Error', 'Could not update item availability.');
    } finally {
      setUpdatingId(null);
    }
  }

  if (!storeId) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.header}><Text style={s.headerTitle}>Hot Food Orders</Text></View>
        <View style={s.empty}>
          <InboxIcon size={48} color="#D1D5DB" />
          <Text style={s.emptyText}>No store assigned to your account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isLoading = activeTab === 'MENU' ? menuLoading : ordersLoading;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <FlameIcon size={20} color="#fff" strokeWidth={2} />
        </View>
        <View>
          <Text style={s.headerTitle}>Hot Food Orders</Text>
          {pendingCount > 0 && (
            <Text style={s.headerSub}>{pendingCount} pending · needs attention</Text>
          )}
        </View>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(tab => {
          const active = activeTab === tab.key;
          const count  = counts[tab.key];
          const isMenu = tab.key === 'MENU';
          return (
            <TouchableOpacity
              key={tab.key}
              style={[s.tab, active && (isMenu ? s.tabActiveMenu : s.tabActive)]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.75}
            >
              <Text style={[s.tabText, active && s.tabTextActive]}>{tab.label}</Text>
              {count > 0 && (
                <View style={[s.tabBadge, active && s.tabBadgeActive]}>
                  <Text style={[s.tabBadgeText, active && s.tabBadgeTextActive]}>{count}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Menu availability note */}
      {activeTab === 'MENU' && (
        <View style={s.menuNote}>
          <Text style={s.menuNoteText}>Tap an item to mark it unavailable when sold out — customers won't see it until you re-enable it.</Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={s.empty}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : activeTab === 'MENU' ? (
        <FlatList
          data={menuItems}
          keyExtractor={item => item.id}
          contentContainerStyle={menuItems.length === 0 ? s.emptyList : s.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <MenuItemCard
              item={item}
              onToggle={handleToggleItem}
              updating={updatingId === item.id}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <InboxIcon size={48} color="#D1D5DB" />
              <Text style={s.emptyText}>No menu items for your store yet.</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredOrders}
          keyExtractor={item => item.id}
          contentContainerStyle={filteredOrders.length === 0 ? s.emptyList : s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />
          }
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onUpdateStatus={handleUpdateStatus}
              updating={updatingId === item.id}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <InboxIcon size={48} color="#D1D5DB" />
              <Text style={s.emptyText}>No {activeTab === 'ALL' ? '' : activeTab.toLowerCase() + ' '}orders right now</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.secondary, paddingHorizontal: 20, paddingVertical: 16,
  },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  tabs: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    flexWrap: 'wrap',
  },
  tab:              { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
  tabActive:        { backgroundColor: COLORS.primary },
  tabActiveMenu:    { backgroundColor: '#EA580C' },
  tabText:          { fontSize: 12, fontWeight: '600', color: '#64748B' },
  tabTextActive:    { color: '#fff' },
  tabBadge:         { backgroundColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeActive:   { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText:     { fontSize: 11, fontWeight: '700', color: '#64748B' },
  tabBadgeTextActive:{ color: '#fff' },

  menuNote: { backgroundColor: '#FFF7ED', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#FED7AA' },
  menuNoteText: { fontSize: 12, color: '#92400E', lineHeight: 17 },

  list:      { padding: 16, gap: 12 },
  emptyList: { flex: 1 },

  // Order card
  card:           { backgroundColor: '#fff', borderRadius: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  cardHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  orderNum:       { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  timePill:       { flexDirection: 'row', alignItems: 'center', gap: 3 },
  timeText:       { fontSize: 12, color: '#94A3B8' },
  statusPill:     { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  statusText:     { fontSize: 12, fontWeight: '700' },
  customerName:   { fontSize: 15, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  customerPhone:  { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  itemsList:      { gap: 6, marginBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  itemRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty:        { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 24 },
  itemName:       { flex: 1, fontSize: 13, color: '#374151' },
  itemPrice:      { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginBottom: 12 },
  totalLabel:     { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  totalValue:     { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  noteBox:        { backgroundColor: '#FFFBEB', borderRadius: 10, padding: 10, marginBottom: 12 },
  noteLabel:      { fontSize: 11, fontWeight: '700', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  noteText:       { fontSize: 13, color: '#78350F', lineHeight: 18 },
  actionBtn:         { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  readyActions:      { flexDirection: 'row', gap: 10 },
  cancelBtn:         { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  doneBadge:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 10 },
  doneText:          { fontSize: 13, fontWeight: '600', color: '#16A34A' },

  // Menu availability card
  menuCard:       { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  menuCardBody:   { flex: 1 },
  menuItemName:   { fontSize: 14, fontWeight: '700', color: '#0F172A', marginBottom: 2 },
  menuItemDesc:   { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  menuItemMeta:   { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuItemPrice:  { fontSize: 13, fontWeight: '700', color: '#EA580C' },
  menuItemEst:    { flexDirection: 'row', alignItems: 'center', gap: 3 },
  menuItemEstText:{ fontSize: 11, color: '#94A3B8' },
  availBtn:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, minWidth: 90, alignItems: 'center' },
  availBtnOn:     { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  availBtnOff:    { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  availBtnText:   { fontSize: 12, fontWeight: '700' },
  availBtnTextOn: { color: '#16A34A' },
  availBtnTextOff:{ color: '#EF4444' },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
});
