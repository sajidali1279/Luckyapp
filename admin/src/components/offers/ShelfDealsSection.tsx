// Shelf deals from Labels: a label with a deal ("2 for $5") shows up by itself in the app's Today's Deals at the stores that carry it
// (backend utils/shelfDeals.ts). Nothing to post; HQ can hide one from the app (the printed label is not changed) and show it again.
// 2026-10-18: a store shows only its first N label deals (Settings, most recently changed first), so the list says where each deal is
// actually in the app now ("At 4 of 12 stores"), not just "not hidden"; search and filters; tick many and hide or show them at once.
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { C, FONT, INPUT } from '../../lib/theme';
import { Button, Card, Badge, SectionTitle, HowItWorks } from '../kit';
import ErrorState from '../ErrorState';

type Deal = { labelId: string; productName: string; dealText: string; priceText: string | null; hidden: boolean; stores: number; category: string | null; restricted: boolean; shownAt: number };
type Status = '' | 'SHOWING' | 'WAITING' | 'HIDDEN' | 'NEVER' | 'NO_STORE';
const STATUS_LABEL: Record<Exclude<Status, ''>, string> = {
  SHOWING: 'In the app now', WAITING: 'Allowed, not in the app now', HIDDEN: 'Hidden', NEVER: 'Tobacco or alcohol (never shown)', NO_STORE: 'No store carries it',
};
const statusOf = (d: Deal): Exclude<Status, ''> => (d.restricted ? 'NEVER' : d.hidden ? 'HIDDEN' : d.stores === 0 ? 'NO_STORE' : d.shownAt > 0 ? 'SHOWING' : 'WAITING');
const words = (c: string | null) => (c ? c.charAt(0) + c.slice(1).toLowerCase().replace(/_/g, ' ') : 'No category');
const PAGE = 60;

export default function ShelfDealsSection() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['shelf-deals'], queryFn: () => offersApi.getShelfDeals() });
  const deals: Deal[] = data?.data?.data ?? [];
  const meta: { perStore: number; stores: number } | undefined = data?.data?.meta;

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('');
  const [category, setCategory] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of deals) c[statusOf(d)] = (c[statusOf(d)] ?? 0) + 1;
    return c;
  }, [deals]);
  const categories = useMemo(() => [...new Set(deals.map((d) => d.category ?? ''))].sort(), [deals]);
  const shown = useMemo(() => {
    const words_ = search.toLowerCase().split(/\s+/).filter(Boolean);
    return deals.filter((d) => (!status || statusOf(d) === status) && (!category || (d.category ?? '') === category)
      && words_.every((w) => `${d.productName} ${d.dealText}`.toLowerCase().includes(w)));
  }, [deals, search, status, category]);
  const visible = shown.slice(0, limit);
  const pickable = shown.filter((d) => !d.restricted);
  const allPicked = pickable.length > 0 && pickable.every((d) => picked.has(d.labelId));
  const pickedDeals = deals.filter((d) => picked.has(d.labelId));
  const toHide = pickedDeals.filter((d) => !d.hidden).length;
  const toShow = pickedDeals.filter((d) => d.hidden).length;

  const done = () => qc.invalidateQueries({ queryKey: ['shelf-deals'] });
  const toggle = useMutation({
    mutationFn: ({ labelId, hidden }: { labelId: string; hidden: boolean }) => offersApi.setShelfDealHidden(labelId, hidden),
    onSuccess: (_r, v) => { toast.success(v.hidden ? 'Hidden from the app' : 'Allowed in the app again'); done(); },
    onError: (err) => toast.error(serverMessage(err, 'Could not change it.')),
  });
  const bulk = useMutation({
    mutationFn: (hidden: boolean) => offersApi.setShelfDealsHidden([...picked], hidden),
    onSuccess: (r, hidden) => { const n = r?.data?.data?.changed ?? 0; toast.success(`${n} deal${n === 1 ? '' : 's'} ${hidden ? 'hidden from the app' : 'allowed in the app again'}.`); setPicked(new Set()); done(); },
    onError: (err) => toast.error(serverMessage(err, 'Could not change them.')),
  });
  const flip = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const pickAll = () => setPicked((p) => { const n = new Set(p); if (allPicked) pickable.forEach((d) => n.delete(d.labelId)); else pickable.forEach((d) => n.add(d.labelId)); return n; });

  return (
    <div style={{ marginTop: 32 }}>
      <SectionTitle count={deals.length}>Shelf deals from Labels</SectionTitle>
      <p style={{ margin: '-4px 0 6px', color: C.muted, fontSize: FONT.body, lineHeight: 1.5 }}>
        {meta ? <>Each store's customers see up to <strong style={{ color: C.text }}>{meta.perStore}</strong> label deals, the most recently changed labels first (<Link to="/settings?tab=rewards&find=rule-shelfDealsPerStore-row">change in Settings</Link>). </> : null}
        {deals.length > 0 && <>{counts.SHOWING ?? 0} of {deals.length} are in the app at one store or more right now{counts.WAITING ? `; ${counts.WAITING} are allowed but not in the app now (other deals are newer)` : ''}.</>}
      </p>
      <HowItWorks>
        A label with a deal shows in the app's Today's Deals at the stores that carry it, up to the number above per store. Hiding one takes it
        out of the app only; the shelf label stays as it is, and a newer deal takes its place. Tobacco and alcohol deals never show in the app.
        Deals posted on this page (above) always show.
      </HowItWorks>
      {isError ? <ErrorState message="Could not load the shelf deals." onRetry={refetch} />
        : isLoading ? <div style={{ color: C.muted, fontSize: FONT.body }}>Loading…</div>
        : deals.length === 0 ? (
          <Card muted style={{ fontSize: FONT.body, color: C.text2 }}>
            No label has a deal yet. Add a deal (for example "2 for $5") to a label on the <Link to="/labels">Labels</Link> page and it shows in the app.
          </Card>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', margin: '10px 0' }}>
              <input aria-label="Search shelf deals" type="search" placeholder="Search product or deal" value={search}
                onChange={(e) => { setSearch(e.target.value); setLimit(PAGE); }} style={{ ...INPUT, flex: '1 1 220px', maxWidth: 340 }} />
              <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value as Status); setLimit(PAGE); }} style={{ ...INPUT, width: 'auto' }}>
                <option value="">Every status ({deals.length})</option>
                {(Object.keys(STATUS_LABEL) as Exclude<Status, ''>[]).map((k) => <option key={k} value={k}>{STATUS_LABEL[k]} ({counts[k] ?? 0})</option>)}
              </select>
              <select aria-label="Category" value={category} onChange={(e) => { setCategory(e.target.value); setLimit(PAGE); }} style={{ ...INPUT, width: 'auto' }}>
                <option value="">Every category</option>
                {categories.map((c) => <option key={c || 'none'} value={c}>{words(c || null)}</option>)}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '8px 14px', borderRadius: 10, background: picked.size ? '#eef2f7' : 'transparent', marginBottom: 8, minHeight: 44 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.small, fontWeight: 600, color: C.text2, cursor: 'pointer' }}>
                <input type="checkbox" checked={allPicked} onChange={pickAll} disabled={pickable.length === 0} />
                {allPicked ? `All ${pickable.length} below picked` : `Pick all ${pickable.length} below`}
              </label>
              {picked.size > 0 && (
                <>
                  <span style={{ fontSize: FONT.small, color: C.text2 }}>{picked.size} picked</span>
                  <Button size="sm" variant="secondary" icon={<EyeOff />} disabled={bulk.isPending || toHide === 0} onClick={() => bulk.mutate(true)}>Hide {toHide || ''} from the app</Button>
                  <Button size="sm" variant="secondary" icon={<Eye />} disabled={bulk.isPending || toShow === 0} onClick={() => bulk.mutate(false)}>Allow {toShow || ''} again</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>
                </>
              )}
            </div>

            {shown.length === 0 ? (
              <Card muted style={{ fontSize: FONT.body, color: C.text2 }}>No shelf deal matches.</Card>
            ) : (
              <Card padding={0}>
                {visible.map((d, i) => {
                  const st = statusOf(d);
                  return (
                    <div key={d.labelId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${C.border}` : 'none', flexWrap: 'wrap', opacity: st === 'HIDDEN' || st === 'NEVER' ? 0.65 : 1 }}>
                      <input type="checkbox" aria-label={`Pick ${d.productName}`} checked={picked.has(d.labelId)} disabled={d.restricted} onChange={() => flip(d.labelId)} />
                      <div style={{ fontSize: 17, fontWeight: 700, color: C.text, minWidth: 96 }}>{d.dealText}</div>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <div style={{ fontWeight: 600, fontSize: FONT.body, color: C.text }}>{d.productName}</div>
                        <div style={{ fontSize: FONT.small, color: C.muted }}>
                          {d.priceText ? `Regular $${String(d.priceText).replace(/^\$/, '')}. ` : ''}{words(d.category)}. <Printer size={11} aria-hidden style={{ display: 'inline-block', verticalAlign: -1 }} /> {d.stores === 0 ? 'No store carries this label yet' : `Label at ${d.stores} ${d.stores === 1 ? 'store' : 'stores'}`}
                        </div>
                      </div>
                      {st === 'SHOWING' ? <Badge tone="success">In the app at {d.shownAt} of {d.stores} {d.stores === 1 ? 'store' : 'stores'}</Badge>
                        : st === 'WAITING' ? <Badge title="Allowed, but each store shows only its newest label deals">Not in the app now</Badge>
                        : st === 'HIDDEN' ? <Badge>Hidden from the app</Badge>
                        : st === 'NEVER' ? <Badge>Never shown (tobacco or alcohol)</Badge>
                        : <Badge>Not in any store</Badge>}
                      {!d.restricted && (
                        <Button size="sm" variant="ghost" icon={d.hidden ? <Eye /> : <EyeOff />} disabled={toggle.isPending}
                          aria-label={`${d.hidden ? 'Allow' : 'Hide'} ${d.productName} ${d.hidden ? 'in' : 'from'} the app`}
                          onClick={() => toggle.mutate({ labelId: d.labelId, hidden: !d.hidden })}>
                          {d.hidden ? 'Allow in app' : 'Hide from app'}
                        </Button>
                      )}
                    </div>
                  );
                })}
              </Card>
            )}
            {shown.length > visible.length && (
              <div style={{ marginTop: 10, display: 'flex', gap: 10, alignItems: 'center' }}>
                <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - visible.length)} more</Button>
                <span style={{ fontSize: FONT.small, color: C.muted }}>{visible.length} of {shown.length}</span>
              </div>
            )}
          </>
        )}
    </div>
  );
}
