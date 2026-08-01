import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  RefreshControl, Alert, ActivityIndicator, Modal,
  TextInput, ScrollView, Image, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { hotFoodApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  FlameIcon, ClockIcon, CheckCircleIcon, XIcon, InboxIcon,
  PlusIcon, EditIcon,
} from '../../components/Icons';
import FadeSlideIn from '../../components/FadeSlideIn';
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';

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
  category?: string;
  price: number;
  isAvailable: boolean;
  estimatedMinutes?: number;
  imageUrl?: string;
  source: 'menu' | 'catalog';
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

function orderAgeColor(dateStr: string): string {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins >= 10) return '#EF4444';
  if (mins >= 5)  return '#F97316';
  return '#94A3B8';
}

// ─── Add / Edit Item Sheet ────────────────────────────────────────────────────

interface ItemSheetProps {
  visible: boolean;
  storeId: string;
  item?: MenuItem;         // undefined = add mode
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

function ItemSheet({ visible, storeId, item, categories, onClose, onSaved }: ItemSheetProps) {
  const isEdit = !!item;

  const [name,       setName]       = useState(item?.name       ?? '');
  const [category,   setCategory]   = useState(item?.category   ?? '');
  const [price,      setPrice]      = useState(item?.price != null ? String(item.price) : '');
  const [estMins,    setEstMins]    = useState(item?.estimatedMinutes != null ? String(item.estimatedMinutes) : '');
  const [desc,       setDesc]       = useState(item?.description ?? '');
  const [imageUri,   setImageUri]   = useState<string | null>(item?.imageUrl ?? null);
  const [showCatSug, setShowCatSug] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  // Reset when sheet opens with new item
  const prevItemId = useRef<string | undefined>(undefined);
  if (visible && item?.id !== prevItemId.current) {
    prevItemId.current = item?.id;
    setName(item?.name ?? '');
    setCategory(item?.category ?? '');
    setPrice(item?.price != null ? String(item.price) : '');
    setEstMins(item?.estimatedMinutes != null ? String(item.estimatedMinutes) : '');
    setDesc(item?.description ?? '');
    setImageUri(item?.imageUrl ?? null);
  }
  if (!visible && prevItemId.current !== undefined) {
    prevItemId.current = undefined;
  }

  const catSuggestions = category.trim()
    ? categories.filter(c => c.toLowerCase().includes(category.toLowerCase()) && c.toLowerCase() !== category.toLowerCase())
    : categories;

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Toast.show({ type: 'error', text1: 'Camera permission denied' }); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  function showPhotoOptions() {
    Alert.alert('Item Photo', undefined, [
      { text: 'Take Photo',        onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      ...(imageUri ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => setImageUri(null) }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSave() {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Name is required' }); return; }
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) { Toast.show({ type: 'error', text1: 'Enter a valid price' }); return; }

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('storeId', storeId);
      fd.append('name', name.trim());
      fd.append('price', String(parsedPrice));
      if (category.trim()) fd.append('category', category.trim());
      if (desc.trim()) fd.append('description', desc.trim());
      if (estMins.trim()) fd.append('estimatedMinutes', estMins.trim());

      // Attach image if it's a local URI (new pick)
      if (imageUri && !imageUri.startsWith('http')) {
        const filename = imageUri.split('/').pop() ?? 'photo.jpg';
        const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        (fd as any).append('image', { uri: imageUri, name: filename, type: mime });
      }

      if (isEdit && item) {
        await hotFoodApi.updateMenuItem(item.id, fd);
      } else {
        await hotFoodApi.createMenuItem(fd);
      }

      Toast.show({ type: 'success', text1: isEdit ? 'Item updated' : 'Item added' });
      onSaved();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to save item' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!item) return;
    Alert.alert('Delete Item', `Remove "${item.name}" from the menu?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          setDeleting(true);
          try {
            await hotFoodApi.deleteMenuItem(item.id);
            Toast.show({ type: 'success', text1: 'Item removed' });
            onSaved();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to delete item' });
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={sh.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={sh.sheet}>
          <View style={sh.handle} />

          {/* Header */}
          <View style={sh.header}>
            <Text style={sh.title}>{isEdit ? 'Edit Item' : 'Add Menu Item'}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Photo area */}
            <TouchableOpacity
              style={sh.photoArea}
              onPress={showPhotoOptions}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={imageUri ? 'Change item photo' : 'Add item photo'}
            >
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={sh.photo} />
              ) : (
                <View style={sh.photoPlaceholder}>
                  <FlameIcon size={28} color="#CBD5E1" />
                  <Text style={sh.photoPlaceholderText}>Tap to add photo</Text>
                </View>
              )}
              <View style={sh.photoBadge}>
                <Text style={sh.photoBadgeText}>{imageUri ? 'Change' : 'Add'} Photo</Text>
              </View>
            </TouchableOpacity>

            {/* Name */}
            <Text style={sh.label}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput
              style={sh.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Cheese Hot Dog"
              placeholderTextColor={COLORS.textMuted}
              maxLength={80}
              autoCapitalize="words"
            />

            {/* Category */}
            <Text style={sh.label}>Category</Text>
            <TextInput
              style={sh.input}
              value={category}
              onChangeText={v => { setCategory(v); setShowCatSug(true); }}
              onFocus={() => setShowCatSug(true)}
              onBlur={() => setTimeout(() => setShowCatSug(false), 150)}
              placeholder="e.g. Roller Grill, Pizza, Sandwiches…"
              placeholderTextColor={COLORS.textMuted}
              maxLength={50}
              autoCapitalize="words"
            />
            {showCatSug && catSuggestions.length > 0 && (
              <View style={sh.catSuggest}>
                {catSuggestions.slice(0, 5).map(c => (
                  <TouchableOpacity
                    key={c}
                    style={sh.catSuggestRow}
                    onPress={() => { setCategory(c); setShowCatSug(false); }}
                    hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select category ${c}`}
                  >
                    <Text style={sh.catSuggestText}>{c}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Price */}
            <Text style={sh.label}>Price <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput
              style={sh.input}
              value={price}
              onChangeText={setPrice}
              placeholder="e.g. 1.99"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              maxLength={8}
            />

            {/* Estimated time */}
            <Text style={sh.label}>Estimated Time (minutes)</Text>
            <TextInput
              style={sh.input}
              value={estMins}
              onChangeText={setEstMins}
              placeholder="e.g. 3"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              maxLength={3}
            />

            {/* Description */}
            <Text style={sh.label}>Description (optional)</Text>
            <TextInput
              style={[sh.input, { minHeight: 70, textAlignVertical: 'top' }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="Short description shown to customers"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={200}
            />

            {/* Save */}
            <TouchableOpacity
              style={[sh.saveBtn, saving && { opacity: 0.6 }]}
              onPress={handleSave}
              disabled={saving || deleting}
              accessibilityRole="button"
              accessibilityLabel={isEdit ? 'Save changes' : 'Add item to menu'}
            >
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={sh.saveBtnText}>{isEdit ? 'Save Changes' : 'Add to Menu'}</Text>
              }
            </TouchableOpacity>

            {/* Delete (edit mode only) */}
            {isEdit && (
              <TouchableOpacity
                style={[sh.deleteBtn, deleting && { opacity: 0.6 }]}
                onPress={handleDelete}
                disabled={saving || deleting}
                accessibilityRole="button"
                accessibilityLabel="Remove item from menu"
              >
                {deleting
                  ? <ActivityIndicator color="#EF4444" />
                  : <Text style={sh.deleteBtnText}>Remove from Menu</Text>
                }
              </TouchableOpacity>
            )}

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Order card ───────────────────────────────────────────────────────────────

function OrderCard({
  order, onUpdateStatus, updating,
}: { order: FoodOrder; onUpdateStatus: (id: string, status: OrderStatus) => void; updating: boolean }) {
  const cfg      = STATUS_CONFIG[order.status];
  const total    = order.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const ageColor = ['PENDING', 'ACCEPTED'].includes(order.status) ? orderAgeColor(order.createdAt) : '#94A3B8';

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <View style={s.cardHeaderLeft}>
          <Text style={s.orderNum}>#{order.orderNumber}</Text>
          <View style={s.timePill}>
            <ClockIcon size={11} color={ageColor} strokeWidth={2} />
            <Text style={[s.timeText, { color: ageColor }]}>{timeAgo(order.createdAt)}</Text>
          </View>
        </View>
        <View style={[s.statusPill, { backgroundColor: cfg.bg }]}>
          <Text style={[s.statusText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <Text style={s.customerName}>{order.customer.name}</Text>
      <Text style={s.customerPhone}>{order.customer.phone}</Text>

      {order.note ? (
        <View style={s.noteBox}>
          <Text style={s.noteBoxLabel}>Note: </Text>
          <Text style={s.noteBoxText}>{order.note}</Text>
        </View>
      ) : null}

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

      {order.status === 'PENDING' && (
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#F97316' }, updating && s.actionBtnDisabled]}
          onPress={() => onUpdateStatus(order.id, 'ACCEPTED')}
          disabled={updating}
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityLabel={`Accept order #${order.orderNumber}`}
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
          accessibilityRole="button"
          accessibilityLabel={`Mark order #${order.orderNumber} ready`}
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
            accessibilityRole="button"
            accessibilityLabel={`Mark order #${order.orderNumber} completed`}
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
            accessibilityRole="button"
            accessibilityLabel={`Cancel order #${order.orderNumber}`}
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

// ─── Menu item card ───────────────────────────────────────────────────────────

function MenuItemCard({
  item, onToggle, onEdit, updating,
}: { item: MenuItem; onToggle: (item: MenuItem) => void; onEdit: (item: MenuItem) => void; updating: boolean }) {
  const [imgErr, setImgErr] = useState(false);

  return (
    <View style={s.menuCard}>
      {/* Photo thumbnail */}
      {item.imageUrl && !imgErr ? (
        <Image source={{ uri: item.imageUrl }} style={s.menuThumb} onError={() => setImgErr(true)} />
      ) : (
        <View style={[s.menuThumb, s.menuThumbPlaceholder]}>
          <FlameIcon size={18} color="#CBD5E1" />
        </View>
      )}

      <View style={s.menuCardBody}>
        <View style={s.menuItemHeader}>
          <Text style={s.menuItemName} numberOfLines={1}>{item.name}</Text>
          {item.source === 'catalog' && (
            <View style={s.catalogBadge}><Text style={s.catalogBadgeText}>Catalog</Text></View>
          )}
        </View>
        {item.category ? <Text style={s.menuItemCat}>{item.category}</Text> : null}
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

      <View style={s.menuCardRight}>
        {/* Edit button — only for store-specific items */}
        {item.source === 'menu' && (
          <TouchableOpacity
            style={s.editBtn}
            onPress={() => onEdit(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
          >
            <EditIcon size={15} color={COLORS.secondary} strokeWidth={2} />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[s.availBtn, item.isAvailable ? s.availBtnOn : s.availBtnOff, updating && { opacity: 0.5 }]}
          onPress={() => onToggle(item)}
          disabled={updating}
          activeOpacity={0.8}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          accessibilityRole="switch"
          accessibilityLabel={`Mark ${item.name} as ${item.isAvailable ? 'sold out' : 'available'}`}
        >
          {updating
            ? <ActivityIndicator size="small" color={item.isAvailable ? '#16A34A' : '#EF4444'} />
            : <Text style={[s.availBtnText, item.isAvailable ? s.availBtnTextOn : s.availBtnTextOff]}>
                {item.isAvailable ? 'Available' : 'Sold Out'}
              </Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

const VALID_TABS: TabKey[] = ['PENDING', 'ACCEPTED', 'READY', 'ALL', 'MENU'];

export default function HotFoodOrders() {
  const { user } = useAuthStore();
  const storeId  = user?.storeIds?.[0];
  const highlightedId = useHighlightParam();
  const [activeTab,    setActiveTab]    = useState<TabKey>('PENDING');
  const [updatingId,   setUpdatingId]   = useState<string | null>(null);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingItem,  setEditingItem]  = useState<MenuItem | null>(null);
  const queryClient = useQueryClient();

  // Switch to the requested tab when arriving from a notification tap
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useFocusEffect(useCallback(() => {
    if (tab && VALID_TABS.includes(tab as TabKey)) {
      setActiveTab(tab as TabKey);
      router.setParams({ tab: '' });
    }
  }, [tab]));

  // Orders
  const { data: ordersData, isLoading: ordersLoading, isRefetching, refetch } = useQuery({
    queryKey: ['hot-food-orders', storeId],
    queryFn: () => hotFoodApi.getStoreOrders(storeId!),
    enabled: !!storeId,
    refetchInterval: 10_000,
  });

  // All items (menu + catalog)
  const { data: menuData, isLoading: menuLoading, refetch: refetchMenu } = useQuery({
    queryKey: ['hot-food-all-items', storeId],
    queryFn: () => hotFoodApi.getStoreAllItems(storeId!),
    enabled: !!storeId,
    refetchInterval: 60_000,
  });

  // Category suggestions
  const { data: catData } = useQuery({
    queryKey: ['hot-food-menu-categories', storeId],
    queryFn: () => hotFoodApi.getMenuCategories(storeId),
    enabled: !!storeId,
    staleTime: 5 * 60 * 1000,
  });
  const categoryList: string[] = catData?.data?.data ?? [];

  const allOrders: FoodOrder[] = ordersData?.data?.data ?? [];
  const menuItems: MenuItem[]  = menuData?.data?.data   ?? [];

  // Haptic feedback when a new PENDING order arrives while screen is open
  const prevPendingCount = useRef<number | null>(null);
  useEffect(() => {
    const current = allOrders.filter(o => o.status === 'PENDING').length;
    if (prevPendingCount.current !== null && current > prevPendingCount.current) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
    prevPendingCount.current = current;
  }, [allOrders]);

  const pendingCount     = allOrders.filter(o => o.status === 'PENDING').length;
  const acceptedCount    = allOrders.filter(o => o.status === 'ACCEPTED').length;
  const readyCount       = allOrders.filter(o => o.status === 'READY').length;
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

  async function doUpdateStatus(orderId: string, status: OrderStatus, estimatedMinutes?: number) {
    setUpdatingId(orderId);
    try {
      await hotFoodApi.updateStatus(orderId, status, estimatedMinutes);
      queryClient.invalidateQueries({ queryKey: ['hot-food-orders'] });
      queryClient.invalidateQueries({ queryKey: ['hot-food-pending-count'] });
    } catch {
      Alert.alert('Error', 'Could not update order status. Try again.');
    } finally {
      setUpdatingId(null);
    }
  }

  function handleUpdateStatus(orderId: string, status: OrderStatus) {
    if (updatingId) return;
    if (status === 'ACCEPTED') {
      Alert.alert(
        'Accept Order',
        'How long until this order is ready?',
        [
          { text: '5 min',  onPress: () => doUpdateStatus(orderId, status, 5)  },
          { text: '10 min', onPress: () => doUpdateStatus(orderId, status, 10) },
          { text: '15 min', onPress: () => doUpdateStatus(orderId, status, 15) },
          { text: '20 min', onPress: () => doUpdateStatus(orderId, status, 20) },
          { text: 'Skip',   onPress: () => doUpdateStatus(orderId, status)     },
          { text: 'Cancel', style: 'cancel' },
        ],
      );
    } else {
      doUpdateStatus(orderId, status);
    }
  }

  async function handleToggleItem(item: MenuItem) {
    if (updatingId) return;
    setUpdatingId(item.id);
    try {
      if (item.source === 'catalog') {
        await hotFoodApi.updateCatalogItemAvailability(storeId!, item.id, !item.isAvailable);
      } else {
        await hotFoodApi.updateItemAvailability(item.id, !item.isAvailable);
      }
      queryClient.invalidateQueries({ queryKey: ['hot-food-all-items'] });
    } catch {
      Alert.alert('Error', 'Could not update item availability.');
    } finally {
      setUpdatingId(null);
    }
  }

  function handleSaved() {
    setShowAddSheet(false);
    setEditingItem(null);
    queryClient.invalidateQueries({ queryKey: ['hot-food-all-items'] });
    queryClient.invalidateQueries({ queryKey: ['hot-food-menu-categories'] });
    refetchMenu();
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
        <View style={s.headerLeft}>
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

        {/* Add item button — only visible on MENU tab */}
        {activeTab === 'MENU' && (
          <TouchableOpacity
            style={s.addItemBtn}
            onPress={() => setShowAddSheet(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Add menu item"
          >
            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
            <Text style={s.addItemBtnText}>Add Item</Text>
          </TouchableOpacity>
        )}
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
              hitSlop={{ top: 6, bottom: 6, left: 2, right: 2 }}
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} tab${count > 0 ? `, ${count} items` : ''}`}
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

      {/* Menu note */}
      {activeTab === 'MENU' && (
        <View style={s.menuNote}>
          <Text style={s.menuNoteText}>
            Toggle items sold out/available. Tap the pencil icon to edit or remove a store item. Catalog items can only be toggled.
          </Text>
        </View>
      )}

      {/* Content */}
      {isLoading ? (
        <View style={s.empty}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : activeTab === 'MENU' ? (
        <FadeSlideIn style={{ flex: 1 }}>
          <FlatList
            data={menuItems}
            keyExtractor={item => item.id}
            contentContainerStyle={menuItems.length === 0 ? s.emptyList : s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetchMenu} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
            renderItem={({ item }) => (
              <MenuItemCard
                item={item}
                onToggle={handleToggleItem}
                onEdit={setEditingItem}
                updating={updatingId === item.id}
              />
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <InboxIcon size={48} color="#D1D5DB" />
                <Text style={s.emptyText}>No menu items yet — tap "Add Item" to get started.</Text>
              </View>
            }
          />
        </FadeSlideIn>
      ) : (
        <FadeSlideIn style={{ flex: 1 }}>
          <FlatList
            data={filteredOrders}
            keyExtractor={item => item.id}
            contentContainerStyle={filteredOrders.length === 0 ? s.emptyList : s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />
            }
            renderItem={({ item }) => (
              <PulseHighlight active={item.id === highlightedId}>
                <OrderCard
                  order={item}
                  onUpdateStatus={handleUpdateStatus}
                  updating={updatingId === item.id}
                />
              </PulseHighlight>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <InboxIcon size={48} color="#D1D5DB" />
                <Text style={s.emptyText}>No {activeTab === 'ALL' ? '' : activeTab.toLowerCase() + ' '}orders right now</Text>
              </View>
            }
          />
        </FadeSlideIn>
      )}

      {/* Add Item Sheet */}
      <ItemSheet
        visible={showAddSheet}
        storeId={storeId}
        categories={categoryList}
        onClose={() => setShowAddSheet(false)}
        onSaved={handleSaved}
      />

      {/* Edit Item Sheet */}
      {editingItem && (
        <ItemSheet
          visible={true}
          storeId={storeId}
          item={editingItem}
          categories={categoryList}
          onClose={() => setEditingItem(null)}
          onSaved={handleSaved}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.secondary, paddingHorizontal: 16, paddingVertical: 14, gap: 10,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 1 },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  addItemBtnText: { fontSize: 13, fontWeight: '700', color: '#fff' },

  tabs: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
    flexWrap: 'wrap',
  },
  tab:               { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
  tabActive:         { backgroundColor: COLORS.primary },
  tabActiveMenu:     { backgroundColor: '#EA580C' },
  tabText:           { fontSize: 12, fontWeight: '600', color: '#64748B' },
  tabTextActive:     { color: '#fff' },
  tabBadge:          { backgroundColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeActive:    { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText:      { fontSize: 11, fontWeight: '700', color: '#64748B' },
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
  customerPhone:  { fontSize: 12, color: '#94A3B8', marginBottom: 8 },
  noteBox:        { flexDirection: 'row', backgroundColor: '#FFFBEB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 10, flexWrap: 'wrap' },
  noteBoxLabel:   { fontSize: 12, fontWeight: '800', color: '#92400E' },
  noteBoxText:    { fontSize: 12, color: '#78350F', flex: 1 },
  itemsList:      { gap: 6, marginBottom: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  itemRow:        { flexDirection: 'row', alignItems: 'center', gap: 6 },
  itemQty:        { fontSize: 13, fontWeight: '700', color: COLORS.primary, width: 24 },
  itemName:       { flex: 1, fontSize: 13, color: '#374151' },
  itemPrice:      { fontSize: 13, fontWeight: '600', color: '#0F172A' },
  totalRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginBottom: 12 },
  totalLabel:     { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  totalValue:     { fontSize: 16, fontWeight: '800', color: '#0F172A' },
  actionBtn:         { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  actionBtnDisabled: { opacity: 0.6 },
  actionBtnText:     { color: '#fff', fontSize: 14, fontWeight: '700' },
  readyActions:      { flexDirection: 'row', gap: 10 },
  cancelBtn:         { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  doneBadge:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 10 },
  doneText:          { fontSize: 13, fontWeight: '600', color: '#16A34A' },

  // Menu item card
  menuCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 12,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  menuThumb:            { width: 52, height: 52, borderRadius: 10, flexShrink: 0 },
  menuThumbPlaceholder: { backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' },
  menuCardBody:         { flex: 1, minWidth: 0 },
  menuCardRight:        { alignItems: 'flex-end', gap: 8, flexShrink: 0 },
  menuItemHeader:       { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2, flexWrap: 'wrap' },
  menuItemName:         { fontSize: 14, fontWeight: '700', color: '#0F172A', flexShrink: 1 },
  menuItemCat:          { fontSize: 11, color: COLORS.secondary, fontWeight: '600', marginBottom: 3 },
  catalogBadge:         { backgroundColor: '#EFF6FF', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  catalogBadgeText:     { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  menuItemMeta:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  menuItemPrice:        { fontSize: 13, fontWeight: '700', color: '#EA580C' },
  menuItemEst:          { flexDirection: 'row', alignItems: 'center', gap: 3 },
  menuItemEstText:      { fontSize: 11, color: '#94A3B8' },
  editBtn:              { padding: 4 },
  availBtn:             { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1.5, minWidth: 80, alignItems: 'center' },
  availBtnOn:           { borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  availBtnOff:          { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  availBtnText:         { fontSize: 11, fontWeight: '700' },
  availBtnTextOn:       { color: '#16A34A' },
  availBtnTextOff:      { color: '#EF4444' },

  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyText: { fontSize: 14, color: '#94A3B8', textAlign: 'center' },
});

// ─── Sheet styles ─────────────────────────────────────────────────────────────

const sh = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '92%',
  },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title:  { fontSize: 18, fontWeight: '800', color: COLORS.text },

  photoArea: {
    height: 140, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB',
    borderStyle: 'dashed', overflow: 'hidden', marginBottom: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC',
  },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  photoPlaceholder: { alignItems: 'center', gap: 6 },
  photoPlaceholderText: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  photoBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  photoBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  label: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: COLORS.text,
  },

  catSuggest: {
    borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10,
    backgroundColor: '#fff', marginTop: 2, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 4,
  },
  catSuggestRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  catSuggestText: { fontSize: 14, color: COLORS.text },

  saveBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 20,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  deleteBtn: {
    borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 14,
    paddingVertical: 13, alignItems: 'center', marginTop: 10,
  },
  deleteBtnText: { color: '#EF4444', fontSize: 14, fontWeight: '700' },
});
