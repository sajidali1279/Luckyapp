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
  { value: 'LOW_STOCK', label: 'Low Stock', icon: '📦', desc: 'Product running low' },
  { value: 'STORE_SUPPLIES', label: 'Store Supplies', icon: '🧹', desc: 'Cleaning, bags, etc.' },
  { value: 'CUSTOMER_REQUESTED_PRODUCT', label: 'Customer Request', icon: '🛍️', desc: 'Item a customer asked for' },
  { value: 'WORK_ORDER', label: 'Work Order', icon: '🔧', desc: 'Equipment or maintenance' },
];

const PRIORITIES = [
  { value: 'LOW', label: 'Low', color: '#2DC653' },
  { value: 'MEDIUM', label: 'Medium', color: '#f59e0b' },
  { value: 'HIGH', label: 'High', color: '#E63946' },
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
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function EmployeeRequestsScreen() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [selectedPriority, setSelectedPriority] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  // Load stores for store picker
  const { data: storesData } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data || [];

  // Auto-select if only one store
  const effectiveStore = selectedStore || (stores.length === 1 ? stores[0]?.id : null);

  // My submitted requests
  const { data: myRequestsData, isLoading } = useQuery({
    queryKey: ['my-store-requests'],
    queryFn: () => storeRequestApi.getMine(),
    refetchInterval: 30000,
  });
  const myRequests: StoreRequest[] = myRequestsData?.data?.data || [];

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

  const renderRequest = useCallback(({ item }: { item: StoreRequest }) => (
    <View style={s.card}>
      <View style={[s.priorityBar, { backgroundColor: PRIORITY_COLORS[item.priority] || '#adb5bd' }]} />
      <View style={s.cardContent}>
        <View style={s.cardRow}>
          <Text style={s.typeIcon}>{TYPE_ICONS[item.type] || '📋'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.typeLabel}>{TYPE_LABELS[item.type] || item.type}</Text>
            <Text style={s.storeName}>{item.store.name} · {formatTime(item.createdAt)}</Text>
          </View>
          <View style={[s.statusBadge, item.status === 'PENDING' ? s.statusPending : s.statusDone]}>
            <Text style={[s.statusText, item.status === 'PENDING' ? s.statusPendingText : s.statusDoneText]}>
              {item.status === 'PENDING' ? 'Pending' : 'Done'}
            </Text>
          </View>
        </View>
        {item.notes ? <Text style={s.notesText}>"{item.notes}"</Text> : null}
        {item.status === 'ACKNOWLEDGED' && (
          <View style={s.ackBox}>
            <Text style={s.ackBy}>✅ Acknowledged by {item.acknowledgerName}</Text>
            {item.acknowledgerNote ? <Text style={s.ackNote}>"{item.acknowledgerNote}"</Text> : null}
          </View>
        )}
      </View>
    </View>
  ), []);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Header */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.header}>
          <Text style={s.headerTitle}>📋 Store Requests</Text>
          <Text style={s.headerSub}>{myRequests.length} submitted · {myRequests.filter(r => r.status === 'PENDING').length} pending</Text>
        </View>
      </SafeAreaView>

      {/* New Request Button */}
      <TouchableOpacity style={s.newBtn} onPress={() => setShowForm(true)}>
        <Text style={s.newBtnText}>+ New Request</Text>
      </TouchableOpacity>

      {/* My requests list */}
      {isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} /></View>
      ) : myRequests.length === 0 ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📋</Text>
          <Text style={s.emptyTitle}>No requests yet</Text>
          <Text style={s.emptySub}>Tap "+ New Request" to send one to your manager</Text>
        </View>
      ) : (
        <FlatList
          data={myRequests}
          keyExtractor={(r) => r.id}
          renderItem={renderRequest}
          contentContainerStyle={s.list}
        />
      )}

      {/* ── New Request Modal ── */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
          <ScrollView contentContainerStyle={s.form}>
            <View style={s.formHeader}>
              <Text style={s.formTitle}>New Store Request</Text>
              <TouchableOpacity onPress={() => setShowForm(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* No store warning */}
            {noStoreAssigned && (
              <View style={s.warnBox}>
                <Text style={s.warnText}>⚠️ You are not assigned to any store yet. Ask your manager to assign you to a store before submitting requests.</Text>
              </View>
            )}

            {/* Store picker (only if multi-store) */}
            {stores.length > 1 && (
              <View style={s.section}>
                <Text style={s.sectionLabel}>Store</Text>
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
            <View style={s.section}>
              <Text style={s.sectionLabel}>Request Type</Text>
              {REQUEST_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[s.typeCard, selectedType === t.value && s.typeCardActive]}
                  onPress={() => setSelectedType(t.value)}
                >
                  <Text style={s.typeCardIcon}>{t.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.typeCardLabel, selectedType === t.value && s.typeCardLabelActive]}>{t.label}</Text>
                    <Text style={s.typeCardDesc}>{t.desc}</Text>
                  </View>
                  {selectedType === t.value && <Text style={s.checkMark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </View>

            {/* Priority */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Priority</Text>
              <View style={s.priorityRow}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity
                    key={p.value}
                    style={[s.prioBtn, selectedPriority === p.value && { backgroundColor: p.color, borderColor: p.color }]}
                    onPress={() => setSelectedPriority(p.value)}
                  >
                    <View style={[s.prioDot, { backgroundColor: selectedPriority === p.value ? '#fff' : p.color }]} />
                    <Text style={[s.prioBtnText, selectedPriority === p.value && { color: '#fff' }]}>{p.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Notes */}
            <View style={s.section}>
              <Text style={s.sectionLabel}>Notes (optional)</Text>
              <TextInput
                style={s.notesInput}
                value={notes}
                onChangeText={setNotes}
                placeholder="e.g. Chips aisle is almost empty"
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxLength={300}
                numberOfLines={3}
              />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, !canSubmit && s.submitBtnDisabled]}
              onPress={() => canSubmit && submitMutation.mutate()}
              disabled={!canSubmit || submitMutation.isPending}
            >
              {submitMutation.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.submitBtnText}>Send Request</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  headerBg: { backgroundColor: COLORS.secondary },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },

  newBtn: {
    margin: 16, padding: 14, backgroundColor: COLORS.primary,
    borderRadius: 12, alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },

  list: { padding: 16, paddingTop: 0, gap: 10 },

  card: {
    backgroundColor: COLORS.white, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  priorityBar: { width: 5 },
  cardContent: { flex: 1, padding: 14 },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeIcon: { fontSize: 24 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  storeName: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10 },
  statusPending: { backgroundColor: '#fff3cd' },
  statusDone: { backgroundColor: '#d1e7dd' },
  statusText: { fontSize: 11, fontWeight: '700' },
  statusPendingText: { color: '#856404' },
  statusDoneText: { color: '#0f5132' },
  notesText: { marginTop: 8, fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  ackBox: { marginTop: 10, padding: 10, backgroundColor: '#d1e7dd', borderRadius: 8 },
  ackBy: { fontSize: 12, fontWeight: '600', color: '#0f5132' },
  ackNote: { fontSize: 12, color: '#0f5132', fontStyle: 'italic', marginTop: 3 },

  form: { padding: 20, gap: 4 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  closeBtn: { fontSize: 20, color: COLORS.textMuted, padding: 4 },

  section: { marginBottom: 20 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white },
  chipActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  chipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  chipTextActive: { color: '#fff' },

  typeCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.white, marginBottom: 8,
  },
  typeCardActive: { borderColor: COLORS.secondary, backgroundColor: '#f0f4ff' },
  typeCardIcon: { fontSize: 26 },
  typeCardLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  typeCardLabelActive: { color: COLORS.secondary },
  typeCardDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  checkMark: { fontSize: 18, color: COLORS.secondary, fontWeight: '700' },

  priorityRow: { flexDirection: 'row', gap: 10 },
  prioBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white,
  },
  prioDot: { width: 10, height: 10, borderRadius: 5 },
  prioBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.text },

  notesInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: COLORS.text,
    minHeight: 80, textAlignVertical: 'top',
  },

  warnBox: { backgroundColor: '#fff3cd', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#ffc107' },
  warnText: { fontSize: 13, color: '#856404', lineHeight: 18 },

  submitBtn: {
    backgroundColor: COLORS.secondary, padding: 16,
    borderRadius: 12, alignItems: 'center', marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: COLORS.textMuted },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
