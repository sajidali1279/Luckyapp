// HQ-made label designs and deal stickers (2026-11-21), drawn by the print code. The same file lives in admin/src/utils/labelDesign.ts
// (keep the two the same) and the rules in backend/src/utils/labelDesign.ts. A design becomes one CSS class, `.dsn-<id>`, that sets the
// frame, stripe, colours, font and three size multipliers (--nk name, --pk price, --dk deal); a label's own size nudge is --ts on the
// label itself. Every value is checked again here before it goes into CSS (a draft in the editor is not checked by the server yet).

export type FrameShape = 'square' | 'rounded' | 'pill' | 'double' | 'dashed' | 'dotted' | 'none';
export type StripeSide = 'none' | 'top' | 'bottom' | 'left';
export type DesignFont = 'sans' | 'serif' | 'condensed' | 'rounded';

export interface DesignSettings {
  frame: { shape: FrameShape; color: string; width: number };
  stripe: { side: StripeSide; color: string; size: number };
  colors: { name: string; price: string; deal: string };
  sizes: { name: number; price: number; deal: number };
  font: DesignFont;
  nameBold: boolean;
  icon: string;
  showBarcode: boolean;
  watermark: boolean;
}

export interface LabelDesign { id: string; name: string; settings: DesignSettings; itemCount?: number; stickerCount?: number }

export const FRAME_SHAPES: { value: FrameShape; label: string }[] = [
  { value: 'square', label: 'Square' }, { value: 'rounded', label: 'Rounded' }, { value: 'pill', label: 'Pill' },
  { value: 'double', label: 'Double line' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }, { value: 'none', label: 'No frame' },
];
export const STRIPE_SIDES: { value: StripeSide; label: string }[] = [
  { value: 'none', label: 'No stripe' }, { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }, { value: 'left', label: 'Left side' },
];
export const DESIGN_FONTS: { value: DesignFont; label: string }[] = [
  { value: 'sans', label: 'Clean' }, { value: 'serif', label: 'Classic' }, { value: 'condensed', label: 'Narrow' }, { value: 'rounded', label: 'Rounded' },
];

export const DEFAULT_DESIGN: DesignSettings = {
  frame: { shape: 'square', color: '#1a1a1a', width: 1.5 },
  stripe: { side: 'top', color: '#b91c1c', size: 2 },
  colors: { name: '#1a1a1a', price: '#dc2626', deal: '#dc2626' },
  sizes: { name: 1, price: 1, deal: 1 },
  font: 'sans',
  nameBold: true,
  icon: '',
  showBarcode: true,
  watermark: true,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = <T extends string>(v: unknown, list: { value: T }[], dflt: T): T => (list.some((o) => o.value === v) ? (v as T) : dflt);
const num = (v: unknown, min: number, max: number, dflt: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : dflt);
const col = (v: unknown, dflt: string) => (typeof v === 'string' && HEX.test(v) ? v.toLowerCase() : dflt);

/** Any settings (from the server, an old version or a half-made draft) as safe, complete settings. */
export function cleanDesign(raw: unknown): DesignSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const d = DEFAULT_DESIGN;
  return {
    frame: { shape: pick(r.frame?.shape, FRAME_SHAPES, d.frame.shape), color: col(r.frame?.color, d.frame.color), width: num(r.frame?.width, 0.5, 4, d.frame.width) },
    stripe: { side: pick(r.stripe?.side, STRIPE_SIDES, d.stripe.side), color: col(r.stripe?.color, d.stripe.color), size: num(r.stripe?.size, 1, 6, d.stripe.size) },
    colors: { name: col(r.colors?.name, d.colors.name), price: col(r.colors?.price, d.colors.price), deal: col(r.colors?.deal, d.colors.deal) },
    sizes: { name: num(r.sizes?.name, 0.7, 1.5, 1), price: num(r.sizes?.price, 0.7, 1.4, 1), deal: num(r.sizes?.deal, 0.7, 1.4, 1) },
    font: pick(r.font, DESIGN_FONTS, d.font),
    nameBold: typeof r.nameBold === 'boolean' ? r.nameBold : d.nameBold,
    icon: typeof r.icon === 'string' ? r.icon.trim().slice(0, 8) : '',
    showBarcode: typeof r.showBarcode === 'boolean' ? r.showBarcode : true,
    watermark: typeof r.watermark === 'boolean' ? r.watermark : true,
  };
}

const FONT_STACK: Record<DesignFont, string> = {
  sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  condensed: "'Arial Narrow', 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif",
  rounded: "'Arial Rounded MT Bold', 'Nunito', 'Varela Round', 'Segoe UI', sans-serif",
};

/** The class a design's labels carry: dsn- and the id with anything unusual taken out. */
export const designClass = (id: string) => `dsn-${id.replace(/[^a-zA-Z0-9-]/g, '')}`;

/** One design as CSS. */
export function designCss(id: string, raw: unknown): string {
  const s = cleanDesign(raw);
  const c = `.${designClass(id)}`;
  const f = s.frame;
  const w = `${f.width}pt`;
  const frame = f.shape === 'none' ? 'border: none;'
    : f.shape === 'double' ? `border: ${Math.max(2.5, f.width * 1.6)}pt double ${f.color}; border-radius: 3px;`
    : `border: ${w} ${f.shape === 'dashed' ? 'dashed' : f.shape === 'dotted' ? 'dotted' : 'solid'} ${f.color}; border-radius: ${f.shape === 'rounded' ? '7px' : f.shape === 'pill' ? '9mm' : '1px'};`;
  // a pill's round ends would cover the first letters: more room inside on the left and right, and a little at the top and bottom
  const pillPad = f.shape === 'pill' ? 'padding: 1.8mm 4.5mm;' : '';
  const st = s.stripe;
  const stripe = st.side === 'none' ? '' : `border-${st.side}: ${st.size}mm solid ${st.color};`;
  return `
    ${c} { ${frame} ${stripe} ${pillPad} font-family: ${FONT_STACK[s.font]}; --nk: ${s.sizes.name}; --pk: ${s.sizes.price}; --dk: ${s.sizes.deal}; }
    ${c} .label-name, ${c} .stk-words { color: ${s.colors.name}; font-weight: ${s.nameBold ? 800 : 500}; }
    ${c} .price-regular, ${c} .price-dollar { color: ${s.colors.price}; }
    ${c} .price-deal { color: ${s.colors.deal}; border-color: ${s.colors.deal}; }
    ${c} .stk-sub, ${c} .stk-ends { color: ${s.colors.deal}; }
  `;
}

// The designs this page has loaded (GET /labels/designs), so a label that carries only its design's id still prints in that design
const known = new Map<string, unknown>();
export function rememberDesigns(list: { id: string; settings: unknown }[]) { known.clear(); list.forEach((d) => known.set(d.id, d.settings)); }
export const designFor = (id: string | null | undefined): unknown => (id ? known.get(id) : undefined);

/** The CSS for every design the given labels use (each once). */
export function designsCss(labels: { designId?: string | null; design?: unknown }[]): string {
  const seen = new Map<string, unknown>();
  labels.forEach((l) => { const d = l.design ?? designFor(l.designId); if (l.designId && d && !seen.has(l.designId)) seen.set(l.designId, d); });
  return [...seen].map(([id, d]) => designCss(id, d)).join('\n');
}

/** A sticker's price as printed: a plain number gets a $ in front ("5.00" is $5.00); anything else ("2/$5") as written. */
export function stickerPrice(text: string): { dollar: boolean; text: string } {
  const t = text.trim();
  return /^\d+(\.\d{1,2})?$/.test(t) ? { dollar: true, text: t } : { dollar: false, text: t };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** A sticker's last day as printed: "Ends Sun 11/30" (from the store date YYYY-MM-DD); '' when there is none or it is not a date. */
export function endsText(endsOn: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(endsOn ?? '');
  if (!m) return '';
  const day = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(day.getTime()) ? '' : `Ends ${WEEKDAYS[day.getUTCDay()]} ${Number(m[2])}/${Number(m[3])}`;
}

/** The extra CSS a deal sticker needs on top of the label's own: pictures on the left, words and price on the right. */
export const STICKER_CSS = `
    .label.sticker { gap: 1.2mm; align-items: center; }
    .stk-pics { display: flex; align-items: center; gap: 0.8mm; flex: 0 0 auto; height: 100%; }
    .stk-pics img { display: block; object-fit: contain; height: 21mm; width: auto; max-width: 23mm; }
    .stk-pics.n2 img { height: 18mm; max-width: 18mm; }
    .stk-pics.n3 img { height: 13.5mm; max-width: 13.5mm; }
    .stk-main { flex: 1; min-width: 0; height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 0.6mm; }
    .stk-words { font-size: calc(9pt * var(--nk, 1) * var(--ts, 1)); font-weight: 800; line-height: 1.05; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
    .stk-price { font-size: calc(20pt * var(--pk, 1) * var(--ts, 1)); font-weight: 900; line-height: 1; white-space: nowrap; }
    .stk-price .price-dollar { font-size: calc(10pt * var(--pk, 1) * var(--ts, 1)); }
    .stk-price.text { font-size: calc(15pt * var(--pk, 1) * var(--ts, 1)); }
    .stk-ends { font-size: calc(6pt * var(--dk, 1) * var(--ts, 1)); font-weight: 800; letter-spacing: 0.2px; white-space: nowrap; }
    .stk-sub { font-size: calc(5.5pt * var(--dk, 1) * var(--ts, 1)); font-weight: 600; line-height: 1.1; display: -webkit-box; -webkit-line-clamp: 2;
      -webkit-box-orient: vertical; overflow: hidden; }
`;
