import { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  TextInput, RefreshControl, StatusBar,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { offersApi, storesApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import { XIcon, EditIcon, PlusIcon } from '../../components/Icons';
import FadeSlideIn from '../../components/FadeSlideIn';

interface Store { id: string; name: string }

const CATEGORIES = [
  { value: 'GAS',           label: 'Gas' },
  { value: 'DIESEL',        label: 'Diesel' },
  { value: 'HOT_FOODS',     label: 'Hot Foods' },
  { value: 'GROCERIES',     label: 'Groceries' },
  { value: 'FROZEN_FOODS',  label: 'Frozen Foods' },
  { value: 'FRESH_FOODS',   label: 'Fresh Foods' },
  { value: 'TOBACCO_VAPES', label: 'Tobacco / Vapes' },
  { value: 'ALCOHOL',       label: 'Alcohol' },
];

function todayISO() { return new Date().toISOString(); }
function daysFromNow(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString();
}

function blankForm() {
  return { title: '', description: '', bonusRate: '', dealText: '', category: '', durationDays: '7' };
}

export default function ManagerOffersScreen() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);

  // Accessible stores
  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: () => storesApi.accessible(),
  });
  const stores: Store[] = storesData?.data?.data || [];
  useEffect(() => {
    if (!selectedStoreId && stores.length > 0) setSelectedStoreId(stores[0].id);
  }, [stores]);
  const storeId = selectedStoreId || user?.storeIds?.[0];

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(blankForm());
  const setF = (k: keyof ReturnType<typeof blankForm>, v: string) => setForm(f => ({ ...f, [k]: v }));

  // Edit modal
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editForm, setEditForm] = useState(blankForm());
  const setEF = (k: keyof ReturnType<typeof blankForm>, v: string) => setEditForm(f => ({ ...f, [k]: v }));

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['manager-offers', storeId],
    queryFn: () => offersApi.getActive(storeId),
    enabled: !!storeId,
  });
  const offers: any[] = data?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (payload: object) => offersApi.create(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-offers'] });
      Toast.show({ type: 'success', text1: 'Offer created!' });
      setShowCreate(false);
      setForm(blankForm());
    },
    onError: (err: any) => {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : 'Failed to create offer' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: object }) => offersApi.update(id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-offers'] });
      Toast.show({ type: 'success', text1: 'Offer updated!' });
      setEditTarget(null);
    },
    onError: (err: any) => {
      const e = err.response?.data?.error;
      Toast.show({ type: 'error', text1: typeof e === 'string' ? e : 'Failed to update offer' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (offerId: string) => offersApi.deleteOffer(offerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-offers'] });
      Toast.show({ type: 'success', text1: 'Offer removed' });
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to delete offer' });
    },
  });

  function buildPayload(f: ReturnType<typeof blankForm>, sid?: string) {
    const days = parseInt(f.durationDays) || 7;
    return {
      title: f.title.trim(),
      description: f.description.trim() || undefined,
      bonusRate: f.bonusRate ? parseFloat(f.bonusRate) / 100 : undefined,
      dealText: f.dealText.trim() || undefined,
      category: f.category || undefined,
      storeId: sid,
      startDate: todayISO(),
      endDate: daysFromNow(days),
    };
  }

  function handleCreate() {
    if (!form.title.trim()) { Toast.show({ type: 'error', text1: 'Title is required' }); return; }
    if (!form.bonusRate && !form.dealText.trim()) {
      Toast.show({ type: 'error', text1: 'Add a bonus % or deal text' }); return;
    }
    createMutation.mutate(buildPayload(form, storeId));
  }

  function handleUpdate() {
    if (!editTarget) return;
    if (!editForm.title.trim()) { Toast.show({ type: 'error', text1: 'Title is required' }); return; }
    updateMutation.mutate({ id: editTarget.id, payload: buildPayload(editForm) });
  }

  function openEdit(offer: any) {
    setEditForm({
      title: offer.title || '',
      description: offer.description || '',
      bonusRate: offer.bonusRate ? String(Math.round(offer.bonusRate * 100)) : '',
      dealText: offer.dealText || '',
      category: offer.category || '',
      durationDays: '7',
    });
    setEditTarget(offer);
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

      <SafeAreaView style={s.headerBg} edges={['top']}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Offers</Text>
            <Text style={s.headerSub}>Manage your store's active deals</Text>
          </View>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => setShowCreate(true)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Create new offer"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
            <Text style={s.addBtnText}>New</Text>
          </TouchableOpacity>
        </View>

        {/* Store selector */}
        {stores.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.storePickerRow}>
            {stores.map(store => (
              <TouchableOpacity
                key={store.id}
                style={[s.storeChip, store.id === storeId && s.storeChipActive]}
                onPress={() => setSelectedStoreId(store.id)}
                activeOpacity={0.75}
                accessibilityRole="tab"
                accessibilityLabel={`Filter by ${store.name}`}
                accessibilityState={{ selected: store.id === storeId }}
                hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
              >
                <Text style={[s.storeChipText, store.id === storeId && s.storeChipTextActive]}>
                  {store.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.primary} colors={[COLORS.primary]} />}
      >
        {isLoading ? (
          <View style={s.loadingCard}><ActivityIndicator color={COLORS.primary} size="large" /></View>
        ) : offers.length === 0 ? (
          <FadeSlideIn style={s.emptyCard}>
            <Text style={s.emptyTitle}>No active offers</Text>
            <Text style={s.emptySub}>Tap "+ New" to create your first promotion</Text>
            <TouchableOpacity
              style={s.emptyBtn}
              onPress={() => setShowCreate(true)}
              accessibilityRole="button"
              accessibilityLabel="Create offer"
              hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
            >
              <Text style={s.emptyBtnText}>Create Offer</Text>
            </TouchableOpacity>
          </FadeSlideIn>
        ) : (
          <>
            <Text style={s.sectionLabel}>{offers.length} Active Offer{offers.length !== 1 ? 's' : ''}</Text>
            {offers.map((offer: any, index: number) => (
              <FadeSlideIn key={offer.id} delay={Math.min(index * 40, 200)}>
              <View style={s.offerCard}>
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
                <View style={s.cardActions}>
                  <TouchableOpacity
                    style={s.editBtn}
                    onPress={() => openEdit(offer)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Edit offer: ${offer.title}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <EditIcon size={14} color={COLORS.primary} strokeWidth={2} />
                    <Text style={s.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={s.deleteBtn}
                    onPress={() => confirmDelete(offer)}
                    disabled={deleteMutation.isPending}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove offer: ${offer.title}`}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.deleteBtnText}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
              </FadeSlideIn>
            ))}
          </>
        )}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Create Offer Modal ── */}
      <OfferFormModal
        title="New Offer"
        visible={showCreate}
        form={form}
        setField={setF}
        onClose={() => { setShowCreate(false); setForm(blankForm()); }}
        onSubmit={handleCreate}
        isPending={createMutation.isPending}
        submitLabel="Create Offer"
      />

      {/* ── Edit Offer Modal ── */}
      <OfferFormModal
        title="Edit Offer"
        visible={!!editTarget}
        form={editForm}
        setField={setEF}
        onClose={() => setEditTarget(null)}
        onSubmit={handleUpdate}
        isPending={updateMutation.isPending}
        submitLabel="Save Changes"
      />
    </View>
  );
}

// ─── Shared form modal ────────────────────────────────────────────────────────

interface FormModalProps {
  title: string;
  visible: boolean;
  form: ReturnType<typeof blankForm>;
  setField: (k: keyof ReturnType<typeof blankForm>, v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  submitLabel: string;
}

function OfferFormModal({ title, visible, form, setField, onClose, onSubmit, isPending, submitLabel }: FormModalProps) {
  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={s.modal}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            style={s.modalCloseBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Close offer form"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <XIcon size={20} color="rgba(255,255,255,0.8)" strokeWidth={2.5} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
          <Field label="Title *">
            <TextInput
              style={s.input} value={form.title} onChangeText={v => setField('title', v)}
              placeholder="e.g. Weekend Gas Bonus" placeholderTextColor={COLORS.textMuted}
            />
          </Field>

          <Field label="Description (optional)">
            <TextInput
              style={[s.input, { height: 80, textAlignVertical: 'top' }]}
              value={form.description} onChangeText={v => setField('description', v)}
              placeholder="Brief details about the offer…"
              placeholderTextColor={COLORS.textMuted} multiline
            />
          </Field>

          <Field label="Bonus Cashback % (optional)">
            <TextInput
              style={s.input} value={form.bonusRate} onChangeText={v => setField('bonusRate', v)}
              placeholder="e.g. 10 for 10% bonus" placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Deal Text (optional)">
            <TextInput
              style={s.input} value={form.dealText} onChangeText={v => setField('dealText', v)}
              placeholder="e.g. 2 for $5" placeholderTextColor={COLORS.textMuted}
              maxLength={40}
            />
          </Field>

          <Field label="Category (optional)">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <TouchableOpacity
                style={[s.catChip, !form.category && s.catChipActive]}
                onPress={() => setField('category', '')}
                accessibilityRole="tab"
                accessibilityLabel="All categories"
                accessibilityState={{ selected: !form.category }}
                hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
              >
                <Text style={[s.catChipText, !form.category && s.catChipTextActive]}>All</Text>
              </TouchableOpacity>
              {CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.value}
                  style={[s.catChip, form.category === c.value && s.catChipActive]}
                  onPress={() => setField('category', c.value)}
                  accessibilityRole="tab"
                  accessibilityLabel={`${c.label} category`}
                  accessibilityState={{ selected: form.category === c.value }}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={[s.catChipText, form.category === c.value && s.catChipTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Field>

          <Field label="Duration (days)">
            <View style={s.durationRow}>
              {['3', '7', '14', '30'].map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[s.durationChip, form.durationDays === d && s.durationChipActive]}
                  onPress={() => setField('durationDays', d)}
                  accessibilityRole="tab"
                  accessibilityLabel={`${d} days`}
                  accessibilityState={{ selected: form.durationDays === d }}
                  hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
                >
                  <Text style={[s.durationChipText, form.durationDays === d && s.durationChipTextActive]}>{d}d</Text>
                </TouchableOpacity>
              ))}
              <TextInput
                style={[s.input, { flex: 1, marginBottom: 0 }]}
                value={form.durationDays} onChangeText={v => setField('durationDays', v)}
                keyboardType="number-pad" placeholder="days"
                placeholderTextColor={COLORS.textMuted}
              />
            </View>
          </Field>

          <TouchableOpacity
            style={[s.createBtn, isPending && { opacity: 0.6 }]}
            onPress={onSubmit}
            disabled={isPending}
            accessibilityRole="button"
            accessibilityLabel={submitLabel}
          >
            {isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={s.createBtnText}>{submitLabel}</Text>}
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    </Modal>
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
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14,
  },
  headerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 3 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.primary, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  storePickerRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 14,
  },
  storeChip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.55)' },
  storeChipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff', fontWeight: '700' },

  body: { padding: 16, paddingBottom: 24 },
  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 10,
  },

  loadingCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 48, alignItems: 'center' },
  emptyCard: { backgroundColor: COLORS.white, borderRadius: 16, padding: 36, alignItems: 'center', gap: 8, marginTop: 16 },
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
    width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  rateNum: { color: '#fff', fontSize: 18, fontWeight: '800', lineHeight: 20 },
  ratePct: { color: 'rgba(255,255,255,0.7)', fontSize: 10, fontWeight: '700' },
  offerMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  tag: { backgroundColor: COLORS.accent + '20', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  tagText: { fontSize: 11, fontWeight: '700', textTransform: 'capitalize' },
  offerDates: { fontSize: 11, color: COLORS.textMuted },
  cardActions: { flexDirection: 'row', gap: 8 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: COLORS.primary + '50', borderRadius: 10, paddingVertical: 8,
  },
  editBtnText: { color: COLORS.primary, fontWeight: '700', fontSize: 13 },
  deleteBtn: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.error + '50', borderRadius: 10,
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
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { padding: 20 },

  fieldLabel: {
    fontSize: 12, fontWeight: '700', color: COLORS.textMuted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
  },
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

  createBtn: { backgroundColor: COLORS.primary, borderRadius: 14, padding: 18, alignItems: 'center', marginTop: 8 },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
