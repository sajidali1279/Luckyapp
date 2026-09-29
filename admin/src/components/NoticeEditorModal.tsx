// Post, edit or copy a staff notice. Two columns on a wide screen: the form, and a live preview of the banner as staff will see it in the
// app with one sentence saying who gets it, when, and whether a push goes out.
import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, Megaphone, Pin, Search, X } from 'lucide-react';
import Modal from './Modal';
import { Button, Chip, Field, Notice } from './kit';
import { C, FONT, INPUT, RADIUS } from '../lib/theme';
import { noticesApi, type NoticeInput } from '../services/api';
import { failureMessage } from '../lib/apiError';
import { storeToday, addDays, daysBetween, dayLabel, startOfStoreDay, endOfStoreDay } from '../lib/storeDates';

export type NoticeRow = {
  id: string; title: string; body: string; storeIds: string[]; storeNames?: string[];
  audience: 'ALL_STAFF' | 'MANAGERS' | 'EMPLOYEES'; priority: 'NORMAL' | 'URGENT';
  startDate: string; endDate: string; isActive: boolean; notify: boolean; announcedAt: string | null; announcedTo: number | null;
  createdBy?: { name?: string | null }; createdAt: string; canManage?: boolean;
};
type Store = { id: string; name: string; city?: string };
type Mode = { kind: 'new' } | { kind: 'edit'; notice: NoticeRow } | { kind: 'copy'; notice: NoticeRow };

const MAX_TITLE = 100;
const MAX_BODY = 500;
const AUDIENCE_WORDS = { ALL_STAFF: 'employees and managers', MANAGERS: 'managers', EMPLOYEES: 'employees' } as const;
const LENGTHS: [string, number][] = [['Today only', 0], ['3 days', 2], ['1 week', 6], ['2 weeks', 13], ['1 month', 29]];

export default function NoticeEditorModal({ mode, stores, isHQ, onClose }: {
  mode: Mode; stores: Store[]; isHQ: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const src = mode.kind === 'new' ? null : mode.notice;
  const today = storeToday();

  // A copy keeps the words, the stores and the length, starting today
  const srcStart = src ? storeToday(new Date(src.startDate)) : today;
  const srcEnd = src ? storeToday(new Date(src.endDate)) : addDays(today, 6);
  const [title, setTitle] = useState(src?.title ?? '');
  const [body, setBody] = useState(src?.body ?? '');
  const [priority, setPriority] = useState<NoticeRow['priority']>(src?.priority ?? 'NORMAL');
  const [audience, setAudience] = useState<NoticeRow['audience']>(src?.audience ?? 'ALL_STAFF');
  const [allStores, setAllStores] = useState(isHQ ? (src ? src.storeIds.length === 0 : true) : false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(src?.storeIds.length ? src.storeIds : isHQ ? [] : stores.map((s) => s.id)));
  const [storeSearch, setStoreSearch] = useState('');
  const [start, setStart] = useState(mode.kind === 'edit' ? srcStart : today);
  const [end, setEnd] = useState(mode.kind === 'copy' ? addDays(today, Math.max(0, daysBetween(srcStart, srcEnd))) : srcEnd);
  const started = mode.kind === 'edit' && new Date(mode.notice.startDate).getTime() <= Date.now();
  const [notify, setNotify] = useState(mode.kind !== 'edit' ? true : !started && mode.notice.notify);

  const shownStores = useMemo(() => {
    const q = storeSearch.trim().toLowerCase();
    return q ? stores.filter((s) => `${s.name} ${s.city ?? ''}`.toLowerCase().includes(q)) : stores;
  }, [stores, storeSearch]);
  const storeIds = allStores ? [] : [...picked];
  const startsLater = start > today;

  const problems: string[] = [];
  if (!title.trim()) problems.push('a title');
  if (!body.trim()) problems.push('the notice text');
  if (!allStores && storeIds.length === 0) problems.push('at least one store');
  if (!end || end < today) problems.push('a last day of today or later');
  if (start && end && end < start) problems.push('a last day on or after the first day');

  const save = useMutation({
    mutationFn: () => {
      const data: NoticeInput = {
        title: title.trim(), body: body.trim(), priority, audience, storeIds,
        // Today's start is an instant already past, so it shows at once; a later day shows from that day's midnight at the store
        startDate: startOfStoreDay(start).toISOString(), endDate: endOfStoreDay(end).toISOString(), notify,
      };
      return mode.kind === 'edit' ? noticesApi.update(mode.notice.id, data) : noticesApi.create(data);
    },
    onSuccess: (res) => {
      const sentTo: number | null = res?.data?.data?.sentTo ?? null;
      const what = mode.kind === 'edit' ? 'Notice saved' : startsLater ? `Notice scheduled for ${dayLabel(start)}` : 'Notice posted';
      toast.success(sentTo != null ? `${what}. Push sent to ${sentTo} staff.` : `${what}.`);
      qc.invalidateQueries({ queryKey: ['admin-notices'] });
      qc.invalidateQueries({ queryKey: ['active-notices'] });
      onClose();
    },
    onError: (e) => toast.error(failureMessage(e, 'Could not save the notice')),
  });

  const whereWords = allStores ? 'every store' : storeIds.length === 1 ? (stores.find((s) => s.id === storeIds[0])?.name ?? '1 store') : `${storeIds.length} stores`;
  const whenWords = start === end ? `on ${dayLabel(start)} only` : `from ${start === today ? 'today' : dayLabel(start)} to ${dayLabel(end)}`;
  const pushWords = !notify ? 'No push is sent.'
    : mode.kind === 'edit' && started ? 'Staff get the push again when you save.'
    : startsLater ? `The push goes out on ${dayLabel(start)}, when it starts.` : 'The push goes out as soon as you post.';

  const heading = mode.kind === 'edit' ? 'Edit notice' : mode.kind === 'copy' ? 'Post a copy' : 'New notice';
  const submitLabel = save.isPending ? 'Saving…' : mode.kind === 'edit' ? 'Save changes' : startsLater ? 'Schedule notice' : 'Post notice';

  return (
    <Modal title={heading} subtitle="Shown pinned at the top of Home and Chat in the staff app." onClose={onClose} busy={save.isPending} maxWidth={920}>
      <form
        onSubmit={(e) => { e.preventDefault(); if (problems.length === 0) save.mutate(); }}
        style={{ display: 'flex', flexDirection: 'column', gap: 0 }}
      >
        <div style={s.columns}>
          {/* ── The form ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, minWidth: 0 }}>
            <section style={s.section}>
              <h3 style={s.sectionTitle}>Message</h3>
              <Field label="Title" htmlFor="notice-title" hint={<Counter n={title.length} max={MAX_TITLE} />}>
                <input id="notice-title" className="ui-input" style={INPUT} value={title} maxLength={MAX_TITLE} autoFocus
                  onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Health inspection tomorrow" />
              </Field>
              <Field label="Notice text" htmlFor="notice-body" hint={<Counter n={body.length} max={MAX_BODY} />}>
                <textarea id="notice-body" className="ui-input" style={{ ...INPUT, minHeight: 96, resize: 'vertical' }} value={body} maxLength={MAX_BODY}
                  onChange={(e) => setBody(e.target.value)} placeholder="What staff need to know, and what to do." />
              </Field>
            </section>

            <section style={s.section}>
              <h3 style={s.sectionTitle}>Priority</h3>
              <div role="radiogroup" aria-label="Priority" style={s.optionGrid}>
                <Option selected={priority === 'NORMAL'} onSelect={() => setPriority('NORMAL')} icon={<Megaphone size={18} />} title="Normal"
                  text="Shows at the top of Home and Chat. Staff can close it." />
                <Option selected={priority === 'URGENT'} onSelect={() => setPriority('URGENT')} icon={<AlertTriangle size={18} />} title="Urgent" danger
                  text="Red, listed first, and stays until it ends. Staff cannot close it." />
              </div>
            </section>

            <section style={s.section}>
              <h3 style={s.sectionTitle}>Who sees it</h3>
              <div>
                <div style={s.miniLabel}>Staff</div>
                <div role="radiogroup" aria-label="Staff" style={s.chips}>
                  {(['ALL_STAFF', 'MANAGERS', 'EMPLOYEES'] as const).map((a) => (
                    <Chip key={a} role="radio" selected={audience === a} onClick={() => setAudience(a)}>
                      {a === 'ALL_STAFF' ? 'Everyone' : a === 'MANAGERS' ? 'Managers only' : 'Employees only'}
                    </Chip>
                  ))}
                </div>
              </div>
              <div>
                <div style={s.miniLabel}>Stores</div>
                {isHQ && (
                  <div role="radiogroup" aria-label="Stores" style={{ ...s.chips, marginBottom: 10 }}>
                    <Chip role="radio" selected={allStores} onClick={() => setAllStores(true)}>All stores</Chip>
                    <Chip role="radio" selected={!allStores} onClick={() => setAllStores(false)}>Choose stores</Chip>
                  </div>
                )}
                {!allStores && (
                  <div style={s.storeBox}>
                    <div style={s.storeTools}>
                      {stores.length > 6 && (
                        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
                          <Search size={14} aria-hidden="true" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: C.muted }} />
                          <input className="ui-input" style={{ ...INPUT, paddingLeft: 30, height: 32, fontSize: FONT.small }} aria-label="Find a store"
                            placeholder="Find a store" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} />
                        </div>
                      )}
                      <span style={{ fontSize: FONT.small, color: C.muted, marginLeft: 'auto' }}>{picked.size} of {stores.length} chosen</span>
                      <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(stores.map((st) => st.id)))}>All</Button>
                      <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>None</Button>
                    </div>
                    <div style={s.storeList}>
                      {shownStores.map((st) => (
                        <label key={st.id} style={{ ...s.storeRow, ...(picked.has(st.id) ? s.storeRowOn : {}) }}>
                          <input type="checkbox" checked={picked.has(st.id)} style={{ accentColor: C.primary, width: 15, height: 15 }}
                            onChange={() => setPicked((p) => { const n = new Set(p); if (n.has(st.id)) n.delete(st.id); else n.add(st.id); return n; })} />
                          <span style={{ fontWeight: 500, color: C.text }}>{st.name}</span>
                          {st.city && <span style={{ color: C.muted, fontSize: FONT.caption }}>{st.city}</span>}
                        </label>
                      ))}
                      {shownStores.length === 0 && <div style={{ padding: 10, color: C.muted, fontSize: FONT.small }}>No store matches.</div>}
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section style={s.section}>
              <h3 style={s.sectionTitle}>When</h3>
              <div style={s.twoCol}>
                <Field label="First day" htmlFor="notice-start" hint={start === today ? 'Today: shows as soon as it is posted.' : 'Shows from midnight at the store.'}>
                  <input id="notice-start" className="ui-input" style={INPUT} type="date" value={start} min={mode.kind === 'edit' && started ? undefined : today}
                    onChange={(e) => { const v = e.target.value; setStart(v); if (end < v) setEnd(v); }} disabled={mode.kind === 'edit' && started} />
                </Field>
                <Field label="Last day" htmlFor="notice-end" hint="Taken down after 11:59 pm at the store.">
                  <input id="notice-end" className="ui-input" style={INPUT} type="date" value={end} min={start > today ? start : today} onChange={(e) => setEnd(e.target.value)} />
                </Field>
              </div>
              <div style={s.chips}>
                {LENGTHS.map(([label, days]) => (
                  <Chip key={label} selected={end === addDays(start, days)} onClick={() => setEnd(addDays(start, days))}>{label}</Chip>
                ))}
              </div>
            </section>

            <section style={s.section}>
              <h3 style={s.sectionTitle}>Push notification</h3>
              <label style={s.checkRow}>
                <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ accentColor: C.primary, width: 16, height: 16 }} />
                <span>{mode.kind === 'edit' && started ? 'Tell staff again with a push' : startsLater ? 'Send a push when it starts' : 'Send a push to these staff'}</span>
              </label>
            </section>
          </div>

          {/* ── Preview ── */}
          <aside style={s.previewCol} aria-label="Preview">
            <div style={s.previewSticky}>
              <div style={s.miniLabel}>How staff see it</div>
              <div style={s.phone}>
                <div style={s.phoneBar}><span style={{ width: 36, height: 4, borderRadius: 2, background: '#3a5a85' }} /></div>
                <div style={{ ...s.banner, ...(priority === 'URGENT' ? s.bannerUrgent : {}) }}>
                  <span style={{ display: 'flex', marginTop: 1 }}>{priority === 'URGENT' ? <AlertTriangle size={15} /> : <Pin size={15} />}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {priority === 'URGENT' && <div style={s.urgentTag}>URGENT</div>}
                    <div style={{ fontWeight: 700, fontSize: 13, overflowWrap: 'anywhere' }}>{title.trim() || 'Your title'}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 2, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', opacity: body.trim() ? 1 : 0.6 }}>
                      {body.trim() || 'The notice text shows here.'}
                    </div>
                  </div>
                  {priority === 'NORMAL' && <X size={14} style={{ flexShrink: 0, opacity: 0.7 }} aria-hidden="true" />}
                </div>
                <div style={s.phoneBody}>
                  <div style={s.ghostLine} /><div style={{ ...s.ghostLine, width: '70%' }} /><div style={{ ...s.ghostLine, width: '85%' }} />
                </div>
              </div>
              <Notice tone="neutral" style={{ marginTop: 14, fontSize: FONT.small }}>
                Shows to <strong>{AUDIENCE_WORDS[audience]}</strong> at <strong>{whereWords}</strong> {whenWords}. {pushWords}
              </Notice>
            </div>
          </aside>
        </div>

        <div style={s.footer}>
          <span style={{ fontSize: FONT.small, color: problems.length ? C.warning : C.muted, marginRight: 'auto' }}>
            {problems.length ? `Still needed: ${problems.join(', ')}.` : priority === 'URGENT' ? 'Urgent: it stays on staff screens until it ends.' : ''}
          </span>
          <Button onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={problems.length > 0 || save.isPending}>{submitLabel}</Button>
        </div>
      </form>
    </Modal>
  );
}

function Counter({ n, max }: { n: number; max: number }) {
  return <span style={{ color: n > max * 0.9 ? C.warning : C.muted }}>{n} / {max}</span>;
}

function Option({ selected, onSelect, icon, title, text, danger }: { selected: boolean; onSelect: () => void; icon: React.ReactNode; title: string; text: string; danger?: boolean }) {
  const tint = danger ? { bg: C.dangerTint, border: C.danger, fg: C.danger } : { bg: C.primaryTint, border: C.primary, fg: C.primary };
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} style={{
      display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', padding: '12px 14px', borderRadius: RADIUS.md, cursor: 'pointer',
      border: `1.5px solid ${selected ? tint.border : C.borderStrong}`, background: selected ? tint.bg : C.surface, font: 'inherit',
    }}>
      <span style={{ color: selected ? tint.fg : C.muted, display: 'flex', marginTop: 1 }}>{icon}</span>
      <span>
        <span style={{ display: 'block', fontWeight: 600, fontSize: FONT.body, color: selected ? tint.fg : C.text }}>{title}</span>
        <span style={{ display: 'block', fontSize: FONT.small, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>{text}</span>
      </span>
    </button>
  );
}

const s: Record<string, React.CSSProperties> = {
  columns: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28, alignItems: 'start' },
  section: { display: 'flex', flexDirection: 'column', gap: 12 },
  sectionTitle: { margin: 0, fontSize: FONT.small, fontWeight: 700, color: C.primary, textTransform: 'uppercase', letterSpacing: 0.6 },
  miniLabel: { fontSize: FONT.small, fontWeight: 600, color: C.text2, marginBottom: 8 },
  optionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  storeBox: { border: `1px solid ${C.border}`, borderRadius: RADIUS.md, overflow: 'hidden' },
  storeTools: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', background: C.subtle, borderBottom: `1px solid ${C.border}`, flexWrap: 'wrap' },
  storeList: { maxHeight: 210, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' },
  storeRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', fontSize: FONT.small, borderBottom: `1px solid ${C.border}` },
  storeRowOn: { background: C.primaryTint },
  twoCol: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 },
  checkRow: { display: 'flex', alignItems: 'center', gap: 10, fontSize: FONT.body, color: C.text2, cursor: 'pointer' },
  // The column itself sticks, so the preview stays in view while the form scrolls
  previewCol: { minWidth: 0, position: 'sticky', top: 0, alignSelf: 'start' },
  previewSticky: {},
  phone: { borderRadius: 22, background: '#0f1d31', padding: 8, boxShadow: '0 12px 30px rgba(15, 29, 49, 0.25)', maxWidth: 340 },
  phoneBar: { display: 'flex', justifyContent: 'center', padding: '4px 0 8px' },
  banner: {
    display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', background: '#fdf6e8', color: '#8a5300',
    borderTopLeftRadius: 14, borderTopRightRadius: 14, borderBottom: '1px solid #f1dcaf',
  },
  bannerUrgent: { background: '#fdf2f2', color: '#a51b28', borderBottom: '1px solid #f3cdd1' },
  urgentTag: { display: 'inline-block', fontSize: 10, fontWeight: 800, letterSpacing: 0.6, background: '#c42130', color: '#fff', borderRadius: 4, padding: '1px 5px', marginBottom: 3 },
  phoneBody: { background: '#fff', padding: 14, borderBottomLeftRadius: 14, borderBottomRightRadius: 14, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 120 },
  ghostLine: { height: 10, borderRadius: 5, background: '#eef1f5', width: '100%' },
  footer: {
    display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', position: 'sticky', bottom: -24, margin: '22px -24px -24px',
    padding: '14px 24px', background: C.surface, borderTop: `1px solid ${C.border}`, borderBottomLeftRadius: 12, borderBottomRightRadius: 12,
  },
};
