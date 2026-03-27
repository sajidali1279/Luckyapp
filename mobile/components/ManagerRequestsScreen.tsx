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

const TYPE_BG: Record<string, string> = {
  LOW_STOCK: '#eff6ff', STORE_SUPPLIES: '#fefce8',
  CUSTOMER_REQUESTED_PRODUCT: '#f0fdf4', WORK_ORDER: '#fdf4ff',
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
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitial(name: string) {
  return (name || '?')[0].toUpperCase();
}

const AVATAR_COLORS = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946'];

export default function ManagerRequestsScreen() {
  const qc = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ackTarget, setAckTarget] = useState<StoreRequest | null>(null);
  const [ackNote, setAckNote] = useState('');

  const { data: storesData } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data || [];
  const effectiveStoreId = stores.length === 1 ? stores[0]?.id : selectedStoreId;

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['manager-store-requests', effectiveStoreId, statusFilter],
    queryFn: () => storeRequestApi.getStoreRequests(effectiveStoreId!, statusFilter || undefined),
    enabled: !!effectiveStoreId,
    refetchInterval: 15000,
  });
  const requests: StoreRequest[] = requestsData?.data?.data || [];
  const pending = requests.filter((r) => r.status === 'PENDING');
  const displayed = statusFilter === 'PENDING'
    ? pending
    : statusFilter === 'ACKNOWLEDGED'
      ? requests.filter(r => r.status === 'ACKNOWLEDGED')
      : requests;

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

  const renderItem = useCallback(({ item, index }: { item: StoreRequest; index: number }) => {
    const pColor = PRIORITY_COLORS[item.priority] || '#adb5bd';
    const typeBg = TYPE_BG[item.type] || '#f3f4f6';
    const isDone = item.status === 'ACKNOWLEDGED';
    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

    return (
      <View style={[s.card, isDone && s.cardDone]}>
        <View style={[s.priorityStripe, { backgroundColor: isDone ? '#d1fae5' : pColor }]} />
        <View style={s.cardInner}>
          {/* Top row */}
          <View style={s.cardTop}>
            <View style={[s.typeIconWrap, { backgroundColor: typeBg }]}>
              <Text style={s.typeIconText}>{TYPE_ICONS[item.type] || '📋'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.typeLabel, isDone && s.typeLabelDone]}>{TYPE_LABELS[item.type] || item.type}</Text>
              <Text style={s.storeMeta}>{item.store?.name}</Text>
            </View>
            {/* Priority badge */}
            {!isDone && (
              <View style={[s.prioBadge, { backgroundColor: pColor + '18', borderColor: pColor + '60' }]}>
                <View style={[s.prioBadgeDot, { backgroundColor: pColor }]} />
                <Text style={[s.prioBadgeText, { color: pColor }]}>{item.priority}</Text>
              </View>
            )}
            {isDone && (
              <View style={s.doneBadge}>
                <Text style={s.doneBadgeText}>✓ Done</Text>
              </View>
            )}
          </View>

          {/* Submitter row */}
          <View style={s.submitterRow}>
            <View style={[s.avatarCircle, { backgroundColor: avatarColor }]}>
              <Text style={s.avatarText}>{getInitial(item.submitterName)}</Text>
            </View>
            <Text style={s.submitterText}>
              <Text style={s.submitterName}>{item.submitterName}</Text>
              {'  ·  '}{formatTime(item.createdAt)}
            </Text>
          </View>

          {/* Notes */}
          {item.notes ? (
            <View style={s.notesBox}>
              <Text style={s.notesText}>"{item.notes}"</Text>
            </View>
          ) : null}

          {/* Acknowledge / Done */}
          {isDone ? (
            <View style={s.ackBox}>
              <Text style={s.ackIcon}>✅</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.ackBy}>Handled by {item.acknowledgerName}</Text>
                {item.acknowledgerNote ? <Text style={s.ackNote}>"{item.acknowledgerNote}"</Text> : null}
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={s.ackBtn}
              onPress={() => { setAckTarget(item); setAckNote(''); }}
              activeOpacity={0.8}
            >
              <Text style={s.ackBtnText}>✅  Mark as Handled</Text>
            </TouchableOpacity>
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
            <Text style={s.headerTitle}>Incoming Requests</Text>
          </View>
          {pending.length > 0 && (
            <View style={s.pendingBadge}>
              <Text style={s.pendingBadgeNum}>{pending.length}</Text>
              <Text style={s.pendingBadgeLbl}>{pending.length === 1 ? 'pending' : 'pending'}</Text>
            </View>
          )}
        </View>

        {/* Store picker (multi-store) */}
        {stores.length > 1 && (
          <View style={s.storePickerRow}>
            {stores.map((st) => (
              <TouchableOpacity
                key={st.id}
                style={[s.storeChip, st.id === effectiveStoreId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(st.id)}
              >
                <Text style={[s.storeChipText, st.id === effectiveStoreId && s.storeChipTextActive]}>
                  {st.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Filter tabs */}
        {effectiveStoreId && (
          <View style={s.filterRow}>
            {[
              { key: '',             label: 'All',     count: requests.length },
              { key: 'PENDING',      label: 'Pending', count: pending.length },
              { key: 'ACKNOWLEDGED', label: 'Done',    count: requests.length - pending.length },
            ].map((f) => (
              <TouchableOpacity
                key={f.key}
                style={[s.filterTab, statusFilter === f.key && s.filterTabActive]}
                onPress={() => setStatusFilter(f.key)}
              >
                <Text style={[s.filterTabText, statusFilter === f.key && s.filterTabTextActive]}>
                  {f.label}
                </Text>
                {f.count > 0 && (
                  <View style={[s.filterCount, statusFilter === f.key && s.filterCountActive]}>
                    <Text style={[s.filterCountText, statusFilter === f.key && s.filterCountTextActive]}>
                      {f.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
      </SafeAreaView>

      {/* ── Content ── */}
      {!effectiveStoreId ? (
        <View style={s.centered}>
          <Text style={s.emptyEmoji}>🏪</Text>
          <Text style={s.emptyTitle}>Select a store</Text>
          <Text style={s.emptySub}>Choose a store above to view its requests</Text>
        </View>
      ) : isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : displayed.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyEmoji}>{statusFilter === 'PENDING' ? '✅' : '📭'}</Text>
          <Text style={s.emptyTitle}>{statusFilter === 'PENDING' ? 'All clear!' : 'Nothing here'}</Text>
          <Text style={s.emptySub}>
            {statusFilter === 'PENDING' ? 'No pending requests from your team' : 'No requests in this category'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={(r) => r.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Acknowledge Bottom Sheet ── */}
      <Modal
        visible={!!ackTarget}
        animationType="slide"
        presentationStyle="formSheet"
        transparent
        onRequestClose={() => setAckTarget(null)}
      >
        <View style={s.overlay}>
          <View style={s.sheet}>
            {/* Sheet drag handle */}
            <View style={s.sheetDrag} />

            <Text style={s.sheetTitle}>Mark as Handled</Text>

            {/* Request preview card */}
            {ackTarget && (
              <View style={s.previewCard}>
                <View style={[s.previewIconWrap, { backgroundColor: TYPE_BG[ackTarget.type] || '#f3f4f6' }]}>
                  <Text style={s.previewIcon}>{TYPE_ICONS[ackTarget.type]}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.previewType}>{TYPE_LABELS[ackTarget.type]}</Text>
                  <Text style={s.previewMeta}>from {ackTarget.submitterName}</Text>
                  {ackTarget.notes ? (
                    <Text style={s.previewNotes} numberOfLines={2}>"{ackTarget.notes}"</Text>
                  ) : null}
                </View>
                <View style={[s.previewPrio, { backgroundColor: (PRIORITY_COLORS[ackTarget.priority] || '#aaa') + '22' }]}>
                  <Text style={[s.previewPrioText, { color: PRIORITY_COLORS[ackTarget.priority] || '#aaa' }]}>
                    {ackTarget.priority}
                  </Text>
                </View>
              </View>
            )}

            <Text style={s.sheetLabel}>Add a note <Text style={s.optionalTag}>(optional)</Text></Text>
            <TextInput
              style={s.noteInput}
              value={ackNote}
              onChangeText={setAckNote}
              placeholder="e.g. Ordered, arriving Thursday…"
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={300}
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setAckTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, acknowledgeMutation.isPending && { opacity: 0.65 }]}
                disabled={acknowledgeMutation.isPending}
                onPress={() => ackTarget && acknowledgeMutation.mutate({ id: ackTarget.id, note: ackNote })}
                activeOpacity={0.8}
              >
                {acknowledgeMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmBtnText}>✅  Confirm</Text>
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
  // Header
  headerBg: { backgroundColor: '#0f5132' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 12,
  },
  headerEyebrow: {
    color: 'rgba(255,255,255,0.45)', fontSize: 10,
    fontWeight: '800', letterSpacing: 1.5, marginBottom: 3,
  },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  pendingBadge: {
    backgroundColor: '#E63946', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 16, alignItems: 'center',
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 4,
  },
  pendingBadgeNum: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 20 },
  pendingBadgeLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700' },

  storePickerRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 20, paddingBottom: 10,
  },
  storeChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.5)' },
  storeChipText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff' },

  filterRow: {
    flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, gap: 8,
  },
  filterTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  filterTabActive: { backgroundColor: '#fff', borderColor: '#fff' },
  filterTabText: { color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: '700' },
  filterTabTextActive: { color: '#0f5132' },
  filterCount: {
    minWidth: 18, height: 18, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  filterCountActive: { backgroundColor: '#0f5132' },
  filterCountText: { color: 'rgba(255,255,255,0.8)', fontSize: 10, fontWeight: '800' },
  filterCountTextActive: { color: '#fff' },

  // Content
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  list: { padding: 16, gap: 12 },

  // Request cards
  card: {
    backgroundColor: '#fff', borderRadius: 16, flexDirection: 'row', overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  cardDone: { opacity: 0.75 },
  priorityStripe: { width: 5 },
  cardInner: { flex: 1, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  typeIconText: { fontSize: 22 },
  typeLabel: { fontSize: 15, fontWeight: '700', color: '#111827' },
  typeLabelDone: { color: '#6b7280' },
  storeMeta: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  prioBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  prioBadgeDot: { width: 7, height: 7, borderRadius: 4 },
  prioBadgeText: { fontSize: 10, fontWeight: '800' },

  doneBadge: {
    backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, borderColor: '#a7f3d0',
  },
  doneBadgeText: { fontSize: 11, fontWeight: '700', color: '#065f46' },

  submitterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarCircle: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  submitterText: { fontSize: 12, color: '#6b7280' },
  submitterName: { fontWeight: '700', color: '#374151' },

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
  ackIcon: { fontSize: 15, marginTop: 1 },
  ackBy: { fontSize: 12, fontWeight: '700', color: '#16a34a' },
  ackNote: { fontSize: 12, color: '#16a34a', fontStyle: 'italic', marginTop: 2 },

  ackBtn: {
    backgroundColor: '#0f5132', paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 12, alignSelf: 'stretch', alignItems: 'center',
    shadowColor: '#0f5132', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  ackBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Bottom sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 16,
  },
  sheetDrag: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb',
    alignSelf: 'center', marginBottom: 4,
  },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

  previewCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#e5e7eb',
  },
  previewIconWrap: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  previewIcon: { fontSize: 20 },
  previewType: { fontSize: 14, fontWeight: '700', color: '#111827' },
  previewMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  previewNotes: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 4 },
  previewPrio: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignSelf: 'flex-start' },
  previewPrioText: { fontSize: 10, fontWeight: '800' },

  sheetLabel: {
    fontSize: 11, fontWeight: '800', color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  optionalTag: { fontSize: 10, fontWeight: '500', textTransform: 'none', color: '#9ca3af' },
  noteInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#111827',
    minHeight: 88, backgroundColor: '#f9fafb',
  },

  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1, padding: 15, borderRadius: 12,
    borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center',
  },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBtn: {
    flex: 2, padding: 15, borderRadius: 12,
    backgroundColor: '#0f5132', alignItems: 'center',
    shadowColor: '#0f5132', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
