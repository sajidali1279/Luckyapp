import { useEffect, useState, CSSProperties } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { storesApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

// A store's label printer fine-tune for US Letter (Avery 5160) sheets: how far that store's printer places the page off, in mm.
// HQ only sets it. Staff print from their own phones, and every phone printing for the store uses these numbers. Someone at the
// store measures it with the test page in the app (Labels, Paper) and tells HQ, for example "the boxes are 1.5 mm too high".

const LIMITS = { down: [-10, 10], right: [-4.5, 4.5] } as const;
type Nudge = { down: number; right: number };

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
}

export default function LabelPrinterModal({ store, onClose }: { store: { id: string; name: string }; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<Nudge>({ down: 0, right: 0 });
  const [by, setBy] = useState<{ name: string | null; at: string | null }>({ name: null, at: null });
  const [text, setText] = useState({ down: '0', right: '0' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const r = await storesApi.getLabelPrinter(store.id);
      const d = r.data.data;
      setSaved({ down: d.down, right: d.right });
      setText({ down: String(d.down), right: String(d.right) });
      setBy({ name: d.updatedBy, at: d.updatedAt });
    } catch (err) {
      setLoadError(failureMessage(err, 'Could not load the printer setting.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [store.id]);

  const num = (k: keyof Nudge) => parseFloat(text[k].replace(',', '.'));
  const changed = num('down') !== saved.down || num('right') !== saved.right;

  async function save() {
    if (saving) return;
    setError('');
    for (const k of ['down', 'right'] as (keyof Nudge)[]) {
      const v = num(k);
      const name = k === 'down' ? 'Move down' : 'Move right';
      if (!Number.isFinite(v)) { setError(`${name}: type a number of millimetres (0 for no move).`); return; }
      if (v < LIMITS[k][0] || v > LIMITS[k][1]) { setError(`${name} can be from ${LIMITS[k][0]} to ${LIMITS[k][1]} mm.`); return; }
    }
    setSaving(true);
    try {
      const r = await storesApi.setLabelPrinter(store.id, { down: num('down'), right: num('right') });
      const d = r.data.data;
      setSaved({ down: d.down, right: d.right });
      setText({ down: String(d.down), right: String(d.right) });
      setBy({ name: d.updatedBy, at: d.updatedAt });
      toast.success(`Saved for ${store.name}. Every phone printing there uses it from the next print.`);
      onClose();
    } catch (err) {
      setError(failureMessage(err, 'Could not save. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  }

  const field = (k: keyof Nudge, label: string, help: string) => (
    <label style={p.field}>
      <span style={p.fieldName}>{label}</span>
      <span style={p.inputWrap}>
        <button type="button" style={p.step} aria-label={`${label}: 0.5 mm less`} onClick={() => { setError(''); setText(t => ({ ...t, [k]: String(Math.round(((parseFloat(t[k]) || 0) - 0.5) * 10) / 10) })); }}>−</button>
        <input style={p.input} inputMode="decimal" value={text[k]} aria-label={`${label} (mm)`} onChange={e => { setError(''); setText(t => ({ ...t, [k]: e.target.value })); }} />
        <button type="button" style={p.step} aria-label={`${label}: 0.5 mm more`} onClick={() => { setError(''); setText(t => ({ ...t, [k]: String(Math.round(((parseFloat(t[k]) || 0) + 0.5) * 10) / 10) })); }}>+</button>
        <em style={p.unit}>mm</em>
      </span>
      <small style={p.help}>{help}</small>
    </label>
  );

  return (
    <Modal title="Label printer" subtitle={`${store.name} · US Letter labels (Avery 5160)`} onClose={onClose} busy={saving} maxWidth={520}>
      {loading ? (
        <div style={{ padding: '20px 0', color: TEXT_MUTED, textAlign: 'center' }} role="status">Loading…</div>
      ) : loadError ? (
        <div role="alert" style={p.error}>{loadError} <button type="button" style={p.link} onClick={load}>Try again</button></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={p.note}>
            Most printers place the page a millimetre or two off. Someone at the store prints the test page in the app (Labels, Paper, Print a test page),
            holds it over a label sheet against a light, and tells you how far the boxes are from the stickers. Every phone printing for this store uses these numbers.
          </p>
          <div style={p.current}>
            {by.name ? <>Now: down {saved.down} mm, right {saved.right} mm · set by {by.name}{by.at ? `, ${when(by.at)}` : ''}</> : <>Not set yet (no move).</>}
          </div>
          <div style={p.fields}>
            {field('down', 'Move down', 'Boxes too high: a plus number. Too low: minus.')}
            {field('right', 'Move right', 'Boxes too far left: plus. Too far right: minus.')}
          </div>
          <p style={p.note}>After saving, ask the store to print the test page again to check before printing real labels.</p>
          {error && <div role="alert" style={p.error}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" style={p.link} onClick={() => { setError(''); setText({ down: '0', right: '0' }); }}>Back to 0 (no move)</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={p.cancel} onClick={onClose} disabled={saving}>Cancel</button>
              <button type="button" style={{ ...p.save, ...(!changed ? { opacity: 0.5, cursor: 'default' } : {}) }} onClick={save} disabled={saving || !changed}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

const p: Record<string, CSSProperties> = {
  note: { fontSize: 13, color: TEXT_MUTED, margin: 0, lineHeight: 1.5 },
  current: { padding: '10px 12px', borderRadius: 10, background: '#f1f3f6', fontWeight: 700, fontSize: 14, color: '#374151' },
  fields: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  fieldName: { fontWeight: 700, fontSize: 14, color: '#111827' },
  inputWrap: { display: 'flex', alignItems: 'center', gap: 6, border: '1.5px solid #d5dae1', borderRadius: 9, padding: '4px 6px', background: '#fff' },
  step: { width: 30, height: 30, borderRadius: 7, border: '1px solid #e4e7ec', background: '#f6f7f9', fontSize: 16, fontWeight: 700, color: '#374151', cursor: 'pointer', flexShrink: 0 },
  input: { width: '100%', minWidth: 0, border: 'none', outline: 'none', fontSize: 15, fontWeight: 600, textAlign: 'center', color: '#0f172a', background: 'transparent' },
  unit: { fontStyle: 'normal', color: TEXT_MUTED, fontSize: 12.5, paddingRight: 4 },
  help: { fontSize: 12, color: TEXT_MUTED, lineHeight: 1.4 },
  error: { background: '#fdf2f2', color: '#a51b28', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontWeight: 600 },
  link: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13.5 },
  cancel: { background: '#f1f3f6', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' },
  save: { background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
