import { Table, TableHeader, TableBody, TableFooter, TableRow, TableHead, TableCell } from './ui/table';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { BillNotes, fmt$, fmtPct } from '../utils/billingFormat';

export default function InvoiceModal({ record, period, onClose }: { record: any; period: string; onClose: () => void }) {
  // Manual/CUSTOM charges store `{ description }` in notes, not the full
  // compound BillNotes breakdown — keep both shapes straight so we don't
  // read categories/txCount/etc. off a record that never had them.
  const isManualCharge = record.billingType === 'CUSTOM';
  const n: BillNotes | null = isManualCharge ? null : record.notes;
  const manualDescription: string = isManualCharge ? (record.notes?.description ?? '') : '';
  const store = record.store;
  const totalAmount = n ? n.totalAmountOwed : record.amount;
  const invNum = `INV-${period.replace('-', '')}-${record.id.slice(-6).toUpperCase()}`;

  const periodLabel = n?.periodStart && n?.periodEnd
    ? `${new Date(n.periodStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(n.periodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
    : period;

  const issueDate = n?.periodEnd
    ? new Date(n.periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  function handlePrint() {
    const el = document.getElementById('invoice-print-area');
    if (!el) return;
    const win = window.open('', '_blank', 'width=820,height=1000');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Invoice ${invNum}</title><style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,sans-serif}
      body{padding:48px;color:#1a1a1a;background:#fff;font-size:14px}
      h1{font-size:28px;font-weight:900;color:#1D3557;letter-spacing:2px}
      .header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:24px;border-bottom:2px solid #1D3557;margin-bottom:28px}
      .brand{font-size:20px;font-weight:900;color:#1D3557}.brand-sub{font-size:12px;color:#6c757d;margin-top:4px}
      .inv-num{font-size:12px;color:#6c757d;font-family:monospace;margin-top:4px}
      .meta-row{display:flex;gap:24px;margin-bottom:28px}
      .meta-box{flex:1;background:#f8f9fa;border-radius:8px;padding:16px}
      .meta-label{font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
      .meta-value{font-size:16px;font-weight:700;color:#1D3557}.meta-sub{font-size:12px;color:#6c757d;margin-top:3px}
      .meta-row-detail{display:flex;justify-content:space-between;font-size:13px;color:#495057;padding:3px 0}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead tr{background:#1D3557;color:#fff}
      th{text-align:left;padding:10px 14px;font-size:12px;font-weight:700}
      td{padding:10px 14px;font-size:13px;border-bottom:1px solid #eee;color:#1D3557}
      .text-right{text-align:right}.text-muted{color:#6c757d;font-size:11px;margin-top:2px}
      .subtotal td{background:#f8f9fa;font-weight:800}
      .total-row td{background:#1D3557;color:#fff;font-weight:800;font-size:15px}
      .notes-box{background:#f8f9fa;border-radius:8px;padding:16px;margin-bottom:24px}
      .notes-title{font-size:11px;font-weight:700;color:#6c757d;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px}
      .note-row{display:flex;justify-content:space-between;font-size:13px;color:#495057;padding:4px 0;border-bottom:1px solid #e9ecef}
      .paid-tag{background:#d1fae5;color:#065f46;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
      .unpaid-tag{background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700}
      .footer{margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#6c757d;text-align:center}
    </style></head><body>${el.innerHTML}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 400);
  }

  return (
    <div style={inv.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={inv.paper}>
        {/* Header */}
        <div style={inv.header}>
          <div>
            <div style={inv.headerBrand}>⛽ Lucky Stop</div>
            <div style={inv.headerSub}>Gas Station Loyalty Platform</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={inv.invTitle}>INVOICE</div>
            <div style={inv.invNum}>{invNum}</div>
          </div>
        </div>

        {/* Printable area */}
        <div id="invoice-print-area">
          <div className="header" style={{ display: 'none' }}>
            <div><div className="brand">⛽ Lucky Stop</div><div className="brand-sub">Gas Station Loyalty Platform</div></div>
            <div style={{ textAlign: 'right' }}><h1>INVOICE</h1><div className="inv-num">{invNum}</div></div>
          </div>

          {/* Bill To / Invoice Details */}
          <div style={inv.metaRow}>
            <div style={inv.metaBox}>
              <div style={inv.metaLabel}>Bill To</div>
              <div style={inv.metaValue}>{store?.name || (record.storeId ? 'Store' : '🔗 All Stores (Chain-wide)')}</div>
              {store?.city && <div style={inv.metaSub}>{store.city}</div>}
              {store?.address && <div style={inv.metaSub}>{store.address}</div>}
            </div>
            <div style={inv.metaBox}>
              <div style={inv.metaLabel}>Invoice Details</div>
              <div style={inv.metaDetail}><span>Invoice #</span><strong style={{ fontFamily: 'monospace' }}>{invNum}</strong></div>
              <div style={inv.metaDetail}><span>Issue Date</span><span>{issueDate}</span></div>
              <div style={inv.metaDetail}><span>Billing Period</span><span>{periodLabel}</span></div>
              <div style={inv.metaDetail}>
                <span>Status</span>
                <span style={record.isPaid ? inv.paidTag : inv.unpaidTag}>
                  {record.isPaid ? '✓ PAID' : '⏳ UNPAID'}
                </span>
              </div>
              {record.isPaid && record.paidAt && (
                <div style={inv.metaDetail}><span>Payment Date</span><span>{new Date(record.paidAt).toLocaleDateString()}</span></div>
              )}
            </div>
          </div>

          {/* Line items */}
          <Table style={inv.table}>
            <TableHeader>
              <TableRow>
                <TableHead style={inv.tableTh}>Description</TableHead>
                <TableHead style={{ ...inv.tableTh, textAlign: 'right' }}>Transactions</TableHead>
                <TableHead style={{ ...inv.tableTh, textAlign: 'right' }}>Purchase Volume</TableHead>
                <TableHead style={{ ...inv.tableTh, textAlign: 'right' }}>Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {n?.subscriptionFee != null && n.subscriptionFee > 0 && (
                <TableRow>
                  <TableCell style={inv.tableTd}>Monthly Subscription Fee</TableCell>
                  <TableCell style={{ ...inv.tableTd, textAlign: 'right', color: TEXT_MUTED }}> - </TableCell>
                  <TableCell style={{ ...inv.tableTd, textAlign: 'right', color: TEXT_MUTED }}> - </TableCell>
                  <TableCell style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 700 }}>{fmt$(n.subscriptionFee)}</TableCell>
                </TableRow>
              )}
              {isManualCharge && (
                <TableRow>
                  <TableCell style={inv.tableTd}>
                    <div style={{ fontWeight: 600 }}>{manualDescription || 'Manual Charge'}</div>
                  </TableCell>
                  <TableCell style={{ ...inv.tableTd, textAlign: 'right', color: TEXT_MUTED }}> - </TableCell>
                  <TableCell style={{ ...inv.tableTd, textAlign: 'right', color: TEXT_MUTED }}> - </TableCell>
                  <TableCell style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 700 }}>{fmt$(record.amount)}</TableCell>
                </TableRow>
              )}
              {n && n.categories && n.categories.length > 0
                ? n.categories.map((cat) => (
                    <TableRow key={cat.category}>
                      <TableCell style={inv.tableTd}>
                        <div style={{ fontWeight: 600 }}>Transaction Fee - {cat.category}</div>
                        <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>
                          Dev cut ({fmtPct(n.effectiveDevCutRate)}) + customer cashback ({fmtPct(n.effectiveCashbackRate)})
                        </div>
                      </TableCell>
                      <TableCell style={{ ...inv.tableTd, textAlign: 'right' }}>{cat.txCount}</TableCell>
                      <TableCell style={{ ...inv.tableTd, textAlign: 'right' }}>{fmt$(cat.purchaseVolume)}</TableCell>
                      <TableCell style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 600 }}>{fmt$(cat.devCutEarned + cat.cashbackIssued)}</TableCell>
                    </TableRow>
                  ))
                : n && (
                    <TableRow>
                      <TableCell style={inv.tableTd}>
                        <div style={{ fontWeight: 600 }}>Transaction Processing Fee</div>
                        <div style={{ fontSize: 13, color: TEXT_MUTED, marginTop: 2 }}>
                          Dev cut ({fmtPct(n.effectiveDevCutRate)}) + customer cashback ({fmtPct(n.effectiveCashbackRate)}) × {n.txCount} transactions
                        </div>
                      </TableCell>
                      <TableCell style={{ ...inv.tableTd, textAlign: 'right' }}>{n.txCount}</TableCell>
                      <TableCell style={{ ...inv.tableTd, textAlign: 'right' }}>{fmt$(n.purchaseVolume)}</TableCell>
                      <TableCell style={{ ...inv.tableTd, textAlign: 'right', fontWeight: 600 }}>{fmt$(n.transactionFee + n.cashbackFee)}</TableCell>
                    </TableRow>
                  )
              }
            </TableBody>
            <TableFooter>
              <TableRow style={{ background: '#f8f9fa' }}>
                <TableCell colSpan={3} style={{ ...inv.tableTd, fontWeight: 800, textAlign: 'right' }}>Subtotal</TableCell>
                <TableCell style={{ ...inv.tableTd, fontWeight: 800 }}>{fmt$(totalAmount)}</TableCell>
              </TableRow>
              <TableRow style={{ background: PRIMARY }}>
                <TableCell colSpan={3} style={{ ...inv.tableTd, fontWeight: 800, color: '#fff', textAlign: 'right', fontSize: 15 }}>Total Amount Owed</TableCell>
                <TableCell style={{ ...inv.tableTd, fontWeight: 800, color: '#fff', fontSize: 15 }}>{fmt$(totalAmount)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {/* Summary box */}
          {isManualCharge && (
            <div style={inv.notesBox}>
              <div style={inv.notesTitle}>Charge Reason</div>
              <div style={inv.noteRow}><span>{manualDescription || 'No reason provided'}</span></div>
            </div>
          )}
          {n && (
            <div style={inv.notesBox}>
              <div style={inv.notesTitle}>Bill Breakdown</div>
              <div style={inv.noteRow}><span>Purchase Volume</span><strong>{fmt$(n.purchaseVolume)}</strong></div>
              <div style={inv.noteRow}><span>Total Transactions Processed</span><strong>{n.txCount}</strong></div>
              {n.subscriptionFee > 0 && <div style={inv.noteRow}><span>Subscription Fee</span><strong>{fmt$(n.subscriptionFee)}</strong></div>}
              <div style={inv.noteRow}><span>Dev Cut ({fmtPct(n.effectiveDevCutRate)} of volume)</span><strong style={{ color: '#E63946' }}>{fmt$(n.devCutEarned)}</strong></div>
              <div style={inv.noteRow}><span>Customer Cashback Covered ({fmtPct(n.effectiveCashbackRate)} of volume)</span><strong style={{ color: '#F4A261' }}>{fmt$(n.customerCashback)}</strong></div>
              <div style={{ ...inv.noteRow, fontWeight: 800, fontSize: 14, borderBottom: 'none', paddingTop: 8 }}>
                <span>Total Amount Owed</span><strong style={{ color: PRIMARY }}>{fmt$(n.totalAmountOwed)}</strong>
              </div>
            </div>
          )}

          {/* Payment confirmation */}
          {record.isPaid && (
            <div style={{ background: '#d1fae5', borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <span style={{ fontSize: 24 }}>✓</span>
              <div>
                <div style={{ fontWeight: 800, color: '#065f46', fontSize: 15 }}>Payment Confirmed</div>
                {record.paidAt && <div style={{ fontSize: 15, color: '#047857', marginTop: 2 }}>
                  Paid on {new Date(record.paidAt).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                </div>}
              </div>
            </div>
          )}

          <div style={{ fontSize: 14, color: TEXT_MUTED, textAlign: 'center', padding: '16px 0 4px', borderTop: '1px solid #e9ecef' }}>
            Lucky Stop Loyalty Platform · Invoice generated {new Date().toLocaleDateString()} · For questions contact your account manager
          </div>
        </div>

        {/* Action buttons */}
        <div style={inv.actions}>
          <button style={inv.printBtn} onClick={handlePrint}>🖨️ Print / Save PDF</button>
          <button style={inv.closeBtn} onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}

const inv: Record<string, React.CSSProperties> = {
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

  metaRow: { display: 'flex', gap: 20, marginBottom: 28 },
  metaBox: { flex: 1, background: '#f8f9fa', borderRadius: 10, padding: '16px 20px' },
  metaLabel: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  metaValue: { fontSize: 17, fontWeight: 800, color: PRIMARY },
  metaSub: { fontSize: 15, color: TEXT_MUTED, marginTop: 3 },
  metaDetail: { display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#495057', padding: '4px 0', borderBottom: '1px solid rgba(0,0,0,0.04)' },
  paidTag: { background: '#d1fae5', color: '#065f46', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 700 },
  unpaidTag: { background: '#fef3c7', color: '#92400e', borderRadius: 4, padding: '2px 8px', fontSize: 13, fontWeight: 700 },

  table: { width: '100%', borderCollapse: 'collapse' as const, marginBottom: 24, borderRadius: 10, overflow: 'hidden' },
  tableTh: { background: PRIMARY, color: '#fff', padding: '10px 14px', fontSize: 14, fontWeight: 700, textAlign: 'left' as const },
  tableTd: { padding: '10px 14px', fontSize: 15, borderBottom: '1px solid #f0f1f2', color: PRIMARY, verticalAlign: 'top' as const },

  notesBox: { background: '#f8f9fa', borderRadius: 10, padding: '16px 20px', marginBottom: 20 },
  notesTitle: { fontSize: 13, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 10 },
  noteRow: { display: 'flex', justifyContent: 'space-between', fontSize: 15, color: '#495057', padding: '5px 0', borderBottom: '1px solid #e9ecef' },

  actions: { display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 20, marginTop: 8, borderTop: '1px solid #e9ecef' },
  printBtn: { padding: '10px 22px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  closeBtn: { padding: '10px 22px', background: '#e9ecef', color: '#495057', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 },
};
