import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell,
} from 'recharts';
import { billingApi } from '../services/api';

type Range = '7d' | '30d' | '90d' | 'custom';

function rangeToDateStr(range: Range): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  if (range === '7d') from.setDate(from.getDate() - 7);
  else if (range === '30d') from.setDate(from.getDate() - 30);
  else if (range === '90d') from.setDate(from.getDate() - 90);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

function fmt$(n: number) { return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

const PIE_COLORS = ['#E63946', '#1D3557', '#F4A261', '#2DC653'];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={s.tooltip}>
      <div style={s.tooltipLabel}>{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.color, fontSize: 13 }}>
          {p.name}: <strong>{typeof p.value === 'number' && p.name.toLowerCase().includes('$') || p.name.toLowerCase().includes('volume') || p.name.toLowerCase().includes('cut') || p.name.toLowerCase().includes('revenue') ? fmt$(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
};

export default function Analytics() {
  const [range, setRange] = useState<Range>('30d');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const { from, to } = range === 'custom'
    ? { from: customFrom, to: customTo }
    : rangeToDateStr(range);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['analytics', from, to],
    queryFn: () => billingApi.getAnalytics(from, to),
    enabled: !!(from && to),
  });

  const analytics = data?.data?.data;
  const daily: any[] = analytics?.daily || [];
  const byStore: any[] = analytics?.byStore || [];
  const totals = analytics?.totals || {};

  const pieData = totals.devCut ? [
    { name: 'Dev Cut', value: totals.devCut },
    { name: 'Store Cost (total)', value: parseFloat((totals.storeCost - totals.devCut).toFixed(2)) },
    { name: 'Points Awarded', value: totals.pointsAwarded },
  ] : [];

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>📈 Analytics</h1>
          <p style={s.sub}>Transaction and revenue insights across all stores</p>
        </div>

        {/* Date range controls */}
        <div style={s.rangeControls}>
          {(['7d', '30d', '90d', 'custom'] as Range[]).map((r) => (
            <button
              key={r}
              style={{ ...s.rangeBtn, ...(range === r ? s.rangeBtnActive : {}) }}
              onClick={() => setRange(r)}
            >
              {r === '7d' ? 'Last 7 days' : r === '30d' ? 'Last 30 days' : r === '90d' ? 'Last 90 days' : 'Custom'}
            </button>
          ))}
        </div>
      </div>

      {range === 'custom' && (
        <div style={s.customDateRow}>
          <div style={s.dateField}>
            <label style={s.label}>From</label>
            <input style={s.dateInput} type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
          </div>
          <div style={s.dateField}>
            <label style={s.label}>To</label>
            <input style={s.dateInput} type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
          <button style={s.applyBtn} onClick={() => refetch()}>Apply</button>
        </div>
      )}

      {isLoading ? (
        <div style={s.loading}>Loading analytics...</div>
      ) : !analytics ? (
        <div style={s.loading}>No data available.</div>
      ) : (
        <>
          {/* Summary cards */}
          <div style={s.summaryGrid}>
            <SummaryCard icon="🧾" label="Transactions" value={totals.transactions || 0} />
            <SummaryCard icon="💵" label="Purchase Volume" value={fmt$(totals.purchaseVolume || 0)} />
            <SummaryCard icon="💰" label="Your Dev Cut" value={fmt$(totals.devCut || 0)} green />
            <SummaryCard icon="🎁" label="Points Awarded" value={fmt$(totals.pointsAwarded || 0)} />
            <SummaryCard icon="🏪" label="Active Stores" value={byStore.length} />
          </div>

          {/* Daily transactions line chart */}
          <div style={s.chartCard}>
            <h2 style={s.chartTitle}>Daily Transactions</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="transactions" stroke="#E63946" strokeWidth={2} dot={false} name="Transactions" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Daily revenue line chart */}
          <div style={s.chartCard}>
            <h2 style={s.chartTitle}>Daily Revenue (Purchase Volume & Dev Cut)</h2>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={daily} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                <Tooltip content={<CustomTooltip />} />
                <Legend />
                <Line type="monotone" dataKey="purchaseVolume" stroke="#1D3557" strokeWidth={2} dot={false} name="Purchase Volume" />
                <Line type="monotone" dataKey="devCut" stroke="#2DC653" strokeWidth={2} dot={false} name="Dev Cut" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Per-store bar chart */}
          {byStore.length > 0 && (
            <div style={s.chartCard}>
              <h2 style={s.chartTitle}>Transactions by Store</h2>
              <ResponsiveContainer width="100%" height={Math.max(300, byStore.length * 36)}>
                <BarChart data={byStore} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="storeName" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="transactions" fill="#1D3557" name="Transactions" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Per-store purchase volume bar chart */}
          {byStore.length > 0 && (
            <div style={s.chartCard}>
              <h2 style={s.chartTitle}>Purchase Volume by Store ($)</h2>
              <ResponsiveContainer width="100%" height={Math.max(300, byStore.length * 36)}>
                <BarChart data={byStore} layout="vertical" margin={{ top: 5, right: 30, left: 100, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
                  <YAxis type="category" dataKey="storeName" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="purchaseVolume" fill="#E63946" name="Purchase Volume" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="devCut" fill="#2DC653" name="Dev Cut" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Revenue breakdown pie */}
          {pieData.length > 0 && totals.devCut > 0 && (
            <div style={s.chartCard}>
              <h2 style={s.chartTitle}>Revenue Breakdown</h2>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 48 }}>
                <PieChart width={280} height={280}>
                  <Pie data={pieData} cx={130} cy={130} outerRadius={110} dataKey="value" label={({ name, percent }) => `${Math.round(percent * 100)}%`} labelLine={false}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmt$(v)} />
                </PieChart>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {pieData.map((entry, i) => (
                    <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 14, height: 14, borderRadius: 4, background: PIE_COLORS[i] }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14, color: '#1D3557' }}>{entry.name}</div>
                        <div style={{ color: '#6c757d', fontSize: 13 }}>{fmt$(entry.value)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Store table */}
          {byStore.length > 0 && (
            <div style={s.chartCard}>
              <h2 style={s.chartTitle}>Store Breakdown Table</h2>
              <table style={s.table}>
                <thead>
                  <tr>
                    {['Store', 'Transactions', 'Purchase Volume', 'Dev Cut'].map((h) => (
                      <th key={h} style={s.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byStore.map((store, i) => (
                    <tr key={store.storeId} style={i % 2 === 0 ? s.trEven : {}}>
                      <td style={s.td}>{store.storeName}</td>
                      <td style={{ ...s.td, ...s.tdNum }}>{store.transactions}</td>
                      <td style={{ ...s.td, ...s.tdNum }}>{fmt$(store.purchaseVolume)}</td>
                      <td style={{ ...s.td, ...s.tdNum, color: '#2DC653', fontWeight: 700 }}>{fmt$(store.devCut)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, green }: { icon: string; label: string; value: any; green?: boolean }) {
  return (
    <div style={s.summaryCard}>
      <div style={s.summaryIcon}>{icon}</div>
      <div>
        <div style={s.summaryLabel}>{label}</div>
        <div style={{ ...s.summaryValue, ...(green ? { color: '#2DC653' } : {}) }}>{value}</div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 16 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4 },

  rangeControls: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  rangeBtn: { background: '#fff', border: '1px solid #dee2e6', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#6c757d' },
  rangeBtnActive: { background: '#1D3557', color: '#fff', border: '1px solid #1D3557', fontWeight: 700 },

  customDateRow: { display: 'flex', gap: 16, alignItems: 'flex-end', marginBottom: 24, flexWrap: 'wrap' },
  dateField: { display: 'flex', flexDirection: 'column', gap: 4 },
  label: { fontWeight: 600, fontSize: 13, color: '#212529' },
  dateInput: { padding: '9px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 14 },
  applyBtn: { background: '#E63946', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontWeight: 700, cursor: 'pointer', fontSize: 14 },

  loading: { color: '#6c757d', textAlign: 'center', padding: 80, fontSize: 16 },

  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14, marginBottom: 28 },
  summaryCard: { background: '#fff', borderRadius: 14, padding: '18px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 14, border: '1px solid #f0f1f2' },
  summaryIcon: { fontSize: 28, flexShrink: 0 },
  summaryLabel: { color: '#6c757d', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryValue: { fontSize: 22, fontWeight: 800, color: '#1D3557', marginTop: 2 },

  chartCard: { background: '#fff', borderRadius: 16, padding: 28, marginBottom: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.05)', border: '1px solid #f0f1f2' },
  chartTitle: { fontSize: 17, fontWeight: 700, color: '#1D3557', marginTop: 0, marginBottom: 20 },

  tooltip: { background: '#fff', border: '1px solid #dee2e6', borderRadius: 10, padding: '10px 14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' },
  tooltipLabel: { fontWeight: 700, color: '#1D3557', marginBottom: 6, fontSize: 13 },

  table: { width: '100%', borderCollapse: 'collapse' as const },
  th: { textAlign: 'left', padding: '10px 16px', fontSize: 12, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '2px solid #dee2e6' },
  td: { padding: '12px 16px', fontSize: 14, color: '#212529', borderBottom: '1px solid #f0f1f2' },
  tdNum: { textAlign: 'right' as const, fontVariantNumeric: 'tabular-nums' },
  trEven: { background: '#fafbfc' },
};
