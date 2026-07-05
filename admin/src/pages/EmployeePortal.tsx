import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { employeeRequestApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CartLine {
  id: string;
  name: string;
  quantity: string;
  category: string;
  notes: string;
}

interface MyRequestLine {
  id: string; name: string; quantity?: string; category?: string;
  notes?: string; status: string; rejectionReason?: string; rejectionNote?: string;
  listItem?: { status: string; orderedAt?: string; receivedAt?: string } | null;
}

interface MyRequest {
  id: string; status: string; note?: string; requestType: string;
  createdAt: string; reviewedBy?: { name: string };
  lines: MyRequestLine[];
}

// ─── Item status config ───────────────────────────────────────────────────────

const LINE_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  PENDING:  { label: 'Pending review', color: '#D97706', bg: '#FEF3C7' },
  ACCEPTED: { label: 'Accepted',       color: '#059669', bg: '#D1FAE5' },
  REJECTED: { label: 'Rejected',       color: '#DC2626', bg: '#FEE2E2' },
};

const ORDER_STATUS: Record<string, { label: string; color: string }> = {
  PENDING:  { label: 'On order list',  color: '#D97706' },
  ORDERED:  { label: 'Ordered',        color: '#2563EB' },
  RECEIVED: { label: 'Received ✓',    color: '#059669' },
};

function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeePortal() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'new' | 'mine'>('new');

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerInner}>
          <div>
            <div style={s.headerTitle}>📦 Stock Request</div>
            <div style={s.headerSub}>
              {user?.name || 'Employee'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabBar}>
        <button style={{ ...s.tab, ...(tab === 'new'  ? s.tabActive : {}) }} onClick={() => setTab('new')}>
          + New Request
        </button>
        <button style={{ ...s.tab, ...(tab === 'mine' ? s.tabActive : {}) }} onClick={() => setTab('mine')}>
          My Requests
        </button>
      </div>

      <div style={s.body}>
        {tab === 'new'  && <NewRequestTab />}
        {tab === 'mine' && <MyRequestsTab />}
      </div>
    </div>
  );
}

// ─── New Request Tab ──────────────────────────────────────────────────────────

function NewRequestTab() {
  const [requestType, setRequestType] = useState<'LOW_STOCK' | 'CUSTOMER_REQUEST'>('LOW_STOCK');
  const [note, setNote]               = useState('');
  const [cart, setCart]               = useState<CartLine[]>([]);
  const [search, setSearch]           = useState('');
  const [debSearch, setDebSearch]     = useState('');
  const [showSugg, setShowSugg]       = useState(false);
  const [editingId, setEditingId]     = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const { data: suggData } = useQuery({
    queryKey: ['emp-sugg', debSearch],
    queryFn: () => employeeRequestApi.getSuggestions(debSearch),
    enabled: debSearch.trim().length >= 2,
    staleTime: 60_000,
  });
  const suggs: { name: string; category: string | null }[] = (suggData as any)?.data?.data || [];

  const submitMut = useMutation({
    mutationFn: () => employeeRequestApi.submit({
      requestType,
      note: note.trim() || undefined,
      lines: cart.map(c => ({
        name: c.name,
        quantity: c.quantity.trim() || undefined,
        category: c.category.trim() || undefined,
        notes: c.notes.trim() || undefined,
      })),
    }),
    onSuccess: () => {
      toast.success('Request submitted — your manager will review it');
      setCart([]);
      setNote('');
      setSearch('');
    },
    onError: () => toast.error('Failed to submit request'),
  });

  function addFromSugg(sg: { name: string; category: string | null }) {
    if (cart.find(c => c.name.toLowerCase() === sg.name.toLowerCase())) {
      toast('Already in list', { icon: 'ℹ️' });
      setSearch('');
      return;
    }
    setCart(prev => [...prev, { id: uid(), name: sg.name, quantity: '', category: sg.category || '', notes: '' }]);
    setSearch('');
    setShowSugg(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function addManual() {
    const name = search.trim();
    if (!name) return;
    if (cart.find(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast('Already in list', { icon: 'ℹ️' });
      setSearch('');
      return;
    }
    setCart(prev => [...prev, { id: uid(), name, quantity: '', category: '', notes: '' }]);
    setSearch('');
    setShowSugg(false);
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function update(id: string, field: keyof CartLine, value: string) {
    setCart(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }

  function remove(id: string) {
    setCart(prev => prev.filter(c => c.id !== id));
  }

  return (
    <div style={s.card}>
      {/* Request type */}
      <div style={s.section}>
        <div style={s.label}>Request type</div>
        <div style={s.typeRow}>
          <button
            style={{ ...s.typeBtn, ...(requestType === 'LOW_STOCK' ? s.typeBtnActive : {}) }}
            onClick={() => setRequestType('LOW_STOCK')}
          >
            📉 Low Stock
          </button>
          <button
            style={{ ...s.typeBtn, ...(requestType === 'CUSTOMER_REQUEST' ? s.typeBtnActive : {}) }}
            onClick={() => setRequestType('CUSTOMER_REQUEST')}
          >
            🙋 Customer Request
          </button>
        </div>
        <div style={s.typeHint}>
          {requestType === 'LOW_STOCK'
            ? 'Items running low that need to be ordered.'
            : 'Items a customer specifically asked for.'}
        </div>
      </div>

      {/* Optional note */}
      <div style={s.section}>
        <div style={s.label}>Note <span style={s.optional}>(optional)</span></div>
        <input
          style={s.input}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. Customer asked specifically for organic milk"
          maxLength={300}
        />
      </div>

      {/* Item search */}
      <div style={s.section}>
        <div style={s.label}>Add items</div>
        <div style={{ position: 'relative' }}>
          <input
            ref={searchRef}
            style={s.searchInput}
            value={search}
            onChange={e => { setSearch(e.target.value); setShowSugg(true); }}
            onFocus={() => setShowSugg(true)}
            onBlur={() => setTimeout(() => setShowSugg(false), 150)}
            onKeyDown={e => { if (e.key === 'Enter') { if (suggs.length > 0 && showSugg) addFromSugg(suggs[0]); else addManual(); } }}
            placeholder="Search or type item name…"
            autoComplete="off"
          />
          {search.trim() && (
            <button style={s.addInlineBtn} onMouseDown={addManual}>+ Add</button>
          )}

          {showSugg && suggs.length > 0 && (
            <div style={s.sugg}>
              {suggs.map(sg => (
                <div key={sg.name} style={s.suggRow} onMouseDown={() => addFromSugg(sg)}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{sg.name}</span>
                  {sg.category && <span style={s.suggCat}>{sg.category}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={s.searchHint}>
          Type to search from order history. Hit Enter or tap + Add for new items.
        </div>
      </div>

      {/* Cart */}
      {cart.length > 0 && (
        <div style={s.section}>
          <div style={s.label}>{cart.length} item{cart.length !== 1 ? 's' : ''} to request</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {cart.map(item => (
              <div key={item.id} style={s.cartItem}>
                <div style={s.cartItemTop}>
                  <span style={s.cartItemName}>{item.name}</span>
                  <button style={s.removeBtn} onClick={() => remove(item.id)}>✕</button>
                </div>
                {editingId === item.id ? (
                  <div style={s.cartItemFields}>
                    <input
                      style={s.fieldInput}
                      value={item.quantity}
                      onChange={e => update(item.id, 'quantity', e.target.value)}
                      placeholder="Quantity (e.g. 2 cases)"
                      maxLength={60}
                    />
                    <input
                      style={s.fieldInput}
                      value={item.category}
                      onChange={e => update(item.id, 'category', e.target.value)}
                      placeholder="Category (e.g. Dairy)"
                      maxLength={80}
                    />
                    <input
                      style={s.fieldInput}
                      value={item.notes}
                      onChange={e => update(item.id, 'notes', e.target.value)}
                      placeholder="Notes (optional)"
                      maxLength={300}
                    />
                    <button style={s.doneBtn} onClick={() => setEditingId(null)}>Done</button>
                  </div>
                ) : (
                  <div style={s.cartItemMeta} onClick={() => setEditingId(item.id)}
                    role="button" tabIndex={0}
                    aria-label={`Edit quantity, category, and notes for ${item.name ?? 'item'}`}
                    onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setEditingId(item.id)}>
                    <span>{item.quantity || 'Tap to add qty'}</span>
                    {item.category && <span> · {item.category}</span>}
                    {item.notes && <span> · {item.notes}</span>}
                    <span style={s.editLink}> edit</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Submit */}
      <div style={s.section}>
        <button
          style={{ ...s.submitBtn, opacity: cart.length === 0 || submitMut.isPending ? 0.5 : 1 }}
          onClick={() => submitMut.mutate()}
          disabled={cart.length === 0 || submitMut.isPending}
        >
          {submitMut.isPending ? 'Submitting…' : `Submit Request (${cart.length} item${cart.length !== 1 ? 's' : ''})`}
        </button>
        {cart.length === 0 && (
          <div style={s.emptyHint}>Add at least one item to submit a request.</div>
        )}
      </div>
    </div>
  );
}

// ─── My Requests Tab ──────────────────────────────────────────────────────────

function MyRequestsTab() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['my-employee-requests'],
    queryFn: employeeRequestApi.getMine,
    refetchInterval: 60_000,
  });
  const requests: MyRequest[] = (data as any)?.data?.data || [];

  if (isError) return <ErrorState onRetry={refetch} />;
  if (isLoading) return <CardSkeleton count={3} />;

  if (requests.length === 0) {
    return (
      <div style={s.card}>
        <div style={s.empty}>
          You haven't submitted any requests yet.<br />
          Use the "New Request" tab to get started.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <button style={s.refreshBtn} onClick={() => refetch()}>↺ Refresh</button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {requests.map(req => {
          const isOpen     = expandedId === req.id;
          const isPending  = req.status === 'PENDING';
          const accepted   = req.lines.filter(l => l.status === 'ACCEPTED').length;
          const rejected   = req.lines.filter(l => l.status === 'REJECTED').length;

          return (
            <div key={req.id} style={{ ...s.card, padding: 0, overflow: 'hidden' }}>
              <div
                style={s.reqHead}
                onClick={() => setExpandedId(isOpen ? null : req.id)}
                role="button" tabIndex={0}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedId(isOpen ? null : req.id)}
              >
                <div style={{ flex: 1 }}>
                  <div style={s.reqTitle}>
                    {req.requestType === 'CUSTOMER_REQUEST' ? '🙋 Customer Request' : '📉 Low Stock'}
                    <span style={{ ...s.statusPill, background: isPending ? '#FEF3C7' : '#D1FAE5', color: isPending ? '#D97706' : '#059669' }}>
                      {isPending ? 'Pending' : 'Reviewed'}
                    </span>
                  </div>
                  <div style={s.reqMeta}>
                    {req.lines.length} item{req.lines.length !== 1 ? 's' : ''} ·{' '}
                    {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {!isPending && <> · {accepted} accepted, {rejected} rejected</>}
                    {req.note && ` · "${req.note}"`}
                  </div>
                </div>
                <span style={{ color: '#94A3B8', fontSize: 18 }}>{isOpen ? '▲' : '▼'}</span>
              </div>

              {isOpen && (
                <div style={s.reqLines}>
                  {req.lines.map(line => {
                    const lc = LINE_STATUS[line.status] || { label: line.status, color: '#64748B', bg: '#F1F5F9' };
                    const oc = line.listItem ? ORDER_STATUS[line.listItem.status] : null;
                    return (
                      <div key={line.id} style={s.reqLine}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14, color: '#1E293B' }}>{line.name}</div>
                            {(line.quantity || line.category) && (
                              <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                                {line.quantity && <span>Qty: {line.quantity}</span>}
                                {line.quantity && line.category && <span> · </span>}
                                {line.category && <span>{line.category}</span>}
                              </div>
                            )}
                            {line.notes && <div style={{ fontSize: 13, color: '#64748B' }}>{line.notes}</div>}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
                            <span style={{ ...s.statusPill, background: lc.bg, color: lc.color }}>{lc.label}</span>
                            {oc && line.status === 'ACCEPTED' && (
                              <span style={{ fontSize: 12, color: oc.color, fontWeight: 600 }}>{oc.label}</span>
                            )}
                          </div>
                        </div>
                        {line.status === 'REJECTED' && line.rejectionReason && (
                          <div style={s.rejReason}>
                            Reason: {line.rejectionReason.replace(/_/g, ' ').toLowerCase()}
                            {line.rejectionNote && ` — ${line.rejectionNote}`}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {req.reviewedBy && (
                    <div style={{ fontSize: 12, color: '#94A3B8', paddingTop: 4 }}>Reviewed by {req.reviewedBy.name}</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:       { minHeight: '100vh', background: '#F8FAFC', paddingBottom: 40 },

  header:     { background: 'linear-gradient(135deg, #1D3557 0%, #2563EB 100%)', padding: '0 0 0 0' },
  headerInner:{ maxWidth: 600, margin: '0 auto', padding: '20px 20px' },
  headerTitle:{ fontSize: 22, fontWeight: 800, color: '#fff' },
  headerSub:  { fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 4 },

  tabBar:     { display: 'flex', background: '#fff', borderBottom: '1px solid #E2E8F0' },
  tab:        { flex: 1, padding: '14px 0', fontSize: 15, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', transition: 'all 0.15s' },
  tabActive:  { color: '#1D3557', borderBottomColor: '#1D3557', background: '#F8FAFC' },

  body:       { maxWidth: 600, margin: '0 auto', padding: '20px 16px' },
  card:       { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  section:    { marginBottom: 20 },

  label:      { fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 8 },
  optional:   { fontSize: 12, fontWeight: 500, color: '#5a6472' },

  typeRow:    { display: 'flex', gap: 10 },
  typeBtn:    { flex: 1, padding: '12px 10px', borderRadius: 10, border: '1.5px solid #E2E8F0', background: '#F9FAFB', fontSize: 14, fontWeight: 600, color: '#64748B', cursor: 'pointer', transition: 'all 0.15s' },
  typeBtnActive: { background: '#EFF6FF', borderColor: '#2563EB', color: '#1D4ED8' },
  typeHint:   { fontSize: 12, color: '#94A3B8', marginTop: 8 },

  input:      { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#1E293B', boxSizing: 'border-box' as const, outline: 'none' },
  searchInput:{ width: '100%', padding: '12px 80px 12px 14px', borderRadius: 10, border: '1.5px solid #E2E8F0', fontSize: 15, color: '#1E293B', boxSizing: 'border-box' as const, outline: 'none' },
  addInlineBtn:{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', padding: '6px 14px', borderRadius: 6, background: '#1D3557', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  searchHint: { fontSize: 12, color: '#94A3B8', marginTop: 6 },

  sugg:       { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E2E8F0', borderTop: 'none', borderRadius: '0 0 10px 10px', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 240, overflowY: 'auto' },
  suggRow:    { padding: '12px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F8FAFC' },
  suggCat:    { fontSize: 12, color: '#94A3B8', padding: '2px 8px', background: '#F1F5F9', borderRadius: 8 },

  cartItem:   { background: '#F8FAFC', borderRadius: 10, border: '1px solid #E2E8F0', padding: '12px 14px' },
  cartItemTop:{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  cartItemName:{ fontSize: 15, fontWeight: 700, color: '#1E293B' },
  cartItemMeta:{ fontSize: 13, color: '#64748B', marginTop: 6, cursor: 'pointer' },
  cartItemFields:{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 },
  fieldInput: { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' },
  editLink:   { color: '#2563EB', fontWeight: 600 },
  doneBtn:    { padding: '8px 16px', borderRadius: 8, background: '#1D3557', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' },
  removeBtn:  { background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 16, padding: '2px 4px', borderRadius: 4 },

  submitBtn:  { width: '100%', padding: '14px 0', borderRadius: 12, background: 'linear-gradient(135deg, #1D3557 0%, #2563EB 100%)', color: '#fff', border: 'none', fontSize: 16, fontWeight: 700, cursor: 'pointer', transition: 'opacity 0.15s' },
  emptyHint:  { fontSize: 13, color: '#94A3B8', textAlign: 'center', marginTop: 10 },

  statusPill: { padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700, marginLeft: 8, display: 'inline-block' },

  reqHead:  { display: 'flex', alignItems: 'center', padding: '14px 16px', cursor: 'pointer', gap: 8, background: '#fff' },
  reqTitle: { fontSize: 15, fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', flexWrap: 'wrap' as const, gap: 4 },
  reqMeta:  { fontSize: 13, color: '#64748B', marginTop: 4 },
  reqLines: { padding: '12px 16px', borderTop: '1px solid #F1F5F9', display: 'flex', flexDirection: 'column', gap: 8, background: '#F8FAFC' },
  reqLine:  { background: '#fff', borderRadius: 8, border: '1px solid #E2E8F0', padding: '12px 14px' },
  rejReason:{ fontSize: 12, color: '#DC2626', marginTop: 6, background: '#FEF2F2', padding: '4px 8px', borderRadius: 6 },

  refreshBtn: { padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#64748B', background: '#fff', cursor: 'pointer' },
  loading:    { padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 },
  empty:      { padding: '32px 0', textAlign: 'center', color: '#94A3B8', fontSize: 14, lineHeight: 1.8 },
};
