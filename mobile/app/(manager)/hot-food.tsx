import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Dimensions,
  Image, TextInput, ActivityIndicator, Alert, Modal, ScrollView,
  KeyboardAvoidingView, Platform, RefreshControl, Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { hotFoodApi, hotFoodCatalogApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  FlameIcon, ClockIcon, CheckCircleIcon, XIcon, InboxIcon,
  PlusIcon, EditIcon, Trash2Icon, CameraIcon, ImageIcon, BuildingIcon,
} from '../../components/Icons';

// ─── Dimensions & utils ───────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TILE_GAP = 10;
const TILE_MARGIN = 14;
const TILE_WIDTH = (SCREEN_WIDTH - TILE_MARGIN * 2 - TILE_GAP) / 2;

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function timeAgo(dateStr: string) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

const PLACEHOLDER_COLORS = ['#DBEAFE', '#DCF8C6', '#FEF9C3', '#FFE4E6', '#EDE9FE', '#FFEDD5', '#F0FDF4'];

// ─── Types ────────────────────────────────────────────────────────────────────

type MainView  = 'orders' | 'catalog';
type OrderTab  = 'PENDING' | 'ACCEPTED' | 'READY' | 'ALL';
type OrderStatus = 'PENDING' | 'ACCEPTED' | 'READY' | 'COMPLETED' | 'CANCELLED';

interface OrderItem  { menuItemId: string; name: string; quantity: number; price: number }
interface FoodOrder  {
  id: string; orderNumber: string;
  customer: { name: string; phone: string };
  items: OrderItem[]; note?: string; status: OrderStatus; createdAt: string;
}
interface CatalogItem {
  id: string; name: string; description?: string;
  price: number; imageUrl?: string; estimatedMinutes?: number; storeCount: number;
}
interface CatalogForm { name: string; description: string; price: string; estimatedMinutes: string; }

const EMPTY_CATALOG_FORM: CatalogForm = { name: '', description: '', price: '', estimatedMinutes: '' };

const STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING:   { label: 'Pending',   color: '#F97316', bg: '#FFF7ED' },
  ACCEPTED:  { label: 'Preparing', color: '#3B82F6', bg: '#EFF6FF' },
  READY:     { label: 'Ready',     color: '#16A34A', bg: '#F0FDF4' },
  COMPLETED: { label: 'Done',      color: '#94A3B8', bg: '#F8FAFC' },
  CANCELLED: { label: 'Cancelled', color: '#EF4444', bg: '#FEF2F2' },
};

const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'PENDING',  label: 'Pending'   },
  { key: 'ACCEPTED', label: 'Preparing' },
  { key: 'READY',    label: 'Ready'     },
  { key: 'ALL',      label: 'All'       },
];

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
          style={[s.actionBtn, { backgroundColor: '#F97316' }, updating && s.btnDisabled]}
          onPress={() => onUpdateStatus(order.id, 'ACCEPTED')}
          disabled={updating} activeOpacity={0.82}
        >
          {updating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.actionBtnText}>Accept Order</Text>}
        </TouchableOpacity>
      )}

      {order.status === 'ACCEPTED' && (
        <TouchableOpacity
          style={[s.actionBtn, { backgroundColor: '#3B82F6' }, updating && s.btnDisabled]}
          onPress={() => onUpdateStatus(order.id, 'READY')}
          disabled={updating} activeOpacity={0.82}
        >
          {updating ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.actionBtnText}>Mark Ready</Text>}
        </TouchableOpacity>
      )}

      {order.status === 'READY' && (
        <View style={s.readyRow}>
          <TouchableOpacity
            style={[s.actionBtn, { backgroundColor: '#16A34A', flex: 1 }, updating && s.btnDisabled]}
            onPress={() => onUpdateStatus(order.id, 'COMPLETED')}
            disabled={updating} activeOpacity={0.82}
          >
            {updating
              ? <ActivityIndicator color="#fff" size="small" />
              : <><CheckCircleIcon size={15} color="#fff" strokeWidth={2.5} /><Text style={s.actionBtnText}>Complete</Text></>}
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.cancelBtn, updating && s.btnDisabled]}
            onPress={() => Alert.alert('Cancel Order', 'Mark this order as cancelled?', [
              { text: 'No', style: 'cancel' },
              { text: 'Cancel Order', style: 'destructive', onPress: () => onUpdateStatus(order.id, 'CANCELLED') },
            ])}
            disabled={updating} activeOpacity={0.82}
          >
            <XIcon size={15} color="#EF4444" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>
      )}

      {(order.status === 'COMPLETED' || order.status === 'CANCELLED') && (
        <View style={s.doneBadge}>
          {order.status === 'COMPLETED'
            ? <><CheckCircleIcon size={14} color="#16A34A" strokeWidth={2.5} /><Text style={[s.doneText, { color: '#16A34A' }]}>Completed</Text></>
            : <><XIcon size={14} color="#EF4444" strokeWidth={2.5} /><Text style={[s.doneText, { color: '#EF4444' }]}>Cancelled</Text></>}
        </View>
      )}
    </View>
  );
}

// ─── Catalog Tile ─────────────────────────────────────────────────────────────

function CatalogTile({ item, onPress }: { item: CatalogItem; onPress: () => void }) {
  const initial = item.name.charAt(0).toUpperCase();
  const placeholderBg = PLACEHOLDER_COLORS[initial.charCodeAt(0) % PLACEHOLDER_COLORS.length];

  return (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.88}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={s.tileImage} resizeMode="cover" />
      ) : (
        <View style={[s.tilePlaceholder, { backgroundColor: placeholderBg }]}>
          <Text style={s.tilePlaceholderText}>{initial}</Text>
        </View>
      )}
      <View style={s.tileInfo}>
        <Text style={s.tileName} numberOfLines={2}>{item.name}</Text>
        <View style={s.tileBottom}>
          <Text style={s.tilePrice}>${Number(item.price).toFixed(2)}</Text>
          <View style={[s.tileBadge, item.storeCount === 0 && s.tileBadgeNone]}>
            <BuildingIcon size={9} color={item.storeCount > 0 ? '#3B82F6' : '#94A3B8'} strokeWidth={2.5} />
            <Text style={[s.tileBadgeText, item.storeCount === 0 && s.tileBadgeTextNone]}>
              {item.storeCount}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Add / Edit Catalog Item Modal ────────────────────────────────────────────

function AddEditModal({ visible, editingItem, onClose }: {
  visible: boolean;
  editingItem: CatalogItem | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CatalogForm>(EMPTY_CATALOG_FORM);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (visible) {
      setForm(editingItem ? {
        name: editingItem.name, description: editingItem.description ?? '',
        price: String(editingItem.price),
        estimatedMinutes: editingItem.estimatedMinutes ? String(editingItem.estimatedMinutes) : '',
      } : EMPTY_CATALOG_FORM);
      setImageUri(null);
    }
  }, [visible, editingItem]);

  async function pickImage() {
    Alert.alert('Add Photo', 'Choose source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Toast.show({ type: 'error', text1: 'Camera permission required' }); return; }
          const r = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!r.canceled) setImageUri(r.assets[0].uri);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Toast.show({ type: 'error', text1: 'Photo library permission required' }); return; }
          const r = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!r.canceled) setImageUri(r.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = toTitleCase(form.name.trim());
      if (!name) throw new Error('Item name is required');
      const price = parseFloat(form.price);
      if (isNaN(price) || price <= 0) throw new Error('Enter a valid price');
      const estimatedMinutes = form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null;
      const description = form.description.trim() || null;

      if (editingItem) {
        await hotFoodCatalogApi.update(editingItem.id, { name, description, price, estimatedMinutes });
        if (imageUri) {
          const fd = new FormData();
          const filename = imageUri.split('/').pop() ?? 'item.jpg';
          const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
          (fd as any).append('image', { uri: imageUri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
          await hotFoodCatalogApi.updateImage(editingItem.id, fd);
        }
      } else {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('price', String(price));
        if (description) fd.append('description', description);
        if (estimatedMinutes) fd.append('estimatedMinutes', String(estimatedMinutes));
        if (imageUri) {
          const filename = imageUri.split('/').pop() ?? 'item.jpg';
          const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
          (fd as any).append('image', { uri: imageUri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
        }
        await hotFoodCatalogApi.create(fd);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      Toast.show({ type: 'success', text1: editingItem ? 'Item updated' : 'Item added to catalog' });
      onClose();
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e.message || 'Failed to save item' }),
  });

  const displayUri = imageUri ?? (editingItem?.imageUrl ?? null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={m.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={m.sheet}>
          <View style={m.handle} />
          <View style={m.header}>
            <Text style={m.title}>{editingItem ? 'Edit Item' : 'New Catalog Item'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={m.imagePicker} onPress={pickImage} activeOpacity={0.85}>
              {displayUri
                ? <Image source={{ uri: displayUri }} style={m.imagePreview} resizeMode="cover" />
                : (
                  <View style={m.imagePlaceholder}>
                    <ImageIcon size={40} color="#CBD5E1" strokeWidth={1.5} />
                    <Text style={m.imagePlaceholderLabel}>Add Photo</Text>
                    <Text style={m.imagePlaceholderHint}>Tap to choose from library or camera</Text>
                  </View>
                )}
              <View style={m.cameraBadge}>
                <CameraIcon size={13} color="#fff" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>

            <Text style={m.label}>Item Name *</Text>
            <TextInput style={m.input} placeholder="e.g. Corn Dog" placeholderTextColor={COLORS.textMuted}
              value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} maxLength={80} autoCapitalize="words" />

            <Text style={m.label}>Description</Text>
            <TextInput style={[m.input, m.textArea]} placeholder="Brief description (optional)" placeholderTextColor={COLORS.textMuted}
              value={form.description} onChangeText={v => setForm(f => ({ ...f, description: v }))}
              maxLength={200} multiline numberOfLines={3} textAlignVertical="top" />

            <View style={m.row}>
              <View style={m.halfField}>
                <Text style={m.label}>Price ($) *</Text>
                <TextInput style={m.input} placeholder="0.00" placeholderTextColor={COLORS.textMuted}
                  value={form.price} onChangeText={v => setForm(f => ({ ...f, price: v }))} keyboardType="decimal-pad" maxLength={8} />
              </View>
              <View style={m.halfField}>
                <Text style={m.label}>Est. Minutes</Text>
                <TextInput style={m.input} placeholder="e.g. 10" placeholderTextColor={COLORS.textMuted}
                  value={form.estimatedMinutes} onChangeText={v => setForm(f => ({ ...f, estimatedMinutes: v.replace(/\D/g, '') }))}
                  keyboardType="number-pad" maxLength={3} />
              </View>
            </View>
            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={m.footer}>
            <TouchableOpacity style={[m.saveBtn, saveMutation.isPending && { opacity: 0.65 }]}
              onPress={() => saveMutation.mutate()} disabled={saveMutation.isPending} activeOpacity={0.85}>
              {saveMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={m.saveBtnText}>{editingItem ? 'Save Changes' : 'Add to Catalog'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Store Assignment Sheet ───────────────────────────────────────────────────

function AssignSheet({ visible, item, stores, onClose, onEdit }: {
  visible: boolean;
  item: CatalogItem | null;
  stores: { id: string; name: string }[];
  onClose: () => void;
  onEdit: () => void;
}) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: assignmentData, isLoading: assignLoading } = useQuery({
    queryKey: ['catalog-store-assignments', item?.id],
    queryFn: () => hotFoodCatalogApi.getStoreAssignments(item!.id),
    enabled: !!item && visible,
  });
  const assignedIds: string[] = assignmentData?.data?.data?.assignedStoreIds ?? [];

  useEffect(() => {
    setLocalSelected(new Set(assignedIds));
  }, [assignedIds.join(','), visible]);

  const hasChanges = useMemo(() => {
    const original = new Set(assignedIds);
    if (original.size !== localSelected.size) return true;
    for (const id of localSelected) if (!original.has(id)) return true;
    return false;
  }, [localSelected, assignedIds]);

  function toggleStore(id: string) {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!item || saving) return;
    setSaving(true);
    const originalSet = new Set(assignedIds);
    const toAdd    = stores.filter(s => localSelected.has(s.id)  && !originalSet.has(s.id));
    const toRemove = stores.filter(s => !localSelected.has(s.id) && originalSet.has(s.id));
    try {
      await Promise.all([
        ...toAdd.map(s    => hotFoodCatalogApi.assignToStore(item.id, s.id)),
        ...toRemove.map(s => hotFoodCatalogApi.removeFromStore(item.id, s.id)),
      ]);
      qc.invalidateQueries({ queryKey: ['catalog-store-assignments', item.id] });
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      const n = localSelected.size;
      Toast.show({ type: 'success', text1: `Assigned to ${n} store${n !== 1 ? 's' : ''}` });
      onClose();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save store assignments' });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert('Delete Item', `Remove "${item?.name}" from the catalog? It will be unassigned from all stores.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await hotFoodCatalogApi.delete(item!.id);
            qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
            Toast.show({ type: 'success', text1: 'Item removed from catalog' });
            onClose();
          } catch {
            Toast.show({ type: 'error', text1: 'Could not delete item' });
          }
        },
      },
    ]);
  }

  if (!item) return null;

  const initial = item.name.charAt(0).toUpperCase();
  const placeholderBg = PLACEHOLDER_COLORS[initial.charCodeAt(0) % PLACEHOLDER_COLORS.length];
  const allSelected  = stores.length > 0 && localSelected.size === stores.length;
  const noneSelected = localSelected.size === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={a.overlay}>
        <TouchableOpacity style={a.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={a.sheet}>
          <View style={a.handle} />

          <View style={a.itemRow}>
            {item.imageUrl
              ? <Image source={{ uri: item.imageUrl }} style={a.thumb} resizeMode="cover" />
              : <View style={[a.thumbPlaceholder, { backgroundColor: placeholderBg }]}><Text style={a.thumbInitial}>{initial}</Text></View>}
            <View style={a.itemInfo}>
              <Text style={a.itemName} numberOfLines={1}>{item.name}</Text>
              {item.description ? <Text style={a.itemDesc} numberOfLines={2}>{item.description}</Text> : null}
              <View style={a.itemMeta}>
                <Text style={a.itemPrice}>${Number(item.price).toFixed(2)}</Text>
                {item.estimatedMinutes ? (
                  <View style={a.itemEst}>
                    <ClockIcon size={11} color={COLORS.textMuted} strokeWidth={2} />
                    <Text style={a.itemEstText}>~{item.estimatedMinutes} min</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={a.actionBtns}>
              <TouchableOpacity style={a.iconBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <EditIcon size={16} color={COLORS.secondary} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={[a.iconBtn, a.iconBtnDanger]} onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Trash2Icon size={16} color="#EF4444" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={a.sectionHead}>
            <Text style={a.sectionTitle}>Assign to Stores</Text>
            <View style={a.bulkRow}>
              <TouchableOpacity style={[a.bulkBtn, allSelected && a.bulkBtnOn]}
                onPress={() => setLocalSelected(new Set(stores.map(s => s.id)))} disabled={assignLoading} activeOpacity={0.7}>
                <Text style={[a.bulkBtnText, allSelected && a.bulkBtnTextOn]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[a.bulkBtn, noneSelected && a.bulkBtnOn]}
                onPress={() => setLocalSelected(new Set())} disabled={assignLoading} activeOpacity={0.7}>
                <Text style={[a.bulkBtnText, noneSelected && a.bulkBtnTextOn]}>None</Text>
              </TouchableOpacity>
              <Text style={a.sectionCount}>{assignLoading ? '…' : `${localSelected.size} / ${stores.length}`}</Text>
            </View>
          </View>

          {assignLoading ? (
            <View style={a.loadingWrap}><ActivityIndicator color={COLORS.primary} /></View>
          ) : (
            <ScrollView style={a.storeScroll} showsVerticalScrollIndicator={false}>
              {stores.map((store, idx) => {
                const checked = localSelected.has(store.id);
                return (
                  <TouchableOpacity
                    key={store.id}
                    style={[a.storeRow, idx < stores.length - 1 && a.storeRowBorder, checked && a.storeRowChecked]}
                    onPress={() => toggleStore(store.id)}
                    activeOpacity={0.65}
                  >
                    <View style={[a.checkbox, checked && a.checkboxOn]}>
                      {checked && <Text style={a.checkMark}>✓</Text>}
                    </View>
                    <Text style={[a.storeName, checked && a.storeNameOn]}>{store.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 12 }} />
            </ScrollView>
          )}

          <View style={a.footer}>
            <TouchableOpacity style={[a.saveBtn, (!hasChanges || saving) && a.saveBtnDim]}
              onPress={handleSave} disabled={!hasChanges || saving} activeOpacity={0.85}>
              {saving
                ? <ActivityIndicator color="#fff" />
                : <Text style={a.saveBtnText}>
                    {hasChanges ? `Save · ${localSelected.size} store${localSelected.size !== 1 ? 's' : ''}` : 'No changes'}
                  </Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AdminHotFood() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  // View state
  const [mainView,  setMainView]  = useState<MainView>('orders');
  const [orderTab,  setOrderTab]  = useState<OrderTab>('PENDING');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Catalog state
  const [search,        setSearch]        = useState('');
  const [selectedItem,  setSelectedItem]  = useState<CatalogItem | null>(null);
  const [showAssign,    setShowAssign]    = useState(false);
  const [showAddEdit,   setShowAddEdit]   = useState(false);
  const [editingItem,   setEditingItem]   = useState<CatalogItem | null>(null);

  // Stores (shared between catalog and assign sheet)
  const { data: storesData } = useQuery({
    queryKey: ['manager-accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60_000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];
  const storeId = user?.storeIds?.[0] ?? stores[0]?.id ?? '';

  // Orders query
  const { data: ordersData, isLoading: ordersLoading, isRefetching, refetch } = useQuery({
    queryKey: ['hot-food-orders-mgr', storeId],
    queryFn: () => hotFoodApi.getStoreOrders(storeId),
    enabled: !!storeId && mainView === 'orders',
    refetchInterval: 20_000,
  });
  const allOrders: FoodOrder[] = ordersData?.data?.data ?? [];

  const filteredOrders = useMemo(() => {
    if (orderTab === 'ALL') return allOrders;
    return allOrders.filter(o => o.status === orderTab);
  }, [allOrders, orderTab]);

  const orderCounts = useMemo(() => ({
    PENDING:  allOrders.filter(o => o.status === 'PENDING').length,
    ACCEPTED: allOrders.filter(o => o.status === 'ACCEPTED').length,
    READY:    allOrders.filter(o => o.status === 'READY').length,
    ALL:      allOrders.length,
  }), [allOrders]);

  const pendingCount = orderCounts.PENDING;

  // Catalog query
  const { data: catalogData, isLoading: catalogLoading, refetch: refetchCatalog, isRefetching: isCatalogRefetching } = useQuery({
    queryKey: ['hot-food-catalog'],
    queryFn: hotFoodCatalogApi.getAll,
    enabled: mainView === 'catalog',
    staleTime: 2 * 60_000,
  });
  const catalogItems: CatalogItem[] = catalogData?.data?.data ?? [];

  const filteredCatalog = useMemo(() => {
    if (!search.trim()) return catalogItems;
    const q = search.trim().toLowerCase();
    return catalogItems.filter(i => i.name.toLowerCase().includes(q));
  }, [catalogItems, search]);

  // Order handlers
  async function handleUpdateStatus(orderId: string, status: OrderStatus) {
    if (updatingId) return;
    setUpdatingId(orderId);
    try {
      await hotFoodApi.updateStatus(orderId, status);
      qc.invalidateQueries({ queryKey: ['hot-food-orders-mgr'] });
      qc.invalidateQueries({ queryKey: ['hot-food-pending-count'] });
    } catch {
      Toast.show({ type: 'error', text1: 'Could not update order status.' });
    } finally {
      setUpdatingId(null);
    }
  }

  // Catalog handlers
  function openItem(item: CatalogItem) { setSelectedItem(item); setShowAssign(true); }
  function openAdd()                   { setEditingItem(null); setShowAddEdit(true); }
  function openEdit(item: CatalogItem) {
    setShowAssign(false);
    setTimeout(() => { setEditingItem(item); setShowAddEdit(true); }, 350);
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <FlameIcon size={20} color="#fff" strokeWidth={2} />
          </View>
          <View>
            <Text style={s.headerTitle}>Hot Food</Text>
            {mainView === 'orders' && pendingCount > 0
              ? <Text style={s.headerSub}>{pendingCount} pending · needs attention</Text>
              : mainView === 'catalog'
              ? <Text style={s.headerSub}>{catalogItems.length} items in catalog</Text>
              : null}
          </View>
        </View>

        {/* Main view toggle */}
        <View style={s.viewToggle}>
          <TouchableOpacity
            style={[s.toggleBtn, mainView === 'orders' && s.toggleBtnActive]}
            onPress={() => setMainView('orders')} activeOpacity={0.75}
          >
            <Text style={[s.toggleBtnText, mainView === 'orders' && s.toggleBtnTextActive]}>Orders</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.toggleBtn, mainView === 'catalog' && s.toggleBtnActive]}
            onPress={() => setMainView('catalog')} activeOpacity={0.75}
          >
            <Text style={[s.toggleBtnText, mainView === 'catalog' && s.toggleBtnTextActive]}>Catalog</Text>
          </TouchableOpacity>
        </View>

        {mainView === 'catalog' && (
          <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.85}>
            <PlusIcon size={17} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Orders view ── */}
      {mainView === 'orders' && (
        <>
          {/* Order sub-tabs */}
          <View style={s.tabs}>
            {ORDER_TABS.map(tab => {
              const active = orderTab === tab.key;
              const count  = orderCounts[tab.key];
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[s.tab, active && s.tabActive]}
                  onPress={() => setOrderTab(tab.key)}
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

          {ordersLoading ? (
            <View style={s.centerState}><ActivityIndicator size="large" color={COLORS.primary} /></View>
          ) : (
            <FlatList
              data={filteredOrders}
              keyExtractor={item => item.id}
              contentContainerStyle={filteredOrders.length === 0 ? s.emptyList : s.list}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
              renderItem={({ item }) => (
                <OrderCard order={item} onUpdateStatus={handleUpdateStatus} updating={updatingId === item.id} />
              )}
              ListEmptyComponent={
                <View style={s.centerState}>
                  <InboxIcon size={48} color="#D1D5DB" />
                  <Text style={s.emptyText}>No {orderTab === 'ALL' ? '' : orderTab.toLowerCase() + ' '}orders right now</Text>
                </View>
              }
            />
          )}
        </>
      )}

      {/* ── Catalog view ── */}
      {mainView === 'catalog' && (
        <>
          <View style={s.searchWrap}>
            <TextInput
              style={s.searchInput}
              placeholder="Search catalog..."
              placeholderTextColor={COLORS.textMuted}
              value={search}
              onChangeText={setSearch}
              clearButtonMode="while-editing"
              returnKeyType="search"
            />
          </View>

          {catalogLoading ? (
            <View style={s.centerState}><ActivityIndicator size="large" color={COLORS.primary} /></View>
          ) : filteredCatalog.length === 0 ? (
            <View style={s.centerState}>
              <InboxIcon size={52} color="#D1D5DB" />
              <Text style={s.emptyText}>{search.trim() ? 'No items match your search' : 'No items in catalog yet'}</Text>
              {!search.trim() && <Text style={s.emptyHint}>Tap + to add your first item</Text>}
            </View>
          ) : (
            <FlatList
              data={filteredCatalog}
              keyExtractor={item => item.id}
              numColumns={2}
              columnWrapperStyle={s.gridRow}
              contentContainerStyle={s.gridContent}
              showsVerticalScrollIndicator={false}
              onRefresh={refetchCatalog}
              refreshing={isCatalogRefetching}
              renderItem={({ item }) => (
                <CatalogTile item={item} onPress={() => openItem(item)} />
              )}
            />
          )}
        </>
      )}

      {/* ── Modals ── */}
      <AssignSheet
        visible={showAssign}
        item={selectedItem}
        stores={stores}
        onClose={() => setShowAssign(false)}
        onEdit={() => selectedItem && openEdit(selectedItem)}
      />
      <AddEditModal
        visible={showAddEdit}
        editingItem={editingItem}
        onClose={() => setShowAddEdit(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.secondary, paddingHorizontal: 16, paddingVertical: 14,
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerIcon:  { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },

  viewToggle:      { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 10, padding: 3 },
  toggleBtn:       { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleBtnText:       { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  toggleBtnTextActive: { color: COLORS.secondary },

  addBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },

  // Order tabs
  tabs: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#F1F5F9', flexWrap: 'wrap',
  },
  tab:           { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F1F5F9' },
  tabActive:     { backgroundColor: COLORS.primary },
  tabText:       { fontSize: 12, fontWeight: '600', color: '#64748B' },
  tabTextActive: { color: '#fff' },
  tabBadge:          { backgroundColor: '#E2E8F0', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
  tabBadgeActive:    { backgroundColor: 'rgba(255,255,255,0.25)' },
  tabBadgeText:      { fontSize: 11, fontWeight: '700', color: '#64748B' },
  tabBadgeTextActive:{ color: '#fff' },

  // Lists
  list:       { padding: 16, gap: 12 },
  emptyList:  { flex: 1 },
  centerState:{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyText:  { fontSize: 14, color: '#94A3B8', textAlign: 'center', lineHeight: 20 },
  emptyHint:  { fontSize: 13, color: '#CBD5E1', textAlign: 'center' },

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
  actionBtn:      { borderRadius: 12, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnDisabled:    { opacity: 0.6 },
  actionBtnText:  { color: '#fff', fontSize: 14, fontWeight: '700' },
  readyRow:       { flexDirection: 'row', gap: 10 },
  cancelBtn:      { width: 46, height: 46, borderRadius: 12, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center' },
  doneBadge:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingTop: 10 },
  doneText:       { fontSize: 13, fontWeight: '600' },

  // Catalog search
  searchWrap:  { backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  searchInput: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: '#0F172A' },

  // Catalog grid
  gridContent:      { padding: TILE_MARGIN, paddingBottom: 40 },
  gridRow:          { gap: TILE_GAP, marginBottom: TILE_GAP },
  tile:             { width: TILE_WIDTH, borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  tileImage:        { width: TILE_WIDTH, height: TILE_WIDTH },
  tilePlaceholder:  { width: TILE_WIDTH, height: TILE_WIDTH, alignItems: 'center', justifyContent: 'center' },
  tilePlaceholderText: { fontSize: 44, fontWeight: '900', color: 'rgba(0,0,0,0.15)' },
  tileInfo:         { padding: 10 },
  tileName:         { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 6, lineHeight: 17 },
  tileBottom:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tilePrice:        { fontSize: 13, fontWeight: '700', color: '#EA580C' },
  tileBadge:        { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  tileBadgeNone:    { backgroundColor: '#F1F5F9' },
  tileBadgeText:    { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  tileBadgeTextNone:{ color: '#94A3B8' },
});

// ─── Add/Edit modal styles ────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet:    { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '93%' },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  header:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  title:    { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  body:     { paddingHorizontal: 20, paddingTop: 20 },
  imagePicker:       { alignSelf: 'center', width: 160, height: 160, borderRadius: 20, overflow: 'hidden', marginBottom: 24, backgroundColor: '#F8FAFC', borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed' },
  imagePreview:      { width: '100%', height: '100%' },
  imagePlaceholder:  { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  imagePlaceholderLabel: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  imagePlaceholderHint:  { fontSize: 11, color: '#CBD5E1', textAlign: 'center' },
  cameraBadge:  { position: 'absolute', bottom: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center' },
  label:    { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input:    { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, padding: 13, fontSize: 15, color: '#0F172A', backgroundColor: '#FAFAFA', marginBottom: 14 },
  textArea: { minHeight: 72, textAlignVertical: 'top' },
  row:      { flexDirection: 'row', gap: 12 },
  halfField:{ flex: 1 },
  footer:   { paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  saveBtn:     { backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ─── Assign sheet styles ──────────────────────────────────────────────────────

const a = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet:    { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '85%' },
  handle:   { width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  itemRow:       { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  thumb:          { width: 68, height: 68, borderRadius: 14 },
  thumbPlaceholder:{ width: 68, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbInitial:   { fontSize: 24, fontWeight: '900', color: 'rgba(0,0,0,0.2)' },
  itemInfo:       { flex: 1 },
  itemName:       { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 3 },
  itemDesc:       { fontSize: 12, color: '#94A3B8', lineHeight: 16, marginBottom: 4 },
  itemMeta:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemPrice:      { fontSize: 14, fontWeight: '700', color: '#EA580C' },
  itemEst:        { flexDirection: 'row', alignItems: 'center', gap: 3 },
  itemEstText:    { fontSize: 12, color: '#94A3B8' },
  actionBtns:     { gap: 8 },
  iconBtn:        { width: 32, height: 32, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  iconBtnDanger:  { backgroundColor: '#FEF2F2' },
  sectionHead:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  sectionTitle:  { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6 },
  bulkRow:       { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulkBtn:       { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  bulkBtnOn:     { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  bulkBtnText:   { fontSize: 12, fontWeight: '700', color: '#64748B' },
  bulkBtnTextOn: { color: '#fff' },
  sectionCount:  { fontSize: 13, fontWeight: '700', color: COLORS.secondary, minWidth: 40, textAlign: 'right' },
  loadingWrap:   { paddingVertical: 40, alignItems: 'center' },
  storeScroll:     { flex: 1 },
  storeRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13 },
  storeRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  storeRowChecked: { backgroundColor: '#F0FDF4' },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxOn:      { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkMark:       { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 },
  storeName:       { flex: 1, fontSize: 15, fontWeight: '500', color: '#374151' },
  storeNameOn:     { fontWeight: '700', color: '#0F172A' },
  footer:      { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  saveBtn:     { backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  saveBtnDim:  { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
