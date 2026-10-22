// Customers > Win back (HQ, 2026-10-16): give customers who have not been back for a while a few points with a push, then see how many
// came back within 30 days. The server works the list out again on Send and sends nothing if it changed (backend utils/winBack.ts).
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Gift, Send } from 'lucide-react';
import { storesApi, winBackApi } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { storeDayLong } from '../lib/storeDates';
import { C, FONT, INPUT, RADIUS } from '../lib/theme';
import { Badge, Button, Card, Chip, EmptyState, Field, HowItWorks, Notice, SectionTitle } from './kit';
import ConfirmModal from './ConfirmModal';

const money = (n: number) => `$${n.toFixed(2)}`;
const DAY_CHOICES = [30, 45, 60, 90];
const GIFT_CHOICES = [0.5, 1, 2];
const DEFAULTS = {
  title: 'We miss you', titleEs: 'Te extrañamos',
  message: 'Come back to Lucky Stop this week. We added a little something to your account.',
  messageEs: 'Vuelve a Lucky Stop esta semana. Te agregamos un regalo a tu cuenta.',
};

type Preview = { count: number; byStore: { storeId: string; store: string; count: number }[]; sample: { name: string | null; lastVisit: string; store: string }[]; limits: { maxRecipients: number; maxTotal: number; minAmount: number; maxAmount: number; cooldownDays: number; resultDays: number } };
type Campaign = { id: string; title: string; description: string; reward: number; quietDays: number | null; startDate: string; sentBy: string | null; store: { name: string } | null;
  results: { sent: number; cameBack: number; cameBackPercent: number; spentAfter: number; cost: number; measuring: boolean } };

export default function WinBackPanel() {
  const qc = useQueryClient();
  const [days, setDays] = useState(30);
  const [daysText, setDaysText] = useState('30');
  const [storeId, setStoreId] = useState<string>('');
  const [amountText, setAmountText] = useState('1.00');
  const [title, setTitle] = useState(DEFAULTS.title);
  const [titleEs, setTitleEs] = useState(DEFAULTS.titleEs);
  const [message, setMessage] = useState(DEFAULTS.message);
  const [messageEs, setMessageEs] = useState(DEFAULTS.messageEs);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [justSent, setJustSent] = useState<string | null>(null);

  const storesQ = useQuery({ queryKey: ['stores-list'], queryFn: () => storesApi.getAll().then((r) => (r.data.data ?? []) as { id: string; name: string; isActive?: boolean }[]) });
  const stores = (storesQ.data ?? []).filter((s) => s.isActive !== false);
  // The preview follows the choices, a moment after the last change
  const [askFor, setAskFor] = useState({ days: 30, storeId: '' });
  useEffect(() => { const t = setTimeout(() => setAskFor({ days, storeId }), 350); return () => clearTimeout(t); }, [days, storeId]);
  const previewQ = useQuery({
    queryKey: ['winback-preview', askFor.days, askFor.storeId],
    queryFn: () => winBackApi.preview(askFor.days, askFor.storeId || null).then((r) => r.data.data as Preview),
    enabled: askFor.days >= 14 && askFor.days <= 365,
  });
  const listQ = useQuery({ queryKey: ['winback-list'], queryFn: () => winBackApi.list().then((r) => (r.data.data ?? []) as Campaign[]) });

  const amount = Number(amountText);
  const p = previewQ.data;
  const limits = p?.limits;
  const total = p ? Math.round(amount * p.count * 100) / 100 : 0;
  const problem = !(days >= 14 && days <= 365) ? 'Pick 14 to 365 days.'
    : !(amount >= 0.1 && amount <= 5) || !/^\d+(\.\d{1,2})?$/.test(amountText.trim()) ? 'The gift is $0.10 to $5.00 a customer.'
    : !title.trim() ? 'Give the gift a short name.' : !message.trim() ? 'Write the message the customers get.'
    : message.length > 160 ? 'Keep the message under 160 characters.'
    : !p ? null : p.count === 0 ? 'Nobody fits these choices right now.'
    : limits && p.count > limits.maxRecipients ? `That is ${p.count} customers; one campaign can reach ${limits.maxRecipients}. Pick a store or more days.`
    : limits && total > limits.maxTotal ? `That is ${money(total)} of gifts; one campaign can give $${limits.maxTotal}.` : null;

  async function send() {
    if (!p || sending) return;
    setSending(true);
    try {
      const { data } = await winBackApi.send({ quietDays: days, storeId: storeId || null, title: title.trim(), titleEs: titleEs.trim() || null, message: message.trim(), messageEs: messageEs.trim() || null, amount, expectedCount: p.count });
      toast.success(`Sent: ${money(amount)} to ${data.data.sent} customers.`);
      setJustSent(data.data.id);
      setConfirming(false);
      qc.invalidateQueries({ queryKey: ['winback-list'] });
      qc.invalidateQueries({ queryKey: ['winback-preview'] });
    } catch (e: any) {
      toast.error(failureMessage(e, 'The gifts were not sent.'), { duration: 8000 });
      if (e?.response?.data?.code === 'LIST_CHANGED') { setConfirming(false); previewQ.refetch(); }
    } finally {
      setSending(false);
    }
  }

  const pts = Number.isFinite(amount) ? Math.round(amount * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <HowItWorks>
        Customers who bought before but have not been back for the days you pick get a few points and a push. Each gift is booked to the
        store of their last purchase (with its platform fee, like a challenge reward) and shows in their history. A customer gets one
        win-back gift in {limits?.cooldownDays ?? 60} days at most; test and restricted accounts never get one. "Came back" counts a
        purchase within {limits?.resultDays ?? 30} days of the gift.
      </HowItWorks>

      <Card>
        <SectionTitle>New win-back gift</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="No purchase for" htmlFor="wb-days" hint="Days since their last purchase.">
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {DAY_CHOICES.map((d) => <Chip key={d} selected={days === d} onClick={() => { setDays(d); setDaysText(String(d)); }}>{d} days</Chip>)}
                <input id="wb-days" className="ui-input" style={{ ...INPUT, width: 90 }} inputMode="numeric" value={daysText} aria-label="Days"
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 3); setDaysText(v); setDays(Number(v) || 0); }} />
              </div>
            </Field>
            <Field label="Store" htmlFor="wb-store" hint="Every store, or customers whose last purchase was at one store.">
              <select id="wb-store" className="ui-input" style={INPUT} value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                <option value="">Every store</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Gift for each customer" htmlFor="wb-amount" hint={pts > 0 ? `${pts} points` : undefined}>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {GIFT_CHOICES.map((g) => <Chip key={g} selected={amount === g} onClick={() => setAmountText(g.toFixed(2))}>{money(g)}</Chip>)}
                <input id="wb-amount" className="ui-input" style={{ ...INPUT, width: 100 }} inputMode="decimal" value={amountText} aria-label="Gift in dollars"
                  onChange={(e) => setAmountText(e.target.value.replace(/[^\d.]/g, ''))} />
              </div>
            </Field>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Name" htmlFor="wb-title"><input id="wb-title" className="ui-input" style={INPUT} value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} /></Field>
            <Field label="Message" htmlFor="wb-msg" hint={`${message.length}/160. "${pts} pts added to your balance." is added at the end.`}>
              <textarea id="wb-msg" className="ui-input" style={{ ...INPUT, minHeight: 64, resize: 'vertical' }} value={message} maxLength={160} onChange={(e) => setMessage(e.target.value)} />
            </Field>
            <Field label="In Spanish" htmlFor="wb-title-es" hint="For customers whose app is in Spanish. Empty: they get the English one.">
              <input id="wb-title-es" className="ui-input" style={{ ...INPUT, marginBottom: 6 }} value={titleEs} maxLength={60} onChange={(e) => setTitleEs(e.target.value)} aria-label="Name in Spanish" />
              <textarea className="ui-input" style={{ ...INPUT, minHeight: 56, resize: 'vertical' }} value={messageEs} maxLength={160} onChange={(e) => setMessageEs(e.target.value)} aria-label="Message in Spanish" />
            </Field>
          </div>
        </div>

        <div style={{ marginTop: 16, padding: '12px 14px', borderRadius: RADIUS.md, background: C.subtle, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ minWidth: 0 }}>
            {previewQ.isFetching && !p ? <div className="ui-working" style={{ width: 160 }} aria-label="Counting" />
              : previewQ.isError ? <span style={{ color: C.danger, fontSize: FONT.small }}>{failureMessage(previewQ.error, 'Could not count the customers.')}</span>
              : p ? (
                <div className="ui-soft-in" key={`${askFor.days}-${askFor.storeId}`}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: C.text }}>{p.count.toLocaleString('en-US')} customer{p.count === 1 ? '' : 's'} · {money(total)}</div>
                  <div style={{ fontSize: FONT.caption, color: C.muted, marginTop: 2 }}>
                    {p.byStore.slice(0, 4).map((s) => `${s.store} ${s.count}`).join(' · ')}{p.byStore.length > 4 ? ` · ${p.byStore.length - 4} more stores` : ''}
                  </div>
                </div>
              ) : null}
          </div>
          <Button variant="primary" icon={<Send size={15} />} disabled={!!problem || !p || previewQ.isFetching || sending} onClick={() => setConfirming(true)}>Send the gifts</Button>
        </div>
        {problem && p && <Notice tone="warning" style={{ marginTop: 10 }}>{problem}</Notice>}
        {p && p.sample.length > 0 && (
          <div style={{ fontSize: FONT.caption, color: C.muted, marginTop: 8 }}>
            For example: {p.sample.slice(0, 5).map((s) => `${s.name || 'No name'} (last ${storeDayLong(s.lastVisit)})`).join(', ')}
          </div>
        )}
      </Card>

      <Card>
        <SectionTitle count={listQ.data?.length}>Sent</SectionTitle>
        {listQ.isLoading ? <div className="ui-working" style={{ width: 200 }} />
          : (listQ.data ?? []).length === 0 ? <EmptyState icon={<Gift size={22} />} title="No win-back gifts yet" description="Send one above and see here how many customers came back." />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(listQ.data ?? []).map((c) => (
                <div key={c.id} className={c.id === justSent ? 'ui-soft-in ui-saved' : undefined}
                  style={{ padding: 12, borderRadius: RADIUS.md, border: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: C.text, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      {c.title} {c.results.measuring && <Badge tone="info">Measuring</Badge>}
                    </div>
                    <div style={{ fontSize: FONT.small, color: C.muted, marginTop: 2 }}>
                      {storeDayLong(c.startDate)} · {money(c.reward)} each to {c.results.sent} customers · no purchase in {c.quietDays} days{c.store ? ` · ${c.store.name}` : ''}{c.sentBy ? ` · by ${c.sentBy}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: c.results.cameBack ? C.success : C.text }}>{c.results.cameBack} came back ({c.results.cameBackPercent}%)</div>
                    <div style={{ fontSize: FONT.caption, color: C.muted }}>spent {money(c.results.spentAfter)} after · gifts {money(c.results.cost)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>

      <ConfirmModal
        open={confirming}
        title="Send the win-back gifts?"
        busy={sending}
        confirmLabel={p ? `Send ${money(total)}` : 'Send'}
        message={p ? (<>
          <div><strong>{money(amount)}</strong> ({pts} pts) to <strong>{p.count}</strong> customer{p.count === 1 ? '' : 's'} with no purchase in {days} days{storeId ? ` at ${stores.find((s) => s.id === storeId)?.name}` : ''}: <strong>{money(total)}</strong> in all.</div>
          <div style={{ marginTop: 8, color: C.muted, fontSize: FONT.small }}>They get the push "{title.trim()}" now. The points go on their balance at once and cannot be taken back in one go (each can be voided on Transactions).</div>
        </>) : ''}
        onConfirm={send}
        onCancel={() => { if (!sending) setConfirming(false); }}
      />
    </div>
  );
}
