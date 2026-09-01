import { useState, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, storesApi } from '../services/api';
import ConfirmModal from './ConfirmModal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import TableSkeleton from './TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import PrintTray from './PrintTray';
import { LabelPrintStatus, STATUS_LABEL, STATUS_COLOR, STATUS_BG, daysSince, formatAge } from '../utils/labelStatus';

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
  status: LabelPrintStatus;
  createdAt: string;
  updatedAt: string;
}

// Sentinel for the "Uncategorized" filter option — distinct from '' (no filter).
const UNCATEGORIZED = '__uncategorized__';

export default function StoreLabelsPanel() {
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
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

  const filteredItems = items.filter((item) => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchesName = item.productName.toLowerCase().includes(q);
      const matchesBarcode = !!item.barcode && item.barcode.toLowerCase().includes(q);
      if (!matchesName && !matchesBarcode) return false;
    }
    if (categoryFilter === UNCATEGORIZED) {
      if (item.category) return false;
    } else if (categoryFilter && item.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const availableCategories = Array.from(
    new Set(items.map((i) => i.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = items.some((i) => !i.category);

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

  // Inline price edits made directly in the print tray — same override
  // mutation "Set Price" uses, just triggered from the review-before-print
  // panel instead of its own modal.
  const trayPriceMutation = useMutation({
    mutationFn: ({ item, price }: { item: StoreLabel; price: string }) =>
      item.storeLabelId
        ? labelsApi.updateStoreLabel(item.storeLabelId, price)
        : labelsApi.addToStore(item.id, storeId, price),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Price updated for this store');
    },
    onError: () => toast.error('Failed to update price'),
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

  // "Not added" rows have no storeLabelId and no checkbox at all — select-all
  // only ever targets the rows that are actually selectable.
  const selectableFilteredItems = filteredItems.filter((i): i is StoreLabel & { storeLabelId: string } => !!i.storeLabelId);
  const allFilteredSelected = selectableFilteredItems.length > 0 && selectableFilteredItems.every(i => selectedIds.has(i.storeLabelId));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) selectableFilteredItems.forEach(i => next.delete(i.storeLabelId));
      else selectableFilteredItems.forEach(i => next.add(i.storeLabelId));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      if (allFilteredSelected) selectableFilteredItems.forEach(i => { delete next[i.storeLabelId]; });
      else selectableFilteredItems.forEach(i => { if (!(i.storeLabelId in next)) next[i.storeLabelId] = 1; });
      return next;
    });
  }

  function removeFromSelection(storeLabelId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(storeLabelId);
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      delete next[storeLabelId];
      return next;
    });
  }

  function changeTrayPrice(storeLabelId: string, price: string) {
    const item = items.find(i => i.storeLabelId === storeLabelId);
    if (item) trayPriceMutation.mutate({ item, price });
  }

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

  async function runPrint(entries: PrintableLabelEntry[]) {
    const opened = printLabels(entries);
    if (opened) {
      const printItems = entries.map(e => {
        const source = items.find(i => i.id === e.label.id)!;
        return { storeLabelId: source.storeLabelId!, quantity: e.quantity };
      });
      try {
        await labelsApi.print(printItems);
        qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      } catch {
        toast.error('Printed, but failed to update status — refresh to check');
      }
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
        <select style={s.storeSelect} value={storeId} onChange={e => { setStoreId(e.target.value); setSelectedIds(new Set()); setQuantities({}); setSearch(''); setCategoryFilter(''); }}>
          <option value="">Choose a store…</option>
          {stores.map((st: any) => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
        {storeId && items.length > 0 && (
          <>
            <input
              style={s.searchInput}
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by product name or barcode…"
            />
            {(availableCategories.length > 0 || hasUncategorized) && (
              <select style={s.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
                <option value="">All Categories</option>
                {availableCategories.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
                {hasUncategorized && <option value={UNCATEGORIZED}>Uncategorized</option>}
              </select>
            )}
          </>
        )}
      </div>

      <div style={s.layout}>
      <div style={s.main}>
      {!storeId ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏪</div>
          <div style={s.emptyTitle}>Pick a store</div>
          <div style={s.emptySub}>See every catalog item's price and print status at that store</div>
        </div>
      ) : isLoading ? (
        <TableSkeleton columns={5} />
      ) : items.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏷️</div>
          <div style={s.emptyTitle}>The catalog is empty</div>
          <div style={s.emptySub}>Add a label from the Catalog tab first</div>
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🔍</div>
          <div style={s.emptyTitle}>No items match your filters</div>
          <div style={s.emptySub}>Try clearing the search or category filter</div>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                <TableHead style={s.th}>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
                </TableHead>
                {['Product', 'Price', 'Status', 'Actions'].map(h => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredItems.map((item, i) => (
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
                    <span style={{ ...s.statusBadge, color: STATUS_COLOR[item.status], background: STATUS_BG[item.status] }}>
                      {STATUS_LABEL[item.status]}
                    </span>
                    {item.status !== 'not_added' && item.status !== 'printed' && (
                      <span style={s.ageText}>
                        {formatAge(daysSince(item.status === 'new' ? item.createdAt : item.updatedAt))}
                      </span>
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

      {selectedIds.size > 0 && (
        <PrintTray
          items={items
            .filter(i => i.storeLabelId && selectedIds.has(i.storeLabelId))
            .map(i => ({
              id: i.storeLabelId!,
              productName: i.productName,
              priceText: i.priceText,
              dealText: i.dealText,
              quantity: quantities[i.storeLabelId!] ?? 1,
              status: i.status as Exclude<LabelPrintStatus, 'not_added'>,
              ageLabel: i.status !== 'printed' ? formatAge(daysSince(i.status === 'new' ? i.createdAt : i.updatedAt)) : undefined,
              hasOverride: i.hasOverride,
            }))}
          editablePrice
          onQuantityChange={setQuantity}
          onPriceChange={changeTrayPrice}
          onRemove={removeFromSelection}
          onPrint={handlePrintSelected}
          onClear={() => { setSelectedIds(new Set()); setQuantities({}); }}
          printLabelText="Print"
        />
      )}
      </div>
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
  searchInput: {
    flex: '1 1 240px', minWidth: 200, border: '1.5px solid #ddd', borderRadius: 10,
    padding: '9px 14px', fontSize: 14, outline: 'none',
  },
  filterSelect: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 12px',
    fontSize: 14, background: '#fff', color: '#333', cursor: 'pointer',
  },
  layout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

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
  statusBadge: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 8px' },
  ageText: { marginLeft: 8, fontSize: 12, color: TEXT_MUTED },
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
