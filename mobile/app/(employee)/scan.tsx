import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, Image, SafeAreaView, StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { pointsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Step = 'scan' | 'mode' | 'grant-amount' | 'receipt' | 'grant-done' | 'redeem-amount' | 'redeem-done';
type Category = 'GROCERIES' | 'FROZEN_FOODS' | 'FRESH_FOODS' | 'GAS' | 'DIESEL' | 'TOBACCO_VAPES' | 'HOT_FOODS' | 'OTHER';

const CATEGORIES: { value: Category; label: string; icon: string }[] = [
  { value: 'GROCERIES', label: 'Groceries', icon: '🛒' },
  { value: 'GAS', label: 'Gas', icon: '⛽' },
  { value: 'DIESEL', label: 'Diesel', icon: '🚛' },
  { value: 'HOT_FOODS', label: 'Hot Foods', icon: '🌮' },
  { value: 'FROZEN_FOODS', label: 'Frozen', icon: '🧊' },
  { value: 'FRESH_FOODS', label: 'Fresh', icon: '🥗' },
  { value: 'TOBACCO_VAPES', label: 'Tobacco/Vapes', icon: '🚬' },
  { value: 'OTHER', label: 'Other', icon: '🏪' },
];

export default function EmployeeScanScreen() {
  const { user, logout } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('scan');
  const [scanned, setScanned] = useState(false);
  const [customerQr, setCustomerQr] = useState('');
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<Category>('OTHER');
  const isGrantFlow = step === 'grant-amount' || step === 'receipt' || step === 'grant-done';

  const storeId = user?.storeIds?.[0];

  function reset() {
    setStep('scan');
    setScanned(false);
    setCustomerQr('');
    setCustomerInfo(null);
    setPurchaseAmount('');
    setRedeemAmount('');
    setTransactionId('');
    setPointsAwarded(0);
    setReceiptImage(null);
    setCategory('OTHER');
  }

  function handleQrScan({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    setCustomerQr(data);
    setStep('mode');
  }

  async function handleGrantPoints() {
    const amount = parseFloat(purchaseAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      Toast.show({ type: 'error', text1: 'Enter a valid purchase amount' });
      return;
    }
    if (amount > 9999) {
      Toast.show({ type: 'error', text1: 'Amount too high', text2: 'Maximum purchase is $9,999' });
      return;
    }
    const decimals = purchaseAmount.includes('.') ? purchaseAmount.split('.')[1].length : 0;
    if (decimals > 2) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Max 2 decimal places' });
      return;
    }
    if (!storeId) {
      Toast.show({ type: 'error', text1: 'No store assigned to your account' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await pointsApi.initiateGrant({
        customerQrCode: customerQr,
        storeId,
        purchaseAmount: amount,
        category,
      });
      setTransactionId(data.data.transactionId);
      setCustomerInfo(data.data.customer);
      setPointsAwarded(data.data.pointsAwarded);
      setStep('receipt');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to create transaction' });
      setScanned(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleUploadAndApprove() {
    if (!receiptImage) {
      Toast.show({ type: 'error', text1: 'Receipt photo is required' });
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('receipt', { uri: receiptImage, name: 'receipt.jpg', type: 'image/jpeg' } as any);
      await pointsApi.uploadReceipt(transactionId, formData);
      setStep('grant-done');
    } catch (err: any) {
      setReceiptImage(null); // force re-take on failure
      Toast.show({ type: 'error', text1: 'Upload failed — retake receipt', text2: err.response?.data?.error });
    } finally {
      setLoading(false);
    }
  }

  async function handleRedeemCredits() {
    const amount = parseFloat(redeemAmount);
    if (!amount || isNaN(amount) || amount <= 0) {
      Toast.show({ type: 'error', text1: 'Enter a valid amount' });
      return;
    }
    if (amount > 9999) {
      Toast.show({ type: 'error', text1: 'Amount too high', text2: 'Maximum redemption is $9,999' });
      return;
    }
    const decimals = redeemAmount.includes('.') ? redeemAmount.split('.')[1].length : 0;
    if (decimals > 2) {
      Toast.show({ type: 'error', text1: 'Invalid amount', text2: 'Max 2 decimal places' });
      return;
    }
    if (!storeId) {
      Toast.show({ type: 'error', text1: 'No store assigned to your account' });
      return;
    }
    setLoading(true);
    try {
      const { data } = await pointsApi.redeemCredits({ customerQrCode: customerQr, storeId, amount });
      setCustomerInfo(data.data.customer);
      setPointsAwarded(amount);
      setStep('redeem-done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Redemption failed' });
    } finally {
      setLoading(false);
    }
  }

  async function pickReceiptImage() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) setReceiptImage(result.assets[0].uri);
  }

  if (!permission) return <View style={s.fill} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={s.fill}>
        <View style={s.center}>
          <Text style={s.permIcon}>📷</Text>
          <Text style={s.permTitle}>Camera Access Needed</Text>
          <Text style={s.permSub}>Camera is required to scan customer QR codes</Text>
          <TouchableOpacity style={s.btn} onPress={requestPermission}>
            <Text style={s.btnText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const grantSteps = ['Scan', 'Select', 'Amount', 'Receipt', 'Done'];
  const redeemSteps = ['Scan', 'Select', 'Amount', 'Done'];
  const stepLabels = isGrantFlow ? grantSteps : redeemSteps;
  const stepIndex = isGrantFlow
    ? ({ scan: 0, mode: 1, 'grant-amount': 2, receipt: 3, 'grant-done': 4 } as Record<string, number>)[step] ?? 0
    : ({ scan: 0, mode: 1, 'redeem-amount': 2, 'redeem-done': 3 } as Record<string, number>)[step] ?? 0;

  return (
    <View style={s.fill}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerTitle}>⛽ Lucky Stop</Text>
            <Text style={s.headerSub}>{user?.name || user?.phone} · Cashier</Text>
          </View>
          <TouchableOpacity onPress={logout} style={s.logoutBtn}>
            <Text style={s.logoutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>

        <View style={s.steps}>
          {stepLabels.map((label, i) => (
            <View key={label} style={s.stepItem}>
              <View style={[s.stepDot, i <= stepIndex && s.stepDotActive]} />
              <Text style={[s.stepLabel, i <= stepIndex && s.stepLabelActive]}>{label}</Text>
            </View>
          ))}
        </View>
      </SafeAreaView>

      {/* ── Scan ── */}
      {step === 'scan' && (
        <View style={s.fill}>
          <CameraView style={s.fill} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handleQrScan} />
          <View style={s.overlay}>
            <View style={s.scanBox} />
            <Text style={s.scanHint}>Point camera at customer's QR code</Text>
          </View>
        </View>
      )}

      {/* ── Mode select ── */}
      {step === 'mode' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body}>
          <View style={s.scannedBadge}>
            <Text style={s.scannedIcon}>✅</Text>
            <Text style={s.scannedText}>QR Code Scanned</Text>
          </View>

          <Text style={s.modeTitle}>What would you like to do?</Text>

          <TouchableOpacity style={s.modeCard} onPress={() => setStep('grant-amount')}>
            <Text style={s.modeIcon}>💵</Text>
            <View style={s.modeCardText}>
              <Text style={s.modeCardTitle}>Grant Points</Text>
              <Text style={s.modeCardSub}>Earn 5¢ per $1 on their purchase</Text>
            </View>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.modeCard, s.modeCardAlt]} onPress={() => setStep('redeem-amount')}>
            <Text style={s.modeIcon}>🎁</Text>
            <View style={s.modeCardText}>
              <Text style={s.modeCardTitle}>Redeem Credits</Text>
              <Text style={s.modeCardSub}>Apply balance toward their purchase</Text>
            </View>
            <Text style={s.arrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.cancelBtn} onPress={reset}>
            <Text style={s.cancelText}>Cancel — Scan Again</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Grant: Amount ── */}
      {step === 'grant-amount' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body}>
          <Text style={s.sectionLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.value}
                style={[s.catChip, category === c.value && s.catChipActive]}
                onPress={() => setCategory(c.value)}
              >
                <Text style={s.catIcon}>{c.icon}</Text>
                <Text style={[s.catLabel, category === c.value && s.catLabelActive]}>{c.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <Text style={s.sectionLabel}>Purchase Total ($)</Text>
          <View style={s.amountRow}>
            <Text style={s.dollar}>$</Text>
            <TextInput
              style={s.amountInput}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              value={purchaseAmount}
              onChangeText={setPurchaseAmount}
              autoFocus
            />
          </View>
          {purchaseAmount && !isNaN(parseFloat(purchaseAmount)) && parseFloat(purchaseAmount) > 0 && (
            <View style={s.preview}>
              <Text style={s.previewLabel}>Customer will earn</Text>
              <Text style={s.previewValue}>+${(parseFloat(purchaseAmount) * 0.05).toFixed(2)}</Text>
              <Text style={s.previewSub}>5% cashback</Text>
            </View>
          )}
          <TouchableOpacity style={s.btn} onPress={handleGrantPoints} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Continue →</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setStep('mode')}>
            <Text style={s.cancelText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Grant: Receipt ── */}
      {step === 'receipt' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body}>
          <View style={s.customerCard}>
            <Text style={s.customerName}>{customerInfo?.name || customerInfo?.phone}</Text>
            <Text style={s.pendingPoints}>+${pointsAwarded.toFixed(2)} pending receipt upload</Text>
          </View>

          <Text style={s.sectionLabel}>Receipt Photo (Required)</Text>
          <TouchableOpacity style={s.receiptBox} onPress={pickReceiptImage}>
            {receiptImage
              ? <Image source={{ uri: receiptImage }} style={s.receiptImg} />
              : (
                <>
                  <Text style={s.receiptBoxIcon}>📸</Text>
                  <Text style={s.receiptBoxTitle}>Tap to take receipt photo</Text>
                  <Text style={s.receiptBoxSub}>Required for fraud protection</Text>
                </>
              )}
          </TouchableOpacity>

          <TouchableOpacity style={[s.btn, !receiptImage && s.btnOff]} onPress={handleUploadAndApprove} disabled={loading || !receiptImage}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Grant Points ✓</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={reset}>
            <Text style={s.cancelText}>Cancel Transaction</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Grant: Done ── */}
      {step === 'grant-done' && (
        <View style={[s.fill, s.center]}>
          <Text style={s.doneEmoji}>✅</Text>
          <Text style={s.doneTitle}>Points Granted!</Text>
          <Text style={s.doneAmount}>+${pointsAwarded.toFixed(2)}</Text>
          <Text style={s.doneSub}>credited to {customerInfo?.name || customerInfo?.phone}</Text>
          <TouchableOpacity style={[s.btn, s.doneBtn]} onPress={reset}>
            <Text style={s.btnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Redeem: Amount ── */}
      {step === 'redeem-amount' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body}>
          <Text style={s.sectionLabel}>Amount to Redeem ($)</Text>
          <View style={s.amountRow}>
            <Text style={s.dollar}>$</Text>
            <TextInput
              style={s.amountInput}
              placeholder="0.00"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
              value={redeemAmount}
              onChangeText={setRedeemAmount}
              autoFocus
            />
          </View>
          <TouchableOpacity style={[s.btn, { backgroundColor: COLORS.accent }]} onPress={handleRedeemCredits} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>Confirm Redemption</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={() => setStep('mode')}>
            <Text style={s.cancelText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ── Redeem: Done ── */}
      {step === 'redeem-done' && (
        <View style={[s.fill, s.center]}>
          <Text style={s.doneEmoji}>🎉</Text>
          <Text style={s.doneTitle}>Redeemed!</Text>
          <Text style={[s.doneAmount, { color: COLORS.accent }]}>-${pointsAwarded.toFixed(2)}</Text>
          <Text style={s.doneSub}>from {customerInfo?.name || customerInfo?.phone}</Text>
          <Text style={s.doneBalance}>New balance: ${Number(customerInfo?.pointsBalance ?? 0).toFixed(2)}</Text>
          <TouchableOpacity style={[s.btn, s.doneBtn, { backgroundColor: COLORS.accent }]} onPress={reset}>
            <Text style={s.btnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  body: { padding: 20, gap: 14 },

  // Header
  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8 },
  logoutText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Steps
  steps: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 10, gap: 28 },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.25)' },
  stepDotActive: { backgroundColor: COLORS.accent },
  stepLabel: { fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: '600' },
  stepLabelActive: { color: 'rgba(255,255,255,0.9)' },

  // Scan
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  scanBox: { width: 230, height: 230, borderWidth: 3, borderColor: COLORS.accent, borderRadius: 20 },
  scanHint: { color: '#fff', marginTop: 20, fontWeight: '600', fontSize: 15, textShadowColor: '#000', textShadowRadius: 4 },

  // Mode
  scannedBadge: { backgroundColor: COLORS.success + '20', borderRadius: 14, padding: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  scannedIcon: { fontSize: 20 },
  scannedText: { color: COLORS.success, fontWeight: '700', fontSize: 15 },
  modeTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  modeCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 2, borderColor: COLORS.primary + '30' },
  modeCardAlt: { borderColor: COLORS.accent + '50' },
  modeIcon: { fontSize: 32 },
  modeCardText: { flex: 1 },
  modeCardTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  modeCardSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  arrow: { fontSize: 24, color: COLORS.textMuted },

  // Category chips
  catScroll: { marginBottom: 4 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white, marginRight: 8 },
  catChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '15' },
  catIcon: { fontSize: 16 },
  catLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  catLabelActive: { color: COLORS.primary },

  // Amount
  sectionLabel: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  amountRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 16, paddingHorizontal: 20, borderWidth: 2, borderColor: COLORS.border },
  dollar: { fontSize: 32, fontWeight: '700', color: COLORS.textMuted, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 40, fontWeight: '800', color: COLORS.text, paddingVertical: 16 },

  // Preview
  preview: { backgroundColor: COLORS.success + '15', borderRadius: 14, padding: 16, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.success + '50' },
  previewLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  previewValue: { fontSize: 36, fontWeight: '800', color: COLORS.success, marginVertical: 4 },
  previewSub: { fontSize: 12, color: COLORS.textMuted },

  // Customer card
  customerCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, alignItems: 'center' },
  customerName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  pendingPoints: { color: COLORS.primary, fontWeight: '700', fontSize: 16, marginTop: 8 },

  // Receipt
  receiptBox: { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed', padding: 32, alignItems: 'center', gap: 8 },
  receiptBoxIcon: { fontSize: 40 },
  receiptBoxTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text },
  receiptBoxSub: { fontSize: 12, color: COLORS.textMuted },
  receiptImg: { width: '100%', height: 200, borderRadius: 10, resizeMode: 'cover' },

  // Buttons
  btn: { backgroundColor: COLORS.primary, borderRadius: 14, padding: 18, alignItems: 'center' },
  btnOff: { backgroundColor: COLORS.border },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { padding: 14, alignItems: 'center' },
  cancelText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },

  // Done
  doneEmoji: { fontSize: 80 },
  doneTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  doneAmount: { fontSize: 48, fontWeight: '800', color: COLORS.success, marginVertical: 4 },
  doneSub: { color: COLORS.textMuted, fontSize: 15 },
  doneBalance: { color: COLORS.textMuted, fontSize: 14, marginTop: 6 },
  doneBtn: { marginTop: 40, width: '80%' },

  // Permission
  permIcon: { fontSize: 64, marginBottom: 16 },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  permSub: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginBottom: 32, lineHeight: 22 },
});
