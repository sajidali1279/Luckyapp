import { CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import Modal from './Modal';
import { offersApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { storeDayLong } from '../lib/storeDates';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';

// What one promotion did: the sales it raised (each sale records the promotion that applied to it and how much cashback it
// added, after the 10% ceiling), the customers, the extra cashback, and the category's sales while it ran against the same length
// of time just before it.

interface Results {
  scheduled: boolean;
  where: string;
  category: string | null;
  from: string;
  until: string;
  running: boolean;
  removedEarly: boolean;
  recordedFrom: string | null;
  sales: number;
  customers: number;
  salesAmount: number;
  cashbackOnThoseSales: number;
  extraCashback: number;
  waitingForApproval: number;
  byStore: { name: string; sales: number; extraCashback: number }[];
  categorySales: { during: { sales: number; amount: number }; before: { sales: number; amount: number } };
}

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
const catWords = (c: string | null) => (c ? c.replace(/_/g, ' ').toLowerCase().replace(/^./, (x) => x.toUpperCase()) : 'All');

export default function OfferResultsModal({ offer, onClose }: { offer: { id: string; title: string }; onClose: () => void }) {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['offer-results', offer.id],
    queryFn: () => offersApi.getResults(offer.id),
    staleTime: 30_000,
  });
  const r: Results | undefined = data?.data?.data;

  return (
    <Modal title={`Results: ${offer.title}`} subtitle={r && !r.scheduled ? `${r.where} · ${catWords(r.category)} · ${storeDayLong(r.from)} to ${storeDayLong(r.until)}` : undefined} onClose={onClose} maxWidth={620}>
      {isLoading ? (
        <div style={{ padding: '24px 0', textAlign: 'center', color: TEXT_MUTED }} role="status">Adding up the sales…</div>
      ) : isError || !r ? (
        <div role="alert" style={x.error}>{failureMessage(error, 'Could not load the results.')} <button type="button" style={x.link} onClick={() => refetch()}>Try again</button></div>
      ) : r.scheduled ? (
        <p style={x.note}>This promotion has not started yet, so there are no results.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={x.status}>
            {r.running ? 'Running now' : r.removedEarly ? `Removed on ${storeDayLong(r.until)}, before its end date` : 'Finished'}
            {r.recordedFrom && <span style={{ color: TEXT_MUTED, fontWeight: 500 }}> · counted from {storeDayLong(r.recordedFrom)}, when sales began recording their promotion</span>}
          </div>

          <div style={x.tiles}>
            <Tile label="Sales it raised" value={r.sales.toLocaleString('en-US')} />
            <Tile label="Customers" value={r.customers.toLocaleString('en-US')} />
            <Tile label="Extra cashback paid" value={usd(r.extraCashback)} strong />
            <Tile label="On sales worth" value={usd(r.salesAmount)} />
          </div>

          {r.sales === 0 ? (
            <p style={x.note}>{r.running ? 'No approved sale has used this promotion yet.' : 'No approved sale used this promotion.'}</p>
          ) : (
            <p style={x.note}>
              That is {usd(r.extraCashback / r.sales)} extra per sale on average, out of {usd(r.cashbackOnThoseSales)} cashback on those sales in all.
            </p>
          )}
          {r.waitingForApproval > 0 && <p style={x.note}>{plural(r.waitingForApproval, 'more sale is', 'more sales are')} waiting for a receipt or a manager's approval.</p>}

          <CategoryCompare r={r} />

          {r.byStore.length > 1 && (
            <div>
              <div style={x.head}>By store</div>
              <table style={x.table}>
                <thead><tr><th style={x.th}>Store</th><th style={{ ...x.th, textAlign: 'right' }}>Sales</th><th style={{ ...x.th, textAlign: 'right' }}>Extra cashback</th></tr></thead>
                <tbody>
                  {r.byStore.map(s => (
                    <tr key={s.name}><td style={x.td}>{s.name}</td><td style={{ ...x.td, textAlign: 'right' }}>{s.sales.toLocaleString('en-US')}</td><td style={{ ...x.td, textAlign: 'right' }}>{usd(s.extraCashback)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function Tile({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={x.tile}>
      <div style={{ ...x.tileValue, ...(strong ? { color: '#8a5300' } : {}) }}>{value}</div>
      <div style={x.tileLabel}>{label}</div>
    </div>
  );
}

// The category's sales while the promotion ran, against the same length of time just before it
function CategoryCompare({ r }: { r: Results }) {
  const { during, before } = r.categorySales;
  const max = Math.max(during.amount, before.amount, 1);
  const change = before.amount > 0 ? Math.round(((during.amount - before.amount) / before.amount) * 100) : null;
  const what = r.category ? `${catWords(r.category)} sales` : 'All sales';
  return (
    <div style={x.compare}>
      <div style={x.head}>{what} at {r.where === 'All stores' ? 'all stores' : r.where}</div>
      {[['While it ran', during, PRIMARY], ['The same time just before', before, '#5a6472']].map(([label, v, color]) => {
        const val = v as { sales: number; amount: number };
        return (
          <div key={label as string} style={{ marginTop: 8 }}>
            <div style={x.barLabel}><span>{label as string}</span><span>{usd(val.amount)} · {plural(val.sales, 'sale', 'sales')}</span></div>
            <div style={x.barTrack} aria-hidden><div style={{ ...x.bar, width: `${(val.amount / max) * 100}%`, background: color as string }} /></div>
          </div>
        );
      })}
      <p style={{ ...x.note, marginTop: 10 }}>
        {change === null
          ? 'There were no sales in the days before to compare with.'
          : `${change >= 0 ? '+' : ''}${change}% against the same length of time just before.`}
        {' '}Other things move sales too (weather, paydays, holidays), so read this as a pointer, not proof.
      </p>
    </div>
  );
}

const x: Record<string, CSSProperties> = {
  status: { fontSize: 14, fontWeight: 700, color: '#111827' },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 },
  tile: { border: '1px solid #e4e7ec', borderRadius: 12, padding: '12px 14px', background: '#f7f8fa' },
  tileValue: { fontSize: 22, fontWeight: 700, color: '#111827' },
  tileLabel: { fontSize: 12.5, color: TEXT_MUTED, marginTop: 2, fontWeight: 600 },
  note: { fontSize: 13.5, color: '#374151', margin: 0, lineHeight: 1.5 },
  head: { fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: TEXT_MUTED },
  compare: { border: '1px solid #e4e7ec', borderRadius: 12, padding: '12px 14px' },
  barLabel: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#374151', fontWeight: 600, marginBottom: 4 },
  barTrack: { height: 10, borderRadius: 5, background: '#f1f3f6', overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 5 },
  table: { width: '100%', borderCollapse: 'collapse', marginTop: 8, fontSize: 13.5 },
  th: { textAlign: 'left', padding: '6px 8px', borderBottom: '1px solid #e4e7ec', color: TEXT_MUTED, fontWeight: 700, fontSize: 12.5 },
  td: { padding: '6px 8px', borderBottom: '1px solid #f1f3f6' },
  error: { background: '#fdf2f2', color: '#a51b28', borderRadius: 9, padding: '9px 12px', fontSize: 13.5, fontWeight: 600 },
  link: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 },
};
