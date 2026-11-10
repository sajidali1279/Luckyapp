import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowDown, ArrowUp, Camera, ListChecks, Pencil, Plus, ReceiptText, Trash2, Upload, X } from 'lucide-react';
import { pdiInvoicesApi, PdiVendorInput } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Button, Card, Badge, Notice, EmptyState, Field, FieldRow, HowItWorks, Tabs, Tone } from '../components/kit';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import DataTablePagination from '../components/DataTablePagination';
import { shrinkPhoto } from '../lib/photoPrep';
import { storeDayTime } from '../lib/storeDates';
import { TableBox } from '../components/ui/table';
import { C, FONT, INPUT, RADIUS, TEXT_MUTED } from '../lib/theme';

// Invoices to PDI (2026-10-27): the invoices read so far, a new one from its photos, and the vendors (2026-10-28: the vendor is read off the
// invoice, not picked; a vendor seen for the first time is set up once, here or on the invoice). Reading and the review are on
// pages/PdiInvoice.tsx. The server checks who may use which store and whether HQ has switched it on (Settings > Features).

export interface PdiMeta { enabled: boolean; readerReady: boolean; maxPhotos: number; stores: { id: string; name: string }[]; canEditVendors: boolean }
export interface PdiVendor {
  id: string; name: string; pdiCode: string | null; aliases: string[]; sellsBy: 'CASE' | 'EACH'; itemDigits: 'FIRST6' | 'LAST6' | 'NONE';
  itemLength: number | null; readerNotes: string | null; invoiceCount: number; productCount: number;
  upcCount?: number; canEdit?: boolean;   // UPCs remembered by item code; whether this person may change it (HQ, or who added it until its first file)
}
interface ListRow {
  id: string; store: { id: string; name: string }; vendor: { id: string; name: string } | null; vendorRead: string | null; status: string;
  invoiceNumber: string | null; invoiceDate: string | null; totalCents: number | null; photoCount: number; createdAt: string; createdBy: string | null;
  downloadedAt: string | null;
}

export const dollars = (cents: number | null | undefined) => (cents == null ? '' : (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
export const STATUS: Record<string, { label: string; tone: Tone }> = {
  READING: { label: 'Reading', tone: 'info' },
  READ: { label: 'To check', tone: 'warning' },
  FAILED: { label: 'Not read', tone: 'danger' },
  DONE: { label: 'File made', tone: 'success' },
};
export const SELLS_BY: Record<string, string> = { CASE: 'Cases', EACH: 'Single items' };
export const ITEM_DIGITS: Record<string, string> = { FIRST6: 'First 6 digits', LAST6: 'Last 6 digits', NONE: 'None printed' };
export const useVendors = () => useQuery({ queryKey: ['pdi-vendors'], queryFn: () => pdiInvoicesApi.vendors().then((r) => r.data.data as PdiVendor[]) });

type Tab = 'invoices' | 'vendors' | 'items';

export default function PdiInvoices() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const hq = user?.role === 'SUPER_ADMIN' || user?.role === 'DEV_ADMIN';
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'vendors' ? 'vendors' : params.get('tab') === 'items' ? 'items' : 'invoices';
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
      <Tabs<Tab> ariaLabel="Invoices, vendors or PDI item lists" value={tab} onChange={(t) => setParams(t === 'invoices' ? {} : { tab: t }, { replace: true })}
        tabs={[{ value: 'invoices', label: 'Invoices' }, { value: 'vendors', label: 'Vendors', count: vendorsQ.data?.length }, { value: 'items', label: 'PDI item lists' }]} />

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
                          <td style={s.td}>{r.invoiceNumber ?? ''}</td>
                          <td style={s.td}>{r.invoiceDate ?? ''}</td>
                          <td style={{ ...s.td, textAlign: 'right' }}>{dollars(r.totalCents)}</td>
                          <td style={s.td}><Badge tone={STATUS[r.status]?.tone ?? 'neutral'}>{STATUS[r.status]?.label ?? r.status}</Badge></td>
                          <td style={{ ...s.td, color: TEXT_MUTED }}>{r.createdBy ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            <DataTablePagination page={page} totalPages={listQ.data?.pages ?? 1} onPrevious={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
          </Card>
        </>
      ) : tab === 'vendors' ? <Vendors hq={hq} /> : (
        // the PDI item lists moved to the Items page (2026-11-10), with every item and its prices across the stores
        <Card>
          <p style={{ margin: '0 0 12px', color: C.text2 }}>The PDI item lists are now on the Items page, together with every item, its price at each store and the price checks.</p>
          <Button variant="primary" onClick={() => navigate('/items?tab=lists')}>Open the PDI lists on Items</Button>
        </Card>
      )}
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
        {hq ? ' Notes on how a vendor lays out its invoices help the reader with that vendor.' : ' You can change a vendor you added until its first file is made; after that, HQ can.'}
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
                <tr>{['Vendor', 'PDI code', 'Quantities', 'Item numbers', 'Printed as', 'Invoices', 'Products known', 'UPCs by item', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {vendorsQ.data.map((v) => (
                  <tr key={v.id}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{v.name}</td>
                    <td style={s.td}>{v.pdiCode ?? <Badge tone="warning">Not set</Badge>}</td>
                    <td style={s.td}>{SELLS_BY[v.sellsBy] ?? v.sellsBy}</td>
                    <td style={s.td}>{ITEM_DIGITS[v.itemDigits] ?? v.itemDigits}{v.itemLength ? ` (${v.itemLength} printed)` : ''}</td>
                    <td style={{ ...s.td, whiteSpace: 'normal', maxWidth: 260, color: TEXT_MUTED, fontSize: FONT.small }}>{v.aliases.join(', ') || 'None'}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{v.invoiceCount}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{v.productCount}</td>
                    <td style={{ ...s.td, textAlign: 'right' }} title="UPCs remembered for item codes, for invoices that print no UPC">{v.upcCount ?? 0}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {(hq || v.canEdit) && <Button size="sm" variant="ghost" icon={<Pencil />} onClick={() => setEditing(v)} aria-label={`Edit ${v.name}`}>Edit</Button>}
                      {hq && <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={() => setRemoving(v)} aria-label={`Delete ${v.name}`} />}
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

interface ItemListRow { storeId: string; name: string; items: number; importedAt: string | null; importedBy: string | null; fileName: string | null }
interface ImportResult { store: { name: string }; items: number; skipped: number; duplicates: number; withCost: number; withPrice: number; departments: { name: string; items: number }[] }
interface LabelPrices {
  hasList: boolean; compared: number; same: number; notInPdi: number;
  different: {
    labelId: string; name: string; barcode: string; labelCents: number; registerCents: number; pdiName: string; storePrice: boolean;
    inStore: boolean; saleEnds: string | null;   // on the store's own label list; a sale price running until then
  }[];
}
interface ApplyResult { updated: number; added: number; same: number; notOnList: number; onSale: number; noPrice: number; conflicts: number; gone: number }
const labelCount = (n: number) => `${n.toLocaleString()} ${n === 1 ? 'label' : 'labels'}`;
const saleDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' });

/** Each store's items as PDI knows them (2026-11-06): HQ uploads PDI's item report per store; every invoice line is then checked against
 *  it, and the shelf labels whose price is not the register's are listed. */
export function ItemLists() {
  const qc = useQueryClient();
  const listsQ = useQuery({ queryKey: ['pdi-item-lists'], queryFn: () => pdiInvoicesApi.itemLists().then((r) => r.data.data as { canUpload: boolean; stores: ItemListRow[] }) });
  const [uploading, setUploading] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [priceStore, setPriceStore] = useState('');
  const file = useRef<HTMLInputElement>(null);
  const target = useRef<string>('');
  const stores = listsQ.data?.stores ?? [];
  const withList = stores.filter((st) => st.items > 0);
  const checkStore = priceStore || withList[0]?.storeId || '';
  const pricesQ = useQuery({
    queryKey: ['pdi-label-prices', checkStore], enabled: !!checkStore,
    queryFn: () => pdiInvoicesApi.labelPrices(checkStore).then((r) => r.data.data as LabelPrices),
  });
  // Putting labels on the register price (2026-11-08): one row, or all of them after a confirm
  const [applying, setApplying] = useState<string | null>(null);   // a label id, or 'all'
  const [askAll, setAskAll] = useState(false);
  const [addMissing, setAddMissing] = useState(false);
  const diff = pricesQ.data?.different ?? [];
  const onList = diff.filter((d) => d.inStore && !d.saleEnds);
  const offList = diff.filter((d) => !d.inStore);
  const onSale = diff.filter((d) => d.saleEnds);

  async function applyPrices(labelIds: string[], withMissing: boolean, key: string) {
    if (!labelIds.length || applying) return;
    setApplying(key);
    try {
      const r = (await pdiInvoicesApi.applyLabelPrices(checkStore, labelIds, withMissing)).data.data as ApplyResult;
      const done = r.updated + r.added;
      const left = r.onSale + r.noPrice + r.conflicts + r.gone + (withMissing ? 0 : r.notOnList);
      if (done) toast.success(`${done.toLocaleString()} label ${done === 1 ? 'price is' : 'prices are'} now the register price${r.added ? ` (${r.added} added to the store)` : ''}. They are on the store's print list.`);
      else {
        const why = [
          r.same && 'already the register price', r.onSale && 'on a sale with an end date',
          r.noPrice && 'PDI has no price for it that fits a label (up to $999.99)', r.notOnList && 'not on this store\'s list', r.gone && 'the label was deleted',
        ].filter(Boolean).join('; ');
        if (!r.conflicts) toast(`Nothing changed: ${why || 'nothing to change'}.`);
      }
      if (r.conflicts) toast.error(`${r.conflicts} changed a moment ago by someone else and were left alone. Look at them again.`);
      else if (left && labelIds.length > 1) toast(`${left.toLocaleString()} left alone (on a sale, no register price, or not on the store's list).`);
      setAskAll(false); setAddMissing(false);
      qc.invalidateQueries({ queryKey: ['pdi-label-prices'] });
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['store-labels'] });
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'The prices could not be changed. Try again.'); } finally { setApplying(null); }
  }

  async function upload(f: File | undefined) {
    const storeId = target.current;
    if (!f || !storeId) return;
    setUploading(storeId);
    try {
      const r = await pdiInvoicesApi.importItems(storeId, f);
      setResult(r.data.data as ImportResult);
      qc.invalidateQueries({ queryKey: ['pdi-item-lists'] });
      qc.invalidateQueries({ queryKey: ['pdi-label-prices'] });
      qc.invalidateQueries({ queryKey: ['pdi-invoice'] });
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'The file could not be read. Try again.'); } finally { setUploading(null); }
  }

  if (listsQ.isError) return <ErrorState onRetry={() => listsQ.refetch()} />;
  return (
    <>
      <HowItWorks style={{ marginBottom: 16 }}>
        Each store's items as PDI knows them: name, department, cost and register price. Every invoice line is checked against its store's
        list, so a UPC that PDI does not have is caught here instead of PDI refusing the file, and a line with no UPC can find its item by
        name. {listsQ.data?.canUpload
          ? 'To add or refresh a store\'s list, save PDI\'s "Current inventory by item" report for that store and upload it here; the new file replaces the old list. Refresh it when prices change.'
          : 'HQ uploads each store\'s list from PDI.'}
      </HowItWorks>
      <Card padding={0} style={{ marginBottom: 16 }}>
        {listsQ.isLoading ? <div style={s.loading}>Loading...</div> : !stores.length ? (
          <EmptyState icon={<ListChecks />} title="No stores" description="The stores you manage show here." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={s.table}>
              <thead><tr>{['Store', 'Items', 'Last upload', 'File', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr></thead>
              <tbody>
                {stores.map((st) => (
                  <tr key={st.storeId}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{st.name}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>{st.items ? st.items.toLocaleString() : <Badge tone="neutral">None yet</Badge>}</td>
                    <td style={{ ...s.td, color: TEXT_MUTED }}>{st.importedAt ? `${storeDayTime(st.importedAt)}${st.importedBy ? `, ${st.importedBy}` : ''}` : ''}</td>
                    <td style={{ ...s.td, color: TEXT_MUTED }}>{st.fileName ?? ''}</td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {listsQ.data?.canUpload && (
                        <Button size="sm" icon={<Upload />} disabled={!!uploading} aria-label={`Upload the PDI item report for ${st.name}`}
                          onClick={() => { target.current = st.storeId; file.current?.click(); }}>
                          {uploading === st.storeId ? 'Reading...' : st.items ? 'Replace' : 'Upload'}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <input ref={file} type="file" accept=".xls,.xlsx,.csv" hidden onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      </Card>

      {withList.length > 0 && (
        <Card padding={0}>
          <div style={{ ...s.filters, alignItems: 'center' }}>
            <div style={{ fontWeight: 700, color: C.text, marginRight: 'auto' }}>Label prices against the register</div>
            {withList.length > 1 && (
              <select aria-label="Store to compare" style={s.select} value={checkStore} onChange={(e) => setPriceStore(e.target.value)}>
                {withList.map((st) => <option key={st.storeId} value={st.storeId}>{st.name}</option>)}
              </select>
            )}
          </div>
          {pricesQ.isError ? <div style={{ padding: 16 }}><ErrorState onRetry={() => pricesQ.refetch()} /></div>
            : pricesQ.isLoading || !pricesQ.data ? <div style={s.loading}>Loading...</div> : (
              <>
                <div style={s.priceSummary}>
                  {pricesQ.data.compared.toLocaleString()} labels compared: <b>{pricesQ.data.same.toLocaleString()} match</b>,{' '}
                  <b style={{ color: pricesQ.data.different.length ? C.danger : undefined }}>{pricesQ.data.different.length.toLocaleString()} differ</b>.
                  {' '}{pricesQ.data.notInPdi.toLocaleString()} labels have a barcode PDI does not have at this store.
                  {(onList.length > 0 || offList.length > 0) && (
                    <div style={{ marginTop: 10 }}>
                      <Button variant="primary" size="sm" disabled={!!applying} onClick={() => { setAddMissing(false); setAskAll(true); }}>
                        {applying === 'all' ? 'Updating...' : 'Update all to register price'}
                      </Button>
                    </div>
                  )}
                </div>
                {pricesQ.data.different.length > 0 && (
                  // a table container like the shared one: the buttons column stays pinned and shades what slides under it (2026-11-08)
                  <TableBox>
                    <table style={s.table}>
                      <thead><tr>{['Label', 'Barcode', 'Label price', 'Register price', 'Name in PDI', ''].map((h, i) => <th key={i} style={s.th}>{h}</th>)}</tr></thead>
                      <tbody>
                        {pricesQ.data.different.map((d) => (
                          <tr key={d.labelId}>
                            <td style={{ ...s.td, fontWeight: 600, whiteSpace: 'normal', minWidth: 170 }}>{d.name}</td>
                            <td style={{ ...s.td, color: TEXT_MUTED }}>{d.barcode}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>{dollars(d.labelCents)}{d.storePrice ? <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}> (this store)</span> : ''}</td>
                            <td style={{ ...s.td, textAlign: 'right', fontWeight: 700 }}>{dollars(d.registerCents)}</td>
                            <td style={{ ...s.td, color: TEXT_MUTED, whiteSpace: 'normal', minWidth: 140 }}>{d.pdiName}</td>
                            <td style={{ ...s.td, textAlign: 'right' }}>
                              {d.saleEnds ? <span style={{ color: TEXT_MUTED, fontSize: FONT.small }}>On sale until {saleDay(d.saleEnds)}</span> : (
                                <Button size="sm" disabled={!!applying} aria-label={`${d.inStore ? 'Use' : 'Add at'} the register price for ${d.name}`}
                                  title={d.inStore ? undefined : 'Not on this store\'s label list yet: adds it at the register price, as new to print'}
                                  onClick={() => void applyPrices([d.labelId], !d.inStore, d.labelId)}>
                                  {applying === d.labelId ? 'Saving...' : d.inStore ? 'Use register price' : 'Add at register price'}
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableBox>
                )}
              </>
            )}
        </Card>
      )}

      <ConfirmModal
        open={askAll}
        title="Update all to register price?"
        confirmLabel={`Update ${labelCount(onList.length + (addMissing ? offList.length : 0))}`}
        busy={applying === 'all'}
        confirmDisabled={onList.length + (addMissing ? offList.length : 0) === 0}
        maxWidth={520}
        message={(
          <>
            <p style={{ margin: '0 0 10px' }}>
              <b>{labelCount(onList.length)}</b> on {stores.find((st) => st.storeId === checkStore)?.name ?? 'this store'}'s list {onList.length === 1 ? 'changes' : 'change'} to the register
              price, at this store only. They go on the store's print list so the shelf labels can be reprinted.
            </p>
            {offList.length > 0 && (
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', margin: '0 0 10px', cursor: 'pointer' }}>
                <input type="checkbox" checked={addMissing} onChange={(e) => setAddMissing(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Also add the <b>{labelCount(offList.length)}</b> that {offList.length === 1 ? 'is' : 'are'} not on this store's list yet, at the register price. {offList.length === 1 ? 'It shows' : 'They show'} as new to print.</span>
              </label>
            )}
            {onSale.length > 0 && <p style={{ margin: '0 0 10px', color: TEXT_MUTED }}>{onSale.length} on a sale with an end date {onSale.length === 1 ? 'is' : 'are'} left alone.</p>}
            <p style={{ margin: 0, color: TEXT_MUTED }}>Every change is written to the Activity log with the old price.</p>
          </>
        )}
        onConfirm={() => void applyPrices([...onList, ...(addMissing ? offList : [])].map((d) => d.labelId), addMissing, 'all')}
        onCancel={() => { if (applying !== 'all') { setAskAll(false); setAddMissing(false); } }}
      />

      {result && (
        <Modal title={`${result.store.name}: list updated`} onClose={() => setResult(null)} maxWidth={520}>
          <p style={{ margin: '0 0 10px' }}><b>{result.items.toLocaleString()} items</b> read from the PDI report. {result.withPrice.toLocaleString()} have a price and {result.withCost.toLocaleString()} have a cost.</p>
          {(result.duplicates > 0 || result.skipped > 0) && (
            <p style={{ margin: '0 0 10px', color: TEXT_MUTED }}>
              {result.duplicates > 0 && `${result.duplicates} scan codes were listed twice (the first was kept). `}
              {result.skipped > 0 && `${result.skipped} rows had no scan code or no name and were left out.`}
            </p>
          )}
          <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>Largest departments: {result.departments.slice(0, 6).map((d) => `${d.name} ${d.items.toLocaleString()}`).join(', ')}</div>
          <div style={s.modalActions}><Button variant="primary" onClick={() => setResult(null)}>Done</Button></div>
        </Modal>
      )}
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
            <option value="NONE">Leave them out (none printed, or they have letters)</option>
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
  priceSummary: { padding: '12px 14px', fontSize: FONT.body, color: C.text, borderBottom: `1px solid ${C.border}` },
};
