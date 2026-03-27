import {
  View, Text, TouchableOpacity, FlatList, TextInput,
  StyleSheet, ScrollView, ActivityIndicator, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeRequestApi, chatApi } from '../services/api';
import { COLORS } from '../constants';

const REQUEST_TYPES = [
  { value: 'LOW_STOCK',                  label: 'Low Stock',        icon: '📦', desc: 'Product running low',         bg: '#eff6ff', color: '#1D3557' },
  { value: 'STORE_SUPPLIES',             label: 'Store Supplies',   icon: '🧹', desc: 'Cleaning, bags, etc.',        bg: '#fefce8', color: '#b45309' },
  { value: 'CUSTOMER_REQUESTED_PRODUCT', label: 'Customer Request', icon: '🛍️', desc: 'Item a customer asked for',   bg: '#f0fdf4', color: '#16a34a' },
  { value: 'WORK_ORDER',                 label: 'Work Order',       icon: '🔧', desc: 'Equipment or maintenance',    bg: '#fdf4ff', color: '#7c3aed' },
];

const PRIORITIES = [
  { value: 'LOW',    label: 'Low',    color: '#2DC653', bg: '#f0fdf4' },
  { value: 'MEDIUM', label: 'Medium', color: '#f59e0b', bg: '#fffbeb' },
  { value: 'HIGH',   label: 'High',   color: '#E63946', bg: '#fff1f2' },
];

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#E63946', MEDIUM: '#f59e0b', LOW: '#2DC653',
};

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'Low Stock',
  STORE_SUPPLIES: 'Store Supplies',
  CUSTOMER_REQUESTED_PRODUCT: 'Customer Request',
  WORK_ORDER: 'Work Order',
};

const TYPE_ICONS: Record<string, string> = {
  LOW_STOCK: '📦', STORE_SUPPLIES: '🧹', CUSTOMER_REQUESTED_PRODUCT: '🛍️', WORK_ORDER: '🔧',
};

const TYPE_BG: Record<string, string> = {
  LOW_STOCK: '#eff6ff', STORE_SUPPLIES: '#fefce8', CUSTOMER_REQUESTED_PRODUCT: '#f0fdf4', WORK_ORDER: '#fdf4ff',
};

interface StoreRequest {
  id: string;
  storeId: string;
  type: string;
  priority: string;
  notes: string | null;
  status: string;
  acknowledgerName: string | null;
  acknowledgerNote: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  store: { name: string };
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EmployeeRequestsScreen() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: storesData } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data || [];
  const effectiveStore = selectedStore || (stores.length === 1 ? stores[0]?.id : null);

  const { data: myRequestsData, isLoading } = useQuery({
    queryKey: ['my-store-requests'],
    queryFn: () => storeRequestApi.getMine(),
    refetchInterval: 30000,
  });
  const myRequests: StoreRequest[] = myRequestsData?.data?.data || [];
  const pendingCount = myRequests.filter(r => r.status === 'PENDING').length;

  const submitMutation = useMutation({
    mutationFn: () => storeRequestApi.submit({
      storeId: effectiveStore!,
      type: selectedType!,
      priority: selectedPriority!,
      notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-store-requests'] });
      setShowForm(false);
      setSelectedType(null);
      setSelectedPriority(null);
      setNotes('');
      Alert.alert('Request Sent', 'Your request has been sent to your manager.');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Something went wrong. Please try again.';
      Alert.alert('Failed to Send', msg);
    },
  });

  const canSubmit = !!effectiveStore && !!selectedType && !!selectedPriority;
  const noStoreAssigned = !effectiveStore && stores.length === 0;

  const renderRequest = useCallback(({ item }: { item: StoreRequest }) => {
    const pColor = PRIORITY_COLORS[item.priority] || '#adb5bd';
    const typeBg = TYPE_BG[item.type] || '#f3f4f6';
    const isDone = item.status === 'ACKNOWLEDGED';
    return (
      <View style={s.card}>
        <View style={[s.priorityStripe, { backgroundColor: pColor }]} />
        <View style={s.cardInner}>
          {/* Top row */}
          <View style={s.cardTop}>
            <View style={[s.typeIconWrap, { backgroundColor: typeBg }]}>
              <Text style={s.typeIconText}>{TYPE_ICONS[item.type] || '📋'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.typeLabel}>{TYPE_LABELS[item.type] || item.type}</Text>
              <Text style={s.metaText}>{item.store.name} · {formatTime(item.createdAt)}</Text>
            </View>
            {/* Priority pill */}
            <View style={[s.prioPill, { backgroundColor: pColor + '18', borderColor: pColor + '55' }]}>
              <View style={[s.prioDot, { backgroundColor: pColor }]} />
              <Text style={[s.prioPillText, { color: pColor }]}>{item.priority}</Text>
            </View>
          </View>

          {/* Notes */}
          {item.notes ? (
            <View style={s.notesBox}>
              <Text style={s.notesText}>"{item.notes}"</Text>
            </View>
          ) : null}

          {/* Status / Ack */}
          {isDone ? (
            <View style={s.ackBox}>
              <Text style={s.ackIcon}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.ackBy}>Acknowledged by {item.acknowledgerName}</Text>
                {item.acknowledgerNote ? <Text style={s.ackNote}>"{item.acknowledgerNote}"</Text> : null}
              </View>
            </View>
          ) : (
            <View style={s.pendingPill}>
              <View style={s.pendingDot} />
              <Text style={s.pendingText}>Awaiting manager review</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>📋 STORE REQUESTS</Text>
            <Text style={s.headerTitle}>My Requests</Text>
          </View>
          <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(true)}>
            <Text style={s.newBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        {/* Stats pills */}
        <View style={s.statsRow}>
          <View style={s.statPill}>
            <Text style={s.statNum}>{myRequests.length}</Text>
            <Text style={s.statLbl}>Total</Text>
          </View>
          <View style={[s.statPill, pendingCount > 0 && s.statPillWarning]}>
            <Text style={[s.statNum, pendingCount > 0 && s.statNumWarning]}>{pendingCount}</Text>
            <Text style={[s.statLbl, pendingCount > 0 && s.statNumWarning]}>Pending</Text>
          </View>
          <View style={[s.statPill, { backgroundColor: 'rgba(45,198,83,0.15)' }]}>
            <Text style={[s.statNum, { color: '#2DC653' }]}>{myRequests.length - pendingCount}</Text>
            <Text style={[s.statLbl, { color: '#2DC653' }]}>Done</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── List ── */}
      {isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : myRequests.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyEmoji}>📭</Text>
          <Text style={s.emptyTitle}>No requests yet</Text>
          <Text style={s.emptySub}>Tap "+ New" to send a request to your manager</Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => setShowForm(true)}>
            <Text style={s.emptyBtnText}>Create First Request</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={myRequests}
          keyExtractor={(r) => r.id}
          renderItem={renderRequest}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── New Request Modal ── */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
          {/* Modal header */}
          <View style={s.modalHeaderBar}>
            <View style={s.modalHeaderDrag} />
            <View style={s.modalHeaderRow}>
              <View>
                <Text style={s.modalHeaderTitle}>New Request</Text>
                <Text style={s.modalHeaderSub}>Send to your store manager</Text>
              </View>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowForm(false)}>
                <Text style={s.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView contentContainerStyle={s.formBody} showsVerticalScrollIndicator={false}>

            {/* No store warning */}
            {noStoreAssigned && (
              <View style={s.warnBox}>
                <Text style={s.warnText}>⚠️ You're not assigned to any store yet. Ask your manager to assign you first.</Text>
              </View>
            )}

            {/* Store picker */}
            {stores.length > 1 && (
              <View style={s.formSection}>
                <Text style={s.formSectionLabel}>Store</Text>
                <View style={s.chipRow}>
                  {stores.map((st) => (
                    <TouchableOpacity
                      key={st.id}
                      style={[s.chip, selectedStore === st.id && s.chipActive]}
                      onPress={() => setSelectedStore(st.id)}
                    >
                      <Text style={[s.chipText, selectedStore === st.id && s.chipTextActive]}>{st.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Request type */}
            <View style={s.formSection}>
              <Text style={s.formSectionLabel}>Request Type</Text>
              <View style={s.typeGrid}>
                {REQUEST_TYPES.map((t) => {
                  const active = selectedType === t.value;
                  return (
                    <TouchableOpacity
                      key={t.value}
                      style={[s.typeCard, active && { borderColor: t.color, backgroundColor: t.bg }]}
                      onPress={() => setSelectedType(t.value)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.typeCardIconWrap, { backgroundColor: active ? t.bg : '#f3f4f6' }]}>
                        <Text style={s.typeCardEmoji}>{t.icon}</Text>
                      </View>
                      <Text style={[s.typeCardLabel, active && { color: t.color }]}>{t.label}</Text>
                      <Text style={s.typeCardDesc}>{t.desc}</Text>
                      {active && (
                        <View style={[s.typeCardCheck, { backgroundColor: t.color }]}>
                          <Text style={s.typeCardCheckText}>✓</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Priority */}
            <View style={s.formSection}>
              <Text style={s.formSectionLabel}>Priority</Text>
              <View style={s.priorityRow}>
                {PRIORITIES.map((p) => {
                  const active = selectedPriority === p.value;
                  return (
                    <TouchableOpacity
                      key={p.value}
                      style={[
                        s.prioBtn,
                        active ? { backgroundColor: p.color, borderColor: p.color } : { borderColor: p.color + '55', backgroundColor: p.bg },
                      ]}
                      onPress={() => setSelectedPriority(p.value)}
                      activeOpacity={0.75}
                    >
                      <View style={[s.prioBtnDot, { backgroundColor: active ? '#fff' : p.color }]} />
                      <Text style={[s.prioBtnText, { color: active ? '#fff' : p.color }]}>{p.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Notes */}
            <View style={s.formSection}>
              <Text style={s.formSectionLabel}>Notes <Text style={s.optionalTag}>(optional)</Text></Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Chips aisle is almost empty…"
                placeholderTextColor="#9ca3af"
                multiline
                maxLength={300}
                numberOfLines={3}
                textAlignVertical="top"
              />
              <Text style={s.charCount}>{notes.length}/300</Text>
            </View>

            {/* Submit */}
            <TouchableOpacity
              style={[s.submitBtn, (!canSubmit || submitMutation.isPending) && s.submitBtnDisabled]}
              onPress={() => canSubmit && submitMutation.mutate()}
              disabled={!canSubmit || submitMutation.isPending}
              activeOpacity={0.8}
            >
              {submitMutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.submitBtnText}>Send Request →</Text>
              }
            </TouchableOpacity>

          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  // Header
  headerBg: { backgroundColor: '#1D3557' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 4, gap: 12,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10,
    fontWeight: '800', letterSpacing: 1.5, marginBottom: 3,
  },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  newBtn: {
    backgroundColor: '#E63946', paddingHorizontal: 16, paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 4,
  },
  newBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  statsRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingVertical: 14,
  },
  statPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  statPillWarning: { backgroundColor: 'rgba(230,57,70,0.2)', borderColor: 'rgba(230,57,70,0.4)' },
  statNum: { color: '#fff', fontSize: 15, fontWeight: '800' },
  statNumWarning: { color: '#fca5a5' },
  statLbl: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },

  // List
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyBtn: {
    backgroundColor: '#1D3557', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12,
  },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  list: { padding: 16, gap: 12 },

  // Request cards
  card: {
    backgroundColor: '#fff', borderRadius: 16, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  priorityStripe: { width: 5 },
  cardInner: { flex: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  typeIconText: { fontSize: 22 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  metaText: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  prioPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  prioDot: { width: 7, height: 7, borderRadius: 4 },
  prioPillText: { fontSize: 10, fontWeight: '800' },

  notesBox: {
    backgroundColor: '#f8fafc', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  notesText: { fontSize: 13, color: '#374151', fontStyle: 'italic', lineHeight: 18 },

  ackBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#f0fdf4', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#bbf7d0',
  },
  ackIcon: { fontSize: 16, marginTop: 1 },
  ackBy: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  ackNote: { fontSize: 12, color: '#16a34a', fontStyle: 'italic', marginTop: 2 },

  pendingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start', backgroundColor: '#fffbeb',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10,
    borderWidth: 1, borderColor: '#fde68a',
  },
  pendingDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#f59e0b' },
  pendingText: { fontSize: 11, fontWeight: '700', color: '#b45309' },

  // Modal
  modalHeaderBar: { backgroundColor: '#fff', paddingTop: 12, paddingBottom: 0 },
  modalHeaderDrag: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb',
    alignSelf: 'center', marginBottom: 14,
  },
  modalHeaderRow: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f1f2',
  },
  modalHeaderTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },
  modalHeaderSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  modalCloseBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#f3f4f6',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { fontSize: 14, color: '#6b7280', fontWeight: '700' },

  formBody: { padding: 20, gap: 4 },
  formSection: { marginBottom: 24 },
  formSectionLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
  },
  optionalTag: { fontSize: 10, fontWeight: '500', textTransform: 'none', color: '#9ca3af' },

  warnBox: {
    backgroundColor: '#fffbeb', borderRadius: 12, padding: 14,
    marginBottom: 8, borderWidth: 1, borderColor: '#fde68a',
  },
  warnText: { fontSize: 13, color: '#b45309', lineHeight: 19 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: '#e5e7eb', backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#1D3557', borderColor: '#1D3557' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipTextActive: { color: '#fff' },

  // Type grid
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  typeCard: {
    width: '47%', backgroundColor: '#fff', borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: '#e5e7eb', gap: 6, position: 'relative',
  },
  typeCardIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', marginBottom: 2,
  },
  typeCardEmoji: { fontSize: 22 },
  typeCardLabel: { fontSize: 14, fontWeight: '800', color: '#111827' },
  typeCardDesc: { fontSize: 11, color: '#9ca3af', lineHeight: 15 },
  typeCardCheck: {
    position: 'absolute', top: 10, right: 10,
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  typeCardCheckText: { color: '#fff', fontSize: 12, fontWeight: '900' },

  // Priority
  priorityRow: { flexDirection: 'row', gap: 10 },
  prioBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5,
  },
  prioBtnDot: { width: 9, height: 9, borderRadius: 5 },
  prioBtnText: { fontSize: 13, fontWeight: '800' },

  // Notes
  notesInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#111827',
    minHeight: 88, backgroundColor: '#fff',
  },
  charCount: { fontSize: 11, color: '#9ca3af', textAlign: 'right', marginTop: 4 },

  // Submit
  submitBtn: {
    backgroundColor: '#1D3557', padding: 17,
    borderRadius: 14, alignItems: 'center', marginTop: 8,
    shadowColor: '#1D3557', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#9ca3af', shadowOpacity: 0 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
