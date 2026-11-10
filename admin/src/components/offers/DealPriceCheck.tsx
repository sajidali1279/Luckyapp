// Deal price check (2026-11-10): a deal's price against each store's register, from the stores' PDI item lists. Prices differ by store
// (the Oklahoma stores pay other taxes and vendors, and the Texas stores differ too), so one "2 for $5" can be a saving at one store, no
// saving at another and below cost at a third. Pick the product by name or barcode; nothing is saved with the deal, it only warns.
// Backend: GET /pdi-items/deal-check (utils/dealPrice.ts reads the price per item from the deal's words).
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { pdiInvoicesApi } from '../../services/api';
import { C, FONT, INPUT } from '../../lib/theme';
import { Badge, Field, Notice } from '../kit';

type Verdict = 'SAVES' | 'NOT_A_SAVING' | 'BELOW_COST' | 'NO_PRICE';
type StoreRow = { storeId: string; storeName: string; state: string | null; priceCents: number | null; costCents: number | null; verdict: Verdict | null };
type Product = { code: string; upc: string; name: string; department: string | null; stores: StoreRow[] };
type Result = { deal: { qty: number; totalCents: number; unitCents: number } | null; products: Product[]; listStores: number };

const usd = (cents: number | null) => (cents == null ? '' : `$${(cents / 100).toFixed(2)}`);
const VERDICT: Record<Verdict, { text: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }> = {
  SAVES: { text: 'Saves', tone: 'success' }, NOT_A_SAVING: { text: 'Not a saving', tone: 'warning' },
  BELOW_COST: { text: 'Below cost', tone: 'danger' }, NO_PRICE: { text: 'No price in PDI', tone: 'neutral' },
};
const shortName = (n: string) => n.replace(/^Lucky Stop\s*/i, '');

/** storeId: the one store the deal is for (only its row counts), or empty for every store. */
export default function DealPriceCheck({ dealText, storeId, idPrefix = 'deal' }: { dealText: string; storeId?: string; idPrefix?: string }) {
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [text, setText] = useState(dealText);
  useEffect(() => { const t = setTimeout(() => setTyped(q.trim()), 350); return () => clearTimeout(t); }, [q]);
  useEffect(() => { const t = setTimeout(() => setText(dealText.trim()), 350); return () => clearTimeout(t); }, [dealText]);
  useEffect(() => { setPicked(null); }, [typed]);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['deal-check', typed, text], enabled: typed.length >= 2, staleTime: 60_000, retry: false,
    queryFn: () => pdiInvoicesApi.dealCheck(typed, text).then((r) => r.data?.data as Result),
  });
  const products = data?.products ?? [];
  const product = products.find((p) => p.code === picked) ?? (products.length === 1 ? products[0] : null);
  const rows = product ? product.stores.filter((s) => !storeId || s.storeId === storeId) : [];
  const notSaving = rows.filter((r) => r.verdict === 'NOT_A_SAVING');
  const belowCost = rows.filter((r) => r.verdict === 'BELOW_COST');
  const states = new Set(rows.map((r) => r.state).filter(Boolean));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, border: `1px solid ${C.border}`, borderRadius: 8, background: C.subtle }}>
      <Field label="Check against the register (optional)" htmlFor={`${idPrefix}-price-check`}
        hint="Type the product name or its barcode to see the deal next to each store's register price. Prices differ by store and by state.">
        <div style={{ position: 'relative' }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} aria-hidden />
          <input id={`${idPrefix}-price-check`} className="ui-input" style={{ ...INPUT, paddingLeft: 32 }} value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Monster 16oz or 070847811169" maxLength={80} />
        </div>
      </Field>

      {typed.length >= 2 && isFetching && !data && <div style={{ fontSize: FONT.small, color: C.muted }}>Looking in the PDI item lists...</div>}
      {isError && <Notice tone="danger">Could not check the prices right now. Try again in a moment.</Notice>}
      {data && data.listStores === 0 && <Notice>No store's PDI item list is uploaded yet (Invoices to PDI, PDI item lists).</Notice>}
      {data && data.listStores > 0 && typed.length >= 2 && !products.length && <div style={{ fontSize: FONT.small, color: C.muted }}>No product in the PDI item lists matches "{typed}".</div>}

      {products.length > 1 && (
        <div role="group" aria-label="Products found" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {products.map((p) => (
            <button key={p.code} type="button" className="ui-btn" aria-pressed={product?.code === p.code} onClick={() => setPicked(p.code)}
              style={{ padding: '5px 10px', borderRadius: 999, fontSize: FONT.small, cursor: 'pointer',
                border: `1px solid ${product?.code === p.code ? C.primary : C.borderStrong}`, background: product?.code === p.code ? C.primaryTint : C.surface, color: C.text }}>
              {p.name} <span style={{ color: C.muted }}>({p.stores.length} {p.stores.length === 1 ? 'store' : 'stores'})</span>
            </button>
          ))}
        </div>
      )}

      {product && data && (
        <>
          {!data.deal && (
            <Notice>{text ? `"${text}" names no price per item, so there is nothing to check ("$1 off" or "Buy 2 Get 1 Free" saves at any price).` : 'Type the deal text above, for example "2 for $5", to compare it.'}</Notice>
          )}
          {data.deal && (
            <div style={{ fontSize: FONT.small, color: C.text2 }}>
              <strong>{product.name}</strong>: the deal is {usd(data.deal.unitCents)} each{data.deal.qty > 1 ? ` (${data.deal.qty} for ${usd(data.deal.totalCents)})` : ''}.
            </div>
          )}
          {data.deal && belowCost.length > 0 && (
            <Notice tone="danger">Below cost at {belowCost.map((r) => shortName(r.storeName)).join(', ')}: each one sold at {usd(data.deal.unitCents)} loses money there.</Notice>
          )}
          {data.deal && notSaving.length > 0 && (
            <Notice tone="warning">Not a saving at {notSaving.map((r) => shortName(r.storeName)).join(', ')}: the register already charges {usd(data.deal.unitCents)} or less there.{!storeId && rows.length > 1 ? ' Post it for the other stores only, or change the price.' : ''}</Notice>
          )}
          {!rows.length ? (
            <div style={{ fontSize: FONT.small, color: C.muted }}>The store this deal is for does not have this product in its PDI list.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="ui-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.small }} aria-label={`Register prices for ${product.name}`}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.muted }}>
                    <th style={{ padding: '6px 8px' }}>Store</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Register</th>
                    <th style={{ padding: '6px 8px', textAlign: 'right' }}>Cost</th>
                    <th style={{ padding: '6px 8px' }}>Deal there</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.storeId} data-testid="deal-check-row" style={{ borderTop: `1px solid ${C.border}` }}>
                      <td style={{ padding: '6px 8px' }}>{shortName(r.storeName)}{states.size > 1 && r.state ? <span style={{ color: C.muted }}> ({r.state})</span> : null}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right' }}>{usd(r.priceCents) || 'None'}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', color: C.muted }}>{usd(r.costCents) || 'Not in PDI'}</td>
                      <td style={{ padding: '6px 8px' }}>
                        {r.verdict
                          ? <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].text}{r.verdict === 'SAVES' && data.deal && r.priceCents ? ` ${usd(r.priceCents - data.deal.unitCents)} each` : ''}</Badge>
                          : <span style={{ color: C.muted }}>Nothing to compare</span>}
                      </td>
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
