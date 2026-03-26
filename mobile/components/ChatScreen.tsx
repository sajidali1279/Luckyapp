import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

const ROLE_COLORS: Record<string, string> = {
  DEV_ADMIN:     '#2DC653',
  SUPER_ADMIN:   '#1D3557',
  STORE_MANAGER: '#0369a1',
  EMPLOYEE:      '#f59e0b',
};

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN:     'Dev',
  SUPER_ADMIN:   'HQ',
  STORE_MANAGER: 'Manager',
  EMPLOYEE:      'Staff',
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
  createdAt: string;
}

interface Store {
  id: string;
  name: string;
  city?: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
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
  const { user } = useAuthStore();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sendScale = useRef(new Animated.Value(1)).current;

  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });

  useEffect(() => {
    const s: Store[] = storesData?.data?.data || [];
    setStores(s);
    if (s.length > 0 && !selectedStoreId) setSelectedStoreId(s[0].id);
  }, [storesData]);

  const { data: initialData, isLoading: msgsLoading } = useQuery({
    queryKey: ['chat-messages-init', selectedStoreId],
    queryFn: () => chatApi.getMessages(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  useEffect(() => {
    if (initialData?.data?.data) {
      const msgs: Message[] = initialData.data.data;
      setMessages(msgs);
      setLastTimestamp(msgs[msgs.length - 1]?.createdAt ?? null);
    }
  }, [initialData]);

  useEffect(() => { setMessages([]); setLastTimestamp(null); }, [selectedStoreId]);

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
        setMessages((prev) => [...prev, ...newMsgs]);
        setLastTimestamp(newMsgs[newMsgs.length - 1]!.createdAt);
      }
    } catch {}
  }, [selectedStoreId, lastTimestamp]);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(poll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [poll]);

  async function handleSend() {
    const text = inputText.trim();
    if (!text || !selectedStoreId || sending) return;

    Animated.sequence([
      Animated.timing(sendScale, { toValue: 0.88, duration: 80, useNativeDriver: true }),
      Animated.timing(sendScale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();

    setSending(true);
    setInputText('');
    try {
      const res = await chatApi.sendMessage(selectedStoreId, text);
      const newMsg: Message = res.data.data;
      setMessages((prev) => [...prev, newMsg]);
      setLastTimestamp(newMsg.createdAt);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {}
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
            <Text style={s.dateDividerText}>{formatDateLabel(item.createdAt)}</Text>
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
            {!isMe && isFirstInGroup && (
              <View style={s.msgMeta}>
                <Text style={s.msgSender}>{item.userName}</Text>
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
              <Text style={[s.bubbleText, isMe && { color: '#fff' }]}>{item.text}</Text>
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
    return (
      <View style={s.centered}>
        <Text style={s.emptyEmoji}>💬</Text>
        <Text style={s.emptyTitle}>No store chats yet</Text>
        <Text style={s.emptySub}>You'll see your store team chats once you're assigned to a store.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={s.root}>
        {/* ── Header ── */}
        <View style={[s.headerGradient, { backgroundColor: gradientPair[0] }]}>
          <SafeAreaView edges={['top']}>
            <View style={s.headerRow}>
              <View style={s.headerAvatar}>
                <Text style={s.headerAvatarText}>{selectedStore?.name?.[0]?.toUpperCase() ?? '?'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.headerTitle}>{selectedStore?.name || 'Chat'}</Text>
                <View style={s.headerSubRow}>
                  <View style={s.onlineDot} />
                  <Text style={s.headerSub}>
                    {selectedStore?.city ? `${selectedStore.city} · ` : ''}Team Chat
                  </Text>
                </View>
              </View>
              <View style={s.msgCountBadge}>
                <Text style={s.msgCountText}>{messages.length}</Text>
              </View>
            </View>

            {/* Store picker */}
            {stores.length > 1 && (
              <View style={s.storePicker}>
                {stores.map((store, i) => {
                  const active = store.id === selectedStoreId;
                  return (
                    <TouchableOpacity
                      key={store.id}
                      style={[s.storeTab, active && s.storeTabActive]}
                      onPress={() => setSelectedStoreId(store.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[s.storeTabDot, { backgroundColor: STORE_GRADIENT_PAIRS[i % STORE_GRADIENT_PAIRS.length][1] }]} />
                      <Text style={[s.storeTabText, active && s.storeTabTextActive]} numberOfLines={1}>
                        {store.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </SafeAreaView>
        </View>

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
              <View style={s.noMsgs}>
                <Text style={s.noMsgsEmoji}>👋</Text>
                <Text style={s.noMsgsText}>No messages yet — say hello!</Text>
              </View>
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* ── Input ── */}
        <View style={s.inputBar}>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message…"
              placeholderTextColor="#9ca3af"
              multiline
              maxLength={500}
              returnKeyType="default"
            />
          </View>
          <Animated.View style={{ transform: [{ scale: sendScale }] }}>
            <TouchableOpacity
              style={[s.sendBtn, (!inputText.trim() || sending) && s.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!inputText.trim() || sending}
              activeOpacity={0.8}
            >
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.sendBtnIcon}>↑</Text>
              }
            </TouchableOpacity>
          </Animated.View>
        </View>
      </View>
    </KeyboardAvoidingView>
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
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  headerSubRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#4ade80' },
  headerSub: { color: 'rgba(255,255,255,0.7)', fontSize: 12 },
  msgCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  msgCountText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  storePicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  storeTab: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
    maxWidth: 140,
  },
  storeTabActive: { backgroundColor: 'rgba(255,255,255,0.28)', borderColor: 'rgba(255,255,255,0.5)' },
  storeTabDot: { width: 7, height: 7, borderRadius: 4 },
  storeTabText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  storeTabTextActive: { color: '#fff' },

  // Messages
  messageList: { padding: 16, paddingBottom: 10 },
  noMsgs: { alignItems: 'center', paddingTop: 60 },
  noMsgsEmoji: { fontSize: 40, marginBottom: 10 },
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
  sendBtnIcon: { color: '#fff', fontSize: 20, fontWeight: '800' },

  emptyEmoji: { fontSize: 52, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  emptySub: { fontSize: 13, color: '#9ca3af', marginTop: 6, textAlign: 'center', paddingHorizontal: 40 },
});
