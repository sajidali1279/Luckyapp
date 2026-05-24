import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  RefreshControl, StatusBar, Modal, Alert, KeyboardAvoidingView,
  Platform, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { orderListApi, employeeRequestApi, orderCategoriesApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  PackageIcon, PrinterIcon, CheckCircleIcon,
  PlusIcon, XIcon, ClipboardIcon,
  ListIcon, ChevronDownIcon,
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

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ItemStatus, { label: string; bg: string; text: string }> = {
  PENDING:  { label: 'Needed',   bg: '#FEF3C7', text: '#D97706' },
  ORDERED:  { label: 'Ordered',  bg: '#D1FAE5', text: '#059669' },
  RECEIVED: { label: 'Received', bg: '#DCFCE7', text: '#16A34A' },
  REMOVED:  { label: 'Removed',  bg: '#F3F4F6', text: '#9CA3AF' },
};

const REJECTION_REASONS = [
  { value: 'NO_SUPPLIER',   label: 'No supplier' },
  { value: 'OUT_OF_BUDGET', label: 'Out of budget' },
  { value: 'IN_STOCK',      label: 'In stock' },
  { value: 'DUPLICATE',     label: 'Duplicate' },
  { value: 'OTHER',         label: 'Other' },
];

// ─── Category Picker ─────────────────────────────────────────────────────────

interface CategoryPickerProps {
  visible: boolean;
  categories: string[];
  selected: string;
  onSelect: (cat: string) => void;
  onSubmitNew: (name: string) => Promise<void>;
  onClose: () => void;
}

function CategoryPicker({ visible, categories, selected, onSelect, onSubmitNew, onClose }: CategoryPickerProps) {
  const [search,      setSearch]      = useState('');
  const [showNew,     setShowNew]     = useState(false);
  const [newName,     setNewName]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);

  useEffect(() => {
    if (!visible) { setSearch(''); setShowNew(false); setNewName(''); }
  }, [visible]);

  const filtered = categories.filter(c => c.toLowerCase().includes(search.toLowerCase()));

  const handleSubmitNew = async () => {
    if (!newName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmitNew(newName.trim());
      onSelect(newName.trim());
      onClose();
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to submit category' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Category</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Search */}
          <TextInput
            style={s.catSearch}
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories..."
            placeholderTextColor={COLORS.textMuted}
          />

          {/* List */}
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={[s.catOption, !selected && s.catOptionSel]} onPress={() => { onSelect(''); onClose(); }}>
              <Text style={[s.catOptionText, !selected && { color: COLORS.secondary, fontWeight: '700' }]}>None</Text>
              {!selected && <CheckCircleIcon size={15} color={COLORS.secondary} strokeWidth={2.5} />}
            </TouchableOpacity>
            {filtered.map(cat => (
              <TouchableOpacity key={cat} style={[s.catOption, selected === cat && s.catOptionSel]} onPress={() => { onSelect(cat); onClose(); }}>
                <Text style={[s.catOptionText, selected === cat && { color: COLORS.secondary, fontWeight: '700' }]}>{cat}</Text>
                {selected === cat && <CheckCircleIcon size={15} color={COLORS.secondary} strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Submit New */}
          <View style={s.catNewSection}>
            {!showNew ? (
              <TouchableOpacity style={s.catNewTrigger} onPress={() => setShowNew(true)}>
                <PlusIcon size={14} color={COLORS.secondary} strokeWidth={2.5} />
                <Text style={s.catNewTriggerText}>Submit New Category for Approval</Text>
              </TouchableOpacity>
            ) : (
              <View style={s.catNewForm}>
                <TextInput
                  style={s.catNewInput}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="Enter category name..."
                  placeholderTextColor={COLORS.textMuted}
                  autoFocus
                  maxLength={80}
                />
                <Text style={s.catNewHint}>
                  Will be sent to the admin for review. Once approved it appears for all managers.
                </Text>
                <TouchableOpacity
                  style={[s.catNewSubmitBtn, (!newName.trim() || submitting) && { opacity: 0.4 }]}
                  onPress={handleSubmitNew}
                  disabled={!newName.trim() || submitting}
                >
                  {submitting
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={s.catNewSubmitText}>Submit for Approval</Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Item Row (spreadsheet row) ───────────────────────────────────────────────

interface ItemRowProps {
  item: OrderListItem;
  onEdit: (item: OrderListItem) => void;
  onRemove: (item: OrderListItem) => void;
  onMarkOrdered: (item: OrderListItem) => void;
  onMarkReceived: (item: OrderListItem) => void;
}

const STATUS_BORDER: Record<ItemStatus, string> = {
  PENDING:  '#D97706',
  ORDERED:  '#059669',
  RECEIVED: '#D1FAE5',
  REMOVED:  '#E5E7EB',
};

function ItemRow({ item, onEdit, onRemove, onMarkOrdered, onMarkReceived }: ItemRowProps) {
  const sc = STATUS_CFG[item.status];

  const showActions = () => {
    const buttons: { text: string; style?: 'default' | 'destructive' | 'cancel'; onPress?: () => void }[] = [];
    if (item.status === 'PENDING') {
      buttons.push({ text: '✓ Mark Ordered',  onPress: () => onMarkOrdered(item) });
      buttons.push({ text: '✎ Edit Details',  onPress: () => onEdit(item) });
      buttons.push({ text: '✕ Remove',         style: 'destructive', onPress: () => onRemove(item) });
    } else if (item.status === 'ORDERED') {
      buttons.push({ text: '✓ Mark Received', onPress: () => onMarkReceived(item) });
      buttons.push({ text: '✎ Edit Details',  onPress: () => onEdit(item) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    const subtitle = [item.quantity && `Qty: ${item.quantity}`, item.category].filter(Boolean).join(' · ');
    Alert.alert(item.name, subtitle || undefined, buttons);
  };

  return (
    <TouchableOpacity
      style={[t.row, { borderLeftColor: STATUS_BORDER[item.status] }]}
      onPress={showActions}
      activeOpacity={0.65}
    >
      {/* Name + qty merged */}
      <View style={t.colName}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 }}>
          <Text style={[t.cellName, item.status === 'RECEIVED' && t.strikethrough]} numberOfLines={1}>
            {item.name}
          </Text>
          {item.quantity ? (
            <Text style={t.cellQtyInline} numberOfLines={1}>· {item.quantity}</Text>
          ) : null}
        </View>
        {item.source === 'EMPLOYEE_REQUEST' && (
          <Text style={t.reqTag}>employee request</Text>
        )}
      </View>

      {/* Category */}
      <View style={t.colCat}>
        {item.category ? (
          <View style={[t.catPill, { backgroundColor: item.status === 'RECEIVED' ? '#F3F4F6' : '#EEF2FF' }]}>
            <Text style={[t.catPillText, { color: item.status === 'RECEIVED' ? '#9CA3AF' : '#4F46E5' }]} numberOfLines={1}>
              {item.category}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Status */}
      <View style={t.colAction}>
        <View style={[t.statusDot, { backgroundColor: sc.bg }]}>
          <Text style={[t.statusLetter, { color: sc.text }]}>{sc.label[0]}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Quick Add Bar (single input, paper-fast) ────────────────────────────────
//
//  Type the item name. Optionally append a quantity using "x4" or "4x" notation.
//  Examples:  "milk"  →  name=milk
//             "milk x4"  →  name=milk, qty=x4
//             "OJ 3 cases"  →  name=OJ 3 cases  (no x-pattern, kept as name)
//
//  Priority defaults to NORMAL. Tap any item in the list to mark it Urgent/Low.
//  Category is set via the Edit sheet (tap an item → Edit Details).
// ─────────────────────────────────────────────────────────────────────────────

function parseInput(raw: string): { name: string; quantity?: string } {
  const trimmed = raw.trim();
  // Match trailing "x4", "x 4", "4x", "4 x" (case-insensitive)
  const qtyMatch = trimmed.match(/\s+(x\s*\d+[\w]*|\d+[\w]*\s*x)\s*$/i);
  if (qtyMatch) {
    const quantity = qtyMatch[1].replace(/\s+/g, '');
    const name = trimmed.slice(0, trimmed.length - qtyMatch[0].length).trim();
    if (name) return { name, quantity };
  }
  return { name: trimmed };
}

interface QuickAddBarProps {
  listId: string;
  storeId: string;
}

function QuickAddBar({ listId, storeId }: QuickAddBarProps) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const inputRef = useRef<any>(null);

  const addMutation = useMutation({
    mutationFn: (d: { name: string; quantity?: string; category?: string; notes?: string; priority?: string }) =>
      orderListApi.addItem(listId, d),
    onSuccess: () => {
      setText('');
      qc.invalidateQueries({ queryKey: ['order-list-active', storeId] });
      // Keep focus — next item is ready to type immediately
      inputRef.current?.focus();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add item' }),
  });

  const handleAdd = () => {
    const { name, quantity } = parseInput(text);
    if (!name) return;
    addMutation.mutate({ name, quantity, priority: 'NORMAL' });
  };

  const ready = text.trim().length > 0 && !addMutation.isPending;

  return (
    <View style={qa.bar}>
      <TextInput
        ref={inputRef}
        style={qa.input}
        value={text}
        onChangeText={setText}
        placeholder='Add item…  tip: "milk x4" sets quantity'
        placeholderTextColor="#B0B8C4"
        returnKeyType="done"
        blurOnSubmit={false}
        onSubmitEditing={handleAdd}
        maxLength={150}
        autoCorrect={false}
        autoCapitalize="sentences"
      />
      <TouchableOpacity
        style={[qa.addBtn, !ready && qa.addBtnDim]}
        onPress={handleAdd}
        disabled={!ready}
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

// ─── Edit Item Sheet (edit-only, no Notes) ────────────────────────────────────

interface EditItemSheetProps {
  visible: boolean;
  listId: string;
  item: OrderListItem;
  categories: string[];
  onClose: () => void;
  onSaved: () => void;
}

function EditItemSheet({ visible, listId, item, categories, onClose, onSaved }: EditItemSheetProps) {
  const [name,     setName]     = useState(item.name);
  const [quantity, setQuantity] = useState(item.quantity || '');
  const [category, setCategory] = useState(item.category || '');
  const [showCat,  setShowCat]  = useState(false);

  useEffect(() => {
    if (visible) {
      setName(item.name);
      setQuantity(item.quantity || '');
      setCategory(item.category || '');
    }
  }, [visible, item.id]);

  const editMutation = useMutation({
    mutationFn: (d: object) => orderListApi.updateItem(item.id, d),
    onSuccess: () => { Toast.show({ type: 'success', text1: 'Item updated' }); onSaved(); },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to update item' }),
  });

  const handleSubmit = () => {
    if (!name.trim()) { Toast.show({ type: 'error', text1: 'Name is required' }); return; }
    editMutation.mutate({
      name: name.trim(),
      quantity: quantity.trim() || null,
      category: category.trim() || null,
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Edit Item</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={s.label}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput style={s.input} value={name} onChangeText={setName}
              placeholder="e.g. Whole Milk 2%" placeholderTextColor={COLORS.textMuted} maxLength={120} />

            {/* Quantity */}
            <Text style={s.label}>Quantity / Amount</Text>
            <TextInput style={s.input} value={quantity} onChangeText={setQuantity}
              placeholder="e.g. 4 gallons, 2 cases" placeholderTextColor={COLORS.textMuted} maxLength={60} />

            {/* Category */}
            <Text style={s.label}>Category</Text>
            <TouchableOpacity style={s.catPickerBtn} onPress={() => setShowCat(true)} activeOpacity={0.7}>
              <Text style={category ? s.catPickerBtnText : s.catPickerBtnPlaceholder} numberOfLines={1}>
                {category || 'Tap to choose category...'}
              </Text>
              <ChevronDownIcon size={16} color={COLORS.textMuted} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.submitBtn, editMutation.isPending && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>

        {/* Category picker renders over the edit sheet */}
        <CategoryPicker
          visible={showCat}
          categories={categories}
          selected={category}
          onSelect={setCategory}
          onSubmitNew={async (newCat) => {
            await orderCategoriesApi.submitNew(newCat);
            setCategory(newCat);
            Toast.show({ type: 'success', text1: 'Submitted for approval' });
          }}
          onClose={() => setShowCat(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
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
      [lineId]: Object.assign({ action: null, reason: 'OTHER', note: '' }, prev[lineId], { [field]: value }),
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
                  <View style={expandedReq === req.id ? { transform: [{ rotate: '180deg' }] } : {}}>
                    <ChevronDownIcon size={18} color={COLORS.textMuted} />
                  </View>
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
  const [selected, setSelected] = useState<Record<string, boolean>>({});

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
                    <View style={isExpanded ? { transform: [{ rotate: '180deg' }] } : {}}>
                      <ChevronDownIcon size={18} color={COLORS.textMuted} />
                    </View>
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
  const { data: activeData, isLoading: listLoading, refetch: refetchList, isRefetching: listRefetching } = useQuery({
    queryKey: ['order-list-active', selectedStoreId],
    queryFn: () => orderListApi.getActive(selectedStoreId!),
    enabled: !!selectedStoreId,
    refetchInterval: 30000,
  });

  const activeList: OrderList | null = activeData?.data?.data || null;
  const items: OrderListItem[] = activeList?.items?.filter(i => i.status !== 'REMOVED') || [];

  // Sort: PENDING → ORDERED → RECEIVED, then alphabetical within each status
  const STATUS_SORT: Record<ItemStatus, number> = { PENDING: 0, ORDERED: 1, RECEIVED: 2, REMOVED: 3 };
  const sortedItems = [...items].sort((a, b) => {
    if (STATUS_SORT[a.status] !== STATUS_SORT[b.status])
      return STATUS_SORT[a.status] - STATUS_SORT[b.status];
    return a.name.localeCompare(b.name);
  });

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ['order-list-active', selectedStoreId] }),
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
      const lines = sortedItems.map((item, idx) => {
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

  // ── Counters ─────────────────────────────────────────────────────────────
  const pendingCount  = items.filter(i => i.status === 'PENDING').length;
  const orderedCount  = items.filter(i => i.status === 'ORDERED').length;
  const receivedCount = items.filter(i => i.status === 'RECEIVED').length;

  // ── Render ───────────────────────────────────────────────────────────────

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
            <TouchableOpacity style={s.closeListBtn} onPress={handleCloseList} disabled={closeListMutation.isPending}>
              {closeListMutation.isPending
                ? <ActivityIndicator size="small" color={COLORS.primary} />
                : <Text style={s.closeListBtnText}>Close List</Text>
              }
            </TouchableOpacity>
          </View>

          {/* Table Header */}
          <View style={t.tableHeader}>
            <Text style={[t.colName, t.headerText]}>Item</Text>
            <Text style={[t.colCat, t.headerText]}>Category</Text>
            <View style={t.colAction} />
          </View>

          {/* Rows + pinned Add Row */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {items.length === 0 ? (
              <View style={[s.center, { flex: 1 }]}>
                <ClipboardIcon size={48} color={COLORS.border} strokeWidth={1.25} />
                <Text style={s.emptyTitle}>List is empty</Text>
                <Text style={s.emptyText}>Add an item below to get started.</Text>
              </View>
            ) : (
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={listRefetching} onRefresh={refetchList} tintColor={COLORS.secondary} />}
              >
                {sortedItems.map(item => (
                  <ItemRow
                    key={item.id}
                    item={item}
                    onEdit={setEditingItem}
                    onRemove={handleRemove}
                    onMarkOrdered={(it) => statusMutation.mutate({ id: it.id, status: 'ORDERED' })}
                    onMarkReceived={(it) => statusMutation.mutate({ id: it.id, status: 'RECEIVED' })}
                  />
                ))}
              </ScrollView>
            )}

            {/* Quick Add Bar — always pinned at bottom */}
            <QuickAddBar listId={activeList.id} storeId={selectedStoreId!} />
          </KeyboardAvoidingView>
        </>
      )}

      {/* Edit Item Sheet */}
      {editingItem && (
        <EditItemSheet
          visible={true}
          listId={activeList?.id || ''}
          item={editingItem}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },

  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 8,
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
  storeTab:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
  storeTabActive:     { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  storeTabText:       { fontSize: 13, fontWeight: '600', color: COLORS.text },
  storeTabTextActive: { color: '#fff' },

  listBanner: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  listName:  { fontSize: 14, fontWeight: '700', color: COLORS.text },
  listStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statChip:  { fontSize: 12, fontWeight: '600' },
  bannerIconBtn: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  closeListBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.primary },
  closeListBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  openListBtn: {
    marginTop: 20, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.secondary,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  openListBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  // Modal / sheet
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '92%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.text },
  closeBtn:    { padding: 4 },

  label: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text,
  },

  priorityRow:      { flexDirection: 'row', gap: 8 },
  priorityChip:     { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
  priorityChipText: { fontSize: 13, fontWeight: '600' },

  // Category picker (in sheet)
  catSearch: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text, marginBottom: 8,
  },
  catOption:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  catOptionSel: { backgroundColor: '#EEF2FF' },
  catOptionText: { fontSize: 15, color: COLORS.text },
  catNewSection: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  catNewTrigger: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  catNewTriggerText: { fontSize: 14, color: COLORS.secondary, fontWeight: '600' },
  catNewForm: { gap: 10 },
  catNewInput: {
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.secondary,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: COLORS.text,
  },
  catNewHint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  catNewSubmitBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  catNewSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Edit sheet category picker button
  catPickerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
  },
  catPickerBtnText:        { fontSize: 15, color: COLORS.text, flex: 1 },
  catPickerBtnPlaceholder: { fontSize: 15, color: COLORS.textMuted, flex: 1 },

  submitBtn:     { backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Full-screen modals
  modalFullHeader: {
    backgroundColor: COLORS.secondary, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  modalFullTitle: { flex: 1, fontSize: 18, fontWeight: '700', color: '#fff' },

  // Request review cards
  reqCard:       { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  reqCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  reqCardName:   { fontSize: 15, fontWeight: '700', color: COLORS.text },
  reqCardMeta:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  reqCardNote:   { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 4 },
  reqLines:      { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12 },
  reqLine:       { backgroundColor: COLORS.background, borderRadius: 10, padding: 10, marginBottom: 10 },
  reqLineName:   { fontSize: 14, fontWeight: '700', color: COLORS.text },
  reqLineMeta:   { fontSize: 12, color: COLORS.textMuted },
  reqLineNote:   { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },

  actionRow:       { flexDirection: 'row', gap: 8, marginTop: 8 },
  acceptBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#16A34A', backgroundColor: '#F0FDF4' },
  acceptBtnActive: { backgroundColor: '#16A34A' },
  acceptBtnText:   { fontSize: 13, fontWeight: '700', color: '#16A34A' },
  rejectBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#DC2626', backgroundColor: '#FEF2F2' },
  rejectBtnActive: { backgroundColor: '#DC2626' },
  rejectBtnText:   { fontSize: 13, fontWeight: '700', color: '#DC2626' },
  rejectDetails:   { marginTop: 8, gap: 4 },
  reasonChip:      { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: '#fff' },
  reasonChipText:  { fontSize: 12, fontWeight: '500', color: COLORS.text },

  // Restore
  restoreItem:         { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: '#fff' },
  restoreItemSelected: { borderColor: COLORS.secondary, backgroundColor: '#EEF2FF' },
  restoreCheckbox:     { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
});

// ─── Table Styles ─────────────────────────────────────────────────────────────

const COL_P      = 28;
const COL_QTY    = 48;
const COL_CAT    = 82;
const COL_ACTION = 32;

const t = StyleSheet.create({
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  headerText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.5 },

  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F0F0F0',
    borderLeftWidth: 3,
    borderLeftColor: '#E5E7EB',
  },
  addRow: {
    borderLeftColor: COLORS.secondary,
    borderTopWidth: 1.5,
    borderTopColor: '#E5E7EB',
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 6,
  },

  colP:      { width: COL_P,      alignItems: 'center', justifyContent: 'center' },
  colName:   { flex: 1,           paddingHorizontal: 6 },
  colQty:    { width: COL_QTY,    paddingHorizontal: 4 },
  colCat:    { width: COL_CAT,    paddingHorizontal: 4 },
  colAction: { width: COL_ACTION, alignItems: 'center', justifyContent: 'center' },

  dot: {
    width: 18, height: 18, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center',
  },

  cellName: { fontSize: 14, fontWeight: '600', color: COLORS.text, lineHeight: 19 },
  cellQtyInline: { fontSize: 12, color: COLORS.textMuted, lineHeight: 19 },
  strikethrough: { textDecorationLine: 'line-through', color: COLORS.textMuted },
  cellMuted: { fontSize: 12, color: COLORS.textMuted },
  reqTag: { fontSize: 10, color: '#16A34A', fontWeight: '600', marginTop: 2 },

  catPill: {
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  catPillText: { fontSize: 11, fontWeight: '600' },

  statusDot: {
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  statusLetter: { fontSize: 11, fontWeight: '800' },

  // Add row inputs (legacy — kept so StyleSheet compile doesn't fail; unused in UI)
  addInput: {
    backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7,
    fontSize: 14, color: COLORS.text,
  },
  addCatPlaceholder: { fontSize: 12, color: '#B0B8C4', fontWeight: '500', textAlign: 'center' },
  addCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
});

// ─── Quick Add Bar Styles ─────────────────────────────────────────────────────

const qa = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1.5, borderTopColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: COLORS.text,
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 5,
  },
  addBtnDim: { opacity: 0.4 },
});
