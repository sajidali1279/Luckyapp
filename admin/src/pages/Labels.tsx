import { useState, useEffect, useRef, CSSProperties } from 'react';
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
import { Copy, Trash2 } from 'lucide-react';

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
  // Only items that still need a price, for typing prices down the list
  const [onlyNoPrice, setOnlyNoPrice] = useState(false);
  const quickPriceRefs = useRef<Map<string, HTMLInputElement>>(new Map());
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
    if (showModal || viewMode === 'catalog') {
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    }
  }, [showModal, viewMode]);

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
    if (onlyNoPrice && l.priceText != null) return false;
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
  const noPriceCount = labels.filter(l => l.priceText == null).length;

  const catalogTotalPages = Math.max(1, Math.ceil(filteredLabels.length / CATALOG_PAGE_SIZE));
  const pagedLabels = filteredLabels.slice((catalogPage - 1) * CATALOG_PAGE_SIZE, catalogPage * CATALOG_PAGE_SIZE);

  useEffect(() => {
    setCatalogPage(1);
  }, [search, categoryFilter, onlyNoPrice]);

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

  // A price typed straight into the row (no Edit box): the row shows it at once, and the cursor moves to the next item on this page
  // that still has no price, so a list can be priced by typing a price and pressing Enter each time.
  function onQuickPriceSaved(labelId: string, price: string) {
    const unpriced = pagedLabels.filter(l => l.priceText == null).map(l => l.id);
    const nextId = unpriced[unpriced.indexOf(labelId) + 1];
    qc.setQueryData(['labels'], (old: any) => old?.data?.data
      ? { ...old, data: { ...old.data, data: old.data.data.map((l: Label) => (l.id === labelId ? { ...l, priceText: price } : l)) } }
      : old);
    refreshLabels();
    if (nextId) setTimeout(() => quickPriceRefs.current.get(nextId)?.focus(), 0);
  }

  // ── Editing straight in the table ─────────────────────────────────────────────
  // Each cell saves on its own (Enter, or leaving the box). A change that makes stores reprint, or a big price change, asks first with
  // the same store count the Edit box showed; anything else (a label no store has yet, a category) saves at once.
  const [inlineConfirm, setInlineConfirm] = useState<null | {
    label: Label; field: InlineField; next: string | null; impact: LabelImpact | null; checkFailed: boolean; resolve: (ok: boolean) => void;
  }>(null);
  const [inlineSaving, setInlineSaving] = useState(false);

  async function saveInline(label: Label, field: InlineField, next: string | null): Promise<boolean> {
    try {
      const res = await labelsApi.update(label.id, { [field]: next } as Parameters<typeof labelsApi.update>[1]);
      qc.setQueryData(['labels'], (old: any) => old?.data?.data
        ? { ...old, data: { ...old.data, data: old.data.data.map((l: Label) => (l.id === label.id ? { ...l, [field]: next } : l)) } }
        : old);
      refreshLabels();
      const stores = res.data?.reprint?.stores ?? 0;
      toast.success(`${FIELD_NAMES[field]} saved${stores ? `; ${plural(stores, 'store is', 'stores are')} told to reprint` : ''}.`, { duration: stores ? 5000 : 1800 });
      return true;
    } catch (e: any) {
      toast.error(failureMessage(e, 'Could not save. Nothing was changed.'));
      return false;
    }
  }

  async function requestInlineChange(label: Label, field: InlineField, next: string | null): Promise<boolean> {
    if ((label[field] ?? '') === (next ?? '')) return true;
    if (field === 'barcode' && next) {
      const clash = labels.find(l => l.barcode === next && l.id !== label.id);
      if (clash) { toast.error(`The barcode ${next} already belongs to "${clash.productName}". One barcode belongs to one item.`); return false; }
    }
    if (field === 'category') return saveInline(label, field, next);   // never printed: no store reprints, nothing to confirm
    let impact: LabelImpact | null = null;
    let checkFailed = false;
    try {
      const r = await qc.fetchQuery({ queryKey: ['label-impact', label.id], queryFn: () => labelsApi.impact(label.id), staleTime: 0 });
      impact = (r?.data?.data as LabelImpact) ?? null;
    } catch { checkFailed = true; }
    const pct = field === 'priceText' ? priceChangePercent(label.priceText, next) : null;
    const big = pct !== null && Math.abs(pct) > BIG_PRICE_CHANGE_PERCENT;
    const affected = impact ? (field === 'priceText' ? impact.inheritingBase : impact.storeCopies) : 0;
    if (!checkFailed && !big && affected === 0) return saveInline(label, field, next);
    return new Promise<boolean>(resolve => setInlineConfirm({ label, field, next, impact, checkFailed, resolve }));
  }

  const inlinePct = inlineConfirm?.field === 'priceText' ? priceChangePercent(inlineConfirm.label.priceText, inlineConfirm.next) : null;
  const inlineBig = inlinePct !== null && Math.abs(inlinePct) > BIG_PRICE_CHANGE_PERCENT;
  const showCell = (field: InlineField, v: string | null) => (v == null || v === '' ? 'none' : field === 'priceText' ? `$${v}` : field === 'template' ? (TEMPLATE_LABELS[v] || v) : v);
  const inlineMessage = inlineConfirm ? (
    <div style={{ textAlign: 'left' }}>
      <ul style={m.changeList}>
        <li>
          <strong>{FIELD_NAMES[inlineConfirm.field]}:</strong> {showCell(inlineConfirm.field, inlineConfirm.label[inlineConfirm.field])} → {showCell(inlineConfirm.field, inlineConfirm.next)}
          {inlinePct !== null ? ` (${inlinePct > 0 ? '+' : ''}${inlinePct}%)` : ''}
        </li>
      </ul>
      {inlineBig && <p style={m.warn}>That is a change of more than {BIG_PRICE_CHANGE_PERCENT}%. Check that the new price is right.</p>}
      {inlineConfirm.checkFailed || !inlineConfirm.impact ? (
        <p style={m.warn}>Could not check which stores this affects. You can still save.</p>
      ) : inlineConfirm.field === 'priceText' ? (
        <p style={m.note}>
          {plural(inlineConfirm.impact.inheritingBase, 'store uses', 'stores use')} this price and will be told to reprint
          {inlineConfirm.impact.ownPrice > 0 ? `; ${plural(inlineConfirm.impact.ownPrice, 'store keeps', 'stores keep')} its own price` : ''}.
        </p>
      ) : (
        <p style={m.note}>All {plural(inlineConfirm.impact.storeCopies, 'store', 'stores')} will be told to reprint this label.</p>
      )}
    </div>
  ) : null;

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
        open={!!inlineConfirm}
        title={inlineConfirm ? `Change the ${FIELD_NAMES[inlineConfirm.field].toLowerCase()} of ${inlineConfirm.label.productName}?` : ''}
        message={inlineMessage}
        confirmLabel={inlineConfirm?.field === 'priceText' ? 'Change price' : 'Save change'}
        danger={inlineBig}
        busy={inlineSaving}
        onConfirm={async () => {
          const c = inlineConfirm;
          if (!c) return;
          setInlineSaving(true);
          const ok = await saveInline(c.label, c.field, c.next);
          setInlineSaving(false);
          setInlineConfirm(null);
          c.resolve(ok);
        }}
        onCancel={() => { inlineConfirm?.resolve(false); setInlineConfirm(null); }}
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
                {(noPriceCount > 0 || onlyNoPrice) && (
                  <button
                    type="button"
                    style={{ ...s.noPriceChip, ...(onlyNoPrice ? s.noPriceChipActive : {}) }}
                    onClick={() => setOnlyNoPrice(v => !v)}
                    aria-pressed={onlyNoPrice}
                    title="Show only items that still need a price"
                  >
                    No price ({noPriceCount})
                  </button>
                )}
                {(availableCategories.length > 0 || hasUncategorized) && (
                  <select style={s.filterSelect} aria-label="Filter by category" value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
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
              <TableSkeleton columns={8} />
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
                        <span className="sr-only">Select</span>
                        <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} aria-label={allFilteredSelected ? 'Deselect all labels' : 'Select all labels'} />
                      </TableHead>
                      {['Product', 'Category', 'Base price', 'Deal', 'Design', 'Updated', ''].map(h => (
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
                              <input type="checkbox" checked={checked} onChange={() => toggleSelected(label.id)} aria-label={`Select ${label.productName}`} />
                            ) : (
                              <span title="Set a price before this can be printed" style={{ color: TEXT_MUTED, fontSize: 16 }}>-</span>
                            )}
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 190 }}>
                            <InlineText
                              value={label.productName} bold ariaLabel={`Name of ${label.productName}`} placeholder="Product name" maxLength={40}
                              normalize={v => (v.trim() ? { value: v.trim() } : { error: 'Enter the product name.' })}
                              onCommit={next => requestInlineChange(label, 'productName', next)}
                            />
                            <InlineText
                              value={label.barcode} mono small ariaLabel={`Barcode of ${label.productName}`} placeholder="Add barcode" maxLength={40}
                              normalize={v => ({ value: v.trim() || null })}
                              onCommit={next => requestInlineChange(label, 'barcode', next)}
                            />
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 130 }}>
                            <InlineText
                              value={label.category} ariaLabel={`Category of ${label.productName}`} placeholder="Add category" maxLength={100} list="label-category-options"
                              normalize={v => ({ value: v.trim() || null })}
                              onCommit={next => requestInlineChange(label, 'category', next)}
                            />
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 120 }}>
                            {label.priceText != null ? (
                              <InlineText
                                value={label.priceText} prefix="$" ariaLabel={`Price of ${label.productName}`} placeholder="0.00" maxLength={8} inputMode="decimal"
                                normalize={v => { const c = canonicalPrice(v); return c ? { value: c } : { error: v.trim() ? (priceProblem(v) || 'Enter a price like 2.99') : 'A label needs a price to print.' }; }}
                                onCommit={next => requestInlineChange(label, 'priceText', next)}
                              />
                            ) : (
                              <QuickPrice
                                label={label}
                                onSaved={onQuickPriceSaved}
                                inputRef={(el) => { if (el) quickPriceRefs.current.set(label.id, el); else quickPriceRefs.current.delete(label.id); }}
                              />
                            )}
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 120 }}>
                            <InlineText
                              value={label.dealText} ariaLabel={`Deal for ${label.productName}`} placeholder="Add deal" maxLength={20}
                              normalize={v => ({ value: v.trim() || null })}
                              onCommit={next => requestInlineChange(label, 'dealText', next)}
                            />
                          </TableCell>
                          <TableCell style={s.td}>
                            <select
                              style={s.cellSelect}
                              value={label.template}
                              onChange={e => { requestInlineChange(label, 'template', e.target.value); }}
                              aria-label={`Design for ${label.productName}`}
                            >
                              {TEMPLATE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </TableCell>
                          <TableCell style={{ ...s.td, color: TEXT_MUTED, fontSize: 13, whiteSpace: 'nowrap' }}>{new Date(label.updatedAt).toLocaleDateString()}</TableCell>
                          <TableCell style={s.td}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button type="button" style={s.iconBtn} onClick={() => duplicateLabel(label)} title="Duplicate" aria-label={`Duplicate ${label.productName}`}>
                                <Copy size={16} strokeWidth={2} />
                              </button>
                              <button type="button" style={{ ...s.iconBtn, color: '#dc2626' }} onClick={() => setConfirmDelete(label)} title="Delete" aria-label={`Delete ${label.productName}`}>
                                <Trash2 size={16} strokeWidth={2} />
                              </button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <datalist id="label-category-options">
                  {Array.from(new Set([...approvedCats, ...availableCategories])).sort().map(c => <option key={c} value={c} />)}
                </datalist>
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
  catalogLayout: { display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  catalogMain: { flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

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

  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
  cellInput: {
    width: '100%', boxSizing: 'border-box', border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff',
    padding: '6px 8px', fontSize: 14, color: '#111827', outline: 'none',
  },
  cellInputFocus: { borderColor: PRIMARY, boxShadow: `0 0 0 3px ${PRIMARY}22` },
  cellSelect: {
    border: '1px solid #e5e7eb', borderRadius: 7, background: '#fff', padding: '6px 8px', fontSize: 13, color: '#111827', cursor: 'pointer', maxWidth: 170,
  },
  cellError: { display: 'block', fontSize: 11.5, color: '#b91c1c', fontWeight: 600, marginTop: 3 },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8,
    border: '1px solid #e5e7eb', background: '#fff', color: '#374151', cursor: 'pointer',
  },
  noPriceChip: {
    border: '1.5px solid #fcd34d', background: '#fffbeb', color: '#92400e', borderRadius: 999,
    padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  noPriceChipActive: { background: '#f59e0b', borderColor: '#f59e0b', color: '#fff' },
  quickPriceWrap: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  quickPriceBox: {
    display: 'inline-flex', alignItems: 'center', border: '1.5px solid #fcd34d', background: '#fffbeb', borderRadius: 8, padding: '0 8px',
  },
  quickPriceDollar: { color: '#92400e', fontWeight: 700, fontSize: 14 },
  quickPriceInput: {
    width: 72, border: 'none', outline: 'none', background: 'transparent', padding: '6px 4px', fontSize: 14, fontWeight: 600, color: '#111827',
  },
  quickPriceHint: { fontSize: 11, color: TEXT_MUTED },
  quickPriceError: { fontSize: 12, color: '#b91c1c', fontWeight: 600 },
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

// "No price set" as a box to type into: Enter (or Tab away with a price) saves just the price, Escape clears it. The same price
// rules as the Edit box; only the price is sent, and the server records it in the Activity Log like any other price change.
function QuickPrice({ label, onSaved, inputRef }: {
  label: Label;
  onSaved: (labelId: string, price: string) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);

  async function save() {
    if (busy.current || value.trim() === '') return;
    const price = canonicalPrice(value);
    if (!price) { setError(priceProblem(value) || 'Enter a price like 2.99'); return; }
    busy.current = true;
    setSaving(true);
    setError('');
    try {
      await labelsApi.update(label.id, { priceText: price });
      toast.success(`${label.productName}: $${price}`, { duration: 1500 });
      onSaved(label.id, price);
    } catch (e: any) {
      setError(failureMessage(e, 'Could not save the price. Nothing was changed.'));
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  return (
    <span style={s.quickPriceWrap}>
      <span style={{ ...s.quickPriceBox, ...(error ? { borderColor: '#f87171' } : {}) }}>
        <span style={s.quickPriceDollar} aria-hidden>$</span>
        <input
          ref={inputRef}
          style={s.quickPriceInput}
          value={value}
          onChange={e => { setValue(e.target.value); if (error) setError(''); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); save(); }
            if (e.key === 'Escape') { setValue(''); setError(''); }
          }}
          onBlur={() => { if (value.trim() !== '' && !error) save(); }}
          placeholder="No price"
          inputMode="decimal"
          disabled={saving}
          aria-label={`Price for ${label.productName}`}
          aria-invalid={!!error}
        />
      </span>
      {saving ? <span style={s.quickPriceHint}>Saving…</span> : error ? <span style={s.quickPriceError} role="alert">{error}</span> : null}
    </span>
  );
}

type InlineField = 'productName' | 'priceText' | 'dealText' | 'barcode' | 'category' | 'template';
const FIELD_NAMES: Record<InlineField, string> = {
  productName: 'Name', priceText: 'Price', dealText: 'Deal', barcode: 'Barcode', category: 'Category', template: 'Design',
};

// A table cell you type into. Enter (or leaving the box) saves just this field, Escape puts back what is saved. A bad value says why
// under the box and is not sent; a refused or cancelled save goes back to the saved value.
function InlineText({ value, placeholder, ariaLabel, maxLength, prefix, mono, bold, small, list, inputMode, normalize, onCommit }: {
  value: string | null;
  placeholder: string;
  ariaLabel: string;
  maxLength: number;
  prefix?: string;
  mono?: boolean;
  bold?: boolean;
  small?: boolean;
  list?: string;
  inputMode?: 'decimal' | 'text';
  normalize: (draft: string) => { value: string | null } | { error: string };
  onCommit: (next: string | null) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const skipBlur = useRef(false);

  useEffect(() => { if (!focused && !busy.current) setDraft(value ?? ''); }, [value, focused]);

  async function commit() {
    if (busy.current) return;
    const r = normalize(draft);
    if ('error' in r) { setError(r.error); return; }
    if ((r.value ?? '') === (value ?? '')) { setDraft(value ?? ''); setError(''); return; }
    busy.current = true;
    setSaving(true);
    setError('');
    const ok = await onCommit(r.value);
    busy.current = false;
    setSaving(false);
    if (!ok) setDraft(value ?? '');
  }

  const inputStyle: CSSProperties = {
    ...s.cellInput,
    ...(focused ? s.cellInputFocus : {}),
    ...(error ? { borderColor: '#f87171' } : {}),
    ...(bold ? { fontWeight: 700, color: PRIMARY } : {}),
    ...(mono ? { fontFamily: 'monospace' } : {}),
    ...(small ? { fontSize: 12, padding: '3px 8px', marginTop: 4, color: TEXT_MUTED } : {}),
    ...(prefix ? { paddingLeft: 20 } : {}),
    ...(saving ? { opacity: 0.6 } : {}),
  };
  return (
    <span style={{ display: 'block', position: 'relative' }}>
      {prefix && <span style={{ position: 'absolute', left: 8, top: small ? 8 : 7, fontSize: 14, color: TEXT_MUTED, pointerEvents: 'none' }}>{prefix}</span>}
      <input
        style={inputStyle}
        value={draft}
        placeholder={placeholder}
        maxLength={maxLength}
        list={list}
        inputMode={inputMode}
        disabled={saving}
        aria-label={ariaLabel}
        aria-invalid={!!error}
        onFocus={() => setFocused(true)}
        onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
          if (e.key === 'Escape') { skipBlur.current = true; setDraft(value ?? ''); setError(''); e.currentTarget.blur(); }
        }}
        onBlur={() => {
          setFocused(false);
          if (skipBlur.current) { skipBlur.current = false; return; }
          commit();
        }}
      />
      {error && <span style={s.cellError} role="alert">{error}</span>}
    </span>
  );
}
