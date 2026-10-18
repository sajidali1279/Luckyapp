// Missing persons (HQ, 2026-10-18): posters for people reported missing to the police, shown to customers on Home near the stores chosen,
// with "Call the agency" and "Call 911". HQ posts only from an official source (case number, AMBER Alert), checks each poster every 30 days,
// can send one push, and takes it down when the person is found. Backend: controllers/missingPersons.controller.ts.
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, X, UserSearch } from 'lucide-react';
import { missingApi, storesApi } from '../services/api';
import { serverMessage } from '../lib/apiError';
import { storeDay } from '../lib/storeDates';
import { C, FONT, INPUT } from '../lib/theme';
import { Page, PageHeader, Card, Button, Badge, Field, Notice, HowItWorks, EmptyState, SectionTitle } from '../components/kit';
import ConfirmModal from '../components/ConfirmModal';

type Poster = {
  id: string; name: string; age: number | null; photoUrl: string | null; lastSeenAt: string; lastSeenPlace: string; description: string | null; descriptionEs: string | null;
  agencyName: string; agencyPhone: string; caseNumber: string; sourceUrl: string | null; urgent: boolean; storeIds: string[]; status: string;
  reviewDueAt: string; pushSentAt: string | null; pushCount: number; endedAt: string | null; endNote: string | null; createdAt: string; showing: boolean; needsCheck: boolean;
};
const phoneText = (d: string) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);
const blank = { name: '', age: '', lastSeenAt: '', lastSeenPlace: '', description: '', descriptionEs: '', agencyName: '', agencyPhone: '', caseNumber: '', sourceUrl: '', urgent: false, storeIds: [] as string[], allStores: true, officialConfirmed: false };

export default function MissingPersons() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['missing-persons'], queryFn: () => missingApi.list() });
  const stores = useQuery({ queryKey: ['stores-all'], queryFn: () => storesApi.getAll(), staleTime: 5 * 60_000 });
  const storeList: { id: string; name: string }[] = stores.data?.data?.data ?? [];
  const storeName = (id: string) => storeList.find((s) => s.id === id)?.name ?? 'a store';
  const posters: Poster[] = q.data?.data?.data ?? [];
  const active = posters.filter((p) => p.status === 'ACTIVE');
  const ended = posters.filter((p) => p.status !== 'ACTIVE');

  const [editing, setEditing] = useState<Poster | 'new' | null>(null);
  const [f, setF] = useState(blank);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => { if (!photo) { setPreview(null); return; } const u = URL.createObjectURL(photo); setPreview(u); return () => URL.revokeObjectURL(u); }, [photo]);
  const open = (p: Poster | 'new') => {
    setEditing(p); setPhoto(null);
    setF(p === 'new' ? blank : {
      name: p.name, age: p.age == null ? '' : String(p.age), lastSeenAt: p.lastSeenAt.slice(0, 10), lastSeenPlace: p.lastSeenPlace, description: p.description ?? '', descriptionEs: p.descriptionEs ?? '',
      agencyName: p.agencyName, agencyPhone: phoneText(p.agencyPhone), caseNumber: p.caseNumber, sourceUrl: p.sourceUrl ?? '', urgent: p.urgent, storeIds: p.storeIds, allStores: p.storeIds.length === 0, officialConfirmed: true,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const done = (msg: string) => { toast.success(msg); qc.invalidateQueries({ queryKey: ['missing-persons'] }); };

  const save = useMutation({
    mutationFn: async () => {
      const lastSeenAt = new Date(`${f.lastSeenAt}T12:00:00`).toISOString();
      const body = { name: f.name, age: f.age, lastSeenAt, lastSeenPlace: f.lastSeenPlace, description: f.description, descriptionEs: f.descriptionEs, agencyName: f.agencyName,
        agencyPhone: f.agencyPhone, caseNumber: f.caseNumber, sourceUrl: f.sourceUrl, urgent: f.urgent, storeIds: f.allStores ? [] : f.storeIds };
      if (editing === 'new') {
        const fd = new FormData();
        for (const [k, v] of Object.entries({ ...body, officialConfirmed: f.officialConfirmed })) fd.append(k, k === 'storeIds' ? JSON.stringify(v) : String(v ?? ''));
        if (photo) fd.append('photo', photo);
        return missingApi.create(fd);
      }
      const id = (editing as Poster).id;
      await missingApi.update(id, { ...body, age: f.age === '' ? null : Number(f.age) });
      if (photo) { const fd = new FormData(); fd.append('photo', photo); await missingApi.photo(id, fd); }
      return null;
    },
    onSuccess: () => { done(editing === 'new' ? 'Poster is up in the app.' : 'Poster updated.'); setEditing(null); },
    onError: (e) => toast.error(serverMessage(e, 'Could not save the poster.')),
  });

  const [ending, setEnding] = useState<{ p: Poster; status: 'FOUND' | 'RESOLVED' | 'REMOVED' } | null>(null);
  const end = useMutation({
    mutationFn: (note?: string) => missingApi.end(ending!.p.id, ending!.status, note),
    onSuccess: () => { done(ending?.status === 'FOUND' ? 'Marked found. The poster is down everywhere.' : 'The poster is down everywhere.'); setEnding(null); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not take it down.')); setEnding(null); },
  });
  const confirm = useMutation({
    mutationFn: (id: string) => missingApi.confirm(id),
    onSuccess: () => done('Confirmed. It shows for another 30 days.'),
    onError: (e) => toast.error(serverMessage(e, 'Could not confirm it.')),
  });
  const [alerting, setAlerting] = useState<Poster | null>(null);
  const reach = useQuery({ queryKey: ['missing-alert-reach', alerting?.id], queryFn: () => missingApi.alertPreview(alerting!.id), enabled: !!alerting });
  const alert = useMutation({
    mutationFn: () => missingApi.alert(alerting!.id),
    onSuccess: (r) => { done(`Alert sent to ${(r?.data?.data?.customers ?? 0).toLocaleString('en-US')} customers.`); setAlerting(null); },
    onError: (e) => { toast.error(serverMessage(e, 'Could not send the alert.')); setAlerting(null); },
  });

  const phoneOk = f.agencyPhone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length === 10;
  const canSave = !!f.name.trim() && !!f.lastSeenAt && !!f.lastSeenPlace.trim() && !!f.agencyName.trim() && phoneOk && !!f.caseNumber.trim()
    && (f.allStores || f.storeIds.length > 0) && (editing !== 'new' || (f.officialConfirmed && !!photo));
  const set = (patch: Partial<typeof blank>) => setF((p) => ({ ...p, ...patch }));
  const toggleStore = (id: string) => set({ storeIds: f.storeIds.includes(id) ? f.storeIds.filter((x) => x !== id) : [...f.storeIds, id] });
  const sortedStores = useMemo(() => [...storeList].sort((a, b) => a.name.localeCompare(b.name)), [storeList]);

  return (
    <Page>
      <PageHeader icon={UserSearch} title="Missing persons" description="Help find people reported missing to the police, near your stores"
        actions={!editing && <Button variant="primary" icon={<Plus />} onClick={() => open('new')}>New poster</Button>} />

      <HowItWorks>
        Post only a person the police or an official alert (AMBER, Silver, Endangered Missing) report as missing, with their case number. Customers see
        the poster on the app's Home at the stores you choose, with buttons to call the agency and 911. Sightings go to the police, never to Lucky Stop.
        You can send one push to those stores' customers. Every 30 days, check with the agency and press "Still missing", or the poster stops showing.
        When the person is found, mark it found: it comes down everywhere, and the photo and personal details are deleted.
      </HowItWorks>

      {editing && (
        <Card style={{ margin: '16px 0', maxWidth: 900 }}>
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
            <SectionTitle>{editing === 'new' ? 'New missing person poster' : `Edit: ${(editing as Poster).name}`}</SectionTitle>
            <div style={{ marginLeft: 'auto' }}><Button size="sm" variant="ghost" icon={<X />} onClick={() => setEditing(null)}>Cancel</Button></div>
          </div>
          <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Field label={editing === 'new' ? 'Photo from the official poster' : 'Replace the photo (optional)'} htmlFor="mp-photo" required={editing === 'new'}>
              <input id="mp-photo" type="file" accept="image/*" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
              {(preview || (editing !== 'new' && (editing as Poster).photoUrl)) && <img src={preview ?? (editing as Poster).photoUrl!} alt="" style={{ marginTop: 8, width: 140, height: 170, objectFit: 'cover', borderRadius: 10, border: `1px solid ${C.border}` }} />}
            </Field>
            <div style={{ display: 'grid', gap: 12 }}>
              <Field label="Full name" htmlFor="mp-name" required><input id="mp-name" style={INPUT} maxLength={80} value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
              <Field label="Age" htmlFor="mp-age"><input id="mp-age" style={{ ...INPUT, maxWidth: 100 }} inputMode="numeric" value={f.age} onChange={(e) => set({ age: e.target.value.replace(/\D/g, '').slice(0, 3) })} /></Field>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.small, fontWeight: 600, color: C.text2 }}>
                <input type="checkbox" checked={f.urgent} onChange={(e) => set({ urgent: e.target.checked })} /> Urgent (AMBER Alert or endangered): shown first, in red
              </label>
            </div>
            <Field label="Last seen on" htmlFor="mp-date" required><input id="mp-date" type="date" style={INPUT} value={f.lastSeenAt} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set({ lastSeenAt: e.target.value })} /></Field>
            <Field label="Last seen at" htmlFor="mp-place" required hint="As the police poster says, e.g. Katy Mills, Katy TX"><input id="mp-place" style={INPUT} maxLength={120} value={f.lastSeenPlace} onChange={(e) => set({ lastSeenPlace: e.target.value })} /></Field>
            <Field label="Description (English)" htmlFor="mp-desc" hint="Height, hair, clothing, vehicle: only what the official poster says."><textarea id="mp-desc" style={{ ...INPUT, minHeight: 80 }} maxLength={600} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
            <Field label="Description (Spanish, optional)" htmlFor="mp-desc-es"><textarea id="mp-desc-es" style={{ ...INPUT, minHeight: 80 }} maxLength={600} value={f.descriptionEs} onChange={(e) => set({ descriptionEs: e.target.value })} /></Field>
            <Field label="Police department or agency" htmlFor="mp-agency" required><input id="mp-agency" style={INPUT} maxLength={80} value={f.agencyName} onChange={(e) => set({ agencyName: e.target.value })} /></Field>
            <Field label="Agency phone for information" htmlFor="mp-phone" required hint={f.agencyPhone && !phoneOk ? '10 digits, e.g. (281) 391-4848' : 'The number customers call.'}><input id="mp-phone" style={INPUT} inputMode="tel" value={f.agencyPhone} onChange={(e) => set({ agencyPhone: e.target.value })} /></Field>
            <Field label="Case number (or alert number)" htmlFor="mp-case" required><input id="mp-case" style={INPUT} maxLength={40} value={f.caseNumber} onChange={(e) => set({ caseNumber: e.target.value })} /></Field>
            <Field label="Link to the official alert (optional)" htmlFor="mp-src" hint="https:// link to the police or AMBER Alert page."><input id="mp-src" style={INPUT} maxLength={300} value={f.sourceUrl} onChange={(e) => set({ sourceUrl: e.target.value })} /></Field>
          </div>
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 600, fontSize: FONT.small, color: C.text2, marginBottom: 6 }}>Which stores' customers see it</div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: FONT.small }}><input type="checkbox" checked={f.allStores} onChange={(e) => set({ allStores: e.target.checked })} /> Every store</label>
            {!f.allStores && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px', marginTop: 8 }}>
                {sortedStores.map((s) => <label key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: FONT.small }}><input type="checkbox" checked={f.storeIds.includes(s.id)} onChange={() => toggleStore(s.id)} />{s.name}</label>)}
              </div>
            )}
          </div>
          {editing === 'new' && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14, padding: 10, borderRadius: 8, background: '#fff7ed', border: '1px solid #fed7aa', fontSize: FONT.small, fontWeight: 600, color: C.text }}>
              <input type="checkbox" checked={f.officialConfirmed} onChange={(e) => set({ officialConfirmed: e.target.checked })} style={{ marginTop: 3 }} />
              I checked this case with the police or the official alert, and the photo and details come from it.
            </label>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
            <Button variant="primary" disabled={!canSave || save.isPending} onClick={() => save.mutate()}>{save.isPending ? 'Saving…' : editing === 'new' ? 'Put the poster up' : 'Save changes'}</Button>
            <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </Card>
      )}

      {q.isLoading ? <div style={{ color: C.muted }}>Loading…</div> : q.isError ? <Notice tone="danger">Could not load the posters.</Notice> : (
        <>
          <div style={{ marginTop: 18 }}><SectionTitle count={active.length}>Up now</SectionTitle></div>
          {active.length === 0 ? (
            <EmptyState icon={<UserSearch />} title="No missing person posters" description="When the police ask for help finding someone near your stores, post it here." />
          ) : (
            <div style={{ display: 'grid', gap: 12 }}>
              {active.map((p) => (
                <Card key={p.id} style={{ display: 'flex', gap: 16, flexWrap: 'wrap', borderLeft: p.urgent ? `4px solid ${C.danger}` : undefined }}>
                  {p.photoUrl && <img src={p.photoUrl} alt="" style={{ width: 110, height: 135, objectFit: 'cover', borderRadius: 10 }} />}
                  <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: FONT.section, color: C.text }}>{p.name}{p.age != null ? `, ${p.age}` : ''}</strong>
                      {p.urgent && <Badge tone="danger">Urgent</Badge>}
                      {p.showing ? <Badge tone="success">Showing in the app</Badge> : <Badge tone="warning">Not showing: needs its 30-day check</Badge>}
                      {p.showing && p.needsCheck && <Badge tone="warning">Check due {storeDay(p.reviewDueAt)}</Badge>}
                    </div>
                    <div style={{ fontSize: FONT.small, color: C.text2, marginTop: 4, lineHeight: 1.5 }}>
                      Last seen {storeDay(p.lastSeenAt)} at {p.lastSeenPlace}.<br />
                      {p.agencyName}, {phoneText(p.agencyPhone)}, case {p.caseNumber}.<br />
                      {p.storeIds.length === 0 ? 'Every store' : p.storeIds.map(storeName).join(', ')}. Next check {storeDay(p.reviewDueAt)}.
                      {p.pushSentAt ? ` Alert sent ${storeDay(p.pushSentAt)} to ${p.pushCount.toLocaleString('en-US')} customers.` : ''}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <Button size="sm" variant={p.showing && !p.needsCheck ? 'secondary' : 'primary'} disabled={confirm.isPending} onClick={() => confirm.mutate(p.id)}>Still missing (checked)</Button>
                      {!p.pushSentAt && p.showing && <Button size="sm" variant="secondary" onClick={() => setAlerting(p)}>Send alert</Button>}
                      <Button size="sm" variant="secondary" onClick={() => open(p)}>Edit</Button>
                      <Button size="sm" variant="primary" onClick={() => setEnding({ p, status: 'FOUND' })}>Found</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEnding({ p, status: 'RESOLVED' })}>Resolved</Button>
                      <Button size="sm" variant="ghost" onClick={() => setEnding({ p, status: 'REMOVED' })}>Remove</Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          {ended.length > 0 && (
            <details style={{ marginTop: 20 }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600, color: C.text2 }}>Taken down ({ended.length})</summary>
              <Card padding={0} style={{ marginTop: 8 }}>
                {ended.map((p, i) => (
                  <div key={p.id} style={{ padding: '10px 14px', borderTop: i ? `1px solid ${C.border}` : 'none', fontSize: FONT.small, color: C.text2 }}>
                    <strong>{p.status === 'FOUND' ? 'Found' : p.status === 'RESOLVED' ? 'Resolved' : 'Removed'}</strong> {p.endedAt ? storeDay(p.endedAt) : ''}: case {p.caseNumber}, {p.agencyName}{p.endNote ? `. ${p.endNote}` : ''}
                  </div>
                ))}
              </Card>
            </details>
          )}
        </>
      )}

      <ConfirmModal open={!!ending} danger={ending?.status === 'REMOVED'} busy={end.isPending}
        title={ending?.status === 'FOUND' ? `Mark ${ending.p.name} as found?` : ending?.status === 'RESOLVED' ? 'Mark the case resolved?' : 'Remove this poster?'}
        message={<p style={{ margin: 0 }}>The poster comes down everywhere at once. The photo and personal details are deleted; the case number and agency stay in the record. Add a note (only HQ sees it).</p>}
        withInput inputLabel="Note (optional)" inputPlaceholder="e.g. Found safe, confirmed by Katy PD"
        confirmLabel={ending?.status === 'FOUND' ? 'Mark found' : ending?.status === 'RESOLVED' ? 'Mark resolved' : 'Remove'}
        onConfirm={(v) => end.mutate(v?.trim() || undefined)} onCancel={() => setEnding(null)} />
      <ConfirmModal open={!!alerting} busy={alert.isPending} title={`Send the alert for ${alerting?.name ?? ''}?`} confirmLabel="Send alert" confirmDisabled={reach.isLoading}
        message={<p style={{ margin: 0 }}>{reach.isLoading ? 'Counting…' : `${(reach.data?.data?.data?.customers ?? 0).toLocaleString('en-US')} customers of ${alerting?.storeIds.length ? 'the chosen stores' : 'every store'} get one push, in their language: "Help find ${alerting?.name}… If you see them, call 911." It can be sent only once per poster.`}</p>}
        onConfirm={() => alert.mutate()} onCancel={() => setAlerting(null)} />
    </Page>
  );
}
