import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { orderListApi, orderCategoriesApi, storesApi, employeeRequestApi, inventoryAnalyticsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Store { id: string; name: string; orderInstructions?: string | null }

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
  store: { id: string; name: string; orderInstructions?: string | null };
  items: OrderListItem[];
  _count: { items: number };
}

interface OrderCategory {
  id: string; name: string; status: 'PENDING' | 'APPROVED' | 'REJECTED';
  usageCount: number; storeId: string | null;
}

interface ReqLine {
  id: string; name: string; quantity?: string; category?: string;
  notes?: string; status: string; rejectionReason?: string; rejectionNote?: string;
}

interface EmpRequest {
  id: string; status: string; note?: string; requestType: string; createdAt: string;
  submittedBy: { id: string; name: string; role: string };
  reviewedBy?: { id: string; name: string };
  store: { id: string; name: string };
  lines: ReqLine[];
}

interface QuickItem { name: string; category: string | null; count: number }

// ─── Config ───────────────────────────────────────────────────────────────────

const PRIORITY_CFG = {
  URGENT: { label: 'Urgent', bg: '#FEE2E2', text: '#DC2626' },
  NORMAL: { label: 'Normal', bg: '#F1F5F9', text: '#64748B' },
  LOW:    { label: 'Low',    bg: '#F0FDF4', text: '#16A34A' },
};

const ITEM_STATUS_CFG = {
  PENDING:  { label: 'Needed',   bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  ORDERED:  { label: 'Ordered',  bg: '#D1FAE5', text: '#059669', border: '#6EE7B7' },
  RECEIVED: { label: 'Received', bg: '#EDE9FE', text: '#7C3AED', border: '#C4B5FD' },
  REMOVED:  { label: 'Removed',  bg: '#F3F4F6', text: '#5a6472', border: '#E5E7EB' },
};

const CAT_STATUS_CFG = {
  PENDING:  { label: 'Pending',  bg: '#FEF3C7', text: '#D97706', border: '#FDE68A' },
  APPROVED: { label: 'Approved', bg: '#D1FAE5', text: '#059669', border: '#6EE7B7' },
  REJECTED: { label: 'Rejected', bg: '#FEE2E2', text: '#DC2626', border: '#FECACA' },
};

// ─── Print helper ─────────────────────────────────────────────────────────────

function printList(list: OrderList) {
  const visibleItems = list.items?.filter(i => i.status !== 'REMOVED') || [];
  const grouped = new Map<string, OrderListItem[]>();
  for (const item of visibleItems) {
    const key = item.category || 'Uncategorized';
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(item);
  }
  const pending  = visibleItems.filter(i => i.status === 'PENDING').length;
  const ordered  = visibleItems.filter(i => i.status === 'ORDERED').length;
  const received = visibleItems.filter(i => i.status === 'RECEIVED').length;

  const rows = Array.from(grouped.entries()).map(([cat, items]) => `
    <tr style="background:#F8FAFC"><td colspan="4" style="padding:10px 12px;font-weight:700;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:#64748B;border-bottom:1px solid #E2E8F0">${cat}</td></tr>
    ${items.map(item => `
      <tr>
        <td style="padding:10px 12px;font-weight:600;color:#1E293B">${item.name}</td>
        <td style="padding:10px 12px;color:#64748B">${item.quantity || '—'}</td>
        <td style="padding:10px 12px;color:#64748B">${item.notes || '—'}</td>
        <td style="padding:10px 12px"><span style="padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600;background:${ITEM_STATUS_CFG[item.status].bg};color:${ITEM_STATUS_CFG[item.status].text}">${ITEM_STATUS_CFG[item.status].label}</span></td>
      </tr>
    `).join('')}
  `).join('');

  const html = `<!DOCTYPE html><html><head><title>${list.name}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #1E293B; padding: 32px; }
    h1 { font-size: 22px; font-weight: 800; margin: 0 0 4px; }
    .meta { font-size: 14px; color: #64748B; margin-bottom: 8px; }
    .stats { display: flex; gap: 20px; font-size: 14px; font-weight: 600; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { padding: 10px 12px; text-align: left; font-size: 13px; font-weight: 700; color: #64748B; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #E2E8F0; }
    td { border-bottom: 1px solid #F1F5F9; font-size: 14px; vertical-align: middle; }
    @media print { body { padding: 16px; } }
  </style></head><body>
  <h1>${list.name}</h1>
  <div class="meta">${list.store.name} &nbsp;·&nbsp; ${new Date(list.openedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · by ${list.openedBy.name}</div>
  <div class="stats">
    <span style="color:#D97706">${pending} needed</span>
    ${ordered  > 0 ? `<span style="color:#059669">${ordered} ordered</span>` : ''}
    ${received > 0 ? `<span style="color:#7C3AED">${received} received</span>` : ''}
    <span style="color:#94A3B8">${visibleItems.length} total</span>
  </div>
  <table>
    <thead><tr><th>Item</th><th>Quantity</th><th>Notes</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:32px;font-size:12px;color:#CBD5E1">Printed ${new Date().toLocaleString()}</div>
  </body></html>`;

  const win = window.open('', '_blank');
  if (!win) {
    toast.error('Popups are blocked — allow popups for this site to print, or use "Share as PDF" from the mobile app instead.');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

// ─── Quick Add Panel (right column) ──────────────────────────────────────────

function QuickAddPanel({ list, onItemAdded, pendingRequests, onRequestReviewed, canEdit }: {
  list: OrderList;
  onItemAdded: () => void;
  pendingRequests: EmpRequest[];
  onRequestReviewed: () => void;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const [name, setName]           = useState('');
  const [qty, setQty]             = useState('');
  const [debName, setDebName]     = useState('');
  const [showSugg, setShowSugg]   = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [lineActions, setLineActions] = useState<Record<string, 'ACCEPT' | 'REJECT' | null>>({});
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebName(name), 250);
    return () => clearTimeout(t);
  }, [name]);

  const { data: suggData } = useQuery({
    queryKey: ['order-sugg-panel', debName],
    queryFn: () => inventoryAnalyticsApi.getItemSuggestions({ q: debName }),
    enabled: debName.trim().length >= 2,
    staleTime: 60_000,
  });
  const suggs: { name: string; category: string | null }[] = (suggData as any)?.data?.data || [];

  const { data: quickData } = useQuery({
    queryKey: ['quick-items', list.store.id],
    queryFn: () => orderListApi.getQuickItems(list.store.id),
    staleTime: 5 * 60_000,
    enabled: canEdit,
  });
  const quickItems: QuickItem[] = (quickData as any)?.data?.data || [];

  const addMut = useMutation({
    mutationFn: (data: { name: string; quantity?: string; category?: string }) =>
      orderListApi.addItem(list.id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      qc.invalidateQueries({ queryKey: ['admin-order-lists'] });
      qc.invalidateQueries({ queryKey: ['quick-items', list.store.id] });
      toast.success('Item added');
      onItemAdded();
    },
    onError: () => toast.error('Failed to add item'),
  });

  const reviewMut = useMutation({
    mutationFn: (vars: { requestId: string; lines: { id: string; action: 'ACCEPT' | 'REJECT' }[] }) =>
      employeeRequestApi.reviewRequest(vars.requestId, { lines: vars.lines }),
    onSuccess: () => {
      toast.success('Done — accepted items added to list');
      setLineActions({});
      setExpandedId(null);
      onRequestReviewed();
    },
    onError: () => toast.error('Failed to submit review'),
  });

  function doAdd() {
    const n = name.trim();
    if (!n) return;
    const found = suggs.find(s => s.name.toLowerCase() === n.toLowerCase());
    addMut.mutate({ name: n, quantity: qty.trim() || undefined, category: found?.category || undefined });
    setName(''); setQty('');
    setTimeout(() => nameRef.current?.focus(), 50);
  }

  function quickAdd(item: QuickItem) {
    addMut.mutate({ name: item.name, quantity: '1', category: item.category || undefined });
  }

  function acceptAll(req: EmpRequest) {
    const lines = req.lines.filter(l => l.status === 'PENDING').map(l => ({ id: l.id, action: 'ACCEPT' as const }));
    if (lines.length) reviewMut.mutate({ requestId: req.id, lines });
  }

  const pending = pendingRequests.filter(r => r.status === 'PENDING');

  return (
    <div style={p.panel}>

      {/* ── Inline Add Bar ──────────────────────────────────── */}
      {canEdit && (
        <div style={p.section}>
          <div style={p.sectionLabel}>+ Add Item</div>
          <div style={{ position: 'relative' }}>
            <input
              ref={nameRef}
              style={p.nameInput}
              value={name}
              onChange={e => { setName(e.target.value); setShowSugg(true); }}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              onKeyDown={e => { if (e.key === 'Enter' && !showSugg) doAdd(); }}
              placeholder="Item name…"
              maxLength={120}
              autoComplete="off"
            />
            {showSugg && suggs.length > 0 && (
              <div style={p.sugg}>
                {suggs.map((sg: any) => (
                  <div key={sg.name} style={p.suggRow}
                    onMouseDown={() => { setName(sg.name); setShowSugg(false); }}>
                    <span style={{ fontWeight: 600 }}>{sg.name}</span>
                    {sg.category && <span style={p.suggCat}>{sg.category}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input
              style={p.qtyInput}
              value={qty}
              onChange={e => setQty(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') doAdd(); }}
              placeholder="Qty (e.g. 2 cases)"
              maxLength={40}
            />
            <button
              style={{ ...p.addBtn, ...(!name.trim() || addMut.isPending ? p.addBtnDim : {}) }}
              onClick={doAdd}
              disabled={!name.trim() || addMut.isPending}
            >
              {addMut.isPending ? '…' : 'Add →'}
            </button>
          </div>
          <div style={p.hint}>Tab to qty · Enter to add · name autocompletes from history</div>
        </div>
      )}

      {/* ── Quick Pad ───────────────────────────────────────── */}
      {canEdit && quickItems.length > 0 && (
        <div style={p.section}>
          <div style={p.sectionLabel}>Quick Add</div>
          <div style={p.quickGrid}>
            {quickItems.map(item => (
              <button
                key={item.name}
                style={p.quickTile}
                onClick={() => quickAdd(item)}
                disabled={addMut.isPending}
                title={`Add ${item.name}${item.category ? ' — ' + item.category : ''}`}
              >
                <span style={p.tileName}>{item.name}</span>
                {item.category && <span style={p.tileCat}>{item.category}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {canEdit && quickItems.length === 0 && (
        <div style={p.section}>
          <div style={p.sectionLabel}>Quick Add</div>
          <div style={{ fontSize: 13, color: '#94A3B8', padding: '12px 0' }}>
            Quick Add tiles appear here after items have been ordered. Start adding items manually to build your history.
          </div>
        </div>
      )}

      {/* ── Pending Employee Requests ────────────────────────── */}
      {pending.length > 0 && (
        <div style={p.section}>
          <div style={p.sectionLabel}>
            Employee Requests
            <span style={p.badge}>{pending.length}</span>
          </div>
          {pending.map(req => {
            const isOpen   = expandedId === req.id;
            const pLines   = req.lines.filter(l => l.status === 'PENDING');
            return (
              <div key={req.id} style={{ ...p.reqCard, marginBottom: 8 }}>
                <div style={p.reqHead} onClick={() => setExpandedId(isOpen ? null : req.id)}
                  role="button" tabIndex={0} aria-expanded={isOpen}
                  onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setExpandedId(isOpen ? null : req.id)}>
                  <div style={{ flex: 1 }}>
                    <div style={p.reqName}>{req.submittedBy.name}</div>
                    <div style={p.reqMeta}>
                      {pLines.length} item{pLines.length !== 1 ? 's' : ''} ·{' '}
                      {new Date(req.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {req.note && ` · "${req.note}"`}
                    </div>
                  </div>
                  <button
                    style={p.acceptAllBtn}
                    onClick={e => { e.stopPropagation(); acceptAll(req); }}
                    disabled={reviewMut.isPending}
                  >
                    ✓ Accept All
                  </button>
                  <span style={{ color: '#94A3B8', marginLeft: 8, fontSize: 12 }}>{isOpen ? '▲' : '▼'}</span>
                </div>

                {isOpen && (
                  <div style={p.reqLines}>
                    {pLines.map(line => {
                      const act = lineActions[line.id] ?? null;
                      return (
                        <div key={line.id} style={p.reqLine}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: '#1E293B' }}>{line.name}</div>
                          {(line.quantity || line.category) && (
                            <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>
                              {line.quantity && <span>Qty: {line.quantity} </span>}
                              {line.category && <span>{line.category}</span>}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                            <button
                              style={{ ...p.lineBtn, ...(act === 'ACCEPT' ? p.lineBtnAccept : {}) }}
                              onClick={() => setLineActions(prev => ({ ...prev, [line.id]: act === 'ACCEPT' ? null : 'ACCEPT' }))}
                            >✓ Accept</button>
                            <button
                              style={{ ...p.lineBtn, ...(act === 'REJECT' ? p.lineBtnReject : {}) }}
                              onClick={() => setLineActions(prev => ({ ...prev, [line.id]: act === 'REJECT' ? null : 'REJECT' }))}
                            >✗ Skip</button>
                          </div>
                        </div>
                      );
                    })}
                    {Object.values(lineActions).some(a => a) && (
                      <button
                        style={p.submitReviewBtn}
                        disabled={reviewMut.isPending}
                        onClick={() => {
                          const lines = pLines
                            .filter(l => lineActions[l.id])
                            .map(l => ({ id: l.id, action: lineActions[l.id]! }));
                          reviewMut.mutate({ requestId: req.id, lines });
                        }}
                      >
                        {reviewMut.isPending ? 'Submitting…' : 'Submit Review'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!canEdit && pending.length === 0 && (
        <div style={{ padding: '20px 16px', color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
          {list.status === 'CLOSED' ? 'This list is closed.' : 'No pending requests.'}
        </div>
      )}
    </div>
  );
}

// ─── Restore Items Panel (closed list → current open list) ──────────────────

function RestoreItemsPanel({ list }: { list: OrderList }) {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Record<string, boolean>>({});

  // Matches mobile HistoryModal's exact filter: undelivered = not yet received, not removed.
  const restorableItems = list.items?.filter(i => i.status !== 'RECEIVED' && i.status !== 'REMOVED') || [];
  const selectedCount = Object.values(selectedIds).filter(Boolean).length;

  const restoreMutation = useMutation({
    mutationFn: (itemIds: string[]) => orderListApi.restoreItems(list.store.id, list.id, itemIds),
    onSuccess: (res) => {
      const added = res?.data?.data?.added ?? 0;
      toast.success(`Restored ${added} item${added !== 1 ? 's' : ''} to ${list.store.name}'s current open list`);
      setSelectedIds({});
      // No admin view of "this store's current open list" is cached independently of manual
      // navigation (admin only reaches a list via the browse table → getById by that list's
      // own id), so there's nothing stale to refresh there. Invalidate the browse table so its
      // item counts reflect the newly-added items if the admin browses back to it.
      qc.invalidateQueries({ queryKey: ['admin-order-lists'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to restore items.'),
  });

  function toggle(id: string) {
    setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }));
  }

  function doRestore() {
    const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([id]) => id);
    if (ids.length === 0) return;
    restoreMutation.mutate(ids);
  }

  return (
    <div style={p.panel}>
      <div style={p.section}>
        <div style={p.sectionLabel}>↺ Restore Items</div>
        {restorableItems.length === 0 ? (
          <div style={{ fontSize: 13, color: '#94A3B8', padding: '4px 0' }}>
            All items on this list were received — nothing to restore.
          </div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10, lineHeight: 1.5 }}>
              Select items that weren't delivered to add them to this store's currently open list.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {restorableItems.map(item => (
                <label
                  key={item.id}
                  style={{ ...p.restoreRow, ...(selectedIds[item.id] ? p.restoreRowSel : {}) }}
                >
                  <input
                    type="checkbox"
                    checked={!!selectedIds[item.id]}
                    onChange={() => toggle(item.id)}
                    style={{ marginRight: 8 }}
                  />
                  <span style={{ flex: 1, fontSize: 13 }}>
                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{item.name}</span>
                    {item.quantity && <span style={{ color: '#64748B' }}> · {item.quantity}</span>}
                  </span>
                </label>
              ))}
            </div>
            <button
              style={{
                ...p.submitReviewBtn,
                ...(selectedCount === 0 || restoreMutation.isPending ? p.addBtnDim : {}),
              }}
              onClick={doRestore}
              disabled={selectedCount === 0 || restoreMutation.isPending}
            >
              {restoreMutation.isPending ? 'Restoring…' : `Restore ${selectedCount} Item${selectedCount !== 1 ? 's' : ''}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Order List Detail (two-column layout) ────────────────────────────────────

function OrderListDetail({ list, canEdit, canClose, onBack, onListChanged }: {
  list: OrderList; canEdit: boolean; canClose: boolean; onBack: () => void; onListChanged: () => void;
}) {
  const qc = useQueryClient();
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQty,   setEditingQty]   = useState('');
  const [confirmCloseList, setConfirmCloseList] = useState(false);
  const [confirmRemoveItemId, setConfirmRemoveItemId] = useState<string | null>(null);
  const [editingInstructions, setEditingInstructions] = useState(false);
  const [instructionsDraft,   setInstructionsDraft]   = useState('');

  const instructionsMutation = useMutation({
    mutationFn: (instructions: string | null) => storesApi.updateOrderInstructions(list.store.id, instructions),
    onSuccess: () => {
      toast.success('Instructions saved');
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      setEditingInstructions(false);
    },
    onError: () => toast.error('Failed to save instructions'),
  });

  const { data: reqData, refetch: refetchReqs } = useQuery({
    queryKey: ['pending-reqs-panel', list.store.id],
    queryFn: () => employeeRequestApi.getForStore(list.store.id, 'PENDING'),
    refetchInterval: 30_000,
  });
  const pendingRequests: EmpRequest[] = reqData?.data?.data || [];

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
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      onListChanged();
    },
    onError: () => toast.error('Failed to update status'),
  });

  const updateQtyMutation = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: string }) =>
      orderListApi.updateItem(id, { quantity: quantity || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-order-list-detail', list.id] });
      setEditingQtyId(null);
    },
    onError: () => toast.error('Failed to update quantity'),
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: string) => orderListApi.removeItem(itemId),
    onSuccess: () => {
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

  function nextStatus(status: string): string | null {
    if (status === 'PENDING')  return 'ORDERED';
    if (status === 'ORDERED')  return 'RECEIVED';
    return null;
  }

  function saveQty(item: OrderListItem) {
    const val = editingQty.trim();
    if (val !== (item.quantity || '')) {
      updateQtyMutation.mutate({ id: item.id, quantity: val });
    } else {
      setEditingQtyId(null);
    }
  }

  const isOpen = list.status === 'OPEN';

  return (
    <div>
      <ConfirmModal
        open={confirmCloseList}
        title="Close List"
        message="Close this list? This means the order has been placed and the list will be locked."
        confirmLabel="Close List"
        onConfirm={() => { closeMutation.mutate(); setConfirmCloseList(false); }}
        onCancel={() => setConfirmCloseList(false)}
      />
      <ConfirmModal
        open={!!confirmRemoveItemId}
        title="Remove Item"
        message="Remove this item from the order list?"
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (confirmRemoveItemId) removeMutation.mutate(confirmRemoveItemId); setConfirmRemoveItemId(null); }}
        onCancel={() => setConfirmRemoveItemId(null)}
      />
      {/* Breadcrumb */}
      <div style={s.breadcrumb}>
        <button style={s.breadcrumbBtn} onClick={onBack}>← All Lists</button>
        <span style={s.breadcrumbSep}>/</span>
        <span style={s.breadcrumbCur}>{list.name}</span>
      </div>

      {/* Header */}
      <div style={s.listDetailHeader}>
        <div>
          <div style={s.listDetailTitle}>{list.name}</div>
          <div style={s.listDetailMeta}>
            {list.store.name} · opened {new Date(list.openedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} by {list.openedBy.name}
            {list.status === 'CLOSED' && list.closedAt && ` · Closed ${new Date(list.closedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          </div>
          <div style={s.listDetailStats}>
            <span style={{ color: '#D97706', fontWeight: 600 }}>{pending} needed</span>
            {ordered  > 0 && <span style={{ color: '#059669', fontWeight: 600 }}>{ordered} ordered</span>}
            {received > 0 && <span style={{ color: '#7C3AED', fontWeight: 600 }}>{received} received</span>}
            <span style={{ color: '#94A3B8' }}>{visibleItems.length} total</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={s.printBtn} onClick={() => printList(list)}>🖨 Print</button>
          {canClose && isOpen && (
            <button style={s.closeListBtn}
              onClick={() => setConfirmCloseList(true)}
              disabled={closeMutation.isPending}>
              {closeMutation.isPending ? 'Closing…' : 'Close List'}
            </button>
          )}
        </div>
      </div>

      {/* Standing instructions banner */}
      <div style={s.instructionsBanner}>
        {editingInstructions ? (
          <>
            <textarea
              style={s.instructionsTextarea}
              value={instructionsDraft}
              onChange={e => setInstructionsDraft(e.target.value)}
              maxLength={300}
              placeholder="e.g. Call supplier before ordering dairy"
              autoFocus
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button
                style={s.approveBtn}
                onClick={() => instructionsMutation.mutate(instructionsDraft.trim() || null)}
                disabled={instructionsMutation.isPending}
              >
                {instructionsMutation.isPending ? 'Saving…' : 'Save'}
              </button>
              <button style={s.cancelBtnSm} onClick={() => setEditingInstructions(false)}>Cancel</button>
            </div>
          </>
        ) : (
          <div
            style={{ ...s.instructionsDisplay, cursor: canClose ? 'pointer' : 'default' }}
            onClick={canClose ? () => { setInstructionsDraft(list.store.orderInstructions || ''); setEditingInstructions(true); } : undefined}
          >
            <span style={s.instructionsLabel}>📋 Standing instructions</span>
            <span style={list.store.orderInstructions ? s.instructionsText : s.instructionsEmpty}>
              {list.store.orderInstructions || (canClose ? 'No standing instructions — click to add' : 'No standing instructions')}
            </span>
          </div>
        )}
      </div>

      {/* Two-column body */}
      <div style={s.detailBody}>

        {/* Left: item list */}
        <div style={s.itemsCol}>
          {grouped.length === 0 ? (
            <div style={s.empty}>
              No items yet.{canEdit && isOpen ? ' Use the panel on the right to add items.' : ''}
            </div>
          ) : (
            grouped.map(([cat, catItems]) => (
              <div key={cat} style={{ marginBottom: 20 }}>
                <div style={s.catHeader}>{cat}</div>
                <div style={s.itemList}>
                  {catItems.map(item => {
                    const pc = PRIORITY_CFG[item.priority];
                    const sc = ITEM_STATUS_CFG[item.status];
                    const canAdvance = canEdit && isOpen && !!nextStatus(item.status);
                    const isEditingQty = editingQtyId === item.id;
                    return (
                      <div key={item.id} style={s.itemRow}>
                        <div style={s.itemRowMain}>
                          {/* Status chip — click to advance */}
                          <button
                            style={{
                              ...s.statusChip,
                              background: sc.bg, color: sc.text,
                              border: `1px solid ${sc.border || 'transparent'}`,
                              cursor: canAdvance ? 'pointer' : 'default',
                            }}
                            onClick={() => {
                              if (!canAdvance) return;
                              const next = nextStatus(item.status);
                              if (next) statusMutation.mutate({ id: item.id, status: next });
                            }}
                            title={canAdvance ? `Click → mark ${nextStatus(item.status)?.toLowerCase()}` : undefined}
                          >
                            {sc.label}
                          </button>

                          {/* Item name */}
                          <span style={s.itemRowName}>{item.name}</span>

                          {/* Priority pill */}
                          <span style={{ ...s.priorityPill, background: pc.bg, color: pc.text }}>{pc.label}</span>

                          {/* Qty — click to edit inline */}
                          {isEditingQty ? (
                            <input
                              style={s.qtyEditInput}
                              value={editingQty}
                              onChange={e => setEditingQty(e.target.value)}
                              onBlur={() => saveQty(item)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') saveQty(item);
                                if (e.key === 'Escape') setEditingQtyId(null);
                              }}
                              autoFocus
                              maxLength={40}
                            />
                          ) : (
                            <span
                              style={{
                                ...s.qtyChip,
                                cursor: canEdit && isOpen ? 'pointer' : 'default',
                                color: item.quantity ? '#1E293B' : '#CBD5E1',
                              }}
                              onClick={canEdit && isOpen ? () => { setEditingQtyId(item.id); setEditingQty(item.quantity || ''); } : undefined}
                              title={canEdit && isOpen ? 'Click to edit quantity' : undefined}
                            >
                              {item.quantity || 'qty?'}
                            </span>
                          )}

                          {/* Remove */}
                          {canEdit && isOpen && (
                            <button style={s.removeBtn}
                              onClick={() => setConfirmRemoveItemId(item.id)}>
                              ✕
                            </button>
                          )}
                        </div>

                        {/* Sub-row: notes + source */}
                        {(item.notes || item.source === 'EMPLOYEE_REQUEST') && (
                          <div style={s.itemRowSub}>
                            {item.notes && <span>{item.notes}</span>}
                            {item.source === 'EMPLOYEE_REQUEST' && (
                              <span style={s.sourceBadge}>📋 Employee request</span>
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
        </div>

        {/* Right: Restore Items (closed lists, DevAdmin only) + Quick Add Panel */}
        <div style={s.addCol}>
          {list.status === 'CLOSED' && canEdit && (
            <div style={{ marginBottom: 16 }}>
              <RestoreItemsPanel list={list} />
            </div>
          )}
          <QuickAddPanel
            list={list}
            onItemAdded={onListChanged}
            pendingRequests={pendingRequests}
            onRequestReviewed={() => { refetchReqs(); onListChanged(); }}
            canEdit={canEdit && isOpen}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Tab: Order Lists ─────────────────────────────────────────────────────────

function OrderListsTab({ canEdit, canClose }: { canEdit: boolean; canClose: boolean }) {
  const [filterStoreId, setFilterStoreId] = useState('');
  const [filterStatus,  setFilterStatus]  = useState('');
  const [selectedList,  setSelectedList]  = useState<OrderList | null>(null);

  const qc = useQueryClient();

  const { data: storesData } = useQuery({
    queryKey: ['stores-all'],
    queryFn: storesApi.getAll,
  });
  const stores: Store[] = storesData?.data?.data || [];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin-order-lists', filterStoreId, filterStatus],
    queryFn: () => orderListApi.adminGetAll({
      storeId: filterStoreId || undefined,
      status: filterStatus || undefined,
    }),
    refetchInterval: 30000,
  });
  const lists: OrderList[] = data?.data?.data?.lists || [];

  const { data: fullListData, isLoading: fullListLoading, isError: fullListError, refetch: refetchFull } = useQuery({
    queryKey: ['admin-order-list-detail', selectedList?.id],
    queryFn: () => orderListApi.getById(selectedList!.id),
    enabled: !!selectedList,
    refetchInterval: 30000,
  });
  const fullList: OrderList | null = fullListData?.data?.data || null;

  const refresh = () => { refetch(); setSelectedList(null); };

  const openMutation = useMutation({
    mutationFn: (storeId: string) => orderListApi.openList(storeId),
    onSuccess: (res) => {
      toast.success('List opened');
      qc.invalidateQueries({ queryKey: ['admin-order-lists'] });
      setSelectedList(res.data?.data ?? null);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to open list'),
  });

  if (selectedList) {
    return fullListLoading ? (
      <CardSkeleton count={2} />
    ) : fullListError ? (
      <ErrorState message="Failed to load this order list." onRetry={refetchFull} />
    ) : (
      <OrderListDetail
        list={fullList!}
        canEdit={canEdit}
        canClose={canClose}
        onBack={() => setSelectedList(null)}
        onListChanged={() => { refetch(); refetchFull(); }}
      />
    );
  }

  return (
    <div>
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
        {canClose && (
          <button
            style={{ ...s.openListBtn, ...(!filterStoreId || openMutation.isPending ? s.openListBtnDim : {}) }}
            onClick={() => filterStoreId && openMutation.mutate(filterStoreId)}
            disabled={!filterStoreId || openMutation.isPending}
            title={!filterStoreId ? 'Select a store above first' : undefined}
          >
            {openMutation.isPending ? 'Opening…' : '+ Open List'}
          </button>
        )}
      </div>

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={4} />
      ) : lists.length === 0 ? (
        <div style={s.empty}>No order lists found.</div>
      ) : (
        <div style={s.listsGrid}>
          {lists.map(list => {
            const isOpen    = list.status === 'OPEN';
            const itemCount = list._count?.items ?? list.items?.length ?? 0;
            const pending   = list.items?.filter(i => i.status === 'PENDING').length ?? 0;
            const received  = list.items?.filter(i => i.status === 'RECEIVED').length ?? 0;
            return (
              <div key={list.id} style={{ ...s.listCard, background: isOpen ? '#fff' : '#FAFAFA' }}
                onClick={() => setSelectedList(list)}
                role="button" tabIndex={0}
                aria-label={`Open list ${list.name} for ${list.store?.name}`}
                onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelectedList(list)}>
                <div style={s.listCardTop}>
                  <span style={{ ...s.statusPill, background: isOpen ? '#D1FAE5' : '#F3F4F6', color: isOpen ? '#059669' : '#5a6472' }}>
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
                  {received  > 0 && <span style={{ color: '#7C3AED' }}>{received} received</span>}
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
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editName,     setEditName]     = useState('');
  const [approvingId,  setApprovingId]  = useState<string | null>(null);
  const [approveEdit,  setApproveEdit]  = useState('');
  const [confirmDeleteCatId, setConfirmDeleteCatId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
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
      <ConfirmModal
        open={!!confirmDeleteCatId}
        title="Delete Category"
        message="This category will be permanently removed."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDeleteCatId) deleteMutation.mutate(confirmDeleteCatId); setConfirmDeleteCatId(null); }}
        onCancel={() => setConfirmDeleteCatId(null)}
      />
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

      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={4} />
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
                {isApproving ? (
                  <div style={s.editRow}>
                    <input style={{ ...s.input, flex: 1, borderColor: '#10B981' }}
                      value={approveEdit} onChange={e => setApproveEdit(e.target.value)} maxLength={80} autoFocus />
                  </div>
                ) : isEditing ? (
                  <div style={s.editRow}>
                    <input style={{ ...s.input, flex: 1 }} value={editName} onChange={e => setEditName(e.target.value)} maxLength={80} autoFocus />
                    <button style={s.saveBtnSm} onClick={() => updateMutation.mutate({ id: cat.id, data: { name: editName } })}
                      disabled={updateMutation.isPending || !editName.trim()}>Save</button>
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

                <div style={s.catActions}>
                  {isApproving ? (
                    <>
                      <button style={s.approveBtn} onClick={() => confirmApprove(cat.id)}
                        disabled={updateMutation.isPending || !approveEdit.trim()}>
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
                          disabled={updateMutation.isPending}>Reject</button>
                      )}
                      <button style={s.editBtnSm}
                        onClick={() => { setEditingId(cat.id); setEditName(cat.name); setApprovingId(null); }}>
                        Rename
                      </button>
                      <button style={s.deleteBtnSm}
                        onClick={() => setConfirmDeleteCatId(cat.id)}
                        disabled={deleteMutation.isPending}>Delete</button>
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

  const isDevAdmin     = user?.role === 'DEV_ADMIN';
  const isSuperAdmin   = user?.role === 'SUPER_ADMIN';
  const canEdit        = isDevAdmin;
  const canClose       = isDevAdmin || isSuperAdmin;

  return (
    <div style={s.page}>
      <div style={s.pageHeader}>
        <div>
          <h1 style={s.pageTitle}>📦 Order Lists</h1>
          <p style={s.pageSubtitle}>
            {isDevAdmin
              ? 'Manage all store order lists and categories.'
              : 'Review and close store order lists across all locations.'}
          </p>
        </div>
      </div>

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
        {tab === 'lists'      && <OrderListsTab canEdit={canEdit} canClose={canClose} />}
        {tab === 'categories' && isDevAdmin && <CategoriesTab />}
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page:       { padding: '24px 20px' },
  pageHeader: { marginBottom: 24 },
  pageTitle:  { fontSize: 26, fontWeight: 800, color: '#1E293B', margin: 0 },
  pageSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },

  tabs:      { display: 'flex', gap: 4, alignItems: 'flex-end', flexWrap: 'nowrap', overflowX: 'auto', borderBottom: '2px solid #E2E8F0', marginBottom: 24 },
  tab:       { padding: '10px 20px', fontSize: 14, fontWeight: 600, color: '#64748B', background: 'none', border: 'none', borderBottom: '2px solid transparent', cursor: 'pointer', marginBottom: -2, transition: 'all 0.15s' },
  tabActive: { color: '#1D3557', borderBottomColor: '#1D3557' },
  tabContent: {},

  filters:      { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
  filterSelect: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#374151', background: '#fff', cursor: 'pointer' },
  refreshBtn:   { padding: '8px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#64748B', background: '#fff', cursor: 'pointer' },
  pendingBadge: { padding: '4px 12px', borderRadius: 20, background: '#FEF3C7', color: '#D97706', fontSize: 14, fontWeight: 700 },
  approveHint:  { background: '#ECFDF5', border: '1px solid #6EE7B7', borderRadius: 10, padding: '10px 16px', fontSize: 14, color: '#065F46', marginBottom: 16, lineHeight: 1.5 },

  loading: { padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 },
  empty:   { padding: 40, textAlign: 'center', color: '#94A3B8', fontSize: 14 },

  // Lists grid
  listsGrid:    { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 },
  listCard:     { background: '#fff', borderRadius: 12, padding: 16, cursor: 'pointer', transition: 'box-shadow 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #E2E8F0' },
  listCardTop:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  listCardName: { fontSize: 15, fontWeight: 700, color: '#1E293B', marginBottom: 4 },
  listCardStore:{ fontSize: 14, color: '#64748B', marginBottom: 8 },
  listCardDate: { fontSize: 13, color: '#94A3B8' },
  listCardStats:{ display: 'flex', gap: 12, fontSize: 14, flexWrap: 'wrap' },
  statusPill:   { padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600 },

  // Detail view
  breadcrumb:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 },
  breadcrumbBtn: { background: 'none', border: 'none', color: '#1D3557', fontWeight: 600, cursor: 'pointer', fontSize: 14, padding: 0 },
  breadcrumbSep: { color: '#CBD5E1' },
  breadcrumbCur: { fontSize: 14, color: '#64748B' },

  listDetailHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 24, padding: '20px', background: '#fff', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', border: '1px solid #E2E8F0' },
  listDetailTitle:  { fontSize: 20, fontWeight: 800, color: '#1E293B', marginBottom: 4 },
  listDetailMeta:   { fontSize: 14, color: '#64748B', marginBottom: 8 },
  listDetailStats:  { display: 'flex', gap: 16, fontSize: 14 },

  printBtn:    { padding: '8px 16px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#fff', color: '#64748B', fontWeight: 600, fontSize: 14, cursor: 'pointer' },
  closeListBtn:{ padding: '8px 16px', borderRadius: 8, background: '#EF4444', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  instructionsBanner:  { background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 10, padding: '12px 16px', marginBottom: 16 },
  instructionsDisplay: { display: 'flex', flexDirection: 'column' as const, gap: 4 },
  instructionsLabel:   { fontSize: 12, fontWeight: 700, color: '#64748B', textTransform: 'uppercase' as const, letterSpacing: 0.4 },
  instructionsText:    { fontSize: 14, color: '#1E293B', lineHeight: 1.5 },
  instructionsEmpty:   { fontSize: 14, color: '#94A3B8', fontStyle: 'italic' as const },
  instructionsTextarea:{ width: '100%', minHeight: 60, padding: '8px 10px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, fontFamily: 'inherit', resize: 'vertical' as const },
  openListBtn:   { padding: '8px 14px', borderRadius: 8, background: '#059669', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' },
  openListBtnDim:{ opacity: 0.5, cursor: 'not-allowed' },

  // Two-column detail layout
  detailBody: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20, alignItems: 'start' },
  itemsCol:   { minWidth: 0 },
  addCol:     { position: 'sticky' as const, top: 20 },

  // Item list
  catHeader: { fontSize: 12, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8, paddingLeft: 4 },
  itemList:  { display: 'flex', flexDirection: 'column', gap: 4 },
  itemRow:   { background: '#fff', borderRadius: 8, padding: '12px 16px', border: '1px solid #E2E8F0' },
  itemRowMain: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' as const },
  itemRowSub:  { display: 'flex', gap: 10, marginTop: 4, paddingLeft: 4, fontSize: 12, color: '#94A3B8', flexWrap: 'wrap' as const },
  itemRowName: { flex: 1, fontSize: 14, fontWeight: 600, color: '#1E293B', minWidth: 80 },

  statusChip: { padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' as const, transition: 'opacity 0.1s', flexShrink: 0 },
  qtyChip:    { padding: '3px 10px', borderRadius: 6, fontSize: 13, background: '#F8FAFC', border: '1px solid #E2E8F0', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  qtyEditInput: { width: 90, padding: '3px 8px', borderRadius: 6, border: '1.5px solid #3B82F6', fontSize: 13, outline: 'none' },
  priorityPill: { padding: '3px 10px', borderRadius: 20, fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' as const, flexShrink: 0 },
  removeBtn:    { background: 'none', border: 'none', color: '#CBD5E1', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: '2px 4px', borderRadius: 4, marginLeft: 'auto' },
  sourceBadge:  { fontSize: 12, color: '#059669', background: '#D1FAE5', padding: '2px 6px', borderRadius: 4, fontWeight: 500 },

  // Category table
  catTable:     { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' },
  catTableHead: { display: 'grid', gridTemplateColumns: '1fr 80px 130px 1fr', gap: 0, padding: '12px 16px', background: '#F8FAFC', fontSize: 13, fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid #E2E8F0' },
  catTableRow:  { display: 'grid', gridTemplateColumns: '1fr 80px 130px 1fr', gap: 0, padding: '12px 16px', borderBottom: '1px solid #F1F5F9', alignItems: 'center' },
  catName:      { fontSize: 14, fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 8 },
  catUses:      { fontSize: 14, color: '#64748B' },
  catActions:   { display: 'flex', gap: 6, flexWrap: 'wrap' },
  storeTag:     { fontSize: 12, padding: '2px 6px', borderRadius: 4, background: '#F1F5F9', color: '#94A3B8', fontWeight: 500 },

  editRow:     { display: 'flex', alignItems: 'center', gap: 8 },
  approveBtn:  { padding: '5px 12px', borderRadius: 6, background: '#D1FAE5', color: '#059669', border: '1px solid #6EE7B7', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  rejectBtnSm: { padding: '5px 12px', borderRadius: 6, background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  editBtnSm:   { padding: '5px 10px', borderRadius: 6, background: '#EEF2FF', color: '#4F46E5', border: '1px solid #C7D2FE', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  deleteBtnSm: { padding: '5px 10px', borderRadius: 6, background: '#F9FAFB', color: '#5a6472', border: '1px solid #E5E7EB', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  saveBtnSm:   { padding: '5px 12px', borderRadius: 6, background: '#1D3557', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  cancelBtnSm: { padding: '5px 10px', borderRadius: 6, background: '#fff', color: '#64748B', border: '1px solid #E2E8F0', fontSize: 14, cursor: 'pointer' },

  input: { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#1E293B', boxSizing: 'border-box' as const },
};

// Quick Add Panel styles
const p: Record<string, React.CSSProperties> = {
  panel:       { background: '#fff', borderRadius: 12, border: '1px solid #E2E8F0', overflow: 'hidden' },
  section:     { padding: '16px', borderBottom: '1px solid #F1F5F9' },
  sectionLabel:{ fontSize: 11, fontWeight: 800, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 },

  nameInput:   { width: '100%', padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#1E293B', boxSizing: 'border-box' as const, outline: 'none', transition: 'border-color 0.15s' },
  qtyInput:    { flex: 1, padding: '10px 14px', borderRadius: 8, border: '1.5px solid #E2E8F0', fontSize: 14, color: '#1E293B', outline: 'none', minWidth: 0 },
  addBtn:      { padding: '10px 18px', borderRadius: 8, background: '#1D3557', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const, transition: 'opacity 0.15s' },
  addBtnDim:   { opacity: 0.4, cursor: 'not-allowed' },
  hint:        { fontSize: 11, color: '#CBD5E1', marginTop: 8 },

  sugg:        { position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1.5px solid #E2E8F0', borderTop: 'none', borderRadius: '0 0 8px 8px', zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 200, overflowY: 'auto' },
  suggRow:     { padding: '10px 14px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 14, borderBottom: '1px solid #F8FAFC', transition: 'background 0.1s' },
  suggCat:     { fontSize: 12, color: '#94A3B8', marginLeft: 8 },

  quickGrid:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 },
  quickTile:   {
    padding: '10px 12px', borderRadius: 8, border: '1.5px solid #E2E8F0', background: '#F8FAFC',
    cursor: 'pointer', textAlign: 'left' as const, transition: 'all 0.15s',
    display: 'flex', flexDirection: 'column', gap: 2, fontSize: 13,
  },
  tileName:    { fontWeight: 700, color: '#1E293B', fontSize: 13, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  tileCat:     { fontSize: 11, color: '#94A3B8', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },

  badge:       { padding: '2px 8px', borderRadius: 10, background: '#FEF3C7', color: '#D97706', fontSize: 12, fontWeight: 700 },

  reqCard:     { borderRadius: 8, border: '1px solid #FDE68A', background: '#FFFBEB', overflow: 'hidden' },
  reqHead:     { display: 'flex', alignItems: 'center', padding: '12px 14px', cursor: 'pointer', gap: 8 },
  reqName:     { fontSize: 14, fontWeight: 700, color: '#1E293B' },
  reqMeta:     { fontSize: 12, color: '#64748B', marginTop: 2 },
  acceptAllBtn:{ padding: '5px 12px', borderRadius: 6, background: '#D1FAE5', color: '#059669', border: '1px solid #6EE7B7', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' as const, flexShrink: 0 },
  reqLines:    { padding: '10px 14px', borderTop: '1px solid #FDE68A', display: 'flex', flexDirection: 'column', gap: 8 },
  reqLine:     { background: '#fff', borderRadius: 6, border: '1px solid #E2E8F0', padding: '10px 12px' },
  lineBtn:     { flex: 1, padding: '6px 0', borderRadius: 6, border: '1.5px solid #E2E8F0', background: '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#374151' },
  lineBtnAccept:{ background: '#D1FAE5', borderColor: '#10B981', color: '#059669' },
  lineBtnReject:{ background: '#FEE2E2', borderColor: '#F87171', color: '#DC2626' },
  submitReviewBtn: { width: '100%', marginTop: 4, padding: '9px 0', borderRadius: 8, background: '#1D3557', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' },

  restoreRow:    { display: 'flex', alignItems: 'center', padding: '8px 10px', borderRadius: 6, border: '1px solid #E2E8F0', background: '#F8FAFC', cursor: 'pointer' },
  restoreRowSel: { background: '#EFF6FF', borderColor: '#93C5FD' },
};
