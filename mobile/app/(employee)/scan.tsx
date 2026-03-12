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
  { value: 'GAS',          label: 'Gas',       icon: '⛽' },
  { value: 'DIESEL',       label: 'Diesel',    icon: '🚛' },
  { value: 'HOT_FOODS',    label: 'Hot Foods', icon: '🌮' },
  { value: 'GROCERIES',    label: 'Groceries', icon: '🛒' },
  { value: 'FROZEN_FOODS', label: 'Frozen',    icon: '🧊' },
  { value: 'FRESH_FOODS',  label: 'Fresh',     icon: '🥗' },
  { value: 'TOBACCO_VAPES',label: 'Tobacco',   icon: '🚬' },
  { value: 'OTHER',        label: 'Other',     icon: '🏪' },
];

// ─── Corner Bracket Camera Overlay ────────────────────────────────────────────

function ScanFrame() {
  const SIZE = 230;
  const BRACKET = 28;
  const THICKNESS = 4;
  const RADIUS = 16;
  const COLOR = COLORS.accent;

  const corner = (tl: boolean, tr: boolean, bl: boolean, br: boolean) => ({
    position: 'absolute' as const,
    width: BRACKET,
    height: BRACKET,
    borderColor: COLOR,
    borderTopLeftRadius: tl ? RADIUS : 0,
    borderTopRightRadius: tr ? RADIUS : 0,
    borderBottomLeftRadius: bl ? RADIUS : 0,
    borderBottomRightRadius: br ? RADIUS : 0,
    borderTopWidth: tl || tr ? THICKNESS : 0,
    borderLeftWidth: tl || bl ? THICKNESS : 0,
    borderRightWidth: tr || br ? THICKNESS : 0,
    borderBottomWidth: bl || br ? THICKNESS : 0,
  });

  return (
    <View style={{ width: SIZE, height: SIZE }}>
      {/* Top-left */}
      <View style={[corner(true, false, false, false), { top: 0, left: 0 }]} />
      {/* Top-right */}
      <View style={[corner(false, true, false, false), { top: 0, right: 0 }]} />
      {/* Bottom-left */}
      <View style={[corner(false, false, true, false), { bottom: 0, left: 0 }]} />
      {/* Bottom-right */}
      <View style={[corner(false, false, false, true), { bottom: 0, right: 0 }]} />
    </View>
  );
}

// ─── Step Progress Bar ─────────────────────────────────────────────────────────

const GRANT_STEPS  = ['Scan', 'Mode', 'Amount', 'Receipt', 'Done'];
const REDEEM_STEPS = ['Scan', 'Mode', 'Amount', 'Done'];

const STEP_INDEX: Record<Step, number> = {
  'scan': 0, 'mode': 1,
  'grant-amount': 2, 'receipt': 3, 'grant-done': 4,
  'redeem-amount': 2, 'redeem-done': 3,
};

function StepBar({ step }: { step: Step }) {
  const isRedeem = step === 'redeem-amount' || step === 'redeem-done';
  const labels = isRedeem ? REDEEM_STEPS : GRANT_STEPS;
  const active = STEP_INDEX[step] ?? 0;
  return (
    <View style={s.stepBar}>
      {labels.map((label, i) => (
        <View key={label} style={s.stepItem}>
          <View style={[s.stepDot, i <= active && s.stepDotActive, i < active && s.stepDotDone]}>
            {i < active && <Text style={s.stepCheck}>✓</Text>}
          </View>
          <Text style={[s.stepLabel, i <= active && s.stepLabelActive]}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function EmployeeScanScreen() {
  const { user } = useAuthStore();
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
  const [promotionApplied, setPromotionApplied] = useState<string | null>(null);

  const storeId = user?.storeIds?.[0];
  const parsedAmount = parseFloat(purchaseAmount);
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const estimatedCashback = validAmount ? (parsedAmount * 0.05).toFixed(2) : null;

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
    setPromotionApplied(null);
  }

  function handleQrScan({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    setCustomerQr(data);
    setStep('mode');
  }

  async function handleGrantPoints() {
    if (!validAmount) {
      Toast.show({ type: 'error', text1: 'Enter a valid purchase amount' });
      return;
    }
    if (parsedAmount > 9999) {
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
        purchaseAmount: parsedAmount,
        category,
      });
      setTransactionId(data.data.transactionId);
      setCustomerInfo(data.data.customer);
      setPointsAwarded(data.data.pointsAwarded);
      setPromotionApplied(data.data.promotionApplied || null);
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
      setReceiptImage(null);
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

  // ── Permission screen ──────────────────────────────────────────────────────
  if (!permission) return <View style={s.fill} />;

  if (!permission.granted) {
    return (
      <SafeAreaView style={[s.fill, s.center]}>
        <StatusBar barStyle="dark-content" />
        <Text style={s.permIcon}>📷</Text>
        <Text style={s.permTitle}>Camera Access Needed</Text>
        <Text style={s.permSub}>Camera is required to scan customer QR codes</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={requestPermission}>
          <Text style={s.primaryBtnText}>Grant Camera Access</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <View style={s.fill}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      {/* ── Header ── */}
      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View>
            <Text style={s.headerStore}>⛽ Lucky Stop</Text>
            <Text style={s.headerSub}>{user?.name || user?.phone} · {user?.role?.replace(/_/g, ' ')}</Text>
          </View>
          {step !== 'scan' && (
            <TouchableOpacity style={s.headerBackBtn} onPress={reset}>
              <Text style={s.headerBackText}>✕ Cancel</Text>
            </TouchableOpacity>
          )}
        </View>
        <StepBar step={step} />
      </SafeAreaView>

      {/* ──────────────────────── SCAN ────────────────────────── */}
      {step === 'scan' && (
        <View style={s.fill}>
          <CameraView
            style={s.fill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleQrScan}
          />
          <View style={s.scanOverlay}>
            <View style={s.scanDimTop} />
            <View style={s.scanMiddleRow}>
              <View style={s.scanDimSide} />
              <ScanFrame />
              <View style={s.scanDimSide} />
            </View>
            <View style={s.scanDimBottom}>
              <Text style={s.scanHint}>Point camera at customer's QR code</Text>
              <Text style={s.scanHintSub}>Hold steady until it auto-detects</Text>
            </View>
          </View>
        </View>
      )}

      {/* ──────────────────────── MODE SELECT ────────────────────────── */}
      {step === 'mode' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body}>
          <View style={s.successBadge}>
            <Text style={s.successBadgeIcon}>✅</Text>
            <View>
              <Text style={s.successBadgeTitle}>QR Scanned Successfully</Text>
              <Text style={s.successBadgeSub}>Select action to proceed</Text>
            </View>
          </View>

          <TouchableOpacity
            style={s.modeCard}
            onPress={() => setStep('grant-amount')}
            activeOpacity={0.85}
          >
            <View style={[s.modeIconBg, { backgroundColor: COLORS.primary + '15' }]}>
              <Text style={s.modeEmoji}>💵</Text>
            </View>
            <View style={s.modeBody}>
              <Text style={s.modeTitle}>Grant Points</Text>
              <Text style={s.modeSub}>Earn cashback on their purchase</Text>
            </View>
            <View style={[s.modeArrow, { backgroundColor: COLORS.primary }]}>
              <Text style={s.modeArrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.modeCard, s.modeCardAlt]}
            onPress={() => setStep('redeem-amount')}
            activeOpacity={0.85}
          >
            <View style={[s.modeIconBg, { backgroundColor: COLORS.accent + '15' }]}>
              <Text style={s.modeEmoji}>🎁</Text>
            </View>
            <View style={s.modeBody}>
              <Text style={[s.modeTitle, { color: COLORS.accent }]}>Redeem Credits</Text>
              <Text style={s.modeSub}>Apply balance toward purchase</Text>
            </View>
            <View style={[s.modeArrow, { backgroundColor: COLORS.accent }]}>
              <Text style={s.modeArrowText}>›</Text>
            </View>
          </TouchableOpacity>

          <View style={s.modeInfo}>
            <Text style={s.modeInfoText}>💡 Grant = customer earns rewards. Redeem = customer spends rewards.</Text>
          </View>
        </ScrollView>
      )}

      {/* ──────────────────────── GRANT: AMOUNT ────────────────────────── */}
      {step === 'grant-amount' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* Category grid — 4 columns × 2 rows */}
          <Text style={s.fieldLabel}>Category</Text>
          <View style={s.catGrid}>
            {CATEGORIES.map((c) => {
              const active = category === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[s.catCell, active && s.catCellActive]}
                  onPress={() => setCategory(c.value)}
                  activeOpacity={0.75}
                >
                  <Text style={s.catEmoji}>{c.icon}</Text>
                  <Text style={[s.catCellLabel, active && s.catCellLabelActive]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount input */}
          <Text style={[s.fieldLabel, { marginTop: 8 }]}>Purchase Total</Text>
          <View style={s.amountBox}>
            <Text style={s.amountDollar}>$</Text>
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

          {/* Live cashback preview */}
          {estimatedCashback && (
            <View style={s.previewCard}>
              <View style={s.previewRow}>
                <Text style={s.previewLabel}>Est. cashback</Text>
                <Text style={s.previewAmount}>+${estimatedCashback}</Text>
              </View>
              <View style={s.previewRow}>
                <Text style={s.previewLabel}>Rate</Text>
                <Text style={s.previewRate}>5¢ per $1 (promos applied at server)</Text>
              </View>
              <View style={s.previewDivider} />
              <Text style={s.previewNote}>Final amount confirmed after submission</Text>
            </View>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, (!validAmount || loading) && s.primaryBtnOff]}
            onPress={handleGrantPoints}
            disabled={!validAmount || loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>Continue to Receipt →</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.ghostBtn} onPress={() => setStep('mode')}>
            <Text style={s.ghostBtnText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ──────────────────────── GRANT: RECEIPT ────────────────────────── */}
      {step === 'receipt' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body}>

          {/* Customer summary */}
          <View style={s.customerCard}>
            <View style={s.customerAvatar}>
              <Text style={s.customerAvatarText}>
                {(customerInfo?.name || customerInfo?.phone || '?')[0].toUpperCase()}
              </Text>
            </View>
            <Text style={s.customerName}>{customerInfo?.name || customerInfo?.phone}</Text>
            {customerInfo?.phone && customerInfo?.name && (
              <Text style={s.customerPhone}>{customerInfo.phone}</Text>
            )}
            <View style={s.pointsPill}>
              <Text style={s.pointsPillText}>+${pointsAwarded.toFixed(2)} cashback</Text>
            </View>
            {promotionApplied && (
              <View style={s.promoBanner}>
                <Text style={s.promoBannerText}>🎉 Promo: {promotionApplied}</Text>
              </View>
            )}
          </View>

          {/* Receipt photo */}
          <Text style={s.fieldLabel}>Receipt Photo <Text style={s.required}>*required</Text></Text>
          <TouchableOpacity
            style={[s.receiptBox, receiptImage && s.receiptBoxFilled]}
            onPress={pickReceiptImage}
            activeOpacity={0.85}
          >
            {receiptImage ? (
              <View style={{ width: '100%' }}>
                <Image source={{ uri: receiptImage }} style={s.receiptImg} />
                <View style={s.retakeRow}>
                  <Text style={s.retakeText}>📷 Tap to retake</Text>
                </View>
              </View>
            ) : (
              <>
                <Text style={s.receiptIcon}>📸</Text>
                <Text style={s.receiptTitle}>Take Receipt Photo</Text>
                <Text style={s.receiptSub}>Required for fraud protection</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.primaryBtn, !receiptImage && s.primaryBtnOff]}
            onPress={handleUploadAndApprove}
            disabled={loading || !receiptImage}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>Grant Points ✓</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.dangerBtn} onPress={reset}>
            <Text style={s.dangerBtnText}>Cancel Transaction</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ──────────────────────── GRANT: DONE ────────────────────────── */}
      {step === 'grant-done' && (
        <View style={[s.fill, s.center]}>
          <View style={s.doneIconRing}>
            <Text style={s.doneEmoji}>✅</Text>
          </View>
          <Text style={s.doneHeading}>Points Granted!</Text>
          <Text style={s.doneAmount}>+${pointsAwarded.toFixed(2)}</Text>
          <Text style={s.doneName}>{customerInfo?.name || customerInfo?.phone}</Text>
          <Text style={s.doneSub}>Cashback credited to their account</Text>
          {promotionApplied && (
            <View style={[s.promoBanner, { marginTop: 12 }]}>
              <Text style={s.promoBannerText}>🎉 Promo applied: {promotionApplied}</Text>
            </View>
          )}
          <TouchableOpacity style={[s.primaryBtn, s.doneBtn]} onPress={reset} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ──────────────────────── REDEEM: AMOUNT ────────────────────────── */}
      {step === 'redeem-amount' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
          <View style={[s.successBadge, { backgroundColor: COLORS.accent + '15' }]}>
            <Text style={s.successBadgeIcon}>🎁</Text>
            <View>
              <Text style={[s.successBadgeTitle, { color: COLORS.accent }]}>Redeem Credits</Text>
              <Text style={s.successBadgeSub}>Enter amount to deduct from balance</Text>
            </View>
          </View>

          <Text style={s.fieldLabel}>Amount to Redeem</Text>
          <View style={s.amountBox}>
            <Text style={s.amountDollar}>$</Text>
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

          <View style={s.redeemInfo}>
            <Text style={s.redeemInfoText}>
              Customer's entire balance will be checked — redemption will fail if insufficient funds.
            </Text>
          </View>

          <TouchableOpacity
            style={[s.primaryBtn, { backgroundColor: COLORS.accent }, loading && s.primaryBtnOff]}
            onPress={handleRedeemCredits}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.primaryBtnText}>Confirm Redemption</Text>}
          </TouchableOpacity>

          <TouchableOpacity style={s.ghostBtn} onPress={() => setStep('mode')}>
            <Text style={s.ghostBtnText}>← Back</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* ──────────────────────── REDEEM: DONE ────────────────────────── */}
      {step === 'redeem-done' && (
        <View style={[s.fill, s.center]}>
          <View style={[s.doneIconRing, { backgroundColor: COLORS.accent + '20' }]}>
            <Text style={s.doneEmoji}>🎉</Text>
          </View>
          <Text style={s.doneHeading}>Redeemed!</Text>
          <Text style={[s.doneAmount, { color: COLORS.accent }]}>-${pointsAwarded.toFixed(2)}</Text>
          <Text style={s.doneName}>{customerInfo?.name || customerInfo?.phone}</Text>
          <View style={s.newBalanceCard}>
            <Text style={s.newBalanceLabel}>Remaining balance</Text>
            <Text style={s.newBalanceValue}>${Number(customerInfo?.pointsBalance ?? 0).toFixed(2)}</Text>
          </View>
          <TouchableOpacity
            style={[s.primaryBtn, s.doneBtn, { backgroundColor: COLORS.accent }]}
            onPress={reset}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  body: { padding: 18, gap: 14, paddingBottom: 32 },

  // ── Header ──────────────────────────────────────────────────────────────────
  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 6,
  },
  headerStore: { color: '#fff', fontSize: 18, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
  headerBackBtn: {
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 10,
  },
  headerBackText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // ── Step bar ─────────────────────────────────────────────────────────────────
  stepBar: {
    flexDirection: 'row', justifyContent: 'center',
    paddingVertical: 10, paddingHorizontal: 12, gap: 0,
  },
  stepItem: { alignItems: 'center', flex: 1 },
  stepDot: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  stepDotActive: { backgroundColor: COLORS.accent },
  stepDotDone: { backgroundColor: COLORS.success },
  stepCheck: { color: '#fff', fontSize: 11, fontWeight: '800' },
  stepLabel: { fontSize: 9, color: 'rgba(255,255,255,0.35)', fontWeight: '700', textAlign: 'center' },
  stepLabelActive: { color: 'rgba(255,255,255,0.95)' },

  // ── Camera overlay ────────────────────────────────────────────────────────────
  scanOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  scanDimTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanMiddleRow: { flexDirection: 'row', height: 230 },
  scanDimSide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)' },
  scanDimBottom: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'flex-start', paddingTop: 28, gap: 6,
  },
  scanHint: { color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  scanHintSub: { color: 'rgba(255,255,255,0.65)', fontSize: 13, textAlign: 'center' },

  // ── Mode select ───────────────────────────────────────────────────────────────
  successBadge: {
    backgroundColor: COLORS.success + '18', borderRadius: 16,
    padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  successBadgeIcon: { fontSize: 26 },
  successBadgeTitle: { fontSize: 15, fontWeight: '700', color: COLORS.success },
  successBadgeSub: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  modeCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center', gap: 14,
    borderWidth: 1.5, borderColor: COLORS.primary + '30',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  modeCardAlt: { borderColor: COLORS.accent + '40' },
  modeIconBg: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modeEmoji: { fontSize: 26 },
  modeBody: { flex: 1 },
  modeTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  modeSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 3 },
  modeArrow: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  modeArrowText: { color: '#fff', fontSize: 22, fontWeight: '300', marginTop: -2 },
  modeInfo: {
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.secondary + '18',
  },
  modeInfoText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },

  // ── Category grid ─────────────────────────────────────────────────────────────
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  required: { color: COLORS.error, textTransform: 'none', fontWeight: '600' },
  catGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
  },
  catCell: {
    width: '23%', aspectRatio: 1,
    backgroundColor: COLORS.white, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 2, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  catCellActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  catEmoji: { fontSize: 22 },
  catCellLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, textAlign: 'center' },
  catCellLabelActive: { color: COLORS.primary },

  // ── Amount input ──────────────────────────────────────────────────────────────
  amountBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white, borderRadius: 18,
    paddingHorizontal: 20, borderWidth: 2, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  amountDollar: { fontSize: 36, fontWeight: '700', color: COLORS.textMuted, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 44, fontWeight: '800', color: COLORS.text, paddingVertical: 14 },

  // ── Cashback preview ──────────────────────────────────────────────────────────
  previewCard: {
    backgroundColor: COLORS.success + '12', borderRadius: 16,
    padding: 16, borderWidth: 1.5, borderColor: COLORS.success + '40', gap: 8,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },
  previewAmount: { fontSize: 22, fontWeight: '800', color: COLORS.success },
  previewRate: { fontSize: 12, color: COLORS.textMuted, flex: 1, textAlign: 'right' },
  previewDivider: { height: 1, backgroundColor: COLORS.success + '30' },
  previewNote: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center', fontStyle: 'italic' },

  // ── Customer card (receipt step) ──────────────────────────────────────────────
  customerCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 24,
    alignItems: 'center', gap: 6,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  customerAvatar: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: COLORS.secondary, alignItems: 'center', justifyContent: 'center',
    marginBottom: 6,
  },
  customerAvatarText: { color: '#fff', fontSize: 26, fontWeight: '800' },
  customerName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  customerPhone: { fontSize: 13, color: COLORS.textMuted },
  pointsPill: {
    backgroundColor: COLORS.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, marginTop: 4,
  },
  pointsPillText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  promoBanner: {
    backgroundColor: COLORS.accent + '20', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  promoBannerText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },

  // ── Receipt box ───────────────────────────────────────────────────────────────
  receiptBox: {
    backgroundColor: COLORS.white, borderRadius: 16,
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed',
    padding: 36, alignItems: 'center', gap: 10,
  },
  receiptBoxFilled: { padding: 0, borderStyle: 'solid', overflow: 'hidden' },
  receiptIcon: { fontSize: 48 },
  receiptTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  receiptSub: { fontSize: 13, color: COLORS.textMuted },
  receiptImg: { width: '100%', height: 220, resizeMode: 'cover' },
  retakeRow: {
    padding: 12, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  retakeText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },

  // ── Redeem info ───────────────────────────────────────────────────────────────
  redeemInfo: {
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.secondary + '18',
  },
  redeemInfoText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },

  // ── Done screens ──────────────────────────────────────────────────────────────
  doneIconRing: {
    width: 110, height: 110, borderRadius: 55,
    backgroundColor: COLORS.success + '18',
    alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  doneEmoji: { fontSize: 58 },
  doneHeading: { fontSize: 30, fontWeight: '800', color: COLORS.text },
  doneAmount: { fontSize: 52, fontWeight: '800', color: COLORS.success, marginVertical: 4 },
  doneName: { fontSize: 16, fontWeight: '600', color: COLORS.text, marginTop: 4 },
  doneSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  newBalanceCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 20,
    alignItems: 'center', marginTop: 16, width: '80%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  newBalanceLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  newBalanceValue: { fontSize: 32, fontWeight: '800', color: COLORS.text, marginTop: 4 },
  doneBtn: { marginTop: 32, width: '80%' },

  // ── Buttons ───────────────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnOff: { backgroundColor: COLORS.border, shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  ghostBtn: { paddingVertical: 14, alignItems: 'center' },
  ghostBtnText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
  dangerBtn: {
    paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.error + '40',
  },
  dangerBtnText: { color: COLORS.error, fontSize: 15, fontWeight: '600' },

  // ── Permission screen ─────────────────────────────────────────────────────────
  permIcon: { fontSize: 72, marginBottom: 16 },
  permTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text, marginBottom: 8 },
  permSub: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginBottom: 36, lineHeight: 22, paddingHorizontal: 8 },
});
