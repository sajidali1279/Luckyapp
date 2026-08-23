import { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  StatusBar, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { careersApi, jobOpeningsApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';
import { StarIcon, DollarSignIcon, CalendarIcon, AwardIcon, TagIcon, CheckCircleIcon } from '../../components/Icons';
import ErrorState from '../../components/ErrorState';
import FadeSlideIn from '../../components/FadeSlideIn';

const POSITION_META: Record<string, { emoji: string; desc: string }> = {
  CASHIER:           { emoji: '🧾', desc: 'Handle transactions, assist customers, maintain checkout area.' },
  FUEL_ATTENDANT:    { emoji: '⛽', desc: 'Assist customers at fuel pumps, ensure safety protocols.' },
  FOOD_PREP:         { emoji: '🌮', desc: 'Prepare hot foods, maintain kitchen cleanliness and food safety.' },
  NIGHT_SHIFT:       { emoji: '🌙', desc: 'Overnight operations, restocking, customer service during late hours.' },
  ASSISTANT_MANAGER: { emoji: '📋', desc: 'Support store manager, supervise staff, handle daily operations.' },
  STORE_MANAGER:     { emoji: '🏪', desc: 'Full store management, staff scheduling, inventory, reporting.' },
};

const POSITION_LABELS: Record<string, string> = {
  CASHIER: 'Cashier', FUEL_ATTENDANT: 'Fuel Attendant', FOOD_PREP: 'Food Prep / Cook',
  NIGHT_SHIFT: 'Night Shift Attendant', ASSISTANT_MANAGER: 'Assistant Manager', STORE_MANAGER: 'Store Manager',
};

interface JobOpening {
  id: string;
  title: string;
  position: string;
  description: string | null;
  requirements: string | null;
  payRange: string | null;
  employType: string;
  store: { name: string; city: string } | null;
}

const SHIFTS = [
  { value: 'MORNINGS',   label: 'Mornings (6am–2pm)'   },
  { value: 'AFTERNOONS', label: 'Afternoons (2pm–10pm)' },
  { value: 'NIGHTS',     label: 'Nights (10pm–6am)'    },
  { value: 'WEEKENDS',   label: 'Weekends'              },
];

type PerkDef = {
  Icon: (props: { size?: number; color?: string; strokeWidth?: number }) => any;
  color: string;
  bg: string;
  text: string;
};
const PERKS: PerkDef[] = [
  { Icon: DollarSignIcon, color: '#16a34a', bg: '#f0fdf4', text: 'Competitive pay' },
  { Icon: CalendarIcon,   color: '#0369a1', bg: '#eff6ff', text: 'Flexible hours' },
  { Icon: AwardIcon,      color: '#7c3aed', bg: '#f5f3ff', text: 'On-the-job training' },
  { Icon: TagIcon,        color: '#b45309', bg: '#fffbeb', text: 'Employee discounts' },
];

interface FormState {
  name: string;
  phone: string;
  email: string;
  storePreference: string;
  availType: 'FULL_TIME' | 'PART_TIME';
  shifts: string[];
  experience: string;
  message: string;
}

export default function CareersScreen() {
  const { user } = useAuthStore();
  const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: openingsData, isLoading: openingsLoading, isError: openingsError, refetch: refetchOpenings } = useQuery({
    queryKey: ['job-openings'],
    queryFn: () => jobOpeningsApi.getActive(),
  });
  const openings: JobOpening[] = openingsData?.data?.data ?? [];

  // Refetch on every focus so a newly-posted opening shows up without an app restart
  useFocusEffect(useCallback(() => {
    refetchOpenings();
  }, [refetchOpenings]));

  const [form, setForm] = useState<FormState>({
    name: user?.name ?? '',
    phone: user?.phone ?? '',
    email: '',
    storePreference: '',
    availType: 'FULL_TIME',
    shifts: [],
    experience: '',
    message: '',
  });

  const applyMut = useMutation({
    mutationFn: () => careersApi.apply({
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      position: selectedPosition!,
      availability: { type: form.availType, shifts: form.shifts },
      experience: form.experience.trim() || undefined,
      message: form.message.trim() || undefined,
    }),
    onSuccess: () => {
      setShowForm(false);
      setSubmitted(true);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error;
      if (typeof msg === 'string') Alert.alert('Error', msg);
      else Alert.alert('Error', 'Could not submit application. Please try again.');
    },
  });

  function openForm(positionValue: string, openingId?: string) {
    setSelectedPosition(positionValue);
    setSelectedOpeningId(openingId ?? null);
    setSubmitted(false);
    setShowForm(true);
  }

  function toggleShift(shift: string) {
    setForm(f => ({
      ...f,
      shifts: f.shifts.includes(shift) ? f.shifts.filter(s => s !== shift) : [...f.shifts, shift],
    }));
  }

  function handleSubmit() {
    if (!form.name.trim()) { Alert.alert('Required', 'Please enter your name.'); return; }
    if (!form.phone.trim()) { Alert.alert('Required', 'Please enter your phone number.'); return; }
    if (form.shifts.length === 0) { Alert.alert('Required', 'Please select at least one available shift.'); return; }
    applyMut.mutate();
  }

  const positionLabel = selectedPosition ? (POSITION_LABELS[selectedPosition] ?? selectedPosition) : '';

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Careers</Text>
        <Text style={st.headerSub}>Join the Lucky Stop team</Text>
      </View>

      <FadeSlideIn style={{ flex: 1 }}>
      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={st.hero}>
          <View style={st.heroIconWrap}>
            <StarIcon size={36} color="#f59e0b" strokeWidth={1.5} filled />
          </View>
          <Text style={st.heroTitle}>Work at Lucky Stop</Text>
          <Text style={st.heroText}>
            Be part of a growing team serving your community. We offer competitive pay,
            flexible schedules, and a great work environment.
          </Text>
        </View>

        {/* Perks */}
        <View style={st.perksRow}>
          {PERKS.map(p => (
            <View key={p.text} style={[st.perk, { backgroundColor: p.bg }]}>
              <p.Icon size={22} color={p.color} strokeWidth={2} />
              <Text style={st.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>

        {/* Open Positions */}
        <Text style={st.sectionTitle}>Open Positions</Text>
        {openingsLoading ? (
          <ActivityIndicator color={COLORS.primary} style={{ marginVertical: 24 }} />
        ) : openingsError ? (
          <ErrorState message="Failed to load job openings." onRetry={() => refetchOpenings()} />
        ) : openings.length === 0 ? (
          <View style={st.emptyCard}>
            <Text style={st.emptyText}>No openings posted yet.</Text>
            <Text style={st.emptySubText}>Check back soon - we're always growing!</Text>
          </View>
        ) : (
          openings.map(opening => {
            const meta = POSITION_META[opening.position] ?? { emoji: '💼', desc: '' };
            const location = opening.store ? `${opening.store.name} - ${opening.store.city}` : 'Any Location';
            return (
              <View key={opening.id} style={st.posCard}>
                <View style={st.posTop}>
                  <Text style={st.posEmoji}>{meta.emoji}</Text>
                  <View style={st.posInfo}>
                    <Text style={st.posLabel}>{opening.title}</Text>
                    <Text style={st.posRole}>{POSITION_LABELS[opening.position] ?? opening.position}</Text>
                    {opening.description ? (
                      <Text style={st.posDesc}>{opening.description}</Text>
                    ) : (
                      <Text style={st.posDesc}>{meta.desc}</Text>
                    )}
                  </View>
                </View>
                <View style={st.posTagRow}>
                  <View style={st.posTag}><Text style={st.posTagText}>{location}</Text></View>
                  {opening.payRange ? <View style={st.posTag}><Text style={st.posTagText}>{opening.payRange}</Text></View> : null}
                  {opening.employType !== 'BOTH' ? (
                    <View style={st.posTag}><Text style={st.posTagText}>{opening.employType === 'FULL_TIME' ? 'Full-time' : 'Part-time'}</Text></View>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={st.applyBtn}
                  onPress={() => openForm(opening.position, opening.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Apply for ${opening.title}`}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={st.applyBtnText}>Apply Now</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
      </FadeSlideIn>

      {/* Success Banner */}
      {submitted && (
        <View style={st.successBanner}>
          <CheckCircleIcon size={28} color="#16a34a" strokeWidth={2} />
          <View>
            <Text style={st.successTitle}>Application Submitted!</Text>
            <Text style={st.successSub}>We'll review your application and be in touch.</Text>
          </View>
        </View>
      )}

      {/* Application Form Modal */}
      <Modal visible={showForm} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <SafeAreaView style={st.modalSafe}>
            <View style={st.modalHeader}>
              <TouchableOpacity
                onPress={() => setShowForm(false)}
                style={st.closeBtn}
                accessibilityRole="button"
                accessibilityLabel="Cancel application"
                hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
              >
                <Text style={st.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={st.modalTitle}>Apply - {positionLabel}</Text>
              <View style={{ width: 60 }} />
            </View>

            <ScrollView style={st.formScroll} contentContainerStyle={st.formContent} keyboardShouldPersistTaps="handled">

              {/* Personal Info */}
              <Text style={st.formSection}>Personal Info</Text>

              <Text style={st.fieldLabel}>Full Name *</Text>
              <TextInput style={st.input} value={form.name} onChangeText={v => setForm(f => ({ ...f, name: v }))} placeholder="Your full name" placeholderTextColor="#aaa" />

              <Text style={st.fieldLabel}>Phone Number *</Text>
              <TextInput style={st.input} value={form.phone} onChangeText={v => setForm(f => ({ ...f, phone: v }))} placeholder="e.g. 555-123-4567" placeholderTextColor="#aaa" keyboardType="phone-pad" />

              <Text style={st.fieldLabel}>Email (optional)</Text>
              <TextInput style={st.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="your@email.com" placeholderTextColor="#aaa" keyboardType="email-address" autoCapitalize="none" />

              {/* Availability */}
              <Text style={st.formSection}>Availability</Text>

              <Text style={st.fieldLabel}>Employment Type *</Text>
              <View style={st.toggleRow}>
                {(['FULL_TIME', 'PART_TIME'] as const).map(type => (
                  <TouchableOpacity key={type}
                    style={[st.toggle, form.availType === type && st.toggleActive]}
                    onPress={() => setForm(f => ({ ...f, availType: type }))}
                    accessibilityRole="tab"
                    accessibilityLabel={`Set employment type to ${type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}`}
                    accessibilityState={{ selected: form.availType === type }}
                    hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                  >
                    <Text style={[st.toggleText, form.availType === type && st.toggleTextActive]}>
                      {type === 'FULL_TIME' ? 'Full-time' : 'Part-time'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={st.fieldLabel}>Available Shifts * (select all that apply)</Text>
              {SHIFTS.map(sh => {
                const checked = form.shifts.includes(sh.value);
                return (
                  <TouchableOpacity key={sh.value} style={[st.checkRow, checked && st.checkRowActive]}
                    onPress={() => toggleShift(sh.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`${sh.label} shift`}
                    accessibilityState={{ checked }}
                  >
                    <View style={[st.checkbox, checked && st.checkboxActive]}>
                      {checked && <Text style={st.checkmark}>✓</Text>}
                    </View>
                    <Text style={[st.checkLabel, checked && st.checkLabelActive]}>{sh.label}</Text>
                  </TouchableOpacity>
                );
              })}

              {/* Experience */}
              <Text style={st.formSection}>Background</Text>

              <Text style={st.fieldLabel}>Previous Experience (optional)</Text>
              <TextInput style={[st.input, st.textArea]} value={form.experience}
                onChangeText={v => setForm(f => ({ ...f, experience: v }))}
                placeholder="Tell us about any relevant work experience…"
                placeholderTextColor="#aaa" multiline numberOfLines={4} textAlignVertical="top" />

              <Text style={st.fieldLabel}>Why Lucky Stop? (optional)</Text>
              <TextInput style={[st.input, st.textArea]} value={form.message}
                onChangeText={v => setForm(f => ({ ...f, message: v }))}
                placeholder="Share why you'd like to join our team…"
                placeholderTextColor="#aaa" multiline numberOfLines={3} textAlignVertical="top" />

              {/* Submit */}
              <TouchableOpacity style={[st.submitBtn, applyMut.isPending && st.submitBtnDisabled]}
                onPress={handleSubmit} disabled={applyMut.isPending}
                accessibilityRole="button"
                accessibilityLabel="Submit application"
                accessibilityState={{ disabled: applyMut.isPending, busy: applyMut.isPending }}
              >
                {applyMut.isPending
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={st.submitBtnText}>Submit Application</Text>}
              </TouchableOpacity>

              <View style={{ height: 40 }} />
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.primary },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  headerSub: { fontSize: 14, color: 'rgba(255,255,255,0.65)', marginTop: 2 },
  scroll: { flex: 1, backgroundColor: '#f5f7fa' },
  content: { padding: 16 },

  hero: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  heroIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#1D3557', marginBottom: 8 },
  heroText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },

  perksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  perk: { flex: 1, minWidth: '45%', borderRadius: 12, padding: 14, alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  perkText: { fontSize: 12, color: '#555', fontWeight: '700', textAlign: 'center' },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1D3557', marginBottom: 12 },

  posCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  posTop: { flexDirection: 'row', gap: 14, marginBottom: 10 },
  posEmoji: { fontSize: 32, marginTop: 2 },
  posInfo: { flex: 1 },
  posLabel: { fontSize: 16, fontWeight: '800', color: '#1D3557', marginBottom: 2 },
  posRole: { fontSize: 12, fontWeight: '700', color: COLORS.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
  posDesc: { fontSize: 13, color: '#666', lineHeight: 18 },
  posTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  posTag: { backgroundColor: '#f1f5f9', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  posTagText: { fontSize: 12, color: '#555', fontWeight: '600' },
  emptyCard: { backgroundColor: '#fff', borderRadius: 14, padding: 32, alignItems: 'center', marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#1D3557', marginBottom: 6 },
  emptySubText: { fontSize: 13, color: '#999', textAlign: 'center' },
  applyBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#f0fdf4', borderTopWidth: 1, borderTopColor: '#bbf7d0', padding: 16 },
  successTitle: { fontSize: 15, fontWeight: '800', color: '#166534' },
  successSub: { fontSize: 12, color: '#4ade80', marginTop: 2 },

  // Modal
  modalSafe: { flex: 1, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
  closeBtn: { width: 60 },
  closeBtnText: { fontSize: 15, color: '#E63946', fontWeight: '600' },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#1D3557', flex: 1, textAlign: 'center' },
  formScroll: { flex: 1 },
  formContent: { padding: 20 },
  formSection: { fontSize: 13, fontWeight: '800', color: '#aaa', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 12 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#1D3557', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, fontSize: 14, color: '#1D3557', backgroundColor: '#fff', marginBottom: 14 },
  textArea: { minHeight: 90, paddingTop: 12 },

  toggleRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  toggle: { flex: 1, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  toggleActive: { borderColor: COLORS.primary, backgroundColor: '#eff6ff' },
  toggleText: { fontSize: 14, fontWeight: '600', color: '#888' },
  toggleTextActive: { color: COLORS.primary, fontWeight: '800' },

  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1.5, borderColor: '#e0e0e0', borderRadius: 10, padding: 12, marginBottom: 8 },
  checkRowActive: { borderColor: COLORS.primary, backgroundColor: '#eff6ff' },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#ccc', alignItems: 'center', justifyContent: 'center' },
  checkboxActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  checkmark: { color: '#fff', fontSize: 13, fontWeight: '800' },
  checkLabel: { fontSize: 14, color: '#555', flex: 1 },
  checkLabelActive: { color: COLORS.primary, fontWeight: '700' },

  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
