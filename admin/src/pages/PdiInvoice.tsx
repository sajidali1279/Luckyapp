import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowLeft, CheckCircle2, Download, ReceiptText, Loader2, MoreHorizontal, RefreshCw, Save, Trash2 } from 'lucide-react';
import { pdiInvoicesApi, PdiVendorInput } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Button, Card, Badge, Notice, MenuButton, StatTile } from '../components/kit';
import Modal from '../components/Modal';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { useUnsaved, useAnyUnsaved } from '../lib/unsaved';
import { storeDayTime } from '../lib/storeDates';
import { C, FONT, RADIUS, TEXT_MUTED } from '../lib/theme';
import { dollars, STATUS, SELLS_BY, VendorForm, useVendors } from './PdiInvoices';

// One vendor invoice for PDI (2026-10-27): the photos beside every line read from them, and what to look at, field by field (worked out on
// the server by utils/pdiInvoice.ts each time). A misread value is corrected in its cell and saved; a units per case is confirmed once and
// remembered for the product; a problem that is right as printed is accepted after a look. The file downloads once nothing is left open.
// The vendor is read off the invoice (2026-10-28): one seen for the first time is chosen or added here, once.

interface Problem { field: string; message: string; key: string; canCheck: boolean; checked: boolean }
interface FileLine { upc: string; description: string; itemNumber: string | null; priceCents: number; unitsPerCase: number; quantity: number }
interface ReviewLine { line: FileLine; unitsFrom: string | null; problems: Problem[] }
interface Review {
  header: { supplierCode: string; invoiceNumber: string; date: string; totalCents: number }; lines: ReviewLine[]; problems: Problem[];
  open: number; canDownload: boolean; fileName: string | null; linesTotalCents: number;
}
interface PaperLine {
  upc: string | null; description: string | null; item?: string | null; quantity: number | null; units?: number | null; price: string | null;
  amount: string | null; isReturn?: boolean; manufacturer?: string | null; group?: string | null;
}
interface Paper { invoiceNumber: string | null; date: string | null; total: string | null; lines: PaperLine[]; groups?: unknown[]; summary?: unknown }
interface Invoice {
  id: string; store: { id: string; name: string }; status: string; readError: string | null;
  vendor: { id: string; name: string; pdiCode: string | null; sellsBy: string; itemDigits: string; itemLength: number | null } | null;
  vendorRead: string | null; vendorPrinted: { name: string | null; address: string | null; phone: string | null } | null;
  readModel: string | null; readUsage: { inputTokens: number; outputTokens: number; costCents: number | null; unreadable?: string[] } | null;
  createdAt: string; createdBy: string | null; updatedAt: string; updatedBy: string | null; downloadedAt: string | null; downloadedBy: string | null;
  photos: { url: string; thumbUrl: string }[]; paper: Paper | null; review: Review | null;
  duplicates: { id: string; status: string; createdAt: string; storeName: string }[];
}

const UNITS_FROM: Record<string, string> = { each: 'one each', paper: 'from the paper', learned: 'learned', confirmed: 'confirmed', guess: 'a guess' };

export default function PdiInvoice() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const hq = user?.role === 'SUPER_ADMIN' || user?.role === 'DEV_ADMIN';
  const q = useQuery({
    queryKey: ['pdi-invoice', id],
    queryFn: () => pdiInvoicesApi.get(id).then((r) => r.data.data as Invoice),
    refetchInterval: (query) => ((query.state.data as Invoice | undefined)?.status === 'READING' ? 3000 : false),
  });
  const inv = q.data;
  const [paper, setPaper] = useState<Paper | null>(null);   // the corrections not saved yet (null: none)
  const [busy, setBusy] = useState<string | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [asking, setAsking] = useState<'reread' | 'delete' | null>(null);
  const [units, setUnits] = useState<Record<number, string>>({});
  useUnsaved('pdi-invoice', !!paper);
  useAnyUnsaved();
  useEffect(() => { setPaper(null); setUnits({}); }, [id]);

  const shown = paper ?? inv?.paper ?? null;
  const review = inv?.review ?? null;
  const openLines = useMemo(() => (review ? review.lines.map((l, i) => (l.problems.some((p) => !p.checked) ? i : -1)).filter((i) => i >= 0) : []), [review]);
  useEffect(() => { if (review && openLines.length === 0) setOnlyOpen(false); }, [review, openLines.length]);

  const save = async (body: Parameters<typeof pdiInvoicesApi.update>[1], what: string) => {
    setBusy(what);
    try {
      const r = await pdiInvoicesApi.update(id, body);
      qc.setQueryData(['pdi-invoice', id], r.data.data);
      qc.invalidateQueries({ queryKey: ['pdi-invoices'] });
      return true;
    } catch (e: any) {
      toast.error(e?.response?.data?.error ?? 'It could not be saved. Try again.');
      return false;
    } finally { setBusy(null); }
  };
  const saveCorrections = async () => { if (paper && (await save({ paper }, 'save'))) { setPaper(null); toast.success('Saved. The checks are up to date.'); } };
  const editLine = (i: number, patch: Partial<PaperLine>) => {
    if (!shown) return;
    setPaper({ ...shown, lines: shown.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  };
  const editHeader = (patch: Partial<Paper>) => { if (shown) setPaper({ ...shown, ...patch }); };
  const accept = (p: Problem, on: boolean) => save({ check: [{ key: p.key, on }] }, p.key);
  const confirmUnits = (list: { i: number; units: number }[]) => {
    if (!review) return;
    return save({ units: list.map(({ i, units: n }) => ({ upc: review.lines[i].line.upc, unitsPerCase: n, description: review.lines[i].line.description })) }, 'units')
      .then((ok) => { if (ok) setUnits({}); });
  };

  async function download() {
    if (!review?.fileName) return;
    setBusy('download');
    try {
      const r = await pdiInvoicesApi.file(id);
      const url = URL.createObjectURL(r.data as Blob);
      const a = document.createElement('a');
      a.href = url; a.download = review.fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success(`${review.fileName} downloaded. Import it into PDI for ${inv?.store.name}.`);
      q.refetch(); qc.invalidateQueries({ queryKey: ['pdi-invoices'] });
    } catch (e: any) {
      let msg = 'The file could not be made. Try again.';
      try { msg = JSON.parse(await (e?.response?.data as Blob).text()).error ?? msg; } catch { /* not JSON */ }
      toast.error(msg);
    } finally { setBusy(null); }
  }
  async function reread() {
    setAsking(null); setBusy('reread');
    try { await pdiInvoicesApi.read(id); setPaper(null); await q.refetch(); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? 'It could not be read again. Try in a minute.'); }
    finally { setBusy(null); }
  }
  async function remove() {
    setAsking(null); setBusy('delete');
    try { await pdiInvoicesApi.remove(id); qc.invalidateQueries({ queryKey: ['pdi-invoices'] }); toast.success('Deleted.'); navigate('/pdi-invoices'); }
    catch (e: any) { toast.error(e?.response?.data?.error ?? 'It could not be deleted.'); setBusy(null); }
  }

  if (q.isError) return <Page><ErrorState onRetry={() => q.refetch()} /></Page>;
  if (!inv) return <Page><div style={s.center}><Loader2 style={{ animation: 'spin 0.8s linear infinite' }} /> Loading...</div></Page>;

  const vendor = inv.vendor;
  const caseVendor = vendor?.sellsBy === 'CASE';   // units per case is confirmed per product for these (unless the invoice prints them)
  const vendorName = vendor?.name ?? inv.vendorRead ?? 'Vendor';
  const title = `${vendorName}${review?.header.invoiceNumber ? ` invoice ${review.header.invoiceNumber}` : ' invoice'}`;
  const totalsMatch = review && review.header.totalCents === review.linesTotalCents;
  const guesses = review ? review.lines.map((l, i) => ({ l, i })).filter(({ l }) => l.unitsFrom === 'guess') : [];
  // the columns this invoice prints
  const showPackage = !!shown?.lines.some((l) => l.group);
  const showItem = vendor ? vendor.itemDigits !== 'NONE' : !!shown?.lines.some((l) => l.item);
  const showUnits = !!shown?.lines.some((l) => l.units != null);
  const showReturn = vendor?.sellsBy === 'EACH' || !!shown?.lines.some((l) => l.isReturn);   // a vendor that counts items has a returns section
  const cols = 7 + (showPackage ? 1 : 0) + (showItem ? 1 : 0) + (showUnits ? 1 : 0) + (showReturn ? 1 : 0);   // for the line's problems, the width of the table
  const rows = review && shown ? review.lines.map((l, i) => ({ l, p: shown.lines[i], i })).filter(({ i }) => !onlyOpen || openLines.includes(i)) : [];

  return (
    <Page>
      <Link to="/pdi-invoices" style={s.back}><ArrowLeft size={14} /> Invoices to PDI</Link>
      <PageHeader
        title={title}
        icon={ReceiptText}
        description={`${inv.store.name} · added ${storeDayTime(inv.createdAt)}${inv.createdBy ? ` by ${inv.createdBy}` : ''}`}
        actions={<>
          <Badge tone={STATUS[inv.status]?.tone ?? 'neutral'}>{STATUS[inv.status]?.label ?? inv.status}</Badge>
          {review && (
            <Button variant="primary" icon={<Download />} onClick={download} disabled={!review.canDownload || !!paper || !!busy}
              title={paper ? 'Save your corrections first' : review.canDownload ? `Download ${review.fileName}` : `${review.open} still to look at`}>
              {busy === 'download' ? 'Making the file...' : review.canDownload ? 'Download for PDI' : `${review.open} to look at`}
            </Button>
          )}
          <MenuButton label="More" ariaLabel="More actions" icon={<MoreHorizontal />} items={[
            { label: 'Read the photos again', icon: <RefreshCw />, onClick: () => setAsking('reread'), disabled: inv.status === 'READING' || !!busy },
            { label: 'Delete this invoice', icon: <Trash2 />, danger: true, onClick: () => setAsking('delete'), disabled: !!busy || (!hq && inv.status === 'DONE') },
          ]} />
        </>}
      />

      {inv.status === 'READING' && (
        <Card style={{ marginBottom: 16 }}><div style={s.center}><Loader2 style={{ animation: 'spin 0.8s linear infinite' }} /> Reading {inv.photos.length} photo{inv.photos.length === 1 ? '' : 's'}... a long invoice takes a minute or two. This page updates by itself.</div></Card>
      )}
      {inv.status === 'FAILED' && (
        <Notice tone="danger" style={{ marginBottom: 16 }}>{inv.readError ?? 'It could not be read.'} <button type="button" style={s.inlineBtn} onClick={reread} disabled={!!busy}>Read it again</button></Notice>
      )}
      {inv.duplicates.length > 0 && (
        <Notice tone="warning" style={{ marginBottom: 16 }}>
          This invoice number from {vendorName} was done before: {inv.duplicates.map((d, i) => (
            <span key={d.id}>{i > 0 && ', '}<Link to={`/pdi-invoices/${d.id}`} style={s.link}>{d.storeName}, {storeDayTime(d.createdAt)} ({STATUS[d.status]?.label ?? d.status})</Link></span>
          ))}. Make sure it is not imported into PDI twice.
        </Notice>
      )}
      {inv.status === 'DONE' && inv.downloadedAt && (
        <Notice tone="success" style={{ marginBottom: 16 }}>The file was downloaded {storeDayTime(inv.downloadedAt)}{inv.downloadedBy ? ` by ${inv.downloadedBy}` : ''}. Import it into PDI for {inv.store.name} if that is not done yet.</Notice>
      )}
      {review && <VendorBar inv={inv} hq={hq} onChanged={(data) => qc.setQueryData(['pdi-invoice', id], data)} />}
      {!!inv.readUsage?.unreadable?.length && (
        <Notice tone="info" style={{ marginBottom: 16 }}>The reader could not make out: {inv.readUsage.unreadable.join('; ')}</Notice>
      )}

      <div style={s.layout}>
        <Card padding={12} style={s.photos}>
          <div style={s.photosTitle}>Photos</div>
          {inv.photos.map((p, i) => (
            <button key={p.thumbUrl} type="button" style={s.thumb} onClick={() => setPhoto(i)} aria-label={`Open photo ${i + 1}`}>
              <img src={p.thumbUrl} alt={`Photo ${i + 1}`} style={s.thumbImg} />
              <span style={s.thumbNo}>{i + 1}</span>
            </button>
          ))}
        </Card>

        <div style={{ minWidth: 0, flex: 1 }}>
          {review && shown && (
            <>
              <div style={s.tiles}>
                <StatTile label="Lines" value={review.lines.length} />
                <StatTile label="Lines come to" value={dollars(review.linesTotalCents)} hint={totalsMatch ? 'the same as the total' : 'not the printed total'} />
                <StatTile label="Invoice total" value={dollars(review.header.totalCents)} />
                <StatTile label="To look at" value={review.open} hint={review.open ? 'marked below' : 'nothing left'} />
              </div>

              <Card padding={16} style={{ marginBottom: 16 }}>
                <div style={s.headerRow}>
                  <label style={s.hField}>Invoice number<input style={s.input} value={shown.invoiceNumber ?? ''} onChange={(e) => editHeader({ invoiceNumber: e.target.value })} /></label>
                  <label style={s.hField}>Invoice date<input style={s.input} type="date" value={shown.date ?? ''} onChange={(e) => editHeader({ date: e.target.value })} /></label>
                  <label style={s.hField}>Total as printed<input style={s.input} value={shown.total ?? ''} onChange={(e) => editHeader({ total: e.target.value })} /></label>
                </div>
                {review.problems.length > 0 && (
                  <ul style={s.problemList}>
                    {review.problems.map((p) => <ProblemItem key={p.key} p={p} busy={busy === p.key} onAccept={accept} />)}
                  </ul>
                )}
              </Card>

              {paper && (
                <div style={s.saveBar} role="status">
                  You have corrections that are not saved yet; the checks update when they are saved.
                  <Button variant="primary" icon={<Save />} onClick={saveCorrections} disabled={busy === 'save'}>{busy === 'save' ? 'Saving...' : 'Save corrections'}</Button>
                  <Button onClick={() => setPaper(null)} disabled={busy === 'save'}>Undo</Button>
                </div>
              )}

              <div style={s.tableTools}>
                <label style={s.toggle}><input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only lines to look at ({openLines.length})</label>
                {caseVendor && guesses.length > 0 && (
                  <Button size="sm" onClick={() => confirmUnits(guesses.map(({ l, i }) => ({ i, units: l.line.unitsPerCase })))} disabled={busy === 'units'}>
                    Confirm the {guesses.length} guessed units per case as shown
                  </Button>
                )}
              </div>

              <Card padding={0}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={s.table}>
                    <thead>
                      <tr>
                        <th style={s.th}>#</th>
                        {showPackage && <th style={s.th}>Package</th>}
                        <th style={s.th}>UPC</th>
                        <th style={s.th}>Description</th>
                        {showItem && <th style={s.th}>Item</th>}
                        <th style={s.th}>{vendor?.sellsBy === 'EACH' ? 'Qty' : caseVendor ? 'Cases' : 'Qty'}</th>
                        {showUnits && <th style={s.th}>Units</th>}
                        <th style={s.th}>Price</th>
                        <th style={s.th}>Amount</th>
                        {showReturn && <th style={s.th}>Return</th>}
                        <th style={{ ...s.th, minWidth: 170 }}>Units per case</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.length === 0 && (
                        <tr><td colSpan={cols} style={s.allClear}><CheckCircle2 size={16} /> Nothing left to look at. Untick the box above to see every line.</td></tr>
                      )}
                      {rows.map(({ l, p, i }) => {
                        const open = l.problems.some((x) => !x.checked);
                        const bad = (f: string) => l.problems.some((x) => x.field === f && !x.checked);
                        const cell = (f: string) => ({ ...s.input, ...(bad(f) ? s.inputBad : {}) });
                        return (
                          <Fragment key={i}>
                          <tr style={open ? s.rowOpen : undefined}>
                            <td style={s.tdNo}>{i + 1}</td>
                            {showPackage && <td style={s.tdSmall}>{p.group ?? ''}</td>}
                            <td style={s.td}><input aria-label={`Line ${i + 1} UPC`} style={{ ...cell('upc'), width: 138 }} value={p.upc ?? ''} onChange={(e) => editLine(i, { upc: e.target.value })} /></td>
                            <td style={s.td}><input aria-label={`Line ${i + 1} description`} style={{ ...cell('description'), width: 170 }} value={p.description ?? ''} onChange={(e) => editLine(i, { description: e.target.value })} /></td>
                            {showItem && <td style={s.td}><input aria-label={`Line ${i + 1} item`} style={{ ...cell('item'), width: 84 }} value={p.item ?? ''} onChange={(e) => editLine(i, { item: e.target.value })} /></td>}
                            <td style={s.td}><input aria-label={`Line ${i + 1} quantity`} style={{ ...cell('quantity'), width: 58 }} inputMode="numeric" value={p.quantity ?? ''} onChange={(e) => editLine(i, { quantity: e.target.value === '' ? null : Number(e.target.value) })} /></td>
                            {showUnits && <td style={s.td}><input aria-label={`Line ${i + 1} units`} style={{ ...cell('units'), width: 58 }} inputMode="numeric" value={p.units ?? ''} onChange={(e) => editLine(i, { units: e.target.value === '' ? null : Number(e.target.value) })} /></td>}
                            <td style={s.td}><input aria-label={`Line ${i + 1} price`} style={{ ...cell('price'), width: 74 }} inputMode="decimal" value={p.price ?? ''} onChange={(e) => editLine(i, { price: e.target.value })} /></td>
                            <td style={s.td}><input aria-label={`Line ${i + 1} amount`} style={{ ...cell('amount'), width: 74 }} inputMode="decimal" value={p.amount ?? ''} onChange={(e) => editLine(i, { amount: e.target.value })} /></td>
                            {showReturn && <td style={{ ...s.td, textAlign: 'center' }}><input type="checkbox" aria-label={`Line ${i + 1} is a return`} checked={!!p.isReturn} onChange={(e) => editLine(i, { isReturn: e.target.checked })} /></td>}
                            <td style={s.td}>
                              {caseVendor && l.unitsFrom !== 'paper' ? (
                                <div style={s.unitsCell}>
                                  <input aria-label={`Line ${i + 1} units per case`} style={{ ...cell('units'), width: 54 }} inputMode="numeric"
                                    value={units[i] ?? (l.line.unitsPerCase || '')} onChange={(e) => setUnits((u) => ({ ...u, [i]: e.target.value }))} />
                                  {(units[i] !== undefined || l.unitsFrom === 'guess' || !l.unitsFrom) && (
                                    <Button size="sm" disabled={busy === 'units' || !(Number(units[i] ?? l.line.unitsPerCase) >= 1)}
                                      onClick={() => confirmUnits([{ i, units: Number(units[i] ?? l.line.unitsPerCase) }])}>Confirm</Button>
                                  )}
                                  {l.unitsFrom && units[i] === undefined && <span style={s.from}>{UNITS_FROM[l.unitsFrom] ?? l.unitsFrom}</span>}
                                </div>
                              ) : (
                                vendor ? <span>{l.line.unitsPerCase || 'Not set'} <span style={s.from}>{l.unitsFrom ? UNITS_FROM[l.unitsFrom] ?? l.unitsFrom : ''}</span></span>
                                  : <span style={s.from}>once the vendor is set</span>
                              )}
                            </td>
                          </tr>
                          {/* what to look at on this line, the width of the table, so it is never cut off on the right */}
                          {l.problems.length > 0 && (
                            <tr style={open ? s.rowOpen : undefined}>
                              <td style={s.tdBelow} />
                              <td colSpan={cols - 1} style={s.tdBelow}>
                                <ul style={s.lineProblems}>{l.problems.map((x) => (
                                  <ProblemItem key={x.key} p={x} busy={busy === x.key} onAccept={accept}
                                    // a beer's units per case is confirmed (and remembered for the next invoice), not just accepted for this one
                                    hint={caseVendor && x.field === 'units' && (l.unitsFrom === 'guess' || !l.unitsFrom) ? 'Confirm the units per case above' : undefined} />
                                ))}</ul>
                              </td>
                            </tr>
                          )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
              {inv.readUsage && (
                <p style={s.usage}>
                  Read by {inv.readModel ?? 'the reader'}: {inv.readUsage.inputTokens.toLocaleString()} tokens in, {inv.readUsage.outputTokens.toLocaleString()} out
                  {inv.readUsage.costCents != null ? `, about ${dollars(inv.readUsage.costCents)}` : ''}.
                  {inv.updatedBy ? ` Last changed by ${inv.updatedBy}.` : ''}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {photo !== null && inv.photos[photo] && (
        <Modal title={`Photo ${photo + 1} of ${inv.photos.length}`} onClose={() => setPhoto(null)} maxWidth={900}>
          <div style={s.bigPhotoBox}><img src={inv.photos[photo].url} alt={`Photo ${photo + 1}`} style={s.bigPhoto} /></div>
          <div style={s.modalActions}>
            <Button onClick={() => setPhoto(photo - 1)} disabled={photo === 0}>Previous</Button>
            <a href={inv.photos[photo].url} target="_blank" rel="noreferrer" style={s.link}>Open full size</a>
            <Button onClick={() => setPhoto(photo + 1)} disabled={photo === inv.photos.length - 1}>Next</Button>
          </div>
        </Modal>
      )}
      <ConfirmModal open={asking === 'reread'} title="Read the photos again?" confirmLabel="Read again"
        message="The photos are read again from the start. Corrections made on this page are replaced by the new reading; units per case you confirmed are kept."
        onConfirm={reread} onCancel={() => setAsking(null)} headingLevel="h2" />
      <ConfirmModal open={asking === 'delete'} title="Delete this invoice?" confirmLabel="Delete" danger
        message={inv.status === 'DONE' ? 'Its file was already downloaded for PDI. Deleting removes the photos and the lines here, not what is in PDI.' : 'The photos and the lines are removed.'}
        onConfirm={remove} onCancel={() => setAsking(null)} headingLevel="h2" />
    </Page>
  );
}

/** Which vendor the invoice is from: the one found by the name read off it (changeable), or, for a vendor seen for the first time, a choice
 *  among the vendors or a new one set up here; either way the printed name is remembered for the next invoice. */
function VendorBar({ inv, hq, onChanged }: { inv: Invoice; hq: boolean; onChanged: (data: Invoice) => void }) {
  const qc = useQueryClient();
  const vendorsQ = useVendors();
  const [pick, setPick] = useState('');
  const [mode, setMode] = useState<'change' | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const lines = inv.paper?.lines ?? [];
  const printed = [inv.vendorPrinted?.address, inv.vendorPrinted?.phone].filter(Boolean).join(' · ');
  const done = () => { qc.invalidateQueries({ queryKey: ['pdi-vendors'] }); qc.invalidateQueries({ queryKey: ['pdi-invoices'] }); setMode(null); setPick(''); };
  async function choose() {
    if (!pick) return;
    setBusy(true);
    try {
      const r = await pdiInvoicesApi.update(inv.id, { vendorId: pick });
      onChanged(r.data.data); done();
      toast.success('Vendor set. The name printed on this invoice is remembered for next time.');
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'It could not be saved.'); } finally { setBusy(false); }
  }
  async function create(input: PdiVendorInput) {
    setBusy(true);
    try {
      await pdiInvoicesApi.createVendor({ ...input, invoiceId: inv.id });
      const r = await pdiInvoicesApi.get(inv.id);
      onChanged(r.data.data); done();
      toast.success(`${input.name} added. Its next invoices are found by themselves.`);
    } catch (e: any) { toast.error(e?.response?.data?.error ?? 'It could not be saved.'); } finally { setBusy(false); }
  }
  const picker = (
    <div style={s.vendorPick}>
      <select aria-label="Vendor" style={{ ...s.input, width: 'auto', minWidth: 'min(240px, 100%)' }} value={pick} onChange={(e) => setPick(e.target.value)}>
        <option value="">Choose a vendor</option>
        {vendorsQ.data?.filter((v) => v.id !== inv.vendor?.id).map((v) => <option key={v.id} value={v.id}>{v.name}{v.pdiCode ? ` (${v.pdiCode})` : ''}</option>)}
      </select>
      <Button size="sm" variant="primary" onClick={choose} disabled={!pick || busy}>Use this vendor</Button>
    </div>
  );
  return (
    <>
      {inv.vendor ? (
        <Card padding={12} style={{ marginBottom: 16 }}>
          <div style={s.vendorRow}>
            <span>Vendor: <strong>{inv.vendor.name}</strong></span>
            <span>Code in PDI: {inv.vendor.pdiCode ? <strong>{inv.vendor.pdiCode}</strong> : <Badge tone="warning">Not set</Badge>}</span>
            <span>Quantities: {SELLS_BY[inv.vendor.sellsBy] ?? inv.vendor.sellsBy}</span>
            {inv.vendorRead && inv.vendorRead !== inv.vendor.name && <span style={{ color: TEXT_MUTED }}>Printed as "{inv.vendorRead}"</span>}
            <Button size="sm" variant="ghost" onClick={() => setMode(mode === 'change' ? null : 'change')}>{mode === 'change' ? 'Cancel' : 'Not this vendor?'}</Button>
          </div>
          {mode === 'change' && <div style={{ marginTop: 10 }}>{picker}</div>}
          {!inv.vendor.pdiCode && <div style={{ ...s.usage, marginTop: 8 }}>{hq ? 'Set its code in PDI on the Vendors tab.' : 'HQ can set its code in PDI.'}</div>}
        </Card>
      ) : (
        <Card padding={16} style={{ marginBottom: 16, borderColor: C.warning, background: C.warningTint }}>
          <div style={{ fontWeight: 700, color: C.text, marginBottom: 4 }}>Which vendor is this invoice from?</div>
          <div style={{ fontSize: FONT.small, color: C.text2, marginBottom: 10 }}>
            Read as <strong>{inv.vendorRead ?? 'no name'}</strong>{printed ? ` · ${printed}` : ''}. No vendor has this name yet: choose it if it is one of yours,
            or add it once. The name is remembered, so its next invoices are found by themselves.
          </div>
          {picker}
          <div style={{ marginTop: 10 }}><Button size="sm" onClick={() => setMode('new')} disabled={busy}>Add it as a new vendor</Button></div>
        </Card>
      )}
      {mode === 'new' && (
        <VendorForm title="Add a vendor" hq={hq} busy={busy} onClose={() => setMode(null)} onSave={create}
          suggest={{ name: inv.vendorRead ?? '', sellsBy: 'CASE', itemDigits: lines.some((l) => l.item) ? 'FIRST6' : 'NONE' }} />
      )}
    </>
  );
}

function ProblemItem({ p, busy, onAccept, hint }: { p: Problem; busy: boolean; onAccept: (p: Problem, on: boolean) => void; hint?: string }) {
  return (
    <li style={{ ...s.problem, ...(p.checked ? s.problemDone : {}) }}>
      <span style={{ flex: '1 1 260px', minWidth: 0 }}>{p.message}</span>
      {hint ? <span style={s.mustFix}>{hint}</span> : p.canCheck ? (
        <label style={s.acceptLabel}><input type="checkbox" checked={p.checked} disabled={busy} onChange={(e) => onAccept(p, e.target.checked)} /> Looked at: it is right</label>
      ) : <span style={s.mustFix}>Correct this to continue</span>}
    </li>
  );
}

const s: Record<string, React.CSSProperties> = {
  back: { display: 'inline-flex', alignItems: 'center', gap: 6, color: C.primary, fontSize: FONT.small, fontWeight: 600, textDecoration: 'none', marginBottom: 8 },
  center: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24, color: TEXT_MUTED },
  inlineBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 700, color: 'inherit', textDecoration: 'underline', cursor: 'pointer' },
  link: { color: C.primary, fontWeight: 600 },
  layout: { display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' },
  vendorRow: { display: 'flex', alignItems: 'center', gap: '6px 18px', flexWrap: 'wrap', fontSize: FONT.small, color: C.text2 },
  vendorPick: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  photos: { width: 112, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, position: 'sticky', top: 12 },
  photosTitle: { fontSize: FONT.small, fontWeight: 700, color: TEXT_MUTED },
  thumb: { position: 'relative', border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 0, background: C.subtle, cursor: 'zoom-in', overflow: 'hidden', aspectRatio: '3 / 4' },
  thumbImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  thumbNo: { position: 'absolute', top: 4, left: 4, background: C.primary, color: '#fff', borderRadius: 999, fontSize: 11, fontWeight: 700, minWidth: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 },
  headerRow: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  hField: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: FONT.small, fontWeight: 600, color: C.text2, flex: '1 1 160px' },
  input: { padding: '6px 8px', borderRadius: RADIUS.sm, border: `1px solid ${C.borderStrong}`, fontSize: FONT.small, fontFamily: 'inherit', background: C.surface, boxSizing: 'border-box', width: '100%' },
  inputBad: { borderColor: C.warning, background: C.warningTint },
  saveBar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '10px 14px', marginBottom: 12, borderRadius: RADIUS.md, background: C.primaryTint, color: C.text, fontSize: FONT.small, position: 'sticky', top: 0, zIndex: 2 },
  tableTools: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  toggle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.small, fontWeight: 600, color: C.text2, cursor: 'pointer' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: FONT.small },
  th: { textAlign: 'left', padding: '8px 8px', fontSize: FONT.caption, color: TEXT_MUTED, fontWeight: 600, background: C.subtle, whiteSpace: 'nowrap', position: 'sticky', top: 0 },
  td: { padding: '6px 8px', borderTop: `1px solid ${C.border}`, verticalAlign: 'top' },
  tdBelow: { padding: '0 8px 10px', verticalAlign: 'top' },
  lineProblems: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 18px' },
  tdNo: { padding: '10px 8px', borderTop: `1px solid ${C.border}`, color: TEXT_MUTED, verticalAlign: 'top' },
  tdSmall: { padding: '10px 8px', borderTop: `1px solid ${C.border}`, color: TEXT_MUTED, fontSize: FONT.caption, verticalAlign: 'top', whiteSpace: 'nowrap' },
  rowOpen: { background: C.warningTint },
  unitsCell: { display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' },
  from: { fontSize: FONT.caption, color: TEXT_MUTED },
  allClear: { padding: 24, textAlign: 'center', color: C.success, fontWeight: 600 },
  problemList: { listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 },
  problem: { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '4px 12px', fontSize: FONT.small, color: C.warning, lineHeight: 1.35 },
  problemDone: { color: TEXT_MUTED, textDecoration: 'line-through' },
  acceptLabel: { display: 'flex', alignItems: 'center', gap: 6, fontSize: FONT.caption, color: C.text2, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' },
  mustFix: { fontSize: FONT.caption, color: C.danger, fontWeight: 600 },
  usage: { fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 10 },
  bigPhotoBox: { maxHeight: '70vh', overflow: 'auto', borderRadius: RADIUS.md, border: `1px solid ${C.border}` },
  bigPhoto: { width: '100%', display: 'block' },
  modalActions: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12 },
};
