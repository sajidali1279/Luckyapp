import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { disputeApi } from '../services/api';
import { COLORS } from '../constants';
import ModalCloseButton from './ModalCloseButton';

const DESC_MIN = 10;
const DESC_MAX = 500;

interface DisputedTransaction {
  id: string;
  store?: { name?: string };
  createdAt: string;
  purchaseAmount: number;
  category?: string;
}

export default function DisputeTransactionModal({
  visible,
  onClose,
  transaction,
}: {
  visible: boolean;
  onClose: () => void;
  transaction: DisputedTransaction | null;
}) {
  const qc = useQueryClient();
  const [desc, setDesc] = useState('');

  useEffect(() => {
    if (visible) setDesc('');
  }, [visible]);

  const descValid = desc.trim().length >= DESC_MIN && desc.trim().length <= DESC_MAX;

  const submitMutation = useMutation({
    mutationFn: () => disputeApi.submit({
      transactionId: transaction!.id,
      description: desc.trim(),
    }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Report submitted', text2: "We'll review this transaction." });
      qc.invalidateQueries({ queryKey: ['my-disputes'] });
      setDesc('');
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

  if (!transaction) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={m.root}>
          <View style={m.header}>
            <Text style={m.title}>Dispute This Transaction</Text>
            <ModalCloseButton onPress={onClose} label="Close dispute form" color="#fff" style={m.closeBtn} />
          </View>
          <View style={m.summary}>
            <Text style={m.summaryStore}>{transaction.store?.name || 'Lucky Stop'}</Text>
            <Text style={m.summaryMeta}>
              {format(new Date(transaction.createdAt), 'MMM d, yyyy · h:mm a')} · ${Number(transaction.purchaseAmount).toFixed(2)}
              {transaction.category ? ` · ${transaction.category.replace(/_/g, ' ')}` : ''}
            </Text>
          </View>
          <View style={m.body}>
            <Text style={m.label}>What's wrong?</Text>
            <TextInput
              style={[m.input, { minHeight: 100, textAlignVertical: 'top' }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="e.g. I got fewer points than expected, or the category looks wrong..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              maxLength={DESC_MAX}
            />
            <Text style={[m.hint, desc.length > 0 && !descValid && m.hintError]}>
              {desc.trim().length}/{DESC_MIN} characters minimum
            </Text>

            <TouchableOpacity
              style={[m.submitBtn, (!descValid || submitMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => submitMutation.mutate()}
              disabled={!descValid || submitMutation.isPending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Submit transaction dispute"
            >
              {submitMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={m.submitBtnText}>Submit Report</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 12,
    backgroundColor: '#f97316',
  },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  summary: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryStore: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  summaryMeta: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.white,
  },
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: -6 },
  hintError: { color: COLORS.error },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
