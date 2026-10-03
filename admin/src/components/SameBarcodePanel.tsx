// Labels > Same barcode: items that are really one product (the same barcode, or the same with and without the leading 0 that iPhones
// and Android phones disagree on), usually saved before "one barcode, one item" or on two phones. HQ picks the item to keep and the
// price it keeps; the others' store copies move onto it and the others are removed (backend labelCleanup.controller.ts).
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Barcode, CheckCircle2, Merge } from 'lucide-react';
import { labelsApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, RADIUS } from '../lib/theme';
import { Button, Card, Badge, Notice, EmptyState } from './kit';
import ConfirmModal from './ConfirmModal';
import CardSkeleton from './CardSkeleton';
import ErrorState from './ErrorState';
import { storeDayLong } from '../lib/storeDates';

type Item = {
  id: string; productName: string; barcode: string; priceText: string | null; dealText: string | null; category: string | null;
  createdAt: string; stores: number; ownPrices: { store: string; priceText: string }[];
};
type Group = { key: string; differentPrices: boolean; items: Item[] };
const money = (p: string | null) => (p ? `$${p}` : 'no price');

export default function SameBarcodePanel() {
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['label-duplicates'], queryFn: () => labelsApi.getDuplicates() });
  const groups: Group[] = data?.data?.data ?? [];
  if (isError) return <ErrorState message="Could not load the items that share a barcode." onRetry={refetch} />;
  if (isLoading) return <CardSkeleton count={3} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 980 }}>
      <p style={{ margin: 0, color: C.muted, fontSize: FONT.body, lineHeight: 1.5 }}>
        One barcode should be one item with one price. These items share a barcode (some differ only by a leading 0, which iPhones add
        and Android phones do not). Pick the item to keep and its price: the others' store copies move onto it, store prices are kept,
        and the others are removed. Stores whose shelf label changes are told to reprint.
      </p>
      {groups.length === 0 ? (
        <EmptyState icon={<CheckCircle2 size={22} />} title="Every barcode is one item" description="No two items share a barcode." />
      ) : groups.map((g) => <GroupCard key={g.key} group={g} />)}
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const qc = useQueryClient();
  // The default is the item most stores carry (then the oldest), and its own price
  const best = [...group.items].sort((a, b) => b.stores - a.stores)[0];
  const [keepId, setKeepId] = useState(best.id);
  const keep = group.items.find((i) => i.id === keepId)!;
  const prices = [...new Set(group.items.map((i) => i.priceText).filter((p): p is string => !!p))];
  const [price, setPrice] = useState<string | null>(best.priceText);
  const [asking, setAsking] = useState(false);
  const others = group.items.filter((i) => i.id !== keepId);

  const merge = useMutation({
    mutationFn: () => labelsApi.merge(keepId, others.map((o) => o.id), price),
    onSuccess: (res) => {
      const d = res.data?.data ?? {};
      toast.success(`Merged into "${keep.productName}" at ${money(d.priceText ?? price)}. ${d.reprint ? `${d.reprint} ${d.reprint === 1 ? 'store needs' : 'stores need'} to reprint.` : ''}`, { duration: 6000 });
      qc.invalidateQueries({ queryKey: ['label-duplicates'] });
      qc.invalidateQueries({ queryKey: ['labels'] });
      setAsking(false);
    },
    onError: (err) => { toast.error(serverMessage(err, 'Could not merge them. Nothing was changed.')); setAsking(false); qc.invalidateQueries({ queryKey: ['label-duplicates'] }); },
  });

  return (
    <Card padding={0} style={{ overflow: 'hidden' }}>
      <ConfirmModal
        open={asking}
        title="Merge these items?"
        message={`"${keep.productName}" stays, at ${money(price)} for every store that uses the chain price. ${others.map((o) => `"${o.productName}"`).join(', ')} ${others.length === 1 ? 'is' : 'are'} removed; ${others.length === 1 ? 'its' : 'their'} store copies move to "${keep.productName}" and keep their own store prices.`}
        confirmLabel={merge.isPending ? 'Merging…' : 'Merge'}
        busy={merge.isPending}
        onConfirm={() => { if (!merge.isPending) merge.mutate(); }}
        onCancel={() => setAsking(false)}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: `1px solid ${C.border}`, background: C.subtle, flexWrap: 'wrap' }}>
        <Barcode size={16} color={C.muted} aria-hidden />
        <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: FONT.body, color: C.text }}>{[...new Set(group.items.map((i) => i.barcode))].join('  /  ')}</span>
        <Badge>{group.items.length} items</Badge>
        {group.differentPrices && <Badge tone="warning">Different prices</Badge>}
      </div>
      <div role="radiogroup" aria-label={`Item to keep for barcode ${group.items[0].barcode}`}>
        {group.items.map((i) => (
          <label key={i.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 16px', borderBottom: `1px solid ${C.border}`, cursor: 'pointer', background: i.id === keepId ? C.primaryTint : C.surface }}>
            <input type="radio" name={`keep-${group.key}`} checked={i.id === keepId} onChange={() => { setKeepId(i.id); setPrice(i.priceText); }}
              style={{ marginTop: 3, accentColor: C.primary }} aria-label={`Keep ${i.productName}`} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong style={{ color: C.text, fontSize: FONT.body }}>{i.productName}</strong>
                <span style={{ color: C.text, fontWeight: 600 }}>{money(i.priceText)}</span>
                {i.dealText && <Badge>{i.dealText}</Badge>}
                {i.id === keepId && <Badge tone="info">Keep</Badge>}
              </div>
              <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 2 }}>
                Barcode {i.barcode}. {i.stores === 0 ? 'No store has it' : `${i.stores} ${i.stores === 1 ? 'store' : 'stores'}`}
                {i.ownPrices.length > 0 && `; own price at ${i.ownPrices.map((o) => `${o.store} $${o.priceText}`).join(', ')}`}. Added {storeDayLong(i.createdAt)}.
              </div>
            </div>
          </label>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '12px 16px', flexWrap: 'wrap' }}>
        {prices.length > 1 ? (
          <div role="radiogroup" aria-label="Price to keep" style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: FONT.small, color: C.text2, fontWeight: 600 }}>Price for all stores:</span>
            {prices.map((p) => (
              <button key={p} type="button" className="ui-chip" role="radio" aria-checked={price === p} onClick={() => setPrice(p)}>${p}</button>
            ))}
          </div>
        ) : <span style={{ fontSize: FONT.small, color: C.muted }}>Price for all stores: {money(price)}</span>}
        <Button variant="primary" icon={<Merge />} style={{ marginLeft: 'auto' }} onClick={() => setAsking(true)}>
          Merge into "{keep.productName.length > 24 ? `${keep.productName.slice(0, 24)}…` : keep.productName}"
        </Button>
      </div>
      {keep.ownPrices.length === 0 && others.some((o) => o.ownPrices.length > 0) && (
        <div style={{ padding: '0 16px 12px' }}>
          <Notice tone="neutral" style={{ fontSize: FONT.small, borderRadius: RADIUS.md }}>Store prices on the other items move with them.</Notice>
        </div>
      )}
    </Card>
  );
}
