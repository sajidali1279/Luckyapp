import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storeRequestApi, chatApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

const TYPE_LABELS: Record<string, string> = {
  LOW_STOCK: 'Low Stock',
  STORE_SUPPLIES: 'Store Supplies',
  CUSTOMER_REQUESTED_PRODUCT: 'Customer Request',
  WORK_ORDER: 'Work Order',
};

const TYPE_ICONS: Record<string, string> = {
  LOW_STOCK: '📦',
  STORE_SUPPLIES: '🧹',
  CUSTOMER_REQUESTED_PRODUCT: '🛍️',
  WORK_ORDER: '🔧',
};

const PRIORITY_COLORS: Record<string, React.CSSProperties> = {
  HIGH:   { background: '#fff0f0', color: '#c0392b', borderColor: '#f5c6cb' },
  MEDIUM: { background: '#fff8e1', color: '#b7770d', borderColor: '#ffe082' },
  LOW:    { background: '#f0fff4', color: '#1a7c47', borderColor: '#b2dfdb' },
};

const PRIORITY_DOT: Record<string, string> = {
  HIGH: '#E63946', MEDIUM: '#f59e0b', LOW: '#2DC653',
};

interface StoreRequest {
  id: string;
  storeId: string;
  submittedById: string;
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

export default function StoreRequests() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isReadOnly = ['DEV_ADMIN', 'SUPER_ADMIN'].includes(user?.role || '');
  const isStoreManager = user?.role === 'STORE_MANAGER';

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [ackTarget, setAckTarget] = useState<StoreRequest | null>(null);
  const [ackNote, setAckNote] = useState('');

  // Load stores
  const { data: storesData } = useQuery({
    queryKey: ['chat-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string; city: string }[] = storesData?.data?.data || [];

  // Auto-select first store for managers (only one store)
  const effectiveStoreId = isStoreManager && stores.length === 1
    ? stores[0]?.id
    : selectedStoreId;

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['store-requests', effectiveStoreId, statusFilter],
    queryFn: () => storeRequestApi.getStoreRequests(effectiveStoreId!, statusFilter || undefined),
    enabled: !!effectiveStoreId,
    refetchInterval: 15000,
  });
  const requests: StoreRequest[] = requestsData?.data?.data || [];

  const acknowledgeMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      storeRequestApi.acknowledge(id, note || undefined),
    onSuccess: () => {
      toast.success('Request acknowledged');
      qc.invalidateQueries({ queryKey: ['store-requests'] });
      qc.invalidateQueries({ queryKey: ['store-requests-count'] });
      setAckTarget(null);
      setAckNote('');
    },
    onError: () => toast.error('Failed to acknowledge'),
  });

  const pending = requests.filter((r) => r.status === 'PENDING');
  const acknowledged = requests.filter((r) => r.status === 'ACKNOWLEDGED');
  const displayed = statusFilter === 'PENDING' ? pending : statusFilter === 'ACKNOWLEDGED' ? acknowledged : requests;

  return (
    <div style={s.page}>
      {/* ── Sidebar (store picker, hidden for single-store managers) ── */}
      {!isStoreManager && (
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <span style={s.sidebarTitle}>📋 Store Requests</span>
          </div>
          <div style={s.storeList}>
            {stores.map((store) => (
              <button
                key={store.id}
                style={{ ...s.storeBtn, ...(store.id === selectedStoreId ? s.storeBtnActive : {}) }}
                onClick={() => setSelectedStoreId(store.id)}
              >
                <span style={s.storeIcon}>⛽</span>
                <div>
                  <div style={s.storeBtnName}>{store.name}</div>
                  {store.city && <div style={s.storeBtnCity}>{store.city}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Main Panel ── */}
      <div style={s.main}>
        {!effectiveStoreId ? (
          <div style={s.empty}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#1D3557' }}>Select a store to view requests</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={s.header}>
              <div>
                <div style={s.headerTitle}>
                  📋 {isStoreManager ? stores[0]?.name : stores.find(s => s.id === effectiveStoreId)?.name} — Store Requests
                </div>
                <div style={s.headerSub}>
                  {pending.length} pending · {acknowledged.length} acknowledged
                </div>
              </div>
              {/* Filter tabs */}
              <div style={s.filterRow}>
                {['', 'PENDING', 'ACKNOWLEDGED'].map((f) => (
                  <button
                    key={f}
                    style={{ ...s.filterBtn, ...(statusFilter === f ? s.filterBtnActive : {}) }}
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === '' ? 'All' : f === 'PENDING' ? `Pending${pending.length ? ` (${pending.length})` : ''}` : 'Done'}
                  </button>
                ))}
              </div>
            </div>

            {/* Requests list */}
            {isLoading ? (
              <div style={s.empty}><div style={{ fontSize: 24 }}>⏳</div></div>
            ) : displayed.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>✅</div>
                <div style={{ fontWeight: 600, color: '#495057' }}>No requests here</div>
              </div>
            ) : (
              <div style={s.list}>
                {displayed.map((req) => {
                  const prioStyle = PRIORITY_COLORS[req.priority] || {};
                  return (
                    <div key={req.id} style={s.card}>
                      {/* Priority strip */}
                      <div style={{ ...s.priorityStrip, background: PRIORITY_DOT[req.priority] || '#adb5bd' }} />

                      <div style={s.cardBody}>
                        <div style={s.cardTop}>
                          <div style={s.cardLeft}>
                            <span style={s.typeIcon}>{TYPE_ICONS[req.type] || '📋'}</span>
                            <div>
                              <div style={s.typeLabel}>{TYPE_LABELS[req.type] || req.type}</div>
                              <div style={s.submitterLine}>by {req.submitterName} · {formatTime(req.createdAt)}</div>
                            </div>
                          </div>
                          <div style={s.cardRight}>
                            <span style={{ ...s.prioBadge, ...prioStyle }}>{req.priority}</span>
                            <span style={{ ...s.statusBadge, ...(req.status === 'PENDING' ? s.statusPending : s.statusDone) }}>
                              {req.status === 'PENDING' ? '⏳ Pending' : '✅ Done'}
                            </span>
                          </div>
                        </div>

                        {req.notes && <div style={s.notes}>"{req.notes}"</div>}

                        {req.status === 'ACKNOWLEDGED' && (
                          <div style={s.ackInfo}>
                            <span style={s.ackBy}>Acknowledged by {req.acknowledgerName} · {req.acknowledgedAt ? formatTime(req.acknowledgedAt) : ''}</span>
                            {req.acknowledgerNote && <div style={s.ackNote}>"{req.acknowledgerNote}"</div>}
                          </div>
                        )}

                        {req.status === 'PENDING' && !isReadOnly && (
                          <button style={s.ackBtn} onClick={() => { setAckTarget(req); setAckNote(''); }}>
                            ✅ Acknowledge
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Acknowledge Modal ── */}
      {ackTarget && (
        <div style={s.overlay} onClick={() => setAckTarget(null)}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <div style={s.modalTitle}>Acknowledge Request</div>
            <div style={s.modalSub}>
              {TYPE_ICONS[ackTarget.type]} {TYPE_LABELS[ackTarget.type]} · {ackTarget.submitterName}
            </div>
            {ackTarget.notes && <div style={s.modalNotes}>"{ackTarget.notes}"</div>}
            <textarea
              style={s.noteInput}
              placeholder="Optional note (e.g. 'Ordered, arriving Thursday')"
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              rows={3}
            />
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setAckTarget(null)}>Cancel</button>
              <button
                style={s.confirmBtn}
                disabled={acknowledgeMutation.isPending}
                onClick={() => acknowledgeMutation.mutate({ id: ackTarget.id, note: ackNote })}
              >
                {acknowledgeMutation.isPending ? 'Saving…' : '✅ Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', height: 'calc(100vh - 64px)', background: '#f8f9fa', overflow: 'hidden' },

  sidebar: { width: 240, background: '#fff', borderRight: '1px solid #dee2e6', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  sidebarHeader: { padding: '18px 16px 14px', borderBottom: '1px solid #dee2e6' },
  sidebarTitle: { fontWeight: 800, fontSize: 15, color: '#1D3557' },
  storeList: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  storeBtn: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' },
  storeBtnActive: { background: '#f0f4ff' },
  storeIcon: { fontSize: 18, flexShrink: 0 },
  storeBtnName: { fontWeight: 600, fontSize: 13, color: '#212529', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeBtnCity: { fontSize: 11, color: '#6c757d', marginTop: 1 },

  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6c757d' },

  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', background: '#fff', borderBottom: '1px solid #dee2e6', flexShrink: 0 },
  headerTitle: { fontWeight: 800, fontSize: 16, color: '#1D3557' },
  headerSub: { fontSize: 12, color: '#6c757d', marginTop: 3 },

  filterRow: { display: 'flex', gap: 8 },
  filterBtn: { padding: '6px 14px', borderRadius: 20, border: '1.5px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#495057' },
  filterBtnActive: { background: '#1D3557', borderColor: '#1D3557', color: '#fff' },

  list: { flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12 },

  card: { background: '#fff', borderRadius: 12, border: '1px solid #dee2e6', display: 'flex', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' },
  priorityStrip: { width: 5, flexShrink: 0 },
  cardBody: { flex: 1, padding: '14px 16px' },
  cardTop: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  cardRight: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 },
  typeIcon: { fontSize: 26 },
  typeLabel: { fontWeight: 700, fontSize: 15, color: '#212529' },
  submitterLine: { fontSize: 12, color: '#6c757d', marginTop: 2 },
  prioBadge: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, border: '1px solid' },
  statusBadge: { padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 },
  statusPending: { background: '#fff3cd', color: '#856404' },
  statusDone: { background: '#d1e7dd', color: '#0f5132' },

  notes: { marginTop: 10, fontSize: 13, color: '#495057', fontStyle: 'italic', background: '#f8f9fa', padding: '8px 12px', borderRadius: 8 },

  ackInfo: { marginTop: 10, padding: '8px 12px', background: '#d1e7dd', borderRadius: 8 },
  ackBy: { fontSize: 12, color: '#0f5132', fontWeight: 600 },
  ackNote: { fontSize: 12, color: '#0f5132', fontStyle: 'italic', marginTop: 4 },

  ackBtn: { marginTop: 12, padding: '7px 18px', background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: 420, maxWidth: '90vw', boxShadow: '0 8px 32px rgba(0,0,0,0.18)' },
  modalTitle: { fontWeight: 800, fontSize: 18, color: '#1D3557', marginBottom: 6 },
  modalSub: { fontSize: 14, color: '#495057', marginBottom: 8 },
  modalNotes: { fontSize: 13, fontStyle: 'italic', color: '#6c757d', background: '#f8f9fa', padding: '8px 12px', borderRadius: 8, marginBottom: 12 },
  noteInput: { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #dee2e6', fontSize: 14, resize: 'vertical', boxSizing: 'border-box', marginBottom: 16 },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end' },
  cancelBtn: { padding: '8px 20px', borderRadius: 8, border: '1.5px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  confirmBtn: { padding: '8px 20px', borderRadius: 8, border: 'none', background: '#1D3557', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
};
