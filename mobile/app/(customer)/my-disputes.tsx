import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  View, Text, ScrollView, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { disputeApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import ErrorState from '../../components/ErrorState';
import BackButton from '../../components/BackButton';
import ModalCloseButton from '../../components/ModalCloseButton';
import FadeSlideIn from '../../components/FadeSlideIn';
import { useHighlightParam } from '../../hooks/useHighlightParam';
import PulseHighlight from '../../components/PulseHighlight';

const DESC_MIN = 10;
const DESC_MAX = 500;
const AMOUNT_MAX = 10000;

function StatusPill({ status }: { status: string }) {
  const cfg = {
    PENDING:  { bg: '#fffbeb', color: '#b45309', label: 'Pending' },
    APPROVED: { bg: '#f0fdf4', color: '#16a34a', label: 'Approved' },
    REJECTED: { bg: '#fff1f2', color: '#e63946', label: 'Rejected' },
  }[status] ?? { bg: '#f1f5f9', color: '#64748b', label: status };
  return <Text style={[s.pill, { backgroundColor: cfg.bg, color: cfg.color }]}>{cfg.label}</Text>;
}

function ReportModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [storeId, setStoreId] = useState('');
  const [desc, setDesc] = useState('');
  const [estAmt, setEstAmt] = useState('');

  const { data: storesData } = useQuery({
    queryKey: ['gas-prices'],
    queryFn: () => storesApi.getGasPrices(),
    enabled: visible,
    staleTime: 30 * 60 * 1000,
  });
  const stores: any[] = storesData?.data?.data ?? [];

  const descValid = desc.trim().length >= DESC_MIN && desc.trim().length <= DESC_MAX;
  const amtNum = estAmt ? parseFloat(estAmt) : undefined;
  const amtValid = estAmt === '' || (amtNum !== undefined && !Number.isNaN(amtNum) && amtNum > 0 && amtNum <= AMOUNT_MAX);
  const canSubmit = !!storeId && descValid && amtValid;

  const submitMutation = useMutation({
    mutationFn: () => disputeApi.submit({
      storeId,
      description: desc.trim(),
      estimatedAmt: amtNum,
    }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Report submitted', text2: "We'll review your missing points." });
      qc.invalidateQueries({ queryKey: ['my-disputes'] });
      setStoreId(''); setDesc(''); setEstAmt('');
      onClose();
    },
    onError: (err: any) => {
      const serverMsg = err.response?.data?.error;
      Toast.show({
        type: 'error',
        text1: typeof serverMsg === 'string' ? serverMsg : 'Submission failed',
        text2: typeof serverMsg === 'string' ? undefined : 'Please try again.',
      });
    },
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={m.root}>
          <View style={m.header}>
            <Text style={m.title}>{t('disputeModal.title')}</Text>
            <ModalCloseButton onPress={onClose} label="Close report missing points form" color="#fff" style={m.closeBtn} />
          </View>
          <Text style={m.subtitle}>{t('disputeModal.subtitle')}</Text>
          <ScrollView style={m.body} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            <Text style={m.label}>{t('disputeModal.store')}</Text>
            <View style={m.pickerWrap}>
              {stores.length === 0 ? (
                <Text style={{ color: COLORS.textMuted, fontSize: 13 }}>{t('disputeModal.loadingStores')}</Text>
              ) : (
                stores.map((st: any) => (
                  <TouchableOpacity
                    key={st.id}
                    style={[m.storePill, storeId === st.id && m.storePillActive]}
                    onPress={() => setStoreId(st.id)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityLabel={`Select store: ${st.name}`}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <Text style={[m.storePillText, storeId === st.id && { color: '#fff' }]}>{st.name}</Text>
                  </TouchableOpacity>
                ))
              )}
            </View>

            <Text style={m.label}>{t('disputeModal.whatHappened')}</Text>
            <TextInput
              style={[m.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={desc}
              onChangeText={setDesc}
              placeholder={t('disputeModal.descPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              maxLength={DESC_MAX}
            />
            <Text style={[m.hint, desc.length > 0 && !descValid && m.hintError]}>
              {desc.trim().length}/{DESC_MIN} {t('disputeModal.descMinHint')}
            </Text>

            <Text style={m.label}>{t('disputeModal.purchaseAmount')}</Text>
            <TextInput
              style={m.input}
              value={estAmt}
              onChangeText={setEstAmt}
              placeholder={t('disputeModal.amountPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              keyboardType="decimal-pad"
            />
            {estAmt.length > 0 && !amtValid && (
              <Text style={[m.hint, m.hintError]}>{t('disputeModal.amountInvalidHint')}</Text>
            )}

            <TouchableOpacity
              style={[m.submitBtn, (!canSubmit || submitMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => submitMutation.mutate()}
              disabled={!canSubmit || submitMutation.isPending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Submit missing points report"
            >
              {submitMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={m.submitBtnText}>{t('disputeModal.submitReport')}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function MyDisputesScreen() {
  const { t } = useTranslation();
  const highlightedId = useHighlightParam();
  const [showReportModal, setShowReportModal] = useState(false);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-disputes'],
    queryFn: () => disputeApi.getMine(),
  });

  const disputes: any[] = data?.data?.data || [];

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      <View style={s.header}>
        <BackButton />
        <Text style={s.title}>My Reports</Text>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => setShowReportModal(true)}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Report missing points"
        >
          <Text style={s.newBtnText}>+ {t('disputeModal.newReport')}</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : isError ? (
        <ErrorState message="Failed to load your reports." onRetry={() => refetch()} />
      ) : disputes.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyIcon}>✅</Text>
          <Text style={s.emptyTitle}>No reports yet</Text>
          <Text style={s.emptySub}>Missing points reports you submit will appear here</Text>
          <TouchableOpacity
            style={s.emptyCta}
            onPress={() => setShowReportModal(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Report missing points"
          >
            <Text style={s.emptyCtaText}>Report Missing Points</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
          {disputes.map((d, index) => (
            <FadeSlideIn key={d.id} delay={Math.min(index * 40, 200)}>
              <PulseHighlight active={d.id === highlightedId} style={s.card}>
                <View style={s.cardTop}>
                  <Text style={s.storeName}>{d.store?.name ?? 'Unknown store'}</Text>
                  <StatusPill status={d.status} />
                </View>
                <Text style={s.desc}>{d.description}</Text>
                {d.transaction && (
                  <Text style={s.meta}>
                    Transaction: {new Date(d.transaction.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${Number(d.transaction.purchaseAmount).toFixed(2)} · {String(d.transaction.category || '').replace(/_/g, ' ')}
                  </Text>
                )}
                {d.estimatedAmt != null && (
                  <Text style={s.meta}>Claimed purchase: ${Number(d.estimatedAmt).toFixed(2)}</Text>
                )}
                {d.resolvedNote ? (
                  <Text style={[s.meta, s.note]}>Note: {d.resolvedNote}</Text>
                ) : null}
                {d.creditedAmt != null && d.status === 'APPROVED' && (
                  <Text style={s.credited}>+${Number(d.creditedAmt).toFixed(2)} credited</Text>
                )}
                <Text style={s.date}>
                  Submitted {new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </PulseHighlight>
            </FadeSlideIn>
          ))}
        </ScrollView>
      )}

      <ReportModal visible={showReportModal} onClose={() => setShowReportModal(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, flex: 1 },
  newBtn: { backgroundColor: COLORS.primary + '15', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  newBtnText: { fontSize: 13, fontWeight: '800', color: COLORS.primary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  emptySub: { fontSize: 13, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
  emptyCta: { marginTop: 10, backgroundColor: COLORS.primary, borderRadius: 14, paddingHorizontal: 24, paddingVertical: 13 },
  emptyCtaText: { color: '#fff', fontWeight: '800', fontSize: 14 },

  list: { padding: 20, gap: 14 },
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 3, gap: 6,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  storeName: { fontSize: 14, fontWeight: '800', color: COLORS.text, flex: 1, marginRight: 8 },
  pill: { fontSize: 11, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, textTransform: 'uppercase', overflow: 'hidden' },
  desc: { fontSize: 13, color: COLORS.textMuted, lineHeight: 20 },
  meta: { fontSize: 12, color: '#9ca3af' },
  note: { fontStyle: 'italic' },
  credited: { fontSize: 13, fontWeight: '700', color: '#16a34a' },
  date: { fontSize: 11, color: '#c4c9d0', marginTop: 4 },
});

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 12,
    backgroundColor: '#f97316',
  },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  subtitle: { fontSize: 14, color: COLORS.textMuted, paddingHorizontal: 20, paddingVertical: 12, lineHeight: 20 },
  body: { flex: 1, paddingHorizontal: 20 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.white,
  },
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: -6 },
  hintError: { color: COLORS.error },
  pickerWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  storePill: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: '#f1f5f9', borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  storePillActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  storePillText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
