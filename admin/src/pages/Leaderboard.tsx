import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { leaderboardApi, storesApi } from '../services/api';

interface Store { id: string; name: string }
interface CustomerEntry { rank: number; customerId: string; firstName: string; totalPoints: number; isCurrentUser: boolean }
interface EmployeeEntry { rank: number; employeeId: string; firstName: string; avgRating: number; ratingCount: number; isEmployeeOfMonth: boolean }

function Stars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span style={{ fontSize: size, lineHeight: 1, letterSpacing: 1 }}>
      {[1, 2, 3, 4, 5].map(s => (
        <span key={s} style={{ color: s <= Math.round(rating) ? '#F59E0B' : '#D1D5DB' }}>★</span>
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

  const { data: custData, isLoading: custLoading } = useQuery({
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
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>🏆 Leaderboard</h1>
            <p style={s.pageSub}>Customer rankings · Employee ratings</p>
          </div>
        </div>

        <div style={s.grid}>

          {/* ── Customer Leaderboard ── */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div>
                <div style={s.panelTitle}>👥 Customer Rankings</div>
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

            {custLoading ? (
              <div style={s.loading}>Loading…</div>
            ) : customers.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 36 }}>🏁</div>
                <div style={s.emptyTitle}>No data yet</div>
                <div style={s.emptySub}>Rankings will appear once customers earn points</div>
              </div>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Rank', 'Name', 'Points Earned'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c, i) => (
                      <tr key={c.customerId} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                        <td style={{ ...s.td, width: 60, textAlign: 'center' }}>
                          {c.rank === 1 ? '🥇' : c.rank === 2 ? '🥈' : c.rank === 3 ? '🥉' : (
                            <span style={s.rankNum}>#{c.rank}</span>
                          )}
                        </td>
                        <td style={s.td}>
                          <span style={s.custName}>{c.firstName}</span>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <span style={s.ptsBadge}>{c.totalPoints.toLocaleString()} pts</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Employee Ratings ── */}
          <div style={s.panel}>
            <div style={s.panelHeader}>
              <div>
                <div style={s.panelTitle}>⭐ Employee Ratings</div>
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
                <span style={{ fontSize: 28 }}>🏅</span>
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
                <div style={{ fontSize: 36 }}>🏪</div>
                <div style={s.emptyTitle}>Choose a store</div>
                <div style={s.emptySub}>Select a store above to see employee rankings</div>
              </div>
            ) : empLoading ? (
              <div style={s.loading}>Loading…</div>
            ) : employees.length === 0 ? (
              <div style={s.empty}>
                <div style={{ fontSize: 36 }}>⭐</div>
                <div style={s.emptyTitle}>No ratings yet</div>
                <div style={s.emptySub}>Ratings appear after customers rate their experience</div>
              </div>
            ) : (
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      {['Rank', 'Employee', 'Rating', 'Reviews'].map(h => (
                        <th key={h} style={s.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((e: EmployeeEntry, i: number) => (
                      <tr key={e.employeeId} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                        <td style={{ ...s.td, width: 60, textAlign: 'center' }}>
                          {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : (
                            <span style={s.rankNum}>#{e.rank}</span>
                          )}
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={s.empName}>{e.firstName}</span>
                            {e.isEmployeeOfMonth && (
                              <span style={s.eomChip}>🏅 Month</span>
                            )}
                          </div>
                        </td>
                        <td style={s.td}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Stars rating={e.avgRating} />
                            <span style={s.ratingNum}>{e.avgRating.toFixed(1)}</span>
                          </div>
                        </td>
                        <td style={{ ...s.td, textAlign: 'right' }}>
                          <span style={s.countBadge}>{e.ratingCount}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6fb', padding: '32px 0' },
  inner: { maxWidth: 1300, margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  pageTitle: { fontSize: 28, fontWeight: 900, color: '#1D3557', margin: 0 },
  pageSub: { color: '#666', marginTop: 4, fontSize: 14 },

  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 },

  panel: {
    background: '#fff', borderRadius: 18, overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    display: 'flex', flexDirection: 'column',
  },
  panelHeader: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
    padding: '20px 20px 16px', borderBottom: '1px solid #eee', gap: 12,
  },
  panelTitle: { fontSize: 17, fontWeight: 800, color: '#1D3557' },
  panelSub: { fontSize: 12, color: '#888', marginTop: 3 },

  select: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '8px 12px', fontSize: 13, outline: 'none',
    color: '#333', background: '#f9f9fc', cursor: 'pointer', flexShrink: 0,
  },

  eomCard: {
    display: 'flex', alignItems: 'center', gap: 14,
    margin: '16px 20px 0',
    background: 'linear-gradient(135deg, #FEF3C7 0%, #FFFBEB 100%)',
    border: '1.5px solid #FCD34D',
    borderRadius: 14, padding: '14px 18px',
  },
  eomLabel: { fontSize: 11, fontWeight: 700, color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.5 },
  eomName: { fontSize: 18, fontWeight: 900, color: '#78350F', marginTop: 2 },
  eomStats: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 },
  eomRating: { fontSize: 13, color: '#92400E', fontWeight: 600 },

  loading: { padding: 40, textAlign: 'center', color: '#888', fontSize: 15 },
  empty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 48 },
  emptyTitle: { fontSize: 16, fontWeight: 700, color: '#1D3557' },
  emptySub: { fontSize: 13, color: '#888', textAlign: 'center' },

  tableWrap: { overflowX: 'auto', flex: 1 },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 16px', textAlign: 'left',
    fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '12px 16px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle' },
  rankNum: { fontSize: 13, fontWeight: 700, color: '#aaa' },
  custName: { fontSize: 14, fontWeight: 700, color: '#1D3557' },
  ptsBadge: {
    background: '#1D3557', color: '#fff',
    borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
  },
  empName: { fontSize: 14, fontWeight: 700, color: '#1D3557' },
  eomChip: {
    background: '#FEF3C7', color: '#92400E',
    borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700,
  },
  ratingNum: { fontSize: 15, fontWeight: 800, color: '#1D3557' },
  countBadge: {
    background: '#f0f4ff', color: '#1D3557',
    borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 700,
  },
};
