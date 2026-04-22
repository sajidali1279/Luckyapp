import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  StatusBar, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMutation } from '@tanstack/react-query';
import { careersApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

const POSITIONS = [
  { value: 'CASHIER',           label: 'Cashier',                 emoji: '🧾', desc: 'Handle transactions, assist customers, maintain checkout area.' },
  { value: 'FUEL_ATTENDANT',    label: 'Fuel Attendant',          emoji: '⛽', desc: 'Assist customers at fuel pumps, ensure safety protocols.' },
  { value: 'FOOD_PREP',         label: 'Food Prep / Cook',        emoji: '🌮', desc: 'Prepare hot foods, maintain kitchen cleanliness and food safety.' },
  { value: 'NIGHT_SHIFT',       label: 'Night Shift Attendant',   emoji: '🌙', desc: 'Overnight operations, restocking, customer service during late hours.' },
  { value: 'ASSISTANT_MANAGER', label: 'Assistant Manager',       emoji: '📋', desc: 'Support store manager, supervise staff, handle daily operations.' },
  { value: 'STORE_MANAGER',     label: 'Store Manager',           emoji: '🏪', desc: 'Full store management, staff scheduling, inventory, reporting.' },
];

const SHIFTS = [
  { value: 'MORNINGS',   label: 'Mornings (6am–2pm)'   },
  { value: 'AFTERNOONS', label: 'Afternoons (2pm–10pm)' },
  { value: 'NIGHTS',     label: 'Nights (10pm–6am)'    },
  { value: 'WEEKENDS',   label: 'Weekends'              },
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
  const [showForm, setShowForm] = useState(false);
  const [submitted, setSubmitted] = useState(false);

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

  function openForm(positionValue: string) {
    setSelectedPosition(positionValue);
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

  const positionLabel = POSITIONS.find(p => p.value === selectedPosition)?.label ?? '';

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.primary} />

      {/* Header */}
      <View style={st.header}>
        <Text style={st.headerTitle}>Careers</Text>
        <Text style={st.headerSub}>Join the Lucky Stop team</Text>
      </View>

      <ScrollView style={st.scroll} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <View style={st.hero}>
          <Text style={st.heroEmoji}>🌟</Text>
          <Text style={st.heroTitle}>Work at Lucky Stop</Text>
          <Text style={st.heroText}>
            Be part of a growing team serving your community. We offer competitive pay,
            flexible schedules, and a great work environment.
          </Text>
        </View>

        {/* Perks */}
        <View style={st.perksRow}>
          {[
            { emoji: '💰', text: 'Competitive pay' },
            { emoji: '📅', text: 'Flexible hours' },
            { emoji: '🎓', text: 'On-the-job training' },
            { emoji: '⭐', text: 'Employee discounts' },
          ].map(p => (
            <View key={p.text} style={st.perk}>
              <Text style={st.perkEmoji}>{p.emoji}</Text>
              <Text style={st.perkText}>{p.text}</Text>
            </View>
          ))}
        </View>

        {/* Open Positions */}
        <Text style={st.sectionTitle}>Open Positions</Text>
        {POSITIONS.map(pos => (
          <View key={pos.value} style={st.posCard}>
            <View style={st.posTop}>
              <Text style={st.posEmoji}>{pos.emoji}</Text>
              <View style={st.posInfo}>
                <Text style={st.posLabel}>{pos.label}</Text>
                <Text style={st.posDesc}>{pos.desc}</Text>
              </View>
            </View>
            <TouchableOpacity style={st.applyBtn} onPress={() => openForm(pos.value)}>
              <Text style={st.applyBtnText}>Apply Now</Text>
            </TouchableOpacity>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Success Banner */}
      {submitted && (
        <View style={st.successBanner}>
          <Text style={st.successIcon}>🎉</Text>
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
              <TouchableOpacity onPress={() => setShowForm(false)} style={st.closeBtn}>
                <Text style={st.closeBtnText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={st.modalTitle}>Apply — {positionLabel}</Text>
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
                    onPress={() => setForm(f => ({ ...f, availType: type }))}>
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
                    onPress={() => toggleShift(sh.value)}>
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
                onPress={handleSubmit} disabled={applyMut.isPending}>
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
  heroEmoji: { fontSize: 40, marginBottom: 10 },
  heroTitle: { fontSize: 22, fontWeight: '800', color: '#1D3557', marginBottom: 8 },
  heroText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },

  perksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  perk: { flex: 1, minWidth: '45%', backgroundColor: '#fff', borderRadius: 12, padding: 14, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  perkEmoji: { fontSize: 22, marginBottom: 6 },
  perkText: { fontSize: 12, color: '#555', fontWeight: '600', textAlign: 'center' },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: '#1D3557', marginBottom: 12 },

  posCard: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  posTop: { flexDirection: 'row', gap: 14, marginBottom: 14 },
  posEmoji: { fontSize: 32, marginTop: 2 },
  posInfo: { flex: 1 },
  posLabel: { fontSize: 16, fontWeight: '800', color: '#1D3557', marginBottom: 4 },
  posDesc: { fontSize: 13, color: '#666', lineHeight: 18 },
  applyBtn: { backgroundColor: COLORS.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  applyBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: '#f0fdf4', borderTopWidth: 1, borderTopColor: '#bbf7d0', padding: 16 },
  successIcon: { fontSize: 28 },
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
