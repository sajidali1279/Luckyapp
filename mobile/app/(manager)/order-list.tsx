import React, { useState, useMemo, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, StatusBar, Modal, Alert,
  KeyboardAvoidingView, Platform, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { orderListApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  PackageIcon, PrinterIcon, CheckCircleIcon, ArrowUpIcon, ArrowDownIcon,
  AlertTriangleIcon, PlusIcon, EditIcon, Trash2Icon, XIcon, ClipboardIcon,
  ListIcon, RefreshIcon,
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

interface StoreSummary {
  storeId: string;
  storeName: string;
  pendingCount: number;
  urgentCount: number;
  printedCount: number;
  orderedCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; bg: string; text: string; border: string }> = {
  URGENT: { label: 'Urgent', bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
  NORMAL: { label: 'Normal', bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' },
  LOW:    { label: 'Low',    bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
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
type FilterStatus = 'ALL' | Status;
const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: 'ALL',      label: 'All'      },
  { key: 'PENDING',  label: 'Pending'  },
  { key: 'PRINTED',  label: 'Printed'  },
  { key: 'ORDERED',  label: 'Ordered'  },
  { key: 'RECEIVED', label: 'Received' },
];

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
          <View style={styles.sheetHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.fieldLabel}>Priority</Text>
            <View style={styles.priorityRow}>
              {PRIORITIES.map(p => {
                const cfg = PRIORITY_CONFIG[p];
                const selected = priority === p;
                return (
                  <TouchableOpacity
                    key={p}
                    onPress={() => setPriority(p)}
                    style={[styles.priorityChip, { borderColor: cfg.border }, selected && { backgroundColor: cfg.bg, borderColor: cfg.text }]}
                  >
                    {p === 'URGENT' && <AlertTriangleIcon size={13} color={selected ? cfg.text : '#9CA3AF'} strokeWidth={2} />}
                    <Text style={[styles.priorityChipText, { color: selected ? cfg.text : '#9CA3AF' }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Whole Milk 2%" placeholderTextColor={COLORS.textMuted} maxLength={120} />

            <Text style={styles.fieldLabel}>Quantity / Amount</Text>
            <TextInput style={styles.input} value={quantity} onChangeText={setQuantity} placeholder="e.g. 4 gallons, 2 cases" placeholderTextColor={COLORS.textMuted} maxLength={60} />

            <Text style={styles.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {CATEGORIES.map(c => (
                <TouchableOpacity key={c || '__none__'} onPress={() => setCategory(c)}
                  style={[styles.categoryChip, category === c && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}
                >
                  <Text style={[styles.categoryChipText, category === c && { color: '#fff' }]}>{c || 'None'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes}
              placeholder="Any specific details..." placeholderTextColor={COLORS.textMuted} maxLength={300} multiline numberOfLines={3}
            />

            <TouchableOpacity style={[styles.submitBtn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>{title}</Text>}
            </TouchableOpacity>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Print Success Modal ──────────────────────────────────────────────────────
function PrintSuccessModal({ visible, items, onShare, onClose }: {
  visible: boolean;
  items: OrderItem[];
  onShare: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalSheet, { borderRadius: 20, margin: 24 }]}>
          <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
            <View style={styles.successIcon}>
              <PrinterIcon size={32} color="#fff" strokeWidth={1.75} />
            </View>
            <Text style={styles.successTitle}>Order List Printed!</Text>
            <Text style={styles.successSub}>{items.length} item{items.length !== 1 ? 's' : ''} marked as printed</Text>
          </View>

          <ScrollView style={{ maxHeight: 240 }} showsVerticalScrollIndicator={false}>
            {items.map((item, idx) => (
              <View key={item.id} style={styles.printedItemRow}>
                <Text style={styles.printedItemNum}>{idx + 1}.</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.printedItemName}>{item.name}</Text>
                  {item.quantity && <Text style={styles.printedItemMeta}>{item.quantity}</Text>}
                </View>
                {item.priority === 'URGENT' && (
                  <AlertTriangleIcon size={14} color="#DC2626" strokeWidth={2.5} />
                )}
              </View>
            ))}
          </ScrollView>

          <View style={styles.successActions}>
            <TouchableOpacity style={styles.shareBtn} onPress={onShare}>
              <Text style={styles.shareBtnText}>Share List</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Item Card (Manager) ──────────────────────────────────────────────────────
interface ManagerItemCardProps {
  item: OrderItem;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onEdit: (item: OrderItem) => void;
  onDelete: (item: OrderItem) => void;
  onMarkOrdered: (item: OrderItem) => void;
  onMarkReceived: (item: OrderItem) => void;
}

function ManagerItemCard({
  item, isFirst, isLast, onMoveUp, onMoveDown, onEdit, onDelete, onMarkOrdered, onMarkReceived,
}: ManagerItemCardProps) {
  const pc = PRIORITY_CONFIG[item.priority];
  const sc = STATUS_CONFIG[item.status];

  return (
    <View style={[styles.itemCard, item.priority === 'URGENT' && styles.urgentCard]}>
      <View style={[styles.priorityBar, { backgroundColor: pc.text }]} />

      <View style={styles.itemBody}>
        {/* Badges row */}
        <View style={styles.itemBadgeRow}>
          <View style={[styles.badge, { backgroundColor: pc.bg, borderColor: pc.border }]}>
            {item.priority === 'URGENT' && <AlertTriangleIcon size={11} color={pc.text} strokeWidth={2.5} />}
            <Text style={[styles.badgeText, { color: pc.text }]}>{pc.label}</Text>
          </View>
          <View style={[styles.badge, { backgroundColor: sc.bg }]}>
            {item.status === 'RECEIVED' && <CheckCircleIcon size={11} color={sc.text} strokeWidth={2.5} />}
            <Text style={[styles.badgeText, { color: sc.text }]}>{sc.label}</Text>
          </View>
          <View style={{ flex: 1 }} />

          {/* Reorder arrows (only for PENDING) */}
          {item.status === 'PENDING' && (
            <View style={styles.reorderBtns}>
              <TouchableOpacity style={[styles.reorderBtn, isFirst && styles.reorderBtnDisabled]} onPress={onMoveUp} disabled={isFirst}>
                <ArrowUpIcon size={14} color={isFirst ? '#CBD5E1' : COLORS.secondary} strokeWidth={2.5} />
              </TouchableOpacity>
              <TouchableOpacity style={[styles.reorderBtn, isLast && styles.reorderBtnDisabled]} onPress={onMoveDown} disabled={isLast}>
                <ArrowDownIcon size={14} color={isLast ? '#CBD5E1' : COLORS.secondary} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Name */}
        <Text style={styles.itemName}>{item.name}</Text>

        {/* Meta */}
        <View style={styles.itemMeta}>
          {item.quantity  && <Text style={styles.metaChip}>📦 {item.quantity}</Text>}
          {item.category  && <Text style={styles.metaChip}>🏷 {item.category}</Text>}
        </View>
        {item.notes && <Text style={styles.itemNotes}>{item.notes}</Text>}

        <Text style={styles.itemFooter}>Added by {item.addedBy?.name}</Text>

        {/* Action row */}
        {(item.status === 'PENDING' || item.status === 'PRINTED' || item.status === 'ORDERED') && (
          <View style={styles.itemActionRow}>
            {item.status === 'PENDING' && (
              <>
                <TouchableOpacity style={styles.iconActionBtn} onPress={() => onEdit(item)}>
                  <EditIcon size={15} color={COLORS.secondary} strokeWidth={2} />
                  <Text style={[styles.iconActionText, { color: COLORS.secondary }]}>Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconActionBtn, styles.deleteActionBtn]} onPress={() => onDelete(item)}>
                  <Trash2Icon size={15} color={COLORS.primary} strokeWidth={2} />
                  <Text style={[styles.iconActionText, { color: COLORS.primary }]}>Remove</Text>
                </TouchableOpacity>
              </>
            )}
            {item.status === 'PRINTED' && (
              <TouchableOpacity style={[styles.statusActionBtn, { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' }]} onPress={() => onMarkOrdered(item)}>
                <CheckCircleIcon size={14} color="#059669" strokeWidth={2.5} />
                <Text style={[styles.statusActionText, { color: '#059669' }]}>Mark Ordered</Text>
              </TouchableOpacity>
            )}
            {item.status === 'ORDERED' && (
              <TouchableOpacity style={[styles.statusActionBtn, { backgroundColor: '#EEF2FF', borderColor: '#A5B4FC' }]} onPress={() => onMarkReceived(item)}>
                <CheckCircleIcon size={14} color="#6366F1" strokeWidth={2.5} />
                <Text style={[styles.statusActionText, { color: '#6366F1' }]}>Mark Received</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Print History Screen ─────────────────────────────────────────────────────
function PrintHistoryModal({ visible, storeId, storeName, onClose }: {
  visible: boolean; storeId: string; storeName: string; onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['print-history', storeId],
    queryFn: () => orderListApi.getPrintHistory(storeId),
    enabled: visible && !!storeId,
  });

  const jobs: any[] = data?.data?.data || [];

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={styles.historyHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <XIcon size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.historyTitle}>Print History</Text>
          <Text style={styles.historyStore}>{storeName}</Text>
        </View>
        {isLoading ? (
          <View style={styles.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
        ) : jobs.length === 0 ? (
          <View style={styles.center}>
            <PrinterIcon size={52} color={COLORS.border} strokeWidth={1.25} />
            <Text style={styles.emptyTitle}>No print jobs yet</Text>
          </View>
        ) : (
          <ScrollView style={{ padding: 16 }}>
            {jobs.map(job => (
              <View key={job.id} style={[styles.itemCard, { marginBottom: 12 }]}>
                <View style={[styles.priorityBar, { backgroundColor: COLORS.secondary }]} />
                <View style={{ flex: 1, padding: 12, gap: 4 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.text }}>
                      {job.itemCount} items
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                      {new Date(job.printedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Printed by {job.printedBy?.name}</Text>
                  {job.notes && <Text style={{ fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' }}>{job.notes}</Text>}
                  <View style={{ marginTop: 6, gap: 2 }}>
                    {job.items?.slice(0, 5).map((ji: any, idx: number) => (
                      <Text key={ji.id || idx} style={{ fontSize: 12, color: COLORS.text }}>
                        · {(ji.snapshot as any)?.name}
                        {(ji.snapshot as any)?.quantity ? ` (${(ji.snapshot as any).quantity})` : ''}
                      </Text>
                    ))}
                    {(job.items?.length || 0) > 5 && (
                      <Text style={{ fontSize: 12, color: COLORS.textMuted }}>
                        +{job.items.length - 5} more
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function ManagerOrderListScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [selectedStore, setSelectedStore] = useState<StoreSummary | null>(null);
  const [filterStatus,  setFilterStatus]  = useState<FilterStatus>('ALL');
  const [showAdd,        setShowAdd]       = useState(false);
  const [editItem,       setEditItem]      = useState<OrderItem | null>(null);
  const [showPrintSuccess, setShowPrintSuccess] = useState(false);
  const [printedItems,     setPrintedItems]     = useState<OrderItem[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // ── Summary (all stores) ─────────────────────────────────────────────────
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['order-list-summary'],
    queryFn: () => orderListApi.getSummary(),
    refetchInterval: 30000,
  });

  const stores: StoreSummary[] = summaryData?.data?.data || [];

  // Auto-select first store
  React.useEffect(() => {
    if (stores.length > 0 && !selectedStore) {
      setSelectedStore(stores[0]);
    }
  }, [stores]);

  // ── Store Items ──────────────────────────────────────────────────────────
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems, isRefetching } = useQuery({
    queryKey: ['order-list', selectedStore?.storeId],
    queryFn: () => orderListApi.getStoreItems(selectedStore!.storeId),
    enabled: !!selectedStore,
    refetchInterval: 30000,
  });

  const allItems: OrderItem[] = useMemo(() => itemsData?.data?.data || [], [itemsData]);

  const filtered = useMemo(() => {
    const items = filterStatus === 'ALL'
      ? allItems.filter(i => i.status !== 'REMOVED')
      : allItems.filter(i => i.status === filterStatus);

    const order = { URGENT: 0, NORMAL: 1, LOW: 2 };
    return [...items].sort((a, b) => {
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return a.sortOrder - b.sortOrder;
    });
  }, [allItems, filterStatus]);

  const pendingItems   = useMemo(() => allItems.filter(i => i.status === 'PENDING'),  [allItems]);
  const printedItems2  = useMemo(() => allItems.filter(i => i.status === 'PRINTED'),  [allItems]);
  const orderedItems   = useMemo(() => allItems.filter(i => i.status === 'ORDERED'),  [allItems]);

  // ── Reorder handler ──────────────────────────────────────────────────────
  const pendingSorted = useMemo(() => {
    const order = { URGENT: 0, NORMAL: 1, LOW: 2 };
    return [...pendingItems].sort((a, b) => {
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return a.sortOrder - b.sortOrder;
    });
  }, [pendingItems]);

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      orderListApi.reorderItems(selectedStore!.storeId, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] }),
  });

  const handleMoveUp = useCallback((item: OrderItem) => {
    const idx = pendingSorted.findIndex(i => i.id === item.id);
    if (idx === 0) return;
    const swapWith = pendingSorted[idx - 1];
    reorderMutation.mutate([
      { id: item.id,    sortOrder: swapWith.sortOrder },
      { id: swapWith.id, sortOrder: item.sortOrder },
    ]);
  }, [pendingSorted, reorderMutation]);

  const handleMoveDown = useCallback((item: OrderItem) => {
    const idx = pendingSorted.findIndex(i => i.id === item.id);
    if (idx === pendingSorted.length - 1) return;
    const swapWith = pendingSorted[idx + 1];
    reorderMutation.mutate([
      { id: item.id,    sortOrder: swapWith.sortOrder },
      { id: swapWith.id, sortOrder: item.sortOrder },
    ]);
  }, [pendingSorted, reorderMutation]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: (d: Parameters<typeof orderListApi.addItem>[1]) =>
      orderListApi.addItem(selectedStore!.storeId, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] });
      qc.invalidateQueries({ queryKey: ['order-list-summary'] });
      Toast.show({ type: 'success', text1: 'Item added' });
      setShowAdd(false);
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add item' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof orderListApi.updateItem>[1] }) =>
      orderListApi.updateItem(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] });
      Toast.show({ type: 'success', text1: 'Item updated' });
      setEditItem(null);
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update item' }),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => orderListApi.removeItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] });
      qc.invalidateQueries({ queryKey: ['order-list-summary'] });
      Toast.show({ type: 'success', text1: 'Item removed' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to remove item' }),
  });

  const printMutation = useMutation({
    mutationFn: () => orderListApi.printItems(selectedStore!.storeId),
    onSuccess: () => {
      setPrintedItems(pendingItems);
      setShowPrintSuccess(true);
      qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] });
      qc.invalidateQueries({ queryKey: ['order-list-summary'] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to print order list' }),
  });

  const markOrderedMutation = useMutation({
    mutationFn: (itemIds: string[]) => orderListApi.markOrdered(itemIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] });
      qc.invalidateQueries({ queryKey: ['order-list-summary'] });
      Toast.show({ type: 'success', text1: 'Marked as ordered!' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update status' }),
  });

  const markReceivedMutation = useMutation({
    mutationFn: (itemIds: string[]) => orderListApi.markReceived(itemIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list', selectedStore?.storeId] });
      Toast.show({ type: 'success', text1: 'Received ✓' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update status' }),
  });

  const handleDelete = (item: OrderItem) => {
    Alert.alert('Remove Item', `Remove "${item.name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(item.id) },
    ]);
  };

  const handlePrint = () => {
    if (pendingItems.length === 0) {
      Toast.show({ type: 'info', text1: 'No pending items to print' });
      return;
    }
    Alert.alert(
      `Print Order List`,
      `Mark ${pendingItems.length} pending item${pendingItems.length !== 1 ? 's' : ''} as printed for ${selectedStore?.storeName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Print', onPress: () => printMutation.mutate() },
      ]
    );
  };

  const handleShareList = async () => {
    const lines = printedItems.map((item, idx) => {
      let line = `${idx + 1}. ${item.name}`;
      if (item.quantity) line += ` — ${item.quantity}`;
      if (item.category) line += ` [${item.category}]`;
      if (item.priority === 'URGENT') line += ' ⚠️ URGENT';
      if (item.notes) line += `\n   Note: ${item.notes}`;
      return line;
    }).join('\n');

    const text = `Order List — ${selectedStore?.storeName}\n${new Date().toLocaleDateString()}\n\n${lines}`;
    await Share.share({ message: text, title: `Order List — ${selectedStore?.storeName}` });
  };

  // ── Selected store from summary (to get updated count) ──────────────────
  const currentStoreSummary = stores.find(s => s.storeId === selectedStore?.storeId);

  // Filter tabs with counts
  const tabCounts: Record<FilterStatus, number> = useMemo(() => ({
    ALL:      allItems.filter(i => i.status !== 'REMOVED').length,
    PENDING:  pendingItems.length,
    PRINTED:  printedItems2.length,
    ORDERED:  orderedItems.length,
    RECEIVED: allItems.filter(i => i.status === 'RECEIVED').length,
    REMOVED:  allItems.filter(i => i.status === 'REMOVED').length,
  }), [allItems, pendingItems, printedItems2, orderedItems]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <PackageIcon size={20} color="#fff" strokeWidth={2} />
          <Text style={styles.headerTitle}>Order List</Text>
        </View>
        {selectedStore && (
          <TouchableOpacity style={styles.historyBtn} onPress={() => setShowHistory(true)}>
            <ListIcon size={18} color="#fff" strokeWidth={2} />
            <Text style={styles.historyBtnText}>History</Text>
          </TouchableOpacity>
        )}
      </View>

      {summaryLoading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : (
        <>
          {/* Store Chips */}
          <View style={styles.storeChipsContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.storeChips}>
              {stores.map(store => {
                const isSelected = selectedStore?.storeId === store.storeId;
                const hasUrgent = store.urgentCount > 0;
                return (
                  <TouchableOpacity
                    key={store.storeId}
                    onPress={() => {
                      setSelectedStore(store);
                      setFilterStatus('ALL');
                    }}
                    style={[
                      styles.storeChip,
                      isSelected && styles.storeChipActive,
                      hasUrgent && !isSelected && styles.storeChipUrgent,
                    ]}
                  >
                    <Text style={[styles.storeChipName, isSelected && { color: '#fff' }]} numberOfLines={1}>
                      {store.storeName.replace('Lucky Stop ', '')}
                    </Text>
                    {store.pendingCount > 0 && (
                      <View style={[styles.chipBadge, hasUrgent && { backgroundColor: '#EF4444' }]}>
                        <Text style={styles.chipBadgeText}>
                          {store.urgentCount > 0 ? `${store.urgentCount}!` : store.pendingCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Summary Bar */}
          {currentStoreSummary && (
            <View style={styles.summaryBar}>
              <SummaryPill label="Pending" count={currentStoreSummary.pendingCount} color="#D97706" />
              <SummaryPill label="Printed" count={currentStoreSummary.printedCount} color="#6366F1" />
              <SummaryPill label="Ordered" count={currentStoreSummary.orderedCount} color="#059669" />
              {currentStoreSummary.urgentCount > 0 && (
                <SummaryPill label="Urgent!" count={currentStoreSummary.urgentCount} color="#DC2626" icon />
              )}
            </View>
          )}

          {/* Status Filter */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterBar} contentContainerStyle={styles.filterBarContent}>
            {FILTER_TABS.map(tab => (
              <TouchableOpacity
                key={tab.key}
                onPress={() => setFilterStatus(tab.key)}
                style={[styles.filterTab, filterStatus === tab.key && styles.filterTabActive]}
              >
                <Text style={[styles.filterTabText, filterStatus === tab.key && styles.filterTabTextActive]}>
                  {tab.label}
                  {tabCounts[tab.key] > 0 ? ` (${tabCounts[tab.key]})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Items List */}
          {!selectedStore ? (
            <View style={styles.center}>
              <PackageIcon size={48} color={COLORS.border} strokeWidth={1.25} />
              <Text style={styles.emptyTitle}>Select a store above</Text>
            </View>
          ) : itemsLoading ? (
            <View style={styles.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
          ) : filtered.length === 0 ? (
            <View style={styles.center}>
              <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
              <Text style={styles.emptyTitle}>
                {filterStatus === 'ALL' ? 'No items on the list' : `No ${filterStatus.toLowerCase()} items`}
              </Text>
              {filterStatus === 'ALL' && (
                <Text style={styles.emptyText}>Add items using the + button below</Text>
              )}
            </View>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetchItems(); refetchSummary(); }} tintColor={COLORS.secondary} />}
            >
              {filtered.map((item, idx) => {
                const pendingList = filtered.filter(i => i.status === 'PENDING');
                const pendingIdx  = pendingList.findIndex(i => i.id === item.id);
                return (
                  <ManagerItemCard
                    key={item.id}
                    item={item}
                    isFirst={pendingIdx === 0}
                    isLast={pendingIdx === pendingList.length - 1}
                    onMoveUp={() => handleMoveUp(item)}
                    onMoveDown={() => handleMoveDown(item)}
                    onEdit={setEditItem}
                    onDelete={handleDelete}
                    onMarkOrdered={(it) => markOrderedMutation.mutate([it.id])}
                    onMarkReceived={(it) => markReceivedMutation.mutate([it.id])}
                  />
                );
              })}
            </ScrollView>
          )}

          {/* Bottom Actions */}
          {selectedStore && (
            <View style={styles.bottomBar}>
              <TouchableOpacity style={styles.addItemBtn} onPress={() => setShowAdd(true)}>
                <PlusIcon size={18} color={COLORS.secondary} strokeWidth={2.5} />
                <Text style={styles.addItemBtnText}>Add Item</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.printBtn, pendingItems.length === 0 && styles.printBtnDisabled]}
                onPress={handlePrint}
                disabled={printMutation.isPending || pendingItems.length === 0}
              >
                {printMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <>
                      <PrinterIcon size={18} color="#fff" strokeWidth={2} />
                      <Text style={styles.printBtnText}>
                        Print Pending{pendingItems.length > 0 ? ` (${pendingItems.length})` : ''}
                      </Text>
                    </>
                }
              </TouchableOpacity>
            </View>
          )}
        </>
      )}

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
          initialValues={{ name: editItem.name, quantity: editItem.quantity || '', category: editItem.category || '', notes: editItem.notes || '', priority: editItem.priority }}
          loading={updateMutation.isPending}
          onSubmit={(d) => updateMutation.mutate({ id: editItem.id, data: d })}
          onClose={() => setEditItem(null)}
        />
      )}

      {/* Print Success Modal */}
      <PrintSuccessModal
        visible={showPrintSuccess}
        items={printedItems}
        onShare={handleShareList}
        onClose={() => setShowPrintSuccess(false)}
      />

      {/* Print History Modal */}
      {selectedStore && (
        <PrintHistoryModal
          visible={showHistory}
          storeId={selectedStore.storeId}
          storeName={selectedStore.storeName}
          onClose={() => setShowHistory(false)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Summary Pill ─────────────────────────────────────────────────────────────
function SummaryPill({ label, count, color, icon }: { label: string; count: number; color: string; icon?: boolean }) {
  return (
    <View style={[styles.summaryPill, { borderColor: color + '33' }]}>
      {icon && <AlertTriangleIcon size={12} color={color} strokeWidth={2.5} />}
      <Text style={[styles.summaryCount, { color }]}>{count}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

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
  historyBtn:  { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)' },
  historyBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  // Store chips
  storeChipsContainer: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  storeChips:          { paddingHorizontal: 16, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: '#fff',
  },
  storeChipActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  storeChipUrgent: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  storeChipName:   { fontSize: 13, fontWeight: '600', color: COLORS.text, maxWidth: 120 },
  chipBadge: {
    backgroundColor: '#F59E0B',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    minWidth: 20,
    alignItems: 'center',
  },
  chipBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },

  // Summary bar
  summaryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: '#FAFAFA',
  },
  summaryCount: { fontSize: 14, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },

  // Filter bar
  filterBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border, flexGrow: 0 },
  filterBarContent: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  filterTab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  filterTabActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  filterTabText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  filterTabTextActive: { color: '#fff' },

  // Scroll
  scroll:        { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 120 },

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
  urgentCard: { borderWidth: 1, borderColor: '#FECACA' },
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
  badgeText:   { fontSize: 11, fontWeight: '600' },
  reorderBtns: { flexDirection: 'row', gap: 2 },
  reorderBtn:  { padding: 6, borderRadius: 6, backgroundColor: '#EEF2FF' },
  reorderBtnDisabled: { backgroundColor: '#F9FAFB' },

  itemName:   { fontSize: 15, fontWeight: '700', color: COLORS.text },
  itemMeta:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaChip:   { fontSize: 12, color: COLORS.textMuted },
  itemNotes:  { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  itemFooter: { fontSize: 11, color: '#94A3B8', marginTop: 2 },

  itemActionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  iconActionBtn:  { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#EEF2FF' },
  deleteActionBtn: { backgroundColor: '#FEF2F2' },
  iconActionText:  { fontSize: 12, fontWeight: '600' },
  statusActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1 },
  statusActionText: { fontSize: 13, fontWeight: '600' },

  // Bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 10,
  },
  addItemBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: COLORS.secondary,
    backgroundColor: '#fff',
  },
  addItemBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  printBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: COLORS.secondary,
  },
  printBtnDisabled: { backgroundColor: '#94A3B8' },
  printBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Empty state
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

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

  priorityRow:      { flexDirection: 'row', gap: 8 },
  priorityChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
  priorityChipText: { fontSize: 13, fontWeight: '600' },

  categoryChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: '#fff' },
  categoryChipText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },

  submitBtn:     { backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Print success modal
  successIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text, marginBottom: 4 },
  successSub:   { fontSize: 14, color: COLORS.textMuted, marginBottom: 16 },

  printedItemRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: COLORS.border },
  printedItemNum:  { fontSize: 13, color: COLORS.textMuted, width: 20, textAlign: 'right' },
  printedItemName: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  printedItemMeta: { fontSize: 12, color: COLORS.textMuted },

  successActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  shareBtn:       { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: COLORS.secondary, alignItems: 'center' },
  shareBtnText:   { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  doneBtn:        { flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: COLORS.secondary, alignItems: 'center' },
  doneBtnText:    { fontSize: 14, fontWeight: '700', color: '#fff' },

  // History modal header
  historyHeader: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  historyTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },
  historyStore: { fontSize: 13, color: 'rgba(255,255,255,0.7)' },
});
