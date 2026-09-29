import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, storesApi } from '../services/api';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import DataTablePagination from '../components/DataTablePagination';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { storeToday, addDays, startOfStoreDay, endOfStoreDay } from '../lib/storeDates';
import { PageHeader, Button } from '../components/kit';
import { RefreshCw } from 'lucide-react';
import Glyph from '../components/Glyph';

// ─── Action metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  // Points
  GRANT_POINTS:              { label: 'Grant Points',           color: '#1a7f45', bg: '#2DC65318', icon: '💰' },
  REDEEM_CREDITS:            { label: 'Redeem Credits',         color: '#3c6e8f', bg: '#457b9d18', icon: '🎁' },
  REJECT_TRANSACTION:        { label: 'Reject Transaction',     color: '#c42130', bg: '#E6394618', icon: '❌' },
  SELF_GRANT:                { label: 'Self Grant (QR)',        color: '#1a7f45', bg: '#2DC65318', icon: '📄' },
  BROADCAST:                 { label: 'Push Sent',              color: '#3c6e8f', bg: '#457b9d18', icon: '📢' },
  DISPUTE_APPROVED:          { label: 'Dispute Approved',       color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  DISPUTE_REJECTED:          { label: 'Dispute Rejected',       color: '#c42130', bg: '#E6394618', icon: '❌' },
  APPROVE:                   { label: 'Sale Approved',          color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  APPROVE_FLAGGED:           { label: 'Held Sale Approved',     color: '#1a7f45', bg: '#2DC65318', icon: '🟢' },
  REJECT_FLAGGED:            { label: 'Held Sale Rejected',     color: '#c42130', bg: '#E6394618', icon: '🔴' },
  VOID_TRANSACTION:          { label: 'Sale Voided',            color: '#c42130', bg: '#E6394618', icon: '↩️' },
  AUTO_EXPIRE_PENDING:       { label: 'Unfinished Sales Expired', color: '#5a6472', bg: '#6c757d18', icon: '⌛' },
  GOODWILL_CREDIT:           { label: 'Goodwill Credit',        color: '#1a7f45', bg: '#2DC65318', icon: '🤝' },
  CLAIM_TIER_BENEFIT:        { label: 'Tier Perk Used',         color: '#8a5300', bg: '#b8860b18', icon: '⭐' },
  CATALOG_REDEMPTION:        { label: 'Reward Redeemed',        color: '#3c6e8f', bg: '#457b9d18', icon: '🎁' },
  CATALOG_CONFIRM:           { label: 'Reward Handed Out',      color: '#3c6e8f', bg: '#457b9d18', icon: '✅' },
  // Rewards and notices
  CATALOG_ITEM_CREATE:       { label: 'Reward Added',           color: PRIMARY, bg: '#1D355718', icon: '🎁' },
  CATALOG_ITEM_UPDATE:       { label: 'Reward Changed',         color: PRIMARY, bg: '#1D355718', icon: '✏️' },
  NOTICE_CREATE:             { label: 'Notice Posted',          color: '#8a5300', bg: '#F4A26118', icon: '📌' },
  NOTICE_DEACTIVATE:         { label: 'Notice Taken Down',      color: '#5a6472', bg: '#6c757d18', icon: '⏹️' },
  NOTICE_DELETE:             { label: 'Notice Deleted',         color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  NOTICE_UPDATE:             { label: 'Notice Edited',          color: '#1D3557', bg: '#1D355718', icon: '✏️' },
  NOTICE_REACTIVATE:         { label: 'Notice Brought Back',    color: '#17663a', bg: '#2DC65318', icon: '🔄' },
  PROMOTION_PUBLISH:         { label: 'Business Ad Published',  color: '#1a7f45', bg: '#2DC65318', icon: '📣' },
  PROMOTION_REJECT:          { label: 'Business Ad Declined',   color: '#5a6472', bg: '#6c757d18', icon: '🚫' },
  PROMOTION_DELETE:          { label: 'Business Ad Deleted',    color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  CLEAR_CHAT:                { label: 'Store Chat Cleared',     color: '#c42130', bg: '#E6394618', icon: '🧹' },
  // Accounts, stores and the daily messages
  EDIT_STAFF:                { label: 'Staff Edited',           color: PRIMARY, bg: '#1D355718', icon: '✏️' },
  DELETE_OWN_ACCOUNT:        { label: 'Customer Deleted Account', color: '#c42130', bg: '#E6394618', icon: '👋' },
  CREATE_STORE:              { label: 'Store Added',            color: '#1D3557', bg: '#0369a118', icon: '🏪' },
  UPDATE_HOT_FOOD_HOURS:     { label: 'Hot Food Hours Changed', color: '#8a5300', bg: '#ea580c18', icon: '🔥' },
  MORNING_SUMMARY:           { label: 'Morning Summary Sent',   color: '#5a6472', bg: '#6c757d18', icon: '🌅' },
  WEEKLY_SUMMARY:            { label: 'Weekly Summary Sent',    color: '#5a6472', bg: '#6c757d18', icon: '📊' },
  // Offers & Banners
  CREATE_OFFER:              { label: 'Create Offer',           color: '#8a5300', bg: '#F4A26118', icon: '📢' },
  UPDATE_OFFER:              { label: 'Update Offer',           color: '#8a5300', bg: '#F4A26118', icon: '✏️' },
  DELETE_OFFER:              { label: 'Delete Offer',           color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  CREATE_BANNER:             { label: 'Create Banner',          color: '#8a5300', bg: '#F4A26118', icon: '🖼️' },
  DELETE_BANNER:             { label: 'Delete Banner',          color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  // Staff & Access
  CREATE_STAFF:              { label: 'Create Staff',           color: '#4f6d8f', bg: '#9b5de518', icon: '👤' },
  TOGGLE_USER:               { label: 'Deactivate / Reactivate', color: '#c42130', bg: '#E6394618', icon: '🔒' },
  RESET_PIN:                 { label: 'Reset PIN',              color: '#c42130', bg: '#E6394618', icon: '🔑' },
  SIGN_OUT_EVERYWHERE:       { label: 'Signed Out Everywhere',  color: '#1D3557', bg: '#1D355718', icon: '🔒' },
  CREATE_SUPER_ADMIN:        { label: 'Create Super Admin',     color: '#4f6d8f', bg: '#9b5de518', icon: '🏢' },
  DELETE_USER:               { label: 'Delete Account',         color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  DELETE_USER_REFUSED:       { label: 'Delete Refused',         color: '#c42130', bg: '#E6394618', icon: '⛔' },
  DENIED_ACCOUNT_ACTION:     { label: 'Refused (role too low)', color: '#c42130', bg: '#E6394618', icon: '⛔' },
  ADD_STORE:                 { label: 'Add Store Assignment',   color: '#4f6d8f', bg: '#9b5de518', icon: '🏪' },
  REMOVE_STORE:              { label: 'Remove Store Assign.',   color: '#c42130', bg: '#E6394618', icon: '🚫' },
  SET_STORES:                { label: 'Change Stores',          color: '#4f6d8f', bg: '#9b5de518', icon: '🏪' },
  // Stores
  UPDATE_STORE:              { label: 'Store Edited',           color: '#1D3557', bg: '#0369a118', icon: '🏪' },
  GAS_PRICE_UPDATE:          { label: 'Gas / Diesel Price',     color: '#1D3557', bg: '#0369a118', icon: '⛽' },
  UPDATE_STORE_HOURS:        { label: 'Store Hours Changed',    color: '#1D3557', bg: '#0369a118', icon: '🕐' },
  ADD_STORE_HOLIDAY:         { label: 'Holiday Hours Added',    color: '#1D3557', bg: '#0369a118', icon: '📅' },
  DELETE_STORE_HOLIDAY:      { label: 'Holiday Hours Removed',  color: '#c42130', bg: '#E6394618', icon: '📅' },
  ADD_KEYWORD_MAPPING:       { label: 'POS Keyword Added',      color: '#1D3557', bg: '#0369a118', icon: '🗂️' },
  DELETE_KEYWORD_MAPPING:    { label: 'POS Keyword Removed',    color: '#c42130', bg: '#E6394618', icon: '🗂️' },
  REGENERATE_API_KEY:        { label: 'Printer Key Regenerated', color: '#c42130', bg: '#E6394618', icon: '🔑' },
  // Scheduling
  ASSIGN_SHIFT:              { label: 'Assign Shift',           color: '#1D3557', bg: '#0369a118', icon: '📅' },
  REMOVE_SHIFT:              { label: 'Remove Shift',           color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  CREATE_SHIFT_REQUEST:      { label: 'Shift Request',          color: TEXT_MUTED, bg: '#6c757d18', icon: '🙋' },
  APPROVE_SHIFT_REQUEST:     { label: 'Approve Shift Req.',     color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  DENY_SHIFT_REQUEST:        { label: 'Deny Shift Req.',        color: '#c42130', bg: '#E6394618', icon: '❌' },
  // Store Requests
  SUBMIT_STORE_REQUEST:      { label: 'Store Request',          color: '#8a5300', bg: '#f59e0b18', icon: '📋' },
  ACKNOWLEDGE_STORE_REQUEST: { label: 'Acknowledge Request',    color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  // Billing
  BILLING_GENERATE:          { label: 'Make Bills',             color: '#1D3557', bg: '#0369a118', icon: '🧾' },
  BILLING_FILL_MISSING:      { label: 'Fill In Missing Bills',  color: '#1D3557', bg: '#0369a118', icon: '🧩' },
  BILLING_RECALCULATE:       { label: 'Recalculate Bill',       color: '#1D3557', bg: '#0369a118', icon: '🔄' },
  BILLING_MARK_PAID:         { label: 'Mark Bill Paid',         color: '#1a7f45', bg: '#2DC65318', icon: '💳' },
  BILLING_MARK_PERIOD_PAID:  { label: 'Mark Month Paid',        color: '#1a7f45', bg: '#2DC65318', icon: '💳' },
  BILLING_UNDO_PAID:         { label: 'Undo Payment',           color: '#c42130', bg: '#E6394618', icon: '↩️' },
  BILLING_CHARGE_ADD:        { label: 'Add Extra Charge',       color: '#8a5300', bg: '#F4A26118', icon: '➕' },
  BILLING_CHARGE_EDIT:       { label: 'Edit Extra Charge',      color: '#8a5300', bg: '#F4A26118', icon: '✏️' },
  BILLING_CHARGE_DELETE:     { label: 'Delete Extra Charge',    color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  BILLING_REPORT_SENT:       { label: 'Billing Report Sent',    color: '#3c6e8f', bg: '#457b9d18', icon: '📨' },
  STORE_BILLING_UPDATE:      { label: 'Store Plan / Fee',       color: '#4f6d8f', bg: '#9b5de518', icon: '⚙️' },
  DEV_CUT_RATE_UPDATE:       { label: 'Default Fee Rate',       color: '#4f6d8f', bg: '#9b5de518', icon: '⚙️' },
  // Rates
  RATE_TIER_UPDATE:          { label: 'Tier Rates Changed',     color: '#4f6d8f', bg: '#9b5de518', icon: '🏆' },
  RATE_CATEGORY_UPDATE:      { label: 'Category Bonus Changed', color: '#4f6d8f', bg: '#9b5de518', icon: '📦' },
  TIER_PERIOD_RESET:         { label: 'Tier Period Reset',      color: '#3c6e8f', bg: '#457b9d18', icon: '🔄' },
  // Labels
  CREATE_LABEL:              { label: 'Create Label',           color: PRIMARY, bg: '#1D355718', icon: '🏷️' },
  UPDATE_LABEL:              { label: 'Update Label',           color: PRIMARY, bg: '#1D355718', icon: '✏️' },
  DELETE_LABEL:              { label: 'Delete Label',           color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  LABEL_CHANGE_REFUSED:      { label: 'Label Change Refused',   color: '#c42130', bg: '#E6394618', icon: '⛔' },
  PRINT_LABEL:               { label: 'Print Label(s)',         color: '#17663a', bg: '#0f513218', icon: '🖨️' },
  STORE_LABEL_PRICE:         { label: 'Store Label Price',      color: PRIMARY, bg: '#1D355718', icon: '💲' },
  STORE_LABEL_REMOVED:       { label: 'Label Removed From Store', color: '#c42130', bg: '#E6394618', icon: '➖' },
  PUSH_LABEL_TO_ALL_STORES:  { label: 'Label Added To All Stores', color: PRIMARY, bg: '#1D355718', icon: '📤' },
  LABEL_SALE_ENDED:          { label: 'Sale Prices Ended',      color: '#3c6e8f', bg: '#457b9d18', icon: '⏱️' },
};

const ROLE_META: Record<string, { label: string; color: string }> = {
  DEV_ADMIN:    { label: 'Dev Admin',     color: '#1a7f45' },
  SUPER_ADMIN:  { label: 'Super Admin',   color: '#8a5300' },
  STORE_MANAGER:{ label: 'Store Manager', color: '#4cc9f0' },
  EMPLOYEE:     { label: 'Employee',      color: TEXT_MUTED },
  CUSTOMER:     { label: 'Customer',      color: '#e4e7ec' },
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
    // Rates (a ready-made sentence)
    if (typeof d.summary === 'string' && d.summary) parts.push(d.summary);
    // Points
    if (d.purchaseAmount != null) parts.push(`Purchase $${Number(d.purchaseAmount).toFixed(2)}`);
    if (d.pointsAwarded != null)  parts.push(`+$${Number(d.pointsAwarded).toFixed(2)} cashback`);
    if (d.amount != null)         parts.push(`$${Number(d.amount).toFixed(2)}`);
    if (d.category && d.category !== 'OTHER') parts.push(d.category.replace(/_/g, ' '));
    // Offers / banners / staff
    if (d.title && !d.summary)    parts.push(d.title);
    if (d.name)                   parts.push(d.name);
    if (d.targetName)             parts.push(d.targetName);
    if (d.targetPhone)            parts.push(d.targetPhone);
    if (d.targetRole)             parts.push(d.targetRole);
    if (d.isActive != null)       parts.push(d.isActive ? 'activated' : 'deactivated');
    if (Array.isArray(d.before) && Array.isArray(d.after)) parts.push(`${d.before.join(', ') || 'no store'} → ${d.after.join(', ') || 'no store'}`);
    if (d.mode === 'anonymized')  parts.push('personal details removed, sales kept');
    if (d.mode === 'deleted')     parts.push('deleted');
    if (d.footprint && typeof d.reason === 'string') parts.push(d.reason);
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
    // Labels
    if (d.productName)            parts.push(d.productName);
    if (d.priceText)              parts.push(`$${d.priceText}`);
    if (d.labelCount != null)     parts.push(`${d.labelCount} label${d.labelCount === 1 ? '' : 's'}`);
    if (d.totalCopies != null)    parts.push(`${d.totalCopies} cop${d.totalCopies === 1 ? 'y' : 'ies'} printed`);
    return parts.join(' · ');
  } catch {
    return '';
  }
}

// Store days (Central): the range starts at midnight and ends at 11:59 pm at the store, whatever this browser's time zone
function todayStr() { return storeToday(); }
function monthAgoStr() { return addDays(storeToday(), -30); }

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
  if (from)      params.from      = startOfStoreDay(from).toISOString();
  if (to)        params.to        = endOfStoreDay(to).toISOString();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs', params],
    queryFn: () => auditApi.getLogs(params),
    refetchInterval: 30000,
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
      <PageHeader
        title="Activity Log"
        description="All staff actions: grants, redemptions, offers, banners, account changes."
        actions={<Button icon={<RefreshCw />} onClick={() => refetch()}>Refresh</Button>}
      />

      {/* Stats strip */}
      {stats && (
        <div style={s.statsStrip}>
          {stats.byAction?.slice(0, 5).map((a: any) => {
            const meta = ACTION_META[a.action] || { label: a.action, color: TEXT_MUTED, bg: '#6c757d18', icon: '•' };
            return (
              <div key={a.action} style={{ ...s.statChip, background: meta.bg }}>
                <span style={{ color: meta.color, fontWeight: 700 }}>{a._count.action}</span>
                <span style={{ color: meta.color, fontSize: 14 }}><Glyph e={meta.icon} size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{meta.label}</span>
              </div>
            );
          })}
          <div style={s.statNote}>Last 30 days</div>
        </div>
      )}

      {/* High-risk alert */}
      {stats?.recentHighRisk?.length > 0 && (
        <div style={s.alertBox}>
          <strong>High-Risk Actions (last 24h):</strong>
          {' '}{stats.recentHighRisk.length} sensitive action{stats.recentHighRisk.length !== 1 ? 's' : ''} detected
          {' '}(deletions, user toggles, PIN resets) - review below.
        </div>
      )}

      {/* Filters */}
      <div style={s.filters}>
        <select style={s.select} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All Actions</option>
          <optgroup label="── Points ──">
            {['GRANT_POINTS','APPROVE','APPROVE_FLAGGED','REJECT_FLAGGED','REJECT_TRANSACTION','VOID_TRANSACTION','AUTO_EXPIRE_PENDING','GOODWILL_CREDIT','CLAIM_TIER_BENEFIT','REDEEM_CREDITS','CATALOG_REDEMPTION','CATALOG_CONFIRM','SELF_GRANT','DISPUTE_APPROVED','DISPUTE_REJECTED','BROADCAST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Offers & Banners ──">
            {['CREATE_OFFER','UPDATE_OFFER','DELETE_OFFER','CREATE_BANNER','DELETE_BANNER'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Rates ──">
            {['RATE_TIER_UPDATE','RATE_CATEGORY_UPDATE','TIER_PERIOD_RESET'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Billing ──">
            {['BILLING_GENERATE','BILLING_FILL_MISSING','BILLING_RECALCULATE','BILLING_MARK_PAID','BILLING_MARK_PERIOD_PAID','BILLING_UNDO_PAID','BILLING_CHARGE_ADD','BILLING_CHARGE_EDIT','BILLING_CHARGE_DELETE','BILLING_REPORT_SENT','STORE_BILLING_UPDATE','DEV_CUT_RATE_UPDATE'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Staff & Access ──">
            {['CREATE_STAFF','EDIT_STAFF','CREATE_SUPER_ADMIN','TOGGLE_USER','RESET_PIN','ADD_STORE','REMOVE_STORE','SET_STORES','DELETE_USER','DELETE_USER_REFUSED','DENIED_ACCOUNT_ACTION','DELETE_OWN_ACCOUNT'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Stores ──">
            {['CREATE_STORE','UPDATE_STORE','CLEAR_CHAT','GAS_PRICE_UPDATE','UPDATE_STORE_HOURS','UPDATE_HOT_FOOD_HOURS','ADD_STORE_HOLIDAY','DELETE_STORE_HOLIDAY','ADD_KEYWORD_MAPPING','DELETE_KEYWORD_MAPPING','REGENERATE_API_KEY'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Rewards, Notices & Local Ads ──">
            {['CATALOG_ITEM_CREATE','CATALOG_ITEM_UPDATE','NOTICE_CREATE','NOTICE_UPDATE','NOTICE_REACTIVATE','NOTICE_DEACTIVATE','NOTICE_DELETE','PROMOTION_PUBLISH','PROMOTION_REJECT','PROMOTION_DELETE'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Daily messages ──">
            {['MORNING_SUMMARY','WEEKLY_SUMMARY'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Scheduling ──">
            {['ASSIGN_SHIFT','REMOVE_SHIFT','CREATE_SHIFT_REQUEST','APPROVE_SHIFT_REQUEST','DENY_SHIFT_REQUEST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Store Requests ──">
            {['SUBMIT_STORE_REQUEST','ACKNOWLEDGE_STORE_REQUEST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Labels ──">
            {['CREATE_LABEL','UPDATE_LABEL','DELETE_LABEL','LABEL_CHANGE_REFUSED','PRINT_LABEL','STORE_LABEL_PRICE','STORE_LABEL_REMOVED','PUSH_LABEL_TO_ALL_STORES','LABEL_SALE_ENDED'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
        </select>

        <select style={s.select} value={actorRole} onChange={(e) => { setActorRole(e.target.value); setPage(1); }}>
          <option value="">All Roles</option>
          <option value="DEV_ADMIN">Dev Admin</option>
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
        <span style={{ color: TEXT_MUTED, fontSize: 15 }}>to</span>
        <input style={s.dateInput} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />

        <button style={s.clearBtn} onClick={resetFilters}>Clear</button>

        <span style={s.totalLabel}>{total.toLocaleString()} entries</span>
      </div>

      {/* Log table */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={4} />
      ) : logs.length === 0 ? (
        <div style={s.empty}>No activity found for the selected filters.</div>
      ) : (
        <div style={s.logList}>
          {logs.map((log) => {
            const meta = ACTION_META[log.action] || { label: log.action, color: TEXT_MUTED, bg: '#f7f8fa', icon: '•' };
            const roleMeta = ROLE_META[log.actorRole] || { label: log.actorRole, color: TEXT_MUTED };
            const detail = fmtDetails(log.details);
            return (
              <div key={log.id} style={s.row}>
                {/* Action badge */}
                <div style={{ ...s.actionBadge, background: meta.bg, color: meta.color }}>
                  <span style={{ fontSize: 16 }}><Glyph e={meta.icon} size={18} /></span>
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
                  {log.storeName && <span style={s.storeTag}>{log.storeName}</span>}
                  {!log.storeName && log.storeId && <span style={s.storeTag}>store</span>}
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
      <DataTablePagination
        page={page}
        totalPages={totalPages}
        onPrevious={() => setPage(p => p - 1)}
        onNext={() => setPage(p => p + 1)}
      />
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  container: { padding: 32 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: 700, color: PRIMARY, margin: 0 },
  sub: { color: TEXT_MUTED, marginTop: 4, fontSize: 14 },
  refreshBtn: { background: PRIMARY, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', cursor: 'pointer', fontWeight: 700, fontSize: 15 },

  statsStrip: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20 },
  statChip: { borderRadius: 8, padding: '6px 14px', display: 'flex', gap: 6, alignItems: 'center', fontSize: 15 },
  statNote: { color: TEXT_MUTED, fontSize: 14, marginLeft: 'auto' },

  alertBox: {
    background: '#fdf6e8', border: '1px solid #ffc107', borderRadius: 10,
    padding: '12px 16px', marginBottom: 20, fontSize: 14, color: '#8a5300',
  },

  filters: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 20, padding: '14px 16px', background: '#f7f8fa', borderRadius: 12 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e4e7ec', fontSize: 15, background: '#fff', cursor: 'pointer' },
  dateInput: { padding: '8px 12px', borderRadius: 8, border: '1px solid #e4e7ec', fontSize: 15 },
  clearBtn: { padding: '8px 16px', borderRadius: 8, border: '1px solid #e4e7ec', background: '#fff', cursor: 'pointer', fontSize: 15, color: TEXT_MUTED, fontWeight: 600 },
  totalLabel: { marginLeft: 'auto', color: TEXT_MUTED, fontSize: 15, fontWeight: 600 },

  logList: { display: 'flex', flexDirection: 'column', gap: 6 },
  row: {
    display: 'grid',
    gridTemplateColumns: '180px 160px 1fr 80px',
    alignItems: 'center',
    gap: 16,
    background: '#fff',
    borderRadius: 10,
    padding: '12px 16px',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
    border: '1px solid #e4e7ec',
  },

  actionBadge: { display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 14 },
  actionLabel: { whiteSpace: 'nowrap' as const },

  actor: { display: 'flex', flexDirection: 'column', gap: 2 },
  actorName: { fontWeight: 700, fontSize: 14, color: PRIMARY, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  roleBadge: { fontSize: 13, fontWeight: 600 },

  detail: { display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' },
  detailText: { fontSize: 15, color: '#374151', whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  storeTag: { fontSize: 13, color: TEXT_MUTED },

  time: { fontSize: 14, color: TEXT_MUTED, textAlign: 'right' as const, cursor: 'default', whiteSpace: 'nowrap' as const },

  empty: { color: TEXT_MUTED, textAlign: 'center', padding: 60 },
};
