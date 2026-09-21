import { useState, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { superAdminApi } from '../services/api';
import Modal from './Modal';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { storeDayTime } from '../lib/storeDates';
import { useSingleFlight } from '../hooks/useSingleFlight';

type Target = 'ALL_CUSTOMERS' | 'STORE_CUSTOMERS' | 'ALL_STAFF' | 'STORE_STAFF';
interface StoreLite { id: string; name: string; city?: string; isActive?: boolean }
interface Audience { people: number; phones: number; withoutPhone: number; words: string; storeName: string | null }
interface SendResult {
  target: Target; storeName: string | null; people: number; phones: number; withoutPhone: number;
  accepted: number; failed: number; removed: number; retried: number; reasons: string[]; partial: boolean;
}
interface SentRow { id: string; createdAt: string; actorName: string | null; storeName: string | null; target: Target | null; title: string; body: string; people: number; phones: number; accepted: number; failed: number; removed: number }

const TITLE_MAX = 65;
const BODY_MAX = 200;
const TARGET_LABELS: Record<Target, string> = {
  ALL_CUSTOMERS: 'All customers (chain-wide)',
  STORE_CUSTOMERS: 'Customers of one store (a purchase there in the last 6 months)',
  ALL_STAFF: 'All staff (chain-wide)',
  STORE_STAFF: 'Staff at one store',
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "13 customers: 9 have the app signed in on a phone (12 phones in all); the other 4 will only see it in the app's inbox." */
function audienceSentence(a: Audience): string {
  if (a.people === 0) return 'There is no one to send this to.';
  const withPhone = a.people - a.withoutPhone;
  const head = `This reaches ${a.people} ${a.words}.`;
  if (withPhone === 0) return `${head} None of them has the app signed in on a phone, so they will only see it in the app's inbox.`;
  const phones = a.phones === withPhone ? '' : ` (${plural(a.phones, 'phone', 'phones')} in all)`;
  return a.withoutPhone === 0
    ? `${head} All of them have the app signed in on a phone${phones}.`
    : `${head} ${withPhone} of them ${withPhone === 1 ? 'has' : 'have'} the app signed in on a phone${phones}; the other ${a.withoutPhone} will only see it in the app's inbox.`;
}

/** What a send did: "Sent to 13 customers. 12 phones reached, 1 failed." */
function resultSentence(r: SendResult, words: string): string {
  const parts = [`Sent to ${r.people} ${words}.`];
  if (r.phones === 0) parts.push("None of them has the app signed in on a phone, so it went to their inboxes only.");
  else parts.push(`${plural(r.accepted, 'phone', 'phones')} reached${r.failed > 0 ? `, ${r.failed} failed` : ''}.`);
  if (r.removed > 0) parts.push(`${plural(r.removed, 'phone', 'phones')} that no longer ${r.removed === 1 ? 'has' : 'have'} the app ${r.removed === 1 ? 'was' : 'were'} taken off the list.`);
  if (r.withoutPhone > 0 && r.phones > 0) parts.push(`${r.withoutPhone} will see it in the app's inbox only.`);
  return parts.join(' ');
}

export default function SendPushPanel({ stores }: { stores: StoreLite[] }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target>('ALL_CUSTOMERS');
  const [storeId, setStoreId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ data: SendResult; words: string; title: string } | null>(null);

  const needsStore = target === 'STORE_CUSTOMERS' || target === 'STORE_STAFF';
  const ready = !!title.trim() && !!body.trim() && (!needsStore || !!storeId);
  const openStores = stores.filter((s) => s.isActive !== false);

  const audienceQuery = useQuery({
    queryKey: ['push-audience', target, storeId],
    queryFn: () => superAdminApi.audience(target, needsStore ? storeId : undefined),
    enabled: !needsStore || !!storeId,
    staleTime: 0,
    retry: false,
  });
  const audience = audienceQuery.data?.data?.data as Audience | undefined;

  const sentQuery = useQuery({ queryKey: ['push-sent'], queryFn: () => superAdminApi.broadcasts() });
  const sent: SentRow[] = sentQuery.data?.data?.data ?? [];

  const sendMutation = useMutation({
    mutationFn: () => superAdminApi.broadcast({ target, storeId: needsStore ? storeId : undefined, title: title.trim(), body: body.trim() }),
    onSuccess: (res) => {
      setResult({ data: res.data.data as SendResult, words: audience?.words ?? 'people', title: title.trim() });
      setConfirmOpen(false);
      setTitle(''); setBody(''); setError('');
      qc.invalidateQueries({ queryKey: ['push-sent'] });
      qc.invalidateQueries({ queryKey: ['push-audience'] });
    },
    onError: (e: any) => {
      setConfirmOpen(false);
      setError(failureMessage(e, 'The message could not be sent. Nothing was changed.'));
      qc.invalidateQueries({ queryKey: ['push-sent'] });
    },
  });
  const runSend = useSingleFlight(sendMutation);

  const testMutation = useMutation({
    mutationFn: () => superAdminApi.broadcast({ target, storeId: needsStore ? storeId : undefined, title: title.trim(), body: body.trim(), test: true }),
    onSuccess: (res) => {
      const d = res.data.data;
      setError('');
      if (d.failed > 0 && d.accepted === 0) setError(`The test could not be delivered to your ${plural(d.phones, 'phone', 'phones')}: ${(d.reasons ?? []).join('; ') || 'the push service refused it'}.`);
      else toast.success(`Test sent to ${plural(d.accepted, 'of your phones', 'of your phones').replace('1 of your phones', 'your phone')}. Look for "[Test] ${title.trim()}".`, { duration: 7000 });
    },
    onError: (e: any) => setError(failureMessage(e, 'The test could not be sent.')),
  });
  const runTest = useSingleFlight(testMutation);

  function review() {
    if (!ready || sendMutation.isPending) return;
    setError('');
    setConfirmOpen(true);
  }

  const canSend = ready && !!audience && audience.people > 0;

  return (
    <div id="send-push" style={s.panel}>
      <div style={s.panelHeader}>
        <div style={s.panelIcon} aria-hidden="true">📢</div>
        <div>
          <h2 style={s.panelTitle}>Send Push Notification</h2>
          <div style={s.panelSub}>Write a message, send yourself a test, then send it to customers or staff. It cannot be recalled.</div>
        </div>
      </div>

      {result && (
        <div role="status" style={{ ...s.resultBox, ...(result.data.partial ? s.resultWarn : {}) }}>
          <div style={s.resultTitle}>{result.data.partial ? 'Sent, but some phones did not get it' : 'Sent'}: "{result.title}"</div>
          <div>{resultSentence(result.data, result.words)}</div>
          {result.data.partial && <div style={{ marginTop: 6 }}>Do not send it again: it already reached {plural(result.data.accepted, 'phone', 'phones')} and everyone's inbox.{result.data.reasons.length > 0 ? ` (${result.data.reasons.slice(0, 2).join('; ')})` : ''}</div>}
          <button type="button" style={s.linkBtn} onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}

      <div style={s.field}>
        <label style={s.label} htmlFor="push-target">Who gets this?</label>
        <select id="push-target" style={s.select} value={target} onChange={(e) => { setTarget(e.target.value as Target); setStoreId(''); setError(''); }}>
          {(Object.keys(TARGET_LABELS) as Target[]).map((t) => <option key={t} value={t}>{TARGET_LABELS[t]}</option>)}
        </select>
      </div>

      {needsStore && (
        <div style={s.field}>
          <label style={s.label} htmlFor="push-store">Store</label>
          <select id="push-store" style={s.select} value={storeId} onChange={(e) => { setStoreId(e.target.value); setError(''); }}>
            <option value="">- Select a store -</option>
            {openStores.map((st) => <option key={st.id} value={st.id}>{st.name}{st.city ? ` - ${st.city}` : ''}</option>)}
          </select>
        </div>
      )}

      <div style={s.audienceLine} aria-live="polite">
        {needsStore && !storeId ? 'Choose a store to see who it would reach.'
          : audienceQuery.isLoading ? 'Counting who this would reach…'
          : audienceQuery.isError ? <span style={{ color: '#b91c1c' }}>{failureMessage(audienceQuery.error, 'Could not count who this would reach.')}</span>
          : audience ? audienceSentence(audience) : ''}
      </div>

      <div style={s.field}>
        <label style={s.label} htmlFor="push-title">Title <span style={s.charCount}>{title.length}/{TITLE_MAX}</span></label>
        <input id="push-title" style={s.input} placeholder="e.g. 🎉 Weekend Special at Lucky Stop!" value={title} maxLength={TITLE_MAX} onChange={(e) => { setTitle(e.target.value); setError(''); }} />
      </div>

      <div style={s.field}>
        <label style={s.label} htmlFor="push-body">Message <span style={s.charCount}>{body.length}/{BODY_MAX}</span></label>
        <textarea id="push-body" style={s.textarea} placeholder="e.g. Get double points on all gas purchases this Saturday and Sunday only. Visit any Lucky Stop location to redeem!" value={body} maxLength={BODY_MAX} rows={4} onChange={(e) => { setBody(e.target.value); setError(''); }} />
      </div>

      {title.trim() && body.trim() && (
        <div style={s.preview}>
          <div style={s.previewLabel}>Preview</div>
          <div style={s.previewCard}>
            <div style={s.previewTitle}>{title}</div>
            <div style={s.previewBody}>{body}</div>
          </div>
        </div>
      )}

      {error && <div role="alert" style={s.errorBox}>{error}</div>}

      <div style={s.buttons}>
        <button type="button" style={{ ...s.testBtn, ...(!ready || testMutation.isPending ? s.disabled : {}) }} disabled={!ready || testMutation.isPending} onClick={() => runTest()}>
          {testMutation.isPending ? 'Sending test…' : '📱 Send me a test first'}
        </button>
        <button type="button" style={{ ...s.sendBtn, ...(!canSend || sendMutation.isPending ? s.disabled : {}) }} disabled={!canSend || sendMutation.isPending} onClick={review}>
          Review and send…
        </button>
      </div>

      <div style={s.hint}>
        Everyone in the audience gets the message in the app's inbox. Only people with the app signed in on a phone also get the push. Restricted customers and deactivated staff are never included. The same message to the same audience cannot be sent twice within five minutes.
      </div>

      {confirmOpen && audience && (
        <Modal title={`Send this to ${audience.people} ${audience.words}?`} subtitle={audienceSentence(audience)} onClose={() => setConfirmOpen(false)} busy={sendMutation.isPending}>
          <div style={s.previewCard}>
            <div style={s.previewTitle}>{title.trim()}</div>
            <div style={s.previewBody}>{body.trim()}</div>
          </div>
          <div style={s.warnLine}>Once sent, a message cannot be taken back.</div>
          <div style={s.modalActions}>
            <button type="button" style={s.cancelBtn} onClick={() => setConfirmOpen(false)} disabled={sendMutation.isPending}>Cancel</button>
            <button type="button" style={s.confirmBtn} disabled={sendMutation.isPending} onClick={() => runSend()}>
              {sendMutation.isPending ? 'Sending…' : `Send to ${audience.people} ${audience.words}`}
            </button>
          </div>
        </Modal>
      )}

      <h3 style={s.sentHeading}>Sent recently</h3>
      {sentQuery.isError ? (
        <div style={s.sentEmpty}>Could not load the list. <button type="button" style={s.linkBtn} onClick={() => sentQuery.refetch()}>Try again</button></div>
      ) : sentQuery.isLoading ? (
        <div style={s.sentEmpty}>Loading…</div>
      ) : sent.length === 0 ? (
        <div style={s.sentEmpty}>Nothing has been sent from here yet.</div>
      ) : (
        <ul style={s.sentList}>
          {sent.map((row) => (
            <li key={row.id} style={s.sentRow}>
              <div style={s.sentTitle}>{row.title || 'A message'}</div>
              <div style={s.sentBody}>{row.body}</div>
              <div style={s.sentMeta}>
                {storeDayTime(row.createdAt)} · {row.actorName || 'Someone'} · {row.target ? TARGET_LABELS[row.target].split(' (')[0] : ''}{row.storeName ? ` (${row.storeName})` : ''} · {plural(row.people, 'person', 'people')}, {plural(row.accepted, 'phone', 'phones')} reached{row.failed > 0 ? `, ${row.failed} failed` : ''}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  panel: { maxWidth: 620 },
  panelHeader: { display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, padding: '20px 24px', background: 'linear-gradient(135deg, #1D3557 0%, #2c5282 100%)', borderRadius: 16 },
  panelIcon: { fontSize: 40, lineHeight: 1 },
  panelTitle: { fontSize: 20, fontWeight: 800, color: '#fff', margin: '0 0 4px' },
  panelSub: { fontSize: 15, color: '#e6edf5', lineHeight: 1.5 },
  resultBox: { marginBottom: 20, padding: '14px 18px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 12, color: '#14532d', fontSize: 15, lineHeight: 1.5 },
  resultWarn: { background: '#fffbeb', border: '1px solid #fde68a', color: '#78350f' },
  resultTitle: { fontWeight: 800, marginBottom: 4 },
  field: { marginBottom: 18 },
  label: { display: 'block', fontSize: 14, fontWeight: 700, color: PRIMARY, marginBottom: 6 },
  charCount: { fontWeight: 400, color: TEXT_MUTED, fontSize: 13 },
  select: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 14, color: '#111827', background: '#fff', cursor: 'pointer' },
  input: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 14, color: '#111827', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #d1d5db', fontSize: 14, color: '#111827', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' },
  audienceLine: { marginBottom: 18, padding: '10px 14px', background: '#eff6ff', borderRadius: 10, color: '#1e3a8a', fontSize: 14, lineHeight: 1.5, minHeight: 20 },
  preview: { marginBottom: 20, padding: '14px 18px', background: '#f9fafb', borderRadius: 12, border: '1px solid #e5e7eb' },
  previewLabel: { fontSize: 12, fontWeight: 700, color: TEXT_MUTED, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 },
  previewCard: { background: '#fff', borderRadius: 10, padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderLeft: '4px solid #1D3557' },
  previewTitle: { fontSize: 15, fontWeight: 800, color: '#111827', marginBottom: 4 },
  previewBody: { fontSize: 14, color: '#374151', lineHeight: 1.5 },
  errorBox: { marginBottom: 16, fontSize: 15, color: '#7f1d1d', lineHeight: 1.5, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 10, padding: '10px 14px' },
  buttons: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  testBtn: { flex: '1 1 200px', padding: '14px', background: '#fff', color: PRIMARY, border: `2px solid ${PRIMARY}`, borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  sendBtn: { flex: '2 1 240px', padding: '14px', background: 'linear-gradient(135deg, #1D3557, #2c5282)', color: '#fff', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 800, cursor: 'pointer' },
  disabled: { opacity: 0.45, cursor: 'not-allowed' },
  hint: { marginTop: 16, fontSize: 13, color: TEXT_MUTED, lineHeight: 1.6 },
  warnLine: { fontSize: 15, fontWeight: 700, color: '#b91c1c' },
  modalActions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  cancelBtn: { flex: 1, minWidth: 100, padding: '11px 0', background: '#fff', border: '1.5px solid #e5e7eb', color: '#374151', borderRadius: 12, fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  confirmBtn: { flex: 2, minWidth: 160, padding: '11px 12px', background: PRIMARY, color: '#fff', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer' },
  linkBtn: { display: 'block', marginTop: 8, background: 'none', border: 'none', padding: 0, color: '#1d4ed8', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline', fontSize: 14 },
  sentHeading: { fontSize: 16, fontWeight: 800, color: PRIMARY, margin: '32px 0 12px' },
  sentEmpty: { fontSize: 14, color: TEXT_MUTED },
  sentList: { listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 },
  sentRow: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '12px 16px' },
  sentTitle: { fontSize: 15, fontWeight: 800, color: '#111827' },
  sentBody: { fontSize: 14, color: '#374151', marginTop: 2, lineHeight: 1.5 },
  sentMeta: { fontSize: 13, color: TEXT_MUTED, marginTop: 6, lineHeight: 1.5 },
};
