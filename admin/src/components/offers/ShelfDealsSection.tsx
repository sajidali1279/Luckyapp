// Shelf deals from Labels: a label with a deal ("2 for $5") shows up by itself in the app's Today's Deals at every store that carries it
// (backend utils/shelfDeals.ts). Nothing to post; HQ can hide one from the app (the printed label is not changed) and show it again.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Eye, EyeOff, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { offersApi } from '../../services/api';
import { serverMessage } from '../../lib/apiError';
import { C, FONT } from '../../lib/theme';
import { Button, Card, Badge, SectionTitle } from '../kit';
import ErrorState from '../ErrorState';

export default function ShelfDealsSection() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['shelf-deals'], queryFn: () => offersApi.getShelfDeals() });
  const deals: any[] = data?.data?.data ?? [];
  const toggle = useMutation({
    mutationFn: ({ labelId, hidden }: { labelId: string; hidden: boolean }) => offersApi.setShelfDealHidden(labelId, hidden),
    onSuccess: (_r, v) => { toast.success(v.hidden ? 'Hidden from the app' : 'Showing in the app again'); qc.invalidateQueries({ queryKey: ['shelf-deals'] }); },
    onError: (err) => toast.error(serverMessage(err, 'Could not change it.')),
  });
  const shown = deals.filter((d) => !d.hidden).length;

  return (
    <div style={{ marginTop: 32 }}>
      <SectionTitle count={deals.length}>Shelf deals from Labels</SectionTitle>
      <p style={{ margin: '-4px 0 12px', color: C.muted, fontSize: FONT.body, maxWidth: 760, lineHeight: 1.5 }}>
        A label with a deal shows in the app's Today's Deals by itself, at each store that carries the label. Hiding one takes it out of the app only;
        the shelf label stays as it is. {deals.length > 0 && `${shown} of ${deals.length} showing.`}
      </p>
      {isError ? <ErrorState message="Could not load the shelf deals." onRetry={refetch} />
        : isLoading ? <div style={{ color: C.muted, fontSize: FONT.body }}>Loading…</div>
        : deals.length === 0 ? (
          <Card muted style={{ fontSize: FONT.body, color: C.text2 }}>
            No label has a deal yet. Add a deal (for example "2 for $5") to a label on the <Link to="/labels">Labels</Link> page and it shows in the app.
          </Card>
        ) : (
          <Card padding={0}>
            {deals.map((d, i) => (
              <div key={d.labelId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderTop: i ? `1px solid ${C.border}` : 'none', flexWrap: 'wrap', opacity: d.hidden ? 0.65 : 1 }}>
                <div style={{ fontSize: 17, fontWeight: 700, color: C.text, minWidth: 96 }}>{d.dealText}</div>
                <div style={{ flex: 1, minWidth: 160 }}>
                  <div style={{ fontWeight: 600, fontSize: FONT.body, color: C.text }}>{d.productName}</div>
                  <div style={{ fontSize: FONT.small, color: C.muted }}>
                    {d.priceText ? `Regular $${String(d.priceText).replace(/^\$/, '')}. ` : ''}<Printer size={11} aria-hidden style={{ verticalAlign: -1 }} /> {d.stores === 0 ? 'No store carries this label yet' : `${d.stores} ${d.stores === 1 ? 'store' : 'stores'}`}
                  </div>
                </div>
                {d.hidden ? <Badge>Hidden from the app</Badge> : d.stores > 0 ? <Badge tone="success">In the app</Badge> : <Badge>Not in any store</Badge>}
                <Button size="sm" variant="ghost" icon={d.hidden ? <Eye /> : <EyeOff />} disabled={toggle.isPending}
                  aria-label={`${d.hidden ? 'Show' : 'Hide'} ${d.productName} ${d.hidden ? 'in' : 'from'} the app`}
                  onClick={() => toggle.mutate({ labelId: d.labelId, hidden: !d.hidden })}>
                  {d.hidden ? 'Show in app' : 'Hide from app'}
                </Button>
              </div>
            ))}
          </Card>
        )}
    </div>
  );
}
