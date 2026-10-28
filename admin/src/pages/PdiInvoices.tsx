import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, ReceiptText, Trash2, X } from 'lucide-react';
import { pdiInvoicesApi, PdiVendorInput } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Button, Card, Badge, Notice, EmptyState, Field, FieldRow, HowItWorks, Tabs, Tone } from '../components/kit';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import DataTablePagination from '../components/DataTablePagination';
import { shrinkPhoto } from '../lib/photoPrep';
import { storeDayTime } from '../lib/storeDates';
import { C, FONT, INPUT, RADIUS, TEXT_MUTED } from '../lib/theme';

// Invoices to PDI (2026-10-27): the invoices read so far, a new one from its photos, and the vendors (2026-10-28: the vendor is read off the
// invoice, not picked; a vendor seen for the first time is set up once, here or on the invoice). Reading and the review are on
// pages/PdiInvoice.tsx. The server checks who may use which store and whether HQ has switched it on (Settings > Features).

export interface PdiMeta { enabled: boolean; readerReady: boolean; maxPhotos: number; stores: { id: string; name: string }[]; canEditVendors: boolean }
export interface PdiVendor {
  id: string; name: string; pdiCode: string | null; aliases: string[]; sellsBy: 'CASE' | 'EACH'; itemDigits: 'FIRST6' | 'LAST6' | 'NONE';
  itemLength: number | null; readerNotes: string | null; invoiceCount: number; productCount: number;
}
interface ListRow {
  id: string; store: { id: string; name: string }; vendor: { id: string; name: string } | null; vendorRead: string | null; status: string;
  invoiceNumber: string | null; invoiceDate: string | null; totalCents: number | null; photoCount: number; createdAt: string; createdBy: string | null;
  downloadedAt: string | null;
}

export const dollars = (cents: number | null | undefined) => (cents == null ? '-' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  READING: { label: 'Reading', tone: 'info' },
  READ: { label: 'To check', tone: 'warning' },
  FAILED: { label: 'Not read', tone: 'danger' },
  DONE: { label: 'File made', tone: 'success' },
};
export const SELLS_BY: Record<string, string> = { CASE: 'Cases', EACH: 'Single items' };
export const ITEM_DIGITS: Record<string, string> = { FIRST6: 'First 6 digits', LAST6: 'Last 6 digits', NONE: 'None printed' };
export const useVendors = () => useQuery({ queryKey: ['pdi-vendors'], queryFn: () => pdiInvoicesApi.vendors().then((r) => r.data.data as PdiVendor[]) });

type Tab = 'invoices' | 'vendors';

export default function PdiInvoices() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const hq = user?.role === 'SUPER_ADMIN' || user?.role === 'DEV_ADMIN';
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'vendors' ? 'vendors' : 'invoices';
  const [storeId, setStoreId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const metaQ = useQuery({ queryKey: ['pdi-meta'], queryFn: () => pdiInvoicesApi.meta().then((r) => r.data.data as PdiMeta) });
  const vendorsQ = useVendors();
  const listQ = useQuery({
    queryKey: ['pdi-invoices', storeId, vendorId, page],
    queryFn: () => pdiInvoicesApi.list({ storeId: storeId || undefined, vendorId: vendorId || undefined, page }).then((r) => r.data.data as { invoices: ListRow[]; pages: number; total: number }),
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
      <Tabs<Tab> ariaLabel="Invoices or vendors" value={tab} onChange={(t) => setParams(t === 'vendors' ? { tab: 'vendors' } : {}, { replace: true })}
        tabs={[{ value: 'invoices', label: 'Invoices' }, { value: 'vendors', label: 'Vendors', count: vendorsQ.data?.length }]} />

      {tab === 'invoices' ? (
        <>
          <HowItWorks style={{ marginBottom: 16 }}>
            Pick the store and add photos of the whole invoice, top to bottom (overlapping is fine). It is read in a minute or two, and the
            vendor is read off the invoice: a vendor seen for the first time is set up once (its code in PDI), and found by itself after that.
            Every line is then shown beside the photos with anything that does not add up marked: correct what was misread, or accept it after
            looking. The file for PDI downloads once nothing is left open, and you import it into PDI as before.
          </HowItWorks>
          <Card padding={0}>
            <div style={s.filters}>
              {meta && meta.stores.length > 1 && (
                <select aria-label="Store" style={s.select} value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }}>
                  <option value="">All stores</option>
                  {meta.stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              )}
              <select aria-label="Vendor" style={s.select} value={vendorId} onChange={(e) => { setVendorId(e.target.value); setPage(1); }}>
                <option value="">All vendors</option>
                <option value="none">Waiting for a vendor</option>
                {vendorsQ.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
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
                      <tr>{['Added', 'Store', 'Vendor', 'Invoice', 'Invoice date', 'Total', 'Status', 'By'].map((h) => <th key={h} style={s.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {listQ.data.invoices.map((r) => (
                        <tr key={r.id} style={s.row} onClick={() => navigate(`/pdi-invoices/${r.id}`)}>
                          <td style={s.td}><button type="button" style={s.linkBtn} onClick={(e) => { e.stopPropagation(); navigate(`/pdi-invoices/${r.id}`); }}>{storeDayTime(r.createdAt)}</button></td>
                          <td style={s.td}>{r.store.name}</td>
                          <td style={s.td}>{r.vendor ? r.vendor.name : r.status === 'READ' ? <Badge tone="warning" title="Say which vendor it is on the invoice">New: {r.vendorRead ?? 'not read'}</Badge> : <span style={{ color: TEXT_MUTED }}>{r.vendorRead ?? '-'}</span>}</td>
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
        </>
      ) : <Vendors hq={hq} />}
      {adding && meta && <NewInvoice meta={meta} onClose={() => setAdding(false)} onDone={(id) => navigate(`/pdi-invoices/${id}`)} />}
    </Page>
  );
}

/** The vendors: what the file needs to know about each, and the names each is printed as. HQ edits and deletes them. */
function Vendors({ hq }: { hq: boolean }) {
  const qc = useQueryClient();
  const vendorsQ = useVendors();
  const [editing, setEditing] = useState<PdiVendor | 'new' | null>(null);
  const [removing, setRemoving] = useState<PdiVendor | null>(null);
  const [busy, setBusy] = useState(false);
  const refresh = () => { qc.invalidateQueries({ queryKey: ['pdi-vendors'] }); qc.invalidateQueries({ queryKey: ['pdi-invoices'] }); };

  async function save(input: PdiVendorInput & { aliases?: string[] }) {
    setBusy(true);
    try {
      if (editing === 'new') await pdiInvoicesApi.createVendor(input);
      else if (editing) await pdiInvoicesApi.updateVendor(editing.id, input);
      toast.success('Saved.');
      setEditing(null);
      refresh();
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'It could not be saved.'); } finally { setBusy(false); }
  }
  async function remove() {
    if (!removing) return;
    setBusy(true);
    try { await pdiInvoicesApi.removeVendor(removing.id); toast.success('Deleted.'); setRemoving(null); refresh(); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? 'It could not be deleted.'); } finally { setBusy(false); }
  }

  if (vendorsQ.isError) return <ErrorState onRetry={() => vendorsQ.refetch()} />;
  return (
    <>
      <HowItWorks style={{ marginBottom: 16 }}>
        A vendor is found by the name printed on its invoices. The first invoice from a new vendor asks for its code in PDI, whether its
        quantities are cases or single items, and how its item numbers go in the file; each name it is printed as is remembered.
        {hq ? ' Notes on how a vendor lays out its invoices help the reader with that vendor.' : ' HQ can change a vendor here.'}
      </HowItWorks>
      <Card padding={0}>
        <div style={s.filters}>
          <Button size="sm" icon={<Plus />} onClick={() => setEditing('new')}>Add a vendor</Button>
        </div>
        {vendorsQ.isLoading ? <div style={s.loading}>Loading...</div> : !vendorsQ.data?.length ? (
          <EmptyState icon={<ReceiptText />} title="No vendors yet" description="Vendors are added from their first invoice." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead>
                <tr>{['Vendor', 'PDI code', 'Quantities', 'Item numbers', 'Printed as', 'Invoices', 'Products known', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {vendorsQ.data.map((v) => (
                  <tr key={v.id}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{v.name}</td>
                    <td style={s.td}>{v.pdiCode ?? <Badge tone="warning">Not set</Badge>}</td>
                    <td style={s.td}>{SELLS_BY[v.sellsBy] ?? v.sellsBy}</td>
                    <td style={s.td}>{ITEM_DIGITS[v.itemDigits] ?? v.itemDigits}{v.itemLength ? ` (${v.itemLength} printed)` : ''}</td>
                    <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 260, color: TEXT_MUTED, fontSize: FONT.small }}>{v.aliases.join(', ') || '-'}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{v.invoiceCount}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{v.productCount}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {hq && <>
                        <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(v)} aria-label={`Edit ${v.name}`}>Edit</Button>
                        <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(v)} aria-label={`Delete ${v.name}`} />
                      </>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {editing && (
        <VendorForm title={editing === 'new' ? 'Add a vendor' : `Edit ${editing.name}`} initial={editing === 'new' ? undefined : editing} hq={hq} busy={busy}
          onSave={save} onClose={() => setEditing(null)} />
      )}
      <ConfirmModal open={!!removing} title={`Delete ${removing?.name ?? 'this vendor'}?`} confirmLabel="Delete" danger busy={busy} headingLevel="h2"
        message={`Its ${removing?.invoiceCount ?? 0} invoices stay, waiting for someone to say which vendor they are from, and the units per case known for its ${removing?.productCount ?? 0} products are forgotten.`}
        onConfirm={remove} onCancel={() => setRemoving(null)} />
    </>
  );
}

/** A vendor's settings: a new one (from its first invoice, `suggest` fills in what was read) or an edit (HQ). */
export function VendorForm({ title, initial, suggest, hq, busy, onSave, onClose }: {
  title: string; initial?: PdiVendor; suggest?: Partial<PdiVendorInput>; hq: boolean; busy: boolean;
  onSave: (v: PdiVendorInput & { aliases?: string[] }) => void; onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? suggest?.name ?? '');
  const [pdiCode, setPdiCode] = useState(initial?.pdiCode ?? '');
  const [sellsBy, setSellsBy] = useState<'CASE' | 'EACH'>(initial?.sellsBy ?? suggest?.sellsBy ?? 'CASE');
  const [itemDigits, setItemDigits] = useState<'FIRST6' | 'LAST6' | 'NONE'>(initial?.itemDigits ?? suggest?.itemDigits ?? 'FIRST6');
  const [itemLength, setItemLength] = useState(initial?.itemLength ? String(initial.itemLength) : '');
  const [readerNotes, setReaderNotes] = useState(initial?.readerNotes ?? '');
  const [aliases, setAliases] = useState<string[]>(initial?.aliases ?? []);
  const code = pdiCode.trim().toUpperCase();
  const codeOk = /^[A-Z0-9]{1,6}$/.test(code);
  return (
    <Modal title={title} subtitle={initial ? undefined : 'Set once: every invoice from this vendor uses it.'} onClose={onClose} busy={busy} maxWidth={560}>
      <FieldRow>
        <Field label="Vendor" htmlFor="pv-name" style={{ flex: '2 1 220px' }}>
          <input id="pv-name" style={INPUT} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Code in PDI" htmlFor="pv-code" hint="As the vendor is set up in PDI, up to 6 letters or digits (FRITO)." style={{ flex: '1 1 140px' }}>
          <input id="pv-code" style={{ ...INPUT, textTransform: 'uppercase' }} value={pdiCode} maxLength={6} onChange={(e) => setPdiCode(e.target.value)} />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Its quantities count" htmlFor="pv-sells" style={{ flex: '1 1 200px' }}>
          <select id="pv-sells" style={INPUT} value={sellsBy} onChange={(e) => setSellsBy(e.target.value as 'CASE' | 'EACH')}>
            <option value="CASE">Cases</option>
            <option value="EACH">Single items</option>
          </select>
        </Field>
        <Field label="Its item numbers in the file" htmlFor="pv-items" hint="The file holds 6 digits of the vendor's own item number." style={{ flex: '1 1 200px' }}>
          <select id="pv-items" style={INPUT} value={itemDigits} onChange={(e) => setItemDigits(e.target.value as 'FIRST6' | 'LAST6' | 'NONE')}>
            <option value="FIRST6">First 6 digits</option>
            <option value="LAST6">Last 6 digits</option>
            <option value="NONE">It prints none</option>
          </select>
        </Field>
      </FieldRow>
      {hq && (
        <>
          <Field label="Digits in its item numbers (optional)" htmlFor="pv-len" hint="Catches a misread item number: Frito-Lay prints 8.">
            <input id="pv-len" style={{ ...INPUT, width: 120 }} inputMode="numeric" value={itemLength} onChange={(e) => setItemLength(e.target.value.replace(/\D/g, '').slice(0, 2))} />
          </Field>
          <Field label="Notes for the reader (optional)" htmlFor="pv-notes" hint="How its invoices are laid out, if anything is easy to misread.">
            <textarea id="pv-notes" style={{ ...INPUT, minHeight: 90 }} value={readerNotes} maxLength={2000} onChange={(e) => setReaderNotes(e.target.value)} />
          </Field>
          {initial && (
            <Field label="Printed on its invoices as">
              {aliases.length ? (
                <div style={s.aliases}>
                  {aliases.map((a) => (
                    <span key={a} style={s.alias}>{a}<button type="button" style={s.aliasX} aria-label={`Forget ${a}`} onClick={() => setAliases((xs) => xs.filter((x) => x !== a))}><X size={12} /></button></span>
                  ))}
                </div>
              ) : <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}>Only its own name so far.</span>}
            </Field>
          )}
        </>
      )}
      <div style={s.modalActions}>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="primary" disabled={busy || !name.trim() || !codeOk}
          onClick={() => onSave({ name: name.trim(), pdiCode: code, sellsBy, itemDigits, ...(hq ? { itemLength: itemLength ? Number(itemLength) : null, readerNotes } : {}), ...(initial && hq ? { aliases } : {}) })}>
          {busy ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </Modal>
  );
}

/** The store and the photos, in order; the photos are shrunk on this computer first (a phone photo can be 10 MB). */
function NewInvoice({ meta, onClose, onDone }: { meta: PdiMeta; onClose: () => void; onDone: (id: string) => void }) {
  const [storeId, setStoreId] = useState(meta.stores.length === 1 ? meta.stores[0].id : '');
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
      const r = await pdiInvoicesApi.create(storeId, shrunk);
      onDone(r.data.data.id);
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'The photos could not be sent. Try again.');
      setBusy(false);
    }
  }

  return (
    <Modal title="New invoice" subtitle="Read a vendor's paper invoice into the file PDI imports. The vendor is read off the invoice." onClose={onClose} busy={busy} maxWidth={620}>
      <Field label="Store" htmlFor="pdi-store">
        <select id="pdi-store" style={INPUT} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Pick the store</option>
          {meta.stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      </Field>
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
        <Button variant="primary" onClick={read} disabled={busy || !storeId || !photos.length}>{busy ? 'Sending the photos...' : 'Read the invoice'}</Button>
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
  aliases: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  alias: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 4px 3px 10px', borderRadius: 999, background: C.subtle, border: `1px solid ${C.border}`, fontSize: FONT.small },
  aliasX: { background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: TEXT_MUTED, display: 'flex' },
  photoGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10 },
  photo: { position: 'relative', borderRadius: RADIUS.md, overflow: 'hidden', border: `1px solid ${C.border}`, background: C.subtle, aspectRatio: '3 / 4' },
  photoImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  photoNo: { position: 'absolute', top: 6, left: 6, background: C.primary, color: '#fff', borderRadius: 999, fontSize: 12, fontWeight: 700, minWidth: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 6px' },
  photoTools: { position: 'absolute', bottom: 6, left: 6, right: 6, display: 'flex', justifyContent: 'space-between', gap: 4 },
  toolBtn: { background: 'rgba(255,255,255,0.92)', border: `1px solid ${C.border}`, borderRadius: RADIUS.sm, width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text },
  addPhoto: { border: `1px dashed ${C.borderStrong}`, borderRadius: RADIUS.md, background: C.surface, color: C.primary, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, aspectRatio: '3 / 4', cursor: 'pointer', fontWeight: 600, fontSize: FONT.small },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
};
