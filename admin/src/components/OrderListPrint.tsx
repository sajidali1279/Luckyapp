// Print an order list (2026-11-11): with each item's barcode, so the order can be made from it (scanned at the vendor's or keyed into
// PDI) and ticked off when it is ordered and when it arrives, like the phone app's printout. Options: which items, barcodes, tick boxes,
// grouped by category. Barcodes come from GET /order-lists/:id/barcodes (the store's PDI list, then Scanned products, then Labels, by the
// item's name) and are drawn into the page itself (utils/code128.ts), so the printout needs no network.
import { useState } from 'react';
import toast from 'react-hot-toast';
import { orderListApi } from '../services/api';
import { code128ToSvg } from '../utils/code128';
import { serverMessage } from '../lib/apiError';
import { C, FONT, TEXT_MUTED } from '../lib/theme';
import { Button } from './kit';
import Modal from './Modal';

type Status = 'PENDING' | 'ORDERED' | 'RECEIVED' | 'REMOVED';
export interface PrintableItem {
  id: string; name: string; quantity?: string | null; category?: string | null; notes?: string | null;
  priority: 'URGENT' | 'NORMAL' | 'LOW'; status: Status; source: string;
}
export interface PrintableList { id: string; name: string; openedAt: string; openedBy: { name: string }; store: { name: string }; items: PrintableItem[] }
type Which = 'TO_ORDER' | 'TO_CHECK' | 'ALL';
interface Options { which: Which; barcodes: boolean; ordered: boolean; received: boolean; grouped: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const STATUS_WORD: Record<Status, string> = { PENDING: 'To order', ORDERED: 'Ordered', RECEIVED: 'Received', REMOVED: '' };

export function pickItems(items: PrintableItem[], which: Which): PrintableItem[] {
  const live = items.filter((i) => i.status !== 'REMOVED');
  if (which === 'TO_ORDER') return live.filter((i) => i.status === 'PENDING');
  if (which === 'TO_CHECK') return live.filter((i) => i.status === 'PENDING' || i.status === 'ORDERED');
  return live;
}

export function buildPrintHtml(list: PrintableList, o: Options, barcodes: Record<string, { barcode: string }>): string {
  const rank = (i: PrintableItem) => (i.priority === 'URGENT' ? 0 : i.priority === 'NORMAL' ? 1 : 2);
  const items = pickItems(list.items, o.which).sort((a, b) => rank(a) - rank(b));
  const groups = new Map<string, PrintableItem[]>();
  for (const it of items) {
    const k = o.grouped ? it.category || 'Other' : '';
    groups.set(k, [...(groups.get(k) ?? []), it]);
  }
  let n = 0;
  // Compact rows (owner 2026-11-26: at least 30 items a page): short bars with the digits beside them, one line per item, the tick box
  // titles once in the heading (repeated on each page) instead of under every box. About 33 items a page with barcodes, more without.
  const box = (done: boolean) => `<td class="tick"><div class="box">${done ? '&#10003;' : ''}</div></td>`;
  const row = (it: PrintableItem) => {
    n++;
    const code = barcodes[it.id]?.barcode;
    let bar = '<div class="nocode">No barcode</div>';
    if (o.barcodes && code) {
      try {
        const { rects, modules } = code128ToSvg(code, 20, 4);
        bar = `<div class="codewrap"><svg class="bars" viewBox="0 0 ${modules} 20" preserveAspectRatio="none">${rects}</svg><span class="digits">${esc(code)}</span></div>`;
      } catch { /* a code CODE128 cannot hold: shown as text */ bar = `<div class="digits">${esc(code)}</div>`; }
    }
    const tags = [it.priority === 'URGENT' ? '<span class="tag urgent">URGENT</span>' : '', it.source === 'EMPLOYEE_REQUEST' ? '<span class="tag">Staff request</span>' : '',
      o.which !== 'TO_ORDER' && it.status !== 'PENDING' ? `<span class="tag">${STATUS_WORD[it.status]}</span>` : ''].join('');
    return `<tr>
      <td class="num">${n}</td>
      ${o.barcodes ? `<td class="code">${bar}</td>` : ''}
      <td class="item"><span class="name">${esc(it.name)}</span>${it.quantity ? `<span class="meta"> &nbsp;<b>Qty:</b> ${esc(it.quantity)}</span>` : ''}${it.notes ? `<span class="meta"> &nbsp;·&nbsp; ${esc(it.notes)}</span>` : ''}${tags}</td>
      ${o.ordered ? box(it.status === 'ORDERED' || it.status === 'RECEIVED') : ''}
      ${o.received ? box(it.status === 'RECEIVED') : ''}
    </tr>`;
  };
  const cols = 2 + (o.barcodes ? 1 : 0) + (o.ordered ? 1 : 0) + (o.received ? 1 : 0);
  const head = `<thead><tr><th class="num">#</th>${o.barcodes ? '<th>Barcode</th>' : ''}<th>Item</th>${o.ordered ? '<th class="tick">Ordered</th>' : ''}${o.received ? '<th class="tick">Received</th>' : ''}</tr></thead>`;
  const body = [...groups.entries()].map(([g, its]) => (g ? `<tr class="group"><td colspan="${cols}">${esc(g)} (${its.length})</td></tr>` : '') + its.map(row).join('')).join('');
  const which = o.which === 'TO_ORDER' ? 'Items to order' : o.which === 'TO_CHECK' ? 'Items to order and ordered, to check the delivery' : 'Every item';
  const opened = new Date(list.openedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(list.name)}</title><style>
    @page { margin: 10mm; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 16px; }
    @media print { body { padding: 0; } }
    h1 { font-size: 17px; margin: 0 0 1px; } .sub { font-size: 11px; color: #5a6472; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; }
    thead { display: table-header-group; }
    th { font-size: 9px; font-weight: 800; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; text-align: left; padding: 2px 6px; border-bottom: 1.5px solid #111827; }
    tr { page-break-inside: avoid; } td { border-bottom: 1px solid #e4e7ec; padding: 1px 6px; vertical-align: middle; height: 21px; }
    .group td { background: #f1f3f6; font-weight: 800; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #374151; padding: 2px 6px; height: auto; }
    .num { width: 20px; color: #6b7280; font-size: 10px; text-align: right; }
    .code { width: 245px; } .codewrap { display: flex; align-items: center; gap: 6px; }
    .bars { width: 140px; height: 20px; display: block; fill: #000; flex-shrink: 0; } .digits { font-family: Consolas, monospace; font-size: 10px; letter-spacing: .5px; white-space: nowrap; }
    .nocode { font-size: 10px; color: #9ca3af; font-style: italic; }
    .name { font-weight: 700; font-size: 12px; } .meta { font-size: 11px; color: #374151; }
    .tag { display: inline-block; font-size: 9px; font-weight: 800; padding: 0 5px; border: 1px solid #9ca3af; border-radius: 8px; margin-left: 4px; }
    .tag.urgent { border-color: #c42130; color: #c42130; }
    .tick { width: 54px; text-align: center; } .box { width: 15px; height: 15px; border: 1.5px solid #111827; border-radius: 3px; margin: 0 auto; font-size: 12px; line-height: 15px; font-weight: 800; }
    th.tick { text-align: center; }
    .foot { margin-top: 8px; font-size: 10px; color: #9ca3af; display: flex; justify-content: space-between; }
    .sign { margin-top: 12px; font-size: 12px; color: #374151; } .sign span { display: inline-block; width: 220px; border-bottom: 1px solid #111827; margin: 0 18px 0 6px; }
  </style></head><body>
  <h1>${esc(list.name)}</h1>
  <div class="sub">${esc(list.store.name)} &nbsp;·&nbsp; opened ${opened} by ${esc(list.openedBy.name)} &nbsp;·&nbsp; ${which}: ${items.length}</div>
  <table>${body ? head : ''}<tbody>${body || `<tr><td>Nothing to print.</td></tr>`}</tbody></table>
  ${o.ordered || o.received ? `<div class="sign">Ordered by<span></span> Date<span style="width:110px"></span></div><div class="sign">Received by<span></span> Date<span style="width:110px"></span></div>` : ''}
  <div class="foot"><span>Lucky Stop order list</span><span>Printed ${new Date().toLocaleString('en-US')}</span></div>
  </body></html>`;
}

export default function OrderListPrint({ list, onClose }: { list: PrintableList; onClose: () => void }) {
  const [o, setO] = useState<Options>({ which: 'TO_ORDER', barcodes: true, ordered: true, received: true, grouped: true });
  const [busy, setBusy] = useState(false);
  const count = (w: Which) => pickItems(list.items, w).length;
  const go = async () => {
    // the window is opened at the click (a popup blocker allows that), then filled once the barcodes are in
    const win = window.open('', '_blank');
    if (!win) { toast.error('Popups are blocked. Allow popups for this site to print.'); return; }
    win.document.write('<p style="font-family:sans-serif;padding:20px">Getting the barcodes…</p>');
    setBusy(true);
    try {
      const codes = o.barcodes ? ((await orderListApi.barcodes(list.id)).data?.data ?? {}) : {};
      win.document.open();
      win.document.write(buildPrintHtml(list, o, codes));
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
      onClose();
    } catch (e) {
      win.close();
      toast.error(serverMessage(e, 'The list could not be printed. Try again.'));
    } finally { setBusy(false); }
  };
  const radio = (w: Which, label: string, hint: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: 'pointer', fontSize: FONT.body }}>
      <input type="radio" name="olp-which" checked={o.which === w} onChange={() => setO({ ...o, which: w })} style={{ marginTop: 3 }} />
      <span><strong>{label} ({count(w)})</strong><span style={{ display: 'block', fontSize: FONT.small, color: TEXT_MUTED }}>{hint}</span></span>
    </label>
  );
  const tick = (k: 'barcodes' | 'ordered' | 'received' | 'grouped', label: string) => (
    <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: FONT.body }}>
      <input type="checkbox" checked={o[k]} onChange={(e) => setO({ ...o, [k]: e.target.checked })} /> {label}
    </label>
  );
  return (
    <Modal title="Print the order list" subtitle={`${list.store.name} · ${list.name}`} onClose={onClose} busy={busy} maxWidth={480}>
      <div style={{ display: 'grid', gap: 14 }}>
        <div role="radiogroup" aria-label="Which items" style={{ display: 'grid', gap: 10 }}>
          {radio('TO_ORDER', 'Items to order', 'To make the order: what is still needed.')}
          {radio('TO_CHECK', 'To order and ordered', 'To check the delivery: what was ordered, and what is still needed.')}
          {radio('ALL', 'Every item', 'Including what was received.')}
        </div>
        <div style={{ display: 'grid', gap: 8, borderTop: `1px solid ${C.border}`, paddingTop: 12 }}>
          {tick('barcodes', 'Barcodes (from the PDI list, Scanned products and Labels)')}
          {tick('ordered', 'An "Ordered" box to tick')}
          {tick('received', 'A "Received" box to tick')}
          {tick('grouped', 'Grouped by category')}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={() => void go()} disabled={busy || count(o.which) === 0}>{busy ? 'Getting barcodes…' : 'Print'}</Button>
        </div>
      </div>
    </Modal>
  );
}
