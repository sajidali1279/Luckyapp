import { useState, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Modal, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Keyboard, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { labelsApi, storesApi, orderCategoriesApi, scannedProductApi } from '../services/api';
import { COLORS } from '../constants';
import { TagIcon, XIcon, CheckCircleIcon, EditIcon, CameraIcon, FilterIcon, DollarSignIcon, ShoppingBagIcon, Trash2Icon, AlertTriangleIcon, PlusIcon, MapPinIcon, ChevronDownIcon, ChevronRightIcon } from './Icons';
import BarcodeScannerModal, { BarcodeResult } from './BarcodeScannerModal';
import PriceCheckModal from './PriceCheckModal';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import { useAuthStore, isStoreManagerOrAbove } from '../store/authStore';
import { useLabelCart } from '../store/labelCartStore';
import { useCurrentStoreId } from '../utils/geo';
import { LabelPrintStatus, STATUS_COLOR, STATUS_BG, formatEndsOn } from '../utils/labelStatus';
import { Cart, CartRow, cartKey, printPriceFor, resolveCartRows, summarizeCart, runPool } from '../utils/labelCart';
import ErrorState from './ErrorState';

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
  // Only present in responses from getAllWithMyStore(storeId) when a
  // storeId was actually supplied — absent (not just null) otherwise, e.g.
  // when no store has resolved yet. Always check truthiness, not `!== null`.
  myStoreLabel?: {
    id: string;
    effectivePrice: string | null;
    printedAt: string | null;
    status: LabelPrintStatus;
    hasOverride: boolean;
    overrideExpiresAt: string | null;
  } | null;
}

// A product from the Store Catalog (the shared scan cache): known to the
// chain, but not necessarily labelled.
interface ScannedProduct {
  id: string;
  barcode: string;
  name: string;
  category: string | null;
}

// Stable empty cart so a store with nothing in it doesn't hand React a new
// object on every render.
const EMPTY_CART: Cart = {};

// How many per-item store rows to record at once after a print. A big cart
// shouldn't fire hundreds of requests together, nor crawl through them one
// by one.
const STORE_ROW_CONCURRENCY = 6;

// The order status filter chips appear in: the ones that ask for action come first.
const STATUS_FILTER_ORDER: LabelPrintStatus[] = ['needs_reprint', 'new', 'needs_price', 'printed', 'not_added'];

// Sentinel for the "Uncategorized" filter chip — distinct from `null`
// (which means "no filter, show everything").
const UNCATEGORIZED = '__uncategorized__';

// Display names come from the translations (sharedLabels.template_<value>).
const TEMPLATES: { value: string; color: string }[] = [
  { value: 'CLASSIC_RED_BLACK', color: '#b91c1c' },
  { value: 'CHRISTMAS_WINTER', color: '#14532d' },
  { value: 'SUMMER', color: '#ea580c' },
  { value: 'CLEARANCE', color: '#dc2626' },
  { value: 'INDEPENDENCE_DAY', color: '#1e3a8a' },
  { value: 'HALLOWEEN', color: '#7c3aed' },
  { value: 'PREMIUM', color: '#b8860b' },
];

// -/n/+ control for the number of copies. The number itself is typeable (ten
// copies shouldn't take ten taps). Each valid number is committed as it's
// typed, not on blur: tapping Print while the keyboard is up doesn't reliably
// blur the field first, and an uncommitted number would print the old count.
// The draft only exists so the box can be cleared to retype without snapping
// back to 1 mid-edit.
function QtyStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <View style={s.qtyStepper}>
      <TouchableOpacity
        style={s.qtyBtn}
        onPress={() => { setDraft(null); onChange(value - 1); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('sharedLabels.decreaseCopiesA11y')}
      >
        <Text style={s.qtyBtnText}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={s.qtyInput}
        value={draft ?? String(value)}
        onChangeText={text => {
          const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
          setDraft(digits);
          const n = parseInt(digits, 10);
          if (Number.isFinite(n) && n >= 1) onChange(n);
        }}
        onBlur={() => setDraft(null)}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={3}
        accessibilityLabel={t('sharedLabels.copiesA11y')}
      />
      <TouchableOpacity
        style={s.qtyBtn}
        onPress={() => { setDraft(null); onChange(value + 1); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('sharedLabels.increaseCopiesA11y')}
      >
        <Text style={s.qtyBtnText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function LabelsScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const accentColor = user?.role === 'STORE_MANAGER' ? COLORS.managerPrimary : COLORS.secondary;
  const [showScanner, setShowScanner] = useState(false);
  const [showPriceCheck, setShowPriceCheck] = useState(false);
  const [manualStoreId, setManualStoreId] = useState<string | undefined>(undefined);
  // The "change price for my store" sheet, opened from a My Prints item.
  const [priceSheetItem, setPriceSheetItem] = useState<Label | null>(null);
  const [sheetPrice, setSheetPrice] = useState('');
  const [sheetExpiryDays, setSheetExpiryDays] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formDealText, setFormDealText] = useState('');
  const [formBarcode, setFormBarcode] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState('');
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  // Where the New Label form was opened from: only a scan keeps the camera
  // going after the label is saved.
  const createdViaRef = useRef<'scan' | 'search'>('scan');
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LabelPrintStatus | null>(null);
  const [showStorePicker, setShowStorePicker] = useState(false);
  // Browsing Store Catalog products that have no label yet (managers).
  const [productMode, setProductMode] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [showNameSugg, setShowNameSugg] = useState(false);
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [showCategoryFilter, setShowCategoryFilter] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const { height: screenHeight } = useWindowDimensions();

  // KeyboardAvoidingView's automatic height adjustment is unreliable inside
  // a React Native Modal on Android — this sheet is pinned to the bottom via
  // formOverlay's justifyContent, and KeyboardAvoidingView's 'height'
  // behavior doesn't consistently shrink it enough to clear the keyboard
  // when it's hosted in a Modal's separate native window. Tracking real
  // keyboard height directly and capping formSheet's maxHeight with it is a
  // safety net that works regardless of whether KeyboardAvoidingView's own
  // logic succeeds.
  useEffect(() => {
    const showEvent = Platform.OS === 'android' ? 'keyboardDidShow' : 'keyboardWillShow';
    const hideEvent = Platform.OS === 'android' ? 'keyboardDidHide' : 'keyboardWillHide';
    const showSub = Keyboard.addListener(showEvent, e => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    if (showForm) {
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    }
  }, [showForm]);

  useEffect(() => {
    if (!formCategory.trim()) { setCatSuggs([]); return; }
    const q = formCategory.toLowerCase();
    setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowCatSugg(true);
  }, [formCategory, approvedCats]);

  const [viewMode, setViewMode] = useState<'catalog' | 'cart'>('catalog');

  const { data: storesListData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });
  const allStores: any[] = storesListData?.data?.data || [];

  const resolvedStoreId = useCurrentStoreId(allStores, user?.storeIds);
  const storeId = manualStoreId ?? resolvedStoreId;

  // Which stores this person can switch between. Managers get their live list
  // from the server (every store when they have all-stores access); everyone
  // else is limited to the stores they're assigned to. GPS still picks the
  // starting store; this is for going somewhere else on purpose.
  const isManagerPlus = isStoreManagerOrAbove(user?.role);
  const { data: accessibleData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60 * 1000,
    enabled: isManagerPlus,
  });
  const switchableStores: { id: string; name: string; city?: string | null; address?: string | null }[] = isManagerPlus
    ? accessibleData?.data?.data ?? []
    : allStores.filter((st: any) => user?.storeIds?.includes(st.id));
  const canSwitchStore = switchableStores.length > 1;
  const currentStoreName: string | undefined =
    (switchableStores.find(st => st.id === storeId) ?? allStores.find((st: any) => st.id === storeId))?.name;

  // My Prints lists are kept per store, so the picker shows which other
  // stores have labels waiting.
  const allCarts = useLabelCart(s => s.carts);
  function cartCountFor(id: string): number {
    const key = cartKey(user?.id, id);
    return key ? Object.keys(allCarts[key] ?? {}).length : 0;
  }

  function switchStore(id: string) {
    setShowStorePicker(false);
    if (id === storeId) return;
    setManualStoreId(id);
    // Search and filters belong to the store you were just looking at.
    setSearch('');
    setCategoryFilter(null);
    setStatusFilter(null);
    setProductMode(false);
  }

  // Every catalog item, annotated with this store's own StoreLabel (if any)
  // when a store is known. Both tabs read from it: Catalog to browse, and My
  // Prints to resolve each cart entry to a live label at its current price.
  const {
    data: catalogData, isLoading: catalogLoading, isError: catalogIsError,
    isRefetching: catalogRefetching, refetch: refetchCatalog,
  } = useQuery({
    queryKey: ['mobile-labels', 'catalog-all', storeId],
    queryFn: () => labelsApi.getAllWithMyStore(storeId),
  });
  const allLabels: Label[] = catalogData?.data?.data || [];
  const labelsById = useMemo(() => new Map(allLabels.map(l => [l.id, l] as const)), [catalogData]);

  // My Prints is a personal cart kept on this phone (see utils/labelCart.ts),
  // one per user and store.
  const cartId = cartKey(user?.id, storeId);
  const cart = useLabelCart(s => (cartId ? s.carts[cartId] : undefined)) ?? EMPTY_CART;
  const cartRows = useMemo(() => resolveCartRows(cart, labelsById), [cart, labelsById]);
  const { copyCount, unpricedCount } = summarizeCart(cartRows);
  // Entries count straight from the cart so the tab badge is right even
  // before the catalog has loaded and the rows can be resolved.
  const cartSize = Object.keys(cart).length;

  // Drop cart entries whose label was deleted elsewhere. Only runs once the
  // catalog has actually loaded, so a slow or failed fetch can never empty
  // someone's cart.
  useEffect(() => {
    if (!cartId || !catalogData) return;
    useLabelCart.getState().prune(cartId, new Set(allLabels.map(l => l.id)));
  }, [cartId, catalogData]);

  // A search hitting zero results might still exist elsewhere in the shared
  // catalog (e.g. hidden behind a filter, or created by another store), so
  // check the unfiltered catalog before offering to create a new label, so
  // we never create a duplicate barcode.
  const searchTerm = search.trim();
  const isBarcodeLikeSearch = /^\d{4,}$/.test(searchTerm);
  const existingBarcodeMatch = isBarcodeLikeSearch
    ? allLabels.find(l => l.barcode === searchTerm)
    : undefined;

  function statusOf(l: Label): LabelPrintStatus {
    return l.myStoreLabel?.status ?? 'not_added';
  }

  const filteredCatalog = allLabels.filter(l => {
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter) {
      if (l.category !== categoryFilter) return false;
    }
    if (statusFilter && statusOf(l) !== statusFilter) return false;
    if (!searchTerm) return true;
    const q = searchTerm.toLowerCase();
    return l.productName.toLowerCase().includes(q) || (!!l.barcode && l.barcode.toLowerCase().includes(q));
  });

  // Filter chips reflect what's actually in the catalog, not a fixed list.
  const availableCategories = Array.from(
    new Set(allLabels.map(l => l.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = allLabels.some(l => !l.category);
  const statusCounts = allLabels.reduce<Partial<Record<LabelPrintStatus, number>>>((acc, l) => {
    const st = statusOf(l);
    acc[st] = (acc[st] ?? 0) + 1;
    return acc;
  }, {});
  const presentStatuses = STATUS_FILTER_ORDER.filter(st => (statusCounts[st] ?? 0) > 0);
  const needsReprintCount = statusCounts.needs_reprint ?? 0;
  const filtersActive = categoryFilter !== null || statusFilter !== null;

  // "Add all" works on whatever is currently shown. Anything without a price
  // is skipped: it couldn't be printed, and one blocking item in a bulk add
  // is more annoying than helpful.
  const shownNotInCart = filteredCatalog.filter(l => !cart[l.id]);
  const shownAddable = shownNotInCart.filter(l => printPriceFor(l) !== null);
  const shownInCart = filteredCatalog.length - shownNotInCart.length;

  // ── Products you already know but haven't labelled yet (managers) ────────────
  // The Store Catalog (the shared scan cache) knows every product anyone has
  // scanned, including ones that never got a shelf label. Making a label from
  // one should not mean scanning it again. The list endpoint is manager-only
  // on the server, so employees don't see this.
  const canBrowseProducts = isManagerPlus;

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(id);
  }, [searchTerm]);

  const debouncedBarcodeLike = /^\d{4,}$/.test(debouncedSearch);
  const productsWanted = canBrowseProducts && !!storeId && viewMode === 'catalog' && (productMode || debouncedSearch.length >= 2);

  const {
    data: productsData, isLoading: productsLoading, isError: productsIsError, refetch: refetchProducts,
  } = useQuery({
    queryKey: ['scanned-products', 'for-labels', debouncedSearch],
    queryFn: () => scannedProductApi.list(debouncedSearch ? { q: debouncedSearch } : undefined),
    enabled: productsWanted && !debouncedBarcodeLike,
    staleTime: 2 * 60 * 1000,
  });
  // A typed barcode isn't a name, so the name search can't find it: look that
  // one barcode up directly instead.
  const { data: barcodeProductData } = useQuery({
    queryKey: ['scanned-product-lookup', debouncedSearch],
    queryFn: () => scannedProductApi.lookup(debouncedSearch),
    enabled: productsWanted && debouncedBarcodeLike,
    retry: false,
    staleTime: 2 * 60 * 1000,
  });

  const labelledBarcodes = useMemo(
    () => new Set(allLabels.map(l => l.barcode).filter((b): b is string => !!b)),
    [catalogData],
  );
  const fetchedProducts: ScannedProduct[] = debouncedBarcodeLike
    ? (barcodeProductData?.data?.data ? [barcodeProductData.data.data] : [])
    : productsData?.data?.data ?? [];
  const unlabelledProducts = fetchedProducts.filter(p => !labelledBarcodes.has(p.barcode));
  const productsShown = productMode
    ? unlabelledProducts.filter(p =>
        categoryFilter === UNCATEGORIZED ? !p.category : categoryFilter ? p.category === categoryFilter : true)
    : unlabelledProducts;
  const productCategories = Array.from(
    new Set(unlabelledProducts.map(p => p.category).filter((c): c is string => !!c))
  ).sort();
  // The list endpoint returns at most 200, most scanned first; a search asks the server, so it isn't capped.
  const productsHitCap = !debouncedBarcodeLike && !debouncedSearch && fetchedProducts.length >= 200;

  // The filter panel serves both lists: labels filter by status and category,
  // products only by category.
  const filterCategories = productMode ? productCategories : availableCategories;
  const filterHasUncategorized = productMode ? unlabelledProducts.some(p => !p.category) : hasUncategorized;
  const filterStatuses = productMode ? [] : presentStatuses;

  const statusText = (st: LabelPrintStatus) => t(`sharedLabels.status_${st}`);
  const templateName = (value: string) => t(`sharedLabels.template_${value}`);
  const dateLocale = i18n.language === 'es' ? 'es-US' : 'en-US';

  function enterProductMode() {
    setProductMode(true);
    setSearch('');
    setCategoryFilter(null);
    setStatusFilter(null);
  }

  function leaveProductMode() {
    setProductMode(false);
    setSearch('');
    setCategoryFilter(null);
  }

  // Opens the New Label form already filled in from a known product, so all
  // that's left to type is the price.
  function openCreateFromProduct(p: ScannedProduct) {
    createdViaRef.current = 'search';
    setEditingLabel(null);
    setFormProductName(p.name.slice(0, 40));
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode(p.barcode);
    setFormCategory(p.category || '');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowForm(true);
  }


  // "Fill as you go": as the catalog grows, suggest matching product names
  // from labels the chain has already created — picking one auto-fills the
  // price too, so a repeat item takes one tap instead of full re-entry.
  // Only offered while creating (not editing) an existing label.
  const nameQuery = formProductName.trim().toLowerCase();
  const nameSuggestions = !editingLabel && nameQuery
    ? allLabels
        .filter(l => l.productName.toLowerCase().includes(nameQuery))
        .filter((l, i, arr) => arr.findIndex(x => x.productName.toLowerCase() === l.productName.toLowerCase()) === i)
        .slice(0, 6)
    : [];

  function applyNameSuggestion(label: Label) {
    setFormProductName(label.productName);
    setFormPriceText(label.priceText || '');
    setFormDealText(label.dealText || '');
    setShowNameSugg(false);
  }

  // ── My Prints (the cart) ─────────────────────────────────────────────────────

  // Tapping a catalog row adds it to My Prints, tapping again takes it out.
  // Adding is a phone-local change only: no server rows are created until
  // something is actually printed.
  function toggleCart(label: Label) {
    if (!cartId) return;
    const store = useLabelCart.getState();
    if (cart[label.id]) {
      store.remove(cartId, [label.id]);
      return;
    }
    store.add(cartId, [label.id]);
    // There's nothing to print without a price, so ask for one right away.
    if (printPriceFor(label) === null) openPriceSheet(label);
  }

  function addAllShown() {
    if (!cartId || shownAddable.length === 0) return;
    useLabelCart.getState().add(cartId, shownAddable.map(l => l.id));
    const skipped = shownNotInCart.length - shownAddable.length;
    Toast.show({
      type: 'success',
      text1: t('sharedLabels.addedToMyPrintsCount', { n: shownAddable.length }),
      text2: skipped > 0 ? t('sharedLabels.skippedNoPrice', { n: skipped }) : undefined,
    });
  }

  function removeAllShown() {
    if (!cartId) return;
    useLabelCart.getState().remove(cartId, filteredCatalog.filter(l => cart[l.id]).map(l => l.id));
  }

  function changeQuantity(labelId: string, qty: number) {
    if (cartId) useLabelCart.getState().setQuantity(cartId, labelId, qty);
  }

  function removeFromCart(labelId: string) {
    if (cartId) useLabelCart.getState().remove(cartId, [labelId]);
  }

  function confirmClearCart() {
    if (!cartId || cartSize === 0) return;
    Alert.alert(
      t('sharedLabels.clearCartTitle'),
      t('sharedLabels.clearCartBody', { count: cartSize }),
      [
        { text: t('sharedLabels.cancel'), style: 'cancel' },
        { text: t('sharedLabels.clear'), style: 'destructive', onPress: () => useLabelCart.getState().clear(cartId) },
      ]
    );
  }

  // ── Per-store price for one cart item ───────────────────────────────────────

  function openPriceSheet(label: Label) {
    const entry = cartId ? useLabelCart.getState().carts[cartId]?.[label.id] : undefined;
    setPriceSheetItem(label);
    setSheetPrice(entry?.customPrice ?? '');
    setSheetExpiryDays(entry?.customExpiryDays ?? null);
  }

  // The price is held on the cart item and only sent to the server when the
  // labels are actually printed.
  function confirmPriceSheet() {
    const price = sheetPrice.trim();
    if (!cartId || !priceSheetItem || !price) return;
    useLabelCart.getState().setPrice(cartId, priceSheetItem.id, price, sheetExpiryDays);
    setPriceSheetItem(null);
  }

  function resetPriceSheet() {
    if (!cartId || !priceSheetItem) return;
    useLabelCart.getState().setPrice(cartId, priceSheetItem.id, null, null);
    setPriceSheetItem(null);
  }

  // What this label prints at right now (this store's price, else the chain price), ignoring any price typed on the cart item.
  const sheetCurrentPrice = priceSheetItem ? printPriceFor(priceSheetItem) : null;
  const sheetHasCustomPrice = !!(priceSheetItem && cart[priceSheetItem.id]?.customPrice);

  // ── Scanning straight into My Prints ────────────────────────────────────────

  // Kept in a ref so the scanner's delayed callback always sees the latest
  // catalog, never a stale render's copy of it.
  const allLabelsRef = useRef<Label[]>([]);
  allLabelsRef.current = allLabels;

  // The scanner calls this for every confirmed barcode. A label we already
  // have goes straight into My Prints (a second scan of the same item adds
  // one more copy) without leaving the camera; anything else falls through to
  // the scanner's normal lookup-and-name flow, which ends in the New Label form.
  function handleKnownBarcode(barcode: string): string | null {
    if (!cartId) return null;
    const label = allLabelsRef.current.find(l => l.barcode === barcode);
    if (!label) return null;
    const qty = useLabelCart.getState().addOrBump(cartId, label.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    if (qty > 1) return t('sharedLabels.flashCopies', { name: label.productName, n: qty });
    return printPriceFor(label) === null
      ? t('sharedLabels.flashAddedNeedsPrice', { name: label.productName })
      : t('sharedLabels.flashAdded', { name: label.productName });
  }

  function openCreateForm(scanned: BarcodeResult) {
    const existing = allLabels.find(l => l.barcode && l.barcode === scanned.barcode);
    if (existing) {
      if (cartId) {
        // A label the scanner's own hook didn't catch (say the catalog was
        // still loading): put it in My Prints and keep scanning, rather than
        // dropping into an edit form. The scanner is only reopened after a
        // beat so it has really closed first.
        const message = handleKnownBarcode(scanned.barcode);
        Toast.show({ type: 'success', text1: message ?? t('sharedLabels.toastAddedToMyPrints') });
        setTimeout(() => setShowScanner(true), 350);
      } else if (isManagerPlus) {
        openEditForm(existing);
      } else {
        // A cashier scanning a barcode that is already in the chain-wide catalog, with no cart open to add
        // it to: say so, never open the chain-wide edit form - only a manager or HQ edits the shared item.
        Toast.show({ type: 'info', text1: t('sharedLabels.toastAlreadyInCatalog', { name: existing.productName }) });
        setTimeout(() => setShowScanner(true), 350);
      }
      return;
    }
    createdViaRef.current = 'scan';
    setEditingLabel(null);
    setFormProductName(scanned.name);
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode(scanned.barcode);
    setFormCategory(scanned.category || '');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowForm(true);
  }

  // Used when a search for a barcode/name comes up empty everywhere in the
  // catalog — skips the dedupe lookup above since we already know there's
  // no match, and pre-fills whichever field the search term looks like.
  function openQuickAddFromSearch() {
    const term = searchTerm;
    if (!term) return;
    createdViaRef.current = 'search';
    setEditingLabel(null);
    setFormProductName(isBarcodeLikeSearch ? '' : term);
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode(isBarcodeLikeSearch ? term : null);
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowForm(true);
    setSearch('');
    // A barcode the Store Catalog already knows brings its name and category
    // along (any role can look a barcode up), so only the price is left to type.
    if (isBarcodeLikeSearch) {
      scannedProductApi.lookup(term)
        .then(r => {
          const p = r.data?.data;
          if (!p?.name) return;
          setFormProductName(cur => cur || String(p.name).slice(0, 40));
          setFormCategory(cur => cur || p.category || '');
        })
        .catch(() => {});
    }
  }

  function openEditForm(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText || '');
    setFormDealText(label.dealText || '');
    setFormBarcode(label.barcode);
    setFormCategory(label.category || '');
    setFormTemplate(label.template);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode(null);
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
  }

  async function handleSave() {
    const productName = formProductName.trim();
    const priceText = formPriceText.trim();
    const dealText = formDealText.trim() || null;
    const barcode = formBarcode?.trim() || null;
    const category = formCategory.trim() || null;
    const wasCreate = !editingLabel;
    if (!productName || !priceText || saving) return;
    setSaving(true);
    // Silently submit a brand-new category for DevAdmin approval — same
    // pipeline BarcodeScannerModal/Order List/Stock Request already feed.
    if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
      orderCategoriesApi.submitNew(category).catch(() => {});
    }
    try {
      let createdId: string | null = null;
      if (editingLabel) {
        await labelsApi.update(editingLabel.id, { productName, priceText, dealText, barcode, category, template: formTemplate });
      } else {
        const res = await labelsApi.create({ productName, priceText, dealText, barcode, category, template: formTemplate, storeId });
        createdId = res.data?.data?.id ?? null;
      }
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      // Whoever just made a label wants to print it, so it goes straight into
      // My Prints. Added only after the catalog refetch above has landed, so
      // the cart's cleanup can't mistake the brand-new label for a deleted one.
      const addedToCart = !!(createdId && cartId);
      if (createdId && cartId) useLabelCart.getState().add(cartId, [createdId]);
      Toast.show({ type: 'success', text1: editingLabel ? t('sharedLabels.toastLabelUpdated') : addedToCart ? t('sharedLabels.toastAddedToMyPrints') : t('sharedLabels.toastLabelAdded') });
      closeForm();
      // Creating from a scan drops straight back into scanning so a shelf can
      // be worked without re-tapping "Scan" for every item. Tap the
      // scanner's X to stop.
      if (wasCreate && createdViaRef.current === 'scan') setShowScanner(true);
    } catch (err: any) {
      const body = err.response?.data;
      // A new label whose barcode is already a real item this phone had not loaded yet (someone else made it a moment ago):
      // that item is what the person wants, so it goes into My Prints instead of ending on an error.
      const existingId: string | undefined = body?.data?.existingId;
      if (wasCreate && body?.code === 'BARCODE_TAKEN' && existingId && cartId) {
        await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
        useLabelCart.getState().add(cartId, [existingId]);
        Toast.show({ type: 'info', text1: t('sharedLabels.toastExistingAddedToMyPrints', { name: body.data.existingName ?? productName }) });
        closeForm();
        if (createdViaRef.current === 'scan') setShowScanner(true);
        return;
      }
      const e = body?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : t('sharedLabels.toastSaveFailed') });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!editingLabel) return;
    Alert.alert(
      t('sharedLabels.deleteTitle'),
      t('sharedLabels.deleteBody', { name: editingLabel.productName }),
      [
        { text: t('sharedLabels.cancel'), style: 'cancel' },
        { text: t('sharedLabels.delete'), style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    if (!editingLabel) return;
    setSaving(true);
    try {
      await labelsApi.delete(editingLabel.id);
      const deletedId = editingLabel.id;
      if (cartId) useLabelCart.getState().remove(cartId, [deletedId]);
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      Toast.show({ type: 'success', text1: t('sharedLabels.toastLabelRemoved') });
      closeForm();
    } catch (err: any) {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : t('sharedLabels.toastRemoveFailed') });
    } finally {
      setSaving(false);
    }
  }

  // Makes sure this store has its own row for a printed label, returning that
  // row's id so it can be stamped printed. A row that already exists is left
  // alone (re-adding it with no price would wipe its override) unless a price
  // was typed on the cart item, in which case that price is applied.
  async function ensureStoreRow(row: CartRow<Label>): Promise<string> {
    const { label, entry } = row;
    const expiresAt = entry.customPrice && entry.customExpiryDays
      ? new Date(Date.now() + entry.customExpiryDays * 86400000).toISOString()
      : null;
    const existing = label.myStoreLabel;
    if (existing) {
      if (entry.customPrice) await labelsApi.updateStoreLabel(existing.id, entry.customPrice, expiresAt);
      return existing.id;
    }
    const res = await labelsApi.addToStore(label.id, storeId!, entry.customPrice, expiresAt);
    return res.data.data.id;
  }

  // Prints exactly what's in My Prints. The store rows and "printed" stamps
  // are only written AFTER the print/PDF actually succeeded, so cancelling
  // the system print dialog leaves both the list and the server untouched.
  async function handlePrint(shareAsPdf: boolean) {
    if (!cartId || !storeId || printing || cartRows.length === 0 || unpricedCount > 0) return;
    setPrinting(true);
    try {
      const rows = cartRows;
      const entries: PrintableLabelEntry[] = rows.map(r => ({
        label: {
          // printPrice is non-null for every row: unpricedCount > 0 returned above.
          id: r.label.id, productName: r.label.productName, priceText: r.printPrice!,
          dealText: r.label.dealText, barcode: r.label.barcode, template: r.label.template,
        },
        quantity: r.entry.quantity,
      }));
      await printLabels({ entries, shareAsPdf });

      const outcomes = await runPool(rows, STORE_ROW_CONCURRENCY, ensureStoreRow);
      const stamp: { storeLabelId: string; quantity: number }[] = [];
      let unrecorded = 0;
      outcomes.forEach((o, i) => {
        if (o.status === 'fulfilled') stamp.push({ storeLabelId: o.value, quantity: rows[i].entry.quantity });
        else unrecorded++;
      });
      if (stamp.length > 0) {
        try {
          await labelsApi.print(stamp);
        } catch {
          unrecorded += stamp.length;
        }
      }

      // They're on paper now, so they leave the list either way; a failed
      // status update shouldn't tempt anyone into printing them twice.
      useLabelCart.getState().remove(cartId, rows.map(r => r.label.id));
      await qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] });
      if (unrecorded > 0) {
        Toast.show({ type: 'error', text1: t('sharedLabels.printedButUnrecorded', { count: unrecorded }), text2: t('sharedLabels.pullToRefreshCheck') });
      } else {
        Toast.show({ type: 'success', text1: shareAsPdf ? t('sharedLabels.pdfReady') : t('sharedLabels.sentToPrinter'), text2: t('sharedLabels.labelCount', { count: copyCount }) });
      }
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? t('sharedLabels.exportFailed') : t('sharedLabels.printFailed'), text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <SafeAreaView style={s.fill} edges={['top']}>
      <BarcodeScannerModal
        visible={showScanner}
        hideQuantity
        confirmLabel={t('sharedLabels.scannerContinue')}
        onClose={() => setShowScanner(false)}
        onResult={(result) => { setShowScanner(false); openCreateForm(result); }}
        onKnownBarcode={handleKnownBarcode}
      />

      {!!storeId && (
        <PriceCheckModal
          visible={showPriceCheck}
          onClose={() => setShowPriceCheck(false)}
          storeId={storeId}
        />
      )}

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={s.formOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[s.formSheet, keyboardHeight > 0 && { maxHeight: screenHeight - keyboardHeight - 24 }]}
          >
            <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
              <View style={s.formHeader}>
                <Text style={s.formTitle}>{editingLabel ? t('sharedLabels.formEditTitle') : t('sharedLabels.formNewTitle')}</Text>
                <TouchableOpacity onPress={closeForm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('sharedLabels.closeA11y')}>
                  <XIcon size={20} color={COLORS.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>{t('sharedLabels.fieldProductName')}</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={s.fieldInput}
                  value={formProductName}
                  onChangeText={text => { setFormProductName(text); setShowNameSugg(true); }}
                  onFocus={() => setShowNameSugg(nameSuggestions.length > 0)}
                  onBlur={() => setTimeout(() => setShowNameSugg(false), 130)}
                  placeholder={t('sharedLabels.productNamePlaceholder')}
                  placeholderTextColor="#B0B8C4"
                  maxLength={40}
                />
                {showNameSugg && nameSuggestions.length > 0 && (
                  <View style={s.nameSugg}>
                    {nameSuggestions.map(l => (
                      <TouchableOpacity
                        key={l.id}
                        style={s.nameSuggRow}
                        onPress={() => applyNameSuggestion(l)}
                        accessibilityRole="button"
                        accessibilityLabel={t('sharedLabels.useSuggestionA11y', { name: l.productName, price: l.priceText }) + (l.dealText ? ', ' + l.dealText : '')}
                      >
                        <Text style={s.nameSuggText} numberOfLines={1}>{l.productName}</Text>
                        <Text style={s.nameSuggPrice}>${l.priceText}{l.dealText ? ` · ${l.dealText}` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t('sharedLabels.fieldPrice')}</Text>
              <View style={s.priceInputWrap}>
                <Text style={s.priceInputDollar}>$</Text>
                <TextInput
                  style={[s.fieldInput, s.priceInput]}
                  value={formPriceText}
                  onChangeText={text => setFormPriceText(text.replace(/[^0-9.]/g, ''))}
                  placeholder="3.99"
                  placeholderTextColor="#B0B8C4"
                  keyboardType="decimal-pad"
                  maxLength={7}
                />
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t('sharedLabels.fieldDeal')}</Text>
              <TextInput
                style={s.fieldInput}
                value={formDealText}
                onChangeText={setFormDealText}
                placeholder={t('sharedLabels.dealPlaceholder')}
                placeholderTextColor="#B0B8C4"
                maxLength={20}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t('sharedLabels.fieldBarcode')}</Text>
              <TextInput
                style={s.fieldInput}
                value={formBarcode || ''}
                onChangeText={text => setFormBarcode(text)}
                placeholder={t('sharedLabels.barcodePlaceholder')}
                placeholderTextColor="#B0B8C4"
                maxLength={40}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t('sharedLabels.fieldCategory')}</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={s.fieldInput}
                  value={formCategory}
                  onChangeText={text => { setFormCategory(text); setShowCatSugg(true); }}
                  onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
                  placeholder={t('sharedLabels.categoryPlaceholder')}
                  placeholderTextColor="#B0B8C4"
                  maxLength={100}
                />
                {showCatSugg && catSuggs.length > 0 && (
                  <View style={s.nameSugg}>
                    {catSuggs.map(c => (
                      <TouchableOpacity
                        key={c}
                        style={s.nameSuggRow}
                        onPress={() => { setFormCategory(c); setShowCatSugg(false); }}
                        accessibilityRole="button"
                        accessibilityLabel={t('sharedLabels.useCategoryA11y', { category: c })}
                      >
                        <Text style={s.nameSuggText}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t('sharedLabels.fieldTemplate')}</Text>
              <View style={s.templateRow}>
                {TEMPLATES.map(tpl => (
                  <TouchableOpacity
                    key={tpl.value}
                    style={[s.templateChip, formTemplate === tpl.value && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
                    onPress={() => setFormTemplate(tpl.value)}
                    accessibilityRole="button"
                    accessibilityLabel={t('sharedLabels.useTemplateA11y', { name: templateName(tpl.value) })}
                  >
                    <View style={[s.templateSwatch, { backgroundColor: tpl.color }]} />
                    <Text style={s.templateChipText}>{templateName(tpl.value)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: accentColor }, (!formProductName.trim() || !formPriceText.trim() || saving) && s.saveBtnDim]}
                onPress={handleSave}
                disabled={!formProductName.trim() || !formPriceText.trim() || saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('sharedLabels.saveLabelA11y')}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{editingLabel ? t('sharedLabels.saveChanges') : t('sharedLabels.addLabel')}</Text>}
              </TouchableOpacity>

              {editingLabel && (
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={confirmDelete}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.deleteLabelA11y')}
                >
                  <Text style={s.deleteBtnText}>{t('sharedLabels.deleteLabel')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!priceSheetItem} animationType="fade" transparent onRequestClose={() => setPriceSheetItem(null)}>
        <View style={s.addSheetOverlay}>
          {/* Same keyboardHeight safety net as the main form sheet above —
              this card has no maxHeight cap of its own, and on a small phone
              the keyboard would otherwise cover the Confirm button. */}
          <View style={[s.addSheetCard, keyboardHeight > 0 && { maxHeight: screenHeight - keyboardHeight - 48 }]}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.formTitle}>{priceSheetItem?.productName}</Text>
              <Text style={s.addSheetSub}>
                {sheetCurrentPrice != null ? t('sharedLabels.currentPrice', { price: sheetCurrentPrice }) : t('sharedLabels.noPriceEnterBelow')}
              </Text>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>{t('sharedLabels.priceForMyStore')}</Text>
              <View style={s.priceInputWrap}>
                <Text style={s.priceInputDollar}>$</Text>
                <TextInput
                  style={[s.fieldInput, s.priceInput]}
                  value={sheetPrice}
                  onChangeText={text => setSheetPrice(text.replace(/[^0-9.]/g, ''))}
                  placeholder={sheetCurrentPrice ?? '0.00'}
                  placeholderTextColor="#B0B8C4"
                  keyboardType="decimal-pad"
                  maxLength={7}
                  autoFocus
                />
              </View>

              <Text style={[s.fieldLabel, { marginTop: 14 }]}>{t('sharedLabels.endsLabel')} <Text style={s.fieldLabelSub}>{t('sharedLabels.endsHint')}</Text></Text>
              <View style={s.expiryChipRow}>
                {([
                  { key: 'expiry_none', days: null },
                  { key: 'expiry_3d', days: 3 },
                  { key: 'expiry_1w', days: 7 },
                  { key: 'expiry_2w', days: 14 },
                  { key: 'expiry_1m', days: 30 },
                ] as const).map(opt => {
                  const active = sheetExpiryDays === opt.days;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[s.expiryChip, active && { backgroundColor: accentColor, borderColor: accentColor }]}
                      onPress={() => setSheetExpiryDays(opt.days)}
                      accessibilityRole="button"
                      accessibilityLabel={t(`sharedLabels.${opt.key}`)}
                    >
                      <Text style={[s.expiryChipText, active && { color: '#fff' }]}>{t(`sharedLabels.${opt.key}`)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: accentColor, marginTop: 16 }, !sheetPrice.trim() && s.saveBtnDim]}
                onPress={confirmPriceSheet}
                disabled={!sheetPrice.trim()}
                accessibilityRole="button"
                accessibilityLabel={t('sharedLabels.usePriceA11y')}
              >
                <Text style={s.saveBtnText}>{t('sharedLabels.usePrice', { price: sheetPrice || '0.00' })}</Text>
              </TouchableOpacity>

              {sheetHasCustomPrice && sheetCurrentPrice != null && (
                <TouchableOpacity
                  style={{ marginTop: 12, alignItems: 'center' }}
                  onPress={resetPriceSheet}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.goBackA11y')}
                >
                  <Text style={{ color: accentColor, fontWeight: '700', fontSize: 14 }}>{t('sharedLabels.goBackTo', { price: sheetCurrentPrice })}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => setPriceSheetItem(null)} accessibilityRole="button" accessibilityLabel={t('sharedLabels.cancel')}>
                <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>{t('sharedLabels.cancel')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showStorePicker} animationType="slide" transparent onRequestClose={() => setShowStorePicker(false)}>
        <View style={s.formOverlay}>
          <View style={[s.formSheet, { paddingBottom: 24 }]}>
            <View style={[s.formHeader, { paddingHorizontal: 20, paddingTop: 20, marginBottom: 6 }]}>
              <Text style={s.formTitle}>{t('sharedLabels.storePickerTitle')}</Text>
              <TouchableOpacity
                onPress={() => setShowStorePicker(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t('sharedLabels.closeA11y')}
              >
                <XIcon size={20} color={COLORS.textMuted} strokeWidth={2.5} />
              </TouchableOpacity>
            </View>
            <Text style={s.storePickerHint}>{t('sharedLabels.storePickerHint')}</Text>
            <ScrollView style={{ maxHeight: screenHeight * 0.55 }} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 8 }}>
              {(switchableStores.length > 0 ? switchableStores : allStores).map((st: any) => {
                const selected = st.id === storeId;
                const waiting = cartCountFor(st.id);
                return (
                  <TouchableOpacity
                    key={st.id}
                    style={[s.storeRow, selected && { borderColor: accentColor, backgroundColor: '#F6FAFF' }]}
                    onPress={() => switchStore(st.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={t('sharedLabels.useStoreA11y', { name: st.name })}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.storeRowName}>{st.name}</Text>
                      {!!(st.city || st.address) && <Text style={s.storeRowSub} numberOfLines={1}>{st.city || st.address}</Text>}
                    </View>
                    {waiting > 0 && (
                      <View style={s.storeRowBadge}>
                        <Text style={s.storeRowBadgeText}>{t('sharedLabels.storeToPrint', { n: waiting })}</Text>
                      </View>
                    )}
                    {selected && <CheckCircleIcon size={20} color={accentColor} strokeWidth={2.25} />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <View style={[s.header, s.headerRow]}>
        <Text style={s.headerTitle}>{t('sharedLabels.headerTitle')}</Text>
        {!!storeId && (
          <TouchableOpacity
            style={[s.priceCheckBtn, { borderColor: accentColor }]}
            onPress={() => setShowPriceCheck(true)}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.priceCheckA11y')}
          >
            <DollarSignIcon size={16} color={accentColor} strokeWidth={2.25} />
            <Text style={[s.priceCheckBtnText, { color: accentColor }]}>{t('sharedLabels.priceCheck')}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Only shown when there's a real choice to make: staff at a single
          store never see it. */}
      {(canSwitchStore || !storeId) && (
        <TouchableOpacity
          style={[s.storeSelector, !storeId && { borderColor: accentColor }]}
          onPress={() => setShowStorePicker(true)}
          accessibilityRole="button"
          accessibilityLabel={t('sharedLabels.storeSelectorA11y', { store: currentStoreName ?? t('sharedLabels.chooseStore') })}
        >
          <MapPinIcon size={15} color={accentColor} strokeWidth={2.25} />
          <Text style={s.storeSelectorText} numberOfLines={1}>{currentStoreName ?? t('sharedLabels.chooseStore')}</Text>
          <ChevronDownIcon size={16} color={COLORS.textMuted} strokeWidth={2.25} />
        </TouchableOpacity>
      )}

      {/* Browse the catalog, then check the cart. The cart count stays visible
          on both tabs so it's always clear what's about to be printed. */}
      <View style={s.viewToggleRow}>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'catalog' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('catalog')}
          accessibilityRole="button"
          accessibilityLabel={t('sharedLabels.browseCatalogA11y')}
        >
          <Text style={s.viewToggleText}>{t('sharedLabels.tabCatalog')}{catalogData ? ` · ${allLabels.length}` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            s.viewToggleChip,
            viewMode === 'cart' && { borderColor: accentColor, backgroundColor: '#eff6ff' },
            viewMode !== 'cart' && cartSize > 0 && { borderColor: accentColor },
          ]}
          onPress={() => setViewMode('cart')}
          accessibilityRole="button"
          accessibilityLabel={t('sharedLabels.myPrintsTabA11y', { count: cartSize })}
        >
          <Text style={s.viewToggleText}>{t('sharedLabels.tabMyPrints')}{cartSize > 0 ? ` · ${cartSize}` : ''}</Text>
        </TouchableOpacity>
      </View>

      {!!storeId && viewMode === 'catalog' && (allLabels.length > 0 || productMode) && (
        <View style={s.toolbarRow}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder={t('sharedLabels.searchPlaceholder')}
            placeholderTextColor="#B0B8C4"
          />
          {(filterCategories.length > 0 || filterHasUncategorized || filterStatuses.length > 1) && (
            <TouchableOpacity
              style={[s.filterIconBtn, (showCategoryFilter || filtersActive) && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
              onPress={() => setShowCategoryFilter(v => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showCategoryFilter }}
              accessibilityLabel={filtersActive ? t('sharedLabels.filtersActiveA11y') : t('sharedLabels.filtersA11y')}
            >
              <FilterIcon size={16} color={showCategoryFilter || filtersActive ? accentColor : COLORS.textMuted} strokeWidth={2.25} />
              {filtersActive && <View style={[s.filterActiveDot, { backgroundColor: accentColor }]} />}
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!storeId && viewMode === 'catalog' && (allLabels.length > 0 || productMode) && showCategoryFilter && (
        <>
          {filterStatuses.length > 1 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryFilterRow}>
              {filterStatuses.map(st => (
                <TouchableOpacity
                  key={st}
                  style={[s.categoryChip, statusFilter === st && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
                  onPress={() => setStatusFilter(statusFilter === st ? null : st)}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.showStatusA11y', { status: statusText(st) })}
                >
                  <Text style={s.categoryChipText}>{statusText(st)} · {statusCounts[st]}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
          {(filterCategories.length > 0 || filterHasUncategorized) && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryFilterRow}>
              <TouchableOpacity
                style={[s.categoryChip, categoryFilter === null && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
                onPress={() => setCategoryFilter(null)}
                accessibilityRole="button"
                accessibilityLabel={t('sharedLabels.categoryAllA11y')}
              >
                <Text style={s.categoryChipText}>{t('sharedLabels.categoryAll')}</Text>
              </TouchableOpacity>
              {filterCategories.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.categoryChip, categoryFilter === c && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
                  onPress={() => setCategoryFilter(categoryFilter === c ? null : c)}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.filterByCategoryA11y', { category: c })}
                >
                  <Text style={s.categoryChipText}>{c}</Text>
                </TouchableOpacity>
              ))}
              {filterHasUncategorized && (
                <TouchableOpacity
                  style={[s.categoryChip, categoryFilter === UNCATEGORIZED && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
                  onPress={() => setCategoryFilter(categoryFilter === UNCATEGORIZED ? null : UNCATEGORIZED)}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.uncategorizedA11y')}
                >
                  <Text style={s.categoryChipText}>{t('sharedLabels.uncategorized')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </>
      )}

      {/* Labels that need a fresh print are the most likely thing to be
          shopping for, so they get a one-tap way in without opening filters. */}
      {!!storeId && viewMode === 'catalog' && !productMode && needsReprintCount > 0 && statusFilter === null && (
        <TouchableOpacity
          style={s.reprintBanner}
          onPress={() => setStatusFilter('needs_reprint')}
          accessibilityRole="button"
          accessibilityLabel={t('sharedLabels.reprintBannerA11y', { count: needsReprintCount })}
        >
          <AlertTriangleIcon size={15} color="#B7791F" strokeWidth={2.25} />
          <Text style={s.reprintBannerText}>{t('sharedLabels.reprintBanner', { count: needsReprintCount })}</Text>
          <Text style={[s.reprintBannerAction, { color: accentColor }]}>{t('sharedLabels.show')}</Text>
        </TouchableOpacity>
      )}

      {!!storeId && viewMode === 'catalog' && !productMode && filteredCatalog.length > 0 && (
        <View style={s.addAllBar}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={s.addAllText}>
              {t('sharedLabels.shownCount', { n: filteredCatalog.length })}{shownInCart > 0 ? ` · ${t('sharedLabels.shownInMyPrints', { n: shownInCart })}` : ''}
            </Text>
            {filtersActive && (
              <TouchableOpacity
                onPress={() => { setStatusFilter(null); setCategoryFilter(null); }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={t('sharedLabels.clearFilters')}
              >
                <Text style={[s.addAllClear, { color: accentColor }]}>{t('sharedLabels.clearFilters')}</Text>
              </TouchableOpacity>
            )}
          </View>
          {shownAddable.length > 0 ? (
            <TouchableOpacity
              style={[s.addAllBtn, { borderColor: accentColor }]}
              onPress={addAllShown}
              accessibilityRole="button"
              accessibilityLabel={t('sharedLabels.addAllA11y', { n: shownAddable.length })}
            >
              <PlusIcon size={13} color={accentColor} strokeWidth={2.75} />
              <Text style={[s.addAllBtnText, { color: accentColor }]}>{t('sharedLabels.addAll', { n: shownAddable.length })}</Text>
            </TouchableOpacity>
          ) : shownInCart > 0 ? (
            <TouchableOpacity
              style={[s.addAllBtn, { borderColor: COLORS.border }]}
              onPress={removeAllShown}
              accessibilityRole="button"
              accessibilityLabel={t('sharedLabels.removeAllShownA11y')}
            >
              <Text style={[s.addAllBtnText, { color: COLORS.textMuted }]}>{t('sharedLabels.removeAllShown')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}

      {/* Managers can label a product the Store Catalog already knows without
          scanning it again. */}
      {!!storeId && viewMode === 'catalog' && canBrowseProducts && (
        productMode ? (
          <View style={s.productsHeader}>
            <View style={{ flex: 1 }}>
              <Text style={s.productsHeaderTitle}>{t('sharedLabels.productsTitle')}</Text>
              <Text style={s.productsHeaderHint}>{t('sharedLabels.productsHint')}</Text>
            </View>
            <TouchableOpacity
              onPress={leaveProductMode}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel={t('sharedLabels.backToLabels')}
            >
              <Text style={[s.addAllClear, { color: accentColor }]}>{t('sharedLabels.backToLabels')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={s.productsLink}
            onPress={enterProductMode}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.browseProductsLink')}
          >
            <Text style={[s.productsLinkText, { color: accentColor }]}>{t('sharedLabels.browseProductsLink')}</Text>
            <ChevronRightIcon size={14} color={accentColor} strokeWidth={2.5} />
          </TouchableOpacity>
        )
      )}

      {viewMode === 'cart' && !!storeId && cartSize > 0 && (
        <View style={s.cartSummaryRow}>
          <Text style={s.cartSummaryText}>
            {t('sharedLabels.labelCount', { count: cartRows.length })} · {t('sharedLabels.copyCount', { count: copyCount })}
          </Text>
          <TouchableOpacity
            onPress={confirmClearCart}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.clearCartA11y')}
          >
            <Text style={s.cartClearText}>{t('sharedLabels.clearAll')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === 'cart' && !!storeId && unpricedCount > 0 && (
        <View style={s.needsPriceBanner}>
          <AlertTriangleIcon size={15} color={COLORS.danger} strokeWidth={2.25} />
          <Text style={s.needsPriceBannerText}>{t('sharedLabels.needsPriceBanner', { count: unpricedCount })}</Text>
        </View>
      )}

      {!storeId ? (
        <View style={s.center}>
          <MapPinIcon size={44} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptySub}>{t('sharedLabels.chooseStoreEmpty')}</Text>
        </View>
      ) : viewMode === 'catalog' ? (
        productMode ? (
          productsLoading && !debouncedBarcodeLike ? (
            <View style={s.center}><ActivityIndicator color={accentColor} /></View>
          ) : productsIsError ? (
            <ErrorState message={t('sharedLabels.productsLoadError')} onRetry={() => refetchProducts()} />
          ) : productsShown.length === 0 ? (
            <View style={s.center}>
              <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
              <Text style={s.emptySub}>{searchTerm || filtersActive ? t('sharedLabels.productsNoMatches') : t('sharedLabels.productsEmpty')}</Text>
            </View>
          ) : (
            <FlatList
              data={productsShown}
              keyExtractor={p => p.id}
              contentContainerStyle={s.list}
              keyboardShouldPersistTaps="handled"
              ListFooterComponent={productsHitCap ? <Text style={s.productsCapNote}>{t('sharedLabels.productsCapNote')}</Text> : null}
              renderItem={({ item }) => renderProductCard(item)}
            />
          )
        ) : catalogLoading ? (
          <View style={s.center}>
            <ActivityIndicator color={accentColor} />
          </View>
        ) : catalogIsError ? (
          <ErrorState message={t('sharedLabels.loadError')} onRetry={() => refetchCatalog()} />
        ) : filteredCatalog.length === 0 ? (
          <ScrollView contentContainerStyle={s.centerScroll} keyboardShouldPersistTaps="handled">
            <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
            <Text style={s.emptyTitle}>{filtersActive && !searchTerm ? t('sharedLabels.nothingHere') : t('sharedLabels.noMatches')}</Text>
            {renderProductSuggestions()}
            {existingBarcodeMatch ? (
              <>
                <Text style={s.emptySub}>{t('sharedLabels.barcodeAlreadyInCatalog')}</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={() => { const match = existingBarcodeMatch; setSearch(''); openEditForm(match); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.openLabelA11y', { name: existingBarcodeMatch.productName })}
                >
                  <Text style={s.quickAddBtnText}>{t('sharedLabels.openLabel', { name: existingBarcodeMatch.productName })}</Text>
                </TouchableOpacity>
              </>
            ) : searchTerm ? (
              <>
                <Text style={s.emptySub}>{t('sharedLabels.tryDifferent')}</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={openQuickAddFromSearch}
                  accessibilityRole="button"
                  accessibilityLabel={isBarcodeLikeSearch ? t('sharedLabels.addBarcodeAsNewA11y', { term: searchTerm }) : t('sharedLabels.addNameAsNewA11y', { term: searchTerm })}
                >
                  <Text style={s.quickAddBtnText}>
                    {isBarcodeLikeSearch ? t('sharedLabels.addBarcodeAsNew', { term: searchTerm }) : t('sharedLabels.addNameAsNew', { term: searchTerm })}
                  </Text>
                </TouchableOpacity>
              </>
            ) : filtersActive ? (
              <>
                <Text style={s.emptySub}>{t('sharedLabels.noLabelsMatchFilters')}</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={() => { setStatusFilter(null); setCategoryFilter(null); }}
                  accessibilityRole="button"
                  accessibilityLabel={t('sharedLabels.clearFilters')}
                >
                  <Text style={s.quickAddBtnText}>{t('sharedLabels.clearFilters')}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.emptySub}>{t('sharedLabels.noLabelsYet')}</Text>
            )}
          </ScrollView>
        ) : (
          <FlatList
            data={filteredCatalog}
            extraData={cart}
            keyExtractor={l => l.id}
            contentContainerStyle={s.list}
            refreshing={catalogRefetching}
            onRefresh={refetchCatalog}
            keyboardShouldPersistTaps="handled"
            ListFooterComponent={renderProductSuggestions()}
            renderItem={({ item }) => renderCatalogCard(item)}
          />
        )
      ) : cartSize === 0 ? (
        <View style={s.center}>
          <ShoppingBagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>{t('sharedLabels.cartEmptyTitle')}</Text>
          <Text style={s.emptySub}>{t('sharedLabels.cartEmptyBody')}</Text>
          <TouchableOpacity
            style={[s.quickAddBtn, { backgroundColor: accentColor }]}
            onPress={() => setViewMode('catalog')}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.browseCatalogBtnA11y')}
          >
            <Text style={s.quickAddBtnText}>{t('sharedLabels.browseCatalog')}</Text>
          </TouchableOpacity>
        </View>
      ) : catalogLoading && !catalogData ? (
        <View style={s.center}><ActivityIndicator color={accentColor} size="large" /></View>
      ) : catalogIsError && !catalogData ? (
        <ErrorState message={t('sharedLabels.cartLoadError')} onRetry={() => refetchCatalog()} />
      ) : (
        <FlatList
          data={cartRows}
          keyExtractor={r => r.entry.labelId}
          contentContainerStyle={s.list}
          refreshing={catalogRefetching}
          onRefresh={refetchCatalog}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => renderCartCard(item)}
        />
      )}

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.scanBtn, { backgroundColor: accentColor }, !storeId && s.printBtnDim]}
          onPress={() => setShowScanner(true)}
          disabled={!storeId}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('sharedLabels.scanA11y')}
        >
          <CameraIcon size={18} color="#fff" strokeWidth={2.5} />
          <Text style={s.scanBtnText}>{t('sharedLabels.scan')}</Text>
        </TouchableOpacity>
        {viewMode === 'catalog' ? (
          <TouchableOpacity
            style={[s.printBtn, { backgroundColor: accentColor, flex: 1.6 }]}
            onPress={() => setViewMode('cart')}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.openMyPrintsA11y', { count: cartSize })}
          >
            <Text style={s.printBtnText}>{cartSize > 0 ? t('sharedLabels.myPrintsBtnCount', { n: cartSize }) : t('sharedLabels.myPrintsBtn')}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[s.printBtn, { backgroundColor: accentColor }, (cartRows.length === 0 || unpricedCount > 0 || printing) && s.printBtnDim]}
              onPress={() => handlePrint(false)}
              disabled={cartRows.length === 0 || unpricedCount > 0 || printing}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('sharedLabels.printA11y', { count: copyCount })}
            >
              {printing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.printBtnText}>{t('sharedLabels.printBtn', { n: copyCount })}</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.shareBtn, { borderColor: accentColor }, (cartRows.length === 0 || unpricedCount > 0 || printing) && s.printBtnDim]}
              onPress={() => handlePrint(true)}
              disabled={cartRows.length === 0 || unpricedCount > 0 || printing}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('sharedLabels.pdfA11y', { count: copyCount })}
            >
              <Text style={[s.shareBtnText, { color: accentColor }]}>{t('sharedLabels.pdf')}</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </SafeAreaView>
  );

  // One row in the catalog. The whole row toggles the label in and out of My
  // Prints; editing the label itself lives behind the pencil so a tap made
  // while scrolling can't open the edit form by accident.
  function renderCatalogCard(item: Label) {
    const entry = cart[item.id];
    const inCart = !!entry;
    const tmpl = TEMPLATES.find(tp => tp.value === item.template) || TEMPLATES[0];
    // Show what this label will actually print at, including a price typed on
    // its My Prints item, so the row never contradicts the cart.
    const price = printPriceFor(item, entry);
    const status = item.myStoreLabel?.status;
    return (
      <View style={[s.card, inCart && { borderColor: accentColor, backgroundColor: '#F6FAFF' }]}>
        <TouchableOpacity
          style={s.cardMain}
          onPress={() => toggleCart(item)}
          activeOpacity={0.7}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: inCart }}
          accessibilityLabel={inCart
            ? t('sharedLabels.removeFromMyPrintsA11y', { name: item.productName })
            : t('sharedLabels.addToMyPrintsA11y', { name: item.productName })}
        >
          <View style={[s.checkboxBox, inCart && { backgroundColor: accentColor, borderColor: accentColor }]}>
            {inCart && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
          </View>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{item.productName}</Text>
            {item.category && <Text style={s.cardCategory}>{item.category}</Text>}
            {price != null
              ? <Text style={s.cardPrice}>${price}{entry?.customPrice ? ` ${t('sharedLabels.myPrice')}` : item.myStoreLabel?.hasOverride ? ` ${t('sharedLabels.storePrice')}` : ''}</Text>
              : <Text style={s.cardNoPrice}>{t('sharedLabels.noPriceYet')}</Text>}
            {item.dealText && <Text style={s.cardDeal}>{item.dealText}</Text>}
            {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
            {status && status !== 'not_added' && (
              <View style={s.statusRow}>
                <View style={[s.statusChip, { backgroundColor: STATUS_BG[status] }]}>
                  <Text style={[s.statusChipText, { color: STATUS_COLOR[status] }]}>{statusText(status)}</Text>
                </View>
                {item.myStoreLabel?.overrideExpiresAt && (
                  <Text style={s.statusExpiry}>{t('sharedLabels.endsOn', { date: formatEndsOn(item.myStoreLabel.overrideExpiresAt, dateLocale) })}</Text>
                )}
              </View>
            )}
          </View>
        </TouchableOpacity>
        {isManagerPlus && (
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => openEditForm(item)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.editA11y', { name: item.productName })}
          >
            <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // One row in My Prints: exactly what will print, with the copy count and
  // the price for this store right on the card.
  function renderCartCard(row: CartRow<Label>) {
    const { label, entry, printPrice, hasCustomPrice } = row;
    const tmpl = TEMPLATES.find(tp => tp.value === label.template) || TEMPLATES[0];
    const needsPrice = printPrice === null;
    return (
      <View style={[s.cartCard, needsPrice && s.cartCardNeedsPrice]}>
        <View style={s.cartCardTop}>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{label.productName}</Text>
            {label.category && <Text style={s.cardCategory}>{label.category}</Text>}
            {needsPrice
              ? <Text style={s.cardNoPrice}>{t('sharedLabels.noPriceYet')}</Text>
              : <Text style={s.cardPrice}>${printPrice}{hasCustomPrice ? ` ${t('sharedLabels.myPrice')}` : label.myStoreLabel?.hasOverride ? ` ${t('sharedLabels.storePrice')}` : ''}</Text>}
            {hasCustomPrice && entry.customExpiryDays ? (
              <Text style={s.statusExpiry}>{t('sharedLabels.revertsAfter', { count: entry.customExpiryDays })}</Text>
            ) : null}
            {label.dealText && <Text style={s.cardDeal}>{label.dealText}</Text>}
            {label.barcode && <Text style={s.cardBarcode}>{label.barcode}</Text>}
          </View>
          {isManagerPlus && (
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => openEditForm(label)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
              accessibilityRole="button"
              accessibilityLabel={t('sharedLabels.editA11y', { name: label.productName })}
            >
              <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.iconBtn}
            onPress={() => removeFromCart(label.id)}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('sharedLabels.removeFromMyPrintsA11y', { name: label.productName })}
          >
            <Trash2Icon size={16} color={COLORS.danger} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        <View style={s.cartCardBottom}>
          <QtyStepper value={entry.quantity} onChange={n => changeQuantity(label.id, n)} />
          <TouchableOpacity
            style={needsPrice ? [s.setPriceBtn, { backgroundColor: accentColor }] : s.changePriceBtn}
            onPress={() => openPriceSheet(label)}
            accessibilityRole="button"
            accessibilityLabel={needsPrice
              ? t('sharedLabels.setPriceA11y', { name: label.productName })
              : t('sharedLabels.changePriceA11y', { name: label.productName })}
          >
            <Text style={needsPrice ? s.setPriceBtnText : [s.changePriceBtnText, { color: accentColor }]}>
              {needsPrice ? t('sharedLabels.setPrice') : t('sharedLabels.changePrice')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // A product the Store Catalog knows but that has no label yet.
  function renderProductCard(p: ScannedProduct) {
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => openCreateFromProduct(p)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('sharedLabels.makeLabelA11y', { name: p.name })}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.cardName} numberOfLines={2}>{p.name}</Text>
          {p.category && <Text style={s.cardCategory}>{p.category}</Text>}
          <Text style={s.cardBarcode}>{p.barcode}</Text>
        </View>
        <View style={[s.makeLabelPill, { borderColor: accentColor }]}>
          <PlusIcon size={13} color={accentColor} strokeWidth={2.75} />
          <Text style={[s.makeLabelPillText, { color: accentColor }]}>{t('sharedLabels.makeLabel')}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  // While searching the labels, also offer matching products that have no
  // label yet (managers only), so a search that finds nothing isn't a dead end.
  function renderProductSuggestions() {
    if (productMode || !canBrowseProducts || debouncedSearch.length < 2 || unlabelledProducts.length === 0) return null;
    return (
      <View style={s.suggestions}>
        <Text style={s.suggestionsTitle}>{t('sharedLabels.alsoInProducts')}</Text>
        {unlabelledProducts.slice(0, 5).map(p => <View key={p.id}>{renderProductCard(p)}</View>)}
      </View>
    );
  }
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  priceCheckBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  priceCheckBtnText: { fontSize: 13, fontWeight: '700' },
  viewToggleRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 10 },
  viewToggleChip: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  viewToggleText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, marginBottom: 12 },
  searchInput: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text,
  },
  centerScroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  storeSelector: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', maxWidth: '92%',
    marginHorizontal: 20, marginBottom: 10, backgroundColor: '#fff',
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
  },
  storeSelectorText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: COLORS.text },
  storePickerHint: { fontSize: 12.5, color: COLORS.textMuted, lineHeight: 17, paddingHorizontal: 20, marginBottom: 12 },
  storeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff',
  },
  storeRowName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  storeRowSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  storeRowBadge: { backgroundColor: '#EFF6FF', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  storeRowBadgeText: { fontSize: 11, fontWeight: '700', color: '#1D4ED8' },
  productsLink: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingHorizontal: 20, paddingVertical: 4, marginBottom: 8,
  },
  productsLinkText: { fontSize: 13, fontWeight: '700' },
  productsHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  productsHeaderTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  productsHeaderHint: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  productsCapNote: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 12 },
  makeLabelPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#fff',
  },
  makeLabelPillText: { fontSize: 12.5, fontWeight: '800' },
  suggestions: { alignSelf: 'stretch', marginTop: 14, gap: 10 },
  suggestionsTitle: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  reprintBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#F6E3B0', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  reprintBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#7A5410' },
  reprintBannerAction: { fontSize: 13, fontWeight: '800' },
  addAllBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    paddingHorizontal: 20, marginBottom: 8,
  },
  addAllText: { fontSize: 12.5, fontWeight: '600', color: COLORS.textMuted },
  addAllClear: { fontSize: 12.5, fontWeight: '700' },
  addAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1.5, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff',
  },
  addAllBtnText: { fontSize: 12.5, fontWeight: '800' },
  cartSummaryRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, marginBottom: 8,
  },
  cartSummaryText: { fontSize: 13, fontWeight: '700', color: COLORS.text },
  cartClearText: { fontSize: 13, fontWeight: '700', color: COLORS.danger },
  needsPriceBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FBD5D5', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  needsPriceBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#991B1B' },
  filterIconBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center', position: 'relative',
  },
  filterActiveDot: {
    position: 'absolute', top: 5, right: 5, width: 7, height: 7, borderRadius: 3.5,
  },
  categoryFilterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginBottom: 12 },
  categoryChip: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6,
  },
  categoryChipText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  quickAddBtn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, marginTop: 16 },
  quickAddBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  storePickerRow: { paddingHorizontal: 20, marginBottom: 10, gap: 6 },
  storePickerLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusChipText: { fontSize: 10.5, fontWeight: '700' },
  statusExpiry: { fontSize: 11, fontWeight: '600', color: '#7C3AED' },
  addSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  addSheetCard: { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 340 },
  addSheetSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  emptySub: { fontSize: 14, color: COLORS.textMuted },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 14, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cartCard: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, gap: 12, borderWidth: 1.5, borderColor: 'transparent',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cartCardNeedsPrice: { borderColor: '#F5B5B5', backgroundColor: '#FFFAFA' },
  cartCardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cartCardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconBtn: { padding: 6 },
  changePriceBtn: { paddingHorizontal: 4, paddingVertical: 6 },
  changePriceBtnText: { fontSize: 13, fontWeight: '700' },
  setPriceBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  setPriceBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cardMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  templateDot: { width: 8, height: 8, borderRadius: 4 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardCategory: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginTop: 2 },
  cardDeal: { fontSize: 12, fontWeight: '600', color: '#b7791f', marginTop: 1 },
  cardNoPrice: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginTop: 2 },
  cardBarcode: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text, lineHeight: 18 },
  // Fixed width: a TextInput in a row otherwise grows to its default width
  // and pushes the "Change price" button off the edge of the card.
  qtyInput: {
    width: 52, height: 32, fontSize: 15, fontWeight: '700', color: COLORS.text, textAlign: 'center',
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 8, paddingVertical: 0, paddingHorizontal: 4,
  },
  footer: {
    flexDirection: 'row', gap: 8, padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: '#fff',
  },
  scanBtn: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 12, paddingVertical: 14,
  },
  scanBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  printBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 14,
  },
  printBtnDim: { opacity: 0.4 },
  printBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareBtn: {
    flex: 0.6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderRadius: 12, paddingVertical: 14,
  },
  shareBtnText: { fontSize: 14, fontWeight: '700' },
  formOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  formScroll: { padding: 20, paddingBottom: 40 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldLabelSub: { fontWeight: '400', color: COLORS.textMuted },
  expiryChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  expiryChip: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 16,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fff',
  },
  expiryChipText: { fontSize: 12.5, fontWeight: '600', color: COLORS.text },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: COLORS.text,
  },
  nameSugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border, borderTopWidth: 0,
    borderRadius: 12, borderTopLeftRadius: 0, borderTopRightRadius: 0,
    maxHeight: 220, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 6,
  },
  nameSuggRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0',
  },
  nameSuggText: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text, marginRight: 8 },
  nameSuggPrice: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  templateSwatch: { width: 10, height: 10, borderRadius: 5 },
  templateChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  priceInputWrap: { position: 'relative', justifyContent: 'center' },
  priceInputDollar: {
    position: 'absolute', left: 14, fontSize: 15, fontWeight: '700', color: COLORS.textMuted, zIndex: 1,
  },
  priceInput: { paddingLeft: 26 },
  saveBtn: {
    borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  saveBtnDim: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },
});
