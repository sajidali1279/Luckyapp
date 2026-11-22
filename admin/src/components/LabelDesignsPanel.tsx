// Labels > Designs (2026-11-21): HQ makes its own label designs. The editor shows every choice beside a live preview of the real label:
// a long name with a barcode, a deal, and a deal sticker, so a size that cuts text off is seen before saving.
import { useState, CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { labelsApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { C, FONT, INPUT, RADIUS, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Chip, EmptyState, Notice, HowItWorks } from './kit';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import ErrorState from './ErrorState';
import { useLabelDesigns } from '../hooks/useLabelDesigns';
import { labelPreviewHtml } from '../utils/printLabels';
import { cleanDesign, DEFAULT_DESIGN, DesignSettings, DESIGN_FONTS, FRAME_SHAPES, LabelDesign, STRIPE_SIDES } from '../utils/labelDesign';

// Colours that print well on a home printer: dark enough to read, bright enough to stand out
const SWATCHES = ['#1a1a1a', '#b91c1c', '#dc2626', '#ea580c', '#b8860b', '#15803d', '#14532d', '#0e7490', '#2563eb', '#1e3a8a', '#7c3aed', '#db2777'];
const ICONS = ['', '★', '❆', '☀', '🔥', '🎃', '♥', '✓', '$', '!'];
const SAMPLE_PIC = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><rect x="6" y="4" width="48" height="72" rx="9" fill="#f59e0b"/><rect x="14" y="22" width="32" height="20" rx="4" fill="#fff" opacity=".7"/></svg>');
const SAMPLE_CUP = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="60" height="80"><path d="M10 14h40l-5 62H15z" fill="#dc2626"/><rect x="8" y="8" width="44" height="8" rx="3" fill="#7f1d1d"/></svg>');

/** The three sample labels a design is previewed on. */
export function designSamples(id: string, settings: DesignSettings) {
  const base = { template: 'CLASSIC_RED_BLACK', designId: id, design: settings };
  return [
    labelPreviewHtml({ ...base, id: 's1', productName: 'Doritos Nacho Cheese Party Size 9.25 oz', priceText: '5.49', barcode: '028400090858' }),
    labelPreviewHtml({ ...base, id: 's2', productName: 'Coca-Cola 20 oz', priceText: '2.49', dealText: '2 for $4' }),
    labelPreviewHtml({ ...base, id: 's3', productName: '', priceText: '5.00', sticker: { words: 'Chips + 24oz', sub: 'Any 2.5 oz bag and a 24 oz fountain drink', images: [SAMPLE_PIC, SAMPLE_CUP] } }),
  ];
}

export default function LabelDesignsPanel() {
  const qc = useQueryClient();
  const { designs, isLoading, isError, refetch } = useLabelDesigns();
  const [editing, setEditing] = useState<{ id: string | null; name: string; settings: DesignSettings } | null>(null);
  const [removing, setRemoving] = useState<LabelDesign | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => labelsApi.deleteDesign(id),
    onSuccess: (r) => {
      const n = r.data?.data?.reprint ?? 0;
      toast.success(`Design removed.${n ? ` ${n} store label${n === 1 ? '' : 's'} to reprint in the built-in design.` : ''}`);
      setRemoving(null);
      qc.invalidateQueries({ queryKey: ['label-designs'] });
      qc.invalidateQueries({ queryKey: ['labels'] });
    },
    onError: (e) => { toast.error(failureMessage(e, 'Could not remove the design.')); setRemoving(null); },
  });

  if (isError) return <ErrorState message="Could not load the label designs." onRetry={() => refetch()} />;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <HowItWorks style={{ flex: '1 1 320px' }}>
          Make a design once: the frame (shape, colour, thickness), a coloured stripe, the colours and sizes of the name, price and deal,
          a font and a small icon. Then choose it for any item in the Catalog (the Design column) or for a deal sticker. Changing a design
          tells every store that printed labels in it to reprint them. The 7 built-in designs stay as they are.
        </HowItWorks>
        <Button variant="primary" icon={<Plus />} onClick={() => setEditing({ id: null, name: '', settings: { ...DEFAULT_DESIGN } })}>New design</Button>
      </div>

      {isLoading ? <div style={{ color: TEXT_MUTED, fontSize: FONT.body }}>Loading the designs…</div>
        : designs.length === 0 ? (
          <EmptyState title="No designs of your own yet" description="Make one, then pick it for items in the Catalog or for deal stickers."
            action={<Button variant="primary" icon={<Plus />} onClick={() => setEditing({ id: null, name: '', settings: { ...DEFAULT_DESIGN } })}>New design</Button>} />
        ) : (
          <div style={st.grid}>
            {designs.map((d) => {
              const settings = cleanDesign(d.settings);
              return (
                <Card key={d.id} padding={14}>
                  <iframe title={`${d.name} preview`} sandbox="" style={st.thumb} srcDoc={designSamples(d.id, settings)[0]} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.text, fontSize: FONT.body }}>{d.name}</div>
                      <div style={{ fontSize: FONT.caption, color: TEXT_MUTED }}>
                        {d.itemCount ?? 0} item{d.itemCount === 1 ? '' : 's'}, {d.stickerCount ?? 0} sticker{d.stickerCount === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="sm" icon={<Pencil />} onClick={() => setEditing({ id: d.id, name: d.name, settings })}>Edit</Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Remove ${d.name}`} onClick={() => setRemoving(d)} />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

      {editing && <DesignEditor initial={editing} onClose={() => setEditing(null)} />}
      <ConfirmModal headingLevel="h2" open={!!removing} danger busy={del.isPending} confirmLabel="Remove"
        title={`Remove "${removing?.name ?? ''}"?`}
        message={<p style={{ margin: 0 }}>Its {removing?.itemCount ?? 0} items and {removing?.stickerCount ?? 0} stickers go back to their built-in design, and stores that printed them are told to reprint.</p>}
        onConfirm={() => removing && del.mutate(removing.id)} onCancel={() => setRemoving(null)} />
    </div>
  );
}

function DesignEditor({ initial, onClose }: { initial: { id: string | null; name: string; settings: DesignSettings }; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(initial.name);
  const [s, setS] = useState<DesignSettings>(initial.settings);
  const [error, setError] = useState('');
  const set = <K extends keyof DesignSettings>(k: K, v: DesignSettings[K]) => { setS((p) => ({ ...p, [k]: v })); setError(''); };

  const save = useMutation({
    mutationFn: () => (initial.id ? labelsApi.updateDesign(initial.id, { name: name.trim(), settings: s }) : labelsApi.createDesign({ name: name.trim(), settings: s })),
    onSuccess: (r) => {
      const n = r.data?.reprint ?? 0;
      toast.success(initial.id ? `Design saved.${n ? ` ${n} store label${n === 1 ? '' : 's'} told to reprint.` : ''}` : 'Design made. Pick it in the Catalog Design column or for a sticker.');
      qc.invalidateQueries({ queryKey: ['label-designs'] });
      qc.invalidateQueries({ queryKey: ['labels'] });
      onClose();
    },
    onError: (e) => setError(failureMessage(e, 'Could not save the design.')),
  });
  const problem = !name.trim() ? 'Give the design a name.' : null;
  const samples = designSamples('draft', s);

  return (
    <Modal title={initial.id ? 'Edit design' : 'New design'} subtitle="Every change shows on the labels at the right, at their printed proportions." onClose={onClose} busy={save.isPending} maxWidth={980}>
      <div style={st.editor}>
        <div style={st.controls}>
          <Row label="Name">
            <input aria-label="Design name" style={INPUT} maxLength={40} placeholder="e.g. Weekend Special" value={name} onChange={(e) => { setName(e.target.value); setError(''); }} />
          </Row>

          <Section title="Frame">
            <Chips value={s.frame.shape} options={FRAME_SHAPES} onPick={(v) => set('frame', { ...s.frame, shape: v })} label="Frame shape" />
            {s.frame.shape !== 'none' && (
              <>
                <ColorRow label="Frame colour" value={s.frame.color} onPick={(v) => set('frame', { ...s.frame, color: v })} />
                <Slider label="Thickness" value={s.frame.width} min={0.5} max={4} step={0.5} show={(v) => `${v} pt`} onChange={(v) => set('frame', { ...s.frame, width: v })} />
              </>
            )}
          </Section>

          <Section title="Stripe">
            <Chips value={s.stripe.side} options={STRIPE_SIDES} onPick={(v) => set('stripe', { ...s.stripe, side: v })} label="Stripe side" />
            {s.stripe.side !== 'none' && (
              <>
                <ColorRow label="Stripe colour" value={s.stripe.color} onPick={(v) => set('stripe', { ...s.stripe, color: v })} />
                <Slider label="Stripe size" value={s.stripe.size} min={1} max={6} step={0.5} show={(v) => `${v} mm`} onChange={(v) => set('stripe', { ...s.stripe, size: v })} />
              </>
            )}
          </Section>

          <Section title="Text">
            <Slider label="Name size" value={s.sizes.name} min={0.7} max={1.5} step={0.05} show={pct} onChange={(v) => set('sizes', { ...s.sizes, name: v })} />
            <Slider label="Price size" value={s.sizes.price} min={0.7} max={1.4} step={0.05} show={pct} onChange={(v) => set('sizes', { ...s.sizes, price: v })} />
            <Slider label="Deal size" value={s.sizes.deal} min={0.7} max={1.4} step={0.05} show={pct} onChange={(v) => set('sizes', { ...s.sizes, deal: v })} />
            <ColorRow label="Name colour" value={s.colors.name} onPick={(v) => set('colors', { ...s.colors, name: v })} />
            <ColorRow label="Price colour" value={s.colors.price} onPick={(v) => set('colors', { ...s.colors, price: v })} />
            <ColorRow label="Deal colour" value={s.colors.deal} onPick={(v) => set('colors', { ...s.colors, deal: v })} />
            <Row label="Font"><Chips value={s.font} options={DESIGN_FONTS} onPick={(v) => set('font', v)} label="Font" /></Row>
            <label style={st.check}><input type="checkbox" checked={s.nameBold} onChange={(e) => set('nameBold', e.target.checked)} /> Bold name</label>
          </Section>

          <Section title="Extras">
            <Row label="Icon before the name">
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {ICONS.map((ic) => (
                  <Chip key={ic || 'none'} selected={s.icon === ic} onClick={() => set('icon', ic)} aria-label={ic ? `Icon ${ic}` : 'No icon'}>{ic || 'None'}</Chip>
                ))}
              </div>
            </Row>
            <label style={st.check}><input type="checkbox" checked={s.showBarcode} onChange={(e) => set('showBarcode', e.target.checked)} /> Show the barcode (when the item has one)</label>
            <label style={st.check}><input type="checkbox" checked={s.watermark} onChange={(e) => set('watermark', e.target.checked)} /> Faint "LUCKY STOP" behind the text</label>
          </Section>
        </div>

        <div style={st.previewCol}>
          <div style={st.previewTitle}>Preview</div>
          {samples.map((h, i) => (
            <iframe key={i} title={['A long name with a barcode', 'A deal', 'A deal sticker'][i]} sandbox="" style={st.preview} srcDoc={h} />
          ))}
          <Notice tone="info" style={{ marginTop: 6 }}>Colours print as they look here on a colour printer. On a black-and-white printer, pick dark colours so the price still stands out.</Notice>
        </div>
      </div>
      {(error || problem) && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{error || problem}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button variant="primary" onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : initial.id ? 'Save design' : 'Make design'}</Button>
      </div>
    </Modal>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <fieldset style={st.section}><legend style={st.legend}>{title}</legend>{children}</fieldset>;
}
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 4 }}><div style={st.rowLabel}>{label}</div>{children}</div>;
}
function Chips<T extends string>({ value, options, onPick, label }: { value: T; options: { value: T; label: string }[]; onPick: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
      {options.map((o) => <Chip key={o.value} role="radio" selected={value === o.value} onClick={() => onPick(o.value)}>{o.label}</Chip>)}
    </div>
  );
}
function ColorRow({ label, value, onPick }: { label: string; value: string; onPick: (v: string) => void }) {
  return (
    <Row label={label}>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        {SWATCHES.map((c) => (
          <button key={c} type="button" aria-label={`${label} ${c}`} aria-pressed={value === c} onClick={() => onPick(c)}
            style={{ ...st.swatch, background: c, outline: value === c ? `2px solid ${C.primary}` : 'none' }} />
        ))}
        <input type="color" aria-label={`${label}, any colour`} value={value} onChange={(e) => onPick(e.target.value.toLowerCase())} style={st.colorInput} />
      </div>
    </Row>
  );
}
function Slider({ label, value, min, max, step, show, onChange }: { label: string; value: number; min: number; max: number; step: number; show: (v: number) => string; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 52px', gap: 8, alignItems: 'center' }}>
      <span style={st.rowLabel}>{label}</span>
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <span style={{ fontSize: FONT.small, color: C.text2, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{show(value)}</span>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  grid: { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' },
  thumb: { width: '100%', height: 150, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, background: C.subtle },
  editor: { display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', alignItems: 'start' },
  controls: { display: 'grid', gap: 12, maxHeight: '62vh', overflowY: 'auto', paddingRight: 6 },
  section: { border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: '10px 12px', display: 'grid', gap: 10, margin: 0 },
  legend: { fontSize: FONT.caption, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4, padding: '0 4px' },
  rowLabel: { fontSize: FONT.small, fontWeight: 600, color: C.text2 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: FONT.small, color: C.text2, cursor: 'pointer' },
  swatch: { width: 22, height: 22, borderRadius: 6, border: '1px solid rgba(0,0,0,0.15)', cursor: 'pointer', outlineOffset: 2, padding: 0 },
  colorInput: { width: 34, height: 26, padding: 0, cursor: 'pointer' },
  previewCol: { position: 'sticky', top: 0, display: 'grid', gap: 8 },
  previewTitle: { fontSize: FONT.caption, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4 },
  preview: { width: '100%', height: 170, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, background: C.subtle },
};
