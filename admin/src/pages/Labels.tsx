import { useState, useEffect, useRef, useMemo, CSSProperties } from 'react';
import type { AxiosResponse } from 'axios';
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
import SameBarcodePanel from '../components/SameBarcodePanel';
import DealsPanel from '../components/DealsPanel';
import { sameBarcode } from '../lib/barcode';
import { suggestFromBarcode, matchNames, CatalogItem } from '../lib/labelSimilar';
import LabelImportModal from '../components/LabelImportModal';
import CoverageView from '../components/CoverageView';
import HealthView from '../components/HealthView';
import PrintTray from '../components/PrintTray';
import { printLabels, PrintableLabelEntry, labelPreviewHtml } from '../utils/printLabels';
import DataTablePagination from '../components/DataTablePagination';
import Modal from '../components/Modal';
import { failureMessage } from '../lib/apiError';
import { useSingleFlight } from '../hooks/useSingleFlight';
import { canonicalPrice, priceProblem, priceChangePercent, BIG_PRICE_CHANGE_PERCENT } from '../lib/labelPrice';
import { Copy, Trash2, RotateCcw, Download, Upload } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { labelsCsv, downloadCsv, CsvCoverage } from '../utils/labelsCsv';
import { PageHeader, Button, Tabs } from '../components/kit';
import { Plus } from 'lucide-react';
import Glyph from '../components/Glyph';

const CATALOG_PAGE_SIZE = 50;

interface Label {
  id: string;
  productName: string;
  priceText: string | null;
  dealText: string | null;
  barcode: string | null;
  category: string | null;
  brand?: string | null;
  template: string;
  createdByStoreId: string | null;
  updatedAt: string;
}

interface LabelImpact { storeCopies: number; inheritingBase: number; ownPrice: number; salePrice: number; printed: number }
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Sentinel for the "Uncategorized" filter option — distinct from '' (no filter).
const UNCATEGORIZED = '__uncategorized__';

// The swatch is each design's own frame colour on the printed label (utils/printLabels.ts), the same as the app shows
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
  type ViewMode = 'catalog' | 'store' | 'coverage' | 'health' | 'same' | 'deals';
  const validTabs: ViewMode[] = ['catalog', 'store', 'coverage', 'health', 'same', 'deals'];
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
  const [showImport, setShowImport] = useState(false);
  // One barcode, one item: a new item whose barcode is already an item, at another price, asks to change that item's price instead
  const [priceClash, setPriceClash] = useState<{ id: string; name: string; current: string | null; typed: string } | null>(null);
  const [formError, setFormError] = useState('');
  const [dupHint, setDupHint] = useState(false);

  const nameQuery = formProductName.trim().toLowerCase();
  // Name suggestions: the catalog first (every typed word at the start of a word, any order: "gat 28" finds Gatorade ... 28oz), then
  // the starter list (data/labelPresets) for names the catalog does not have yet
  type NameSuggestion = { key: string; name: string; priceText: string; dealText?: string | null; category?: string | null; fromCatalog: boolean };

  function applyPreset(s: NameSuggestion) {
    setFormProductName(s.name);
    setFormPriceText(s.priceText.replace(/^\$/, ''));
    if (s.dealText && !formDealText.trim()) setFormDealText(s.dealText);
    if (s.category && !formCategory.trim()) setFormCategory(s.category);
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
    enabled: viewMode === 'catalog' || viewMode === 'deals',   // the Deals tab lists and prints the catalog's deals
  });
  const labels: Label[] = data?.data?.data || [];
  const catalogItems: CatalogItem[] = useMemo(() => labels.map(l => ({
    id: l.id, productName: l.productName, barcode: l.barcode, category: l.category, dealText: l.dealText, price: l.priceText,
  })), [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A new item's barcode next to ones the catalog has (the same maker, often the same product line): what they suggest
  const similarSugg = showModal && !editingLabel && formBarcode.trim() ? suggestFromBarcode(formBarcode, catalogItems, formProductName) : null;
  // What the form filled in by itself: it keeps following the suggestion until a value of your own is typed
  const autoFilled = useRef<{ price: string | null; category: string | null; name: string | null }>({ price: null, category: null, name: null });
  const similarKey = similarSugg ? `${similarSugg.price}|${similarSugg.category}|${similarSugg.brand}` : '';
  useEffect(() => {
    if (!similarSugg) return;
    if (formPriceText === '' || formPriceText === autoFilled.current.price) {
      const next = similarSugg.price ?? '';
      if (next !== formPriceText) setFormPriceText(next);
      autoFilled.current.price = next || null;
    }
    if (similarSugg.category && (formCategory === '' || formCategory === autoFilled.current.category) && formCategory !== similarSugg.category) {
      setFormCategory(similarSugg.category); autoFilled.current.category = similarSugg.category;
    }
    const brandName = similarSugg.brand ? `${similarSugg.brand} ` : null;
    if (brandName && (formProductName === '' || formProductName === autoFilled.current.name) && formProductName !== brandName) {
      setFormProductName(brandName); autoFilled.current.name = brandName;
    }
  }, [similarKey]);   // eslint-disable-line react-hooks/exhaustive-deps

  const suggestions: NameSuggestion[] = (() => {
    if (!nameQuery || editingLabel) return [];
    const fromCatalog = matchNames(nameQuery, catalogItems, 6).map(c => ({ key: c.id, name: c.productName, priceText: c.price ? `$${c.price}` : '', dealText: c.dealText, category: c.category, fromCatalog: true }));
    const taken = new Set(fromCatalog.map(s => s.name.toLowerCase()));
    const presets = LABEL_PRESETS.filter(p => p.name.toLowerCase().includes(nameQuery) && !taken.has(p.name.toLowerCase()))
      .map(p => ({ key: `preset-${p.name}`, name: p.name, priceText: p.priceText, fromCatalog: false }));
    return [...fromCatalog, ...presets].slice(0, 8);
  })();

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
      toast.error('Print window was blocked - allow pop-ups and try again');
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
    if (labels.some(l => selectedIds.has(l.id) && changesOf(l, pendingRef.current).length > 0)) {
      toast.error('Save your changes first, so the labels print with them.');
      return;
    }
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

  // The items shown (search and filters apply) as a spreadsheet, with the saved values. Which stores have each one comes from the
  // Coverage list; if that cannot be loaded the file still downloads, without the store columns.
  const [exporting, setExporting] = useState(false);
  async function exportList() {
    if (exporting || filteredLabels.length === 0) return;
    setExporting(true);
    let coverage: CsvCoverage | null = null;
    try {
      const r = await qc.fetchQuery({ queryKey: ['labels-coverage'], queryFn: labelsApi.getCoverage, staleTime: 30_000 });
      coverage = (r?.data?.data as CsvCoverage) ?? null;
    } catch { coverage = null; }
    const filtered = !!search.trim() || !!categoryFilter || onlyNoPrice;
    downloadCsv(`lucky-stop-labels${filtered ? '-filtered' : ''}-${new Date().toLocaleDateString('en-CA')}.csv`, labelsCsv(filteredLabels, TEMPLATE_LABELS, coverage));
    setExporting(false);
    const notes = [
      !coverage ? 'the store columns are left out (could not load which stores have each item)' : '',
      changeCount > 0 ? `your ${plural(changeCount, 'unsaved change is', 'unsaved changes are')} not in it` : '',
    ].filter(Boolean);
    const msg = `Exported ${plural(filteredLabels.length, 'item', 'items')}${filtered ? ' (the ones shown)' : ''}.${notes.length ? ` Note: ${notes.join('; ')}.` : ''}`;
    if (!coverage) toast.error(msg, { duration: 7000 }); else toast.success(msg, { duration: notes.length ? 7000 : 3000 });
  }

  const { data: dupData } = useQuery({ queryKey: ['label-duplicates'], queryFn: () => labelsApi.getDuplicates(), staleTime: 60_000 });
  const sameCount: number = (dupData?.data?.data ?? []).length;

  function refreshLabels() {
    ['labels', 'store-labels', 'labels-coverage', 'labels-health-summary', 'label-duplicates'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }

  // ── Editing straight in the table, saved together ─────────────────────────────
  // Typing in a cell does not save it. Each change waits (the cell turns blue) until Save changes, which sends one update per item with
  // all of its fields and asks once, only when stores would reprint or a price moves a lot. The waiting changes are kept outside this
  // page, so going to another page and back keeps them; closing or reloading the tab warns first.
  const userId = useAuthStore(st => st.user?.id ?? '');
  const [pending, setPendingState] = useState<PendingEdits>(() => (unsavedEdits.userId === userId ? unsavedEdits.edits : {}));
  const pendingRef = useRef(pending);
  function setPending(next: PendingEdits) {
    pendingRef.current = next;   // read straight away by Save, which can run in the same moment a cell adds its change
    unsavedEdits.userId = userId;
    unsavedEdits.edits = next;
    setPendingState(next);
  }
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReviewItem[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const cellValue = (label: Label, field: InlineField) => valueWithEdits(label, field, pending);
  const isChanged = (label: Label, field: InlineField) => changesOf(label, pending).some(c => c.field === field);
  const withEdits = (label: Label): Label => ({ ...label, ...Object.fromEntries(changesOf(label, pending).map(c => [c.field, c.to])) });
  const pendingItems = labels.map(label => ({ label, changes: changesOf(label, pending) })).filter(it => it.changes.length > 0);
  const changeCount = pendingItems.reduce((n, it) => n + it.changes.length, 0);

  // One cell's new value joins the waiting changes, or leaves them when it is back to what is saved. A barcode already on another
  // item, saved or waiting, is refused here.
  function stage(label: Label, field: InlineField, next: string | null): boolean {
    if (field === 'barcode' && next) {
      const clash = labels.find(l => l.id !== label.id && valueWithEdits(l, 'barcode', pendingRef.current) === next);
      if (clash) { toast.error(`The barcode ${next} already belongs to "${clash.productName}". One barcode belongs to one item.`); return false; }
    }
    const row: Draft = { ...(pendingRef.current[label.id] ?? {}) };
    if ((label[field] ?? '') === (next ?? '')) delete row[field]; else row[field] = next;
    const all = { ...pendingRef.current };
    if (Object.keys(row).length) all[label.id] = row; else delete all[label.id];
    setPending(all);
    if (saveErrors[label.id]) setSaveErrors(({ [label.id]: _gone, ...rest }) => rest);
    return true;
  }

  function revert(label: Label, field: InlineField) {
    const row: Draft = { ...(pendingRef.current[label.id] ?? {}) };
    delete row[field];
    const all = { ...pendingRef.current };
    if (Object.keys(row).length) all[label.id] = row; else delete all[label.id];
    setPending(all);
  }

  function discardAll() {
    setPending({});
    setSaveErrors({});
    setConfirmDiscard(false);
  }

  // Pricing down a list: Enter in a "No price" box moves the cursor to the next item on this page that still has no price
  function focusNextUnpriced(labelId: string) {
    const unpriced = pagedLabels.filter(l => l.priceText == null).map(l => l.id);
    const nextId = unpriced[unpriced.indexOf(labelId) + 1];
    if (nextId) setTimeout(() => quickPriceRefs.current.get(nextId)?.focus(), 0);
  }

  async function startSave() {
    if (checking || savingAll || review) return;
    // A cell still being typed in joins first (leaving it adds it); one with a mistake has to be fixed or put back
    (document.activeElement as HTMLElement | null)?.blur?.();
    const bad = tableRef.current?.querySelector<HTMLInputElement>('input[aria-invalid="true"]');
    if (bad) { bad.focus(); toast.error('Fix the box marked in red first, or press Escape to put it back.'); return; }
    const items = labels.map(label => ({ label, changes: changesOf(label, pendingRef.current) })).filter(it => it.changes.length > 0);
    if (items.length === 0) return;
    setChecking(true);
    const checked = await mapLimit(items, 4, async (it): Promise<ReviewItem> => {
      if (it.changes.every(c => c.field === 'category')) return { ...it, impact: null, checkFailed: false };   // never printed: nothing to check
      try {
        const r = await labelsApi.impact(it.label.id);
        const impact = (r?.data?.data as LabelImpact) ?? null;
        return { ...it, impact, checkFailed: !impact };
      } catch {
        return { ...it, impact: null, checkFailed: true };
      }
    });
    setChecking(false);
    // One look before saving, only when it matters: a store would reprint, a price moves a lot, or the store check failed
    if (checked.some(it => it.checkFailed || reprintsFor(it) > 0 || bigPriceIn(it))) { setReview(checked); return; }
    await saveAll(checked);
  }
  const startSaveRef = useRef(startSave);
  startSaveRef.current = startSave;

  async function saveAll(items: ReviewItem[]) {
    setSavingAll(true);
    const saved = new Map<string, Draft>();
    const errors: Record<string, string> = {};
    let reprinted = 0;
    await mapLimit(items, 4, async (it) => {
      const body: Draft = Object.fromEntries(it.changes.map(c => [c.field, c.to]));
      try {
        const res = await labelsApi.update(it.label.id, body as Parameters<typeof labelsApi.update>[1]);
        reprinted += res.data?.reprint?.stores ?? 0;
        saved.set(it.label.id, body);
      } catch (e: any) {
        errors[it.label.id] = failureMessage(e, 'Could not save this item. Nothing on it was changed.');
      }
    });
    // The saved values go into the table and out of the waiting changes together, so no cell flashes back to its old value
    qc.setQueryData(['labels'], (old: any) => old?.data?.data
      ? { ...old, data: { ...old.data, data: old.data.data.map((l: Label) => (saved.has(l.id) ? { ...l, ...saved.get(l.id) } : l)) } }
      : old);
    const left = { ...pendingRef.current };
    saved.forEach((_body, id) => { delete left[id]; });
    setPending(left);
    setSaveErrors(errors);
    setSavingAll(false);
    setReview(null);
    if (saved.size) refreshLabels();
    const failed = Object.keys(errors).length;
    const savedText = saved.size ? `Saved ${plural(saved.size, 'item', 'items')}.` : '';
    if (!failed) {
      toast.success(`${savedText}${reprinted ? ` Stores were told to reprint ${plural(reprinted, 'label', 'labels')}.` : ''}`, { duration: reprinted ? 5000 : 2500 });
    } else {
      toast.error(`${savedText ? `${savedText} ` : ''}${plural(failed, 'item', 'items')} could not be saved and ${failed === 1 ? 'is' : 'are'} still marked. The reason is on the row.`, { duration: 7000 });
    }
  }

  function undoFromReview(label: Label, field: InlineField) {
    revert(label, field);
    setReview(r => {
      const next = (r ?? []).map(it => (it.label.id === label.id ? { ...it, changes: it.changes.filter(c => c.field !== field) } : it)).filter(it => it.changes.length > 0);
      return next.length ? next : null;
    });
  }

  // Closing or reloading the tab with changes waiting asks first; Ctrl+S (Cmd+S) saves from anywhere in the catalog
  useEffect(() => {
    if (changeCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [changeCount]);
  useEffect(() => {
    if (viewMode !== 'catalog') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      if (!document.querySelector('[role="dialog"]')) startSaveRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewMode]);

  const showCell = (field: InlineField, v: string | null) => (v == null || v === '' ? 'none' : field === 'priceText' ? `$${v}` : field === 'template' ? (TEMPLATE_LABELS[v] || v) : v);
  const reviewCount = review ? review.reduce((n, it) => n + it.changes.length, 0) : 0;
  const reviewReprints = review ? review.reduce((n, it) => n + reprintsFor(it), 0) : 0;
  const reviewBig = review ? review.filter(bigPriceIn).length : 0;
  const reviewUnchecked = review ? review.filter(it => it.checkFailed).length : 0;
  function storesLine(it: ReviewItem): string {
    const printed = it.changes.filter(c => c.field !== 'category');
    if (printed.length === 0) return 'Category only: nothing to reprint';
    if (it.checkFailed || !it.impact) return 'Could not check the stores';
    if (it.impact.storeCopies === 0) return 'Not in any store yet';
    if (printed.every(c => c.field === 'priceText')) {
      return `${plural(it.impact.inheritingBase, 'store reprints', 'stores reprint')}${it.impact.ownPrice > 0 ? `; ${plural(it.impact.ownPrice, 'store keeps', 'stores keep')} its own price` : ''}`;
    }
    return plural(it.impact.storeCopies, 'store reprints', 'stores reprint');
  }

  // What the edit box would change, field by field, against the item as it is now
  const priceOk = canonicalPrice(formPriceText) !== null;
  const priceIssue = priceProblem(formPriceText);
  // The same product with or without the leading 0 (iPhones read UPCs as EAN-13). Editing: refused. A new item: offers its price instead.
  const barcodeTaken = formBarcode.trim() ? labels.find(l => sameBarcode(l.barcode, formBarcode.trim()) && l.id !== editingLabel?.id) : undefined;
  const barcodeClash = editingLabel ? barcodeTaken : undefined;
  const existingForNew = !editingLabel ? barcodeTaken : undefined;
  const typedPrice = canonicalPrice(formPriceText);
  const sameAsExisting = !!existingForNew && !!typedPrice && !!existingForNew.priceText && Number(existingForNew.priceText) === Number(typedPrice);
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
    mutationFn: (): Promise<AxiosResponse> => {
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
      const body = e?.response?.data;
      const typed = canonicalPrice(formPriceText);
      if (!editingLabel && body?.code === 'BARCODE_TAKEN' && body.data?.existingId && typed && !(body.data.basePriceText && Number(body.data.basePriceText) === Number(typed))) {
        setPriceClash({ id: body.data.existingId, name: body.data.existingName ?? formProductName.trim(), current: body.data.basePriceText ?? null, typed });
        return;
      }
      setFormError(failureMessage(e, 'Could not save the label. Nothing was changed.'));
    },
  });
  const runSave = useSingleFlight(saveMutation);

  const clashMutation = useMutation({
    mutationFn: (x: { id: string; typed: string }) => labelsApi.update(x.id, { priceText: x.typed }),
    onSuccess: (res, x) => {
      refreshLabels();
      const d = res.data;
      toast.success(`"${priceClash?.name}" is now $${x.typed}. ${plural(d?.reprint?.stores ?? 0, 'store is', 'stores are')} told to reprint${d?.reprint?.keptOwnPrice ? `; ${plural(d.reprint.keptOwnPrice, 'store keeps', 'stores keep')} its own price` : ''}.`, { duration: 6000 });
      setPriceClash(null);
      closeModal();
    },
    onError: (e: any) => { setPriceClash(null); setFormError(failureMessage(e, 'Could not change the price. Nothing was changed.')); },
  });

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.delete(labelId),
    onSuccess: () => {
      refreshLabels();
      toast.success(`"${confirmDelete?.productName}" was removed from every store.`);
      if (confirmDelete && pendingRef.current[confirmDelete.id]) {
        const { [confirmDelete.id]: _gone, ...rest } = pendingRef.current;
        setPending(rest);
      }
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
    autoFilled.current = { price: null, category: null, name: null };
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
    if (existingForNew) {   // no second item: change that one's price (asked first), or nothing when it is already this price
      if (sameAsExisting || !typedPrice) return;
      setPriceClash({ id: existingForNew.id, name: existingForNew.productName, current: existingForNew.priceText ?? null, typed: typedPrice });
      return;
    }
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
        open={confirmDiscard}
        title={`Discard ${plural(changeCount, 'unsaved change', 'unsaved changes')}?`}
        message="Every box goes back to what is saved. Nothing is sent."
        confirmLabel="Discard"
        danger
        onConfirm={discardAll}
        onCancel={() => setConfirmDiscard(false)}
      />

      {review && (
        <Modal
          title={`Save ${plural(reviewCount, 'change', 'changes')} to ${plural(review.length, 'item', 'items')}?`}
          subtitle={reviewReprints > 0 ? `Stores will be told to reprint ${plural(reviewReprints, 'label', 'labels')}.` : 'No store has to reprint anything.'}
          onClose={() => setReview(null)}
          busy={savingAll}
          maxWidth={600}
        >
          {reviewBig > 0 && (
            <p style={m.warn}>{reviewBig === 1 ? 'One price changes' : `${reviewBig} prices change`} by more than {BIG_PRICE_CHANGE_PERCENT}%. Check {reviewBig === 1 ? 'it' : 'them'} below.</p>
          )}
          {reviewUnchecked > 0 && <p style={m.warn}>Could not check which stores {plural(reviewUnchecked, 'item affects', 'items affect')}. You can still save.</p>}
          <div style={m.reviewList}>
            {review.map(it => {
              const pct = pricePctOf(it);
              return (
                <div key={it.label.id} style={m.reviewItem}>
                  <div style={m.reviewHead}>
                    <strong style={{ color: '#111827' }}>{it.label.productName}</strong>
                    <span style={it.checkFailed ? m.reviewStoresWarn : m.reviewStores}>{storesLine(it)}</span>
                  </div>
                  <ul style={m.reviewChanges}>
                    {it.changes.map(c => (
                      <li key={c.field} style={m.reviewChange}>
                        <span>
                          <strong>{FIELD_NAMES[c.field]}:</strong> {showCell(c.field, c.from)} → {showCell(c.field, c.to)}
                          {c.field === 'priceText' && pct !== null && (
                            <span style={Math.abs(pct) > BIG_PRICE_CHANGE_PERCENT ? m.pctBig : m.pct}> ({pct > 0 ? '+' : ''}{pct}%)</span>
                          )}
                        </span>
                        <button type="button" style={m.linkBtn} disabled={savingAll} onClick={() => undoFromReview(it.label, c.field)} aria-label={`Undo the ${FIELD_NAMES[c.field].toLowerCase()} change on ${it.label.productName}`}>
                          Undo
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
          <div style={m.actions}>
            <button type="button" style={m.cancelBtn} onClick={() => setReview(null)} disabled={savingAll}>Keep editing</button>
            <button type="button" style={{ ...m.saveBtn, ...(reviewBig > 0 ? { background: '#c42130' } : {}), ...(savingAll ? m.saveBtnDim : {}) }} onClick={() => saveAll(review)} disabled={savingAll}>
              {savingAll ? 'Saving…' : 'Save all changes'}
            </button>
          </div>
        </Modal>
      )}

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
                    <div key={p.key} style={m.suggRow} onMouseDown={() => applyPreset(p)}>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      <span style={m.suggPrice}>{p.priceText}{p.dealText ? ` · ${p.dealText}` : ''}{p.fromCatalog ? '' : ' · starter'}</span>
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
            {similarSugg && similarSugg.similar.length > 0 && !existingForNew && (
              <div style={m.similarBox} role="status" data-testid="similar-box">
                {similarSugg.price && formPriceText === similarSugg.price && (
                  <div style={m.similarFilled}>Price from {similarSugg.basis.length} similar items ({similarSugg.basis.slice(0, 2).join(', ')}). Check it before saving.</div>
                )}
                {similarSugg.prices.length > 0 && (
                  <div style={m.similarChips}>
                    <span style={m.hint}>Similar items cost:</span>
                    {similarSugg.prices.slice(0, 4).map(pr => (
                      <button key={pr.price} type="button" className="ui-chip" aria-pressed={formPriceText === pr.price}
                        aria-label={`Use $${pr.price}, the price of ${pr.count} similar items like ${pr.example}`} onClick={() => { setFormPriceText(pr.price); setFormError(''); }}>
                        ${pr.price}{pr.count > 1 ? ` ×${pr.count}` : ''}
                      </button>
                    ))}
                  </div>
                )}
                {similarSugg.deal && !formDealText.trim() && (
                  <button type="button" className="ui-chip" onClick={() => setFormDealText(similarSugg.deal!)}>Same deal as similar items: {similarSugg.deal}</button>
                )}
                <div style={m.hint}>
                  {similarSugg.closeness === 'line' ? 'Same product line' : 'Same brand'}: {similarSugg.similar.slice(0, 3).map(x => `${x.item.productName}${x.item.price ? ` $${x.item.price}` : ''}`).join(', ')}
                </div>
              </div>
            )}
            {dupHint && !formBarcode.trim() && <div style={m.hint}>The barcode was left empty: one barcode belongs to one item. Scan or type this copy's own.</div>}
            {barcodeClash && <div role="alert" style={m.err}>The barcode {formBarcode.trim()} already belongs to "{barcodeClash.productName}". Use that item, or change the barcode.</div>}
            {existingForNew && (
              <div role="status" style={m.hint}>
                This barcode is already "{existingForNew.productName}"{existingForNew.priceText ? ` at $${existingForNew.priceText}` : ', with no price yet'}. One barcode is one item, so no second item is made.
                {sameAsExisting ? ' It already has this price.' : typedPrice ? ` Saving changes its price to $${typedPrice} for every store (a store with its own price keeps it).` : ''}
              </div>
            )}
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
            <div style={m.label} id="lbl-preview-label">Preview</div>
            <iframe
              title="How this label prints"
              aria-labelledby="lbl-preview-label"
              style={m.preview}
              sandbox=""
              srcDoc={labelPreviewHtml({
                id: editingLabel?.id ?? 'preview',
                productName: formProductName.trim() || 'Product name',
                priceText: canonicalPrice(formPriceText) ?? '0.00',
                dealText: formDealText.trim() || null,
                barcode: formBarcode.trim() || null,
                template: formTemplate,
              })}
            />
            {formError && <div role="alert" style={m.err}>{formError}</div>}
            <div style={m.actions}>
              <button type="button" style={m.cancelBtn} onClick={closeModal} disabled={saveMutation.isPending}>Cancel</button>
              <button
                type="submit"
                style={{ ...m.saveBtn, ...(!formProductName.trim() || !priceOk || !!barcodeClash || sameAsExisting || saveMutation.isPending ? m.saveBtnDim : {}) }}
                disabled={!formProductName.trim() || !priceOk || !!barcodeClash || sameAsExisting || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : existingForNew ? `Change its price` : 'Save Label'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showImport && <LabelImportModal onClose={() => setShowImport(false)} />}
      <ConfirmModal
        open={!!priceClash}
        title="This barcode is already an item"
        message={priceClash ? `"${priceClash.name}" has this barcode${priceClash.current ? ` at $${priceClash.current}` : ' with no price yet'}. Change its price for every store to $${priceClash.typed}? Stores with their own price keep it.` : ''}
        confirmLabel={clashMutation.isPending ? 'Changing…' : `Change to $${priceClash?.typed ?? ''}`}
        busy={clashMutation.isPending}
        onConfirm={() => { if (priceClash && !clashMutation.isPending) clashMutation.mutate({ id: priceClash.id, typed: priceClash.typed }); }}
        onCancel={() => { setPriceClash(null); setFormError(`"${priceClash?.name}" already has this barcode, so no second item was made. Its price was not changed.`); }}
      />
      <div style={s.inner}>
        <PageHeader
          title="Labels"
          description={viewMode === 'catalog'
            ? 'Chain-wide catalog and base prices.'
            : viewMode === 'store'
            ? 'Per-store pricing, overrides, and printing.'
            : viewMode === 'coverage'
            ? 'Which stores have each item, and which are missing it.'
            : viewMode === 'same'
            ? 'Items that share a barcode: keep one, with one price.'
            : viewMode === 'deals'
            ? 'Deal recommendations, and the deal list to print for the staff.'
            : 'How many labels need printing right now, by store.'}
          actions={viewMode === 'catalog' && (
            <>
              <Button icon={<Download />} onClick={exportList} disabled={exporting || filteredLabels.length === 0}
                title="Download the items shown below as a spreadsheet (opens in Excel)">
                {exporting ? 'Exporting…' : 'Export'}
              </Button>
              <Button icon={<Upload />} onClick={() => setShowImport(true)} title="Bring back an edited export: see every change, then apply">Import</Button>
              <Button variant="primary" icon={<Plus />} onClick={openAddModal}>Add Label</Button>
            </>
          )}
        />

        <Tabs
          asButtons
          ariaLabel="Labels view"
          value={viewMode}
          onChange={setViewMode}
          tabs={[
            { value: 'catalog', label: 'Catalog' },
            { value: 'store', label: 'By Store' },
            { value: 'coverage', label: 'Coverage' },
            { value: 'health', label: 'Health' },
            { value: 'same', label: 'Same barcode', ...(sameCount ? { count: sameCount } : {}) },
            { value: 'deals', label: 'Deals' },
          ]}
        />

        {viewMode === 'store' ? (
          <StoreLabelsPanel />
        ) : viewMode === 'coverage' ? (
          <CoverageView />
        ) : viewMode === 'health' ? (
          <HealthView />
        ) : viewMode === 'same' ? (
          <SameBarcodePanel />
        ) : viewMode === 'deals' ? (
          <DealsPanel labels={labels} />
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
                <div style={s.emptyIcon}><Glyph e="🏷️" size={28} color="#5a6472" /></div>
                <div style={s.emptyTitle}>No labels yet</div>
                <div style={s.emptySub}>Add a label to start building the catalog</div>
              </div>
            ) : filteredLabels.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={s.emptyIcon}><Glyph e="🔍" size={28} color="#5a6472" /></div>
                <div style={s.emptyTitle}>No labels match your filters</div>
                <div style={s.emptySub}>Try clearing the search or category filter</div>
              </div>
            ) : (
              <div style={s.tableWrap} ref={tableRef}>
                <Table style={s.table}>
                  <TableHeader>
                    <TableRow>
                      <TableHead style={s.th}>
                        <span className="sr-only">Select</span>
                        <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} aria-label={allFilteredSelected ? 'Deselect all labels' : 'Select all labels'} />
                      </TableHead>
                      {['Product', 'Category', 'Base price', 'Deal', 'Design', 'Updated'].map(h => (
                        <TableHead key={h} style={s.th}>{h}</TableHead>
                      ))}
                      {/* The row buttons' column: no visible title, but a screen reader names it */}
                      <TableHead style={s.th}><span className="sr-only">Actions</span></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagedLabels.map((label, i) => {
                      const checked = selectedIds.has(label.id);
                      const rowChanged = changesOf(label, pending).length > 0;
                      const cell = (field: InlineField) => ({
                        value: cellValue(label, field),
                        changed: isChanged(label, field),
                        savedText: showCell(field, label[field]),
                        disabled: savingAll,
                        onCommit: (next: string | null) => stage(label, field, next),
                        onRevert: () => revert(label, field),
                      });
                      return (
                        <TableRow key={label.id} style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                          <TableCell style={{ ...s.td, ...(rowChanged ? s.rowChangedMark : {}) }}>
                            {label.priceText != null ? (
                              <input type="checkbox" checked={checked} onChange={() => toggleSelected(label.id)} aria-label={`Select ${label.productName}`} />
                            ) : (
                              <span title="Set a price before this can be printed" style={{ color: TEXT_MUTED, fontSize: 16 }}>-</span>
                            )}
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 190 }}>
                            <InlineText
                              {...cell('productName')} bold ariaLabel={`Name of ${label.productName}`} placeholder="Product name" maxLength={40}
                              normalize={v => (v.trim() ? { value: v.trim() } : { error: 'Enter the product name.' })}
                            />
                            <InlineText
                              {...cell('barcode')} mono small ariaLabel={`Barcode of ${label.productName}`} placeholder="Add barcode" maxLength={40}
                              normalize={v => ({ value: v.trim() || null })}
                            />
                            {saveErrors[label.id] && <span style={s.cellError} role="alert">Not saved: {saveErrors[label.id]}</span>}
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 130 }}>
                            <InlineText
                              {...cell('category')} ariaLabel={`Category of ${label.productName}`} placeholder="Add category" maxLength={100} list="label-category-options"
                              normalize={v => ({ value: v.trim() || null })}
                            />
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 120 }}>
                            {label.priceText != null ? (
                              <InlineText
                                {...cell('priceText')} prefix="$" ariaLabel={`Price of ${label.productName}`} placeholder="0.00" maxLength={8} inputMode="decimal"
                                normalize={v => { const c = canonicalPrice(v); return c ? { value: c } : { error: v.trim() ? (priceProblem(v) || 'Enter a price like 2.99') : 'A label needs a price to print.' }; }}
                              />
                            ) : (
                              <QuickPrice
                                label={label}
                                staged={cellValue(label, 'priceText')}
                                disabled={savingAll}
                                onStage={price => stage(label, 'priceText', price)}
                                onNext={() => focusNextUnpriced(label.id)}
                                inputRef={(el) => { if (el) quickPriceRefs.current.set(label.id, el); else quickPriceRefs.current.delete(label.id); }}
                              />
                            )}
                          </TableCell>
                          <TableCell style={{ ...s.td, minWidth: 120 }}>
                            <InlineText
                              {...cell('dealText')} ariaLabel={`Deal for ${label.productName}`} placeholder="Add deal" maxLength={20}
                              normalize={v => ({ value: v.trim() || null })}
                            />
                          </TableCell>
                          <TableCell style={s.td}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <select
                                style={{ ...s.cellSelect, ...(isChanged(label, 'template') ? s.cellChanged : {}) }}
                                value={cellValue(label, 'template') ?? label.template}
                                disabled={savingAll}
                                onChange={e => { stage(label, 'template', e.target.value); }}
                                aria-label={`Design for ${label.productName}`}
                                title={isChanged(label, 'template') ? `Not saved yet. Saved: ${showCell('template', label.template)}` : undefined}
                              >
                                {TEMPLATE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                              {isChanged(label, 'template') && (
                                <button type="button" style={{ ...s.undoBtn, position: 'static', transform: 'none' }} onClick={() => revert(label, 'template')} disabled={savingAll}
                                  title={`Put back: ${showCell('template', label.template)}`} aria-label={`Undo: Design for ${label.productName}`}>
                                  <RotateCcw size={12} strokeWidth={2.5} />
                                </button>
                              )}
                            </span>
                          </TableCell>
                          <TableCell style={{ ...s.td, color: TEXT_MUTED, fontSize: 13, whiteSpace: 'nowrap' }}>{new Date(label.updatedAt).toLocaleDateString()}</TableCell>
                          <TableCell style={s.td}>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button type="button" style={s.iconBtn} onClick={() => duplicateLabel(withEdits(label))} title="Duplicate" aria-label={`Duplicate ${label.productName}`}>
                                <Copy size={16} strokeWidth={2} />
                              </button>
                              <button type="button" style={{ ...s.iconBtn, color: '#c42130' }} onClick={() => setConfirmDelete(label)} title="Delete" aria-label={`Delete ${label.productName}`}>
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

        {changeCount > 0 && (
          <div style={s.saveBar} role="region" aria-label="Unsaved changes">
            <span style={s.saveBarDot} aria-hidden />
            <span style={s.saveBarText}>
              <strong>{plural(changeCount, 'unsaved change', 'unsaved changes')}</strong> on {plural(pendingItems.length, 'item', 'items')}
              {viewMode !== 'catalog' ? ' in the Catalog' : ''}
              <span style={s.saveBarHint}> · Ctrl+S saves</span>
            </span>
            <button type="button" style={s.saveBarDiscard} onClick={() => setConfirmDiscard(true)} disabled={checking || savingAll}>Discard</button>
            <button type="button" style={{ ...s.saveBarSave, ...(checking || savingAll ? { opacity: 0.7, cursor: 'wait' } : {}) }} onClick={() => startSave()} disabled={checking || savingAll}>
              {checking ? 'Checking stores…' : savingAll ? 'Saving…' : `Save ${plural(changeCount, 'change', 'changes')}`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: 'var(--background)', padding: '32px 0' },
  inner: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 20 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  pageTitle: { fontSize: 26, fontWeight: 700, color: PRIMARY, margin: 0 },
  pageSub: { color: TEXT_MUTED, marginTop: 4, fontSize: 14 },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: PRIMARY, border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  exportBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: '#fff', border: '1.5px solid #d5dae1',
    color: '#111827', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  catalogLayout: { display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'flex-start' },
  catalogMain: { flex: '1 1 480px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 },

  viewToggleRow: { display: 'flex', gap: 8 },
  viewToggleChip: {
    borderWidth: 1.5, borderStyle: 'solid', borderColor: '#d5dae1', borderRadius: 20, padding: '8px 16px',
    fontSize: 13, fontWeight: 700, color: '#374151', background: '#fff', cursor: 'pointer',
  },
  viewToggleChipActive: { borderColor: PRIMARY, background: '#eef2f7', color: PRIMARY },

  filterRow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  searchInput: {
    flex: '1 1 240px', minWidth: 200, border: '1.5px solid #d5dae1', borderRadius: 10,
    padding: '9px 14px', fontSize: 14, outline: 'none',
  },
  filterSelect: {
    border: '1.5px solid #d5dae1', borderRadius: 10, padding: '9px 12px',
    fontSize: 14, background: '#fff', color: '#111827', cursor: 'pointer',
  },

  tableWrap: {
    background: '#fff', borderRadius: 12, overflowX: 'auto',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)', border: '1px solid #e4e7ec',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: TEXT_MUTED, background: '#f7f8fa', borderBottom: '1px solid #e4e7ec',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f1f3f6', verticalAlign: 'middle', fontSize: 14 },

  emptyBox: {
    background: '#fff', borderRadius: 12, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
  cellInput: {
    width: '100%', boxSizing: 'border-box', border: '1px solid #e4e7ec', borderRadius: 7, background: '#fff',
    padding: '6px 8px', fontSize: 14, color: '#111827', outline: 'none',
  },
  cellInputFocus: { borderColor: PRIMARY, boxShadow: `0 0 0 3px ${PRIMARY}22` },
  cellSelect: {
    border: '1px solid #e4e7ec', borderRadius: 7, background: '#fff', padding: '6px 8px', fontSize: 13, color: '#111827', cursor: 'pointer', maxWidth: 170,
  },
  cellError: { display: 'block', fontSize: 11.5, color: '#a51b28', fontWeight: 600, marginTop: 3 },
  // A change not saved yet: blue, so it stands apart from the amber "No price" boxes and red mistakes
  cellChanged: { background: '#eef2f7', borderColor: '#d3dcea' },
  rowChangedMark: { boxShadow: 'inset 3px 0 0 #3c6e8f' },
  undoBtn: {
    position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 20, height: 20, borderRadius: 5, border: 'none', background: '#eef2f7', color: '#1D3557', cursor: 'pointer', padding: 0,
  },
  saveBar: {
    position: 'sticky', bottom: 16, zIndex: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    background: '#111827', color: '#fff', borderRadius: 12, padding: '12px 16px', boxShadow: '0 10px 30px rgba(15,23,42,0.28)',
  },
  saveBarDot: { width: 9, height: 9, borderRadius: 5, background: '#60a5fa', flexShrink: 0 },
  saveBarText: { flex: '1 1 220px', fontSize: 14 },
  saveBarHint: { color: '#5a6472', fontSize: 13 },
  saveBarDiscard: {
    background: 'transparent', border: '1px solid #374151', color: '#e4e7ec', borderRadius: 10, padding: '9px 16px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  },
  saveBarSave: { background: '#1D3557', border: 'none', color: '#fff', borderRadius: 10, padding: '9px 18px', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  iconBtn: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8,
    border: '1px solid #e4e7ec', background: '#fff', color: '#374151', cursor: 'pointer',
  },
  noPriceChip: {
    border: '1.5px solid #f1dcaf', background: '#fdf6e8', color: '#8a5300', borderRadius: 999,
    padding: '7px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  noPriceChipActive: { background: '#8a5300', borderColor: '#8a5300', color: '#fff' },
  quickPriceWrap: { display: 'inline-flex', alignItems: 'center', gap: 6 },
  quickPriceBox: {
    display: 'inline-flex', alignItems: 'center', border: '1.5px solid #f1dcaf', background: '#fdf6e8', borderRadius: 8, padding: '0 8px',
  },
  quickPriceDollar: { color: '#8a5300', fontWeight: 700, fontSize: 14 },
  quickPriceInput: {
    width: 72, border: 'none', outline: 'none', background: 'transparent', padding: '6px 4px', fontSize: 14, fontWeight: 600, color: '#111827',
  },
  quickPriceHint: { fontSize: 11, color: TEXT_MUTED },
  quickPriceError: { fontSize: 12, color: '#a51b28', fontWeight: 600 },
};

const m: Record<string, CSSProperties> = {
  preview: { width: '100%', height: 176, border: '1px solid #e4e7ec', borderRadius: 10, background: '#f6f7f9', display: 'block' },
  form: { display: 'flex', flexDirection: 'column', gap: 8 },
  err: { fontSize: 13, color: '#a51b28', lineHeight: 1.4 },
  warn: { fontSize: 14, color: '#a51b28', fontWeight: 700, margin: '8px 0 0', lineHeight: 1.5 },
  note: { fontSize: 14, color: '#374151', margin: '8px 0 0', lineHeight: 1.5 },
  changeList: { margin: '0 0 4px', paddingLeft: 18, fontSize: 15, color: '#111827', lineHeight: 1.6 },
  linkBtn: { background: 'none', border: 'none', padding: 0, color: '#1D3557', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 14 },
  reviewList: { maxHeight: '52vh', overflowY: 'auto', margin: '12px 0 4px', display: 'flex', flexDirection: 'column', gap: 10 },
  reviewItem: { border: '1px solid #e4e7ec', borderRadius: 10, padding: '10px 12px' },
  reviewHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', fontSize: 15 },
  reviewStores: { fontSize: 13, color: TEXT_MUTED },
  reviewStoresWarn: { fontSize: 13, color: '#a51b28', fontWeight: 700 },
  reviewChanges: { listStyle: 'none', margin: '6px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 4 },
  reviewChange: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, fontSize: 14, color: '#374151' },
  pct: { color: TEXT_MUTED },
  pctBig: { color: '#a51b28', fontWeight: 700 },
  label: { fontSize: 13, fontWeight: 700, color: '#111827', marginTop: 6 },
  hint: { fontSize: 12, color: TEXT_MUTED, marginTop: 2 },
  similarBox: { display: 'flex', flexDirection: 'column' as const, gap: 6, padding: '8px 10px', borderRadius: 8, background: '#f6f8fb', border: '1px solid #e4e7ec' },
  similarFilled: { fontSize: 12.5, fontWeight: 700, color: '#17663a' },
  similarChips: { display: 'flex', flexWrap: 'wrap' as const, gap: 6, alignItems: 'center' },
  input: {
    border: '1.5px solid #d5dae1', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  templateRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  templateChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1.5px solid #d5dae1', borderRadius: 20,
    padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#374151',
    background: '#fff', cursor: 'pointer',
  },
  templateChipActive: { borderColor: PRIMARY, background: '#eef2f7', color: PRIMARY },
  templateSwatch: { width: 10, height: 10, borderRadius: 5, display: 'inline-block' },
  priceInputWrap: { position: 'relative' as const },
  priceInputDollar: {
    position: 'absolute' as const, left: 14, top: '50%', transform: 'translateY(-50%)',
    fontSize: 15, fontWeight: 700, color: '#5a6472', pointerEvents: 'none' as const,
  },
  priceInput: { paddingLeft: 26 },
  sugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
    border: '1.5px solid #e4e7ec', borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
  },
  suggRow: {
    padding: '10px 14px', cursor: 'pointer', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', fontSize: 14,
    borderBottom: '1px solid #f7f8fa', transition: 'background 0.1s',
  },
  suggPrice: { fontSize: 13, color: TEXT_MUTED, marginLeft: 8, whiteSpace: 'nowrap' as const },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 },
  cancelBtn: {
    background: '#f1f3f6', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#374151',
  },
  saveBtn: {
    background: PRIMARY, color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};

// "No price set" as a box to type into. A price typed here waits with the other changes (the box turns blue) and Enter moves on to
// the next item without a price, so a list is priced by typing a price and pressing Enter each time, then saving once. The same price
// rules as the Add box. Emptying the box (or Escape on a price not saved yet) takes the price back out.
function QuickPrice({ label, staged, disabled, onStage, onNext, inputRef }: {
  label: Label;
  staged: string | null;
  disabled: boolean;
  onStage: (price: string | null) => void;
  onNext: () => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const [value, setValue] = useState(staged ?? '');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const skipBlur = useRef(false);

  useEffect(() => { if (!focused) setValue(staged ?? ''); }, [staged, focused]);

  // False when the text is not a price; the reason shows beside the box
  function take(): boolean {
    if (value.trim() === '') { setError(''); onStage(null); return true; }
    const price = canonicalPrice(value);
    if (!price) { setError(priceProblem(value) || 'Enter a price like 2.99'); return false; }
    setError('');
    onStage(price);
    return true;
  }

  const waiting = staged != null;
  return (
    <span style={s.quickPriceWrap}>
      <span style={{ ...s.quickPriceBox, ...(waiting ? s.cellChanged : {}), ...(error ? { borderColor: '#c42130' } : {}) }}>
        <span style={{ ...s.quickPriceDollar, ...(waiting ? { color: '#1D3557' } : {}) }} aria-hidden>$</span>
        <input
          ref={inputRef}
          style={s.quickPriceInput}
          value={value}
          onFocus={() => setFocused(true)}
          onChange={e => { setValue(e.target.value); if (error) setError(''); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); if (take()) onNext(); }
            if (e.key === 'Escape') {
              skipBlur.current = true;
              if (value === (staged ?? '') && waiting) onStage(null);
              setValue(staged ?? '');
              setError('');
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            setFocused(false);
            if (skipBlur.current) { skipBlur.current = false; return; }
            take();
          }}
          placeholder="No price"
          inputMode="decimal"
          disabled={disabled}
          title={waiting ? 'Not saved yet' : undefined}
          aria-label={`Price for ${label.productName}`}
          aria-invalid={!!error}
        />
      </span>
      {error ? <span style={s.quickPriceError} role="alert">{error}</span> : null}
    </span>
  );
}

type InlineField = 'productName' | 'priceText' | 'dealText' | 'barcode' | 'category' | 'template';
const FIELD_NAMES: Record<InlineField, string> = {
  productName: 'Name', priceText: 'Price', dealText: 'Deal', barcode: 'Barcode', category: 'Category', template: 'Design',
};
const FIELD_ORDER: InlineField[] = ['productName', 'barcode', 'category', 'priceText', 'dealText', 'template'];

type Draft = Partial<Record<InlineField, string | null>>;
type PendingEdits = Record<string, Draft>;
interface Change { field: InlineField; from: string | null; to: string | null }
interface ReviewItem { label: Label; changes: Change[]; impact: LabelImpact | null; checkFailed: boolean }

// Changes not saved yet live here, not in the page, so they are still there after going to another page and coming back
const unsavedEdits: { userId: string; edits: PendingEdits } = { userId: '', edits: {} };

function valueWithEdits(label: Label, field: InlineField, edits: PendingEdits): string | null {
  const row = edits[label.id];
  return row && field in row ? (row[field] ?? null) : label[field];
}

// What is waiting for this item, field by field, against what is saved now (a change that matches the saved value is not a change)
function changesOf(label: Label, edits: PendingEdits): Change[] {
  const row = edits[label.id];
  if (!row) return [];
  return FIELD_ORDER
    .filter(f => f in row && (row[f] ?? '') !== (label[f] ?? ''))
    .map(f => ({ field: f, from: label[f], to: row[f] ?? null }));
}

// How many store copies a save tells to reprint, as the server does it: the category is never printed, a price alone reprints only
// where the base price is used, anything else on the label reprints everywhere
function reprintsFor(it: ReviewItem): number {
  const printed = it.changes.filter(c => c.field !== 'category');
  if (printed.length === 0 || !it.impact) return 0;
  return printed.every(c => c.field === 'priceText') ? it.impact.inheritingBase : it.impact.storeCopies;
}

function pricePctOf(it: ReviewItem): number | null {
  const c = it.changes.find(x => x.field === 'priceText');
  return c ? priceChangePercent(c.from, c.to) : null;
}

function bigPriceIn(it: ReviewItem): boolean {
  const pct = pricePctOf(it);
  return pct !== null && Math.abs(pct) > BIG_PRICE_CHANGE_PERCENT;
}

// Runs fn over items, a few at a time, keeping the order of the results
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// A table cell you type into. Enter (or leaving the box) adds the change to the ones waiting to be saved and the box turns blue;
// Escape drops what was just typed, and Escape again (or the small undo button) puts back the saved value. A bad value says why under
// the box and is not added; a refused one (a barcode on another item) goes back.
function InlineText({ value, changed, savedText, disabled, placeholder, ariaLabel, maxLength, prefix, mono, bold, small, list, inputMode, normalize, onCommit, onRevert }: {
  value: string | null;
  changed: boolean;
  savedText: string;
  disabled: boolean;
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
  onCommit: (next: string | null) => boolean;
  onRevert: () => void;
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState('');
  const skipBlur = useRef(false);

  useEffect(() => { if (!focused) setDraft(value ?? ''); }, [value, focused]);

  function commit() {
    const r = normalize(draft);
    if ('error' in r) { setError(r.error); return; }
    setError('');
    if ((r.value ?? '') === (value ?? '')) { setDraft(value ?? ''); return; }
    if (!onCommit(r.value)) setDraft(value ?? '');
  }

  const inputStyle: CSSProperties = {
    ...s.cellInput,
    ...(changed ? s.cellChanged : {}),
    ...(focused ? s.cellInputFocus : {}),
    ...(error ? { borderColor: '#c42130' } : {}),
    ...(bold ? { fontWeight: 700, color: PRIMARY } : {}),
    ...(mono ? { fontFamily: 'monospace' } : {}),
    ...(small ? { fontSize: 12, padding: '3px 8px', marginTop: 4, color: TEXT_MUTED } : {}),
    ...(prefix ? { paddingLeft: 20 } : {}),
    ...(changed && !focused ? { paddingRight: 28 } : {}),
    ...(disabled ? { opacity: 0.6 } : {}),
  };
  return (
    <span style={{ display: 'block', position: 'relative' }}>
      <span style={{ display: 'block', position: 'relative' }}>
        {prefix && <span style={{ position: 'absolute', left: 8, top: small ? 8 : 7, fontSize: 14, color: TEXT_MUTED, pointerEvents: 'none' }}>{prefix}</span>}
        <input
          style={inputStyle}
          value={draft}
          placeholder={placeholder}
          maxLength={maxLength}
          list={list}
          inputMode={inputMode}
          disabled={disabled}
          title={changed ? `Not saved yet. Saved: ${savedText}` : undefined}
          aria-label={ariaLabel}
          aria-invalid={!!error}
          onFocus={() => setFocused(true)}
          onChange={e => { setDraft(e.target.value); if (error) setError(''); }}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            if (e.key === 'Escape') {
              skipBlur.current = true;
              if (draft === (value ?? '') && changed) onRevert();
              setDraft(value ?? '');
              setError('');
              e.currentTarget.blur();
            }
          }}
          onBlur={() => {
            setFocused(false);
            if (skipBlur.current) { skipBlur.current = false; return; }
            commit();
          }}
        />
        {changed && !focused && (
          <button
            type="button" tabIndex={-1} style={s.undoBtn} onClick={onRevert} disabled={disabled}
            title={`Put back: ${savedText}`} aria-label={`Undo: ${ariaLabel}`}
          >
            <RotateCcw size={12} strokeWidth={2.5} />
          </button>
        )}
      </span>
      {error && <span style={s.cellError} role="alert">{error}</span>}
    </span>
  );
}
