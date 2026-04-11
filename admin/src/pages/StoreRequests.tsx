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

const TYPE_BG: Record<string, string> = {
  LOW_STOCK: '#eff6ff',
  STORE_SUPPLIES: '#fefce8',
  CUSTOMER_REQUESTED_PRODUCT: '#f0fdf4',
  WORK_ORDER: '#fdf4ff',
};

const PRIORITY_COLOR: Record<string, string> = {
  HIGH: '#E63946', MEDIUM: '#f59e0b', LOW: '#2DC653',
};

const PRIORITY_BG: Record<string, string> = {
  HIGH: '#fff1f2', MEDIUM: '#fffbeb', LOW: '#f0fdf4',
};

const AVATAR_PALETTE = ['#7c3aed', '#0369a1', '#16a34a', '#b45309', '#1D3557', '#E63946', '#0891b2'];

const STORE_GRADIENTS = [
  ['#1D3557', '#457B9D'],
  ['#0369a1', '#0ea5e9'],
  ['#166534', '#2DC653'],
  ['#7c3aed', '#a78bfa'],
  ['#b45309', '#f59e0b'],
  ['#be123c', '#f43f5e'],
  ['#0f766e', '#14b8a6'],
  ['#1e40af', '#3b82f6'],
];

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
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitial(name: string) {
  return (name || '?')[0].toUpperCase();
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

  const { data: storesData } = useQuery({
    queryKey: ['chat-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string; city: string }[] = storesData?.data?.data || [];

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
  const selectedStore = stores.find(st => st.id === effectiveStoreId);
  const storeIdx = stores.findIndex(st => st.id === effectiveStoreId);
  const gradient = STORE_GRADIENTS[storeIdx % STORE_GRADIENTS.length] || STORE_GRADIENTS[0];

  return (
    <div style={s.page}>
      {/* ── Sidebar (Chat style) ── */}
      {!isStoreManager && (
        <div style={s.sidebar}>
          <div style={s.sidebarTop}>
            <div style={s.sidebarTitle}>Requests</div>
            <div style={s.sidebarSubtitle}>{stores.length} store{stores.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={s.storeList}>
            {stores.map((store, i) => {
              const active = store.id === selectedStoreId;
              const g = STORE_GRADIENTS[i % STORE_GRADIENTS.length];
              return (
                <button
                  key={store.id}
                  style={{ ...s.storeBtn, ...(active ? s.storeBtnActive : {}) }}
                  onClick={() => setSelectedStoreId(store.id)}
                >
                  <div style={{ ...s.storeAvatar, background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}>
                    {getInitial(store.name)}
                  </div>
                  <div style={s.storeBtnInfo}>
                    <div style={{ ...s.storeBtnName, color: active ? '#1D3557' : '#212529' }}>{store.name}</div>
                    {store.city && <div style={s.storeBtnCity}>{store.city}</div>}
                  </div>
                  {active && <div style={s.activeIndicator} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Main Panel ── */}
      <div style={s.chatPanel}>
        {!effectiveStoreId ? (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>📋</div>
            <div style={s.emptyTitle}>Select a store</div>
            <div style={s.emptySub}>Choose a store from the sidebar to view its requests</div>
          </div>
        ) : (
          <>
            {/* ── Gradient Header ── */}
            <div style={{ ...s.chatHeader, background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
              <div style={s.chatHeaderAvatar}>{getInitial(selectedStore?.name || '?')}</div>
              <div style={s.chatHeaderInfo}>
                <div style={s.chatHeaderName}>{selectedStore?.name ?? 'Store'} — Requests</div>
                <div style={s.chatHeaderSub}>
                  <span style={s.onlineDot} />
                  <span style={{ ...s.metaPill, background: 'rgba(255,255,255,0.2)', color: '#fff' }}>
                    {pending.length} pending
                  </span>
                  <span style={{ ...s.metaPill, background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}>
                    {acknowledged.length} handled
                  </span>
                </div>
              </div>
              {/* Filter tabs */}
              <div style={s.filterRow}>
                {[
                  { key: '',             label: 'All',     count: requests.length },
                  { key: 'PENDING',      label: 'Pending', count: pending.length },
                  { key: 'ACKNOWLEDGED', label: 'Done',    count: acknowledged.length },
                ].map((f) => (
                  <button
                    key={f.key}
                    style={{ ...s.filterTab, ...(statusFilter === f.key ? s.filterTabActive : {}) }}
                    onClick={() => setStatusFilter(f.key)}
                  >
                    {f.label}
                    {f.count > 0 && (
                      <span style={{ ...s.filterCount, ...(statusFilter === f.key ? s.filterCountActive : {}) }}>
                        {f.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* ── List ── */}
            {isLoading ? (
              <div style={s.emptyState}>
                <div style={{ fontSize: 32 }}>⏳</div>
                <div style={s.emptySub}>Loading requests…</div>
              </div>
            ) : displayed.length === 0 ? (
              <div style={s.emptyState}>
                <div style={s.emptyIcon}>{statusFilter === 'PENDING' ? '✅' : '📭'}</div>
                <div style={s.emptyTitle}>{statusFilter === 'PENDING' ? 'All clear!' : 'Nothing here'}</div>
                <div style={s.emptySub}>No requests in this category</div>
              </div>
            ) : (
              <div style={s.list}>
                {displayed.map((req, i) => {
                  const pColor = PRIORITY_COLOR[req.priority] || '#adb5bd';
                  const pBg = PRIORITY_BG[req.priority] || '#f3f4f6';
                  const typeBg = TYPE_BG[req.type] || '#f3f4f6';
                  const isDone = req.status === 'ACKNOWLEDGED';
                  const avatarColor = AVATAR_PALETTE[i % AVATAR_PALETTE.length];

                  return (
                    <div key={req.id} style={{ ...s.card, ...(isDone ? s.cardDone : {}) }}>
                      <div style={{ ...s.priorityStripe, background: isDone ? '#bbf7d0' : pColor }} />

                      <div style={s.cardBody}>
                        {/* Top row */}
                        <div style={s.cardTop}>
                          {/* Type icon */}
                          <div style={{ ...s.typeIconWrap, background: typeBg }}>
                            <span style={s.typeIconEmoji}>{TYPE_ICONS[req.type] || '📋'}</span>
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={s.typeLabel}>{TYPE_LABELS[req.type] || req.type}</div>
                            <div style={s.storeMeta}>{req.store?.name}</div>
                          </div>

                          {/* Badges */}
                          <div style={s.badgeRow}>
                            {isDone ? (
                              <span style={s.doneBadge}>✓ Done</span>
                            ) : (
                              <span style={{ ...s.prioBadge, background: pBg, color: pColor, borderColor: pColor + '55' }}>
                                <span style={{ ...s.prioBadgeDot, background: pColor }} />
                                {req.priority}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Submitter row */}
                        <div style={s.submitterRow}>
                          <div style={{ ...s.avatar, background: avatarColor }}>
                            {getInitial(req.submitterName)}
                          </div>
                          <span style={s.submitterText}>
                            <strong>{req.submitterName}</strong>{'  ·  '}{formatTime(req.createdAt)}
                          </span>
                        </div>

                        {/* Notes */}
                        {req.notes && (
                          <div style={s.notesBox}>
                            "{req.notes}"
                          </div>
                        )}

                        {/* Ack info / button */}
                        {isDone ? (
                          <div style={s.ackBox}>
                            <span style={s.ackIcon}>✅</span>
                            <div>
                              <div style={s.ackBy}>Handled by {req.acknowledgerName}
                                {req.acknowledgedAt && <span style={s.ackTime}> · {formatTime(req.acknowledgedAt)}</span>}
                              </div>
                              {req.acknowledgerNote && <div style={s.ackNote}>"{req.acknowledgerNote}"</div>}
                            </div>
                          </div>
                        ) : !isReadOnly ? (
                          <button style={s.ackBtn} onClick={() => { setAckTarget(req); setAckNote(''); }}>
                            ✅  Mark as Handled
                          </button>
                        ) : (
                          <div style={s.pendingPill}>
                            <span style={s.pendingDot} />
                            Awaiting manager review
                          </div>
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
            {/* Modal header */}
            <div style={s.modalHeader}>
              <div style={s.modalTitle}>Mark as Handled</div>
              <button style={s.modalClose} onClick={() => setAckTarget(null)}>✕</button>
            </div>

            {/* Request preview */}
            <div style={s.previewCard}>
              <div style={{ ...s.previewIconWrap, background: TYPE_BG[ackTarget.type] || '#f3f4f6' }}>
                <span style={s.previewIconEmoji}>{TYPE_ICONS[ackTarget.type]}</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={s.previewType}>{TYPE_LABELS[ackTarget.type]}</div>
                <div style={s.previewMeta}>from {ackTarget.submitterName} · {ackTarget.store?.name}</div>
                {ackTarget.notes && (
                  <div style={s.previewNotes}>"{ackTarget.notes}"</div>
                )}
              </div>
              <span style={{
                ...s.prioBadge,
                background: PRIORITY_BG[ackTarget.priority] || '#f3f4f6',
                color: PRIORITY_COLOR[ackTarget.priority] || '#aaa',
                borderColor: (PRIORITY_COLOR[ackTarget.priority] || '#aaa') + '55',
                alignSelf: 'flex-start',
              }}>
                <span style={{ ...s.prioBadgeDot, background: PRIORITY_COLOR[ackTarget.priority] || '#aaa' }} />
                {ackTarget.priority}
              </span>
            </div>

            <div style={s.modalLabel}>Add a note <span style={s.optionalTag}>(optional)</span></div>
            <textarea
              style={s.noteInput}
              placeholder="e.g. Ordered, arriving Thursday…"
              value={ackNote}
              onChange={(e) => setAckNote(e.target.value)}
              rows={3}
              maxLength={300}
            />

            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setAckTarget(null)}>Cancel</button>
              <button
                style={{ ...s.confirmBtn, ...(acknowledgeMutation.isPending ? { opacity: 0.65, cursor: 'not-allowed' } : {}) }}
                disabled={acknowledgeMutation.isPending}
                onClick={() => acknowledgeMutation.mutate({ id: ackTarget.id, note: ackNote })}
              >
                {acknowledgeMutation.isPending ? 'Saving…' : '✅  Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', height: 'calc(100vh - 64px)', background: '#f0f2f5', overflow: 'hidden' },

  // ── Sidebar (Chat style) ──
  sidebar: {
    width: 272, background: '#fff', borderRight: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  sidebarTop: { padding: '20px 18px 8px' },
  sidebarTitle: { fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: -0.3 },
  sidebarSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  storeList: { flex: 1, overflowY: 'auto', padding: '4px 8px 12px' },
  storeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 10px', background: 'none', border: 'none', cursor: 'pointer',
    borderRadius: 10, textAlign: 'left', position: 'relative',
    transition: 'background 0.15s',
  },
  storeBtnActive: { background: '#eff6ff' },
  storeAvatar: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 16, fontWeight: 800,
  },
  storeBtnInfo: { flex: 1, minWidth: 0 },
  storeBtnName: { fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeBtnCity: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  activeIndicator: { width: 8, height: 8, borderRadius: 4, background: '#2DC653', flexShrink: 0 },

  // ── Chat Panel ──
  chatPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 22px', flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    flexWrap: 'wrap' as const,
  },
  chatHeaderAvatar: {
    width: 42, height: 42, borderRadius: 14, flexShrink: 0,
    background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontWeight: 800, color: '#fff',
    border: '2px solid rgba(255,255,255,0.35)',
  },
  chatHeaderInfo: { flex: 1, minWidth: 0 },
  chatHeaderName: { color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: -0.2 },
  chatHeaderSub: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' as const },
  onlineDot: { width: 7, height: 7, borderRadius: 4, background: '#4ade80', border: '1.5px solid rgba(255,255,255,0.5)', display: 'inline-block' },

  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 8, padding: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#111827' },
  emptySub: { fontSize: 13, color: '#6b7280', textAlign: 'center' },

  metaPill: {
    display: 'inline-flex', alignItems: 'center',
    padding: '3px 10px', borderRadius: 10,
    fontSize: 12, fontWeight: 700,
  },

  filterRow: { display: 'flex', gap: 6 },
  filterTab: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 20,
    border: '1.5px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.1)',
    cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.8)',
    transition: 'all 0.15s',
  },
  filterTabActive: { background: 'rgba(255,255,255,0.25)', borderColor: 'rgba(255,255,255,0.5)', color: '#fff' },
  filterCount: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    minWidth: 18, height: 18, borderRadius: 9,
    background: 'rgba(255,255,255,0.2)', color: '#fff',
    fontSize: 10, fontWeight: 800, padding: '0 4px',
  },
  filterCountActive: { background: 'rgba(255,255,255,0.3)', color: '#fff' },

  list: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, background: '#f8fafc' },

  // Cards
  card: {
    background: '#fff', borderRadius: 16, border: '1px solid #f0f1f2',
    display: 'flex', overflow: 'hidden',
    boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
    transition: 'box-shadow 0.15s',
  },
  cardDone: { opacity: 0.72 },
  priorityStripe: { width: 5, flexShrink: 0 },
  cardBody: { flex: 1, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 },

  cardTop: { display: 'flex', alignItems: 'center', gap: 12 },
  typeIconWrap: {
    width: 46, height: 46, borderRadius: 13,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  typeIconEmoji: { fontSize: 22 },
  typeLabel: { fontWeight: 700, fontSize: 15, color: '#111827' },
  storeMeta: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  badgeRow: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  prioBadge: {
    display: 'inline-flex', alignItems: 'center', gap: 5,
    padding: '4px 10px', borderRadius: 10,
    fontSize: 11, fontWeight: 800, border: '1px solid',
  },
  prioBadgeDot: { width: 7, height: 7, borderRadius: 4, display: 'inline-block' },
  doneBadge: {
    padding: '4px 10px', borderRadius: 10,
    background: '#d1fae5', color: '#065f46',
    fontSize: 11, fontWeight: 700,
    border: '1px solid #a7f3d0',
  },

  submitterRow: { display: 'flex', alignItems: 'center', gap: 8 },
  avatar: {
    width: 26, height: 26, borderRadius: 8,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 12, flexShrink: 0,
  },
  submitterText: { fontSize: 12, color: '#6b7280' },

  notesBox: {
    fontSize: 13, color: '#374151', fontStyle: 'italic',
    background: '#f8fafc', padding: '9px 12px',
    borderRadius: 10, border: '1px solid #e5e7eb', lineHeight: 1.5,
  },

  ackBox: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    background: '#f0fdf4', padding: '10px 12px',
    borderRadius: 10, border: '1px solid #bbf7d0',
  },
  ackIcon: { fontSize: 16, marginTop: 1, flexShrink: 0 },
  ackBy: { fontSize: 12, fontWeight: 700, color: '#16a34a' },
  ackTime: { fontWeight: 500 },
  ackNote: { fontSize: 12, color: '#16a34a', fontStyle: 'italic', marginTop: 3 },

  ackBtn: {
    alignSelf: 'stretch',
    padding: '10px 20px', background: '#0f5132',
    color: '#fff', border: 'none', borderRadius: 10,
    cursor: 'pointer', fontSize: 14, fontWeight: 800,
    boxShadow: '0 3px 10px rgba(15,81,50,0.3)',
    transition: 'opacity 0.15s',
  },

  pendingPill: {
    display: 'inline-flex', alignItems: 'center', gap: 7,
    alignSelf: 'flex-start',
    background: '#fffbeb', padding: '6px 12px',
    borderRadius: 10, border: '1px solid #fde68a',
    fontSize: 12, fontWeight: 700, color: '#b45309',
  },
  pendingDot: {
    width: 7, height: 7, borderRadius: 4, background: '#f59e0b',
    display: 'inline-block',
  },

  // Modal
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
    backdropFilter: 'blur(2px)',
  },
  modal: {
    background: '#fff', borderRadius: 20, padding: 28,
    width: 460, maxWidth: '92vw',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
    display: 'flex', flexDirection: 'column', gap: 18,
  },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontWeight: 800, fontSize: 20, color: '#111827' },
  modalClose: {
    width: 32, height: 32, borderRadius: 16,
    border: 'none', background: '#f3f4f6',
    cursor: 'pointer', fontSize: 14, color: '#6b7280', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },

  previewCard: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    background: '#f8fafc', borderRadius: 14, padding: '14px 16px',
    border: '1px solid #e5e7eb',
  },
  previewIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  previewIconEmoji: { fontSize: 20 },
  previewType: { fontWeight: 700, fontSize: 14, color: '#111827' },
  previewMeta: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  previewNotes: { fontSize: 12, color: '#9ca3af', fontStyle: 'italic', marginTop: 5 },

  modalLabel: {
    fontSize: 11, fontWeight: 800, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.8px',
  },
  optionalTag: { fontSize: 10, fontWeight: 500, textTransform: 'none', color: '#9ca3af' },
  noteInput: {
    width: '100%', padding: '12px 14px',
    borderRadius: 12, border: '1.5px solid #e5e7eb',
    fontSize: 14, resize: 'vertical',
    boxSizing: 'border-box' as const,
    background: '#f9fafb', color: '#111827',
    fontFamily: 'inherit',
  },

  modalActions: { display: 'flex', gap: 10 },
  cancelBtn: {
    flex: 1, padding: '12px 16px',
    borderRadius: 12, border: '1.5px solid #e5e7eb',
    background: '#fff', cursor: 'pointer',
    fontSize: 14, fontWeight: 700, color: '#374151',
  },
  confirmBtn: {
    flex: 2, padding: '12px 16px',
    borderRadius: 12, border: 'none',
    background: '#0f5132', color: '#fff',
    cursor: 'pointer', fontSize: 14, fontWeight: 800,
    boxShadow: '0 4px 14px rgba(15,81,50,0.35)',
  },
};
