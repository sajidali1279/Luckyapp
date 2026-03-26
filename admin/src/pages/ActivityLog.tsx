import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, storesApi } from '../services/api';

// ─── Action metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  // Points
  GRANT_POINTS:              { label: 'Grant Points',           color: '#2DC653', bg: '#2DC65318', icon: '💰' },
  REDEEM_CREDITS:            { label: 'Redeem Credits',         color: '#457b9d', bg: '#457b9d18', icon: '🎁' },
  REJECT_TRANSACTION:        { label: 'Reject Transaction',     color: '#E63946', bg: '#E6394618', icon: '❌' },
  SELF_GRANT:                { label: 'Self Grant (QR)',        color: '#2DC653', bg: '#2DC65318', icon: '📄' },
  // Offers & Banners
  CREATE_OFFER:              { label: 'Create Offer',           color: '#F4A261', bg: '#F4A26118', icon: '📢' },
  UPDATE_OFFER:              { label: 'Update Offer',           color: '#F4A261', bg: '#F4A26118', icon: '✏️' },
  DELETE_OFFER:              { label: 'Delete Offer',           color: '#E63946', bg: '#E6394618', icon: '🗑️' },
  CREATE_BANNER:             { label: 'Create Banner',          color: '#F4A261', bg: '#F4A26118', icon: '🖼️' },
  DELETE_BANNER:             { label: 'Delete Banner',          color: '#E63946', bg: '#E6394618', icon: '🗑️' },
  // Staff & Access
  CREATE_STAFF:              { label: 'Create Staff',           color: '#9b5de5', bg: '#9b5de518', icon: '👤' },
  TOGGLE_USER:               { label: 'Toggle User',            color: '#E63946', bg: '#E6394618', icon: '🔒' },
  RESET_PIN:                 { label: 'Reset PIN',              color: '#E63946', bg: '#E6394618', icon: '🔑' },
  ADD_STORE:                 { label: 'Add Store Assignment',   color: '#9b5de5', bg: '#9b5de518', icon: '🏪' },
  REMOVE_STORE:              { label: 'Remove Store Assign.',   color: '#E63946', bg: '#E6394618', icon: '🚫' },
  // Scheduling
  ASSIGN_SHIFT:              { label: 'Assign Shift',           color: '#0369a1', bg: '#0369a118', icon: '📅' },
  REMOVE_SHIFT:              { label: 'Remove Shift',           color: '#E63946', bg: '#E6394618', icon: '🗑️' },
  CREATE_SHIFT_REQUEST:      { label: 'Shift Request',          color: '#6c757d', bg: '#6c757d18', icon: '🙋' },
  APPROVE_SHIFT_REQUEST:     { label: 'Approve Shift Req.',     color: '#2DC653', bg: '#2DC65318', icon: '✅' },
  DENY_SHIFT_REQUEST:        { label: 'Deny Shift Req.',        color: '#E63946', bg: '#E6394618', icon: '❌' },
  // Store Requests
  SUBMIT_STORE_REQUEST:      { label: 'Store Request',          color: '#f59e0b', bg: '#f59e0b18', icon: '📋' },
  ACKNOWLEDGE_STORE_REQUEST: { label: 'Acknowledge Request',    color: '#2DC653', bg: '#2DC65318', icon: '✅' },
};

const ROLE_META: Record<string, { label: string; color: string }> = {
  DEV_ADMIN:    { label: 'Dev Admin',     color: '#2DC653' },
  SUPER_ADMIN:  { label: 'Super Admin',   color: '#F4A261' },
  STORE_MANAGER:{ label: 'Store Manager', color: '#4cc9f0' },
  EMPLOYEE:     { label: 'Employee',      color: '#adb5bd' },
  CUSTOMER:     { label: 'Customer',      color: '#dee2e6' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function fmtDetails(details: string | null): string {
  if (!details) return '';
  try {
    const d = JSON.parse(details);
    const parts: string[] = [];
    // Points
    if (d.purchaseAmount != null) parts.push(`Purchase $${Number(d.purchaseAmount).toFixed(2)}`);
    if (d.pointsAwarded != null)  parts.push(`+$${Number(d.pointsAwarded).toFixed(2)} cashback`);
    if (d.amount != null)         parts.push(`$${Number(d.amount).toFixed(2)}`);
    if (d.category && d.category !== 'OTHER') parts.push(d.category.replace(/_/g, ' '));
    // Offers / banners / staff
    if (d.title)                  parts.push(d.title);
    if (d.name)                   parts.push(d.name);
    if (d.targetName)             parts.push(d.targetName);
    if (d.targetPhone)            parts.push(d.targetPhone);
    if (d.targetRole)             parts.push(d.targetRole);
    if (d.isActive != null)       parts.push(d.isActive ? 'activated' : 'deactivated');
    // Scheduling
    if (d.employeeName)           parts.push(d.employeeName);
    if (d.dayOfWeek)              parts.push(d.dayOfWeek);
    if (d.shiftType)              parts.push(d.shiftType.toLowerCase());
    if (d.requestType)            parts.push(d.requestType.replace(/_/g, ' ').toLowerCase());
    if (d.date)                   parts.push(new Date(d.date).toLocaleDateString([], { month: 'short', day: 'numeric' }));
    // Store requests
    if (d.type)                   parts.push(d.type.replace(/_/g, ' ').toLowerCase());
    if (d.priority)               parts.push(d.priority.toLowerCase() + ' priority');
    if (d.submitterName)          parts.push(`from ${d.submitterName}`);
    return parts.join(' · ');
  } catch {
    return '';
  }
}

function todayStr() { return new Date().toISOString().slice(0, 10); }
function monthAgoStr() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ActivityLog() {
  const [action,    setAction]    = useState('');
  const [actorRole, setActorRole] = useState('');
  const [storeId,   setStoreId]   = useState('');
  const [from,      setFrom]      = useState(monthAgoStr());
  const [to,        setTo]        = useState(todayStr());
  const [page,      setPage]      = useState(1);

  const params: Record<string, string> = { page: String(page), limit: '50' };
  if (action)    params.action    = action;
  if (actorRole) params.actorRole = actorRole;
  if (storeId)   params.storeId   = storeId;
  if (from)      params.from      = new Date(from).toISOString();
  if (to)        params.to        = new Date(to + 'T23:59:59').toISOString();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditApi.getLogs(params),
    refetchInterval: 30000, // auto-refresh every 30s
  });

  const { data: statsData } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => auditApi.getStats(),
    refetchInterval: 60000,
  });

  const { data: storesData } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });

  const logs: any[]   = data?.data?.data?.logs  || [];
  const total: number = data?.data?.data?.total || 0;
  const stores: any[] = storesData?.data?.data  || [];
  const stats         = statsData?.data?.data;
  const totalPages    = Math.ceil(total / 50);

  function resetFilters() {
    setAction(''); setActorRole(''); setStoreId('');
    setFrom(monthAgoStr()); setTo(todayStr()); setPage(1);
  }

  return (
    <div style={s.container}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <h1 style={s.title}>🔍 Activity Log</h1>
          <p style={s.sub}>All staff actions — grants, redemptions, offers, banners, account changes</p>
        </div>
        <button style={s.refreshBtn} onClick={() => refetch()}>↻ Refresh</button>
      </div>

      {/* Stats strip */}
      {stats && (
        <div style={s.statsStrip}>
          {stats.byAction?.slice(0, 5).map((a: any) => {
            const meta = ACTION_META[a.action] || { label: a.action, color: '#6c757d', bg: '#6c757d18', icon: '•' };
            return (
              <div key={a.action} style={{ ...s.statChip, background: meta.bg }}>
                <span style={{ color: meta.color, fontWeight: 800 }}>{a._count.action}</span>
                <span style={{ color: meta.color, fontSize: 12 }}>{meta.icon} {meta.label}</span>
              </div>
            );
          })}
          <div style={s.statNote}>Last 30 days</div>
        </div>
      )}

      {/* High-risk alert */}
      {stats?.recentHighRisk?.length > 0 && (
        <div style={s.alertBox}>
          <strong>⚠️ High-Risk Actions (last 24h):</strong>
          {' '}{stats.recentHighRisk.length} sensitive action{stats.recentHighRisk.length !== 1 ? 's' : ''} detected
          {' '}(deletions, user toggles, PIN resets) — review below.
        </div>
      )}

      {/* Filters */}
      <div style={s.filters}>
        <select style={s.select} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          <optgroup label="── Points ──">
            {['GRANT_POINTS','REDEEM_CREDITS','REJECT_TRANSACTION','SELF_GRANT'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].icon} {ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Offers & Banners ──">
            {['CREATE_OFFER','UPDATE_OFFER','DELETE_OFFER','CREATE_BANNER','DELETE_BANNER'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].icon} {ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Staff & Access ──">
            {['CREATE_STAFF','TOGGLE_USER','RESET_PIN','ADD_STORE','REMOVE_STORE'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].icon} {ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Scheduling ──">
            {['ASSIGN_SHIFT','REMOVE_SHIFT','CREATE_SHIFT_REQUEST','APPROVE_SHIFT_REQUEST','DENY_SHIFT_REQUEST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].icon} {ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Store Requests ──">
            {['SUBMIT_STORE_REQUEST','ACKNOWLEDGE_STORE_REQUEST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].icon} {ACTION_META[k].label}</option>
            ))}
          </optgroup>
        </select>

        <select style={s.select} value={actorRole} onChange={(e) => { setActorRole(e.target.value); setPage(1); }}>
          <option value="">All Roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="STORE_MANAGER">Store Manager</option>
          <option value="EMPLOYEE">Employee</option>
          <option value="CUSTOMER">Customer</option>
        </select>

        <select style={s.select} value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }}>
          <option value="">All Stores</option>
          {stores.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <input style={s.dateInput} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <span style={{ color: '#6c757d', fontSize: 13 }}>to</span>
        <input style={s.dateInput} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />

        <button style={s.clearBtn} onClick={resetFilters}>Clear</button>

        <span style={s.totalLabel}>{total.toLocaleString()} entries</span>
      </div>

      {/* Log table */}
      {isLoading ? (
        <div style={s.empty}>Loading...</div>
      ) : logs.length === 0 ? (
        <div style={s.empty}>No activity found for the selected filters.</div>
      ) : (
        <div style={s.logList}>
          {logs.map((log) => {
            const meta = ACTION_META[log.action] || { label: log.action, color: '#6c757d', bg: '#f8f9fa', icon: '•' };
            const roleMeta = ROLE_META[log.actorRole] || { label: log.actorRole, color: '#adb5bd' };
            const detail = fmtDetails(log.details);
            return (
              <div key={log.id} style={s.row}>
                {/* Action badge */}
                <div style={{ ...s.actionBadge, background: meta.bg, color: meta.color }}>
                  <span style={{ fontSize: 16 }}>{meta.icon}</span>
                  <span style={s.actionLabel}>{meta.label}</span>
                </div>

                {/* Actor */}
                <div style={s.actor}>
                  <div style={s.actorName}>{log.actorName || log.actorId.slice(0, 8)}</div>
                  <div style={{ ...s.roleBadge, color: roleMeta.color }}>{roleMeta.label}</div>
                </div>

                {/* Detail */}
                <div style={s.detail}>
                  {detail && <span style={s.detailText}>{detail}</span>}
                  {log.storeName && <span style={s.storeTag}>📍 {log.storeName}</span>}
                  {!log.storeName && log.storeId && <span style={s.storeTag}>📍 store</span>}
                </div>

                {/* Time */}
                <div style={s.time} title={new Date(log.createdAt).toLocaleString()}>
                  {timeAgo(log.createdAt)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={s.pagination}>
          <button style={s.pageBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span style={s.pageInfo}>Page {page} of {totalPages}</span>
          <button style={s.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32, maxWidth: 1200, margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 28, fontWeight: 800, color: '#1D3557', margin: 0 },
  sub: { color: '#6c757d', marginTop: 4, fontSize: 14 },
  refreshBtn: { background: '#1D3557', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 13 },

  statsStrip: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 },
  statChip: { borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 },
  statNote: { color: '#adb5bd', fontSize: 12, marginLeft: 'auto' },

  alertBox: {
    background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 10,
    padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#856404',
  },

  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20, padding: '14px 16px', background: '#f8f9fa', borderRadius: 12 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13, background: '#fff', cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #dee2e6', fontSize: 13 },
  clearBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#6c757d', fontWeight: 600 },
  totalLabel: { marginLeft: 'auto', color: '#6c757d', fontSize: 13, fontWeight: 600 },

  logList: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'grid',
    gridTemplateColumns: '180px 160px 1fr 80px',
    alignItems: 'center',
    gap: 16,
    background: '#fff',
    borderRadius: 10,
    padding: '12px 16px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    border: '1px solid #f0f1f2',
  },

  actionBadge: { display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 12 },
  actionLabel: { whiteSpace: 'nowrap' as const },

  actor: { display: 'flex', flexDirection: 'column', gap: 2 },
  actorName: { fontWeight: 700, fontSize: 14, color: '#1D3557', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  roleBadge: { fontSize: 11, fontWeight: 600 },

  detail: { display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' },
  detailText: { fontSize: 13, color: '#495057', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  storeTag: { fontSize: 11, color: '#6c757d' },

  time: { fontSize: 12, color: '#adb5bd', textAlign: 'right' as const, cursor: 'default', whiteSpace: 'nowrap' as const },

  pagination: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginTop: 24 },
  pageBtn: { padding: '8px 20px', borderRadius: 8, border: '1px solid #dee2e6', background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13 },
  pageInfo: { color: '#6c757d', fontSize: 14 },

  empty: { color: '#6c757d', textAlign: 'center', padding: 60 },
};
