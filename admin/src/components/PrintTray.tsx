import { CSSProperties } from 'react';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { LabelPrintStatus, STATUS_LABEL, STATUS_COLOR, STATUS_BG } from '../utils/labelStatus';

export interface PrintTrayItem {
  id: string;
  productName: string;
  priceText: string;
  dealText?: string | null;
  quantity: number;
  status?: Exclude<LabelPrintStatus, 'not_added'>;
  ageLabel?: string;
  hasOverride?: boolean;
}

interface PrintTrayProps {
  items: PrintTrayItem[];
  editablePrice?: boolean;
  onQuantityChange: (id: string, qty: number) => void;
  onPriceChange?: (id: string, price: string) => void;
  onRemove: (id: string) => void;
  onPrint: () => void;
  onClear: () => void;
  printLabelText?: string;
}

// Review-before-you-print panel: sits beside the catalog/store table once
// anything is selected, so quantity, price, and print-readiness are all
// edited in one place right before the print run, instead of scattered
// across an inline table column plus a separate modal.
export default function PrintTray({
  items, editablePrice = false, onQuantityChange, onPriceChange, onRemove, onPrint, onClear,
  printLabelText = 'Print',
}: PrintTrayProps) {
  const totalCopies = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <div style={s.tray}>
      <div style={s.header}>
        <div style={s.headerTop}>
          <span style={s.title}>Selected ({items.length})</span>
          <button style={s.clearBtn} onClick={onClear}>Clear</button>
        </div>
        <div style={s.headerPrintRow}>
          <span style={s.totalInline}><span style={s.totalCount}>{totalCopies}</span> total copies</span>
          <button style={{ ...s.printBtn, ...(items.length === 0 ? s.printBtnDim : {}) }} onClick={onPrint} disabled={items.length === 0}>
            🖨️ {printLabelText} ({totalCopies})
          </button>
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
                  <input
                    key={item.id}
                    style={s.priceInput}
                    defaultValue={item.priceText}
                    onBlur={e => {
                      const v = e.target.value.trim();
                      if (v && v !== item.priceText) onPriceChange(item.id, v);
                    }}
                  />
                ) : (
                  <span style={s.priceStatic}>{item.priceText}</span>
                )}
              </div>
              <div style={s.qtyWrap}>
                <button style={s.qtyBtn} onClick={() => onQuantityChange(item.id, Math.max(1, item.quantity - 1))}>−</button>
                <input
                  type="number"
                  min={1}
                  max={999}
                  style={s.qtyInput}
                  value={item.quantity}
                  onChange={e => onQuantityChange(item.id, Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)))}
                />
                <button style={s.qtyBtn} onClick={() => onQuantityChange(item.id, Math.min(999, item.quantity + 1))}>+</button>
              </div>
            </div>

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
    width: 300, flexShrink: 0, position: 'sticky' as const, top: 20, alignSelf: 'flex-start',
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
