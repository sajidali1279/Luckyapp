import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { superAdminApi } from '../services/api';
import { downloadInvoicePdf } from '../utils/invoicePdf';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';

function fmt$(n: number) { return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

function periodLabel(p: string) {
  const [y, m] = p.split('-').map(Number);
  return new Date(y, m - 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
}

export default function SuperAdminBilling() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['super-admin-invoices'],
    queryFn: () => superAdminApi.getInvoices(),
  });

  const invoices: any[] = data?.data?.data ?? [];

  const totalOutstanding = invoices.filter((i) => !i.isPaid).reduce((s: number, i: any) => s + i.totalDevCut, 0);
  const totalPaid = invoices.filter((i) => i.isPaid).reduce((s: number, i: any) => s + i.totalDevCut, 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>My Billing</h1>
          <p style={s.subtitle}>Monthly platform fee invoices from Lucky Stop developer</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={s.cards}>
        <div style={{ ...s.card, borderTop: '3px solid #E63946' }}>
          <div style={s.cardLabel}>Outstanding Balance</div>
          <div style={{ ...s.cardValue, color: totalOutstanding > 0 ? '#E63946' : '#2DC653' }}>{fmt$(totalOutstanding)}</div>
          <div style={s.cardSub}>{invoices.filter((i) => !i.isPaid).length} unpaid invoice{invoices.filter((i) => !i.isPaid).length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ ...s.card, borderTop: '3px solid #2DC653' }}>
          <div style={s.cardLabel}>Total Paid (All Time)</div>
          <div style={{ ...s.cardValue, color: '#2DC653' }}>{fmt$(totalPaid)}</div>
          <div style={s.cardSub}>{invoices.filter((i) => i.isPaid).length} paid invoice{invoices.filter((i) => i.isPaid).length !== 1 ? 's' : ''}</div>
        </div>
        <div style={{ ...s.card, borderTop: '3px solid #1D3557' }}>
          <div style={s.cardLabel}>Total Invoices</div>
          <div style={s.cardValue}>{invoices.length}</div>
          <div style={s.cardSub}>Since account creation</div>
        </div>
      </div>

      {/* Invoices Table */}
      <div style={s.tableWrap}>
        <div style={s.tableHeader}>
          <span style={s.tableTitle}>Invoice History</span>
        </div>

        {isLoading ? (
          <div style={s.empty}>Loading invoices…</div>
        ) : isError ? (
          <ErrorState message="Failed to load invoices." onRetry={refetch} />
        ) : invoices.length === 0 ? (
          <div style={s.empty}>No invoices yet.</div>
        ) : (
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                {['Invoice Period', 'Transactions', 'Purchase Volume', 'Cashback Issued', 'Platform Fee', 'Status'].map((h) => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv: any) => (
                <Fragment key={inv.period}>
                  <TableRow
                    style={{ ...s.tr, background: expanded === inv.period ? '#f0f4ff' : undefined }}
                    onClick={() => setExpanded(expanded === inv.period ? null : inv.period)}
                    aria-label={`${expanded === inv.period ? 'Collapse' : 'Expand'} store breakdown for ${periodLabel(inv.period)}`}
                  >
                    <TableCell style={s.td}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={s.expandBtn}>{expanded === inv.period ? '▼' : '▶'}</span>
                        <div>
                          <strong>{periodLabel(inv.period)}</strong>
                          <div style={s.sub}>{inv.stores.length} store{inv.stores.length !== 1 ? 's' : ''}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell style={s.td}>{inv.totalTxns.toLocaleString()}</TableCell>
                    <TableCell style={s.td}>{fmt$(inv.totalVolume)}</TableCell>
                    <TableCell style={s.td}>{fmt$(inv.totalCashback)}</TableCell>
                    <TableCell style={s.td}>
                      <strong style={{ color: '#E63946', fontSize: 16 }}>{fmt$(inv.totalDevCut)}</strong>
                      {inv.totalCashback > 0 && (
                        <div style={s.sub}>{fmtPct(inv.totalDevCut / inv.totalCashback)} of cashback</div>
                      )}
                    </TableCell>
                    <TableCell style={s.td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
                        {inv.isPaid ? (
                          <span style={s.badgePaid}>✓ Paid</span>
                        ) : (
                          <span style={s.badgeUnpaid}>Unpaid</span>
                        )}
                        {inv.isPaid && inv.paidAt && (
                          <div style={s.sub}>{new Date(inv.paidAt).toLocaleDateString()}</div>
                        )}
                        {inv.isPaid && (
                          <button
                            style={s.pdfBtn}
                            onClick={(e) => { e.stopPropagation(); downloadInvoicePdf(inv); }}
                          >
                            📄 PDF
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>

                  {expanded === inv.period && (
                    <TableRow>
                      <TableCell colSpan={6} style={s.expandedCell}>
                        <div style={s.storeBreakdown}>
                          <div style={s.breakdownTitle}>Store Breakdown</div>
                          <Table style={{ ...s.table, margin: 0 }}>
                            <TableHeader>
                              <TableRow>
                                {['Store', 'City', 'Transactions', 'Cashback Issued', 'Dev Cut'].map((h) => (
                                  <TableHead key={h} style={{ ...s.th, background: '#eef2ff', fontSize: 13 }}>{h}</TableHead>
                                ))}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {inv.stores
                                .sort((a: any, b: any) => b.amount - a.amount)
                                .map((row: any) => (
                                  <TableRow key={row.store.id} style={s.tr}>
                                    <TableCell style={s.td}><strong>{row.store.name}</strong></TableCell>
                                    <TableCell style={s.td}>{row.store.city}</TableCell>
                                    <TableCell style={s.td}>{row.txCount}</TableCell>
                                    <TableCell style={s.td}>{fmt$(row.cashbackIssued)}</TableCell>
                                    <TableCell style={{ ...s.td, color: '#E63946', fontWeight: 700 }}>{fmt$(row.amount)}</TableCell>
                                  </TableRow>
                                ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        )}

        {invoices.length > 0 && (
          <div style={s.footer}>
            {invoices.length} invoice{invoices.length !== 1 ? 's' : ''} &nbsp;·&nbsp;
            Outstanding: <strong style={{ color: '#E63946' }}>{fmt$(totalOutstanding)}</strong> &nbsp;·&nbsp;
            All-time paid: <strong style={{ color: '#2DC653' }}>{fmt$(totalPaid)}</strong>
          </div>
        )}
      </div>

      {/* Info box */}
      <div style={s.infoBox}>
        <div style={s.infoTitle}>About Platform Fees</div>
        <div style={s.infoText}>
          Platform fees are calculated as a percentage of the cashback credits issued to your customers each month. When your employees grant points, a small developer cut is taken from the cashback pool — you are billed for that amount monthly.
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: '4px 0 0', color: '#6c757d', fontSize: 14 },

  cards: { display: 'flex', gap: 16, marginBottom: 28, flexWrap: 'wrap' },
  card: { flex: '1 1 200px', background: '#fff', borderRadius: 12, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.07)' },
  cardLabel: { fontSize: 13, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  cardValue: { fontSize: 28, fontWeight: 800, color: '#1D3557', lineHeight: 1 },
  cardSub: { fontSize: 14, color: '#6c757d', marginTop: 6 },

  tableWrap: { background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden', marginBottom: 24 },
  tableHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px', borderBottom: '1px solid #f0f2f5' },
  tableTitle: { fontWeight: 700, fontSize: 15, color: '#1D3557' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { background: '#f8f9fb', padding: '10px 14px', textAlign: 'left', fontSize: 13, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #eee' },
  tr: { borderBottom: '1px solid #f0f2f5' },
  td: { padding: '14px', fontSize: 15, color: '#333', verticalAlign: 'middle' },
  sub: { fontSize: 13, color: '#6c757d', marginTop: 3 },
  expandBtn: { fontSize: 12, color: '#1D3557', minWidth: 14 },

  expandedCell: { padding: 0, background: '#f8faff', borderBottom: '2px solid #e0e7ff' },
  storeBreakdown: { padding: '16px 20px' },
  breakdownTitle: { fontWeight: 700, fontSize: 15, color: '#1D3557', marginBottom: 10 },

  badgePaid: { background: '#d4edda', color: '#155724', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700 },
  badgeUnpaid: { background: '#fff3cd', color: '#856404', borderRadius: 6, padding: '3px 10px', fontSize: 13, fontWeight: 700 },

  footer: { padding: '14px 20px', background: '#f8f9fb', borderTop: '1px solid #eee', fontSize: 15, color: '#6c757d' },

  infoBox: { background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 12, padding: '18px 22px' },
  infoTitle: { fontWeight: 700, color: '#3730a3', fontSize: 15, marginBottom: 6 },
  infoText: { fontSize: 15, color: '#4338ca', lineHeight: 1.6 },

  pdfBtn: {
    background: '#fff', border: '1.5px solid #2DC653', color: '#155724',
    borderRadius: 6, padding: '4px 10px', fontSize: 13, fontWeight: 700,
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
};
