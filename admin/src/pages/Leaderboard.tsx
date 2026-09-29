import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { leaderboardApi, storesApi } from '../services/api';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { PageHeader } from '../components/kit';
import Glyph from '../components/Glyph';

interface Store { id: string; name: string }
interface CustomerEntry { rank: number; customerId: string; firstName: string; totalPoints: number; isCurrentUser: boolean }
interface EmployeeEntry { rank: number; employeeId: string; firstName: string; avgRating: number; ratingCount: number; isEmployeeOfMonth: boolean }

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ fontSize: size, lineHeight: 1, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= Math.round(rating) ? '#8a5300' : '#d5dae1' }}>★</span>
      ))}
    </span>
  );
}

export default function LeaderboardPage() {
  const [customerStoreId, setCustomerStoreId] = useState<string>('');
  const [employeeStoreId, setEmployeeStoreId] = useState<string>('');

  const { data: storesData } = useQuery({
    queryKey: ['stores-list'],
    queryFn: storesApi.getAll,
  });
  const stores: Store[] = storesData?.data?.data || [];

  const { data: custData, isLoading: custLoading, isError: custError, refetch: refetchCust } = useQuery({
    queryKey: ['leaderboard-customers', customerStoreId],
    queryFn: () => leaderboardApi.getCustomers(customerStoreId || undefined),
    staleTime: 2 * 60 * 1000,
  });
  const customers: CustomerEntry[] = custData?.data?.data || [];

  const { data: empData, isLoading: empLoading } = useQuery({
    queryKey: ['leaderboard-employees', employeeStoreId],
    queryFn: () => leaderboardApi.getEmployees(employeeStoreId),
    enabled: !!employeeStoreId,
    staleTime: 2 * 60 * 1000,
  });
  const { leaderboard: employees = [], storeName: empStoreName, employeeOfMonthId } = empData?.data?.data || {};

  const eom: EmployeeEntry | undefined = employees.find((e: EmployeeEntry) => e.isEmployeeOfMonth);

  return (
    <div style={s.page}>
      <div style={s.inner}>

        {/* Header */}
      <PageHeader title="Leaderboard" description="Customer rankings and employee ratings." />

        <div style={s.grid}>

          {/* ── Customer Leaderboard ── */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div>
                <div style={s.panelTitle}>Customer Rankings</div>
                <div style={s.panelSub}>Ranked by lifetime points earned</div>
              </div>
              <select
                style={s.select}
                value={customerStoreId}
                onChange={e => setCustomerStoreId(e.target.value)}
              >
                <option value="">Chain-wide</option>
                {stores.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>

            {custError ? (
              <ErrorState onRetry={refetchCust} />
            ) : custLoading ? (
              <TableSkeleton columns={3} />
            ) : customers.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 36 }}><Glyph e="🏁" size={28} color="#5a6472" /></div>
                <div style={s.emptyTitle}>No data yet</div>
                <div style={s.emptySub}>Rankings will appear once customers earn points</div>
              </div>
            ) : (
              <div style={s.tableWrap}>
                <Table style={s.table}>
                  <TableHeader>
                    <TableRow>
                      {['Rank', 'Name', 'Points Earned'].map(h => (
                        <TableHead key={h} style={s.th}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customers.map((c, i) => (
                      <TableRow key={c.customerId} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                        <TableCell style={{ ...s.td, width: 60, textAlign: 'center' }}>
                          {c.rank <= 3 ? <Glyph e="🏅" size={18} color={['#8a5300', '#5a6472', '#8a5300'][c.rank - 1]} style={{ verticalAlign: -4 }} /> : (
                            <span style={s.rankNum}>#{c.rank}</span>
                          )}
                        </TableCell>
                        <TableCell style={s.td}>
                          <span style={s.custName}>{c.firstName}</span>
                        </TableCell>
                        <TableCell style={{ ...s.td, textAlign: 'right' }}>
                          <span style={s.ptsBadge}>{c.totalPoints.toLocaleString()} pts</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {/* ── Employee Ratings ── */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div>
                <div style={s.panelTitle}>Employee Ratings</div>
                <div style={s.panelSub}>
                  {empStoreName ? `Showing ${empStoreName}` : 'Select a store to view ratings'}
                </div>
              </div>
              <select
                style={s.select}
                value={employeeStoreId}
                onChange={e => setEmployeeStoreId(e.target.value)}
              >
                <option value="">Select store…</option>
                {stores.map(st => (
                  <option key={st.id} value={st.id}>{st.name}</option>
                ))}
              </select>
            </div>

            {/* Employee of the Month callout */}
            {eom && (
              <div style={s.eomCard}>
                <span style={{ fontSize: 28 }}><Glyph e="🏅" size={28} color="#5a6472" /></span>
                <div style={{ flex: 1 }}>
                  <div style={s.eomLabel}>Employee of the Month</div>
                  <div style={s.eomName}>{eom.firstName}</div>
                  <div style={s.eomStats}>
                    <Stars rating={eom.avgRating} size={16} />
                    <span style={s.eomRating}>{eom.avgRating.toFixed(1)} avg · {eom.ratingCount} rating{eom.ratingCount !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              </div>
            )}

            {!employeeStoreId ? (
              <div style={s.empty}>
                <div style={{ fontSize: 36 }}><Glyph e="🏪" size={28} color="#5a6472" /></div>
                <div style={s.emptyTitle}>Choose a store</div>
                <div style={s.emptySub}>Select a store above to see employee rankings</div>
              </div>
            ) : empLoading ? (
              <TableSkeleton columns={4} />
            ) : employees.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 36 }}><Glyph e="⭐" size={28} color="#5a6472" /></div>
                <div style={s.emptyTitle}>No ratings yet</div>
                <div style={s.emptySub}>Ratings appear after customers rate their experience</div>
              </div>
            ) : (
              <div style={s.tableWrap}>
                <Table style={s.table}>
                  <TableHeader>
                    <TableRow>
                      {['Rank', 'Employee', 'Rating', 'Reviews'].map(h => (
                        <TableHead key={h} style={s.th}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {employees.map((e: EmployeeEntry, i: number) => (
                      <TableRow key={e.employeeId} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                        <TableCell style={{ ...s.td, width: 60, textAlign: 'center' }}>
                          {e.rank <= 3 ? <Glyph e="🏅" size={18} color={['#8a5300', '#5a6472', '#8a5300'][e.rank - 1]} style={{ verticalAlign: -4 }} /> : (
                            <span style={s.rankNum}>#{e.rank}</span>
                          )}
                        </TableCell>
                        <TableCell style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={s.empName}>{e.firstName}</span>
                            {e.isEmployeeOfMonth && (
                              <span style={s.eomChip}>Month</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Stars rating={e.avgRating} />
                            <span style={s.ratingNum}>{e.avgRating.toFixed(1)}</span>
                          </div>
                        </TableCell>
                        <TableCell style={{ ...s.td, textAlign: 'right' }}>
                          <span style={s.countBadge}>{e.ratingCount}</span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--background)', padding: '32px 0' },
  inner: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 26, fontWeight: 700, color: PRIMARY, margin: 0 },
  pageSub: { color: '#5a6472', marginTop: 4, fontSize: 14 },

  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },

  panel: {
    background: '#fff', borderRadius: 12, overflow: 'hidden',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
    display: 'flex', flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 20px 16px', borderBottom: '1px solid #e4e7ec', gap: 12,
  },
  panelTitle: { fontSize: 17, fontWeight: 700, color: PRIMARY },
  panelSub: { fontSize: 14, color: TEXT_MUTED, marginTop: 3 },

  select: {
    border: '1.5px solid #d5dae1', borderRadius: 10,
    padding: '8px 12px', fontSize: 15, outline: 'none',
    color: '#111827', background: '#f7f8fa', cursor: 'pointer', flexShrink: 0,
  },

  eomCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    margin: '16px 20px 0',
    background: 'linear-gradient(135deg, #fdf6e8 0%, #fdf6e8 100%)',
    border: '1.5px solid #f1dcaf',
    borderRadius: 12, padding: '14px 18px',
  },
  eomLabel: { fontSize: 13, fontWeight: 700, color: '#8a5300', textTransform: 'uppercase', letterSpacing: 0.5 },
  eomName: { fontSize: 18, fontWeight: 700, color: '#8a5300', marginTop: 2 },
  eomStats: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 },
  eomRating: { fontSize: 15, color: '#8a5300', fontWeight: 600 },

  loading: { padding: 40, textAlign: 'center', color: TEXT_MUTED, fontSize: 15 },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: PRIMARY },
  emptySub: { fontSize: 15, color: TEXT_MUTED, textAlign: 'center' },

  tableWrap: { overflowX: 'auto', flex: 1 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 16px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: TEXT_MUTED, background: '#f7f8fa', borderBottom: '1px solid #e4e7ec',
  },
  td: { padding: '12px 16px', borderBottom: '1px solid #f1f3f6', verticalAlign: 'middle' },
  rankNum: { fontSize: 15, fontWeight: 700, color: '#5a6472' },
  custName: { fontSize: 14, fontWeight: 700, color: PRIMARY },
  ptsBadge: {
    background: PRIMARY, color: '#fff',
    borderRadius: 8, padding: '3px 10px', fontSize: 15, fontWeight: 700,
  },
  empName: { fontSize: 14, fontWeight: 700, color: PRIMARY },
  eomChip: {
    background: '#fdf6e8', color: '#8a5300',
    borderRadius: 8, padding: '2px 8px', fontSize: 13, fontWeight: 700,
  },
  ratingNum: { fontSize: 15, fontWeight: 700, color: PRIMARY },
  countBadge: {
    background: '#eef2f7', color: PRIMARY,
    borderRadius: 8, padding: '3px 10px', fontSize: 15, fontWeight: 700,
  },
};
