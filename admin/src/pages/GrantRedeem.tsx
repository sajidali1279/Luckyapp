// Grant & Redeem (2026-10-15, HQ only): the cashier's scan screen on the admin site. An employee with no phone sends HQ a photo of the
// customer's QR and of the receipt; HQ enters the sale (or the redemption) here, at that store, naming the employee who served. The same
// server calls as the cashier's app (mobile/app/(employee)/scan.tsx) with the same checks; the sale records the employee as servedById,
// so their sales counts and the customer's rating go to them, and the Activity Log shows HQ entered it (backend utils/servedBy.ts).
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Camera, Search, X, Receipt, Gift, Wallet, Star, PartyPopper, Clock, Plus, Trash2, CheckCircle2, ImagePlus } from 'lucide-react';
import { counterApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { Page, PageHeader, Card, SectionTitle, Button, Tabs, Badge, Notice, Field, EmptyState, HowItWorks } from '../components/kit';
import ConfirmModal from '../components/ConfirmModal';
import { C, FONT, INPUT, RADIUS } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { showPhone } from '../lib/phoneText';
import { pickStore, rememberStore } from '../lib/lastStore';
import { readQrPhoto, isCustomerQr } from '../lib/qrPhoto';
import { fingerprint, shrinkPhoto } from '../lib/photoPrep';
import { useLimits } from '../components/SettingsCards';

const PAGE_KEY = 'grant-redeem';
const MAX_PHOTO = 10 * 1024 * 1024;   // the server's upload limit

const CATEGORIES: { value: string; label: string }[] = [
  { value: 'GAS', label: 'Gas' }, { value: 'DIESEL', label: 'Diesel' }, { value: 'HOT_FOODS', label: 'Hot foods' },
  { value: 'GROCERIES', label: 'Groceries' }, { value: 'FROZEN_FOODS', label: 'Frozen foods' }, { value: 'FRESH_FOODS', label: 'Fresh foods' },
  { value: 'TOBACCO_VAPES', label: 'Tobacco / vapes' }, { value: 'ALCOHOL', label: 'Alcohol' }, { value: 'OTHER', label: 'Other' },
];
const isGasCategory = (c: string) => c === 'GAS' || c === 'DIESEL';
const TIER_LABEL: Record<string, string> = { BRONZE: 'Bronze', SILVER: 'Silver', GOLD: 'Gold', DIAMOND: 'Diamond', PLATINUM: 'Platinum' };
const ROLE_LABEL: Record<string, string> = { EMPLOYEE: 'Employee', STORE_MANAGER: 'Store manager' };

type StoreRow = { id: string; name: string; gasPricePerGallon?: number | null; dieselPricePerGallon?: number | null; enabledCategories?: string[] };
type StaffRow = { id: string; name: string | null; phone: string; role: string };
type CustomerInfo = {
  id: string; name: string | null; phone: string; pointsBalance: number; tier: string; periodPts: number; nextTier: string | null; nextPts: number | null;
  benefit: { available: boolean; type: string | null; silverRemaining: number };
};
type HeldReward = { id: string; pointsSpent: number; redemptionCode: string | null; expiresAt: string | null; catalogItem: { title: string; emoji?: string | null } };
type WelcomeGift =
  | { claimed: true; claimCode: string; day: number; rewardLabel?: string; rewardEmoji?: string }
  | { claimed: false; day: number; rewards: { rewardType: string; label: string; emoji: string }[] };
type Reward = { id: string; title: string; emoji?: string | null; pointsCost: number; storeId: string | null; isActive: boolean };
type Line = { key: string; category: string; amount: string; ppg: string };
type Created = { id: string; flagged: boolean; flags: string[]; points: number; promotion: string | null };
type Tab = 'grant' | 'redeem' | 'catalog' | 'held' | 'benefit' | 'welcome';
// What the receipt reader found (POST /points/hq/receipt-read, 2026-10-16)
type ReadWarning = { code: string; text: string; serious: boolean };
type ReceiptReadResult = {
  readId: string | null; store: { id: string; name: string } | null; date: string | null; time: string | null; receiptNumber: string | null;
  total: number | null; payment: { method: string; brand: string | null; last4: string | null } | null;
  lines: { category: string; amount: number; gallons: number | null }[]; readable: string; warnings: ReadWarning[];
};
type ReadState = { file: File; status: 'reading' | 'done' | 'failed' | 'off'; result?: ReceiptReadResult; error?: string };

const money = (n: number) => `$${n.toFixed(2)}`;
const pts = (n: number) => `${Math.round(n).toLocaleString('en-US')} pts`;
const newLine = (): Line => ({ key: Math.random().toString(36).slice(2), category: 'OTHER', amount: '', ppg: '' });
const LABEL: CSSProperties = { fontSize: FONT.small, fontWeight: 600, color: C.text2 };

/** An image from a file pick, a drop, or a paste (Ctrl+V from WhatsApp Web or an email) */
function PhotoSlot({ label, hint, file, onFile, busy }: { label: string; hint: ReactNode; file: File | null; onFile: (f: File | null) => void; busy?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f); }}
      style={{
        border: `1.5px dashed ${over ? C.primary : C.borderStrong}`, borderRadius: RADIUS.lg, padding: 14, background: over ? C.primaryTint : C.subtle,
        display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
      }}
    >
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" title="Open the photo full size">
          <img src={url} alt={label} style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: RADIUS.md, border: `1px solid ${C.border}`, display: 'block' }} />
        </a>
      ) : (
        <span aria-hidden="true" style={{ width: 84, height: 84, borderRadius: RADIUS.md, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.muted }}>
          <ImagePlus size={26} />
        </span>
      )}
      <div style={{ flex: '1 1 200px', minWidth: 0 }}>
        <div style={{ ...LABEL, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: FONT.caption, color: C.muted, lineHeight: 1.5, marginBottom: 8 }}>{hint}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button size="sm" icon={<Camera size={14} />} onClick={() => input.current?.click()} disabled={busy}>{file ? 'Choose another' : 'Choose photo'}</Button>
          {file && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => onFile(null)} disabled={busy}>Remove</Button>}
        </div>
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onFile(f); }} />
    </div>
  );
}

const hour12 = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

/** What the reader found on the receipt, and every reason to look twice before granting (Grant points tab) */
function ReceiptPanel({ state, warnings, serious, warningsOk, onWarningsOk, storeId, locked, onRetry, onFill, onSwitchStore }: {
  state: ReadState | null; warnings: ReadWarning[]; serious: boolean; warningsOk: boolean; onWarningsOk: (v: boolean) => void;
  storeId: string; locked: boolean; onRetry: () => void; onFill: () => void; onSwitchStore: (id: string) => void;
}) {
  if (!state) return null;
  if (state.status === 'reading') {
    return (
      <div className="ui-soft-in" role="status" style={{ padding: '12px 14px', borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: C.subtle }}>
        <div style={{ fontSize: FONT.small, color: C.text2, marginBottom: 8 }}>Reading the receipt and checking it was not used before...</div>
        <div className="ui-working" aria-hidden="true" />
      </div>
    );
  }
  if (state.status === 'off') return <Notice tone="neutral" style={{ marginTop: 0 }}>{state.error}</Notice>;
  if (state.status === 'failed') {
    return (
      <div className="ui-soft-in"><Notice tone="warning">
        {state.error} <button type="button" onClick={onRetry} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>Try again</button>
      </Notice></div>
    );
  }
  const r = state.result!;
  const facts = [
    r.store?.name ?? 'Store not read',
    r.date ? `${r.date}${r.time ? ` at ${hour12(r.time)}` : ''}` : 'no date',
    r.total != null ? `total ${money(r.total)}` : 'no total',
    r.payment?.method === 'CASH' ? 'cash' : r.payment?.last4 ? `${r.payment.brand ?? 'card'} ending ${r.payment.last4}` : null,
    r.receiptNumber ? `receipt #${r.receiptNumber}` : null,
  ].filter(Boolean).join(' · ');
  const otherStore = warnings.find((w) => w.code === 'STORE_DIFFERENT') && r.store && r.store.id !== storeId ? r.store : null;
  return (
    <div className="ui-soft-in" style={{ padding: '12px 14px', borderRadius: RADIUS.md, border: `1px solid ${serious ? '#f3cdd1' : C.border}`, background: serious ? C.dangerTint : C.subtle, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ fontSize: FONT.small, color: C.text }}><strong>Read from the receipt:</strong> {facts}</div>
        {!locked && r.lines.length > 0 && <Button size="sm" variant="ghost" onClick={onFill}>Fill the lines from it again</Button>}
      </div>
      {warnings.length === 0 ? (
        <div style={{ fontSize: FONT.small, color: C.success }}>No sign it was used before. Check the amounts against the photo.</div>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: FONT.small, lineHeight: 1.6, color: C.text2 }}>
          {warnings.map((w, i) => <li key={i} style={{ color: w.serious ? C.danger : C.text2, fontWeight: w.serious ? 600 : 400 }}>{w.text}</li>)}
        </ul>
      )}
      {otherStore && !locked && <div><Button size="sm" onClick={() => onSwitchStore(otherStore.id)}>Switch to {otherStore.name}</Button></div>}
      {serious && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: FONT.small, color: C.text, cursor: 'pointer' }}>
          <input type="checkbox" checked={warningsOk} onChange={(e) => onWarningsOk(e.target.checked)} style={{ marginTop: 3 }} />
          I checked the warnings above with the employee and still want to enter this receipt.
        </label>
      )}
    </div>
  );
}

// HQ only: the server refuses everyone else too, this just says so instead of showing a page of errors
export default function GrantRedeem() {
  const role = useAuthStore((s) => s.user?.role);
  if (role !== 'DEV_ADMIN' && role !== 'SUPER_ADMIN') {
    return <Page><EmptyState title="This page is for HQ" description="Grant & Redeem is for Super Admins entering sales for an employee without a phone." /></Page>;
  }
  return <Counter />;
}

function Counter() {
  const limits = useLimits();   // HQ's numbers that these words repeat (Settings, 2026-10-17)
  // ── Store and the employee who served ──────────────────────────────────────
  const storesQ = useQuery({ queryKey: ['counter-stores'], queryFn: () => counterApi.stores().then((r) => (r.data.data ?? []) as StoreRow[]) });
  const stores = storesQ.data ?? [];
  const [storeId, setStoreId] = useState<string>('');
  useEffect(() => {
    if (!storeId && stores.length) setStoreId(pickStore(PAGE_KEY, stores.map((s) => s.id)) ?? '');
  }, [stores, storeId]);
  const store = stores.find((s) => s.id === storeId) ?? null;
  const staffQ = useQuery({
    queryKey: ['counter-staff', storeId], enabled: !!storeId,
    queryFn: () => counterApi.storeStaff(storeId).then((r) => (r.data.data ?? []) as StaffRow[]),
  });
  const staff = staffQ.data ?? [];
  const [servedById, setServedById] = useState('');
  // The employee is remembered per store: the same person usually sends the photos all shift
  useEffect(() => {
    if (!storeId || !staffQ.data) return;
    let last: string | null = null;
    try { last = localStorage.getItem(`${PAGE_KEY}:served:${storeId}`); } catch { /* storage unavailable */ }
    setServedById(last && staffQ.data.some((s) => s.id === last) ? last : '');
  }, [storeId, staffQ.data]);
  const servedBy = staff.find((s) => s.id === servedById) ?? null;
  const ready = !!store && !!servedBy;

  // The receipt says another store: switch to it and keep the customer, the receipt and what was read (nothing entered yet)
  function switchToReceiptStore(id: string) {
    if (Object.keys(createdRef.current).length) return;
    setStoreId(id);
    rememberStore(PAGE_KEY, id);
    if (readState?.result) setLines(linesFromRead(readState.result, stores.find((s) => s.id === id) ?? null));
    toast(`Store switched. Pick who served at ${stores.find((s) => s.id === id)?.name ?? 'that store'}.`);
  }
  function chooseStore(id: string) {
    if (customer && id !== storeId && hasWork()) {
      if (!window.confirm('Change the store? The sale you started here is dropped.')) return;
    }
    setStoreId(id);
    rememberStore(PAGE_KEY, id);
    resetSale();
  }
  function chooseServedBy(id: string) {
    setServedById(id);
    try { localStorage.setItem(`${PAGE_KEY}:served:${storeId}`, id); } catch { /* storage unavailable */ }
  }

  // ── The customer ───────────────────────────────────────────────────────────
  const [qr, setQr] = useState<string | null>(null);
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [held, setHeld] = useState<HeldReward[]>([]);
  const [welcome, setWelcome] = useState<WelcomeGift | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(false);
  const [qrPhoto, setQrPhoto] = useState<File | null>(null);
  const [qrProblem, setQrProblem] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<{ id: string; name: string | null; phone: string; qrCode: string; isActive: boolean }[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function loadCustomer(code: string) {
    setLoadingCustomer(true);
    try {
      const [info, pending, gift] = await Promise.all([
        counterApi.customerInfo(code),
        counterApi.heldRewards(code).catch(() => null),
        counterApi.welcomeGift(code).catch(() => null),
      ]);
      setQr(code);
      setCustomer(info.data.data);
      setHeld(pending?.data?.data ?? []);
      setWelcome(gift?.data?.data ?? null);
      setResults(null);
      setSearch('');
      setQrProblem(null);
      return true;
    } catch (e) {
      setQrProblem(failureMessage(e, 'No customer has that QR code.'));
      return false;
    } finally {
      setLoadingCustomer(false);
    }
  }
  // Balance, benefit and held rewards after an action, without leaving the customer
  async function refreshCustomer() {
    if (qr) await loadCustomer(qr);
  }

  async function onQrPhoto(file: File | null) {
    setQrPhoto(file);
    setQrProblem(null);
    if (!file) return;
    setLoadingCustomer(true);
    try {
      const read = await readQrPhoto(file);
      if (read.kind === 'customer') { await loadCustomer(read.code); return; }
      setQrProblem(read.kind === 'other'
        ? 'That QR code is not a Lucky Stop customer code. Ask the employee for a photo of the QR on the customer\'s My QR screen.'
        : 'No QR code could be read in that photo. Ask for a closer, straight-on photo without glare, or find the customer by phone below.');
    } catch {
      setQrProblem('That photo could not be opened. Try a JPG or PNG, or find the customer by phone below.');
    } finally {
      setLoadingCustomer(false);
    }
  }

  async function runSearch() {
    const q = search.trim();
    if (isCustomerQr(q)) { await loadCustomer(q); return; }   // a code copied from somewhere
    if (q.length < 3) { toast.error('Type at least 3 letters of the name or digits of the phone number.'); return; }
    setSearching(true);
    try {
      const r = await counterApi.findCustomers(q);
      setResults(r.data.data ?? []);
    } catch (e) {
      toast.error(failureMessage(e, 'The search did not work. Try again.'));
    } finally {
      setSearching(false);
    }
  }

  function clearCustomer() {
    setQr(null); setCustomer(null); setHeld([]); setWelcome(null); setQrPhoto(null); setQrProblem(null); setResults(null);
    resetSale();
  }

  // ── The tabs ───────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('grant');
  const tabs = useMemo(() => {
    const t: { value: Tab; label: ReactNode; count?: number }[] = [
      { value: 'grant', label: 'Grant points' },
      { value: 'redeem', label: 'Redeem points' },
      { value: 'catalog', label: 'Catalog reward' },
    ];
    if (held.length) t.push({ value: 'held', label: 'Reserved rewards', count: held.length });
    if (customer && customer.tier !== 'BRONZE') t.push({ value: 'benefit', label: 'Tier benefit' });
    if (welcome) t.push({ value: 'welcome', label: 'Welcome gift' });
    return t;
  }, [held.length, customer, welcome]);
  useEffect(() => { if (!tabs.some((t) => t.value === tab)) setTab('grant'); }, [tabs, tab]);
  // Something needs doing before a sale: a reserved reward, an untaken welcome gift. Open on it, as the cashier's app does.
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!customer || openedFor.current === customer.id) return;
    openedFor.current = customer.id;
    setTab(held.length ? 'held' : welcome ? 'welcome' : 'grant');
  }, [customer, held.length, welcome]);

  // ── Grant points ───────────────────────────────────────────────────────────
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [created, setCreated] = useState<Record<string, Created>>({});
  const createdRef = useRef<Record<string, Created>>({});
  const uploadedRef = useRef<Set<string>>(new Set());
  const [granting, setGranting] = useState(false);
  const busyRef = useRef(false);
  const [granted, setGranted] = useState<{ points: number; flagged: boolean; flags: string[]; promotion: string | null; customer: string; servedBy: string } | null>(null);
  const [confirmGrant, setConfirmGrant] = useState(false);
  const [readState, setReadState] = useState<ReadState | null>(null);
  const [warningsOk, setWarningsOk] = useState(false);
  const readSeq = useRef(0);

  function hasWork() {
    return lines.some((l) => l.amount.trim() !== '') || !!receipt || Object.keys(createdRef.current).length > 0;
  }
  function resetSale() {
    setLines([newLine()]); setReceipt(null); setCreated({}); createdRef.current = {}; uploadedRef.current = new Set(); setGranted(null);
    readSeq.current++; setReadState(null); setWarningsOk(false);
  }

  // The sale's lines from what the reader found; a gas line gets its price per gallon from the gallons read, else the store's price
  function linesFromRead(r: ReceiptReadResult, at: StoreRow | null): Line[] {
    const allowed = at?.enabledCategories ?? [];
    const out = r.lines.map((l) => {
      const category = allowed.length === 0 || allowed.includes(l.category) ? l.category : 'OTHER';
      let ppg = '';
      if (isGasCategory(category)) {
        const fromRead = l.gallons ? l.amount / l.gallons : NaN;
        const price = (category === 'DIESEL' ? at?.dieselPricePerGallon : at?.gasPricePerGallon) ?? null;
        ppg = fromRead >= 1.5 && fromRead <= 20 ? fromRead.toFixed(3) : price != null ? String(price) : '';
      }
      return { ...newLine(), category, amount: l.amount.toFixed(2), ppg };
    });
    return out.length ? out : [newLine()];
  }

  // A receipt photo added: the reader fills the lines (when none are typed yet) and checks the receipt was not used before
  async function readTheReceipt(file: File) {
    if (!qr || !storeId) return;
    const seq = ++readSeq.current;
    setReadState({ file, status: 'reading' });
    setWarningsOk(false);
    try {
      const [small, hash] = await Promise.all([shrinkPhoto(file), fingerprint(file)]);
      const { data } = await counterApi.readReceipt(small, qr, storeId, hash);
      if (seq !== readSeq.current) return;   // another photo since
      const result = data.data as ReceiptReadResult;
      setReadState({ file, status: 'done', result });
      // Only when nothing is typed yet (looked at now, not when the photo was added: typing may have started while it was read)
      if (result.lines.length) setLines((prev) => (prev.some((l) => l.amount.trim() !== '') ? prev : linesFromRead(result, store)));
    } catch (e: any) {
      if (seq !== readSeq.current) return;
      const off = e?.response?.data?.code === 'READER_OFF';
      setReadState({ file, status: off ? 'off' : 'failed', error: failureMessage(e, 'The receipt could not be read. Type the amounts in.') });
    }
  }
  function onReceipt(file: File | null) {
    if (Object.keys(createdRef.current).length) return;   // lines entered with this photo: it cannot change now
    setReceipt(file);
    if (file) readTheReceipt(file); else { readSeq.current++; setReadState(null); setWarningsOk(false); }
  }
  const readResult = readState?.status === 'done' && readState.file === receipt ? readState.result ?? null : null;
  // The store warning is gone once the store was switched to the receipt's
  const readWarnings = (readResult?.warnings ?? []).filter((w) => !(w.code === 'STORE_DIFFERENT' && readResult?.store?.id === storeId));
  const seriousWarnings = readWarnings.filter((w) => w.serious);

  const enabled = store?.enabledCategories ?? [];
  const categories = CATEGORIES.filter((c) => enabled.length === 0 || enabled.includes(c.value));
  const storePrice = (cat: string) => (cat === 'DIESEL' ? store?.dieselPricePerGallon : store?.gasPricePerGallon) ?? null;

  function setLine(key: string, patch: Partial<Line>) {
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      const next = { ...l, ...patch };
      // A gas line starts at the store's own price per gallon, as in the app
      if (patch.category && isGasCategory(patch.category) && !isGasCategory(l.category)) next.ppg = storePrice(patch.category)?.toString() ?? '';
      if (patch.category && !isGasCategory(patch.category)) next.ppg = '';
      return next;
    }));
  }

  type Checked = { key: string; category: string; amount: number; gallons?: number; ppg?: number };
  const checked = useMemo(() => {
    const out: Checked[] = [];
    const problems: string[] = [];
    lines.forEach((l, i) => {
      const amount = Number(l.amount);
      if (l.amount.trim() === '') return;
      if (!(amount > 0) || !/^\d+(\.\d{1,2})?$/.test(l.amount.trim())) { problems.push(`Line ${i + 1}: enter the amount in dollars and cents.`); return; }
      if (isGasCategory(l.category)) {
        const ppg = Number(l.ppg);
        if (!(ppg >= 1.5 && ppg <= 20)) { problems.push(`Line ${i + 1}: check the price per gallon (it must be $1.50 to $20.00).`); return; }
        out.push({ key: l.key, category: l.category, amount, ppg, gallons: Math.round((amount / ppg) * 1000) / 1000 });
      } else {
        out.push({ key: l.key, category: l.category, amount });
      }
    });
    return { lines: out, problems };
  }, [lines]);

  // The server's own number for these lines, with the promotion that applies to this customer here and now (POST /points/preview)
  const [preview, setPreview] = useState<{ key: string; total: number; promotion: string | null; capped: boolean } | null>(null);
  const previewKey = JSON.stringify([qr, storeId, checked.lines.map((l) => [l.category, l.amount, l.gallons])]);
  useEffect(() => {
    if (!qr || !storeId || checked.lines.length === 0) return;
    const key = previewKey;
    const t = setTimeout(() => {
      counterApi.preview(qr, storeId, checked.lines.map((l) => ({ category: l.category, amount: l.amount, ...(l.gallons ? { gasGallons: l.gallons } : {}) })))
        .then(({ data }) => {
          const d = data?.data;
          if (typeof d?.total === 'number') {
            setPreview({ key, total: d.total, promotion: (d.lines ?? []).find((x: any) => x.promotion)?.promotion ?? null, capped: (d.lines ?? []).some((x: any) => x.capped) });
          }
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);
  const freshPreview = preview && preview.key === previewKey ? preview : null;
  const saleTotal = checked.lines.reduce((n, l) => n + l.amount, 0);

  function askGrant() {
    if (!ready || !qr) return;
    if (checked.problems.length) { toast.error(checked.problems[0]); return; }
    if (checked.lines.length === 0) { toast.error('Enter the amount of at least one item from the receipt.'); return; }
    if (!receipt) { toast.error('Add the photo of the receipt. Points are only credited with a receipt.'); return; }
    if (receipt.size > MAX_PHOTO) { toast.error('That receipt photo is over 10 MB. Send a smaller copy (a screenshot of it works).'); return; }
    if (readState?.status === 'reading') { toast('The receipt is still being read. One moment.'); return; }
    if (seriousWarnings.length && !warningsOk) { toast.error('Check the warnings about the receipt first, and tick the box if you still want to enter it.'); return; }
    setConfirmGrant(true);
  }

  // Each line is created in turn (naming the ones before it, so it is not taken for a duplicate), then the receipt goes on every line,
  // which is what credits the points. A failure stops there; pressing Grant again carries on from that point, nothing is sent twice.
  async function doGrant() {
    if (busyRef.current || !qr || !servedBy || !store || !receipt) return;
    busyRef.current = true;
    setGranting(true);
    try {
      for (const [i, l] of checked.lines.entries()) {
        if (createdRef.current[l.key]) continue;
        try {
          const siblings = Object.values(createdRef.current).map((c) => c.id);
          const { data } = await counterApi.grant(qr, store.id, servedBy.id, { category: l.category, amount: l.amount, gasGallons: l.gallons, gasPricePerGallon: l.ppg }, siblings);
          const d = data.data;
          createdRef.current = { ...createdRef.current, [l.key]: {
            id: d.transactionId, flagged: !!data.flagged, flags: data.fraudFlags ?? [],
            points: Math.round(((d.pointsAwarded ?? 0) + (d.gasBonusPoints ?? 0)) * 100), promotion: d.promotionApplied ?? null,
          } };
          setCreated(createdRef.current);
        } catch (e) {
          const done = Object.keys(createdRef.current).length;
          toast.error(`${checked.lines.length > 1 ? `Line ${i + 1}: ` : ''}${failureMessage(e, 'The sale was not accepted.')} Nothing has been credited yet.${done ? ' Fix it and press Grant again to finish.' : ''}`, { duration: 9000 });
          return;
        }
      }
      for (const c of Object.values(createdRef.current)) {
        if (uploadedRef.current.has(c.id)) continue;
        try {
          await counterApi.uploadReceipt(c.id, receipt);
          uploadedRef.current.add(c.id);
        } catch (e) {
          toast.error(`${failureMessage(e, 'The receipt did not upload.')} Press Grant again to retry the upload.`, { duration: 9000 });
          return;
        }
      }
      const all = Object.values(createdRef.current);
      // The receipt now counts as used: a customer who scans it in the app later is refused (not fatal if this fails)
      if (readResult?.readId) {
        counterApi.linkReceipt(readResult.readId, all.map((c) => c.id)).catch(() => toast('Points granted. The receipt could not be marked as used, so check it is not scanned again.', { duration: 7000 }));
      }
      setGranted({
        points: all.reduce((n, c) => n + c.points, 0), flagged: all.some((c) => c.flagged), flags: [...new Set(all.flatMap((c) => c.flags))],
        promotion: all.find((c) => c.promotion)?.promotion ?? null, customer: customer?.name || showPhone(customer?.phone), servedBy: servedBy.name || showPhone(servedBy.phone),
      });
      refreshCustomer();
    } finally {
      busyRef.current = false;
      setGranting(false);
      setConfirmGrant(false);
    }
  }

  // ── Redemptions ────────────────────────────────────────────────────────────
  const [redeemAmount, setRedeemAmount] = useState('');
  const [acting, setActing] = useState(false);
  const [confirm, setConfirm] = useState<{ title: string; message: ReactNode; label: string; run: () => Promise<string> } | null>(null);
  const [lastDone, setLastDone] = useState<string | null>(null);
  const rewardsQ = useQuery({ queryKey: ['counter-rewards'], enabled: !!customer, queryFn: () => counterApi.rewards().then((r) => (r.data.data ?? []) as Reward[]) });
  const rewards = (rewardsQ.data ?? []).filter((r) => r.isActive && (!r.storeId || r.storeId === storeId));

  function ask(title: string, message: ReactNode, label: string, run: () => Promise<string>) {
    setConfirm({ title, message, label, run });
  }
  async function runConfirmed() {
    if (!confirm || busyRef.current) return;
    busyRef.current = true;
    setActing(true);
    try {
      const done = await confirm.run();
      setLastDone(done);
      toast.success(done);
      setConfirm(null);
      setRedeemAmount('');
      await refreshCustomer();
    } catch (e) {
      toast.error(failureMessage(e, 'That did not go through.'), { duration: 8000 });
    } finally {
      busyRef.current = false;
      setActing(false);
    }
  }

  const who = customer ? (customer.name || showPhone(customer.phone)) : '';
  const servedName = servedBy ? (servedBy.name || showPhone(servedBy.phone)) : '';
  const forLine = (s: string) => <>{s}<div style={{ marginTop: 8, color: C.muted, fontSize: FONT.small }}>At {store?.name}, served by {servedName}. HQ is recorded as entering it.</div></>;
  const balanceDollars = customer ? customer.pointsBalance / 100 : 0;

  function askRedeem() {
    const v = redeemAmount.trim();
    const amount = Number(v);
    if (!/^\d+(\.\d{1,2})?$/.test(v) || !(amount > 0)) { toast.error('Enter the amount in dollars and cents, like 2.50.'); return; }
    if (amount > balanceDollars + 1e-9) { toast.error(`${who} has ${money(balanceDollars)} (${pts(customer!.pointsBalance)}).`); return; }
    ask('Redeem points', forLine(`Take ${money(amount)} (${pts(amount * 100)}) off ${who}'s balance?`), `Redeem ${money(amount)}`, async () => {
      await counterApi.redeem(qr!, storeId, servedById, amount);
      return `${money(amount)} redeemed for ${who}.`;
    });
  }

  // ── Paste a photo (Ctrl+V): the QR when no customer is open, else the receipt ───────────────────────────────────────────────────
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith('image/'));
      const file = item?.getAsFile();
      if (!file || !ready) return;
      e.preventDefault();
      if (!customer) onQrPhoto(file);
      else if (tab === 'grant' && !granted && !Object.keys(createdRef.current).length) { onReceipt(file); toast.success('Receipt photo added.'); }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  const createdCount = Object.keys(created).length;

  return (
    <Page>
      <PageHeader
        title="Grant & Redeem"
        description="Enter a sale or a redemption for an employee without a phone, from the photos they send you: the customer's QR and the receipt."
      />

      <HowItWorks summary="How this works" style={{ marginBottom: 16 }}>
        <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
          <li>Pick the store and the employee who served the customer. The sale counts for that employee, and the Activity Log shows HQ entered it.</li>
          <li>Add the photo of the customer's QR (choose it, drag it here, or paste it with Ctrl+V). If it will not read, find the customer by phone.</li>
          <li>Type the amounts from the receipt and add the receipt photo. Points are credited when the receipt uploads, with the same checks as the cashier's app: a sale that looks unusual is held for review on Transactions.</li>
          <li>The sale is dated now, when you enter it, not at the time on the receipt.</li>
        </ol>
      </HowItWorks>

      {/* Store and employee */}
      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>1. Store and employee</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
          <Field label="Store" htmlFor="gr-store" required>
            <select id="gr-store" className="ui-input" style={INPUT} value={storeId} onChange={(e) => chooseStore(e.target.value)} disabled={granting || acting}>
              {!storeId && <option value="">{storesQ.isLoading ? 'Loading stores...' : 'Choose a store'}</option>}
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Served by" htmlFor="gr-staff" required hint={staffQ.data && staff.length === 0 ? 'No active employee works at this store. Add one on the Staff page.' : 'The employee who sent you the photos.'}>
            <select id="gr-staff" className="ui-input" style={INPUT} value={servedById} onChange={(e) => chooseServedBy(e.target.value)} disabled={!storeId || granting || acting}>
              <option value="">{staffQ.isLoading ? 'Loading staff...' : 'Choose the employee'}</option>
              {staff.map((s) => <option key={s.id} value={s.id}>{s.name || showPhone(s.phone)} ({ROLE_LABEL[s.role] ?? s.role})</option>)}
            </select>
          </Field>
        </div>
        {storesQ.isError && <Notice tone="danger" style={{ marginTop: 12 }}>The stores did not load. Refresh the page.</Notice>}
      </Card>

      {/* Customer */}
      <Card style={{ marginBottom: 16, opacity: ready ? 1 : 0.6 }}>
        <SectionTitle action={customer && <Button size="sm" variant="ghost" icon={<X size={14} />} onClick={() => { if (!hasWork() || granted || window.confirm('Drop the sale you started for this customer?')) clearCustomer(); }} disabled={granting || acting}>Next customer</Button>}>
          2. Customer
        </SectionTitle>
        {!ready ? (
          <div style={{ fontSize: FONT.body, color: C.muted }}>Pick the store and the employee first.</div>
        ) : customer ? (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontSize: 17, fontWeight: 650, color: C.text }}>{customer.name || 'No name'}</div>
              <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 2 }}>{showPhone(customer.phone)}</div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Badge tone="info">{TIER_LABEL[customer.tier] ?? customer.tier}</Badge>
                {customer.benefit?.available && <Badge tone="success">Tier benefit available</Badge>}
                {held.length > 0 && <Badge tone="warning">{held.length} reserved reward{held.length === 1 ? '' : 's'}</Badge>}
                {welcome && <Badge tone="warning">Welcome gift today</Badge>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: FONT.caption, color: C.muted }}>Balance</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: C.text, fontVariantNumeric: 'tabular-nums' }}>{pts(customer.pointsBalance)}</div>
              <div style={{ fontSize: FONT.caption, color: C.muted }}>{money(customer.pointsBalance / 100)}</div>
            </div>
            <Link to={`/customers/${customer.id}`} target="_blank" style={{ fontSize: FONT.small, color: C.primary }}>Open profile</Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16 }}>
            <div>
              <PhotoSlot
                label="Photo of the customer's QR"
                hint="The QR on the customer's My QR screen. Choose it, drag it here, or paste it (Ctrl+V)."
                file={qrPhoto} onFile={onQrPhoto} busy={loadingCustomer}
              />
              {loadingCustomer && <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 8 }}>Reading the QR code...</div>}
              {qrProblem && <Notice tone="warning" style={{ marginTop: 10 }}>{qrProblem}</Notice>}
            </div>
            <div>
              <div style={{ ...LABEL, marginBottom: 6 }}>Or find the customer</div>
              <form onSubmit={(e) => { e.preventDefault(); runSearch(); }} style={{ display: 'flex', gap: 8 }}>
                <input className="ui-input" style={INPUT} placeholder="Phone number or name" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Phone number or name" />
                <Button type="submit" icon={<Search size={14} />} disabled={searching || loadingCustomer}>{searching ? 'Finding...' : 'Find'}</Button>
              </form>
              <div style={{ fontSize: FONT.caption, color: C.muted, marginTop: 6 }}>Only when the QR photo will not read. Check the name with the employee before you grant.</div>
              {results && (
                <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {results.length === 0 && <div style={{ fontSize: FONT.small, color: C.muted }}>No customer matches that.</div>}
                  {results.map((r) => (
                    <button key={r.id} type="button" className="ui-chip" onClick={() => loadCustomer(r.qrCode)} disabled={loadingCustomer}
                      style={{ justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '8px 12px', height: 'auto' }}>
                      <span><strong>{r.name || 'No name'}</strong> <span style={{ color: C.muted }}>{showPhone(r.phone)}</span></span>
                      {!r.isActive && <Badge tone="danger">Restricted</Badge>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* What to do */}
      {ready && customer && (
        <Card>
          <SectionTitle>3. What to do</SectionTitle>
          <Tabs tabs={tabs} value={tab} onChange={(v) => { setTab(v); setLastDone(null); }} ariaLabel="Grant or redeem" style={{ marginBottom: 16 }} />

          {tab === 'grant' && (granted ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <CheckCircle2 size={40} color={granted.flagged ? C.warning : C.success} />
              <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginTop: 8 }}>
                {granted.flagged ? 'Held for review' : `${pts(granted.points)} granted`}
              </div>
              <div style={{ fontSize: FONT.body, color: C.muted, marginTop: 6, lineHeight: 1.6 }}>
                {granted.flagged
                  ? <>{pts(granted.points)} for {granted.customer} are waiting for approval ({granted.flags.join(', ').replace(/_/g, ' ').toLowerCase()}). Approve or reject it on <Link to="/transactions">Transactions</Link>.</>
                  : <>Credited to {granted.customer}, served by {granted.servedBy}.{granted.promotion ? ` Promotion: ${granted.promotion}.` : ''}</>}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                <Button variant="primary" onClick={clearCustomer}>Next customer</Button>
                <Button onClick={resetSale}>Another sale for {granted.customer}</Button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {lines.map((l, i) => {
                  const done = !!created[l.key];
                  const gas = isGasCategory(l.category);
                  const gallons = gas && Number(l.amount) > 0 && Number(l.ppg) > 0 ? (Number(l.amount) / Number(l.ppg)).toFixed(3) : null;
                  return (
                    <div key={l.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', padding: 12, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, background: done ? C.successTint : C.surface }}>
                      <Field label={`Item ${i + 1}`} htmlFor={`gr-cat-${l.key}`} style={{ flex: '1 1 170px' }}>
                        <select id={`gr-cat-${l.key}`} className="ui-input" style={INPUT} value={l.category} disabled={done || granting} onChange={(e) => setLine(l.key, { category: e.target.value })}>
                          {categories.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                      </Field>
                      <Field label="Amount ($)" htmlFor={`gr-amt-${l.key}`} style={{ flex: '1 1 120px' }}>
                        <input id={`gr-amt-${l.key}`} className="ui-input" style={INPUT} inputMode="decimal" placeholder="0.00" value={l.amount} disabled={done || granting}
                          onChange={(e) => setLine(l.key, { amount: e.target.value.replace(/[^\d.]/g, '') })} />
                      </Field>
                      {gas && (
                        <Field label="Price per gallon ($)" htmlFor={`gr-ppg-${l.key}`} hint={gallons ? `${gallons} gallons` : undefined} style={{ flex: '1 1 140px' }}>
                          <input id={`gr-ppg-${l.key}`} className="ui-input" style={INPUT} inputMode="decimal" placeholder="3.29" value={l.ppg} disabled={done || granting}
                            onChange={(e) => setLine(l.key, { ppg: e.target.value.replace(/[^\d.]/g, '') })} />
                        </Field>
                      )}
                      {done ? (
                        <Badge tone="success" style={{ marginBottom: 8 }}>Entered, waiting for the receipt</Badge>
                      ) : lines.length > 1 && (
                        <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} aria-label={`Remove item ${i + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} disabled={granting} style={{ marginBottom: 6 }} />
                      )}
                    </div>
                  );
                })}
                <div>
                  <Button size="sm" icon={<Plus size={14} />} onClick={() => setLines((ls) => [...ls, newLine()])} disabled={granting || lines.length >= 20}>Add another item</Button>
                  <span style={{ fontSize: FONT.caption, color: C.muted, marginLeft: 10 }}>One line per category on the receipt (gas and groceries are two lines).</span>
                </div>
              </div>

              <PhotoSlot label="Photo of the receipt" hint="Required. The amounts are read from it for you to check, and the same photo goes on every line of this sale. You can paste it (Ctrl+V)."
                file={receipt} onFile={onReceipt} busy={granting || createdCount > 0} />
              <ReceiptPanel
                state={readState && readState.file === receipt ? readState : null}
                warnings={readWarnings} serious={seriousWarnings.length > 0} warningsOk={warningsOk} onWarningsOk={setWarningsOk}
                storeId={storeId} locked={createdCount > 0 || granting}
                onRetry={() => receipt && readTheReceipt(receipt)}
                onFill={() => readResult && setLines(linesFromRead(readResult, store))}
                onSwitchStore={switchToReceiptStore}
              />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: RADIUS.md, background: C.subtle, border: `1px solid ${C.border}` }}>
                <div>
                  <div style={{ fontSize: FONT.caption, color: C.muted }}>Sale {money(saleTotal)}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{freshPreview ? pts(freshPreview.total) : checked.lines.length ? 'Working out...' : '0 pts'}</div>
                  {freshPreview?.promotion && <div style={{ fontSize: FONT.caption, color: C.success }}>Includes promotion: {freshPreview.promotion}</div>}
                  {freshPreview?.capped && <div style={{ fontSize: FONT.caption, color: C.muted }}>Capped at 10% of the sale</div>}
                </div>
                <Button variant="primary" icon={<Receipt size={15} />} onClick={askGrant} disabled={granting || checked.lines.length === 0}>
                  {granting ? 'Granting...' : createdCount ? 'Grant again (finish)' : 'Grant points'}
                </Button>
              </div>
              {checked.problems.length > 0 && <Notice tone="warning">{checked.problems[0]}</Notice>}
              {createdCount > 0 && (
                <Notice tone="info">
                  {createdCount} of {checked.lines.length} line{checked.lines.length === 1 ? '' : 's'} entered, nothing credited yet. Press Grant again to finish, or
                  {' '}<button type="button" onClick={resetSale} disabled={granting} style={{ background: 'none', border: 'none', padding: 0, color: C.primary, textDecoration: 'underline', cursor: 'pointer', font: 'inherit' }}>start over</button>
                  {' '}(lines without a receipt are never credited).
                </Notice>
              )}
            </div>
          ))}

          {tab === 'redeem' && (
            <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Amount to take off ($)" htmlFor="gr-redeem" hint={`${who} has ${money(balanceDollars)} (${pts(customer.pointsBalance)}).`}>
                <input id="gr-redeem" className="ui-input" style={INPUT} inputMode="decimal" placeholder="0.00" value={redeemAmount} onChange={(e) => setRedeemAmount(e.target.value.replace(/[^\d.]/g, ''))} />
              </Field>
              {Number(redeemAmount) > 0 && <div style={{ fontSize: FONT.small, color: C.muted }}>= {pts(Number(redeemAmount) * 100)}</div>}
              <div><Button variant="primary" icon={<Wallet size={15} />} onClick={askRedeem} disabled={acting || !(Number(redeemAmount) > 0)}>Redeem</Button></div>
            </div>
          )}

          {tab === 'catalog' && (
            rewardsQ.isLoading ? <div style={{ color: C.muted }}>Loading rewards...</div>
            : rewards.length === 0 ? <EmptyState icon={<Gift size={24} />} title="No rewards at this store" description="Add rewards on the Catalog page." />
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {rewards.map((r) => {
                  const short = customer.pointsBalance < r.pointsCost;
                  return (
                    <div key={r.id} style={{ padding: 12, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontWeight: 600, color: C.text }}>{r.emoji ? `${r.emoji} ` : ''}{r.title}</div>
                      <div style={{ fontSize: FONT.small, color: C.muted }}>{pts(r.pointsCost)}{r.storeId ? ' · this store only' : ''}</div>
                      <Button size="sm" variant={short ? 'secondary' : 'primary'} disabled={short || acting}
                        title={short ? `${who} needs ${pts(r.pointsCost - customer.pointsBalance)} more` : undefined}
                        onClick={() => ask('Give a catalog reward', forLine(`Give ${who} "${r.title}" for ${pts(r.pointsCost)}?`), 'Give reward', async () => {
                          await counterApi.catalogRedeem(qr!, storeId, servedById, r.id);
                          return `"${r.title}" given to ${who}.`;
                        })}>
                        {short ? 'Not enough points' : 'Give this reward'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )
          )}

          {tab === 'held' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: FONT.small, color: C.muted }}>Rewards {who} reserved in the app. The points are already taken; confirm once the employee has handed the item over. A reservation lasts {limits.rewardHoldMinutes} minutes.</div>
              {held.map((h) => (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: 12, borderRadius: RADIUS.md, border: `1px solid ${C.border}` }}>
                  <div>
                    <div style={{ fontWeight: 600, color: C.text }}>{h.catalogItem?.emoji ? `${h.catalogItem.emoji} ` : ''}{h.catalogItem?.title}</div>
                    <div style={{ fontSize: FONT.small, color: C.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <span>{pts(h.pointsSpent)}</span>
                      {h.redemptionCode && <span>Code {h.redemptionCode}</span>}
                      {h.expiresAt && <span><Clock size={12} style={{ verticalAlign: -2 }} /> until {new Date(h.expiresAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="primary" disabled={acting} onClick={() => ask('Confirm a reserved reward', forLine(`Confirm "${h.catalogItem?.title}" was handed to ${who}?`), 'Confirm handed over', async () => {
                    await counterApi.confirmHeld(h.id, storeId, servedById);
                    return `"${h.catalogItem?.title}" confirmed for ${who}.`;
                  })}>Confirm handed over</Button>
                </div>
              ))}
            </div>
          )}

          {tab === 'benefit' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 520 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Star size={20} color={C.warning} />
                <div>
                  <div style={{ fontWeight: 600, color: C.text }}>{customer.benefit?.type === 'SILVER_FOUNTAIN' ? 'Free fountain drink refill' : 'Free daily drink refill'}</div>
                  <div style={{ fontSize: FONT.small, color: C.muted }}>
                    {customer.benefit?.type === 'SILVER_FOUNTAIN'
                      ? `${customer.benefit.silverRemaining} of ${limits.refillSilverPerPeriod} left this half-year.`
                      : customer.benefit?.available ? 'Not used today.' : 'Already used today.'}
                  </div>
                </div>
              </div>
              <div>
                <Button variant="primary" disabled={!customer.benefit?.available || acting} onClick={() => ask('Use the tier benefit', forLine(`Record ${who}'s free refill as given?`), 'Record refill', async () => {
                  await counterApi.tierBenefit(qr!, storeId, servedById);
                  return `Tier benefit recorded for ${who}.`;
                })}>{customer.benefit?.available ? 'Record the free refill' : 'Not available now'}</Button>
              </div>
            </div>
          )}

          {tab === 'welcome' && welcome && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <PartyPopper size={20} color={C.primary} />
                <div style={{ fontSize: FONT.body, color: C.text }}>Day {welcome.day} of {who}'s welcome week: one free item today.</div>
              </div>
              {welcome.claimed ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ fontWeight: 600 }}>{welcome.rewardEmoji} {welcome.rewardLabel} <span style={{ color: C.muted, fontWeight: 400 }}>(code {welcome.claimCode})</span></div>
                  <Button size="sm" variant="primary" disabled={acting} onClick={() => ask('Confirm the welcome gift', forLine(`Confirm ${who} got "${welcome.rewardLabel}"?`), 'Confirm handed over', async () => {
                    await counterApi.confirmWelcome(welcome.claimCode, storeId, servedById);
                    return `Welcome gift confirmed for ${who}.`;
                  })}>Confirm handed over</Button>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: FONT.small, color: C.muted }}>{who} has not chosen today's item in the app. Pick the one the employee handed over.</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {welcome.rewards.map((r) => (
                      <Button key={r.rewardType} disabled={acting} onClick={() => ask('Give the welcome gift', forLine(`Record "${r.label}" as ${who}'s welcome gift today?`), 'Record gift', async () => {
                        await counterApi.giveWelcome(qr!, r.rewardType, storeId, servedById);
                        return `Welcome gift recorded for ${who}.`;
                      })}>{r.emoji} {r.label}</Button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {lastDone && tab !== 'grant' && <Notice tone="success" style={{ marginTop: 14 }}>{lastDone}</Notice>}
        </Card>
      )}

      <ConfirmModal
        open={confirmGrant}
        title="Grant points"
        message={<>
          {checked.lines.map((l, i) => <div key={l.key}>Item {i + 1}: {CATEGORIES.find((c) => c.value === l.category)?.label} {money(l.amount)}{l.gallons ? ` (${l.gallons} gal)` : ''}</div>)}
          <div style={{ marginTop: 8, fontWeight: 600 }}>{freshPreview ? `${pts(freshPreview.total)} to ${who}` : `For ${who}`}</div>
          <div style={{ marginTop: 8, color: C.muted, fontSize: FONT.small }}>At {store?.name}, served by {servedName}. HQ is recorded as entering it. Check the amounts against the receipt photo.</div>
        </>}
        confirmLabel="Grant points"
        busy={granting}
        onConfirm={doGrant}
        onCancel={() => { if (!granting) setConfirmGrant(false); }}
      />
      <ConfirmModal
        open={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.label}
        busy={acting}
        onConfirm={runConfirmed}
        onCancel={() => { if (!acting) setConfirm(null); }}
      />
    </Page>
  );
}
