// Settings > App (Dev Admin): app updates (2026-10-09). Whether a newer version is out comes from the stores, never
// typed here: Google Play tells each Android phone itself (following the rollout percentage), and the App Store's version is
// looked up. The only setting is the OLDEST VERSION ALLOWED per platform: an app older than it shows a screen that only updates.
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { appVersionApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { C, FONT, INPUT, TEXT_MUTED } from '../lib/theme';
import { Button, Card, Field, Notice } from './kit';
import ConfirmModal from './ConfirmModal';
import { useDraft, useUnsaved } from '../lib/unsaved';

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
  // An odd reply (an older server mid-deploy) shows "could not load" here instead of breaking the whole Billing page (2026-10-10)
  const raw = q.data?.data?.data;
  const d = raw && raw.android && raw.ios ? raw : undefined;
  const saved: Form | null = d ? { android: d.android.minimum ?? '', ios: d.ios.minimum ?? '' } : null;
  // The reply also carries when the App Store was last checked, so any reload can bring new data: typing is kept over it
  const draft = useDraft(saved ?? { android: '', ios: '' });
  const form = draft.form;
  const [confirming, setConfirming] = useState(false);

  const save = useMutation({
    mutationFn: (values: Form) => appVersionApi.save(values),
    onSuccess: async (_d, values) => {
      toast.success('Saved. Phones see it the next time the app opens.');
      setConfirming(false);
      await qc.invalidateQueries({ queryKey: ['app-version'] });
      draft.settle(values);
    },
    onError: (e) => { toast.error(serverMessage(e, 'Could not save.')); setConfirming(false); },
  });

  const changed = !!saved && (saved.android !== form.android.trim() || saved.ios !== form.ios.trim());
  const raised = PLATFORMS.filter(([k]) => form[k].trim() && form[k].trim() !== saved?.[k]);
  useUnsaved('app-versions', changed);

  return (
    <Card padding={18}>
      <div style={{ fontSize: FONT.section, fontWeight: 700, color: C.text, marginBottom: 4 }}>App updates</div>
      <p style={{ fontSize: FONT.small, color: TEXT_MUTED, margin: '0 0 12px', lineHeight: 1.5 }}>
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
          <Notice tone="warning" style={{ marginBottom: 12 }}>
            Android: raise it only after the new release is at <strong>100%</strong> in Play Console (Production, not a staged rollout or a test track).
            Until Google Play offers the update to a phone, app versions 1.2.9 to 1.3.2 lock that phone out with nothing to update to.
            From 1.3.3 the app lets such a phone in until Play has the update for it.
          </Notice>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            {PLATFORMS.map(([k, label]) => (
              <Field key={k} label={label} htmlFor={`v-${k}-minimum`}>
                <input id={`v-${k}-minimum`} style={INPUT} placeholder="empty: block nobody" value={form[k]} inputMode="decimal"
                  onChange={(e) => draft.set(k, e.target.value)} />
              </Field>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Button variant="primary" disabled={!changed || save.isPending} onClick={() => (raised.length ? setConfirming(true) : save.mutate(form))}>
              {save.isPending ? 'Saving…' : 'Save'}
            </Button>
            {changed && <Button variant="secondary" disabled={save.isPending} onClick={draft.reset}>Undo changes</Button>}
          </div>
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
        onConfirm={() => save.mutate(form)}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
