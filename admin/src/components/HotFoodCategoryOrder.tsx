// Hot Food > Catalog > Category order (HQ, 2026-11-10): the order of the sections on the app's hot food menu (Chicken, Breakfast...).
// Up and down buttons; Save sends the whole order; "Suggested order" goes back to the built-in one (backend utils/hotFoodCategories.ts).
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { hotFoodCatalogApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, TEXT_MUTED } from '../lib/theme';
import { Button, Notice } from './kit';
import Modal from './Modal';

/** HQ's section order, read by the Catalog tab too (its category chips follow it) */
export function useCategoryOrder() {
  const q = useQuery({ queryKey: ['hot-food-category-order'], queryFn: () => hotFoodCatalogApi.getCategoryOrder(), staleTime: 60_000 });
  return { order: (q.data?.data?.data?.order ?? []) as string[], custom: q.data?.data?.data?.custom === true, q };
}

export default function HotFoodCategoryOrder({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { order, custom, q } = useCategoryOrder();
  const [list, setList] = useState<string[] | null>(null);
  const shown = list ?? order;
  const move = (i: number, by: number) => {
    const next = [...shown];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
  };
  const save = useMutation({
    mutationFn: (o: string[]) => hotFoodCatalogApi.setCategoryOrder(o),
    onSuccess: (_r, o) => {
      toast.success(o.length ? 'Section order saved. The app shows it at its next menu refresh.' : 'Back to the suggested order.');
      qc.invalidateQueries({ queryKey: ['hot-food-category-order'] });
      qc.invalidateQueries({ queryKey: ['hot-food-menu-grid'] });
      onClose();
    },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the order.')),
  });
  return (
    <Modal title="Category order" subtitle="The order of the sections on the app's hot food menu" onClose={onClose} busy={save.isPending} maxWidth={440}>
      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the categories.</Notice> : shown.length === 0 ? (
        <Notice>No item has a category yet. Give items a category in the Catalog first.</Notice>
      ) : (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 6 }} aria-label="Sections in order">
          {shown.map((c, i) => (
            <li key={c} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px solid ${C.border}`, borderRadius: 8 }}>
              <span style={{ width: 22, color: TEXT_MUTED, fontSize: FONT.small, fontWeight: 700 }}>{i + 1}</span>
              <span style={{ flex: 1, color: C.text, fontWeight: 600 }}>{c}</span>
              <Button size="sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c} up`} icon={<ArrowUp />} />
              <Button size="sm" onClick={() => move(i, 1)} disabled={i === shown.length - 1} aria-label={`Move ${c} down`} icon={<ArrowDown />} />
            </li>
          ))}
        </ol>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 14 }}>
        <Button onClick={() => save.mutate([])} disabled={!custom || save.isPending}>Suggested order</Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate(shown)} disabled={!list || save.isPending}>{save.isPending ? 'Saving…' : 'Save order'}</Button>
        </div>
      </div>
    </Modal>
  );
}
