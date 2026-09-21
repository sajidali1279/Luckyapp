import { useState, useEffect, CSSProperties } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi, orderCategoriesApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { LABEL_PRESETS } from '../data/labelPresets';
import StoreLabelsPanel from '../components/StoreLabelsPanel';
import CoverageView from '../components/CoverageView';
import HealthView from '../components/HealthView';
import PrintTray from '../components/PrintTray';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import DataTablePagination from '../components/DataTablePagination';
import Modal from '../components/Modal';
import { failureMessage } from '../lib/apiError';
import { useSingleFlight } from '../hooks/useSingleFlight';
import { canonicalPrice, priceProblem, priceChangePercent, BIG_PRICE_CHANGE_PERCENT } from '../lib/labelPrice';

const CATALOG_PAGE_SIZE = 50;

interface Label {
  id: string;
  productName: string;
  priceText: string | null;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
}

interface LabelImpact { storeCopies: number; inheritingBase: number; ownPrice: number; salePrice: number; printed: number }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
  const [searchParams] = useSearchParams();
  type ViewMode = 'catalog' | 'store' | 'coverage' | 'health';
  const validTabs: ViewMode[] = ['catalog', 'store', 'coverage', 'health'];
  const initialTab = searchParams.get('tab') as ViewMode | null;
  const [viewMode, setViewMode] = useState<ViewMode>(initialTab && validTabs.includes(initialTab) ? initialTab : 'catalog');

  // useState's initializer only runs on first mount — a same-route
  // navigation (e.g. clicking "Review at this store" from the Health tab)
  // changes searchParams without remounting this component, so the tab
  // needs to react to that change explicitly, not just read it once.
  useEffect(() => {
    const tab = searchParams.get('tab') as ViewMode | null;
    if (tab && validTabs.includes(tab)) setViewMode(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
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
  const [catalogPage, setCatalogPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [priceOverrides, setPriceOverrides] = useState<Record<string, string>>({});
  const [pendingBulkPrint, setPendingBulkPrint] = useState<PrintableLabelEntry[] | null>(null);
  const [confirmSave, setConfirmSave] = useState(false);
  const [formError, setFormError] = useState('');
  const [dupHint, setDupHint] = useState(false);

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

  const catalogTotalPages = Math.max(1, Math.ceil(filteredLabels.length / CATALOG_PAGE_SIZE));
  const pagedLabels = filteredLabels.slice((catalogPage - 1) * CATALOG_PAGE_SIZE, catalogPage * CATALOG_PAGE_SIZE);

  useEffect(() => {
    setCatalogPage(1);
  }, [search, categoryFilter]);

  const selectableFilteredLabels = filteredLabels.filter(l => l.priceText != null);
  const allFilteredSelected = selectableFilteredLabels.length > 0 && selectableFilteredLabels.every(l => selectedIds.has(l.id));

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
      if (allFilteredSelected) selectableFilteredLabels.forEach(l => next.delete(l.id));
      else selectableFilteredLabels.forEach(l => next.add(l.id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      if (allFilteredSelected) selectableFilteredLabels.forEach(l => { delete next[l.id]; });
      else selectableFilteredLabels.forEach(l => { if (!(l.id in next)) next[l.id] = 1; });
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
      .filter((l): l is Label & { priceText: string } => selectedIds.has(l.id) && l.priceText != null)
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

  // What a price change or a delete would touch, asked before the box that confirms it is shown
  const impactId = confirmSave ? editingLabel?.id : confirmDelete?.id;
  const impactQuery = useQuery({
    queryKey: ['label-impact', impactId],
    queryFn: () => labelsApi.impact(impactId!),
    enabled: !!impactId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const impact = impactQuery.data?.data?.data as LabelImpact | undefined;

  function refreshLabels() {
    ['labels', 'store-labels', 'labels-coverage', 'labels-health-summary'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  // What the edit box would change, field by field, against the item as it is now
  const priceOk = canonicalPrice(formPriceText) !== null;
  const priceIssue = priceProblem(formPriceText);
  const barcodeClash = formBarcode.trim() ? labels.find(l => l.barcode === formBarcode.trim() && l.id !== editingLabel?.id) : undefined;
  const formChanges: { field: string; from: string; to: string }[] = [];
  if (editingLabel) {
    const newPrice = canonicalPrice(formPriceText);
    if (formProductName.trim() !== editingLabel.productName) formChanges.push({ field: 'Name', from: editingLabel.productName, to: formProductName.trim() });
    if (newPrice !== null && newPrice !== canonicalPrice(editingLabel.priceText)) formChanges.push({ field: 'Price', from: editingLabel.priceText ? `$${editingLabel.priceText}` : 'none', to: `$${newPrice}` });
    if ((formDealText.trim() || null) !== (editingLabel.dealText || null)) formChanges.push({ field: 'Deal', from: editingLabel.dealText || 'none', to: formDealText.trim() || 'none' });
    if ((formBarcode.trim() || null) !== (editingLabel.barcode || null)) formChanges.push({ field: 'Barcode', from: editingLabel.barcode || 'none', to: formBarcode.trim() || 'none' });
    if ((formCategory.trim() || null) !== (editingLabel.category || null)) formChanges.push({ field: 'Category', from: editingLabel.category || 'none', to: formCategory.trim() || 'none' });
    if (formTemplate !== editingLabel.template) formChanges.push({ field: 'Design', from: TEMPLATE_LABELS[editingLabel.template] || editingLabel.template, to: TEMPLATE_LABELS[formTemplate] || formTemplate });
  }
  const pricePct = editingLabel ? priceChangePercent(editingLabel.priceText, formPriceText) : null;
  const bigChange = pricePct !== null && Math.abs(pricePct) > BIG_PRICE_CHANGE_PERCENT;
  const priceOnly = formChanges.length > 0 && formChanges.every(c => c.field === 'Price');

  const saveMutation = useMutation({
    mutationFn: () => {
      const category = formCategory.trim() || null;
      const barcode = formBarcode.trim() || null;
      if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
        orderCategoriesApi.submitNew(category).catch(() => {});
      }
      const body = { productName: formProductName.trim(), priceText: canonicalPrice(formPriceText) ?? formPriceText.trim(), dealText: formDealText.trim() || null, barcode, category, template: formTemplate };
      return editingLabel ? labelsApi.update(editingLabel.id, body) : labelsApi.create(body);
    },
    onSuccess: (res) => {
      refreshLabels();
      if (editingLabel) {
        const d = res.data;
        if (d?.changed === false) toast('Nothing was changed.');
        else toast.success(`Saved. ${plural(d?.reprint?.stores ?? 0, 'store is', 'stores are')} told to reprint${d?.reprint?.keptOwnPrice ? `; ${plural(d.reprint.keptOwnPrice, 'store keeps', 'stores keep')} its own price` : ''}.`, { duration: 6000 });
      } else {
        toast.success('Label added');
      }
      setConfirmSave(false);
      closeModal();
    },
    onError: (e: any) => {
      setConfirmSave(false);
      setFormError(failureMessage(e, 'Could not save the label. Nothing was changed.'));
    },
  });
  const runSave = useSingleFlight(saveMutation);

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.delete(labelId),
    onSuccess: () => {
      refreshLabels();
      toast.success(`"${confirmDelete?.productName}" was removed from every store.`);
      setConfirmDelete(null);
    },
    onError: (e: any) => {
      if (e?.response?.status === 404) refreshLabels();
      toast.error(failureMessage(e, 'Could not remove the item. Nothing was changed.'));
      setConfirmDelete(null);
    },
  });
  const runDelete = useSingleFlight(deleteMutation);

  function resetForm() {
    setFormProductName('');
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode('');
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
    setFormError('');
    setDupHint(false);
  }

  function openAddModal() {
    setEditingLabel(null);
    resetForm();
    setShowModal(true);
  }

  function openEditModal(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText || '');
    setFormDealText(label.dealText || '');
    setFormBarcode(label.barcode || '');
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setFormError('');
    setDupHint(false);
    setShowModal(true);
  }

  // A copy starts without the barcode: one barcode belongs to one item, and the server refuses a second item with the same one
  function duplicateLabel(label: Label) {
    setEditingLabel(null);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText || '');
    setFormDealText(label.dealText || '');
    setFormBarcode('');
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setFormError('');
    setDupHint(!!label.barcode);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingLabel(null);
    resetForm();
  }

  function handleSaveClick() {
    if (!formProductName.trim() || !priceOk || barcodeClash || saveMutation.isPending) return;
    setFormError('');
    if (!editingLabel) { runSave(); return; }
    if (formChanges.length === 0) { toast('Nothing was changed.'); closeModal(); return; }
    setConfirmSave(true);
  }

  const editMessage = (
    <div style={{ textAlign: 'left' }}>
      <ul style={m.changeList}>
        {formChanges.map(c => (
          <li key={c.field}><strong>{c.field}:</strong> {c.from} → {c.to}{c.field === 'Price' && pricePct !== null ? ` (${pricePct > 0 ? '+' : ''}${pricePct}%)` : ''}</li>
        ))}
      </ul>
      {bigChange && <p style={m.warn}>That is a change of more than {BIG_PRICE_CHANGE_PERCENT}%. Check that the new price is right.</p>}
      {impactQuery.isError ? (
        <p style={m.warn}>Could not check which stores this affects. You can still save. <button type="button" style={m.linkBtn} onClick={() => impactQuery.refetch()}>Try again</button></p>
      ) : !impact ? (
        <p style={m.note}>Checking which stores this affects…</p>
      ) : priceOnly ? (
        <p style={m.note}>
          {plural(impact.inheritingBase, 'store uses', 'stores use')} this price and will be told to reprint
          {impact.ownPrice > 0 ? `; ${plural(impact.ownPrice, 'store keeps', 'stores keep')} its own price` : ''}.
        </p>
      ) : (
        <p style={m.note}>All {plural(impact.storeCopies, 'store', 'stores')} will be told to reprint this label.</p>
      )}
    </div>
  );

  const deleteMessage = confirmDelete ? (
    impactQuery.isError ? (
      <>Could not check what removing this would do, so nothing was changed. <button type="button" style={m.linkBtn} onClick={() => impactQuery.refetch()}>Try again</button></>
    ) : !impact ? (
      'Checking what this removes…'
    ) : (
      <>
        <strong>{confirmDelete.productName}</strong>{confirmDelete.priceText ? ` ($${confirmDelete.priceText})` : ''} is in {plural(impact.storeCopies, 'store', 'stores')}. Removing it erases{' '}
        {plural(impact.printed, 'print record', 'print records')}, {plural(impact.ownPrice, 'store price', 'store prices')} and {plural(impact.salePrice, 'sale price', 'sale prices')} with it.
        This cannot be undone.
      </>
    )
  ) : '';

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmDelete}
        title="Remove this item from every store?"
        message={deleteMessage}
        confirmLabel="Remove"
        danger
        busy={deleteMutation.isPending}
        confirmDisabled={!impact}
        onConfirm={() => { if (confirmDelete) runDelete(confirmDelete.id); }}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        open={confirmSave}
        title={`Save changes to ${editingLabel?.productName ?? 'this item'}?`}
        message={editMessage}
        confirmLabel={priceOnly ? 'Change price' : 'Save changes'}
        danger={bigChange}
        busy={saveMutation.isPending}
        onConfirm={() => runSave()}
        onCancel={() => setConfirmSave(false)}
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
        <Modal title={editingLabel ? 'Edit Label' : 'Add Label'} onClose={closeModal} busy={saveMutation.isPending} maxWidth={480}>
          <form style={m.form} onSubmit={e => { e.preventDefault(); handleSaveClick(); }} noValidate>
            <label style={m.label} htmlFor="lbl-name">Product Name *</label>
            <div style={{ position: 'relative' as const }}>
              <input
                id="lbl-name"
                style={m.input}
                value={formProductName}
                onChange={e => { setFormProductName(e.target.value); setShowSuggestions(true); setFormError(''); }}
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
            <label style={m.label} htmlFor="lbl-price">Base Price *</label>
            <div style={m.priceInputWrap}>
              <span style={m.priceInputDollar} aria-hidden="true">$</span>
              <input
                id="lbl-price"
                style={{ ...m.input, ...m.priceInput }}
                value={formPriceText}
                onChange={e => { setFormPriceText(e.target.value.replace(/[^0-9.]/g, '')); setFormError(''); }}
                placeholder="3.99"
                inputMode="decimal"
                maxLength={6}
                aria-invalid={!!priceIssue}
                aria-describedby={priceIssue ? 'lbl-price-err' : undefined}
              />
            </div>
            {priceIssue && <div id="lbl-price-err" role="alert" style={m.err}>{priceIssue}</div>}
            {editingLabel && (
              <div style={m.hint}>Changing the price flags every store still using the base price to reprint. A store with its own price is unaffected. You will see what it does before it is saved.</div>
            )}
            <label style={m.label} htmlFor="lbl-deal">Deal (optional, chain-wide)</label>
            <input
              id="lbl-deal"
              style={m.input}
              value={formDealText}
              onChange={e => { setFormDealText(e.target.value); setFormError(''); }}
              placeholder='e.g. "2 for $5" or "BOGO" - shown alongside the price above'
              maxLength={20}
            />
            <label style={m.label} htmlFor="lbl-barcode">Barcode (optional)</label>
            <input
              id="lbl-barcode"
              style={m.input}
              value={formBarcode}
              onChange={e => { setFormBarcode(e.target.value); setFormError(''); }}
              placeholder="Scan or type the product's UPC/EAN - for order lookups, not tied to the price/deal above"
              maxLength={40}
              aria-invalid={!!barcodeClash}
            />
            {dupHint && !formBarcode.trim() && <div style={m.hint}>The barcode was left empty: one barcode belongs to one item. Scan or type this copy's own.</div>}
            {barcodeClash && <div role="alert" style={m.err}>The barcode {formBarcode.trim()} already belongs to "{barcodeClash.productName}". Use that item, or change the barcode.</div>}
            <label style={m.label} htmlFor="lbl-category">Category (optional)</label>
            <div style={{ position: 'relative' as const }}>
              <input
                id="lbl-category"
                style={m.input}
                value={formCategory}
                onChange={e => { setFormCategory(e.target.value); setShowCatSugg(true); setFormError(''); }}
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
            <div style={m.label} id="lbl-template-label">Template</div>
            <div style={m.templateRow} role="group" aria-labelledby="lbl-template-label">
              {TEMPLATE_OPTIONS.map(t => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={formTemplate === t.value}
                  style={{ ...m.templateChip, ...(formTemplate === t.value ? m.templateChipActive : {}) }}
                  onClick={() => setFormTemplate(t.value)}
                >
                  <span style={{ ...m.templateSwatch, background: t.accent }} aria-hidden="true" />
                  {t.label}
                </button>
              ))}
            </div>
            {formError && <div role="alert" style={m.err}>{formError}</div>}
            <div style={m.actions}>
              <button type="button" style={m.cancelBtn} onClick={closeModal} disabled={saveMutation.isPending}>Cancel</button>
              <button
                type="submit"
                style={{ ...m.saveBtn, ...(!formProductName.trim() || !priceOk || !!barcodeClash || saveMutation.isPending ? m.saveBtnDim : {}) }}
                disabled={!formProductName.trim() || !priceOk || !!barcodeClash || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Label'}
              </button>
            </div>
          </form>
        </Modal>
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
                : viewMode === 'coverage'
                ? 'Which stores have each item — and which are missing it.'
                : 'How many labels need printing right now, by store.'}
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
          <button
            type="button"
            style={{ ...s.viewToggleChip, ...(viewMode === 'health' ? s.viewToggleChipActive : {}) }}
            onClick={() => setViewMode('health')}
          >
            Health
          </button>
        </div>

        {viewMode === 'store' ? (
          <StoreLabelsPanel />
        ) : viewMode === 'coverage' ? (
          <CoverageView />
        ) : viewMode === 'health' ? (
          <HealthView />
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
                    {pagedLabels.map((label, i) => {
                      const checked = selectedIds.has(label.id);
                      return (
                        <TableRow key={label.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                          <TableCell style={s.td}>
                            {label.priceText != null ? (
                              <input type="checkbox" checked={checked} onChange={() => toggleSelected(label.id)} />
                            ) : (
                              <span title="Set a price before this can be printed" style={{ color: TEXT_MUTED, fontSize: 16 }}>-</span>
                            )}
                          </TableCell>
                          <TableCell style={s.td}>
                            <span style={s.itemName}>{label.productName}</span>
                            {label.barcode && <span style={s.barcodeBadge} title={`Barcode: ${label.barcode}`}>|||| {label.barcode}</span>}
                          </TableCell>
                          <TableCell style={s.td}>
                            {label.category ? label.category : <span style={{ color: TEXT_MUTED }}> - </span>}
                          </TableCell>
                          <TableCell style={s.td}>
                            {label.priceText != null ? (
                              <>
                                ${label.priceText}
                                {label.dealText && <span style={s.dealBadge}>{label.dealText}</span>}
                              </>
                            ) : (
                              <span style={s.noPriceBadge} title="No price set yet. A manager can add one when labeling.">No price set</span>
                            )}
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
                <DataTablePagination
                  page={catalogPage}
                  totalPages={catalogTotalPages}
                  onPrevious={() => setCatalogPage(p => Math.max(1, p - 1))}
                  onNext={() => setCatalogPage(p => Math.min(catalogTotalPages, p + 1))}
                  extraInfo={`(${filteredLabels.length} labels)`}
                />
              </div>
            )}
          </div>

          {selectedIds.size > 0 && (
            <PrintTray
              items={labels
                .filter((l): l is Label & { priceText: string } => selectedIds.has(l.id) && l.priceText != null)
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
  pageTitle: { fontSize: 26, fontWeight: 900, color: PRIMARY, margin: 0 },
  pageSub: { color: TEXT_MUTED, marginTop: 4, fontSize: 14 },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: PRIMARY, border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  catalogLayout: { display: 'flex', gap: 20, alignItems: 'flex-start' },
  catalogMain: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

  viewToggleRow: { display: 'flex', gap: 8 },
  viewToggleChip: {
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#ddd', borderRadius: 20, padding: '8px 16px',
    fontSize: 13, fontWeight: 700, color: '#444', background: '#fff', cursor: 'pointer',
  },
  viewToggleChipActive: { borderColor: PRIMARY, background: '#eff6ff', color: PRIMARY },

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
    color: TEXT_MUTED, background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle', fontSize: 14 },
  itemName: { fontWeight: 700, fontSize: 14, color: PRIMARY },
  barcodeBadge: { display: 'block', fontSize: 11, color: TEXT_MUTED, fontFamily: 'monospace', marginTop: 2 },
  dealBadge: { display: 'block', fontSize: 12, fontWeight: 600, color: '#b7791f', marginTop: 2 },
  noPriceBadge: {
    fontSize: 12.5, fontWeight: 700, color: '#b7791f',
    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '2px 8px',
  },
  editBtn: {
    background: '#eff6ff', color: PRIMARY, border: 'none',
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
  emptyTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  err: { fontSize: 13, color: '#b91c1c', lineHeight: 1.4 },
  warn: { fontSize: 14, color: '#b91c1c', fontWeight: 700, margin: '8px 0 0', lineHeight: 1.5 },
  note: { fontSize: 14, color: '#374151', margin: '8px 0 0', lineHeight: 1.5 },
  changeList: { margin: '0 0 4px', paddingLeft: 18, fontSize: 15, color: '#111827', lineHeight: 1.6 },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 14 },
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
  templateChipActive: { borderColor: PRIMARY, background: '#eff6ff', color: PRIMARY },
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
    background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};
