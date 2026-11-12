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
  const box = (label: string, done: boolean) => `<td class="tick"><div class="box">${done ? '&#10003;' : ''}</div><div class="tick-label">${label}</div></td>`;
  const row = (it: PrintableItem) => {
    n++;
    const code = barcodes[it.id]?.barcode;
    let bar = '<div class="nocode">No barcode</div>';
    if (o.barcodes && code) {
      try {
        const { rects, modules } = code128ToSvg(code, 34, 4);
        bar = `<svg class="bars" viewBox="0 0 ${modules} 34" preserveAspectRatio="none">${rects}</svg><div class="digits">${esc(code)}</div>`;
      } catch { /* a code CODE128 cannot hold: shown as text */ bar = `<div class="digits">${esc(code)}</div>`; }
    }
    const tags = [it.priority === 'URGENT' ? '<span class="tag urgent">URGENT</span>' : '', it.source === 'EMPLOYEE_REQUEST' ? '<span class="tag">Staff request</span>' : '',
      o.which !== 'TO_ORDER' && it.status !== 'PENDING' ? `<span class="tag">${STATUS_WORD[it.status]}</span>` : ''].join('');
    return `<tr>
      <td class="num">${n}</td>
      ${o.barcodes ? `<td class="code">${bar}</td>` : ''}
      <td class="item"><div class="name">${esc(it.name)}</div>
        <div class="meta">${it.quantity ? `<b>Qty:</b> ${esc(it.quantity)}` : ''}${it.notes ? ` &nbsp;·&nbsp; ${esc(it.notes)}` : ''} ${tags}</div></td>
      ${o.ordered ? box('Ordered', it.status === 'ORDERED' || it.status === 'RECEIVED') : ''}
      ${o.received ? box('Received', it.status === 'RECEIVED') : ''}
    </tr>`;
  };
  const cols = 2 + (o.barcodes ? 1 : 0) + (o.ordered ? 1 : 0) + (o.received ? 1 : 0);
  const body = [...groups.entries()].map(([g, its]) => (g ? `<tr class="group"><td colspan="${cols}">${esc(g)} (${its.length})</td></tr>` : '') + its.map(row).join('')).join('');
  const which = o.which === 'TO_ORDER' ? 'Items to order' : o.which === 'TO_CHECK' ? 'Items to order and ordered, to check the delivery' : 'Every item';
  const opened = new Date(list.openedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(list.name)}</title><style>
    @page { margin: 12mm; }
    body { font-family: -apple-system, 'Segoe UI', Arial, sans-serif; color: #111827; margin: 0; padding: 20px; }
    h1 { font-size: 20px; margin: 0 0 2px; } .sub { font-size: 13px; color: #5a6472; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    tr { page-break-inside: avoid; } td { border-bottom: 1px solid #e4e7ec; padding: 8px 6px; vertical-align: middle; }
    .group td { background: #f1f3f6; font-weight: 800; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #374151; padding: 6px; }
    .num { width: 22px; color: #6b7280; font-size: 12px; text-align: right; }
    .code { width: 190px; } .bars { width: 180px; height: 34px; display: block; fill: #000; } .digits { font-family: Consolas, monospace; font-size: 11px; letter-spacing: 1px; text-align: center; width: 180px; }
    .nocode { font-size: 11px; color: #9ca3af; font-style: italic; }
    .name { font-weight: 700; font-size: 14px; } .meta { font-size: 12px; color: #374151; margin-top: 2px; }
    .tag { display: inline-block; font-size: 10px; font-weight: 800; padding: 1px 6px; border: 1px solid #9ca3af; border-radius: 8px; margin-left: 4px; }
    .tag.urgent { border-color: #c42130; color: #c42130; }
    .tick { width: 62px; text-align: center; } .box { width: 22px; height: 22px; border: 2px solid #111827; border-radius: 4px; margin: 0 auto; font-size: 16px; line-height: 22px; font-weight: 800; }
    .tick-label { font-size: 9px; color: #6b7280; margin-top: 2px; text-transform: uppercase; }
    .foot { margin-top: 18px; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
    .sign { margin-top: 24px; font-size: 12px; color: #374151; } .sign span { display: inline-block; width: 220px; border-bottom: 1px solid #111827; margin: 0 18px 0 6px; }
  </style></head><body>
  <h1>${esc(list.name)}</h1>
  <div class="sub">${esc(list.store.name)} &nbsp;·&nbsp; opened ${opened} by ${esc(list.openedBy.name)} &nbsp;·&nbsp; ${which}: ${items.length}</div>
  <table><tbody>${body || `<tr><td>Nothing to print.</td></tr>`}</tbody></table>
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
