import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, ActivityIndicator, TextInput, Modal, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { disputeApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

interface Dispute {
  id: string;
  description: string;
  estimatedAmt: number | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  resolvedNote: string | null;
  creditedAmt: number | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
}

const STATUS_STYLE: Record<string, { label: string; bg: string; color: string; border: string }> = {
  PENDING:  { label: 'Pending',  bg: '#fff7ed', color: '#c2410c', border: '#fed7aa' },
  APPROVED: { label: 'Approved', bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
  REJECTED: { label: 'Rejected', bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function getInitial(name: string) { return (name || '?')[0].toUpperCase(); }
const AVATAR_COLORS = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946'];

export default function ManagerDisputesScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [resolveTarget, setResolveTarget] = useState<Dispute | null>(null);
  const [resolveAction, setResolveAction] = useState<'APPROVED' | 'REJECTED'>('APPROVED');
  const [creditAmt, setCreditAmt] = useState('');
  const [resolveNote, setResolveNote] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['manager-disputes', storeId],
    queryFn: () => disputeApi.getForStore(storeId!),
    enabled: !!storeId,
    refetchInterval: 30000,
  });
  const disputes: Dispute[] = data?.data?.data || [];
  const pending = disputes.filter(d => d.status === 'PENDING');
  const displayed = statusFilter === '' ? disputes
    : statusFilter === 'PENDING' ? pending
    : disputes.filter(d => d.status !== 'PENDING');

  const resolveMutation = useMutation({
    mutationFn: ({ id, action, note, amt }: { id: string; action: 'APPROVED' | 'REJECTED'; note: string; amt?: number }) =>
      disputeApi.resolve(id, { action, resolvedNote: note || undefined, creditedAmt: amt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-disputes', storeId] });
      qc.invalidateQueries({ queryKey: ['disputes-pending-count', storeId] });
      setResolveTarget(null); setResolveNote(''); setCreditAmt('');
    },
    onError: (err: any) =>
      Alert.alert('Error', err?.response?.data?.error || err?.message || 'Something went wrong.'),
  });

  function openResolve(item: Dispute) {
    setResolveTarget(item);
    setResolveAction('APPROVED');
    setCreditAmt(item.estimatedAmt ? String(item.estimatedAmt) : '');
    setResolveNote('');
  }

  function submitResolve() {
    if (!resolveTarget) return;
    resolveMutation.mutate({
      id: resolveTarget.id,
      action: resolveAction,
      note: resolveNote,
      amt: resolveAction === 'APPROVED' && creditAmt ? parseFloat(creditAmt) : undefined,
    });
  }

  function renderItem({ item, index }: { item: Dispute; index: number }) {
    const st = STATUS_STYLE[item.status] || STATUS_STYLE.PENDING;
    const isPending = item.status === 'PENDING';
    const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];
    return (
      <View style={[s.card, !isPending && s.cardDone]}>
        <View style={s.cardInner}>
          <View style={s.cardTop}>
            <View style={[s.avatarCircle, { backgroundColor: avatarColor }]}>
              <Text style={s.avatarText}>{getInitial(item.customer?.name || item.customer?.phone)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.custName}>{item.customer?.name || item.customer?.phone}</Text>
              <Text style={s.metaSub}>{formatTime(item.createdAt)}</Text>
            </View>
            <View style={[s.statusBadge, { backgroundColor: st.bg, borderColor: st.border }]}>
              <Text style={[s.statusBadgeText, { color: st.color }]}>{st.label}</Text>
            </View>
          </View>

          <View style={s.notesBox}>
            <Text style={s.notesText}>"{item.description}"</Text>
          </View>

          {item.estimatedAmt != null && (
            <Text style={s.metaSub}>Estimated purchase: ${Number(item.estimatedAmt).toFixed(2)}</Text>
          )}

          {!isPending && (
            <View style={[s.resolvedBox, { backgroundColor: st.bg, borderColor: st.border }]}>
              {item.creditedAmt != null && (
                <Text style={[s.resolvedText, { color: st.color }]}>Credited: ${Number(item.creditedAmt).toFixed(2)}</Text>
              )}
              {item.resolvedNote ? (
                <Text style={[s.resolvedText, { color: st.color, fontStyle: 'italic' }]}>"{item.resolvedNote}"</Text>
              ) : null}
            </View>
          )}

          {isPending && (
            <TouchableOpacity style={s.actionBtn} onPress={() => openResolve(item)} activeOpacity={0.8}>
              <Text style={s.actionBtnText}>🚩  Review Dispute</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerEyebrow}>🚩 MISSING POINTS</Text>
            <Text style={s.headerTitle}>Disputes</Text>
          </View>
          {pending.length > 0 && (
            <View style={s.pendingBadge}>
              <Text style={s.pendingBadgeNum}>{pending.length}</Text>
              <Text style={s.pendingBadgeLbl}>pending</Text>
            </View>
          )}
        </View>

        <View style={s.filterRow}>
          {[
            { key: 'PENDING', label: 'Pending', count: pending.length },
            { key: '', label: 'All', count: disputes.length },
            { key: 'RESOLVED', label: 'Resolved', count: disputes.length - pending.length },
          ].map(f => (
            <TouchableOpacity key={f.key} style={[s.filterTab, statusFilter === f.key && s.filterTabActive]} onPress={() => setStatusFilter(f.key)}>
              <Text style={[s.filterTabText, statusFilter === f.key && s.filterTabTextActive]}>{f.label}</Text>
              {f.count > 0 && (
                <View style={[s.filterCount, statusFilter === f.key && s.filterCountActive]}>
                  <Text style={[s.filterCountText, statusFilter === f.key && s.filterCountTextActive]}>{f.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </SafeAreaView>

      {/* ── Content ── */}
      {!storeId ? (
        <View style={s.centered}>
          <Text style={s.emptyEmoji}>🏪</Text>
          <Text style={s.emptyTitle}>No store assigned</Text>
        </View>
      ) : isLoading ? (
        <View style={s.centered}><ActivityIndicator color={COLORS.primary} size="large" /></View>
      ) : displayed.length === 0 ? (
        <View style={s.centered}>
          <Text style={s.emptyEmoji}>{statusFilter === 'PENDING' ? '✅' : '📭'}</Text>
          <Text style={s.emptyTitle}>{statusFilter === 'PENDING' ? 'All clear!' : 'Nothing here'}</Text>
          <Text style={s.emptySub}>{statusFilter === 'PENDING' ? 'No pending missing-points reports' : 'No disputes in this category'}</Text>
        </View>
      ) : (
        <FlatList
          data={displayed}
          keyExtractor={d => d.id}
          renderItem={renderItem}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
        />
      )}

      {/* ── Resolve Sheet ── */}
      <Modal visible={!!resolveTarget} animationType="slide" transparent onRequestClose={() => setResolveTarget(null)}>
        <View style={s.overlay}>
          <View style={s.sheet}>
            <View style={s.sheetDrag} />
            <Text style={s.sheetTitle}>Resolve Dispute</Text>
            {resolveTarget && (
              <View style={s.previewCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.previewName}>{resolveTarget.customer?.name || resolveTarget.customer?.phone}</Text>
                  <Text style={s.previewNotes}>"{resolveTarget.description}"</Text>
                  {resolveTarget.estimatedAmt != null && (
                    <Text style={s.previewMeta}>Estimated: ${Number(resolveTarget.estimatedAmt).toFixed(2)}</Text>
                  )}
                </View>
              </View>
            )}

            <View style={s.toggleRow}>
              <TouchableOpacity style={[s.toggleBtn, resolveAction === 'APPROVED' && s.toggleBtnAccept]} onPress={() => setResolveAction('APPROVED')}>
                <Text style={[s.toggleBtnText, resolveAction === 'APPROVED' && s.toggleBtnTextAccept]}>✅ Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.toggleBtn, resolveAction === 'REJECTED' && s.toggleBtnReject]} onPress={() => setResolveAction('REJECTED')}>
                <Text style={[s.toggleBtnText, resolveAction === 'REJECTED' && s.toggleBtnTextReject]}>❌ Reject</Text>
              </TouchableOpacity>
            </View>

            {resolveAction === 'APPROVED' && (
              <>
                <Text style={s.sheetLabel}>Credits to Award</Text>
                <TextInput
                  style={s.amountInput}
                  value={creditAmt}
                  onChangeText={setCreditAmt}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 2.50"
                  placeholderTextColor="#9ca3af"
                />
              </>
            )}

            <Text style={s.sheetLabel}>Note <Text style={s.optionalTag}>(optional)</Text></Text>
            <TextInput
              style={s.noteInput} value={resolveNote} onChangeText={setResolveNote}
              placeholder="Explanation for your decision"
              placeholderTextColor="#9ca3af" multiline maxLength={300} numberOfLines={3} textAlignVertical="top"
            />

            <View style={s.sheetActions}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setResolveTarget(null)}>
                <Text style={s.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmBtn, resolveAction === 'REJECTED' && { backgroundColor: '#E63946', shadowColor: '#E63946' }, resolveMutation.isPending && { opacity: 0.65 }]}
                disabled={resolveMutation.isPending}
                onPress={submitResolve}
                activeOpacity={0.8}
              >
                {resolveMutation.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.confirmBtnText}>{resolveAction === 'APPROVED' ? '✅  Approve & Credit' : '❌  Reject Dispute'}</Text>
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
  headerBg: { backgroundColor: '#0f5132' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12, gap: 12,
  },
  headerEyebrow: { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  headerTitle: { color: '#fff', fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },

  pendingBadge: {
    backgroundColor: '#E63946', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, alignItems: 'center',
    shadowColor: '#E63946', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.45, shadowRadius: 8, elevation: 4,
  },
  pendingBadgeNum: { color: '#fff', fontSize: 18, fontWeight: '900', lineHeight: 20 },
  pendingBadgeLbl: { color: 'rgba(255,255,255,0.8)', fontSize: 9, fontWeight: '700' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 14, paddingTop: 8, gap: 8 },
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center', lineHeight: 20 },

  list: { padding: 16, gap: 12 },

  card: {
    backgroundColor: '#fff', borderRadius: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    borderWidth: 1, borderColor: '#f0f1f2',
  },
  cardDone: { opacity: 0.8 },
  cardInner: { padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  custName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  metaSub: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  statusBadgeText: { fontSize: 11, fontWeight: '700' },

  notesBox: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e5e7eb' },
  notesText: { fontSize: 13, color: '#374151', fontStyle: 'italic', lineHeight: 18 },

  resolvedBox: { borderRadius: 10, padding: 10, borderWidth: 1, gap: 3 },
  resolvedText: { fontSize: 12, fontWeight: '600' },

  actionBtn: {
    backgroundColor: '#0f5132', paddingVertical: 11, paddingHorizontal: 18,
    borderRadius: 12, alignSelf: 'stretch', alignItems: 'center',
    shadowColor: '#0f5132', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 3,
  },
  actionBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, paddingBottom: 40, gap: 14,
  },
  sheetDrag: { width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb', alignSelf: 'center', marginBottom: 4 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: '#111827' },

  previewCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: '#f8fafc', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#e5e7eb',
  },
  previewName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  previewMeta: { fontSize: 12, color: '#6b7280', marginTop: 4 },
  previewNotes: { fontSize: 13, color: '#6b7280', marginTop: 4, fontStyle: 'italic', lineHeight: 18 },

  toggleRow: { flexDirection: 'row', gap: 10 },
  toggleBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 2, borderColor: '#e5e7eb', backgroundColor: '#f9fafb',
  },
  toggleBtnAccept: { borderColor: '#16a34a', backgroundColor: '#f0fdf4' },
  toggleBtnReject: { borderColor: '#E63946', backgroundColor: '#fef2f2' },
  toggleBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  toggleBtnTextAccept: { color: '#15803d' },
  toggleBtnTextReject: { color: '#b91c1c' },

  sheetLabel: { fontSize: 11, fontWeight: '800', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8 },
  optionalTag: { fontSize: 10, fontWeight: '500', textTransform: 'none', color: '#9ca3af' },
  amountInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 14, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb',
  },
  noteInput: {
    borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 12,
    padding: 14, fontSize: 14, color: '#111827', minHeight: 88, backgroundColor: '#f9fafb',
  },

  sheetActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: { flex: 1, padding: 15, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  confirmBtn: {
    flex: 2, padding: 15, borderRadius: 12, backgroundColor: '#0f5132', alignItems: 'center',
    shadowColor: '#0f5132', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 8, elevation: 4,
  },
  confirmBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
