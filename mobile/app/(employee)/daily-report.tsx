import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Modal, TextInput, ActivityIndicator, Image,
  KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '../../store/authStore';
import { dailyReportApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  FileCheckIcon, CheckCircleIcon, CameraIcon, XIcon,
  ClockIcon, FlameIcon, GasPumpIcon,
} from '../../components/Icons';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyReport {
  id: string;
  reportDate: string;
  gasPrice: number | null;
  dieselPrice: number | null;
  regGasGal: number | null;
  midGradeGasGal: number | null;
  premiumGasGal: number | null;
  cigsCount: number | null;
  imageUrl: string | null;
  notes: string | null;
  createdAt: string;
  submittedBy: { id: string; name: string; phone: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function fmtTimeNow() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Task Box ─────────────────────────────────────────────────────────────────

function TaskBox({ done, lastReport, onPress }: { done: boolean; lastReport?: DailyReport; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[tb.card, done && tb.cardDone]}
      onPress={!done ? onPress : undefined}
      activeOpacity={done ? 1 : 0.82}
    >
      <View style={tb.left}>
        <View style={[tb.iconRing, done && tb.iconRingDone]}>
          {done
            ? <CheckCircleIcon size={22} color="#16A34A" strokeWidth={2.5} />
            : <FileCheckIcon size={22} color={COLORS.secondary} strokeWidth={2} />
          }
        </View>
        <View>
          <Text style={[tb.title, done && tb.titleDone]}>Daily Report</Text>
          {done && lastReport ? (
            <Text style={tb.subDone}>
              Submitted by {lastReport.submittedBy.name || lastReport.submittedBy.phone} at {fmtTime(lastReport.createdAt)}
            </Text>
          ) : (
            <Text style={tb.sub}>Tap to submit today's report</Text>
          )}
        </View>
      </View>

      {done ? (
        <View style={tb.donePill}>
          <Text style={tb.donePillText}>✓ Done</Text>
        </View>
      ) : (
        <View style={tb.duePill}>
          <Text style={tb.duePillText}>Due Today</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ report }: { report: DailyReport }) {
  const [expanded, setExpanded] = useState(false);
  const [imgErr, setImgErr] = useState(false);

  return (
    <TouchableOpacity style={rc.card} onPress={() => setExpanded(v => !v)} activeOpacity={0.85}>
      <View style={rc.top}>
        <View style={rc.topLeft}>
          <View style={rc.avatar}>
            <Text style={rc.avatarText}>{(report.submittedBy.name || report.submittedBy.phone)[0].toUpperCase()}</Text>
          </View>
          <View>
            <Text style={rc.name}>{report.submittedBy.name || report.submittedBy.phone}</Text>
            <View style={rc.timeRow}>
              <ClockIcon size={11} color={COLORS.textMuted} />
              <Text style={rc.time}>{fmtTime(report.createdAt)}</Text>
            </View>
          </View>
        </View>
        <Text style={rc.chevron}>{expanded ? '▲' : '▼'}</Text>
      </View>

      {/* Quick summary — always visible */}
      <View style={rc.pills}>
        {report.gasPrice != null && (
          <View style={rc.pill}><Text style={rc.pillText}>⛽ ${report.gasPrice.toFixed(3)}</Text></View>
        )}
        {report.dieselPrice != null && (
          <View style={rc.pill}><Text style={rc.pillText}>🚛 ${report.dieselPrice.toFixed(3)}</Text></View>
        )}
        {report.cigsCount != null && (
          <View style={rc.pill}><Text style={rc.pillText}>🚬 {report.cigsCount}</Text></View>
        )}
      </View>

      {expanded && (
        <View style={rc.body}>
          <View style={rc.divider} />
          {/* Prices */}
          {(report.gasPrice != null || report.dieselPrice != null) && (
            <>
              <Text style={rc.sectionLabel}>Today's Prices</Text>
              {report.gasPrice != null && <Text style={rc.detail}>Gas: ${report.gasPrice.toFixed(3)}/gal</Text>}
              {report.dieselPrice != null && <Text style={rc.detail}>Diesel: ${report.dieselPrice.toFixed(3)}/gal</Text>}
            </>
          )}
          {/* Inventory */}
          {(report.regGasGal != null || report.midGradeGasGal != null || report.premiumGasGal != null || report.cigsCount != null) && (
            <>
              <Text style={[rc.sectionLabel, { marginTop: 10 }]}>Today's Inventory</Text>
              {report.regGasGal != null && <Text style={rc.detail}>Regular Gas: {report.regGasGal} gal</Text>}
              {report.midGradeGasGal != null && <Text style={rc.detail}>Mid-Grade Gas: {report.midGradeGasGal} gal</Text>}
              {report.premiumGasGal != null && <Text style={rc.detail}>Premium Gas: {report.premiumGasGal} gal</Text>}
              {report.cigsCount != null && <Text style={rc.detail}>Cigarettes: {report.cigsCount} packs</Text>}
            </>
          )}
          {/* Notes */}
          {report.notes && (
            <>
              <Text style={[rc.sectionLabel, { marginTop: 10 }]}>Notes</Text>
              <Text style={rc.noteText}>{report.notes}</Text>
            </>
          )}
          {/* Image */}
          {report.imageUrl && !imgErr && (
            <Image
              source={{ uri: report.imageUrl }}
              style={rc.image}
              onError={() => setImgErr(true)}
              resizeMode="cover"
            />
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Submit Form Sheet ────────────────────────────────────────────────────────

interface FormSheetProps {
  visible: boolean;
  storeName: string;
  storeGasPrice?: number | null;
  storeDieselPrice?: number | null;
  onClose: () => void;
  onSubmitted: () => void;
}

function FormSheet({ visible, storeName, storeGasPrice, storeDieselPrice, onClose, onSubmitted }: FormSheetProps) {
  const now = new Date();

  const [gasPrice,       setGasPrice]       = useState(storeGasPrice != null ? storeGasPrice.toFixed(3) : '');
  const [dieselPrice,    setDieselPrice]    = useState(storeDieselPrice != null ? storeDieselPrice.toFixed(3) : '');
  const [regGasGal,      setRegGasGal]      = useState('');
  const [midGradeGasGal, setMidGradeGasGal] = useState('');
  const [premiumGasGal,  setPremiumGasGal]  = useState('');
  const [cigsCount,      setCigsCount]      = useState('');
  const [notes,          setNotes]          = useState('');
  const [imageUri,       setImageUri]       = useState<string | null>(null);
  const [submitting,     setSubmitting]     = useState(false);

  function resetForm() {
    setGasPrice(storeGasPrice != null ? storeGasPrice.toFixed(3) : '');
    setDieselPrice(storeDieselPrice != null ? storeDieselPrice.toFixed(3) : '');
    setRegGasGal(''); setMidGradeGasGal(''); setPremiumGasGal('');
    setCigsCount(''); setNotes(''); setImageUri(null);
  }

  function handleClose() { resetForm(); onClose(); }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  }

  async function takePhoto() {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Toast.show({ type: 'error', text1: 'Camera permission denied' }); return; }
    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, quality: 0.8 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  }

  function showPhotoOptions() {
    Alert.alert('Attach Photo', undefined, [
      { text: 'Take Photo',          onPress: takePhoto },
      { text: 'Choose from Library', onPress: pickImage },
      ...(imageUri ? [{ text: 'Remove', style: 'destructive' as const, onPress: () => setImageUri(null) }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('reportDate', todayStr());
      if (gasPrice.trim())       fd.append('gasPrice',       gasPrice.trim());
      if (dieselPrice.trim())    fd.append('dieselPrice',    dieselPrice.trim());
      if (regGasGal.trim())      fd.append('regGasGal',      regGasGal.trim());
      if (midGradeGasGal.trim()) fd.append('midGradeGasGal', midGradeGasGal.trim());
      if (premiumGasGal.trim())  fd.append('premiumGasGal',  premiumGasGal.trim());
      if (cigsCount.trim())      fd.append('cigsCount',      cigsCount.trim());
      if (notes.trim())          fd.append('notes',          notes.trim());
      if (imageUri) {
        const filename = imageUri.split('/').pop() ?? 'photo.jpg';
        const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        (fd as any).append('image', { uri: imageUri, name: filename, type: mime });
      }
      await dailyReportApi.submit(fd);
      Toast.show({ type: 'success', text1: 'Report submitted!' });
      resetForm();
      onSubmitted();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to submit report' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView style={fs.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={fs.sheet}>
          <View style={fs.handle} />

          {/* Header */}
          <View style={fs.header}>
            <Text style={fs.title}>Daily Report</Text>
            <TouchableOpacity onPress={handleClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            {/* ── Auto-fill info ── */}
            <View style={fs.infoBlock}>
              <View style={fs.infoRow}>
                <Text style={fs.infoLabel}>Store</Text>
                <Text style={fs.infoVal}>{storeName}</Text>
              </View>
              <View style={fs.infoRow}>
                <Text style={fs.infoLabel}>Date</Text>
                <Text style={fs.infoVal}>{now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              </View>
              <View style={fs.infoRow}>
                <Text style={fs.infoLabel}>Day</Text>
                <Text style={fs.infoVal}>{now.toLocaleDateString('en-US', { weekday: 'long' })}</Text>
              </View>
              <View style={[fs.infoRow, { borderBottomWidth: 0 }]}>
                <Text style={fs.infoLabel}>Time</Text>
                <Text style={fs.infoVal}>{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
            </View>

            {/* ── Today's Prices ── */}
            <Text style={fs.sectionLabel}>Today's Prices</Text>
            <View style={fs.row}>
              <View style={fs.halfField}>
                <Text style={fs.fieldLabel}>⛽ Gas ($/gal)</Text>
                <TextInput
                  style={fs.input}
                  value={gasPrice}
                  onChangeText={setGasPrice}
                  placeholder="0.000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  maxLength={6}
                />
              </View>
              <View style={fs.halfField}>
                <Text style={fs.fieldLabel}>🚛 Diesel ($/gal)</Text>
                <TextInput
                  style={fs.input}
                  value={dieselPrice}
                  onChangeText={setDieselPrice}
                  placeholder="0.000"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  maxLength={6}
                />
              </View>
            </View>

            {/* ── Today's Inventory ── */}
            <Text style={fs.sectionLabel}>Today's Inventory</Text>
            <View style={fs.row}>
              <View style={fs.halfField}>
                <Text style={fs.fieldLabel}>Regular Gas (gal)</Text>
                <TextInput
                  style={fs.input}
                  value={regGasGal}
                  onChangeText={setRegGasGal}
                  placeholder="e.g. 3500"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  maxLength={8}
                />
              </View>
              <View style={fs.halfField}>
                <Text style={fs.fieldLabel}>Mid-Grade Gas (gal)</Text>
                <TextInput
                  style={fs.input}
                  value={midGradeGasGal}
                  onChangeText={setMidGradeGasGal}
                  placeholder="e.g. 1200"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  maxLength={8}
                />
              </View>
            </View>
            <View style={fs.row}>
              <View style={fs.halfField}>
                <Text style={fs.fieldLabel}>Premium Gas (gal)</Text>
                <TextInput
                  style={fs.input}
                  value={premiumGasGal}
                  onChangeText={setPremiumGasGal}
                  placeholder="e.g. 800"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  maxLength={8}
                />
              </View>
              <View style={fs.halfField}>
                <Text style={fs.fieldLabel}>Cigs Count (packs)</Text>
                <TextInput
                  style={fs.input}
                  value={cigsCount}
                  onChangeText={setCigsCount}
                  placeholder="e.g. 240"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={6}
                />
              </View>
            </View>

            {/* ── Photo ── */}
            <Text style={fs.sectionLabel}>Photo (optional)</Text>
            <TouchableOpacity style={fs.photoArea} onPress={showPhotoOptions} activeOpacity={0.82}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={fs.photoPreview} resizeMode="cover" />
              ) : (
                <View style={fs.photoPlaceholder}>
                  <CameraIcon size={26} color="#CBD5E1" strokeWidth={1.75} />
                  <Text style={fs.photoPlaceholderText}>Tap to add photo</Text>
                </View>
              )}
              {imageUri && (
                <View style={fs.photoBadge}>
                  <Text style={fs.photoBadgeText}>Change</Text>
                </View>
              )}
            </TouchableOpacity>

            {/* ── Notes ── */}
            <Text style={fs.sectionLabel}>Additional Notes</Text>
            <TextInput
              style={[fs.input, fs.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any other info, incidents, or observations…"
              placeholderTextColor="#94A3B8"
              multiline
              maxLength={500}
              textAlignVertical="top"
            />

            {/* ── Submit ── */}
            <TouchableOpacity
              style={[fs.submitBtn, submitting && { opacity: 0.65 }]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.88}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <Text style={fs.submitBtnText}>Submit Report</Text>}
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function DailyReportScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const date = todayStr();

  // Store info (for name + pre-fill prices)
  const { data: storesData } = useQuery({
    queryKey: ['stores-gas-prices'],
    queryFn: storesApi.getGasPrices,
    staleTime: 5 * 60 * 1000,
  });
  const allStores: any[] = storesData?.data?.data || [];
  const myStore = allStores.find((s: any) => s.id === storeId);
  const storeName = myStore?.name || 'My Store';

  // Today's reports
  const { data: reportData, isLoading, refetch } = useQuery({
    queryKey: ['daily-reports-today', storeId, date],
    queryFn: () => dailyReportApi.getToday(storeId!, date),
    enabled: !!storeId,
    staleTime: 30_000,
  });
  const reports: DailyReport[] = reportData?.data?.data || [];
  const submittedToday = reports.length > 0;

  useFocusEffect(useCallback(() => { refetch(); }, []));

  function handleSubmitted() {
    setShowForm(false);
    qc.invalidateQueries({ queryKey: ['daily-reports-today', storeId, date] });
  }

  return (
    <View style={s.root}>
      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={s.headerLeft}>
            <View style={s.headerIcon}>
              <FileCheckIcon size={20} color="#fff" strokeWidth={2} />
            </View>
            <View>
              <Text style={s.headerTitle}>Daily Reports</Text>
              <Text style={s.headerSub}>{fmtDate()}</Text>
            </View>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        {/* Task Box */}
        <TaskBox
          done={submittedToday}
          lastReport={reports[0]}
          onPress={() => setShowForm(true)}
        />

        {/* Today's submissions */}
        {isLoading ? (
          <View style={s.loadingBox}>
            <ActivityIndicator color={COLORS.secondary} />
          </View>
        ) : reports.length > 0 ? (
          <>
            <Text style={s.sectionLabel}>
              {reports.length} submission{reports.length > 1 ? 's' : ''} today
            </Text>
            {reports.map(r => <ReportCard key={r.id} report={r} />)}
          </>
        ) : (
          <View style={s.emptyBox}>
            <Text style={s.emptyEmoji}>📋</Text>
            <Text style={s.emptyTitle}>No reports yet today</Text>
            <Text style={s.emptySub}>Submit the first daily report for {storeName}.</Text>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* FAB — always available so any employee can add another report */}
      <TouchableOpacity style={s.fab} onPress={() => setShowForm(true)} activeOpacity={0.88}>
        <Text style={s.fabText}>+ Submit Report</Text>
      </TouchableOpacity>

      <FormSheet
        visible={showForm}
        storeName={storeName}
        storeGasPrice={myStore?.gasPricePerGallon}
        storeDieselPrice={myStore?.dieselPricePerGallon}
        onClose={() => setShowForm(false)}
        onSubmitted={handleSubmitted}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F8FAFC' },

  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 },

  content: { padding: 16, gap: 12 },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4, marginBottom: 4 },

  loadingBox: { paddingTop: 40, alignItems: 'center' },
  emptyBox: { alignItems: 'center', paddingTop: 48, gap: 8 },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 19 },

  fab: {
    position: 'absolute', bottom: 28, left: 20, right: 20,
    backgroundColor: COLORS.secondary, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 10, elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ─── Task box styles ──────────────────────────────────────────────────────────

const tb = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: COLORS.secondary,
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12, shadowRadius: 8, elevation: 3,
  },
  cardDone: {
    backgroundColor: '#F0FDF4', borderColor: '#86EFAC',
    shadowColor: '#16A34A', shadowOpacity: 0.08,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconRing: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  iconRingDone: { backgroundColor: '#DCFCE7' },
  title: { fontSize: 16, fontWeight: '800', color: COLORS.text, marginBottom: 3 },
  titleDone: { color: '#15803D' },
  sub: { fontSize: 12, color: COLORS.textMuted },
  subDone: { fontSize: 12, color: '#16A34A', fontWeight: '600' },
  duePill: { backgroundColor: COLORS.secondary, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  duePillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  donePill: { backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  donePillText: { color: '#16A34A', fontSize: 12, fontWeight: '800' },
});

// ─── Report card styles ───────────────────────────────────────────────────────

const rc = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: '#F0F1F2',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  name: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  time: { fontSize: 11, color: COLORS.textMuted },
  chevron: { fontSize: 10, color: COLORS.textMuted },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pill: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 12, color: '#374151', fontWeight: '600' },
  body: { marginTop: 6 },
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 10 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 5 },
  detail: { fontSize: 13, color: COLORS.text, marginBottom: 3 },
  noteText: { fontSize: 13, color: COLORS.textMuted, lineHeight: 18 },
  image: { width: '100%', height: 160, borderRadius: 10, marginTop: 10 },
});

// ─── Form sheet styles ────────────────────────────────────────────────────────

const fs = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '94%',
  },
  handle: { width: 40, height: 4, backgroundColor: '#E5E7EB', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.text },

  infoBlock: {
    backgroundColor: '#F8FAFC', borderRadius: 12,
    borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 20, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB',
  },
  infoLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  infoVal: { fontSize: 13, color: COLORS.text, fontWeight: '700' },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: COLORS.secondary, marginBottom: 10, marginTop: 4 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  halfField: { flex: 1 },
  fieldLabel: { fontSize: 12, fontWeight: '600', color: COLORS.textMuted, marginBottom: 5 },
  input: {
    backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E5E7EB',
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: COLORS.text,
  },

  photoArea: {
    height: 120, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB',
    borderStyle: 'dashed', overflow: 'hidden', marginBottom: 16,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#F8FAFC',
  },
  photoPreview: { width: '100%', height: '100%' },
  photoPlaceholder: { alignItems: 'center', gap: 6 },
  photoPlaceholderText: { fontSize: 13, color: '#94A3B8', fontWeight: '600' },
  photoBadge: {
    position: 'absolute', bottom: 8, right: 8,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
  },
  photoBadgeText: { fontSize: 11, color: '#fff', fontWeight: '700' },

  notesInput: { minHeight: 80, textAlignVertical: 'top', marginBottom: 20 },

  submitBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
