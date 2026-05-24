import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  RefreshControl, StatusBar, Modal, Alert, KeyboardAvoidingView,
  Platform, ActivityIndicator, Share, FlatList, SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { orderListApi, employeeRequestApi, orderCategoriesApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  PackageIcon, PrinterIcon, CheckCircleIcon, ArrowUpIcon, ArrowDownIcon,
  AlertTriangleIcon, PlusIcon, EditIcon, Trash2Icon, XIcon, ClipboardIcon,
  ListIcon, RefreshIcon, ChevronDownIcon, ChevronRightIcon,
} from '../../components/Icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type Priority = 'URGENT' | 'NORMAL' | 'LOW';
type ItemStatus = 'PENDING' | 'ORDERED' | 'RECEIVED' | 'REMOVED';
type RequestStatus = 'PENDING' | 'REVIEWED';

interface Store { id: string; name: string }

interface OrderListItem {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  notes?: string;
  priority: Priority;
  status: ItemStatus;
  source: 'MANAGER' | 'EMPLOYEE_REQUEST';
  sortOrder: number;
  addedById: string;
  addedBy: { id: string; name: string };
}

interface OrderList {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  items: OrderListItem[];
}

interface RequestLine {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  notes?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
}

interface EmployeeRequest {
  id: string;
  status: RequestStatus;
  note?: string;
  createdAt: string;
  submittedBy: { id: string; name: string };
  lines: RequestLine[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_CFG: Record<Priority, { label: string; bg: string; text: string; border: string }> = {
  URGENT: { label: 'Urgent', bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
  NORMAL: { label: 'Normal', bg: '#F3F4F6', text: '#4B5563', border: '#E5E7EB' },
  LOW:    { label: 'Low',    bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' },
};

const STATUS_CFG: Record<ItemStatus, { label: string; bg: string; text: string }> = {
  PENDING:  { label: 'Needed',   bg: '#FEF3C7', text: '#D97706' },
  ORDERED:  { label: 'Ordered',  bg: '#D1FAE5', text: '#059669' },
  RECEIVED: { label: 'Received', bg: '#DCFCE7', text: '#16A34A' },
  REMOVED:  { label: 'Removed',  bg: '#F3F4F6', text: '#9CA3AF' },
};

const REJECTION_REASONS = [
  { value: 'NO_SUPPLIER',  label: 'No supplier available' },
  { value: 'OUT_OF_BUDGET', label: 'Out of budget' },
  { value: 'IN_STOCK',     label: 'Already in stock' },
  { value: 'DUPLICATE',    label: 'Duplicate item' },
  { value: 'OTHER',        label: 'Other reason' },
];

function groupByCategory(items: OrderListItem[]) {
  const map = new Map<string, OrderListItem[]>();
  for (const item of items) {
    const key = item.category?.trim() || 'Uncategorized';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  // Sort within each group by priority then sortOrder
  const priorityOrder = { URGENT: 0, NORMAL: 1, LOW: 2 };
  map.forEach(arr => arr.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority])
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    return a.sortOrder - b.sortOrder;
  }));
  return Array.from(map.entries()).map(([title, data]) => ({ title, data }));
}

// ─── Add / Edit Item Bottom Sheet ─────────────────────────────────────────────

interface AddItemSheetProps {
  visible: boolean;
  listId: string;
  initialValues?: { id: string; name: string; quantity: string; category: string; notes: string; priority: Priority };
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

function AddItemSheet({ visible, listId, initialValues, categories, onClose, onSaved }: AddItemSheetProps) {
  const [name, setName]         = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes]       = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible && initialValues) {
      setName(initialValues.name);
      setQuantity(initialValues.quantity);
      setCategory(initialValues.category);
      setNotes(initialValues.notes);
      setPriority(initialValues.priority);
    } else if (visible) {
      setName(''); setQuantity(''); setCategory(''); setNotes(''); setPriority('NORMAL');
    }
    setSuggestions([]);
  }, [visible]);

  const addMutation = useMutation({
    mutationFn: (d: { name: string; quantity?: string; category?: string; notes?: string; priority: string }) =>
      orderListApi.addItem(listId, d),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Item added' }); onSaved(); },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add item' }),
  });

  const editMutation = useMutation({
    mutationFn: (d: { name?: string; quantity?: string; category?: string; notes?: string; priority?: string }) =>
      orderListApi.updateItem(initialValues!.id, d),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Item updated' }); onSaved(); },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update item' }),
  });

  const isEditing = !!initialValues;
  const isPending = addMutation.isPending || editMutation.isPending;

  const handleNameChange = (text: string) => {
    setName(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await orderListApi.getSuggestions(text.trim());
        setSuggestions((res.data?.data || []).map((s: { name: string }) => s.name).slice(0, 6));
      } catch { setSuggestions([]); }
    }, 280);
  };

  const handleSubmit = () => {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Item name is required' }); return; }
    const payload = {
      name: name.trim(),
      quantity: quantity.trim() || undefined,
      category: category.trim() || undefined,
      notes: notes.trim() || undefined,
      priority,
    };
    if (isEditing) editMutation.mutate(payload);
    else addMutation.mutate(payload);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>{isEditing ? 'Edit Item' : 'Add Item'}</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Priority */}
            <Text style={s.label}>Priority</Text>
            <View style={s.priorityRow}>
              {(['URGENT', 'NORMAL', 'LOW'] as Priority[]).map(p => {
                const cfg = PRIORITY_CFG[p];
                const sel = priority === p;
                return (
                  <TouchableOpacity key={p} onPress={() => setPriority(p)}
                    style={[s.priorityChip, { borderColor: cfg.border }, sel && { backgroundColor: cfg.bg, borderColor: cfg.text }]}>
                    {p === 'URGENT' && <AlertTriangleIcon size={13} color={sel ? cfg.text : '#9CA3AF'} strokeWidth={2} />}
                    <Text style={[s.priorityChipText, { color: sel ? cfg.text : '#9CA3AF' }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Name + suggestions */}
            <Text style={s.label}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput style={s.input} value={name} onChangeText={handleNameChange}
              placeholder="e.g. Whole Milk 2%" placeholderTextColor={COLORS.textMuted} maxLength={120} />
            {suggestions.length > 0 && (
              <View style={s.suggestionBox}>
                {suggestions.map(sg => (
                  <TouchableOpacity key={sg} style={s.suggestionRow} onPress={() => { setName(sg); setSuggestions([]); }}>
                    <ClipboardIcon size={13} color={COLORS.textMuted} />
                    <Text style={s.suggestionText}>{sg}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Quantity */}
            <Text style={s.label}>Quantity / Amount</Text>
            <TextInput style={s.input} value={quantity} onChangeText={setQuantity}
              placeholder="e.g. 4 gallons, 2 cases" placeholderTextColor={COLORS.textMuted} maxLength={60} />

            {/* Category */}
            <Text style={s.label}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {['', ...categories].map(c => (
                <TouchableOpacity key={c || '__none__'} onPress={() => setCategory(c)}
                  style={[s.catChip, category === c && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}>
                  <Text style={[s.catChipText, category === c && { color: '#fff' }]}>{c || 'None'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Notes */}
            <Text style={s.label}>Notes</Text>
            <TextInput style={[s.input, s.textArea]} value={notes} onChangeText={setNotes}
              placeholder="Any specific details..." placeholderTextColor={COLORS.textMuted} maxLength={300} multiline numberOfLines={3} />

            <TouchableOpacity style={[s.submitBtn, isPending && { opacity: 0.6 }]} onPress={handleSubmit} disabled={isPending}>
              {isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>{isEditing ? 'Save Changes' : 'Add to List'}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Item Card ────────────────────────────────────────────────────────────────

interface ItemCardProps {
  item: OrderListItem;
  onEdit: (item: OrderListItem) => void;
  onRemove: (item: OrderListItem) => void;
  onMarkOrdered: (item: OrderListItem) => void;
  onMarkReceived: (item: OrderListItem) => void;
}

function ItemCard({ item, onEdit, onRemove, onMarkOrdered, onMarkReceived }: ItemCardProps) {
  const pc = PRIORITY_CFG[item.priority];
  const sc = STATUS_CFG[item.status];

  return (
    <View style={[s.itemCard, item.priority === 'URGENT' && s.urgentCard]}>
      <View style={[s.priorityBar, { backgroundColor: pc.text }]} />
      <View style={s.itemBody}>
        <View style={s.itemBadgeRow}>
          <View style={[s.badge, { backgroundColor: pc.bg, borderColor: pc.border }]}>
            {item.priority === 'URGENT' && <AlertTriangleIcon size={11} color={pc.text} strokeWidth={2.5} />}
            <Text style={[s.badgeText, { color: pc.text }]}>{pc.label}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: sc.bg }]}>
            <Text style={[s.badgeText, { color: sc.text }]}>{sc.label}</Text>
          </View>
          {item.source === 'EMPLOYEE_REQUEST' && (
            <View style={[s.badge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <Text style={[s.badgeText, { color: '#16A34A' }]}>Request</Text>
            </View>
          )}
        </View>

        <Text style={s.itemName}>{item.name}</Text>
        <View style={s.itemMeta}>
          {item.quantity && <Text style={s.metaText}>Qty: {item.quantity}</Text>}
        </View>
        {item.notes && <Text style={s.itemNotes}>{item.notes}</Text>}
        <Text style={s.itemBy}>Added by {item.addedBy?.name}</Text>

        {item.status === 'PENDING' && (
          <View style={s.itemActions}>
            <TouchableOpacity style={s.actionBtn} onPress={() => onEdit(item)}>
              <EditIcon size={14} color={COLORS.secondary} strokeWidth={2} />
              <Text style={[s.actionBtnText, { color: COLORS.secondary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.actionBtnDanger]} onPress={() => onRemove(item)}>
              <Trash2Icon size={14} color={COLORS.primary} strokeWidth={2} />
              <Text style={[s.actionBtnText, { color: COLORS.primary }]}>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.actionBtn, s.actionBtnGreen]} onPress={() => onMarkOrdered(item)}>
              <CheckCircleIcon size={14} color="#059669" strokeWidth={2} />
              <Text style={[s.actionBtnText, { color: '#059669' }]}>Ordered</Text>
            </TouchableOpacity>
          </View>
        )}
        {item.status === 'ORDERED' && (
          <TouchableOpacity style={[s.actionBtn, s.actionBtnPurple, { marginTop: 8, alignSelf: 'flex-start' }]} onPress={() => onMarkReceived(item)}>
            <CheckCircleIcon size={14} color="#7C3AED" strokeWidth={2} />
            <Text style={[s.actionBtnText, { color: '#7C3AED' }]}>Mark Received</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Employee Request Review Modal ────────────────────────────────────────────

interface ReviewModalProps {
  visible: boolean;
  storeId: string;
  activeListId: string | null;
  onClose: () => void;
  onReviewed: () => void;
}

function ReviewModal({ visible, storeId, activeListId, onClose, onReviewed }: ReviewModalProps) {
  const qc = useQueryClient();

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['employee-requests', storeId, 'PENDING'],
    queryFn: () => employeeRequestApi.forStore(storeId, 'PENDING'),
    enabled: visible && !!storeId,
  });

  const requests: EmployeeRequest[] = requestsData?.data?.data || [];

  // Per-line state: { [lineId]: { action: 'ACCEPT'|'REJECT'|null, reason: string, note: string } }
  const [lineState, setLineState] = useState<Record<string, {
    action: 'ACCEPT' | 'REJECT' | null;
    reason: string;
    note: string;
  }>>({});

  const [expandedReq, setExpandedReq] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setLineState({});
      if (requests.length > 0) setExpandedReq(requests[0].id);
    }
  }, [visible]);

  useEffect(() => {
    if (requests.length > 0 && !expandedReq) setExpandedReq(requests[0].id);
  }, [requests]);

  const reviewMutation = useMutation({
    mutationFn: ({ requestId, lines }: {
      requestId: string;
      lines: { id: string; action: 'ACCEPT' | 'REJECT'; rejectionReason?: string; rejectionNote?: string }[];
    }) => employeeRequestApi.review(requestId, { listId: activeListId!, lines }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employee-requests', storeId] });
      qc.invalidateQueries({ queryKey: ['order-list-active', storeId] });
      Toast.show({ type: 'success', text1: 'Request reviewed' });
      onReviewed();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to submit review' }),
  });

  const setLine = (lineId: string, field: 'action' | 'reason' | 'note', value: string) => {
    setLineState(prev => ({
      ...prev,
      [lineId]: { action: null, reason: 'OTHER', note: '', ...prev[lineId], [field]: value },
    }));
  };

  const handleSubmitReview = (req: EmployeeRequest) => {
    if (!activeListId) {
      Toast.show({ type: 'error', text1: 'Open a list first before accepting items' });
      return;
    }
    const lines = req.lines.filter(l => l.status === 'PENDING').map(l => {
      const st = lineState[l.id];
      if (!st?.action) return null;
      return {
        id: l.id,
        action: st.action,
        ...(st.action === 'REJECT' ? { rejectionReason: st.reason || 'OTHER', rejectionNote: st.note || undefined } : {}),
      };
    }).filter(Boolean) as { id: string; action: 'ACCEPT' | 'REJECT'; rejectionReason?: string; rejectionNote?: string }[];

    if (lines.length === 0) {
      Toast.show({ type: 'info', text1: 'Select Accept or Reject for at least one item' });
      return;
    }
    reviewMutation.mutate({ requestId: req.id, lines });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={s.modalFullHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <XIcon size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.modalFullTitle}>Employee Requests</Text>
          <View style={{ width: 30 }} />
        </View>

        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
        ) : requests.length === 0 ? (
          <View style={s.center}>
            <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
            <Text style={s.emptyTitle}>No pending requests</Text>
          </View>
        ) : (
          <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {requests.map(req => (
              <View key={req.id} style={s.reqCard}>
                <TouchableOpacity style={s.reqCardHeader} onPress={() => setExpandedReq(expandedReq === req.id ? null : req.id)}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.reqCardName}>{req.submittedBy.name}</Text>
                    <Text style={s.reqCardMeta}>
                      {req.lines.length} item{req.lines.length !== 1 ? 's' : ''} · {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                    {req.note && <Text style={s.reqCardNote}>{req.note}</Text>}
                  </View>
                  <ChevronDownIcon size={18} color={COLORS.textMuted}
                    style={expandedReq === req.id ? { transform: [{ rotate: '180deg' }] } : {}} />
                </TouchableOpacity>

                {expandedReq === req.id && (
                  <View style={s.reqLines}>
                    {req.lines.filter(l => l.status === 'PENDING').map(line => {
                      const st = lineState[line.id] || { action: null, reason: 'OTHER', note: '' };
                      return (
                        <View key={line.id} style={s.reqLine}>
                          <Text style={s.reqLineName}>{line.name}</Text>
                          {line.quantity && <Text style={s.reqLineMeta}>Qty: {line.quantity}</Text>}
                          {line.category && <Text style={s.reqLineMeta}>Cat: {line.category}</Text>}
                          {line.notes && <Text style={s.reqLineNote}>{line.notes}</Text>}

                          <View style={s.actionRow}>
                            <TouchableOpacity
                              style={[s.acceptBtn, st.action === 'ACCEPT' && s.acceptBtnActive]}
                              onPress={() => setLine(line.id, 'action', 'ACCEPT')}>
                              <CheckCircleIcon size={14} color={st.action === 'ACCEPT' ? '#fff' : '#16A34A'} strokeWidth={2.5} />
                              <Text style={[s.acceptBtnText, st.action === 'ACCEPT' && { color: '#fff' }]}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.rejectBtn, st.action === 'REJECT' && s.rejectBtnActive]}
                              onPress={() => setLine(line.id, 'action', 'REJECT')}>
                              <XIcon size={14} color={st.action === 'REJECT' ? '#fff' : '#DC2626'} strokeWidth={2.5} />
                              <Text style={[s.rejectBtnText, st.action === 'REJECT' && { color: '#fff' }]}>Reject</Text>
                            </TouchableOpacity>
                          </View>

                          {st.action === 'REJECT' && (
                            <View style={s.rejectDetails}>
                              <Text style={s.label}>Reason</Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                                {REJECTION_REASONS.map(r => (
                                  <TouchableOpacity key={r.value} onPress={() => setLine(line.id, 'reason', r.value)}
                                    style={[s.reasonChip, st.reason === r.value && { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }]}>
                                    <Text style={[s.reasonChipText, st.reason === r.value && { color: '#DC2626' }]}>{r.label}</Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                              <TextInput style={s.input} value={st.note} onChangeText={v => setLine(line.id, 'note', v)}
                                placeholder="Additional note (optional)" placeholderTextColor={COLORS.textMuted} maxLength={300} />
                            </View>
                          )}
                        </View>
                      );
                    })}

                    <TouchableOpacity
                      style={[s.submitBtn, reviewMutation.isPending && { opacity: 0.6 }]}
                      onPress={() => handleSubmitReview(req)}
                      disabled={reviewMutation.isPending}>
                      {reviewMutation.isPending
                        ? <ActivityIndicator color="#fff" />
                        : <Text style={s.submitBtnText}>Submit Review</Text>
                      }
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ))}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── List History Modal ───────────────────────────────────────────────────────

function HistoryModal({ visible, storeId, storeName, activeListId, onClose, onRestored }: {
  visible: boolean; storeId: string; storeName: string; activeListId: string | null;
  onClose: () => void; onRestored: () => void;
}) {
  const qc = useQueryClient();
  const [expandedList, setExpandedList] = useState<string | null>(null);
  const [selected, setSelected]         = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['order-list-history', storeId],
    queryFn: () => orderListApi.getHistory(storeId),
    enabled: visible && !!storeId,
  });

  const lists: OrderList[] = data?.data?.data?.lists || [];

  const restoreMutation = useMutation({
    mutationFn: ({ closedListId, itemIds }: { closedListId: string; itemIds: string[] }) =>
      orderListApi.restoreItems(storeId, closedListId, itemIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list-active', storeId] });
      Toast.show({ type: 'success', text1: 'Items added to current list' });
      setSelected({});
      onRestored();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to restore items' }),
  });

  const handleRestore = (sourceListId: string) => {
    const ids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) { Toast.show({ type: 'info', text1: 'Select items to restore' }); return; }
    if (!activeListId) { Toast.show({ type: 'error', text1: 'Open a list first' }); return; }
    restoreMutation.mutate({ closedListId: sourceListId, itemIds: ids });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={s.modalFullHeader}>
          <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
            <XIcon size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.modalFullTitle}>Past Lists</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{storeName}</Text>
        </View>

        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
        ) : lists.length === 0 ? (
          <View style={s.center}>
            <ListIcon size={48} color={COLORS.border} strokeWidth={1.25} />
            <Text style={s.emptyTitle}>No closed lists yet</Text>
          </View>
        ) : (
          <ScrollView style={{ padding: 16 }}>
            {lists.map(list => {
              const isExpanded = expandedList === list.id;
              const undelivered = list.items.filter(i => i.status !== 'RECEIVED' && i.status !== 'REMOVED');
              return (
                <View key={list.id} style={s.reqCard}>
                  <TouchableOpacity style={s.reqCardHeader}
                    onPress={() => { setExpandedList(isExpanded ? null : list.id); setSelected({}); }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.reqCardName}>{list.name}</Text>
                      <Text style={s.reqCardMeta}>
                        {list.items.length} items · Closed {new Date(list.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </Text>
                      {undelivered.length > 0 && (
                        <Text style={{ fontSize: 12, color: '#D97706', marginTop: 2 }}>
                          {undelivered.length} item{undelivered.length !== 1 ? 's' : ''} not received
                        </Text>
                      )}
                    </View>
                    <ChevronDownIcon size={18} color={COLORS.textMuted}
                      style={isExpanded ? { transform: [{ rotate: '180deg' }] } : {}} />
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={{ padding: 12, gap: 8 }}>
                      <Text style={[s.label, { marginTop: 0 }]}>Select undelivered items to add to current list:</Text>
                      {undelivered.length === 0 ? (
                        <Text style={s.reqCardMeta}>All items were received.</Text>
                      ) : (
                        <>
                          {undelivered.map(item => (
                            <TouchableOpacity key={item.id}
                              style={[s.restoreItem, selected[item.id] && s.restoreItemSelected]}
                              onPress={() => setSelected(prev => ({ ...prev, [item.id]: !prev[item.id] }))}>
                              <View style={[s.restoreCheckbox, selected[item.id] && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}>
                                {selected[item.id] && <CheckCircleIcon size={14} color="#fff" strokeWidth={2.5} />}
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.text }}>{item.name}</Text>
                                {item.quantity && <Text style={{ fontSize: 12, color: COLORS.textMuted }}>{item.quantity}</Text>}
                              </View>
                            </TouchableOpacity>
                          ))}
                          <TouchableOpacity
                            style={[s.submitBtn, { marginTop: 8 }, restoreMutation.isPending && { opacity: 0.6 }]}
                            onPress={() => handleRestore(list.id)}
                            disabled={restoreMutation.isPending}>
                            {restoreMutation.isPending
                              ? <ActivityIndicator color="#fff" />
                              : <Text style={s.submitBtnText}>
                                  Add {Object.values(selected).filter(Boolean).length} Item{Object.values(selected).filter(Boolean).length !== 1 ? 's' : ''} to Current List
                                </Text>
                            }
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}
                </View>
              );
            })}
            <View style={{ height: 32 }} />
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Quick-Add Bar ────────────────────────────────────────────────────────────

interface QuickAddBarProps {
  listId: string;
  storeId: string;
}

function QuickAddBar({ listId, storeId }: QuickAddBarProps) {
  const qc = useQueryClient();
  const [name,     setName]     = useState('');
  const [qty,      setQty]      = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const nameRef = useRef<any>(null);

  const addMutation = useMutation({
    mutationFn: (d: object) => orderListApi.addItem(listId, d),
    onSuccess: () => {
      setName('');
      setQty('');
      qc.invalidateQueries({ queryKey: ['order-list-active', storeId] });
      setTimeout(() => nameRef.current?.focus(), 80);
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add item' }),
  });

  const cyclePriority = () =>
    setPriority(p => p === 'NORMAL' ? 'URGENT' : p === 'URGENT' ? 'LOW' : 'NORMAL');

  const handleAdd = () => {
    if (!name.trim()) return;
    addMutation.mutate({
      name: name.trim(),
      quantity: qty.trim() || undefined,
      priority,
    });
  };

  const dotColor = priority === 'URGENT' ? '#DC2626' : priority === 'LOW' ? '#3B82F6' : '#D1D5DB';

  return (
    <View style={qa.bar}>
      {/* Priority dot — tap to cycle NORMAL → URGENT → LOW → NORMAL */}
      <TouchableOpacity style={[qa.priorityDot, { backgroundColor: dotColor }]} onPress={cyclePriority} activeOpacity={0.7}>
        {priority === 'URGENT' && <AlertTriangleIcon size={11} color="#fff" strokeWidth={2.5} />}
        {priority === 'LOW'    && <ArrowDownIcon     size={11} color="#fff" strokeWidth={2.5} />}
      </TouchableOpacity>

      {/* Item name */}
      <TextInput
        ref={nameRef}
        style={qa.nameInput}
        value={name}
        onChangeText={setName}
        placeholder="Add item..."
        placeholderTextColor="#9CA3AF"
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={handleAdd}
        maxLength={120}
      />

      {/* Qty (small) */}
      <TextInput
        style={qa.qtyInput}
        value={qty}
        onChangeText={setQty}
        placeholder="Qty"
        placeholderTextColor="#9CA3AF"
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={handleAdd}
        maxLength={30}
      />

      {/* Add button */}
      <TouchableOpacity
        style={[qa.addBtn, (!name.trim() || addMutation.isPending) && { opacity: 0.4 }]}
        onPress={handleAdd}
        disabled={!name.trim() || addMutation.isPending}
        activeOpacity={0.8}
      >
        {addMutation.isPending
          ? <ActivityIndicator color="#fff" size="small" />
          : <PlusIcon size={22} color="#fff" strokeWidth={2.5} />
        }
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ManagerOrderListScreen() {
  const qc = useQueryClient();

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [editingItem,     setEditingItem]      = useState<OrderListItem | null>(null);
  const [showReview,      setShowReview]       = useState(false);
  const [showHistory,     setShowHistory]      = useState(false);

  // ── Stores ───────────────────────────────────────────────────────────────
  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60 * 1000,
  });
  const stores: Store[] = storesData?.data?.data || [];

  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) setSelectedStoreId(stores[0].id);
  }, [stores]);

  const selectedStore = stores.find(s => s.id === selectedStoreId);

  // ── Active list ──────────────────────────────────────────────────────────
  const {
    data: activeData, isLoading: listLoading, refetch: refetchList, isRefetching: listRefetching,
  } = useQuery({
    queryKey: ['order-list-active', selectedStoreId],
    queryFn: () => orderListApi.getActive(selectedStoreId!),
    enabled: !!selectedStoreId,
    refetchInterval: 30000,
  });

  const activeList: OrderList | null = activeData?.data?.data || null;
  const items: OrderListItem[] = activeList?.items?.filter(i => i.status !== 'REMOVED') || [];
  const sections = useMemo(() => groupByCategory(items), [items]);

  // ── Employee request count ───────────────────────────────────────────────
  const { data: reqData } = useQuery({
    queryKey: ['employee-requests', selectedStoreId, 'PENDING'],
    queryFn: () => employeeRequestApi.forStore(selectedStoreId!, 'PENDING'),
    enabled: !!selectedStoreId,
    refetchInterval: 30000,
  });
  const pendingRequestCount: number = (reqData?.data?.data || []).length;

  // ── Categories ───────────────────────────────────────────────────────────
  const { data: catData } = useQuery({
    queryKey: ['order-categories'],
    queryFn: orderCategoriesApi.getApproved,
    staleTime: 10 * 60 * 1000,
  });
  const categories: string[] = catData?.data?.data || [];

  // ── Mutations ────────────────────────────────────────────────────────────
  const openListMutation = useMutation({
    mutationFn: () => orderListApi.openList(selectedStoreId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] });
      Toast.show({ type: 'success', text1: 'New list opened' });
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to open list' }),
  });

  const closeListMutation = useMutation({
    mutationFn: () => orderListApi.closeList(activeList!.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] });
      qc.invalidateQueries({ queryKey: ['order-list-history', selectedStoreId] });
      Toast.show({ type: 'success', text1: 'List closed — order placed' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to close list' }),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => orderListApi.removeItem(itemId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] });
      Toast.show({ type: 'success', text1: 'Item removed' });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to remove item' }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => orderListApi.updateItemStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] }),
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update item' }),
  });

  const printMutation = useMutation({
    mutationFn: () => orderListApi.printList(activeList!.id),
    onSuccess: async () => {
      const lines = items.map((item, idx) => {
        let line = `${idx + 1}. ${item.name}`;
        if (item.quantity) line += ` — ${item.quantity}`;
        if (item.category) line += ` [${item.category}]`;
        if (item.priority === 'URGENT') line += ' *** URGENT ***';
        return line;
      }).join('\n');
      const text = `${activeList?.name}\n${'─'.repeat(40)}\n${lines}`;
      await Share.share({ message: text, title: activeList?.name });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to print list' }),
  });

  const handleRemove = (item: OrderListItem) => {
    Alert.alert('Remove Item', `Remove "${item.name}" from the list?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(item.id) },
    ]);
  };

  const handleCloseList = () => {
    Alert.alert(
      'Close List',
      'Closing the list means the order has been placed or delivered. A new list will open for the next order.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close List', style: 'destructive', onPress: () => closeListMutation.mutate() },
      ]
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────

  const pendingCount  = items.filter(i => i.status === 'PENDING').length;
  const orderedCount  = items.filter(i => i.status === 'ORDERED').length;
  const receivedCount = items.filter(i => i.status === 'RECEIVED').length;
  const urgentCount   = items.filter(i => i.priority === 'URGENT' && i.status === 'PENDING').length;

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PackageIcon size={20} color="#fff" strokeWidth={2} />
          <Text style={s.headerTitle}>Order Lists</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {activeList && (
            <TouchableOpacity style={s.headerBtn} onPress={() => setShowHistory(true)}>
              <ListIcon size={17} color="#fff" strokeWidth={2} />
              <Text style={s.headerBtnText}>History</Text>
            </TouchableOpacity>
          )}
          {pendingRequestCount > 0 && (
            <TouchableOpacity style={[s.headerBtn, { backgroundColor: '#EF4444' }]} onPress={() => setShowReview(true)}>
              <ClipboardIcon size={17} color="#fff" strokeWidth={2} />
              <Text style={s.headerBtnText}>Requests ({pendingRequestCount})</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Store Tabs */}
      <View style={s.storeTabs}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storeTabsInner}>
          {stores.map(store => {
            const isSel = selectedStoreId === store.id;
            return (
              <TouchableOpacity key={store.id} onPress={() => setSelectedStoreId(store.id)}
                style={[s.storeTab, isSel && s.storeTabActive]}>
                <Text style={[s.storeTabText, isSel && s.storeTabTextActive]} numberOfLines={1}>
                  {store.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Content */}
      {!selectedStoreId ? (
        <View style={s.center}>
          <PackageIcon size={48} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>Select a store above</Text>
        </View>
      ) : listLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : !activeList ? (
        /* No open list */
        <View style={s.center}>
          <PackageIcon size={56} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>No open list for {selectedStore?.name}</Text>
          <Text style={s.emptyText}>Open a new list to start adding items for this order.</Text>
          <TouchableOpacity style={[s.openListBtn, openListMutation.isPending && { opacity: 0.6 }]}
            onPress={() => openListMutation.mutate()} disabled={openListMutation.isPending}>
            {openListMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.openListBtnText}>Open New List</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* List Banner */}
          <View style={s.listBanner}>
            <View style={{ flex: 1 }}>
              <Text style={s.listName}>{activeList.name}</Text>
              <View style={s.listStats}>
                {pendingCount  > 0 && <Text style={[s.statChip, { color: '#D97706' }]}>{pendingCount} needed</Text>}
                {orderedCount  > 0 && <Text style={[s.statChip, { color: '#059669' }]}>{orderedCount} ordered</Text>}
                {receivedCount > 0 && <Text style={[s.statChip, { color: '#16A34A' }]}>{receivedCount} received</Text>}
                {urgentCount   > 0 && <Text style={[s.statChip, { color: '#DC2626', fontWeight: '700' }]}>{urgentCount} urgent!</Text>}
              </View>
            </View>
            {/* Print icon */}
            <TouchableOpacity
              style={[s.bannerIconBtn, (printMutation.isPending || items.length === 0) && { opacity: 0.35 }]}
              onPress={() => printMutation.mutate()}
              disabled={printMutation.isPending || items.length === 0}
            >
              {printMutation.isPending
                ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                : <PrinterIcon size={19} color={COLORS.textMuted} strokeWidth={2} />
              }
            </TouchableOpacity>
            <TouchableOpacity style={s.closeListBtn} onPress={handleCloseList}
              disabled={closeListMutation.isPending}>
              {closeListMutation.isPending
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Text style={s.closeListBtnText}>Close List</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Items + Quick-Add bar (keyboard-aware) */}
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {items.length === 0 ? (
              <View style={[s.center, { flex: 1 }]}>
                <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
                <Text style={s.emptyTitle}>List is empty</Text>
                <Text style={s.emptyText}>Type an item below to start.</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16, paddingBottom: 16 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={listRefetching} onRefresh={refetchList} tintColor={COLORS.secondary} />}
                keyboardShouldPersistTaps="handled"
              >
                {sections.map(section => (
                  <View key={section.title} style={s.section}>
                    <Text style={s.sectionHeader}>{section.title}</Text>
                    {section.data.map(item => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        onEdit={setEditingItem}
                        onRemove={handleRemove}
                        onMarkOrdered={(it) => statusMutation.mutate({ id: it.id, status: 'ORDERED' })}
                        onMarkReceived={(it) => statusMutation.mutate({ id: it.id, status: 'RECEIVED' })}
                      />
                    ))}
                  </View>
                ))}
              </ScrollView>
            )}

            {/* Quick-Add Bar */}
            <QuickAddBar listId={activeList.id} storeId={selectedStoreId!} />
          </KeyboardAvoidingView>
        </>
      )}

      {/* Edit Item Sheet (only opens when tapping Edit on an existing item) */}
      {editingItem && (
        <AddItemSheet
          visible={true}
          listId={activeList?.id || ''}
          initialValues={{
            id: editingItem.id,
            name: editingItem.name,
            quantity: editingItem.quantity || '',
            category: editingItem.category || '',
            notes: editingItem.notes || '',
            priority: editingItem.priority,
          }}
          categories={categories}
          onClose={() => setEditingItem(null)}
          onSaved={() => {
            setEditingItem(null);
            qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] });
          }}
        />
      )}

      {/* Employee Requests Review */}
      <ReviewModal
        visible={showReview}
        storeId={selectedStoreId || ''}
        activeListId={activeList?.id || null}
        onClose={() => setShowReview(false)}
        onReviewed={() => setShowReview(false)}
      />

      {/* History */}
      <HistoryModal
        visible={showHistory}
        storeId={selectedStoreId || ''}
        storeName={selectedStore?.name || ''}
        activeListId={activeList?.id || null}
        onClose={() => setShowHistory(false)}
        onRestored={() => {
          setShowHistory(false);
          qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] });
        }}
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  storeTabs:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  storeTabsInner: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  storeTab: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff',
  },
  storeTabActive:     { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  storeTabText:       { fontSize: 13, fontWeight: '600', color: COLORS.text },
  storeTabTextActive: { color: '#fff' },

  listBanner: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listName:  { fontSize: 14, fontWeight: '700', color: COLORS.text },
  listStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statChip:  { fontSize: 12, fontWeight: '600' },
  closeListBtn: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  closeListBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },
  bannerIconBtn: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.background,
  },

  section: { marginBottom: 16 },
  sectionHeader: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, paddingLeft: 4,
  },

  itemCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8,
    flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  urgentCard: { borderWidth: 1, borderColor: '#FECACA' },
  priorityBar: { width: 4 },
  itemBody:    { flex: 1, padding: 12, gap: 4 },

  itemBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 7, paddingVertical: 3,
    borderRadius: 20, borderWidth: 1, borderColor: 'transparent',
  },
  badgeText:  { fontSize: 11, fontWeight: '600' },
  itemName:   { fontSize: 15, fontWeight: '700', color: COLORS.text },
  itemMeta:   { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  metaText:   { fontSize: 12, color: COLORS.textMuted },
  itemNotes:  { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  itemBy:     { fontSize: 11, color: '#94A3B8', marginTop: 2 },
  itemActions:     { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  actionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, backgroundColor: '#EEF2FF' },
  actionBtnDanger: { backgroundColor: '#FEF2F2' },
  actionBtnGreen:  { backgroundColor: '#F0FDF4' },
  actionBtnPurple: { backgroundColor: '#F5F3FF' },
  actionBtnText:   { fontSize: 12, fontWeight: '600' },

  bottomBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', gap: 10,
    padding: 16, paddingBottom: 24,
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 10,
  },
  addBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12,
    borderWidth: 2, borderColor: COLORS.secondary, backgroundColor: '#fff',
  },
  addBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },
  printBtn: {
    flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.secondary,
  },
  printBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },

  openListBtn: {
    marginTop: 20, paddingHorizontal: 32, paddingVertical: 14,
    borderRadius: 14, backgroundColor: COLORS.secondary,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  openListBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  // Bottom sheet / modal
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '92%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.text },
  closeBtn:    { padding: 4 },

  label: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text,
  },
  textArea: { minHeight: 72, textAlignVertical: 'top', paddingTop: 12 },

  priorityRow:      { flexDirection: 'row', gap: 8 },
  priorityChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
  priorityChipText: { fontSize: 13, fontWeight: '600' },

  catChip:     { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: '#fff' },
  catChipText: { fontSize: 13, color: COLORS.text, fontWeight: '500' },

  suggestionBox: { backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 4, overflow: 'hidden' },
  suggestionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  suggestionText: { fontSize: 14, color: COLORS.text },

  submitBtn:     { backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Full-screen modal
  modalFullHeader: {
    backgroundColor: COLORS.secondary, paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  modalFullTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },

  // Request review
  reqCard: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  reqCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  reqCardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  reqCardMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  reqCardNote: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },
  reqLines: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12 },
  reqLine: { backgroundColor: COLORS.background, borderRadius: 10, padding: 10, marginBottom: 10 },
  reqLineName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  reqLineMeta: { fontSize: 12, color: COLORS.textMuted },
  reqLineNote: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },

  actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#16A34A', backgroundColor: '#F0FDF4',
  },
  acceptBtnActive: { backgroundColor: '#16A34A' },
  acceptBtnText: { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  rejectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#DC2626', backgroundColor: '#FEF2F2',
  },
  rejectBtnActive: { backgroundColor: '#DC2626' },
  rejectBtnText: { fontSize: 13, fontWeight: '700', color: '#DC2626' },

  rejectDetails: { marginTop: 8, gap: 4 },
  reasonChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: '#fff' },
  reasonChipText: { fontSize: 12, fontWeight: '500', color: COLORS.text },

  // Restore
  restoreItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff',
  },
  restoreItemSelected: { borderColor: COLORS.secondary, backgroundColor: '#EEF2FF' },
  restoreCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
});

// ─── Quick-Add Bar Styles ─────────────────────────────────────────────────────
const qa = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    paddingBottom: Platform.OS === 'ios' ? 10 : 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 8,
  },
  priorityDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 13,
    fontSize: 15,
    color: COLORS.text,
  },
  qtyInput: {
    width: 58,
    height: 44,
    backgroundColor: '#F9FAFB',
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    paddingHorizontal: 8,
    fontSize: 13,
    color: COLORS.text,
    textAlign: 'center',
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.secondary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
});
