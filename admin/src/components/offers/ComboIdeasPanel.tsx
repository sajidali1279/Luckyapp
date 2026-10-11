// Combo ideas (HQ, Offers > Deals, 2026-10-10): two items for one price, worked out on the server (backend utils/comboIdeas.ts) from the
// Labels catalog, what moves on order lists, stock requests and hot food orders, and when the category sells. The list turns over every
// day; "More ideas" shows the next few. "Use this idea" fills in the deal form (nothing is posted until HQ posts it), "Print a sign" prints
// a black and white Letter sign for the counter, and "Hide" takes an idea out of the list.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Coffee, Printer, EyeOff, RefreshCw, Clock } from 'lucide-react';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { appQrSvg } from '../../lib/appQr';
import { C, FONT, RADIUS } from '../../lib/theme';
import { Badge, Button, Card, Notice, SectionTitle } from '../kit';
import CardSkeleton from '../CardSkeleton';
import ErrorState from '../ErrorState';

export type ComboOffer = { title: string; titleEs: string; dealText: string; dealTextEs: string; description: string; descriptionEs: string; category: 'HOT_FOODS' | 'GROCERIES' };
type Side = { name: string; price: number | null; moved: number; generic: boolean };
type Combo = {
  id: string; rule: string; pairing: string; a: Side; b: Side;
  together: number | null; price: number | null; saving: number | null; why: string[]; timing: string | null; offer: ComboOffer;
};
type Result = { basis: { days: number; items: number; lines: number; hotFoodOrders: number }; ideas: Combo[]; hidden: number };

const PAGE = 6;
const usd = (n: number) => `$${n.toFixed(2)}`;
// What customers read: no store shorthand in front of a name ("(H) Honey Bun Glazed"), as on the server
const show = (s: string) => s.replace(/^\(\w{1,3}\)\s*/, '').trim();
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export default function ComboIdeasPanel({ onUse }: { onUse: (o: ComboOffer) => void }) {
  const qc = useQueryClient();
  const [page, setPage] = useState(0);
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['combo-ideas'], queryFn: () => offersApi.comboIdeas(), staleTime: 5 * 60_000 });
  const result = data?.data?.data as Result | undefined;

  const hide = useMutation({
    mutationFn: (key: string) => offersApi.dismissComboIdea(key),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['combo-ideas'] }); toast.success('Idea hidden.'); },
    onError: (e) => toast.error(serverMessage(e, 'Could not hide that idea.')),
  });
  const restore = useMutation({
    mutationFn: () => offersApi.restoreComboIdeas(),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ['combo-ideas'] }); setPage(0); toast.success(`${r.data?.data?.restored ?? 0} hidden idea(s) back in the list.`); },
    onError: (e) => toast.error(serverMessage(e, 'Could not show the hidden ideas.')),
  });

  const ideas = result?.ideas ?? [];
  const pages = Math.max(1, Math.ceil(ideas.length / PAGE));
  const shown = ideas.slice((page % pages) * PAGE, (page % pages) * PAGE + PAGE);

  return (
    <Card style={{ marginBottom: 24, maxWidth: 880 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <SectionTitle>Combo ideas</SectionTitle>
        {ideas.length > PAGE && (
          <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} onClick={() => setPage((p) => p + 1)}>
            More ideas ({(page % pages) + 1} of {pages})
          </Button>
        )}
      </div>
      {isLoading ? <CardSkeleton count={2} /> : isError || !result ? <ErrorState compact message="Could not work out the combo ideas." onRetry={() => refetch()} /> : (
        <>
          <p style={{ margin: '-4px 0 14px', color: C.muted, fontSize: FONT.body, lineHeight: 1.5 }}>
            Two things that go together for one price: coffee with something sweet, hot food with a can or a bottle, chips with a 24oz soda.
            Picked from {result.basis.items.toLocaleString('en-US')} items in Labels and the hot food menu, and what moved in the last {result.basis.days} days
            ({result.basis.lines.toLocaleString('en-US')} order list and stock request lines, {result.basis.hotFoodOrders.toLocaleString('en-US')} hot food items ordered).
            Prices stay inside your deal limits. New ideas come up every day.
          </p>
          {ideas.length === 0 ? (
            <Notice tone="info" icon={<Coffee size={16} />}>No combo ideas right now. Add prices and categories to items in Labels and they will come.</Notice>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {shown.map((c) => (
                <ComboCard key={c.id} combo={c} onUse={() => onUse(c.offer)} onPrint={() => printSign(c)} onHide={() => hide.mutate(c.id)} hiding={hide.isPending && hide.variables === c.id} />
              ))}
            </div>
          )}
          {result.hidden > 0 && (
            <div style={{ marginTop: 12, fontSize: FONT.small, color: C.muted }}>
              {result.hidden} idea{result.hidden === 1 ? '' : 's'} hidden.{' '}
              <button type="button" onClick={() => restore.mutate()} disabled={restore.isPending}
                style={{ background: 'none', border: 'none', padding: 0, color: C.primary, cursor: 'pointer', fontSize: FONT.small, textDecoration: 'underline' }}>
                Show them again
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function ComboCard({ combo: c, onUse, onPrint, onHide, hiding }: { combo: Combo; onUse: () => void; onPrint: () => void; onHide: () => void; hiding: boolean }) {
  const side = (s: Side) => (
    <span>
      <strong>{s.name}</strong>
      {s.price != null && <span style={{ color: C.muted }}> {usd(s.price)}</span>}
    </span>
  );
  return (
    <div data-testid="combo-card" style={{ border: `1px solid ${C.border}`, borderRadius: RADIUS.md, padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <Badge tone="info">{c.pairing}</Badge>
          <div style={{ fontSize: FONT.body + 1, color: C.text, marginTop: 6, lineHeight: 1.4 }}>{side(c.a)} + {side(c.b)}</div>
          <div style={{ marginTop: 4, fontSize: FONT.body, color: C.text }}>
            {c.price != null && c.together != null && c.saving != null ? (
              <>Both for <strong style={{ color: C.primary }}>{usd(c.price)}</strong> <span style={{ color: C.muted }}>(apart {usd(c.together)}, saves {usd(c.saving)}, {Math.round((c.saving / c.together) * 100)}%)</span></>
            ) : (
              <span style={{ color: C.warning }}>Set the combo price yourself.</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Button variant="primary" size="sm" onClick={onUse} aria-label={`Use this idea: ${c.offer.title}`}>Use this idea</Button>
          <Button variant="secondary" size="sm" icon={<Printer size={14} />} onClick={onPrint} aria-label={`Print a sign: ${c.offer.title}`}>Print a sign</Button>
          <Button variant="ghost" size="sm" icon={<EyeOff size={14} />} onClick={onHide} disabled={hiding} aria-label={`Hide: ${c.offer.title}`}>Hide</Button>
        </div>
      </div>
      <ul style={{ margin: 0, paddingLeft: 18, fontSize: FONT.small, color: C.text2, lineHeight: 1.5 }}>
        {c.why.map((w, i) => <li key={i}>{w}</li>)}
      </ul>
      {c.timing && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: FONT.small, color: C.text2, lineHeight: 1.5 }}>
          <Clock size={14} style={{ flexShrink: 0, marginTop: 2 }} aria-hidden /><span>{c.timing}</span>
        </div>
      )}
    </div>
  );
}

/** A black and white Letter sign for the counter: the two items, the price (or a box to write it in), and the app QR. */
export function printSign(c: { a: Side; b: Side; price: number | null; saving: number | null; offer: ComboOffer }) {
  const win = window.open('', '_blank');
  if (!win) { toast.error('Allow pop-ups for this site to print the sign.'); return; }
  const priceHtml = c.price != null
    ? `<div class="price"><span class="both">BOTH FOR</span><span class="amt">${esc(usd(c.price))}</span></div>${c.saving != null ? `<div class="save">You save ${esc(usd(c.saving))}</div>` : ''}`
    : `<div class="price"><span class="both">BOTH FOR</span><span class="blank">$</span></div>`;
  win.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${esc(c.offer.title)}</title><style>
    @page { size: letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Arial Black', Arial, Helvetica, sans-serif; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .sheet { height: 10in; border: 6px solid #000; display: flex; flex-direction: column; }
    .top { background: #000; color: #fff; text-align: center; font-size: 40pt; letter-spacing: 6px; padding: 14px 0 10px; }
    .items { flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 0 0.4in; }
    .item { font-size: 34pt; line-height: 1.1; text-transform: uppercase; }
    .plus { font-size: 60pt; line-height: 1; margin: 6px 0; }
    .price { display: flex; align-items: center; justify-content: center; gap: 18px; margin-top: 26px; }
    .both { font-size: 22pt; border: 4px solid #000; padding: 6px 12px; }
    .amt { font-size: 88pt; line-height: 1; }
    .blank { font-size: 70pt; border: 4px dashed #000; padding: 0 24px; min-width: 3.6in; text-align: left; line-height: 1.3; }
    .save { font-family: Arial, Helvetica, sans-serif; font-weight: 700; font-size: 18pt; margin-top: 10px; }
    .es { font-family: Arial, Helvetica, sans-serif; font-size: 14pt; margin-top: 14px; }
    .bottom { border-top: 4px solid #000; display: flex; align-items: center; gap: 18px; padding: 14px 18px; }
    .bottom p { margin: 0; font-family: Arial, Helvetica, sans-serif; font-size: 15pt; line-height: 1.35; }
    .bottom strong { font-family: 'Arial Black', Arial, sans-serif; font-size: 17pt; }
  </style></head><body><div class="sheet">
    <div class="top">COMBO</div>
    <div class="items">
      <div class="item">${esc(show(c.a.name))}</div>
      <div class="plus">+</div>
      <div class="item">${esc(show(c.b.name))}</div>
      ${priceHtml}
      <div class="es">${esc(c.offer.titleEs)}${c.offer.dealTextEs ? ` &middot; ${esc(c.offer.dealTextEs)}` : ''}</div>
    </div>
    <div class="bottom">
      ${appQrSvg(130)}
      <p><strong>Earn cashback on this combo.</strong><br>Get the free Lucky Stop app and show your QR at the register.<br>luckystop.cliffindus.com</p>
    </div>
  </div><script>window.onload = () => { window.print(); };</script></body></html>`);
  win.document.close();
}
