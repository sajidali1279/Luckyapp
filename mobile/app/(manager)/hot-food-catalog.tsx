import { useState, useMemo, useEffect } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Dimensions,
  Image, TextInput, ActivityIndicator, Alert, Modal, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { hotFoodCatalogApi, storesApi } from '../../services/api';
import { COLORS } from '../../constants';
import {
  FlameIcon, PlusIcon, EditIcon, Trash2Icon, XIcon, ClockIcon,
  CameraIcon, ImageIcon, InboxIcon, BuildingIcon,
} from '../../components/Icons';

// ─── Dimensions & utils ───────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TILE_GAP = 10;
const TILE_MARGIN = 14;
const TILE_WIDTH = (SCREEN_WIDTH - TILE_MARGIN * 2 - TILE_GAP) / 2;

function toTitleCase(str: string) {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogItem {
  id: string;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  estimatedMinutes?: number;
  storeCount: number;
}

interface CatalogForm {
  name: string;
  description: string;
  price: string;
  estimatedMinutes: string;
}

const EMPTY_FORM: CatalogForm = { name: '', description: '', price: '', estimatedMinutes: '' };

// ─── Catalog Tile ─────────────────────────────────────────────────────────────

function CatalogTile({ item, onPress }: { item: CatalogItem; onPress: () => void }) {
  const initial = item.name.charAt(0).toUpperCase();

  return (
    <TouchableOpacity style={s.tile} onPress={onPress} activeOpacity={0.88}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={s.tileImage} resizeMode="cover" />
      ) : (
        <View style={[s.tilePlaceholder, { backgroundColor: PLACEHOLDER_COLORS[initial.charCodeAt(0) % PLACEHOLDER_COLORS.length] }]}>
          <Text style={s.tilePlaceholderText}>{initial}</Text>
        </View>
      )}
      <View style={s.tileInfo}>
        <Text style={s.tileName} numberOfLines={2}>{item.name}</Text>
        <View style={s.tileBottom}>
          <Text style={s.tilePrice}>${Number(item.price).toFixed(2)}</Text>
          <View style={[s.tileBadge, item.storeCount === 0 && s.tileBadgeNone]}>
            <BuildingIcon size={9} color={item.storeCount > 0 ? '#3B82F6' : '#94A3B8'} strokeWidth={2.5} />
            <Text style={[s.tileBadgeText, item.storeCount === 0 && s.tileBadgeTextNone]}>
              {item.storeCount}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const PLACEHOLDER_COLORS = ['#DBEAFE', '#DCF8C6', '#FEF9C3', '#FFE4E6', '#EDE9FE', '#FFEDD5', '#F0FDF4'];

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────

function AddEditModal({ visible, editingItem, onClose }: {
  visible: boolean;
  editingItem: CatalogItem | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CatalogForm>(EMPTY_FORM);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (visible) {
      setForm(editingItem ? {
        name: editingItem.name,
        description: editingItem.description ?? '',
        price: String(editingItem.price),
        estimatedMinutes: editingItem.estimatedMinutes ? String(editingItem.estimatedMinutes) : '',
      } : EMPTY_FORM);
      setImageUri(null);
    }
  }, [visible, editingItem]);

  async function handlePickImage() {
    Alert.alert('Add Photo', 'Choose source', [
      {
        text: 'Camera',
        onPress: async () => {
          const { status } = await ImagePicker.requestCameraPermissionsAsync();
          if (status !== 'granted') { Toast.show({ type: 'error', text1: 'Camera permission required' }); return; }
          const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!result.canceled) setImageUri(result.assets[0].uri);
        },
      },
      {
        text: 'Photo Library',
        onPress: async () => {
          const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (status !== 'granted') { Toast.show({ type: 'error', text1: 'Photo library permission required' }); return; }
          const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.85 });
          if (!result.canceled) setImageUri(result.assets[0].uri);
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const name = toTitleCase(form.name.trim());
      if (!name) throw new Error('Item name is required');
      const price = parseFloat(form.price);
      if (isNaN(price) || price <= 0) throw new Error('Enter a valid price greater than 0');
      const estimatedMinutes = form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null;
      const description = form.description.trim() || null;

      if (editingItem) {
        await hotFoodCatalogApi.update(editingItem.id, { name, description, price, estimatedMinutes });
        if (imageUri) {
          const fd = new FormData();
          const filename = imageUri.split('/').pop() ?? 'item.jpg';
          const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
          (fd as any).append('image', { uri: imageUri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
          await hotFoodCatalogApi.updateImage(editingItem.id, fd);
        }
      } else {
        const fd = new FormData();
        fd.append('name', name);
        fd.append('price', String(price));
        if (description) fd.append('description', description);
        if (estimatedMinutes) fd.append('estimatedMinutes', String(estimatedMinutes));
        if (imageUri) {
          const filename = imageUri.split('/').pop() ?? 'item.jpg';
          const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
          (fd as any).append('image', { uri: imageUri, name: filename, type: ext === 'png' ? 'image/png' : 'image/jpeg' });
        }
        await hotFoodCatalogApi.create(fd);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      Toast.show({ type: 'success', text1: editingItem ? 'Item updated' : 'Item added to catalog' });
      onClose();
    },
    onError: (e: any) => {
      Toast.show({ type: 'error', text1: e.message || 'Failed to save item' });
    },
  });

  const displayUri = imageUri ?? (editingItem?.imageUrl ?? null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={m.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity style={m.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={m.sheet}>
          <View style={m.handle} />

          <View style={m.header}>
            <Text style={m.title}>{editingItem ? 'Edit Item' : 'New Catalog Item'}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <XIcon size={20} color={COLORS.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView style={m.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Image picker */}
            <TouchableOpacity style={m.imagePicker} onPress={handlePickImage} activeOpacity={0.85}>
              {displayUri ? (
                <Image source={{ uri: displayUri }} style={m.imagePreview} resizeMode="cover" />
              ) : (
                <View style={m.imagePlaceholder}>
                  <ImageIcon size={40} color="#CBD5E1" strokeWidth={1.5} />
                  <Text style={m.imagePlaceholderLabel}>Add Photo</Text>
                  <Text style={m.imagePlaceholderHint}>Tap to choose from library or camera</Text>
                </View>
              )}
              <View style={m.cameraBadge}>
                <CameraIcon size={13} color="#fff" strokeWidth={2.5} />
              </View>
            </TouchableOpacity>

            <Text style={m.label}>Item Name *</Text>
            <TextInput
              style={m.input}
              placeholder="e.g. Corn Dog"
              placeholderTextColor={COLORS.textMuted}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              maxLength={80}
              autoCapitalize="words"
            />

            <Text style={m.label}>Description</Text>
            <TextInput
              style={[m.input, m.textArea]}
              placeholder="Brief description (optional)"
              placeholderTextColor={COLORS.textMuted}
              value={form.description}
              onChangeText={v => setForm(f => ({ ...f, description: v }))}
              maxLength={200}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />

            <View style={m.row}>
              <View style={m.halfField}>
                <Text style={m.label}>Price ($) *</Text>
                <TextInput
                  style={m.input}
                  placeholder="0.00"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.price}
                  onChangeText={v => setForm(f => ({ ...f, price: v }))}
                  keyboardType="decimal-pad"
                  maxLength={8}
                />
              </View>
              <View style={m.halfField}>
                <Text style={m.label}>Est. Minutes</Text>
                <TextInput
                  style={m.input}
                  placeholder="e.g. 10"
                  placeholderTextColor={COLORS.textMuted}
                  value={form.estimatedMinutes}
                  onChangeText={v => setForm(f => ({ ...f, estimatedMinutes: v.replace(/\D/g, '') }))}
                  keyboardType="number-pad"
                  maxLength={3}
                />
              </View>
            </View>

            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={m.footer}>
            <TouchableOpacity
              style={[m.saveBtn, saveMutation.isPending && { opacity: 0.65 }]}
              onPress={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              activeOpacity={0.85}
            >
              {saveMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={m.saveBtnText}>{editingItem ? 'Save Changes' : 'Add to Catalog'}</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Store Assignment Sheet ───────────────────────────────────────────────────

function AssignSheet({ visible, item, onClose, onEdit }: {
  visible: boolean;
  item: CatalogItem | null;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: storesData } = useQuery({
    queryKey: ['manager-accessible-stores'],
    queryFn: storesApi.accessible,
    staleTime: 5 * 60_000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];

  const { data: assignmentData, isLoading: assignLoading } = useQuery({
    queryKey: ['catalog-store-assignments', item?.id],
    queryFn: () => hotFoodCatalogApi.getStoreAssignments(item!.id),
    enabled: !!item && visible,
  });
  const assignedIds: string[] = assignmentData?.data?.data?.assignedStoreIds ?? [];

  // Sync checkboxes whenever server data arrives or the sheet reopens
  useEffect(() => {
    setLocalSelected(new Set(assignedIds));
  }, [assignedIds.join(','), visible]);

  const hasChanges = useMemo(() => {
    const original = new Set(assignedIds);
    if (original.size !== localSelected.size) return true;
    for (const id of localSelected) if (!original.has(id)) return true;
    return false;
  }, [localSelected, assignedIds]);

  function toggleStore(storeId: string) {
    setLocalSelected(prev => {
      const next = new Set(prev);
      if (next.has(storeId)) next.delete(storeId); else next.add(storeId);
      return next;
    });
  }

  function selectAll() { setLocalSelected(new Set(stores.map(s => s.id))); }
  function clearAll()  { setLocalSelected(new Set()); }

  async function handleSave() {
    if (!item || saving) return;
    setSaving(true);
    const originalSet = new Set(assignedIds);
    const toAdd    = stores.filter(s => localSelected.has(s.id)  && !originalSet.has(s.id));
    const toRemove = stores.filter(s => !localSelected.has(s.id) && originalSet.has(s.id));
    try {
      await Promise.all([
        ...toAdd.map(s    => hotFoodCatalogApi.assignToStore(item.id, s.id)),
        ...toRemove.map(s => hotFoodCatalogApi.removeFromStore(item.id, s.id)),
      ]);
      qc.invalidateQueries({ queryKey: ['catalog-store-assignments', item.id] });
      qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
      const n = localSelected.size;
      Toast.show({ type: 'success', text1: `Assigned to ${n} store${n !== 1 ? 's' : ''}` });
      onClose();
    } catch {
      Toast.show({ type: 'error', text1: 'Could not save store assignments' });
    } finally {
      setSaving(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      'Delete Item',
      `Remove "${item?.name}" from the catalog? It will be unassigned from all stores.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await hotFoodCatalogApi.delete(item!.id);
              qc.invalidateQueries({ queryKey: ['hot-food-catalog'] });
              Toast.show({ type: 'success', text1: 'Item removed from catalog' });
              onClose();
            } catch {
              Toast.show({ type: 'error', text1: 'Could not delete item' });
            }
          },
        },
      ]
    );
  }

  if (!item) return null;

  const initial      = item.name.charAt(0).toUpperCase();
  const placeholderBg = PLACEHOLDER_COLORS[initial.charCodeAt(0) % PLACEHOLDER_COLORS.length];
  const allSelected  = stores.length > 0 && localSelected.size === stores.length;
  const noneSelected = localSelected.size === 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={a.overlay}>
        <TouchableOpacity style={a.backdrop} onPress={onClose} activeOpacity={1} />
        <View style={a.sheet}>
          <View style={a.handle} />

          {/* Item summary */}
          <View style={a.itemRow}>
            {item.imageUrl ? (
              <Image source={{ uri: item.imageUrl }} style={a.thumb} resizeMode="cover" />
            ) : (
              <View style={[a.thumbPlaceholder, { backgroundColor: placeholderBg }]}>
                <Text style={a.thumbInitial}>{initial}</Text>
              </View>
            )}
            <View style={a.itemInfo}>
              <Text style={a.itemName} numberOfLines={1}>{item.name}</Text>
              {item.description ? <Text style={a.itemDesc} numberOfLines={2}>{item.description}</Text> : null}
              <View style={a.itemMeta}>
                <Text style={a.itemPrice}>${Number(item.price).toFixed(2)}</Text>
                {item.estimatedMinutes ? (
                  <View style={a.itemEst}>
                    <ClockIcon size={11} color={COLORS.textMuted} strokeWidth={2} />
                    <Text style={a.itemEstText}>~{item.estimatedMinutes} min</Text>
                  </View>
                ) : null}
              </View>
            </View>
            <View style={a.actionBtns}>
              <TouchableOpacity style={a.iconBtn} onPress={onEdit} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <EditIcon size={16} color={COLORS.secondary} strokeWidth={2} />
              </TouchableOpacity>
              <TouchableOpacity style={[a.iconBtn, a.iconBtnDanger]} onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Trash2Icon size={16} color="#EF4444" strokeWidth={2} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Section header + bulk controls */}
          <View style={a.sectionHead}>
            <Text style={a.sectionTitle}>Assign to Stores</Text>
            <View style={a.bulkRow}>
              <TouchableOpacity
                style={[a.bulkBtn, allSelected && a.bulkBtnOn]}
                onPress={selectAll}
                disabled={assignLoading}
                activeOpacity={0.7}
              >
                <Text style={[a.bulkBtnText, allSelected && a.bulkBtnTextOn]}>All</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[a.bulkBtn, noneSelected && a.bulkBtnOn]}
                onPress={clearAll}
                disabled={assignLoading}
                activeOpacity={0.7}
              >
                <Text style={[a.bulkBtnText, noneSelected && a.bulkBtnTextOn]}>None</Text>
              </TouchableOpacity>
              <Text style={a.sectionCount}>
                {assignLoading ? '…' : `${localSelected.size} / ${stores.length}`}
              </Text>
            </View>
          </View>

          {/* Store list */}
          {assignLoading ? (
            <View style={a.loadingWrap}><ActivityIndicator color={COLORS.primary} /></View>
          ) : stores.length === 0 ? (
            <View style={a.loadingWrap}><Text style={a.noStoresText}>No stores found.</Text></View>
          ) : (
            <ScrollView style={a.storeScroll} showsVerticalScrollIndicator={false}>
              {stores.map((store, idx) => {
                const checked = localSelected.has(store.id);
                return (
                  <TouchableOpacity
                    key={store.id}
                    style={[a.storeRow, idx < stores.length - 1 && a.storeRowBorder, checked && a.storeRowChecked]}
                    onPress={() => toggleStore(store.id)}
                    activeOpacity={0.65}
                  >
                    <View style={[a.checkbox, checked && a.checkboxOn]}>
                      {checked && <Text style={a.checkMark}>✓</Text>}
                    </View>
                    <Text style={[a.storeName, checked && a.storeNameOn]}>{store.name}</Text>
                  </TouchableOpacity>
                );
              })}
              <View style={{ height: 12 }} />
            </ScrollView>
          )}

          {/* Save footer */}
          <View style={a.footer}>
            <TouchableOpacity
              style={[a.saveBtn, (!hasChanges || saving) && a.saveBtnDim]}
              onPress={handleSave}
              disabled={!hasChanges || saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={a.saveBtnText}>
                  {hasChanges
                    ? `Save · ${localSelected.size} store${localSelected.size !== 1 ? 's' : ''}`
                    : 'No changes'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function HotFoodCatalog() {
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [showAssign, setShowAssign] = useState(false);
  const [showAddEdit, setShowAddEdit] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['hot-food-catalog'],
    queryFn: hotFoodCatalogApi.getAll,
    staleTime: 2 * 60_000,
  });
  const items: CatalogItem[] = data?.data?.data ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q));
  }, [items, search]);

  function openItem(item: CatalogItem) {
    setSelectedItem(item);
    setShowAssign(true);
  }

  function openEdit(item: CatalogItem) {
    setShowAssign(false);
    // Brief delay so the assign sheet closes before the edit modal opens
    setTimeout(() => {
      setEditingItem(item);
      setShowAddEdit(true);
    }, 350);
  }

  function openAdd() {
    setEditingItem(null);
    setShowAddEdit(true);
  }

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <View style={s.headerIcon}>
            <FlameIcon size={20} color="#fff" strokeWidth={2} />
          </View>
          <View>
            <Text style={s.headerTitle}>Item Catalog</Text>
            <Text style={s.headerSub}>{items.length} items · tap to assign stores</Text>
          </View>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={openAdd} activeOpacity={0.85}>
          <PlusIcon size={17} color="#fff" strokeWidth={2.5} />
          <Text style={s.addBtnText}>Add Item</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={s.searchWrap}>
        <TextInput
          style={s.searchInput}
          placeholder="Search catalog..."
          placeholderTextColor={COLORS.textMuted}
          value={search}
          onChangeText={setSearch}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
      </View>

      {/* Grid */}
      {isLoading ? (
        <View style={s.centerState}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={s.centerState}>
          <InboxIcon size={52} color="#D1D5DB" />
          <Text style={s.emptyTitle}>
            {search.trim() ? 'No items match your search' : 'No items in catalog yet'}
          </Text>
          {!search.trim() && (
            <Text style={s.emptyHint}>Tap + Add Item to build your catalog</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={item => item.id}
          numColumns={2}
          columnWrapperStyle={s.gridRow}
          contentContainerStyle={s.gridContent}
          showsVerticalScrollIndicator={false}
          onRefresh={refetch}
          refreshing={isRefetching}
          renderItem={({ item }) => (
            <CatalogTile item={item} onPress={() => openItem(item)} />
          )}
        />
      )}

      <AssignSheet
        visible={showAssign}
        item={selectedItem}
        onClose={() => setShowAssign(false)}
        onEdit={() => selectedItem && openEdit(selectedItem)}
      />

      <AddEditModal
        visible={showAddEdit}
        editingItem={editingItem}
        onClose={() => setShowAddEdit(false)}
      />
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.secondary, paddingHorizontal: 20, paddingVertical: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  headerIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#fff' },
  headerSub:   { fontSize: 11, color: 'rgba(255,255,255,0.6)', marginTop: 1 },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: COLORS.primary, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  searchWrap: {
    backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  searchInput: {
    backgroundColor: '#F1F5F9', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 15, color: '#0F172A',
  },

  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 40 },
  emptyTitle:  { fontSize: 15, fontWeight: '600', color: '#64748B', textAlign: 'center' },
  emptyHint:   { fontSize: 13, color: '#94A3B8', textAlign: 'center' },

  gridContent: { padding: TILE_MARGIN, paddingBottom: 40 },
  gridRow:     { gap: TILE_GAP, marginBottom: TILE_GAP },

  // ── Tile ──────────────────────────────────────────────────────────────────
  tile: {
    width: TILE_WIDTH, borderRadius: 16, overflow: 'hidden',
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 3,
  },
  tileImage: { width: TILE_WIDTH, height: TILE_WIDTH },
  tilePlaceholder: {
    width: TILE_WIDTH, height: TILE_WIDTH,
    alignItems: 'center', justifyContent: 'center',
  },
  tilePlaceholderText: { fontSize: 44, fontWeight: '900', color: 'rgba(0,0,0,0.15)' },
  tileInfo:   { padding: 10 },
  tileName:   { fontSize: 13, fontWeight: '700', color: '#0F172A', marginBottom: 6, lineHeight: 17 },
  tileBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tilePrice:  { fontSize: 13, fontWeight: '700', color: '#EA580C' },
  tileBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2,
  },
  tileBadgeNone:    { backgroundColor: '#F1F5F9' },
  tileBadgeText:    { fontSize: 10, fontWeight: '700', color: '#3B82F6' },
  tileBadgeTextNone:{ color: '#94A3B8' },
});

// ─── Add/Edit Modal Styles ────────────────────────────────────────────────────

const m = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '93%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  title:  { fontSize: 18, fontWeight: '900', color: '#0F172A' },
  body:   { paddingHorizontal: 20, paddingTop: 20 },

  // Image picker
  imagePicker: {
    alignSelf: 'center', width: 160, height: 160, borderRadius: 20,
    overflow: 'hidden', marginBottom: 24,
    backgroundColor: '#F8FAFC',
    borderWidth: 2, borderColor: '#E2E8F0', borderStyle: 'dashed',
  },
  imagePreview:        { width: '100%', height: '100%' },
  imagePlaceholder:    { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10 },
  imagePlaceholderLabel: { fontSize: 14, fontWeight: '700', color: '#94A3B8' },
  imagePlaceholderHint:  { fontSize: 11, color: '#CBD5E1', textAlign: 'center' },
  cameraBadge: {
    position: 'absolute', bottom: 10, right: 10,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },

  label: {
    fontSize: 12, fontWeight: '700', color: '#374151',
    marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    padding: 13, fontSize: 15, color: '#0F172A',
    backgroundColor: '#FAFAFA', marginBottom: 14,
  },
  textArea:  { minHeight: 72, textAlignVertical: 'top' },
  row:       { flexDirection: 'row', gap: 12 },
  halfField: { flex: 1 },

  footer: {
    paddingHorizontal: 20, paddingVertical: 16,
    borderTopWidth: 1, borderTopColor: '#F3F4F6',
  },
  saveBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

// ─── Assign Sheet Styles ──────────────────────────────────────────────────────

const a = StyleSheet.create({
  overlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  handle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },

  // Item summary
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  thumb:            { width: 68, height: 68, borderRadius: 14 },
  thumbPlaceholder: { width: 68, height: 68, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  thumbInitial:     { fontSize: 24, fontWeight: '900', color: 'rgba(0,0,0,0.2)' },
  itemInfo:         { flex: 1 },
  itemName:         { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 3 },
  itemDesc:         { fontSize: 12, color: '#94A3B8', lineHeight: 16, marginBottom: 4 },
  itemMeta:         { flexDirection: 'row', alignItems: 'center', gap: 10 },
  itemPrice:        { fontSize: 14, fontWeight: '700', color: '#EA580C' },
  itemEst:          { flexDirection: 'row', alignItems: 'center', gap: 3 },
  itemEstText:      { fontSize: 12, color: '#94A3B8' },
  actionBtns:       { gap: 8 },
  iconBtn:          { width: 32, height: 32, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  iconBtnDanger:    { backgroundColor: '#FEF2F2' },

  // Section header + bulk controls
  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 10,
    backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#F1F5F9',
  },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.6 },
  bulkRow:      { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bulkBtn:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  bulkBtnOn:    { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  bulkBtnText:  { fontSize: 12, fontWeight: '700', color: '#64748B' },
  bulkBtnTextOn:{ color: '#fff' },
  sectionCount: { fontSize: 13, fontWeight: '700', color: COLORS.secondary, minWidth: 40, textAlign: 'right' },

  loadingWrap:  { paddingVertical: 40, alignItems: 'center' },
  noStoresText: { fontSize: 14, color: '#94A3B8' },

  // Store rows — full row is tappable
  storeScroll:     { flex: 1 },
  storeRow:        { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13 },
  storeRowBorder:  { borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  storeRowChecked: { backgroundColor: '#F0FDF4' },
  checkbox:        { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#D1D5DB', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  checkboxOn:      { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  checkMark:       { color: '#fff', fontSize: 13, fontWeight: '900', lineHeight: 16 },
  storeName:       { flex: 1, fontSize: 15, fontWeight: '500', color: '#374151' },
  storeNameOn:     { fontWeight: '700', color: '#0F172A' },

  // Save footer
  footer:      { paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  saveBtn:     { backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 15, alignItems: 'center', shadowColor: COLORS.secondary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 8, elevation: 4 },
  saveBtnDim:  { backgroundColor: '#CBD5E1', shadowOpacity: 0, elevation: 0 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
