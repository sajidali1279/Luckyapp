import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import Toast from 'react-native-toast-message';
import { router } from 'expo-router';
import { receiptApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Step = 'scan' | 'loading' | 'confirm' | 'success' | 'error';

const CATEGORY_LABELS: Record<string, string> = {
  GAS: '⛽ Gas', DIESEL: '🚛 Diesel', HOT_FOODS: '🌮 Hot Foods',
  GROCERIES: '🛒 Groceries', FROZEN_FOODS: '🧊 Frozen Foods',
  FRESH_FOODS: '🥗 Fresh Foods', TOBACCO_VAPES: '🚬 Tobacco/Vapes', OTHER: '🏪 Other',
};

export default function ScanReceiptScreen() {
  const { updateBalance, user } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('scan');
  const [scanned, setScanned] = useState(false);
  const [tokenData, setTokenData] = useState<any>(null);
  const [claiming, setClaiming] = useState(false);
  const [earnedAmount, setEarnedAmount] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, []);

  async function handleBarCode({ data }: { data: string }) {
    if (scanned) return;
    if (!data.startsWith('LS:RECEIPT:')) {
      Toast.show({ type: 'error', text1: 'Not a Lucky Stop receipt QR code' });
      return;
    }
    setScanned(true);
    setStep('loading');

    const tokenId = data.replace('LS:RECEIPT:', '');
    try {
      const { data: res } = await receiptApi.getToken(tokenId);
      setTokenData({ ...res.data, tokenId });
      setStep('confirm');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Could not load receipt details');
      setStep('error');
    }
  }

  async function handleClaim() {
    if (!tokenData) return;
    setClaiming(true);
    try {
      const { data: res } = await receiptApi.selfGrant(tokenData.tokenId);
      setEarnedAmount(res.data.pointsAwarded);
      // Update balance in store
      const newBalance = Number(user?.pointsBalance || 0) + res.data.pointsAwarded;
      updateBalance(newBalance);
      setStep('success');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.error || 'Failed to claim points');
      setStep('error');
    } finally {
      setClaiming(false);
    }
  }

  // ── Scan step ──
  if (step === 'scan') {
    if (!permission?.granted) {
      return (
        <View style={s.center}>
          <Text style={s.permText}>Camera permission needed to scan receipts.</Text>
          <TouchableOpacity style={s.permBtn} onPress={requestPermission}>
            <Text style={s.permBtnText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor="#000" />
        <CameraView
          style={s.camera}
          facing="back"
          onBarcodeScanned={handleBarCode}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        />
        {/* Dark overlay with cutout */}
        <View style={s.overlay}>
          <View style={s.overlayTop} />
          <View style={s.overlayMiddle}>
            <View style={s.overlaySide} />
            <View style={s.scanFrame}>
              {/* Corner brackets */}
              <View style={[s.corner, s.cornerTL]} />
              <View style={[s.corner, s.cornerTR]} />
              <View style={[s.corner, s.cornerBL]} />
              <View style={[s.corner, s.cornerBR]} />
            </View>
            <View style={s.overlaySide} />
          </View>
          <View style={s.overlayBottom}>
            <Text style={s.scanHint}>Point camera at the QR code on the bottom of your receipt</Text>
            <TouchableOpacity style={s.cancelBtn} onPress={() => router.back()}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Loading step ──
  if (step === 'loading') {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={s.loadingText}>Reading receipt…</Text>
      </View>
    );
  }

  // ── Confirm step ──
  if (step === 'confirm' && tokenData) {
    const minsLeft = Math.ceil((new Date(tokenData.expiresAt).getTime() - Date.now()) / 60000);
    return (
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />
        <SafeAreaView style={s.confirmHeader}>
          <View style={s.confirmHeaderInner}>
            <Text style={s.confirmHeaderTitle}>📄 Confirm Receipt</Text>
            <Text style={s.confirmHeaderSub}>{tokenData.store?.name}</Text>
          </View>
        </SafeAreaView>

        <View style={s.confirmBody}>
          {/* Store total */}
          <View style={s.totalCard}>
            <Text style={s.totalLabel}>Receipt Total</Text>
            <Text style={s.totalAmount}>${Number(tokenData.total).toFixed(2)}</Text>
            <Text style={s.expiryNote}>⏱ Expires in {minsLeft} min</Text>
          </View>

          {/* Item breakdown */}
          <Text style={s.breakdownLabel}>Items</Text>
          {tokenData.items.map((item: any, i: number) => (
            <View key={i} style={s.itemRow}>
              <Text style={s.itemCat}>{CATEGORY_LABELS[item.category] || item.category}</Text>
              <View style={s.itemRight}>
                <Text style={s.itemAmount}>${Number(item.amount).toFixed(2)}</Text>
                <Text style={s.itemCashback}>+${Number(item.cashback).toFixed(2)}</Text>
              </View>
            </View>
          ))}

          {/* Cashback total */}
          <View style={s.cashbackCard}>
            <Text style={s.cashbackLabel}>You earn</Text>
            <Text style={s.cashbackAmount}>+${Number(tokenData.estimatedCashback).toFixed(2)}</Text>
            <Text style={s.cashbackNote}>Added to your Lucky Stop balance</Text>
          </View>

          <TouchableOpacity style={s.claimBtn} onPress={handleClaim} disabled={claiming}>
            {claiming
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.claimBtnText}>Claim ${Number(tokenData.estimatedCashback).toFixed(2)} →</Text>
            }
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelLink} onPress={() => router.back()}>
            <Text style={s.cancelLinkText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Success step ──
  if (step === 'success') {
    return (
      <View style={s.center}>
        <View style={s.successRing}>
          <Text style={s.successIcon}>✓</Text>
        </View>
        <Text style={s.successTitle}>Points Added!</Text>
        <Text style={s.successAmount}>+${earnedAmount.toFixed(2)}</Text>
        <Text style={s.successSub}>Added to your Lucky Stop balance</Text>
        <TouchableOpacity style={s.doneBtn} onPress={() => router.replace('/(customer)/home')}>
          <Text style={s.doneBtnText}>Done</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Error step ──
  return (
    <View style={s.center}>
      <Text style={s.errorIcon}>⚠️</Text>
      <Text style={s.errorTitle}>Couldn't Claim Points</Text>
      <Text style={s.errorMsg}>{errorMsg}</Text>
      <TouchableOpacity style={s.retryBtn} onPress={() => { setScanned(false); setStep('scan'); }}>
        <Text style={s.retryBtnText}>Scan Again</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.cancelLink} onPress={() => router.back()}>
        <Text style={s.cancelLinkText}>Go Back</Text>
      </TouchableOpacity>
    </View>
  );
}

const FRAME = 240;
const CORNER = 24;
const BORDER = 3;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 },

  // Camera
  camera: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  overlayMiddle: { flexDirection: 'row', height: FRAME },
  overlaySide: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)' },
  scanFrame: { width: FRAME, height: FRAME },
  overlayBottom: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', paddingTop: 24, gap: 16 },
  scanHint: { color: '#fff', fontSize: 14, textAlign: 'center', paddingHorizontal: 32, opacity: 0.9 },

  // Corner brackets
  corner: { position: 'absolute', width: CORNER, height: CORNER, borderColor: '#fff' },
  cornerTL: { top: 0, left: 0, borderTopWidth: BORDER, borderLeftWidth: BORDER },
  cornerTR: { top: 0, right: 0, borderTopWidth: BORDER, borderRightWidth: BORDER },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: BORDER, borderLeftWidth: BORDER },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: BORDER, borderRightWidth: BORDER },

  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 12 },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  // Permission
  permText: { color: COLORS.text, fontSize: 15, textAlign: 'center', marginBottom: 8 },
  permBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, paddingHorizontal: 28 },
  permBtnText: { color: '#fff', fontWeight: '700' },

  // Loading
  loadingText: { color: COLORS.textMuted, fontSize: 14, marginTop: 8 },

  // Confirm
  confirmHeader: { backgroundColor: COLORS.secondary },
  confirmHeaderInner: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18 },
  confirmHeaderTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  confirmHeaderSub: { color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 3 },
  confirmBody: { flex: 1, backgroundColor: COLORS.background, padding: 16, gap: 10 },

  totalCard: {
    backgroundColor: COLORS.secondary, borderRadius: 18, padding: 22, alignItems: 'center',
  },
  totalLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  totalAmount: { color: '#fff', fontSize: 42, fontWeight: '800', marginVertical: 4 },
  expiryNote: { color: 'rgba(255,255,255,0.6)', fontSize: 12 },

  breakdownLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.7 },
  itemRow: {
    backgroundColor: COLORS.white, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  itemCat: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  itemRight: { alignItems: 'flex-end' },
  itemAmount: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  itemCashback: { fontSize: 13, fontWeight: '700', color: COLORS.success, marginTop: 2 },

  cashbackCard: {
    backgroundColor: COLORS.primary + '12', borderRadius: 16, padding: 18, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.primary + '30',
  },
  cashbackLabel: { color: COLORS.primary, fontSize: 13, fontWeight: '700' },
  cashbackAmount: { color: COLORS.primary, fontSize: 38, fontWeight: '800', marginVertical: 4 },
  cashbackNote: { color: COLORS.textMuted, fontSize: 12 },

  claimBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 18, alignItems: 'center',
    shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  claimBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cancelLink: { alignItems: 'center', paddingVertical: 8 },
  cancelLinkText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '600' },

  // Success
  successRing: {
    width: 100, height: 100, borderRadius: 50,
    backgroundColor: COLORS.success + '18', borderWidth: 3, borderColor: COLORS.success,
    alignItems: 'center', justifyContent: 'center',
  },
  successIcon: { fontSize: 42, color: COLORS.success, fontWeight: '800' },
  successTitle: { fontSize: 26, fontWeight: '800', color: COLORS.text },
  successAmount: { fontSize: 48, fontWeight: '800', color: COLORS.success },
  successSub: { fontSize: 14, color: COLORS.textMuted },
  doneBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 48, marginTop: 8 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },

  // Error
  errorIcon: { fontSize: 56 },
  errorTitle: { fontSize: 22, fontWeight: '800', color: COLORS.text },
  errorMsg: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  retryBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 36 },
  retryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
