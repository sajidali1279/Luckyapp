import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { orderListApi, orderCategoriesApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Store { id: string; name: string }

interface OrderListItem {
  id: string;
  name: string;
  quantity?: string;
  category?: string;
  notes?: string;
  priority: 'URGENT' | 'NORMAL' | 'LOW';
  status: 'PENDING' | 'ORDERED' | 'RECEIVED' | 'REMOVED';
  source: 'MANAGER' | 'EMPLOYEE_REQUEST';
  addedBy: { id: string; name: string };
  sortOrder: number;
}

interface OrderList {
  id: string;
  name: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt?: string;
  openedBy: { id: string; name: string };
  closedBy?: { id: string; name: string };
  store: { id: string; name: string };
  items: OrderListItem[];
  _count: { items: number };
}

interface OrderCategory {
  id: string;
  name: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  usageCount: number;
  storeId: string | null;
  approvedAt?: string;
  approvedBy?: { id: string; name: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_CFG = {
  URGENT: { label: 'Urgent', bg: '#FEE2E2', text: '#DC2626' },
  NORMAL: { label: 'Normal', bg: '#F3F4F6', text: '#4B5563' },
  LOW:    { label: 'Low',    bg: '#EFF6FF', text: '#2563EB' },
};

const ITEM_STATUS_CFG = {
  PENDING:  { label: 'Needed',   bg: '#FEF3C7', text: '#D97706' },
  ORDERED:  { label: 'Ordered',  bg: '#D1FAE5', text: '#059669' },
  RECEIVED: { label: 'Received', bg: '#DCFCE7', text: '#16A34A' },
  REMOVED:  { label: 'Removed',  bg: '#F3F4F6', text: '#9CA3AF' },
};

const CAT_STATUS_CFG = {
  PENDING:  { label: 'Pending',  bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  APPROVED: { label: 'Approved', bg: '#D1FAE5', text: '#059669', border: '#6EE7B7' },
  REJECTED: { label: 'Rejected', bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
};

// ─── Add Item Modal (DevAdmin passive helper) ─────────────────────────────────

function AddItemModal({ listId, onClose, onSaved }: { listId: string; onClose: () => void; onSaved: () => void }) {
  const [name, setName]         = useState('');
  const [quantity, setQuantity] = useState('');
  const [category, setCategory] = useState('');
  const [notes, setNotes]       = useState('');
  const qc = useQueryClient();

  const addMutation = useMutation({
    mutationFn: () => orderListApi.addItem(listId, {
      name: name.trim(), quantity: quantity.trim() || undefined,
      category: category.trim() || undefined, notes: notes.trim() || undefined,
    }),
    onSuccess: () => {
      toast.success('Item added');
      qc.invalidateQueries({ queryKey: ['admin-order-lists'] });
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', listId] });
      onSaved();
    },
    onError: () => toast.error('Failed to add item'),
  });

  return (
    <div style={m.backdrop} onClick={onClose}>
      <div style={m.modal} onClick={e => e.stopPropagation()}>
        <div style={m.modalHeader}>
          <span style={m.modalTitle}>Add Item (DevAdmin)</span>
          <button style={m.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div style={m.field}><label style={m.label}>Item Name *</label>
          <input style={m.input} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Whole Milk 2%" maxLength={120} />
        </div>
        <div style={m.field}><label style={m.label}>Quantity</label>
          <input style={m.input} value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 2 cases" maxLength={60} />
        </div>
        <div style={m.field}><label style={m.label}>Category</label>
          <input style={m.input} value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Groceries" maxLength={80} />
        </div>
        <div style={m.field}><label style={m.label}>Notes</label>
          <textarea style={m.textarea} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any details..." maxLength={300} rows={3} />
        </div>
        <button style={{ ...m.primaryBtn, opacity: addMutation.isPending ? 0.6 : 1 }}
          onClick={() => addMutation.mutate()} disabled={addMutation.isPending || !name.trim()}>
          {addMutation.isPending ? 'Adding...' : 'Add Item'}
        </button>
      </div>
    </div>
  );
}

// ─── Order List Detail ────────────────────────────────────────────────────────

function OrderListDetail({ list, canEdit, onBack, onListChanged }: {
  list: OrderList; canEdit: boolean; onBack: () => void; onListChanged: () => void;
}) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);

  const closeMutation = useMutation({
    mutationFn: () => orderListApi.closeList(list.id),
    onSuccess: () => {
      toast.success('List closed');
      qc.invalidateQueries({ queryKey: ['admin-order-lists'] });
      onListChanged();
      onBack();
    },
    onError: () => toast.error('Failed to close list'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => orderListApi.updateItemStatus(id, status),
    onSuccess: () => {
      toast.success('Item updated');
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      onListChanged();
    },
    onError: () => toast.error('Failed to update'),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => orderListApi.removeItem(itemId),
    onSuccess: () => {
      toast.success('Item removed');
      // Invalidate grid so card count updates immediately
      qc.invalidateQueries({ queryKey: ['admin-order-lists'] });
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      onListChanged();
    },
    onError: () => toast.error('Failed to remove'),
  });

  const visibleItems = list.items?.filter(i => i.status !== 'REMOVED') || [];
  const grouped = useMemo(() => {
    const map = new Map<string, OrderListItem[]>();
    for (const item of visibleItems) {
      const key = item.category || 'Uncategorized';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return Array.from(map.entries());
  }, [visibleItems]);

  const pending  = visibleItems.filter(i => i.status === 'PENDING').length;
  const ordered  = visibleItems.filter(i => i.status === 'ORDERED').length;
  const received = visibleItems.filter(i => i.status === 'RECEIVED').length;

  return (
    <div>
      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <button style={s.breadcrumbBtn} onClick={onBack}>← All Lists</button>
        <span style={s.breadcrumbSep}>/</span>
        <span style={s.breadcrumbCur}>{list.name}</span>
      </div>

      {/* List header */}
      <div style={s.listDetailHeader}>
        <div>
          <div style={s.listDetailTitle}>{list.name}</div>
          <div style={s.listDetailMeta}>
            {list.store.name} · Opened {new Date(list.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {' by '}{list.openedBy.name}
            {list.status === 'CLOSED' && list.closedAt && ` · Closed ${new Date(list.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </div>
          <div style={s.listDetailStats}>
            <span style={{ color: '#D97706', fontWeight: 600 }}>{pending} needed</span>
            {ordered  > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>{ordered} ordered</span>}
            {received > 0 && <span style={{ color: '#16A34A', fontWeight: 600 }}>{received} received</span>}
          </div>
        </div>
        {canEdit && list.status === 'OPEN' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={s.addItemBtn} onClick={() => setShowAdd(true)}>+ Add Item</button>
            <button style={s.closeListBtn}
              onClick={() => { if (confirm('Close this list? This means the order has been placed.')) closeMutation.mutate(); }}
              disabled={closeMutation.isPending}>
              {closeMutation.isPending ? 'Closing...' : 'Close List'}
            </button>
          </div>
        )}
      </div>

      {/* Items by category */}
      {grouped.length === 0 ? (
        <div style={s.empty}>No items on this list.</div>
      ) : (
        grouped.map(([cat, catItems]) => (
          <div key={cat} style={s.catSection}>
            <div style={s.catHeader}>{cat}</div>
            <div style={s.itemsGrid}>
              {catItems.map(item => {
                const pc = PRIORITY_CFG[item.priority];
                const sc = ITEM_STATUS_CFG[item.status];
                return (
                  <div key={item.id} style={s.itemCard}>
                    <div style={s.itemCardTop}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <span style={{ ...s.badge, background: pc.bg, color: pc.text }}>{pc.label}</span>
                        <span style={{ ...s.badge, background: sc.bg, color: sc.text }}>{sc.label}</span>
                        {item.source === 'EMPLOYEE_REQUEST' && (
                          <span style={{ ...s.badge, background: '#F0FDF4', color: '#16A34A' }}>Request</span>
                        )}
                      </div>
                      {canEdit && list.status === 'OPEN' && (
                        <button style={s.removeBtn} onClick={() => { if (confirm(`Remove "${item.name}"?`)) removeMutation.mutate(item.id); }}>✕</button>
                      )}
                    </div>
                    <div style={s.itemName}>{item.name}</div>
                    {item.quantity && <div style={s.itemMeta}>Qty: {item.quantity}</div>}
                    {item.notes && <div style={s.itemNote}>{item.notes}</div>}
                    <div style={s.itemBy}>Added by {item.addedBy?.name}</div>
                    {canEdit && list.status === 'OPEN' && (
                      <div style={s.itemActions}>
                        {item.status === 'PENDING' && (
                          <button style={s.statusBtnGreen} onClick={() => statusMutation.mutate({ id: item.id, status: 'ORDERED' })}>
                            Mark Ordered
                          </button>
                        )}
                        {item.status === 'ORDERED' && (
                          <button style={s.statusBtnPurple} onClick={() => statusMutation.mutate({ id: item.id, status: 'RECEIVED' })}>
                            Mark Received
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {showAdd && (
        <AddItemModal
          listId={list.id}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); onListChanged(); }}
        />
      )}
    </div>
  );
}

// ─── Tab: Order Lists ─────────────────────────────────────────────────────────

function OrderListsTab({ canEdit }: { canEdit: boolean }) {
  const [filterStoreId, setFilterStoreId] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [selectedList,  setSelectedList]  = useState<OrderList | null>(null);

  const qc = useQueryClient();

  const { data: storesData } = useQuery({
    queryKey: ['stores-all'],
    queryFn: storesApi.getAll,
  });
  const stores: Store[] = storesData?.data?.data || [];

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['admin-order-lists', filterStoreId, filterStatus],
    queryFn: () => orderListApi.adminGetAll({
      storeId: filterStoreId || undefined,
      status: filterStatus || undefined,
    }),
    refetchInterval: 30000,
  });
  const lists: OrderList[] = data?.data?.data?.lists || [];

  // Full list (with items) fetched on demand when a card is clicked
  const { data: fullListData, isLoading: fullListLoading, refetch: refetchFull } = useQuery({
    queryKey: ['admin-order-list-detail', selectedList?.id],
    queryFn: () => orderListApi.getById(selectedList!.id),
    enabled: !!selectedList,
  });
  const fullList: OrderList | null = fullListData?.data?.data || null;

  const refresh = () => { refetch(); setSelectedList(null); };

  if (selectedList) {
    return fullListLoading ? (
      <div style={s.loading}>Loading list…</div>
    ) : fullList ? (
      <OrderListDetail
        list={fullList}
        canEdit={canEdit}
        onBack={() => setSelectedList(null)}
        onListChanged={() => { refetch(); refetchFull(); }}
      />
    ) : (
      <div style={s.empty}>Failed to load list.</div>
    );
  }

  return (
    <div>
      {/* Filters */}
      <div style={s.filters}>
        <select style={s.filterSelect} value={filterStoreId} onChange={e => setFilterStoreId(e.target.value)}>
          <option value="">All Stores</option>
          {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
        <select style={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="OPEN">Open</option>
          <option value="CLOSED">Closed</option>
        </select>
        <button style={s.refreshBtn} onClick={() => refetch()}>↺ Refresh</button>
      </div>

      {isLoading ? (
        <div style={s.loading}>Loading lists…</div>
      ) : lists.length === 0 ? (
        <div style={s.empty}>No order lists found.</div>
      ) : (
        <div style={s.listsGrid}>
          {lists.map(list => {
            const isOpen     = list.status === 'OPEN';
            const itemCount  = list._count?.items ?? list.items?.length ?? 0;
            const pending    = list.items?.filter(i => i.status === 'PENDING').length ?? 0;
            const received   = list.items?.filter(i => i.status === 'RECEIVED').length ?? 0;
            return (
              <div key={list.id} style={{ ...s.listCard, borderLeft: `4px solid ${isOpen ? '#10B981' : '#94A3B8'}` }}
                onClick={() => setSelectedList(list)}>
                <div style={s.listCardTop}>
                  <span style={{ ...s.statusPill, background: isOpen ? '#D1FAE5' : '#F3F4F6', color: isOpen ? '#059669' : '#6B7280' }}>
                    {isOpen ? '● Open' : '✓ Closed'}
                  </span>
                  <span style={s.listCardDate}>
                    {new Date(list.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <div style={s.listCardName}>{list.name}</div>
                <div style={s.listCardStore}>{list.store?.name}</div>
                <div style={s.listCardStats}>
                  <span>{itemCount} item{itemCount !== 1 ? 's' : ''}</span>
                  {pending   > 0 && <span style={{ color: '#D97706' }}>{pending} needed</span>}
                  {received  > 0 && <span style={{ color: '#16A34A' }}>{received} received</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Tab: Categories ──────────────────────────────────────────────────────────

function CategoriesTab() {
  const qc = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('PENDING'); // default to pending
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editName,     setEditName]     = useState('');
  const [approvingId,  setApprovingId]  = useState<string | null>(null);
  const [approveEdit,  setApproveEdit]  = useState('');

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['order-categories-admin', filterStatus],
    queryFn: () => orderCategoriesApi.adminGetAll(filterStatus || undefined),
  });
  const categories: OrderCategory[] = data?.data?.data || [];

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) => orderCategoriesApi.adminUpdate(id, data),
    onSuccess: (_r, vars: any) => {
      const wasApprove = (vars.data as any).status === 'APPROVED';
      toast.success(wasApprove ? 'Category approved — all list items updated' : 'Category updated');
      qc.invalidateQueries({ queryKey: ['order-categories-admin'] });
      setEditingId(null);
      setApprovingId(null);
    },
    onError: () => toast.error('Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => orderCategoriesApi.adminDelete(id),
    onSuccess: () => { toast.success('Category deleted'); qc.invalidateQueries({ queryKey: ['order-categories-admin'] }); },
    onError: () => toast.error('Failed to delete'),
  });

  const pendingCount = categories.filter(c => c.status === 'PENDING').length;
  const allPendingCount = (data?.data?.data as any[])?.filter?.((c: any) => c.status === 'PENDING').length || pendingCount;

  const openApprove = (cat: OrderCategory) => {
    setApprovingId(cat.id);
    setApproveEdit(cat.name);
    setEditingId(null);
  };

  const confirmApprove = (id: string) => {
    if (!approveEdit.trim()) return;
    updateMutation.mutate({ id, data: { name: approveEdit.trim(), status: 'APPROVED' } });
  };

  return (
    <div>
      <div style={s.filters}>
        <select style={s.filterSelect} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Statuses</option>
          <option value="PENDING">Pending</option>
          <option value="APPROVED">Approved</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <button style={s.refreshBtn} onClick={() => refetch()}>↺ Refresh</button>
        {pendingCount > 0 && (
          <span style={s.pendingBadge}>{pendingCount} awaiting review</span>
        )}
      </div>

      {pendingCount > 0 && (
        <div style={s.approveHint}>
          ℹ️ When approving, you can edit the name to fix typos — the correction will automatically apply to every item on every list.
        </div>
      )}

      {isLoading ? (
        <div style={s.loading}>Loading categories…</div>
      ) : categories.length === 0 ? (
        <div style={s.empty}>No categories found.</div>
      ) : (
        <div style={s.catTable}>
          <div style={s.catTableHead}>
            <span>Category Name</span>
            <span>Uses</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {categories.map(cat => {
            const cfg = CAT_STATUS_CFG[cat.status];
            const isApproving = approvingId === cat.id;
            const isEditing   = editingId === cat.id;
            return (
              <div key={cat.id} style={{ ...s.catTableRow, ...(cat.status === 'PENDING' ? { background: '#FFFBEB' } : {}) }}>
                {/* Name column */}
                {isApproving ? (
                  <div style={s.editRow}>
                    <input
                      style={{ ...s.input, flex: 1, borderColor: '#10B981' }}
                      value={approveEdit}
                      onChange={e => setApproveEdit(e.target.value)}
                      maxLength={80}
                      autoFocus
                    />
                  </div>
                ) : isEditing ? (
                  <div style={s.editRow}>
                    <input style={{ ...s.input, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} maxLength={80} autoFocus />
                    <button style={s.saveBtnSm} onClick={() => updateMutation.mutate({ id: cat.id, data: { name: editName } })}
                      disabled={updateMutation.isPending || !editName.trim()}>
                      Save
                    </button>
                    <button style={s.cancelBtnSm} onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                ) : (
                  <span style={s.catName}>
                    {cat.name}
                    {cat.storeId && <span style={s.storeTag}>store-specific</span>}
                  </span>
                )}

                <span style={s.catUses}>{cat.usageCount}</span>
                <span style={{ ...s.statusPill, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}` }}>
                  {cfg.label}
                </span>

                {/* Actions */}
                <div style={s.catActions}>
                  {isApproving ? (
                    <>
                      <button
                        style={s.approveBtn}
                        onClick={() => confirmApprove(cat.id)}
                        disabled={updateMutation.isPending || !approveEdit.trim()}
                      >
                        {updateMutation.isPending ? '…' : approveEdit.trim() !== cat.name ? 'Approve & Rename' : 'Approve'}
                      </button>
                      <button style={s.cancelBtnSm} onClick={() => setApprovingId(null)}>Cancel</button>
                    </>
                  ) : (
                    <>
                      {(cat.status === 'PENDING' || cat.status === 'REJECTED') && (
                        <button style={s.approveBtn} onClick={() => openApprove(cat)} disabled={updateMutation.isPending}>
                          {cat.status === 'REJECTED' ? 'Re-approve' : 'Approve…'}
                        </button>
                      )}
                      {cat.status !== 'REJECTED' && (
                        <button style={s.rejectBtnSm}
                          onClick={() => updateMutation.mutate({ id: cat.id, data: { status: 'REJECTED' } })}
                          disabled={updateMutation.isPending}>
                          Reject
                        </button>
                      )}
                      <button style={s.editBtnSm}
                        onClick={() => { setEditingId(cat.id); setEditName(cat.name); setApprovingId(null); }}>
                        Rename
                      </button>
                      <button style={s.deleteBtnSm}
                        onClick={() => { if (confirm(`Delete category "${cat.name}"?`)) deleteMutation.mutate(cat.id); }}
                        disabled={deleteMutation.isPending}>
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OrderListPage() {
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'lists' | 'categories'>('lists');

  const isDevAdmin   = user?.role === 'DEV_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const canEdit      = isDevAdmin;   // Only DevAdmin can add/close passively

  return (
    <div style={s.page}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>📦 Order Lists</h1>
          <p style={s.pageSubtitle}>
            {isDevAdmin
              ? 'View all store order lists. You can add items or close lists when helping out.'
              : 'Read-only view of all store order lists.'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div style={s.tabs}>
        <button style={{ ...s.tab, ...(tab === 'lists' && s.tabActive) }} onClick={() => setTab('lists')}>
          Order Lists
        </button>
        {isDevAdmin && (
          <button style={{ ...s.tab, ...(tab === 'categories' && s.tabActive) }} onClick={() => setTab('categories')}>
            Categories
          </button>
        )}
      </div>

      <div style={s.tabContent}>
        {tab === 'lists'      && <OrderListsTab canEdit={canEdit} />}
        {tab === 'categories' && isDevAdmin && <CategoriesTab />}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:       { maxWidth: 1200, margin: '0 auto', padding: '24px 20px' },
  pageHeader: { marginBottom: 24 },
  pageTitle:  { fontSize: 24, fontWeight: 800, color: '#1E293B', margin: 0 },
  pageSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },

  tabs:       { display: 'flex', gap: 4, borderBottom: '2px solid #E2E8F0', marginBottom: 24 },
  tab:        { padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', marginBottom: -2, transition: 'all 0.15s' },
  tabActive:  { color: '#1D3557', borderBottomColor: '#1D3557' },
  tabContent: {},

  filters:      { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer' },
  refreshBtn:   { padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 13, color: '#64748B', background: '#fff', cursor: 'pointer' },
  pendingBadge:  { padding: '4px 12px', borderRadius: 20, background: '#FEF3C7', color: '#D97706', fontSize: 13, fontWeight: 700 },
  approveHint: {
    background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 10,
    padding: '10px 16px', fontSize: 13, color: '#065F46', marginBottom: 16, lineHeight: 1.5,
  },

  loading: { padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 15 },
  empty:   { padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 15 },

  // Lists grid
  listsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  listCard: {
    background: '#fff', borderRadius: 12, padding: 16,
    cursor: 'pointer', transition: 'box-shadow 0.2s, transform 0.15s',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0',
  },
  listCardTop:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listCardName:  { fontSize: 15, fontWeight: 700, color: '#1E293B', marginBottom: 4 },
  listCardStore: { fontSize: 13, color: '#64748B', marginBottom: 8 },
  listCardDate:  { fontSize: 12, color: '#94A3B8' },
  listCardStats: { display: 'flex', gap: 12, fontSize: 13, flexWrap: 'wrap' },

  statusPill: { padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600 },

  // Detail view
  breadcrumb:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 },
  breadcrumbBtn: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: 0 },
  breadcrumbSep: { color: '#CBD5E1' },
  breadcrumbCur: { fontSize: 14, color: '#64748B' },

  listDetailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, padding: '20px', background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #E2E8F0' },
  listDetailTitle:  { fontSize: 20, fontWeight: 800, color: '#1E293B', marginBottom: 4 },
  listDetailMeta:   { fontSize: 13, color: '#64748B', marginBottom: 8 },
  listDetailStats:  { display: 'flex', gap: 16, fontSize: 14 },

  addItemBtn: {
    padding: '8px 16px', borderRadius: 8, border: '2px solid #1D3557', background: '#fff',
    color: '#1D3557', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
  closeListBtn: {
    padding: '8px 16px', borderRadius: 8, background: '#EF4444', border: 'none',
    color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },

  catSection: { marginBottom: 24 },
  catHeader:  { fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, paddingLeft: 4 },
  itemsGrid:  { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 },

  itemCard:    { background: '#fff', borderRadius: 10, padding: 14, border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' },
  itemCardTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 6 },
  badge:       { padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 },
  itemName:    { fontSize: 15, fontWeight: 700, color: '#1E293B', marginBottom: 4 },
  itemMeta:    { fontSize: 12, color: '#64748B', marginBottom: 2 },
  itemNote:    { fontSize: 12, color: '#94A3B8', fontStyle: 'italic', marginBottom: 4 },
  itemBy:      { fontSize: 11, color: '#CBD5E1', marginTop: 4 },
  itemActions: { marginTop: 10, display: 'flex', gap: 6 },
  removeBtn:   { background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px', borderRadius: 4 },

  statusBtnGreen:  { padding: '6px 12px', borderRadius: 8, background: '#D1FAE5', color: '#059669', border: '1px solid #6EE7B7', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  statusBtnPurple: { padding: '6px 12px', borderRadius: 8, background: '#EDE9FE', color: '#7C3AED', border: '1px solid #C4B5FD', fontSize: 12, fontWeight: 700, cursor: 'pointer' },

  // Category table
  catTable:     { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' },
  catTableHead: { display: 'grid', gridTemplateColumns: '1fr 80px 130px 1fr', gap: 0, padding: '12px 16px', background: '#F8FAFC', fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' },
  catTableRow:  { display: 'grid', gridTemplateColumns: '1fr 80px 130px 1fr', gap: 0, padding: '12px 16px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' },
  catName:      { fontSize: 14, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 },
  catUses:      { fontSize: 14, color: '#64748B' },
  catActions:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  storeTag:     { fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#F1F5F9', color: '#94A3B8', fontWeight: 500 },

  editRow: { display: 'flex', alignItems: 'center', gap: 8 },
  approveBtn:   { padding: '5px 12px', borderRadius: 6, background: '#D1FAE5', color: '#059669', border: '1px solid #6EE7B7', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  rejectBtnSm:  { padding: '5px 12px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  editBtnSm:    { padding: '5px 10px', borderRadius: 6, background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  deleteBtnSm:  { padding: '5px 10px', borderRadius: 6, background: '#F9FAFB', color: '#6B7280', border: '1px solid #E5E7EB', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  saveBtnSm:    { padding: '5px 12px', borderRadius: 6, background: '#1D3557', color: '#fff', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  cancelBtnSm:  { padding: '5px 10px', borderRadius: 6, background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 12, cursor: 'pointer' },
};

// Modal styles
const m: Record<string, React.CSSProperties> = {
  backdrop: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal:    { background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle:  { fontSize: 18, fontWeight: 800, color: '#1E293B' },
  closeBtn:    { background: 'none', border: 'none', fontSize: 20, color: '#94A3B8', cursor: 'pointer', lineHeight: 1 },
  field:  { marginBottom: 14 },
  label:  { display: 'block', fontSize: 12, fontWeight: 700, color: '#64748B', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.04em' },
  input:  { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#1E293B', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#1E293B', boxSizing: 'border-box', resize: 'vertical' },
  primaryBtn: { width: '100%', padding: '13px 0', borderRadius: 10, background: '#1D3557', color: '#fff', fontSize: 15, fontWeight: 700, border: 'none', cursor: 'pointer', marginTop: 8 },
};
