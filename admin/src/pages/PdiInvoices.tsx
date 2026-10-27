import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Camera, ReceiptText, Plus, X } from 'lucide-react';
import { pdiInvoicesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Button, Card, Badge, Notice, EmptyState, Field, FieldRow, HowItWorks, Tone } from '../components/kit';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import DataTablePagination from '../components/DataTablePagination';
import { shrinkPhoto } from '../lib/photoPrep';
import { storeDayTime } from '../lib/storeDates';
import { C, FONT, INPUT, RADIUS, TEXT_MUTED } from '../lib/theme';

// Invoices to PDI (2026-10-27): the list of vendor invoices read so far, and a new one from its photos. Reading and the review are on
// pages/PdiInvoice.tsx. The server checks who may use which store and whether HQ has switched it on (Settings > Features).

export interface PdiMeta { enabled: boolean; readerReady: boolean; suppliers: { code: string; name: string }[]; maxPhotos: number; stores: { id: string; name: string }[] }
interface ListRow {
  id: string; store: { id: string; name: string }; supplier: string; supplierName: string; status: string; invoiceNumber: string | null;
  invoiceDate: string | null; totalCents: number | null; photoCount: number; createdAt: string; createdBy: string | null; downloadedAt: string | null;
}

export const dollars = (cents: number | null | undefined) => (cents == null ? '-' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  READING: { label: 'Reading', tone: 'info' },
  READ: { label: 'To check', tone: 'warning' },
  FAILED: { label: 'Not read', tone: 'danger' },
  DONE: { label: 'File made', tone: 'success' },
};

export default function PdiInvoices() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const hq = user?.role === 'SUPER_ADMIN' || user?.role === 'DEV_ADMIN';
  const [storeId, setStoreId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const metaQ = useQuery({ queryKey: ['pdi-meta'], queryFn: () => pdiInvoicesApi.meta().then((r) => r.data.data as PdiMeta) });
  const listQ = useQuery({
    queryKey: ['pdi-invoices', storeId, supplier, page],
    queryFn: () => pdiInvoicesApi.list({ storeId: storeId || undefined, supplier: supplier || undefined, page }).then((r) => r.data.data as { invoices: ListRow[]; pages: number; total: number }),
    // while one is being read, the list shows when it is done
    refetchInterval: (q) => ((q.state.data as { invoices: ListRow[] } | undefined)?.invoices.some((i) => i.status === 'READING') ? 4000 : false),
  });
  const meta = metaQ.data;
  const canAdd = !!meta?.enabled && meta.readerReady && meta.stores.length > 0;

  return (
    <Page>
      <PageHeader
        title="Invoices to PDI"
        description="Photograph a vendor's invoice, check what was read, and download the file PDI imports."
        icon={ReceiptText}
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)} disabled={!canAdd}>New invoice</Button>}
      />
      {meta && !meta.enabled && (
        <Notice tone="warning" style={{ marginBottom: 16 }}>
          Invoices to PDI is switched off, so nothing new can be read. {hq ? 'Switch it on in Settings > Features once you are ready.' : 'HQ can switch it on.'} Invoices already done can still be opened.
        </Notice>
      )}
      {meta?.enabled && !meta.readerReady && <Notice tone="danger" style={{ marginBottom: 16 }}>Invoice reading is not set up on the server yet.</Notice>}
      <HowItWorks style={{ marginBottom: 16 }}>
        Pick the store and the supplier, and add photos of the whole invoice, top to bottom (overlapping is fine). It is read in about a minute.
        Then every line is shown beside the photos with anything that does not add up marked: correct what was misread, or accept it after
        looking. The file for PDI downloads once nothing is left open, and you import it into PDI as before. Frito-Lay, Ed F. Davis and
        PepsiCo can be read so far.
      </HowItWorks>
      <Card padding={0}>
        <div style={s.filters}>
          {meta && meta.stores.length > 1 && (
            <select aria-label="Store" style={s.select} value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }}>
              <option value="">All stores</option>
              {meta.stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
          <select aria-label="Supplier" style={s.select} value={supplier} onChange={(e) => { setSupplier(e.target.value); setPage(1); }}>
            <option value="">All suppliers</option>
            {meta?.suppliers.map((sp) => <option key={sp.code} value={sp.code}>{sp.name}</option>)}
          </select>
        </div>
        {listQ.isError ? <div style={{ padding: 16 }}><ErrorState onRetry={() => listQ.refetch()} /></div>
          : listQ.isLoading ? <div style={s.loading}>Loading...</div>
          : !listQ.data?.invoices.length ? (
            <EmptyState icon={<ReceiptText />} title="No invoices yet" description={canAdd ? 'Add the photos of a vendor invoice to read it.' : 'Invoices read for PDI show here.'}
              action={canAdd ? <Button variant="primary" icon={<Plus />} onClick={() => setAdding(true)}>New invoice</Button> : undefined} />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={s.table}>
                <thead>
                  <tr>{['Added', 'Store', 'Supplier', 'Invoice', 'Invoice date', 'Total', 'Status', 'By'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {listQ.data.invoices.map((r) => (
                    <tr key={r.id} style={s.row} onClick={() => navigate(`/pdi-invoices/${r.id}`)}>
                      <td style={s.td}><button type="button" style={s.linkBtn} onClick={(e) => { e.stopPropagation(); navigate(`/pdi-invoices/${r.id}`); }}>{storeDayTime(r.createdAt)}</button></td>
                      <td style={s.td}>{r.store.name}</td>
                      <td style={s.td}>{r.supplierName}</td>
                      <td style={s.td}>{r.invoiceNumber ?? '-'}</td>
                      <td style={s.td}>{r.invoiceDate ?? '-'}</td>
                      <td style={{ ...s.td, textAlign: 'right' }}>{dollars(r.totalCents)}</td>
                      <td style={s.td}><Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                      <td style={{ ...s.td, color: TEXT_MUTED }}>{r.createdBy ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <DataTablePagination page={page} totalPages={listQ.data?.pages ?? 1} onPrevious={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
      </Card>
      {adding && meta && <NewInvoice meta={meta} onClose={() => setAdding(false)} onDone={(id) => navigate(`/pdi-invoices/${id}`)} />}
    </Page>
  );
}

/** The store, the supplier and the photos, in order; the photos are shrunk on this computer first (a phone photo can be 10 MB). */
function NewInvoice({ meta, onClose, onDone }: { meta: PdiMeta; onClose: () => void; onDone: (id: string) => void }) {
  const [storeId, setStoreId] = useState(meta.stores.length === 1 ? meta.stores[0].id : '');
  const [supplier, setSupplier] = useState('');
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // the previews' links are let go when a photo is taken out, and the rest when the form closes (not while they are still shown)
  const made = useRef<string[]>([]);
  useEffect(() => () => made.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const add = (files: FileList | null) => {
    if (!files) return;
    const room = meta.maxPhotos - photos.length;
    const picked = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room);
    if (files.length > room) toast.error(`At most ${meta.maxPhotos} photos for one invoice.`);
    const added = picked.map((file) => ({ file, url: URL.createObjectURL(file) }));
    made.current.push(...added.map((p) => p.url));
    setPhotos((ps) => [...ps, ...added]);
  };
  const remove = (i: number) => setPhotos((ps) => { URL.revokeObjectURL(ps[i].url); return ps.filter((_, j) => j !== i); });
  const move = (i: number, by: number) => setPhotos((ps) => { const next = [...ps]; const [p] = next.splice(i, 1); next.splice(i + by, 0, p); return next; });

  async function read() {
    setBusy(true);
    try {
      const shrunk = await Promise.all(photos.map((p) => shrinkPhoto(p.file, 2400, 0.9)));
      const r = await pdiInvoicesApi.create(storeId, supplier, shrunk);
      onDone(r.data.data.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'The photos could not be sent. Try again.');
      setBusy(false);
    }
  }

  return (
    <Modal title="New invoice" subtitle="Read a vendor's paper invoice into the file PDI imports." onClose={onClose} busy={busy} maxWidth={620}>
      <FieldRow>
        <Field label="Store" htmlFor="pdi-store" style={{ flex: '1 1 200px' }}>
          <select id="pdi-store" style={INPUT} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Pick the store</option>
            {meta.stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier" htmlFor="pdi-supplier" style={{ flex: '1 1 200px' }}>
          <select id="pdi-supplier" style={INPUT} value={supplier} onChange={(e) => setSupplier(e.target.value)}>
            <option value="">Pick the supplier</option>
            {meta.suppliers.map((sp) => <option key={sp.code} value={sp.code}>{sp.name}</option>)}
          </select>
        </Field>
      </FieldRow>
      <Field label={`Photos (${photos.length} of up to ${meta.maxPhotos})`} hint="The whole invoice, top to bottom, flat and in good light. Overlapping photos are fine: every line is read once.">
        <div style={s.photoGrid}>
          {photos.map((p, i) => (
            <div key={p.url} style={s.photo}>
              <img src={p.url} alt={`Photo ${i + 1}`} style={s.photoImg} />
              <span style={s.photoNo}>{i + 1}</span>
              <div style={s.photoTools}>
                <button type="button" style={s.toolBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move photo ${i + 1} up`}><ArrowUp size={14} /></button>
                <button type="button" style={s.toolBtn} onClick={() => move(i, 1)} disabled={i === photos.length - 1} aria-label={`Move photo ${i + 1} down`}><ArrowDown size={14} /></button>
                <button type="button" style={s.toolBtn} onClick={() => remove(i)} aria-label={`Remove photo ${i + 1}`}><X size={14} /></button>
              </div>
            </div>
          ))}
          {photos.length < meta.maxPhotos && (
            <button type="button" style={s.addPhoto} onClick={() => input.current?.click()}><Camera size={22} /><span>Add photos</span></button>
          )}
        </div>
        <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </Field>
      <div style={s.modalActions}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" onClick={read} disabled={busy || !storeId || !supplier || !photos.length}>{busy ? 'Sending the photos...' : 'Read the invoice'}</Button>
      </div>
    </Modal>
  );
}

const s: Record<string, React.CSSProperties> = {
  filters: { display: 'flex', gap: 10, flexWrap: 'wrap', padding: 14, borderBottom: `1px solid ${C.border}` },
  select: { ...INPUT, width: 'auto', minWidth: 'min(200px, 100%)' },
  loading: { padding: 32, color: TEXT_MUTED, textAlign: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: FONT.body },
  th: { textAlign: 'left', padding: '10px 14px', fontSize: FONT.small, color: TEXT_MUTED, fontWeight: 600, background: C.subtle, whiteSpace: 'nowrap' },
  td: { padding: '10px 14px', borderTop: `1px solid ${C.border}`, whiteSpace: 'nowrap' },
  row: { cursor: 'pointer' },
  linkBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', color: C.primary, fontWeight: 600, cursor: 'pointer' },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 },
  photo: { position: 'relative', borderRadius: RADIUS.md, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.subtle, aspectRatio: '3 / 4' },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  photoNo: { position: 'absolute', top: 6, left: 6, background: C.primary, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' },
  photoTools: { position: 'absolute', bottom: 6, left: 6, right: 6, display: 'flex', justifyContent: 'space-between', gap: 4 },
  toolBtn: { background: 'rgba(255,255,255,0.92)', border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text },
  addPhoto: { border: `1px dashed ${C.borderStrong}`, borderRadius: RADIUS.md, background: C.surface, color: C.primary, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, aspectRatio: '3 / 4', cursor: 'pointer', fontWeight: 600, fontSize: FONT.small },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
};
