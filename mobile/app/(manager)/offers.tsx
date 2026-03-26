import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, StatusBar,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { offersApi, managerApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

const CATEGORIES = [
  { value: 'GAS', label: '⛽ Gas' },
  { value: 'DIESEL', label: '🚛 Diesel' },
  { value: 'HOT_FOODS', label: '🌮 Hot Foods' },
  { value: 'GROCERIES', label: '🛒 Groceries' },
  { value: 'FROZEN_FOODS', label: '🧊 Frozen Foods' },
  { value: 'FRESH_FOODS', label: '🥗 Fresh Foods' },
  { value: 'TOBACCO_VAPES', label: '🚬 Tobacco/Vapes' },
];

function todayISO() {
  return new Date().toISOString();
}
function daysFromNow(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

export default function ManagerOffersScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bonusRate, setBonusRate] = useState('');
  const [dealText, setDealText] = useState('');
  const [category, setCategory] = useState('');
  const [durationDays, setDurationDays] = useState('7');

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['manager-offers', storeId],
    queryFn: () => offersApi.getActive(storeId),
    enabled: !!storeId,
  });

  const offers: any[] = data?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (payload: object) => managerApi.createOffer(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-offers'] });
      Toast.show({ type: 'success', text1: 'Offer created!' });
      setShowCreate(false);
      resetForm();
    },
    onError: (err: any) => {
      const e = err.response?.data?.error;
      const msg = typeof e === 'string' ? e : (err.response?.data?.message || 'Failed to create offer');
      Toast.show({ type: 'error', text1: msg });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (offerId: string) => managerApi.deleteOffer(offerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-offers'] });
      Toast.show({ type: 'success', text1: 'Offer removed' });
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to delete offer' });
    },
  });

  function resetForm() {
    setTitle(''); setDescription(''); setBonusRate('');
    setDealText(''); setCategory(''); setDurationDays('7');
  }

  function handleCreate() {
    if (!title.trim()) { Toast.show({ type: 'error', text1: 'Title is required' }); return; }
    if (!bonusRate && !dealText.trim()) {
      Toast.show({ type: 'error', text1: 'Add a bonus % or a deal text' }); return;
    }
    const days = parseInt(durationDays) || 7;
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      bonusRate: bonusRate ? parseFloat(bonusRate) / 100 : undefined,
      dealText: dealText.trim() || undefined,
      category: category || undefined,
      storeId,
      startDate: todayISO(),
      endDate: daysFromNow(days),
    });
  }

  function confirmDelete(offer: any) {
    Alert.alert('Remove Offer', `Remove "${offer.title}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate(offer.id) },
    ]);
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Offers & Promotions</Text>
            <Text style={s.headerSub}>Manage your store's active deals</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={s.addBtnText}>+ New</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />
        }
      >
        {isLoading ? (
          <View style={s.loadingCard}><ActivityIndicator color={COLORS.primary} size="large" /></View>
        ) : offers.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>📭</Text>
            <Text style={s.emptyTitle}>No active offers</Text>
            <Text style={s.emptySub}>Tap "+ New" to create your first promotion</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={s.emptyBtnText}>Create Offer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>{offers.length} Active Offer{offers.length !== 1 ? 's' : ''}</Text>
            {offers.map((offer: any) => (
              <View key={offer.id} style={s.offerCard}>
                <View style={s.offerTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.offerTitle}>{offer.title}</Text>
                    {offer.description ? <Text style={s.offerDesc}>{offer.description}</Text> : null}
                  </View>
                  {offer.bonusRate ? (
                    <View style={s.rateBadge}>
                      <Text style={s.rateNum}>{Math.round(offer.bonusRate * 100)}</Text>
                      <Text style={s.ratePct}>%</Text>
                    </View>
                  ) : null}
                </View>
                <View style={s.offerMeta}>
                  {offer.dealText ? (
                    <View style={s.tag}><Text style={[s.tagText, { color: COLORS.accent }]}>{offer.dealText}</Text></View>
                  ) : null}
                  {offer.category ? (
                    <View style={[s.tag, { backgroundColor: COLORS.success + '18' }]}>
                      <Text style={[s.tagText, { color: COLORS.success }]}>{offer.category.replace(/_/g, ' ')}</Text>
                    </View>
                  ) : null}
                  <Text style={s.offerDates}>
                    Until {new Date(offer.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => confirmDelete(offer)}
                  disabled={deleteMutation.isPending}
                >
                  <Text style={s.deleteBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Create Offer Modal ── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>New Offer</Text>
            <TouchableOpacity onPress={() => { setShowCreate(false); resetForm(); }}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
            <Field label="Title *">
              <TextInput
                style={s.input} value={title} onChangeText={setTitle}
                placeholder="e.g. Weekend Gas Bonus" placeholderTextColor={COLORS.textMuted}
              />
            </Field>

            <Field label="Description (optional)">
              <TextInput
                style={[s.input, { height: 80, textAlignVertical: 'top' }]}
                value={description} onChangeText={setDescription}
                placeholder="Brief details about the offer…"
                placeholderTextColor={COLORS.textMuted} multiline
              />
            </Field>

            <Field label="Bonus Cashback % (optional)">
              <TextInput
                style={s.input} value={bonusRate} onChangeText={setBonusRate}
                placeholder="e.g. 10 for 10% bonus" placeholderTextColor={COLORS.textMuted}
                keyboardType="decimal-pad"
              />
            </Field>

            <Field label="Deal Text (optional)">
              <TextInput
                style={s.input} value={dealText} onChangeText={setDealText}
                placeholder="e.g. 2 for $5" placeholderTextColor={COLORS.textMuted}
                maxLength={40}
              />
            </Field>

            <Field label="Category (optional)">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                <TouchableOpacity
                  style={[s.catChip, !category && s.catChipActive]}
                  onPress={() => setCategory('')}
                >
                  <Text style={[s.catChipText, !category && s.catChipTextActive]}>All</Text>
                </TouchableOpacity>
                {CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c.value}
                    style={[s.catChip, category === c.value && s.catChipActive]}
                    onPress={() => setCategory(c.value)}
                  >
                    <Text style={[s.catChipText, category === c.value && s.catChipTextActive]}>{c.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </Field>

            <Field label="Duration (days)">
              <View style={s.durationRow}>
                {['3', '7', '14', '30'].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[s.durationChip, durationDays === d && s.durationChipActive]}
                    onPress={() => setDurationDays(d)}
                  >
                    <Text style={[s.durationChipText, durationDays === d && s.durationChipTextActive]}>{d}d</Text>
                  </TouchableOpacity>
                ))}
                <TextInput
                  style={[s.input, { flex: 1, marginBottom: 0 }]}
                  value={durationDays} onChangeText={setDurationDays}
                  keyboardType="number-pad" placeholder="days"
                  placeholderTextColor={COLORS.textMuted}
                />
              </View>
            </Field>

            <TouchableOpacity
              style={[s.createBtn, createMutation.isPending && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.createBtnText}>Create Offer</Text>}
            </TouchableOpacity>

            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },

  headerBg: { backgroundColor: COLORS.secondary },
  headerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 18,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 },
  addBtn: { backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  body: { padding: 16, paddingBottom: 24 },
  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10 },

  loadingCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 48, alignItems: 'center' },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 36, alignItems: 'center', gap: 8, marginTop: 16 },
  emptyEmoji: { fontSize: 48, marginBottom: 4 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  emptySub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 8, backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  offerCard: {
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  offerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
  offerTitle: { fontSize: 16, fontWeight: '800', color: COLORS.text },
  offerDesc: { fontSize: 13, color: COLORS.textMuted, marginTop: 3, lineHeight: 18 },
  rateBadge: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rateNum: { color: '#fff', fontSize: 20, fontWeight: '800', lineHeight: 22 },
  ratePct: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  offerMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tag: { backgroundColor: COLORS.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  offerDates: { fontSize: 11, color: COLORS.textMuted },
  deleteBtn: {
    borderWidth: 1.5, borderColor: COLORS.error + '50', borderRadius: 10,
    paddingVertical: 8, alignItems: 'center',
  },
  deleteBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 13 },

  // Modal
  modal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 52, backgroundColor: COLORS.secondary,
  },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  modalClose: { color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '300', paddingHorizontal: 4 },
  modalBody: { padding: 20 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 0,
  },

  catChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white,
  },
  catChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  catChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  catChipTextActive: { color: COLORS.primary, fontWeight: '800' },

  durationRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  durationChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.white,
  },
  durationChipActive: { borderColor: COLORS.primary, backgroundColor: COLORS.primary + '12' },
  durationChipText: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted },
  durationChipTextActive: { color: COLORS.primary, fontWeight: '800' },

  createBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
