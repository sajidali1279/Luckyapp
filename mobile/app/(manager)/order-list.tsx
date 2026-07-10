import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  RefreshControl, Modal, Alert, KeyboardAvoidingView,
  Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { orderListApi, employeeRequestApi, orderCategoriesApi, storesApi, managerApi, scannedProductApi } from '../../services/api';
import { printOrderList } from '../../utils/printOrderList';
import { COLORS } from '../../constants';
import {
  PackageIcon, PrinterIcon, CheckCircleIcon,
  PlusIcon, XIcon, ClipboardIcon,
  ListIcon, ChevronDownIcon, QrCodeScanIcon, ZapIcon,
} from '../../components/Icons';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import type { BarcodeResult } from '../../components/BarcodeScannerModal';
import FadeSlideIn from '../../components/FadeSlideIn';
import ErrorState from '../../components/ErrorState';
import ManagerHeader from '../../components/ManagerHeader';

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
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityLabel="Close" accessibilityRole="button">
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
            autoFocus
          />

          {/* List */}
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <TouchableOpacity
              style={[s.catOption, !selected && s.catOptionSel]}
              onPress={() => { onSelect(''); onClose(); }}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel="Clear category selection"
            >
              <Text style={[s.catOptionText, !selected && { color: COLORS.managerPrimary, fontWeight: '700' }]}>None</Text>
              {!selected && <CheckCircleIcon size={15} color={COLORS.managerPrimary} strokeWidth={2.5} />}
            </TouchableOpacity>
            {filtered.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[s.catOption, selected === cat && s.catOptionSel]}
                onPress={() => { onSelect(cat); onClose(); }}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel={`Select category ${cat}`}
              >
                <Text style={[s.catOptionText, selected === cat && { color: COLORS.managerPrimary, fontWeight: '700' }]}>{cat}</Text>
                {selected === cat && <CheckCircleIcon size={15} color={COLORS.managerPrimary} strokeWidth={2.5} />}
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Submit New */}
          <View style={s.catNewSection}>
            {!showNew ? (
              <TouchableOpacity
                style={s.catNewTrigger}
                onPress={() => setShowNew(true)}
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel="Submit new category for approval"
              >
                <PlusIcon size={14} color={COLORS.managerPrimary} strokeWidth={2.5} />
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
                  accessibilityRole="button"
                  accessibilityLabel="Submit new category"
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

function ItemRow({ item, onEdit, onRemove, onMarkOrdered, onMarkReceived }: ItemRowProps) {
  const isUrgent = item.priority === 'URGENT' && item.status === 'PENDING';

  const showEditMenu = () => {
    const buttons: { text: string; style?: 'default' | 'destructive' | 'cancel'; onPress?: () => void }[] = [
      { text: 'Edit Details', onPress: () => onEdit(item) },
    ];
    if (item.status !== 'RECEIVED') {
      buttons.push({ text: 'Remove', style: 'destructive', onPress: () => onRemove(item) });
    }
    buttons.push({ text: 'Cancel', style: 'cancel' });
    Alert.alert(item.name, item.quantity ? `Qty: ${item.quantity}` : undefined, buttons);
  };

  const nextAction =
    item.status === 'PENDING'  ? { label: '→ Ordered',  color: '#059669', bg: '#D1FAE5', onPress: () => onMarkOrdered(item) }  :
    item.status === 'ORDERED'  ? { label: '✓ Received', color: '#2563EB', bg: '#DBEAFE', onPress: () => onMarkReceived(item) } :
    null;

  return (
    <View style={[r.row, isUrgent && r.rowUrgent]}>
      {isUrgent && <View style={r.urgentBar} />}

      <View style={r.body}>
        <View style={r.topLine}>
          <Text style={[r.name, item.status === 'RECEIVED' && r.nameStrike]} numberOfLines={1}>
            {isUrgent ? '⚡ ' : ''}{item.name}
            {item.quantity ? <Text style={r.qty}>  · {item.quantity}</Text> : null}
          </Text>
        </View>
        <View style={r.metaLine}>
          {item.category ? (
            <View style={r.catPill}><Text style={r.catPillText} numberOfLines={1}>{item.category}</Text></View>
          ) : null}
          {item.source === 'EMPLOYEE_REQUEST' && (
            <View style={r.staffBadge}><Text style={r.staffBadgeText}>👤 staff</Text></View>
          )}
        </View>
      </View>

      <View style={r.right}>
        {nextAction ? (
          <TouchableOpacity
            style={[r.actionBtn, { backgroundColor: nextAction.bg }]}
            onPress={nextAction.onPress}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityRole="button"
            accessibilityLabel={`Mark ${item.name} as ${item.status === 'PENDING' ? 'ordered' : 'received'}`}
          >
            <Text style={[r.actionBtnText, { color: nextAction.color }]}>{nextAction.label}</Text>
          </TouchableOpacity>
        ) : (
          <View style={r.donePill}><Text style={r.donePillText}>✓ Done</Text></View>
        )}
        <TouchableOpacity
          onPress={showEditMenu}
          style={r.moreBtn}
          hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={`More options for ${item.name}`}
        >
          <Text style={r.moreBtnText}>···</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Quick Add Bar (single input, paper-fast) ────────────────────────────────
//
//  Type the item name. Optionally append a quantity using "x4" or "4x" notation.
//  Examples:  "milk"  →  name=milk
//             "milk x4"  →  name=milk, qty=x4
//             "OJ 3 cases"  →  name=OJ 3 cases  (no x-pattern, kept as name)
//
//  Priority defaults to NORMAL. Category and priority (Low/Normal/Urgent)
//  are set via the Edit sheet (tap an item → Edit Details).
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

interface QuickItem { name: string; category: string | null; count: number }

interface QuickAddBarProps {
  listId: string;
  storeId: string;
  categories: string[];
}

function QuickAddBar({ listId, storeId, categories }: QuickAddBarProps) {
  const qc = useQueryClient();
  const [text,          setText]          = useState('');
  const [debouncedText, setDebouncedText] = useState('');
  const [category,      setCategory]      = useState('');
  const [catSearch,     setCatSearch]     = useState('');
  const [showItemSugg,  setShowItemSugg]  = useState(false);
  const [showCatSugg,   setShowCatSugg]   = useState(false);
  const [showNewCat,    setShowNewCat]    = useState(false);
  const [showScanner,   setShowScanner]   = useState(false);
  const inputRef = useRef<any>(null);

  // Quick Pad — top-16 most ordered items for this store
  const { data: quickData } = useQuery({
    queryKey: ['quick-items-mobile', storeId],
    queryFn: () => orderListApi.getQuickItems(storeId),
    staleTime: 5 * 60 * 1000,
  });
  const quickItems: QuickItem[] = quickData?.data?.data || [];

  // Debounce item name for API call (300ms)
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(text), 300);
    return () => clearTimeout(t);
  }, [text]);

  // Item suggestions from order history
  const { data: itemSuggData } = useQuery({
    queryKey: ['item-suggestions', debouncedText, category],
    queryFn: () => managerApi.getItemSuggestions({ q: debouncedText, category: category || undefined }),
    enabled: debouncedText.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });
  const itemSuggestions: { name: string; count: number }[] = itemSuggData?.data?.data || [];

  // Category filtered suggestions
  const catSuggestions = catSearch.trim()
    ? categories.filter(c => c.toLowerCase().includes(catSearch.toLowerCase()))
    : categories;

  const handleSelectItem = (itemName: string) => {
    setText(itemName);
    setShowItemSugg(false);
    inputRef.current?.focus();
  };

  const handleSelectCat = (cat: string) => {
    setCategory(cat);
    setCatSearch(cat);
    setShowCatSugg(false);
  };

  const addMutation = useMutation({
    mutationFn: (d: { name: string; quantity?: string; category?: string; priority?: string }) =>
      orderListApi.addItem(listId, d),
    onSuccess: () => {
      setText('');
      setDebouncedText('');
      qc.invalidateQueries({ queryKey: ['order-list-active', storeId] });
      inputRef.current?.focus();
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to add item' }),
  });

  const handleScanResult = (result: BarcodeResult) => {
    setShowScanner(false);
    const name = result.name.trim() || result.barcode;
    if (result.category) { setCategory(result.category); setCatSearch(result.category); }
    if (name && name !== result.barcode) {
      addMutation.mutate({ name, quantity: result.quantity || undefined, category: result.category || undefined, priority: 'NORMAL' });
    } else {
      setText(name);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleAdd = () => {
    const { name, quantity } = parseInput(text);
    if (!name) return;
    addMutation.mutate({ name, quantity, category: category || undefined, priority: 'NORMAL' });
  };

  const quickAdd = (item: QuickItem) => {
    addMutation.mutate({ name: item.name, quantity: undefined, category: item.category || undefined, priority: 'NORMAL' });
  };

  const ready = text.trim().length > 0 && !addMutation.isPending;

  return (
    <View style={qa.wrapper}>
      {/* Item suggestion dropdown — shown when name input is focused */}
      {showItemSugg && itemSuggestions.length > 0 && (
        <View style={qa.suggBox}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
            {itemSuggestions.map(item => (
              <TouchableOpacity
                key={item.name}
                style={qa.suggRow}
                onPress={() => handleSelectItem(item.name)}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel={`Use suggested item ${item.name}`}
              >
                <Text style={qa.suggText}>{item.name}</Text>
                <Text style={qa.suggCount}>{item.count}×</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category suggestion dropdown — shown when category input is focused */}
      {showCatSugg && !showItemSugg && catSuggestions.length > 0 && (
        <View style={qa.suggBox}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 200 }}>
            {catSuggestions.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[qa.suggRow, category === cat && qa.suggRowActive]}
                onPress={() => handleSelectCat(cat)}
                hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel={`Select category ${cat}`}
              >
                <Text style={[qa.suggText, category === cat && qa.suggTextActive]}>{cat}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Category search row */}
      <View style={qa.catRow}>
        <Text style={qa.catLabel}>Category</Text>
        <TextInput
          style={qa.catInput}
          value={catSearch}
          onChangeText={v => { setCatSearch(v); setCategory(''); setShowCatSugg(true); }}
          onFocus={() => setShowCatSugg(true)}
          onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
          placeholder="Search or skip…"
          placeholderTextColor="#B0B8C4"
          maxLength={80}
          returnKeyType="done"
          autoCorrect={false}
        />
        {catSearch ? (
          <TouchableOpacity
            onPress={() => { setCatSearch(''); setCategory(''); setShowCatSugg(false); }}
            style={qa.catClearBtn}
            accessibilityLabel="Clear category"
          >
            <XIcon size={14} color={COLORS.textMuted} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={() => setShowNewCat(true)}
          style={qa.catNewBtn}
          accessibilityLabel="Submit new category"
        >
          <PlusIcon size={14} color={COLORS.managerPrimary} strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {/* Name input + add button */}
      <View style={qa.bar}>
        <TextInput
          ref={inputRef}
          style={qa.input}
          value={text}
          onChangeText={v => { setText(v); setShowItemSugg(true); }}
          onFocus={() => setShowItemSugg(true)}
          onBlur={() => setTimeout(() => setShowItemSugg(false), 130)}
          placeholder={category ? `Add to ${category}…` : 'Item name… tip: "milk x4" sets qty'}
          placeholderTextColor="#B0B8C4"
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={handleAdd}
          maxLength={150}
          autoCorrect={false}
          autoCapitalize="sentences"
        />
        <TouchableOpacity
          style={qa.scanBtn}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.8}
          accessibilityLabel="Scan barcode"
          accessibilityRole="button"
        >
          <QrCodeScanIcon size={20} color="#fff" strokeWidth={2} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[qa.addBtn, !ready && qa.addBtnDim]}
          onPress={handleAdd}
          disabled={!ready}
          activeOpacity={0.8}
          accessibilityLabel="Add item to list"
          accessibilityRole="button"
        >
          {addMutation.isPending
            ? <ActivityIndicator color="#fff" size="small" />
            : <PlusIcon size={22} color="#fff" strokeWidth={2.5} />
          }
        </TouchableOpacity>
      </View>

      {/* Quick Pad tiles */}
      {quickItems.length > 0 && (
        <View style={qa.quickPad}>
          <Text style={qa.quickPadLabel}>Quick Add</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: 4 }}>
            {quickItems.map(item => (
              <TouchableOpacity
                key={item.name}
                style={qa.quickTile}
                onPress={() => quickAdd(item)}
                disabled={addMutation.isPending}
                activeOpacity={0.75}
                hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                accessibilityRole="button"
                accessibilityLabel={`Quick add ${item.name}`}
              >
                <Text style={qa.quickTileName} numberOfLines={1}>{item.name}</Text>
                {item.category ? <Text style={qa.quickTileCat} numberOfLines={1}>{item.category}</Text> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Barcode Scanner */}
      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onResult={handleScanResult}
      />

      {/* New Category Submission Modal */}
      <CategoryPicker
        visible={showNewCat}
        categories={categories}
        selected={category}
        onSelect={(cat) => { setCategory(cat); setCatSearch(cat); }}
        onSubmitNew={async (newCat) => {
          await orderCategoriesApi.submitNew(newCat);
          setCategory(newCat);
          setCatSearch(newCat);
          Toast.show({ type: 'success', text1: 'Submitted for approval' });
        }}
        onClose={() => setShowNewCat(false)}
      />
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

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: 'LOW',    label: 'Low',    color: COLORS.textMuted },
  { value: 'NORMAL', label: 'Normal', color: COLORS.managerPrimary },
  { value: 'URGENT', label: 'Urgent', color: '#F97316' },
];

function EditItemSheet({ visible, listId, item, categories, onClose, onSaved }: EditItemSheetProps) {
  const [name,           setName]           = useState(item.name);
  const [debouncedName,  setDebouncedName]  = useState(item.name);
  const [showNameSugg,   setShowNameSugg]   = useState(false);
  const [quantity,       setQuantity]       = useState(item.quantity || '');
  const [category,       setCategory]       = useState(item.category || '');
  const [catSearch,      setCatSearch]      = useState(item.category || '');
  const [showCatSugg,    setShowCatSugg]    = useState(false);
  const [showNewCat,     setShowNewCat]     = useState(false);
  const [priority,       setPriority]       = useState<Priority>(item.priority);

  // Debounce name for API
  useEffect(() => {
    const t = setTimeout(() => setDebouncedName(name), 300);
    return () => clearTimeout(t);
  }, [name]);

  useEffect(() => {
    if (visible) {
      setName(item.name);
      setDebouncedName(item.name);
      setQuantity(item.quantity || '');
      setCategory(item.category || '');
      setCatSearch(item.category || '');
      setPriority(item.priority);
    }
  }, [visible, item.id]);

  // Item name suggestions
  const { data: nameSuggData } = useQuery({
    queryKey: ['item-suggestions-edit', debouncedName, category],
    queryFn: () => managerApi.getItemSuggestions({ q: debouncedName, category: category || undefined }),
    enabled: visible && debouncedName.trim().length >= 2,
    staleTime: 5 * 60 * 1000,
    placeholderData: (prev: any) => prev,
  });
  const nameSuggestions: { name: string; count: number }[] = nameSuggData?.data?.data || [];

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
      priority,
    });
  };

  const catSuggestions = catSearch.trim()
    ? categories.filter(c => c.toLowerCase().includes(catSearch.toLowerCase()))
    : categories;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={s.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Edit Item</Text>
            <TouchableOpacity onPress={onClose} style={s.closeBtn} accessibilityLabel="Close" accessibilityRole="button">
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Name */}
            <Text style={s.label}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput
              style={s.input}
              value={name}
              onChangeText={v => { setName(v); setShowNameSugg(true); }}
              onFocus={() => setShowNameSugg(true)}
              onBlur={() => setTimeout(() => setShowNameSugg(false), 130)}
              placeholder="e.g. Whole Milk 2%"
              placeholderTextColor={COLORS.textMuted}
              maxLength={120}
            />
            {showNameSugg && nameSuggestions.length > 0 && (
              <View style={s.catSuggestBox}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 140 }}>
                  {nameSuggestions.map(sug => (
                    <TouchableOpacity
                      key={sug.name}
                      style={[s.catSuggestRow, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}
                      onPress={() => { setName(sug.name); setShowNameSugg(false); }}
                      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Use suggested name ${sug.name}`}
                    >
                      <Text style={s.catSuggestText}>{sug.name}</Text>
                      <Text style={{ fontSize: 11, color: COLORS.textMuted }}>{sug.count}×</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Quantity */}
            <Text style={s.label}>Quantity / Amount</Text>
            <TextInput style={s.input} value={quantity} onChangeText={setQuantity}
              placeholder="e.g. 4 gallons, 2 cases" placeholderTextColor={COLORS.textMuted} maxLength={60} />

            {/* Priority */}
            <Text style={s.label}>Priority</Text>
            <View style={s.priorityRow}>
              {PRIORITY_OPTIONS.map(opt => {
                const active = priority === opt.value;
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={[s.priorityChip, active && { backgroundColor: opt.color + '18', borderColor: opt.color }]}
                    onPress={() => setPriority(opt.value)}
                    activeOpacity={0.75}
                    accessibilityRole="radio"
                    accessibilityLabel={`Set priority to ${opt.label}`}
                    accessibilityState={{ checked: active }}
                  >
                    {opt.value === 'URGENT' && <ZapIcon size={12} color={active ? opt.color : COLORS.textMuted} strokeWidth={2} />}
                    <Text style={[s.priorityChipText, { color: active ? opt.color : COLORS.textMuted }]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Category — inline autocomplete */}
            <Text style={s.label}>Category</Text>
            <View style={s.catAutoRow}>
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={catSearch}
                onChangeText={v => { setCatSearch(v); setCategory(''); setShowCatSugg(true); }}
                onFocus={() => setShowCatSugg(true)}
                onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
                placeholder="Search category…"
                placeholderTextColor={COLORS.textMuted}
                autoCorrect={false}
                maxLength={80}
              />
              {catSearch ? (
                <TouchableOpacity
                  onPress={() => { setCatSearch(''); setCategory(''); setShowCatSugg(false); }}
                  style={s.catAutoClear}
                  accessibilityLabel="Clear category"
                >
                  <XIcon size={15} color={COLORS.textMuted} />
                </TouchableOpacity>
              ) : (
                <ChevronDownIcon size={15} color={COLORS.textMuted} />
              )}
            </View>

            {showCatSugg && catSuggestions.length > 0 && (
              <View style={s.catSuggestBox}>
                <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ maxHeight: 160 }}>
                  {catSuggestions.map(cat => (
                    <TouchableOpacity
                      key={cat}
                      style={[s.catSuggestRow, category === cat && s.catSuggestRowActive]}
                      onPress={() => { setCategory(cat); setCatSearch(cat); setShowCatSugg(false); }}
                      hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Select category ${cat}`}
                    >
                      <Text style={[s.catSuggestText, category === cat && s.catSuggestTextActive]}>{cat}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <TouchableOpacity
              style={[s.catNewTrigger, { marginTop: 8 }]}
              onPress={() => setShowNewCat(true)}
              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel="Submit new category for approval"
            >
              <PlusIcon size={13} color={COLORS.managerPrimary} strokeWidth={2.5} />
              <Text style={s.catNewTriggerText}>Submit new category for approval</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.submitBtn, editMutation.isPending && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={editMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Save changes"
            >
              {editMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>

        {/* New Category Submission Modal */}
        <CategoryPicker
          visible={showNewCat}
          categories={categories}
          selected={category}
          onSelect={(cat) => { setCategory(cat); setCatSearch(cat); }}
          onSubmitNew={async (newCat) => {
            await orderCategoriesApi.submitNew(newCat);
            setCategory(newCat);
            setCatSearch(newCat);
            Toast.show({ type: 'success', text1: 'Submitted for approval' });
          }}
          onClose={() => setShowNewCat(false)}
        />
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Employee Request Review Modal ────────────────────────────────────────────

interface ReviewModalProps {
  visible: boolean;
  storeId: string;
  onClose: () => void;
  onReviewed: () => void;
}

function ReviewModal({ visible, storeId, onClose, onReviewed }: ReviewModalProps) {
  const qc = useQueryClient();

  const { data: requestsData, isLoading, isError, refetch } = useQuery({
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
    }) => employeeRequestApi.review(requestId, { lines }),
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
          <TouchableOpacity onPress={onClose} style={{ padding: 10 }} accessibilityLabel="Close" accessibilityRole="button">
            <XIcon size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.modalFullTitle}>Employee Requests</Text>
          <View style={{ width: 30 }} />
        </View>

        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={COLORS.managerPrimary} size="large" /></View>
        ) : isError ? (
          <ErrorState message="Failed to load employee requests." onRetry={() => refetch()} />
        ) : requests.length === 0 ? (
          <View style={s.center}>
            <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
            <Text style={s.emptyTitle}>No pending requests</Text>
          </View>
        ) : (
          <ScrollView style={{ padding: 16 }} showsVerticalScrollIndicator={false}>
            {requests.map(req => (
              <View key={req.id} style={s.reqCard}>
                <TouchableOpacity
                  style={s.reqCardHeader}
                  onPress={() => setExpandedReq(expandedReq === req.id ? null : req.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${expandedReq === req.id ? 'Collapse' : 'Expand'} request from ${req.submittedBy.name}`}
                >
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
                              onPress={() => setLine(line.id, 'action', 'ACCEPT')}
                              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                              accessibilityRole="button"
                              accessibilityLabel={`Accept ${line.name}`}
                            >
                              <CheckCircleIcon size={14} color={st.action === 'ACCEPT' ? '#fff' : '#16A34A'} strokeWidth={2.5} />
                              <Text style={[s.acceptBtnText, st.action === 'ACCEPT' && { color: '#fff' }]}>Accept</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[s.rejectBtn, st.action === 'REJECT' && s.rejectBtnActive]}
                              onPress={() => setLine(line.id, 'action', 'REJECT')}
                              hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                              accessibilityRole="button"
                              accessibilityLabel={`Reject ${line.name}`}
                            >
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
                                    style={[s.reasonChip, st.reason === r.value && { backgroundColor: '#FEE2E2', borderColor: '#DC2626' }]}
                                    hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Select rejection reason ${r.label} for ${line.name}`}
                                  >
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
                      disabled={reviewMutation.isPending}
                      accessibilityRole="button"
                      accessibilityLabel="Submit review">
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

  const { data, isLoading, isError, refetch } = useQuery({
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
          <TouchableOpacity onPress={onClose} style={{ padding: 10 }} accessibilityLabel="Close" accessibilityRole="button">
            <XIcon size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={s.modalFullTitle}>Past Lists</Text>
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>{storeName}</Text>
        </View>

        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={COLORS.managerPrimary} size="large" /></View>
        ) : isError ? (
          <ErrorState message="Failed to load past lists." onRetry={() => refetch()} />
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
                    onPress={() => { setExpandedList(isExpanded ? null : list.id); setSelected({}); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} list ${list.name}`}
                  >
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
                              onPress={() => setSelected(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                              accessibilityRole="button"
                              accessibilityLabel={`${selected[item.id] ? 'Deselect' : 'Select'} ${item.name} to restore`}
                            >
                              <View style={[s.restoreCheckbox, selected[item.id] && { backgroundColor: COLORS.managerPrimary, borderColor: COLORS.managerPrimary }]}>
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
                            disabled={restoreMutation.isPending}
                            accessibilityRole="button"
                            accessibilityLabel="Add selected items to current list">
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
  const [isPrinting,      setIsPrinting]       = useState(false);

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
  const { data: activeData, isLoading: listLoading, isError: listError, refetch: refetchList, isRefetching: listRefetching } = useQuery({
    queryKey: ['order-list-active', selectedStoreId],
    queryFn: () => orderListApi.getActive(selectedStoreId!),
    enabled: !!selectedStoreId,
    refetchInterval: 30000,
  });

  const activeList: OrderList | null = activeData?.data?.data || null;
  const items: OrderListItem[] = activeList?.items?.filter(i => i.status !== 'REMOVED') || [];

  // Section groupings: urgent first, then normal pending, ordered, received
  const urgentItems   = items.filter(i => i.status === 'PENDING' && i.priority === 'URGENT').sort((a, b) => a.name.localeCompare(b.name));
  const neededItems   = items.filter(i => i.status === 'PENDING' && i.priority !== 'URGENT').sort((a, b) => a.name.localeCompare(b.name));
  const orderedItems  = items.filter(i => i.status === 'ORDERED').sort((a, b) => a.name.localeCompare(b.name));
  const receivedItems = items.filter(i => i.status === 'RECEIVED').sort((a, b) => a.name.localeCompare(b.name));

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


  const doPrint = async (shareAsPdf: boolean) => {
    if (!activeList || items.length === 0 || isPrinting) return;
    setIsPrinting(true);
    try {
      const catRes = await scannedProductApi.list();
      const catalog = catRes?.data?.data || [];
      await printOrderList({
        listName: activeList.name,
        storeName: selectedStore?.name || 'Store',
        items: [...urgentItems, ...neededItems, ...orderedItems, ...receivedItems],
        catalog,
        shareAsPdf,
      });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: e?.message });
    } finally {
      setIsPrinting(false);
    }
  };

  const showPrintOptions = () => {
    if (!activeList || items.length === 0) return;
    Alert.alert('Print Order List', 'Choose how to export:', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Print directly', onPress: () => doPrint(false) },
      { text: 'Share as PDF', onPress: () => doPrint(true) },
    ]);
  };

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

  return (
    <View style={s.container}>
      <ManagerHeader
        size="sm"
        title="Order Lists"
        icon={<PackageIcon size={20} color="#fff" strokeWidth={2} />}
        rightSlot={
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {activeList && (
              <TouchableOpacity
                style={s.headerBtn}
                onPress={() => setShowHistory(true)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="View order list history"
              >
                <ListIcon size={17} color="#fff" strokeWidth={2} />
                <Text style={s.headerBtnText}>History</Text>
              </TouchableOpacity>
            )}
            {pendingRequestCount > 0 && (
              <TouchableOpacity
                style={[s.headerBtn, { backgroundColor: '#EF4444' }]}
                onPress={() => setShowReview(true)}
                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel={`View ${pendingRequestCount} pending employee requests`}
              >
                <ClipboardIcon size={17} color="#fff" strokeWidth={2} />
                <Text style={s.headerBtnText}>Requests ({pendingRequestCount})</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      >
        {/* Store Tabs */}
        <View style={s.storeTabs}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storeTabsInner}>
            {stores.map(store => {
              const isSel = selectedStoreId === store.id;
              return (
                <TouchableOpacity key={store.id} onPress={() => setSelectedStoreId(store.id)}
                  style={[s.storeTab, isSel && s.storeTabActive]}
                  hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
                  accessibilityRole="tab"
                  accessibilityLabel={`Select store ${store.name}`}
                >
                  <Text style={[s.storeTabText, isSel && s.storeTabTextActive]} numberOfLines={1}>
                    {store.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </ManagerHeader>

      {/* Content */}
      {!selectedStoreId ? (
        <View style={s.center}>
          <PackageIcon size={48} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>Select a store above</Text>
        </View>
      ) : listLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.managerPrimary} size="large" /></View>
      ) : listError ? (
        <ErrorState message="Failed to load the order list." onRetry={() => refetchList()} />
      ) : !activeList ? (
        <View style={s.center}>
          <PackageIcon size={56} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>No open list for {selectedStore?.name}</Text>
          <Text style={s.emptyText}>Open a new list to start adding items for this order.</Text>
          <TouchableOpacity style={[s.openListBtn, openListMutation.isPending && { opacity: 0.6 }]}
            onPress={() => openListMutation.mutate()} disabled={openListMutation.isPending}
            accessibilityRole="button"
            accessibilityLabel="Open new order list"
          >
            {openListMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.openListBtnText}>Open New List</Text>
            }
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {/* Stats + list controls bar */}
          <View style={s.listBanner}>
            <Text style={s.listName} numberOfLines={1}>{activeList.name}</Text>
            <View style={s.statsRow}>
              {(urgentItems.length > 0 || neededItems.length > 0) && (
                <View style={[s.statCard, { borderColor: '#F59E0B' }]}>
                  <Text style={[s.statNum, { color: '#D97706' }]}>{urgentItems.length + neededItems.length}</Text>
                  <Text style={s.statLabel}>Needed</Text>
                </View>
              )}
              {orderedItems.length > 0 && (
                <View style={[s.statCard, { borderColor: '#34D399' }]}>
                  <Text style={[s.statNum, { color: '#059669' }]}>{orderedItems.length}</Text>
                  <Text style={s.statLabel}>Ordered</Text>
                </View>
              )}
              {receivedItems.length > 0 && (
                <View style={[s.statCard, { borderColor: '#86EFAC' }]}>
                  <Text style={[s.statNum, { color: '#16A34A' }]}>{receivedItems.length}</Text>
                  <Text style={s.statLabel}>Received</Text>
                </View>
              )}
            </View>
            <View style={s.bannerActions}>
              <TouchableOpacity
                style={[s.bannerIconBtn, (isPrinting || items.length === 0) && { opacity: 0.35 }]}
                onPress={showPrintOptions}
                disabled={isPrinting || items.length === 0}
                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                accessibilityRole="button"
                accessibilityLabel="Print order list"
              >
                {isPrinting
                  ? <ActivityIndicator size="small" color={COLORS.textMuted} />
                  : <PrinterIcon size={18} color={COLORS.textMuted} strokeWidth={2} />
                }
              </TouchableOpacity>
              <TouchableOpacity
                style={s.closeListBtn}
                onPress={handleCloseList}
                disabled={closeListMutation.isPending}
                hitSlop={{ top: 7, bottom: 7, left: 4, right: 4 }}
                accessibilityRole="button"
                accessibilityLabel="Close list"
              >
                {closeListMutation.isPending
                  ? <ActivityIndicator size="small" color={COLORS.primary} />
                  : <Text style={s.closeListBtnText}>Close List</Text>
                }
              </TouchableOpacity>
            </View>
          </View>

          {/* Inline employee requests banner */}
          {pendingRequestCount > 0 && (
            <TouchableOpacity
              style={s.reqBanner}
              onPress={() => setShowReview(true)}
              activeOpacity={0.8}
              hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}
              accessibilityRole="button"
              accessibilityLabel={`${pendingRequestCount} employee request${pendingRequestCount !== 1 ? 's' : ''} waiting, tap to review`}
            >
              <ClipboardIcon size={16} color="#fff" strokeWidth={2.5} />
              <Text style={s.reqBannerText}>
                {pendingRequestCount} employee request{pendingRequestCount !== 1 ? 's' : ''} waiting — tap to review
              </Text>
              <Text style={s.reqBannerArrow}>›</Text>
            </TouchableOpacity>
          )}

          {/* Rows + pinned Add Row */}
          <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {items.length === 0 ? (
              <View style={[s.center, { flex: 1 }]}>
                <ClipboardIcon size={48} color={COLORS.border} strokeWidth={1.25} />
                <Text style={s.emptyTitle}>List is empty</Text>
                <Text style={s.emptyText}>Add an item below to get started.</Text>
              </View>
            ) : (
              <FadeSlideIn style={{ flex: 1 }}>
              <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={listRefetching} onRefresh={refetchList} tintColor={COLORS.managerPrimary} />}
              >
                {urgentItems.length > 0 && (
                  <>
                    <View style={[r.sectionHeader, { backgroundColor: '#FFF7ED', flexDirection: 'row', alignItems: 'center', gap: 5 }]}>
                      <ZapIcon size={12} color="#C2410C" strokeWidth={2.25} />
                      <Text style={[r.sectionLabel, { color: '#C2410C' }]}>URGENT — {urgentItems.length} item{urgentItems.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {urgentItems.map(item => (
                      <ItemRow key={item.id} item={item} onEdit={setEditingItem} onRemove={handleRemove}
                        onMarkOrdered={(it) => statusMutation.mutate({ id: it.id, status: 'ORDERED' })}
                        onMarkReceived={(it) => statusMutation.mutate({ id: it.id, status: 'RECEIVED' })} />
                    ))}
                  </>
                )}
                {neededItems.length > 0 && (
                  <>
                    <View style={[r.sectionHeader, { backgroundColor: '#FFFBEB' }]}>
                      <Text style={[r.sectionLabel, { color: '#92400E' }]}>Needed — {neededItems.length} item{neededItems.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {neededItems.map(item => (
                      <ItemRow key={item.id} item={item} onEdit={setEditingItem} onRemove={handleRemove}
                        onMarkOrdered={(it) => statusMutation.mutate({ id: it.id, status: 'ORDERED' })}
                        onMarkReceived={(it) => statusMutation.mutate({ id: it.id, status: 'RECEIVED' })} />
                    ))}
                  </>
                )}
                {orderedItems.length > 0 && (
                  <>
                    <View style={[r.sectionHeader, { backgroundColor: '#F0FDF4' }]}>
                      <Text style={[r.sectionLabel, { color: '#166534' }]}>Ordered — {orderedItems.length} item{orderedItems.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {orderedItems.map(item => (
                      <ItemRow key={item.id} item={item} onEdit={setEditingItem} onRemove={handleRemove}
                        onMarkOrdered={(it) => statusMutation.mutate({ id: it.id, status: 'ORDERED' })}
                        onMarkReceived={(it) => statusMutation.mutate({ id: it.id, status: 'RECEIVED' })} />
                    ))}
                  </>
                )}
                {receivedItems.length > 0 && (
                  <>
                    <View style={[r.sectionHeader, { backgroundColor: '#F8FAFC' }]}>
                      <Text style={[r.sectionLabel, { color: '#6B7280' }]}>Received — {receivedItems.length} item{receivedItems.length !== 1 ? 's' : ''}</Text>
                    </View>
                    {receivedItems.map(item => (
                      <ItemRow key={item.id} item={item} onEdit={setEditingItem} onRemove={handleRemove}
                        onMarkOrdered={(it) => statusMutation.mutate({ id: it.id, status: 'ORDERED' })}
                        onMarkReceived={(it) => statusMutation.mutate({ id: it.id, status: 'RECEIVED' })} />
                    ))}
                  </>
                )}
              </ScrollView>
              </FadeSlideIn>
            )}

            {/* Quick Add Bar — always pinned at bottom */}
            <QuickAddBar listId={activeList.id} storeId={selectedStoreId!} categories={categories} />
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
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },

  headerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  headerBtnText: { fontSize: 12, color: '#fff', fontWeight: '600' },

  storeTabs:      { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  storeTabsInner: { paddingHorizontal: 12, paddingVertical: 10, gap: 8, flexDirection: 'row' },
  storeTab:       { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: '#fff' },
  storeTabActive:     { backgroundColor: COLORS.managerPrimary, borderColor: COLORS.managerPrimary },
  storeTabText:       { fontSize: 13, fontWeight: '600', color: COLORS.text },
  storeTabTextActive: { color: '#fff' },

  listBanner: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10,
  },
  listName:    { fontSize: 13, fontWeight: '700', color: COLORS.text },
  statsRow:    { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 12,
    borderWidth: 1.5, backgroundColor: '#fff',
  },
  statNum:   { fontSize: 20, fontWeight: '900', lineHeight: 24 },
  statLabel: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.4 },
  bannerActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  bannerIconBtn: { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },
  closeListBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.primary },
  closeListBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.primary },

  openListBtn: {
    marginTop: 20, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 14, backgroundColor: COLORS.managerPrimary,
    shadowColor: COLORS.managerPrimary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  openListBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  // Inline employee requests banner
  reqBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#EF4444',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  reqBannerText:  { flex: 1, fontSize: 13, fontWeight: '700', color: '#fff' },
  reqBannerArrow: { fontSize: 18, color: 'rgba(255,255,255,0.8)', fontWeight: '300' },

  // Modal / sheet
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '92%',
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle:  { fontSize: 18, fontWeight: '700', color: COLORS.text },
  closeBtn:    { padding: 10 },

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
  catNewTriggerText: { fontSize: 14, color: COLORS.managerPrimary, fontWeight: '600' },
  catNewForm: { gap: 10 },
  catNewInput: {
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.managerPrimary,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: COLORS.text,
  },
  catNewHint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 18 },
  catNewSubmitBtn: {
    backgroundColor: COLORS.managerPrimary, borderRadius: 10, paddingVertical: 12, alignItems: 'center',
  },
  catNewSubmitText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  // Category autocomplete (EditItemSheet)
  catAutoRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  catAutoClear:   { padding: 6 },
  catSuggestBox:  {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    backgroundColor: '#fff', marginBottom: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 8, elevation: 6, overflow: 'hidden',
  },
  catSuggestRow:       { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  catSuggestRowActive: { backgroundColor: '#EEF2FF' },
  catSuggestText:      { fontSize: 14, color: COLORS.text },
  catSuggestTextActive:{ fontSize: 14, color: COLORS.managerPrimary, fontWeight: '600' },

  submitBtn:     { backgroundColor: COLORS.managerPrimary, borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Full-screen modals
  modalFullHeader: {
    backgroundColor: COLORS.managerPrimary, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16,
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
  restoreItemSelected: { borderColor: COLORS.managerPrimary, backgroundColor: '#EEF2FF' },
  restoreCheckbox:     { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
});

// ─── Row & Section Styles ────────────────────────────────────────────────────

const r = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
    gap: 10,
  },
  rowUrgent: { backgroundColor: '#FFFBF5' },
  urgentBar: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    width: 3, backgroundColor: '#F97316', borderRadius: 2,
  },
  body: { flex: 1, gap: 4 },
  topLine: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 4 },
  name:      { fontSize: 14, fontWeight: '600', color: COLORS.text },
  nameStrike:{ textDecorationLine: 'line-through', color: COLORS.textMuted },
  qty:       { fontSize: 12, color: COLORS.textMuted, fontWeight: '400' },
  metaLine:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  catPill: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#EEF2FF',
  },
  catPillText: { fontSize: 11, fontWeight: '600', color: '#4F46E5' },
  staffBadge: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
    backgroundColor: '#F0FDF4',
  },
  staffBadgeText: { fontSize: 11, fontWeight: '600', color: '#16A34A' },
  right: { alignItems: 'flex-end', gap: 6 },
  actionBtn: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: 8,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  donePill: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
    backgroundColor: '#F3F4F6',
  },
  donePillText: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  moreBtn:     { paddingVertical: 2 },
  moreBtnText: { fontSize: 18, color: COLORS.textMuted, letterSpacing: 1, lineHeight: 18 },

  sectionHeader: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  sectionLabel: { fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
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
  },
  addRow: {
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
    backgroundColor: COLORS.managerPrimary, alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.managerPrimary, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3,
  },
});

// ─── Quick Add Bar Styles ─────────────────────────────────────────────────────

const qa = StyleSheet.create({
  wrapper: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
    shadowColor: '#000', shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 8,
  },

  // Suggestion dropdown — appears at top of wrapper (above inputs)
  suggBox: {
    borderBottomWidth: 1, borderBottomColor: '#F1F3F5',
    backgroundColor: '#fff',
  },
  suggRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
  },
  suggRowActive:  { backgroundColor: '#EEF2FF' },
  suggText:       { fontSize: 14, color: COLORS.text, flex: 1 },
  suggTextActive: { fontSize: 14, color: COLORS.managerPrimary, fontWeight: '600' },
  suggCount:      { fontSize: 12, color: COLORS.textMuted, marginLeft: 8 },

  // Category search row
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#F1F3F5',
  },
  catLabel: { fontSize: 12, fontWeight: '600', color: '#6C757D', width: 66 },
  catInput: {
    flex: 1, backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    fontSize: 13, color: COLORS.text,
  },
  catClearBtn: { padding: 6 },
  catNewBtn: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center',
  },

  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  input: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: COLORS.text,
  },
  scanBtn: {
    width: 40, height: 44, borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  addBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.managerPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.managerPrimary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35, shadowRadius: 6, elevation: 5,
  },
  addBtnDim: { opacity: 0.4 },

  // Quick Pad
  quickPad: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, borderTopWidth: 1, borderTopColor: '#F1F3F5' },
  quickPadLabel: { fontSize: 10, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  quickTile: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#F8FAFC',
    maxWidth: 130,
  },
  quickTileName: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  quickTileCat:  { fontSize: 11, color: COLORS.textMuted, marginTop: 1 },
});
