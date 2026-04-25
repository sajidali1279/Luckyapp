import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productRequestApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';

const STATUS_CONFIG = {
  PENDING:  { label: 'Pending',  color: '#b45309', bg: '#fffbeb', border: '#fde68a', dot: '#f59e0b' },
  ACCEPTED: { label: 'Accepted', color: '#065f46', bg: '#f0fdf4', border: '#86efac', dot: '#22c55e' },
  DECLINED: { label: 'Declined', color: '#9f1239', bg: '#fff1f2', border: '#fecaca', dot: '#ef4444' },
};

function daysLeft(expiresAt: string) {
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

interface Store { id: string; name: string; city: string; state: string }
interface ProductRequest {
  id: string; productName: string; description: string | null;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  responseNote: string | null;
  expiresAt: string; createdAt: string;
  store: { name: string; city: string };
}

export default function RequestProductScreen() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [selectedStore, setSelectedStore] = useState<Store | null>(null);
  const [productName, setProductName] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const { data: gasPricesData } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    staleTime: 5 * 60 * 1000,
  });
  const stores: Store[] = gasPricesData?.data?.data ?? [];

  const { data: myRequestsData, isLoading } = useQuery({
    queryKey: ['my-product-requests'],
    queryFn: () => productRequestApi.getMine(),
    staleTime: 60 * 1000,
  });
  const myRequests: ProductRequest[] = myRequestsData?.data?.data ?? [];

  const submitMut = useMutation({
    mutationFn: () => productRequestApi.submit({
      storeId: selectedStore!.id,
      productName: productName.trim(),
      description: description.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-product-requests'] });
      setSubmitted(true);
      setProductName('');
      setDescription('');
      setSelectedStore(null);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error || 'Failed to submit request';
      Alert.alert('Error', msg);
    },
  });

  function handleSubmit() {
    if (!selectedStore) { Alert.alert('Select a store first'); return; }
    if (!productName.trim()) { Alert.alert('Enter a product name'); return; }
    submitMut.mutate();
  }

  const pending  = myRequests.filter((r) => r.status === 'PENDING');
  const resolved = myRequests.filter((r) => r.status !== 'PENDING');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTextWrap}>
            <Text style={styles.headerTitle}>Request a Product</Text>
            <Text style={styles.headerSub}>Don't see something you want in-store? Let the team know!</Text>
          </View>
          <TouchableOpacity style={styles.newBtn} onPress={() => { setShowForm(true); setSubmitted(false); }}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
          {isLoading ? (
            <ActivityIndicator color={COLORS.primary} style={{ marginTop: 40 }} />
          ) : myRequests.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyIcon}>🛍️</Text>
              <Text style={styles.emptyTitle}>No requests yet</Text>
              <Text style={styles.emptySub}>Tap "+ New" to request a product you'd like to see in a Lucky Stop store.</Text>
            </View>
          ) : (
            <>
              {pending.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Active Requests</Text>
                  {pending.map((r) => <RequestCard key={r.id} request={r} />)}
                </>
              )}
              {resolved.length > 0 && (
                <>
                  <Text style={styles.sectionLabel}>Past Requests</Text>
                  {resolved.map((r) => <RequestCard key={r.id} request={r} />)}
                </>
              )}
            </>
          )}
        </ScrollView>

        {/* Submit Form Modal */}
        <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowForm(false)}>
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Product Request</Text>
              <TouchableOpacity onPress={() => { setShowForm(false); setSubmitted(false); }}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {submitted ? (
              <View style={styles.successWrap}>
                <Text style={styles.successIcon}>✅</Text>
                <Text style={styles.successTitle}>Request Submitted!</Text>
                <Text style={styles.successSub}>
                  The store team will review your request within 7 days. You'll get a notification with their response.
                </Text>
                <TouchableOpacity style={styles.doneBtn} onPress={() => setShowForm(false)}>
                  <Text style={styles.doneBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
                {/* Store Picker */}
                <Text style={styles.fieldLabel}>Store *</Text>
                <TouchableOpacity style={styles.storePicker} onPress={() => setShowStorePicker(true)}>
                  <Text style={[styles.storePickerText, !selectedStore && styles.placeholder]}>
                    {selectedStore ? `${selectedStore.name} — ${selectedStore.city}, ${selectedStore.state}` : 'Select a store…'}
                  </Text>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>

                {/* Product Name */}
                <Text style={styles.fieldLabel}>Product Name *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Celsius Energy Drink, Chobani Yogurt..."
                  placeholderTextColor="#adb5bd"
                  value={productName}
                  onChangeText={setProductName}
                  maxLength={100}
                  returnKeyType="next"
                />

                {/* Description */}
                <Text style={styles.fieldLabel}>More Details <Text style={styles.optional}>(optional)</Text></Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Brand, size, flavor, where you've seen it before..."
                  placeholderTextColor="#adb5bd"
                  value={description}
                  onChangeText={setDescription}
                  maxLength={300}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.hintBox}>
                  <Text style={styles.hintText}>
                    ⏱ Requests are live for 7 days. You'll receive a push notification when the store responds.
                  </Text>
                </View>

                <TouchableOpacity
                  style={[styles.submitBtn, (!selectedStore || !productName.trim() || submitMut.isPending) && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={!selectedStore || !productName.trim() || submitMut.isPending}
                >
                  {submitMut.isPending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={styles.submitBtnText}>Submit Request</Text>
                  }
                </TouchableOpacity>
              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>

        {/* Store Picker Modal */}
        <Modal visible={showStorePicker} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowStorePicker(false)}>
          <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select a Store</Text>
              <TouchableOpacity onPress={() => setShowStorePicker(false)}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView>
              {stores.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={[styles.storeOption, selectedStore?.id === store.id && styles.storeOptionActive]}
                  onPress={() => { setSelectedStore(store); setShowStorePicker(false); }}
                >
                  <View style={styles.storeOptionAvatar}>
                    <Text style={styles.storeOptionInitial}>{store.name[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.storeOptionName}>{store.name}</Text>
                    <Text style={styles.storeOptionCity}>{store.city}, {store.state}</Text>
                  </View>
                  {selectedStore?.id === store.id && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SafeAreaView>
        </Modal>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function RequestCard({ request }: { request: ProductRequest }) {
  const cfg = STATUS_CONFIG[request.status];
  const expired = daysLeft(request.expiresAt) === 0 && request.status === 'PENDING';
  return (
    <View style={styles.card}>
      <View style={[styles.cardStripe, { backgroundColor: cfg.dot }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.cardIconWrap}>
            <Text style={styles.cardIcon}>🛍️</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.productName}>{request.productName}</Text>
            <Text style={styles.storeName}>{request.store.name} · {request.store.city}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <View style={[styles.statusDot, { backgroundColor: cfg.dot }]} />
            <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>

        {request.description && (
          <Text style={styles.description}>"{request.description}"</Text>
        )}

        <View style={styles.cardMeta}>
          <Text style={styles.metaText}>Submitted {timeAgo(request.createdAt)}</Text>
          {request.status === 'PENDING' && !expired && (
            <View style={styles.expiryPill}>
              <Text style={styles.expiryText}>⏱ {daysLeft(request.expiresAt)}d left</Text>
            </View>
          )}
        </View>

        {request.responseNote && (
          <View style={[styles.responseBox, { backgroundColor: cfg.bg, borderColor: cfg.border }]}>
            <Text style={[styles.responseText, { color: cfg.color }]}>{request.responseNote}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f8f9fb' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: COLORS.primary,
  },
  headerTextWrap: { flex: 1, paddingRight: 12 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#fff', letterSpacing: -0.3 },
  headerSub: { fontSize: 12, color: 'rgba(255,255,255,0.75)', marginTop: 2 },
  newBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)',
  },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  scroll: { flex: 1 },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginHorizontal: 20, marginTop: 20, marginBottom: 8,
  },

  emptyWrap: { alignItems: 'center', padding: 40, marginTop: 20 },
  emptyIcon: { fontSize: 56, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a2e', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#6c757d', textAlign: 'center', lineHeight: 19 },

  // Card
  card: {
    flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16,
    marginHorizontal: 16, marginBottom: 10, overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardStripe: { width: 5 },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  cardIconWrap: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: '#f0f2f5', alignItems: 'center', justifyContent: 'center',
  },
  cardIcon: { fontSize: 20 },
  productName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  storeName: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  statusBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 4, borderRadius: 10, borderWidth: 1,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '700' },

  description: { fontSize: 12, color: '#6b7280', fontStyle: 'italic', marginBottom: 8, lineHeight: 17 },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  metaText: { fontSize: 11, color: '#adb5bd' },
  expiryPill: {
    backgroundColor: '#fffbeb', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: '#fde68a',
  },
  expiryText: { fontSize: 11, fontWeight: '700', color: '#b45309' },

  responseBox: { marginTop: 8, borderRadius: 10, padding: 10, borderWidth: 1 },
  responseText: { fontSize: 12, lineHeight: 17 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#1a1a2e' },
  modalClose: { fontSize: 18, color: '#6c757d', fontWeight: '700', padding: 4 },

  formScroll: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 16, textTransform: 'uppercase', letterSpacing: 0.5 },
  optional: { fontSize: 11, fontWeight: '400', textTransform: 'none', color: '#9ca3af' },

  storePicker: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fafafa',
  },
  storePickerText: { flex: 1, fontSize: 14, color: '#1a1a2e', fontWeight: '500' },
  placeholder: { color: '#adb5bd', fontWeight: '400' },
  chevron: { fontSize: 18, color: '#adb5bd', fontWeight: '300' },

  input: {
    borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: '#1a1a2e', backgroundColor: '#fafafa',
  },
  textarea: { minHeight: 80, paddingTop: 12 },

  hintBox: {
    backgroundColor: '#fffbeb', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#fde68a', marginTop: 16,
  },
  hintText: { fontSize: 12, color: '#92400e', lineHeight: 17 },

  submitBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center', marginTop: 20, marginBottom: 20,
  },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Success
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  successIcon: { fontSize: 64, marginBottom: 16 },
  successTitle: { fontSize: 22, fontWeight: '800', color: '#1a1a2e', marginBottom: 8 },
  successSub: { fontSize: 14, color: '#6c757d', textAlign: 'center', lineHeight: 20, marginBottom: 32 },
  doneBtn: { backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 },
  doneBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // Store picker list
  storeOption: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    borderBottomWidth: 1, borderBottomColor: '#f0f0f0', gap: 12,
  },
  storeOptionActive: { backgroundColor: '#f0fdf4' },
  storeOptionAvatar: {
    width: 42, height: 42, borderRadius: 12,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  storeOptionInitial: { color: '#fff', fontWeight: '800', fontSize: 16 },
  storeOptionName: { fontSize: 15, fontWeight: '700', color: '#1a1a2e' },
  storeOptionCity: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  checkmark: { fontSize: 18, color: '#16a34a', fontWeight: '700' },
});
