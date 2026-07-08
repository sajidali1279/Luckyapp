import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Modal, KeyboardAvoidingView, Platform, Image,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { promotionsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';
import { RefreshIcon, Trash2Icon, ImageIcon } from './Icons';
import ModalCloseButton from './ModalCloseButton';

export default function PromoteBusinessModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();

  const [promoName, setPromoName] = useState(user?.name || '');
  const [promoPhone, setPromoPhone] = useState(user?.phone || '');
  const [promoBusinessName, setPromoBusinessName] = useState('');
  const [promoDesc, setPromoDesc] = useState('');
  const [promoWebsite, setPromoWebsite] = useState('');
  const [promoImageUri, setPromoImageUri] = useState<string | null>(null);

  const submitPromoMutation = useMutation({
    mutationFn: () => promotionsApi.submit({
      requesterName: promoName.trim(),
      requesterPhone: promoPhone.trim(),
      businessName: promoBusinessName.trim(),
      businessDescription: promoDesc.trim(),
      website: promoWebsite.trim() || undefined,
      imageUri: promoImageUri || undefined,
    }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Request submitted!', text2: "We'll reach out soon." });
      qc.invalidateQueries({ queryKey: ['my-promo-request'] });
      setPromoBusinessName(''); setPromoDesc(''); setPromoWebsite(''); setPromoImageUri(null);
      onClose();
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to submit request' });
    },
  });

  async function pickPromoImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Permission needed', text2: 'Allow photo access to upload a business image.' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setPromoImageUri(result.assets[0].uri);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.root}>
          <View style={s.header}>
            <Text style={s.title}>{t('promoModal.title')}</Text>
            <ModalCloseButton onPress={onClose} label="Close promote your business form" color="#fff" style={s.closeBtn} />
          </View>
          <Text style={s.subtitle}>{t('promoModal.subtitle')}</Text>
          <ScrollView style={s.body} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            <Text style={s.label}>{t('promoModal.yourName')}</Text>
            <TextInput style={s.input} value={promoName} onChangeText={setPromoName} placeholder={t('promoModal.fullNamePlaceholder')} placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
            <Text style={s.label}>{t('promoModal.contactPhone')}</Text>
            <TextInput style={s.input} value={promoPhone} onChangeText={setPromoPhone} placeholder={t('promoModal.phonePlaceholder')} placeholderTextColor={COLORS.textMuted} keyboardType="phone-pad" />
            <Text style={s.label}>{t('promoModal.businessName')}</Text>
            <TextInput style={s.input} value={promoBusinessName} onChangeText={setPromoBusinessName} placeholder={t('promoModal.businessNamePlaceholder')} placeholderTextColor={COLORS.textMuted} autoCapitalize="words" />
            <Text style={s.label}>{t('promoModal.businessDesc')}</Text>
            <TextInput
              style={[s.input, { minHeight: 90, textAlignVertical: 'top' }]}
              value={promoDesc}
              onChangeText={setPromoDesc}
              placeholder={t('promoModal.businessDescPlaceholder')}
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
            />
            <Text style={s.label}>{t('promoModal.website')}</Text>
            <TextInput style={s.input} value={promoWebsite} onChangeText={setPromoWebsite} placeholder={t('promoModal.websitePlaceholder')} placeholderTextColor={COLORS.textMuted} keyboardType="url" autoCapitalize="none" />

            <Text style={s.label}>{t('promoModal.businessImage')}</Text>
            {promoImageUri ? (
              <View style={s.imgWrap}>
                <Image source={{ uri: promoImageUri }} style={s.imgPreview} resizeMode="cover" />
                <View style={s.imgActions}>
                  <TouchableOpacity
                    style={s.imgBtn}
                    onPress={pickPromoImage}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Change business image"
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <RefreshIcon size={14} color={COLORS.textMuted} strokeWidth={2.5} />
                      <Text style={s.imgBtnText}>{t('promoModal.change')}</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.imgBtn, { borderColor: COLORS.error + '60' }]}
                    onPress={() => setPromoImageUri(null)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Remove business image"
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Trash2Icon size={14} color={COLORS.error} strokeWidth={2.5} />
                      <Text style={[s.imgBtnText, { color: COLORS.error }]}>{t('promoModal.remove')}</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={s.imgPicker}
                onPress={pickPromoImage}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Add business image"
              >
                <ImageIcon size={28} color={COLORS.textMuted} strokeWidth={1.5} />
                <Text style={s.imgPickerText}>{t('promoModal.tapToAdd')}</Text>
                <Text style={s.imgPickerSub}>{t('promoModal.supportedFormats')}</Text>
              </TouchableOpacity>
            )}

            <Text style={s.hint}>{t('promoModal.hint')}</Text>
            <TouchableOpacity
              style={[s.submitBtn, (submitPromoMutation.isPending || !promoBusinessName.trim() || !promoDesc.trim()) && { opacity: 0.5 }]}
              onPress={() => submitPromoMutation.mutate()}
              disabled={submitPromoMutation.isPending || !promoBusinessName.trim() || !promoDesc.trim()}
              accessibilityRole="button"
              accessibilityLabel="Submit business promotion request"
            >
              {submitPromoMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>{t('promoModal.submitRequest')}</Text>
              }
            </TouchableOpacity>
            <View style={{ height: 16 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
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
  hint: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  submitBtn: { backgroundColor: '#f97316', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  imgWrap: { gap: 8 },
  imgPreview: { width: '100%', height: 160, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  imgActions: { flexDirection: 'row', gap: 8 },
  imgBtn: {
    flex: 1, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 10, paddingVertical: 9, alignItems: 'center',
  },
  imgBtnText: { fontSize: 13, fontWeight: '700', color: COLORS.textMuted },
  imgPicker: {
    borderWidth: 2, borderColor: COLORS.border, borderStyle: 'dashed',
    borderRadius: 12, paddingVertical: 20,
    alignItems: 'center', gap: 6, backgroundColor: COLORS.background,
  },
  imgPickerText: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted },
  imgPickerSub: { fontSize: 12, color: COLORS.border },
});
