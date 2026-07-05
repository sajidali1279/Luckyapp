import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supportApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ErrorState from '../components/ErrorState';

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
type Category = 'BILLING' | 'TECHNICAL' | 'FEATURE_REQUEST' | 'ACCESS' | 'OTHER';

interface Message {
  id: string;
  body: string;
  senderName: string;
  senderRole: string;
  createdAt: string;
  isRead: boolean;
}

interface Thread {
  id: string;
  subject: string;
  fromName: string;
  status: string;
  priority: Priority;
  category: Category;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  messages: Message[];
  _count?: { messages: number };
}

interface Stats {
  openCount: number;
  urgentCount: number;
  resolvedThisWeek: number;
  avgResponseHours: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; color: string; bg: string; border: string }> = {
  URGENT: { label: 'Urgent',  color: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  HIGH:   { label: 'High',    color: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  NORMAL: { label: 'Normal',  color: '#2563eb', bg: '#eff6ff', border: '#93c5fd' },
  LOW:    { label: 'Low',     color: '#5a6472', bg: '#f9fafb', border: '#d1d5db' },
};

const CATEGORY_CONFIG: Record<Category, { label: string; emoji: string; color: string }> = {
  BILLING:         { label: 'Billing',         emoji: '💳', color: '#7c3aed' },
  TECHNICAL:       { label: 'Technical',       emoji: '⚙️', color: '#0891b2' },
  FEATURE_REQUEST: { label: 'Feature Request', emoji: '✨', color: '#059669' },
  ACCESS:          { label: 'Access',          emoji: '🔑', color: '#dc2626' },
  OTHER:           { label: 'Other',           emoji: '💬', color: '#5a6472' },
};

const CANNED_REPLIES = [
  "Thank you for reaching out! I'll look into this shortly.",
  "This has been noted — I'll update you once it's resolved.",
  "Can you provide more details so I can assist better?",
  "The issue has been fixed. Please let me know if anything else comes up.",
  "This is a known issue we're working on. Expected resolution: within 48 hours.",
  "Your account/store has been updated as requested.",
];

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Support() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const qc = useQueryClient();

  const [statusFilter,   setStatusFilter]   = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [searchTerm,     setSearchTerm]     = useState('');

  const [activeThread, setActiveThread] = useState<Thread | null>(null);
  const [replyBody,    setReplyBody]    = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [showNewModal,   setShowNewModal]   = useState(false);
  const [newSubject,     setNewSubject]     = useState('');
  const [newMessage,     setNewMessage]     = useState('');
  const [newPriority,    setNewPriority]    = useState<Priority>('NORMAL');
  const [newCategory,    setNewCategory]    = useState<Category>('OTHER');
  const [showCannedMenu, setShowCannedMenu] = useState(false);

  const filterParams = {
    status:   statusFilter   || undefined,
    category: categoryFilter || undefined,
    priority: priorityFilter || undefined,
    search:   searchTerm     || undefined,
  };

  const threadsQ = useQuery({
    queryKey: ['support-threads', isDevAdmin, filterParams],
    queryFn: () => isDevAdmin
      ? supportApi.getInbox(filterParams).then(r => r.data.data as Thread[])
      : supportApi.getMyThreads(filterParams).then(r => r.data.data as Thread[]),
    refetchInterval: 30000,
  });

  const statsQ = useQuery({
    queryKey: ['support-stats'],
    queryFn: () => supportApi.getStats().then(r => r.data.data as Stats),
    enabled: isDevAdmin,
    refetchInterval: 60000,
  });

  const threadDetailQ = useQuery({
    queryKey: ['support-thread', activeThread?.id, isDevAdmin],
    queryFn: () => activeThread
      ? (isDevAdmin
          ? supportApi.getInboxThread(activeThread.id)
          : supportApi.getThread(activeThread.id)
        ).then(r => r.data.data as Thread)
      : null,
    enabled: !!activeThread,
    refetchInterval: 10000,
  });

  useEffect(() => {
    if (threadDetailQ.data?.messages) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [threadDetailQ.data?.messages?.length]);

  const createThread = useMutation({
    mutationFn: () => supportApi.createThread(newSubject, newMessage, newPriority, newCategory),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-threads'] });
      setShowNewModal(false);
      setNewSubject(''); setNewMessage(''); setNewPriority('NORMAL'); setNewCategory('OTHER');
    },
  });

  const sendReply = useMutation({
    mutationFn: (body: string) => isDevAdmin
      ? supportApi.replyInbox(activeThread!.id, body)
      : supportApi.sendMessage(activeThread!.id, body),
    onSuccess: () => {
      setReplyBody('');
      qc.invalidateQueries({ queryKey: ['support-thread', activeThread?.id] });
      qc.invalidateQueries({ queryKey: ['support-threads'] });
    },
  });

  const resolveThread = useMutation({
    mutationFn: (status: 'OPEN' | 'RESOLVED') => supportApi.resolveThread(activeThread!.id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-thread', activeThread?.id] });
      qc.invalidateQueries({ queryKey: ['support-threads'] });
      qc.invalidateQueries({ queryKey: ['support-stats'] });
    },
  });

  const setPriority = useMutation({
    mutationFn: (priority: string) => supportApi.setPriority(activeThread!.id, priority),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['support-thread', activeThread?.id] });
      qc.invalidateQueries({ queryKey: ['support-threads'] });
    },
  });

  const handleSendReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    sendReply.mutate(replyBody.trim());
  };

  const hasActiveFilters = statusFilter || categoryFilter || priorityFilter || searchTerm;


  const detail = threadDetailQ.data;
  const threads = threadsQ.data || [];

  return (
    <div style={s.page}>
      <div style={s.inner}>
        {/* Header */}
        <div style={s.header}>
          <div>
            <div style={s.title}>Support</div>
            <div style={s.subtitle}>
              {isDevAdmin ? 'Manage support requests from store admins' : 'Contact the developer team for help'}
            </div>
          </div>
          {!isDevAdmin && (
            <button style={{ ...s.btn, ...s.btnPrimary }} onClick={() => setShowNewModal(true)}>
              + New Request
            </button>
          )}
        </div>

        {/* DevAdmin Stats Banner */}
        {isDevAdmin && statsQ.data && (
          <div style={s.statsBanner}>
            {[
              { val: statsQ.data.openCount,       label: 'Open Tickets',       color: '#2563eb' },
              { val: statsQ.data.urgentCount,      label: 'Urgent',             color: '#dc2626' },
              { val: statsQ.data.resolvedThisWeek, label: 'Resolved This Week', color: '#059669' },
              {
                val: statsQ.data.avgResponseHours != null ? `${statsQ.data.avgResponseHours}h` : '—',
                label: 'Avg Response Time', color: '#7c3aed',
              },
            ].map((sc, i) => (
              <div key={i} style={s.statCard}>
                <div style={{ ...s.statVal, color: sc.color }}>{sc.val}</div>
                <div style={s.statLabel}>{sc.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filter Bar */}
        <div style={s.filterBar}>
          <input
            style={s.filterInput}
            placeholder="Search by subject…"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
          <select style={s.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All status</option>
            <option value="OPEN">Open</option>
            <option value="RESOLVED">Resolved</option>
          </select>
          <select style={s.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {(Object.keys(CATEGORY_CONFIG) as Category[]).map(c => (
              <option key={c} value={c}>{CATEGORY_CONFIG[c].emoji} {CATEGORY_CONFIG[c].label}</option>
            ))}
          </select>
          <select style={s.filterSelect} value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            <option value="">All priorities</option>
            {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
              <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <button
              style={{ ...s.btn, ...s.btnGhost, ...s.btnSm }}
              onClick={() => { setStatusFilter(''); setCategoryFilter(''); setPriorityFilter(''); setSearchTerm(''); }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Two-panel layout */}
        <div style={s.layout}>
          {/* Thread List */}
          <div style={s.listPanel}>
            <div style={s.listHeader}>
              {threads.length} thread{threads.length !== 1 ? 's' : ''}
            </div>
            <div style={s.listBody}>
              {threadsQ.isError ? (
                <ErrorState onRetry={threadsQ.refetch} />
              ) : threadsQ.isLoading ? (
                <div style={s.empty}><div style={s.emptyIco}>⏳</div>Loading…</div>
              ) : threads.length === 0 ? (
                <div style={s.empty}>
                  <div style={s.emptyIco}>💬</div>
                  {hasActiveFilters ? 'No matches. Try clearing filters.' : 'No support threads yet.'}
                </div>
              ) : threads.map((t) => {
                const pConf = PRIORITY_CONFIG[t.priority] || PRIORITY_CONFIG.NORMAL;
                const cConf = CATEGORY_CONFIG[t.category] || CATEGORY_CONFIG.OTHER;
                const isActive = activeThread?.id === t.id;
                const unread = t._count?.messages || 0;
                return (
                  <div
                    key={t.id}
                    style={{
                      ...s.threadItem,
                      ...(isActive ? s.threadItemAct : {}),
                      borderLeft: `3px solid ${pConf.border}`,
                    }}
                    onClick={() => setActiveThread(t)}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                      <div style={{ ...s.threadSubj, maxWidth: 220 }}>{t.subject}</div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                        {unread > 0 && <span style={s.badge}>{unread}</span>}
                        <span style={s.threadTime}>{timeAgo(t.updatedAt)}</span>
                      </div>
                    </div>
                    <div style={s.threadMeta}>
                      <span style={{ ...s.chip, color: pConf.color, background: pConf.bg, borderColor: pConf.border }}>
                        {pConf.label}
                      </span>
                      <span style={{ ...s.chip, color: cConf.color, background: '#f9fafb', borderColor: '#e5e7eb' }}>
                        {cConf.emoji} {cConf.label}
                      </span>
                      <span style={{ ...s.chip, color: t.status === 'OPEN' ? '#059669' : '#5a6472', background: t.status === 'OPEN' ? '#f0fdf4' : '#f9fafb', borderColor: t.status === 'OPEN' ? '#a7f3d0' : '#e5e7eb' }}>
                        {t.status === 'OPEN' ? '● Open' : '✓ Resolved'}
                      </span>
                      {isDevAdmin && <span style={{ fontSize: 12, color: '#5a6472' }}>{t.fromName}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Thread Detail */}
          {activeThread ? (
            <div style={s.detailPanel}>
              {threadDetailQ.isError ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <ErrorState onRetry={threadDetailQ.refetch} />
                </div>
              ) : threadDetailQ.isLoading && !detail ? (
                <div style={{ ...s.empty, flex: 1, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center' }}>
                  <div style={s.emptyIco}>⏳</div>Loading…
                </div>
              ) : detail ? (
                <>
                  <div style={s.detailHeader}>
                    <div style={s.detailSubj}>{detail.subject}</div>
                    <div style={s.detailMeta}>
                      {isDevAdmin ? (
                        <select
                          value={detail.priority}
                          onChange={e => setPriority.mutate(e.target.value)}
                          style={{
                            ...s.filterSelect,
                            width: 'auto',
                            fontSize: 12,
                            padding: '4px 10px',
                            color: PRIORITY_CONFIG[detail.priority]?.color || '#111',
                            borderColor: PRIORITY_CONFIG[detail.priority]?.border || '#e5e7eb',
                            background: PRIORITY_CONFIG[detail.priority]?.bg || '#fff',
                          }}
                        >
                          {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
                            <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                          ))}
                        </select>
                      ) : (
                        <span style={{ ...s.chip, color: PRIORITY_CONFIG[detail.priority]?.color || '#111', background: PRIORITY_CONFIG[detail.priority]?.bg || '#f9fafb', borderColor: PRIORITY_CONFIG[detail.priority]?.border || '#e5e7eb' }}>
                          {PRIORITY_CONFIG[detail.priority]?.label || detail.priority}
                        </span>
                      )}
                      <span style={{ ...s.chip, color: CATEGORY_CONFIG[detail.category]?.color || '#5a6472', background: '#f9fafb', borderColor: '#e5e7eb' }}>
                        {CATEGORY_CONFIG[detail.category]?.emoji} {CATEGORY_CONFIG[detail.category]?.label || detail.category}
                      </span>
                      <span style={{ ...s.chip, color: detail.status === 'OPEN' ? '#059669' : '#5a6472', background: detail.status === 'OPEN' ? '#f0fdf4' : '#f9fafb', borderColor: detail.status === 'OPEN' ? '#a7f3d0' : '#e5e7eb' }}>
                        {detail.status === 'OPEN' ? '● Open' : '✓ Resolved'}
                      </span>
                      <span style={{ fontSize: 12, color: '#5a6472' }}>opened {timeAgo(detail.createdAt)}</span>
                    </div>
                    {isDevAdmin && (
                      <div style={s.detailActions}>
                        {detail.status === 'OPEN' ? (
                          <button
                            style={{ ...s.btn, ...s.btnGhost, ...s.btnSm, color: '#059669', borderColor: '#a7f3d0' }}
                            onClick={() => resolveThread.mutate('RESOLVED')}
                            disabled={resolveThread.isPending}
                          >
                            ✓ Mark Resolved
                          </button>
                        ) : (
                          <button
                            style={{ ...s.btn, ...s.btnGhost, ...s.btnSm }}
                            onClick={() => resolveThread.mutate('OPEN')}
                            disabled={resolveThread.isPending}
                          >
                            ↺ Reopen
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={s.messages}>
                    {detail.messages.map((msg) => {
                      const isMe = isDevAdmin ? msg.senderRole === 'DEV_ADMIN' : msg.senderRole !== 'DEV_ADMIN';
                      return (
                        <div key={msg.id} style={{ ...s.msgRow, flexDirection: isMe ? 'row-reverse' : 'row' }}>
                          <div style={{ ...s.msgBubble, ...(isMe ? s.msgMe : s.msgFrom) }}>
                            <div style={{ ...s.msgName, opacity: isMe ? .8 : 1 }}>{msg.senderName}</div>
                            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{msg.body}</div>
                            <div style={s.msgTime}>{timeAgo(msg.createdAt)}</div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={messagesEndRef} />
                  </div>

                  {(detail.status === 'OPEN' || isDevAdmin) && (
                    <div style={s.replyBar}>
                      {isDevAdmin && (
                        <div style={{ marginBottom: 8, position: 'relative' }}>
                          <button
                            style={{ ...s.btn, ...s.btnGhost, ...s.btnSm }}
                            onClick={() => setShowCannedMenu(v => !v)}
                          >
                            ⚡ Quick replies
                          </button>
                          {showCannedMenu && (
                            <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 10, minWidth: 340 }}>
                              {CANNED_REPLIES.map((r, i) => (
                                <div
                                  key={i}
                                  onClick={() => { setReplyBody(r); setShowCannedMenu(false); }}
                                  style={{ padding: '10px 16px', fontSize: 13, cursor: 'pointer', borderBottom: i < CANNED_REPLIES.length - 1 ? '1px solid #f3f4f6' : 'none', color: '#374151' }}
                                  onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                                  onMouseLeave={e => (e.currentTarget.style.background = '#fff')}
                                >
                                  {r}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      <form onSubmit={handleSendReply} style={s.replyForm}>
                        <div style={{ flex: 1 }}>
                          <textarea
                            style={s.replyInput}
                            placeholder="Type your message…"
                            value={replyBody}
                            onChange={e => setReplyBody(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleSendReply(e as any);
                            }}
                          />
                          <div style={s.charCount}>{replyBody.length}/2000 · Ctrl+Enter to send</div>
                        </div>
                        <button
                          type="submit"
                          style={{ ...s.btn, ...s.btnPrimary, alignSelf: 'flex-end' }}
                          disabled={!replyBody.trim() || sendReply.isPending}
                        >
                          Send
                        </button>
                      </form>
                    </div>
                  )}
                  {detail.status === 'RESOLVED' && !isDevAdmin && (
                    <div style={{ padding: '16px 24px', borderTop: '1px solid #f3f4f6', textAlign: 'center', color: '#5a6472', fontSize: 14 }}>
                      This thread is resolved. Contact support to reopen.
                    </div>
                  )}
                </>
              ) : null}
            </div>
          ) : (
            <div style={{ ...s.detailPanel, justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
              <div style={s.empty}>
                <div style={s.emptyIco}>💬</div>
                <div>Select a thread to view the conversation</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Thread Modal */}
      {showNewModal && (
        <div style={s.overlay} onClick={e => e.target === e.currentTarget && setShowNewModal(false)}>
          <div style={s.modal}>
            <div style={s.modalTitle}>New Support Request</div>

            <div style={s.formGroup}>
              <label style={s.label}>Subject <span style={{ color: '#dc2626' }}>*</span></label>
              <input
                style={s.input}
                placeholder="Brief summary of your issue"
                value={newSubject}
                onChange={e => setNewSubject(e.target.value)}
                maxLength={200}
              />
            </div>

            <div style={{ ...s.formGroup, ...s.row2 }}>
              <div>
                <label style={s.label}>Category <span style={{ color: '#dc2626' }}>*</span></label>
                <select style={s.select} value={newCategory} onChange={e => setNewCategory(e.target.value as Category)}>
                  {(Object.keys(CATEGORY_CONFIG) as Category[]).map(c => (
                    <option key={c} value={c}>{CATEGORY_CONFIG[c].emoji} {CATEGORY_CONFIG[c].label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={s.label}>Priority</label>
                <select style={s.select} value={newPriority} onChange={e => setNewPriority(e.target.value as Priority)}>
                  {(Object.keys(PRIORITY_CONFIG) as Priority[]).map(p => (
                    <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={s.formGroup}>
              <label style={s.label}>Message <span style={{ color: '#dc2626' }}>*</span></label>
              <textarea
                style={s.textarea}
                placeholder="Describe your issue in detail…"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                maxLength={2000}
              />
              <div style={{ ...s.charCount, marginTop: 4 }}>{newMessage.length}/2000</div>
            </div>

            <div style={s.modalFooter}>
              <button style={{ ...s.btn, ...s.btnGhost }} onClick={() => setShowNewModal(false)}>
                Cancel
              </button>
              <button
                style={{ ...s.btn, ...s.btnPrimary }}
                disabled={!newSubject.trim() || !newMessage.trim() || createThread.isPending}
                onClick={() => createThread.mutate()}
              >
                {createThread.isPending ? 'Sending…' : 'Send Request'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page:         { minHeight: '100vh', background: '#f8f7f4', fontFamily: 'Inter, sans-serif' },
  inner:        { maxWidth: 1280, margin: '0 auto', padding: '32px 24px' },
  header:       { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title:        { fontSize: 26, fontWeight: 700, color: '#1a1a1a' },
  subtitle:     { fontSize: 14, color: '#5a6472', marginTop: 4 },
  btn:          { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '10px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600 },
  btnPrimary:   { background: 'linear-gradient(135deg,#e53e3e,#c53030)', color: '#fff' },
  btnGhost:     { background: '#fff', color: '#374151', border: '1px solid #e5e7eb' },
  btnSm:        { padding: '6px 12px', fontSize: 13, borderRadius: 6 },
  statsBanner:  { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 24 },
  statCard:     { background: '#fff', borderRadius: 12, padding: '18px 20px', border: '1px solid #e5e7eb' },
  statVal:      { fontSize: 28, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 },
  statLabel:    { fontSize: 13, color: '#5a6472', marginTop: 6 },
  filterBar:    { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  filterInput:  { flex: 1, minWidth: 200, padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, outline: 'none' },
  filterSelect: { padding: '8px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, background: '#fff', cursor: 'pointer', outline: 'none' },
  layout:       { display: 'grid', gridTemplateColumns: '380px 1fr', gap: 20, alignItems: 'start' },
  listPanel:    { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' },
  listHeader:   { padding: '16px 20px', borderBottom: '1px solid #f3f4f6', fontWeight: 600, color: '#374151', fontSize: 15 },
  listBody:     { maxHeight: 'calc(100vh - 380px)', overflowY: 'auto' },
  threadItem:   { padding: '14px 20px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', transition: 'background .15s' },
  threadItemAct:{ background: '#fef2f2' },
  threadSubj:   { fontWeight: 600, fontSize: 14, color: '#111', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  threadMeta:   { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  chip:         { fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 99, border: '1px solid' },
  threadTime:   { fontSize: 12, color: '#5a6472' },
  badge:        { background: '#e53e3e', color: '#fff', fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 99 },
  detailPanel:  { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 220px)' },
  detailHeader: { padding: '20px 24px', borderBottom: '1px solid #f3f4f6' },
  detailSubj:   { fontSize: 18, fontWeight: 700, color: '#111', marginBottom: 10 },
  detailMeta:   { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  detailActions:{ display: 'flex', gap: 8, marginTop: 12 },
  messages:     { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  msgRow:       { display: 'flex', gap: 12 },
  msgBubble:    { flex: 1, maxWidth: '80%', padding: '12px 16px', borderRadius: 12, fontSize: 14 },
  msgFrom:      { background: '#f3f4f6', color: '#111', borderTopLeftRadius: 4 },
  msgMe:        { background: 'linear-gradient(135deg,#e53e3e,#c53030)', color: '#fff', borderTopRightRadius: 4, marginLeft: 'auto' },
  msgName:      { fontSize: 12, fontWeight: 600, marginBottom: 4 },
  msgTime:      { fontSize: 11, opacity: .7, marginTop: 4 },
  replyBar:     { padding: '16px 24px', borderTop: '1px solid #f3f4f6' },
  replyForm:    { display: 'flex', gap: 10, alignItems: 'flex-end' },
  replyInput:   { flex: 1, padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 14, resize: 'vertical', minHeight: 60, maxHeight: 140, outline: 'none', fontFamily: 'inherit' },
  charCount:    { fontSize: 11, color: '#5a6472', textAlign: 'right' },
  empty:        { textAlign: 'center', padding: '60px 20px', color: '#5a6472' },
  emptyIco:     { fontSize: 40, marginBottom: 12 },
  overlay:      { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal:        { background: '#fff', borderRadius: 16, padding: '28px 32px', width: 540, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto' },
  modalTitle:   { fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 20 },
  formGroup:    { marginBottom: 16 },
  label:        { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input:        { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  select:       { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, background: '#fff', outline: 'none', boxSizing: 'border-box' },
  textarea:     { width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, resize: 'vertical', minHeight: 100, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  row2:         { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  modalFooter:  { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 },
};
