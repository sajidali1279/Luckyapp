import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { chatApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import toast from 'react-hot-toast';

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

const STORE_GRADIENTS = [
  ['#1D3557', '#457B9D'],
  ['#0369a1', '#0ea5e9'],
  ['#166534', '#2DC653'],
  ['#7c3aed', '#a78bfa'],
  ['#b45309', '#f59e0b'],
  ['#be123c', '#f43f5e'],
  ['#0f766e', '#14b8a6'],
  ['#1e40af', '#3b82f6'],
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

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDateDivider(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
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

export default function Chat() {
  const { user } = useAuthStore();
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isStoreManager = user?.role === 'STORE_MANAGER';

  const { data: storesData } = useQuery({
    queryKey: ['chat-stores'],
    queryFn: () => chatApi.getMyStores(),
  });
  const stores: { id: string; name: string; city: string }[] = storesData?.data?.data || [];

  useEffect(() => {
    if (stores.length > 0 && !selectedStoreId) setSelectedStoreId(stores[0].id);
  }, [stores, selectedStoreId]);

  const { data: initialData } = useQuery({
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

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

  async function handleSend(e?: React.FormEvent) {
    e?.preventDefault();
    const text = inputText.trim();
    if (!text || !selectedStoreId || sending) return;
    setSending(true);
    setInputText('');
    if (inputRef.current) inputRef.current.style.height = '44px';
    try {
      const res = await chatApi.sendMessage(selectedStoreId, text);
      const newMsg: Message = res.data.data;
      setMessages((prev) => [...prev, newMsg]);
      setLastTimestamp(newMsg.createdAt);
    } catch {
      setInputText(text);
      toast.error('Failed to send message');
    }
    setSending(false);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputText(e.target.value);
    e.target.style.height = '44px';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  const selectedStore = stores.find((s) => s.id === selectedStoreId);
  const storeIdx = stores.findIndex((s) => s.id === selectedStoreId);
  const gradient = STORE_GRADIENTS[storeIdx % STORE_GRADIENTS.length] || STORE_GRADIENTS[0];

  return (
    <div style={s.container}>
      {/* ── Sidebar ── */}
      {!isStoreManager && (
        <div style={s.sidebar}>
          <div style={s.sidebarTop}>
            <div style={s.sidebarTitle}>Messages</div>
            <div style={s.sidebarSubtitle}>{stores.length} store{stores.length !== 1 ? 's' : ''}</div>
          </div>

          <div style={s.storeList}>
            {stores.map((store, i) => {
              const g = STORE_GRADIENTS[i % STORE_GRADIENTS.length];
              const isActive = store.id === selectedStoreId;
              return (
                <button
                  key={store.id}
                  style={{ ...s.storeBtn, ...(isActive ? s.storeBtnActive : {}) }}
                  onClick={() => setSelectedStoreId(store.id)}
                >
                  <div style={{ ...s.storeAvatar, background: `linear-gradient(135deg, ${g[0]}, ${g[1]})` }}>
                    {store.name[0].toUpperCase()}
                  </div>
                  <div style={s.storeBtnInfo}>
                    <div style={{ ...s.storeBtnName, color: isActive ? '#1D3557' : '#212529' }}>
                      {store.name}
                    </div>
                    <div style={s.storeBtnCity}>{store.city}</div>
                  </div>
                  {isActive && <div style={s.activeIndicator} />}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Chat Panel ── */}
      <div style={s.chatPanel}>
        {!selectedStoreId ? (
          <div style={s.emptyState}>
            <div style={s.emptyIconWrap}>💬</div>
            <div style={s.emptyTitle}>Your team chats live here</div>
            <div style={s.emptySub}>Select a store from the sidebar to open its team chat</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div style={{ ...s.chatHeader, background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})` }}>
              <div style={s.chatHeaderAvatar}>{selectedStore?.name[0].toUpperCase()}</div>
              <div style={s.chatHeaderInfo}>
                <div style={s.chatHeaderName}>{selectedStore?.name}</div>
                <div style={s.chatHeaderSub}>
                  <span style={s.onlineDot} />
                  {selectedStore?.city ? `${selectedStore.city} · ` : ''}Store Team Chat
                </div>
              </div>
              <div style={s.chatHeaderBadge}>
                <span style={s.chatHeaderBadgeText}>{messages.length} msgs</span>
              </div>
            </div>

            {/* Messages */}
            <div style={s.messageList}>
              {messages.length === 0 && (
                <div style={s.noMessages}>
                  <div style={{ fontSize: 36, marginBottom: 10 }}>👋</div>
                  <div style={s.noMessagesText}>No messages yet. Be the first to say hello!</div>
                </div>
              )}

              {messages.map((msg, i) => {
                const isMe = msg.userId === user?.id;
                const prev = messages[i - 1];
                const next = messages[i + 1];
                const showDivider = !prev || !isSameDay(prev.createdAt, msg.createdAt);
                const isFirstInGroup = !prev || prev.userId !== msg.userId || showDivider;
                const isLastInGroup = !next || next.userId !== msg.userId || !isSameDay(msg.createdAt, next.createdAt);
                const roleColor = ROLE_COLORS[msg.userRole] || '#6c757d';

                return (
                  <div key={msg.id}>
                    {showDivider && (
                      <div style={s.dateDivider}>
                        <div style={s.dateDividerLine} />
                        <div style={s.dateDividerLabel}>{formatDateDivider(msg.createdAt)}</div>
                        <div style={s.dateDividerLine} />
                      </div>
                    )}

                    <div style={{
                      ...s.msgRow,
                      justifyContent: isMe ? 'flex-end' : 'flex-start',
                      marginBottom: isLastInGroup ? 8 : 2,
                    }}>
                      {/* Avatar slot for others */}
                      {!isMe && (
                        <div style={{ width: 36, flexShrink: 0 }}>
                          {isLastInGroup && (
                            <div style={{ ...s.avatar, background: roleColor }}>
                              {getInitials(msg.userName)}
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ maxWidth: '62%' }}>
                        {!isMe && isFirstInGroup && (
                          <div style={s.msgMeta}>
                            <span style={s.msgSenderName}>{msg.userName}</span>
                            <span style={{ ...s.roleBadge, background: roleColor }}>
                              {ROLE_LABELS[msg.userRole] || msg.userRole}
                            </span>
                          </div>
                        )}

                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                          <div style={{
                            ...s.bubble,
                            ...(isMe ? s.bubbleMe : s.bubbleThem),
                            borderTopLeftRadius: !isMe && !isFirstInGroup ? 4 : 18,
                            borderTopRightRadius: isMe && !isFirstInGroup ? 4 : 18,
                            borderBottomRightRadius: isMe && isLastInGroup ? 4 : 18,
                            borderBottomLeftRadius: !isMe && isLastInGroup ? 4 : 18,
                          }}>
                            {msg.text}
                          </div>
                          {isLastInGroup && (
                            <span style={s.msgTime}>{formatTime(msg.createdAt)}</span>
                          )}
                        </div>
                      </div>

                      {/* Avatar slot for self */}
                      {isMe && (
                        <div style={{ width: 36, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                          {isLastInGroup && (
                            <div style={{ ...s.avatar, background: roleColor }}>
                              {getInitials(msg.userName)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <div style={s.inputBar}>
              <div style={s.inputWrap}>
                <textarea
                  ref={inputRef}
                  style={s.textarea}
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder={`Message ${selectedStore?.name}…`}
                  disabled={sending}
                  rows={1}
                  autoComplete="off"
                />
                <div style={s.inputActions}>
                  <span style={s.inputHint}>↵ send · ⇧↵ newline</span>
                  <button
                    style={{ ...s.sendBtn, opacity: (!inputText.trim() || sending) ? 0.45 : 1 }}
                    onClick={() => handleSend()}
                    disabled={!inputText.trim() || sending}
                  >
                    {sending ? '…' : '↑'}
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  container: { display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#f0f2f5' },

  // ── Sidebar ──
  sidebar: {
    width: 272, flexShrink: 0, background: '#fff',
    borderRight: '1px solid #e5e7eb',
    display: 'flex', flexDirection: 'column',
  },
  sidebarTop: {
    padding: '20px 18px 8px',
  },
  sidebarTitle: { fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: -0.3 },
  sidebarSubtitle: { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  storeSearch: {
    margin: '8px 14px 6px',
    padding: '8px 12px',
    background: '#f3f4f6',
    borderRadius: 10,
    display: 'flex', alignItems: 'center', gap: 8,
    cursor: 'text',
  },
  searchIcon: { fontSize: 13, opacity: 0.5 },
  searchPlaceholder: { fontSize: 13, color: '#9ca3af' },

  storeList: { flex: 1, overflowY: 'auto', padding: '4px 8px 12px' },
  storeBtn: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    padding: '9px 10px', background: 'none', border: 'none', cursor: 'pointer',
    borderRadius: 10, textAlign: 'left', position: 'relative',
    transition: 'background 0.15s',
  },
  storeBtnActive: { background: '#eff6ff' },
  storeAvatar: {
    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontSize: 16, fontWeight: 800,
  },
  storeBtnInfo: { flex: 1, minWidth: 0 },
  storeBtnName: { fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  storeBtnCity: { fontSize: 12, color: '#9ca3af', marginTop: 1 },
  activeIndicator: {
    width: 8, height: 8, borderRadius: 4,
    background: '#2DC653', flexShrink: 0,
  },

  // ── Chat panel ──
  chatPanel: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },

  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  emptyIconWrap: { fontSize: 52, marginBottom: 4 },
  emptyTitle: { fontSize: 20, fontWeight: 800, color: '#111827' },
  emptySub: { fontSize: 14, color: '#6b7280', textAlign: 'center', maxWidth: 300 },

  chatHeader: {
    display: 'flex', alignItems: 'center', gap: 14,
    padding: '14px 22px', flexShrink: 0,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
  },
  chatHeaderAvatar: {
    width: 42, height: 42, borderRadius: 14, flexShrink: 0,
    background: 'rgba(255,255,255,0.2)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 18, fontWeight: 800, color: '#fff',
    border: '2px solid rgba(255,255,255,0.35)',
  },
  chatHeaderInfo: { flex: 1 },
  chatHeaderName: { color: '#fff', fontSize: 17, fontWeight: 800, letterSpacing: -0.2 },
  chatHeaderSub: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 },
  onlineDot: {
    width: 7, height: 7, borderRadius: 4,
    background: '#4ade80', border: '1.5px solid rgba(255,255,255,0.5)',
    display: 'inline-block',
  },
  chatHeaderBadge: {
    background: 'rgba(255,255,255,0.15)', borderRadius: 20,
    padding: '4px 12px', backdropFilter: 'blur(4px)',
  },
  chatHeaderBadgeText: { color: '#fff', fontSize: 12, fontWeight: 700 },

  // ── Messages ──
  messageList: {
    flex: 1, overflowY: 'auto', padding: '20px 24px 12px',
    display: 'flex', flexDirection: 'column',
    background: '#f8fafc',
  },
  noMessages: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 60 },
  noMessagesText: { fontSize: 14, color: '#9ca3af', marginTop: 4 },

  dateDivider: {
    display: 'flex', alignItems: 'center', gap: 12,
    margin: '16px 0 12px',
  },
  dateDividerLine: { flex: 1, height: 1, background: '#e5e7eb' },
  dateDividerLabel: {
    fontSize: 11, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: 0.6, whiteSpace: 'nowrap',
  },

  msgRow: { display: 'flex', alignItems: 'flex-end', gap: 6 },
  avatar: {
    width: 30, height: 30, borderRadius: 10, flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#fff', fontWeight: 800, fontSize: 11,
  },
  msgMeta: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingLeft: 2 },
  msgSenderName: { fontSize: 12, fontWeight: 700, color: '#374151' },
  roleBadge: {
    color: '#fff', borderRadius: 5, padding: '1px 6px',
    fontSize: 10, fontWeight: 700,
  },
  bubble: {
    padding: '10px 14px', fontSize: 14, lineHeight: '1.5',
    wordBreak: 'break-word' as const, borderRadius: 18,
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  bubbleMe: {
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    color: '#fff',
  },
  bubbleThem: {
    background: '#fff', color: '#111827',
    border: '1px solid #e5e7eb',
  },
  msgTime: { fontSize: 10, color: '#9ca3af', marginBottom: 2, whiteSpace: 'nowrap' as const },

  // ── Input bar ──
  inputBar: {
    padding: '12px 20px 16px',
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
    flexShrink: 0,
  },
  inputWrap: {
    background: '#f3f4f6',
    borderRadius: 16,
    border: '1.5px solid #e5e7eb',
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  textarea: {
    width: '100%', resize: 'none' as const,
    border: 'none', outline: 'none',
    background: 'transparent',
    padding: '12px 16px 0',
    fontSize: 14, lineHeight: '1.5',
    color: '#111827',
    fontFamily: 'inherit',
    height: 44,
    boxSizing: 'border-box' as const,
  },
  inputActions: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '4px 10px 8px',
  },
  inputHint: { fontSize: 11, color: '#9ca3af' },
  sendBtn: {
    width: 34, height: 34, borderRadius: 10,
    background: 'linear-gradient(135deg, #1D3557, #2c5282)',
    color: '#fff', border: 'none', cursor: 'pointer',
    fontSize: 16, fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'opacity 0.15s',
  },
};
