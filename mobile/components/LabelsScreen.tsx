import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Modal, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { labelsApi } from '../services/api';
import { COLORS } from '../constants';
import { TagIcon, XIcon, CheckCircleIcon, EditIcon, CameraIcon } from './Icons';
import BarcodeScannerModal, { BarcodeResult } from './BarcodeScannerModal';
import { printLabels } from '../utils/printLabels';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  barcode: string | null;
  template: string;
  updatedAt: string;
}

const TEMPLATES: { value: string; label: string; color: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black', color: '#c0392b' },
  { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter', color: '#1e7a3d' },
  { value: 'SUMMER', label: 'Summer', color: '#f59e0b' },
];

export default function LabelsScreen() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formBarcode, setFormBarcode] = useState<string | null>(null);
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mobile-labels'],
    queryFn: labelsApi.getAll,
  });
  const labels: Label[] = data?.data?.data || [];

  function openCreateForm(scanned: BarcodeResult) {
    const existing = labels.find(l => l.barcode && l.barcode === scanned.barcode);
    if (existing) {
      openEditForm(existing);
      return;
    }
    setEditingLabel(null);
    setFormProductName(scanned.name);
    setFormPriceText('');
    setFormBarcode(scanned.barcode);
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowForm(true);
  }

  function openEditForm(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormBarcode(label.barcode);
    setFormTemplate(label.template);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormBarcode(null);
    setFormTemplate('CLASSIC_RED_BLACK');
  }

  async function handleSave() {
    const productName = formProductName.trim();
    const priceText = formPriceText.trim();
    if (!productName || !priceText || saving) return;
    setSaving(true);
    try {
      if (editingLabel) {
        await labelsApi.update(editingLabel.id, { productName, priceText, barcode: formBarcode, template: formTemplate });
      } else {
        const res = await labelsApi.create({ productName, priceText, barcode: formBarcode, template: formTemplate });
        const newId = res.data?.data?.id;
        if (newId) setSelectedIds(prev => new Set(prev).add(newId));
      }
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      Toast.show({ type: 'success', text1: editingLabel ? 'Label updated' : 'Label added' });
      closeForm();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to save label' });
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
      Toast.show({ type: 'success', text1: 'Label removed' });
      closeForm();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to remove label' });
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      await printLabels({ labels: toPrint, shareAsPdf });
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
        onClose={() => setShowScanner(false)}
        onResult={(result) => { setShowScanner(false); openCreateForm(result); }}
      />

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={s.formOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.formSheet}>
            <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
              <View style={s.formHeader}>
                <Text style={s.formTitle}>{editingLabel ? 'Edit Label' : 'New Label'}</Text>
                <TouchableOpacity onPress={closeForm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
                  <XIcon size={20} color={COLORS.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {formBarcode && (
                <View style={s.barcodeChip}>
                  <Text style={s.barcodeChipLabel}>Barcode</Text>
                  <Text style={s.barcodeChipValue}>{formBarcode}</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>Product Name</Text>
              <TextInput
                style={s.fieldInput}
                value={formProductName}
                onChangeText={setFormProductName}
                placeholder="e.g. Monster Energy 16oz"
                placeholderTextColor="#B0B8C4"
                maxLength={120}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Price / Deal Text</Text>
              <TextInput
                style={s.fieldInput}
                value={formPriceText}
                onChangeText={setFormPriceText}
                placeholder='e.g. "$3.99" or "2 for $5"'
                placeholderTextColor="#B0B8C4"
                maxLength={40}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Template</Text>
              <View style={s.templateRow}>
                {TEMPLATES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.templateChip, formTemplate === t.value && s.templateChipActive]}
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
                style={[s.saveBtn, (!formProductName.trim() || !formPriceText.trim() || saving) && s.saveBtnDim]}
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

      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
        <Text style={s.headerSub}>{labels.length} in the shared catalog</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : labels.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>No labels yet</Text>
          <Text style={s.emptySub}>Scan an item to create the first one</Text>
        </View>
      ) : (
        <FlatList
          data={labels}
          keyExtractor={l => l.id}
          contentContainerStyle={s.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => {
            const checked = selectedIds.has(item.id);
            const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
            return (
              <View style={s.card}>
                <TouchableOpacity
                  style={s.checkbox}
                  onPress={() => toggleSelected(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`Select ${item.productName} for printing`}
                >
                  <View style={[s.checkboxBox, checked && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}>
                    {checked && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={s.cardBody} onPress={() => openEditForm(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.productName}`}>
                  <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{item.productName}</Text>
                    <Text style={s.cardPrice}>{item.priceText}</Text>
                    {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
                  </View>
                  <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <View style={s.footer}>
        <TouchableOpacity
          style={s.scanBtn}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan a new item to create a label"
        >
          <CameraIcon size={18} color="#fff" strokeWidth={2.5} />
          <Text style={s.scanBtnText}>New Label</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.printBtn, (selectedIds.size === 0 || printing) && s.printBtnDim]}
          onPress={() => handlePrint(false)}
          disabled={selectedIds.size === 0 || printing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Print ${selectedIds.size} selected labels`}
        >
          {printing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.printBtnText}>Print ({selectedIds.size})</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.shareBtn, (selectedIds.size === 0 || printing) && s.printBtnDim]}
          onPress={() => handlePrint(true)}
          disabled={selectedIds.size === 0 || printing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Export ${selectedIds.size} selected labels as PDF`}
        >
          <Text style={s.shareBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
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
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginTop: 2 },
  cardBarcode: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  footer: {
    flexDirection: 'row', gap: 8, padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: '#fff',
  },
  scanBtn: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 14,
  },
  scanBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  printBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.managerPrimary, borderRadius: 12, paddingVertical: 14,
  },
  printBtnDim: { opacity: 0.4 },
  printBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareBtn: {
    flex: 0.6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.managerPrimary, borderRadius: 12, paddingVertical: 14,
  },
  shareBtnText: { color: COLORS.managerPrimary, fontSize: 14, fontWeight: '700' },
  formOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  formScroll: { padding: 20, paddingBottom: 40 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  barcodeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 10, padding: 12, marginBottom: 16,
  },
  barcodeChipLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  barcodeChipValue: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: COLORS.text,
  },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  templateChipActive: { borderColor: COLORS.secondary, backgroundColor: '#eff6ff' },
  templateSwatch: { width: 10, height: 10, borderRadius: 5 },
  templateChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  saveBtnDim: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },
});
