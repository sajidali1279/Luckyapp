// What a promotion would add in cashback before it is posted or approved (POST /offers/estimate, backend utils/offerEstimate.ts): the extra
// it would have paid on the same kind of sales over the last 4 weeks, scaled to its length. Asked again a moment after the form stops changing.
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Calculator } from 'lucide-react';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { C, FONT, RADIUS } from '../../lib/theme';

/** The offer's own fields (bonusRate as a fraction, ISO dates, storeId for one store, happy-hour fields). null = not ready to ask yet. */
export type EstimateInput = Record<string, unknown> | null;

const usd = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function CostEstimate({ input, compact }: { input: EstimateInput; compact?: boolean }) {
  const key = input ? JSON.stringify(input) : '';
  const [settled, setSettled] = useState(key);
  useEffect(() => { const t = setTimeout(() => setSettled(key), 400); return () => clearTimeout(t); }, [key]);

  const q = useQuery({
    queryKey: ['offer-estimate', settled],
    queryFn: () => offersApi.estimate(JSON.parse(settled)),
    enabled: !!settled,
    staleTime: 5 * 60_000,
    retry: false,
  });
  if (!input) return null;
  // Only a reply with the numbers is used (anything else reads as "no estimate", it must never take the form down)
  const raw = q.data?.data?.data;
  const e = raw && typeof raw.estimatedExtra === 'number' && typeof raw.basisSales === 'number'
    ? raw as { basisDays: number; basisSales: number; basisAmount: number; days: number; estimatedExtra: number; perDay: number } : undefined;
  const waiting = q.isFetching || settled !== key;

  let body: React.ReactNode;
  if (!waiting && q.isSuccess && !e) body = <span style={{ color: C.muted }}>No estimate right now.</span>;
  else if (q.isError && !waiting) body = <span style={{ color: C.muted }}>No estimate: {serverMessage(q.error, 'it could not be worked out.')}</span>;
  else if (!e || waiting) body = <span style={{ color: C.muted }}>Working out the cost…</span>;
  else if (e.basisSales === 0) body = <span>No matching sales in the last {e.basisDays / 7} weeks, so there is nothing to estimate from.</span>;
  else body = (
    <>
      <span>About <strong style={{ color: C.text }}>{usd(e.estimatedExtra)}</strong> extra cashback over {e.days} {e.days === 1 ? 'day' : 'days'} ({usd(e.perDay)} a day).</span>
      {!compact && (
        <span style={{ display: 'block', color: C.muted, fontSize: FONT.small, marginTop: 4, lineHeight: 1.5 }}>
          From {e.basisSales.toLocaleString('en-US')} matching {e.basisSales === 1 ? 'sale' : 'sales'} ({usd(e.basisAmount)}) in the last {e.basisDays / 7} weeks.
          The most it adds: the 10% ceiling on a sale can only lower it.
        </span>
      )}
    </>
  );
  return (
    <div aria-live="polite" data-testid="offer-estimate" style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', background: C.subtle, border: `1px solid ${C.border}`,
      borderRadius: RADIUS.md, padding: '10px 12px', fontSize: FONT.body, color: C.text2, lineHeight: 1.5,
    }}>
      <Calculator size={16} style={{ flexShrink: 0, marginTop: 2, color: C.muted }} aria-hidden />
      <div style={{ minWidth: 0 }}><strong style={{ color: C.text, marginRight: 4 }}>Estimated cost.</strong>{body}</div>
    </div>
  );
}
