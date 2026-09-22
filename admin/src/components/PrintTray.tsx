import { CSSProperties, useEffect, useState } from 'react';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { canonicalPrice, priceProblem } from '../lib/labelPrice';
import { LabelPrintStatus, STATUS_LABEL, STATUS_COLOR, STATUS_BG } from '../utils/labelStatus';

export interface PrintTrayItem {
  id: string;
  productName: string;
  priceText: string | null;
  dealText?: string | null;
  quantity: number;
  status?: Exclude<LabelPrintStatus, 'not_added'>;
  ageLabel?: string;
  hasOverride?: boolean;
  /** The price the store really has. When the box holds a different one, the row says it is a one-off and offers to save it. */
  storePrice?: string | null;
}

interface PrintTrayProps {
  items: PrintTrayItem[];
  editablePrice?: boolean;
  onQuantityChange: (id: string, qty: number) => void;
  /** A price typed in the box, already checked and written as 3.99. It changes the print only. */
  onPriceChange?: (id: string, price: string) => void;
  /** Makes a one-off price the store's own price (a button on the row, shown when the box differs from storePrice). */
  onSavePrice?: (id: string) => void;
  savingPriceId?: string | null;
  onRemove: (id: string) => void;
  onPrint: () => void;
  onClear: () => void;
  printLabelText?: string;
}

// Review-before-you-print panel: sits beside the catalog/store table once
// anything is selected, so quantity, price, and print-readiness are all
// edited in one place right before the print run, instead of scattered
// across an inline table column plus a separate modal.
// The price box of one row. What is typed here is checked as a price (a "$" is not kept, "3.9" is 3.90) and only changes the print.
function TrayPriceBox({ item, onCommit, onProblem }: { item: PrintTrayItem; onCommit: (id: string, price: string) => void; onProblem: (id: string, has: boolean) => void }) {
  const shown = item.priceText ?? '';
  const [text, setText] = useState(shown);
  useEffect(() => { setText(shown); }, [shown]);
  const problem = priceProblem(text);
  useEffect(() => { onProblem(item.id, !!problem); }, [problem, item.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onProblem(item.id, false), [item.id]);   // eslint-disable-line react-hooks/exhaustive-deps

  function commit() {
    const price = canonicalPrice(text);
    if (text.trim() === '') { setText(shown); return; }
    if (price && price !== item.priceText) onCommit(item.id, price);
    else if (price) setText(price);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <input
        style={{ ...s.priceInput, ...(problem ? s.priceInputBad : {}) }}
        value={text}
        onChange={e => setText(e.target.value.replace(/[^0-9.]/g, ''))}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
        placeholder="0.00"
        inputMode="decimal"
        maxLength={6}
        aria-label={`Print price for ${item.productName}`}
        aria-invalid={!!problem}
      />
      {problem && <span role="alert" style={s.priceProblem}>Use a price like 3.99</span>}
    </div>
  );
}

export default function PrintTray({
  items, editablePrice = false, onQuantityChange, onPriceChange, onSavePrice, savingPriceId = null, onRemove, onPrint, onClear,
  printLabelText = 'Print',
}: PrintTrayProps) {
  const totalCopies = items.reduce((sum, i) => sum + i.quantity, 0);
  // A row whose price box holds something that is not a price keeps the tray from printing
  const [badPrices, setBadPrices] = useState<Set<string>>(new Set());
  const setProblem = (id: string, has: boolean) => setBadPrices(prev => {
    if (prev.has(id) === has) return prev;
    const next = new Set(prev);
    if (has) next.add(id); else next.delete(id);
    return next;
  });
  const blocked = badPrices.size > 0;

  return (
    <div style={s.tray} role="region" aria-label="Labels to print">
      <div style={s.header}>
        <div style={s.headerTop}>
          <span style={s.title}>Selected ({items.length})</span>
          <button style={s.clearBtn} onClick={onClear}>Clear</button>
        </div>
        <div style={s.headerPrintRow}>
          <span style={s.totalInline}><span style={s.totalCount}>{totalCopies}</span> total copies</span>
          <button style={{ ...s.printBtn, ...(items.length === 0 || blocked ? s.printBtnDim : {}) }} onClick={onPrint} disabled={items.length === 0 || blocked}
            title={blocked ? 'Fix the price shown in red first' : undefined}>
            🖨️ {printLabelText} ({totalCopies})
          </button>
          {blocked && <span role="alert" style={s.priceProblem}>Fix the price shown in red before printing.</span>}
        </div>
      </div>

      <div style={s.list}>
        {items.map(item => (
          <div key={item.id} style={s.row}>
            <div style={s.rowTop}>
              <span style={s.name}>{item.productName}</span>
              <button style={s.removeBtn} onClick={() => onRemove(item.id)} aria-label={`Remove ${item.productName}`}>✕</button>
            </div>

            <div style={s.rowBottom}>
              <div style={s.priceWrap}>
                <span style={s.dollar}>$</span>
                {editablePrice && onPriceChange ? (
                  <TrayPriceBox item={item} onCommit={onPriceChange} onProblem={setProblem} />
                ) : (
                  <span style={s.priceStatic}>{item.priceText ?? 'not set'}</span>
                )}
              </div>
              <div style={s.qtyWrap}>
                <button style={s.qtyBtn} onClick={() => onQuantityChange(item.id, Math.max(1, item.quantity - 1))} aria-label={`One fewer ${item.productName}`}>−</button>
                <input
                  type="number"
                  min={1}
                  max={999}
                  style={s.qtyInput}
                  value={item.quantity}
                  onChange={e => onQuantityChange(item.id, Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))}
                  aria-label={`Copies of ${item.productName}`}
                />
                <button style={s.qtyBtn} onClick={() => onQuantityChange(item.id, Math.min(999, item.quantity + 1))} aria-label={`One more ${item.productName}`}>+</button>
              </div>
            </div>

            {onSavePrice && item.storePrice !== undefined && item.priceText !== null && item.priceText !== item.storePrice && (
              <div style={s.oneOff}>
                <span>One-off price: this store's price is {item.storePrice === null ? 'not set' : `$${item.storePrice}`}. It prints, but the label stays in the queue.</span>
                <button
                  type="button"
                  style={s.saveBtn}
                  onClick={() => onSavePrice(item.id)}
                  disabled={savingPriceId === item.id}
                >
                  {savingPriceId === item.id ? 'Saving…' : "Save as this store's price"}
                </button>
              </div>
            )}

            <div style={s.badgeRow}>
              {item.hasOverride && <span style={s.overrideBadge}>override</span>}
              {item.status && (
                <span style={{ ...s.statusBadge, color: STATUS_COLOR[item.status], background: STATUS_BG[item.status] }}>
                  {STATUS_LABEL[item.status]}{item.ageLabel ? ` · ${item.ageLabel}` : ''}
                </span>
              )}
              {item.dealText && <span style={s.dealBadge}>{item.dealText}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  tray: {
    width: 300, maxWidth: '100%', flexShrink: 0, position: 'sticky' as const, top: 20, alignSelf: 'flex-start',
    background: '#fff', borderRadius: 14, border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 60px)',
  },
  header: {
    display: 'flex', flexDirection: 'column', gap: 10,
    padding: '14px 16px', borderBottom: '1px solid #f0f0f5',
  },
  headerTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: 800, color: PRIMARY },
  clearBtn: { background: 'none', border: 'none', color: TEXT_MUTED, fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  headerPrintRow: { display: 'flex', flexDirection: 'column', gap: 8 },
  totalInline: { fontSize: 12.5, color: TEXT_MUTED },

  list: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: 4 },
  row: { padding: '10px 6px', borderBottom: '1px solid #f5f5f8' },
  rowTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  name: { fontSize: 13.5, fontWeight: 700, color: PRIMARY, flex: 1, minWidth: 0 },
  removeBtn: {
    background: 'none', border: 'none', color: TEXT_MUTED, cursor: 'pointer',
    fontSize: 13, lineHeight: 1, padding: 2, flexShrink: 0,
  },

  rowBottom: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8 },
  priceWrap: { display: 'flex', alignItems: 'center', gap: 2 },
  dollar: { fontSize: 13, fontWeight: 700, color: '#667' },
  priceStatic: { fontSize: 14, fontWeight: 700, color: PRIMARY },
  priceInput: {
    width: 64, border: '1.5px solid #ddd', borderRadius: 8, padding: '4px 6px',
    fontSize: 13.5, fontWeight: 700, outline: 'none',
  },

  priceInputBad: { border: '1.5px solid #b91c1c', background: '#fff5f5' },
  priceProblem: { fontSize: 12, color: '#b91c1c', fontWeight: 600 },
  oneOff: {
    display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, padding: '8px 10px',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#7c5a10', lineHeight: 1.4,
  },
  saveBtn: {
    alignSelf: 'flex-start', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 7,
    padding: '5px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },

  qtyWrap: { display: 'flex', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 22, height: 22, borderRadius: 6, border: '1.5px solid #ddd', background: '#fafafa',
    cursor: 'pointer', fontSize: 13, fontWeight: 700, lineHeight: 1, color: '#444',
  },
  qtyInput: {
    width: 38, padding: '3px 4px', borderRadius: 6, border: '1.5px solid #ddd',
    fontSize: 13, textAlign: 'center' as const,
  },

  badgeRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, marginTop: 6 },
  overrideBadge: {
    fontSize: 10.5, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 6px',
  },
  statusBadge: { fontSize: 10.5, fontWeight: 700, borderRadius: 6, padding: '2px 6px' },
  dealBadge: { fontSize: 11.5, fontWeight: 600, color: '#b7791f' },

  totalCount: { fontWeight: 800, color: PRIMARY, fontSize: 13.5 },
  printBtn: {
    width: '100%', padding: '11px 16px', borderRadius: 10, background: '#0f5132', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
  },
  printBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};
