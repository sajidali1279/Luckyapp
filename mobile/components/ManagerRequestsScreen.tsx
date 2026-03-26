import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, TextInput, Modal, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeRequestApi, chatApi } from '../services/api';
import { COLORS } from '../constants';

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'Low Stock',
  STORE_SUPPLIES: 'Store Supplies',
  CUSTOMER_REQUESTED_PRODUCT: 'Customer Request',
  WORK_ORDER: 'Work Order',
};

const TYPE_ICONS: Record<string, string> = {
  LOW_STOCK: '📦', STORE_SUPPLIES: '🧹', CUSTOMER_REQUESTED_PRODUCT: '🛍️', WORK_ORDER: '🔧',
};

const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#E63946', MEDIUM: '#f59e0b', LOW: '#2DC653',
};

interface StoreRequest {
  id: string;
  storeId: string;
  submitterName: string;
  submitterRole: string;
  type: string;
  priority: string;
  notes: string | null;
  status: string;
  acknowledgedById: string | null;
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

export default function ManagerRequestsScreen() {
  const qc = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ackTarget, setAckTarget] = useState<StoreRequest | null>(null);
  const [ackNote, setAckNote] = useState('');

  // Load stores
  const { data: storesData } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data || [];
  const effectiveStoreId = stores.length === 1 ? stores[0]?.id : selectedStoreId;

  // Fetch requests
  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['manager-store-requests', effectiveStoreId, statusFilter],
    queryFn: () => storeRequestApi.getStoreRequests(effectiveStoreId!, statusFilter || undefined),
    enabled: !!effectiveStoreId,
    refetchInterval: 15000,
  });
  const requests: StoreRequest[] = requestsData?.data?.data || [];
  const pending = requests.filter((r) => r.status === 'PENDING');
  const displayed = statusFilter === 'PENDING' ? pending : statusFilter === 'ACKNOWLEDGED' ? requests.filter(r => r.status === 'ACKNOWLEDGED') : requests;

  const acknowledgeMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      storeRequestApi.acknowledge(id, note || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-store-requests'] });
      setAckTarget(null);
      setAckNote('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || err?.message || 'Something went wrong.';
      Alert.alert('Failed to Acknowledge', msg);
    },
  });

  const renderItem = useCallback(({ item }: { item: StoreRequest }) => (
    <View style={s.card}>
      <View style={[s.priorityBar, { backgroundColor: PRIORITY_COLORS[item.priority] || '#adb5bd' }]} />
      <View style={s.cardContent}>
        <View style={s.cardRow}>
          <Text style={s.typeIcon}>{TYPE_ICONS[item.type] || '📋'}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.typeLabel}>{TYPE_LABELS[item.type] || item.type}</Text>
            <Text style={s.submitterText}>from {item.submitterName} · {formatTime(item.createdAt)}</Text>
          </View>
          <View style={[s.prioBadge, { backgroundColor: PRIORITY_COLORS[item.priority] + '22', borderColor: PRIORITY_COLORS[item.priority] }]}>
            <Text style={[s.prioBadgeText, { color: PRIORITY_COLORS[item.priority] }]}>{item.priority}</Text>
          </View>
        </View>

        {item.notes ? <Text style={s.notesText}>"{item.notes}"</Text> : null}

        {item.status === 'ACKNOWLEDGED' ? (
          <View style={s.ackBox}>
            <Text style={s.ackBy}>✅ Acknowledged by {item.acknowledgerName} · {item.acknowledgedAt ? formatTime(item.acknowledgedAt) : ''}</Text>
            {item.acknowledgerNote ? <Text style={s.ackNote}>"{item.acknowledgerNote}"</Text> : null}
          </View>
        ) : (
          <TouchableOpacity
            style={s.ackBtn}
            onPress={() => { setAckTarget(item); setAckNote(''); }}
          >
            <Text style={s.ackBtnText}>✅ Acknowledge</Text>
          </TouchableOpacity>
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
          <Text style={s.headerSub}>{pending.length} pending · {requests.length - pending.length} done</Text>
        </View>

        {/* Store picker (multi-store managers) */}
        {stores.length > 1 && (
          <View style={s.storePicker}>
            {stores.map((st) => (
              <TouchableOpacity
                key={st.id}
                style={[s.storeChip, st.id === effectiveStoreId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(st.id)}
              >
                <Text style={[s.storeChipText, st.id === effectiveStoreId && s.storeChipTextActive]}>{st.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Filter tabs */}
        {effectiveStoreId && (
          <View style={s.filterRow}>
            {[
              { key: '', label: `All (${requests.length})` },
              { key: 'PENDING', label: `Pending (${pending.length})` },
              { key: 'ACKNOWLEDGED', label: 'Done' },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterTab, statusFilter === f.key && s.filterTabActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[s.filterTabText, statusFilter === f.key && s.filterTabTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>

      {/* Content */}
      {!effectiveStoreId ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>📋</Text>
          <Text style={s.emptyTitle}>Select a store</Text>
        </View>
      ) : isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} /></View>
      ) : displayed.length === 0 ? (
        <View style={s.centered}>
          <Text style={{ fontSize: 40, marginBottom: 10 }}>✅</Text>
          <Text style={s.emptyTitle}>All clear!</Text>
          <Text style={s.emptySub}>No requests in this category</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
        />
      )}

      {/* ── Acknowledge Modal ── */}
      <Modal visible={!!ackTarget} animationType="slide" presentationStyle="formSheet" transparent onRequestClose={() => setAckTarget(null)}>
        <View style={s.overlay}>
          <View style={s.modal}>
            <Text style={s.modalTitle}>Acknowledge Request</Text>
            {ackTarget && (
              <Text style={s.modalSub}>
                {TYPE_ICONS[ackTarget.type]} {TYPE_LABELS[ackTarget.type]} · from {ackTarget.submitterName}
              </Text>
            )}
            {ackTarget?.notes ? (
              <Text style={s.modalNotes}>"{ackTarget.notes}"</Text>
            ) : null}
            <TextInput
              style={s.noteInput}
              value={ackNote}
              onChangeText={setAckNote}
              placeholder="Optional note (e.g. 'Ordered, arriving Thursday')"
              placeholderTextColor={COLORS.textMuted}
              multiline
              maxLength={300}
              numberOfLines={3}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setAckTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, acknowledgeMutation.isPending && { opacity: 0.6 }]}
                disabled={acknowledgeMutation.isPending}
                onPress={() => ackTarget && acknowledgeMutation.mutate({ id: ackTarget.id, note: ackNote })}
              >
                {acknowledgeMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmBtnText}>✅ Confirm</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  headerBg: { backgroundColor: COLORS.secondary },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },

  storePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  storeChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  storeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  storeChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10, gap: 8 },
  filterTab: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  filterTabActive: { backgroundColor: '#fff' },
  filterTabText: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' },
  filterTabTextActive: { color: COLORS.secondary },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, marginTop: 6 },

  list: { padding: 16, gap: 10 },

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
  submitterText: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  prioBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  prioBadgeText: { fontSize: 10, fontWeight: '800' },
  notesText: { marginTop: 8, fontSize: 13, color: COLORS.textMuted, fontStyle: 'italic' },
  ackBox: { marginTop: 10, padding: 10, backgroundColor: '#d1e7dd', borderRadius: 8 },
  ackBy: { fontSize: 12, fontWeight: '600', color: '#0f5132' },
  ackNote: { fontSize: 12, color: '#0f5132', fontStyle: 'italic', marginTop: 3 },
  ackBtn: {
    marginTop: 12, paddingVertical: 8, paddingHorizontal: 16,
    backgroundColor: COLORS.secondary, borderRadius: 8, alignSelf: 'flex-start',
  },
  ackBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, marginBottom: 6 },
  modalSub: { fontSize: 14, color: COLORS.textMuted, marginBottom: 8 },
  modalNotes: { fontSize: 13, fontStyle: 'italic', color: COLORS.textMuted, backgroundColor: COLORS.background, padding: 10, borderRadius: 8, marginBottom: 12 },
  noteInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10,
    padding: 12, fontSize: 14, color: COLORS.text,
    minHeight: 80, textAlignVertical: 'top', marginBottom: 16,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  confirmBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: COLORS.secondary, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
