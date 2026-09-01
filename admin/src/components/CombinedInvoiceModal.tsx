import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from './ui/table';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { BillNotes, fmt$ } from '../utils/billingFormat';

export default function CombinedInvoiceModal({ inv, onClose }: { inv: any; onClose: () => void }) {
  const invNum = `INV-${inv.period.replace('-', '')}-ALL`;
  const stores: any[] = [...inv.stores].sort((a: any, b: any) => (a.store?.name ?? '').localeCompare(b.store?.name ?? ''));

  // Aggregate totals from BillNotes
  const totalSubscription = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.subscriptionFee ?? 0), 0);
  const totalDevCut = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.devCutEarned ?? r.amount), 0);
  const totalCashback = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.customerCashback ?? 0), 0);
  const grandTotal = stores.reduce((sum: number, r: any) => sum + ((r.notes as BillNotes | null)?.totalAmountOwed ?? r.amount), 0);

  const issueDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const [year, month] = inv.period.split('-');
  const periodStart = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodEnd = new Date(Number(year), Number(month), 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  function handlePrint() {
    const el = document.getElementById('combined-invoice-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=900,height=1100');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invNum}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif}
      body{padding:48px;color:#1a1a1a;background:#fff;font-size:13px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #1D3557;margin-bottom:26px}
      .brand{font-size:22px;font-weight:900;color:#1D3557}.brand-sub{font-size:11px;color:#6c757d;margin-top:4px}
      h1{font-size:30px;font-weight:900;color:#1D3557;letter-spacing:2px}.inv-num{font-size:12px;color:#6c757d;font-family:monospace;margin-top:4px}
      .meta-row{display:flex;gap:20px;margin-bottom:26px}
      .meta-box{flex:1;background:#f8f9fa;border-radius:8px;padding:14px 16px}
      .meta-label{font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
      .meta-value{font-size:15px;font-weight:800;color:#1D3557}.meta-sub{font-size:11px;color:#6c757d;margin-top:2px}
      .meta-detail{display:flex;justify-content:space-between;font-size:12px;color:#495057;padding:2px 0}
      table{width:100%;border-collapse:collapse;margin-bottom:20px}
      thead tr{background:#1D3557;color:#fff}
      th{text-align:left;padding:9px 12px;font-size:11px;font-weight:700}
      th.text-right,td.text-right{text-align:right}
      td{padding:9px 12px;font-size:12px;border-bottom:1px solid #eee;color:#1D3557;vertical-align:top}
      tr.store-alt{background:#fafafa}
      tr.subtotal td{background:#f0f4f8;font-weight:700;font-size:13px}
      tr.grand-total td{background:#1D3557;color:#fff;font-weight:800;font-size:14px}
      .store-name{font-weight:700}.store-city{font-size:11px;color:#6c757d}
      .paid-tag{background:#d1fae5;color:#065f46;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:700;display:inline-block}
      .unpaid-tag{background:#fef3c7;color:#92400e;border-radius:3px;padding:1px 6px;font-size:10px;font-weight:700;display:inline-block}
      .summary-box{background:#f8f9fa;border-radius:8px;padding:14px 16px;margin-bottom:20px;display:flex;gap:16px;flex-wrap:wrap}
      .summary-item{flex:1 1 120px;text-align:center;padding:10px;background:#fff;border-radius:6px;border:1px solid #e9ecef}
      .summary-label{font-size:10px;font-weight:700;color:#6c757d;text-transform:uppercase;margin-bottom:4px}
      .summary-value{font-size:16px;font-weight:800;color:#1D3557}
      .paid-banner{background:#d1fae5;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px}
      .unpaid-banner{background:#fef3c7;border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;margin-bottom:16px}
      .footer{margin-top:28px;padding-top:14px;border-top:1px solid #eee;font-size:11px;color:#6c757d;text-align:center}
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div style={inv2.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={inv2.paper}>
        {/* Screen header */}
        <div style={inv2.header}>
          <div>
            <div style={inv2.headerBrand}>⛽ Lucky Stop</div>
            <div style={inv2.headerSub}>Gas Station Loyalty Platform</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={inv2.invTitle}>INVOICE</div>
            <div style={inv2.invNum}>{invNum}</div>
          </div>
        </div>

        {/* Printable area */}
        <div id="combined-invoice-print-area">
          <div className="header" style={{ display: 'none' }}>
            <div><div className="brand">⛽ Lucky Stop</div><div className="brand-sub">Gas Station Loyalty Platform</div></div>
            <div style={{ textAlign: 'right' }}><h1>INVOICE</h1><div className="inv-num">{invNum}</div></div>
          </div>

          {/* Meta */}
          <div style={inv2.metaRow}>
            <div style={inv2.metaBox}>
              <div style={inv2.metaLabel}>Bill To</div>
              <div style={inv2.metaValue}>Lucky Stop - All Stores</div>
              <div style={inv2.metaSub}>{stores.length} locations - consolidated invoice</div>
            </div>
            <div style={inv2.metaBox}>
              <div style={inv2.metaLabel}>Invoice Details</div>
              <div style={inv2.metaDetail}><span>Invoice #</span><strong style={{ fontFamily: 'monospace' }}>{invNum}</strong></div>
              <div style={inv2.metaDetail}><span>Issue Date</span><span>{issueDate}</span></div>
              <div style={inv2.metaDetail}><span>Billing Period</span><span>{periodStart} – {periodEnd}</span></div>
              <div style={inv2.metaDetail}><span>Stores Covered</span><span>{stores.length}</span></div>
              <div style={inv2.metaDetail}>
                <span>Status</span>
                <span style={inv.isPaid ? inv2.paidTag : inv2.unpaidTag}>
                  {inv.isPaid ? '✓ ALL PAID' : '⏳ OUTSTANDING'}
                </span>
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div style={inv2.summaryRow}>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Total Transactions</div><div style={inv2.summaryValue}>{inv.totalTxns}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Purchase Volume</div><div style={inv2.summaryValue}>{fmt$(inv.totalVolume)}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Subscription Fees</div><div style={inv2.summaryValue}>{fmt$(totalSubscription)}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Dev Cut</div><div style={{ ...inv2.summaryValue, color: '#E63946' }}>{fmt$(totalDevCut)}</div></div>
            <div style={inv2.summaryCard}><div style={inv2.summaryLabel}>Cashback Covered</div><div style={{ ...inv2.summaryValue, color: '#F4A261' }}>{fmt$(totalCashback)}</div></div>
          </div>

          {/* Per-store line items */}
          <Table style={inv2.table}>
            <TableHeader>
              <TableRow>
                <TableHead style={inv2.tableTh}>Store</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Txns</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Volume</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Subscription</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Dev Cut</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Cashback</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'right' as const }}>Total Owed</TableHead>
                <TableHead style={{ ...inv2.tableTh, textAlign: 'center' as const }}>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stores.map((r: any, i: number) => {
                const isManual = r.billingType === 'CUSTOM';
                const n: BillNotes | null = isManual ? null : r.notes;
                const manualDescription: string = isManual ? (r.notes?.description ?? '') : '';
                return (
                  <TableRow key={r.id} style={i % 2 === 1 ? { background: '#fafafa' } : undefined}>
                    <TableCell style={inv2.tableTd}>
                      <div style={{ fontWeight: 700 }}>{r.store?.name ?? '🔗 All Stores (Chain-wide)'}</div>
                      {r.store?.city && <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 1 }}>{r.store.city}</div>}
                      {isManual && <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 1 }}>{manualDescription || 'Manual charge'}</div>}
                    </TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'right' }}>{n?.txCount ?? 0}</TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'right' }}>{n ? fmt$(n.purchaseVolume) : ' - '}</TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'right' }}>{n?.subscriptionFee ? fmt$(n.subscriptionFee) : <span style={{ color: TEXT_MUTED }}> - </span>}</TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'right', color: '#E63946', fontWeight: 600 }}>{fmt$(n?.devCutEarned ?? r.amount)}</TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'right', color: '#F4A261' }}>{n ? fmt$(n.customerCashback) : ' - '}</TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 700 }}>{fmt$(n?.totalAmountOwed ?? r.amount)}</TableCell>
                    <TableCell style={{ ...inv2.tableTd, textAlign: 'center' }}>
                      <span style={r.isPaid ? inv2.paidTag : inv2.unpaidTag}>{r.isPaid ? '✓' : '⏳'}</span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow style={{ background: '#f0f4f8' }}>
                <TableCell style={{ ...inv2.tableTd, fontWeight: 800 }}>Subtotal ({stores.length} stores)</TableCell>
                <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{inv.totalTxns}</TableCell>
                <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{fmt$(inv.totalVolume)}</TableCell>
                <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{fmt$(totalSubscription)}</TableCell>
                <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800, color: '#E63946' }}>{fmt$(totalDevCut)}</TableCell>
                <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800, color: '#F4A261' }}>{fmt$(totalCashback)}</TableCell>
                <TableCell style={{ ...inv2.tableTd, textAlign: 'right', fontWeight: 800 }}>{fmt$(grandTotal)}</TableCell>
                <TableCell style={inv2.tableTd}></TableCell>
              </TableRow>
              <TableRow style={{ background: PRIMARY }}>
                <TableCell colSpan={6} style={{ ...inv2.tableTd, color: '#fff', fontWeight: 800, fontSize: 15, textAlign: 'right' }}>
                  Grand Total - All Stores
                </TableCell>
                <TableCell style={{ ...inv2.tableTd, color: '#fff', fontWeight: 900, fontSize: 16 }}>{fmt$(grandTotal)}</TableCell>
                <TableCell style={inv2.tableTd}></TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {/* Payment status banner */}
          {inv.isPaid ? (
            <div style={{ background: '#d1fae5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>✓</span>
              <div>
                <div style={{ fontWeight: 800, color: '#065f46', fontSize: 15 }}>All Stores - Payment Confirmed</div>
                {inv.paidAt && <div style={{ fontSize: 15, color: '#047857', marginTop: 2 }}>Paid on {new Date(inv.paidAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</div>}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fef3c7', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>⏳</span>
              <div>
                <div style={{ fontWeight: 800, color: '#92400e', fontSize: 15 }}>Payment Outstanding</div>
                <div style={{ fontSize: 15, color: '#b45309', marginTop: 2 }}>
                  {stores.filter((r: any) => !r.isPaid).length} of {stores.length} stores unpaid - use "Mark Paid" to confirm receipt
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: 14, color: TEXT_MUTED, textAlign: 'center', padding: '14px 0 4px', borderTop: '1px solid #e9ecef' }}>
            Lucky Stop Loyalty Platform · Invoice {invNum} · Generated {issueDate} · For questions contact your account manager
          </div>
        </div>

        {/* Actions */}
        <div style={inv2.actions}>
          <button style={inv2.printBtn} onClick={handlePrint}>🖨️ Print / Save PDF</button>
          <button style={inv2.closeBtn} onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}

const inv2: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
    zIndex: 300, display: 'flex', alignItems: 'flex-start',
    justifyContent: 'center', padding: '32px 20px', overflowY: 'auto',
  },
  paper: {
    background: '#fff', borderRadius: 16, width: '100%',
    boxShadow: '0 24px 64px rgba(0,0,0,0.28)', padding: '40px',
    position: 'relative', flexShrink: 0,
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    marginBottom: 32, paddingBottom: 24, borderBottom: '2px solid #1D3557',
  },
  headerBrand: { fontSize: 22, fontWeight: 900, color: PRIMARY },
  headerSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 4 },
  invTitle: { fontSize: 32, fontWeight: 900, color: PRIMARY, letterSpacing: 2 },
  invNum: { fontSize: 15, color: TEXT_MUTED, marginTop: 4, fontFamily: 'monospace' },

  metaRow: { display: 'flex', gap: 20, marginBottom: 24 },
  metaBox: { flex: 1, background: '#f8f9fa', borderRadius: 10, padding: '16px 20px' },
  metaLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  metaValue: { fontSize: 17, fontWeight: 800, color: PRIMARY },
  metaSub: { fontSize: 15, color: TEXT_MUTED, marginTop: 3 },
  metaDetail: { display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#495057', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' },
  paidTag: { background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 700 },
  unpaidTag: { background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 700 },

  summaryRow: { display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' as const },
  summaryCard: { flex: '1 1 120px', background: '#f8f9fa', borderRadius: 10, padding: '12px 14px', textAlign: 'center' as const, border: '1px solid #e9ecef' },
  summaryLabel: { fontSize: 12, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 4 },
  summaryValue: { fontSize: 16, fontWeight: 800, color: PRIMARY },

  table: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 20, borderRadius: 10, overflow: 'hidden' },
  tableTh: { background: PRIMARY, color: '#fff', padding: '10px 12px', fontSize: 13, fontWeight: 700, textAlign: 'left' as const },
  tableTd: { padding: '9px 12px', fontSize: 15, borderBottom: '1px solid #f0f1f2', color: PRIMARY, verticalAlign: 'middle' as const },

  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, marginTop: 8, borderTop: '1px solid #e9ecef' },
  printBtn: { padding: '10px 22px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  closeBtn: { padding: '10px 22px', background: '#e9ecef', color: '#495057', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
};
