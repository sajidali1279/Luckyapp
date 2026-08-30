import { useState, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, storesApi } from '../services/api';
import ConfirmModal from './ConfirmModal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import TableSkeleton from './TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';

interface StoreLabel {
  id: string;
  storeLabelId: string | null;
  productName: string;
  barcode: string | null;
  category: string | null;
  template: string;
  basePriceText: string;
  dealText: string | null;
  priceText: string;
  hasOverride: boolean;
  printedAt: string | null;
  updatedAt: string;
}

export default function StoreLabelsPanel() {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingPrice, setEditingPrice] = useState<StoreLabel | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [pendingBulkPrint, setPendingBulkPrint] = useState<PrintableLabelEntry[] | null>(null);

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: () => storesApi.getAccessible(),
  });
  const stores: any[] = storesData?.data?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['store-labels', storeId],
    queryFn: () => labelsApi.getStoreLabels(storeId),
    enabled: !!storeId,
  });
  const items: StoreLabel[] = data?.data?.data || [];

  const addMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.addToStore(labelId, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Added at the base price');
    },
    onError: () => toast.error('Failed to add'),
  });

  const priceMutation = useMutation({
    mutationFn: () =>
      editingPrice!.storeLabelId
        ? labelsApi.updateStoreLabel(editingPrice!.storeLabelId, priceDraft.trim())
        : labelsApi.addToStore(editingPrice!.id, storeId, priceDraft.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Price updated for this store');
      setEditingPrice(null);
    },
    onError: () => toast.error('Failed to update price'),
  });

  const revertMutation = useMutation({
    mutationFn: (storeLabelId: string) => labelsApi.updateStoreLabel(storeLabelId, null),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Reverted to base price');
    },
    onError: () => toast.error('Failed to revert'),
  });

  function toggleSelected(item: StoreLabel) {
    if (!item.storeLabelId) return;
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(item.storeLabelId!)) next.delete(item.storeLabelId!);
      else next.add(item.storeLabelId!);
      return next;
    });
    setQuantities(prev => {
      if (prev[item.storeLabelId!] !== undefined) {
        const next = { ...prev };
        delete next[item.storeLabelId!];
        return next;
      }
      return { ...prev, [item.storeLabelId!]: 1 };
    });
  }

  function setQuantity(storeLabelId: string, qty: number) {
    setQuantities(prev => ({ ...prev, [storeLabelId]: Math.max(1, Math.min(999, qty || 1)) }));
  }

  const totalCopies = [...selectedIds].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  function buildPrintEntries(): PrintableLabelEntry[] {
    return items
      .filter(i => i.storeLabelId && selectedIds.has(i.storeLabelId))
      .map(i => ({
        label: {
          id: i.id, productName: i.productName, priceText: i.priceText,
          dealText: i.dealText, barcode: i.barcode, template: i.template,
        },
        quantity: quantities[i.storeLabelId!] ?? 1,
      }));
  }

  function runPrint(entries: PrintableLabelEntry[]) {
    const opened = printLabels(entries);
    if (opened) {
      const printItems = entries.map(e => {
        const source = items.find(i => i.id === e.label.id)!;
        return { storeLabelId: source.storeLabelId!, quantity: e.quantity };
      });
      labelsApi.print(printItems).catch(() => {});
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      setSelectedIds(new Set());
      setQuantities({});
    }
  }

  function handlePrintSelected() {
    const entries = buildPrintEntries();
    if (entries.length === 0) return;
    if (entries.length > 5) {
      setPendingBulkPrint(entries);
      return;
    }
    runPrint(entries);
  }

  return (
    <div style={s.wrap}>
      <ConfirmModal
        open={!!pendingBulkPrint}
        title="Print This Many Labels?"
        message={pendingBulkPrint ? `You're about to print ${pendingBulkPrint.length} labels (${pendingBulkPrint.reduce((sum, e) => sum + e.quantity, 0)} total copies) for this store. Continue?` : ''}
        confirmLabel="Print"
        onConfirm={() => { if (pendingBulkPrint) runPrint(pendingBulkPrint); setPendingBulkPrint(null); }}
        onCancel={() => setPendingBulkPrint(null)}
      />

      {editingPrice && (
        <div style={m.overlay} onClick={() => setEditingPrice(null)}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <h3 style={m.title}>Price at {stores.find(st => st.id === storeId)?.name}</h3>
            <p style={m.sub}>{editingPrice.productName} — base price ${editingPrice.basePriceText}</p>
            <div style={m.priceInputWrap}>
              <span style={m.priceInputDollar}>$</span>
              <input
                style={m.input}
                value={priceDraft}
                onChange={e => setPriceDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={editingPrice.basePriceText}
                autoFocus
              />
            </div>
            <div style={m.actions}>
              <button style={m.cancelBtn} onClick={() => setEditingPrice(null)}>Cancel</button>
              <button
                style={{ ...m.saveBtn, ...(!priceDraft.trim() ? m.saveBtnDim : {}) }}
                disabled={!priceDraft.trim() || priceMutation.isPending}
                onClick={() => priceMutation.mutate()}
              >
                {priceMutation.isPending ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={s.pickerRow}>
        <select style={s.storeSelect} value={storeId} onChange={e => { setStoreId(e.target.value); setSelectedIds(new Set()); setQuantities({}); }}>
          <option value="">Choose a store…</option>
          {stores.map((st: any) => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
        {storeId && (
          <button
            style={{ ...s.printBtn, ...(selectedIds.size === 0 ? s.printBtnDim : {}) }}
            onClick={handlePrintSelected}
            disabled={selectedIds.size === 0}
          >
            🖨️ Print Selected ({totalCopies})
          </button>
        )}
      </div>

      {!storeId ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏪</div>
          <div style={s.emptyTitle}>Pick a store</div>
          <div style={s.emptySub}>See every catalog item's price and print status at that store</div>
        </div>
      ) : isLoading ? (
        <TableSkeleton columns={6} />
      ) : items.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏷️</div>
          <div style={s.emptyTitle}>The catalog is empty</div>
          <div style={s.emptySub}>Add a label from the Catalog tab first</div>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                {['', 'Product', 'Price', 'Qty', 'Status', 'Actions'].map(h => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => (
                <TableRow key={item.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                  <TableCell style={s.td}>
                    {item.storeLabelId && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.storeLabelId)}
                        onChange={() => toggleSelected(item)}
                      />
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    <span style={s.itemName}>{item.productName}</span>
                  </TableCell>
                  <TableCell style={s.td}>
                    ${item.priceText}
                    {item.hasOverride && <span style={s.overrideBadge}>override</span>}
                  </TableCell>
                  <TableCell style={s.td}>
                    {item.storeLabelId && selectedIds.has(item.storeLabelId) && (
                      <input
                        type="number"
                        min={1}
                        max={999}
                        style={s.qtyInput}
                        value={quantities[item.storeLabelId] ?? 1}
                        onChange={e => setQuantity(item.storeLabelId!, parseInt(e.target.value, 10))}
                      />
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    {!item.storeLabelId ? (
                      <span style={{ color: TEXT_MUTED }}>Not added</span>
                    ) : item.printedAt ? (
                      <span style={s.printedBadge}>✓ Printed</span>
                    ) : (
                      <span style={s.readyBadge}>Ready to Print</span>
                    )}
                  </TableCell>
                  <TableCell style={s.td}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {!item.storeLabelId ? (
                        <button style={s.addBtn} onClick={() => addMutation.mutate(item.id)}>Add at ${item.basePriceText}</button>
                      ) : (
                        <button style={s.editBtn} onClick={() => { setEditingPrice(item); setPriceDraft(item.hasOverride ? item.priceText : ''); }}>
                          Set Price
                        </button>
                      )}
                      {item.hasOverride && item.storeLabelId && (
                        <button style={s.revertBtn} onClick={() => revertMutation.mutate(item.storeLabelId!)}>Use Base</button>
                      )}
                    </div>
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
  pickerRow: { display: 'flex', gap: 10, alignItems: 'center' },
  storeSelect: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 14px',
    fontSize: 14, background: '#fff', color: '#333', cursor: 'pointer', minWidth: 220,
  },
  printBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#0f5132', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  printBtnDim: { opacity: 0.5, cursor: 'not-allowed' },

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
  itemName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  overrideBadge: {
    marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 6px',
  },
  printedBadge: { fontSize: 13, fontWeight: 600, color: '#0f5132' },
  readyBadge: { fontSize: 13, fontWeight: 600, color: '#b7791f' },
  qtyInput: {
    width: 52, padding: '6px 8px', borderRadius: 8, border: '1.5px solid #ddd',
    fontSize: 14, textAlign: 'center' as const,
  },
  addBtn: {
    background: '#eff6ff', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  editBtn: {
    background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },
  revertBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
  },

  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 380,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', padding: 24,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 800, color: '#1D3557' },
  sub: { fontSize: 13, color: TEXT_MUTED, marginTop: 4, marginBottom: 16 },
  priceInputWrap: { position: 'relative' as const },
  priceInputDollar: {
    position: 'absolute' as const, left: 14, top: '50%', transform: 'translateY(-50%)',
    fontSize: 15, fontWeight: 700, color: '#667', pointerEvents: 'none' as const,
  },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10, paddingLeft: 26,
    padding: '10px 14px 10px 26px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: {
    background: '#f4f4f4', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444',
  },
  saveBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};
