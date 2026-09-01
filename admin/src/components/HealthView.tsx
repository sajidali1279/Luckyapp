import { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { labelsApi } from '../services/api';
import ErrorState from './ErrorState';
import TableSkeleton from './TableSkeleton';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import { TEXT_MUTED } from '../lib/theme';

interface StoreHealth {
  storeId: string;
  storeName: string;
  staleCount: number;
  oldestStaleDays: number;
}

// One-glance chain health: how many labels need printing right now, broken
// down by store, so you don't have to click into By Store 12 times to find
// out which stores are behind.
export default function HealthView() {
  const navigate = useNavigate();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labels-health-summary'],
    queryFn: () => labelsApi.getHealthSummary(),
  });

  const totalStale: number = data?.data?.data?.totalStale ?? 0;
  const totalStores: number = data?.data?.data?.totalStores ?? 0;
  const storesWithStale: number = data?.data?.data?.storesWithStale ?? 0;
  const byStore: StoreHealth[] = data?.data?.data?.byStore ?? [];

  if (isError) return <ErrorState message="Failed to load label health." onRetry={refetch} />;
  if (isLoading) return <TableSkeleton columns={4} />;

  return (
    <div style={s.wrap}>
      <div style={{ ...s.summaryBox, ...(totalStale === 0 ? s.summaryGood : s.summaryWarn) }}>
        {totalStale === 0 ? (
          <>
            <span style={s.summaryIcon}>✓</span>
            <span style={s.summaryText}>Every store is caught up — nothing needs printing.</span>
          </>
        ) : (
          <>
            <span style={s.summaryIcon}>🏷️</span>
            <span style={s.summaryText}>
              <strong>{totalStale}</strong> item{totalStale === 1 ? '' : 's'} need{totalStale === 1 ? 's' : ''} printing across{' '}
              <strong>{storesWithStale}</strong> of {totalStores} store{totalStores === 1 ? '' : 's'}.
            </span>
          </>
        )}
      </div>

      {byStore.length > 0 && (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                {['Store', 'Items Behind', 'Oldest', 'Action'].map(h => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {byStore.map((store, i) => (
                <TableRow key={store.storeId} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                  <TableCell style={s.td}>
                    <span style={s.storeName}>{store.storeName}</span>
                  </TableCell>
                  <TableCell style={s.td}>
                    <span style={s.countBadge}>{store.staleCount}</span>
                  </TableCell>
                  <TableCell style={s.td}>
                    <span style={{ color: TEXT_MUTED }}>{store.oldestStaleDays <= 0 ? 'today' : `${store.oldestStaleDays}d`}</span>
                  </TableCell>
                  <TableCell style={s.td}>
                    <button style={s.goBtn} onClick={() => navigate(`/labels?tab=store&storeId=${store.storeId}`)}>
                      Review at this store
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },

  summaryBox: {
    display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px',
    borderRadius: 14, border: '1px solid',
  },
  summaryGood: { background: '#f0fdf4', borderColor: '#bbf7d0' },
  summaryWarn: { background: '#fffbeb', borderColor: '#fde68a' },
  summaryIcon: { fontSize: 22 },
  summaryText: { fontSize: 15, color: '#1D3557' },

  tableWrap: {
    background: '#fff', borderRadius: 14, overflowX: 'auto',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eee',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle', fontSize: 14 },
  storeName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  countBadge: {
    display: 'inline-block', fontSize: 13, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '3px 10px',
  },
  goBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
  },
};
