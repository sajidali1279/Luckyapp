import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, Modal, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { orderListApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  PackageIcon, PlusIcon, EditIcon, Trash2Icon, XIcon,
  AlertTriangleIcon, CheckCircleIcon, ClipboardIcon,
} from '../../components/Icons';

// ─── Types ───────────────────────────────────────────────────────────────────
type Priority = 'URGENT' | 'NORMAL' | 'LOW';
type Status   = 'PENDING' | 'PRINTED' | 'ORDERED' | 'RECEIVED' | 'REMOVED';

interface OrderItem {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  notes?: string;
  priority: Priority;
  status: Status;
  sortOrder: number;
  createdAt: string;
  addedById: string;
  addedBy: { id: string; name: string; role: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; text: string; border: string }> = {
  URGENT: { label: 'Urgent',  bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
  NORMAL: { label: 'Normal',  bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' },
  LOW:    { label: 'Low',     bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
};

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string }> = {
  PENDING:  { label: 'Pending',  bg: '#FEF3C7', text: '#D97706' },
  PRINTED:  { label: 'Printed',  bg: '#EEF2FF', text: '#6366F1' },
  ORDERED:  { label: 'Ordered',  bg: '#D1FAE5', text: '#059669' },
  RECEIVED: { label: 'Received', bg: '#D1FAE5', text: '#047857' },
  REMOVED:  { label: 'Removed',  bg: '#F3F4F6', text: '#9CA3AF' },
};

const CATEGORIES = [
  '', 'Groceries', 'Frozen Foods', 'Fresh Foods', 'Hot Foods',
  'Gas', 'Diesel', 'Tobacco/Vapes', 'Supplies', 'Other',
];

const PRIORITIES: Priority[] = ['URGENT', 'NORMAL', 'LOW'];
const VISIBLE_STATUSES: Status[] = ['PENDING', 'PRINTED', 'ORDERED', 'RECEIVED'];

// ─── Item Form Modal ──────────────────────────────────────────────────────────
interface ItemFormProps {
  visible: boolean;
  title: string;
  initialValues?: { name: string; quantity: string; category: string; notes: string; priority: Priority };
  loading: boolean;
  onSubmit: (data: { name: string; quantity: string; category: string; notes: string; priority: Priority }) => void;
  onClose: () => void;
}

function ItemFormModal({ visible, title, initialValues, loading, onSubmit, onClose }: ItemFormProps) {
  const [name,     setName]     = useState(initialValues?.name     || '');
  const [quantity, setQuantity] = useState(initialValues?.quantity || '');
  const [category, setCategory] = useState(initialValues?.category || '');
  const [notes,    setNotes]    = useState(initialValues?.notes    || '');
  const [priority, setPriority] = useState<Priority>(initialValues?.priority || 'NORMAL');

  // Reset when modal opens with new data
  React.useEffect(() => {
    if (visible) {
      setName(initialValues?.name || '');
      setQuantity(initialValues?.quantity || '');
      setCategory(initialValues?.category || '');
      setNotes(initialValues?.notes || '');
      setPriority(initialValues?.priority || 'NORMAL');
    }
  }, [visible, initialValues?.name]);

  const handleSubmit = () => {
    if (!name.trim()) {
      Toast.show({ type: 'error', text1: 'Item name is required' });
      return;
    }
    onSubmit({ name: name.trim(), quantity: quantity.trim(), category: category.trim(), notes: notes.trim(), priority });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalSheet}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Priority */}
            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map(p => {
                const cfg = PRIORITY_CONFIG[p];
                const selected = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[
                      styles.priorityChip,
                      { borderColor: cfg.border },
                      selected && { backgroundColor: cfg.bg, borderColor: cfg.text },
                    ]}
                  >
                    {p === 'URGENT' && <AlertTriangleIcon size={13} color={selected ? cfg.text : '#9CA3AF'} strokeWidth={2} />}
                    <Text style={[styles.priorityChipText, { color: selected ? cfg.text : '#9CA3AF' }]}>
                      {cfg.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Name */}
            <Text style={styles.fieldLabel}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Whole Milk 2%"
              placeholderTextColor={COLORS.textMuted}
              maxLength={120}
              returnKeyType="next"
            />

            {/* Quantity */}
            <Text style={styles.fieldLabel}>Quantity / Amount</Text>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={setQuantity}
              placeholder="e.g. 4 gallons, 2 cases"
              placeholderTextColor={COLORS.textMuted}
              maxLength={60}
              returnKeyType="next"
            />

            {/* Category */}
            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {CATEGORIES.map(c => (
                <TouchableOpacity
                  key={c || '__none__'}
                  onPress={() => setCategory(c)}
                  style={[
                    styles.categoryChip,
                    category === c && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
                  ]}
                >
                  <Text style={[styles.categoryChipText, category === c && { color: '#fff' }]}>
                    {c || 'None'}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Notes */}
            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any specific details..."
              placeholderTextColor={COLORS.textMuted}
              maxLength={300}
              multiline
              numberOfLines={3}
            />

            {/* Submit */}
            <TouchableOpacity
              style={[styles.submitBtn, loading && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={styles.submitBtnText}>{title}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────
interface ItemCardProps {
  item: OrderItem;
  isOwn: boolean;
  onEdit: (item: OrderItem) => void;
  onDelete: (item: OrderItem) => void;
}

function ItemCard({ item, isOwn, onEdit, onDelete }: ItemCardProps) {
  const pc = PRIORITY_CONFIG[item.priority];
  const sc = STATUS_CONFIG[item.status];
  const canEdit = isOwn && item.status === 'PENDING';

  return (
    <View style={[styles.itemCard, item.priority === 'URGENT' && styles.urgentCard]}>
      {/* Priority indicator line */}
      <View style={[styles.priorityBar, { backgroundColor: pc.text }]} />

      <View style={styles.itemBody}>
        {/* Top row: priority + status badges */}
        <View style={styles.itemBadgeRow}>
          <View style={[styles.badge, { backgroundColor: pc.bg, borderColor: pc.border }]}>
            {item.priority === 'URGENT' && (
              <AlertTriangleIcon size={11} color={pc.text} strokeWidth={2.5} />
            )}
            <Text style={[styles.badgeText, { color: pc.text }]}>{pc.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            {item.status === 'RECEIVED' && <CheckCircleIcon size={11} color={sc.text} strokeWidth={2.5} />}
            <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
          </View>
          <View style={{ flex: 1 }} />
          {/* Actions for own PENDING items */}
          {canEdit && (
            <View style={styles.itemActions}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(item)}>
                <EditIcon size={15} color={COLORS.secondary} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => onDelete(item)}>
                <Trash2Icon size={15} color={COLORS.primary} strokeWidth={2} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Name */}
        <Text style={styles.itemName}>{item.name}</Text>

        {/* Meta row */}
        <View style={styles.itemMeta}>
          {item.quantity  && <Text style={styles.metaChip}>📦 {item.quantity}</Text>}
          {item.category  && <Text style={styles.metaChip}>🏷 {item.category}</Text>}
        </View>

        {/* Notes */}
        {item.notes && <Text style={styles.itemNotes}>{item.notes}</Text>}

        {/* Footer */}
        <Text style={styles.itemFooter}>
          Added by {isOwn ? 'you' : item.addedBy?.name}
          {item.status === 'RECEIVED' ? ' · ✓ Received' : ''}
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function EmployeeOrderListScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const storeId = user?.storeIds?.[0];
  const userId  = user?.id;

  const [activeTab, setActiveTab] = useState<'mine' | 'all'>('mine');
  const [showAdd,   setShowAdd]   = useState(false);
  const [editItem,  setEditItem]  = useState<OrderItem | null>(null);

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['order-list', storeId],
    queryFn: () => orderListApi.getStoreItems(storeId!),
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  const allItems: OrderItem[] = useMemo(() => {
    const raw: OrderItem[] = data?.data?.data || [];
    return raw.filter(i => VISIBLE_STATUSES.includes(i.status));
  }, [data]);

  const myItems   = useMemo(() => allItems.filter(i => i.addedById === userId), [allItems, userId]);
  const displayed = activeTab === 'mine' ? myItems : allItems;

  // Sort: URGENT first → NORMAL → LOW, then by sortOrder/createdAt
  const sorted = useMemo(() => {
    const order = { URGENT: 0, NORMAL: 1, LOW: 2 };
    return [...displayed].sort((a, b) => {
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  }, [displayed]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (d: Parameters<typeof orderListApi.addItem>[1]) =>
      orderListApi.addItem(storeId!, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', storeId] });
      Toast.show({ type: 'success', text1: 'Item added to order list' });
      setShowAdd(false);
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add item' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof orderListApi.updateItem>[1] }) =>
      orderListApi.updateItem(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', storeId] });
      Toast.show({ type: 'success', text1: 'Item updated' });
      setEditItem(null);
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update item' }),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => orderListApi.removeItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', storeId] });
      Toast.show({ type: 'success', text1: 'Item removed' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to remove item' }),
  });

  const handleDelete = (item: OrderItem) => {
    Alert.alert(
      'Remove Item',
      `Remove "${item.name}" from the order list?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(item.id) },
      ]
    );
  };

  if (!storeId) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.center}>
          <ClipboardIcon size={48} color={COLORS.border} strokeWidth={1.25} />
          <Text style={styles.emptyTitle}>No Store Assigned</Text>
          <Text style={styles.emptyText}>Contact your manager to be assigned to a store.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PackageIcon size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.headerTitle}>Order List</Text>
        </View>
        <Text style={styles.headerSub}>Your store's needs</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {(['mine', 'all'] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'mine' ? `My Items (${myItems.length})` : `All Items (${allItems.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.secondary} size="large" />
        </View>
      ) : sorted.length === 0 ? (
        <View style={styles.center}>
          <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
          <Text style={styles.emptyTitle}>
            {activeTab === 'mine' ? "You haven't added any items yet" : 'No items on the list'}
          </Text>
          <Text style={styles.emptyText}>
            Tap the + button to add what the store needs.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.secondary} />}
        >
          {sorted.map(item => (
            <ItemCard
              key={item.id}
              item={item}
              isOwn={item.addedById === userId}
              onEdit={setEditItem}
              onDelete={handleDelete}
            />
          ))}
        </ScrollView>
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => setShowAdd(true)}>
        <PlusIcon size={24} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>

      {/* Add Item Modal */}
      <ItemFormModal
        visible={showAdd}
        title="Add Item"
        loading={addMutation.isPending}
        onSubmit={(d) => addMutation.mutate(d)}
        onClose={() => setShowAdd(false)}
      />

      {/* Edit Item Modal */}
      {editItem && (
        <ItemFormModal
          visible={!!editItem}
          title="Edit Item"
          initialValues={{
            name:     editItem.name,
            quantity: editItem.quantity || '',
            category: editItem.category || '',
            notes:    editItem.notes    || '',
            priority: editItem.priority,
          }}
          loading={updateMutation.isPending}
          onSubmit={(d) => updateMutation.mutate({ id: editItem.id, data: d })}
          onClose={() => setEditItem(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.6)' },

  // Tabs
  tabs:          { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:           { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: COLORS.secondary },
  tabText:       { fontSize: 14, fontWeight: '500', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.secondary, fontWeight: '700' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },

  // Item Card
  itemCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  urgentCard: {
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  priorityBar: { width: 4 },
  itemBody:    { flex: 1, padding: 12, gap: 4 },

  itemBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  badgeText: { fontSize: 11, fontWeight: '600' },

  itemActions: { flexDirection: 'row', gap: 4 },
  actionBtn:   { padding: 6, borderRadius: 6, backgroundColor: '#F1F5F9' },
  deleteBtn:   { backgroundColor: '#FEF2F2' },

  itemName:  { fontSize: 15, fontWeight: '700', color: COLORS.text },
  itemMeta:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip:  { fontSize: 12, color: COLORS.textMuted },
  itemNotes: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  itemFooter: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  // Empty state
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    maxHeight: '92%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  modalTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.text },
  closeBtn:    { padding: 4 },

  fieldLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: COLORS.text,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },

  // Priority chips
  priorityRow: { flexDirection: 'row', gap: 8 },
  priorityChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  priorityChipText: { fontSize: 13, fontWeight: '600' },

  // Category chips
  categoryScroll: { marginBottom: 4 },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  categoryChipText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },

  // Submit
  submitBtn: {
    backgroundColor: COLORS.secondary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 20,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
