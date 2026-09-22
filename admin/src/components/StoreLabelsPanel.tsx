import { useState, CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, storesApi } from '../services/api';
import ConfirmModal from './ConfirmModal';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import TableSkeleton from './TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { canonicalPrice, priceProblem } from '../lib/labelPrice';
import { storeToday, storeDay } from '../lib/storeDates';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import PrintTray from './PrintTray';
import Modal from './Modal';
import { LabelPrintStatus, STATUS_LABEL, STATUS_COLOR, STATUS_BG, daysSince, formatAge } from '../utils/labelStatus';

interface StoreLabel {
  id: string;
  storeLabelId: string | null;
  productName: string;
  barcode: string | null;
  category: string | null;
  template: string;
  basePriceText: string | null;
  dealText: string | null;
  priceText: string | null;
  hasOverride: boolean;
  overrideExpiresAt: string | null;
  printedAt: string | null;
  status: LabelPrintStatus;
  createdAt: string;
  updatedAt: string;
}

// What the server says about one label it did not mark as printed
interface NotMarked {
  storeLabelId: string;
  productName: string | null;
  reason: 'gone' | 'no_price' | 'price_changed';
  printedPrice?: string;
  currentPrice?: string | null;
}

// A print that was sent to the printer and is waiting for the person to say whether the paper came out
interface PrintCheck {
  items: { storeLabelId: string; productName: string; quantity: number; printedPrice: string; storePrice: string | null }[];
}

function notMarkedText(n: NotMarked): string {
  const name = n.productName ?? 'A label';
  if (n.reason === 'gone') return `${name} is no longer in this store, so there was nothing to mark.`;
  if (n.reason === 'no_price') return `${name} has no price now, so it cannot be marked as printed.`;
  return `${name} was printed at $${n.printedPrice} but this store's price is ${n.currentPrice == null ? 'not set' : `$${n.currentPrice}`}, so it stays in the queue.`;
}

// Sentinel for the "Uncategorized" filter option — distinct from '' (no filter).
const UNCATEGORIZED = '__uncategorized__';

export default function StoreLabelsPanel() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const [storeId, setStoreId] = useState(() => searchParams.get('storeId') ?? '');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [editingPrice, setEditingPrice] = useState<StoreLabel | null>(null);
  const [priceDraft, setPriceDraft] = useState('');
  const [expiryDraft, setExpiryDraft] = useState('');
  const [pendingBulkPrint, setPendingBulkPrint] = useState<PrintableLabelEntry[] | null>(null);
  // A price typed in the tray only changes the print. It becomes the store's price only when "Save as this store's price" is pressed.
  const [printPrices, setPrintPrices] = useState<Record<string, string>>({});
  const [printCheck, setPrintCheck] = useState<PrintCheck | null>(null);
  const [printResult, setPrintResult] = useState<{ printed: number; copies: number; notMarked: NotMarked[] } | null>(null);
  const [removing, setRemoving] = useState<StoreLabel | null>(null);

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

  const refreshLabelViews = () => {
    ['store-labels', 'labels-coverage', 'labels-health-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const addMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.addToStore(labelId, storeId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      toast.success('Added at the base price');
    },
    onError: (e: any) => toast.error(failureMessage(e, 'Could not add the item to this store.')),
  });

  const priceMutation = useMutation({
    mutationFn: () => {
      // A date picked as "ends Sep 8" means the sale runs through the end of that store day (Central time). The server does the
      // calendar, so the date travels as picked and never depends on the time zone of the browser.
      const price = canonicalPrice(priceDraft) ?? priceDraft.trim();
      const ends = expiryDraft || null;
      return editingPrice!.storeLabelId
        ? labelsApi.updateStoreLabel(editingPrice!.storeLabelId, price, ends)
        : labelsApi.addToStore(editingPrice!.id, storeId, price, ends);
    },
    onSuccess: (res) => {
      refreshLabelViews();
      if (res.data?.changed === false) toast('That price and end date were already saved. Nothing changed.', { icon: 'ℹ️' });
      else toast.success(res.data?.needsReprint ? 'Price updated. The label is now in the print queue.' : 'Price updated for this store');
      setEditingPrice(null);
      setExpiryDraft('');
    },
    onError: (e: any) => toast.error(failureMessage(e, 'Could not update the price.')),
  });

  const revertMutation = useMutation({
    mutationFn: (storeLabelId: string) => labelsApi.updateStoreLabel(storeLabelId, null),
    onSuccess: (res) => {
      refreshLabelViews();
      if (res.data?.changed === false) toast('Already on the base price.', { icon: 'ℹ️' });
      else toast.success('Reverted to base price');
    },
    onError: (e: any) => toast.error(failureMessage(e, 'Could not go back to the base price.')),
  });

  // "Save as this store's price" on a tray row. Sent without an end date, so a sale keeps the end it has.
  const trayPriceMutation = useMutation({
    mutationFn: ({ item, price }: { item: StoreLabel; price: string }) =>
      item.storeLabelId
        ? labelsApi.updateStoreLabel(item.storeLabelId, price)
        : labelsApi.addToStore(item.id, storeId, price),
    onSuccess: (res, { item }) => {
      refreshLabelViews();
      setPrintPrices(prev => { const next = { ...prev }; delete next[item.storeLabelId ?? item.id]; return next; });
      if (res.data?.changed === false) toast('That is already this store\'s price.', { icon: 'ℹ️' });
      else toast.success('Saved as this store\'s price');
    },
    onError: (e: any) => toast.error(failureMessage(e, 'Could not update the price.')),
  });

  const removeMutation = useMutation({
    mutationFn: (storeLabelId: string) => labelsApi.removeStoreLabel(storeLabelId),
    onSuccess: () => {
      const name = stores.find(st => st.id === storeId)?.name ?? 'this store';
      refreshLabelViews();
      toast.success(`Removed from ${name}`);
      setRemoving(null);
    },
    onError: (e: any) => { toast.error(failureMessage(e, 'Could not remove the label from this store.')); setRemoving(null); },
  });

  // Marks labels printed, only after the person says the paper came out. Each item carries the price that is on the paper.
  const printMutation = useMutation({
    mutationFn: (check: PrintCheck) => labelsApi.print(check.items.map(i => ({ storeLabelId: i.storeLabelId, quantity: i.quantity, printedPrice: i.printedPrice }))),
    onSuccess: (res) => {
      const data = res.data?.data ?? {};
      refreshLabelViews();
      setPrintCheck(null);
      setSelectedIds(new Set());
      setQuantities({});
      setPrintPrices({});
      const notMarked: NotMarked[] = data.notMarked ?? [];
      if (notMarked.length > 0) setPrintResult({ printed: data.printedCount ?? 0, copies: data.totalCopies ?? 0, notMarked });
      else toast.success(`${data.printedCount ?? 0} label${data.printedCount === 1 ? '' : 's'} marked as printed`);
    },
    onError: (e: any) => toast.error(failureMessage(e, 'The labels were not marked as printed. They are still in the queue.')),
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
  const selectableFilteredItems = filteredItems.filter((i): i is StoreLabel & { storeLabelId: string } => !!i.storeLabelId && i.status !== 'needs_price');
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
    setPrintPrices(prev => { const next = { ...prev }; delete next[storeLabelId]; return next; });
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

  // A price typed in the tray changes the print only. If it is the store's own price again the one-off is forgotten.
  function changeTrayPrice(storeLabelId: string, price: string) {
    const item = items.find(i => i.storeLabelId === storeLabelId);
    if (!item) return;
    setPrintPrices(prev => {
      const next = { ...prev };
      if (price === item.priceText) delete next[storeLabelId]; else next[storeLabelId] = price;
      return next;
    });
  }

  function saveTrayPrice(storeLabelId: string) {
    const item = items.find(i => i.storeLabelId === storeLabelId);
    const price = printPrices[storeLabelId];
    if (item && price) trayPriceMutation.mutate({ item, price });
  }

  function buildPrintEntries(): PrintableLabelEntry[] {
    return items
      .filter((i): i is StoreLabel & { storeLabelId: string; priceText: string } =>
        !!i.storeLabelId && selectedIds.has(i.storeLabelId) && i.priceText != null)
      .map(i => ({
        label: {
          id: i.id, productName: i.productName, priceText: printPrices[i.storeLabelId!] ?? i.priceText,
          dealText: i.dealText, barcode: i.barcode, template: i.template,
        },
        quantity: quantities[i.storeLabelId!] ?? 1,
      }));
  }

  // Opens the print window and asks. Nothing is marked as printed until the person says the labels came out of the printer, so a
  // cancelled dialog or a jam leaves them in the queue.
  function runPrint(entries: PrintableLabelEntry[]) {
    const opened = printLabels(entries);
    if (!opened) return;
    setPrintCheck({
      items: entries.map(e => {
        const source = items.find(i => i.id === e.label.id)!;
        return { storeLabelId: source.storeLabelId!, productName: e.label.productName, quantity: e.quantity, printedPrice: e.label.priceText, storePrice: source.priceText };
      }),
    });
  }

  function keepQueued() {
    setPrintCheck(null);
    toast('Nothing was marked. The labels are still in the queue.', { icon: 'ℹ️' });
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

      {printCheck && (() => {
        const copies = printCheck.items.reduce((sum, i) => sum + i.quantity, 0);
        const oneOff = printCheck.items.filter(i => i.printedPrice !== i.storePrice);
        return (
          <Modal
            title="Did the labels print?"
            subtitle={<>{printCheck.items.length} label{printCheck.items.length === 1 ? '' : 's'} ({copies} cop{copies === 1 ? 'y' : 'ies'}) for {stores.find(st => st.id === storeId)?.name ?? 'this store'}</>}
            onClose={keepQueued}
            busy={printMutation.isPending}
            maxWidth={460}
          >
            <p style={m.para}>
              The print window is open. When the sheet has come out of the printer, answer here. Until you say yes, nothing is marked as printed, so a cancelled
              print or a paper jam does not clear the queue.
            </p>
            {oneOff.length > 0 && (
              <p style={m.note} role="note">
                {oneOff.length} of these {oneOff.length === 1 ? 'uses a price that is' : 'use prices that are'} not this store's price
                ({oneOff.slice(0, 3).map(i => `${i.productName} $${i.printedPrice}`).join(', ')}{oneOff.length > 3 ? ', and more' : ''}).
                {' '}They stay in the queue even if they printed. To count them as printed, save the price for the store first.
              </p>
            )}
            <div style={m.actions}>
              <button style={m.cancelBtn} onClick={keepQueued} disabled={printMutation.isPending}>No, keep them in the queue</button>
              <button style={m.saveBtn} onClick={() => printMutation.mutate(printCheck)} disabled={printMutation.isPending}>
                {printMutation.isPending ? 'Saving…' : 'Yes, they printed'}
              </button>
            </div>
          </Modal>
        );
      })()}

      {printResult && (
        <Modal title="Some labels stayed in the queue" subtitle={<>{printResult.printed} marked as printed ({printResult.copies} cop{printResult.copies === 1 ? 'y' : 'ies'})</>} onClose={() => setPrintResult(null)} maxWidth={480}>
          <ul style={m.list}>
            {printResult.notMarked.map(n => <li key={n.storeLabelId}>{notMarkedText(n)}</li>)}
          </ul>
          <div style={m.actions}>
            <button style={m.saveBtn} onClick={() => setPrintResult(null)} autoFocus>OK</button>
          </div>
        </Modal>
      )}

      <ConfirmModal
        open={!!removing}
        title="Remove From This Store?"
        message={removing ? `"${removing.productName}" was never printed at ${stores.find(st => st.id === storeId)?.name ?? 'this store'}. Removing it takes it out of this store's list only. It stays in the catalog and in every other store.` : ''}
        confirmLabel="Remove"
        danger
        busy={removeMutation.isPending}
        onConfirm={() => { if (removing?.storeLabelId) removeMutation.mutate(removing.storeLabelId); }}
        onCancel={() => setRemoving(null)}
      />

      {editingPrice && (
        <Modal
          title={`Price at ${stores.find(st => st.id === storeId)?.name ?? 'this store'}`}
          subtitle={<>{editingPrice.productName} — base price {editingPrice.basePriceText != null ? `$${editingPrice.basePriceText}` : 'not set'}</>}
          onClose={() => { setEditingPrice(null); setExpiryDraft(''); }}
          busy={priceMutation.isPending}
          maxWidth={400}
        >
          <div>
            <div style={m.priceInputWrap}>
              <span style={m.priceInputDollar} aria-hidden="true">$</span>
              <input
                style={m.input}
                value={priceDraft}
                onChange={e => setPriceDraft(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder={editingPrice.basePriceText ?? 'Enter a price'}
                autoFocus
                inputMode="decimal"
                maxLength={6}
                aria-label="Price at this store"
              />
            </div>
            {priceProblem(priceDraft) && <div role="alert" style={{ color: '#b91c1c', fontSize: 13, marginTop: 6 }}>{priceProblem(priceDraft)}</div>}
            <label style={m.expiryLabel} htmlFor="store-price-ends">Ends on <span style={m.expiryLabelSub}>(optional. The price goes back to the base price at the end of that day, Central time. No date = stays until changed.)</span></label>
            <input
              id="store-price-ends"
              type="date"
              style={m.expiryInput}
              value={expiryDraft}
              onChange={e => setExpiryDraft(e.target.value)}
              min={storeToday()}
            />
            <div style={m.actions}>
              <button style={m.cancelBtn} onClick={() => { setEditingPrice(null); setExpiryDraft(''); }} disabled={priceMutation.isPending}>Cancel</button>
              <button
                style={{ ...m.saveBtn, ...(!priceDraft.trim() || !canonicalPrice(priceDraft) ? m.saveBtnDim : {}) }}
                disabled={!canonicalPrice(priceDraft) || priceMutation.isPending}
                onClick={() => priceMutation.mutate()}
              >
                {priceMutation.isPending ? 'Saving…' : 'Save Override'}
              </button>
            </div>
          </div>
        </Modal>
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
                    {item.storeLabelId && item.status !== 'needs_price' && (
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
                    {item.priceText != null ? (
                      <>
                        ${item.priceText}
                        {item.hasOverride && <span style={s.overrideBadge}>override</span>}
                        {item.overrideExpiresAt && (
                          <span style={s.expiryBadge}>
                            ends {storeDay(item.overrideExpiresAt)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style={s.noPriceBadge}>No price set</span>
                    )}
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
                        <button style={s.addBtn} onClick={() => addMutation.mutate(item.id)}>
                          {item.basePriceText != null ? `Add at $${item.basePriceText}` : 'Add (no price yet)'}
                        </button>
                      ) : (
                        <button style={s.editBtn} onClick={() => { setEditingPrice(item); setPriceDraft(item.hasOverride ? (item.priceText ?? '') : ''); setExpiryDraft(item.overrideExpiresAt ? storeToday(new Date(item.overrideExpiresAt)) : ''); }}>
                          Set Price
                        </button>
                      )}
                      {item.hasOverride && item.storeLabelId && (
                        <button style={s.revertBtn} onClick={() => revertMutation.mutate(item.storeLabelId!)}>Use Base</button>
                      )}
                      {item.storeLabelId && item.status === 'new' && (
                        <button style={s.revertBtn} onClick={() => setRemoving(item)} aria-label={`Remove ${item.productName} from this store`}>Remove</button>
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
              priceText: printPrices[i.storeLabelId!] ?? i.priceText,
              storePrice: i.priceText,
              dealText: i.dealText,
              quantity: quantities[i.storeLabelId!] ?? 1,
              status: i.status as Exclude<LabelPrintStatus, 'not_added'>,
              ageLabel: i.status !== 'printed' ? formatAge(daysSince(i.status === 'new' ? i.createdAt : i.updatedAt)) : undefined,
              hasOverride: i.hasOverride,
            }))}
          editablePrice
          onQuantityChange={setQuantity}
          onPriceChange={changeTrayPrice}
          onSavePrice={saveTrayPrice}
          savingPriceId={trayPriceMutation.isPending ? (trayPriceMutation.variables?.item.storeLabelId ?? null) : null}
          onRemove={removeFromSelection}
          onPrint={handlePrintSelected}
          onClear={() => { setSelectedIds(new Set()); setQuantities({}); setPrintPrices({}); }}
          printLabelText="Print"
        />
      )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  pickerRow: { display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
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
  // The tray sits beside the table; on a narrow screen it wraps below it instead of pushing the page sideways
  layout: { display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  main: { flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

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
  itemName: { fontWeight: 700, fontSize: 14, color: PRIMARY },
  overrideBadge: {
    marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '2px 6px',
  },
  expiryBadge: {
    marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#7c3aed',
    background: '#f5f3ff', border: '1px solid #ddd6fe', borderRadius: 6, padding: '2px 6px',
  },
  noPriceBadge: {
    fontSize: 12, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '3px 8px',
  },
  statusBadge: { fontSize: 12, fontWeight: 700, borderRadius: 6, padding: '3px 8px' },
  ageText: { marginLeft: 8, fontSize: 12, color: TEXT_MUTED },
  addBtn: {
    background: '#eff6ff', color: PRIMARY, border: 'none',
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
  emptyTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
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
  expiryLabel: { display: 'block', fontSize: 12.5, fontWeight: 700, color: '#333', marginTop: 14, marginBottom: 6 },
  expiryLabelSub: { fontWeight: 400, color: TEXT_MUTED },
  expiryInput: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 14px',
    fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box' as const,
  },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: {
    background: '#f4f4f4', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444',
  },
  saveBtn: {
    background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
  para: { margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#333' },
  note: {
    margin: 0, padding: '10px 12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10,
    fontSize: 13.5, lineHeight: 1.5, color: '#7c5a10',
  },
  list: { margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 14, lineHeight: 1.5, color: '#333' },
};
