// Transactions (HQ): receipt scanning, in testing (2026-10-11). Who can scan (off, test phones only, everyone) and the latest scans with
// what the AI read, to check how well it reads before anyone else gets it. Approving a scan is the usual review of held sales below.
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { receiptScanApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDay, storeTime } from '../lib/storeDates';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Badge, Button, Card, Chip, Field, HowItWorks, Notice } from './kit';
import ConfirmModal from './ConfirmModal';
import { FRAUD_FLAG_LABELS } from '../pages/dashboard/shared';

type Mode = 'OFF' | 'TEST' | 'ALL';
const MODES: [Mode, string][] = [['OFF', 'Off'], ['TEST', 'Test accounts only'], ['ALL', 'Everyone']];
const MODE_WORD: Record<Mode, string> = { OFF: 'Off', TEST: 'Testing', ALL: 'On for everyone' };

const phoneList = (text: string) => text.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
const showPhone = (p: string) => (p.length === 10 ? `(${p.slice(0, 3)}) ${p.slice(3, 6)}-${p.slice(6)}` : p);
const money = (n: number | null | undefined) => (n == null ? '' : `$${Number(n).toFixed(2)}`);

function outcome(scan: any): { word: string; tone: 'success' | 'danger' | 'warning' | 'neutral' } {
  if (scan.status === 'REFUSED') return { word: 'Refused', tone: 'neutral' };
  if (scan.status === 'ERROR') return { word: 'Could not read', tone: 'danger' };
  const sales: any[] = scan.sales ?? [];
  if (sales.length && sales.every((x) => x.status === 'APPROVED')) return { word: 'Approved', tone: 'success' };
  if (sales.some((x) => x.status === 'REJECTED')) return { word: 'Rejected', tone: 'danger' };
  return { word: 'Waiting for review', tone: 'warning' };
}

export default function ReceiptScanPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ['receipt-scan-settings'], queryFn: () => receiptScanApi.getSettings() });
  const recent = useQuery({ queryKey: ['receipt-scan-recent'], queryFn: () => receiptScanApi.recent(30), enabled: open });
  const raw = q.data?.data?.data;
  const saved = raw && typeof raw.mode === 'string' && Array.isArray(raw.testPhones) ? raw as { mode: Mode; testPhones: string[] } : null;
  const [mode, setMode] = useState<Mode>('OFF');
  const [phones, setPhones] = useState('');
  const [confirmAll, setConfirmAll] = useState(false);
  const [readOf, setReadOf] = useState<string | null>(null);
  useEffect(() => { if (saved) { setMode(saved.mode); setPhones(saved.testPhones.map(showPhone).join('\n')); } }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => receiptScanApi.saveSettings({ mode, testPhones: phoneList(phones) }),
    onSuccess: () => { toast.success('Saved. Phones see it the next time the app opens.'); qc.invalidateQueries({ queryKey: ['receipt-scan-settings'] }); setConfirmAll(false); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not save.')); setConfirmAll(false); },
  });
  const savedPhones = saved ? saved.testPhones.map(showPhone).join('\n') : '';
  const changed = !!saved && (saved.mode !== mode || savedPhones !== phoneList(phones).join('\n'));
  const scans: any[] = Array.isArray(recent.data?.data?.data) ? recent.data!.data.data : [];

  return (
    <Card style={{ marginBottom: 16 }} padding={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text }}>Receipt scanning</div>
        {saved && <Badge tone={saved.mode === 'OFF' ? 'neutral' : saved.mode === 'TEST' ? 'warning' : 'success'}>{MODE_WORD[saved.mode]}</Badge>}
        <span style={{ fontSize: FONT.small, color: TEXT_MUTED, flex: '1 1 200px' }}>Customers photograph their receipt in the app; it comes here held for review.</span>
        <Button size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>{open ? 'Hide' : 'Settings and latest scans'}</Button>
      </div>

      {open && (
        <div style={{ marginTop: 16 }}>
          <HowItWorks style={{ marginBottom: 14 }}>
            The customer takes a photo of their paper receipt in the app. AI reads the store, date, total and lines; the checks refuse a photo used
            before, the same receipt twice, receipts older than 3 days, other stores' receipts and ones the cashier already gave points for. What
            passes becomes held sales (one per category) with the photo, and the store's managers and HQ are told. Nothing is credited until someone
            approves it in the list below, like any held sale. Each customer can scan 3 receipts a day.
          </HowItWorks>
          {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError || !saved ? <Notice tone="danger">Could not load the receipt scanning settings.</Notice> : (
            <>
              <div role="radiogroup" aria-label="Who can scan receipts" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {MODES.map(([m, label]) => <Chip key={m} role="radio" selected={mode === m} onClick={() => setMode(m)}>{label}</Chip>)}
              </div>
              {mode !== 'OFF' && (
                <Field label="Test phones" htmlFor="rs-phones" hint={mode === 'ALL' ? 'Not needed while it is on for everyone; kept for later.' : 'One per line. Only these customer accounts see the scanner. Staff accounts never do.'}>
                  <textarea id="rs-phones" style={{ ...INPUT, minHeight: 84, resize: 'vertical' }} value={phones} onChange={(e) => setPhones(e.target.value)} placeholder={'(281) 555-0101\n(832) 555-0199'} />
                </Field>
              )}
              {mode === 'ALL' && saved.mode !== 'ALL' && (
                <Notice tone="warning" style={{ marginBottom: 12 }}>
                  Before turning it on for everyone, update the privacy policy: receipt photos are read by an AI service (Anthropic).
                </Notice>
              )}
              <Button variant="primary" disabled={!changed || save.isPending} onClick={() => (mode === 'ALL' && saved.mode !== 'ALL' ? setConfirmAll(true) : save.mutate())}>
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>

              <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, margin: '22px 0 8px' }}>Latest scans</div>
              {recent.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : recent.isError ? <Notice tone="danger">Could not load the scans.</Notice>
                : scans.length === 0 ? <div style={{ color: TEXT_MUTED, fontSize: FONT.body }}>No receipts scanned yet.</div> : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {scans.map((sc) => {
                    const o = outcome(sc);
                    const flags: string[] = Array.isArray(sc.flags) ? sc.flags.filter((f: string) => f !== 'RECEIPT_SCAN') : [];
                    return (
                      <div key={sc.id} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 12, display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                        {sc.imageUrl
                          ? <a href={sc.imageUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the receipt photo"><img src={sc.imageUrl} alt="Receipt" style={{ width: 56, height: 76, objectFit: 'cover', borderRadius: 6, border: `1px solid ${C.border}` }} /></a>
                          : <div style={{ width: 56, height: 76, borderRadius: 6, background: C.subtle, border: `1px solid ${C.border}` }} aria-hidden="true" />}
                        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong style={{ color: C.text }}>{sc.customer?.name || sc.customer?.phone || 'Customer'}</strong>
                            <Badge tone={o.tone}>{o.word}</Badge>
                            <span style={{ fontSize: FONT.small, color: TEXT_MUTED }}>{storeDay(sc.createdAt)}, {storeTime(sc.createdAt)}</span>
                          </div>
                          <div style={{ fontSize: FONT.small, color: C.text2, marginTop: 4 }}>
                            {[sc.store?.name, money(sc.total), sc.receiptAt ? `receipt ${storeDay(sc.receiptAt)}` : null].filter(Boolean).join(' · ') || 'Store not recognised'}
                          </div>
                          {sc.reason && <div style={{ fontSize: FONT.small, color: TEXT_MUTED, marginTop: 4 }}>{sc.status === 'ERROR' ? 'The AI did not answer; the customer was asked to try again.' : sc.reason}</div>}
                          {flags.length > 0 && <div style={{ fontSize: FONT.caption, color: C.warning, marginTop: 4 }}>{flags.map((f) => FRAUD_FLAG_LABELS[f] || f).join(' · ')}</div>}
                          {Array.isArray(sc.sales) && sc.sales.length > 0 && (
                            <div style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 4 }}>
                              {sc.sales.map((x: any) => `${String(x.category).replace(/_/g, ' ').toLowerCase()} ${money(x.purchaseAmount)}`).join(', ')}
                            </div>
                          )}
                          {sc.read && (
                            <button type="button" onClick={() => setReadOf(readOf === sc.id ? null : sc.id)} aria-expanded={readOf === sc.id}
                              style={{ background: 'none', border: 'none', padding: 0, marginTop: 6, color: C.primary, fontSize: FONT.small, fontWeight: 600, cursor: 'pointer' }}>
                              {readOf === sc.id ? 'Hide what the AI read' : 'What the AI read'}
                            </button>
                          )}
                          {readOf === sc.id && sc.read && (
                            <pre style={{ fontSize: 12, background: C.subtle, border: `1px solid ${C.border}`, borderRadius: 6, padding: 10, marginTop: 6, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 280, overflow: 'auto' }}>
                              {JSON.stringify(sc.read, null, 2)}
                            </pre>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}
      <ConfirmModal
        open={confirmAll}
        title="Turn receipt scanning on for everyone?"
        busy={save.isPending}
        confirmLabel="Turn on for everyone"
        message={<>
          <p style={{ margin: '0 0 8px' }}>Every customer with an app version that has the scanner will see it the next time the app opens.</p>
          <p style={{ margin: 0 }}>Scans are still held for review, so the store managers and HQ will have more sales to approve.</p>
        </>}
        onConfirm={() => save.mutate()}
        onCancel={() => setConfirmAll(false)}
      />
    </Card>
  );
}
