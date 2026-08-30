import { useState, useEffect, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, orderCategoriesApi, scannedProductApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { LABEL_PRESETS } from '../data/labelPresets';
import StoreLabelsPanel from '../components/StoreLabelsPanel';
import CoverageView from '../components/CoverageView';
import PrintTray from '../components/PrintTray';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
}

// Sentinel for the "Uncategorized" filter option — distinct from '' (no filter).
const UNCATEGORIZED = '__uncategorized__';

const TEMPLATE_OPTIONS: { value: string; label: string; accent: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black', accent: '#b91c1c' },
  { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter', accent: '#14532d' },
  { value: 'SUMMER', label: 'Summer', accent: '#ea580c' },
  { value: 'CLEARANCE', label: 'Clearance', accent: '#dc2626' },
  { value: 'INDEPENDENCE_DAY', label: 'Independence Day', accent: '#1e3a8a' },
  { value: 'HALLOWEEN', label: 'Halloween', accent: '#7c3aed' },
  { value: 'PREMIUM', label: 'Premium / Top Shelf', accent: '#b8860b' },
];

const TEMPLATE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_OPTIONS.map(t => [t.value, t.label])
);

export default function Labels() {
  const qc = useQueryClient();
  const [viewMode, setViewMode] = useState<'catalog' | 'store' | 'coverage'>('catalog');
  const [showModal, setShowModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formDealText, setFormDealText] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  const [confirmDelete, setConfirmDelete] = useState<Label | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});
  const [pendingBulkPrint, setPendingBulkPrint] = useState<PrintableLabelEntry[] | null>(null);

  const nameQuery = formProductName.trim().toLowerCase();
  const suggestions = nameQuery
    ? LABEL_PRESETS.filter(p => p.name.toLowerCase().includes(nameQuery)).slice(0, 8)
    : [];

  function applyPreset(preset: (typeof LABEL_PRESETS)[number]) {
    setFormProductName(preset.name);
    setFormPriceText(preset.priceText.replace(/^\$/, ''));
    setShowSuggestions(false);
  }

  useEffect(() => {
    if (showModal) {
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    }
  }, [showModal]);

  useEffect(() => {
    if (!formCategory.trim()) { setCatSuggs([]); return; }
    const q = formCategory.toLowerCase();
    setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowCatSugg(true);
  }, [formCategory, approvedCats]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labels'],
    queryFn: labelsApi.getAll,
    enabled: viewMode === 'catalog',
  });
  const labels: Label[] = data?.data?.data || [];

  const filteredLabels = labels.filter(l => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      const matchesName = l.productName.toLowerCase().includes(q);
      const matchesBarcode = !!l.barcode && l.barcode.toLowerCase().includes(q);
      if (!matchesName && !matchesBarcode) return false;
    }
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter && l.category !== categoryFilter) {
      return false;
    }
    return true;
  });

  const availableCategories = Array.from(
    new Set(labels.map(l => l.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = labels.some(l => !l.category);

  const allFilteredSelected = filteredLabels.length > 0 && filteredLabels.every(l => selectedIds.has(l.id));

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setQuantities(prev => {
      if (prev[id] !== undefined) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: 1 };
    });
    setPriceOverrides(prev => {
      if (prev[id] === undefined) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function setPrintPrice(id: string, price: string) {
    setPriceOverrides(prev => ({ ...prev, [id]: price }));
  }

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allFilteredSelected) filteredLabels.forEach(l => next.delete(l.id));
      else filteredLabels.forEach(l => next.add(l.id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      if (allFilteredSelected) filteredLabels.forEach(l => { delete next[l.id]; });
      else filteredLabels.forEach(l => { if (!(l.id in next)) next[l.id] = 1; });
      return next;
    });
  }

  function setQuantity(id: string, qty: number) {
    setQuantities(prev => ({ ...prev, [id]: Math.max(1, Math.min(999, qty || 1)) }));
  }

  // Catalog printing is a plain reference print at the base/chain-wide
  // price — it never touches any store's StoreLabel or printedAt, matching
  // how admin-web printing always worked before per-store pricing existed
  // (admin-created/printed labels were never tied to a specific store's
  // queue). Store-scoped, tracked printing lives on the "By Store" tab.
  function runCatalogPrint(entries: PrintableLabelEntry[]) {
    const opened = printLabels(entries);
    if (opened) {
      setSelectedIds(new Set());
      setQuantities({});
      setPriceOverrides({});
    } else {
      toast.error('Print window was blocked — allow pop-ups and try again');
    }
  }

  function buildCatalogPrintEntries(): PrintableLabelEntry[] {
    return labels
      .filter(l => selectedIds.has(l.id))
      .map(l => ({
        label: { ...l, priceText: priceOverrides[l.id] ?? l.priceText },
        quantity: quantities[l.id] ?? 1,
      }));
  }

  function handlePrintSelected() {
    const entries = buildCatalogPrintEntries();
    if (entries.length === 0) return;
    if (entries.length > 5) {
      setPendingBulkPrint(entries);
      return;
    }
    runCatalogPrint(entries);
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const category = formCategory.trim() || null;
      const barcode = formBarcode.trim() || null;
      if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
        orderCategoriesApi.submitNew(category).catch(() => {});
      }
      if (barcode) {
        scannedProductApi.save({ barcode, name: formProductName.trim(), category: category || undefined }).catch(() => {});
      }
      return editingLabel
        ? labelsApi.update(editingLabel.id, { productName: formProductName.trim(), priceText: formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate })
        : labelsApi.create({ productName: formProductName.trim(), priceText: formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      qc.invalidateQueries({ queryKey: ['store-labels'] });
      toast.success(editingLabel ? 'Label updated' : 'Label added');
      if (editingLabel) toast('Affected stores were flagged to reprint', { icon: '🔄' });
      closeModal();
    },
    onError: (e: any) => {
      const err = e.response?.data?.error;
      toast.error(typeof err === 'string' ? err : 'Failed to save label');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.delete(labelId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toast.success('Label removed');
      setConfirmDelete(null);
    },
    onError: (e: any) => {
      const err = e.response?.data?.error;
      toast.error(typeof err === 'string' ? err : 'Failed to remove label');
    },
  });

  function openAddModal() {
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode('');
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowModal(true);
  }

  function openEditModal(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setFormBarcode(label.barcode || '');
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setShowModal(true);
  }

  function duplicateLabel(label: Label) {
    setEditingLabel(null);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setFormBarcode(label.barcode || '');
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode('');
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
  }

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmDelete}
        title="Remove Label"
        message={`Remove the label for "${confirmDelete?.productName}"? It will no longer appear in any store's catalog.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id); }}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        open={!!pendingBulkPrint}
        title="Print This Many Labels?"
        message={pendingBulkPrint ? `You're about to print ${pendingBulkPrint.length} labels (${pendingBulkPrint.reduce((sum, e) => sum + e.quantity, 0)} total copies) at their base/chain-wide price. Continue?` : ''}
        confirmLabel="Print"
        onConfirm={() => { if (pendingBulkPrint) runCatalogPrint(pendingBulkPrint); setPendingBulkPrint(null); }}
        onCancel={() => setPendingBulkPrint(null)}
      />

      {showModal && (
        <div style={m.overlay} onClick={closeModal}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <div style={m.header}>
              <h2 style={m.title}>{editingLabel ? 'Edit Label' : 'Add Label'}</h2>
              <button style={m.closeBtn} onClick={closeModal}>✕</button>
            </div>
            <div style={m.form}>
              <div style={m.label}>Product Name *</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={formProductName}
                  onChange={e => { setFormProductName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. Monster Energy 16oz"
                  maxLength={40}
                  autoComplete="off"
                  autoFocus
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={m.sugg}>
                    {suggestions.map(p => (
                      <div key={p.name} style={m.suggRow} onMouseDown={() => applyPreset(p)}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span style={m.suggPrice}>{p.priceText}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={m.label}>Base Price *</div>
              <div style={m.priceInputWrap}>
                <span style={m.priceInputDollar}>$</span>
                <input
                  style={{ ...m.input, ...m.priceInput }}
                  value={formPriceText}
                  onChange={e => setFormPriceText(e.target.value.replace(/[^0-9.]/g, ''))}
                  placeholder="3.99"
                  inputMode="decimal"
                  maxLength={7}
                />
              </div>
              {editingLabel && (
                <div style={m.hint}>Editing this flags every store still using the base price to reprint. A store with its own price override is unaffected.</div>
              )}
              <div style={m.label}>Deal (optional, chain-wide)</div>
              <input
                style={m.input}
                value={formDealText}
                onChange={e => setFormDealText(e.target.value)}
                placeholder='e.g. "2 for $5" or "BOGO" - shown alongside the price above'
                maxLength={20}
              />
              <div style={m.label}>Barcode (optional)</div>
              <input
                style={m.input}
                value={formBarcode}
                onChange={e => setFormBarcode(e.target.value)}
                placeholder="Scan or type the product's UPC/EAN - for order lookups, not tied to the price/deal above"
                maxLength={40}
              />
              <div style={m.label}>Category (optional)</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={formCategory}
                  onChange={e => { setFormCategory(e.target.value); setShowCatSugg(true); }}
                  onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowCatSugg(false), 150)}
                  placeholder="e.g. Groceries, Frozen Foods…"
                  maxLength={100}
                  autoComplete="off"
                />
                {showCatSugg && catSuggs.length > 0 && (
                  <div style={m.sugg}>
                    {catSuggs.map(c => (
                      <div key={c} style={m.suggRow} onMouseDown={() => { setFormCategory(c); setShowCatSugg(false); }}>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={m.label}>Template</div>
              <div style={m.templateRow}>
                {TEMPLATE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    style={{ ...m.templateChip, ...(formTemplate === t.value ? m.templateChipActive : {}) }}
                    onClick={() => setFormTemplate(t.value)}
                  >
                    <span style={{ ...m.templateSwatch, background: t.accent }} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={m.actions}>
                <button style={m.cancelBtn} onClick={closeModal}>Cancel</button>
                <button
                  style={{ ...m.saveBtn, ...(!formProductName.trim() || !formPriceText.trim() || saveMutation.isPending ? m.saveBtnDim : {}) }}
                  onClick={() => saveMutation.mutate()}
                  disabled={!formProductName.trim() || !formPriceText.trim() || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Label'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.inner}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>🏷️ Labels</h1>
            <p style={s.pageSub}>
              {viewMode === 'catalog'
                ? 'Chain-wide catalog and base prices.'
                : viewMode === 'store'
                ? 'Per-store pricing, overrides, and printing.'
                : 'Which stores have each item — and which are missing it.'}
            </p>
          </div>
          {viewMode === 'catalog' && (
            <div style={{ display: 'flex', gap: 10 }}>
              <button style={s.addBtn} onClick={openAddModal}>+ Add Label</button>
            </div>
          )}
        </div>

        <div style={s.viewToggleRow}>
          <button
            type="button"
            style={{ ...s.viewToggleChip, ...(viewMode === 'catalog' ? s.viewToggleChipActive : {}) }}
            onClick={() => setViewMode('catalog')}
          >
            Catalog
          </button>
          <button
            type="button"
            style={{ ...s.viewToggleChip, ...(viewMode === 'store' ? s.viewToggleChipActive : {}) }}
            onClick={() => setViewMode('store')}
          >
            By Store
          </button>
          <button
            type="button"
            style={{ ...s.viewToggleChip, ...(viewMode === 'coverage' ? s.viewToggleChipActive : {}) }}
            onClick={() => setViewMode('coverage')}
          >
            Coverage
          </button>
        </div>

        {viewMode === 'store' ? (
          <StoreLabelsPanel />
        ) : viewMode === 'coverage' ? (
          <CoverageView />
        ) : (
          <div style={s.catalogLayout}>
          <div style={s.catalogMain}>
            {!isError && !isLoading && labels.length > 0 && (
              <div style={s.filterRow}>
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
              </div>
            )}

            {isError ? (
              <ErrorState message="Failed to load labels." onRetry={refetch} />
            ) : isLoading ? (
              <TableSkeleton columns={7} />
            ) : labels.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>🏷️</div>
                <div style={s.emptyTitle}>No labels yet</div>
                <div style={s.emptySub}>Add a label to start building the catalog</div>
              </div>
            ) : filteredLabels.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}>🔍</div>
                <div style={s.emptyTitle}>No labels match your filters</div>
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
                      {['Product', 'Category', 'Base Price / Deal', 'Template', 'Updated', 'Actions'].map(h => (
                        <TableHead key={h} style={s.th}>{h}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLabels.map((label, i) => {
                      const checked = selectedIds.has(label.id);
                      return (
                        <TableRow key={label.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                          <TableCell style={s.td}>
                            <input type="checkbox" checked={checked} onChange={() => toggleSelected(label.id)} />
                          </TableCell>
                          <TableCell style={s.td}>
                            <span style={s.itemName}>{label.productName}</span>
                            {label.barcode && <span style={s.barcodeBadge} title={`Barcode: ${label.barcode}`}>|||| {label.barcode}</span>}
                          </TableCell>
                          <TableCell style={s.td}>
                            {label.category ? label.category : <span style={{ color: TEXT_MUTED }}> - </span>}
                          </TableCell>
                          <TableCell style={s.td}>
                            ${label.priceText}
                            {label.dealText && <span style={s.dealBadge}>{label.dealText}</span>}
                          </TableCell>
                          <TableCell style={s.td}>{TEMPLATE_LABELS[label.template] || label.template}</TableCell>
                          <TableCell style={s.td}>{new Date(label.updatedAt).toLocaleDateString()}</TableCell>
                          <TableCell style={s.td}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button style={s.editBtn} onClick={() => openEditModal(label)}>Edit</button>
                              <button style={s.duplicateBtn} onClick={() => duplicateLabel(label)}>Duplicate</button>
                              <button style={s.deleteBtn} onClick={() => setConfirmDelete(label)}>Delete</button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <PrintTray
              items={labels
                .filter(l => selectedIds.has(l.id))
                .map(l => ({
                  id: l.id,
                  productName: l.productName,
                  priceText: priceOverrides[l.id] ?? l.priceText,
                  dealText: l.dealText,
                  quantity: quantities[l.id] ?? 1,
                }))}
              editablePrice
              onQuantityChange={setQuantity}
              onPriceChange={setPrintPrice}
              onRemove={toggleSelected}
              onPrint={handlePrintSelected}
              onClear={() => { setSelectedIds(new Set()); setQuantities({}); setPriceOverrides({}); }}
              printLabelText="Print"
            />
          )}
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6fb', padding: '32px 0' },
  inner: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  pageTitle: { fontSize: 26, fontWeight: 900, color: '#1D3557', margin: 0 },
  pageSub: { color: TEXT_MUTED, marginTop: 4, fontSize: 14 },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#1D3557', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  catalogLayout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  catalogMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

  viewToggleRow: { display: 'flex', gap: 8 },
  viewToggleChip: {
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd', borderRadius: 20, padding: '8px 16px',
    fontSize: 13, fontWeight: 700, color: '#444', background: '#fff', cursor: 'pointer',
  },
  viewToggleChipActive: { borderColor: '#1D3557', background: '#eff6ff', color: '#1D3557' },

  filterRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  searchInput: {
    flex: '1 1 240px', minWidth: 200, border: '1.5px solid #ddd', borderRadius: 10,
    padding: '9px 14px', fontSize: 14, outline: 'none',
  },
  filterSelect: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 12px',
    fontSize: 14, background: '#fff', color: '#333', cursor: 'pointer',
  },

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
  barcodeBadge: { display: 'block', fontSize: 11, color: TEXT_MUTED, fontFamily: 'monospace', marginTop: 2 },
  dealBadge: { display: 'block', fontSize: 12, fontWeight: 600, color: '#b7791f', marginTop: 2 },
  editBtn: {
    background: '#eff6ff', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  duplicateBtn: {
    background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  deleteBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
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
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
    maxHeight: '90vh', overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #eee',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#1D3557' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#333', marginTop: 6 },
  hint: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  templateRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  templateChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1.5px solid #ddd', borderRadius: 20,
    padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#444',
    background: '#fff', cursor: 'pointer',
  },
  templateChipActive: { borderColor: '#1D3557', background: '#eff6ff', color: '#1D3557' },
  templateSwatch: { width: 10, height: 10, borderRadius: 5, display: 'inline-block' },
  priceInputWrap: { position: 'relative' as const },
  priceInputDollar: {
    position: 'absolute' as const, left: 14, top: '50%', transform: 'translateY(-50%)',
    fontSize: 15, fontWeight: 700, color: '#667', pointerEvents: 'none' as const,
  },
  priceInput: { paddingLeft: 26 },
  sugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
    border: '1.5px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
  },
  suggRow: {
    padding: '10px 14px', cursor: 'pointer', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', fontSize: 14,
    borderBottom: '1px solid #f8fafc', transition: 'background 0.1s',
  },
  suggPrice: { fontSize: 13, color: TEXT_MUTED, marginLeft: 8, whiteSpace: 'nowrap' as const },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 },
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
