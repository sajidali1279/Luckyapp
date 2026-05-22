import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { orderListApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────
type Priority = 'URGENT' | 'NORMAL' | 'LOW';
type Status   = 'PENDING' | 'PRINTED' | 'ORDERED' | 'RECEIVED' | 'REMOVED';

interface OrderItem {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  notes?: string;
  priority: Priority;
  status: Status;
  sortOrder: number;
  createdAt: string;
  addedBy: { id: string; name: string; role: string };
}

interface StoreSummary {
  storeId: string;
  storeName: string;
  pendingCount: number;
  urgentCount: number;
  printedCount: number;
  orderedCount: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const PRIORITY_CONFIG: Record<Priority, { label: string; dot: string; bg: string; text: string }> = {
  URGENT: { label: 'Urgent', dot: '#DC2626', bg: '#FEF2F2', text: '#DC2626' },
  NORMAL: { label: 'Normal', dot: '#6B7280', bg: '#F3F4F6', text: '#374151' },
  LOW:    { label: 'Low',    dot: '#2563EB', bg: '#EFF6FF', text: '#2563EB' },
};

const STATUS_CONFIG: Record<Status, { label: string; bg: string; text: string; border: string }> = {
  PENDING:  { label: 'Pending',  bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' },
  PRINTED:  { label: 'Printed',  bg: '#EEF2FF', text: '#4338CA', border: '#A5B4FC' },
  ORDERED:  { label: 'Ordered',  bg: '#D1FAE5', text: '#065F46', border: '#6EE7B7' },
  RECEIVED: { label: 'Received', bg: '#D1FAE5', text: '#047857', border: '#34D399' },
  REMOVED:  { label: 'Removed',  bg: '#F3F4F6', text: '#9CA3AF', border: '#E5E7EB' },
};

const CATEGORIES = ['', 'Groceries', 'Frozen Foods', 'Fresh Foods', 'Hot Foods', 'Gas', 'Diesel', 'Tobacco/Vapes', 'Supplies', 'Other'];

type FilterStatus = 'ALL' | Status;
const FILTER_TABS: { key: FilterStatus; label: string }[] = [
  { key: 'ALL',      label: 'All Items' },
  { key: 'PENDING',  label: 'Pending'   },
  { key: 'PRINTED',  label: 'Printed'   },
  { key: 'ORDERED',  label: 'Ordered'   },
  { key: 'RECEIVED', label: 'Received'  },
];

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
interface ItemModalProps {
  mode: 'add' | 'edit';
  initial?: Partial<OrderItem>;
  storeId: string;
  onClose: () => void;
}

function ItemModal({ mode, initial, storeId, onClose }: ItemModalProps) {
  const qc = useQueryClient();
  const [name,     setName]     = useState(initial?.name     || '');
  const [quantity, setQuantity] = useState(initial?.quantity || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [notes,    setNotes]    = useState(initial?.notes    || '');
  const [priority, setPriority] = useState<Priority>(initial?.priority || 'NORMAL');

  const mutation = useMutation({
    mutationFn: mode === 'add'
      ? () => orderListApi.addItem(storeId, { name, quantity: quantity || undefined, category: category || undefined, notes: notes || undefined, priority })
      : () => orderListApi.updateItem(initial!.id!, { name, quantity: quantity || null, category: category || null, notes: notes || null, priority }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-list', storeId] });
      qc.invalidateQueries({ queryKey: ['admin-order-summary'] });
      toast.success(mode === 'add' ? 'Item added' : 'Item updated');
      onClose();
    },
    onError: () => toast.error('Failed to save item'),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast.error('Item name is required'); return; }
    mutation.mutate();
  }

  return (
    <div style={ms.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={ms.modal}>
        <div style={ms.header}>
          <span style={ms.title}>{mode === 'add' ? '➕ Add Item' : '✏️ Edit Item'}</span>
          <button style={ms.closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={submit}>
          {/* Priority */}
          <div style={ms.field}>
            <label style={ms.label}>Priority</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {(['URGENT', 'NORMAL', 'LOW'] as Priority[]).map(p => {
                const c = PRIORITY_CONFIG[p];
                return (
                  <button key={p} type="button" onClick={() => setPriority(p)}
                    style={{ ...ms.priorityBtn, ...(priority === p ? { backgroundColor: c.bg, borderColor: c.dot, color: c.text, fontWeight: 700 } : {}) }}
                  >
                    {p === 'URGENT' && '⚠ '}{c.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name */}
          <div style={ms.field}>
            <label style={ms.label}>Item Name <span style={{ color: '#E63946' }}>*</span></label>
            <input style={ms.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Whole Milk 2%" maxLength={120} autoFocus />
          </div>

          {/* Quantity */}
          <div style={ms.field}>
            <label style={ms.label}>Quantity / Amount</label>
            <input style={ms.input} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 4 gallons, 2 cases" maxLength={60} />
          </div>

          {/* Category */}
          <div style={ms.field}>
            <label style={ms.label}>Category</label>
            <select style={ms.select} value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c || '— None —'}</option>)}
            </select>
          </div>

          {/* Notes */}
          <div style={ms.field}>
            <label style={ms.label}>Notes</label>
            <textarea style={ms.textarea} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any specific details..." maxLength={300} rows={3} />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button type="button" onClick={onClose} style={ms.cancelBtn}>Cancel</button>
            <button type="submit" disabled={mutation.isPending} style={ms.saveBtn}>
              {mutation.isPending ? 'Saving…' : mode === 'add' ? 'Add Item' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Print History Panel ──────────────────────────────────────────────────────
function PrintHistoryPanel({ storeId, storeName, onClose }: { storeId: string; storeName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin-print-history', storeId],
    queryFn: () => orderListApi.getPrintHistory(storeId),
  });
  const jobs: any[] = data?.data?.data || [];

  return (
    <div style={ms.overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ ...ms.modal, maxWidth: 560, maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={ms.header}>
          <span style={ms.title}>🖨 Print History — {storeName}</span>
          <button style={ms.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {isLoading ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>Loading…</div>
          ) : jobs.length === 0 ? (
            <div style={{ padding: 32, textAlign: 'center', color: '#6B7280' }}>No print jobs yet for this store.</div>
          ) : (
            jobs.map(job => (
              <div key={job.id} style={ph.jobCard}>
                <div style={ph.jobHeader}>
                  <div>
                    <span style={ph.jobCount}>{job.itemCount} items</span>
                    <span style={{ color: '#6B7280', fontSize: 12 }}> · Printed by {job.printedBy?.name}</span>
                  </div>
                  <span style={ph.jobDate}>
                    {new Date(job.printedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                {job.notes && <div style={{ fontSize: 12, color: '#6B7280', fontStyle: 'italic', marginBottom: 8 }}>{job.notes}</div>}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {job.items?.map((ji: any, idx: number) => (
                    <div key={ji.id || idx} style={{ fontSize: 13, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ color: '#9CA3AF', fontSize: 11, width: 18, textAlign: 'right' }}>{idx + 1}.</span>
                      <span style={{ fontWeight: 500 }}>{ji.snapshot?.name}</span>
                      {ji.snapshot?.quantity && <span style={{ color: '#6B7280' }}>— {ji.snapshot.quantity}</span>}
                      {ji.snapshot?.priority === 'URGENT' && <span style={{ color: '#DC2626', fontSize: 11, fontWeight: 700 }}>⚠ URGENT</span>}
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Item Row ─────────────────────────────────────────────────────────────────
interface ItemRowProps {
  item: OrderItem;
  isManager: boolean;
  isPendingFirst: boolean;
  isPendingLast: boolean;
  onEdit: (item: OrderItem) => void;
  onDelete: (item: OrderItem) => void;
  onMoveUp: (item: OrderItem) => void;
  onMoveDown: (item: OrderItem) => void;
  onMarkOrdered: (item: OrderItem) => void;
  onMarkReceived: (item: OrderItem) => void;
}

function ItemRow({ item, isManager, isPendingFirst, isPendingLast, onEdit, onDelete, onMoveUp, onMoveDown, onMarkOrdered, onMarkReceived }: ItemRowProps) {
  const [hov, setHov] = useState(false);
  const pc = PRIORITY_CONFIG[item.priority];
  const sc = STATUS_CONFIG[item.status];

  return (
    <tr
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ backgroundColor: hov ? '#FAFAFA' : '#fff', transition: 'background 0.1s', borderBottom: '1px solid #F1F5F9' }}
    >
      {/* Priority */}
      <td style={{ padding: '10px 12px', width: 100 }}>
        <span style={{ ...t.badge, backgroundColor: pc.bg, color: pc.text, borderColor: pc.bg }}>
          {item.priority === 'URGENT' && '⚠ '}{pc.label}
        </span>
      </td>

      {/* Name + meta */}
      <td style={{ padding: '10px 12px' }}>
        <div style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{item.name}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 2, flexWrap: 'wrap' }}>
          {item.quantity && <span style={{ fontSize: 12, color: '#6B7280' }}>📦 {item.quantity}</span>}
          {item.category && <span style={{ fontSize: 12, color: '#6B7280' }}>🏷 {item.category}</span>}
          {item.notes    && <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>{item.notes}</span>}
        </div>
      </td>

      {/* Added by */}
      <td style={{ padding: '10px 12px', fontSize: 13, color: '#6B7280', whiteSpace: 'nowrap' }}>
        {item.addedBy?.name}
      </td>

      {/* Status */}
      <td style={{ padding: '10px 12px', width: 100 }}>
        <span style={{ ...t.badge, backgroundColor: sc.bg, color: sc.text, borderColor: sc.border }}>
          {sc.label}
        </span>
      </td>

      {/* Actions */}
      <td style={{ padding: '10px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        {isManager && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
            {/* Reorder arrows for pending */}
            {item.status === 'PENDING' && (
              <>
                <ActionBtn icon="↑" title="Move up"   disabled={isPendingFirst} onClick={() => onMoveUp(item)}   color="#6366F1" />
                <ActionBtn icon="↓" title="Move down" disabled={isPendingLast}  onClick={() => onMoveDown(item)} color="#6366F1" />
              </>
            )}
            {/* Edit (pending only) */}
            {item.status === 'PENDING' && (
              <ActionBtn icon="✏" title="Edit" onClick={() => onEdit(item)} color="#1D3557" />
            )}
            {/* Status transitions */}
            {item.status === 'PRINTED' && (
              <button style={t.transitionBtn} onClick={() => onMarkOrdered(item)}>✔ Mark Ordered</button>
            )}
            {item.status === 'ORDERED' && (
              <button style={{ ...t.transitionBtn, background: '#D1FAE5', color: '#065F46', borderColor: '#6EE7B7' }} onClick={() => onMarkReceived(item)}>
                ✔ Mark Received
              </button>
            )}
            {/* Delete (pending only) */}
            {item.status === 'PENDING' && (
              <ActionBtn icon="🗑" title="Remove" onClick={() => onDelete(item)} color="#E63946" />
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

function ActionBtn({ icon, title, onClick, color, disabled }: {
  icon: string; title: string; onClick: () => void; color: string; disabled?: boolean;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: hov && !disabled ? '#F1F5F9' : 'transparent',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '4px 7px', borderRadius: 6, fontSize: 14,
        color: disabled ? '#CBD5E1' : color,
        transition: 'background 0.1s',
      }}
    >
      {icon}
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function OrderListPage() {
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const isManager = user?.role === 'STORE_MANAGER';
  const isAdmin   = user?.role === 'SUPER_ADMIN' || user?.role === 'DEV_ADMIN';

  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [filterStatus,    setFilterStatus]    = useState<FilterStatus>('ALL');
  const [showAdd,         setShowAdd]         = useState(false);
  const [editItem,        setEditItem]        = useState<OrderItem | null>(null);
  const [showHistory,     setShowHistory]     = useState(false);
  const [printNotes,      setPrintNotes]      = useState('');
  const [showPrintInput,  setShowPrintInput]  = useState(false);

  // ── Summary ──────────────────────────────────────────────────────────────
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['admin-order-summary'],
    queryFn: () => orderListApi.getSummary(),
    refetchInterval: 30_000,
  });
  const stores: StoreSummary[] = summaryData?.data?.data || [];

  // Auto-select first store on load
  const firstStoreId = stores[0]?.storeId;
  const effectiveStoreId = selectedStoreId || firstStoreId || null;
  const selectedStore = stores.find(s => s.storeId === effectiveStoreId);

  // ── Items ─────────────────────────────────────────────────────────────────
  const { data: itemsData, isLoading: itemsLoading, refetch: refetchItems } = useQuery({
    queryKey: ['admin-order-list', effectiveStoreId],
    queryFn: () => orderListApi.getStoreItems(effectiveStoreId!),
    enabled: !!effectiveStoreId,
    refetchInterval: 30_000,
  });
  const allItems: OrderItem[] = itemsData?.data?.data || [];

  const filtered = useMemo(() => {
    const items = filterStatus === 'ALL'
      ? allItems.filter(i => i.status !== 'REMOVED')
      : allItems.filter(i => i.status === filterStatus);
    const order = { URGENT: 0, NORMAL: 1, LOW: 2 };
    return [...items].sort((a, b) => {
      if (order[a.priority] !== order[b.priority]) return order[a.priority] - order[b.priority];
      return a.sortOrder - b.sortOrder;
    });
  }, [allItems, filterStatus]);

  const pendingItems  = allItems.filter(i => i.status === 'PENDING');
  const printedItems  = allItems.filter(i => i.status === 'PRINTED');
  const pendingSorted = useMemo(() => {
    const order = { URGENT: 0, NORMAL: 1, LOW: 2 };
    return [...pendingItems].sort((a, b) => order[a.priority] - order[b.priority] || a.sortOrder - b.sortOrder);
  }, [pendingItems]);

  const tabCounts: Record<FilterStatus, number> = useMemo(() => ({
    ALL:      allItems.filter(i => i.status !== 'REMOVED').length,
    PENDING:  pendingItems.length,
    PRINTED:  printedItems.length,
    ORDERED:  allItems.filter(i => i.status === 'ORDERED').length,
    RECEIVED: allItems.filter(i => i.status === 'RECEIVED').length,
    REMOVED:  allItems.filter(i => i.status === 'REMOVED').length,
  }), [allItems, pendingItems, printedItems]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const removeMutation = useMutation({
    mutationFn: (id: string) => orderListApi.removeItem(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-order-list', effectiveStoreId] }); qc.invalidateQueries({ queryKey: ['admin-order-summary'] }); toast.success('Item removed'); },
    onError: () => toast.error('Failed to remove item'),
  });

  const reorderMutation = useMutation({
    mutationFn: (items: { id: string; sortOrder: number }[]) =>
      orderListApi.reorderItems(effectiveStoreId!, items),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-order-list', effectiveStoreId] }),
  });

  const printMutation = useMutation({
    mutationFn: () => orderListApi.printItems(effectiveStoreId!, printNotes || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-list', effectiveStoreId] });
      qc.invalidateQueries({ queryKey: ['admin-order-summary'] });
      toast.success(`${pendingItems.length} item${pendingItems.length !== 1 ? 's' : ''} marked as printed!`);
      setShowPrintInput(false);
      setPrintNotes('');
    },
    onError: () => toast.error('Failed to print order list'),
  });

  const markOrderedMutation = useMutation({
    mutationFn: (ids: string[]) => orderListApi.markOrdered(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-order-list', effectiveStoreId] }); qc.invalidateQueries({ queryKey: ['admin-order-summary'] }); toast.success('Marked as ordered'); },
    onError: () => toast.error('Failed to update status'),
  });

  const markReceivedMutation = useMutation({
    mutationFn: (ids: string[]) => orderListApi.markReceived(ids),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-order-list', effectiveStoreId] }); toast.success('Marked as received ✓'); },
    onError: () => toast.error('Failed to update status'),
  });

  function handleMoveUp(item: OrderItem) {
    const idx = pendingSorted.findIndex(i => i.id === item.id);
    if (idx === 0) return;
    const swap = pendingSorted[idx - 1];
    reorderMutation.mutate([{ id: item.id, sortOrder: swap.sortOrder }, { id: swap.id, sortOrder: item.sortOrder }]);
  }
  function handleMoveDown(item: OrderItem) {
    const idx = pendingSorted.findIndex(i => i.id === item.id);
    if (idx === pendingSorted.length - 1) return;
    const swap = pendingSorted[idx + 1];
    reorderMutation.mutate([{ id: item.id, sortOrder: swap.sortOrder }, { id: swap.id, sortOrder: item.sortOrder }]);
  }
  function handleDelete(item: OrderItem) {
    if (window.confirm(`Remove "${item.name}" from the order list?`)) {
      removeMutation.mutate(item.id);
    }
  }
  function handlePrint() {
    if (pendingItems.length === 0) { toast.error('No pending items to print'); return; }
    setShowPrintInput(true);
  }

  return (
    <div style={p.page}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={p.header}>
        <div>
          <h1 style={p.title}>📦 Order List</h1>
          <p style={p.subtitle}>Track what needs to be ordered across all stores</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {effectiveStoreId && (
            <button style={p.historyBtn} onClick={() => setShowHistory(true)}>
              🖨 Print History
            </button>
          )}
          {effectiveStoreId && (
            <button
              style={{ ...p.printBtn, ...(pendingItems.length === 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }}
              onClick={handlePrint}
              disabled={pendingItems.length === 0 || printMutation.isPending}
            >
              {printMutation.isPending ? 'Printing…' : `🖨 Print Pending (${pendingItems.length})`}
            </button>
          )}
          {effectiveStoreId && (
            <button style={p.addBtn} onClick={() => setShowAdd(true)}>+ Add Item</button>
          )}
        </div>
      </div>

      {/* ── Print notes input ───────────────────────────────────────────────── */}
      {showPrintInput && (
        <div style={p.printBar}>
          <span style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>
            Print {pendingItems.length} pending items for {selectedStore?.storeName}
          </span>
          <input
            style={{ ...ms.input, flex: 1, maxWidth: 320, margin: '0 12px' }}
            placeholder="Optional note (e.g. 'Morning run, check produce')"
            value={printNotes}
            onChange={e => setPrintNotes(e.target.value)}
          />
          <button style={p.printConfirmBtn} onClick={() => printMutation.mutate()} disabled={printMutation.isPending}>
            {printMutation.isPending ? 'Printing…' : 'Confirm Print'}
          </button>
          <button style={p.cancelSmBtn} onClick={() => setShowPrintInput(false)}>Cancel</button>
        </div>
      )}

      {/* ── Store Summary Cards ─────────────────────────────────────────────── */}
      {summaryLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading stores…</div>
      ) : (
        <div style={p.storeGrid}>
          {stores.map(store => {
            const isSelected = store.storeId === effectiveStoreId;
            const totalActive = store.pendingCount + store.printedCount + store.orderedCount;
            return (
              <div
                key={store.storeId}
                onClick={() => { setSelectedStoreId(store.storeId); setFilterStatus('ALL'); }}
                style={{ ...p.storeCard, ...(isSelected ? p.storeCardActive : {}) }}
              >
                <div style={p.storeCardHeader}>
                  <span style={p.storeName}>{store.storeName}</span>
                  {store.urgentCount > 0 && (
                    <span style={p.urgentBadge}>⚠ {store.urgentCount} urgent</span>
                  )}
                </div>
                <div style={p.storeStats}>
                  <StatPill label="Pending" count={store.pendingCount} color="#D97706" />
                  <StatPill label="Printed" count={store.printedCount} color="#6366F1" />
                  <StatPill label="Ordered" count={store.orderedCount} color="#059669" />
                </div>
                {totalActive === 0 && (
                  <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>All clear ✓</div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Item Table ─────────────────────────────────────────────────────── */}
      {effectiveStoreId && (
        <div style={p.tableCard}>
          {/* Filter tabs + bulk actions */}
          <div style={p.tableToolbar}>
            <div style={{ display: 'flex', gap: 4 }}>
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFilterStatus(tab.key)}
                  style={{ ...p.filterTab, ...(filterStatus === tab.key ? p.filterTabActive : {}) }}
                >
                  {tab.label}
                  {tabCounts[tab.key] > 0 && (
                    <span style={{ ...p.filterBadge, ...(filterStatus === tab.key ? { background: '#fff', color: '#1D3557' } : {}) }}>
                      {tabCounts[tab.key]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Bulk: Mark all printed → ordered */}
            {filterStatus === 'PRINTED' && printedItems.length > 0 && (
              <button
                style={p.bulkBtn}
                onClick={() => markOrderedMutation.mutate(printedItems.map(i => i.id))}
                disabled={markOrderedMutation.isPending}
              >
                ✔ Mark All {printedItems.length} Ordered
              </button>
            )}

            <button style={p.refreshBtn} onClick={() => { refetchItems(); refetchSummary(); }} title="Refresh">↺ Refresh</button>
          </div>

          {itemsLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading items…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#9CA3AF' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#374151' }}>
                {filterStatus === 'ALL' ? 'No items on the list for this store' : `No ${filterStatus.toLowerCase()} items`}
              </div>
              {filterStatus === 'ALL' && (
                <div style={{ fontSize: 13, marginTop: 8, color: '#9CA3AF' }}>Add items using the + Add Item button above.</div>
              )}
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                  <th style={t.th}>Priority</th>
                  <th style={t.th}>Item</th>
                  <th style={t.th}>Added By</th>
                  <th style={t.th}>Status</th>
                  <th style={{ ...t.th, textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => {
                  const pendingList  = pendingSorted;
                  const pendingIdx   = pendingList.findIndex(i => i.id === item.id);
                  return (
                    <ItemRow
                      key={item.id}
                      item={item}
                      isManager={true}
                      isPendingFirst={pendingIdx === 0}
                      isPendingLast={pendingIdx === pendingList.length - 1}
                      onEdit={setEditItem}
                      onDelete={handleDelete}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      onMarkOrdered={it => markOrderedMutation.mutate([it.id])}
                      onMarkReceived={it => markReceivedMutation.mutate([it.id])}
                    />
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {showAdd && effectiveStoreId && (
        <ItemModal mode="add" storeId={effectiveStoreId} onClose={() => setShowAdd(false)} />
      )}
      {editItem && effectiveStoreId && (
        <ItemModal mode="edit" initial={editItem} storeId={effectiveStoreId} onClose={() => setEditItem(null)} />
      )}
      {showHistory && effectiveStoreId && selectedStore && (
        <PrintHistoryPanel storeId={effectiveStoreId} storeName={selectedStore.storeName} onClose={() => setShowHistory(false)} />
      )}
    </div>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────
function StatPill({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <span style={{ fontSize: 14, fontWeight: 800, color: count > 0 ? color : '#CBD5E1' }}>{count}</span>
      <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>{label}</span>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const p: Record<string, React.CSSProperties> = {
  page:       { maxWidth: 1200, margin: '0 auto', padding: '32px 24px', fontFamily: 'system-ui, sans-serif' },
  header:     { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 },
  title:      { margin: 0, fontSize: 26, fontWeight: 800, color: '#111827' },
  subtitle:   { margin: '4px 0 0', fontSize: 14, color: '#6B7280' },

  addBtn: {
    background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8,
    padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  printBtn: {
    background: '#fff', color: '#1D3557', border: '2px solid #1D3557', borderRadius: 8,
    padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  historyBtn: {
    background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8,
    padding: '9px 16px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },

  printBar: {
    display: 'flex', alignItems: 'center', gap: 8,
    background: '#EEF2FF', border: '1px solid #A5B4FC', borderRadius: 12,
    padding: '12px 16px', marginBottom: 20,
  },
  printConfirmBtn: {
    background: '#4F46E5', color: '#fff', border: 'none', borderRadius: 8,
    padding: '8px 16px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  cancelSmBtn: {
    background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB', borderRadius: 8,
    padding: '8px 14px', fontWeight: 600, fontSize: 13, cursor: 'pointer',
  },

  storeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 14, marginBottom: 28,
  },
  storeCard: {
    background: '#fff', borderRadius: 14, padding: '16px 18px',
    border: '2px solid #F1F5F9', cursor: 'pointer',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    transition: 'border-color 0.15s, box-shadow 0.15s',
  },
  storeCardActive: {
    borderColor: '#1D3557',
    boxShadow: '0 4px 14px rgba(29,53,87,0.15)',
  },
  storeCardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  storeName:    { fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.3 },
  urgentBadge:  { fontSize: 11, color: '#DC2626', background: '#FEE2E2', padding: '2px 7px', borderRadius: 10, fontWeight: 700 },
  storeStats:   { display: 'flex', gap: 14 },

  tableCard: {
    background: '#fff', borderRadius: 16, border: '1px solid #E2E8F0',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', overflow: 'hidden',
  },
  tableToolbar: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '14px 16px',
    borderBottom: '1px solid #F1F5F9', flexWrap: 'wrap',
  },
  filterTab: {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 14px', borderRadius: 20, border: '1px solid #E5E7EB',
    background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600,
    color: '#6B7280', transition: 'all 0.15s',
  },
  filterTabActive: { background: '#1D3557', borderColor: '#1D3557', color: '#fff' },
  filterBadge: {
    background: '#E5E7EB', color: '#374151', borderRadius: 10,
    padding: '0 6px', fontSize: 11, fontWeight: 700, lineHeight: '16px',
  },
  bulkBtn: {
    marginLeft: 'auto', background: '#D1FAE5', color: '#065F46',
    border: '1px solid #6EE7B7', borderRadius: 8,
    padding: '7px 14px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  refreshBtn: {
    background: 'transparent', color: '#6B7280', border: '1px solid #E5E7EB',
    borderRadius: 8, padding: '7px 12px', fontSize: 13, cursor: 'pointer', fontWeight: 600,
  },
};

const t: Record<string, React.CSSProperties> = {
  th: {
    padding: '10px 12px', textAlign: 'left', fontSize: 11,
    fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5,
  },
  badge: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
    border: '1px solid transparent',
  },
  transitionBtn: {
    background: '#EEF2FF', color: '#4338CA', border: '1px solid #A5B4FC',
    borderRadius: 7, padding: '5px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
  },
};

const ms: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: 1000, padding: 20,
  },
  modal: {
    background: '#fff', borderRadius: 16, padding: '24px',
    width: '100%', maxWidth: 480,
    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  title:  { fontSize: 18, fontWeight: 800, color: '#111827', margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', cursor: 'pointer',
    fontSize: 16, color: '#9CA3AF', padding: '4px 8px',
  },
  field: { marginBottom: 16 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  input: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #E5E7EB', fontSize: 14, color: '#111827',
    outline: 'none', boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif',
  },
  select: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #E5E7EB', fontSize: 14, color: '#111827',
    outline: 'none', background: '#fff', cursor: 'pointer',
    fontFamily: 'system-ui, sans-serif',
  },
  textarea: {
    width: '100%', padding: '10px 12px', borderRadius: 8,
    border: '1.5px solid #E5E7EB', fontSize: 14, color: '#111827',
    outline: 'none', resize: 'vertical', boxSizing: 'border-box',
    fontFamily: 'system-ui, sans-serif',
  },
  priorityBtn: {
    flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid #E5E7EB',
    background: '#fff', cursor: 'pointer', fontSize: 13, color: '#9CA3AF',
    fontWeight: 500, transition: 'all 0.15s',
  },
  cancelBtn: {
    flex: 1, padding: '11px', borderRadius: 10, border: '1.5px solid #E5E7EB',
    background: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#6B7280',
  },
  saveBtn: {
    flex: 2, padding: '11px', borderRadius: 10, border: 'none',
    background: '#1D3557', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff',
  },
};

const ph: Record<string, React.CSSProperties> = {
  jobCard: {
    padding: '14px 16px', borderBottom: '1px solid #F1F5F9',
  },
  jobHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  jobCount:  { fontSize: 14, fontWeight: 700, color: '#111827' },
  jobDate:   { fontSize: 12, color: '#9CA3AF' },
};
