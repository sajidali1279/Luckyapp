import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, ScrollView, Image, StatusBar, FlatList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { pointsApi, catalogApi, storesApi, welcomeBonusApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Step =
  | 'scan' | 'mode'
  | 'grant-amount' | 'receipt' | 'grant-done'
  | 'redeem-amount' | 'redeem-done'
  | 'benefit-done'
  | 'catalog-select' | 'catalog-done'
  | 'pending-done'
  | 'welcome-bonus-done';

type Category = 'GROCERIES' | 'FROZEN_FOODS' | 'FRESH_FOODS' | 'GAS' | 'DIESEL' | 'TOBACCO_VAPES' | 'HOT_FOODS' | 'OTHER';

type LineItem = {
  id: string;
  category: Category;
  amount: string;
  gasGallons?: string;
  gasPricePerGallon?: string;
};

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

// Tier-based pts multiplier: rate% × 100 (e.g. Bronze 1% → ×1, Gold 3% → ×3)
// Fallback multiplier — overridden by live tier rates fetched on mount
const TIER_PTS_MULT_FALLBACK: Record<string, number> = { BRONZE: 1, SILVER: 2, GOLD: 3, DIAMOND: 4, PLATINUM: 5 };

const TIER_CONFIG: Record<string, { label: string; color: string; emoji: string }> = {
  BRONZE:   { label: 'Bronze',   color: '#CD7F32', emoji: '🥉' },
  SILVER:   { label: 'Silver',   color: '#A0A0B0', emoji: '🥈' },
  GOLD:     { label: 'Gold',     color: '#F4A226', emoji: '🥇' },
  DIAMOND:  { label: 'Diamond',  color: '#00B4D8', emoji: '💎' },
  PLATINUM: { label: 'Platinum', color: '#9B5DE5', emoji: '👑' },
};

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
      <View style={[corner(true, false, false, false), { top: 0, left: 0 }]} />
      <View style={[corner(false, true, false, false), { top: 0, right: 0 }]} />
      <View style={[corner(false, false, true, false), { bottom: 0, left: 0 }]} />
      <View style={[corner(false, false, false, true), { bottom: 0, right: 0 }]} />
    </View>
  );
}

// ─── Step Progress Bar ─────────────────────────────────────────────────────────

const GRANT_STEPS  = ['Scan', 'Mode', 'Amount', 'Receipt', 'Done'];
const REDEEM_STEPS = ['Scan', 'Mode', 'Amount', 'Done'];
const BENEFIT_STEPS = ['Scan', 'Mode', 'Done'];

const STEP_INDEX: Record<Step, number> = {
  'scan': 0, 'mode': 1,
  'grant-amount': 2, 'receipt': 3, 'grant-done': 4,
  'redeem-amount': 2, 'redeem-done': 3,
  'benefit-done': 2,
  'catalog-select': 2, 'catalog-done': 3,
  'pending-done': 2,
  'welcome-bonus-done': 2,
};

function StepBar({ step }: { step: Step }) {
  const isRedeem  = step === 'redeem-amount' || step === 'redeem-done';
  const isBenefit = step === 'benefit-done';
  const isCatalog = step === 'catalog-select' || step === 'catalog-done';
  const labels = isBenefit ? BENEFIT_STEPS : (isRedeem || isCatalog) ? REDEEM_STEPS : GRANT_STEPS;
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

// ─── Tier Badge ────────────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string }) {
  const cfg = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;
  return (
    <View style={[s.tierBadge, { backgroundColor: cfg.color + '20', borderColor: cfg.color + '60' }]}>
      <Text style={s.tierBadgeEmoji}>{cfg.emoji}</Text>
      <Text style={[s.tierBadgeText, { color: cfg.color }]}>{cfg.label}</Text>
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
  const [customerData, setCustomerData] = useState<any>(null); // from getCustomerInfo
  const [customerInfo, setCustomerInfo] = useState<any>(null); // from initiateGrant / redeem
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [redeemAmount, setRedeemAmount] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [transactionIds, setTransactionIds] = useState<string[]>([]);
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [gasBonusAwarded, setGasBonusAwarded] = useState(0);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<Category>('OTHER');
  const [promotionApplied, setPromotionApplied] = useState<string | null>(null);
  const [gasGallons, setGasGallons] = useState('');
  const [gasPricePerGallon, setGasPricePerGallon] = useState('');
  const [catalogItems, setCatalogItems] = useState<any[]>([]);
  const [selectedCatalogItem, setSelectedCatalogItem] = useState<any>(null);
  const [pendingRedemptions, setPendingRedemptions] = useState<any[]>([]);
  const [confirmedPending, setConfirmedPending] = useState<any>(null);
  const [welcomeBonus, setWelcomeBonus] = useState<any>(null);
  const [confirmedWelcomeBonus, setConfirmedWelcomeBonus] = useState<any>(null);

  const storeId = user?.storeIds?.[0];

  // Store gas prices + enabled categories (fetched once on mount)
  const [storeGasPrices, setStoreGasPrices] = useState<Record<string, { gasPricePerGallon?: number; dieselPricePerGallon?: number; enabledCategories?: string[] }>>({});
  // Tier rates: cashbackRate (%) and gasCentsPerGallon per tier
  const [tierRates, setTierRates] = useState<Record<string, { cashbackRate: number; gasCentsPerGallon: number | null }>>({});

  useEffect(() => {
    storesApi.getGasPrices().then((res) => {
      const map: Record<string, { gasPricePerGallon?: number; dieselPricePerGallon?: number; enabledCategories?: string[] }> = {};
      for (const store of res.data.data ?? []) {
        map[store.id] = {
          gasPricePerGallon: store.gasPricePerGallon,
          dieselPricePerGallon: store.dieselPricePerGallon,
          enabledCategories: store.enabledCategories ?? [],
        };
      }
      setStoreGasPrices(map);
    }).catch(() => {});

    storesApi.getTierRates().then((res) => {
      const map: Record<string, { cashbackRate: number; gasCentsPerGallon: number | null }> = {};
      for (const r of res.data.data ?? []) {
        map[r.tier] = { cashbackRate: r.cashbackRate, gasCentsPerGallon: r.gasCentsPerGallon ?? null };
      }
      setTierRates(map);
    }).catch(() => {});
  }, []);

  function selectCategory(cat: Category) {
    setCategory(cat);
    setGasGallons('');
    const isGas = cat === 'GAS' || cat === 'DIESEL';
    if (!isGas) { setGasPricePerGallon(''); return; }
    if (!storeId) return;
    const prices = storeGasPrices[storeId];
    if (!prices) return;
    if (cat === 'GAS' && prices.gasPricePerGallon) {
      setGasPricePerGallon(String(prices.gasPricePerGallon));
    } else if (cat === 'DIESEL' && prices.dieselPricePerGallon) {
      setGasPricePerGallon(String(prices.dieselPricePerGallon));
    }
  }

  const isGasCat = category === 'GAS' || category === 'DIESEL';
  const parsedAmount = parseFloat(purchaseAmount);
  const validAmount = !isNaN(parsedAmount) && parsedAmount > 0;
  const parsedPPG = parseFloat(gasPricePerGallon);

  // Auto-calculate gallons from amount ÷ price-per-gallon whenever both are known
  useEffect(() => {
    if (isGasCat && validAmount && !isNaN(parsedPPG) && parsedPPG > 0) {
      setGasGallons((parsedAmount / parsedPPG).toFixed(3));
    }
  }, [purchaseAmount, gasPricePerGallon, isGasCat]);

  const parsedGallons = parseFloat(gasGallons);
  const validGallons = isGasCat ? (!isNaN(parsedGallons) && parsedGallons > 0) : true;
  const committedTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  const customerTier = customerData?.tier ?? 'BRONZE';
  const liveTierRate = tierRates[customerTier];
  // pts-per-dollar from live rate (fallback to hardcoded until rates load)
  const tierMult = liveTierRate
    ? Math.round(liveTierRate.cashbackRate * 100)
    : (TIER_PTS_MULT_FALLBACK[customerTier] ?? 1);
  const gasCentsPerGallon = liveTierRate?.gasCentsPerGallon ?? null;
  // For gas in ¢/gallon mode, estimate from gallons; otherwise use dollar × rate
  const currentItemPts = isGasCat && validGallons && gasCentsPerGallon != null
    ? Math.round(parsedGallons * gasCentsPerGallon)
    : validAmount ? Math.round(parsedAmount * tierMult) : 0;
  const committedPts = lineItems.reduce((sum, item) => {
    const itemIsGas = item.category === 'GAS' || item.category === 'DIESEL';
    const gallons = parseFloat(item.gasGallons || '');
    if (itemIsGas && !isNaN(gallons) && gallons > 0 && gasCentsPerGallon != null) {
      return sum + Math.round(gallons * gasCentsPerGallon);
    }
    return sum + Math.round((parseFloat(item.amount) || 0) * tierMult);
  }, 0);
  const estimatedCashback = (committedPts + currentItemPts) > 0 ? committedPts + currentItemPts : null;

  function addCurrentItem() {
    if (!validAmount || (isGasCat && !validGallons)) {
      Toast.show({ type: 'error', text1: 'Enter a valid amount first' });
      return;
    }
    setLineItems(prev => [...prev, {
      id: Date.now().toString(),
      category,
      amount: purchaseAmount,
      gasGallons: isGasCat ? gasGallons : undefined,
      gasPricePerGallon: isGasCat ? gasPricePerGallon : undefined,
    }]);
    setPurchaseAmount('');
    setCategory('OTHER');
    setGasGallons('');
    setGasPricePerGallon('');
  }

  function reset() {
    setStep('scan');
    setScanned(false);
    setCustomerQr('');
    setCustomerData(null);
    setCustomerInfo(null);
    setPurchaseAmount('');
    setRedeemAmount('');
    setLineItems([]);
    setTransactionIds([]);
    setPointsAwarded(0);
    setGasBonusAwarded(0);
    setReceiptImage(null);
    setCategory('OTHER');
    setPromotionApplied(null);
    setGasGallons('');
    setGasPricePerGallon('');
    setCatalogItems([]);
    setSelectedCatalogItem(null);
    setPendingRedemptions([]);
    setConfirmedPending(null);
    setWelcomeBonus(null);
    setConfirmedWelcomeBonus(null);
  }

  async function handleQrScan({ data }: { data: string }) {
    if (scanned) return;
    // Validate UUID format — customer QR codes are plain UUIDs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(data)) {
      Toast.show({ type: 'error', text1: 'Not a Lucky Stop customer QR code' });
      return;
    }
    setScanned(true);
    setCustomerQr(data);
    setLoading(true);
    try {
      const [infoRes, catalogRes, pendingRes, wbRes] = await Promise.all([
        pointsApi.getCustomerInfo(data),
        catalogApi.getActive(),
        catalogApi.getPendingForCustomer(data),
        welcomeBonusApi.getForCustomer(data).catch(() => null),
      ]);
      setCustomerData(infoRes.data.data);
      setCatalogItems(catalogRes.data.data || []);
      setPendingRedemptions(pendingRes.data.data || []);
      setWelcomeBonus(wbRes?.data?.data ?? null);
      setStep('mode');
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Customer not found';
      Toast.show({ type: 'error', text1: 'Invalid QR Code', text2: msg });
      setScanned(false);
    } finally {
      setLoading(false);
    }
  }

  async function handleGrantPoints() {
    if (!validAmount) {
      Toast.show({ type: 'error', text1: 'Enter a valid purchase amount' });
      return;
    }
    if (isGasCat && !validGallons) {
      Toast.show({ type: 'error', text1: 'Enter number of gallons' });
      return;
    }
    if (!storeId) {
      Toast.show({ type: 'error', text1: 'No store assigned to your account' });
      return;
    }

    // Combine committed items + current item
    const allItems: LineItem[] = [
      ...lineItems,
      { id: 'current', category, amount: purchaseAmount, gasGallons, gasPricePerGallon },
    ];

    setLoading(true);
    try {
      const results = await Promise.all(
        allItems.map(item => {
          const isGas = item.category === 'GAS' || item.category === 'DIESEL';
          const payload: any = {
            customerQrCode: customerQr,
            storeId,
            purchaseAmount: parseFloat(item.amount),
            category: item.category,
          };
          if (isGas && item.gasGallons) {
            const gal = parseFloat(item.gasGallons);
            const ppg = parseFloat(item.gasPricePerGallon || '0');
            payload.isGas = true;
            payload.gasGallons = gal;
            if (!isNaN(ppg) && ppg > 0) payload.gasPricePerGallon = ppg;
          }
          return pointsApi.initiateGrant(payload);
        })
      );

      setTransactionIds(results.map(r => r.data.data.transactionId));
      setCustomerInfo(results[0].data.data.customer);
      setPointsAwarded(results.reduce((sum, r) => sum + r.data.data.pointsAwarded, 0));
      setGasBonusAwarded(results.reduce((sum, r) => sum + (r.data.data.gasBonusPoints || 0), 0));
      setPromotionApplied(results.find(r => r.data.data.promotionApplied)?.data.data.promotionApplied || null);
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
      // Upload the same receipt photo to every transaction created
      await Promise.all(
        transactionIds.map(id => {
          const formData = new FormData();
          formData.append('receipt', { uri: receiptImage, name: 'receipt.jpg', type: 'image/jpeg' } as any);
          return pointsApi.uploadReceipt(id, formData);
        })
      );
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

  async function handleClaimBenefit() {
    if (!storeId) {
      Toast.show({ type: 'error', text1: 'No store assigned to your account' });
      return;
    }
    setLoading(true);
    try {
      await pointsApi.claimTierBenefit(customerQr, storeId);
      setStep('benefit-done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Claim failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleCatalogRedeem() {
    if (!selectedCatalogItem || !storeId) return;
    setLoading(true);
    try {
      await pointsApi.processCatalogRedemption(customerQr, selectedCatalogItem.id, storeId);
      setStep('catalog-done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Redemption failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmPending(redemption: any) {
    if (!storeId) {
      Toast.show({ type: 'error', text1: 'No store assigned to your account' });
      return;
    }
    setLoading(true);
    try {
      await catalogApi.confirmRedemption(redemption.id, storeId);
      setConfirmedPending(redemption);
      setStep('pending-done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Confirmation failed' });
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmWelcomeBonus() {
    if (!welcomeBonus) return;
    setLoading(true);
    try {
      const res = await welcomeBonusApi.confirm(welcomeBonus.claimCode, storeId);
      setConfirmedWelcomeBonus(res.data.data);
      setStep('welcome-bonus-done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Confirmation failed' });
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

  const cdata = customerData;
  const tier = cdata?.tier || 'BRONZE';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.BRONZE;
  const benefitAvailable = cdata?.benefit?.available;
  const benefitType = cdata?.benefit?.type;
  const silverRemaining = cdata?.benefit?.silverRemaining ?? 0;

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
          {loading && (
            <View style={s.scanLoadingOverlay}>
              <ActivityIndicator size="large" color={COLORS.accent} />
              <Text style={s.scanLoadingText}>Loading customer info…</Text>
            </View>
          )}
          <CameraView
            style={s.fill}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={loading ? undefined : handleQrScan}
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
          {/* Customer tier card */}
          {cdata && (
            <View style={[s.customerCard, { borderLeftColor: tierCfg.color, borderLeftWidth: 4 }]}>
              <View style={s.customerCardLeft}>
                <View style={[s.customerAvatar, { backgroundColor: tierCfg.color + '20' }]}>
                  <Text style={[s.customerAvatarText, { color: tierCfg.color }]}>
                    {(cdata.name || cdata.phone || '?')[0].toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={s.customerName}>{cdata.name || cdata.phone}</Text>
                  {cdata.name && <Text style={s.customerPhone}>{cdata.phone}</Text>}
                </View>
              </View>
              <View style={s.customerCardRight}>
                <TierBadge tier={tier} />
                <View style={s.customerBalanceRow}>
                  <Text style={s.customerBalancePts}>{cdata.pointsBalance?.toLocaleString() || 0}</Text>
                  <Text style={s.customerBalancePtsLabel}> pts</Text>
                </View>
              </View>
            </View>
          )}

          {!cdata && (
            <View style={s.successBadge}>
              <Text style={s.successBadgeIcon}>✅</Text>
              <View>
                <Text style={s.successBadgeTitle}>QR Scanned Successfully</Text>
                <Text style={s.successBadgeSub}>Select action to proceed</Text>
              </View>
            </View>
          )}

          {/* Pending Catalog Redemptions — customer-initiated holds awaiting confirmation */}
          {pendingRedemptions.length > 0 && (
            <View style={s.pendingSection}>
              <Text style={s.pendingSectionTitle}>🎁 Pending Redemptions ({pendingRedemptions.length})</Text>
              <Text style={s.pendingSectionSub}>Customer redeemed these — confirm to complete</Text>
              {pendingRedemptions.map((r) => {
                const expiresAt = new Date(r.expiresAt);
                const msLeft = expiresAt.getTime() - Date.now();
                const minLeft = Math.max(0, Math.floor(msLeft / 60000));
                const secLeft = Math.max(0, Math.floor((msLeft % 60000) / 1000));
                const urgent = msLeft < 5 * 60 * 1000;
                return (
                  <View
                    key={r.id}
                    style={[s.pendingCard, urgent && s.pendingCardUrgent]}
                  >
                    <View style={s.pendingCardLeft}>
                      <Text style={s.pendingItemName}>
                        {r.catalogItem?.emoji ? `${r.catalogItem.emoji} ` : '🎁'}{r.catalogItem?.title}
                      </Text>
                      <View style={s.pendingCodeRow}>
                        <Text style={s.pendingCodeLabel}>CODE: </Text>
                        <Text style={s.pendingCode}>{r.redemptionCode}</Text>
                      </View>
                      <Text style={[s.pendingTimer, urgent && s.pendingTimerUrgent]}>
                        ⏱ {minLeft}:{String(secLeft).padStart(2, '0')} remaining
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.confirmBtn, loading && s.primaryBtnOff]}
                      onPress={() => handleConfirmPending(r)}
                      disabled={loading}
                      activeOpacity={0.85}
                    >
                      {loading
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={s.confirmBtnText}>✓ Confirm</Text>}
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Grant Points */}
          <TouchableOpacity style={s.modeCard} onPress={() => setStep('grant-amount')} activeOpacity={0.85}>
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

          {/* Redeem Credits */}
          <TouchableOpacity style={[s.modeCard, s.modeCardAlt]} onPress={() => setStep('redeem-amount')} activeOpacity={0.85}>
            <View style={[s.modeIconBg, { backgroundColor: COLORS.accent + '15' }]}>
              <Text style={s.modeEmoji}>💳</Text>
            </View>
            <View style={s.modeBody}>
              <Text style={[s.modeTitle, { color: COLORS.accent }]}>Redeem Credits</Text>
              <Text style={s.modeSub}>Apply balance toward purchase</Text>
            </View>
            <View style={[s.modeArrow, { backgroundColor: COLORS.accent }]}>
              <Text style={s.modeArrowText}>›</Text>
            </View>
          </TouchableOpacity>

          {/* Tier Benefit — show when available */}
          {benefitAvailable && (
            <TouchableOpacity
              style={[s.modeCard, { borderColor: tierCfg.color + '60' }]}
              onPress={handleClaimBenefit}
              disabled={loading}
              activeOpacity={0.85}
            >
              <View style={[s.modeIconBg, { backgroundColor: tierCfg.color + '18' }]}>
                <Text style={s.modeEmoji}>{benefitType === 'SILVER_FOUNTAIN' ? '🥤' : '☕'}</Text>
              </View>
              <View style={s.modeBody}>
                <Text style={[s.modeTitle, { color: tierCfg.color }]}>
                  {benefitType === 'SILVER_FOUNTAIN' ? 'Free Fountain Drink' : 'Free Drink / Coffee'}
                </Text>
                <Text style={s.modeSub}>
                  {benefitType === 'SILVER_FOUNTAIN'
                    ? `${silverRemaining} uses left this period`
                    : `${tier.charAt(0) + tier.slice(1).toLowerCase()} tier — 1 per day`}
                </Text>
              </View>
              {loading ? (
                <ActivityIndicator color={tierCfg.color} style={{ marginRight: 4 }} />
              ) : (
                <View style={[s.modeArrow, { backgroundColor: tierCfg.color }]}>
                  <Text style={s.modeArrowText}>›</Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {/* Catalog Redeem — show when catalog has items and customer has balance */}
          {catalogItems.length > 0 && (
            <TouchableOpacity
              style={[s.modeCard, { borderColor: '#9B5DE5' + '50' }]}
              onPress={() => setStep('catalog-select')}
              activeOpacity={0.85}
            >
              <View style={[s.modeIconBg, { backgroundColor: '#9B5DE5' + '15' }]}>
                <Text style={s.modeEmoji}>🎁</Text>
              </View>
              <View style={s.modeBody}>
                <Text style={[s.modeTitle, { color: '#9B5DE5' }]}>Catalog Reward</Text>
                <Text style={s.modeSub}>Redeem points for a fixed reward</Text>
              </View>
              <View style={[s.modeArrow, { backgroundColor: '#9B5DE5' }]}>
                <Text style={s.modeArrowText}>›</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Welcome Bonus — show when customer has an unconfirmed claim for today */}
          {welcomeBonus && (
            <TouchableOpacity
              style={[s.modeCard, { borderColor: '#F59E0B60' }]}
              onPress={handleConfirmWelcomeBonus}
              disabled={loading}
              activeOpacity={0.85}
            >
              <View style={[s.modeIconBg, { backgroundColor: '#FEF3C7' }]}>
                <Text style={s.modeEmoji}>{welcomeBonus.rewardEmoji || '🎁'}</Text>
              </View>
              <View style={s.modeBody}>
                <Text style={[s.modeTitle, { color: '#D97706' }]}>Welcome Bonus · Day {welcomeBonus.day}</Text>
                <Text style={s.modeSub}>{welcomeBonus.rewardLabel} — CODE: {welcomeBonus.claimCode}</Text>
              </View>
              {loading
                ? <ActivityIndicator color="#F59E0B" style={{ marginRight: 4 }} />
                : <View style={[s.modeArrow, { backgroundColor: '#F59E0B' }]}>
                    <Text style={s.modeArrowText}>✓</Text>
                  </View>}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ──────────────────────── GRANT: AMOUNT ────────────────────────── */}
      {step === 'grant-amount' && (
        <ScrollView style={s.fill} contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">

          {/* Committed items list */}
          {lineItems.length > 0 && (
            <View style={s.committedBox}>
              <Text style={s.committedBoxLabel}>Added ({lineItems.length})</Text>
              {lineItems.map(item => {
                const cat = CATEGORIES.find(c => c.value === item.category);
                return (
                  <View key={item.id} style={s.committedRow}>
                    <Text style={s.committedRowIcon}>{cat?.icon}</Text>
                    <Text style={s.committedRowCat}>{cat?.label}</Text>
                    <Text style={s.committedRowAmt}>${parseFloat(item.amount).toFixed(2)}</Text>
                    {item.gasGallons && (
                      <Text style={s.committedRowGas}>{parseFloat(item.gasGallons).toFixed(3)} gal</Text>
                    )}
                    <TouchableOpacity
                      onPress={() => setLineItems(prev => prev.filter(i => i.id !== item.id))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={s.committedRowRemove}>×</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}

          {/* Category grid */}
          <Text style={s.fieldLabel}>{lineItems.length > 0 ? 'Next Item — Category' : 'Category'}</Text>
          <View style={s.catGrid}>
            {CATEGORIES.filter(c => {
              const enabled = storeId ? (storeGasPrices[storeId]?.enabledCategories ?? []) : [];
              return enabled.length === 0 || enabled.includes(c.value);
            }).map((c) => {
              const active = category === c.value;
              return (
                <TouchableOpacity
                  key={c.value}
                  style={[s.catCell, active && s.catCellActive]}
                  onPress={() => selectCategory(c.value)}
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

          {/* Gas extras */}
          {isGasCat && (
            <View style={s.gasBox}>
              <View style={s.gasRow}>
                {/* Price per gallon — editable, auto-filled from store */}
                <View style={[s.amountBox, { flex: 1 }]}>
                  <Text style={s.amountDollar}>$</Text>
                  <TextInput
                    style={[s.amountInput, { fontSize: 28 }]}
                    placeholder="0.00/gal"
                    placeholderTextColor={COLORS.textMuted}
                    keyboardType="decimal-pad"
                    value={gasPricePerGallon}
                    onChangeText={setGasPricePerGallon}
                  />
                </View>
                {/* Gallons — auto-calculated, read-only display */}
                <View style={[s.amountBox, { flex: 1, backgroundColor: '#f0f8f0', borderColor: '#2DC653' }]}>
                  <Text style={[s.gasUnit, { color: '#2DC653' }]}>gal</Text>
                  <Text style={[s.amountInput, { fontSize: 28, color: validGallons ? '#1a7a1a' : COLORS.textMuted, textAlignVertical: 'center' }]}>
                    {validGallons ? parsedGallons.toFixed(3) : '—'}
                  </Text>
                </View>
              </View>
              {validGallons && (
                <Text style={{ fontSize: 11, color: '#6b7280', textAlign: 'center', marginTop: 4 }}>
                  Gallons auto-calculated from ${parsedPPG.toFixed(2)}/gal
                </Text>
              )}
              {/* Gas bonus preview */}
              {['GOLD','DIAMOND','PLATINUM'].includes(tier) && validGallons && (
                <View style={[s.gasBonus, { borderColor: tierCfg.color + '50', backgroundColor: tierCfg.color + '10' }]}>
                  <Text style={s.gasBonusEmoji}>{tierCfg.emoji}</Text>
                  <Text style={[s.gasBonusText, { color: tierCfg.color }]}>
                    {tier} gas bonus: +{Math.round(
                      parsedGallons * ({ GOLD: 5, DIAMOND: 7, PLATINUM: 10 } as any)[tier]
                    )} pts for {parsedGallons} gal
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Live pts preview */}
          {estimatedCashback && (
            <View style={s.previewCard}>
              <View style={s.previewRow}>
                <Text style={s.previewLabel}>Est. points earned</Text>
                <Text style={s.previewAmount}>+{estimatedCashback} pts</Text>
              </View>
              <View style={s.previewRow}>
                <Text style={s.previewLabel}>Rate</Text>
                <Text style={s.previewRate}>
                  {isGasCat && gasCentsPerGallon != null
                    ? `${gasCentsPerGallon}¢/gal (${customerTier} · promos add on top)`
                    : `${tierMult} pts per $1 (${customerTier} · promos applied at grant)`}
                </Text>
              </View>
              <View style={s.previewDivider} />
              <Text style={s.previewNote}>Final amount confirmed after submission</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={s.grantBtnRow}>
            <TouchableOpacity
              style={[s.addAnotherBtn, (!validAmount || !validGallons) && s.addAnotherBtnOff]}
              onPress={addCurrentItem}
              disabled={!validAmount || !validGallons}
              activeOpacity={0.8}
            >
              <Text style={s.addAnotherBtnText}>+ Add{'\n'}Another</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.primaryBtn, s.grantMainBtn, (!validAmount || !validGallons || loading) && s.primaryBtnOff]}
              onPress={handleGrantPoints}
              disabled={!validAmount || !validGallons || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>
                    {lineItems.length > 0
                      ? `Grant All (${lineItems.length + 1} items) →`
                      : 'Continue to Receipt →'}
                  </Text>}
            </TouchableOpacity>
          </View>

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
            <View style={s.customerCardLeft}>
              <View style={s.customerAvatar}>
                <Text style={s.customerAvatarText}>
                  {(customerInfo?.name || customerInfo?.phone || '?')[0].toUpperCase()}
                </Text>
              </View>
              <View>
                <Text style={s.customerName}>{customerInfo?.name || customerInfo?.phone}</Text>
                {customerInfo?.phone && customerInfo?.name && (
                  <Text style={s.customerPhone}>{customerInfo.phone}</Text>
                )}
              </View>
            </View>
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={s.pointsPill}>
                <Text style={s.pointsPillText}>
                  +{Math.round(pointsAwarded * 100)} pts cashback
                </Text>
              </View>
              {gasBonusAwarded > 0 && (
                <View style={[s.pointsPill, { backgroundColor: tierCfg.color + '20' }]}>
                  <Text style={[s.pointsPillText, { color: tierCfg.color }]}>
                    +{Math.round(gasBonusAwarded * 100)} gas bonus
                  </Text>
                </View>
              )}
            </View>
          </View>

          {promotionApplied && (
            <View style={s.promoBanner}>
              <Text style={s.promoBannerText}>🎉 Promo: {promotionApplied}</Text>
            </View>
          )}

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
          <Text style={s.doneAmount}>+{Math.round(pointsAwarded * 100)} pts</Text>
          {gasBonusAwarded > 0 && (
            <Text style={[s.doneSub, { color: tierCfg.color, fontWeight: '700' }]}>
              +{Math.round(gasBonusAwarded * 100)} gas bonus pts ({tier})
            </Text>
          )}
          <Text style={s.doneName}>{customerInfo?.name || customerInfo?.phone}</Text>
          <Text style={s.doneSub}>
            {transactionIds.length > 1
              ? `${transactionIds.length} categories — cashback credited`
              : 'Cashback credited to their account'}
          </Text>
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
            <Text style={s.successBadgeIcon}>💳</Text>
            <View>
              <Text style={[s.successBadgeTitle, { color: COLORS.accent }]}>Redeem Credits</Text>
              <Text style={s.successBadgeSub}>Enter amount to deduct from balance</Text>
            </View>
          </View>

          {cdata && (
            <View style={s.balanceHint}>
              <Text style={s.balanceHintText}>
                Balance: {cdata.pointsBalance?.toLocaleString() || 0} pts
                {' '}(${(cdata.pointsBalance / 100).toFixed(2)})
              </Text>
            </View>
          )}

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
            <Text style={s.newBalanceValue}>{Math.round(Number(customerInfo?.pointsBalance ?? 0) * 100).toLocaleString()} pts</Text>
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

      {/* ──────────────────────── BENEFIT: DONE ────────────────────────── */}
      {step === 'benefit-done' && (
        <View style={[s.fill, s.center]}>
          <View style={[s.doneIconRing, { backgroundColor: tierCfg.color + '20' }]}>
            <Text style={s.doneEmoji}>{benefitType === 'SILVER_FOUNTAIN' ? '🥤' : '☕'}</Text>
          </View>
          <Text style={s.doneHeading}>Benefit Claimed!</Text>
          <Text style={[s.doneAmount, { color: tierCfg.color }]}>
            {benefitType === 'SILVER_FOUNTAIN' ? 'Free Fountain Drink' : 'Free Drink / Coffee'}
          </Text>
          <Text style={s.doneName}>{cdata?.name || cdata?.phone}</Text>
          <View style={[s.newBalanceCard, { borderColor: tierCfg.color + '40' }]}>
            <Text style={s.newBalanceLabel}>{tierCfg.emoji} {tierCfg.label} Member</Text>
            {benefitType === 'SILVER_FOUNTAIN' && (
              <Text style={s.newBalanceValue}>{silverRemaining - 1} uses remaining</Text>
            )}
          </View>
          <TouchableOpacity style={[s.primaryBtn, s.doneBtn]} onPress={reset} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ──────────────────────── CATALOG: SELECT ────────────────────────── */}
      {step === 'catalog-select' && (
        <View style={s.fill}>
          <View style={s.catalogHeader}>
            <Text style={s.catalogHeaderTitle}>🎁 Catalog Rewards</Text>
            {cdata && (
              <Text style={s.catalogHeaderBalance}>
                Balance: {cdata.pointsBalance?.toLocaleString() || 0} pts
              </Text>
            )}
          </View>
          <FlatList
            data={catalogItems}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ padding: 16, gap: 12 }}
            renderItem={({ item }) => {
              const canAfford = (cdata?.pointsBalance || 0) >= item.pointsCost;
              const selected = selectedCatalogItem?.id === item.id;
              return (
                <TouchableOpacity
                  style={[
                    s.catalogItem,
                    selected && s.catalogItemSelected,
                    !canAfford && s.catalogItemDisabled,
                  ]}
                  onPress={() => canAfford && setSelectedCatalogItem(item)}
                  activeOpacity={canAfford ? 0.8 : 1}
                >
                  <View style={s.catalogItemLeft}>
                    <Text style={s.catalogItemName}>{item.emoji ? `${item.emoji} ` : ''}{item.title}</Text>
                    {item.description ? (
                      <Text style={s.catalogItemDesc}>{item.description}</Text>
                    ) : null}
                  </View>
                  <View style={[s.catalogItemCost, selected && { backgroundColor: '#9B5DE5' }]}>
                    <Text style={[s.catalogItemCostText, selected && { color: '#fff' }]}>
                      {item.pointsCost.toLocaleString()}
                    </Text>
                    <Text style={[s.catalogItemCostLabel, selected && { color: 'rgba(255,255,255,0.75)' }]}>pts</Text>
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              <View style={s.emptyState}>
                <Text style={s.emptyStateText}>No catalog items available</Text>
              </View>
            }
          />
          <View style={s.catalogFooter}>
            <TouchableOpacity
              style={[s.primaryBtn, { backgroundColor: '#9B5DE5', flex: 1 }, (!selectedCatalogItem || loading) && s.primaryBtnOff]}
              onPress={handleCatalogRedeem}
              disabled={!selectedCatalogItem || loading}
              activeOpacity={0.85}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.primaryBtnText}>
                    {selectedCatalogItem ? `Redeem — ${selectedCatalogItem.pointsCost.toLocaleString()} pts` : 'Select a reward'}
                  </Text>}
            </TouchableOpacity>
            <TouchableOpacity style={s.ghostBtn} onPress={() => setStep('mode')}>
              <Text style={s.ghostBtnText}>← Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ──────────────────────── CATALOG: DONE ────────────────────────── */}
      {step === 'catalog-done' && (
        <View style={[s.fill, s.center]}>
          <View style={[s.doneIconRing, { backgroundColor: '#9B5DE5' + '20' }]}>
            <Text style={s.doneEmoji}>🎁</Text>
          </View>
          <Text style={s.doneHeading}>Reward Redeemed!</Text>
          <Text style={[s.doneAmount, { color: '#9B5DE5', fontSize: 22 }]}>
            {selectedCatalogItem?.emoji ? `${selectedCatalogItem.emoji} ` : ''}{selectedCatalogItem?.title}
          </Text>
          <Text style={s.doneName}>{cdata?.name || cdata?.phone}</Text>
          <View style={s.newBalanceCard}>
            <Text style={s.newBalanceLabel}>Points deducted</Text>
            <Text style={[s.newBalanceValue, { color: '#9B5DE5' }]}>
              -{selectedCatalogItem?.pointsCost?.toLocaleString()} pts
            </Text>
          </View>
          <TouchableOpacity style={[s.primaryBtn, s.doneBtn, { backgroundColor: '#9B5DE5' }]} onPress={reset} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ──────────────────────── WELCOME BONUS: DONE ────────────────────────── */}
      {step === 'welcome-bonus-done' && (
        <View style={[s.fill, s.center]}>
          <View style={[s.doneIconRing, { backgroundColor: '#FEF3C720' }]}>
            <Text style={s.doneEmoji}>{confirmedWelcomeBonus?.rewardEmoji || '🎁'}</Text>
          </View>
          <Text style={s.doneHeading}>Welcome Bonus Confirmed!</Text>
          <Text style={[s.doneAmount, { color: '#D97706', fontSize: 22 }]}>
            {confirmedWelcomeBonus?.rewardLabel}
          </Text>
          <Text style={s.doneName}>{cdata?.name || cdata?.phone}</Text>
          <View style={s.newBalanceCard}>
            <Text style={s.newBalanceLabel}>Day {confirmedWelcomeBonus?.day} of 7 redeemed</Text>
          </View>
          <TouchableOpacity style={[s.primaryBtn, s.doneBtn, { backgroundColor: '#F59E0B' }]} onPress={reset} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ──────────────────────── PENDING REDEMPTION: DONE ────────────────────────── */}
      {step === 'pending-done' && (
        <View style={[s.fill, s.center]}>
          <View style={[s.doneIconRing, { backgroundColor: '#22C55E20' }]}>
            <Text style={s.doneEmoji}>✅</Text>
          </View>
          <Text style={s.doneHeading}>Reward Confirmed!</Text>
          <Text style={[s.doneAmount, { color: '#22C55E', fontSize: 22 }]}>
            {confirmedPending?.catalogItem?.emoji ? `${confirmedPending.catalogItem.emoji} ` : ''}
            {confirmedPending?.catalogItem?.title}
          </Text>
          <Text style={s.doneName}>{cdata?.name || cdata?.phone}</Text>
          <View style={s.newBalanceCard}>
            <Text style={s.newBalanceLabel}>Code redeemed</Text>
            <Text style={[s.newBalanceValue, { color: '#22C55E', letterSpacing: 4, fontSize: 22 }]}>
              {confirmedPending?.redemptionCode}
            </Text>
          </View>
          <Text style={[s.doneSub, { marginTop: 8 }]}>
            -{confirmedPending?.pointsSpent?.toLocaleString()} pts already deducted
          </Text>
          <TouchableOpacity style={[s.primaryBtn, s.doneBtn, { backgroundColor: '#22C55E' }]} onPress={reset} activeOpacity={0.85}>
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
  scanLoadingOverlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    zIndex: 10, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', gap: 12,
  },
  scanLoadingText: { color: '#fff', fontSize: 15, fontWeight: '700' },
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

  // ── Customer card ─────────────────────────────────────────────────────────────
  customerCard: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
    borderLeftWidth: 4, borderLeftColor: COLORS.primary,
  },
  customerCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  customerCardRight: { alignItems: 'flex-end', gap: 6 },
  customerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  customerAvatarText: { fontSize: 18, fontWeight: '800', color: COLORS.primary },
  customerName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  customerPhone: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },
  customerBalanceRow: { flexDirection: 'row', alignItems: 'baseline' },
  customerBalancePts: { fontSize: 20, fontWeight: '900', color: COLORS.text },
  customerBalancePtsLabel: { fontSize: 11, fontWeight: '700', color: COLORS.textMuted },

  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20,
    borderWidth: 1.5,
  },
  tierBadgeEmoji: { fontSize: 13 },
  tierBadgeText: { fontSize: 12, fontWeight: '800' },

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

  balanceHint: {
    backgroundColor: COLORS.accent + '12', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: COLORS.accent + '30',
  },
  balanceHintText: { fontSize: 14, color: COLORS.accent, fontWeight: '700', textAlign: 'center' },

  // ── Category grid ─────────────────────────────────────────────────────────────
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  required: { color: COLORS.error, textTransform: 'none', fontWeight: '600' },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCell: {
    width: '23%', aspectRatio: 1,
    backgroundColor: COLORS.white, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', gap: 4,
    borderWidth: 2, borderColor: COLORS.border,
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
  },
  amountDollar: { fontSize: 36, fontWeight: '700', color: COLORS.textMuted, marginRight: 8 },
  amountInput: { flex: 1, fontSize: 44, fontWeight: '800', color: COLORS.text, paddingVertical: 14 },

  // ── Gas extras ────────────────────────────────────────────────────────────────
  gasBox: { gap: 10 },
  gasRow: { flexDirection: 'row', gap: 10 },
  gasUnit: { fontSize: 18, fontWeight: '700', color: COLORS.textMuted, marginRight: 4 },
  gasBonus: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderRadius: 12, padding: 12, borderWidth: 1.5,
  },
  gasBonusEmoji: { fontSize: 18 },
  gasBonusText: { fontSize: 14, fontWeight: '700' },

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

  // ── Points pill ───────────────────────────────────────────────────────────────
  pointsPill: {
    backgroundColor: COLORS.success + '18', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  pointsPillText: { color: COLORS.success, fontWeight: '800', fontSize: 14 },

  // ── Promo banner ──────────────────────────────────────────────────────────────
  promoBanner: {
    backgroundColor: COLORS.primary + '12', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: COLORS.primary + '25',
  },
  promoBannerText: { fontSize: 14, color: COLORS.primary, fontWeight: '700', textAlign: 'center' },

  // ── Receipt ───────────────────────────────────────────────────────────────────
  receiptBox: {
    backgroundColor: COLORS.white, borderRadius: 18, minHeight: 150,
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  receiptBoxFilled: { borderStyle: 'solid', borderColor: COLORS.success },
  receiptIcon: { fontSize: 36, marginBottom: 8 },
  receiptTitle: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  receiptSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  receiptImg: { width: '100%', height: 200, resizeMode: 'cover' },
  retakeRow: { padding: 10, alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.04)' },
  retakeText: { fontSize: 13, color: COLORS.textMuted, fontWeight: '600' },

  // ── Multi-item committed list ─────────────────────────────────────────────────
  committedBox: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    borderWidth: 1.5, borderColor: COLORS.primary + '30', gap: 8,
  },
  committedBoxLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.primary,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 2,
  },
  committedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.background, borderRadius: 10, padding: 10,
  },
  committedRowIcon: { fontSize: 18 },
  committedRowCat: { fontSize: 13, fontWeight: '700', color: COLORS.text, flex: 1 },
  committedRowAmt: { fontSize: 14, fontWeight: '800', color: COLORS.success },
  committedRowGas: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  committedRowRemove: { fontSize: 20, color: COLORS.error, fontWeight: '700', paddingHorizontal: 4 },

  // ── Grant buttons row ─────────────────────────────────────────────────────────
  grantBtnRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
  addAnotherBtn: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: COLORS.primary,
    minWidth: 80,
  },
  addAnotherBtnOff: { opacity: 0.35 },
  addAnotherBtnText: { color: COLORS.primary, fontWeight: '800', fontSize: 13, textAlign: 'center', lineHeight: 18 },
  grantMainBtn: { flex: 1 },

  // ── Buttons ───────────────────────────────────────────────────────────────────
  primaryBtn: {
    backgroundColor: COLORS.primary, borderRadius: 16,
    padding: 17, alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  primaryBtnOff: { opacity: 0.45, shadowOpacity: 0 },
  primaryBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  ghostBtn: { padding: 14, alignItems: 'center' },
  ghostBtnText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
  dangerBtn: { padding: 14, alignItems: 'center' },
  dangerBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 14 },

  // ── Permission screen ─────────────────────────────────────────────────────────
  permIcon: { fontSize: 64, marginBottom: 16 },
  permTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  permSub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, marginBottom: 24, lineHeight: 20 },

  // ── Done screen ───────────────────────────────────────────────────────────────
  doneIconRing: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: COLORS.success + '20',
    alignItems: 'center', justifyContent: 'center', marginBottom: 20,
  },
  doneEmoji: { fontSize: 44 },
  doneHeading: { fontSize: 28, fontWeight: '900', color: COLORS.text, marginBottom: 4 },
  doneAmount: { fontSize: 36, fontWeight: '900', color: COLORS.success, marginBottom: 6 },
  doneName: { fontSize: 16, color: COLORS.textMuted, fontWeight: '600', marginBottom: 6 },
  doneSub: { fontSize: 14, color: COLORS.textMuted, marginBottom: 24 },
  doneBtn: { marginTop: 12, width: 260 },
  newBalanceCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    alignItems: 'center', marginBottom: 28, marginTop: 10,
    borderWidth: 1.5, borderColor: COLORS.border, minWidth: 200,
  },
  newBalanceLabel: { fontSize: 12, color: COLORS.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  newBalanceValue: { fontSize: 26, fontWeight: '900', color: COLORS.text, marginTop: 4 },

  // ── Redeem info ───────────────────────────────────────────────────────────────
  redeemInfo: {
    backgroundColor: COLORS.secondary + '0d', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: COLORS.secondary + '18',
  },
  redeemInfoText: { fontSize: 13, color: COLORS.text, lineHeight: 20 },

  // ── Catalog ───────────────────────────────────────────────────────────────────
  catalogHeader: {
    paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  catalogHeaderTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  catalogHeaderBalance: { fontSize: 13, color: '#9B5DE5', fontWeight: '700' },
  catalogItem: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  catalogItemSelected: { borderColor: '#9B5DE5', backgroundColor: '#9B5DE5' + '08' },
  catalogItemDisabled: { opacity: 0.4 },
  catalogItemLeft: { flex: 1, marginRight: 12 },
  catalogItemName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  catalogItemDesc: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  catalogItemCost: {
    alignItems: 'center', backgroundColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 64,
  },
  catalogItemCostText: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  catalogItemCostLabel: { fontSize: 10, fontWeight: '700', color: COLORS.textMuted, marginTop: 1 },
  catalogFooter: { padding: 16, gap: 4, borderTopWidth: 1, borderTopColor: COLORS.border },
  emptyState: { padding: 40, alignItems: 'center' },
  emptyStateText: { color: COLORS.textMuted, fontSize: 14 },

  // ── Pending redemptions ───────────────────────────────────────────────────────
  pendingSection: {
    backgroundColor: '#22C55E0D', borderRadius: 18, padding: 14,
    borderWidth: 1.5, borderColor: '#22C55E40',
    gap: 10,
  },
  pendingSectionTitle: { fontSize: 15, fontWeight: '800', color: '#16A34A' },
  pendingSectionSub: { fontSize: 12, color: COLORS.textMuted, marginTop: -6 },
  pendingCard: {
    backgroundColor: COLORS.white, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: '#22C55E50',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  pendingCardUrgent: { borderColor: '#EF444480', backgroundColor: '#FEF2F2' },
  pendingCardLeft: { flex: 1, marginRight: 10, gap: 4 },
  pendingItemName: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  pendingCodeRow: { flexDirection: 'row', alignItems: 'center' },
  pendingCodeLabel: { fontSize: 11, color: COLORS.textMuted, fontWeight: '600' },
  pendingCode: { fontSize: 14, fontWeight: '900', color: '#16A34A', letterSpacing: 2 },
  pendingTimer: { fontSize: 12, color: COLORS.textMuted, fontWeight: '600' },
  pendingTimerUrgent: { color: '#EF4444', fontWeight: '800' },
  confirmBtn: {
    backgroundColor: '#22C55E', borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  confirmBtnText: { color: '#fff', fontSize: 13, fontWeight: '800' },
});
