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
  XIcon, AlertTriangleIcon, PackageIcon, Trash2Icon, ChevronDownIcon,
} from '../../components/Icons';

// ─── Types ───────────────────────────────────────────────────────────────────

type RequestType = 'LOW_STOCK' | 'CUSTOMER_REQUEST';

interface Suggestion { name: string; category: string | null; count: number }

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
}

type GroupedItems = Record<string, { key: string; name: string; qty: string }[]>;

// ─── Constants ────────────────────────────────────────────────────────────────

const REJECTION_LABELS: Record<string, string> = {
  NO_SUPPLIER:   'No supplier available',
  OUT_OF_BUDGET: 'Out of budget',
  IN_STOCK:      'Already in stock',
  DUPLICATE:     'Duplicate item',
  OTHER:         'Other reason',
};

const REQUEST_TYPES: { value: RequestType; label: string; hint: string }[] = [
  { value: 'LOW_STOCK',        label: 'Low Stock',        hint: 'Items that are running low and need restocking' },
  { value: 'CUSTOMER_REQUEST', label: 'Customer Request',  hint: 'Items customers have asked for' },
];

function makeKey() { return `${Date.now()}-${Math.random()}`; }

// ─── Request Form ─────────────────────────────────────────────────────────────

interface RequestFormProps {
  categories: string[];
  onSubmitted: () => void;
}

function RequestForm({ categories, onSubmitted }: RequestFormProps) {
  // ── Step 1: type ──────────────────────────────────────────────────────────
  const [requestType, setRequestType] = useState<RequestType | null>(null);

  // ── Active entry ──────────────────────────────────────────────────────────
  const [activeCategory, setActiveCategory] = useState('');
  const [activeName,     setActiveName]     = useState('');
  const [activeQty,      setActiveQty]      = useState('');

  // ── Suggestions ───────────────────────────────────────────────────────────
  const [nameSuggestions,  setNameSuggestions]  = useState<Suggestion[]>([]);
  const [showNameSugg,     setShowNameSugg]     = useState(false);
  const [catSuggestions,   setCatSuggestions]   = useState<string[]>([]);
  const [showCatSugg,      setShowCatSugg]      = useState(false);
  const suggTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Grouped committed list { [category]: items[] } ────────────────────────
  const [groups, setGroups] = useState<GroupedItems>({});

  // ── Overall note ──────────────────────────────────────────────────────────
  const [overallNote, setOverallNote] = useState('');

  const catRef  = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const qtyRef  = useRef<TextInput>(null);

  // ── Category suggestions — filter approved + already-used categories ──────
  const allCats = [...new Set([...categories, ...Object.keys(groups).filter(c => c !== '__none__')])];

  useEffect(() => {
    if (!activeCategory.trim()) { setCatSuggestions([]); return; }
    const q = activeCategory.toLowerCase();
    const filtered = allCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5);
    setCatSuggestions(filtered);
    setShowCatSugg(filtered.length > 0);
  }, [activeCategory, categories, groups]);

  // ── Item name suggestions — debounced API call ────────────────────────────
  useEffect(() => {
    if (suggTimer.current) clearTimeout(suggTimer.current);
    if (activeName.length < 2) { setNameSuggestions([]); setShowNameSugg(false); return; }
    suggTimer.current = setTimeout(async () => {
      try {
        const res = await employeeRequestApi.getSuggestions(activeName);
        const data: Suggestion[] = res.data?.data || [];
        setNameSuggestions(data);
        setShowNameSugg(data.length > 0);
      } catch { /* suggestions are best-effort */ }
    }, 220);
    return () => { if (suggTimer.current) clearTimeout(suggTimer.current); };
  }, [activeName]);

  // ── Add item to group ─────────────────────────────────────────────────────
  const handleAddItem = useCallback(() => {
    const name = activeName.trim();
    if (!name) { Toast.show({ type: 'error', text1: 'Enter an item name' }); return; }
    const cat = activeCategory.trim() || '__none__';
    setGroups(prev => ({
      ...prev,
      [cat]: [...(prev[cat] || []), { key: makeKey(), name, qty: activeQty.trim() }],
    }));
    setActiveName('');
    setActiveQty('');
    setNameSuggestions([]);
    setShowNameSugg(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  }, [activeName, activeQty, activeCategory]);

  const handleSelectNameSugg = (s: Suggestion) => {
    setActiveName(s.name);
    setShowNameSugg(false);
    setNameSuggestions([]);
    // Auto-set category from suggestion only if the user hasn't typed one yet
    if (!activeCategory.trim() && s.category) {
      setActiveCategory(s.category);
    }
    setTimeout(() => qtyRef.current?.focus(), 50);
  };

  const handleSelectCatSugg = (cat: string) => {
    setActiveCategory(cat);
    setShowCatSugg(false);
    setTimeout(() => nameRef.current?.focus(), 50);
  };

  const handleNewCategory = () => {
    setActiveCategory('');
    setCatSuggestions([]);
    setShowCatSugg(false);
    setTimeout(() => catRef.current?.focus(), 50);
  };

  const handleRemoveItem = (cat: string, key: string) => {
    setGroups(prev => {
      const updated = (prev[cat] || []).filter(i => i.key !== key);
      if (updated.length === 0) {
        const { [cat]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [cat]: updated };
    });
  };

  // ── Total item count (committed + active if named) ────────────────────────
  const committedCount = Object.values(groups).reduce((n, arr) => n + arr.length, 0);
  const totalCount = committedCount + (activeName.trim() ? 1 : 0);

  // ── Submit ────────────────────────────────────────────────────────────────
  const submitMutation = useMutation({
    mutationFn: () => {
      // Merge active tile into groups if it has a name
      const finalGroups: GroupedItems = { ...groups };
      if (activeName.trim()) {
        const cat = activeCategory.trim() || '__none__';
        finalGroups[cat] = [...(finalGroups[cat] || []), { key: makeKey(), name: activeName.trim(), qty: activeQty.trim() }];
      }

      // Flatten to line array
      const lines = Object.entries(finalGroups).flatMap(([cat, items]) =>
        items.map(item => ({
          name:     item.name,
          quantity: item.qty || undefined,
          category: cat !== '__none__' ? cat : undefined,
        }))
      );

      // Silently submit new categories for DevAdmin approval (fire & forget)
      const usedCats = Object.keys(finalGroups).filter(c => c !== '__none__');
      const newCats  = usedCats.filter(c => !categories.map(a => a.toLowerCase()).includes(c.toLowerCase()));
      newCats.forEach(cat => orderCategoriesApi.submitNew(cat).catch(() => {}));

      const typeLabel = requestType === 'LOW_STOCK' ? 'Low Stock' : 'Customer Request';
      const noteStr   = [`[${typeLabel}]`, overallNote.trim()].filter(Boolean).join(' ');
      return employeeRequestApi.submit({ note: noteStr || undefined, lines });
    },
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Request submitted', text2: 'Your manager will review it soon' });
      setRequestType(null);
      setGroups({});
      setActiveName(''); setActiveCategory(''); setActiveQty('');
      setOverallNote('');
      onSubmitted();
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to submit' }),
  });

  // ── Type picker ───────────────────────────────────────────────────────────

  if (!requestType) {
    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, gap: 12 }} showsVerticalScrollIndicator={false}>
        <Text style={s.typePrompt}>What are you requesting?</Text>
        <Text style={s.typeHint}>Helps your manager understand the context.</Text>
        {REQUEST_TYPES.map(t => (
          <TouchableOpacity key={t.value} style={s.typeCard} onPress={() => setRequestType(t.value)} activeOpacity={0.75}>
            <View style={{ flex: 1 }}>
              <Text style={s.typeCardLabel}>{t.label}</Text>
              <Text style={s.typeCardHint}>{t.hint}</Text>
            </View>
            <Text style={s.typeChevron}>›</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // ── Item entry ────────────────────────────────────────────────────────────

  const typeConfig = REQUEST_TYPES.find(t => t.value === requestType)!;
  const catDisplay = activeCategory.trim() || 'No category';

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Type badge */}
        <View style={s.typeBadgeRow}>
          <View style={s.typeBadge}><Text style={s.typeBadgeText}>{typeConfig.label}</Text></View>
          <TouchableOpacity onPress={() => { setRequestType(null); setGroups({}); setActiveName(''); setActiveCategory(''); setActiveQty(''); }}>
            <Text style={s.typeChangeBtn}>Change</Text>
          </TouchableOpacity>
        </View>

        {/* ── Entry tile ─────────────────────────────────────────────────── */}
        <View style={s.entryTile}>

          {/* Category row */}
          <View style={s.catRow}>
            <View style={{ flex: 1 }}>
              <TextInput
                ref={catRef}
                style={s.catInput}
                value={activeCategory}
                onChangeText={v => { setActiveCategory(v); setShowCatSugg(true); }}
                onFocus={() => setShowCatSugg(catSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
                placeholder="Category  (optional)"
                placeholderTextColor="#B0B8C4"
                maxLength={80}
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => nameRef.current?.focus()}
              />
              {showCatSugg && catSuggestions.length > 0 && (
                <View style={s.suggestBox}>
                  {catSuggestions.map(c => (
                    <TouchableOpacity key={c} style={s.suggestRow} onPress={() => handleSelectCatSugg(c)}>
                      <Text style={s.suggestText}>{c}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
            {activeCategory.trim() && (
              <TouchableOpacity style={s.newCatBtn} onPress={handleNewCategory}>
                <Text style={s.newCatBtnText}>New category</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={s.entryDivider} />

          {/* Item name + qty row */}
          <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
            <View style={{ position: 'relative' }}>
              <TextInput
                ref={nameRef}
                style={s.nameInput}
                value={activeName}
                onChangeText={v => { setActiveName(v); setShowNameSugg(true); }}
                onFocus={() => setShowNameSugg(nameSuggestions.length > 0)}
                onBlur={() => setTimeout(() => setShowNameSugg(false), 130)}
                placeholder="Item name…"
                placeholderTextColor="#B0B8C4"
                maxLength={120}
                autoCapitalize="sentences"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => qtyRef.current?.focus()}
              />
              {showNameSugg && nameSuggestions.length > 0 && (
                <View style={s.suggestBox}>
                  {nameSuggestions.map(sg => (
                    <TouchableOpacity key={sg.name} style={s.suggestRow} onPress={() => handleSelectNameSugg(sg)}>
                      <Text style={s.suggestText}>{sg.name}</Text>
                      {sg.category && <Text style={s.suggestCat}>{sg.category}</Text>}
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                ref={qtyRef}
                style={[s.nameInput, { flex: 1 }]}
                value={activeQty}
                onChangeText={setActiveQty}
                placeholder="Qty / amount  (optional)"
                placeholderTextColor="#B0B8C4"
                maxLength={60}
                returnKeyType="done"
                onSubmitEditing={handleAddItem}
              />
              <TouchableOpacity
                style={[s.addItemBtn, !activeName.trim() && s.addItemBtnDim]}
                onPress={handleAddItem}
                disabled={!activeName.trim()}
                activeOpacity={0.8}
              >
                <PlusIcon size={20} color="#fff" strokeWidth={2.5} />
              </TouchableOpacity>
            </View>

            <Text style={s.currentCatLabelText}>
              Adding to: <Text style={{ color: COLORS.secondary, fontWeight: '700' }}>{catDisplay}</Text>
            </Text>
          </View>
        </View>

        {/* ── Grouped committed list ──────────────────────────────────────── */}
        {Object.keys(groups).length > 0 && (
          <View style={s.groupsSection}>
            {Object.entries(groups).map(([cat, items]) => (
              <View key={cat} style={s.group}>
                <View style={s.groupHeader}>
                  <Text style={s.groupHeaderText}>
                    {cat === '__none__' ? 'No category' : cat.toUpperCase()}
                  </Text>
                  <Text style={s.groupCount}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
                  {/* Tap header to switch back to this category */}
                  <TouchableOpacity
                    style={s.groupAddMoreBtn}
                    onPress={() => {
                      setActiveCategory(cat === '__none__' ? '' : cat);
                      setTimeout(() => nameRef.current?.focus(), 80);
                    }}
                  >
                    <Text style={s.groupAddMoreText}>+ add more</Text>
                  </TouchableOpacity>
                </View>
                {items.map(item => (
                  <View key={item.key} style={s.groupRow}>
                    <Text style={s.groupRowName} numberOfLines={1}>
                      {item.name}
                      {item.qty ? <Text style={s.groupRowQty}>  ·  {item.qty}</Text> : null}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemoveItem(cat, item.key)} style={s.removeBtn}>
                      <XIcon size={14} color="#DC2626" strokeWidth={2.5} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Overall note */}
        <View style={s.overallNoteCard}>
          <Text style={s.overallNoteLabel}>Note for manager  <Text style={{ fontWeight: '400' }}>(optional)</Text></Text>
          <TextInput
            style={[s.nameInput, s.textArea]}
            value={overallNote}
            onChangeText={setOverallNote}
            placeholder="Any context…"
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
          onPress={() => submitMutation.mutate()}
          disabled={submitMutation.isPending || totalCount === 0}
        >
          {submitMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>
                Submit{totalCount > 0 ? ` (${totalCount} item${totalCount !== 1 ? 's' : ''})` : ''}
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

  if (isLoading) return <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>;

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
        const isExpanded = expandedId === req.id;
        const isPending  = req.status === 'PENDING';
        const accepted   = req.lines.filter(l => l.status === 'ACCEPTED').length;
        const rejected   = req.lines.filter(l => l.status === 'REJECTED').length;

        const typeMatch  = req.note?.match(/^\[([^\]]+)\]/);
        const typeLabel  = typeMatch ? typeMatch[1] : null;
        const noteBody   = typeLabel ? req.note?.replace(/^\[[^\]]+\]\s*/, '') : req.note;

        // Group lines by category for display
        const linesByCat: Record<string, RequestLine[]> = {};
        for (const l of req.lines) {
          const k = l.category || 'No category';
          if (!linesByCat[k]) linesByCat[k] = [];
          linesByCat[k].push(l);
        }

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
                    <Text style={[s.statusBadgeText, { color: isPending ? '#D97706' : '#16A34A' }]}>
                      {isPending ? 'Pending' : 'Reviewed'}
                    </Text>
                  </View>
                  {typeLabel && <View style={s.typeLabelBadge}><Text style={s.typeLabelText}>{typeLabel}</Text></View>}
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

                {Object.entries(linesByCat).map(([cat, lines]) => (
                  <View key={cat} style={{ marginBottom: 8 }}>
                    <Text style={s.histCatHeader}>{cat}</Text>
                    {lines.map(line => (
                      <View key={line.id} style={[
                        s.lineItem,
                        line.status === 'ACCEPTED' && s.lineItemAccepted,
                        line.status === 'REJECTED' && s.lineItemRejected,
                      ]}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.lineItemName}>{line.name}</Text>
                          {line.quantity && <Text style={s.lineItemMeta}>Qty: {line.quantity}</Text>}
                          {line.notes && <Text style={s.lineItemNote}>{line.notes}</Text>}
                          {line.status === 'REJECTED' && line.rejectionReason && (
                            <Text style={s.rejectionText}>
                              {REJECTION_LABELS[line.rejectionReason] || line.rejectionReason}
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

      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PackageIcon size={20} color="#fff" strokeWidth={2} />
          <Text style={s.headerTitle}>Request Items</Text>
        </View>
        <Text style={s.headerSub}>Ask your manager to order something</Text>
      </View>

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
          onSubmitted={() => { qc.invalidateQueries({ queryKey: ['my-item-requests'] }); setActiveTab('mine'); }}
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
  typeCardLabel: { fontSize: 16, fontWeight: '700', color: COLORS.text, marginBottom: 3 },
  typeCardHint:  { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  typeChevron:   { fontSize: 22, color: COLORS.textMuted, fontWeight: '300' },

  // ── Entry tile ───────────────────────────────────────────────────────────
  typeBadgeRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  typeBadge:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: COLORS.secondary },
  typeBadgeText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  typeChangeBtn: { fontSize: 13, color: COLORS.secondary, fontWeight: '600' },

  entryTile: {
    backgroundColor: '#fff', borderRadius: 16,
    borderWidth: 1.5, borderColor: COLORS.secondary,
    overflow: 'visible',
    marginBottom: 14,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 3,
  },

  // Category section
  catRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10,
  },
  catInput: {
    flex: 1,
    fontSize: 14, fontWeight: '600', color: COLORS.text,
    paddingVertical: 8, paddingHorizontal: 2,
    borderBottomWidth: 1.5, borderBottomColor: COLORS.border,
  },
  newCatBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
    backgroundColor: '#EEF2FF',
  },
  newCatBtnText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },

  entryDivider: { height: 1, backgroundColor: '#F0F4F8', marginHorizontal: 12 },

  // Name + qty
  nameInput: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, color: COLORS.text,
  },
  textArea: { minHeight: 64, textAlignVertical: 'top', paddingTop: 10 },

  addItemBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 5, elevation: 4,
  },
  addItemBtnDim: { opacity: 0.35, shadowOpacity: 0, elevation: 0 },

  currentCatLabel: {
    paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10,
  },
  currentCatLabelText: { fontSize: 12, color: COLORS.textMuted },

  // Entry sub-section padding
  // (name+qty live in a padded area)
  // We wrap them in a view inside the tile with padding
  entryFields: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },

  // ── Suggestions dropdown ─────────────────────────────────────────────────
  suggestBox: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
    backgroundColor: '#fff',
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, marginTop: 2,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
  },
  suggestText: { fontSize: 14, color: COLORS.text, flex: 1 },
  suggestCat:  { fontSize: 12, color: COLORS.textMuted, fontStyle: 'italic', marginLeft: 8 },

  // ── Grouped committed list ───────────────────────────────────────────────
  groupsSection: { marginBottom: 14, gap: 8 },
  group: {
    backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  groupHeaderText: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, letterSpacing: 0.6, textTransform: 'uppercase', flex: 1 },
  groupCount:      { fontSize: 11, color: COLORS.textMuted, fontWeight: '500' },
  groupAddMoreBtn: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: '#EEF2FF' },
  groupAddMoreText: { fontSize: 11, fontWeight: '700', color: '#4F46E5' },
  groupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F5F5F5',
  },
  groupRowName: { flex: 1, fontSize: 14, fontWeight: '500', color: COLORS.text },
  groupRowQty:  { fontSize: 13, color: COLORS.textMuted, fontWeight: '400' },
  removeBtn:    { padding: 4 },

  // ── Overall note ─────────────────────────────────────────────────────────
  overallNoteCard:  { backgroundColor: '#fff', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, marginBottom: 16 },
  overallNoteLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },

  // ── Submit ───────────────────────────────────────────────────────────────
  submitBtn:     { backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // ── Shared ───────────────────────────────────────────────────────────────
  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  // ── My Requests history ──────────────────────────────────────────────────
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

  reqLines:     { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12 },
  reqNoteBox:   { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, marginBottom: 10 },
  reqNoteLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  reqNoteText:  { fontSize: 13, color: COLORS.text },

  histCatHeader: {
    fontSize: 10, fontWeight: '800', color: COLORS.textMuted,
    letterSpacing: 0.6, textTransform: 'uppercase',
    marginBottom: 4, marginTop: 6,
  },
  lineItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 10, borderRadius: 10, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 6,
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
