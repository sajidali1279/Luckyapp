// Banners (2026-10-16 rework): promotional images in the customer app, for every store or one, now editable (words, link, order, store,
// image) and scheduled (a first and a last store day; the app shows a banner only inside them). Each card says Live, Scheduled or Ended.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, ImagePlus, Pencil, Trash2 } from 'lucide-react';
import { bannersApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { C, FONT, INPUT, RADIUS } from '../lib/theme';
import { serverMessage } from '../lib/apiError';
import { storeDayLong, storeToday, addDays } from '../lib/storeDates';
import { Page, PageHeader, Button, Badge, Card, EmptyState, Field, Chip, Tabs } from '../components/kit';

type Banner = { id: string; title: string; imageUrl: string; linkUrl: string | null; storeId: string | null; sortOrder: number; startAt: string | null; endAt: string | null; createdAt: string };
type State = 'LIVE' | 'SCHEDULED' | 'ENDED';
type Form = { id: string | null; title: string; linkUrl: string; storeId: string; sortOrder: string; startDate: string; endDate: string; image: File | null; imageUrl: string | null };

const stateOf = (b: Banner, now = Date.now()): State =>
  b.endAt && new Date(b.endAt).getTime() <= now ? 'ENDED' : b.startAt && new Date(b.startAt).getTime() > now ? 'SCHEDULED' : 'LIVE';
const EMPTY: Form = { id: null, title: '', linkUrl: '', storeId: '', sortOrder: '0', startDate: '', endDate: '', image: null, imageUrl: null };

export default function Banners() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const [form, setForm] = useState<Form | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [view, setView] = useState<'now' | 'all'>('now');
  const [savedId, setSavedId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['banners-all'], queryFn: () => bannersApi.getAll() });
  // getAccessible() scopes to a Store Manager's own store instead of 403ing (getAll() is SuperAdmin+ only)
  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });
  const stores: any[] = storesData?.data?.data || [];
  const storeMap: Record<string, string> = Object.fromEntries(stores.map((st: any) => [st.id, st.name]));
  const banners: Banner[] = data?.data?.data || [];
  const counts = useMemo(() => {
    const c = { LIVE: 0, SCHEDULED: 0, ENDED: 0 };
    for (const b of banners) c[stateOf(b)]++;
    return c;
  }, [banners]);
  const shown = view === 'now' ? banners.filter((b) => stateOf(b) !== 'ENDED') : banners;

  const deleteMutation = useMutation({
    mutationFn: (id: string) => bannersApi.delete(id),
    onSuccess: () => { toast.success('Banner removed'); qc.invalidateQueries({ queryKey: ['banners-all'] }); qc.invalidateQueries({ queryKey: ['banners'] }); },
    onError: (err) => toast.error(serverMessage(err, 'Failed to remove the banner')),
  });

  function edit(b: Banner) {
    setForm({ id: b.id, title: b.title, linkUrl: b.linkUrl ?? '', storeId: b.storeId ?? '', sortOrder: String(b.sortOrder ?? 0),
      startDate: b.startAt ? storeToday(new Date(b.startAt)) : '', endDate: b.endAt ? storeToday(new Date(b.endAt)) : '', image: null, imageUrl: b.imageUrl });
  }

  return (
    <Page>
      <ConfirmModal
        open={!!confirmId}
        title="Remove this banner?"
        message="It disappears from the app right away. To keep it for later, give it an end date instead."
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (confirmId) deleteMutation.mutate(confirmId); setConfirmId(null); }}
        onCancel={() => setConfirmId(null)}
      />
      <PageHeader
        title="Banners"
        description="Promotional images in the customer app, for every store or one. Give one dates and it shows only then."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setForm({ ...EMPTY, storeId: isStoreManager ? (stores[0]?.id ?? '') : '' })}>New banner</Button>}
      />

      <Tabs ariaLabel="Which banners" value={view} onChange={setView} asButtons tabs={[
        { value: 'now', label: 'Live and scheduled', count: counts.LIVE + counts.SCHEDULED },
        { value: 'all', label: 'All, with ended', count: banners.length },
      ]} />

      {isLoading ? <CardSkeleton count={3} />
        : isError ? <ErrorState message="Failed to load banners." onRetry={refetch} />
        : shown.length === 0 ? (
          <EmptyState icon={<ImagePlus size={24} />} title="No banners are showing" description="Customers see none on Home until you add one." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {shown.map((b) => {
              const st = stateOf(b);
              const canChange = !isStoreManager || (!!b.storeId && (user?.storeIds ?? []).includes(b.storeId));
              return (
                <Card key={b.id} padding={14} className={b.id === savedId ? 'ui-soft-in ui-saved' : 'ui-soft-in'} style={{ opacity: st === 'ENDED' ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                    <img src={b.imageUrl} alt={b.title} style={{ width: 220, maxWidth: '100%', height: 86, objectFit: 'cover', borderRadius: RADIUS.md, flexShrink: 0, background: C.subtle }} />
                    <div style={{ flex: 1, minWidth: 180 }}>
                      <div style={{ fontWeight: 650, color: C.text, marginBottom: 6 }}>{b.title}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <Badge tone={st === 'LIVE' ? 'success' : st === 'SCHEDULED' ? 'info' : 'neutral'}>{st === 'LIVE' ? 'Live' : st === 'SCHEDULED' ? `Starts ${storeDayLong(b.startAt!)}` : 'Ended'}</Badge>
                        <Badge tone={b.storeId ? 'warning' : 'info'}>{b.storeId ? storeMap[b.storeId] || 'One store' : 'All stores'}</Badge>
                        {b.linkUrl && <Badge>Has link</Badge>}
                      </div>
                      <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 6 }}>
                        {b.endAt ? `${st === 'ENDED' ? 'Ended' : 'Until'} ${storeDayLong(b.endAt)}` : 'No end date'} · added {storeDayLong(b.createdAt)}
                      </div>
                    </div>
                    {canChange && (
                      <div style={{ display: 'flex', gap: 8 }}>
                        <Button size="sm" icon={<Pencil />} onClick={() => edit(b)}>Edit</Button>
                        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => setConfirmId(b.id)} aria-label={`Remove banner ${b.title}`}>Remove</Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      {form && <BannerForm initial={form} stores={stores} isStoreManager={isStoreManager}
        onClose={() => setForm(null)} onSaved={(id) => { setForm(null); setSavedId(id); qc.invalidateQueries({ queryKey: ['banners-all'] }); qc.invalidateQueries({ queryKey: ['banners'] }); }} />}
    </Page>
  );
}

function BannerForm({ initial, stores, isStoreManager, onClose, onSaved }: { initial: Form; stores: any[]; isStoreManager: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState<Form>(initial);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const fileRef = useRef<HTMLInputElement>(null);
  const preview = useMemo(() => (f.image ? URL.createObjectURL(f.image) : f.imageUrl), [f.image, f.imageUrl]);
  useEffect(() => () => { if (f.image && preview) URL.revokeObjectURL(preview); }, [f.image, preview]);
  const busy = useRef(false);
  const today = storeToday();
  const problem = !f.title.trim() ? 'Give the banner a title.' : !f.id && !f.image ? 'Choose the banner image.'
    : f.linkUrl.trim() && !/^https?:\/\//i.test(f.linkUrl.trim()) ? 'The link must start with http:// or https://.'
    : f.endDate && f.startDate && f.endDate < f.startDate ? 'The last day is before the first day.'
    : f.endDate && f.endDate < today ? 'The last day has already passed.' : null;

  const save = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('title', f.title.trim());
      if (f.image) fd.append('image', f.image);
      const clear: string[] = [];
      const put = (k: string, v: string, clearKey?: string) => { if (v.trim()) fd.append(k, v.trim()); else if (f.id && clearKey) clear.push(clearKey); };
      put('linkUrl', f.linkUrl, 'linkUrl');
      put('startDate', f.startDate, 'startDate');
      put('endDate', f.endDate, 'endDate');
      fd.append('sortOrder', String(Number(f.sortOrder) || 0));
      if (!isStoreManager) { if (f.storeId) fd.append('storeId', f.storeId); else if (f.id) clear.push('storeId'); }
      else if (!f.id && f.storeId) fd.append('storeId', f.storeId);
      if (clear.length) fd.append('clear', clear.join(','));
      return f.id ? bannersApi.update(f.id, fd) : bannersApi.create(fd);
    },
    onSuccess: (r: any) => { toast.success(f.id ? 'Banner saved' : 'Banner added'); onSaved(r?.data?.data?.id ?? f.id ?? ''); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the banner.')),
    onSettled: () => { busy.current = false; },
  });
  function submit() { if (problem || busy.current) return; busy.current = true; save.mutate(); }

  return (
    <Modal title={f.id ? 'Edit banner' : 'New banner'} subtitle="Shown on Home in the customer app" onClose={onClose} busy={save.isPending} maxWidth={560}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div>
          {preview
            ? <img src={preview} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', borderRadius: RADIUS.md, border: `1px solid ${C.border}` }} />
            : <div style={{ height: 140, borderRadius: RADIUS.md, border: `1.5px dashed ${C.borderStrong}`, background: C.subtle, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}><ImagePlus size={28} /></div>}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <Button size="sm" onClick={() => fileRef.current?.click()}>{preview ? 'Choose another image' : 'Choose the image'}</Button>
            <span style={{ fontSize: FONT.caption, color: C.muted }}>Wide, about 1200 by 400 px.</span>
          </div>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ''; if (file) set('image', file); }} />
        </div>
        <Field label="Title" htmlFor="bn-title" required>
          <input id="bn-title" className="ui-input" style={INPUT} maxLength={100} value={f.title} placeholder="e.g. March fuel savings" onChange={(e) => set('title', e.target.value)} />
        </Field>
        <Field label="Link" htmlFor="bn-link" hint="Optional: a Visit button when the customer taps the banner.">
          <input id="bn-link" className="ui-input" style={INPUT} value={f.linkUrl} placeholder="https://..." onChange={(e) => set('linkUrl', e.target.value)} />
        </Field>
        {isStoreManager ? (
          <div style={{ fontSize: FONT.small, color: C.primary, background: C.primaryTint, borderRadius: RADIUS.md, padding: '8px 12px', fontWeight: 600 }}>For your store only</div>
        ) : (
          <Field label="Stores" htmlFor="bn-store">
            <select id="bn-store" className="ui-input" style={INPUT} value={f.storeId} onChange={(e) => set('storeId', e.target.value)}>
              <option value="">All {stores.length || ''} stores</option>
              {stores.map((st: any) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          </Field>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Field label="First day" htmlFor="bn-start" hint="Empty: from now.">
            <input id="bn-start" className="ui-input" style={INPUT} type="date" value={f.startDate} onChange={(e) => set('startDate', e.target.value)} />
          </Field>
          <Field label="Last day" htmlFor="bn-end" hint="Empty: no end.">
            <input id="bn-end" className="ui-input" style={INPUT} type="date" min={today} value={f.endDate} onChange={(e) => set('endDate', e.target.value)} />
          </Field>
          <Field label="Order" htmlFor="bn-order" hint="0 shows first.">
            <input id="bn-order" className="ui-input" style={INPUT} inputMode="numeric" value={f.sortOrder} onChange={(e) => set('sortOrder', e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: FONT.caption, color: C.muted, alignSelf: 'center' }}>Quick:</span>
          <Chip onClick={() => { set('startDate', ''); set('endDate', ''); }}>No dates</Chip>
          <Chip onClick={() => { set('startDate', today); set('endDate', addDays(today, 6)); }}>This week</Chip>
          <Chip onClick={() => { set('startDate', today); set('endDate', addDays(today, 29)); }}>30 days</Chip>
        </div>
        {problem && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{problem}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : f.id ? 'Save' : 'Add banner'}</Button>
        </div>
      </div>
    </Modal>
  );
}
