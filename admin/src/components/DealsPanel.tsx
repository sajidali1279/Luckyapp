// Labels > Deals (HQ). Two parts:
//   1. Recommendations from the catalog itself (backend utils/dealRecommendations.ts): deals to fix, items missing their product line's
//      deal, and ideas by category. Apply sets the item's deal (stores are told to reprint, like any deal change); Dismiss hides it for
//      every HQ admin until the suggestion changes.
//   2. The deal list for training: every deal, by category, with the chain's or one store's prices, printed on a clean page.
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { CheckCircle2, Printer, Sparkles, Wrench, Link2, Lightbulb, RotateCcw } from 'lucide-react';
import { labelsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, RADIUS } from '../lib/theme';
import { Button, Card, Badge, Notice, EmptyState, SectionTitle } from './kit';
import ConfirmModal from './ConfirmModal';
import CardSkeleton from './CardSkeleton';
import ErrorState from './ErrorState';
import { storeDayLong } from '../lib/storeDates';

type Kind = 'no-saving' | 'too-deep' | 'format' | 'line' | 'brand' | 'idea';
type Reco = { key: string; kind: Kind; labelId: string; productName: string; category: string | null; price: string; currentDeal: string | null; suggestedDeal: string | null; saving: number | null; reason: string };
type Label = { id: string; productName: string; priceText: string | null; dealText: string | null; category: string | null; barcode: string | null };
type Coverage = { stores: { id: string; name: string }[]; labels: { id: string; coverage: { storeId: string; status: string; priceText: string | null }[] }[] };

const KIND_LABEL: Record<Kind, string> = {
  'no-saving': 'Saves nothing', 'too-deep': 'Very deep', format: 'Written differently', line: 'Product line', brand: 'Same brand', idea: 'Idea',
};
const pct = (f: number | null) => (f == null ? '' : `${Math.round(f * 100)}%`);
const DEAL = /^\s*(\d{1,2})\s*for\s*\$?\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*$/i;
function dealMath(deal: string | null, price: string | null): { each: string; save: string } | null {
  const m = DEAL.exec(deal ?? '');
  const p = Number(price);
  if (!m || !price || !(p > 0)) return null;
  const qty = Number(m[1]), total = Number(m[2].replace(',', '.'));
  const each = total / qty, save = qty * p - total;
  return { each: `$${each.toFixed(2)}`, save: save > 0.004 ? `$${save.toFixed(2)} on ${qty}` : 'none' };
}
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export default function DealsPanel({ labels }: { labels: Label[] }) {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['deal-recos'], queryFn: () => labelsApi.getDealRecommendations() });
  const recos: Reco[] = data?.data?.data?.recommendations ?? [];
  const dismissedCount: number = data?.data?.data?.dismissed ?? 0;
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [applyAll, setApplyAll] = useState<{ category: string; items: Reco[] } | null>(null);

  const refresh = () => { ['deal-recos', 'labels', 'store-labels', 'labels-coverage'].forEach((k) => qc.invalidateQueries({ queryKey: [k] })); };
  const mark = (key: string, on: boolean) => setBusy((s) => { const n = new Set(s); if (on) n.add(key); else n.delete(key); return n; });

  async function apply(r: Reco) {
    if (!r.suggestedDeal || busy.has(r.key)) return;
    mark(r.key, true);
    try {
      const res = await labelsApi.update(r.labelId, { dealText: r.suggestedDeal });
      const stores = res.data?.reprint?.stores ?? 0;
      toast.success(`${r.productName}: ${r.suggestedDeal}. ${stores ? `${stores} ${stores === 1 ? 'store is' : 'stores are'} told to reprint.` : ''}`);
      refresh();
    } catch (err) { toast.error(serverMessage(err, 'Could not change the deal. Nothing was changed.')); }
    finally { mark(r.key, false); }
  }
  const dismiss = useMutation({
    mutationFn: (key: string) => labelsApi.dismissDealRecommendation(key, true),
    onSuccess: () => { toast('Hidden. It shows again only if the suggestion changes.'); qc.invalidateQueries({ queryKey: ['deal-recos'] }); },
    onError: (err) => toast.error(serverMessage(err, 'Could not hide it.')),
  });
  const restore = useMutation({
    mutationFn: () => labelsApi.restoreDealRecommendations(),
    onSuccess: (res) => { toast.success(`${res.data?.data?.restored ?? 0} shown again.`); qc.invalidateQueries({ queryKey: ['deal-recos'] }); },
    onError: (err) => toast.error(serverMessage(err, 'Could not show them again.')),
  });
  async function applyCategory(items: Reco[]) {
    let done = 0;
    for (const r of items) {
      if (!r.suggestedDeal) continue;
      try { await labelsApi.update(r.labelId, { dealText: r.suggestedDeal }); done += 1; } catch { /* counted below */ }
    }
    toast[done === items.length ? 'success' : 'error'](`${done} of ${items.length} deals set${done === items.length ? '.' : '; the rest could not be saved.'}`);
    setApplyAll(null);
    refresh();
  }

  const fix = recos.filter((r) => r.kind === 'no-saving' || r.kind === 'too-deep' || r.kind === 'format');
  const match = recos.filter((r) => r.kind === 'line' || r.kind === 'brand');
  const ideas = recos.filter((r) => r.kind === 'idea');
  const ideaGroups = useMemo(() => {
    const g = new Map<string, Reco[]>();
    ideas.forEach((r) => g.set(r.category ?? 'Other', [...(g.get(r.category ?? 'Other') ?? []), r]));
    return [...g.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [ideas]);

  const row = (r: Reco) => (
    <div key={r.key} style={s.row} data-testid="reco-row">
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <strong style={{ color: C.text, fontSize: FONT.body }}>{r.productName}</strong>
          <span style={{ color: C.text2 }}>${r.price}</span>
          <Badge tone={r.kind === 'no-saving' || r.kind === 'too-deep' ? 'danger' : r.kind === 'idea' ? 'neutral' : 'info'}>{KIND_LABEL[r.kind]}</Badge>
        </div>
        <div style={s.reason}>{r.reason}</div>
      </div>
      <div style={s.change}>
        <span style={{ color: C.muted, textDecoration: r.suggestedDeal ? 'line-through' : 'none' }}>{r.currentDeal ?? 'no deal'}</span>
        {r.suggestedDeal && <><span aria-hidden style={{ color: C.muted }}>to</span><strong style={{ color: C.text }}>{r.suggestedDeal}</strong>{r.saving != null && <span style={s.save}>saves {pct(r.saving)}</span>}</>}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {r.suggestedDeal ? (
          <Button size="sm" variant="primary" disabled={busy.has(r.key)} onClick={() => apply(r)} aria-label={`Apply ${r.suggestedDeal} to ${r.productName}`}>{busy.has(r.key) ? 'Saving…' : 'Apply'}</Button>
        ) : <span style={{ ...s.reason, alignSelf: 'center' }}>Edit it in the Catalog</span>}
        <Button size="sm" variant="ghost" disabled={dismiss.isPending} onClick={() => dismiss.mutate(r.key)} aria-label={`Dismiss the suggestion for ${r.productName}`}>Dismiss</Button>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 1100 }}>
      <ConfirmModal
        open={!!applyAll}
        title={`Set ${applyAll?.items.length ?? 0} ${applyAll?.category ?? ''} deals?`}
        message={applyAll ? `Each item gets the deal shown next to it (${applyAll.items.slice(0, 3).map((r) => `${r.productName}: ${r.suggestedDeal}`).join('; ')}${applyAll.items.length > 3 ? '; ...' : ''}). Stores carrying them are told to reprint those labels.` : ''}
        confirmLabel="Set them"
        onConfirm={() => { if (applyAll) applyCategory(applyAll.items); }}
        onCancel={() => setApplyAll(null)}
      />
      <p style={{ margin: 0, color: C.muted, fontSize: FONT.body, lineHeight: 1.5 }}>
        Suggestions from the catalog itself: deals that need fixing, items missing their product line's deal, and ideas where most of a category is on a deal.
        Sales are kept by category, not by product, so check an idea against what sells before you apply it.
      </p>
      {isError ? <ErrorState message="Could not work out the recommendations." onRetry={refetch} /> : isLoading ? <CardSkeleton count={3} /> : (
        <>
          {recos.length === 0 && <EmptyState icon={<CheckCircle2 size={22} />} title="Nothing to recommend" description="Every deal saves money, reads the same way, and matches its product line." />}
          {fix.length > 0 && (
            <Card padding={0}>
              <div style={s.head}><Wrench size={16} aria-hidden /><SectionTitle count={fix.length} style={{ margin: 0 }}>Fix these deals</SectionTitle></div>
              {fix.map(row)}
            </Card>
          )}
          {match.length > 0 && (
            <Card padding={0}>
              <div style={s.head}><Link2 size={16} aria-hidden /><SectionTitle count={match.length} style={{ margin: 0 }}>Match the product line</SectionTitle></div>
              {match.map(row)}
            </Card>
          )}
          {ideaGroups.length > 0 && (
            <Card padding={0}>
              <div style={s.head}><Lightbulb size={16} aria-hidden /><SectionTitle count={ideas.length} style={{ margin: 0 }}>Deal ideas by category</SectionTitle></div>
              {ideaGroups.map(([cat, items]) => (
                <details key={cat} style={s.group}>
                  <summary style={s.summary}>
                    <span style={{ fontWeight: 700, color: C.text }}>{cat}</span><Badge>{items.length}</Badge>
                    <span style={{ ...s.reason, flex: 1 }}>{items[0].reason.split(';')[0]}</span>
                    <Button size="sm" onClick={(e) => { e.preventDefault(); setApplyAll({ category: cat, items }); }}>Apply all {items.length}</Button>
                  </summary>
                  {items.map(row)}
                </details>
              ))}
            </Card>
          )}
          {dismissedCount > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={s.reason}>{dismissedCount} dismissed {dismissedCount === 1 ? 'suggestion is' : 'suggestions are'} hidden.</span>
              <Button size="sm" variant="ghost" icon={<RotateCcw />} disabled={restore.isPending} onClick={() => restore.mutate()}>Show them again</Button>
            </div>
          )}
        </>
      )}
      <DealList labels={labels} />
    </div>
  );
}

/** The deal list for training: every deal, by category, with the chain's prices or one store's, printed on a clean page. */
function DealList({ labels }: { labels: Label[] }) {
  const { data: covData } = useQuery({ queryKey: ['labels-coverage'], queryFn: () => labelsApi.getCoverage(), staleTime: 30_000 });
  const coverage: Coverage | null = covData?.data?.data ?? null;
  const [storeId, setStoreId] = useState('');
  const deals = labels.filter((l) => l.dealText && l.dealText.trim());
  const categories = [...new Set(deals.map((l) => l.category || 'Other'))].sort();
  const [picked, setPicked] = useState<Set<string> | null>(null);   // null = every category
  const chosen = (c: string) => !picked || picked.has(c);
  const toggle = (c: string) => setPicked((p) => { const n = new Set(p ?? categories); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  // The rows: at one store, only what that store carries, at that store's price
  const rows = useMemo(() => {
    const cov = new Map((coverage?.labels ?? []).map((l) => [l.id, l.coverage]));
    return deals.flatMap((l) => {
      if (!chosen(l.category || 'Other')) return [];
      if (!storeId) return [{ ...l, price: l.priceText }];
      const c = cov.get(l.id)?.find((x) => x.storeId === storeId);
      if (!c || c.status === 'not_added') return [];
      return [{ ...l, price: c.priceText ?? l.priceText }];
    });
  }, [deals, coverage, storeId, picked]);   // eslint-disable-line react-hooks/exhaustive-deps
  const storeName = coverage?.stores.find((x) => x.id === storeId)?.name;

  function print() {
    const byCat = new Map<string, typeof rows>();
    rows.forEach((r) => byCat.set(r.category || 'Other', [...(byCat.get(r.category || 'Other') ?? []), r]));
    const sections = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([cat, list]) => `
      <section><h2>${esc(cat)} <small>${list.length} ${list.length === 1 ? 'deal' : 'deals'}</small></h2>
      <table><thead><tr><th>Item</th><th class="n">Price</th><th>Deal</th><th class="n">Each on the deal</th><th class="n">Saves</th></tr></thead><tbody>
      ${list.sort((a, b) => a.productName.localeCompare(b.productName)).map((r) => { const m = dealMath(r.dealText, r.price); return `<tr><td>${esc(r.productName)}</td><td class="n">${r.price ? `$${esc(r.price)}` : ''}</td><td class="deal">${esc(r.dealText ?? '')}</td><td class="n">${m?.each ?? ''}</td><td class="n">${m?.save ?? ''}</td></tr>`; }).join('')}
      </tbody></table></section>`).join('');
    const win = window.open('', '_blank');
    if (!win) { toast.error('Allow pop-ups for this site to print the deal list.'); return; }
    win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>Lucky Stop deals</title><style>
      @page { size: letter; margin: 12mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11pt; }
      header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1D3557; padding-bottom: 6px; margin-bottom: 10px; }
      h1 { font-size: 18pt; margin: 0; color: #1D3557; } header span { color: #555; font-size: 10pt; }
      h2 { font-size: 13pt; margin: 14px 0 4px; color: #1D3557; break-after: avoid; } h2 small { font-size: 9pt; color: #666; font-weight: normal; }
      table { width: 100%; border-collapse: collapse; } th { text-align: left; font-size: 9pt; color: #555; border-bottom: 1px solid #999; padding: 4px; }
      td { padding: 4px; border-bottom: 1px solid #ddd; } tr { break-inside: avoid; } .n { text-align: right; white-space: nowrap; } .deal { font-weight: bold; color: #b00020; white-space: nowrap; }
      section { break-inside: auto; } footer { margin-top: 14px; font-size: 9pt; color: #666; }
    </style></head><body>
      <header><h1>Lucky Stop deals</h1><span>${esc(storeName ? `${storeName} prices` : 'Chain prices')} &middot; ${esc(storeDayLong(new Date()))} &middot; ${rows.length} deals</span></header>
      ${sections || '<p>No deals in the chosen categories.</p>'}
      <footer>Ring up the deal when the customer buys the full number. Prices and deals as in the Lucky Stop label catalog on the date above.</footer>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 300);
  }

  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Sparkles size={16} aria-hidden /><SectionTitle count={rows.length} style={{ margin: 0 }}>Deal list for training</SectionTitle></div>
      <p style={{ ...s.reason, margin: '0 0 12px' }}>Every deal, by category, with what one costs on the deal and what it saves. Print it for the staff, or for one store at that store's prices.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <label style={{ fontSize: FONT.small, color: C.text2, fontWeight: 600 }} htmlFor="deal-list-store">Prices</label>
        <select id="deal-list-store" className="ui-input" style={{ padding: '6px 10px', borderRadius: RADIUS.md, border: `1px solid ${C.border}` }} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Chain prices (every store)</option>
          {(coverage?.stores ?? []).map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        <Button variant="primary" icon={<Printer />} onClick={print} disabled={rows.length === 0}>Print the deal list</Button>
      </div>
      <div role="group" aria-label="Categories on the list" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {categories.map((c) => (
          <button key={c} type="button" className="ui-chip" aria-pressed={chosen(c)} onClick={() => toggle(c)}>{c} ({deals.filter((l) => (l.category || 'Other') === c).length})</button>
        ))}
        {picked && <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>All categories</Button>}
      </div>
      {storeId && !coverage && <Notice tone="neutral">Loading the store's prices…</Notice>}
      <div style={{ maxHeight: 360, overflow: 'auto', border: `1px solid ${C.border}`, borderRadius: RADIUS.md }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: FONT.small }}>
          <thead><tr style={{ background: C.subtle, textAlign: 'left' }}><th style={s.th}>Category</th><th style={s.th}>Item</th><th style={s.th}>Price</th><th style={s.th}>Deal</th><th style={s.th}>Each</th><th style={s.th}>Saves</th></tr></thead>
          <tbody>
            {rows.slice().sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || a.productName.localeCompare(b.productName)).slice(0, 400).map((r) => { const m = dealMath(r.dealText, r.price); return (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <td style={s.td}>{r.category || 'Other'}</td><td style={{ ...s.td, color: C.text, fontWeight: 600 }}>{r.productName}</td><td style={s.td}>{r.price ? `$${r.price}` : ''}</td>
                <td style={{ ...s.td, fontWeight: 700, color: C.text }}>{r.dealText}</td><td style={s.td}>{m?.each ?? ''}</td><td style={s.td}>{m?.save ?? ''}</td>
              </tr>
            ); })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const s: Record<string, React.CSSProperties> = {
  head: { display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.subtle },
  row: { display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap', padding: '10px 16px', borderBottom: `1px solid ${C.border}` },
  reason: { fontSize: FONT.small, color: C.muted, lineHeight: 1.45 },
  change: { display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap', fontSize: FONT.body, minWidth: 200 },
  save: { fontSize: FONT.caption, color: '#17663a', fontWeight: 700 },
  group: { borderBottom: `1px solid ${C.border}` },
  summary: { display: 'flex', gap: 10, alignItems: 'center', padding: '10px 16px', cursor: 'pointer', flexWrap: 'wrap' },
  th: { padding: '6px 8px', fontWeight: 600, color: C.text2, position: 'sticky', top: 0, background: C.subtle },
  td: { padding: '6px 8px', color: C.text2 },
};
