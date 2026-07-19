import React, { useState, useRef, useEffect, useCallback } from 'react';
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
  XIcon, AlertTriangleIcon, PackageIcon, QrCodeScanIcon,
} from '../../components/Icons';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import type { BarcodeResult } from '../../components/BarcodeScannerModal';
import FadeSlideIn from '../../components/FadeSlideIn';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import { useHighlightParam } from '../../hooks/useHighlightParam';

// ─── Types ────────────────────────────────────────────────────────────────────

type RequestType = 'LOW_STOCK' | 'CUSTOMER_REQUEST';

interface Suggestion { name: string; category: string | null; count: number }

interface CartItem {
  key: string;
  name: string;
  quantity: string;
  category: string;
  notes: string;
}

interface OrderListItemStatus {
  status: 'PENDING' | 'ORDERED' | 'RECEIVED' | 'REMOVED';
  orderedAt?: string | null;
  receivedAt?: string | null;
}

interface RequestLine {
  id: string; name: string; quantity?: string; category?: string;
  notes?: string; status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  rejectionReason?: string; rejectionNote?: string;
  listItem?: OrderListItemStatus | null;
}

interface MyRequest {
  id: string; status: 'PENDING' | 'REVIEWED'; requestType: string;
  note?: string; createdAt: string; lines: RequestLine[];
  reviewedBy?: { id: string; name: string };
}

// ─── Config ───────────────────────────────────────────────────────────────────

const ORDER_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:  { label: 'On order list', color: '#16A34A', bg: '#DCFCE7' },
  ORDERED:  { label: 'Ordered',       color: '#1D4ED8', bg: '#DBEAFE' },
  RECEIVED: { label: 'Received ✓',   color: '#065F46', bg: '#D1FAE5' },
  REMOVED:  { label: 'Removed',       color: '#6B7280', bg: '#F3F4F6' },
};

const REJECTION_LABELS: Record<string, string> = {
  NO_SUPPLIER:   'No supplier available',
  OUT_OF_BUDGET: 'Out of budget',
  IN_STOCK:      'Already in stock',
  DUPLICATE:     'Duplicate item',
  OTHER:         'Other reason',
};

function makeKey() { return `${Date.now()}-${Math.random()}`; }

// ─── New Request Form ─────────────────────────────────────────────────────────

function NewRequestForm({ categories, onSubmitted }: { categories: string[]; onSubmitted: () => void }) {
  const [requestType, setRequestType] = useState<RequestType>('LOW_STOCK');
  const [search,      setSearch]      = useState('');
  const [debSearch,   setDebSearch]   = useState('');
  const [showSugg,    setShowSugg]    = useState(false);
  const [cart,        setCart]        = useState<CartItem[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [note,        setNote]        = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const nameRef = useRef<TextInput>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 220);
    return () => clearTimeout(t);
  }, [search]);

  const { data: suggData } = useQuery({
    queryKey: ['emp-name-sugg', debSearch],
    queryFn: () => employeeRequestApi.getSuggestions(debSearch),
    enabled: debSearch.trim().length >= 2,
    staleTime: 60_000,
  });
  const suggestions: Suggestion[] = suggData?.data?.data || [];

  function handleScanResult(result: BarcodeResult) {
    setShowScanner(false);
    const name = result.name.trim() || result.barcode;
    if (cart.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      Toast.show({ type: 'info', text1: `"${name}" already in list` });
      return;
    }
    const key = makeKey();
    setCart(prev => [...prev, { key, name, quantity: result.quantity || '', category: result.category || '', notes: '' }]);
    setExpandedKey(key);
  }

  const addItem = useCallback((name: string, category = '') => {
    if (cart.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      Toast.show({ type: 'info', text1: `"${name}" already in list` });
      setSearch('');
      return;
    }
    const key = makeKey();
    setCart(prev => [...prev, { key, name, quantity: '', category, notes: '' }]);
    setSearch('');
    setShowSugg(false);
    setTimeout(() => nameRef.current?.focus(), 40);
  }, [cart]);

  const addManual = () => {
    const name = search.trim();
    if (!name) return;
    // Auto-fill category from first suggestion if name matches
    const found = suggestions.find(s => s.name.toLowerCase() === name.toLowerCase());
    addItem(name, found?.category || '');
  };

  const pickSugg = (sg: Suggestion) => addItem(sg.name, sg.category || '');

  const updateCart = (key: string, field: keyof CartItem, value: string) =>
    setCart(prev => prev.map(c => c.key === key ? { ...c, [field]: value } : c));

  const removeItem = (key: string) => setCart(prev => prev.filter(c => c.key !== key));

  // Silently submit new categories for approval
  const autoSubmitNewCats = (usedCats: string[]) => {
    const approvedLower = categories.map(c => c.toLowerCase());
    const newCats = usedCats.filter(c => c && !approvedLower.includes(c.toLowerCase()));
    newCats.forEach(cat => orderCategoriesApi.submitNew(cat).catch(() => {}));
  };

  const submitMut = useMutation({
    mutationFn: () => {
      const lines = cart.map(c => ({
        name:     c.name,
        quantity: c.quantity.trim() || undefined,
        category: c.category.trim() || undefined,
        notes:    c.notes.trim() || undefined,
      }));
      autoSubmitNewCats(cart.map(c => c.category));
      return employeeRequestApi.submit({ requestType, note: note.trim() || undefined, lines });
    },
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Request submitted!', text2: 'Your manager will review it shortly.' });
      setCart([]); setSearch(''); setNote('');
      onSubmitted();
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to submit' }),
  });

  const canSubmit = cart.length > 0 && !submitMut.isPending;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <FadeSlideIn>
        {/* Type chips */}
        <View style={f.typeRow}>
          <TouchableOpacity
            style={[f.typeChip, requestType === 'LOW_STOCK' && f.typeChipActive]}
            onPress={() => setRequestType('LOW_STOCK')}
            accessibilityRole="tab"
            accessibilityLabel="Select request type: Low Stock"
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          >
            <Text style={[f.typeChipText, requestType === 'LOW_STOCK' && f.typeChipTextActive]}>📉 Low Stock</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[f.typeChip, requestType === 'CUSTOMER_REQUEST' && f.typeChipActive]}
            onPress={() => setRequestType('CUSTOMER_REQUEST')}
            accessibilityRole="tab"
            accessibilityLabel="Select request type: Customer Ask"
            hitSlop={{ top: 5, bottom: 5, left: 5, right: 5 }}
          >
            <Text style={[f.typeChipText, requestType === 'CUSTOMER_REQUEST' && f.typeChipTextActive]}>🙋 Customer Ask</Text>
          </TouchableOpacity>
        </View>
        <Text style={f.typeHint}>Low Stock helps track what regularly runs out. Customer Ask flags something a customer specifically wanted.</Text>

        {/* Search / add input */}
        <View style={f.searchWrapper}>
          <View style={f.searchRow}>
            {/* Scan button */}
            <TouchableOpacity
              style={f.scanBtn}
              onPress={() => setShowScanner(true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Scan barcode to add item"
            >
              <QrCodeScanIcon size={22} color="#fff" strokeWidth={2} />
            </TouchableOpacity>

            <View style={{ flex: 1, position: 'relative' }}>
              <TextInput
                ref={nameRef}
                style={f.searchInput}
                value={search}
                onChangeText={v => { setSearch(v); setShowSugg(true); }}
                onFocus={() => setShowSugg(true)}
                onBlur={() => setTimeout(() => setShowSugg(false), 140)}
                onSubmitEditing={() => { if (suggestions.length > 0 && showSugg) pickSugg(suggestions[0]); else addManual(); }}
                placeholder="Search item name…"
                placeholderTextColor="#B0B8C4"
                returnKeyType="done"
                blurOnSubmit={false}
                autoCorrect={false}
                autoCapitalize="sentences"
                maxLength={120}
              />
              {/* Suggestions dropdown */}
              {showSugg && suggestions.length > 0 && (
                <View style={f.suggBox}>
                  {suggestions.map(sg => (
                    <TouchableOpacity
                      key={sg.name}
                      style={f.suggRow}
                      onPress={() => pickSugg(sg)}
                      accessibilityRole="button"
                      accessibilityLabel={`Add ${sg.name}${sg.category ? `, ${sg.category}` : ''} to request`}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Text style={f.suggName}>{sg.name}</Text>
                      {sg.category ? <Text style={f.suggCat}>{sg.category}</Text> : null}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            <TouchableOpacity
              style={[f.addBtn, !search.trim() && f.addBtnDim]}
              onPress={addManual}
              disabled={!search.trim()}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Add item to request"
            >
              <PlusIcon size={22} color="#fff" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
          <Text style={f.searchHint}>Type to search from order history, or add any item manually.</Text>
        </View>

        {/* Cart */}
        {cart.length > 0 && (
          <View style={f.cartSection}>
            <Text style={f.cartLabel}>{cart.length} item{cart.length !== 1 ? 's' : ''} to request</Text>
            {cart.map(item => {
              const isExpanded = expandedKey === item.key;
              return (
                <View key={item.key} style={f.cartItem}>
                  <View style={f.cartItemTop}>
                    <Text style={f.cartItemName} numberOfLines={1}>{item.name}</Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                      <TouchableOpacity
                        style={f.editDetailBtn}
                        onPress={() => setExpandedKey(isExpanded ? null : item.key)}
                        accessibilityRole="button"
                        accessibilityLabel={`${isExpanded ? 'Hide' : 'Edit'} details for ${item.name}`}
                        hitSlop={{ top: 12, bottom: 12, left: 10, right: 10 }}
                      >
                        <Text style={f.editDetailBtnText}>{isExpanded ? 'Done' : 'Details'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={f.removeBtn}
                        onPress={() => removeItem(item.key)}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${item.name} from request`}
                        hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
                      >
                        <XIcon size={14} color="#DC2626" strokeWidth={2.5} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Quick meta preview */}
                  {!isExpanded && (item.quantity || item.category) && (
                    <Text style={f.cartMeta}>
                      {[item.quantity, item.category].filter(Boolean).join(' · ')}
                    </Text>
                  )}

                  {/* Expanded detail fields */}
                  {isExpanded && (
                    <View style={f.detailFields}>
                      <TextInput
                        style={f.detailInput}
                        value={item.quantity}
                        onChangeText={v => updateCart(item.key, 'quantity', v)}
                        placeholder="Qty / amount  (e.g. 2 cases)"
                        placeholderTextColor="#B0B8C4"
                        maxLength={60}
                      />
                      <TextInput
                        style={f.detailInput}
                        value={item.category}
                        onChangeText={v => updateCart(item.key, 'category', v)}
                        placeholder="Category  (optional)"
                        placeholderTextColor="#B0B8C4"
                        autoCapitalize="words"
                        maxLength={80}
                      />
                      <TextInput
                        style={[f.detailInput, { minHeight: 52, textAlignVertical: 'top', paddingTop: 10 }]}
                        value={item.notes}
                        onChangeText={v => updateCart(item.key, 'notes', v)}
                        placeholder="Notes for manager  (optional)"
                        placeholderTextColor="#B0B8C4"
                        maxLength={300}
                        multiline
                      />
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Note for manager */}
        <View style={f.noteCard}>
          <Text style={f.noteLabel}>Note for manager  <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
          <TextInput
            style={[f.detailInput, { minHeight: 56, textAlignVertical: 'top', paddingTop: 10 }]}
            value={note}
            onChangeText={setNote}
            placeholder="Any context — e.g. running low since Monday"
            placeholderTextColor="#B0B8C4"
            maxLength={300}
            multiline
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[f.submitBtn, !canSubmit && f.submitBtnDim]}
          onPress={() => submitMut.mutate()}
          disabled={!canSubmit}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Submit stock request${cart.length > 0 ? ` with ${cart.length} item${cart.length !== 1 ? 's' : ''}` : ''}`}
        >
          {submitMut.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={f.submitBtnText}>
                Submit Request{cart.length > 0 ? ` (${cart.length})` : ''}
              </Text>
          }
        </TouchableOpacity>

        {cart.length === 0 && (
          <Text style={f.emptyHint}>Add at least one item above to submit.</Text>
        )}
        </FadeSlideIn>
      </ScrollView>

      <BarcodeScannerModal
        visible={showScanner}
        onClose={() => setShowScanner(false)}
        onResult={handleScanResult}
      />
    </KeyboardAvoidingView>
  );
}

// ─── My Requests ──────────────────────────────────────────────────────────────

function MyRequests({ highlightId }: { highlightId: string | null }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (highlightId) setExpandedId(highlightId);
  }, [highlightId]);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['my-item-requests'],
    queryFn: employeeRequestApi.mine,
    refetchInterval: 60_000,
  });
  const requests: MyRequest[] = data?.data?.data || [];

  if (isLoading) return <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>;

  if (requests.length === 0) {
    return (
      <View style={s.center}>
        <ClipboardIcon size={52} color={COLORS.border} strokeWidth={1.25} />
        <Text style={s.emptyTitle}>No requests yet</Text>
        <Text style={s.emptyText}>Use "New Request" to ask your manager to add items to the store order.</Text>
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
      <Text style={m.legend}>On order list → Ordered → Received tracks your item once a manager accepts it.</Text>

      {requests.map((req, reqIndex) => {
        const isExpanded = expandedId === req.id;
        const isPending  = req.status === 'PENDING';
        const accepted   = req.lines.filter(l => l.status === 'ACCEPTED').length;
        const rejected   = req.lines.filter(l => l.status === 'REJECTED').length;
        const typeLabel  = req.requestType === 'CUSTOMER_REQUEST' ? '🙋 Customer Ask' : '📉 Low Stock';

        return (
          <FadeSlideIn key={req.id} delay={Math.min(reqIndex * 40, 200)}>
          <View style={m.card}>
            <TouchableOpacity
              style={m.cardHead}
              onPress={() => setExpandedId(isExpanded ? null : req.id)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`${isExpanded ? 'Collapse' : 'Expand'} request from ${new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}, ${typeLabel}`}
            >
              <View style={{ flex: 1 }}>
                <View style={m.cardTitleRow}>
                  <Text style={m.cardTitle}>
                    {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <View style={[m.badge, isPending ? m.badgePending : m.badgeDone]}>
                    <Text style={[m.badgeText, { color: isPending ? '#D97706' : '#16A34A' }]}>
                      {isPending ? 'Pending' : 'Reviewed'}
                    </Text>
                  </View>
                  <View style={m.typeBadge}><Text style={m.typeBadgeText}>{typeLabel}</Text></View>
                </View>
                <Text style={m.cardMeta}>
                  {req.lines.length} item{req.lines.length !== 1 ? 's' : ''}
                  {!isPending && ` · ${accepted} accepted, ${rejected} rejected`}
                  {isPending && ' · Waiting for review'}
                </Text>
                {req.reviewedBy && <Text style={m.cardMeta}>Reviewed by {req.reviewedBy.name}</Text>}
                {req.note && <Text style={m.cardNote}>"{req.note}"</Text>}
              </View>
              <Text style={{ fontSize: 18, color: COLORS.textMuted, marginLeft: 8 }}>{isExpanded ? '−' : '+'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={m.lines}>
                {req.lines.map(line => {
                  const olStatus = line.listItem?.status ?? 'PENDING';
                  const oc = line.status === 'ACCEPTED' ? ORDER_STATUS[olStatus] : null;
                  return (
                    <View key={line.id} style={[
                      m.line,
                      line.status === 'ACCEPTED' && m.lineAccepted,
                      line.status === 'REJECTED' && m.lineRejected,
                    ]}>
                      <View style={{ flex: 1 }}>
                        <Text style={m.lineName}>{line.name}</Text>
                        {line.quantity && <Text style={m.lineMeta}>Qty: {line.quantity}</Text>}
                        {line.category && <Text style={m.lineMeta}>{line.category}</Text>}
                        {line.status === 'REJECTED' && line.rejectionReason && (
                          <Text style={m.rejText}>
                            {REJECTION_LABELS[line.rejectionReason] || line.rejectionReason}
                            {line.rejectionNote ? ` — ${line.rejectionNote}` : ''}
                          </Text>
                        )}
                      </View>
                      {line.status === 'PENDING' && (
                        <View style={[m.lineStatus, { backgroundColor: '#FEF3C7' }]}>
                          <AlertTriangleIcon size={13} color="#D97706" strokeWidth={2.5} />
                          <Text style={[m.lineStatusText, { color: '#D97706' }]}>Pending</Text>
                        </View>
                      )}
                      {oc && (
                        <View style={[m.lineStatus, { backgroundColor: oc.bg }]}>
                          {olStatus === 'RECEIVED'
                            ? <CheckCircleIcon size={13} color={oc.color} strokeWidth={2.5} />
                            : <PackageIcon size={13} color={oc.color} strokeWidth={2.5} />
                          }
                          <Text style={[m.lineStatusText, { color: oc.color }]}>{oc.label}</Text>
                        </View>
                      )}
                      {line.status === 'REJECTED' && (
                        <View style={[m.lineStatus, { backgroundColor: '#FEE2E2' }]}>
                          <XIcon size={13} color="#DC2626" strokeWidth={2.5} />
                          <Text style={[m.lineStatusText, { color: '#DC2626' }]}>Declined</Text>
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
          </View>
          </FadeSlideIn>
        );
      })}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function StockRequestScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<'new' | 'mine'>('new');
  const highlightId = useHighlightParam();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  useFocusEffect(useCallback(() => {
    if (tab === 'mine') {
      setActiveTab('mine');
      router.setParams({ tab: '' });
    }
  }, [tab]));

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
          <Text style={s.headerTitle}>Stock Request</Text>
        </View>
        <Text style={s.headerSub}>Request items for the store's order list</Text>
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, activeTab === 'new' && s.tabActive]}
          onPress={() => setActiveTab('new')}
          accessibilityRole="tab"
          accessibilityLabel="New Request tab"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={[s.tabText, activeTab === 'new' && s.tabTextActive]}>+ New Request</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, activeTab === 'mine' && s.tabActive]}
          onPress={() => setActiveTab('mine')}
          accessibilityRole="tab"
          accessibilityLabel="My Requests tab"
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        >
          <Text style={[s.tabText, activeTab === 'mine' && s.tabTextActive]}>My Requests</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'new' ? (
        <NewRequestForm
          categories={categories}
          onSubmitted={() => { qc.invalidateQueries({ queryKey: ['my-item-requests'] }); setActiveTab('mine'); }}
        />
      ) : (
        <MyRequests highlightId={highlightId} />
      )}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    backgroundColor: COLORS.secondary,
    paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 2 },

  tabs:          { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab:           { flex: 1, paddingVertical: 13, alignItems: 'center' },
  tabActive:     { borderBottomWidth: 2, borderBottomColor: COLORS.secondary },
  tabText:       { fontSize: 14, fontWeight: '500', color: COLORS.textMuted },
  tabTextActive: { color: COLORS.secondary, fontWeight: '700' },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },
});

// Form styles
const f = StyleSheet.create({
  typeRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  typeChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: '#fff', alignItems: 'center',
  },
  typeChipActive: { borderColor: COLORS.secondary, backgroundColor: '#EEF4FF' },
  typeChipText:       { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  typeChipTextActive: { color: COLORS.secondary, fontWeight: '700' },
  typeHint: { fontSize: 11, color: COLORS.textMuted, marginBottom: 14 },

  searchWrapper: { marginBottom: 16 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: COLORS.text,
  },
  scanBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 4,
  },
  addBtn: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 4,
  },
  addBtnDim:  { opacity: 0.35, shadowOpacity: 0, elevation: 0 },
  searchHint: { fontSize: 11, color: COLORS.textMuted, marginTop: 6 },

  suggBox: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, marginTop: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 8, overflow: 'hidden',
  },
  suggRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
  },
  suggName: { fontSize: 14, fontWeight: '600', color: COLORS.text, flex: 1 },
  suggCat:  { fontSize: 12, color: COLORS.textMuted, marginLeft: 8, fontStyle: 'italic' },

  cartSection: { marginBottom: 16 },
  cartLabel:   { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  cartItem: {
    backgroundColor: '#fff', borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    padding: 12, marginBottom: 8,
  },
  cartItemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cartItemName: { fontSize: 15, fontWeight: '700', color: COLORS.text, flex: 1 },
  cartMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 4 },
  editDetailBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#EEF2FF' },
  editDetailBtnText: { fontSize: 12, fontWeight: '700', color: COLORS.secondary },
  removeBtn: { padding: 4 },

  detailFields: { marginTop: 10, gap: 8 },
  detailInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: COLORS.text,
  },

  noteCard:  { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  noteLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  submitBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 8,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  submitBtnDim: { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  emptyHint: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },
});

// My Requests styles
const m = StyleSheet.create({
  legend: { fontSize: 11, color: COLORS.textMuted, marginBottom: 10 },
  card:       { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  cardHead:   { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  cardTitle:  { fontSize: 14, fontWeight: '700', color: COLORS.text },
  cardMeta:   { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  cardNote:   { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginTop: 3 },

  badge:        { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  badgePending: { backgroundColor: '#FEF3C7' },
  badgeDone:    { backgroundColor: '#DCFCE7' },
  badgeText:    { fontSize: 11, fontWeight: '700' },
  typeBadge:    { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20, backgroundColor: '#EEF2FF' },
  typeBadgeText:{ fontSize: 11, fontWeight: '600', color: '#4F46E5' },

  lines: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12, gap: 8 },
  line: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 10, borderRadius: 10, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border,
  },
  lineAccepted: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  lineRejected: { borderColor: '#FECACA', backgroundColor: '#FFF5F5' },
  lineName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  lineMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 1 },
  rejText:  { fontSize: 12, color: '#DC2626', marginTop: 4 },

  lineStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8 },
  lineStatusText: { fontSize: 11, fontWeight: '700' },
});
