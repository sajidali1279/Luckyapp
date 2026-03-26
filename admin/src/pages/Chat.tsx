import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

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

function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Message {
  id: string;
  storeId: string;
  userId: string;
  userName: string;
  userRole: string;
  text: string;
  createdAt: string;
}

export default function Chat() {
  const { user } = useAuthStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isStoreManager = user?.role === 'STORE_MANAGER';

  const { data: storesData } = useQuery({
    queryKey: ['chat-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string; city: string }[] = storesData?.data?.data || [];

  // Auto-select first store
  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) {
      setSelectedStoreId(stores[0].id);
    }
  }, [stores, selectedStoreId]);

  // Initial load when store changes
  const { data: initialData } = useQuery({
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

  // Reset on store switch
  useEffect(() => {
    setMessages([]);
    setLastTimestamp(null);
  }, [selectedStoreId]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Polling
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !selectedStoreId || sending) return;
    setSending(true);
    setInputText('');
    try {
      const res = await chatApi.sendMessage(selectedStoreId, text);
      const newMsg: Message = res.data.data;
      setMessages((prev) => [...prev, newMsg]);
      setLastTimestamp(newMsg.createdAt);
    } catch {}
    setSending(false);
  }

  const selectedStore = stores.find((s) => s.id === selectedStoreId);

  return (
    <div style={s.container}>
      {/* ── Sidebar ── */}
      {!isStoreManager && (
        <div style={s.sidebar}>
          <div style={s.sidebarHeader}>
            <span style={s.sidebarTitle}>💬 Store Chats</span>
          </div>
          <div style={s.storeList}>
            {stores.map((store) => (
              <button
                key={store.id}
                style={{ ...s.storeBtn, ...(store.id === selectedStoreId ? s.storeBtnActive : {}) }}
                onClick={() => setSelectedStoreId(store.id)}
              >
                <span style={s.storeIcon}>⛽</span>
                <div style={s.storeBtnText}>
                  <div style={s.storeBtnName}>{store.name}</div>
                  {store.city && <div style={s.storeBtnCity}>{store.city}</div>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Chat Panel ── */}
      <div style={s.chatPanel}>
        {!selectedStoreId ? (
          <div style={s.emptyState}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>💬</div>
            <div style={{ fontWeight: 700, fontSize: 18, color: '#1D3557' }}>Select a store to open chat</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={s.chatHeader}>
              <div style={s.chatHeaderIcon}>⛽</div>
              <div>
                <div style={s.chatHeaderName}>{selectedStore?.name}</div>
                <div style={s.chatHeaderSub}>
                  {selectedStore?.city ? `${selectedStore.city} · ` : ''}Store Team Chat
                </div>
              </div>
            </div>

            {/* Messages */}
            <div style={s.messageList}>
              {messages.length === 0 && (
                <div style={s.noMessages}>No messages yet — say hello! 👋</div>
              )}
              {messages.map((msg) => {
                const isMe = msg.userId === user?.id;
                return (
                  <div key={msg.id} style={{ ...s.msgRow, justifyContent: isMe ? 'flex-end' : 'flex-start' }}>
                    {!isMe && (
                      <div style={{ ...s.avatar, background: ROLE_COLORS[msg.userRole] || '#6c757d' }}>
                        {(msg.userName || '?')[0].toUpperCase()}
                      </div>
                    )}
                    <div style={{ maxWidth: '68%' }}>
                      {!isMe && (
                        <div style={s.msgMeta}>
                          <span style={s.msgSenderName}>{msg.userName}</span>
                          <span style={{ ...s.msgRoleBadge, background: ROLE_COLORS[msg.userRole] || '#6c757d' }}>
                            {ROLE_LABELS[msg.userRole] || msg.userRole}
                          </span>
                        </div>
                      )}
                      <div style={{ ...s.msgBubble, ...(isMe ? s.msgBubbleMe : s.msgBubbleThem) }}>
                        {msg.text}
                      </div>
                      <div style={{ ...s.msgTime, textAlign: isMe ? 'right' : 'left' }}>
                        {formatTime(msg.createdAt)}
                      </div>
                    </div>
                    {isMe && (
                      <div style={{ ...s.avatar, background: ROLE_COLORS[msg.userRole] || '#6c757d' }}>
                        {(msg.userName || '?')[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <form style={s.inputRow} onSubmit={handleSend}>
              <input
                style={s.input}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
                autoComplete="off"
              />
              <button style={s.sendBtn} type="submit" disabled={sending || !inputText.trim()}>
                {sending ? '…' : '➤'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: 'calc(100vh - 64px)', background: '#f8f9fa', overflow: 'hidden' },

  sidebar: {
    width: 260, background: '#fff', borderRight: '1px solid #dee2e6',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
  },
  sidebarHeader: {
    padding: '18px 16px 14px', borderBottom: '1px solid #dee2e6',
  },
  sidebarTitle: { fontWeight: 800, fontSize: 15, color: '#1D3557' },
  storeList: { flex: 1, overflowY: 'auto', padding: '8px 0' },
  storeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '10px 14px', background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left', borderRadius: 0,
  },
  storeBtnActive: { background: '#f0f4ff' },
  storeIcon: { fontSize: 18, flexShrink: 0 },
  storeBtnText: { flex: 1, minWidth: 0 },
  storeBtnName: { fontWeight: 600, fontSize: 13, color: '#212529', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeBtnCity: { fontSize: 11, color: '#6c757d', marginTop: 1 },

  chatPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#6c757d' },

  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 20px', background: '#fff', borderBottom: '1px solid #dee2e6',
    flexShrink: 0,
  },
  chatHeaderIcon: { fontSize: 28, width: 44, height: 44, background: '#1D3557', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  chatHeaderName: { fontWeight: 800, fontSize: 16, color: '#1D3557' },
  chatHeaderSub: { fontSize: 12, color: '#6c757d', marginTop: 2 },

  messageList: { flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 },
  noMessages: { textAlign: 'center', color: '#6c757d', padding: '40px 0', fontSize: 14 },

  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 8 },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0,
  },
  msgMeta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 },
  msgSenderName: { fontSize: 12, fontWeight: 600, color: '#495057' },
  msgRoleBadge: {
    color: '#fff', borderRadius: 4, padding: '1px 6px',
    fontSize: 10, fontWeight: 700,
  },
  msgBubble: {
    padding: '10px 14px', borderRadius: 16, fontSize: 14, lineHeight: 1.5,
    wordBreak: 'break-word',
  },
  msgBubbleMe: { background: '#1D3557', color: '#fff', borderBottomRightRadius: 4 },
  msgBubbleThem: { background: '#fff', color: '#212529', border: '1px solid #dee2e6', borderBottomLeftRadius: 4 },
  msgTime: { fontSize: 11, color: '#adb5bd', marginTop: 4 },

  inputRow: {
    display: 'flex', gap: 10, padding: '14px 20px',
    background: '#fff', borderTop: '1px solid #dee2e6', flexShrink: 0,
  },
  input: {
    flex: 1, padding: '10px 16px', borderRadius: 24,
    border: '1.5px solid #dee2e6', fontSize: 14, outline: 'none',
    background: '#f8f9fa',
  },
  sendBtn: {
    width: 44, height: 44, borderRadius: 22, background: '#1D3557',
    color: '#fff', border: 'none', cursor: 'pointer', fontSize: 18,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
};
