import { useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Image, TextInput, RefreshControl, StatusBar,
  ActivityIndicator, Alert, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { offersApi, managerApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { COLORS } from '../../constants';

export default function ManagerBannersScreen() {
  const { user } = useAuthStore();
  const storeId = user?.storeIds?.[0];
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['manager-banners', storeId],
    queryFn: () => offersApi.getBanners(storeId),
    enabled: !!storeId,
  });

  const banners: any[] = data?.data?.data || [];

  const createMutation = useMutation({
    mutationFn: (formData: FormData) => managerApi.createBanner(formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-banners'] });
      Toast.show({ type: 'success', text1: 'Banner uploaded!' });
      setShowCreate(false);
      setTitle('');
      setImageUri(null);
    },
    onError: (err: any) => {
      const e = err.response?.data?.error;
      const msg = typeof e === 'string' ? e : (err.response?.data?.message || 'Failed to upload banner');
      Toast.show({ type: 'error', text1: msg });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (bannerId: string) => managerApi.deleteBanner(bannerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-banners'] });
      Toast.show({ type: 'success', text1: 'Banner removed' });
    },
    onError: (err: any) => {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to delete banner' });
    },
  });

  async function pickImage() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Toast.show({ type: 'error', text1: 'Photo library permission denied' });
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [16, 9],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  }

  function handleCreate() {
    if (!imageUri) { Toast.show({ type: 'error', text1: 'Select an image first' }); return; }
    const formData = new FormData() as any;
    const filename = imageUri.split('/').pop() || 'banner.jpg';
    formData.append('image', { uri: imageUri, type: 'image/jpeg', name: filename });
    if (title.trim()) formData.append('title', title.trim());
    if (storeId) formData.append('storeId', storeId);
    createMutation.mutate(formData);
  }

  function confirmDelete(banner: any) {
    Alert.alert('Remove Banner', `Remove "${banner.title || 'this banner'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate(banner.id) },
    ]);
  }

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.secondary} />

      <SafeAreaView style={s.headerBg}>
        <View style={s.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerTitle}>Banners</Text>
            <Text style={s.headerSub}>Promotional images shown to customers</Text>
          </View>
          <TouchableOpacity style={s.addBtn} onPress={() => setShowCreate(true)}>
            <Text style={s.addBtnText}>+ Upload</Text>
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
        ) : banners.length === 0 ? (
          <View style={s.emptyCard}>
            <Text style={s.emptyEmoji}>🖼️</Text>
            <Text style={s.emptyTitle}>No banners yet</Text>
            <Text style={s.emptySub}>Upload promotional images that customers see in the app</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setShowCreate(true)}>
              <Text style={s.emptyBtnText}>Upload Banner</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={s.sectionLabel}>{banners.length} Banner{banners.length !== 1 ? 's' : ''}</Text>
            {banners.map((banner: any) => (
              <View key={banner.id} style={s.bannerCard}>
                {banner.imageUrl ? (
                  <Image source={{ uri: banner.imageUrl }} style={s.bannerImg} resizeMode="cover" />
                ) : (
                  <View style={[s.bannerImg, s.bannerPlaceholder]}>
                    <Text style={{ fontSize: 32 }}>🖼️</Text>
                  </View>
                )}
                <View style={s.bannerInfo}>
                  <Text style={s.bannerTitle}>{banner.title || 'Untitled banner'}</Text>
                  <Text style={s.bannerDate}>
                    Added {new Date(banner.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </Text>
                </View>
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={() => confirmDelete(banner)}
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

      {/* ── Upload Banner Modal ── */}
      <Modal visible={showCreate} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreate(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Upload Banner</Text>
            <TouchableOpacity onPress={() => { setShowCreate(false); setTitle(''); setImageUri(null); }}>
              <Text style={s.modalClose}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.modalBody} showsVerticalScrollIndicator={false}>
            {/* Image picker */}
            <TouchableOpacity style={s.imagePicker} onPress={pickImage} activeOpacity={0.8}>
              {imageUri ? (
                <Image source={{ uri: imageUri }} style={s.imagePreview} resizeMode="cover" />
              ) : (
                <View style={s.imagePlaceholder}>
                  <Text style={{ fontSize: 40 }}>📷</Text>
                  <Text style={s.imagePlaceholderText}>Tap to select image</Text>
                  <Text style={s.imagePlaceholderSub}>16:9 recommended</Text>
                </View>
              )}
            </TouchableOpacity>
            {imageUri && (
              <TouchableOpacity onPress={pickImage} style={{ alignSelf: 'center', marginTop: 8, marginBottom: 16 }}>
                <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 14 }}>Change image</Text>
              </TouchableOpacity>
            )}

            <Text style={s.fieldLabel}>Title (optional)</Text>
            <TextInput
              style={s.input}
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Weekend Special"
              placeholderTextColor={COLORS.textMuted}
            />

            <TouchableOpacity
              style={[s.createBtn, createMutation.isPending && { opacity: 0.6 }]}
              onPress={handleCreate}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.createBtnText}>Upload Banner</Text>}
            </TouchableOpacity>
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </Modal>
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

  bannerCard: {
    backgroundColor: COLORS.white, borderRadius: 16, overflow: 'hidden', marginBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 3,
  },
  bannerImg: { width: '100%', height: 180 },
  bannerPlaceholder: { backgroundColor: COLORS.border, alignItems: 'center', justifyContent: 'center' },
  bannerInfo: { padding: 14 },
  bannerTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  bannerDate: { fontSize: 12, color: COLORS.textMuted, marginTop: 3 },
  deleteBtn: {
    marginHorizontal: 14, marginBottom: 14,
    borderWidth: 1.5, borderColor: COLORS.error + '50', borderRadius: 10,
    paddingVertical: 8, alignItems: 'center',
  },
  deleteBtnText: { color: COLORS.error, fontWeight: '700', fontSize: 13 },

  modal: { flex: 1, backgroundColor: COLORS.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: 52, backgroundColor: COLORS.secondary,
  },
  modalTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  modalClose: { color: 'rgba(255,255,255,0.7)', fontSize: 22, fontWeight: '300', paddingHorizontal: 4 },
  modalBody: { padding: 20 },

  imagePicker: { borderRadius: 16, overflow: 'hidden', marginBottom: 8 },
  imagePreview: { width: '100%', height: 200 },
  imagePlaceholder: {
    backgroundColor: COLORS.white, borderWidth: 2, borderColor: COLORS.border,
    borderStyle: 'dashed', borderRadius: 16,
    height: 200, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  imagePlaceholderText: { fontSize: 16, fontWeight: '700', color: COLORS.text },
  imagePlaceholderSub: { fontSize: 13, color: COLORS.textMuted },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 15, color: COLORS.text, backgroundColor: COLORS.white, marginBottom: 16,
  },
  createBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14, padding: 18,
    alignItems: 'center', marginTop: 8,
  },
  createBtnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
