// Labels > Deal stickers (2026-11-21): stickers like "Chips + 24oz $5.00" with product pictures, on the same 2-5/8 x 1 in labels as
// the shelf labels. HQ keeps a picture library (upload a picture once, use it on any sticker), makes the stickers, and prints them here;
// stores print them from the app.
import { useRef, useState, CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, Printer, ImagePlus, Flame } from 'lucide-react';
import { labelsApi, storesApi, hotFoodCombosApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { C, FONT, INPUT, RADIUS, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Badge, EmptyState, HowItWorks, SectionTitle } from './kit';
import Modal from './Modal';
import ConfirmModal from './ConfirmModal';
import ErrorState from './ErrorState';
import { useLabelDesigns } from '../hooks/useLabelDesigns';
import { labelPreviewHtml, printLabels, PrintableLabel } from '../utils/printLabels';
import { endsText } from '../utils/labelDesign';

const TEMPLATES: { value: string; label: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black' }, { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter' }, { value: 'SUMMER', label: 'Summer' },
  { value: 'CLEARANCE', label: 'Clearance' }, { value: 'INDEPENDENCE_DAY', label: 'Independence Day' }, { value: 'HALLOWEEN', label: 'Halloween' }, { value: 'PREMIUM', label: 'Premium / Top Shelf' },
];
const SIZES = ['0.7', '0.8', '0.9', '1', '1.1', '1.2', '1.3', '1.4'];

interface LibImage { id: string; name: string; url: string }
interface Sticker {
  id: string; words: string; subText: string | null; priceText: string; imageIds: string[]; designId: string | null; template: string;
  textScale: number | null; storeIds: string[]; isActive: boolean; images: LibImage[];
  endsOn: string | null; showEnd: boolean; ended?: boolean;   // the deal's last day (2026-11-21)
}
interface Store { id: string; name: string; isActive?: boolean }
type Prefill = { words: string; priceText: string; subText: string | null; images: LibImage[] };
interface Combo { id: string; name: string; price: number; isActive: boolean; catalogItem?: { name: string; imageUrl?: string | null } }

/** A sticker as the print code draws it. */
export function stickerPrintable(x: { id: string; words: string; subText: string | null; priceText: string; designId: string | null; template: string; textScale: number | null; images: { url: string }[]; endsOn?: string | null; showEnd?: boolean }): PrintableLabel {
  return { id: x.id, productName: x.words, priceText: x.priceText, template: x.template, designId: x.designId, textScale: x.textScale,
    sticker: { words: x.words, sub: x.subText, images: x.images.map((i) => i.url), ends: x.showEnd !== false ? endsText(x.endsOn) : null } };
}

export default function DealStickersPanel() {
  const qc = useQueryClient();
  useLabelDesigns();   // so the previews and the print draw HQ designs
  const stickersQ = useQuery({ queryKey: ['deal-stickers'], queryFn: async () => ((await labelsApi.stickers()).data?.data ?? []) as Sticker[] });
  const imagesQ = useQuery({ queryKey: ['label-images'], queryFn: async () => ((await labelsApi.images()).data?.data ?? []) as LibImage[] });
  const storesQ = useQuery({ queryKey: ['stores-list'], queryFn: async () => ((await storesApi.getAll()).data?.data ?? []) as Store[] });
  const stickers = stickersQ.data ?? [];
  const images = imagesQ.data ?? [];
  const stores = storesQ.data ?? [];

  const [editing, setEditing] = useState<Sticker | 'new' | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [pickingCombo, setPickingCombo] = useState(false);
  const [removing, setRemoving] = useState<Sticker | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const del = useMutation({
    mutationFn: (id: string) => labelsApi.deleteSticker(id),
    onSuccess: () => { toast.success('Sticker removed'); setRemoving(null); qc.invalidateQueries({ queryKey: ['deal-stickers'] }); },
    onError: (e) => { toast.error(failureMessage(e, 'Could not remove the sticker.')); setRemoving(null); },
  });
  const flip = useMutation({
    mutationFn: (x: Sticker) => labelsApi.updateSticker(x.id, { words: x.words, subText: x.subText, priceText: x.priceText, imageIds: x.imageIds, designId: x.designId,
      template: x.template, textScale: x.textScale, storeIds: x.storeIds, endsOn: x.endsOn, showEnd: x.showEnd, isActive: !x.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deal-stickers'] }),
    onError: (e) => toast.error(failureMessage(e, 'Could not change the sticker.')),
  });

  function printPicked() {
    const entries = stickers.filter((x) => picked.has(x.id)).map((x) => ({ label: stickerPrintable(x), quantity: qty[x.id] ?? 1 }));
    if (entries.length && printLabels(entries)) setPicked(new Set());
  }
  const storeName = (id: string) => stores.find((st) => st.id === id)?.name ?? 'a store';

  if (stickersQ.isError) return <ErrorState message="Could not load the deal stickers." onRetry={() => stickersQ.refetch()} />;

  return (
    <div style={{ display: 'grid', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <HowItWorks style={{ flex: '1 1 320px' }}>
          A deal sticker shows up to 3 pictures on the left and the deal with its price on the right, on the same label sheets as the shelf
          labels. Add your product pictures to the library below once, then use them on any sticker. A sticker can be for every store or only
          some, and can have a last day ("Ends Sun 11/30" can print on it). After its last day, or once you switch it off, stores stop seeing
          it, and for a week their app lists it under "Take these down". Simple pictures on a plain background print best at this size.
        </HowItWorks>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<Printer />} disabled={picked.size === 0} onClick={printPicked}>Print {picked.size ? `${picked.size} picked` : 'picked'}</Button>
          <Button icon={<Flame />} onClick={() => setPickingCombo(true)}>From a hot food combo</Button>
          <Button variant="primary" icon={<Plus />} onClick={() => { setPrefill(null); setEditing('new'); }} disabled={imagesQ.isLoading}>New sticker</Button>
        </div>
      </div>

      <div>
        <SectionTitle count={stickers.length}>Stickers</SectionTitle>
        {stickersQ.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : stickers.length === 0 ? (
          <EmptyState title="No deal stickers yet" description={images.length ? 'Make one from your pictures.' : 'Add a few product pictures to the library below first, then make a sticker.'} />
        ) : (
          <div style={st.grid}>
            {stickers.map((x) => (
              <Card key={x.id} padding={12} style={x.isActive ? undefined : { opacity: 0.7 }}>
                <iframe title={`${x.words} preview`} sandbox="" style={st.thumb} srcDoc={labelPreviewHtml(stickerPrintable(x))} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 8 }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0, cursor: 'pointer' }}>
                    <input type="checkbox" checked={picked.has(x.id)} aria-label={`Print ${x.words}`}
                      onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(x.id); else n.delete(x.id); return n; })} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ fontWeight: 700, color: C.text, fontSize: FONT.body }}>{x.words}</span>
                      <span style={{ display: 'block', fontSize: FONT.caption, color: TEXT_MUTED }}>
                        {x.storeIds.length === 0 ? 'Every store' : x.storeIds.length <= 2 ? x.storeIds.map(storeName).join(', ') : `${x.storeIds.length} stores`}
                      </span>
                    </span>
                  </label>
                  <span style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {x.ended ? <Badge tone="danger">Ended {endsText(x.endsOn).replace('Ends ', '')}</Badge> : x.endsOn ? <Badge tone="warning">{endsText(x.endsOn)}</Badge> : null}
                    {!x.isActive && <Badge>Switched off</Badge>}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input type="number" min={1} max={300} aria-label={`How many of ${x.words}`} style={{ ...INPUT, width: 70, padding: '4px 8px' }}
                    value={qty[x.id] ?? 1} onChange={(e) => setQty((p) => ({ ...p, [x.id]: Math.max(1, Math.min(300, Number(e.target.value) || 1)) }))} />
                  <Button size="sm" icon={<Pencil />} onClick={() => setEditing(x)}>Edit</Button>
                  <Button size="sm" onClick={() => flip.mutate(x)} disabled={flip.isPending}>{x.isActive ? 'Switch off' : 'Switch on'}</Button>
                  <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Remove ${x.words}`} onClick={() => setRemoving(x)} />
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <PictureLibrary images={images} loading={imagesQ.isLoading} />

      {editing && <StickerEditor sticker={editing === 'new' ? null : editing} prefill={editing === 'new' ? prefill : null} images={images} stores={stores} onClose={() => { setEditing(null); setPrefill(null); }} />}
      {pickingCombo && <ComboPicker onClose={() => setPickingCombo(false)} onPicked={(p) => { setPickingCombo(false); setPrefill(p); setEditing('new'); }} />}
      <ConfirmModal headingLevel="h2" open={!!removing} danger busy={del.isPending} confirmLabel="Remove"
        title={`Remove "${removing?.words ?? ''}"?`} message={<p style={{ margin: 0 }}>Stores stop seeing it. Stickers already printed stay on the shelves until taken down. To keep it for later, switch it off instead.</p>}
        onConfirm={() => removing && del.mutate(removing.id)} onCancel={() => setRemoving(null)} />
    </div>
  );
}

function PictureLibrary({ images, loading }: { images: LibImage[]; loading: boolean }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<LibImage | null>(null);
  const add = useMutation({
    mutationFn: () => labelsApi.uploadImage(file!, name.trim()),
    onSuccess: () => { toast.success('Picture added'); setFile(null); setName(''); if (fileRef.current) fileRef.current.value = ''; qc.invalidateQueries({ queryKey: ['label-images'] }); },
    onError: (e) => toast.error(failureMessage(e, 'Could not add the picture.')),
  });
  const del = useMutation({
    mutationFn: (id: string) => labelsApi.deleteImage(id),
    onSuccess: (r) => {
      const n = r.data?.data?.stickersUsing ?? 0;
      toast.success(`Picture removed.${n ? ` ${n} sticker${n === 1 ? '' : 's'} now show one picture fewer.` : ''}`);
      setRemoving(null); qc.invalidateQueries({ queryKey: ['label-images'] }); qc.invalidateQueries({ queryKey: ['deal-stickers'] });
    },
    onError: (e) => { toast.error(failureMessage(e, 'Could not remove the picture.')); setRemoving(null); },
  });
  const tooBig = !!file && file.size > 10 * 1024 * 1024;
  return (
    <div>
      <SectionTitle count={images.length}>Picture library</SectionTitle>
      <Card padding={12} style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" aria-label="Picture file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <input aria-label="Picture name" style={{ ...INPUT, width: 220 }} maxLength={40} placeholder='Name, e.g. "Chips bag"' value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="primary" icon={<ImagePlus />} disabled={!file || !name.trim() || tooBig || add.isPending} onClick={() => add.mutate()}>{add.isPending ? 'Adding…' : 'Add picture'}</Button>
        </div>
        <div style={{ fontSize: FONT.caption, color: tooBig ? C.danger : TEXT_MUTED, marginTop: 6 }}>
          {tooBig ? 'That picture is over 10 MB. Use a smaller one.' : 'PNG, JPG or WebP. A product on a white or clear background works best. It is kept small (600 px), without the photo\'s location details.'}
        </div>
      </Card>
      {loading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : images.length === 0 ? (
        <div style={{ fontSize: FONT.small, color: TEXT_MUTED }}>No pictures yet.</div>
      ) : (
        <div style={st.picGrid}>
          {images.map((im) => (
            <div key={im.id} style={st.pic}>
              <img src={im.url} alt={im.name} style={st.picImg} />
              <div style={{ fontSize: FONT.caption, color: C.text2, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }} title={im.name}>{im.name}</div>
              <Button size="sm" variant="ghost" icon={<Trash2 />} aria-label={`Remove picture ${im.name}`} onClick={() => setRemoving(im)} />
            </div>
          ))}
        </div>
      )}
      <ConfirmModal headingLevel="h2" open={!!removing} danger busy={del.isPending} confirmLabel="Remove" title={`Remove the picture "${removing?.name ?? ''}"?`}
        message={<p style={{ margin: 0 }}>Stickers using it show one picture fewer.</p>} onConfirm={() => removing && del.mutate(removing.id)} onCancel={() => setRemoving(null)} />
    </div>
  );
}

/** Pick a hot food combo: its name, price and the item's photo start a new sticker (2026-11-21). */
function ComboPicker({ onClose, onPicked }: { onClose: () => void; onPicked: (p: Prefill) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['hot-food-combos'], queryFn: () => hotFoodCombosApi.list() });
  const combos: Combo[] = Array.isArray(q.data?.data?.data) ? q.data!.data.data : [];
  const [busy, setBusy] = useState<string | null>(null);
  async function pick(c: Combo) {
    setBusy(c.id);
    let images: LibImage[] = [];
    try {
      const url = c.catalogItem?.imageUrl;
      if (url) {
        const r = await labelsApi.imageFromUrl(c.catalogItem!.name, url);
        if (r.data?.data) images = [r.data.data as LibImage];
        qc.invalidateQueries({ queryKey: ['label-images'] });
      }
    } catch (e) {
      toast.error(failureMessage(e, 'The photo could not be added; add a picture yourself.'));
    }
    setBusy(null);
    onPicked({ words: c.name.slice(0, 30), priceText: c.price.toFixed(2), subText: null, images });
  }
  return (
    <Modal title="Sticker from a hot food combo" subtitle="Its name, price and photo fill in a new sticker. You can change anything before saving." onClose={onClose} maxWidth={560}>
      {q.isError ? <ErrorState message="Could not load the combos." onRetry={() => q.refetch()} compact />
        : q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div>
        : combos.length === 0 ? <EmptyState title="No hot food combos yet" description="Make them in Hot Food > Combos." />
        : (
          <div style={{ display: 'grid', gap: 6, maxHeight: '55vh', overflowY: 'auto' }}>
            {combos.map((c) => (
              <button key={c.id} type="button" style={st.comboRow} onClick={() => pick(c)} disabled={!!busy} aria-label={`Use ${c.name}, $${c.price.toFixed(2)}`}>
                {c.catalogItem?.imageUrl ? <img src={c.catalogItem.imageUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 8 }} />
                  : <span style={{ width: 44, height: 44, borderRadius: 8, background: C.hover }} />}
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ display: 'block', fontWeight: 700, color: C.text }}>{c.name}</span>
                  <span style={{ display: 'block', fontSize: FONT.caption, color: TEXT_MUTED }}>{c.catalogItem?.name ?? ''}{c.isActive ? '' : ' · switched off'}</span>
                </span>
                <span style={{ fontWeight: 800, color: C.text }}>{busy === c.id ? '…' : `$${c.price.toFixed(2)}`}</span>
              </button>
            ))}
          </div>
        )}
    </Modal>
  );
}

function StickerEditor({ sticker, prefill, images, stores, onClose }: { sticker: Sticker | null; prefill?: Prefill | null; images: LibImage[]; stores: Store[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { designs } = useLabelDesigns();
  const [words, setWords] = useState(sticker?.words ?? prefill?.words ?? '');
  const [sub, setSub] = useState(sticker?.subText ?? prefill?.subText ?? '');
  const [price, setPrice] = useState(sticker?.priceText ?? prefill?.priceText ?? '');
  const [pics, setPics] = useState<string[]>(sticker?.images.map((i) => i.id) ?? prefill?.images.map((i) => i.id) ?? []);
  // a picture just added from a combo may not be in the library list yet: it is shown from the prefill until the list catches up
  const allImages = [...images, ...(prefill?.images ?? []).filter((p) => !images.some((i) => i.id === p.id))];
  const [look, setLook] = useState(sticker?.designId ? `design:${sticker.designId}` : sticker?.template ?? 'CLASSIC_RED_BLACK');
  const [size, setSize] = useState(sticker?.textScale && sticker.textScale !== 1 ? String(sticker.textScale) : '1');
  const [allStores, setAllStores] = useState(!sticker || sticker.storeIds.length === 0);
  const [storeIds, setStoreIds] = useState<string[]>(sticker?.storeIds ?? []);
  const [isActive, setIsActive] = useState(sticker?.isActive ?? true);
  const [endsOn, setEndsOn] = useState(sticker?.endsOn ?? '');
  const [showEnd, setShowEnd] = useState(sticker?.showEnd ?? true);
  const [error, setError] = useState('');

  const body = {
    words: words.trim(), subText: sub.trim() || null, priceText: price.trim().replace(/^\$/, ''), imageIds: pics,
    designId: look.startsWith('design:') ? look.slice(7) : null, template: look.startsWith('design:') ? (sticker?.template ?? 'CLASSIC_RED_BLACK') : look,
    textScale: size === '1' ? null : Number(size), storeIds: allStores ? [] : storeIds, isActive,
    endsOn: endsOn || null, showEnd,
  };
  const todayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const problem = !body.words ? 'Write the deal, like "Chips + 24oz".' : !body.priceText ? 'Give the price, like 5.00.'
    : !/^[0-9A-Za-z$./ ]+$/.test(body.priceText) ? 'The price can have numbers, letters, $, . and / (like 5.00 or 2/$5).'
    : !allStores && storeIds.length === 0 ? 'Pick at least one store, or choose every store.'
    : endsOn && endsOn !== (sticker?.endsOn ?? '') && endsOn < todayKey ? 'The last day of the deal has already passed. Pick today or a later day.' : null;
  const save = useMutation({
    mutationFn: () => (sticker ? labelsApi.updateSticker(sticker.id, body) : labelsApi.createSticker(body)),
    onSuccess: () => { toast.success(sticker ? 'Sticker saved' : 'Sticker made'); qc.invalidateQueries({ queryKey: ['deal-stickers'] }); onClose(); },
    onError: (e) => setError(failureMessage(e, 'Could not save the sticker.')),
  });
  const togglePic = (id: string) => setPics((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= 3 ? p : [...p, id]));
  const preview = stickerPrintable({ id: sticker?.id ?? 'new', words: body.words || 'Your deal', subText: body.subText, priceText: body.priceText || '0.00',
    designId: body.designId, template: body.template, textScale: body.textScale, endsOn: body.endsOn, showEnd, images: pics.map((id) => allImages.find((i) => i.id === id)).filter(Boolean) as LibImage[] });

  return (
    <Modal title={sticker ? 'Edit deal sticker' : 'New deal sticker'} subtitle="Up to 3 pictures on the left, the deal and its price on the right." onClose={onClose} busy={save.isPending} maxWidth={920}>
      <div style={st.editor}>
        <div style={{ display: 'grid', gap: 12 }}>
          <label style={st.field}>The deal<input style={INPUT} maxLength={30} placeholder="Chips + 24oz" value={words} onChange={(e) => { setWords(e.target.value); setError(''); }} /></label>
          <label style={st.field}>Price<input style={{ ...INPUT, width: 160 }} maxLength={10} placeholder="5.00 or 2/$5" value={price} onChange={(e) => { setPrice(e.target.value); setError(''); }} /></label>
          <label style={st.field}>Small line (optional)<input style={INPUT} maxLength={48} placeholder="Any 2.5 oz bag and a 24 oz fountain drink" value={sub} onChange={(e) => setSub(e.target.value)} /></label>
          <div style={st.field}>
            <span>Pictures ({pics.length} of 3, in the order picked)</span>
            {allImages.length === 0 ? <span style={{ fontWeight: 400, color: TEXT_MUTED }}>The picture library is empty: add pictures under the stickers first.</span> : (
              <div style={st.pickGrid}>
                {allImages.map((im) => {
                  const n = pics.indexOf(im.id);
                  return (
                    <button key={im.id} type="button" aria-pressed={n >= 0} aria-label={`${n >= 0 ? 'Remove' : 'Use'} picture ${im.name}`} onClick={() => togglePic(im.id)}
                      disabled={n < 0 && pics.length >= 3} style={{ ...st.pickBtn, ...(n >= 0 ? st.pickOn : {}) }}>
                      <img src={im.url} alt="" style={{ width: 54, height: 54, objectFit: 'contain' }} />
                      <span style={{ fontSize: 11, color: C.text2, maxWidth: 70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{im.name}</span>
                      {n >= 0 && <span style={st.pickNum}>{n + 1}</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <label style={st.field}>Design
              <select style={{ ...INPUT, width: 220 }} value={look} onChange={(e) => setLook(e.target.value)}>
                <optgroup label="Built in">{TEMPLATES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>
                {designs.length > 0 && <optgroup label="HQ designs">{designs.map((d) => <option key={d.id} value={`design:${d.id}`}>{d.name}</option>)}</optgroup>}
              </select>
            </label>
            <label style={st.field}>Text size
              <select style={{ ...INPUT, width: 100 }} value={size} onChange={(e) => setSize(e.target.value)}>
                {SIZES.map((v) => <option key={v} value={v}>{Math.round(Number(v) * 100)}%</option>)}
              </select>
            </label>
          </div>
          <div style={st.field}>
            <span>Stores</span>
            <label style={st.check}><input type="checkbox" checked={allStores} onChange={(e) => setAllStores(e.target.checked)} /> Every store</label>
            {!allStores && (
              <div style={st.storeGrid}>
                {stores.map((s) => (
                  <label key={s.id} style={st.check}>
                    <input type="checkbox" checked={storeIds.includes(s.id)} onChange={(e) => setStoreIds((p) => (e.target.checked ? [...p, s.id] : p.filter((x) => x !== s.id)))} />
                    {s.name}{s.isActive === false ? ' (off)' : ''}
                  </label>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={st.field}>Last day of the deal (optional)
              <input type="date" style={{ ...INPUT, width: 170 }} min={todayKey} value={endsOn} onChange={(e) => { setEndsOn(e.target.value); setError(''); }} />
            </label>
            {endsOn && <label style={{ ...st.check, paddingBottom: 8 }}><input type="checkbox" checked={showEnd} onChange={(e) => setShowEnd(e.target.checked)} /> Print "{endsText(endsOn)}" on it</label>}
          </div>
          {endsOn && <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: -6 }}>After that day stores stop seeing it, and for a week their app lists it under "Take these down".</div>}
          <label style={st.check}><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Switched on (stores can print it)</label>
        </div>
        <div style={{ position: 'sticky', top: 0, display: 'grid', gap: 8 }}>
          <div style={{ fontSize: FONT.caption, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: 0.4 }}>Preview</div>
          <iframe title="How the sticker prints" sandbox="" style={{ width: '100%', height: 190, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, background: C.subtle }} srcDoc={labelPreviewHtml(preview)} />
        </div>
      </div>
      {(error || problem) && <div role="alert" style={{ fontSize: FONT.small, color: C.danger }}>{error || problem}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
        <Button variant="primary" onClick={() => save.mutate()} disabled={!!problem || save.isPending}>{save.isPending ? 'Saving…' : sticker ? 'Save sticker' : 'Make sticker'}</Button>
      </div>
    </Modal>
  );
}

const st: Record<string, CSSProperties> = {
  grid: { display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' },
  thumb: { width: '100%', height: 150, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, background: C.subtle },
  picGrid: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' },
  pic: { border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, background: C.surface },
  picImg: { width: 80, height: 80, objectFit: 'contain' },
  editor: { display: 'grid', gap: 18, gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)', alignItems: 'start' },
  field: { display: 'grid', gap: 4, fontSize: FONT.small, fontWeight: 600, color: C.text2 },
  check: { display: 'flex', alignItems: 'center', gap: 8, fontSize: FONT.small, fontWeight: 400, color: C.text2, cursor: 'pointer' },
  pickGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 230, overflowY: 'auto' },
  pickBtn: { position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: 6, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, background: C.surface, cursor: 'pointer' },
  pickOn: { borderColor: C.primary, boxShadow: `0 0 0 2px ${C.primary}` },
  pickNum: { position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: 9, background: C.primary, color: '#fff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  storeGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 4 },
  comboRow: { display: 'flex', alignItems: 'center', gap: 10, padding: 8, border: `1px solid ${C.border}`, borderRadius: RADIUS.md, background: C.surface, cursor: 'pointer', fontSize: FONT.body, fontFamily: 'inherit' },
};
