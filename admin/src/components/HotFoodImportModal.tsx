// Hot Food > Catalog > Import items (HQ, 2026-10-11): add many menu items at once from a filled-in sheet. Download the sheet (the
// Krispy Krunchy items already written, prices to fill in), load it back, check what will be added and what is skipped and why, pick
// the stores, add. Each item goes through the same steps as Add Item (create, then put it on each store). It only adds: an item
// already in the catalog is left as it is, and nothing is changed or deleted.
import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Download, Upload, CheckCircle2, MinusCircle } from 'lucide-react';
import Modal from './Modal';
import { Button, Notice } from './kit';
import { hotFoodCatalogApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, RADIUS } from '../lib/theme';
import { sheetCsv, readSheet, type Verdict } from '../lib/hotFoodSheet';

interface Store { id: string; name: string; hotFoodEnabled?: boolean }

export default function HotFoodImportModal({ stores, existingNames, onClose }: { stores: Store[]; existingNames: string[]; onClose: () => void }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [verdicts, setVerdicts] = useState<Verdict[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [picked, setPicked] = useState<Set<string>>(() => new Set(stores.filter((s) => s.hotFoodEnabled !== false).map((s) => s.id)));
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ added: string[]; failed: { name: string; why: string }[] } | null>(null);

  const adds = (verdicts ?? []).filter((v): v is Extract<Verdict, { kind: 'add' }> => v.kind === 'add');
  const skips = (verdicts ?? []).filter((v): v is Extract<Verdict, { kind: 'skip' }> => v.kind === 'skip');

  function download() {
    const blob = new Blob([sheetCsv()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'Lucky Stop hot food items.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function load(file: File | undefined) {
    if (!file) return;
    setResult(null); setProgress(null);
    if (!/\.csv$/i.test(file.name)) { setVerdicts(null); setProblem('Choose the .csv file (in Excel: File > Save As > CSV UTF-8).'); return; }
    const r = readSheet(await file.text(), existingNames);
    setFileName(file.name); setVerdicts(r.verdicts); setProblem(r.problem);
  }

  async function run() {
    setRunning(true);
    const added: string[] = []; const failed: { name: string; why: string }[] = [];
    const storeIds = [...picked];
    setProgress({ done: 0, total: adds.length });
    for (const [i, v] of adds.entries()) {
      try {
        const fd = new FormData();
        fd.append('name', v.name);
        if (v.description) fd.append('description', v.description);
        fd.append('price', String(v.price));
        if (v.minutes) fd.append('estimatedMinutes', String(v.minutes));
        const res = await hotFoodCatalogApi.create(fd);
        const id = res.data?.data?.id as string;
        for (const sid of storeIds) await hotFoodCatalogApi.assignToStore(id, sid);
        added.push(v.name);
      } catch (e) {
        failed.push({ name: v.name, why: serverMessage(e, 'It could not be added.') });
      }
      setProgress({ done: i + 1, total: adds.length });
    }
    setRunning(false);
    setResult({ added, failed });
    qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
    if (added.length) toast.success(`${added.length} item${added.length === 1 ? '' : 's'} added${storeIds.length ? ` to ${storeIds.length} store${storeIds.length === 1 ? '' : 's'}` : ''}.`);
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Modal title="Import items" subtitle="Add many hot food items at once" onClose={onClose} busy={running} maxWidth={720}>
      {result ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Notice tone={result.failed.length ? 'warning' : 'success'} icon={<CheckCircle2 size={16} />}>
            {result.added.length} item{result.added.length === 1 ? '' : 's'} added{picked.size ? `, each on ${picked.size} store${picked.size === 1 ? '' : 's'}` : ' (not on any store yet)'}.
            {result.failed.length > 0 && ` ${result.failed.length} could not be added; the rest are in.`}
          </Notice>
          {result.failed.length > 0 && (
            <ul style={{ margin: 0, paddingLeft: 18, fontSize: FONT.small, color: C.text2 }}>
              {result.failed.map((f) => <li key={f.name}><strong>{f.name}</strong>: {f.why}</li>)}
            </ul>
          )}
          <p style={{ margin: 0, fontSize: FONT.small, color: C.muted }}>Add a picture to each item from its card (Edit), and change anything there.</p>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Button variant="primary" onClick={onClose}>Done</Button></div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: FONT.body, color: C.text2, lineHeight: 1.7 }}>
            <li>Download the sheet. The Krispy Krunchy items are already written in; open it in Excel.</li>
            <li>Type each price. Put N under Sell for anything your stores do not sell. Add rows for other items if you like.</li>
            <li>Save it as CSV (File, Save As, CSV UTF-8) and load it here. You see every item before anything is added.</li>
          </ol>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button icon={<Download />} onClick={download}>Download the sheet</Button>
            <Button variant="primary" icon={<Upload />} onClick={() => fileRef.current?.click()} disabled={running}>Load the filled-in sheet</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" aria-label="Hot food items sheet (CSV)" style={{ display: 'none' }}
              onChange={(e) => { load(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
          {problem && <Notice tone="warning">{problem}</Notice>}

          {verdicts && verdicts.length > 0 && (
            <>
              <div style={{ fontSize: FONT.small, color: C.muted }}>{fileName}: {adds.length} to add, {skips.length} skipped.</div>
              <div style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, maxHeight: 300, overflowY: 'auto' }} data-testid="import-preview">
                {verdicts.map((v, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 12px', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: FONT.body, opacity: v.kind === 'skip' ? 0.7 : 1 }}>
                    {v.kind === 'add' ? <CheckCircle2 size={16} color={C.success} aria-label="Will be added" /> : <MinusCircle size={16} color={C.muted} aria-label="Skipped" />}
                    <span style={{ flex: 1, minWidth: 0, color: C.text, fontWeight: v.kind === 'add' ? 600 : 400 }}>{v.name}</span>
                    {v.kind === 'add'
                      ? <span style={{ color: C.text2, whiteSpace: 'nowrap' }}>${v.price.toFixed(2)}{v.minutes ? ` · ${v.minutes} min` : ''}</span>
                      : <span style={{ color: C.muted, fontSize: FONT.small, textAlign: 'right' }}>{v.why}</span>}
                  </div>
                ))}
              </div>

              <fieldset style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '10px 12px', margin: 0 }}>
                <legend style={{ fontSize: FONT.small, fontWeight: 600, color: C.text2, padding: '0 4px' }}>Put the new items on these stores</legend>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(stores.map((s) => s.id)))}>All stores</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>None</Button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 6 }}>
                  {stores.map((s) => (
                    <label key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.body, color: C.text, cursor: 'pointer' }}>
                      <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
                      {s.name}{s.hotFoodEnabled === false && <span style={{ color: C.muted, fontSize: FONT.caption }}>(hot food off)</span>}
                    </label>
                  ))}
                </div>
              </fieldset>

              {progress && running && <div role="status" style={{ fontSize: FONT.small, color: C.text2 }}>Adding {progress.done} of {progress.total}…</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button onClick={onClose} disabled={running}>Cancel</Button>
                <Button variant="primary" onClick={run} disabled={running || adds.length === 0}>
                  {running ? 'Adding…' : `Add ${adds.length} item${adds.length === 1 ? '' : 's'}${picked.size ? ` to ${picked.size} store${picked.size === 1 ? '' : 's'}` : ''}`}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
