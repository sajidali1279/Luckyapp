// Billing > Platform Settings (Dev Admin): app updates (2026-10-09). Whether a newer version is out comes from the stores, never
// typed here: Google Play tells each Android phone itself (following the rollout percentage), and the App Store's version is
// looked up. The only setting is the OLDEST VERSION ALLOWED per platform: an app older than it shows a screen that only updates.
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { appVersionApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, PRIMARY, TEXT_MUTED } from '../lib/theme';
import { Button, Field, Notice } from './kit';
import ConfirmModal from './ConfirmModal';

type Form = { android: string; ios: string };
const PLATFORMS = [['android', 'Android (Google Play)'], ['ios', 'iPhone (App Store)']] as const;

function ago(iso: string | null) {
  if (!iso) return '';
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

export default function AppVersionsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['app-version'], queryFn: () => appVersionApi.get() });
  const d = q.data?.data?.data;
  const saved: Form | null = d ? { android: d.android.minimum ?? '', ios: d.ios.minimum ?? '' } : null;
  const [form, setForm] = useState<Form>({ android: '', ios: '' });
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (saved) setForm(saved); }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => appVersionApi.save(form),
    onSuccess: () => { toast.success('Saved. Phones see it the next time the app opens.'); qc.invalidateQueries({ queryKey: ['app-version'] }); setConfirming(false); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not save.')); setConfirming(false); },
  });

  const changed = !!saved && (saved.android !== form.android.trim() || saved.ios !== form.ios.trim());
  const raised = PLATFORMS.filter(([k]) => form[k].trim() && form[k].trim() !== saved?.[k]);

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: PRIMARY, margin: '0 0 8px' }}>App updates</h3>
      <p style={{ fontSize: 14, color: TEXT_MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
        The app asks people to update by itself, from version 1.2.8: Google Play tells each Android phone when a newer version is ready for it
        (following your rollout), and the App Store version is looked up. Nothing to type for a new release. Customers can tap Not now; it asks
        again after 3 days.
      </p>
      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError || !d ? <Notice tone="danger">Could not load the app update settings.</Notice> : (
        <>
          <div style={{ display: 'grid', gap: 6, fontSize: FONT.body, color: C.text2, marginBottom: 18, padding: '12px 14px', background: C.subtle, borderRadius: 8, border: `1px solid ${C.border}` }}>
            <div><strong>App Store now:</strong> {d.ios.storeVersion ? <>{d.ios.storeVersion} <span style={{ color: TEXT_MUTED }}>(checked {ago(d.ios.checkedAt)})</span></> : <span style={{ color: TEXT_MUTED }}>could not be reached right now</span>}</div>
            <div><strong>Google Play:</strong> <span style={{ color: TEXT_MUTED }}>each phone asks Google Play directly</span></div>
          </div>
          <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text, marginBottom: 4 }}>Oldest version allowed</div>
          <p style={{ fontSize: 13, color: TEXT_MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
            Only when an old version must stop working (for example after a server change): an app older than this shows a screen that only
            updates. Leave empty to block nobody. The iPhone one cannot be above the App Store version.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {PLATFORMS.map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`v-${k}-minimum`}>
                <input id={`v-${k}-minimum`} style={INPUT} placeholder="empty: block nobody" value={form[k]} inputMode="decimal"
                  onChange={(e) => setForm((p) => ({ ...p, [k]: e.target.value }))} />
              </Field>
            ))}
          </div>
          <Button variant="primary" disabled={!changed || save.isPending} onClick={() => (raised.length ? setConfirming(true) : save.mutate())}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      )}
      <ConfirmModal
        open={confirming}
        title="Block older versions?"
        danger
        busy={save.isPending}
        confirmLabel="Save and block older versions"
        message={<>
          {raised.map(([k, label]) => (
            <p key={k} style={{ margin: '0 0 8px' }}><strong>{label}:</strong> anyone on a version older than <strong>{form[k].trim()}</strong> will see only an "update" screen until they update.</p>
          ))}
          <p style={{ margin: 0 }}>Check that version is live in the store at 100% first, or people on that phone cannot use the app.</p>
        </>}
        onConfirm={() => save.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
