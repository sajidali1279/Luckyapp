import React, { useState, useEffect, useRef } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  StatusBar, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS } from '../constants';
import { XIcon, CheckCircleIcon, PackageIcon } from './Icons';
import { scannedProductApi, orderCategoriesApi } from '../services/api';

export interface BarcodeResult {
  name:     string;
  category: string | null;
  barcode:  string;
  quantity: string;          // always present — empty string if user skipped
  source:   'catalog' | 'openfoodfacts' | 'manual';
}

type Phase = 'scanning' | 'loading' | 'found' | 'naming' | 'done';

interface Props {
  visible:      boolean;
  onClose:      () => void;
  onResult:     (result: BarcodeResult) => void;
  hideQuantity?: boolean;
  confirmLabel?: string;
}

function mapOFFCategory(tags: string[]): string | null {
  const enTags = tags
    .filter(t => t.startsWith('en:'))
    .map(t => t.replace('en:', '').replace(/-/g, ' '));
  if (enTags.length === 0) return null;
  const last  = enTags[enTags.length - 1];
  const lower = last.toLowerCase();
  if (lower.includes('frozen'))                                       return 'Frozen Foods';
  if (lower.includes('tobacco') || lower.includes('cigar'))          return 'Tobacco / Vapes';
  if (lower.includes('dairy') || lower.includes('milk') || lower.includes('cheese')) return 'Groceries';
  if (lower.includes('snack') || lower.includes('chip') || lower.includes('candy'))  return 'Groceries';
  if (lower.includes('beverage') || lower.includes('drink') || lower.includes('juice')) return 'Groceries';
  return last.charAt(0).toUpperCase() + last.slice(1);
}

export default function BarcodeScannerModal({ visible, onClose, onResult, hideQuantity = false, confirmLabel = 'Add to List' }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [phase,        setPhase]        = useState<Phase>('scanning');
  const [lastCode,     setLastCode]     = useState('');
  const [barcode,      setBarcode]      = useState('');

  // Found-phase state
  const [foundName,    setFoundName]    = useState('');
  const [foundCat,     setFoundCat]     = useState<string | null>(null);
  const [foundSource,  setFoundSource]  = useState<'catalog' | 'openfoodfacts' | 'manual'>('catalog');
  const [quantity,     setQuantity]     = useState('');

  // Naming-phase state
  const [productName,  setProductName]  = useState('');
  const [category,     setCategory]     = useState('');
  const [catSuggs,     setCatSuggs]     = useState<string[]>([]);
  const [showCatSugg,  setShowCatSugg]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [lookupError,  setLookupError]  = useState('');

  const [approvedCats, setApprovedCats] = useState<string[]>([]);

  const qtyRef      = useRef<TextInput>(null);
  const nameRef     = useRef<TextInput>(null);
  const manualInputRef = useRef<TextInput>(null);

  // Manual entry — a fallback for a worn/damaged barcode, or just faster
  // than lining up the camera when the number's already visible/known.
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode,   setManualBarcode]   = useState('');

  // The camera fires onBarcodeScanned on every frame it can decode, not
  // once per code — without a confirmation delay, a brief/incidental read
  // (camera shake, a neighboring product's barcode drifting into frame)
  // gets acted on immediately. Require the same code to be read
  // consistently for SCAN_CONFIRM_DELAY_MS before it's accepted.
  const pendingCodeRef  = useRef<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearPendingScan() {
    pendingCodeRef.current = null;
    if (confirmTimerRef.current) {
      clearTimeout(confirmTimerRef.current);
      confirmTimerRef.current = null;
    }
  }

  useEffect(() => {
    if (visible) {
      setPhase('scanning'); setLastCode(''); setBarcode('');
      setFoundName(''); setFoundCat(null); setQuantity('');
      setProductName(''); setCategory(''); setSaving(false); setLookupError('');
      setShowManualEntry(false); setManualBarcode('');
      clearPendingScan();
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    } else {
      clearPendingScan();
    }
  }, [visible]);

  useEffect(() => {
    if (!category.trim()) { setCatSuggs([]); return; }
    const q = category.toLowerCase();
    setCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowCatSugg(true);
  }, [category, approvedCats]);

  const SCAN_CONFIRM_DELAY_MS = 400;

  // ── Barcode scanned callback (fires on every camera frame) ─────────────────
  function handleBarcodeDetected(result: { data: string }) {
    if (phase !== 'scanning') return;
    if (result.data === pendingCodeRef.current) return; // already confirming this code
    pendingCodeRef.current = result.data;
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => {
      confirmTimerRef.current = null;
      handleScan(result);
    }, SCAN_CONFIRM_DELAY_MS);
  }

  // ── Confirmed scan — actually look up/act on the code ───────────────────────
  async function handleScan({ data }: { data: string }) {
    if (phase !== 'scanning' || data === lastCode) return;
    setLastCode(data);
    setBarcode(data);
    setPhase('loading');
    setLookupError('');

    try {
      // 1. Check our catalog first (instant if cached)
      const catalogRes = await scannedProductApi.lookup(data);
      const cached     = catalogRes.data?.data;
      if (cached?.name) {
        showFound(cached.name, cached.category ?? null, 'catalog');
        return;
      }
    } catch {
      // Network error on lookup — don't silently drop to naming form,
      // fall through to Open Food Facts instead
    }

    try {
      // 2. Try Open Food Facts
      const offRes = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(data)}.json?fields=product_name,product_name_en,categories_tags,brands`,
        { headers: { 'User-Agent': 'LuckyStop-App/1.0' }, signal: AbortSignal.timeout(6000) }
      );
      const offJson = await offRes.json();

      if (offJson.status === 1 && offJson.product) {
        const name = (offJson.product.product_name_en || offJson.product.product_name || '').trim();
        const cat  = mapOFFCategory(offJson.product.categories_tags || []);
        const brand= (offJson.product.brands || '').split(',')[0].trim() || undefined;

        if (name) {
          scannedProductApi.save({ barcode: data, name, category: cat ?? undefined, brand, source: 'openfoodfacts' }).catch(() => {});
          showFound(name, cat, 'openfoodfacts');
          return;
        }
      }
    } catch { /* fall through */ }

    // 3. Not found anywhere → naming form
    setPhase('naming');
    setTimeout(() => nameRef.current?.focus(), 300);
  }

  function submitManualBarcode() {
    const code = manualBarcode.trim();
    if (!code) return;
    setShowManualEntry(false);
    setManualBarcode('');
    handleScan({ data: code });
  }

  function showFound(name: string, cat: string | null, src: 'catalog' | 'openfoodfacts') {
    setFoundName(name);
    setFoundCat(cat);
    setFoundSource(src);
    setQuantity('');
    setPhase('found');
    if (!hideQuantity) setTimeout(() => qtyRef.current?.focus(), 300);
  }

  // ── Confirm found product ──────────────────────────────────────────────────
  function handleConfirmFound() {
    onResult({ name: foundName, category: foundCat, barcode, quantity: quantity.trim(), source: foundSource });
    setPhase('done');
  }

  // ── Save manually named product ────────────────────────────────────────────
  async function handleSaveAndAdd() {
    const name = productName.trim();
    const cat = category.trim();
    if (!name || saving) return;
    setSaving(true);
    // Silently submit a brand-new category for DevAdmin approval — same
    // pipeline Order List/Stock Request already feed, so a category typed
    // here (from any caller of this modal, including Labels) doesn't
    // silently bypass approval.
    if (cat && !approvedCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      orderCategoriesApi.submitNew(cat).catch(() => {});
    }
    try {
      await scannedProductApi.save({ barcode, name, category: cat || undefined, source: 'manual' });
      onResult({ name, category: cat || null, barcode, quantity: '', source: 'manual' });
      setPhase('done');
    } catch (err: any) {
      setSaving(false);
      const msg = err?.response?.data?.error || err?.message || 'Could not save product. Check your connection.';
      Alert.alert('Save failed', msg, [
        { text: 'Add anyway (won\'t remember)', onPress: () => {
          onResult({ name, category: cat || null, barcode, quantity: '', source: 'manual' });
          setPhase('done');
        }},
        { text: 'Try again', style: 'cancel' },
      ]);
      return;
    }
    setSaving(false);
  }

  function scanAgain() {
    setPhase('scanning');
    setLastCode('');
    setBarcode('');
    setProductName('');
    setCategory('');
    clearPendingScan();
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const headerTitle =
    phase === 'found'  ? 'Confirm Product' :
    phase === 'naming' ? 'Name This Product' : 'Scan Barcode';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar
        barStyle={phase === 'scanning' || phase === 'loading' ? 'light-content' : 'dark-content'}
        backgroundColor={phase === 'scanning' || phase === 'loading' ? '#000' : COLORS.background}
      />
      <SafeAreaView style={[{ flex: 1 }, phase === 'scanning' || phase === 'loading' ? { backgroundColor: '#000' } : { backgroundColor: COLORS.background }]} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={[st.header, phase === 'scanning' || phase === 'loading' ? { backgroundColor: '#000' } : { backgroundColor: COLORS.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border }]}>
          <TouchableOpacity
            onPress={onClose}
            style={st.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Close scanner"
          >
            <XIcon size={22} color={phase === 'scanning' || phase === 'loading' ? '#fff' : COLORS.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[st.title, phase !== 'scanning' && phase !== 'loading' && { color: COLORS.text }]}>{headerTitle}</Text>
          <View style={{ width: 42 }} />
        </View>

        {/* ── No camera permission ─────────────────────────────────────────── */}
        {!permission ? (
          <View style={st.center}>
            <ActivityIndicator color="#fff" size="large" />
          </View>
        ) : !permission.granted ? (
          <View style={st.center}>
            <Text style={st.permText}>Camera access is required to scan barcodes.</Text>
            <TouchableOpacity
              style={st.permBtn}
              onPress={requestPermission}
              accessibilityRole="button"
              accessibilityLabel="Allow camera access"
            >
              <Text style={st.permBtnText}>Allow Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={st.cancelLink}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            >
              <Text style={st.cancelLinkText}>Cancel</Text>
            </TouchableOpacity>
          </View>

        /* ── Scanning / Loading ───────────────────────────────────────────── */
        ) : phase === 'scanning' || phase === 'loading' ? (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={phase === 'scanning' ? handleBarcodeDetected : undefined}
              barcodeScannerSettings={{ barcodeTypes: ['ean13','ean8','upc_a','upc_e','code128','code39','itf14'] }}
            />
            <View style={st.overlayTop} />
            <View style={st.overlayBottom} />
            <View style={st.overlaySideLeft} />
            <View style={st.overlaySideRight} />
            <View style={st.frameWrapper} pointerEvents="none">
              <View style={st.frame}>
                <View style={[st.corner, st.cornerTL]} />
                <View style={[st.corner, st.cornerTR]} />
                <View style={[st.corner, st.cornerBL]} />
                <View style={[st.corner, st.cornerBR]} />
              </View>
            </View>
            <View style={st.statusBox}>
              {phase === 'loading' ? (
                <View style={st.statusRow}>
                  <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                  <Text style={st.statusText}>Looking up product…</Text>
                </View>
              ) : (
                <>
                  <Text style={st.statusText}>Point camera at a barcode</Text>
                  <TouchableOpacity
                    onPress={() => setShowManualEntry(true)}
                    style={st.manualEntryLink}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Enter barcode manually instead of scanning"
                  >
                    <Text style={st.manualEntryLinkText}>Enter barcode manually</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {showManualEntry && (
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={st.manualEntryOverlay}
              >
                <View style={st.manualEntryCard}>
                  <Text style={st.manualEntryTitle}>Enter Barcode</Text>
                  <TextInput
                    ref={manualInputRef}
                    style={st.manualEntryInput}
                    value={manualBarcode}
                    onChangeText={setManualBarcode}
                    placeholder="Type the barcode number"
                    placeholderTextColor="#B0B8C4"
                    autoFocus
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={submitManualBarcode}
                  />
                  <View style={st.manualEntryRow}>
                    <TouchableOpacity
                      style={st.manualEntryCancel}
                      onPress={() => { setShowManualEntry(false); setManualBarcode(''); }}
                      accessibilityRole="button"
                      accessibilityLabel="Cancel manual entry"
                    >
                      <Text style={st.manualEntryCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[st.manualEntrySubmit, !manualBarcode.trim() && st.addBtnDim]}
                      onPress={submitManualBarcode}
                      disabled={!manualBarcode.trim()}
                      accessibilityRole="button"
                      accessibilityLabel="Look up this barcode"
                    >
                      <Text style={st.manualEntrySubmitText}>Look Up</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            )}
          </View>

        /* ── Found — show details + qty input ────────────────────────────── */
        ) : phase === 'found' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
            >
              {/* Product card */}
              <View style={st.foundCard}>
                <View style={st.foundIconWrap}>
                  <PackageIcon size={28} color={COLORS.secondary} strokeWidth={1.75} />
                </View>
                <Text style={st.foundName}>{foundName}</Text>
                {foundCat ? (
                  <View style={st.catChip}>
                    <Text style={st.catChipText}>{foundCat}</Text>
                  </View>
                ) : null}
                <View style={st.sourceRow}>
                  <View style={[st.sourceBadge, foundSource === 'catalog' && st.sourceBadgeCatalog]}>
                    <Text style={[st.sourceBadgeText, foundSource === 'catalog' && st.sourceBadgeTextCatalog]}>
                      {foundSource === 'catalog' ? 'From store catalog' : 'From Open Food Facts'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Barcode */}
              <Text style={st.barcodeSmall}>{barcode}</Text>

              {/* Qty input — hidden for callers that don't use quantity (e.g. Labels) */}
              {!hideQuantity && (
                <>
                  <Text style={st.fieldLabel}>Quantity  <Text style={st.fieldLabelSub}>(optional — leave blank if not needed)</Text></Text>
                  <TextInput
                    ref={qtyRef}
                    style={[st.fieldInput, st.qtyInput]}
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="e.g. 5"
                    placeholderTextColor="#B0B8C4"
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={handleConfirmFound}
                    maxLength={10}
                    selectTextOnFocus
                  />
                </>
              )}

              {/* Add button */}
              <TouchableOpacity
                style={st.addBtn}
                onPress={handleConfirmFound}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Add product to list"
              >
                <CheckCircleIcon size={18} color="#fff" strokeWidth={2.5} />
                <Text style={st.addBtnText}>{confirmLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={st.scanAgainBtn}
                onPress={scanAgain}
                accessibilityRole="button"
                accessibilityLabel="Scan a different product"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={st.scanAgainText}>Not this product? Scan again</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>

        /* ── Naming — product not found anywhere ─────────────────────────── */
        ) : phase === 'naming' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={st.barcodeChip}>
                <Text style={st.barcodeChipLabel}>Barcode</Text>
                <Text style={st.barcodeChipValue}>{barcode}</Text>
              </View>

              <Text style={st.namingHint}>
                This barcode isn't in your store catalog or Open Food Facts yet.{'\n'}
                Name it once — future scans will show it instantly.
              </Text>

              <Text style={st.fieldLabel}>Product name  <Text style={st.fieldLabelRequired}>*</Text></Text>
              <TextInput
                ref={nameRef}
                style={st.fieldInput}
                value={productName}
                onChangeText={setProductName}
                placeholder="e.g. Whole Milk 1 Gallon"
                placeholderTextColor="#B0B8C4"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                maxLength={200}
              />

              <Text style={[st.fieldLabel, { marginTop: 16 }]}>Category  <Text style={st.fieldLabelSub}>(optional)</Text></Text>
              <View style={{ position: 'relative' }}>
                <TextInput
                  style={st.fieldInput}
                  value={category}
                  onChangeText={v => { setCategory(v); setShowCatSugg(true); }}
                  onFocus={() => setShowCatSugg(catSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowCatSugg(false), 130)}
                  placeholder="e.g. Dairy, Frozen Foods…"
                  placeholderTextColor="#B0B8C4"
                  autoCapitalize="words"
                  autoCorrect={false}
                  returnKeyType="done"
                  maxLength={100}
                />
                {showCatSugg && catSuggs.length > 0 && (
                  <View style={st.catSugg}>
                    {catSuggs.map(c => (
                      <TouchableOpacity key={c} style={st.catSuggRow}
                        onPress={() => { setCategory(c); setShowCatSugg(false); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Use category ${c}`}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={st.catSuggText}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[st.addBtn, (!productName.trim() || saving) && st.addBtnDim]}
                onPress={handleSaveAndAdd}
                disabled={!productName.trim() || saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Save and add product to list"
              >
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <CheckCircleIcon size={18} color="#fff" strokeWidth={2.5} />
                      <Text style={st.addBtnText}>{`Save & ${confirmLabel}`}</Text>
                    </>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={st.scanAgainBtn}
                onPress={scanAgain}
                accessibilityRole="button"
                accessibilityLabel="Scan a different barcode"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={st.scanAgainText}>Scan a different barcode</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}

      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const FRAME_SIZE  = 240;
const DARK        = 'rgba(0,0,0,0.55)';
const CORNER_SIZE = 28;
const CORNER_W    = 3;

const st = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 14,
  },
  closeBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#fff' },

  center:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#111' },
  permText:    { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 24 },
  permBtn:     { backgroundColor: COLORS.secondary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelLink:  { marginTop: 16 },
  cancelLinkText: { color: 'rgba(255,255,255,0.6)', fontSize: 14 },

  overlayTop:       { position: 'absolute', top: 0, left: 0, right: 0, height: '25%', backgroundColor: DARK },
  overlayBottom:    { position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%', backgroundColor: DARK },
  overlaySideLeft:  { position: 'absolute', top: '25%', left: 0, width: '12%', bottom: '32%', backgroundColor: DARK },
  overlaySideRight: { position: 'absolute', top: '25%', right: 0, width: '12%', bottom: '32%', backgroundColor: DARK },

  frameWrapper: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame:        { width: FRAME_SIZE, height: FRAME_SIZE, position: 'relative' },
  corner:       { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderColor: '#fff', borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderColor: '#fff', borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderColor: '#fff', borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderColor: '#fff', borderBottomRightRadius: 6 },

  statusBox:  { position: 'absolute', bottom: '28%', left: 0, right: 0, alignItems: 'center', paddingTop: 20 },
  statusRow:  { flexDirection: 'row', alignItems: 'center' },
  statusText: {
    color: '#fff', fontSize: 14, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // Found card
  foundCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 20, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    marginBottom: 8,
  },
  foundIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: `${COLORS.secondary}15`,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  foundName: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 26, marginBottom: 10 },
  catChip: {
    backgroundColor: `${COLORS.secondary}18`, paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 20, marginBottom: 10,
  },
  catChipText: { fontSize: 13, fontWeight: '600', color: COLORS.secondary },
  sourceRow:   { flexDirection: 'row' },
  sourceBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  sourceBadgeCatalog: { backgroundColor: '#DCFCE7' },
  sourceBadgeText:        { fontSize: 11, fontWeight: '600', color: '#64748B' },
  sourceBadgeTextCatalog: { color: '#15803D' },

  barcodeSmall: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginBottom: 24, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  fieldLabel:        { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldLabelSub:     { fontWeight: '400', color: COLORS.textMuted },
  fieldLabelRequired:{ fontWeight: '400', color: COLORS.textMuted },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: COLORS.text,
  },
  qtyInput: { fontSize: 22, fontWeight: '700', textAlign: 'center', letterSpacing: 2 },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16,
    marginTop: 24,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  addBtnDim:  { opacity: 0.4, shadowOpacity: 0, elevation: 0 },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  catSugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
    backgroundColor: '#fff', borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10, marginTop: 2, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 6, elevation: 8,
  },
  catSuggRow:  { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  catSuggText: { fontSize: 14, color: COLORS.text },

  barcodeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 10, padding: 12, marginBottom: 16,
  },
  barcodeChipLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  barcodeChipValue: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  namingHint: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20, marginBottom: 24 },

  scanAgainBtn:  { alignItems: 'center', marginTop: 16, paddingVertical: 12 },
  scanAgainText: { fontSize: 14, color: COLORS.secondary, fontWeight: '600' },

  manualEntryLink: { marginTop: 14, paddingVertical: 6, paddingHorizontal: 10 },
  manualEntryLinkText: {
    color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  manualEntryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  manualEntryCard: {
    width: '100%', maxWidth: 340,
    backgroundColor: '#fff', borderRadius: 16, padding: 20,
  },
  manualEntryTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  manualEntryInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: COLORS.text,
  },
  manualEntryRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  manualEntryCancel: {
    flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  manualEntryCancelText: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  manualEntrySubmit: {
    flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12,
    backgroundColor: COLORS.secondary,
  },
  manualEntrySubmitText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
