import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditApi, storesApi } from '../services/api';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import DataTablePagination from '../components/DataTablePagination';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { storeToday, addDays, startOfStoreDay, endOfStoreDay } from '../lib/storeDates';
import { Page, PageHeader, Button } from '../components/kit';
import { RefreshCw } from 'lucide-react';
import Glyph from '../components/Glyph';
import { useIsMobile } from '../hooks/use-mobile';

// ─── Action metadata ──────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  // Points
  GRANT_POINTS:              { label: 'Grant points',           color: '#1a7f45', bg: '#2DC65318', icon: '💰' },
  REDEEM_CREDITS:            { label: 'Redeem credits',         color: '#3c6e8f', bg: '#457b9d18', icon: '🎁' },
  REJECT_TRANSACTION:        { label: 'Reject transaction',     color: '#c42130', bg: '#E6394618', icon: '❌' },
  SELF_GRANT:                { label: 'Self grant (QR)',        color: '#1a7f45', bg: '#2DC65318', icon: '📄' },
  BROADCAST:                 { label: 'Push sent',              color: '#3c6e8f', bg: '#457b9d18', icon: '📢' },
  DISPUTE_APPROVED:          { label: 'Dispute approved',       color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  DISPUTE_REJECTED:          { label: 'Dispute rejected',       color: '#c42130', bg: '#E6394618', icon: '❌' },
  APPROVE:                   { label: 'Sale approved',          color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  APPROVE_FLAGGED:           { label: 'Held sale approved',     color: '#1a7f45', bg: '#2DC65318', icon: '🟢' },
  REJECT_FLAGGED:            { label: 'Held sale rejected',     color: '#c42130', bg: '#E6394618', icon: '🔴' },
  VOID_TRANSACTION:          { label: 'Sale voided',            color: '#c42130', bg: '#E6394618', icon: '↩️' },
  AUTO_EXPIRE_PENDING:       { label: 'Unfinished sales expired', color: '#5a6472', bg: '#6c757d18', icon: '⌛' },
  GOODWILL_CREDIT:           { label: 'Goodwill credit',        color: '#1a7f45', bg: '#2DC65318', icon: '🤝' },
  CLAIM_TIER_BENEFIT:        { label: 'Tier perk used',         color: '#8a5300', bg: '#b8860b18', icon: '⭐' },
  CATALOG_REDEMPTION:        { label: 'Reward redeemed',        color: '#3c6e8f', bg: '#457b9d18', icon: '🎁' },
  CATALOG_CONFIRM:           { label: 'Reward handed out',      color: '#3c6e8f', bg: '#457b9d18', icon: '✅' },
  WELCOME_GIFT:              { label: 'Welcome gift given',     color: '#3c6e8f', bg: '#457b9d18', icon: '🎉' },
  WINBACK_SEND:              { label: 'Win-back gifts sent',    color: '#1a7f45', bg: '#2DC65318', icon: '🎁' },
  // Rewards and notices
  CATALOG_ITEM_CREATE:       { label: 'Reward added',           color: PRIMARY, bg: '#1D355718', icon: '🎁' },
  CATALOG_ITEM_UPDATE:       { label: 'Reward changed',         color: PRIMARY, bg: '#1D355718', icon: '✏️' },
  CATALOG_POINTS_FOLLOWED_PRICE: { label: 'Reward points followed price', color: PRIMARY, bg: '#1D355718', icon: '🔗' },
  NOTICE_CREATE:             { label: 'Notice posted',          color: '#8a5300', bg: '#F4A26118', icon: '📌' },
  NOTICE_DEACTIVATE:         { label: 'Notice taken down',      color: '#5a6472', bg: '#6c757d18', icon: '⏹️' },
  NOTICE_DELETE:             { label: 'Notice deleted',         color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  NOTICE_UPDATE:             { label: 'Notice edited',          color: '#1D3557', bg: '#1D355718', icon: '✏️' },
  NOTICE_REACTIVATE:         { label: 'Notice brought back',    color: '#17663a', bg: '#2DC65318', icon: '🔄' },
  PROMOTION_PUBLISH:         { label: 'Business ad published',  color: '#1a7f45', bg: '#2DC65318', icon: '📣' },
  PROMOTION_REJECT:          { label: 'Business ad declined',   color: '#5a6472', bg: '#6c757d18', icon: '🚫' },
  PROMOTION_SETTINGS:        { label: 'Featured ads setting',   color: '#3c6e8f', bg: '#3c6e8f18', icon: '⭐' },
  PROMOTION_DELETE:          { label: 'Business ad deleted',    color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  CLEAR_CHAT:                { label: 'Store chat cleared',     color: '#c42130', bg: '#E6394618', icon: '🧹' },
  // Accounts, stores and the daily messages
  EDIT_STAFF:                { label: 'Staff edited',           color: PRIMARY, bg: '#1D355718', icon: '✏️' },
  DELETE_OWN_ACCOUNT:        { label: 'Customer deleted account', color: '#c42130', bg: '#E6394618', icon: '👋' },
  CREATE_STORE:              { label: 'Store added',            color: '#1D3557', bg: '#0369a118', icon: '🏪' },
  UPDATE_HOT_FOOD_HOURS:     { label: 'Hot food hours changed', color: '#8a5300', bg: '#ea580c18', icon: '🔥' },
  MORNING_SUMMARY:           { label: 'Morning summary sent',   color: '#5a6472', bg: '#6c757d18', icon: '🌅' },
  WEEKLY_SUMMARY:            { label: 'Weekly summary sent',    color: '#5a6472', bg: '#6c757d18', icon: '📊' },
  // Offers & Banners
  CREATE_OFFER:              { label: 'Create offer',           color: '#8a5300', bg: '#F4A26118', icon: '📢' },
  UPDATE_OFFER:              { label: 'Update offer',           color: '#8a5300', bg: '#F4A26118', icon: '✏️' },
  DELETE_OFFER:              { label: 'Delete offer',           color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  OFFER_REQUESTED:           { label: 'Promotion requested',    color: '#8a5300', bg: '#F4A26118', icon: '🙋' },
  OFFER_REQUEST_APPROVED:    { label: 'Promotion request approved', color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  OFFER_REQUEST_DECLINED:    { label: 'Promotion request declined', color: '#c42130', bg: '#E6394618', icon: '❌' },
  OFFER_REQUEST_WITHDRAWN:   { label: 'Promotion request withdrawn', color: '#5a6472', bg: '#6c757d18', icon: '↩️' },
  PROMOTION_BUDGET_USED:     { label: 'Promotion budget used up', color: '#c42130', bg: '#E6394618', icon: '💸' },
  CHALLENGE_CREATE:          { label: 'Challenge posted',       color: '#8a5300', bg: '#F4A26118', icon: '🏆' },
  CHALLENGE_UPDATE:          { label: 'Challenge changed',      color: '#8a5300', bg: '#F4A26118', icon: '✏️' },
  SHELF_DEAL_VISIBILITY:     { label: 'Shelf deal shown/hidden', color: '#3c6e8f', bg: '#457b9d18', icon: '🏷️' },
  CREATE_BANNER:             { label: 'Create banner',          color: '#8a5300', bg: '#F4A26118', icon: '🖼️' },
  DELETE_BANNER:             { label: 'Delete banner',          color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  // Staff & Access
  CREATE_STAFF:              { label: 'Create staff',           color: '#4f6d8f', bg: '#9b5de518', icon: '👤' },
  TOGGLE_USER:               { label: 'Deactivate / reactivate', color: '#c42130', bg: '#E6394618', icon: '🔒' },
  RESET_PIN:                 { label: 'Reset PIN',              color: '#c42130', bg: '#E6394618', icon: '🔑' },
  SIGN_OUT_EVERYWHERE:       { label: 'Signed out everywhere',  color: '#1D3557', bg: '#1D355718', icon: '🔒' },
  CREATE_SUPER_ADMIN:        { label: 'Create Super Admin',     color: '#4f6d8f', bg: '#9b5de518', icon: '🏢' },
  DELETE_USER:               { label: 'Delete account',         color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  DELETE_USER_REFUSED:       { label: 'Delete refused',         color: '#c42130', bg: '#E6394618', icon: '⛔' },
  DENIED_ACCOUNT_ACTION:     { label: 'Refused (role too low)', color: '#c42130', bg: '#E6394618', icon: '⛔' },
  ADD_STORE:                 { label: 'Add store assignment',   color: '#4f6d8f', bg: '#9b5de518', icon: '🏪' },
  REMOVE_STORE:              { label: 'Remove store assign.',   color: '#c42130', bg: '#E6394618', icon: '🚫' },
  SET_STORES:                { label: 'Change stores',          color: '#4f6d8f', bg: '#9b5de518', icon: '🏪' },
  // Stores
  UPDATE_STORE:              { label: 'Store edited',           color: '#1D3557', bg: '#0369a118', icon: '🏪' },
  GAS_PRICE_UPDATE:          { label: 'Gas / diesel price',     color: '#1D3557', bg: '#0369a118', icon: '⛽' },
  UPDATE_STORE_HOURS:        { label: 'Store hours changed',    color: '#1D3557', bg: '#0369a118', icon: '🕐' },
  ADD_STORE_HOLIDAY:         { label: 'Holiday hours added',    color: '#1D3557', bg: '#0369a118', icon: '📅' },
  DELETE_STORE_HOLIDAY:      { label: 'Holiday hours removed',  color: '#c42130', bg: '#E6394618', icon: '📅' },
  ADD_KEYWORD_MAPPING:       { label: 'POS keyword added',      color: '#1D3557', bg: '#0369a118', icon: '🗂️' },
  DELETE_KEYWORD_MAPPING:    { label: 'POS keyword removed',    color: '#c42130', bg: '#E6394618', icon: '🗂️' },
  REGENERATE_API_KEY:        { label: 'Printer key regenerated', color: '#c42130', bg: '#E6394618', icon: '🔑' },
  // Scheduling
  ASSIGN_SHIFT:              { label: 'Assign shift',           color: '#1D3557', bg: '#0369a118', icon: '📅' },
  REMOVE_SHIFT:              { label: 'Remove shift',           color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  CREATE_SHIFT_REQUEST:      { label: 'Shift request',          color: TEXT_MUTED, bg: '#6c757d18', icon: '🙋' },
  APPROVE_SHIFT_REQUEST:     { label: 'Approve shift req.',     color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  DENY_SHIFT_REQUEST:        { label: 'Deny shift req.',        color: '#c42130', bg: '#E6394618', icon: '❌' },
  // Store Requests
  SUBMIT_STORE_REQUEST:      { label: 'Store request',          color: '#8a5300', bg: '#f59e0b18', icon: '📋' },
  ACKNOWLEDGE_STORE_REQUEST: { label: 'Acknowledge request',    color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  // Billing
  BILLING_GENERATE:          { label: 'Make bills',             color: '#1D3557', bg: '#0369a118', icon: '🧾' },
  BILLING_FILL_MISSING:      { label: 'Fill in missing bills',  color: '#1D3557', bg: '#0369a118', icon: '🧩' },
  HOT_FOOD_ITEM_CREATED:        { label: 'Hot food item added', color: '#8a5300', bg: '#ea580c18', icon: '🔥' },
  HOT_FOOD_ITEM_UPDATED:        { label: 'Hot food item changed', color: '#8a5300', bg: '#ea580c18', icon: '🔥' },
  HOT_FOOD_ITEM_DELETED:        { label: 'Hot food item deleted', color: '#c42130', bg: '#E6394618', icon: '🔥' },
  HOT_FOOD_ITEM_STORE_ADDED:    { label: 'Hot food item added to store', color: '#8a5300', bg: '#ea580c18', icon: '🔥' },
  HOT_FOOD_ITEM_STORE_REMOVED:  { label: 'Hot food item removed from store', color: '#8a5300', bg: '#ea580c18', icon: '🔥' },
  MISSING_PERSON_POSTED:        { label: 'Missing person posted', color: '#1D3557', bg: '#0369a118', icon: '🔎' },
  MISSING_PERSON_EDITED:        { label: 'Missing person edited', color: '#1D3557', bg: '#0369a118', icon: '🔎' },
  MISSING_PERSON_CONFIRMED:     { label: 'Missing person rechecked', color: '#1D3557', bg: '#0369a118', icon: '🔎' },
  MISSING_PERSON_REPORTED:      { label: 'Missing person poster reported', color: '#c42130', bg: '#E6394618', icon: '🔎' },
  CAREERS_APPLICATION_UPDATED:  { label: 'Job application updated', color: '#1D3557', bg: '#0369a118', icon: '🧑‍💼' },
  CAREERS_APPLICATION_DELETED:  { label: 'Job application deleted', color: '#c42130', bg: '#E6394618', icon: '🧑‍💼' },
  CAREERS_OPENING_CREATED:      { label: 'Job opening added', color: '#1D3557', bg: '#0369a118', icon: '🧑‍💼' },
  CAREERS_OPENING_UPDATED:      { label: 'Job opening changed', color: '#1D3557', bg: '#0369a118', icon: '🧑‍💼' },
  CAREERS_OPENING_DELETED:      { label: 'Job opening deleted', color: '#c42130', bg: '#E6394618', icon: '🧑‍💼' },
  ORDER_CATEGORY_UPDATED:       { label: 'Order category changed', color: '#1D3557', bg: '#0369a118', icon: '🗂️' },
  SETTINGS_ENGAGEMENT_UPDATE: { label: 'Engagement changed', color: '#1D3557', bg: '#0369a118', icon: '✨' },
  STORE_GOAL_CREATE:          { label: 'Store goal created', color: '#1a7f45', bg: '#2DC65318', icon: '🏪' },
  FLASH_DEAL_CREATE:          { label: 'Flash deal sent', color: '#a51b28', bg: '#CC293618', icon: '⚡' },
  FLASH_DEAL_END:             { label: 'Flash deal ended', color: '#5a6472', bg: '#5a647218', icon: '⚡' },
  SETTINGS_RULES_UPDATE:          { label: 'Rules changed', color: '#1D3557', bg: '#0369a118', icon: '⚙️' },
  SETTINGS_FEATURES_UPDATE:       { label: 'Features switched', color: '#1D3557', bg: '#0369a118', icon: '🎚️' },
  SETTINGS_BUSINESS_UPDATE:       { label: 'Contact details changed', color: '#1D3557', bg: '#0369a118', icon: '☎️' },
  SETTINGS_WELCOME_UPDATE:        { label: 'Joining bonus changed', color: '#1D3557', bg: '#0369a118', icon: '🎁' },
  SETTINGS_EXPIRY_UPDATE:         { label: 'Points expiry changed', color: '#1D3557', bg: '#0369a118', icon: '⏳' },
  REFERRAL_SETTINGS_UPDATE:       { label: 'Refer a friend changed', color: '#1D3557', bg: '#0369a118', icon: '🤝' },
  RECEIPT_SCAN_SETTINGS:          { label: 'Receipt scanning changed', color: '#1D3557', bg: '#0369a118', icon: '🧾' },
  RECEIPT_SCAN:                   { label: 'Receipt scanned', color: '#1D3557', bg: '#0369a118', icon: '🧾' },
  POINTS_EXPIRED:                 { label: 'Points expired', color: '#8a5300', bg: '#fdf6e8', icon: '⏳' },
  POINTS_EXPIRY_SKIPPED:          { label: 'Points expiry skipped', color: '#5a6472', bg: '#5a647218', icon: '⏳' },
  POINTS_EXPIRY_UNDONE:           { label: 'Points expiry undone', color: '#1a7f45', bg: '#2DC65318', icon: '↩️' },
  CANCEL_UNFINISHED_SALES:        { label: 'Unfinished sales cancelled', color: '#8a5300', bg: '#fdf6e8', icon: '🧹' },
  CUSTOMER_UNLOCK:                { label: 'Customer unlocked', color: '#1a7f45', bg: '#2DC65318', icon: '🔓' },
  CUSTOMER_NOTE_DELETE:           { label: 'Customer note deleted', color: '#5a6472', bg: '#5a647218', icon: '🗒️' },
  HOT_FOOD_COMBO_CREATE:          { label: 'Hot food combo added', color: '#c2410c', bg: '#c2410c18', icon: '🍱' },
  HOT_FOOD_COMBO_UPDATE:          { label: 'Hot food combo changed', color: '#c2410c', bg: '#c2410c18', icon: '🍱' },
  HOT_FOOD_COMBO_DELETE:          { label: 'Hot food combo removed', color: '#a51b28', bg: '#CC293618', icon: '🍱' },
  HOT_FOOD_MENU_GRID:             { label: 'Hot food menus changed', color: '#c2410c', bg: '#c2410c18', icon: '🍗' },
  COMBO_IDEAS_RESTORED:           { label: 'Combo ideas shown again', color: '#1D3557', bg: '#0369a118', icon: '💡' },
  LABEL_PRINTER_FINE_TUNE:        { label: 'Label printer adjusted', color: '#1D3557', bg: '#0369a118', icon: '🖨️' },
  MISSING_PERSON_REQUESTED:       { label: 'Missing person poster requested', color: '#8a5300', bg: '#fdf6e8', icon: '📝' },
  MISSING_PERSON_REQUEST_DECLINED:{ label: 'Missing person request declined', color: '#a51b28', bg: '#CC293618', icon: '📝' },
  MISSING_PERSON_ALERT:           { label: 'Missing person alert sent', color: '#a51b28', bg: '#CC293618', icon: '🚨' },
  MISSING_PERSON_ENDED:           { label: 'Missing person poster ended', color: '#1a7f45', bg: '#2DC65318', icon: '✅' },
  UPDATE_BANNER:                  { label: 'Banner changed', color: '#1D3557', bg: '#0369a118', icon: '🖼️' },
  TEST_PUSH:                      { label: 'Test push sent', color: '#5a6472', bg: '#5a647218', icon: '🔔' },
  STORE_GOAL_UPDATE:          { label: 'Store goal changed', color: '#1D3557', bg: '#0369a118', icon: '🏪' },
  SETTINGS_THEME_UPDATE:      { label: 'App theme changed', color: '#1D3557', bg: '#0369a118', icon: '🎃' },
  ORDER_CATEGORY_DELETED:       { label: 'Order category deleted', color: '#c42130', bg: '#E6394618', icon: '🗂️' },
  BILLING_RECALCULATE:       { label: 'Recalculate bill',       color: '#1D3557', bg: '#0369a118', icon: '🔄' },
  BILLING_MARK_PAID:         { label: 'Mark bill paid',         color: '#1a7f45', bg: '#2DC65318', icon: '💳' },
  BILLING_MARK_PERIOD_PAID:  { label: 'Mark month paid',        color: '#1a7f45', bg: '#2DC65318', icon: '💳' },
  BILLING_UNDO_PAID:         { label: 'Undo payment',           color: '#c42130', bg: '#E6394618', icon: '↩️' },
  BILLING_CHARGE_ADD:        { label: 'Add extra charge',       color: '#8a5300', bg: '#F4A26118', icon: '➕' },
  BILLING_CHARGE_EDIT:       { label: 'Edit extra charge',      color: '#8a5300', bg: '#F4A26118', icon: '✏️' },
  BILLING_CHARGE_DELETE:     { label: 'Delete extra charge',    color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  BILLING_REPORT_SENT:       { label: 'Billing report sent',    color: '#3c6e8f', bg: '#457b9d18', icon: '📨' },
  STORE_BILLING_UPDATE:      { label: 'Store plan / fee',       color: '#4f6d8f', bg: '#9b5de518', icon: '⚙️' },
  DEV_CUT_RATE_UPDATE:       { label: 'Default fee rate',       color: '#4f6d8f', bg: '#9b5de518', icon: '⚙️' },
  APP_VERSIONS_UPDATE:       { label: 'App versions',           color: '#4f6d8f', bg: '#9b5de518', icon: '📱' },
  // Rates
  RATE_TIER_UPDATE:          { label: 'Tier rates changed',     color: '#4f6d8f', bg: '#9b5de518', icon: '🏆' },
  RATE_CATEGORY_UPDATE:      { label: 'Category bonus changed', color: '#4f6d8f', bg: '#9b5de518', icon: '📦' },
  TIER_PERIOD_RESET:         { label: 'Tier period reset',      color: '#3c6e8f', bg: '#457b9d18', icon: '🔄' },
  // Labels
  CREATE_LABEL:              { label: 'Create label',           color: PRIMARY, bg: '#1D355718', icon: '🏷️' },
  UPDATE_LABEL:              { label: 'Update label',           color: PRIMARY, bg: '#1D355718', icon: '✏️' },
  DELETE_LABEL:              { label: 'Delete label',           color: '#c42130', bg: '#E6394618', icon: '🗑️' },
  LABEL_CHANGE_REFUSED:      { label: 'Label change refused',   color: '#c42130', bg: '#E6394618', icon: '⛔' },
  PRINT_LABEL:               { label: 'Print label(s)',         color: '#17663a', bg: '#0f513218', icon: '🖨️' },
  STORE_LABEL_PRICE:         { label: 'Store label price',      color: PRIMARY, bg: '#1D355718', icon: '💲' },
  STORE_LABEL_REMOVED:       { label: 'Label removed from store', color: '#c42130', bg: '#E6394618', icon: '➖' },
  PUSH_LABEL_TO_ALL_STORES:  { label: 'Label added to all stores', color: PRIMARY, bg: '#1D355718', icon: '📤' },
  LABEL_SALE_ENDED:          { label: 'Sale prices ended',      color: '#3c6e8f', bg: '#457b9d18', icon: '⏱️' },
  LABELS_MERGED:             { label: 'Same-barcode items merged', color: PRIMARY, bg: '#1D355718', icon: '🔗' },
  LABELS_IMPORTED:           { label: 'Labels imported',        color: PRIMARY, bg: '#1D355718', icon: '📥' },
  DEAL_RECOMMENDATIONS_RESTORED: { label: 'Deal suggestions shown again', color: PRIMARY, bg: '#1D355718', icon: '💡' },
  DEAL_LIMITS:               { label: 'Deal limits changed',    color: PRIMARY, bg: '#1D355718', icon: '📏' },
  DEALS_BULK:                { label: 'Deals set together',     color: PRIMARY, bg: '#1D355718', icon: '🏷️' },
  DEAL_LEARNING_RESET:       { label: 'Deal suggestions started over', color: PRIMARY, bg: '#1D355718', icon: '🔄' },
};

const ROLE_META: Record<string, { label: string; color: string }> = {
  DEV_ADMIN:    { label: 'Dev Admin',     color: '#1a7f45' },
  SUPER_ADMIN:  { label: 'Super Admin',   color: '#8a5300' },
  STORE_MANAGER:{ label: 'Store Manager', color: '#1d6fa5' },
  EMPLOYEE:     { label: 'Employee',      color: TEXT_MUTED },
  CUSTOMER:     { label: 'Customer',      color: '#7a3e9d' },
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
    // What changed (hot food items, job openings and applications, order categories, missing person posters)
    if (typeof d.applicant === 'string') parts.push(d.position ? `${d.applicant} for ${d.position}` : d.applicant);
    if (d.price != null && d.changes === undefined) parts.push(`$${Number(d.price).toFixed(2)}`);
    if (d.changes && typeof d.changes === 'object') {
      for (const [k, v] of Object.entries(d.changes as Record<string, { was: unknown; now: unknown }>)) {
        const show = (x: unknown) => (k === 'price' && x != null ? `$${Number(x).toFixed(2)}` : x == null || x === '' ? 'none' : String(x));
        parts.push(`${k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${show(v?.was)} → ${show(v?.now)}`);
      }
    }
    if (d.status && typeof d.status === 'object' && 'was' in d.status) parts.push(`status ${String(d.status.was).toLowerCase()} → ${String(d.status.now).toLowerCase()}`);
    if (typeof d.renamedTo === 'string') parts.push(`renamed to ${d.renamedTo}`);
    if (Array.isArray(d.changed)) {
      const said = d.changed.filter((k: string) => !((k === 'name' && d.renamedTo) || (k === 'status' && d.status && typeof d.status === 'object')));
      if (said.length) parts.push(`changed ${said.join(', ')}`);
    }
    if (d.notesChanged) parts.push('notes changed');
    if (typeof d.live === 'boolean') parts.push(d.live ? 'live' : 'hidden');
    if (typeof d.reason === 'string' && d.reason && !d.footprint && !d.summary) parts.push(`“${d.reason.length > 120 ? d.reason.slice(0, 117) + '…' : d.reason}”`);
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
    // HQ's Grant & Redeem page: who served the customer
    if (d.noReceipt)              parts.push('no receipt photo');
    if (d.heldFlagsWaived)        parts.push('review flags waived by HQ');
    if (d.enteredByHQ)            parts.push(`served by ${d.servedByName || 'an employee'}, entered by HQ`);
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
  const narrow = useIsMobile();   // a phone: each entry stacks (the four columns pushed the time and the detail off the screen)
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
    <Page>
      {/* Header */}
      <PageHeader
        title="Activity log"
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
          {' '}(deletions, user toggles, PIN resets): review below.
        </div>
      )}

      {/* Filters */}
      <div style={s.filters}>
        <select aria-label="Action" style={s.select} value={action} onChange={(e) => { setAction(e.target.value); setPage(1); }}>
          <option value="">All actions</option>
          <optgroup label="── Points ──">
            {['GRANT_POINTS','APPROVE','APPROVE_FLAGGED','REJECT_FLAGGED','REJECT_TRANSACTION','VOID_TRANSACTION','AUTO_EXPIRE_PENDING','GOODWILL_CREDIT','CLAIM_TIER_BENEFIT','REDEEM_CREDITS','CATALOG_REDEMPTION','CATALOG_CONFIRM','WELCOME_GIFT','WINBACK_SEND','SELF_GRANT','DISPUTE_APPROVED','DISPUTE_REJECTED','BROADCAST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Offers & banners ──">
            {['CREATE_OFFER','UPDATE_OFFER','DELETE_OFFER','OFFER_REQUESTED','OFFER_REQUEST_APPROVED','OFFER_REQUEST_DECLINED','OFFER_REQUEST_WITHDRAWN','SHELF_DEAL_VISIBILITY','CREATE_BANNER','DELETE_BANNER','PROMOTION_BUDGET_USED','CHALLENGE_CREATE','CHALLENGE_UPDATE'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Rates ──">
            {['RATE_TIER_UPDATE','RATE_CATEGORY_UPDATE','TIER_PERIOD_RESET'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Billing ──">
            {['BILLING_GENERATE','BILLING_FILL_MISSING','BILLING_RECALCULATE','BILLING_MARK_PAID','BILLING_MARK_PERIOD_PAID','BILLING_UNDO_PAID','BILLING_CHARGE_ADD','BILLING_CHARGE_EDIT','BILLING_CHARGE_DELETE','BILLING_REPORT_SENT','STORE_BILLING_UPDATE','DEV_CUT_RATE_UPDATE','APP_VERSIONS_UPDATE'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Staff & access ──">
            {['CREATE_STAFF','EDIT_STAFF','CREATE_SUPER_ADMIN','TOGGLE_USER','RESET_PIN','ADD_STORE','REMOVE_STORE','SET_STORES','DELETE_USER','DELETE_USER_REFUSED','DENIED_ACCOUNT_ACTION','DELETE_OWN_ACCOUNT'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Stores ──">
            {['CREATE_STORE','UPDATE_STORE','CLEAR_CHAT','GAS_PRICE_UPDATE','UPDATE_STORE_HOURS','UPDATE_HOT_FOOD_HOURS','ADD_STORE_HOLIDAY','DELETE_STORE_HOLIDAY','ADD_KEYWORD_MAPPING','DELETE_KEYWORD_MAPPING','REGENERATE_API_KEY'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Rewards, notices & local ads ──">
            {['CATALOG_ITEM_CREATE','CATALOG_ITEM_UPDATE','CATALOG_POINTS_FOLLOWED_PRICE','NOTICE_CREATE','NOTICE_UPDATE','NOTICE_REACTIVATE','NOTICE_DEACTIVATE','NOTICE_DELETE','PROMOTION_PUBLISH','PROMOTION_REJECT','PROMOTION_DELETE','PROMOTION_SETTINGS'].map(k => (
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
          <optgroup label="── Store requests ──">
            {['SUBMIT_STORE_REQUEST','ACKNOWLEDGE_STORE_REQUEST'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Labels ──">
            {['CREATE_LABEL','UPDATE_LABEL','DELETE_LABEL','LABEL_CHANGE_REFUSED','PRINT_LABEL','STORE_LABEL_PRICE','STORE_LABEL_REMOVED','PUSH_LABEL_TO_ALL_STORES','LABEL_SALE_ENDED','LABELS_MERGED','LABELS_IMPORTED','DEAL_RECOMMENDATIONS_RESTORED','DEAL_LIMITS','DEALS_BULK','DEAL_LEARNING_RESET'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Hot food ──">
            {['HOT_FOOD_ITEM_CREATED', 'HOT_FOOD_ITEM_UPDATED', 'HOT_FOOD_ITEM_DELETED', 'HOT_FOOD_ITEM_STORE_ADDED', 'HOT_FOOD_ITEM_STORE_REMOVED'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Missing persons ──">
            {['MISSING_PERSON_POSTED', 'MISSING_PERSON_EDITED', 'MISSING_PERSON_CONFIRMED', 'MISSING_PERSON_REPORTED'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
          <optgroup label="── Careers & order lists ──">
            {['CAREERS_APPLICATION_UPDATED', 'CAREERS_APPLICATION_DELETED', 'CAREERS_OPENING_CREATED', 'CAREERS_OPENING_UPDATED', 'CAREERS_OPENING_DELETED', 'ORDER_CATEGORY_UPDATED', 'ORDER_CATEGORY_DELETED'].map(k => (
              <option key={k} value={k}>{ACTION_META[k].label}</option>
            ))}
          </optgroup>
        </select>

        <select aria-label="Who did it" style={s.select} value={actorRole} onChange={(e) => { setActorRole(e.target.value); setPage(1); }}>
          <option value="">All roles</option>
          <option value="DEV_ADMIN">Dev Admin</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="STORE_MANAGER">Store Manager</option>
          <option value="EMPLOYEE">Employee</option>
          <option value="CUSTOMER">Customer</option>
        </select>

        <select aria-label="Store" style={s.select} value={storeId} onChange={(e) => { setStoreId(e.target.value); setPage(1); }}>
          <option value="">All stores</option>
          {stores.map((s: any) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <input aria-label="From date" style={s.dateInput} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        <span style={{ color: TEXT_MUTED, fontSize: 15 }}>to</span>
        <input aria-label="To date" style={s.dateInput} type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />

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
              <div key={log.id} style={narrow ? { ...s.row, gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 8 } : s.row}>
                {/* Action badge */}
                <div style={{ ...s.actionBadge, background: meta.bg, color: meta.color, ...(narrow ? { justifySelf: 'start' } : {}) }}>
                  <span style={{ fontSize: 16 }}><Glyph e={meta.icon} size={18} /></span>
                  <span style={s.actionLabel}>{meta.label}</span>
                </div>

                {/* Actor */}
                <div style={narrow ? { ...s.actor, gridColumn: '1 / -1', flexDirection: 'row', gap: 8, alignItems: 'baseline', order: 3 } : s.actor}>
                  <div style={s.actorName}>{log.actorName || log.actorId.slice(0, 8)}</div>
                  <div style={{ ...s.roleBadge, color: roleMeta.color }}>{roleMeta.label}</div>
                </div>

                {/* Detail */}
                <div style={narrow ? { ...s.detail, gridColumn: '1 / -1', order: 4 } : s.detail}>
                  {detail && <span style={narrow ? { ...s.detailText, whiteSpace: 'normal' } : s.detailText} title={typeof detail === 'string' ? detail : undefined}>{detail}</span>}
                  {log.storeName && <span style={s.storeTag}>{log.storeName}</span>}
                  {!log.storeName && log.storeId && <span style={s.storeTag}>store</span>}
                </div>

                {/* Time */}
                <div style={narrow ? { ...s.time, order: 2 } : s.time} title={new Date(log.createdAt).toLocaleString()}>
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
    </Page>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
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
    gridTemplateColumns: '230px 150px minmax(0, 1fr) 80px',
    alignItems: 'center',
    gap: 16,
    background: '#fff',
    borderRadius: 10,
    padding: '12px 16px',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)',
    border: '1px solid #e4e7ec',
  },

  actionBadge: { display: 'flex', alignItems: 'center', gap: 6, borderRadius: 8, padding: '5px 10px', fontWeight: 700, fontSize: 14 },
  actionLabel: { whiteSpace: 'normal' as const, lineHeight: 1.25 },

  actor: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
  actorName: { fontWeight: 700, fontSize: 14, color: PRIMARY, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
  roleBadge: { fontSize: 13, fontWeight: 600 },

  detail: { display: 'flex', flexDirection: 'column', gap: 3, overflow: 'hidden' },
  // up to three lines, the rest on hover (2026-10-25: one line cut short, so long change summaries could not be read)
  detailText: { fontSize: 15, color: '#374151', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' as const, overflow: 'hidden' },
  storeTag: { fontSize: 13, color: TEXT_MUTED },

  time: { fontSize: 14, color: TEXT_MUTED, textAlign: 'right' as const, cursor: 'default', whiteSpace: 'nowrap' as const },

  empty: { color: TEXT_MUTED, textAlign: 'center', padding: 60 },
};
