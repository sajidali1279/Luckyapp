import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ActivityIndicator, Alert, ScrollView, Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import Toast from 'react-native-toast-message';
import { pointsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

type Step = 'scan' | 'amount' | 'receipt' | 'done';

export default function EmployeeScanScreen() {
  const { user, logout } = useAuthStore();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<Step>('scan');
  const [scanned, setScanned] = useState(false);
  const [customerQr, setCustomerQr] = useState('');
  const [customerInfo, setCustomerInfo] = useState<any>(null);
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [pointsAwarded, setPointsAwarded] = useState(0);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const storeId = user?.storeIds?.[0]; // Employee's primary store

  async function handleQrScan({ data }: { data: string }) {
    if (scanned) return;
    setScanned(true);
    setCustomerQr(data);
    setStep('amount');
  }

  async function handleGrantPoints() {
    if (!purchaseAmount || isNaN(parseFloat(purchaseAmount))) {
      Toast.show({ type: 'error', text1: 'Enter a valid purchase amount' });
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
        purchaseAmount: parseFloat(purchaseAmount),
      });
      setTransactionId(data.data.transactionId);
      setCustomerInfo(data.data.customer);
      setPointsAwarded(data.data.pointsAwarded);
      setStep('receipt');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to create transaction' });
    } finally {
      setLoading(false);
    }
  }

  async function pickReceiptImage() {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!result.canceled) {
      setReceiptImage(result.assets[0].uri);
    }
  }

  async function handleUploadAndApprove() {
    if (!receiptImage) {
      Toast.show({ type: 'error', text1: 'Receipt photo is required', text2: 'Take a photo of the receipt first' });
      return;
    }
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('receipt', { uri: receiptImage, name: 'receipt.jpg', type: 'image/jpeg' } as any);
      await pointsApi.uploadReceipt(transactionId, formData);
      setStep('done');
    } catch (err: any) {
      Toast.show({ type: 'error', text1: 'Upload failed', text2: err.response?.data?.error });
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    setStep('scan');
    setScanned(false);
    setCustomerQr('');
    setCustomerInfo(null);
    setPurchaseAmount('');
    setTransactionId('');
    setPointsAwarded(0);
    setReceiptImage(null);
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.permText}>Camera permission needed to scan QR codes</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {step === 'scan' ? '📷 Scan Customer QR' :
           step === 'amount' ? '💵 Enter Purchase Amount' :
           step === 'receipt' ? '🧾 Upload Receipt' :
           '✅ Points Granted!'}
        </Text>
        <TouchableOpacity onPress={logout}>
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>

      {step === 'scan' && (
        <View style={styles.cameraContainer}>
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleQrScan}
          />
          <View style={styles.scanOverlay}>
            <View style={styles.scanBox} />
            <Text style={styles.scanHint}>Point camera at customer's QR code</Text>
          </View>
        </View>
      )}

      {step === 'amount' && (
        <ScrollView style={styles.formContainer}>
          <Text style={styles.label}>Purchase Total ($)</Text>
          <TextInput
            style={styles.input}
            placeholder="0.00"
            keyboardType="decimal-pad"
            value={purchaseAmount}
            onChangeText={setPurchaseAmount}
            autoFocus
          />
          {purchaseAmount && !isNaN(parseFloat(purchaseAmount)) && (
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>
                Customer earns: ${(parseFloat(purchaseAmount) * 0.05).toFixed(2)} credits
              </Text>
            </View>
          )}
          <TouchableOpacity style={styles.button} onPress={handleGrantPoints} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={reset}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {step === 'receipt' && (
        <ScrollView style={styles.formContainer}>
          <View style={styles.customerCard}>
            <Text style={styles.customerName}>{customerInfo?.name || customerInfo?.phone}</Text>
            <Text style={styles.customerPhone}>{customerInfo?.phone}</Text>
            <Text style={styles.pointsPreview}>
              +${pointsAwarded.toFixed(2)} credits pending receipt
            </Text>
          </View>

          <Text style={styles.label}>Receipt Photo (Required)</Text>
          <TouchableOpacity style={styles.receiptButton} onPress={pickReceiptImage}>
            {receiptImage ? (
              <Image source={{ uri: receiptImage }} style={styles.receiptPreview} />
            ) : (
              <Text style={styles.receiptButtonText}>📷 Take Photo of Receipt</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, !receiptImage && styles.buttonDisabled]}
            onPress={handleUploadAndApprove}
            disabled={loading || !receiptImage}
          >
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Grant Points</Text>}
          </TouchableOpacity>

          <Text style={styles.warning}>
            ⚠️ Points are only credited after receipt upload. This transaction is auditable.
          </Text>
        </ScrollView>
      )}

      {step === 'done' && (
        <View style={styles.center}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successTitle}>Points Granted!</Text>
          <Text style={styles.successAmount}>${pointsAwarded.toFixed(2)}</Text>
          <Text style={styles.successSub}>credited to {customerInfo?.name || customerInfo?.phone}</Text>
          <TouchableOpacity style={styles.button} onPress={reset}>
            <Text style={styles.buttonText}>Scan Next Customer</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 60, backgroundColor: COLORS.secondary,
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  logoutText: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  cameraContainer: { flex: 1, position: 'relative' },
  camera: { flex: 1 },
  scanOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
  scanBox: { width: 220, height: 220, borderWidth: 3, borderColor: COLORS.accent, borderRadius: 16 },
  scanHint: { color: '#fff', marginTop: 20, fontWeight: '600', textShadowColor: '#000', textShadowRadius: 4 },
  formContainer: { flex: 1, padding: 20 },
  label: { fontSize: 14, fontWeight: '600', color: COLORS.text, marginBottom: 8, marginTop: 16 },
  input: {
    backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 16, fontSize: 24, fontWeight: '700', color: COLORS.text,
  },
  previewBox: { backgroundColor: COLORS.primary + '15', borderRadius: 12, padding: 12, marginTop: 8 },
  previewText: { color: COLORS.primary, fontWeight: '600', fontSize: 15 },
  button: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 16 },
  buttonDisabled: { backgroundColor: COLORS.textMuted },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryButton: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  secondaryButtonText: { color: COLORS.textMuted, fontSize: 16 },
  customerCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 20, alignItems: 'center', marginBottom: 8 },
  customerName: { fontSize: 20, fontWeight: '700', color: COLORS.text },
  customerPhone: { color: COLORS.textMuted, marginTop: 4 },
  pointsPreview: { color: COLORS.success, fontWeight: '700', fontSize: 18, marginTop: 12 },
  receiptButton: {
    backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.border,
    borderStyle: 'dashed', borderRadius: 12, padding: 32, alignItems: 'center',
  },
  receiptButtonText: { color: COLORS.textMuted, fontSize: 16 },
  receiptPreview: { width: '100%', height: 200, borderRadius: 8, resizeMode: 'cover' },
  warning: { color: COLORS.textMuted, fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  permText: { fontSize: 16, color: COLORS.text, textAlign: 'center', marginBottom: 16 },
  successIcon: { fontSize: 64 },
  successTitle: { fontSize: 28, fontWeight: '800', color: COLORS.text, marginTop: 16 },
  successAmount: { fontSize: 48, fontWeight: '800', color: COLORS.success, marginTop: 8 },
  successSub: { color: COLORS.textMuted, fontSize: 15, marginTop: 8, marginBottom: 32 },
});
