import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { promotionsApi } from '../services/api';

interface PromoRequest {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterPhone: string;
  businessName: string;
  businessDescription: string;
  website: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  adTitle: string | null;
  adBody: string | null;
  adImageUrl: string | null;
  adExpiresAt: string | null;
  devAdminNote: string | null;
  publishedAt: string | null;
  createdAt: string;
  requester: { id: string; name: string | null; phone: string };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING:  '#f59e0b',
  APPROVED: '#16a34a',
  REJECTED: '#dc2626',
};

const STATUS_BG: Record<string, string> = {
  PENDING:  '#fef3c7',
  APPROVED: '#dcfce7',
  REJECTED: '#fee2e2',
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PublishModal({ promo, onClose }: { promo: PromoRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [adTitle, setAdTitle]         = useState(promo.adTitle || promo.businessName);
  const [adBody, setAdBody]           = useState(promo.adBody || promo.businessDescription);
  const [adExpiresAt, setAdExpiresAt] = useState(promo.adExpiresAt ? promo.adExpiresAt.slice(0, 10) : '');
  const [devAdminNote, setDevAdminNote] = useState(promo.devAdminNote || '');
  const [imageFile, setImageFile]     = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(promo.adImageUrl || null);
  const [removeImage, setRemoveImage] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    setRemoveImage(false);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(promo.adImageUrl || null);
    }
  }

  const publishMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('adTitle', adTitle.trim());
      fd.append('adBody', adBody.trim());
      if (adExpiresAt) fd.append('adExpiresAt', adExpiresAt);
      if (devAdminNote.trim()) fd.append('devAdminNote', devAdminNote.trim());
      if (imageFile) {
        fd.append('image', imageFile);
      } else if (removeImage) {
        fd.append('adImageUrl', ''); // signal to clear image
      }
      return promotionsApi.publish(promo.id, fd);
    },
    onSuccess: () => {
      toast.success('Ad published successfully!');
      qc.invalidateQueries({ queryKey: ['promo-requests'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to publish'),
  });

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={(e) => e.stopPropagation()}>
        <div style={m.modalHeader}>
          <div>
            <div style={m.modalTitle}>Publish Ad</div>
            <div style={m.modalSub}>for {promo.businessName}</div>
          </div>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={m.modalBody}>
          <label style={m.label}>Ad Title *</label>
          <input style={m.input} value={adTitle} onChange={e => setAdTitle(e.target.value)} placeholder="Catchy headline for the ad" />

          <label style={m.label}>Ad Body *</label>
          <textarea
            style={{ ...m.input, minHeight: 90, resize: 'vertical' } as React.CSSProperties}
            value={adBody}
            onChange={e => setAdBody(e.target.value)}
            placeholder="Ad description shown to customers"
          />

          <label style={m.label}>Banner / Image (optional)</label>
          <div style={m.imageArea}>
            {imagePreview && !removeImage ? (
              <div style={m.previewWrap}>
                <img src={imagePreview} alt="preview" style={m.previewImg} />
                <div style={m.previewActions}>
                  <button style={m.changeImgBtn} type="button" onClick={() => fileRef.current?.click()}>
                    🔄 Change
                  </button>
                  <button
                    style={{ ...m.changeImgBtn, color: '#dc2626', borderColor: '#fca5a5' }}
                    type="button"
                    onClick={() => { setRemoveImage(true); setImageFile(null); setImagePreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                  >
                    🗑 Remove
                  </button>
                </div>
              </div>
            ) : (
              <button style={m.uploadBtn} type="button" onClick={() => fileRef.current?.click()}>
                <span style={{ fontSize: 24 }}>🖼️</span>
                <span style={m.uploadBtnText}>Click to upload banner image</span>
                <span style={m.uploadBtnSub}>PNG, JPG, WEBP · max 10MB</span>
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </div>

          <label style={m.label}>Expiry Date (optional)</label>
          <input style={m.input} type="date" value={adExpiresAt} onChange={e => setAdExpiresAt(e.target.value)} />

          <label style={m.label}>Internal Note (optional)</label>
          <input style={m.input} value={devAdminNote} onChange={e => setDevAdminNote(e.target.value)} placeholder="e.g. Paid $200/month, 3-month contract" />
        </div>

        <div style={m.modalFooter}>
          <button style={m.cancelBtn} onClick={onClose}>Cancel</button>
          <button
            style={{ ...m.publishBtn, opacity: publishMutation.isPending ? 0.6 : 1 }}
            onClick={() => publishMutation.mutate()}
            disabled={publishMutation.isPending || !adTitle.trim() || !adBody.trim()}
          >
            {publishMutation.isPending ? 'Publishing...' : '🚀 Publish Ad'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function BusinessPromotions() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [publishTarget, setPublishTarget] = useState<PromoRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['promo-requests', statusFilter],
    queryFn: () => promotionsApi.getRequests(statusFilter || undefined),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string }) => promotionsApi.reject(id, note),
    onSuccess: () => {
      toast.success('Request rejected');
      qc.invalidateQueries({ queryKey: ['promo-requests'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to reject'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => promotionsApi.delete(id),
    onSuccess: () => {
      toast.success('Promotion deleted');
      qc.invalidateQueries({ queryKey: ['promo-requests'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const requests: PromoRequest[] = data?.data?.data ?? [];

  const counts = {
    PENDING:  requests.filter(r => r.status === 'PENDING').length,
    APPROVED: requests.filter(r => r.status === 'APPROVED').length,
    REJECTED: requests.filter(r => r.status === 'REJECTED').length,
  };

  return (
    <div style={s.page}>
      <div style={s.topBar}>
        <div>
          <h1 style={s.title}>Business Promotions</h1>
          <p style={s.subtitle}>Review advertising requests and publish approved ads to the customer app.</p>
        </div>
      </div>

      {/* Stats row */}
      <div style={s.statsRow}>
        {(['PENDING', 'APPROVED', 'REJECTED'] as const).map((st) => (
          <div key={st} style={{ ...s.statCard, borderLeft: `4px solid ${STATUS_COLORS[st]}` }}>
            <div style={{ ...s.statNum, color: STATUS_COLORS[st] }}>{counts[st]}</div>
            <div style={s.statLabel}>{st.charAt(0) + st.slice(1).toLowerCase()}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={s.filterRow}>
        {['', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
          <button
            key={st}
            style={{ ...s.filterBtn, ...(statusFilter === st ? s.filterBtnActive : {}) }}
            onClick={() => setStatusFilter(st)}
          >
            {st === '' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
            {st !== '' && <span style={{ marginLeft: 4, fontSize: 12, fontWeight: 700, color: STATUS_COLORS[st] }}>{counts[st as keyof typeof counts]}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={s.center}>Loading...</div>
      ) : requests.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyEmoji}>📣</div>
          <div style={s.emptyTitle}>No requests yet</div>
          <div style={s.emptySub}>Customers can submit business promotion requests from their profile.</div>
        </div>
      ) : (
        <div style={s.list}>
          {requests.map((req) => {
            const isExpanded = expandedId === req.id;
            return (
              <div key={req.id} style={s.card}>
                <div style={s.cardTop} onClick={() => setExpandedId(isExpanded ? null : req.id)}>
                  <div style={s.bizInfo}>
                    <div style={s.bizNameRow}>
                      <span style={s.bizName}>{req.businessName}</span>
                      <span style={{ ...s.statusBadge, color: STATUS_COLORS[req.status], backgroundColor: STATUS_BG[req.status] }}>
                        {req.status}
                      </span>
                    </div>
                    <div style={s.requesterLine}>
                      Submitted by {req.requesterName} · {req.requesterPhone} · {formatDate(req.createdAt)}
                    </div>
                  </div>
                  <button style={s.expandBtn}>{isExpanded ? '▲' : '▼'}</button>
                </div>

                {isExpanded && (
                  <div style={s.cardBody}>
                    <div style={s.infoGrid}>
                      <div style={s.infoBlock}>
                        <div style={s.infoLabel}>Business Description</div>
                        <div style={s.infoValue}>{req.businessDescription}</div>
                      </div>
                      {req.website && (
                        <div style={s.infoBlock}>
                          <div style={s.infoLabel}>Website</div>
                          <a href={req.website} target="_blank" rel="noreferrer" style={s.link}>{req.website}</a>
                        </div>
                      )}
                      {req.status === 'APPROVED' && (
                        <>
                          <div style={s.infoBlock}>
                            <div style={s.infoLabel}>Published Ad Title</div>
                            <div style={s.infoValue}>{req.adTitle}</div>
                          </div>
                          <div style={s.infoBlock}>
                            <div style={s.infoLabel}>Published Ad Body</div>
                            <div style={s.infoValue}>{req.adBody}</div>
                          </div>
                          {req.adExpiresAt && (
                            <div style={s.infoBlock}>
                              <div style={s.infoLabel}>Expires</div>
                              <div style={s.infoValue}>{formatDate(req.adExpiresAt)}</div>
                            </div>
                          )}
                          {req.publishedAt && (
                            <div style={s.infoBlock}>
                              <div style={s.infoLabel}>Published At</div>
                              <div style={s.infoValue}>{formatDate(req.publishedAt)}</div>
                            </div>
                          )}
                        </>
                      )}
                      {req.devAdminNote && (
                        <div style={s.infoBlock}>
                          <div style={s.infoLabel}>Internal Note</div>
                          <div style={{ ...s.infoValue, color: '#6366f1' }}>{req.devAdminNote}</div>
                        </div>
                      )}
                    </div>

                    <div style={s.actionRow}>
                      {req.status === 'PENDING' && (
                        <>
                          <button
                            style={s.publishActionBtn}
                            onClick={() => setPublishTarget(req)}
                          >
                            🚀 Review & Publish
                          </button>
                          <button
                            style={s.rejectBtn}
                            onClick={() => {
                              const note = window.prompt('Rejection reason (optional):') ?? '';
                              rejectMutation.mutate({ id: req.id, note: note || undefined });
                            }}
                            disabled={rejectMutation.isPending}
                          >
                            ✕ Reject
                          </button>
                        </>
                      )}
                      {req.status === 'APPROVED' && (
                        <button
                          style={s.publishActionBtn}
                          onClick={() => setPublishTarget(req)}
                        >
                          ✏️ Edit Ad
                        </button>
                      )}
                      {req.status === 'REJECTED' && (
                        <button
                          style={s.publishActionBtn}
                          onClick={() => setPublishTarget(req)}
                        >
                          🔄 Publish Anyway
                        </button>
                      )}
                      <button
                        style={s.deleteBtn}
                        onClick={() => {
                          if (window.confirm(`Delete promotion request from ${req.businessName}?`)) {
                            deleteMutation.mutate(req.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {publishTarget && (
        <PublishModal
          promo={publishTarget}
          onClose={() => setPublishTarget(null)}
        />
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 960, margin: '0 auto', padding: '32px 24px' },
  topBar: { marginBottom: 24 },
  title: { margin: 0, fontSize: 24, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: '4px 0 0', color: '#64748b', fontSize: 14 },

  statsRow: { display: 'flex', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  statNum: { fontSize: 28, fontWeight: 900, lineHeight: 1 },
  statLabel: { fontSize: 12, fontWeight: 600, color: '#94a3b8', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },

  filterRow: { display: 'flex', gap: 8, marginBottom: 20 },
  filterBtn: {
    padding: '7px 16px', borderRadius: 20, border: '1.5px solid #e2e8f0',
    background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#64748b', display: 'flex', alignItems: 'center', gap: 4,
  },
  filterBtnActive: { background: '#1D3557', color: '#fff', borderColor: '#1D3557' },

  center: { textAlign: 'center', padding: 40, color: '#94a3b8' },
  empty: { textAlign: 'center', padding: '48px 24px' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#1e293b', marginBottom: 6 },
  emptySub: { fontSize: 14, color: '#94a3b8' },

  list: { display: 'flex', flexDirection: 'column', gap: 10 },

  card: {
    background: '#fff', borderRadius: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.07)', overflow: 'hidden',
  },
  cardTop: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '16px 18px', cursor: 'pointer',
  },
  bizInfo: { flex: 1 },
  bizNameRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  bizName: { fontSize: 16, fontWeight: 800, color: '#1e293b' },
  statusBadge: {
    fontSize: 11, fontWeight: 700, padding: '2px 8px',
    borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  requesterLine: { fontSize: 12, color: '#94a3b8' },
  expandBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 12, color: '#94a3b8', padding: 4,
  },

  cardBody: {
    borderTop: '1px solid #f1f5f9',
    padding: '16px 18px',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  infoBlock: {},
  infoLabel: { fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 14, color: '#334155', lineHeight: 1.5 },
  link: { fontSize: 14, color: '#3b82f6' },

  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  publishActionBtn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: '#1D3557', color: '#fff',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  rejectBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1.5px solid #fca5a5',
    background: '#fff', color: '#dc2626',
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e2e8f0',
    background: '#fff', color: '#64748b',
    fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
};

const m: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  modal: {
    background: '#fff', borderRadius: 16, width: '100%', maxWidth: 540,
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 16px', borderBottom: '1px solid #f1f5f9',
  },
  modalTitle: { fontSize: 18, fontWeight: 800, color: '#1D3557' },
  modalSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  closeBtn: {
    background: '#f1f5f9', border: 'none', borderRadius: 8,
    width: 30, height: 30, cursor: 'pointer', fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #e2e8f0', fontSize: 14, color: '#1e293b',
    outline: 'none', boxSizing: 'border-box',
  },
  modalFooter: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '16px 24px', borderTop: '1px solid #f1f5f9',
  },
  cancelBtn: {
    padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e2e8f0',
    background: '#fff', color: '#64748b', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  publishBtn: {
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: '#16a34a', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },

  imageArea: { marginBottom: 4 },
  uploadBtn: {
    width: '100%', padding: '20px 16px', borderRadius: 10,
    border: '2px dashed #cbd5e1', background: '#f8fafc',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    cursor: 'pointer',
  },
  uploadBtnText: { fontSize: 14, fontWeight: 600, color: '#475569' },
  uploadBtnSub: { fontSize: 11, color: '#94a3b8' },
  previewWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  previewImg: { width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #e2e8f0' },
  previewActions: { display: 'flex', gap: 8 },
  changeImgBtn: {
    padding: '6px 14px', borderRadius: 7, border: '1.5px solid #cbd5e1',
    background: '#fff', fontSize: 12, fontWeight: 600, color: '#475569', cursor: 'pointer',
  },
};
