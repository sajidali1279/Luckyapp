import { useState, CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { labelsApi } from '../services/api';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

export interface BulkPrintItem {
  storeLabelId: string;
  entry: PrintableLabelEntry;
}
export interface BulkPrintStoreGroup {
  storeId: string;
  storeName: string;
  items: BulkPrintItem[];
}

interface Props {
  queue: BulkPrintStoreGroup[];
  onClose: () => void;
}

// A single combined print job across every store in the queue — not a
// per-store wizard. The physical label itself never prints a store name
// (it's a generic shelf price tag, see printLabels.ts), so there's nothing
// store-specific to separate into its own popup; one window.open() call
// with every entry avoids the browser's multi-popup-per-click block
// entirely (that block only fires when a script opens several windows in
// one tick, which a single combined call never does).
export default function BulkPrintWizard({ queue, onClose }: Props) {
  const qc = useQueryClient();
  const [printing, setPrinting] = useState(false);
  const [result, setResult] = useState<{ printed: number; failed: boolean } | null>(null);

  const allItems = queue.flatMap(g => g.items);
  const totalItems = allItems.length;

  async function handlePrintAll() {
    if (printing) return;
    setPrinting(true);
    const opened = printLabels(allItems.map(i => i.entry));
    if (!opened) {
      toast.error('Print window was blocked — allow pop-ups and try again');
      setPrinting(false);
      return;
    }
    try {
      await labelsApi.print(allItems.map(i => ({ storeLabelId: i.storeLabelId, quantity: i.entry.quantity })));
      setResult({ printed: totalItems, failed: false });
    } catch {
      setResult({ printed: totalItems, failed: true });
    }
    setPrinting(false);
  }

  function handleFinish() {
    qc.invalidateQueries({ queryKey: ['labels-coverage'] });
    qc.invalidateQueries({ queryKey: ['store-labels'] });
    onClose();
  }

  if (result) {
    return (
      <div style={m.overlay}>
        <div style={m.modal}>
          <h3 style={m.title}>Bulk Print Complete</h3>
          <div style={m.summaryBody}>
            <div style={m.summaryRow}>
              ✓ Printed {result.printed} label{result.printed === 1 ? '' : 's'} across {queue.length} store{queue.length === 1 ? '' : 's'}
            </div>
            {result.failed && (
              <div style={{ ...m.summaryRow, color: '#c53030' }}>
                ⚠ Printed, but the status update failed for some stores — check By Store to confirm
              </div>
            )}
          </div>
          <button style={m.primaryBtn} onClick={handleFinish}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div style={m.overlay}>
      <div style={m.modal}>
        <div style={m.header}>
          <h3 style={m.title}>
            Bulk Print — {totalItems} label{totalItems === 1 ? '' : 's'} across {queue.length} store{queue.length === 1 ? '' : 's'}
          </h3>
          <button style={m.closeX} onClick={onClose} aria-label="Cancel bulk print">✕</button>
        </div>

        <div style={m.itemList}>
          {queue.map(group => (
            <div key={group.storeId} style={m.storeGroup}>
              <div style={m.storeGroupName}>
                {group.storeName} <span style={m.storeGroupCount}>({group.items.length})</span>
              </div>
              {group.items.map(i => (
                <div key={i.storeLabelId} style={m.itemRow}>
                  <span style={m.itemName}>{i.entry.label.productName}</span>
                  <span style={m.itemPrice}>${i.entry.label.priceText}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={m.hint}>All printed together as one job, 1 copy each</div>

        <div style={m.actions}>
          <button style={m.skipBtn} onClick={onClose} disabled={printing}>Cancel</button>
          <button style={{ ...m.primaryBtn, ...(printing ? m.primaryBtnDim : {}) }} onClick={handlePrintAll} disabled={printing}>
            {printing ? 'Printing…' : `🖨️ Print All ${totalItems}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const m: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 460,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 4 },
  title: { margin: 0, fontSize: 17, fontWeight: 800, color: PRIMARY },
  closeX: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: TEXT_MUTED, lineHeight: 1, flexShrink: 0 },

  itemList: {
    display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto',
    border: '1px solid #eee', borderRadius: 10, padding: '10px 12px', marginTop: 14,
  },
  storeGroup: { display: 'flex', flexDirection: 'column', gap: 2 },
  storeGroupName: { fontWeight: 800, fontSize: 13, color: PRIMARY, marginBottom: 2 },
  storeGroupCount: { fontWeight: 600, color: TEXT_MUTED },
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0 5px 10px', borderBottom: '1px solid #f5f5f8', fontSize: 13.5 },
  itemName: { fontWeight: 600, color: PRIMARY },
  itemPrice: { fontWeight: 700, color: PRIMARY },
  hint: { fontSize: 12.5, color: TEXT_MUTED, marginTop: 8 },

  actions: { display: 'flex', gap: 10, marginTop: 20 },
  skipBtn: {
    flex: 1, background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  primaryBtn: {
    flex: 1, background: '#0f5132', color: '#fff', border: 'none',
    borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  primaryBtnDim: { opacity: 0.6, cursor: 'not-allowed' },

  summaryBody: { display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 20px', fontSize: 15 },
  summaryRow: { color: PRIMARY },
};
