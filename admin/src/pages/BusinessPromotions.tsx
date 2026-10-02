import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { promotionsApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { storeToday, storeDayLong } from '../lib/storeDates';
import { PageHeader, Button, HeaderStat } from '../components/kit';
import { Plus } from 'lucide-react';
import Glyph from '../components/Glyph';
import { failureMessage } from '../lib/apiError';

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
  PENDING:  '#8a5300',
  APPROVED: '#1a7f45',
  REJECTED: '#c42130',
};

const STATUS_BG: Record<string, string> = {
  PENDING:  '#fdf6e8',
  APPROVED: '#dcfce7',
  REJECTED: '#fdf2f2',
};

const STATUS_ICONS: Record<string, string> = {
  PENDING:  '⏳',
  APPROVED: '✅',
  REJECTED: '❌',
};

function formatDate(d: string) {
  return storeDayLong(d);   // the store's calendar day, whatever this browser's time zone
}

function PublishModal({ promo, onClose }: { promo: PromoRequest; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [adTitle, setAdTitle]         = useState(promo.adTitle || promo.businessName);
  const [adBody, setAdBody]           = useState(promo.adBody || promo.businessDescription);
  // The store's day the ad ends on (the saved instant is 11:59 pm Central, which is the next day in UTC)
  const [adExpiresAt, setAdExpiresAt] = useState(promo.adExpiresAt ? storeToday(new Date(promo.adExpiresAt)) : '');
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
                    Change
                  </button>
                  <button
                    style={{ ...m.changeImgBtn, color: '#c42130', borderColor: '#f3cdd1' }}
                    type="button"
                    onClick={() => { setRemoveImage(true); setImageFile(null); setImagePreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button style={m.uploadBtn} type="button" onClick={() => fileRef.current?.click()}>
                <span style={{ fontSize: 24 }}><Glyph e="🖼️" size={28} color="#5a6472" /></span>
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
            {publishMutation.isPending ? 'Publishing...' : 'Publish Ad'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreatePromotionModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [requesterName, setRequesterName] = useState('');
  const [requesterPhone, setRequesterPhone] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessDescription, setBusinessDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [location, setLocation] = useState('');
  const [adTitle, setAdTitle] = useState('');
  const [adBody, setAdBody] = useState('');
  const [adExpiresAt, setAdExpiresAt] = useState('');
  const [devAdminNote, setDevAdminNote] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setImageFile(file);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  }

  const canSubmit = !!(requesterName.trim() && requesterPhone.trim() && businessName.trim() && businessDescription.trim() && adTitle.trim() && adBody.trim());

  const createMutation = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append('requesterName', requesterName.trim());
      fd.append('requesterPhone', requesterPhone.trim());
      fd.append('businessName', businessName.trim());
      fd.append('businessDescription', businessDescription.trim());
      if (website.trim()) fd.append('website', website.trim());
      if (location.trim()) fd.append('location', location.trim());
      fd.append('adTitle', adTitle.trim());
      fd.append('adBody', adBody.trim());
      if (adExpiresAt) fd.append('adExpiresAt', adExpiresAt);
      if (devAdminNote.trim()) fd.append('devAdminNote', devAdminNote.trim());
      if (imageFile) fd.append('image', imageFile);
      return promotionsApi.createManual(fd);
    },
    onSuccess: () => {
      toast.success('Promotion added and published!');
      qc.invalidateQueries({ queryKey: ['promo-requests'] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to add promotion'),
  });

  return (
    <div style={m.overlay} onClick={onClose}>
      <div style={m.modal} onClick={(e) => e.stopPropagation()}>
        <div style={m.modalHeader}>
          <div>
            <div style={m.modalTitle}>Add Promotion</div>
            <div style={m.modalSub}>Published immediately - no customer request needed</div>
          </div>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>

        <div style={m.modalBody}>
          <label style={m.label}>Business Name *</label>
          <input style={m.input} value={businessName} onChange={e => setBusinessName(e.target.value)} placeholder="The business being advertised" />

          <label style={m.label}>Business Description *</label>
          <textarea
            style={{ ...m.input, minHeight: 60, resize: 'vertical' } as React.CSSProperties}
            value={businessDescription}
            onChange={e => setBusinessDescription(e.target.value)}
            placeholder="What the business does"
          />

          <label style={m.label}>Contact Name *</label>
          <input style={m.input} value={requesterName} onChange={e => setRequesterName(e.target.value)} placeholder="Who to reach for this ad" />

          <label style={m.label}>Contact Phone *</label>
          <input style={m.input} value={requesterPhone} onChange={e => setRequesterPhone(e.target.value)} placeholder="Contact phone number" />

          <label style={m.label}>Website (optional)</label>
          <input style={m.input} value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" />

          <label style={m.label}>Location (optional)</label>
          <input style={m.input} value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. 123 Main St, Sherman, TX" />

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
            {imagePreview ? (
              <div style={m.previewWrap}>
                <img src={imagePreview} alt="preview" style={m.previewImg} />
                <div style={m.previewActions}>
                  <button style={m.changeImgBtn} type="button" onClick={() => fileRef.current?.click()}>
                    Change
                  </button>
                  <button
                    style={{ ...m.changeImgBtn, color: '#c42130', borderColor: '#f3cdd1' }}
                    type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); if (fileRef.current) fileRef.current.value = ''; }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button style={m.uploadBtn} type="button" onClick={() => fileRef.current?.click()}>
                <span style={{ fontSize: 24 }}><Glyph e="🖼️" size={28} color="#5a6472" /></span>
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
            style={{ ...m.publishBtn, opacity: createMutation.isPending || !canSubmit ? 0.6 : 1 }}
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !canSubmit}
          >
            {createMutation.isPending ? 'Adding...' : 'Add & Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}

// How many of the newest live ads the app shows under Featured; the others are under All Businesses (and the app's Home shows the
// newest). Newest first, no pinning: a new ad pushes the oldest featured one down to All Businesses.
function FeaturedAdsSetting() {
  const qc = useQueryClient();
  const { data, isError, refetch } = useQuery({ queryKey: ['promo-settings'], queryFn: () => promotionsApi.getSettings() });
  const settings = data?.data?.data as { featuredLimit: number; live: number; max: number } | undefined;
  const [text, setText] = useState('');
  useEffect(() => { if (settings) setText(String(settings.featuredLimit)); }, [settings?.featuredLimit]);
  const n = Number(text);
  const valid = Number.isInteger(n) && n >= 1 && n <= (settings?.max ?? 50);
  const save = useMutation({
    mutationFn: () => promotionsApi.setFeaturedLimit(n),
    onSuccess: () => { toast.success(`The app now features the ${n} newest ${n === 1 ? 'ad' : 'ads'}.`); qc.invalidateQueries({ queryKey: ['promo-settings'] }); },
    onError: (e: any) => toast.error(failureMessage(e, 'Could not save. Nothing was changed.')),
  });
  if (isError) return <div style={s.featured}><span style={{ color: '#a51b28' }}>Could not load the featured-ads setting.</span> <button type="button" style={s.featuredLink} onClick={() => refetch()}>Try again</button></div>;
  if (!settings) return null;
  const featured = Math.min(settings.live, settings.featuredLimit);
  return (
    <div style={s.featured} role="group" aria-label="Featured ads in the app">
      <div style={{ flex: '1 1 260px' }}>
        <div style={s.featuredTitle}>Featured in the app</div>
        <div style={s.featuredSub}>
          The newest ads are featured; the rest are listed under All Businesses. Right now {featured} of {settings.live} live {settings.live === 1 ? 'ad is' : 'ads are'} featured.
        </div>
      </div>
      <label style={s.featuredField}>
        <span>Featured ads</span>
        <input
          type="number" min={1} max={settings.max} value={text} aria-label="Number of featured ads"
          onChange={e => setText(e.target.value)} style={s.featuredInput} aria-invalid={!valid}
        />
      </label>
      <Button variant="primary" onClick={() => save.mutate()} disabled={!valid || save.isPending || n === settings.featuredLimit}>
        {save.isPending ? 'Saving…' : 'Save'}
      </Button>
      {!valid && <span style={{ color: '#a51b28', fontSize: 13, flexBasis: '100%' }}>A whole number from 1 to {settings.max}.</span>}
    </div>
  );
}

export default function BusinessPromotions() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [publishTarget, setPublishTarget] = useState<PromoRequest | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<PromoRequest | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PromoRequest | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
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

  if (isError) return <div style={{ padding: 32 }}><ErrorState message="Failed to load promotion requests." onRetry={refetch} /></div>;

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!rejectTarget}
        title="Reject Request"
        message={`Reject the promotion request from ${rejectTarget?.businessName ?? ''}?`}
        confirmLabel="Reject"
        danger
        withInput
        inputLabel="Reason (shown to requester)"
        inputPlaceholder="Explain why this request was rejected…"
        onConfirm={(note) => { if (rejectTarget) rejectMutation.mutate({ id: rejectTarget.id, note: note || undefined }); setRejectTarget(null); }}
        onCancel={() => setRejectTarget(null)}
      />
      <ConfirmModal
        open={!!deleteTarget}
        title="Delete Promotion"
        message={`Permanently delete the request from ${deleteTarget?.businessName ?? ''}? This cannot be undone.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
      {showCreateModal && <CreatePromotionModal onClose={() => setShowCreateModal(false)} />}
      <PageHeader
        title="Business Promotions"
        description="Review advertising requests and publish approved ads to the customer app."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setShowCreateModal(true)}>Add Promotion</Button>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <HeaderStat label="Pending" value={counts.PENDING} tone={counts.PENDING > 0 ? 'warning' : 'neutral'} />
          <HeaderStat label="Approved" value={counts.APPROVED} tone="success" />
          <HeaderStat label="Rejected" value={counts.REJECTED} tone="danger" />
        </div>
      </PageHeader>

      <FeaturedAdsSetting />

      {/* Filter */}
      <div style={s.filterRow}>
        {['', 'PENDING', 'APPROVED', 'REJECTED'].map((st) => (
          <button
            key={st}
            style={{ ...s.filterBtn, ...(statusFilter === st ? s.filterBtnActive : {}) }}
            onClick={() => setStatusFilter(st)}
          >
            {st === '' ? 'All' : st.charAt(0) + st.slice(1).toLowerCase()}
            {st !== '' && <span style={{ marginLeft: 4, fontSize: 14, fontWeight: 700, color: STATUS_COLORS[st] }}>{counts[st as keyof typeof counts]}</span>}
          </button>
        ))}
      </div>

      {isLoading ? (
        <CardSkeleton count={3} />
      ) : requests.length === 0 ? (
        <div style={s.empty}>
          <div style={s.emptyEmoji}><Glyph e="📣" size={28} color="#5a6472" /></div>
          <div style={s.emptyTitle}>No requests yet</div>
          <div style={s.emptySub}>Customers can submit business promotion requests from their profile.</div>
        </div>
      ) : (
        <div style={s.list}>
          {requests.map((req) => {
            const isExpanded = expandedId === req.id;
            return (
              <div key={req.id} style={s.card}>
                <div style={s.cardTop} onClick={() => setExpandedId(isExpanded ? null : req.id)}
                  role="button" tabIndex={0} aria-expanded={isExpanded}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedId(isExpanded ? null : req.id)}>
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
                            Review & Publish
                          </button>
                          <button
                            style={s.rejectBtn}
                            onClick={() => setRejectTarget(req)}
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
                          Edit Ad
                        </button>
                      )}
                      {req.status === 'REJECTED' && (
                        <button
                          style={s.publishActionBtn}
                          onClick={() => setPublishTarget(req)}
                        >
                          Publish Anyway
                        </button>
                      )}
                      <button
                        style={s.deleteBtn}
                        onClick={() => setDeleteTarget(req)}
                        disabled={deleteMutation.isPending}
                      >
                        Delete
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
  featured: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid #e4e7ec', borderRadius: 12, padding: '14px 16px' },
  featuredTitle: { fontWeight: 700, fontSize: 15, color: '#111827' },
  featuredSub: { fontSize: 13, color: TEXT_MUTED, marginTop: 2, lineHeight: 1.45 },
  featuredField: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: '#374151' },
  featuredInput: { width: 72, padding: '8px 10px', border: '1.5px solid #d5dae1', borderRadius: 8, fontSize: 15, fontWeight: 700, textAlign: 'center' },
  featuredLink: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 },
  page: { padding: '32px 24px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24 },
  addBtn: {
    padding: '10px 18px', borderRadius: 10, border: 'none', flexShrink: 0,
    background: PRIMARY, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  title: { margin: 0, fontSize: 26, fontWeight: 700, color: PRIMARY },
  subtitle: { margin: '4px 0 0', color: '#5a6472', fontSize: 14 },

  statsRow: { display: 'flex', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, background: '#fff', borderRadius: 12, padding: '16px 20px',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
    display: 'flex', alignItems: 'center', gap: 14,
  },
  statIconWrap: { width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  statIcon: { fontSize: 20 },
  statNum: { fontSize: 28, fontWeight: 700, lineHeight: 1, marginTop: 2 },
  statLabel: { fontSize: 14, fontWeight: 600, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5 },

  filterRow: { display: 'flex', gap: 8, marginBottom: 20 },
  filterBtn: {
    padding: '7px 16px', borderRadius: 20, border: '1.5px solid #e4e7ec',
    background: '#fff', cursor: 'pointer', fontSize: 15, fontWeight: 600,
    color: '#5a6472', display: 'flex', alignItems: 'center', gap: 4,
  },
  filterBtnActive: { background: PRIMARY, color: '#fff', borderColor: PRIMARY },

  center: { textAlign: 'center', padding: 40, color: TEXT_MUTED },
  empty: { textAlign: 'center', padding: '48px 24px' },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: 700, color: '#111827', marginBottom: 6 },
  emptySub: { fontSize: 14, color: TEXT_MUTED },

  list: { display: 'flex', flexDirection: 'column', gap: 10 },

  card: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)', overflow: 'hidden',
  },
  cardTop: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '16px 18px', cursor: 'pointer',
  },
  bizInfo: { flex: 1 },
  bizNameRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 },
  bizName: { fontSize: 16, fontWeight: 700, color: '#111827' },
  statusBadge: {
    fontSize: 13, fontWeight: 700, padding: '2px 8px',
    borderRadius: 20, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  requesterLine: { fontSize: 14, color: TEXT_MUTED },
  expandBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 14, color: TEXT_MUTED, padding: 4,
  },

  cardBody: {
    borderTop: '1px solid #f1f3f6',
    padding: '16px 18px',
    display: 'flex', flexDirection: 'column', gap: 16,
  },
  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  infoBlock: {},
  infoLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoValue: { fontSize: 14, color: '#374151', lineHeight: 1.5 },
  link: { fontSize: 14, color: '#3c6e8f' },

  actionRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  publishActionBtn: {
    padding: '8px 16px', borderRadius: 8, border: 'none',
    background: PRIMARY, color: '#fff',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  rejectBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1.5px solid #f3cdd1',
    background: '#fff', color: '#c42130',
    fontSize: 15, fontWeight: 700, cursor: 'pointer',
  },
  deleteBtn: {
    padding: '8px 16px', borderRadius: 8, border: '1.5px solid #e4e7ec',
    background: '#fff', color: '#5a6472',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
};

const m: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
  },
  modal: {
    background: '#fff', borderRadius: 12, width: '100%',
    maxHeight: '90vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 24px 16px', borderBottom: '1px solid #f1f3f6',
  },
  modalTitle: { fontSize: 18, fontWeight: 700, color: PRIMARY },
  modalSub: { fontSize: 15, color: TEXT_MUTED, marginTop: 2 },
  closeBtn: {
    background: '#f1f3f6', border: 'none', borderRadius: 8,
    width: 30, height: 30, cursor: 'pointer', fontSize: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 },
  label: { fontSize: 14, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #e4e7ec', fontSize: 14, color: '#111827',
    outline: 'none', boxSizing: 'border-box',
  },
  modalFooter: {
    display: 'flex', justifyContent: 'flex-end', gap: 10,
    padding: '16px 24px', borderTop: '1px solid #f1f3f6',
  },
  cancelBtn: {
    padding: '9px 18px', borderRadius: 8, border: '1.5px solid #e4e7ec',
    background: '#fff', color: '#5a6472', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  publishBtn: {
    padding: '9px 20px', borderRadius: 8, border: 'none',
    background: '#1a7f45', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },

  imageArea: { marginBottom: 4 },
  uploadBtn: {
    width: '100%', padding: '20px 16px', borderRadius: 10,
    border: '2px dashed #d5dae1', background: '#f7f8fa',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
    cursor: 'pointer',
  },
  uploadBtnText: { fontSize: 14, fontWeight: 600, color: '#374151' },
  uploadBtnSub: { fontSize: 13, color: TEXT_MUTED },
  previewWrap: { display: 'flex', flexDirection: 'column', gap: 8 },
  previewImg: { width: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 10, border: '1px solid #e4e7ec' },
  previewActions: { display: 'flex', gap: 8 },
  changeImgBtn: {
    padding: '6px 14px', borderRadius: 7, border: '1.5px solid #d5dae1',
    background: '#fff', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer',
  },
};
