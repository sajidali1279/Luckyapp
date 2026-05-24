import React, { useState, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  RefreshControl, StatusBar, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { employeeRequestApi, orderCategoriesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  ClipboardIcon, PlusIcon, CheckCircleIcon,
  XIcon, AlertTriangleIcon, PackageIcon, Trash2Icon,
} from '../../components/Icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type RequestType = 'LOW_STOCK' | 'CUSTOMER_REQUEST';

interface RequestLine {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  notes?: string;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string;
  rejectionNote?: string;
}

interface MyRequest {
  id: string;
  status: 'PENDING' | 'REVIEWED';
  note?: string;
  createdAt: string;
  lines: RequestLine[];
  reviewedBy?: { id: string; name: string };
  reviewedAt?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const REJECTION_LABELS: Record<string, string> = {
  NO_SUPPLIER:   'No supplier available',
  OUT_OF_BUDGET: 'Out of budget',
  IN_STOCK:      'Already in stock',
  DUPLICATE:     'Duplicate item',
  OTHER:         'Other reason',
};

const REQUEST_TYPES: { value: RequestType; label: string; hint: string }[] = [
  { value: 'LOW_STOCK',        label: 'Low Stock',       hint: 'Items that are running low and need restocking' },
  { value: 'CUSTOMER_REQUEST', label: 'Customer Request', hint: 'Items customers have asked for' },
];

type CommittedLine = {
  key: string;
  name: string;
  quantity: string;
  category: string;
  notes: string;
};

function makeKey() { return `${Date.now()}-${Math.random()}`; }

// ─── Category Auto-Input ──────────────────────────────────────────────────────

function CategoryAutoInput({ value, onChange, categories }: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
}) {
  const [open, setOpen] = useState(false);

  const suggestions = categories.filter(
    c => c.toLowerCase().includes(value.toLowerCase()) && c.toLowerCase() !== value.toLowerCase()
  ).slice(0, 5);

  return (
    <View style={{ marginTop: 8 }}>
      <TextInput
        style={s.tileInput}
        value={value}
        onChangeText={v => { onChange(v); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder="Category  (type or leave blank)"
        placeholderTextColor="#B0B8C4"
        maxLength={80}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="next"
      />
      {open && suggestions.length > 0 && (
        <View style={s.suggestBox}>
          {suggestions.map(c => (
            <TouchableOpacity
              key={c}
              style={s.suggestRow}
              onPress={() => { onChange(c); setOpen(false); }}
            >
              <Text style={s.suggestText}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Request Form ─────────────────────────────────────────────────────────────

interface RequestFormProps {
  categories: string[];
  onSubmitted: () => void;
}

function RequestForm({ categories, onSubmitted }: RequestFormProps) {
  // Step 1 — type selection
  const [requestType, setRequestType] = useState<RequestType | null>(null);

  // Active tile state
  const [activeName,     setActiveName]     = useState('');
  const [activeQty,      setActiveQty]      = useState('');
  const [activeCategory, setActiveCategory] = useState('');
  const [activeNotes,    setActiveNotes]    = useState('');

  // Committed items list
  const [committed, setCommitted] = useState<CommittedLine[]>([]);

  // Overall note
  const [overallNote, setOverallNote] = useState('');

  const nameRef = useRef<TextInput>(null);

  const clearTile = () => {
    setActiveName('');
    setActiveQty('');
    setActiveCategory('');
    setActiveNotes('');
    setTimeout(() => nameRef.current?.focus(), 80);
  };

  const handleAddToList = () => {
    if (!activeName.trim()) {
      Toast.show({ type: 'error', text1: 'Enter an item name first' });
      return;
    }
    setCommitted(prev => [...prev, {
      key: makeKey(),
      name: activeName.trim(),
      quantity: activeQty.trim(),
      category: activeCategory,
      notes: activeNotes.trim(),
    }]);
    clearTile();
  };

  const handleRemoveCommitted = (key: string) => {
    setCommitted(prev => prev.filter(l => l.key !== key));
  };

  const submitMutation = useMutation({
    mutationFn: () => {
      // Include the active tile if it has a name (don't require "Add to List" for single items)
      const activeLine = activeName.trim()
        ? [{ name: activeName.trim(), quantity: activeQty.trim() || undefined, category: activeCategory || undefined, notes: activeNotes.trim() || undefined }]
        : [];
      const allLines = [
        ...committed.map(l => ({ name: l.name, quantity: l.quantity || undefined, category: l.category || undefined, notes: l.notes || undefined })),
        ...activeLine,
      ];
      const typeLabel = requestType === 'LOW_STOCK' ? 'Low Stock' : requestType === 'CUSTOMER_REQUEST' ? 'Customer Request' : '';
      const noteStr = [typeLabel && `[${typeLabel}]`, overallNote.trim()].filter(Boolean).join(' ');
      return employeeRequestApi.submit({ note: noteStr || undefined, lines: allLines });
    },
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Request submitted', text2: 'Your manager will review it soon' });
      setRequestType(null);
      setCommitted([]);
      clearTile();
      setOverallNote('');
      onSubmitted();
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to submit request' }),
  });

  const handleSubmit = () => {
    const hasActive = !!activeName.trim();
    const total = committed.length + (hasActive ? 1 : 0);
    if (total === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one item' });
      return;
    }
    submitMutation.mutate();
  };

  // ── Step 1: Type picker ───────────────────────────────────────────────────

  if (!requestType) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Text style={s.typePrompt}>What are you requesting?</Text>
        <Text style={s.typeHint}>Choose a reason to help your manager understand the request.</Text>
        {REQUEST_TYPES.map(t => (
          <TouchableOpacity key={t.value} style={s.typeCard} onPress={() => setRequestType(t.value)} activeOpacity={0.75}>
            <View style={s.typeCardInner}>
              <Text style={s.typeCardLabel}>{t.label}</Text>
              <Text style={s.typeCardHint}>{t.hint}</Text>
            </View>
            <Text style={s.typeChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // ── Step 2: Item entry ────────────────────────────────────────────────────

  const typeConfig = REQUEST_TYPES.find(t => t.value === requestType)!;
  const totalCount = committed.length + (activeName.trim() ? 1 : 0);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type badge + change */}
        <View style={s.typeBadgeRow}>
          <View style={s.typeBadge}>
            <Text style={s.typeBadgeText}>{typeConfig.label}</Text>
          </View>
          <TouchableOpacity onPress={() => { setRequestType(null); setCommitted([]); clearTile(); }}>
            <Text style={s.typeChangeBtn}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* ── Active Tile ── */}
        <View style={s.activeTile}>
          <Text style={s.tileLabel}>
            {committed.length === 0 ? 'Add first item' : 'Add another item'}
          </Text>

          {/* Name */}
          <TextInput
            ref={nameRef}
            style={s.tileInput}
            value={activeName}
            onChangeText={setActiveName}
            placeholder="Item name *"
            placeholderTextColor="#B0B8C4"
            maxLength={120}
            autoCapitalize="sentences"
            autoCorrect={false}
            returnKeyType="next"
          />

          {/* Qty */}
          <TextInput
            style={[s.tileInput, { marginTop: 8 }]}
            value={activeQty}
            onChangeText={setActiveQty}
            placeholder="Quantity / amount  (e.g. 2 cases)"
            placeholderTextColor="#B0B8C4"
            maxLength={60}
            returnKeyType="next"
          />

          {/* Category */}
          <CategoryAutoInput
            value={activeCategory}
            onChange={setActiveCategory}
            categories={categories}
          />

          {/* Notes */}
          <TextInput
            style={[s.tileInput, s.tileTextArea, { marginTop: 8 }]}
            value={activeNotes}
            onChangeText={setActiveNotes}
            placeholder="Notes for manager  (optional)"
            placeholderTextColor="#B0B8C4"
            maxLength={300}
            multiline
            numberOfLines={2}
            textAlignVertical="top"
          />

          {/* Add to List */}
          <TouchableOpacity
            style={[s.addToListBtn, !activeName.trim() && s.addToListBtnDim]}
            onPress={handleAddToList}
            disabled={!activeName.trim()}
            activeOpacity={0.8}
          >
            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
            <Text style={s.addToListBtnText}>Add to List</Text>
          </TouchableOpacity>
        </View>

        {/* ── Committed List ── */}
        {committed.length > 0 && (
          <View style={s.committedSection}>
            <Text style={s.committedHeader}>
              {committed.length} item{committed.length !== 1 ? 's' : ''} added
            </Text>
            {committed.map((line, idx) => (
              <View key={line.key} style={s.committedRow}>
                <View style={s.committedNum}>
                  <Text style={s.committedNumText}>{idx + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.committedName} numberOfLines={1}>{line.name}</Text>
                  <Text style={s.committedMeta} numberOfLines={1}>
                    {[line.quantity && `qty: ${line.quantity}`, line.category].filter(Boolean).join(' · ') || 'no details'}
                  </Text>
                  {line.notes ? <Text style={s.committedNote} numberOfLines={1}>{line.notes}</Text> : null}
                </View>
                <TouchableOpacity style={s.removeBtn} onPress={() => handleRemoveCommitted(line.key)}>
                  <Trash2Icon size={15} color="#DC2626" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Overall note */}
        <View style={s.overallNoteCard}>
          <Text style={s.overallNoteLabel}>Overall note  <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
          <TextInput
            style={[s.tileInput, s.tileTextArea]}
            value={overallNote}
            onChangeText={setOverallNote}
            placeholder="Any context for your manager..."
            placeholderTextColor="#B0B8C4"
            maxLength={300}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, (submitMutation.isPending || totalCount === 0) && { opacity: 0.5 }]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending || totalCount === 0}
        >
          {submitMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>
                Submit Request{totalCount > 0 ? ` (${totalCount} item${totalCount !== 1 ? 's' : ''})` : ''}
              </Text>
          }
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── My Requests ──────────────────────────────────────────────────────────────

function MyRequests() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-item-requests'],
    queryFn: employeeRequestApi.mine,
    refetchInterval: 60000,
  });

  const requests: MyRequest[] = data?.data?.data || [];

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>;
  }

  if (requests.length === 0) {
    return (
      <View style={s.center}>
        <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
        <Text style={s.emptyTitle}>No requests yet</Text>
        <Text style={s.emptyText}>Submit your first request using the "New Request" tab.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.secondary} />}
    >
      {requests.map(req => {
        const isExpanded   = expandedId === req.id;
        const isPending    = req.status === 'PENDING';
        const accepted     = req.lines.filter(l => l.status === 'ACCEPTED').length;
        const rejected     = req.lines.filter(l => l.status === 'REJECTED').length;

        // Extract type label from note prefix "[Low Stock]" or "[Customer Request]"
        const typeMatch = req.note?.match(/^\[([^\]]+)\]/);
        const typeLabel = typeMatch ? typeMatch[1] : null;
        const noteBody  = typeLabel ? req.note?.replace(/^\[[^\]]+\]\s*/, '') : req.note;

        return (
          <View key={req.id} style={s.reqCard}>
            <TouchableOpacity style={s.reqCardHeader} onPress={() => setExpandedId(isExpanded ? null : req.id)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <View style={[s.statusDot, { backgroundColor: isPending ? '#F59E0B' : '#22C55E' }]} />
                  <Text style={s.reqCardDate}>
                    {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <View style={[s.statusBadge, isPending ? s.statusBadgePending : s.statusBadgeDone]}>
                    <Text style={[s.statusBadgeText, isPending ? { color: '#D97706' } : { color: '#16A34A' }]}>
                      {isPending ? 'Pending' : 'Reviewed'}
                    </Text>
                  </View>
                  {typeLabel && (
                    <View style={s.typeLabelBadge}>
                      <Text style={s.typeLabelText}>{typeLabel}</Text>
                    </View>
                  )}
                </View>
                <Text style={s.reqCardMeta}>
                  {req.lines.length} item{req.lines.length !== 1 ? 's' : ''}
                  {!isPending && ` · ${accepted} accepted, ${rejected} rejected`}
                  {isPending && ' · Waiting for review'}
                </Text>
                {req.reviewedBy && <Text style={s.reqCardMeta}>Reviewed by {req.reviewedBy.name}</Text>}
              </View>
              <Text style={{ fontSize: 18, color: COLORS.textMuted }}>{isExpanded ? '−' : '+'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={s.reqLines}>
                {noteBody ? (
                  <View style={s.reqNoteBox}>
                    <Text style={s.reqNoteLabel}>Your note</Text>
                    <Text style={s.reqNoteText}>{noteBody}</Text>
                  </View>
                ) : null}
                {req.lines.map(line => (
                  <View key={line.id} style={[
                    s.lineItem,
                    line.status === 'ACCEPTED' && s.lineItemAccepted,
                    line.status === 'REJECTED' && s.lineItemRejected,
                  ]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.lineItemName}>{line.name}</Text>
                      {line.quantity && <Text style={s.lineItemMeta}>Qty: {line.quantity}</Text>}
                      {line.category && <Text style={s.lineItemMeta}>Cat: {line.category}</Text>}
                      {line.notes && <Text style={s.lineItemNote}>{line.notes}</Text>}
                      {line.status === 'REJECTED' && line.rejectionReason && (
                        <Text style={s.rejectionText}>
                          Reason: {REJECTION_LABELS[line.rejectionReason] || line.rejectionReason}
                          {line.rejectionNote ? ` — ${line.rejectionNote}` : ''}
                        </Text>
                      )}
                    </View>
                    <View style={[
                      s.lineStatus,
                      line.status === 'ACCEPTED' && { backgroundColor: '#DCFCE7' },
                      line.status === 'REJECTED' && { backgroundColor: '#FEE2E2' },
                      line.status === 'PENDING'  && { backgroundColor: '#FEF3C7' },
                    ]}>
                      {line.status === 'ACCEPTED' && <CheckCircleIcon size={14} color="#16A34A" strokeWidth={2.5} />}
                      {line.status === 'REJECTED' && <XIcon size={14} color="#DC2626" strokeWidth={2.5} />}
                      {line.status === 'PENDING'  && <AlertTriangleIcon size={14} color="#D97706" strokeWidth={2.5} />}
                      <Text style={[
                        s.lineStatusText,
                        line.status === 'ACCEPTED' && { color: '#16A34A' },
                        line.status === 'REJECTED' && { color: '#DC2626' },
                        line.status === 'PENDING'  && { color: '#D97706' },
                      ]}>
                        {line.status === 'ACCEPTED' ? 'Added' : line.status === 'REJECTED' ? 'Rejected' : 'Pending'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function EmployeeOrderListScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'new' | 'mine'>('new');

  const { data: catData } = useQuery({
    queryKey: ['order-categories'],
    queryFn: orderCategoriesApi.getApproved,
    staleTime: 10 * 60 * 1000,
  });
  const categories: string[] = catData?.data?.data || [];

  if (!user?.storeIds?.[0]) {
    return (
      <SafeAreaView style={s.container}>
        <View style={s.center}>
          <ClipboardIcon size={48} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>No Store Assigned</Text>
          <Text style={s.emptyText}>Contact your manager to be assigned to a store.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PackageIcon size={20} color="#fff" strokeWidth={2} />
          <Text style={s.headerTitle}>Request Items</Text>
        </View>
        <Text style={s.headerSub}>Ask your manager to order something</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity style={[s.tab, activeTab === 'new' && s.tabActive]} onPress={() => setActiveTab('new')}>
          <Text style={[s.tabText, activeTab === 'new' && s.tabTextActive]}>New Request</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'mine' && s.tabActive]} onPress={() => setActiveTab('mine')}>
          <Text style={[s.tabText, activeTab === 'mine' && s.tabTextActive]}>My Requests</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'new' ? (
        <RequestForm
          categories={categories}
          onSubmitted={() => {
            qc.invalidateQueries({ queryKey: ['my-item-requests'] });
            setActiveTab('mine');
          }}
        />
      ) : (
        <MyRequests />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  tabs:          { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:           { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: COLORS.secondary },
  tabText:       { fontSize: 14, fontWeight: '500', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.secondary, fontWeight: '700' },

  // ── Type picker ──────────────────────────────────────────────────────────
  typePrompt: { fontSize: 20, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  typeHint:   { fontSize: 14, color: COLORS.textMuted, marginBottom: 8, lineHeight: 20 },
  typeCard: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: 18, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  typeCardInner: { flex: 1 },
  typeCardLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  typeCardHint:  { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  typeChevron:   { fontSize: 22, color: COLORS.textMuted, fontWeight: '300' },

  // ── Item entry ───────────────────────────────────────────────────────────
  typeBadgeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  typeBadge:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: COLORS.secondary },
  typeBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  typeChangeBtn: { fontSize: 13, color: COLORS.secondary, fontWeight: '600' },

  activeTile: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.secondary,
    padding: 14, marginBottom: 14,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  tileLabel: { fontSize: 12, fontWeight: '700', color: COLORS.secondary, marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tileInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 15, color: COLORS.text,
  },
  tileTextArea: { minHeight: 56, textAlignVertical: 'top', paddingTop: 10 },

  // Category autocomplete
  suggestBox: {
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, marginTop: 2, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 4,
  },
  suggestRow: {
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
  },
  suggestText: { fontSize: 14, color: COLORS.text },

  addToListBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: 14, paddingVertical: 13, borderRadius: 12,
    backgroundColor: COLORS.secondary,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },
  addToListBtnDim: { opacity: 0.35, shadowOpacity: 0 },
  addToListBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  // ── Committed list ───────────────────────────────────────────────────────
  committedSection: { marginBottom: 14 },
  committedHeader:  { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  committedRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fff', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 6,
  },
  committedNum:     { width: 24, height: 24, borderRadius: 12, backgroundColor: '#E0E7FF', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  committedNumText: { fontSize: 11, fontWeight: '800', color: '#4F46E5' },
  committedName:    { fontSize: 14, fontWeight: '600', color: COLORS.text },
  committedMeta:    { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  committedNote:    { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 1 },
  removeBtn:        { padding: 4, marginTop: 2 },

  // ── Overall note ─────────────────────────────────────────────────────────
  overallNoteCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  overallNoteLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Submit ───────────────────────────────────────────────────────────────
  submitBtn:     { backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Empty / shared ───────────────────────────────────────────────────────
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  // ── My Requests ──────────────────────────────────────────────────────────
  reqCard:       { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  reqCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  reqCardDate:   { fontSize: 14, fontWeight: '600', color: COLORS.text },
  reqCardMeta:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusBadgePending: { backgroundColor: '#FEF3C7' },
  statusBadgeDone:    { backgroundColor: '#DCFCE7' },
  statusBadgeText:    { fontSize: 11, fontWeight: '700' },
  typeLabelBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#EEF2FF' },
  typeLabelText:  { fontSize: 11, fontWeight: '600', color: '#4F46E5' },

  reqLines:     { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12, gap: 8 },
  reqNoteBox:   { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, marginBottom: 8 },
  reqNoteLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  reqNoteText:  { fontSize: 13, color: COLORS.text },

  lineItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 10, borderRadius: 10, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lineItemAccepted: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  lineItemRejected: { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  lineItemName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  lineItemMeta: { fontSize: 12, color: COLORS.textMuted },
  lineItemNote: { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic' },
  rejectionText: { fontSize: 12, color: '#DC2626', marginTop: 4 },

  lineStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
  },
  lineStatusText: { fontSize: 11, fontWeight: '700' },
});
