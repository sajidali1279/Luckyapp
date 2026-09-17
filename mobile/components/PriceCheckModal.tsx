import React, { useState, useRef, useEffect } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator,
  StatusBar, TextInput, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { COLORS } from '../constants';
import { XIcon, DollarSignIcon, PlusIcon, CheckCircleIcon } from './Icons';
import { labelsApi, scannedProductApi, orderCategoriesApi } from '../services/api';

type Phase = 'scanning' | 'loading' | 'result' | 'naming';
type PrintStatus = 'not_added' | 'new' | 'needs_reprint' | 'needs_price' | 'printed';

interface LookupResult {
  found: boolean;
  barcode: string;
  id?: string;
  productName?: string;
  category?: string | null;
  basePriceText?: string | null;
  dealText?: string | null;
  priceText?: string | null;
  hasOverride?: boolean;
  status?: PrintStatus;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  storeId: string;
}

const STATUS_LABEL: Record<PrintStatus, string> = {
  not_added: 'Not added',
  new: 'New — not printed yet',
  needs_reprint: 'Needs reprint — price changed',
  needs_price: 'No price set yet',
  printed: 'Printed and up to date',
};
const STATUS_COLOR: Record<PrintStatus, string> = {
  not_added: '#8892a0',
  new: '#2563eb',
  needs_reprint: '#b7791f',
  needs_price: '#b7791f',
  printed: '#15803d',
};

// A slimmer sibling to BarcodeScannerModal: same camera-viewfinder + manual-
// entry scanning shell, but the destination is a straight price lookup
// against this store's label catalog instead of a name/quantity capture
// flow feeding into Order List/Stock Request/Labels-create.
export default function PriceCheckModal({ visible, onClose, storeId }: Props) {
  const qc = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>('scanning');
  const [lastCode, setLastCode] = useState('');
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [adding, setAdding] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const manualInputRef = useRef<TextInput>(null);

  // Naming/registration phase (unrecognized barcode) — same lightweight
  // pattern as BarcodeScannerModal's "name this product" prompt.
  const [productName, setProductName] = useState('');
  const [category, setCategory] = useState('');
  const [catSuggs, setCatSuggs] = useState<string[]>([]);
  const [showCatSugg, setShowCatSugg] = useState(false);
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [registering, setRegistering] = useState(false);
  const [justRegistered, setJustRegistered] = useState(false);
  const nameRef = useRef<TextInput>(null);

  const pendingCodeRef = useRef<string | null>(null);
  const confirmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const SCAN_CONFIRM_DELAY_MS = 400;

  function clearPendingScan() {
    pendingCodeRef.current = null;
    if (confirmTimerRef.current) { clearTimeout(confirmTimerRef.current); confirmTimerRef.current = null; }
  }

  useEffect(() => {
    if (visible) {
      setPhase('scanning'); setLastCode(''); setBarcode(''); setResult(null); setAdding(false);
      setShowManualEntry(false); setManualBarcode('');
      setProductName(''); setCategory(''); setRegistering(false); setJustRegistered(false);
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

  function handleBarcodeDetected(r: { data: string }) {
    if (phase !== 'scanning') return;
    if (r.data === pendingCodeRef.current) return;
    pendingCodeRef.current = r.data;
    if (confirmTimerRef.current) clearTimeout(confirmTimerRef.current);
    confirmTimerRef.current = setTimeout(() => { confirmTimerRef.current = null; handleScan(r); }, SCAN_CONFIRM_DELAY_MS);
  }

  async function handleScan({ data }: { data: string }) {
    if (phase !== 'scanning' || data === lastCode) return;
    setLastCode(data);
    setBarcode(data);
    setPhase('loading');
    try {
      const res = await labelsApi.lookupByBarcode(storeId, data);
      const found = res.data?.data ?? { found: false, barcode: data };
      setResult(found);
      setPhase(found.found ? 'result' : 'naming');
    } catch {
      setResult({ found: false, barcode: data });
      setPhase('naming');
    }
  }

  function submitManualBarcode() {
    const code = manualBarcode.trim();
    if (!code) return;
    setShowManualEntry(false);
    setManualBarcode('');
    handleScan({ data: code });
  }

  function scanAgain() {
    setPhase('scanning');
    setLastCode('');
    setBarcode('');
    setResult(null);
    setProductName(''); setCategory(''); setJustRegistered(false);
    clearPendingScan();
  }

  async function handleAddToMyPrints() {
    if (!result?.id || adding) return;
    setAdding(true);
    try {
      await labelsApi.addToStore(result.id, storeId);
      qc.invalidateQueries({ queryKey: ['store-labels', storeId] });
      qc.invalidateQueries({ queryKey: ['mobile-labels', 'catalog-all', storeId] });
      const newStatus: PrintStatus = result.basePriceText != null ? 'new' : 'needs_price';
      Toast.show({
        type: 'success',
        text1: 'Added to My Prints',
        text2: result.basePriceText != null ? `At base price $${result.basePriceText}` : 'No price set yet',
      });
      setResult({ ...result, status: newStatus, priceText: result.basePriceText ?? null, hasOverride: false });
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to add' });
    }
    setAdding(false);
  }

  async function handleRegister() {
    const name = productName.trim();
    const cat = category.trim();
    if (!name || registering) return;
    setRegistering(true);
    // Silently submit a brand-new category for DevAdmin approval — same
    // pipeline BarcodeScannerModal/Order List/Stock Request already feed.
    if (cat && !approvedCats.some(c => c.toLowerCase() === cat.toLowerCase())) {
      orderCategoriesApi.submitNew(cat).catch(() => {});
    }
    try {
      await scannedProductApi.save({ barcode, name, category: cat || undefined, source: 'manual' });
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
      setJustRegistered(true);
    } catch {
      Toast.show({ type: 'error', text1: 'Failed to save product' });
    }
    setRegistering(false);
  }

  const isDark = phase === 'scanning' || phase === 'loading';

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <SafeAreaView style={[{ flex: 1 }, isDark ? { backgroundColor: '#000' } : { backgroundColor: COLORS.background }]} edges={['top', 'bottom']}>

        <View style={[st.header, isDark ? { backgroundColor: '#000' } : { backgroundColor: COLORS.background, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border }]}>
          <TouchableOpacity onPress={onClose} style={st.closeBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close price check">
            <XIcon size={22} color={isDark ? '#fff' : COLORS.textMuted} strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[st.title, !isDark && { color: COLORS.text }]}>Price Check</Text>
          <View style={{ width: 42 }} />
        </View>

        {!permission ? (
          <View style={st.center}><ActivityIndicator color="#fff" size="large" /></View>
        ) : !permission.granted ? (
          <View style={st.center}>
            <Text style={st.permText}>Camera access is required to scan barcodes.</Text>
            <TouchableOpacity style={st.permBtn} onPress={requestPermission} accessibilityRole="button" accessibilityLabel="Allow camera access">
              <Text style={st.permBtnText}>Allow Camera</Text>
            </TouchableOpacity>
          </View>

        ) : phase === 'scanning' || phase === 'loading' ? (
          <View style={{ flex: 1 }}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={phase === 'scanning' ? handleBarcodeDetected : undefined}
              barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14'] }}
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
                  <Text style={st.statusText}>Checking price…</Text>
                </View>
              ) : (
                <>
                  <Text style={st.statusText}>Point camera at a barcode</Text>
                  <TouchableOpacity onPress={() => setShowManualEntry(true)} style={st.manualEntryLink} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Enter barcode manually instead of scanning">
                    <Text style={st.manualEntryLinkText}>Enter barcode manually</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {showManualEntry && (
              <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={st.manualEntryOverlay}>
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
                    <TouchableOpacity style={st.manualEntryCancel} onPress={() => { setShowManualEntry(false); setManualBarcode(''); }} accessibilityRole="button" accessibilityLabel="Cancel manual entry">
                      <Text style={st.manualEntryCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.manualEntrySubmit, !manualBarcode.trim() && st.btnDim]} onPress={submitManualBarcode} disabled={!manualBarcode.trim()} accessibilityRole="button" accessibilityLabel="Look up this barcode">
                      <Text style={st.manualEntrySubmitText}>Check Price</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            )}
          </View>

        ) : phase === 'result' && result ? (
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
            <View style={st.resultCard}>
              <View style={st.iconWrap}>
                <DollarSignIcon size={28} color={COLORS.secondary} strokeWidth={1.75} />
              </View>
              <Text style={st.productName}>{result.productName}</Text>
              {result.category ? (
                <View style={st.catChip}><Text style={st.catChipText}>{result.category}</Text></View>
              ) : null}

              {result.status !== 'not_added' && result.priceText ? (
                <>
                  <Text style={st.priceBig}>${result.priceText}</Text>
                  {result.dealText ? <Text style={st.dealText}>{result.dealText}</Text> : null}
                  {result.hasOverride && <Text style={st.overrideNote}>Custom price for your store</Text>}
                  {result.status && (
                    <View style={[st.statusChip, { borderColor: STATUS_COLOR[result.status] }]}>
                      <Text style={[st.statusChipText, { color: STATUS_COLOR[result.status] }]}>{STATUS_LABEL[result.status]}</Text>
                    </View>
                  )}
                </>
              ) : (
                <>
                  <Text style={st.notAddedText}>
                    {result.status === 'needs_price' ? 'No price set yet. A manager can add one when labeling.' : 'Not priced at your store yet'}
                  </Text>
                  {result.status !== 'needs_price' && (
                    <>
                      {result.basePriceText != null && <Text style={st.baseHint}>Chain base price: ${result.basePriceText}</Text>}
                      <TouchableOpacity
                        style={[st.addBtn, adding && st.btnDim]}
                        onPress={handleAddToMyPrints}
                        disabled={adding}
                        accessibilityRole="button"
                        accessibilityLabel="Add to My Prints"
                      >
                        {adding ? <ActivityIndicator color="#fff" size="small" /> : (
                          <>
                            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
                            <Text style={st.addBtnText}>Add to My Prints</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </View>

            <Text style={st.barcodeSmall}>{result.barcode}</Text>

            <TouchableOpacity style={st.scanAgainBtn} onPress={scanAgain} accessibilityRole="button" accessibilityLabel="Check another price" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={st.scanAgainText}>Check another price</Text>
            </TouchableOpacity>
          </ScrollView>

        ) : phase === 'naming' ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {justRegistered ? (
                <View style={st.resultCard}>
                  <View style={st.iconWrap}>
                    <CheckCircleIcon size={28} color={COLORS.secondary} strokeWidth={1.75} />
                  </View>
                  <Text style={st.productName}>{productName.trim()}</Text>
                  <Text style={st.notAddedText}>No price set yet. A manager can add one when labeling.</Text>
                </View>
              ) : (
                <>
                  <View style={st.barcodeChip}>
                    <Text style={st.barcodeChipLabel}>Barcode</Text>
                    <Text style={st.barcodeChipValue}>{barcode}</Text>
                  </View>

                  <Text style={st.namingHint}>
                    This barcode isn't in the label catalog yet.{'\n'}
                    Name it once - a manager can add a price when labeling.
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
                    style={[st.addBtn, (!productName.trim() || registering) && st.btnDim]}
                    onPress={handleRegister}
                    disabled={!productName.trim() || registering}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Add product to catalog"
                  >
                    {registering ? <ActivityIndicator color="#fff" size="small" /> : (
                      <>
                        <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
                        <Text style={st.addBtnText}>Add to Catalog</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </>
              )}

              <Text style={st.barcodeSmall}>{barcode}</Text>

              <TouchableOpacity style={st.scanAgainBtn} onPress={scanAgain} accessibilityRole="button" accessibilityLabel="Check another price" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={st.scanAgainText}>Check another price</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        ) : null}

      </SafeAreaView>
    </Modal>
  );
}

const FRAME_SIZE = 240;
const DARK = 'rgba(0,0,0,0.55)';
const CORNER_SIZE = 28;
const CORNER_W = 3;

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 14 },
  closeBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: '#fff' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, backgroundColor: '#111' },
  permText: { color: '#fff', fontSize: 16, textAlign: 'center', marginBottom: 24, lineHeight: 24 },
  permBtn: { backgroundColor: COLORS.secondary, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  overlayTop: { position: 'absolute', top: 0, left: 0, right: 0, height: '25%', backgroundColor: DARK },
  overlayBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '32%', backgroundColor: DARK },
  overlaySideLeft: { position: 'absolute', top: '25%', left: 0, width: '12%', bottom: '32%', backgroundColor: DARK },
  overlaySideRight: { position: 'absolute', top: '25%', right: 0, width: '12%', bottom: '32%', backgroundColor: DARK },

  frameWrapper: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: FRAME_SIZE, height: FRAME_SIZE, position: 'relative' },
  corner: { position: 'absolute', width: CORNER_SIZE, height: CORNER_SIZE },
  cornerTL: { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W, borderColor: '#fff', borderTopLeftRadius: 6 },
  cornerTR: { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W, borderColor: '#fff', borderTopRightRadius: 6 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W, borderColor: '#fff', borderBottomLeftRadius: 6 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W, borderColor: '#fff', borderBottomRightRadius: 6 },

  statusBox: { position: 'absolute', bottom: '28%', left: 0, right: 0, alignItems: 'center', paddingTop: 20 },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusText: {
    color: '#fff', fontSize: 14, fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  resultCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4,
    marginBottom: 16,
  },
  iconWrap: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: `${COLORS.secondary}15`,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  productName: { fontSize: 19, fontWeight: '800', color: COLORS.text, textAlign: 'center', lineHeight: 25, marginBottom: 8 },
  catChip: { backgroundColor: `${COLORS.secondary}18`, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20, marginBottom: 14 },
  catChipText: { fontSize: 13, fontWeight: '600', color: COLORS.secondary },

  priceBig: { fontSize: 40, fontWeight: '900', color: COLORS.text, marginTop: 4 },
  dealText: { fontSize: 14, fontWeight: '700', color: '#b7791f', marginTop: 6 },
  overrideNote: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  statusChip: { marginTop: 14, borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  statusChipText: { fontSize: 12.5, fontWeight: '700' },

  notAddedText: { fontSize: 15, fontWeight: '600', color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },
  baseHint: { fontSize: 14, color: COLORS.text, marginTop: 8, fontWeight: '600' },

  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 20, marginTop: 18,
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDim: { opacity: 0.5 },

  barcodeSmall: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', marginBottom: 8, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },

  scanAgainBtn: { alignItems: 'center', marginTop: 16, paddingVertical: 12 },
  scanAgainText: { fontSize: 14, color: COLORS.secondary, fontWeight: '600' },

  manualEntryLink: { marginTop: 14, paddingVertical: 6, paddingHorizontal: 10 },
  manualEntryLinkText: {
    color: '#fff', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline',
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  manualEntryOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  manualEntryCard: { width: '100%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  manualEntryTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 12 },
  manualEntryInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 16, color: COLORS.text,
  },
  manualEntryRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  manualEntryCancel: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: '#F1F5F9' },
  manualEntryCancelText: { fontSize: 15, fontWeight: '700', color: COLORS.textMuted },
  manualEntrySubmit: { flex: 1, alignItems: 'center', paddingVertical: 13, borderRadius: 12, backgroundColor: COLORS.secondary },
  manualEntrySubmitText: { fontSize: 15, fontWeight: '700', color: '#fff' },

  fieldLabel:        { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldLabelSub:     { fontWeight: '400', color: COLORS.textMuted },
  fieldLabelRequired:{ fontWeight: '400', color: COLORS.textMuted },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: COLORS.text,
  },
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
});
