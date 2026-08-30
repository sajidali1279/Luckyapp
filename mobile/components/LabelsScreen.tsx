import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Modal, ScrollView, Alert,
  KeyboardAvoidingView, Platform, Keyboard, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { labelsApi, storesApi, orderCategoriesApi, scannedProductApi } from '../services/api';
import { COLORS } from '../constants';
import { TagIcon, XIcon, CheckCircleIcon, EditIcon, CameraIcon, FilterIcon, PlusIcon } from './Icons';
import BarcodeScannerModal, { BarcodeResult } from './BarcodeScannerModal';
import { printLabels, PrintableLabelEntry } from '../utils/printLabels';
import { useAuthStore } from '../store/authStore';
import { useCurrentStoreId } from '../utils/geo';

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
  // Only present in responses from getAllWithMyStore(storeId) when a
  // storeId was actually supplied — absent (not just null) otherwise, e.g.
  // when no store has resolved yet. Always check truthiness, not `!== null`.
  myStoreLabel?: { effectivePrice: string; printedAt: string | null } | null;
}

interface StoreLabelItem {
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

// Sentinel for the "Uncategorized" filter chip — distinct from `null`
// (which means "no filter, show everything").
const UNCATEGORIZED = '__uncategorized__';

const TEMPLATES: { value: string; label: string; color: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black', color: '#b91c1c' },
  { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter', color: '#14532d' },
  { value: 'SUMMER', label: 'Summer', color: '#ea580c' },
  { value: 'CLEARANCE', label: 'Clearance', color: '#dc2626' },
  { value: 'INDEPENDENCE_DAY', label: 'Independence Day', color: '#1e3a8a' },
  { value: 'HALLOWEEN', label: 'Halloween', color: '#7c3aed' },
  { value: 'PREMIUM', label: 'Premium / Top Shelf', color: '#b8860b' },
];

export default function LabelsScreen() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const accentColor = user?.role === 'STORE_MANAGER' ? COLORS.managerPrimary : COLORS.secondary;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [showScanner, setShowScanner] = useState(false);
  const [manualStoreId, setManualStoreId] = useState<string | undefined>(undefined);
  const [addSheetItem, setAddSheetItem] = useState<Label | null>(null);
  const [addSheetPriceMode, setAddSheetPriceMode] = useState<'base' | 'custom'>('base');
  const [addSheetPrice, setAddSheetPrice] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formDealText, setFormDealText] = useState('');
  const [formBarcode, setFormBarcode] = useState<string | null>(null);
  const [formCategory, setFormCategory] = useState('');
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
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

  const [viewMode, setViewMode] = useState<'ready' | 'catalog'>('ready');

  const { data: storesListData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });
  const allStores: any[] = storesListData?.data?.data || [];

  const resolvedStoreId = useCurrentStoreId(allStores, user?.storeIds);
  const storeId = manualStoreId ?? resolvedStoreId;

  // Every catalog item, annotated with this store's own StoreLabel (if any)
  // when a store is known — powers both the Catalog view's "already added"
  // status and the dedupe/autocomplete lookups below.
  const { data: catalogData } = useQuery({
    queryKey: ['mobile-labels', 'catalog-all', storeId],
    queryFn: () => labelsApi.getAllWithMyStore(storeId),
  });
  const allLabels: Label[] = catalogData?.data?.data || [];

  const { data: myPrintsData, isLoading: myPrintsLoading, refetch: refetchMyPrints, isRefetching: myPrintsRefetching } = useQuery({
    queryKey: ['store-labels', storeId, 'unprinted'],
    queryFn: () => labelsApi.getStoreLabels(storeId!, true),
    enabled: !!storeId,
  });
  const myPrints: StoreLabelItem[] = myPrintsData?.data?.data || [];

  const isLoading = viewMode === 'ready' ? myPrintsLoading : false;
  const isRefetching = viewMode === 'ready' ? myPrintsRefetching : false;
  const refetch = viewMode === 'ready' ? refetchMyPrints : (() => qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] }));

  // A search hitting zero results in the current view might still exist
  // elsewhere in the shared catalog (e.g. already printed, or created by
  // another store) — check the unfiltered catalog before offering to
  // create a new label, so we never create a duplicate barcode.
  const searchTerm = search.trim();
  const isBarcodeLikeSearch = /^\d{4,}$/.test(searchTerm);
  const existingBarcodeMatch = isBarcodeLikeSearch
    ? allLabels.find(l => l.barcode === searchTerm)
    : undefined;

  const filteredCatalog = allLabels.filter(l => {
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter) {
      if (l.category !== categoryFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.productName.toLowerCase().includes(q) || (!!l.barcode && l.barcode.toLowerCase().includes(q));
  });

  const filteredMyPrints = myPrints.filter(l => {
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter) {
      if (l.category !== categoryFilter) return false;
    }
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return l.productName.toLowerCase().includes(q) || (!!l.barcode && l.barcode.toLowerCase().includes(q));
  });

  // Category chips reflect what's actually present in the current view.
  const availableCategories = Array.from(
    new Set((viewMode === 'catalog' ? allLabels : myPrints).map(l => l.category).filter((c): c is string => !!c))
  ).sort();
  const hasUncategorized = (viewMode === 'catalog' ? allLabels : myPrints).some(l => !l.category);

  const allFilteredSelected = filteredMyPrints.length > 0 && filteredMyPrints.every(l => l.storeLabelId && selectedIds.has(l.storeLabelId));

  function toggleSelectAll() {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const ids = filteredMyPrints.map(l => l.storeLabelId).filter((id): id is string => !!id);
      if (allFilteredSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
    setQuantities(prev => {
      const next = { ...prev };
      const ids = filteredMyPrints.map(l => l.storeLabelId).filter((id): id is string => !!id);
      if (allFilteredSelected) ids.forEach(id => { delete next[id]; });
      else ids.forEach(id => { if (!(id in next)) next[id] = 1; });
      return next;
    });
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
    setFormPriceText(label.priceText);
    setFormDealText(label.dealText || '');
    setShowNameSugg(false);
  }

  function openAddSheet(label: Label) {
    setAddSheetItem(label);
    setAddSheetPriceMode('base');
    setAddSheetPrice('');
  }

  async function confirmAddToMyPrints() {
    if (!addSheetItem || !storeId) return;
    const priceText = addSheetPriceMode === 'custom' ? addSheetPrice.trim() || null : null;
    try {
      await labelsApi.addToStore(addSheetItem.id, storeId, priceText);
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      await qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] });
      Toast.show({ type: 'success', text1: 'Added to My Prints' });
      setAddSheetItem(null);
    } catch (err: any) {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : 'Failed to add' });
    }
  }

  function openCreateForm(scanned: BarcodeResult) {
    const existing = allLabels.find(l => l.barcode && l.barcode === scanned.barcode);
    if (existing) {
      openEditForm(existing);
      return;
    }
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
    setEditingLabel(null);
    setFormProductName(isBarcodeLikeSearch ? '' : term);
    setFormPriceText('');
    setFormDealText('');
    setFormBarcode(isBarcodeLikeSearch ? term : null);
    setFormCategory('');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowForm(true);
    setSearch('');
  }

  function openEditForm(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
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
      if (editingLabel) {
        await labelsApi.update(editingLabel.id, { productName, priceText, dealText, barcode, category, template: formTemplate });
      } else {
        await labelsApi.create({ productName, priceText, dealText, barcode, category, template: formTemplate, storeId });
      }
      // Keep the shared scan-lookup cache (ScannedProduct) in sync — labels
      // typed/edited directly here (quick-add from search, or correcting an
      // existing label's name/category) bypass BarcodeScannerModal entirely,
      // which is the only other place this cache normally gets written.
      // Without this, a barcode entered here would come up "not found" the
      // next time someone scans it in Order List/Stock Request.
      if (barcode) {
        scannedProductApi.save({ barcode, name: productName, category: category || undefined, source: 'manual' }).catch(() => {});
      }
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      Toast.show({ type: 'success', text1: editingLabel ? 'Label updated' : 'Label added' });
      closeForm();
      // Creating (not editing) drops straight back into scanning so a
      // manager/employee can keep working down a shelf without re-tapping
      // "New Label" for every item — tap the scanner's X to stop.
      if (wasCreate) setShowScanner(true);
    } catch (err: any) {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : 'Failed to save label' });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!editingLabel) return;
    Alert.alert(
      'Delete this label?',
      `"${editingLabel.productName}" will be removed from the shared catalog for every store.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    if (!editingLabel) return;
    setSaving(true);
    try {
      await labelsApi.delete(editingLabel.id);
      const deletedId = editingLabel.id;
      setSelectedIds(prev => { const next = new Set(prev); next.delete(deletedId); return next; });
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      Toast.show({ type: 'success', text1: 'Label removed' });
      closeForm();
    } catch (err: any) {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : 'Failed to remove label' });
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(storeLabelId: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(storeLabelId)) next.delete(storeLabelId); else next.add(storeLabelId);
      return next;
    });
    setQuantities(prev => {
      if (prev[storeLabelId] !== undefined) {
        const next = { ...prev };
        delete next[storeLabelId];
        return next;
      }
      return { ...prev, [storeLabelId]: 1 };
    });
  }

  function setQuantity(storeLabelId: string, qty: number) {
    setQuantities(prev => ({ ...prev, [storeLabelId]: Math.max(1, Math.min(999, qty || 1)) }));
  }

  const totalCopies = [...selectedIds].reduce((sum, id) => sum + (quantities[id] ?? 1), 0);

  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = myPrints.filter(l => l.storeLabelId && selectedIds.has(l.storeLabelId));
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      const entries: PrintableLabelEntry[] = toPrint.map(item => ({
        label: {
          id: item.id, productName: item.productName, priceText: item.priceText,
          dealText: item.dealText, barcode: item.barcode, template: item.template,
        },
        quantity: quantities[item.storeLabelId!] ?? 1,
      }));
      await printLabels({ entries, shareAsPdf });
      const printItems = toPrint.map(item => ({ storeLabelId: item.storeLabelId!, quantity: quantities[item.storeLabelId!] ?? 1 }));
      try {
        await labelsApi.print(printItems);
      } catch {
        Toast.show({ type: 'error', text1: 'Printed, but failed to update status', text2: 'Pull to refresh to check' });
      }
      await qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      await qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all'] });
      setSelectedIds(new Set());
      setQuantities({});
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <SafeAreaView style={s.fill} edges={['top']}>
      <BarcodeScannerModal
        visible={showScanner}
        hideQuantity
        confirmLabel="Continue"
        onClose={() => setShowScanner(false)}
        onResult={(result) => { setShowScanner(false); openCreateForm(result); }}
      />

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={s.formOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[s.formSheet, keyboardHeight > 0 && { maxHeight: screenHeight - keyboardHeight - 24 }]}
          >
            <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
              <View style={s.formHeader}>
                <Text style={s.formTitle}>{editingLabel ? 'Edit Label' : 'New Label'}</Text>
                <TouchableOpacity onPress={closeForm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
                  <XIcon size={20} color={COLORS.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              <Text style={s.fieldLabel}>Product Name</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={s.fieldInput}
                  value={formProductName}
                  onChangeText={t => { setFormProductName(t); setShowNameSugg(true); }}
                  onFocus={() => setShowNameSugg(nameSuggestions.length > 0)}
                  onBlur={() => setTimeout(() => setShowNameSugg(false), 130)}
                  placeholder="e.g. Monster Energy 16oz"
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
                        accessibilityLabel={`Use ${l.productName}, $${l.priceText}${l.dealText ? ', ' + l.dealText : ''}`}
                      >
                        <Text style={s.nameSuggText} numberOfLines={1}>{l.productName}</Text>
                        <Text style={s.nameSuggPrice}>${l.priceText}{l.dealText ? ` · ${l.dealText}` : ''}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Price</Text>
              <View style={s.priceInputWrap}>
                <Text style={s.priceInputDollar}>$</Text>
                <TextInput
                  style={[s.fieldInput, s.priceInput]}
                  value={formPriceText}
                  onChangeText={t => setFormPriceText(t.replace(/[^0-9.]/g, ''))}
                  placeholder="3.99"
                  placeholderTextColor="#B0B8C4"
                  keyboardType="decimal-pad"
                  maxLength={7}
                />
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Deal (optional)</Text>
              <TextInput
                style={s.fieldInput}
                value={formDealText}
                onChangeText={setFormDealText}
                placeholder='e.g. "2 for $5" or "BOGO" - shown alongside the price above'
                placeholderTextColor="#B0B8C4"
                maxLength={20}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Barcode (optional)</Text>
              <TextInput
                style={s.fieldInput}
                value={formBarcode || ''}
                onChangeText={t => setFormBarcode(t)}
                placeholder="Scan or type the product's UPC/EAN"
                placeholderTextColor="#B0B8C4"
                maxLength={40}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Category (optional)</Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={s.fieldInput}
                  value={formCategory}
                  onChangeText={t => { setFormCategory(t); setShowCatSugg(true); }}
                  onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
                  placeholder="e.g. Groceries, Frozen Foods…"
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
                        accessibilityLabel={`Use category ${c}`}
                      >
                        <Text style={s.nameSuggText}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Template</Text>
              <View style={s.templateRow}>
                {TEMPLATES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.templateChip, formTemplate === t.value && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
                    onPress={() => setFormTemplate(t.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${t.label} template`}
                  >
                    <View style={[s.templateSwatch, { backgroundColor: t.color }]} />
                    <Text style={s.templateChipText}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, { backgroundColor: accentColor }, (!formProductName.trim() || !formPriceText.trim() || saving) && s.saveBtnDim]}
                onPress={handleSave}
                disabled={!formProductName.trim() || !formPriceText.trim() || saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Save label"
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{editingLabel ? 'Save Changes' : 'Add Label'}</Text>}
              </TouchableOpacity>

              {editingLabel && (
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={confirmDelete}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Delete label"
                >
                  <Text style={s.deleteBtnText}>Delete Label</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={!!addSheetItem} animationType="fade" transparent onRequestClose={() => setAddSheetItem(null)}>
        <View style={s.addSheetOverlay}>
          <View style={s.addSheetCard}>
            <Text style={s.formTitle}>{addSheetItem?.productName}</Text>
            <Text style={s.addSheetSub}>Base price: ${addSheetItem?.priceText}</Text>
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: accentColor, marginTop: 16 }]}
              onPress={() => { setAddSheetPriceMode('base'); confirmAddToMyPrints(); }}
              accessibilityRole="button"
              accessibilityLabel={`Add at $${addSheetItem?.priceText}`}
            >
              <Text style={s.saveBtnText}>Add at ${addSheetItem?.priceText}</Text>
            </TouchableOpacity>
            {addSheetPriceMode === 'custom' ? (
              <>
                <Text style={[s.fieldLabel, { marginTop: 16 }]}>My price</Text>
                <View style={s.priceInputWrap}>
                  <Text style={s.priceInputDollar}>$</Text>
                  <TextInput
                    style={[s.fieldInput, s.priceInput]}
                    value={addSheetPrice}
                    onChangeText={t => setAddSheetPrice(t.replace(/[^0-9.]/g, ''))}
                    placeholder={addSheetItem?.priceText}
                    placeholderTextColor="#B0B8C4"
                    keyboardType="decimal-pad"
                    maxLength={7}
                    autoFocus
                  />
                </View>
                <TouchableOpacity
                  style={[s.saveBtn, { backgroundColor: accentColor, marginTop: 12 }, !addSheetPrice.trim() && s.saveBtnDim]}
                  onPress={confirmAddToMyPrints}
                  disabled={!addSheetPrice.trim()}
                  accessibilityRole="button"
                  accessibilityLabel="Confirm custom price"
                >
                  <Text style={s.saveBtnText}>Confirm ${addSheetPrice || '0.00'}</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                style={{ marginTop: 12, alignItems: 'center' }}
                onPress={() => setAddSheetPriceMode('custom')}
                accessibilityRole="button"
                accessibilityLabel="Use a different price for my store"
              >
                <Text style={{ color: accentColor, fontWeight: '700', fontSize: 14 }}>Use a different price for my store</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={{ marginTop: 16, alignItems: 'center' }} onPress={() => setAddSheetItem(null)} accessibilityRole="button" accessibilityLabel="Cancel">
              <Text style={{ color: COLORS.textMuted, fontSize: 14 }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
      </View>

      {!storeId && (
        <View style={s.storePickerRow}>
          <Text style={s.storePickerLabel}>Which store are you at?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {allStores.map((st: any) => (
              <TouchableOpacity
                key={st.id}
                style={[s.categoryChip, { borderColor: accentColor }]}
                onPress={() => setManualStoreId(st.id)}
                accessibilityRole="button"
                accessibilityLabel={`Use ${st.name}`}
              >
                <Text style={s.categoryChipText}>{st.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={s.viewToggleRow}>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'ready' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('ready')}
          accessibilityRole="button"
          accessibilityLabel="Show my store's prints"
        >
          <Text style={s.viewToggleText}>My Prints{viewMode === 'ready' ? ` · ${myPrints.length}` : ''}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.viewToggleChip, viewMode === 'catalog' && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
          onPress={() => setViewMode('catalog')}
          accessibilityRole="button"
          accessibilityLabel="Browse the full catalog"
        >
          <Text style={s.viewToggleText}>Catalog{viewMode === 'catalog' ? ` · ${allLabels.length}` : ''}</Text>
        </TouchableOpacity>
      </View>

      {!!storeId && (viewMode === 'catalog' ? allLabels.length > 0 : !isLoading && myPrints.length > 0) && (
        <View style={s.toolbarRow}>
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search name or barcode…"
            placeholderTextColor="#B0B8C4"
          />
          {viewMode === 'ready' && (
            <TouchableOpacity
              style={s.selectAllBtn}
              onPress={toggleSelectAll}
              disabled={filteredMyPrints.length === 0}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: allFilteredSelected }}
              accessibilityLabel="Select all visible labels"
            >
              <View style={[s.checkboxBox, allFilteredSelected && { backgroundColor: accentColor, borderColor: accentColor }]}>
                {allFilteredSelected && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
              </View>
              <Text style={s.selectAllText}>All</Text>
            </TouchableOpacity>
          )}
          {(availableCategories.length > 0 || hasUncategorized) && (
            <TouchableOpacity
              style={[s.filterIconBtn, (showCategoryFilter || categoryFilter !== null) && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
              onPress={() => setShowCategoryFilter(v => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showCategoryFilter }}
              accessibilityLabel={categoryFilter !== null ? 'Category filter active, toggle category filter chips' : 'Toggle category filter chips'}
            >
              <FilterIcon size={16} color={showCategoryFilter || categoryFilter !== null ? accentColor : COLORS.textMuted} strokeWidth={2.25} />
              {categoryFilter !== null && <View style={[s.filterActiveDot, { backgroundColor: accentColor }]} />}
            </TouchableOpacity>
          )}
        </View>
      )}

      {!!storeId && (viewMode === 'catalog' ? allLabels.length > 0 : !isLoading && myPrints.length > 0) && showCategoryFilter && (availableCategories.length > 0 || hasUncategorized) && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.categoryFilterRow}>
          <TouchableOpacity
            style={[s.categoryChip, categoryFilter === null && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
            onPress={() => setCategoryFilter(null)}
            accessibilityRole="button"
            accessibilityLabel="Show all categories"
          >
            <Text style={s.categoryChipText}>All</Text>
          </TouchableOpacity>
          {availableCategories.map(c => (
            <TouchableOpacity
              key={c}
              style={[s.categoryChip, categoryFilter === c && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
              onPress={() => setCategoryFilter(categoryFilter === c ? null : c)}
              accessibilityRole="button"
              accessibilityLabel={`Filter by category ${c}`}
            >
              <Text style={s.categoryChipText}>{c}</Text>
            </TouchableOpacity>
          ))}
          {hasUncategorized && (
            <TouchableOpacity
              style={[s.categoryChip, categoryFilter === UNCATEGORIZED && { borderColor: accentColor, backgroundColor: '#eff6ff' }]}
              onPress={() => setCategoryFilter(categoryFilter === UNCATEGORIZED ? null : UNCATEGORIZED)}
              accessibilityRole="button"
              accessibilityLabel="Filter to uncategorized labels"
            >
              <Text style={s.categoryChipText}>Uncategorized</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {!storeId ? null : viewMode === 'catalog' ? (
        filteredCatalog.length === 0 ? (
          <View style={s.center}>
            <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
            <Text style={s.emptyTitle}>No matches</Text>
            {existingBarcodeMatch ? (
              <>
                <Text style={s.emptySub}>That barcode is already in the catalog</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={() => { const match = existingBarcodeMatch; setSearch(''); openEditForm(match); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${existingBarcodeMatch.productName}`}
                >
                  <Text style={s.quickAddBtnText}>Open "{existingBarcodeMatch.productName}"</Text>
                </TouchableOpacity>
              </>
            ) : searchTerm ? (
              <>
                <Text style={s.emptySub}>Try a different name or barcode</Text>
                <TouchableOpacity
                  style={[s.quickAddBtn, { backgroundColor: accentColor }]}
                  onPress={openQuickAddFromSearch}
                  accessibilityRole="button"
                  accessibilityLabel={isBarcodeLikeSearch ? `Add barcode ${searchTerm} as new label` : `Add ${searchTerm} as new label`}
                >
                  <Text style={s.quickAddBtnText}>
                    {isBarcodeLikeSearch ? `Add barcode "${searchTerm}" as new label` : `Add "${searchTerm}" as new label`}
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.emptySub}>No labels yet — scan an item to create the first one</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredCatalog}
            keyExtractor={l => l.id}
            contentContainerStyle={s.list}
            refreshing={isRefetching}
            onRefresh={refetch}
            renderItem={({ item }) => renderCatalogCard(item)}
          />
        )
      ) : myPrintsLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : filteredMyPrints.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>Nothing to print</Text>
          <Text style={s.emptySub}>Add an item from the Catalog, or scan a new one</Text>
        </View>
      ) : (
        <FlatList
          data={filteredMyPrints}
          keyExtractor={l => l.id}
          contentContainerStyle={s.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => renderMyPrintCard(item)}
        />
      )}

      <View style={s.footer}>
        <TouchableOpacity
          style={[s.scanBtn, { backgroundColor: accentColor }]}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan a new item to create a label"
        >
          <CameraIcon size={18} color="#fff" strokeWidth={2.5} />
          <Text style={s.scanBtnText}>New Label</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.printBtn, { backgroundColor: accentColor }, (selectedIds.size === 0 || printing) && s.printBtnDim]}
          onPress={() => handlePrint(false)}
          disabled={selectedIds.size === 0 || printing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Print ${totalCopies} label copies`}
        >
          {printing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.printBtnText}>Print ({totalCopies})</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.shareBtn, { borderColor: accentColor }, (selectedIds.size === 0 || printing) && s.printBtnDim]}
          onPress={() => handlePrint(true)}
          disabled={selectedIds.size === 0 || printing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Export ${totalCopies} label copies as PDF`}
        >
          <Text style={[s.shareBtnText, { color: accentColor }]}>PDF</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );

  function renderCatalogCard(item: Label) {
    const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
    return (
      <View style={s.card}>
        <TouchableOpacity style={s.cardBody} onPress={() => openEditForm(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.productName}`}>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{item.productName}</Text>
            {item.category && <Text style={s.cardCategory}>{item.category}</Text>}
            <Text style={s.cardPrice}>${item.priceText} base</Text>
            {item.dealText && <Text style={s.cardDeal}>{item.dealText}</Text>}
            {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
          </View>
          <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
        </TouchableOpacity>
        {item.myStoreLabel ? (
          <View style={s.inQueueBadge}>
            <Text style={s.inQueueBadgeText}>{item.myStoreLabel.printedAt ? 'Printed' : 'In My Prints'}</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={[s.addToPrintsBtn, { backgroundColor: accentColor }]}
            onPress={() => openAddSheet(item)}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.productName} to my prints`}
          >
            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  function renderMyPrintCard(item: StoreLabelItem) {
    const checked = !!item.storeLabelId && selectedIds.has(item.storeLabelId);
    const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
    return (
      <View style={s.card}>
        <TouchableOpacity
          style={s.checkbox}
          onPress={() => item.storeLabelId && toggleSelected(item.storeLabelId)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          accessibilityLabel={`Select ${item.productName} for printing`}
        >
          <View style={[s.checkboxBox, checked && { backgroundColor: accentColor, borderColor: accentColor }]}>
            {checked && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
          </View>
        </TouchableOpacity>
        <View style={s.cardBody}>
          <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
          <View style={{ flex: 1 }}>
            <Text style={s.cardName}>{item.productName}</Text>
            {item.category && <Text style={s.cardCategory}>{item.category}</Text>}
            <Text style={s.cardPrice}>${item.priceText}{item.hasOverride ? ' (my price)' : ''}</Text>
            {item.dealText && <Text style={s.cardDeal}>{item.dealText}</Text>}
            {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
          </View>
        </View>
        {checked && item.storeLabelId && (
          <View style={s.qtyStepper}>
            <TouchableOpacity
              style={s.qtyBtn}
              onPress={() => setQuantity(item.storeLabelId!, (quantities[item.storeLabelId!] ?? 1) - 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Decrease copies"
            >
              <Text style={s.qtyBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={s.qtyValue}>{quantities[item.storeLabelId!] ?? 1}</Text>
            <TouchableOpacity
              style={s.qtyBtn}
              onPress={() => setQuantity(item.storeLabelId!, (quantities[item.storeLabelId!] ?? 1) + 1)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Increase copies"
            >
              <Text style={s.qtyBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
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
  selectAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 4 },
  selectAllText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
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
  addToPrintsBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  inQueueBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F0F0F0' },
  inQueueBadgeText: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },
  addSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  addSheetCard: { backgroundColor: '#fff', borderRadius: 18, padding: 22, width: '100%', maxWidth: 340 },
  addSheetSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  emptySub: { fontSize: 14, color: COLORS.textMuted },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  checkbox: { padding: 2 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  templateDot: { width: 8, height: 8, borderRadius: 4 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardCategory: { fontSize: 11, fontWeight: '600', color: COLORS.textMuted, marginTop: 1, textTransform: 'uppercase', letterSpacing: 0.3 },
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginTop: 2 },
  cardDeal: { fontSize: 12, fontWeight: '600', color: '#b7791f', marginTop: 1 },
  cardBarcode: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  qtyStepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnText: { fontSize: 16, fontWeight: '700', color: COLORS.text, lineHeight: 18 },
  qtyValue: { fontSize: 14, fontWeight: '700', color: COLORS.text, minWidth: 20, textAlign: 'center' },
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
