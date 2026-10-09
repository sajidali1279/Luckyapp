// Billing > Platform Settings (Dev Admin): the app versions the phones compare themselves with (2026-10-09). Below the newest version
// the app offers the update (Not now allowed); below the oldest version allowed it shows a screen that only opens the store.
// Google Play and the App Store never ask anyone to update on their own.
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { appVersionApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, PRIMARY, TEXT_MUTED } from '../lib/theme';
import { Button, Field, Notice } from './kit';
import ConfirmModal from './ConfirmModal';

type Pair = { latest: string; minimum: string };
type Form = { android: Pair; ios: Pair };
const PLATFORMS = [['android', 'Android (Google Play)'], ['ios', 'iPhone (App Store)']] as const;
const blank: Form = { android: { latest: '', minimum: '' }, ios: { latest: '', minimum: '' } };

export default function AppVersionsCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['app-version'], queryFn: () => appVersionApi.get() });
  const saved: Form | null = q.data?.data?.data
    ? { android: { latest: q.data.data.data.android.latest ?? '', minimum: q.data.data.data.android.minimum ?? '' }, ios: { latest: q.data.data.data.ios.latest ?? '', minimum: q.data.data.data.ios.minimum ?? '' } }
    : null;
  const [form, setForm] = useState<Form>(blank);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => { if (saved) setForm(saved); }, [q.data]);   // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => appVersionApi.save(form),
    onSuccess: () => { toast.success('App versions saved. Phones see them the next time the app opens.'); qc.invalidateQueries({ queryKey: ['app-version'] }); setConfirming(false); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not save the app versions.')); setConfirming(false); },
  });

  const changed = !!saved && JSON.stringify(saved) !== JSON.stringify(form);
  const minimumRaised = PLATFORMS.filter(([k]) => form[k].minimum.trim() && form[k].minimum.trim() !== saved?.[k].minimum);
  const set = (k: 'android' | 'ios', f: keyof Pair, v: string) => setForm((p) => ({ ...p, [k]: { ...p[k], [f]: v } }));

  return (
    <div style={{ background: '#fff', borderRadius: 12, padding: 28, boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)' }}>
      <h3 style={{ fontSize: 18, fontWeight: 700, color: PRIMARY, margin: '0 0 8px' }}>App versions</h3>
      <p style={{ fontSize: 14, color: TEXT_MUTED, margin: '0 0 16px', lineHeight: 1.6 }}>
        Google Play and the App Store never ask anyone to update. The app checks these when it opens: below the <strong>newest version</strong> it
        offers the update (customers can tap Not now; it asks again after 3 days), below the <strong>oldest version allowed</strong> it shows a
        screen that only opens the store. Leave a box empty for no prompt. Set a version only once it is live in that store.
      </p>
      {q.isLoading ? <div style={{ color: TEXT_MUTED }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the app versions.</Notice> : (
        <>
          {PLATFORMS.map(([k, label]) => (
            <div key={k} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: FONT.small, fontWeight: 700, color: C.text, marginBottom: 8 }}>{label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
                <Field label="Newest version" htmlFor={`v-${k}-latest`}>
                  <input id={`v-${k}-latest`} style={INPUT} placeholder="e.g. 1.2.8" value={form[k].latest} onChange={(e) => set(k, 'latest', e.target.value)} inputMode="decimal" />
                </Field>
                <Field label="Oldest version allowed" htmlFor={`v-${k}-minimum`}>
                  <input id={`v-${k}-minimum`} style={INPUT} placeholder="empty: none" value={form[k].minimum} onChange={(e) => set(k, 'minimum', e.target.value)} inputMode="decimal" />
                </Field>
              </div>
            </div>
          ))}
          <Button variant="primary" disabled={!changed || save.isPending} onClick={() => (minimumRaised.length ? setConfirming(true) : save.mutate())}>
            {save.isPending ? 'Saving…' : 'Save app versions'}
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
          {minimumRaised.map(([k, label]) => (
            <p key={k} style={{ margin: '0 0 8px' }}><strong>{label}:</strong> anyone on a version older than <strong>{form[k].minimum.trim()}</strong> will see only an "update" screen until they update.</p>
          ))}
          <p style={{ margin: 0 }}>Check that version is live in the store first, or nobody on that phone can use the app.</p>
        </>}
        onConfirm={() => save.mutate()}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
