import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

const ROLE_COLORS: Record<string, string> = {
  DEV_ADMIN: '#2DC653',
  SUPER_ADMIN: '#1D3557',
  STORE_MANAGER: '#0369a1',
  EMPLOYEE: '#6c757d',
};

const ROLE_LABELS: Record<string, string> = {
  DEV_ADMIN: 'Dev',
  SUPER_ADMIN: 'HQ',
  STORE_MANAGER: 'Manager',
  EMPLOYEE: 'Staff',
};

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
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (
    d.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
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

  // Load stores
  const { data: storesData, isLoading: storesLoading } = useQuery({
    queryKey: ['chat-my-stores'],
    queryFn: () => chatApi.getMyStores(),
  });

  useEffect(() => {
    const s: Store[] = storesData?.data?.data || [];
    setStores(s);
    if (s.length > 0 && !selectedStoreId) {
      setSelectedStoreId(s[0].id);
    }
  }, [storesData]);

  // Initial load for selected store
  const { data: initialData, isLoading: msgsLoading } = useQuery({
    queryKey: ['chat-messages-init', selectedStoreId],
    queryFn: () => chatApi.getMessages(selectedStoreId!),
    enabled: !!selectedStoreId,
  });

  useEffect(() => {
    if (initialData?.data?.data) {
      const msgs: Message[] = initialData.data.data;
      setMessages(msgs);
      setLastTimestamp(msgs.at(-1)?.createdAt ?? null);
    }
  }, [initialData]);

  // Reset when switching stores
  useEffect(() => {
    setMessages([]);
    setLastTimestamp(null);
  }, [selectedStoreId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  // Polling for new messages
  const poll = useCallback(async () => {
    if (!selectedStoreId || !lastTimestamp) return;
    try {
      const res = await chatApi.getMessages(selectedStoreId, lastTimestamp);
      const newMsgs: Message[] = res.data?.data || [];
      if (newMsgs.length > 0) {
        setMessages((prev) => [...prev, ...newMsgs]);
        setLastTimestamp(newMsgs.at(-1)!.createdAt);
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

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.userId === user?.id;
    const roleColor = ROLE_COLORS[item.userRole] || '#6c757d';
    return (
      <View style={[s.msgRow, isMe ? s.msgRowMe : s.msgRowThem]}>
        {!isMe && (
          <View style={[s.avatar, { backgroundColor: roleColor }]}>
            <Text style={s.avatarText}>{(item.userName || '?')[0].toUpperCase()}</Text>
          </View>
        )}
        <View style={{ maxWidth: '72%' }}>
          {!isMe && (
            <View style={s.msgMeta}>
              <Text style={s.msgSender}>{item.userName}</Text>
              <View style={[s.roleBadge, { backgroundColor: roleColor }]}>
                <Text style={s.roleBadgeText}>{ROLE_LABELS[item.userRole] || item.userRole}</Text>
              </View>
            </View>
          )}
          <View style={[s.bubble, isMe ? s.bubbleMe : s.bubbleThem]}>
            <Text style={[s.bubbleText, isMe && { color: '#fff' }]}>{item.text}</Text>
          </View>
          <Text style={[s.msgTime, { textAlign: isMe ? 'right' : 'left' }]}>
            {formatTime(item.createdAt)}
          </Text>
        </View>
        {isMe && (
          <View style={[s.avatar, { backgroundColor: roleColor }]}>
            <Text style={s.avatarText}>{(item.userName || '?')[0].toUpperCase()}</Text>
          </View>
        )}
      </View>
    );
  };

  if (storesLoading) {
    return (
      <View style={s.centered}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }

  if (stores.length === 0) {
    return (
      <View style={s.centered}>
        <Text style={s.emptyEmoji}>💬</Text>
        <Text style={s.emptyTitle}>No store chats available</Text>
        <Text style={s.emptySub}>You haven't been assigned to any store yet.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <View style={s.root}>
        {/* Header */}
        <SafeAreaView style={s.headerBg} edges={['top']}>
          <View style={s.header}>
            <Text style={s.headerTitle}>⛽ {selectedStore?.name || 'Chat'}</Text>
            <Text style={s.headerSub}>Store Team · {messages.length} messages</Text>
          </View>

          {/* Store picker (only when multiple stores) */}
          {stores.length > 1 && (
            <View style={s.storePicker}>
              {stores.map((store) => (
                <TouchableOpacity
                  key={store.id}
                  style={[s.storeChip, store.id === selectedStoreId && s.storeChipActive]}
                  onPress={() => setSelectedStoreId(store.id)}
                >
                  <Text style={[s.storeChipText, store.id === selectedStoreId && s.storeChipTextActive]}>
                    {store.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SafeAreaView>

        {/* Messages */}
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
                <Text style={s.noMsgsText}>No messages yet — say hello! 👋</Text>
              </View>
            }
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
          />
        )}

        {/* Input */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Type a message…"
            placeholderTextColor={COLORS.textMuted}
            multiline
            maxLength={500}
            returnKeyType="default"
          />
          <TouchableOpacity
            style={[s.sendBtn, (!inputText.trim() || sending) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.sendBtnText}>➤</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  headerBg: { backgroundColor: COLORS.secondary },
  header: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  headerSub: { color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 },

  storePicker: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 16, paddingBottom: 12,
  },
  storeChip: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  storeChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  storeChipText: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  storeChipTextActive: { color: '#fff' },

  messageList: { padding: 16, paddingBottom: 8, gap: 12 },
  noMsgs: { alignItems: 'center', paddingTop: 40 },
  noMsgsText: { color: COLORS.textMuted, fontSize: 14 },

  msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowThem: { justifyContent: 'flex-start' },

  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },

  msgMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  msgSender: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  roleBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  roleBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },

  bubble: { borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: COLORS.secondary, borderBottomRightRadius: 4 },
  bubbleThem: {
    backgroundColor: COLORS.white, borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: COLORS.border,
  },
  bubbleText: { fontSize: 14, color: COLORS.text, lineHeight: 20 },

  msgTime: { fontSize: 11, color: COLORS.textMuted, marginTop: 3 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    padding: 12, paddingBottom: 16,
    backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  input: {
    flex: 1, minHeight: 42, maxHeight: 120,
    backgroundColor: COLORS.background, borderRadius: 21,
    paddingHorizontal: 16, paddingVertical: 10,
    fontSize: 15, color: COLORS.text,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: COLORS.textMuted },
  sendBtnText: { color: '#fff', fontSize: 18 },

  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  emptySub: { fontSize: 13, color: COLORS.textMuted, marginTop: 6, textAlign: 'center' },
});
