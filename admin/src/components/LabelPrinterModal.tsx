import { useEffect, useRef, useState, CSSProperties } from 'react';
import toast from 'react-hot-toast';
import Modal from './Modal';
import { storesApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { loadSheet, resizeKeepingCentres, LetterLayout } from '../utils/labelSheet';

// A store's label printer fine-tune for US Letter (Avery 5160) sheets: how far that store's printer places the page off, in mm.
// HQ only sets it. Staff print from their own phones, and every phone printing for the store uses these numbers. Someone at the
// store measures it with the test page in the app (Labels, Paper) and tells HQ, for example "the boxes are 1.5 mm too high".

const LIMITS = { down: [-10, 10], right: [-10, 10], width: [55, 75], height: [20, 30], gapX: [0, 25], gapY: [0, 15], scale: [90, 110] } as const;
type Nudge = { down: number; right: number; width: number; height: number; gapX: number; gapY: number; scale: number };
const KEYS: (keyof Nudge)[] = ['down', 'right', 'gapY', 'gapX', 'height', 'width', 'scale'];
// The starting numbers (utils/labelSheet.ts LETTER_DEFAULTS): what prints right on Avery 5160 sheets on HQ's printer
const AVERY: Nudge = { down: 0, right: 1, width: 65, height: 25, gapX: 4.9, gapY: 0.6, scale: 100 };
const NAMES: Record<keyof Nudge, string> = { down: 'Move down', right: 'Move right', width: 'Label width', height: 'Label height', gapX: 'Space between columns', gapY: 'Space between rows', scale: 'Size %' };
const PAGE = { w: 215.9, h: 279.4 };
const stepOf = (k: keyof Nudge) => (k === 'down' || k === 'right' || k === 'scale' ? 0.5 : 0.1);
const toText = (n: Nudge) => Object.fromEntries(KEYS.map(k => [k, String(n[k])])) as Record<keyof Nudge, string>;
const pick = (d: any): Nudge => ({ down: d.down, right: d.right, width: d.width, height: d.height, gapX: d.gapX, gapY: d.gapY, scale: d.scale ?? 100 });
const toLayout = (n: Nudge): LetterLayout => ({ down: n.down, right: n.right, labelW: n.width, labelH: n.height, gapX: n.gapX, gapY: n.gapY, scale: n.scale });
const fromLayout = (l: LetterLayout): Nudge => ({ down: l.down, right: l.right, width: l.labelW, height: l.labelH, gapX: l.gapX, gapY: l.gapY, scale: l.scale });

function when(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
}

export default function LabelPrinterModal({ store, onClose }: { store: { id: string; name: string }; onClose: () => void }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState<Nudge>(AVERY);
  const [by, setBy] = useState<{ name: string | null; at: string | null }>({ name: null, at: null });
  const [text, setText] = useState<Record<keyof Nudge, string>>(toText(AVERY));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  // The same numbers for every open store (what works on HQ's printer, for every store's phones)
  const [allStores, setAllStores] = useState(false);
  // What this computer's print page is set to (Labels, Print, Fine-tune for your printer), so it can be copied here without retyping
  const here = loadSheet().letter;
  const hereNudge: Nudge = { down: here.down, right: here.right, width: here.labelW, height: here.labelH, gapX: here.gapX, gapY: here.gapY, scale: here.scale };
  const hereIsDefault = KEYS.every(k => hereNudge[k] === AVERY[k]);

  async function load() {
    setLoading(true);
    setLoadError('');
    try {
      const r = await storesApi.getLabelPrinter(store.id);
      const d = r.data.data;
      setSaved(pick(d));
      setText(toText(pick(d)));
      setBy({ name: d.updatedBy, at: d.updatedAt });
    } catch (err) {
      setLoadError(failureMessage(err, 'Could not load the printer setting.'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [store.id]);

  const num = (k: keyof Nudge) => parseFloat(text[k].replace(',', '.'));
  // The numbers as typed, when every box holds a number
  const parsed = (t: Record<keyof Nudge, string>): Nudge | null => {
    const n = Object.fromEntries(KEYS.map(k => [k, parseFloat(t[k].replace(',', '.'))])) as Nudge;
    return KEYS.every(k => Number.isFinite(n[k])) ? n : null;
  };
  // A label width or height keeps each label centred on its sticker: the space between them and the page position follow. Measured
  // from the numbers when the box was entered, so typing 6 then 60 ends in the right place.
  const resizeBase = useRef<Nudge | null>(null);
  function setSize(k: 'width' | 'height', value: string, base: Nudge | null) {
    const v = parseFloat(value.replace(',', '.'));
    if (!base || !Number.isFinite(v)) { setText(t => ({ ...t, [k]: value })); return; }
    const next = fromLayout(resizeKeepingCentres(toLayout(base), k === 'width' ? 'labelW' : 'labelH', v));
    setText(t => ({ ...t, [k]: value, gapX: String(next.gapX), gapY: String(next.gapY), right: String(next.right), down: String(next.down) }));
  }
  const changed = KEYS.some(k => num(k) !== saved[k]);
  const canSave = changed || allStores;

  async function save() {
    if (saving) return;
    setError('');
    for (const k of KEYS) {
      const v = num(k);
      const name = NAMES[k];
      const unit = k === 'scale' ? '%' : 'mm';
      if (!Number.isFinite(v)) { setError(k === 'scale' ? 'Size %: type a percentage (100 for as set).' : `${name}: type a number of millimetres (0 for no move).`); return; }
      if (v < LIMITS[k][0] || v > LIMITS[k][1]) { setError(`${name} can be from ${LIMITS[k][0]} to ${LIMITS[k][1]} ${unit}.`); return; }
    }
    setSaving(true);
    try {
      const next = Object.fromEntries(KEYS.map(k => [k, num(k)])) as Nudge;
      // 3 labels across and 10 down must still fit on the page (the server checks this too)
      // The size % grows or shrinks the sheet around the middle of the page (as the page draws it): every edge must stay on the paper
      const k = next.scale / 100, cx = PAGE.w / 2, cy = PAGE.h / 2;
      const x0 = 4.7625 + next.right, x1 = x0 + 3 * next.width + 2 * next.gapX, y0 = 12.7 + next.down, y1 = y0 + 10 * next.height + 9 * next.gapY;
      const left = cx + (x0 - cx) * k, right = cx + (x1 - cx) * k, top = cy + (y0 - cy) * k, bottom = cy + (y1 - cy) * k;
      const mm = (n: number) => Math.round(n * 10) / 10;
      const off = right > PAGE.w + 0.05 ? `The labels would run ${mm(right - PAGE.w)} mm past the right edge of the page. Make them narrower, the space between columns smaller, the size % smaller, or move them left.`
        : bottom > PAGE.h + 0.05 ? `The labels would run ${mm(bottom - PAGE.h)} mm past the bottom of the page. Make them shorter, the space between rows smaller, the size % smaller, or move them up.`
        : left < -0.05 ? `The labels would run ${mm(-left)} mm past the left edge of the page. Move them right, or make the size % smaller.`
        : top < -0.05 ? `The labels would run ${mm(-top)} mm past the top of the page. Move them down, or make the size % smaller.` : '';
      if (off) { setError(off); return; }
      if (allStores) {
        const r = await storesApi.setLabelPrinterAllStores(next);
        toast.success(`Saved for all ${r.data.data.stores} open stores. Every phone uses it from the next print. A store can still be set on its own.`, { duration: 6000 });
      } else {
        const r = await storesApi.setLabelPrinter(store.id, next);
        const d = r.data.data;
        setSaved(pick(d));
        setText(toText(pick(d)));
        setBy({ name: d.updatedBy, at: d.updatedAt });
        toast.success(`Saved for ${store.name}. Every phone printing there uses it from the next print.`);
      }
      onClose();
    } catch (err) {
      setError(failureMessage(err, 'Could not save. Nothing was changed.'));
    } finally {
      setSaving(false);
    }
  }

  const sized = (k: keyof Nudge): k is 'width' | 'height' => k === 'width' || k === 'height';
  const stepTo = (k: keyof Nudge, by: number) => {
    setError('');
    const v = String(Math.round(((parseFloat(text[k]) || 0) + by) * 1000) / 1000);
    if (sized(k)) setSize(k, v, parsed(text));
    else setText(t => ({ ...t, [k]: v }));
  };
  const field = (k: keyof Nudge, label: string, help: string) => (
    <label style={p.field}>
      <span style={p.fieldName}>{label}</span>
      <span style={p.inputWrap}>
        <button type="button" style={p.step} aria-label={`${label}: ${stepOf(k)} mm less`} onClick={() => stepTo(k, -stepOf(k))}>−</button>
        <input style={p.input} inputMode="decimal" value={text[k]} aria-label={`${label} (mm)`}
          onFocus={() => { if (sized(k)) resizeBase.current = parsed(text); }}
          onChange={e => { setError(''); if (sized(k)) setSize(k, e.target.value, resizeBase.current); else setText(t => ({ ...t, [k]: e.target.value })); }} />
        <button type="button" style={p.step} aria-label={`${label}: ${stepOf(k)} mm more`} onClick={() => stepTo(k, stepOf(k))}>+</button>
        <em style={p.unit}>{k === 'scale' ? '%' : 'mm'}</em>
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
            {by.name ? <>Set by {by.name}{by.at ? `, ${when(by.at)}` : ''}: down {saved.down}, right {saved.right}, rows +{saved.gapY}, columns {saved.gapX}, labels {saved.width} x {saved.height} mm, size {saved.scale}%</> : <>Not set yet: the starting numbers (down 0, right 1, rows +0.6, columns 4.9, labels 65 x 25 mm, size 100%).</>}
          </div>
          <div style={p.fields}>
            {field('down', 'Move down', 'Boxes too high: a plus number. Too low: minus.')}
            {field('right', 'Move right', 'Boxes too far left: plus. Too far right: minus.')}
          </div>
          <p style={p.note}>Top row right but the bottom row off? Change the space between rows. Left column right but the right column off? The space between columns. These start at the numbers that print right on HQ's printer.</p>
          <div style={p.fields}>
            {field('gapY', 'Space between rows', 'Bottom row too low: smaller (already 0? make the label height a little smaller). Too high: bigger.')}
            {field('gapX', 'Space between columns', 'Right column too far right: smaller. Too far left: bigger.')}
            {field('height', 'Label height', 'One sticker, top to bottom. Shorter stays centred: the space between rows grows.')}
            {field('width', 'Label width', 'One sticker, left to right. Narrower stays centred: the space between columns grows.')}
            {field('scale', 'Size %', 'Every row a little higher than the one before, as if the page were shrunk? A little over 100, e.g. 103.')}
          </div>
          <div style={p.copyRow}>
            {hereIsDefault ? (
              <span style={p.help}>This computer's print page uses the starting numbers (nothing of its own saved).</span>
            ) : (
              <button type="button" style={p.link} onClick={() => { setError(''); setText(toText(hereNudge)); }}
                title="The numbers on this computer's print page (Labels, Print, Fine-tune for your printer)">
                Copy from this computer's print page
              </button>
            )}
            {!hereIsDefault && <span style={p.help}>down {hereNudge.down}, right {hereNudge.right}, rows +{hereNudge.gapY}, columns {hereNudge.gapX}, labels {hereNudge.width} x {hereNudge.height}, size {hereNudge.scale}%</span>}
          </div>
          <label style={p.allRow}>
            <input type="checkbox" checked={allStores} onChange={e => { setError(''); setAllStores(e.target.checked); }} />
            <span><b>Use these numbers for every open store</b><br /><small style={p.help}>For phones at every store to print like this. Any store can still be set on its own afterwards.</small></span>
          </label>
          <p style={p.note}>After saving, ask the store to print the test page again to check before printing real labels.</p>
          {error && <div role="alert" style={p.error}>{error}</div>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
            <button type="button" style={p.link} onClick={() => { setError(''); setText(toText(AVERY)); }}>Back to the starting numbers</button>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" style={p.cancel} onClick={onClose} disabled={saving}>Cancel</button>
              <button type="button" style={{ ...p.save, ...(!canSave ? { opacity: 0.5, cursor: 'default' } : {}) }} onClick={save} disabled={saving || !canSave}>{saving ? 'Saving…' : allStores ? 'Save for all stores' : 'Save'}</button>
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
  copyRow: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  allRow: { display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px', border: '1.5px solid #e4e7ec', borderRadius: 10, fontSize: 14, color: '#111827', cursor: 'pointer' },
  error: { background: '#fdf2f2', color: '#a51b28', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontWeight: 600 },
  link: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0, fontSize: 13.5 },
  cancel: { background: '#f1f3f6', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' },
  save: { background: PRIMARY, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
};
