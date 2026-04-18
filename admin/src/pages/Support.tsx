import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../store/authStore';
import { supportApi } from '../services/api';

type Message = {
  id: string; threadId: string; senderId: string;
  senderName: string; senderRole: string; body: string;
  isRead: boolean; createdAt: string;
};

type Thread = {
  id: string; fromUserId: string; fromName: string;
  subject: string; status: string; createdAt: string; updatedAt: string;
  messages: Message[];
  _count?: { messages: number };
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Support() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isDevAdmin = user?.role === 'DEV_ADMIN';

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [newSubject, setNewSubject] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Thread list
  const { data: listData, isLoading } = useQuery({
    queryKey: isDevAdmin ? ['support-inbox'] : ['support-threads'],
    queryFn: isDevAdmin ? supportApi.getInbox : supportApi.getMyThreads,
    refetchInterval: 30_000,
    retry: false,
  });
  const threads: Thread[] = listData?.data?.data ?? [];

  // Selected thread detail
  const { data: threadData, refetch: refetchThread } = useQuery({
    queryKey: isDevAdmin ? ['support-inbox-thread', selectedId] : ['support-thread', selectedId],
    queryFn: () => selectedId
      ? (isDevAdmin ? supportApi.getInboxThread(selectedId) : supportApi.getThread(selectedId))
      : null,
    enabled: !!selectedId,
    refetchInterval: 15_000,
    retry: false,
  });
  const activeThread: Thread | null = threadData?.data?.data ?? null;

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeThread?.messages?.length]);

  // Invalidate list when thread is opened (unread cleared)
  useEffect(() => {
    if (selectedId) {
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: isDevAdmin ? ['support-inbox'] : ['support-threads'] });
        qc.invalidateQueries({ queryKey: ['support-unread'] });
      }, 500);
    }
  }, [selectedId]);

  const createMutation = useMutation({
    mutationFn: () => supportApi.createThread(newSubject.trim(), newMessage.trim()),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['support-threads'] });
      setShowNew(false);
      setNewSubject('');
      setNewMessage('');
      setSelectedId(res.data.data.id);
    },
  });

  const replyMutation = useMutation({
    mutationFn: () => isDevAdmin
      ? supportApi.replyInbox(selectedId!, reply.trim())
      : supportApi.sendMessage(selectedId!, reply.trim()),
    onSuccess: () => {
      setReply('');
      refetchThread();
      qc.invalidateQueries({ queryKey: isDevAdmin ? ['support-inbox'] : ['support-threads'] });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (status: 'OPEN' | 'RESOLVED') => supportApi.resolveThread(selectedId!, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-inbox'] });
      refetchThread();
    },
  });

  function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!reply.trim() || replyMutation.isPending) return;
    replyMutation.mutate();
  }

  const selectedThread = threads.find(t => t.id === selectedId);

  return (
    <div style={s.page}>
      {/* Left panel — thread list */}
      <div style={s.left}>
        <div style={s.leftHeader}>
          <div>
            <div style={s.title}>{isDevAdmin ? 'Support Inbox' : 'Support'}</div>
            <div style={s.subtitle}>
              {isDevAdmin ? 'Messages from Super Admin' : 'Contact the developer for help'}
            </div>
          </div>
          {!isDevAdmin && (
            <button style={s.newBtn} onClick={() => setShowNew(true)}>+ New</button>
          )}
        </div>

        {isLoading && <div style={s.empty}>Loading...</div>}
        {!isLoading && threads.length === 0 && (
          <div style={s.empty}>
            {isDevAdmin ? 'No support requests yet.' : 'No messages yet. Click "+ New" to contact support.'}
          </div>
        )}

        {threads.map(t => {
          const unread = t._count?.messages ?? 0;
          const lastMsg = t.messages?.[0];
          return (
            <div key={t.id} style={{ ...s.threadItem, ...(selectedId === t.id ? s.threadItemActive : {}) }}
              onClick={() => setSelectedId(t.id)}>
              <div style={s.threadTop}>
                <span style={s.threadSubject}>{t.subject}</span>
                <span style={s.threadTime}>{timeAgo(t.updatedAt)}</span>
              </div>
              <div style={s.threadMeta}>
                {isDevAdmin && <span style={s.threadFrom}>{t.fromName}</span>}
                <span style={{ ...s.statusBadge, ...(t.status === 'RESOLVED' ? s.badgeResolved : s.badgeOpen) }}>
                  {t.status}
                </span>
                {unread > 0 && <span style={s.unreadDot}>{unread}</span>}
              </div>
              {lastMsg && (
                <div style={s.threadPreview}>
                  {lastMsg.senderRole === 'DEV_ADMIN' ? 'Dev: ' : ''}{lastMsg.body.slice(0, 60)}{lastMsg.body.length > 60 ? '…' : ''}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Right panel — thread detail */}
      <div style={s.right}>
        {!selectedId ? (
          <div style={s.rightEmpty}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
            <div style={{ fontWeight: 600, color: '#1D3557', marginBottom: 6 }}>
              {isDevAdmin ? 'Select a thread to reply' : 'Select a thread or start a new one'}
            </div>
            <div style={{ fontSize: 13, color: '#888' }}>
              {isDevAdmin
                ? 'All Super Admin support requests appear here.'
                : 'You can ask about billing, features, or anything else.'}
            </div>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div style={s.threadHeader}>
              <div>
                <div style={s.threadHeaderSubject}>{activeThread?.subject || selectedThread?.subject}</div>
                {isDevAdmin && activeThread && (
                  <div style={s.threadHeaderFrom}>From: {activeThread.fromName}</div>
                )}
              </div>
              <div style={s.threadHeaderActions}>
                <span style={{ ...s.statusBadge, ...(activeThread?.status === 'RESOLVED' ? s.badgeResolved : s.badgeOpen) }}>
                  {activeThread?.status ?? selectedThread?.status}
                </span>
                {isDevAdmin && (
                  <button
                    style={{ ...s.resolveBtn, ...(activeThread?.status === 'RESOLVED' ? s.reopenBtn : {}) }}
                    onClick={() => resolveMutation.mutate(activeThread?.status === 'RESOLVED' ? 'OPEN' : 'RESOLVED')}
                    disabled={resolveMutation.isPending}>
                    {activeThread?.status === 'RESOLVED' ? 'Reopen' : 'Mark Resolved'}
                  </button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div style={s.messages}>
              {activeThread?.messages.map(msg => {
                const isMe = msg.senderId === user?.id;
                return (
                  <div key={msg.id} style={{ ...s.msgRow, ...(isMe ? s.msgRowMe : {}) }}>
                    <div style={{ ...s.bubble, ...(isMe ? s.bubbleMe : s.bubbleThem) }}>
                      <div style={s.bubbleSender}>
                        {isMe ? 'You' : msg.senderName}
                        {msg.senderRole === 'DEV_ADMIN' && <span style={s.devTag}> Dev</span>}
                      </div>
                      <div style={s.bubbleBody}>{msg.body}</div>
                      <div style={s.bubbleTime}>{timeAgo(msg.createdAt)}</div>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Reply box */}
            {(isDevAdmin || activeThread?.status !== 'RESOLVED') && (
              <form onSubmit={handleReply} style={s.replyForm}>
                <textarea
                  style={s.replyInput}
                  placeholder={activeThread?.status === 'RESOLVED' ? 'Thread is resolved' : 'Type a message...'}
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  disabled={activeThread?.status === 'RESOLVED' && !isDevAdmin}
                  rows={3}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleReply(e as any); }}
                />
                <button type="submit" style={s.sendBtn}
                  disabled={!reply.trim() || replyMutation.isPending ||
                    (activeThread?.status === 'RESOLVED' && !isDevAdmin)}>
                  {replyMutation.isPending ? 'Sending…' : 'Send'}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* New thread modal (SuperAdmin only) */}
      {showNew && (
        <div style={s.overlay} onClick={() => setShowNew(false)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <div style={s.modalTitle}>New Support Request</div>
            <label style={s.label}>Subject</label>
            <input style={s.input} placeholder="What do you need help with?"
              value={newSubject} onChange={e => setNewSubject(e.target.value)} maxLength={200} />
            <label style={s.label}>Message</label>
            <textarea style={{ ...s.input, resize: 'vertical', minHeight: 100 }}
              placeholder="Describe your issue in detail..."
              value={newMessage} onChange={e => setNewMessage(e.target.value)} maxLength={2000} />
            <div style={s.modalActions}>
              <button style={s.cancelBtn} onClick={() => setShowNew(false)}>Cancel</button>
              <button style={s.submitBtn}
                disabled={!newSubject.trim() || !newMessage.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}>
                {createMutation.isPending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { display: 'flex', height: 'calc(100vh - 64px)', overflow: 'hidden', background: '#f5f7fa' },

  // Left panel
  left: { width: 320, borderRight: '1px solid #e8ecf0', background: '#fff', display: 'flex', flexDirection: 'column', flexShrink: 0 },
  leftHeader: { padding: '20px 16px 12px', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
  title: { fontSize: 18, fontWeight: 800, color: '#1D3557' },
  subtitle: { fontSize: 12, color: '#888', marginTop: 2 },
  newBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 },
  empty: { padding: 24, color: '#999', fontSize: 13, textAlign: 'center' },

  threadItem: { padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f5f5f5', transition: 'background 0.15s' },
  threadItemActive: { background: '#EFF6FF' },
  threadTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  threadSubject: { fontWeight: 600, fontSize: 13, color: '#1D3557', flex: 1 },
  threadTime: { fontSize: 11, color: '#aaa', flexShrink: 0 },
  threadMeta: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 },
  threadFrom: { fontSize: 12, color: '#555', fontWeight: 500 },
  threadPreview: { fontSize: 12, color: '#888', marginTop: 4, lineHeight: 1.4 },

  statusBadge: { fontSize: 10, fontWeight: 700, borderRadius: 4, padding: '2px 6px', letterSpacing: 0.3 },
  badgeOpen: { background: '#e8f5e9', color: '#2e7d32' },
  badgeResolved: { background: '#f3f4f6', color: '#666' },
  unreadDot: { background: '#E63946', color: '#fff', borderRadius: 8, padding: '1px 6px', fontSize: 10, fontWeight: 800, marginLeft: 'auto' },

  // Right panel
  right: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  rightEmpty: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#888', textAlign: 'center', padding: 40 },

  threadHeader: { padding: '16px 24px', borderBottom: '1px solid #e8ecf0', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  threadHeaderSubject: { fontWeight: 700, fontSize: 16, color: '#1D3557' },
  threadHeaderFrom: { fontSize: 13, color: '#666', marginTop: 2 },
  threadHeaderActions: { display: 'flex', alignItems: 'center', gap: 10 },
  resolveBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  reopenBtn: { background: '#f5f5f5', color: '#555', border: '1px solid #ddd' },

  messages: { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 12 },
  msgRow: { display: 'flex' },
  msgRowMe: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '70%', borderRadius: 12, padding: '10px 14px' },
  bubbleMe: { background: '#1D3557', color: '#fff', borderBottomRightRadius: 4 },
  bubbleThem: { background: '#fff', color: '#1D3557', border: '1px solid #e8ecf0', borderBottomLeftRadius: 4 },
  bubbleSender: { fontSize: 11, fontWeight: 700, marginBottom: 4, opacity: 0.7 },
  bubbleBody: { fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  bubbleTime: { fontSize: 10, marginTop: 6, opacity: 0.5, textAlign: 'right' },
  devTag: { background: '#2DC653', color: '#fff', borderRadius: 3, padding: '0 4px', fontSize: 9, fontWeight: 800 },

  replyForm: { padding: '12px 24px', borderTop: '1px solid #e8ecf0', background: '#fff', display: 'flex', gap: 10, alignItems: 'flex-end' },
  replyInput: { flex: 1, border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 14px', fontSize: 14, resize: 'none', fontFamily: 'inherit', outline: 'none' },
  sendBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, height: 42 },

  // Modal
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: 480, maxWidth: '90vw', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalTitle: { fontSize: 20, fontWeight: 800, color: '#1D3557', marginBottom: 20 },
  label: { display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.3 },
  input: { width: '100%', border: '1px solid #e0e0e0', borderRadius: 10, padding: '10px 14px', fontSize: 14, marginBottom: 16, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' },
  modalActions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 },
  cancelBtn: { background: '#f5f5f5', color: '#555', border: '1px solid #ddd', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' },
  submitBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 20px', fontSize: 13, fontWeight: 700, cursor: 'pointer' },
};
