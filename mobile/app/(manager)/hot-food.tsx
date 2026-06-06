import { useState, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView,
  RefreshControl, Alert, ActivityIndicator, Modal, TextInput,
  KeyboardAvoidingView, Platform, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { hotFoodApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  FlameIcon, ClockIcon, CheckCircleIcon, XIcon, InboxIcon,
  PlusIcon, EditIcon, Trash2Icon,
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
interface MenuForm {
  name: string;
  description: string;
  price: string;
  estimatedMinutes: string;
  isAvailable: boolean;
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

const EMPTY_FORM: MenuForm = { name: '', description: '', price: '', estimatedMinutes: '', isAvailable: true };

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

interface CatalogEntry {
  name: string;
  storeCount: number;
  description?: string;
  price?: number;
  estimatedMinutes?: number;
}

// ─── Order Card ───────────────────────────────────────────────────────────────

function OrderCard({ order, onUpdateStatus, updating }: {
  order: FoodOrder;
  onUpdateStatus: (id: string, status: OrderStatus) => void;
  updating: boolean;
}) {
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
            onPress={() => Alert.alert('Cancel Order', 'Mark this order as cancelled?', [
              { text: 'No', style: 'cancel' },
              { text: 'Cancel Order', style: 'destructive', onPress: () => onUpdateStatus(order.id, 'CANCELLED') },
            ])}
            disabled={updating}
            activeOpacity={0.82}
          >
            <XIcon size={15} color="#EF4444" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {(order.status === 'COMPLETED' || order.status === 'CANCELLED') && (
        <View style={s.doneBadge}>
          {order.status === 'COMPLETED'
            ? <><CheckCircleIcon size={14} color="#16A34A" strokeWidth={2.5} /><Text style={[s.doneText, { color: '#16A34A' }]}>Completed</Text></>
            : <><XIcon size={14} color="#EF4444" strokeWidth={2.5} /><Text style={[s.doneText, { color: '#EF4444' }]}>Cancelled</Text></>
          }
        </View>
      )}
    </View>
  );
}

// ─── Menu Item Card (manager — full CRUD) ─────────────────────────────────────

function MenuItemCard({ item, onToggle, onEdit, onDelete, updating, storeCount = 1 }: {
  item: MenuItem;
  onToggle: (id: string, current: boolean) => void;
  onEdit: (item: MenuItem) => void;
  onDelete: (id: string, name: string) => void;
  updating: boolean;
  storeCount?: number;
}) {
  return (
    <View style={s.menuCard}>
      <View style={s.menuCardBody}>
        <View style={s.menuCardTop}>
          <Text style={s.menuItemName} numberOfLines={1}>{item.name}</Text>
          <View style={s.menuCardActions}>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => onEdit(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <EditIcon size={16} color={COLORS.secondary} strokeWidth={2} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, s.iconBtnDanger]}
              onPress={() => onDelete(item.id, item.name)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Trash2Icon size={16} color="#EF4444" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>

        {storeCount > 1 && (
          <View style={s.storeBadge}>
            <Text style={s.storeBadgeText}>In {storeCount} stores</Text>
          </View>
        )}

        {item.description ? (
          <Text style={s.menuItemDesc} numberOfLines={1}>{item.description}</Text>
        ) : null}

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

// ─── Store Picker ─────────────────────────────────────────────────────────────

function StorePicker({ stores, selected, onSelect }: {
  stores: { id: string; name: string }[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  if (stores.length <= 1) return null;
  return (
    <View style={s.storePicker}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storePickerScroll}>
        {stores.map(store => {
          const active = store.id === selected;
          return (
            <TouchableOpacity
              key={store.id}
              style={[s.storePill, active && s.storePillActive]}
              onPress={() => onSelect(store.id)}
              activeOpacity={0.75}
            >
              <Text style={[s.storePillText, active && s.storePillTextActive]} numberOfLines={1}>
                {store.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

// ─── Menu Item Modal (add / edit) ─────────────────────────────────────────────

function MenuItemModal({ visible, editingItem, storeId, catalog, onClose }: {
  visible: boolean;
  editingItem: MenuItem | null;
  storeId: string;
  catalog: CatalogEntry[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<MenuForm>(EMPTY_FORM);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suppressBlurRef = useRef(false);
  const qc = useQueryClient();

  useEffect(() => {
    if (visible) {
      setForm(editingItem
        ? {
            name: editingItem.name,
            description: editingItem.description ?? '',
            price: String(editingItem.price),
            estimatedMinutes: editingItem.estimatedMinutes ? String(editingItem.estimatedMinutes) : '',
            isAvailable: editingItem.isAvailable,
          }
        : EMPTY_FORM
      );
      setShowSuggestions(false);
    }
  }, [visible, editingItem]);

  const filteredSuggestions = useMemo(() => {
    const q = form.name.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter(c => c.name.toLowerCase().includes(q));
  }, [form.name, catalog]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const trimmedName = toTitleCase(form.name.trim());
      if (!trimmedName) throw new Error('Item name is required');
      const price = parseFloat(form.price);
      if (isNaN(price) || price <= 0) throw new Error('Enter a valid price greater than 0');
      const estimatedMinutes = form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null;
      const description = form.description.trim() || null;

      if (editingItem) {
        return hotFoodApi.updateMenuItem(editingItem.id, {
          name: trimmedName, description, price, estimatedMinutes, isAvailable: form.isAvailable,
        });
      } else {
        return hotFoodApi.createMenuItem(storeId, {
          name: trimmedName,
          ...(description && { description }),
          price,
          ...(estimatedMinutes && { estimatedMinutes }),
          isAvailable: form.isAvailable,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hot-food-menu-mgr'] });
      qc.invalidateQueries({ queryKey: ['hot-food-pending-count'] });
      Toast.show({ type: 'success', text1: editingItem ? 'Item updated' : 'Item added to menu' });
      onClose();
    },
    onError: (e: any) => {
      Toast.show({ type: 'error', text1: e.message || e.response?.data?.error || 'Failed to save item' });
    },
  });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={mf.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={mf.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={mf.sheet}>
          <View style={mf.handle} />

          <View style={mf.header}>
            <Text style={mf.title}>{editingItem ? 'Edit Item' : 'Add Menu Item'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={mf.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={mf.label}>Item Name *</Text>
            <TextInput
              style={mf.input}
              placeholder="e.g. Chicken Sandwich"
              placeholderTextColor={COLORS.textMuted}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              maxLength={80}
              autoCapitalize="words"
              autoFocus
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => {
                setTimeout(() => {
                  if (!suppressBlurRef.current) setShowSuggestions(false);
                  suppressBlurRef.current = false;
                }, 150);
              }}
            />

            {showSuggestions && filteredSuggestions.length > 0 && (
              <View style={mf.suggestionBox}>
                {filteredSuggestions.slice(0, 5).map(entry => (
                  <TouchableOpacity
                    key={entry.name}
                    style={mf.suggestionItem}
                    onPressIn={() => { suppressBlurRef.current = true; }}
                    onPress={() => {
                      setForm(f => ({
                        ...f,
                        name: entry.name,
                        description: f.description || entry.description || '',
                        price: f.price || (entry.price != null ? String(entry.price) : ''),
                        estimatedMinutes: f.estimatedMinutes || (entry.estimatedMinutes != null ? String(entry.estimatedMinutes) : ''),
                      }));
                      setShowSuggestions(false);
                      suppressBlurRef.current = false;
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={mf.suggestionRow}>
                      <Text style={mf.suggestionName}>{entry.name}</Text>
                      <View style={mf.suggestionRight}>
                        {entry.storeCount > 1 && (
                          <Text style={mf.suggestionMeta}>{entry.storeCount} stores</Text>
                        )}
                        {entry.price != null && (
                          <Text style={mf.suggestionPrice}>${Number(entry.price).toFixed(2)}</Text>
                        )}
                      </View>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={mf.label}>Description</Text>
            <TextInput
              style={[mf.input, mf.textArea]}
              placeholder="Brief description (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={form.description}
              onChangeText={v => setForm(f => ({ ...f, description: v }))}
              maxLength={200}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={mf.row}>
              <View style={mf.halfField}>
                <Text style={mf.label}>Price ($) *</Text>
                <TextInput
                  style={mf.input}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.price}
                  onChangeText={v => setForm(f => ({ ...f, price: v }))}
                  keyboardType="decimal-pad"
                  maxLength={8}
                />
              </View>
              <View style={mf.halfField}>
                <Text style={mf.label}>Est. Minutes</Text>
                <TextInput
                  style={mf.input}
                  placeholder="e.g. 10"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.estimatedMinutes}
                  onChangeText={v => setForm(f => ({ ...f, estimatedMinutes: v.replace(/\D/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            </View>

            <View style={mf.toggleRow}>
              <View>
                <Text style={mf.toggleLabel}>Available to order</Text>
                <Text style={mf.toggleHint}>Customers can only order available items</Text>
              </View>
              <Switch
                value={form.isAvailable}
                onValueChange={v => setForm(f => ({ ...f, isAvailable: v }))}
                trackColor={{ false: '#FEE2E2', true: '#D1FAE5' }}
                thumbColor={form.isAvailable ? '#16A34A' : '#EF4444'}
              />
            </View>

            <View style={{ height: 24 }} />
          </ScrollView>

          <View style={mf.footer}>
            <TouchableOpacity
              style={[mf.saveBtn, saveMutation.isPending && { opacity: 0.65 }]}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              activeOpacity={0.85}
            >
              {saveMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={mf.saveBtnText}>{editingItem ? 'Save Changes' : 'Add to Menu'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ManagerHotFood() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabKey>('PENDING');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const queryClient = useQueryClient();

  const { data: storesData } = useQuery({
    queryKey: ['manager-accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60_000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];
  const storeId = selectedStoreId || stores[0]?.id || user?.storeIds?.[0] || '';
  const storeIds = useMemo(() => stores.map(s => s.id), [stores]);

  // Fetch all store menus in parallel — used for cross-store suggestions and "In X stores" badges
  const { data: allMenusData } = useQuery({
    queryKey: ['hot-food-all-menus', storeIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(storeIds.map(id => hotFoodApi.getMenu(id)));
      return storeIds.map((id, i) => ({ storeId: id, items: (results[i].data?.data ?? []) as MenuItem[] }));
    },
    enabled: storeIds.length > 0,
    staleTime: 5 * 60_000,
  });

  const globalCatalog = useMemo<CatalogEntry[]>(() => {
    if (!allMenusData) return [];
    const map = new Map<string, { name: string; storeSet: Set<string>; storeCount: number; description?: string; price?: number; estimatedMinutes?: number }>();
    for (const { storeId: sid, items } of allMenusData) {
      for (const item of items) {
        const key = item.name.trim().toLowerCase();
        const titleName = toTitleCase(item.name.trim());
        if (!map.has(key)) {
          map.set(key, { name: titleName, storeSet: new Set([sid]), storeCount: 1, description: item.description, price: item.price, estimatedMinutes: item.estimatedMinutes });
        } else {
          const entry = map.get(key)!;
          entry.storeSet.add(sid);
          entry.storeCount = entry.storeSet.size;
        }
      }
    }
    return Array.from(map.values()).map(({ storeSet: _, ...rest }) => rest);
  }, [allMenusData]);

  const { data: ordersData, isLoading: ordersLoading, isRefetching, refetch } = useQuery({
    queryKey: ['hot-food-orders-mgr', storeId],
    queryFn: () => hotFoodApi.getStoreOrders(storeId),
    enabled: !!storeId,
    refetchInterval: 20_000,
  });

  const { data: menuData, isLoading: menuLoading } = useQuery({
    queryKey: ['hot-food-menu-mgr', storeId],
    queryFn: () => hotFoodApi.getMenu(storeId),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  const allOrders: FoodOrder[]  = ordersData?.data?.data ?? [];
  const menuItems: MenuItem[]   = menuData?.data?.data   ?? [];

  const pendingCount     = allOrders.filter(o => o.status === 'PENDING').length;
  const acceptedCount    = allOrders.filter(o => o.status === 'ACCEPTED').length;
  const readyCount       = allOrders.filter(o => o.status === 'READY').length;
  const unavailableCount = menuItems.filter(i => !i.isAvailable).length;

  const counts: Record<TabKey, number> = {
    PENDING: pendingCount, ACCEPTED: acceptedCount,
    READY: readyCount, ALL: allOrders.length, MENU: unavailableCount,
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
      queryClient.invalidateQueries({ queryKey: ['hot-food-orders-mgr'] });
      queryClient.invalidateQueries({ queryKey: ['hot-food-pending-count'] });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update order status.' });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleToggleItem(itemId: string, currentAvail: boolean) {
    if (updatingId) return;
    setUpdatingId(itemId);
    try {
      await hotFoodApi.updateItemAvailability(itemId, !currentAvail);
      queryClient.invalidateQueries({ queryKey: ['hot-food-menu-mgr'] });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update item availability.' });
    } finally {
      setUpdatingId(null);
    }
  }

  function handleDeleteItem(itemId: string, name: string) {
    Alert.alert('Delete Item', `Remove "${name}" from the menu?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await hotFoodApi.deleteMenuItem(itemId);
            queryClient.invalidateQueries({ queryKey: ['hot-food-menu-mgr'] });
            Toast.show({ type: 'success', text1: 'Item removed' });
          } catch {
            Toast.show({ type: 'error', text1: 'Could not delete item.' });
          }
        },
      },
    ]);
  }

  if (!storeId) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.header}>
          <View style={s.headerIcon}><FlameIcon size={20} color="#fff" strokeWidth={2} /></View>
          <Text style={s.headerTitle}>Hot Food</Text>
        </View>
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
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Hot Food</Text>
          {pendingCount > 0 && (
            <Text style={s.headerSub}>{pendingCount} pending · needs attention</Text>
          )}
        </View>
        {activeTab === 'MENU' && (
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => { setEditingItem(null); setShowModal(true); }}
            activeOpacity={0.85}
          >
            <PlusIcon size={18} color="#fff" strokeWidth={2.5} />
            <Text style={s.addBtnText}>Add Item</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Store Picker */}
      <StorePicker stores={stores} selected={storeId} onSelect={setSelectedStoreId} />

      {/* Tabs */}
      <View style={s.tabs}>
        {TABS.map(tab => {
          const active  = activeTab === tab.key;
          const count   = counts[tab.key];
          const isMenu  = tab.key === 'MENU';
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

      {/* Contextual note */}
      {activeTab === 'MENU' && (
        <View style={s.menuNote}>
          <Text style={s.menuNoteText}>Tap an item to toggle availability, or use edit/delete. Tap + Add Item to add new items to the menu.</Text>
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
              onEdit={item => { setEditingItem(item); setShowModal(true); }}
              onDelete={handleDeleteItem}
              updating={updatingId === item.id}
              storeCount={globalCatalog.find(c => c.name.toLowerCase() === item.name.trim().toLowerCase())?.storeCount ?? 1}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <InboxIcon size={48} color="#D1D5DB" />
              <Text style={s.emptyText}>No menu items yet.{'\n'}Tap + Add Item to get started.</Text>
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
            <OrderCard order={item} onUpdateStatus={handleUpdateStatus} updating={updatingId === item.id} />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <InboxIcon size={48} color="#D1D5DB" />
              <Text style={s.emptyText}>
                No {activeTab === 'ALL' ? '' : activeTab.toLowerCase() + ' '}orders right now
              </Text>
            </View>
          }
        />
      )}

      <MenuItemModal
        visible={showModal}
        editingItem={editingItem}
        storeId={storeId}
        catalog={globalCatalog}
        onClose={() => setShowModal(false)}
      />
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
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  storePicker: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingVertical: 8 },
  storePickerScroll: { paddingHorizontal: 14, gap: 8 },
  storePill: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#E2E8F0',
  },
  storePillActive:    { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  storePillText:      { fontSize: 13, fontWeight: '600', color: '#374151' },
  storePillTextActive:{ color: '#fff' },

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
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },

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
  doneText:          { fontSize: 13, fontWeight: '600' },

  // Menu item card
  menuCard:        { backgroundColor: '#fff', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  menuCardBody:    { flex: 1 },
  menuCardTop:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
  menuCardActions: { flexDirection: 'row', gap: 4 },
  iconBtn:         { width: 30, height: 30, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  iconBtnDanger:   { backgroundColor: '#FEF2F2' },
  menuItemName:    { flex: 1, fontSize: 14, fontWeight: '700', color: '#0F172A' },
  storeBadge:      { alignSelf: 'flex-start', backgroundColor: '#EFF6FF', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginBottom: 4 },
  storeBadgeText:  { fontSize: 10, fontWeight: '600', color: '#3B82F6' },
  menuItemDesc:    { fontSize: 12, color: '#94A3B8', marginBottom: 4 },
  menuItemMeta:    { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuItemPrice:   { fontSize: 13, fontWeight: '700', color: '#EA580C' },
  menuItemEst:     { flexDirection: 'row', alignItems: 'center', gap: 3 },
  menuItemEstText: { fontSize: 11, color: '#94A3B8' },
  availBtn:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, minWidth: 90, alignItems: 'center' },
  availBtnOn:      { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  availBtnOff:     { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  availBtnText:    { fontSize: 12, fontWeight: '700' },
  availBtnTextOn:  { color: '#16A34A' },
  availBtnTextOff: { color: '#EF4444' },
});

// ─── Modal styles ─────────────────────────────────────────────────────────────

const mf = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '90%',
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
  title:  { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  body:   { paddingHorizontal: 20, paddingTop: 16 },
  label:  { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    padding: 13, fontSize: 15, color: '#0F172A',
    backgroundColor: '#FAFAFA', marginBottom: 14,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  row:      { flexDirection: 'row', gap: 12 },
  halfField:{ flex: 1 },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, marginBottom: 8,
  },
  toggleLabel: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
  toggleHint:  { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  saveBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  suggestionBox: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    backgroundColor: '#fff', marginTop: -8, marginBottom: 14, overflow: 'hidden',
  },
  suggestionItem: {
    paddingHorizontal: 13, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  suggestionRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  suggestionName:  { fontSize: 14, fontWeight: '600', color: '#0F172A' },
  suggestionRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionMeta:  { fontSize: 11, fontWeight: '600', color: '#3B82F6' },
  suggestionPrice: { fontSize: 12, fontWeight: '700', color: '#EA580C' },
});
