// Labels > Import: an edited Labels export back into the catalog. The file is read here, the server says exactly what would change
// (the preview), and nothing changes until Apply. Rows match an item by barcode (with or without leading zeros), else by its exact name;
// unmatched rows are new items. Nothing is ever deleted by an import (backend labelCleanup.controller.ts).
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { FileUp } from 'lucide-react';
import Modal from './Modal';
import { Button, Badge, Notice } from './kit';
import { labelsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, RADIUS } from '../lib/theme';
import { parseLabelsCsv, ImportRow } from '../utils/labelsImport';

type Change = { from: string | null; to: string | null };
type Outcome =
  | { line: number; kind: 'update'; labelId: string; productName: string; changes: Record<string, Change> }
  | { line: number; kind: 'new'; productName: string; values: Record<string, string | null> }
  | { line: number; kind: 'same'; labelId: string; productName: string }
  | { line: number; kind: 'error'; productName: string; message: string };
type Preview = { summary: { update: number; new: number; same: number; error: number }; rows: Outcome[] };

const FIELD: Record<string, string> = { productName: 'Name', brand: 'Brand', category: 'Category', barcode: 'Barcode', priceText: 'Price', dealText: 'Deal' };
const show = (f: string, v: string | null) => (v == null ? 'none' : f === 'priceText' ? `$${v}` : v);

export default function LabelImportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [dealColumn, setDealColumn] = useState(true);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<'changes' | 'error' | 'all'>('changes');

  const check = useMutation({
    mutationFn: (p: { rows: ImportRow[]; deal: boolean }) => labelsApi.importRows(p.rows, false, p.deal),
    onSuccess: (res) => { setPreview(res.data?.data); setFilter(res.data?.data?.summary?.update || res.data?.data?.summary?.new ? 'changes' : 'all'); },
    onError: (err) => setProblem(serverMessage(err, 'Could not read the file.')),
  });
  const apply = useMutation({
    mutationFn: () => labelsApi.importRows(rows!, true, dealColumn),
    onSuccess: (res) => {
      const d = res.data?.data ?? {};
      toast.success(`Imported: ${d.updated ?? 0} changed, ${d.created ?? 0} new${d.reprint ? `; ${d.reprint} store ${d.reprint === 1 ? 'copy needs' : 'copies need'} reprinting` : ''}.`, { duration: 7000 });
      ['labels', 'store-labels', 'labels-coverage', 'labels-health-summary', 'label-duplicates'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
      onClose();
    },
    onError: (err) => toast.error(serverMessage(err, 'Could not import it. Nothing was changed.')),
  });

  async function pick(file: File | undefined) {
    if (!file) return;
    setFileName(file.name); setPreview(null); setProblem(null); setRows(null);
    if (!/\.csv$/i.test(file.name)) { setProblem('Choose the .csv file (in Excel: File > Save As > CSV UTF-8).'); return; }
    const parsed = parseLabelsCsv(await file.text());
    if (parsed.problem) { setProblem(parsed.problem); return; }
    setRows(parsed.rows); setDealColumn(parsed.dealColumn);
    check.mutate({ rows: parsed.rows, deal: parsed.dealColumn });
  }

  const shown = (preview?.rows ?? []).filter((o) => filter === 'all' || (filter === 'error' ? o.kind === 'error' : o.kind === 'update' || o.kind === 'new'));
  const busy = check.isPending || apply.isPending;
  const toApply = preview ? preview.summary.update + preview.summary.new : 0;

  return (
    <Modal title="Import labels" subtitle="Bring back an edited Labels export. You see every change before anything is saved." onClose={onClose} busy={apply.isPending} maxWidth={860}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <ol style={{ margin: 0, paddingLeft: 18, color: C.text2, fontSize: FONT.small, lineHeight: 1.6 }}>
          <li>Export the list, change names, prices, deals or categories in Excel, and add new items as new rows.</li>
          <li>Save it as CSV (CSV UTF-8) and choose it here. Rows are matched by barcode, or by the exact name when there is no barcode.</li>
          <li>Check the changes, then Apply. Nothing is deleted. An empty Deal cell ends that deal; an empty price leaves the price as it is.</li>
        </ol>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Labels file (CSV)" style={{ display: 'none' }} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
          <Button icon={<FileUp />} onClick={() => fileRef.current?.click()} disabled={busy}>{fileName ? 'Choose another file' : 'Choose the CSV file'}</Button>
          {fileName && <span style={{ fontSize: FONT.small, color: C.muted }}>{fileName}{rows ? `, ${rows.length} rows` : ''}</span>}
          {check.isPending && <span style={{ fontSize: FONT.small, color: C.muted }}>Checking…</span>}
        </div>
        {problem && <Notice tone="warning">{problem}</Notice>}
        {preview && (
          <>
            <div data-testid="import-summary" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Badge tone="info">{preview.summary.update} to change</Badge>
              <Badge tone="success">{preview.summary.new} new</Badge>
              <Badge>{preview.summary.same} unchanged</Badge>
              {preview.summary.error > 0 && <Badge tone="danger">{preview.summary.error} with a problem (skipped)</Badge>}
              {!dealColumn && <span style={{ fontSize: FONT.small, color: C.muted }}>No Deal column: deals are left as they are.</span>}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                {(['changes', 'error', 'all'] as const).map((f) => (
                  <button key={f} type="button" className="ui-chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                    {f === 'changes' ? 'Changes' : f === 'error' ? 'Problems' : 'All rows'}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, maxHeight: 360, overflow: 'auto' }}>
              {shown.length === 0 ? <div style={{ padding: 16, color: C.muted, fontSize: FONT.body }}>Nothing here.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.small }}>
                  <thead><tr style={{ background: C.subtle, textAlign: 'left' }}>
                    <th style={th}>Row</th><th style={th}>Item</th><th style={th}>What happens</th>
                  </tr></thead>
                  <tbody>
                    {shown.map((o) => (
                      <tr key={o.line} style={{ borderTop: `1px solid ${C.border}`, verticalAlign: 'top' }}>
                        <td style={{ ...td, color: C.muted, width: 48 }}>{o.line}</td>
                        <td style={{ ...td, fontWeight: 600, color: C.text }}>{o.productName}</td>
                        <td style={td}>
                          {o.kind === 'update' && Object.entries(o.changes).map(([f, c]) => (
                            <div key={f}>{FIELD[f] ?? f}: <span style={{ color: C.muted, textDecoration: 'line-through' }}>{show(f, c.from)}</span> to <strong>{show(f, c.to)}</strong></div>
                          ))}
                          {o.kind === 'new' && <div><Badge tone="success">New item</Badge> {Object.entries(o.values).filter(([, v]) => v).map(([f, v]) => `${FIELD[f]} ${show(f, v)}`).join(', ')}</div>}
                          {o.kind === 'same' && <span style={{ color: C.muted }}>No change</span>}
                          {o.kind === 'error' && <span style={{ color: C.danger }}>{o.message}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            {preview.summary.new > 0 && <Notice tone="neutral" style={{ fontSize: FONT.small }}>New items are added to the catalog only. Add them to stores on the Coverage tab (Push to All), or each store adds them.</Notice>}
          </>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <Button onClick={onClose} disabled={apply.isPending}>Cancel</Button>
          <Button variant="primary" disabled={!preview || toApply === 0 || busy} onClick={() => { if (!apply.isPending) apply.mutate(); }}>
            {apply.isPending ? 'Applying…' : toApply ? `Apply ${toApply} ${toApply === 1 ? 'change' : 'changes'}` : 'Nothing to apply'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const th: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, color: C.text2, position: 'sticky', top: 0, background: C.subtle };
const td: React.CSSProperties = { padding: '8px 10px', color: C.text2, lineHeight: 1.5 };
