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

type StoreOutcome = 'pending' | 'printed' | 'skipped' | 'failed';

// A guided, one-store-at-a-time print queue — not a single combined print
// job. Browsers block more than one popup per user click, so firing a
// window.open() per store in a loop from a single button press would get
// most of them silently blocked; this instead makes each store's print a
// real click, while still turning "12 separate trips through By Store" into
// one continuous flow with the store dropdown/selection already done.
export default function BulkPrintWizard({ queue, onClose }: Props) {
  const qc = useQueryClient();
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<StoreOutcome[]>(() => queue.map(() => 'pending'));
  const [printing, setPrinting] = useState(false);

  const current = queue[index];
  const done = index >= queue.length;

  function setOutcome(i: number, outcome: StoreOutcome) {
    setOutcomes(prev => { const next = [...prev]; next[i] = outcome; return next; });
  }

  async function handlePrintCurrent() {
    if (!current || printing) return;
    setPrinting(true);
    const opened = printLabels(current.items.map(i => i.entry));
    if (!opened) {
      toast.error('Print window was blocked — allow pop-ups and try again');
      setPrinting(false);
      return;
    }
    try {
      await labelsApi.print(current.items.map(i => ({ storeLabelId: i.storeLabelId, quantity: i.entry.quantity })));
      setOutcome(index, 'printed');
    } catch {
      setOutcome(index, 'failed');
      toast.error(`Printed, but failed to update status for ${current.storeName} — check By Store to confirm`);
    }
    setPrinting(false);
    setIndex(i => i + 1);
  }

  function handleSkip() {
    setOutcome(index, 'skipped');
    setIndex(i => i + 1);
  }

  function handleFinish() {
    qc.invalidateQueries({ queryKey: ['labels-coverage'] });
    qc.invalidateQueries({ queryKey: ['store-labels'] });
    onClose();
  }

  if (done) {
    const printedCount = outcomes.filter(o => o === 'printed').length;
    const skippedCount = outcomes.filter(o => o === 'skipped').length;
    const failedCount = outcomes.filter(o => o === 'failed').length;
    return (
      <div style={m.overlay}>
        <div style={m.modal}>
          <h3 style={m.title}>Bulk Print Complete</h3>
          <div style={m.summaryBody}>
            <div style={m.summaryRow}>✓ Printed at {printedCount} of {queue.length} store{queue.length === 1 ? '' : 's'}</div>
            {skippedCount > 0 && <div style={m.summaryRow}>⏭ Skipped {skippedCount}</div>}
            {failedCount > 0 && (
              <div style={{ ...m.summaryRow, color: '#c53030' }}>⚠ {failedCount} printed but the status update failed — double-check By Store</div>
            )}
          </div>
          <button style={m.primaryBtn} onClick={handleFinish}>Done</button>
        </div>
      </div>
    );
  }

  if (!current) return null;

  return (
    <div style={m.overlay}>
      <div style={m.modal}>
        <div style={m.header}>
          <h3 style={m.title}>Bulk Print — Store {index + 1} of {queue.length}</h3>
          <button style={m.closeX} onClick={onClose} aria-label="Cancel bulk print">✕</button>
        </div>

        <div style={m.storeName}>{current.storeName}</div>

        <div style={m.itemList}>
          {current.items.map(i => (
            <div key={i.storeLabelId} style={m.itemRow}>
              <span style={m.itemName}>{i.entry.label.productName}</span>
              <span style={m.itemPrice}>${i.entry.label.priceText}</span>
            </div>
          ))}
        </div>
        <div style={m.hint}>{current.items.length} item{current.items.length === 1 ? '' : 's'} · 1 copy each</div>

        <div style={m.actions}>
          <button style={m.skipBtn} onClick={handleSkip} disabled={printing}>Skip This Store</button>
          <button style={{ ...m.primaryBtn, ...(printing ? m.primaryBtnDim : {}) }} onClick={handlePrintCurrent} disabled={printing}>
            {printing ? 'Printing…' : '🖨️ Print & Continue'}
          </button>
        </div>

        <div style={m.progressRow}>
          {queue.map((_, i) => (
            <div
              key={i}
              style={{
                ...m.progressDot,
                background: i < index
                  ? (outcomes[i] === 'printed' ? '#0f5132' : outcomes[i] === 'skipped' ? '#ccc' : '#c53030')
                  : i === index ? PRIMARY : '#e5e7eb',
              }}
            />
          ))}
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
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 420,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  title: { margin: 0, fontSize: 17, fontWeight: 800, color: PRIMARY },
  closeX: { background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', color: TEXT_MUTED, lineHeight: 1 },

  storeName: { fontSize: 22, fontWeight: 900, color: PRIMARY, marginTop: 10, marginBottom: 14 },

  itemList: {
    display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 220, overflowY: 'auto',
    border: '1px solid #eee', borderRadius: 10, padding: '4px 12px',
  },
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f5f5f8', fontSize: 14 },
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

  progressRow: { display: 'flex', gap: 5, justifyContent: 'center', marginTop: 18 },
  progressDot: { width: 8, height: 8, borderRadius: 4 },

  summaryBody: { display: 'flex', flexDirection: 'column', gap: 8, margin: '16px 0 20px', fontSize: 15 },
  summaryRow: { color: PRIMARY },
};
