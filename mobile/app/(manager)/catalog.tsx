import React, { useState, useRef, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ScrollView, ActivityIndicator, Alert, RefreshControl,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { COLORS } from '../../constants';
import { scannedProductApi, orderCategoriesApi } from '../../services/api';
import {
  QrCodeScanIcon, PlusIcon, ListIcon,
  CheckCircleIcon, Trash2Icon, PackageIcon,
} from '../../components/Icons';

type Tab       = 'scan' | 'manual' | 'browse';
type ScanPhase = 'ready' | 'checking' | 'exists' | 'added' | 'needs_name';

function mapOFFCategory(tags: string[]): string | null {
  const en = tags.filter(t => t.startsWith('en:')).map(t => t.replace('en:', '').replace(/-/g, ' '));
  if (!en.length) return null;
  const last = en[en.length - 1]; const lower = last.toLowerCase();
  if (lower.includes('frozen'))                                        return 'Frozen Foods';
  if (lower.includes('tobacco') || lower.includes('cigar'))           return 'Tobacco / Vapes';
  if (lower.includes('dairy') || lower.includes('milk') || lower.includes('cheese')) return 'Groceries';
  if (lower.includes('snack') || lower.includes('chip') || lower.includes('candy'))  return 'Groceries';
  if (lower.includes('beverage') || lower.includes('drink') || lower.includes('juice')) return 'Groceries';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function CatalogScreen() {
  const [tab, setTab] = useState<Tab>('scan');

  const tabs: { key: Tab; label: string; Icon: any }[] = [
    { key: 'scan',   label: 'Rapid Scan', Icon: QrCodeScanIcon },
    { key: 'manual', label: 'Manual Add', Icon: PlusIcon },
    { key: 'browse', label: 'Browse',     Icon: ListIcon },
  ];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <PackageIcon size={18} color="#fff" strokeWidth={2} />
        <Text style={s.headerTitle}>Store Catalog</Text>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {tabs.map(({ key, label, Icon }) => (
          <TouchableOpacity
            key={key}
            style={[s.tabBtn, tab === key && s.tabBtnActive]}
            onPress={() => setTab(key)}
            activeOpacity={0.75}
          >
            <Icon size={15} color={tab === key ? COLORS.secondary : COLORS.textMuted} strokeWidth={2} />
            <Text style={[s.tabLabel, tab === key && s.tabLabelActive]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === 'scan'   && <ScanTab />}
      {tab === 'manual' && <ManualTab />}
      {tab === 'browse' && <BrowseTab />}
    </SafeAreaView>
  );
}

// ─── Rapid Scan Tab ───────────────────────────────────────────────────────────

function ScanTab() {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase,      setPhase]          = useState<ScanPhase>('ready');
  const [resultName, setResultName]     = useState('');
  const [curBarcode, setCurBarcode]     = useState('');
  const [nameInput,  setNameInput]      = useState('');
  const [catInput,   setCatInput]       = useState('');
  const [saving,     setSaving]         = useState(false);
  const lastCode = useRef('');
  const nameRef  = useRef<TextInput>(null);
  const qc       = useQueryClient();

  async function handleBarcode({ data }: { data: string }) {
    if (phase !== 'ready' || data === lastCode.current) return;
    lastCode.current = data;
    setCurBarcode(data);
    setPhase('checking');

    // 1. Check catalog
    try {
      const res = await scannedProductApi.lookup(data);
      if (res.data?.data?.name) {
        setResultName(res.data.data.name);
        setPhase('exists');
        setTimeout(resetToReady, 2200);
        return;
      }
    } catch {}

    // 2. Open Food Facts
    try {
      const offRes  = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(data)}.json?fields=product_name,product_name_en,categories_tags,brands`,
        { headers: { 'User-Agent': 'LuckyStop-App/1.0' }, signal: AbortSignal.timeout(6000) }
      );
      const offJson = await offRes.json();
      if (offJson.status === 1 && offJson.product) {
        const name  = (offJson.product.product_name_en || offJson.product.product_name || '').trim();
        const cat   = mapOFFCategory(offJson.product.categories_tags || []);
        const brand = (offJson.product.brands || '').split(',')[0].trim() || undefined;
        if (name) {
          await scannedProductApi.save({ barcode: data, name, category: cat ?? undefined, brand, source: 'openfoodfacts' });
          setResultName(name);
          setPhase('added');
          qc.invalidateQueries({ queryKey: ['catalog-list'] });
          setTimeout(resetToReady, 2200);
          return;
        }
      }
    } catch {}

    // 3. Unknown — ask for name
    setNameInput('');
    setCatInput('');
    setPhase('needs_name');
    setTimeout(() => nameRef.current?.focus(), 250);
  }

  function resetToReady() {
    setPhase('ready');
    lastCode.current = '';
  }

  async function handleSaveName() {
    const name = nameInput.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      await scannedProductApi.save({ barcode: curBarcode, name, category: catInput.trim() || undefined, source: 'manual' });
      setResultName(name);
      setPhase('added');
      qc.invalidateQueries({ queryKey: ['catalog-list'] });
      setTimeout(resetToReady, 2200);
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.error || 'Check your connection');
      resetToReady();
    } finally {
      setSaving(false);
    }
  }

  if (!permission) {
    return <View style={s.center}><ActivityIndicator color={COLORS.secondary} /></View>;
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <Text style={s.permText}>Camera access is needed to scan barcodes.</Text>
        <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Live camera */}
      <View style={s.cameraWrap}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          facing="back"
          onBarcodeScanned={phase === 'ready' ? handleBarcode : undefined}
          barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','upc_a','upc_e','code128','code39','itf14'] }}
        />
        {/* Dark edges */}
        <View style={s.ovTop} /><View style={s.ovBottom} />
        <View style={s.ovLeft} /><View style={s.ovRight} />
        {/* Corner brackets */}
        <View style={s.frameWrap} pointerEvents="none">
          <View style={s.frame}>
            <View style={[s.corner, s.cTL]} /><View style={[s.corner, s.cTR]} />
            <View style={[s.corner, s.cBL]} /><View style={[s.corner, s.cBR]} />
          </View>
        </View>
      </View>

      {/* Status / action panel */}
      <View style={s.panel}>

        {phase === 'ready' && (
          <View style={s.phaseRow}>
            <QrCodeScanIcon size={18} color={COLORS.textMuted} strokeWidth={1.75} />
            <Text style={s.phaseHint}>Point camera at a product barcode</Text>
          </View>
        )}

        {phase === 'checking' && (
          <View style={s.phaseRow}>
            <ActivityIndicator size="small" color={COLORS.secondary} />
            <Text style={[s.phaseHint, { marginLeft: 8 }]}>Looking up product…</Text>
          </View>
        )}

        {(phase === 'exists' || phase === 'added') && (
          <View style={[s.resultBanner, phase === 'added' ? s.bannerGreen : s.bannerGray]}>
            <CheckCircleIcon size={20} color={phase === 'added' ? '#16A34A' : COLORS.textMuted} strokeWidth={2.5} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={[s.bannerLabel, phase === 'added' && { color: '#15803D' }]}>
                {phase === 'added' ? 'Added to catalog' : 'Already in catalog'}
              </Text>
              <Text style={s.bannerName} numberOfLines={1}>{resultName}</Text>
            </View>
          </View>
        )}

        {phase === 'needs_name' && (
          <View>
            <Text style={s.namingLabel}>Not in any database — enter a name:</Text>
            <TextInput
              ref={nameRef}
              style={s.namingInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Product name  e.g. Whole Milk 1 Gallon"
              placeholderTextColor="#B0B8C4"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="next"
              maxLength={200}
            />
            <TextInput
              style={[s.namingInput, { marginTop: 8 }]}
              value={catInput}
              onChangeText={setCatInput}
              placeholder="Category  (optional)"
              placeholderTextColor="#B0B8C4"
              autoCapitalize="words"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
              maxLength={100}
            />
            <View style={s.namingActions}>
              <TouchableOpacity style={s.skipBtn} onPress={resetToReady}>
                <Text style={s.skipBtnText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.saveBtn, (!nameInput.trim() || saving) && { opacity: 0.4 }]}
                onPress={handleSaveName}
                disabled={!nameInput.trim() || saving}
                activeOpacity={0.85}
              >
                {saving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.saveBtnText}>Add to Catalog</Text>}
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Manual Add Tab ───────────────────────────────────────────────────────────

function ManualTab() {
  const [name,        setName]       = useState('');
  const [category,    setCategory]   = useState('');
  const [barcode,     setBarcode]    = useState('');
  const [adding,      setAdding]     = useState(false);
  const [recentItems, setRecentItems]= useState<{ name: string; category: string }[]>([]);
  const [catSuggs,    setCatSuggs]   = useState<string[]>([]);
  const [showSuggs,   setShowSuggs]  = useState(false);
  const nameRef = useRef<TextInput>(null);
  const qc = useQueryClient();

  const { data: catsData } = useQuery({
    queryKey: ['approved-categories'],
    queryFn:  orderCategoriesApi.getApproved,
  });
  const approvedCats: string[] = catsData?.data?.data || [];

  function onCatChange(v: string) {
    setCategory(v);
    if (v.trim()) {
      const q = v.toLowerCase();
      setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 4));
      setShowSuggs(true);
    } else {
      setCatSuggs([]);
    }
  }

  async function handleAdd() {
    const trimName = name.trim();
    if (!trimName || adding) return;
    setAdding(true);
    // Use a name-derived pseudo-barcode so the same product name doesn't create duplicates
    const bc = barcode.trim() || `NOBARCODE_${trimName.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
    try {
      await scannedProductApi.save({ barcode: bc, name: trimName, category: category.trim() || undefined, source: 'manual' });
      setRecentItems(prev => [{ name: trimName, category: category.trim() }, ...prev].slice(0, 30));
      setName('');
      setBarcode('');
      // keep category — manager is likely batch-adding from the same section of their book
      qc.invalidateQueries({ queryKey: ['catalog-list'] });
      nameRef.current?.focus();
    } catch (err: any) {
      Alert.alert('Save failed', err?.response?.data?.error || 'Check your connection');
    } finally {
      setAdding(false);
    }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        style={s.flex}
        contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={s.manualHint}>
          Add products from your book. Category is kept between entries so you can batch-add by section.
        </Text>

        <Text style={s.fieldLabel}>Product name  <Text style={s.required}>*</Text></Text>
        <TextInput
          ref={nameRef}
          style={s.fieldInput}
          value={name}
          onChangeText={setName}
          placeholder="e.g. Whole Milk 1 Gallon"
          placeholderTextColor="#B0B8C4"
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
          maxLength={200}
          autoFocus
        />

        <Text style={[s.fieldLabel, { marginTop: 16 }]}>
          Category  <Text style={s.optional}>(optional)</Text>
        </Text>
        <View>
          <TextInput
            style={s.fieldInput}
            value={category}
            onChangeText={onCatChange}
            onFocus={() => catSuggs.length > 0 && setShowSuggs(true)}
            onBlur={() => setTimeout(() => setShowSuggs(false), 120)}
            placeholder="e.g. Groceries, Frozen Foods"
            placeholderTextColor="#B0B8C4"
            autoCapitalize="words"
            autoCorrect={false}
            returnKeyType="next"
            maxLength={100}
          />
          {showSuggs && catSuggs.length > 0 && (
            <View style={s.sugg}>
              {catSuggs.map(c => (
                <TouchableOpacity key={c} style={s.suggRow} onPress={() => { setCategory(c); setShowSuggs(false); }}>
                  <Text style={s.suggText}>{c}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        <Text style={[s.fieldLabel, { marginTop: 16 }]}>
          Barcode  <Text style={s.optional}>(optional — enter if you have it)</Text>
        </Text>
        <TextInput
          style={s.fieldInput}
          value={barcode}
          onChangeText={setBarcode}
          placeholder="e.g. 012345678901"
          placeholderTextColor="#B0B8C4"
          keyboardType="numeric"
          returnKeyType="done"
          onSubmitEditing={handleAdd}
          maxLength={50}
        />

        <TouchableOpacity
          style={[s.addBtn, (!name.trim() || adding) && { opacity: 0.4 }]}
          onPress={handleAdd}
          disabled={!name.trim() || adding}
          activeOpacity={0.85}
        >
          {adding
            ? <ActivityIndicator color="#fff" />
            : <><PlusIcon size={17} color="#fff" strokeWidth={2.5} /><Text style={s.addBtnText}>Add to Catalog</Text></>}
        </TouchableOpacity>

        {recentItems.length > 0 && (
          <View style={{ marginTop: 28 }}>
            <Text style={s.recentHeader}>Added this session — {recentItems.length}</Text>
            {recentItems.map((item, i) => (
              <View key={i} style={s.recentRow}>
                <CheckCircleIcon size={13} color="#16A34A" strokeWidth={2.5} />
                <Text style={s.recentName} numberOfLines={1}>{item.name}</Text>
                {item.category ? <Text style={s.recentCat}>{item.category}</Text> : null}
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── Browse Tab ───────────────────────────────────────────────────────────────

function BrowseTab() {
  const [searchQ, setSearchQ] = useState('');
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['catalog-list', searchQ],
    queryFn:  () => scannedProductApi.list({ q: searchQ || undefined }),
    staleTime: 30_000,
  });

  const items: any[] = data?.data?.data || [];

  const grouped = useMemo(() => {
    const map: Record<string, any[]> = {};
    items.forEach(item => {
      const cat = item.category || 'Uncategorized';
      if (!map[cat]) map[cat] = [];
      map[cat].push(item);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => scannedProductApi.delete(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['catalog-list'] }),
    onError:    () => Alert.alert('Error', 'Could not remove item'),
  });

  function confirmDelete(id: string, name: string) {
    Alert.alert(
      'Remove from catalog?',
      `"${name}" won't appear in scan suggestions anymore.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => deleteMut.mutate(id) },
      ]
    );
  }

  const sourceLabel = (src: string, barcode: string) => {
    if (barcode?.startsWith('NOBARCODE_')) return 'manual (no barcode)';
    if (src === 'openfoodfacts') return 'Open Food Facts';
    return 'manual';
  };

  return (
    <View style={s.flex}>
      <View style={s.searchBar}>
        <TextInput
          style={s.searchInput}
          value={searchQ}
          onChangeText={setSearchQ}
          placeholder="Search catalog…"
          placeholderTextColor="#B0B8C4"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} /></View>
      ) : items.length === 0 ? (
        <View style={[s.center, { paddingBottom: 60 }]}>
          <PackageIcon size={52} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyText}>
            {searchQ ? 'No matches found' : 'Catalog is empty\nUse Rapid Scan or Manual Add to get started'}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={s.flex}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.secondary} />}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.totalLabel}>{items.length} product{items.length !== 1 ? 's' : ''} in catalog</Text>

          {grouped.map(([cat, catItems]) => (
            <View key={cat}>
              <View style={s.catHeader}>
                <Text style={s.catName}>{cat}</Text>
                <View style={s.catBadge}><Text style={s.catCount}>{catItems.length}</Text></View>
              </View>
              {catItems.map((item: any) => (
                <View key={item.id} style={s.itemRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.itemName} numberOfLines={1}>{item.name}</Text>
                    <Text style={s.itemMeta}>
                      {sourceLabel(item.source, item.barcode)}
                      {item.barcode && !item.barcode.startsWith('NOBARCODE_') ? `  ·  ${item.barcode}` : ''}
                      {item.scanCount > 1 ? `  ·  scanned ${item.scanCount}×` : ''}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={s.delBtn}
                    onPress={() => confirmDelete(item.id, item.name)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    disabled={deleteMut.isPending}
                  >
                    <Trash2Icon size={15} color="#EF4444" strokeWidth={2} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const DARK       = 'rgba(0,0,0,0.52)';
const FRAME      = 220;
const CRN        = 26;
const CRN_W      = 3;

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: COLORS.background },
  flex:        { flex: 1 },
  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  // Header
  header:      { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.secondary, paddingHorizontal: 16, paddingVertical: 14 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },

  // Tab bar
  tabBar:      { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  tabBtn:      { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11 },
  tabBtnActive:{ borderBottomWidth: 2, borderBottomColor: COLORS.secondary },
  tabLabel:    { fontSize: 12, fontWeight: '600', color: COLORS.textMuted },
  tabLabelActive:{ color: COLORS.secondary },

  // Camera
  cameraWrap:  { flex: 1, overflow: 'hidden', backgroundColor: '#000' },
  ovTop:       { position: 'absolute', top: 0, left: 0, right: 0, height: '20%', backgroundColor: DARK },
  ovBottom:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', backgroundColor: DARK },
  ovLeft:      { position: 'absolute', top: '20%', left: 0, width: '12%', bottom: '20%', backgroundColor: DARK },
  ovRight:     { position: 'absolute', top: '20%', right: 0, width: '12%', bottom: '20%', backgroundColor: DARK },
  frameWrap:   { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame:       { width: FRAME, height: FRAME, position: 'relative' },
  corner:      { position: 'absolute', width: CRN, height: CRN },
  cTL: { top: 0, left: 0,  borderTopWidth: CRN_W, borderLeftWidth: CRN_W,  borderColor: '#fff', borderTopLeftRadius: 5 },
  cTR: { top: 0, right: 0, borderTopWidth: CRN_W, borderRightWidth: CRN_W, borderColor: '#fff', borderTopRightRadius: 5 },
  cBL: { bottom: 0, left: 0,  borderBottomWidth: CRN_W, borderLeftWidth: CRN_W,  borderColor: '#fff', borderBottomLeftRadius: 5 },
  cBR: { bottom: 0, right: 0, borderBottomWidth: CRN_W, borderRightWidth: CRN_W, borderColor: '#fff', borderBottomRightRadius: 5 },

  // Scan panel
  panel:       { backgroundColor: '#fff', padding: 16, minHeight: 110, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border },
  phaseRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  phaseHint:   { fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },

  resultBanner:{ flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12 },
  bannerGreen: { backgroundColor: '#F0FDF4' },
  bannerGray:  { backgroundColor: '#F8F9FA' },
  bannerLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  bannerName:  { fontSize: 15, fontWeight: '700', color: COLORS.text, marginTop: 2 },

  namingLabel:   { fontSize: 13, fontWeight: '600', color: COLORS.text, marginBottom: 8 },
  namingInput:   { backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: COLORS.text },
  namingActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  skipBtn:       { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  skipBtnText:   { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  saveBtn:       { flex: 1, backgroundColor: COLORS.secondary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtnText:   { fontSize: 14, fontWeight: '700', color: '#fff' },

  // Permission
  permText:    { fontSize: 15, color: COLORS.text, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  permBtn:     { backgroundColor: COLORS.secondary, paddingHorizontal: 28, paddingVertical: 13, borderRadius: 12 },
  permBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  // Manual tab
  manualHint:  { fontSize: 13, color: COLORS.textMuted, lineHeight: 19, marginBottom: 20 },
  fieldLabel:  { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 7 },
  required:    { color: COLORS.primary, fontWeight: '700' },
  optional:    { fontWeight: '400', color: COLORS.textMuted },
  fieldInput:  { backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: COLORS.text },
  addBtn:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, backgroundColor: COLORS.secondary, borderRadius: 13, paddingVertical: 15, marginTop: 22, shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6, elevation: 4 },
  addBtnText:  { color: '#fff', fontSize: 15, fontWeight: '700' },

  sugg:     { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99, backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 2, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 8 },
  suggRow:  { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  suggText: { fontSize: 14, color: COLORS.text },

  recentHeader: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  recentRow:    { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  recentName:   { flex: 1, fontSize: 14, color: COLORS.text, fontWeight: '500' },
  recentCat:    { fontSize: 12, color: COLORS.textMuted, backgroundColor: COLORS.background, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },

  // Browse tab
  searchBar:   { backgroundColor: '#fff', padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  searchInput: { backgroundColor: COLORS.background, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14, color: COLORS.text },
  emptyText:   { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 22, marginTop: 16 },
  totalLabel:  { fontSize: 12, color: COLORS.textMuted, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 10 },
  catHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: COLORS.background },
  catName:     { fontSize: 13, fontWeight: '800', color: COLORS.secondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  catBadge:    { backgroundColor: `${COLORS.secondary}18`, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  catCount:    { fontSize: 12, fontWeight: '700', color: COLORS.secondary },
  itemRow:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border },
  itemName:    { fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemMeta:    { fontSize: 11, color: COLORS.textMuted, marginTop: 2 },
  delBtn:      { paddingLeft: 12, paddingVertical: 4 },
});
