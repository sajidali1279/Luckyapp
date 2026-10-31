import {
  View,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Animated,
  Modal,
  ScrollView,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { Text, TextInput } from './ScaledText';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useTranslation } from 'react-i18next';
import { chatApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';
import EmptyState from './EmptyState';
import ModalCloseButton from './ModalCloseButton';
import { MessageCircleIcon, ArrowUpIcon, ChevronDownIcon, CheckCircleIcon, PlusIcon, XIcon } from './Icons';
import { NoticeStack, usePinnedNotices } from './NoticeBanner';
import KeyboardSafe from './KeyboardSafe';
import ErrorState from './ErrorState';
import ModalToastHost from './ModalToastHost';
import FocusStatusBar from './FocusStatusBar';

const ROLE_COLORS: Record<string, string> = {
  DEV_ADMIN:     '#2DC653',
  SUPER_ADMIN:   '#1D3557',
  STORE_MANAGER: '#0369a1',
  EMPLOYEE:      '#f59e0b',
};

const STORE_GRADIENT_PAIRS: [string, string][] = [
  ['#1D3557', '#457B9D'],
  ['#0369a1', '#0ea5e9'],
  ['#166534', '#2DC653'],
  ['#7c3aed', '#a78bfa'],
  ['#b45309', '#f59e0b'],
  ['#be123c', '#f43f5e'],
];

interface Message {
  id: string;
  storeId: string;
  userId: string;
  userName: string;
  userRole: string;
  text: string;
  toUserId?: string | null;
  toUserName?: string | null;
  attachment?: { kind: 'IMAGE' | 'PDF'; name: string; bytes: number | null; url: string; thumbUrl: string } | null;   // a photo or a PDF (2026-10-24)
  createdAt: string;
  uploading?: boolean;   // a photo or PDF still on its way: shown right away, dimmed with a spinner, replaced by the saved message
}

// What is waiting to be sent with the next message
interface Pending { uri: string; name: string; type: string; kind: 'IMAGE' | 'PDF'; bytes?: number }
const MAX_PDF = 5 * 1024 * 1024;
const sizeText = (b?: number | null) => (b == null ? '' : b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

interface Store {
  id: string;
  name: string;
  city?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string, t: (key: string) => string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return t('sharedChat.today');
  if (d.toDateString() === yesterday.toDateString()) return t('sharedChat.yesterday');
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function getInitials(name: string) {
  const parts = name.trim().split(' ');
  return parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : (name[0] || '?').toUpperCase();
}

export default function ChatScreen() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [toUser, setToUser] = useState<{ id: string; name: string } | null>(null);   // a private message to this person; null = everyone
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);   // a photo or PDF chosen, not yet sent
  const [attachOpen, setAttachOpen] = useState(false);          // the 'add a photo or file' sheet (a sheet, not an Alert: Android shows an Alert's first 3 buttons only)
  const [viewing, setViewing] = useState<string | null>(null);     // a photo opened full size
  const [pollOffline, setPollOffline] = useState(false);
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendScale = useRef(new Animated.Value(1)).current;

  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  // Unread messages per store (2026-10-10): the chat opens on the store that has new messages, and the switcher shows each count.
  // It used to open on the first store alphabetically, so a multi-store employee saw "4 unread" in the menu and an empty chat.
  const unreadQ = useQuery({ queryKey: ['chat-unread-by-store'], queryFn: () => chatApi.getUnreadByStore(), refetchInterval: 30_000 });
  const unreadBy: Record<string, number> = unreadQ.data?.data?.data ?? {};

  const { notices: visibleNotices, dismiss: dismissNotice } = usePinnedNotices(selectedStoreId);
  // Who a private message can go to at this store (2026-10-23)
  const peopleQ = useQuery({ queryKey: ['chat-people', selectedStoreId], queryFn: () => chatApi.getPeople(selectedStoreId!), enabled: !!selectedStoreId, staleTime: 5 * 60_000 });
  const people: { id: string; name: string; role: string }[] = peopleQ.data?.data?.data ?? [];
  useEffect(() => { setToUser(null); }, [selectedStoreId]);   // a private message belongs to one store's thread

  const ROLE_LABELS: Record<string, string> = {
    DEV_ADMIN:     t('sharedChat.roleDev'),
    SUPER_ADMIN:   t('sharedChat.roleHq'),
    STORE_MANAGER: t('sharedChat.roleManager'),
    EMPLOYEE:      t('sharedChat.roleStaff'),
  };

  useEffect(() => {
    const s: Store[] = storesData?.data?.data || [];
    setStores(s);
    if (s.length === 0 || selectedStoreId) return;
    if (s.length > 1 && unreadQ.isLoading) return;   // wait a moment to know where the new messages are
    const withNew = [...s].filter((x) => (unreadBy[x.id] ?? 0) > 0).sort((a, b) => (unreadBy[b.id] ?? 0) - (unreadBy[a.id] ?? 0))[0];
    const own = s.find((x) => user?.storeIds?.includes(x.id));
    setSelectedStoreId((withNew ?? own ?? s[0]).id);
  }, [storesData, unreadQ.isLoading]);
  // Reading a store's messages marks them read: refresh the per-store counts (and the menu badge) when switching
  useEffect(() => {
    if (!selectedStoreId) return;
    const timer = setTimeout(() => { qc.invalidateQueries({ queryKey: ['chat-unread-by-store'] }); qc.invalidateQueries({ queryKey: ['chat-unread-count'] }); }, 1500);
    return () => clearTimeout(timer);
  }, [selectedStoreId]);

  const { data: initialData, isLoading: msgsLoading, isError: msgsError, refetch: refetchMsgs } = useQuery({
    queryKey: ['chat-messages-init', selectedStoreId],
    queryFn: () => chatApi.getMessages(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  // Order matters: on a store change, clear first and then load, so a store whose messages are already cached shows them (the clear
  // used to run last and wipe them, and with no timestamp the poll never started)
  useEffect(() => { setMessages([]); setLastTimestamp(null); }, [selectedStoreId]);

  useEffect(() => {
    if (initialData?.data?.data) {
      const msgs: Message[] = initialData.data.data;
      setMessages(msgs);
      setLastTimestamp(msgs[msgs.length - 1]?.createdAt ?? null);
    }
  }, [initialData, selectedStoreId]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  const poll = useCallback(async () => {
    if (!selectedStoreId || !lastTimestamp) return;
    try {
      const res = await chatApi.getMessages(selectedStoreId, lastTimestamp);
      const newMsgs: Message[] = res.data?.data || [];
      if (newMsgs.length > 0) {
        // Never twice: a poll that was in flight while we sent can bring our own message back
        setMessages((prev) => { const seen = new Set(prev.map((m) => m.id)); const add = newMsgs.filter((m) => !seen.has(m.id)); return add.length ? [...prev, ...add] : prev; });
        setLastTimestamp(newMsgs[newMsgs.length - 1]!.createdAt);
      }
      setPollOffline(false);
    } catch {
      // Don't toast on every failed 8s poll, that would be constant spam while
      // offline. Show a persistent inline banner instead, cleared on the next
      // successful poll.
      setPollOffline(true);
    }
  }, [selectedStoreId, lastTimestamp]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  // Choosing a photo or a PDF to send (2026-10-24): the camera, the photo library or a PDF from Files. It waits above the box until Send.
  async function takePhoto(camera: boolean) {
    try {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, exif: false };
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Toast.show({ type: 'error', text1: t('sharedChat.cameraDenied') }); return; }
      }
      const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const a = r.canceled ? null : r.assets?.[0];
      if (a) setPending({ uri: a.uri, name: a.fileName || 'photo.jpg', type: a.mimeType || 'image/jpeg', kind: 'IMAGE', bytes: a.fileSize });
    } catch { Toast.show({ type: 'error', text1: t('sharedChat.attachFailed') }); }
  }
  async function pickPdf() {
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
      const a = r.canceled ? null : r.assets?.[0];
      if (!a) return;
      if (a.size != null && a.size > MAX_PDF) { Toast.show({ type: 'error', text1: t('sharedChat.pdfTooBig') }); return; }
      setPending({ uri: a.uri, name: a.name || 'document.pdf', type: 'application/pdf', kind: 'PDF', bytes: a.size ?? undefined });
    } catch { Toast.show({ type: 'error', text1: t('sharedChat.attachFailed') }); }
  }
  // Open the next picker once the sheet has closed (iOS will not present a second screen while a Modal is still closing)
  const chooseAttachment = () => setAttachOpen(true);
  const attachThen = (go: () => void) => { setAttachOpen(false); setTimeout(go, 350); };
  async function openFile(m: Message) {
    if (!m.attachment) return;
    if (m.attachment.kind === 'IMAGE') { setViewing(m.attachment.url); return; }
    try { await Linking.openURL(m.attachment.url); } catch { Toast.show({ type: 'error', text1: t('sharedChat.openFailed') }); }
  }

  async function handleSend() {
    const text = inputText.trim();
    if ((!text && !pending) || !selectedStoreId || sending) return;

    Animated.sequence([
      Animated.timing(sendScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(sendScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    setSending(true);
    // A photo or PDF appears in the thread at once, dimmed with a spinner, so the person can see it is on its way (a slow connection takes a while)
    const file = pending;
    const tempId = file ? `sending-${Date.now()}` : null;
    if (file && tempId) {
      setMessages((prev) => [...prev, {
        id: tempId, storeId: selectedStoreId, userId: user?.id ?? '', userName: user?.name ?? '', userRole: user?.role ?? 'EMPLOYEE', text,
        toUserId: toUser?.id ?? null, toUserName: toUser?.name ?? null, createdAt: new Date().toISOString(), uploading: true,
        attachment: { kind: file.kind, name: file.name, bytes: file.bytes ?? null, url: file.uri, thumbUrl: file.uri },
      }]);
      setInputText('');
      setPending(null);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
    try {
      const res = file ? await chatApi.sendAttachment(selectedStoreId, file, text, toUser?.id) : await chatApi.sendMessage(selectedStoreId, text, toUser?.id);
      const newMsg: Message = res.data.data;
      setInputText('');
      setPending(null);
      setMessages((prev) => {
        const without = tempId ? prev.filter((m) => m.id !== tempId) : prev;
        return without.some((m) => m.id === newMsg.id) ? without : [...without, newMsg];
      });
      // The poll cursor stays where it was: moving it to our message skipped any teammate's message sent just before it. (An empty chat
      // has no cursor yet, so it starts at ours.)
      setLastTimestamp((prev) => prev ?? newMsg.createdAt);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch (err: any) {
      // Keep the typed text in the input, don't make the cashier retype a lost message (and a photo or PDF goes back above the box)
      if (tempId && file) { setMessages((prev) => prev.filter((m) => m.id !== tempId)); setPending(file); setInputText(text); }
      Toast.show({ type: 'error', text1: t('sharedChat.sendErrorTitle'), text2: err.response?.data?.error || t('sharedChat.sendErrorDefault') });
    }
    setSending(false);
  }

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const storeIdx = stores.findIndex((s) => s.id === selectedStoreId);
  const gradientPair = STORE_GRADIENT_PAIRS[storeIdx % STORE_GRADIENT_PAIRS.length] || STORE_GRADIENT_PAIRS[0];

  const renderMessage = ({ item, index }: { item: Message; index: number }) => {
    const isMe = item.userId === user?.id;
    const prev = messages[index - 1];
    const next = messages[index + 1];
    const showDivider = !prev || !isSameDay(prev.createdAt, item.createdAt);
    const isFirstInGroup = !prev || prev.userId !== item.userId || showDivider;
    const isLastInGroup = !next || next.userId !== item.userId || !isSameDay(item.createdAt, next.createdAt);
    const roleColor = ROLE_COLORS[item.userRole] || '#6c757d';

    return (
      <View>
        {showDivider && (
          <View style={s.dateDivider}>
            <View style={s.dateDividerLine} />
            <Text style={s.dateDividerText}>{formatDateLabel(item.createdAt, t)}</Text>
            <View style={s.dateDividerLine} />
          </View>
        )}

        <View style={[
          s.msgRow,
          isMe ? s.msgRowMe : s.msgRowThem,
          { marginBottom: isLastInGroup ? 10 : 2 },
        ]}>
          {/* Avatar column for others */}
          {!isMe && (
            <View style={s.avatarSlot}>
              {isLastInGroup ? (
                <View style={[s.avatar, { backgroundColor: roleColor }]}>
                  <Text style={s.avatarText}>{getInitials(item.userName)}</Text>
                </View>
              ) : null}
            </View>
          )}

          <View style={{ maxWidth: '72%' }}>
            {!!item.toUserId && (
              <Text style={[s.privateTag, { textAlign: isMe ? 'right' : 'left' }]}>
                🔒 {isMe ? t('sharedChat.privateTo', { name: item.toUserName }) : item.toUserId === user?.id ? t('sharedChat.privateToYou') : t('sharedChat.privateBetween', { from: item.userName, to: item.toUserName })}
              </Text>
            )}
            {!isMe && isFirstInGroup && (
              <View style={s.msgMeta}>
                <Text style={s.msgSender} onPress={() => { const p = people.find((x) => x.id === item.userId); if (p) setToUser({ id: p.id, name: p.name }); }} accessibilityRole="button" accessibilityLabel={t('sharedChat.replyPrivatelyA11y', { name: item.userName })}>{item.userName}</Text>
                <View style={[s.roleBadge, { backgroundColor: roleColor }]}>
                  <Text style={s.roleBadgeText}>{ROLE_LABELS[item.userRole] || item.userRole}</Text>
                </View>
              </View>
            )}

            <View style={[
              s.bubble,
              isMe ? s.bubbleMe : s.bubbleThem,
              !isMe && isFirstInGroup && !isLastInGroup && s.bubbleTopLeft,
              !isMe && !isFirstInGroup && !isLastInGroup && s.bubbleMidLeft,
              !isMe && !isFirstInGroup && isLastInGroup && s.bubbleBotLeft,
              isMe && isFirstInGroup && !isLastInGroup && s.bubbleTopRight,
              isMe && !isFirstInGroup && !isLastInGroup && s.bubbleMidRight,
              isMe && !isFirstInGroup && isLastInGroup && s.bubbleBotRight,
            ]}>
              {item.attachment?.kind === 'IMAGE' && (
                <TouchableOpacity onPress={() => openFile(item)} disabled={item.uploading} activeOpacity={0.85} accessibilityRole="imagebutton" accessibilityLabel={t('sharedChat.openPhotoA11y', { name: item.userName })}>
                  <Image source={{ uri: item.attachment.thumbUrl }} style={[s.photo, item.uploading && { opacity: 0.55 }]} contentFit="cover" transition={150} />
                  {item.uploading && <View style={s.uploadOverlay}><ActivityIndicator color="#fff" /><Text style={s.uploadText}>{t('sharedChat.sending')}</Text></View>}
                </TouchableOpacity>
              )}
              {item.attachment?.kind === 'PDF' && (
                <TouchableOpacity onPress={() => openFile(item)} disabled={item.uploading} activeOpacity={0.85} style={[s.pdfCard, item.uploading && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel={t('sharedChat.openPdfA11y', { name: item.attachment.name })}>
                  <Image source={{ uri: item.attachment.thumbUrl }} style={s.pdfThumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.pdfName, isMe && { color: '#fff' }]} numberOfLines={2}>{item.attachment.name}</Text>
                    <Text style={[s.pdfSub, isMe && { color: 'rgba(255,255,255,0.8)' }]}>PDF{item.attachment.bytes ? ` · ${sizeText(item.attachment.bytes)}` : ''} · {item.uploading ? t('sharedChat.sending') : t('sharedChat.tapToOpen')}</Text>
                  </View>
                </TouchableOpacity>
              )}
              {!!item.text && <Text style={[s.bubbleText, isMe && { color: '#fff' }, !!item.attachment && { marginTop: 6 }]}>{item.text}</Text>}
            </View>

            {isLastInGroup && (
              <Text style={[s.msgTime, { textAlign: isMe ? 'right' : 'left' }]}>
                {formatTime(item.createdAt)}
              </Text>
            )}
          </View>

          {/* Avatar column for self */}
          {isMe && (
            <View style={s.avatarSlot}>
              {isLastInGroup ? (
                <View style={[s.avatar, { backgroundColor: roleColor }]}>
                  <Text style={s.avatarText}>{getInitials(item.userName)}</Text>
                </View>
              ) : null}
            </View>
          )}
        </View>
      </View>
    );
  };

  if (storesLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={COLORS.primary} size="large" />
      </View>
    );
  }

  if (stores.length === 0) {
    return <EmptyState icon={<MessageCircleIcon size={52} color="#C4CAD4" strokeWidth={1.25} />} title={t('sharedChat.emptyTitle')} subtitle={t('sharedChat.emptySubtitle')} />;
  }

  return (
    <KeyboardSafe iosOffset={90}
      style={{ flex: 1 }}
    >
      <View style={s.root}>
        <FocusStatusBar barStyle="light-content" />
        {/* ── Header ── */}
        <View style={[s.headerGradient, { backgroundColor: gradientPair[0] }]}>
          <SafeAreaView edges={['top']}>
            <TouchableOpacity
              style={s.headerRow}
              activeOpacity={stores.length > 1 ? 0.75 : 1}
              onPress={() => stores.length > 1 && setSwitcherOpen(true)}
              disabled={stores.length <= 1}
              accessibilityRole={stores.length > 1 ? 'button' : undefined}
              accessibilityLabel={stores.length > 1 ? t('sharedChat.currentlyViewingA11y', { store: selectedStore?.name }) : undefined}
            >
              <View style={s.headerAvatar}>
                <Text style={s.headerAvatarText}>{selectedStore?.name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <View style={s.headerTitleRow}>
                  <Text style={s.headerTitle} numberOfLines={1}>{selectedStore?.name || t('sharedChat.chatFallbackTitle')}</Text>
                  {stores.length > 1 && <ChevronDownIcon size={16} color="rgba(255,255,255,0.75)" strokeWidth={2.5} />}
                </View>
                <View style={s.headerSubRow}>
                  <View style={[s.onlineDot, pollOffline && s.onlineDotOffline]} />
                  <Text style={s.headerSub}>
                    {pollOffline ? t('sharedChat.reconnecting') : `${selectedStore?.city ? `${selectedStore.city} · ` : ''}${t('sharedChat.teamChat')}`}
                  </Text>
                </View>
              </View>
              <View style={s.msgCountBadge}>
                <Text style={s.msgCountText}>{messages.length}</Text>
              </View>
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* ── Store Switcher ── */}
        <Modal transparent animationType="slide" visible={switcherOpen} onRequestClose={() => setSwitcherOpen(false)}>
          <View style={s.switcherOverlay}>
            <View style={s.switcherSheet}>
              <View style={s.switcherHandle} />
              <View style={s.switcherHeaderRow}>
                <Text style={s.switcherTitle}>{t('sharedChat.switchStoreTitle')}</Text>
                <ModalCloseButton onPress={() => setSwitcherOpen(false)} label={t('sharedChat.closeSwitcherA11y')} color="#6c757d" />
              </View>
              <ScrollView style={s.switcherList} showsVerticalScrollIndicator={false}>
                {stores.map((store, i) => {
                  const active = store.id === selectedStoreId;
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[s.switcherRow, active && s.switcherRowActive]}
                      onPress={() => { setSelectedStoreId(store.id); setSwitcherOpen(false); }}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={active ? t('sharedChat.switchToStoreActiveA11y', { store: store.name }) : t('sharedChat.switchToStoreA11y', { store: store.name })}
                    >
                      <View style={[s.switcherDot, { backgroundColor: STORE_GRADIENT_PAIRS[i % STORE_GRADIENT_PAIRS.length][1] }]} />
                      <View style={{ flex: 1 }}>
                        <Text style={[s.switcherName, active && s.switcherNameActive]} numberOfLines={1}>{store.name}</Text>
                        {store.city ? <Text style={s.switcherCity}>{store.city}</Text> : null}
                      </View>
                      {!active && (unreadBy[store.id] ?? 0) > 0 && (
                        <View style={s.switcherBadge} accessibilityLabel={t('sharedChat.unreadInStoreA11y', { count: unreadBy[store.id] })}>
                          <Text style={s.switcherBadgeText}>{unreadBy[store.id] > 99 ? '99+' : unreadBy[store.id]}</Text>
                        </View>
                      )}
                      {active && <CheckCircleIcon size={20} color={COLORS.primary} strokeWidth={2} />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
          <ModalToastHost />
        </Modal>

        {/* ── Pinned Notice ── */}
        <NoticeStack notices={visibleNotices} onDismiss={dismissNotice} />

        {/* ── Messages ── */}
        {msgsLoading ? (
          <View style={s.centered}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={renderMessage}
            contentContainerStyle={s.messageList}
            ListEmptyComponent={
              // A failed load used to look like an empty conversation
              msgsError ? <ErrorState onRetry={() => refetchMsgs()} /> : (
                <View style={s.noMsgs}>
                  <MessageCircleIcon size={40} color="#d1d5db" strokeWidth={1.5} />
                  <Text style={s.noMsgsText}>{t('sharedChat.noMessagesYet')}</Text>
                </View>
              )
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Who it is for (2026-10-23): everyone, or one person privately ── */}
        <View style={s.toRow}>
          <TouchableOpacity style={[s.toChip, toUser && s.toChipPrivate]} onPress={() => setPickerOpen(true)} accessibilityRole="button"
            accessibilityLabel={toUser ? t('sharedChat.toPersonA11y', { name: toUser.name }) : t('sharedChat.toEveryoneA11y')}>
            <Text style={[s.toChipText, toUser && { color: '#92400e' }]}>{toUser ? `🔒 ${t('sharedChat.toPerson', { name: toUser.name })}` : `${t('sharedChat.toEveryone')}  ▾`}</Text>
          </TouchableOpacity>
          {toUser && (
            <TouchableOpacity onPress={() => setToUser(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} accessibilityRole="button" accessibilityLabel={t('sharedChat.toEveryoneA11y')}>
              <Text style={s.toClear}>✕</Text>
            </TouchableOpacity>
          )}
          {toUser && <Text style={s.toNote}>{t('sharedChat.privateNote')}</Text>}
        </View>

        {/* ── What is about to be sent (2026-10-24) ── */}
        {pending && (
          <View style={s.pendingRow}>
            {pending.kind === 'IMAGE' ? <Image source={{ uri: pending.uri }} style={s.pendingThumb} contentFit="cover" /> : <View style={[s.pendingThumb, s.pendingPdf]}><Text style={{ fontSize: 22 }}>📄</Text></View>}
            <View style={{ flex: 1 }}>
              <Text style={s.pendingName} numberOfLines={1}>{pending.name}</Text>
              <Text style={s.pendingSub}>{pending.kind === 'PDF' ? `PDF${pending.bytes ? ` · ${sizeText(pending.bytes)}` : ''}` : t('sharedChat.photoLabel')}</Text>
            </View>
            <TouchableOpacity onPress={() => setPending(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel={t('sharedChat.removeAttachment')}>
              <XIcon size={18} color="#6b7280" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Input ── */}
        <View style={s.inputBar}>
          <TouchableOpacity style={s.attachBtn} onPress={chooseAttachment} disabled={sending} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={t('sharedChat.attach')}>
            <PlusIcon size={22} color="#1D3557" strokeWidth={2.2} />
          </TouchableOpacity>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder={toUser ? t('sharedChat.inputPlaceholderPrivate', { name: toUser.name }) : t('sharedChat.inputPlaceholder')}
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={500}
              returnKeyType="default"
            />
          </View>
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
            <TouchableOpacity
              style={[s.sendBtn, ((!inputText.trim() && !pending) || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={(!inputText.trim() && !pending) || sending}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <ArrowUpIcon size={20} color="#fff" strokeWidth={2.5} />
              }
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>

      <Modal visible={attachOpen} transparent animationType="fade" onRequestClose={() => setAttachOpen(false)}>
        <View style={s.pickOverlay}>
          <View style={s.pickSheet}>
            <Text style={s.pickTitle}>{t('sharedChat.attach')}</Text>
            <TouchableOpacity style={s.pickRow} onPress={() => attachThen(() => takePhoto(true))} accessibilityRole="button"><Text style={s.pickName}>📷  {t('sharedChat.takePhoto')}</Text></TouchableOpacity>
            <TouchableOpacity style={s.pickRow} onPress={() => attachThen(() => takePhoto(false))} accessibilityRole="button"><Text style={s.pickName}>🖼️  {t('sharedChat.fromPhotos')}</Text></TouchableOpacity>
            <TouchableOpacity style={s.pickRow} onPress={() => attachThen(pickPdf)} accessibilityRole="button"><Text style={s.pickName}>📄  {t('sharedChat.pickPdf')}</Text></TouchableOpacity>
            <TouchableOpacity style={s.pickCancel} onPress={() => setAttachOpen(false)} accessibilityRole="button"><Text style={s.pickCancelText}>{t('sharedChat.cancel')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={!!viewing} transparent animationType="fade" onRequestClose={() => setViewing(null)}>
        <View style={s.viewer}>
          {viewing && <Image source={{ uri: viewing }} style={{ flex: 1 }} contentFit="contain" />}
          <TouchableOpacity style={s.viewerClose} onPress={() => setViewing(null)} accessibilityRole="button" accessibilityLabel={t('sharedChat.close')}>
            <XIcon size={22} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <View style={s.pickOverlay}>
          <View style={s.pickSheet}>
            <Text style={s.pickTitle}>{t('sharedChat.pickPerson')}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              <TouchableOpacity style={s.pickRow} onPress={() => { setToUser(null); setPickerOpen(false); }} accessibilityRole="button">
                <Text style={s.pickName}>{t('sharedChat.toEveryone')}</Text>
                {!toUser && <Text style={s.pickCheck}>✓</Text>}
              </TouchableOpacity>
              {people.map((p) => (
                <TouchableOpacity key={p.id} style={s.pickRow} onPress={() => { setToUser({ id: p.id, name: p.name }); setPickerOpen(false); }} accessibilityRole="button">
                  <Text style={s.pickName}>{p.name}</Text>
                  <Text style={s.pickRole}>{ROLE_LABELS[p.role] || p.role}</Text>
                  {toUser?.id === p.id && <Text style={s.pickCheck}>✓</Text>}
                </TouchableOpacity>
              ))}
              {peopleQ.isLoading && <ActivityIndicator style={{ margin: 16 }} color={COLORS.primary} />}
              {!peopleQ.isLoading && people.length === 0 && <Text style={s.pickEmpty}>{t('sharedChat.noPeople')}</Text>}
            </ScrollView>
            <TouchableOpacity style={s.pickCancel} onPress={() => setPickerOpen(false)} accessibilityRole="button"><Text style={s.pickCancelText}>{t('sharedChat.cancel')}</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardSafe>
  );
}

const BUBBLE_RADIUS = 18;
const BUBBLE_TAIL = 4;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f8fafc' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' },

  // Header
  headerGradient: {},
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12 },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.35)',
  },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800', flexShrink: 1 },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  onlineDotOffline: { backgroundColor: '#f59e0b' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  msgCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  msgCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Store switcher (bottom sheet)
  switcherOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  switcherSheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 10, paddingHorizontal: 20, paddingBottom: 24, maxHeight: '70%',
  },
  switcherHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: '#e5e7eb',
    alignSelf: 'center', marginBottom: 14,
  },
  switcherHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  switcherTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  switcherList: { paddingTop: 4 },
  switcherRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 8, borderRadius: 14,
  },
  switcherRowActive: { backgroundColor: '#f3f4f6' },
  switcherDot: { width: 10, height: 10, borderRadius: 5 },
  switcherName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  switcherBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  switcherBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  switcherNameActive: { color: COLORS.primary },
  switcherCity: { fontSize: 12, color: '#9ca3af', marginTop: 1 },

  // Messages
  messageList: { padding: 16, paddingBottom: 10 },
  noMsgs: { alignItems: 'center', paddingTop: 60, gap: 10 },
  noMsgsText: { color: '#9ca3af', fontSize: 14 },

  dateDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 16 },
  dateDividerLine: { flex: 1, height: 1, backgroundColor: '#e5e7eb' },
  dateDividerText: { fontSize: 11, fontWeight: '700', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },

  avatarSlot: { width: 30, alignItems: 'center' },
  avatar: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },

  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, paddingLeft: 2 },
  msgSender: { fontSize: 12, fontWeight: '700', color: '#374151' },
  privateTag: { fontSize: 11, fontWeight: '700', color: '#92400e', marginBottom: 2 },
  toRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 6, backgroundColor: '#fff', flexWrap: 'wrap' },
  toChip: { borderRadius: 14, borderWidth: 1, borderColor: '#d1d5db', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: '#f9fafb' },
  toChipPrivate: { borderColor: '#f59e0b', backgroundColor: '#fffbeb' },
  toChipText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  toClear: { fontSize: 15, color: '#6b7280', fontWeight: '700', paddingHorizontal: 4 },
  toNote: { fontSize: 11, color: '#92400e', flexShrink: 1 },
  pickOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  pickSheet: { backgroundColor: '#fff', borderRadius: 18, padding: 16 },
  pickTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 8 },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickName: { flex: 1, fontSize: 15, fontWeight: '600', color: '#111827' },
  pickRole: { fontSize: 12, color: '#6b7280' },
  pickCheck: { fontSize: 16, color: '#16a34a', fontWeight: '800' },
  pickEmpty: { padding: 16, color: '#6b7280', textAlign: 'center' },
  pickCancel: { marginTop: 8, paddingVertical: 12, alignItems: 'center' },
  pickCancelText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 5 },
  roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  bubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: BUBBLE_RADIUS,
  },
  bubbleMe: { backgroundColor: '#1D3557' },
  bubbleThem: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },

  // Tail shaping for grouped messages
  bubbleTopLeft:  { borderBottomLeftRadius: BUBBLE_TAIL },
  bubbleMidLeft:  { borderTopLeftRadius: BUBBLE_TAIL, borderBottomLeftRadius: BUBBLE_TAIL },
  bubbleBotLeft:  { borderTopLeftRadius: BUBBLE_TAIL },
  bubbleTopRight: { borderBottomRightRadius: BUBBLE_TAIL },
  bubbleMidRight: { borderTopRightRadius: BUBBLE_TAIL, borderBottomRightRadius: BUBBLE_TAIL },
  bubbleBotRight: { borderTopRightRadius: BUBBLE_TAIL },

  bubbleText: { fontSize: 14, color: '#111827', lineHeight: 20 },
  msgTime: { fontSize: 10, color: '#9ca3af', marginTop: 3 },

  // Input
  inputBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10, paddingBottom: 16,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb',
  },
  inputWrap: {
    flex: 1, backgroundColor: '#f3f4f6',
    borderRadius: 22, borderWidth: 1.5, borderColor: '#e5e7eb',
    paddingHorizontal: 16, paddingVertical: 0,
    minHeight: 44, justifyContent: 'center',
  },
  input: {
    fontSize: 15, color: '#111827',
    maxHeight: 120, paddingVertical: 10,
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#1D3557',
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#d1d5db' },
  attachBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#eef2f7', alignItems: 'center', justifyContent: 'center' },
  photo: { width: 220, height: 165, borderRadius: 12, backgroundColor: '#e5e7eb' },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 6 },
  uploadText: { color: '#fff', fontSize: 12, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.5)', textShadowRadius: 3 },
  pdfCard: { flexDirection: 'row', alignItems: 'center', gap: 10, width: 230, paddingVertical: 2 },
  pdfThumb: { width: 46, height: 58, borderRadius: 6, backgroundColor: '#e5e7eb' },
  pdfName: { fontSize: 14, fontWeight: '700', color: '#111827' },
  pdfSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: '#f9fafb', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  pendingThumb: { width: 44, height: 44, borderRadius: 8, backgroundColor: '#e5e7eb' },
  pendingPdf: { alignItems: 'center', justifyContent: 'center' },
  pendingName: { fontSize: 13, fontWeight: '700', color: '#111827' },
  pendingSub: { fontSize: 11, color: '#6b7280', marginTop: 1 },
  viewer: { flex: 1, backgroundColor: '#000' },
  viewerClose: { position: 'absolute', top: 54, right: 18, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },

});
