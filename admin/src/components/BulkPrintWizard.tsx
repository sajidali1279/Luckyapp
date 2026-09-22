import { useState, CSSProperties } from 'react';
import toast from 'react-hot-toast';
import { useQueryClient } from '@tanstack/react-query';
import { labelsApi } from '../services/api';
import { printLabelsGrouped, PrintableLabelEntry } from '../utils/printLabels';
import { failureMessage } from '../lib/apiError';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import Modal from './Modal';

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

interface NotMarked {
  storeLabelId: string;
  productName: string | null;
  reason: 'gone' | 'no_price' | 'price_changed';
  printedPrice?: string;
  currentPrice?: string | null;
}

type Stage = 'review' | 'asking' | 'result';

// A single combined print job across every store in the queue (one window.open() call avoids the browser's multi-popup-per-click
// block). Each store's sheets are preceded by a heading page with its name, so the labels themselves (which never carry a store name -
// a generic shelf price tag, see printLabels.ts) can still be split apart correctly by whoever hands the stack out.
//
// Three steps: review the list, print, then say whether the labels really came out of the printer. Nothing is marked as printed until
// the person says yes, and each label is marked at the price that is on its paper (a price changed meanwhile keeps that label queued).
export default function BulkPrintWizard({ queue, onClose }: Props) {
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>('review');
  const [marking, setMarking] = useState(false);
  const [result, setResult] = useState<{ printed: number; notMarked: NotMarked[] } | null>(null);

  const allItems = queue.flatMap(g => g.items);
  const totalItems = allItems.length;
  const storeOf = new Map(queue.flatMap(g => g.items.map(i => [i.storeLabelId, g.storeName] as const)));

  function handlePrintAll() {
    const opened = printLabelsGrouped(queue.map(g => ({ storeName: g.storeName, entries: g.items.map(i => i.entry) })));
    if (!opened) {
      toast.error('Print window was blocked. Allow pop-ups and try again.');
      return;
    }
    setStage('asking');
  }

  function notPrinted() {
    setStage('review');
    toast('Nothing was marked. The labels are still in the queue. Print again, or Cancel.', { icon: 'ℹ️' });
  }

  async function markPrinted() {
    if (marking) return;
    setMarking(true);
    try {
      const res = await labelsApi.print(allItems.map(i => ({ storeLabelId: i.storeLabelId, quantity: i.entry.quantity, printedPrice: i.entry.label.priceText })));
      const data = res.data?.data ?? {};
      setResult({ printed: data.printedCount ?? 0, notMarked: data.notMarked ?? [] });
      setStage('result');
    } catch (e) {
      toast.error(failureMessage(e, 'The labels were not marked as printed. They are still in the queue.'));
    } finally {
      setMarking(false);
    }
  }

  function handleFinish() {
    ['labels-coverage', 'store-labels', 'labels-health-summary'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    onClose();
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

  if (stage === 'result' && result) {
    return (
      <Modal title="Bulk Print Complete" onClose={handleFinish} maxWidth={480}>
        <div style={m.summaryBody}>
          <div style={m.summaryRow}>
            ✓ Marked {plural(result.printed, 'label', 'labels')} as printed across {plural(queue.length, 'store', 'stores')}
          </div>
          {result.notMarked.length > 0 && (
            <div style={m.warn} role="note">
              <strong>{plural(result.notMarked.length, 'label stayed', 'labels stayed')} in the queue:</strong>
              <ul style={m.list}>
                {result.notMarked.map(n => (
                  <li key={n.storeLabelId}>
                    {n.productName ?? 'A label'} at {storeOf.get(n.storeLabelId) ?? 'a store'}:{' '}
                    {n.reason === 'gone' ? 'no longer in that store.'
                      : n.reason === 'no_price' ? 'no price now.'
                      : `printed at $${n.printedPrice}, but the price there is now ${n.currentPrice == null ? 'not set' : `$${n.currentPrice}`}.`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <button style={m.primaryBtn} onClick={handleFinish} autoFocus>Done</button>
      </Modal>
    );
  }

  if (stage === 'asking') {
    return (
      <Modal title="Did the labels print?" subtitle={`${plural(totalItems, 'label', 'labels')} across ${plural(queue.length, 'store', 'stores')}`} onClose={notPrinted} busy={marking} maxWidth={460}>
        <p style={m.para}>
          The print window is open. When the sheets have come out of the printer, answer here. Until you say yes, nothing is marked as printed, so a
          cancelled print or a paper jam does not clear anyone's queue.
        </p>
        <div style={m.actions}>
          <button style={m.skipBtn} onClick={notPrinted} disabled={marking}>No, keep them in the queue</button>
          <button style={{ ...m.primaryBtn, ...(marking ? m.primaryBtnDim : {}) }} onClick={markPrinted} disabled={marking}>
            {marking ? 'Saving…' : 'Yes, they printed'}
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Bulk Print" subtitle={`${plural(totalItems, 'label', 'labels')} across ${plural(queue.length, 'store', 'stores')}`} onClose={onClose} maxWidth={480}>
      <div style={m.itemList} role="list" aria-label="Labels to print, by store">
        {queue.map(group => (
          <div key={group.storeId} style={m.storeGroup} role="listitem">
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
        <button style={m.skipBtn} onClick={onClose}>Cancel</button>
        <button style={m.primaryBtn} onClick={handlePrintAll}>
          🖨️ Print All {totalItems}
        </button>
      </div>
    </Modal>
  );
}

const m: Record<string, CSSProperties> = {
  itemList: {
    display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 340, overflowY: 'auto',
    border: '1px solid #eee', borderRadius: 10, padding: '10px 12px',
  },
  storeGroup: { display: 'flex', flexDirection: 'column', gap: 2 },
  storeGroupName: { fontWeight: 800, fontSize: 13, color: PRIMARY, marginBottom: 2 },
  storeGroupCount: { fontWeight: 600, color: TEXT_MUTED },
  itemRow: { display: 'flex', justifyContent: 'space-between', padding: '5px 0 5px 10px', borderBottom: '1px solid #f5f5f8', fontSize: 13.5 },
  itemName: { fontWeight: 600, color: PRIMARY },
  itemPrice: { fontWeight: 700, color: PRIMARY },
  hint: { fontSize: 12.5, color: TEXT_MUTED, marginTop: -6 },

  para: { margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#333' },
  actions: { display: 'flex', gap: 10 },
  skipBtn: {
    flex: 1, background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  primaryBtn: {
    flex: 1, background: '#0f5132', color: '#fff', border: 'none',
    borderRadius: 10, padding: '11px 16px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  primaryBtnDim: { opacity: 0.6, cursor: 'not-allowed' },

  summaryBody: { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 15 },
  summaryRow: { color: PRIMARY },
  warn: {
    padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
    fontSize: 13.5, lineHeight: 1.5, color: '#7c5a10',
  },
  list: { margin: '6px 0 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 },
};
