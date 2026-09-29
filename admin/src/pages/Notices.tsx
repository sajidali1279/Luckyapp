import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CalendarPlus, Copy, Pencil, Plus, RotateCcw, Trash2, EyeOff, Pin } from 'lucide-react';
import { noticesApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import NoticeEditorModal, { type NoticeRow } from '../components/NoticeEditorModal';
import { Page, PageHeader, HeaderStat, Tabs, Button, Card, Badge, EmptyState } from '../components/kit';
import { C, FONT } from '../lib/theme';
import { failureMessage } from '../lib/apiError';
import { storeToday, addDays, endOfStoreDay, dayLabel, storeDayTime } from '../lib/storeDates';

type View = 'live' | 'scheduled' | 'ended';
type State = 'live' | 'scheduled' | 'ended' | 'down';

function stateOf(n: NoticeRow, now = Date.now()): State {
  if (!n.isActive) return 'down';
  if (new Date(n.endDate).getTime() < now) return 'ended';
  if (new Date(n.startDate).getTime() > now) return 'scheduled';
  return 'live';
}
const AUDIENCE = { ALL_STAFF: 'Everyone', MANAGERS: 'Managers only', EMPLOYEES: 'Employees only' } as const;

export default function Notices() {
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const isHQ = user?.role === 'DEV_ADMIN' || user?.role === 'SUPER_ADMIN';
  const [view, setView] = useState<View>('live');
  const [editor, setEditor] = useState<null | { kind: 'new' } | { kind: 'edit' | 'copy'; notice: NoticeRow }>(null);
  const [confirmDelete, setConfirmDelete] = useState<NoticeRow | null>(null);
  const [confirmDown, setConfirmDown] = useState<NoticeRow | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['admin-notices'], queryFn: () => noticesApi.getAll() });
  const { data: storesData } = useQuery({ queryKey: ['accessible-stores'], queryFn: () => storesApi.getAccessible() });
  const stores: { id: string; name: string; city?: string }[] = storesData?.data?.data || [];
  const notices: NoticeRow[] = data?.data?.data || [];

  const refresh = () => { qc.invalidateQueries({ queryKey: ['admin-notices'] }); qc.invalidateQueries({ queryKey: ['active-notices'] }); };
  const takeDown = useMutation({
    mutationFn: (id: string) => noticesApi.deactivate(id),
    onSuccess: () => { toast.success('Notice taken down. Staff no longer see it.'); refresh(); },
    onError: (e) => toast.error(failureMessage(e, 'Could not take the notice down')),
  });
  const remove = useMutation({
    mutationFn: (id: string) => noticesApi.delete(id),
    onSuccess: () => { toast.success('Notice deleted'); refresh(); },
    onError: (e) => toast.error(failureMessage(e, 'Could not delete the notice')),
  });
  // A week more from its last day, or from today when it has already ended; bringing one back that was taken down
  const extend = useMutation({
    mutationFn: (n: NoticeRow) => {
      const today = storeToday();
      const last = storeToday(new Date(n.endDate));
      const next = addDays(last >= today ? last : today, 7);
      return noticesApi.update(n.id, { endDate: endOfStoreDay(next).toISOString(), isActive: true });
    },
    onSuccess: (_r, n) => { toast.success(n.isActive ? 'Extended by a week' : 'Brought back for a week'); refresh(); },
    onError: (e) => toast.error(failureMessage(e, 'Could not extend the notice')),
  });
  const bringBack = useMutation({
    mutationFn: (n: NoticeRow) => noticesApi.update(n.id, { isActive: true }),
    onSuccess: () => { toast.success('Notice brought back'); refresh(); },
    onError: (e) => toast.error(failureMessage(e, 'Could not bring the notice back')),
  });

  if (isError) return <Page><ErrorState message="Failed to load notices." onRetry={refetch} /></Page>;

  const now = Date.now();
  const byState = (st: State[]) => notices.filter((n) => st.includes(stateOf(n, now)));
  const live = byState(['live']).sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'URGENT' ? -1 : 1));
  const scheduled = byState(['scheduled']).sort((a, b) => +new Date(a.startDate) - +new Date(b.startDate));
  const ended = byState(['ended', 'down']);
  const shown = view === 'live' ? live : view === 'scheduled' ? scheduled : ended;
  const urgentLive = live.filter((n) => n.priority === 'URGENT').length;

  return (
    <Page>
      {editor && <NoticeEditorModal mode={editor} stores={stores} isHQ={isHQ} onClose={() => setEditor(null)} />}
      <ConfirmModal
        open={!!confirmDown}
        title="Take this notice down?"
        message="Staff stop seeing it right away. It moves to Ended, where you can bring it back."
        confirmLabel="Take down"
        danger
        onConfirm={() => { if (confirmDown) takeDown.mutate(confirmDown.id); setConfirmDown(null); }}
        onCancel={() => setConfirmDown(null)}
      />
      <ConfirmModal
        open={!!confirmDelete}
        title="Delete this notice?"
        message="It is removed from this list for good. Taking it down keeps it here instead."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (confirmDelete) remove.mutate(confirmDelete.id); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />

      <PageHeader
        title="Notices"
        description="Announcements pinned at the top of Home and Chat in the staff app. Urgent ones stay until they end."
        actions={<Button variant="primary" icon={<Plus />} onClick={() => setEditor({ kind: 'new' })}>New Notice</Button>}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <HeaderStat label="Live" value={live.length} tone={live.length ? 'success' : 'neutral'} />
          <HeaderStat label="Urgent now" value={urgentLive} tone={urgentLive ? 'danger' : 'neutral'} />
          <HeaderStat label="Scheduled" value={scheduled.length} tone={scheduled.length ? 'info' : 'neutral'} />
        </div>
      </PageHeader>

      <Tabs
        ariaLabel="Notices"
        value={view}
        onChange={setView}
        tabs={[
          { value: 'live', label: 'Live', count: live.length },
          { value: 'scheduled', label: 'Scheduled', count: scheduled.length },
          { value: 'ended', label: 'Ended', count: ended.length },
        ]}
      />

      {isLoading ? (
        <CardSkeleton count={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Pin size={22} />}
          title={view === 'live' ? 'No notice is live' : view === 'scheduled' ? 'Nothing scheduled' : 'No ended notices'}
          description={view === 'ended' ? 'Notices that ran out or were taken down show here, ready to copy or bring back.' : 'Post one, or schedule it for a later day.'}
          action={view !== 'ended' ? <Button variant="primary" icon={<Plus />} onClick={() => setEditor({ kind: 'new' })}>New Notice</Button> : undefined}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {shown.map((n) => {
            const st = stateOf(n, now);
            const manage = n.canManage !== false;
            const urgent = n.priority === 'URGENT';
            return (
              <Card key={n.id} className="notice-card" padding={0} style={{ overflow: 'hidden', borderLeft: `4px solid ${urgent && st === 'live' ? C.danger : st === 'live' ? C.primary : C.border}` }}>
                <div style={{ padding: '16px 18px' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
                    {urgent && <Badge tone="danger" icon={<AlertTriangle size={12} />}>Urgent</Badge>}
                    {st === 'live' && <Badge tone="success">Live</Badge>}
                    {st === 'scheduled' && <Badge tone="info">Starts {dayLabel(storeToday(new Date(n.startDate)))}</Badge>}
                    {st === 'ended' && <Badge>Ended</Badge>}
                    {st === 'down' && <Badge>Taken down</Badge>}
                    <Badge>{AUDIENCE[n.audience]}</Badge>
                    <Badge title={n.storeNames?.join(', ')}>{storeWords(n)}</Badge>
                  </div>
                  <h2 style={{ margin: '0 0 4px', fontSize: FONT.section, fontWeight: 600, color: C.text }}>{n.title}</h2>
                  <p style={{ margin: 0, fontSize: FONT.body, color: C.text2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{n.body}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', marginTop: 10, fontSize: FONT.caption, color: C.muted }}>
                    <span>{dayLabel(storeToday(new Date(n.startDate)))} to {dayLabel(storeToday(new Date(n.endDate)))}</span>
                    <span>{pushWords(n, st)}</span>
                    <span>Posted by {n.createdBy?.name || 'someone'}</span>
                  </div>
                </div>
                {manage && (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 14px', borderTop: `1px solid ${C.border}`, background: C.subtle }}>
                    {st !== 'down' && st !== 'ended' && <Button size="sm" icon={<Pencil />} onClick={() => setEditor({ kind: 'edit', notice: n })}>Edit</Button>}
                    {st !== 'scheduled' && (
                      <Button size="sm" icon={<CalendarPlus />} onClick={() => extend.mutate(n)} disabled={extend.isPending}>
                        {st === 'live' ? 'Extend a week' : 'Run another week'}
                      </Button>
                    )}
                    {st === 'down' && new Date(n.endDate).getTime() >= now && (
                      <Button size="sm" icon={<RotateCcw />} onClick={() => bringBack.mutate(n)} disabled={bringBack.isPending}>Bring back</Button>
                    )}
                    <Button size="sm" icon={<Copy />} onClick={() => setEditor({ kind: 'copy', notice: n })}>Copy</Button>
                    <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                      {(st === 'live' || st === 'scheduled') && <Button size="sm" variant="ghost" icon={<EyeOff />} onClick={() => setConfirmDown(n)}>Take down</Button>}
                      <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => setConfirmDelete(n)}>Delete</Button>
                    </span>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </Page>
  );
}

function storeWords(n: NoticeRow): string {
  const names = n.storeNames ?? [];
  if (n.storeIds.length === 0) return 'All stores';
  if (names.length <= 2) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

function pushWords(n: NoticeRow, st: State): string {
  if (n.announcedAt) return `Push sent ${storeDayTime(n.announcedAt)}${n.announcedTo != null ? ` to ${n.announcedTo} staff` : ''}`;
  if (!n.notify) return 'No push';
  if (st === 'scheduled') return `Push on ${dayLabel(storeToday(new Date(n.startDate)))}`;
  return 'No push sent';
}
