import React, { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  RefreshControl, StatusBar, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { employeeRequestApi, orderCategoriesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import {
  ClipboardIcon, PlusIcon, Trash2Icon, CheckCircleIcon,
  XIcon, AlertTriangleIcon, PackageIcon,
} from '../../components/Icons';

// ─── Types ───────────────────────────────────────────────────────────────────

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

function createBlankLine() {
  return { key: String(Date.now() + Math.random()), name: '', quantity: '', category: '', notes: '' };
}

type FormLine = ReturnType<typeof createBlankLine>;

// ─── Request Form ─────────────────────────────────────────────────────────────

interface RequestFormProps {
  categories: string[];
  onSubmitted: () => void;
}

function RequestForm({ categories, onSubmitted }: RequestFormProps) {
  const [lines, setLines] = useState<FormLine[]>([createBlankLine()]);
  const [note, setNote]   = useState('');

  const submitMutation = useMutation({
    mutationFn: () => employeeRequestApi.submit({
      note: note.trim() || undefined,
      lines: lines
        .filter(l => l.name.trim())
        .map(l => ({
          name: l.name.trim(),
          quantity: l.quantity.trim() || undefined,
          category: l.category.trim() || undefined,
          notes: l.notes.trim() || undefined,
        })),
    }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Request submitted', text2: 'Your manager will review it soon' });
      setLines([createBlankLine()]);
      setNote('');
      onSubmitted();
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to submit request' }),
  });

  const setLine = (key: string, field: keyof FormLine, value: string) => {
    setLines(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));
  };

  const removeLine = (key: string) => {
    if (lines.length === 1) {
      setLines([createBlankLine()]);
    } else {
      setLines(prev => prev.filter(l => l.key !== key));
    }
  };

  const handleSubmit = () => {
    const valid = lines.filter(l => l.name.trim());
    if (valid.length === 0) {
      Toast.show({ type: 'error', text1: 'Add at least one item name' });
      return;
    }
    submitMutation.mutate();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header info */}
        <View style={s.formInfo}>
          <PackageIcon size={20} color={COLORS.secondary} strokeWidth={2} />
          <Text style={s.formInfoText}>
            List what the store needs. Your manager will review and add approved items to the order.
          </Text>
        </View>

        {/* Item lines */}
        {lines.map((line, idx) => (
          <View key={line.key} style={s.lineCard}>
            <View style={s.lineHeader}>
              <View style={s.lineNum}>
                <Text style={s.lineNumText}>{idx + 1}</Text>
              </View>
              <Text style={s.lineTitle}>Item {idx + 1}</Text>
              <TouchableOpacity style={s.removeLineBtn} onPress={() => removeLine(line.key)}>
                <XIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
              </TouchableOpacity>
            </View>

            <Text style={s.fieldLabel}>Item Name <Text style={{ color: COLORS.primary }}>*</Text></Text>
            <TextInput
              style={s.input}
              value={line.name}
              onChangeText={v => setLine(line.key, 'name', v)}
              placeholder="e.g. Whole Milk 2%"
              placeholderTextColor={COLORS.textMuted}
              maxLength={120}
            />

            <Text style={s.fieldLabel}>Quantity / Amount</Text>
            <TextInput
              style={s.input}
              value={line.quantity}
              onChangeText={v => setLine(line.key, 'quantity', v)}
              placeholder="e.g. 2 cases, 4 gallons"
              placeholderTextColor={COLORS.textMuted}
              maxLength={60}
            />

            <Text style={s.fieldLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              {['', ...categories].map(c => (
                <TouchableOpacity key={c || '__none__'} onPress={() => setLine(line.key, 'category', c)}
                  style={[s.catChip, line.category === c && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}>
                  <Text style={[s.catChipText, line.category === c && { color: '#fff' }]}>{c || 'None'}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={s.fieldLabel}>Notes</Text>
            <TextInput
              style={[s.input, s.textArea]}
              value={line.notes}
              onChangeText={v => setLine(line.key, 'notes', v)}
              placeholder="Any specific details..."
              placeholderTextColor={COLORS.textMuted}
              maxLength={300}
              multiline
              numberOfLines={2}
            />
          </View>
        ))}

        {/* Add line button */}
        {lines.length < 30 && (
          <TouchableOpacity style={s.addLineBtn} onPress={() => setLines(prev => [...prev, createBlankLine()])}>
            <PlusIcon size={18} color={COLORS.secondary} strokeWidth={2.5} />
            <Text style={s.addLineBtnText}>Add Another Item</Text>
          </TouchableOpacity>
        )}

        {/* Overall note */}
        <View style={s.lineCard}>
          <Text style={[s.fieldLabel, { marginTop: 0 }]}>Overall Note (optional)</Text>
          <TextInput
            style={[s.input, s.textArea]}
            value={note}
            onChangeText={setNote}
            placeholder="Any context for the manager..."
            placeholderTextColor={COLORS.textMuted}
            maxLength={300}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, submitMutation.isPending && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending
            ? <ActivityIndicator color="#fff" />
            : <Text style={s.submitBtnText}>Submit Request ({lines.filter(l => l.name.trim()).length} item{lines.filter(l => l.name.trim()).length !== 1 ? 's' : ''})</Text>
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
        const isExpanded  = expandedId === req.id;
        const isPending   = req.status === 'PENDING';
        const accepted    = req.lines.filter(l => l.status === 'ACCEPTED').length;
        const rejected    = req.lines.filter(l => l.status === 'REJECTED').length;
        const stillPending = req.lines.filter(l => l.status === 'PENDING').length;

        return (
          <View key={req.id} style={s.reqCard}>
            <TouchableOpacity style={s.reqCardHeader} onPress={() => setExpandedId(isExpanded ? null : req.id)}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={[s.statusDot, { backgroundColor: isPending ? '#F59E0B' : '#22C55E' }]} />
                  <Text style={s.reqCardDate}>
                    {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                  <View style={[s.statusBadge, isPending ? s.statusBadgePending : s.statusBadgeDone]}>
                    <Text style={[s.statusBadgeText, isPending ? { color: '#D97706' } : { color: '#16A34A' }]}>
                      {isPending ? 'Pending' : 'Reviewed'}
                    </Text>
                  </View>
                </View>
                <Text style={s.reqCardMeta}>
                  {req.lines.length} item{req.lines.length !== 1 ? 's' : ''}
                  {!isPending && ` · ${accepted} accepted, ${rejected} rejected`}
                  {isPending && stillPending > 0 && ` · Waiting for review`}
                </Text>
                {req.reviewedBy && <Text style={s.reqCardMeta}>Reviewed by {req.reviewedBy.name}</Text>}
              </View>
              <Text style={{ fontSize: 18, color: COLORS.textMuted }}>{isExpanded ? '−' : '+'}</Text>
            </TouchableOpacity>

            {isExpanded && (
              <View style={s.reqLines}>
                {req.note && (
                  <View style={s.reqNoteBox}>
                    <Text style={s.reqNoteLabel}>Your note</Text>
                    <Text style={s.reqNoteText}>{req.note}</Text>
                  </View>
                )}
                {req.lines.map(line => (
                  <View key={line.id} style={[s.lineItem, line.status === 'ACCEPTED' && s.lineItemAccepted, line.status === 'REJECTED' && s.lineItemRejected]}>
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
                    <View style={[s.lineStatus,
                      line.status === 'ACCEPTED' && { backgroundColor: '#DCFCE7' },
                      line.status === 'REJECTED' && { backgroundColor: '#FEE2E2' },
                      line.status === 'PENDING'  && { backgroundColor: '#FEF3C7' },
                    ]}>
                      {line.status === 'ACCEPTED' && <CheckCircleIcon size={14} color="#16A34A" strokeWidth={2.5} />}
                      {line.status === 'REJECTED' && <XIcon size={14} color="#DC2626" strokeWidth={2.5} />}
                      {line.status === 'PENDING'  && <AlertTriangleIcon size={14} color="#D97706" strokeWidth={2.5} />}
                      <Text style={[s.lineStatusText,
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

  formInfo: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#EEF2FF', borderRadius: 12, padding: 14, marginBottom: 16,
  },
  formInfoText: { flex: 1, fontSize: 13, color: '#3730A3', lineHeight: 19 },

  lineCard: { backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border },
  lineHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  lineNum:  { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  lineNumText: { fontSize: 12, fontWeight: '800', color: '#fff' },
  lineTitle:   { flex: 1, fontSize: 14, fontWeight: '700', color: COLORS.text },
  removeLineBtn: { padding: 4 },

  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 6, marginTop: 10 },
  input: {
    backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: COLORS.text,
  },
  textArea: { minHeight: 60, textAlignVertical: 'top', paddingTop: 10 },

  catChip:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, marginRight: 8, backgroundColor: '#fff' },
  catChipText: { fontSize: 12, color: COLORS.text, fontWeight: '500' },

  addLineBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed',
    borderColor: COLORS.secondary, backgroundColor: '#fff', marginBottom: 16,
  },
  addLineBtnText: { fontSize: 14, fontWeight: '700', color: COLORS.secondary },

  submitBtn:     { backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 16, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 6 },

  reqCard:       { backgroundColor: '#fff', borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
  reqCardHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  reqCardDate:   { fontSize: 14, fontWeight: '600', color: COLORS.text },
  reqCardMeta:   { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  statusBadge:   { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusBadgePending: { backgroundColor: '#FEF3C7' },
  statusBadgeDone:    { backgroundColor: '#DCFCE7' },
  statusBadgeText:    { fontSize: 11, fontWeight: '700' },

  reqLines: { borderTopWidth: 1, borderTopColor: COLORS.border, padding: 12, gap: 8 },

  reqNoteBox:  { backgroundColor: '#F8F9FA', borderRadius: 10, padding: 10, marginBottom: 8 },
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
  rejectionText:{ fontSize: 12, color: '#DC2626', marginTop: 4 },

  lineStatus: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8,
  },
  lineStatusText: { fontSize: 11, fontWeight: '700' },
});
