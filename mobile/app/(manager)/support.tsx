import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, StatusBar, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { supportApi } from '../../services/api';
import { useAuthStore, isAdmin } from '../../store/authStore';
import { COLORS } from '../../constants';
import { HeadphonesIcon, PlusIcon, XIcon, SendIcon, ChevronDownIcon } from '../../components/Icons';
import FadeSlideIn from '../../components/FadeSlideIn';
import ErrorState from '../../components/ErrorState';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string;
  body: string;
  senderRole: string;
  senderName: string;
  createdAt: string;
  isFromSupport: boolean;
}

interface Thread {
  id: string;
  subject: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
  category?: string;
  createdAt: string;
  lastMessageAt?: string;
  messages?: Message[];
  unreadCount?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; bg: string; color: string }> = {
  OPEN:        { label: 'Open',        bg: '#DBEAFE', color: '#1D4ED8' },
  IN_PROGRESS: { label: 'In Progress', bg: '#FEF3C7', color: '#D97706' },
  RESOLVED:    { label: 'Resolved',    bg: '#D1FAE5', color: '#059669' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  LOW:    { label: 'Low',    color: '#6B7280' },
  NORMAL: { label: 'Normal', color: '#3B82F6' },
  HIGH:   { label: 'High',   color: '#F59E0B' },
  URGENT: { label: 'Urgent', color: '#EF4444' },
};

const CATEGORIES = ['General', 'Billing', 'Technical', 'Feature Request', 'Bug Report', 'Other'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── New Thread Modal ─────────────────────────────────────────────────────────

function NewThreadModal({ visible, onClose, onCreated }: {
  visible: boolean; onClose: () => void; onCreated: () => void;
}) {
  const [subject,  setSubject]  = useState('');
  const [message,  setMessage]  = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const [category, setCategory] = useState('General');
  const [showPri,  setShowPri]  = useState(false);
  const [showCat,  setShowCat]  = useState(false);

  const createMutation = useMutation({
    mutationFn: () => supportApi.createThread(subject.trim(), message.trim(), priority, category),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Ticket submitted', text2: 'Support will respond shortly.' });
      setSubject(''); setMessage(''); setPriority('NORMAL'); setCategory('General');
      onCreated();
    },
    onError: (e: any) => Toast.show({ type: 'error', text1: e?.response?.data?.error || 'Failed to submit' }),
  });

  const canSubmit = subject.trim().length > 0 && message.trim().length > 0;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        <View style={s.modalHeader}>
          <Text style={s.modalTitle}>New Support Ticket</Text>
          <TouchableOpacity
            onPress={onClose}
            style={s.modalClose}
            accessibilityRole="button"
            accessibilityLabel="Close new ticket form"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <XIcon size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <ScrollView style={{ padding: 16 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">

            <View>
              <Text style={s.fieldLabel}>Subject</Text>
              <TextInput
                style={s.input}
                value={subject}
                onChangeText={setSubject}
                placeholder="Brief summary of the issue"
                placeholderTextColor={COLORS.textMuted}
                maxLength={120}
                autoCapitalize="sentences"
              />
            </View>

            {/* Priority + Category row */}
            <View style={s.rowGap}>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Priority</Text>
                <TouchableOpacity
                  style={s.picker}
                  onPress={() => { setShowPri(true); setShowCat(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select priority, currently ${PRIORITY_CFG[priority]?.label}`}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={[s.pickerText, { color: PRIORITY_CFG[priority]?.color }]}>
                    {PRIORITY_CFG[priority]?.label}
                  </Text>
                  <ChevronDownIcon size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
                {showPri && (
                  <View style={s.dropdown}>
                    {PRIORITIES.map(p => (
                      <TouchableOpacity key={p} style={[s.dropItem, p === priority && s.dropItemActive]}
                        onPress={() => { setPriority(p); setShowPri(false); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Set priority to ${PRIORITY_CFG[p]?.label}`}
                        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                      >
                        <Text style={[s.dropItemText, { color: PRIORITY_CFG[p]?.color }, p === priority && { fontWeight: '700' }]}>
                          {PRIORITY_CFG[p]?.label}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.fieldLabel}>Category</Text>
                <TouchableOpacity
                  style={s.picker}
                  onPress={() => { setShowCat(true); setShowPri(false); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Select category, currently ${category}`}
                  hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                >
                  <Text style={s.pickerText}>{category}</Text>
                  <ChevronDownIcon size={14} color={COLORS.textMuted} />
                </TouchableOpacity>
                {showCat && (
                  <View style={s.dropdown}>
                    {CATEGORIES.map(c => (
                      <TouchableOpacity key={c} style={[s.dropItem, c === category && s.dropItemActive]}
                        onPress={() => { setCategory(c); setShowCat(false); }}
                        accessibilityRole="button"
                        accessibilityLabel={`Set category to ${c}`}
                        hitSlop={{ top: 6, bottom: 6, left: 0, right: 0 }}
                      >
                        <Text style={[s.dropItemText, c === category && { fontWeight: '700', color: COLORS.managerPrimary }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View>
              <Text style={s.fieldLabel}>Message</Text>
              <TextInput
                style={[s.input, s.textArea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Describe the issue in detail…"
                placeholderTextColor={COLORS.textMuted}
                maxLength={2000}
                multiline
                numberOfLines={6}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[s.submitBtn, (!canSubmit || createMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => createMutation.mutate()}
              disabled={!canSubmit || createMutation.isPending}
              accessibilityRole="button"
              accessibilityLabel="Submit support ticket"
            >
              {createMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={s.submitBtnText}>Submit Ticket</Text>
              }
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ─── Thread Detail Modal ──────────────────────────────────────────────────────

function ThreadModal({ thread, onClose }: { thread: Thread; onClose: () => void }) {
  const [reply,  setReply]  = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const qc = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['support-thread', thread.id],
    queryFn: () => supportApi.getThread(thread.id),
    refetchInterval: 15000,
  });

  const messages: Message[] = data?.data?.data?.messages || [];

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
  }, [messages.length]);

  const sendMutation = useMutation({
    mutationFn: () => supportApi.sendMessage(thread.id, reply.trim()),
    onSuccess: () => {
      setReply('');
      qc.invalidateQueries({ queryKey: ['support-thread', thread.id] });
      qc.invalidateQueries({ queryKey: ['support-threads'] });
    },
    onError: () => Toast.show({ type: 'error', text1: 'Failed to send message' }),
  });

  const sc = STATUS_CFG[thread.status] || STATUS_CFG.OPEN;

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
        {/* Header */}
        <View style={s.threadHeader}>
          <TouchableOpacity
            onPress={onClose}
            style={{ padding: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Close ticket"
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <XIcon size={20} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 8 }}>
            <Text style={s.threadHeaderTitle} numberOfLines={1}>{thread.subject}</Text>
            <View style={s.threadHeaderMeta}>
              <View style={[s.statusBadge, { backgroundColor: sc.bg + '33' }]}>
                <Text style={[s.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
              </View>
              <Text style={s.threadHeaderSub}>{thread.category}</Text>
            </View>
          </View>
        </View>

        {/* Messages */}
        {isLoading ? (
          <View style={s.center}><ActivityIndicator color={COLORS.managerPrimary} size="large" /></View>
        ) : isError ? (
          <ErrorState message="Failed to load this ticket." onRetry={() => refetch()} />
        ) : (
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 10 }}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={false} onRefresh={refetch} tintColor={COLORS.managerPrimary} />}
          >
            {messages.map(msg => {
              const isSupport = msg.isFromSupport;
              return (
                <View key={msg.id} style={[s.bubble, isSupport ? s.bubbleSupport : s.bubbleUser]}>
                  <Text style={[s.bubbleName, isSupport && { color: COLORS.managerPrimary }]}>
                    {isSupport ? '🎧 Support' : msg.senderName}
                  </Text>
                  <Text style={s.bubbleBody}>{msg.body}</Text>
                  <Text style={s.bubbleTime}>{timeAgo(msg.createdAt)}</Text>
                </View>
              );
            })}
            {thread.status === 'RESOLVED' && (
              <View style={s.resolvedBanner}>
                <Text style={s.resolvedBannerText}>✓ This ticket has been resolved</Text>
              </View>
            )}
            <View style={{ height: 8 }} />
          </ScrollView>
        )}

        {/* Reply bar */}
        {thread.status !== 'RESOLVED' && (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.replyBar}>
              <TextInput
                style={s.replyInput}
                value={reply}
                onChangeText={setReply}
                placeholder="Reply…"
                placeholderTextColor={COLORS.textMuted}
                maxLength={2000}
                multiline
              />
              <TouchableOpacity
                style={[s.sendBtn, (!reply.trim() || sendMutation.isPending) && { opacity: 0.4 }]}
                onPress={() => sendMutation.mutate()}
                disabled={!reply.trim() || sendMutation.isPending}
                accessibilityRole="button"
                accessibilityLabel="Send reply"
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {sendMutation.isPending
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <SendIcon size={18} color="#fff" strokeWidth={2} />
                }
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function SupportScreen() {
  const { user } = useAuthStore();
  const [showNew,    setShowNew]    = useState(false);
  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const qc = useQueryClient();

  if (!isAdmin(user?.role)) {
    return (
      <SafeAreaView style={s.container} edges={['top']}>
        <View style={s.center}>
          <HeadphonesIcon size={52} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>Access Restricted</Text>
          <Text style={s.emptyText}>Support is available to Admin roles only.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['support-threads'],
    queryFn: () => supportApi.getMyThreads(),
    refetchInterval: 30000,
  });

  const threads: Thread[] = data?.data?.data || [];

  const openThreads     = threads.filter(t => t.status !== 'RESOLVED');
  const resolvedThreads = threads.filter(t => t.status === 'RESOLVED');

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.managerPrimary} />

      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <HeadphonesIcon size={20} color="#fff" strokeWidth={2} />
          <Text style={s.headerTitle}>Support</Text>
        </View>
        <TouchableOpacity
          style={s.newBtn}
          onPress={() => setShowNew(true)}
          accessibilityRole="button"
          accessibilityLabel="Create new support ticket"
          hitSlop={{ top: 7, bottom: 7, left: 7, right: 7 }}
        >
          <PlusIcon size={16} color="#fff" strokeWidth={2.5} />
          <Text style={s.newBtnText}>New Ticket</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.managerPrimary} size="large" /></View>
      ) : isError ? (
        <ErrorState message="Failed to load support tickets." onRetry={() => refetch()} />
      ) : threads.length === 0 ? (
        <View style={s.center}>
          <HeadphonesIcon size={52} color={COLORS.border} strokeWidth={1.25} />
          <Text style={s.emptyTitle}>No support tickets</Text>
          <Text style={s.emptyText}>Tap "New Ticket" to reach the Lucky Stop support team.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 8 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={COLORS.managerPrimary} />}
        >
          {openThreads.length > 0 && (
            <>
              <Text style={s.sectionLabel}>Open</Text>
              {openThreads.map((thread, index) => (
                <FadeSlideIn key={thread.id} delay={Math.min(index * 40, 200)}>
                  <ThreadCard thread={thread} onPress={() => setActiveThread(thread)} />
                </FadeSlideIn>
              ))}
            </>
          )}
          {resolvedThreads.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { marginTop: 8 }]}>Resolved</Text>
              {resolvedThreads.map((thread, index) => (
                <FadeSlideIn key={thread.id} delay={Math.min(index * 40, 200)}>
                  <ThreadCard thread={thread} onPress={() => setActiveThread(thread)} />
                </FadeSlideIn>
              ))}
            </>
          )}
          <View style={{ height: 16 }} />
        </ScrollView>
      )}

      <NewThreadModal
        visible={showNew}
        onClose={() => setShowNew(false)}
        onCreated={() => { setShowNew(false); qc.invalidateQueries({ queryKey: ['support-threads'] }); }}
      />

      {activeThread && (
        <ThreadModal
          thread={activeThread}
          onClose={() => setActiveThread(null)}
        />
      )}
    </SafeAreaView>
  );
}

// ─── Thread Card ──────────────────────────────────────────────────────────────

function ThreadCard({ thread, onPress }: { thread: Thread; onPress: () => void }) {
  const sc = STATUS_CFG[thread.status] || STATUS_CFG.OPEN;
  const pc = PRIORITY_CFG[thread.priority] || PRIORITY_CFG.NORMAL;

  return (
    <TouchableOpacity
      style={s.card}
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Open ticket: ${thread.subject}, ${sc.label}`}
    >
      <View style={s.cardTop}>
        <Text style={s.cardSubject} numberOfLines={1}>{thread.subject}</Text>
        {(thread.unreadCount ?? 0) > 0 && (
          <View style={s.unreadDot}>
            <Text style={s.unreadDotText}>{thread.unreadCount}</Text>
          </View>
        )}
      </View>
      <View style={s.cardMeta}>
        <View style={[s.statusBadge, { backgroundColor: sc.bg }]}>
          <Text style={[s.statusBadgeText, { color: sc.color }]}>{sc.label}</Text>
        </View>
        <Text style={[s.priorityLabel, { color: pc.color }]}>{pc.label}</Text>
        {thread.category && <Text style={s.cardCategory}>{thread.category}</Text>}
        <Text style={s.cardTime}>{timeAgo(thread.lastMessageAt || thread.createdAt)}</Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },

  header: {
    backgroundColor: COLORS.managerPrimary,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  headerTitle: { fontSize: 18, fontWeight: '700', color: '#fff' },
  newBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  newBtnText: { fontSize: 13, color: '#fff', fontWeight: '600' },

  sectionLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.6 },

  // Thread card
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border,
    gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  cardTop:     { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardSubject: { flex: 1, fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardMeta:    { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  cardCategory: { fontSize: 12, color: COLORS.textMuted },
  cardTime:     { fontSize: 12, color: COLORS.textMuted, marginLeft: 'auto' },

  statusBadge:    { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusBadgeText:{ fontSize: 11, fontWeight: '700' },
  priorityLabel:  { fontSize: 12, fontWeight: '700' },

  unreadDot: {
    minWidth: 20, height: 20, borderRadius: 10, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5,
  },
  unreadDotText: { fontSize: 11, fontWeight: '800', color: '#fff' },

  // New thread modal
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    backgroundColor: '#fff',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text },
  modalClose: { padding: 4 },

  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.text,
  },
  textArea: { minHeight: 120, textAlignVertical: 'top', paddingTop: 12 },
  rowGap: { flexDirection: 'row', gap: 12 },

  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12,
  },
  pickerText: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 99,
    backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 8, elevation: 8,
    overflow: 'hidden', marginTop: 2,
  },
  dropItem:       { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F0F0F0' },
  dropItemActive: { backgroundColor: '#EEF2FF' },
  dropItemText:   { fontSize: 14, color: COLORS.text },

  submitBtn:     { backgroundColor: COLORS.managerPrimary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Thread detail
  threadHeader: {
    backgroundColor: COLORS.managerPrimary,
    paddingHorizontal: 12, paddingTop: 8, paddingBottom: 14,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  threadHeaderTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  threadHeaderMeta:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  threadHeaderSub:   { fontSize: 12, color: 'rgba(255,255,255,0.65)' },

  // Bubbles
  bubble: {
    maxWidth: '82%', borderRadius: 14, padding: 12, gap: 4,
  },
  bubbleUser: {
    alignSelf: 'flex-end', backgroundColor: COLORS.managerPrimary,
    borderBottomRightRadius: 4,
  },
  bubbleSupport: {
    alignSelf: 'flex-start', backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1, borderColor: COLORS.border,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  bubbleName: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.75)' },
  bubbleBody: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  bubbleTime: { fontSize: 10, color: COLORS.textMuted, alignSelf: 'flex-end' },

  resolvedBanner: {
    alignSelf: 'center', backgroundColor: '#D1FAE5',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 8,
  },
  resolvedBannerText: { fontSize: 13, fontWeight: '600', color: '#059669' },

  // Reply bar
  replyBar: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  replyInput: {
    flex: 1, backgroundColor: COLORS.background,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 10,
    fontSize: 14, color: COLORS.text, maxHeight: 120,
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: COLORS.managerPrimary,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: COLORS.managerPrimary, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },

  emptyTitle: { fontSize: 16, fontWeight: '600', color: COLORS.text, textAlign: 'center' },
  emptyText:  { fontSize: 14, color: COLORS.textMuted, textAlign: 'center', lineHeight: 20 },
});
