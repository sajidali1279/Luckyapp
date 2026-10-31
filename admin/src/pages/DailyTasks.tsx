import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { dailyTaskApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { ListChecks, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';
import { TEXT_MUTED, PRIMARY, C, FONT, INPUT, RADIUS } from '../lib/theme';
import { Page, PageHeader, Button, Notice, Field } from '../components/kit';
import Glyph from '../components/Glyph';

type Shift = 'OPENING' | 'MIDDLE' | 'CLOSING';

interface DailyTask {
  id: string;
  shift: Shift;
  title: string;
  description: string | null;
  storeId: string | null;
  sortOrder: number;
  isActive: boolean;
  store?: { id: string; name: string } | null;
}

const SHIFT_LABELS: Record<Shift, string> = {
  OPENING: 'Morning (Opening)',
  MIDDLE:  'Midday (Afternoon)',
  CLOSING: 'Night (Closing)',
};

const SHIFT_ORDER: Shift[] = ['OPENING', 'MIDDLE', 'CLOSING'];

const SHIFT_COLORS: Record<Shift, { bg: string; border: string; label: string }> = {
  OPENING: { bg: '#fdf6e8', border: '#f1dcaf', label: '#8a5300' },
  MIDDLE:  { bg: '#fdf6e8', border: '#f1dcaf', label: '#8a5300' },
  CLOSING: { bg: '#eef2f7', border: '#d3dcea', label: '#1D3557' },
};

const EMPTY_FORM = { shift: 'OPENING' as Shift, title: '', description: '', storeId: '' };

export default function DailyTasks() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const isStoreManager = user?.role === 'STORE_MANAGER';
  const ownStoreIds: string[] = user?.storeIds || [];
  const qc = useQueryClient();

  const [scopeFilter, setScopeFilter] = useState<string>('global');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<DailyTask | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmSeed, setConfirmSeed] = useState(false);

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: () => storesApi.getAccessible(),
    staleTime: 10 * 60_000,
  });
  const stores: { id: string; name: string; shiftsPerDay?: number }[] = storesData?.data?.data ?? [];
  // Stores that run 2 shifts have no middle shift: their staff are not shown Middle tasks
  const twoShiftStores = stores.filter((st) => st.shiftsPerDay === 2);
  const isTwoShift = (id: string | null | undefined) => !!id && twoShiftStores.some((st) => st.id === id);
  // The store(s) whose 2-shift note and copy buttons show: the one picked (HQ), or a manager's own
  const twoShiftInView = isStoreManager ? twoShiftStores.filter((st) => ownStoreIds.includes(st.id)) : twoShiftStores.filter((st) => st.id === scopeFilter);

  // A Store Manager always gets chain-wide + their own store's tasks combined
  // (the backend ignores any storeId filter for that role): the scope
  // filter dropdown below is SuperAdmin+ only, so its value doesn't matter here.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['daily-tasks-admin', isStoreManager ? 'mine' : scopeFilter],
    queryFn: () => dailyTaskApi.getAll(isStoreManager ? undefined : (scopeFilter === 'global' ? 'global' : scopeFilter || undefined)),
  });
  const tasks: DailyTask[] = data?.data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (d: typeof form) => dailyTaskApi.create({ ...d, storeId: d.storeId || undefined }),
    onSuccess: () => { toast.success('Task added'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); closeModal(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to add task'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: typeof form }) =>
      dailyTaskApi.update(id, { ...d, storeId: d.storeId || null, description: d.description || null }),
    onSuccess: () => { toast.success('Task updated'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); closeModal(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update task'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dailyTaskApi.delete(id),
    onSuccess: () => { toast.success('Task deleted'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); setDeleteId(null); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete task'),
  });

  const copyMiddleMutation = useMutation({
    mutationFn: ({ storeId, to }: { storeId: string; to: 'OPENING' | 'CLOSING' }) => dailyTaskApi.copyMiddle(storeId, to),
    onSuccess: (res) => {
      const d = res?.data?.data ?? {};
      toast.success(d.added ? `${d.added} task${d.added === 1 ? '' : 's'} copied to ${d.store}${d.skipped ? ` (${d.skipped} it already had)` : ''}` : `${d.store} already has all of them`);
      qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Could not copy the tasks'),
  });

  const seedMutation = useMutation({
    mutationFn: () => dailyTaskApi.seedDefaults(),
    onSuccess: () => { toast.success('Default tasks loaded!'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); setConfirmSeed(false); },
    onError: (e: any) => { toast.error(e.response?.data?.error || 'Could not load the default tasks'); setConfirmSeed(false); },
  });

  function openAdd() {
    setEditTask(null);
    // Single-store manager: locked to their one store. Multi-store manager:
    // no default; they must pick which of their stores in the modal below.
    setForm({ ...EMPTY_FORM, storeId: isStoreManager ? (ownStoreIds.length === 1 ? ownStoreIds[0] : '') : (scopeFilter === 'global' ? '' : scopeFilter) });
    setModalOpen(true);
  }

  function openEdit(t: DailyTask) {
    setEditTask(t);
    setForm({ shift: t.shift, title: t.title, description: t.description ?? '', storeId: t.storeId ?? '' });
    setModalOpen(true);
  }

  function closeModal() { setModalOpen(false); setEditTask(null); setForm(EMPTY_FORM); }

  function handleSave() {
    if (!form.title.trim()) { toast.error('Title is required'); return; }
    if (isStoreManager && ownStoreIds.length > 1 && !form.storeId) { toast.error('Select which of your stores'); return; }
    if (editTask) updateMutation.mutate({ id: editTask.id, d: form });
    else createMutation.mutate(form);
  }

  const grouped = SHIFT_ORDER.reduce<Record<Shift, DailyTask[]>>((acc, s) => {
    acc[s] = tasks.filter(t => t.shift === s);
    return acc;
  }, { OPENING: [], MIDDLE: [], CLOSING: [] });

  const totalTasks = tasks.length;
  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Page>
      <ConfirmModal
        open={!!deleteId}
        title="Delete this task?"
        message="This task will be permanently removed from the checklist."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmModal
        open={confirmSeed}
        title="Load the default tasks?"
        message="This will add the standard Lucky Stop checklists (Morning, Midday, Night) as chain-wide tasks. Only works if no global defaults exist yet."
        confirmLabel="Load defaults"
        onConfirm={() => seedMutation.mutate()}
        onCancel={() => setConfirmSeed(false)}
      />

      {/* Header */}
      <PageHeader
        title="Daily tasks"
        description={`Employee shift checklists.${isLoading || isError ? '' : totalTasks > 0 ? ` ${totalTasks} task${totalTasks !== 1 ? 's' : ''}.` : ' No tasks yet.'}`}
        actions={
          <>
            {isDevAdmin && <Button icon={<Sparkles />} onClick={() => setConfirmSeed(true)}>Load defaults</Button>}
            <Button variant="primary" icon={<Plus />} onClick={openAdd}>Add task</Button>
          </>
        }
      />

      {/* Scope filter: StoreManager always sees chain-wide + their own store combined */}
      {!isStoreManager && (
        <div style={s.filterRow}>
          <label style={s.filterLabel} htmlFor="dt-scope">Showing tasks for:</label>
          <select id="dt-scope" style={s.select} value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
            <option value="global">All stores (chain-wide)</option>
            {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>
      )}

      {/* Content */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={3} />
      ) : totalTasks === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}><Glyph e="📋" size={28} color="#5a6472" /></div>
          <div style={s.emptyTitle}>No tasks yet</div>
          <div style={s.emptyText}>
            {isDevAdmin
              ? 'Click "Load defaults" to populate the standard Lucky Stop checklists, or add tasks manually.'
              : 'Add the first task with Add task. Chain-wide tasks show at every store; a store\'s own tasks only there.'}
          </div>
        </div>
      ) : (
        <div style={s.groups}>
          {SHIFT_ORDER.map(shift => {
            const shiftTasks = grouped[shift];
            const colors = SHIFT_COLORS[shift];
            return (
              <div key={shift} style={{ ...s.shiftGroup, borderColor: colors.border, background: colors.bg }}>
                <div style={s.shiftHeader}>
                  <span style={{ ...s.shiftLabel, color: colors.label }}>{SHIFT_LABELS[shift]}</span>
                  <span style={{ ...s.shiftCount, color: colors.label }}>{shiftTasks.length} task{shiftTasks.length !== 1 ? 's' : ''}</span>
                </div>
                {shift === 'MIDDLE' && !isStoreManager && scopeFilter === 'global' && twoShiftStores.length > 0 && (
                  <Notice tone="neutral" style={{ fontSize: 13, marginBottom: 10 }}>
                    Not shown at stores that run 2 shifts: {twoShiftStores.map((st) => st.name).join(', ')}. Open one of them above to copy these into its Opening or Closing list.
                  </Notice>
                )}
                {shift === 'MIDDLE' && twoShiftInView.map((st) => (
                  <Notice key={st.id} tone="warning" style={{ fontSize: 13, marginBottom: 10 }}>
                    <div>{st.name} runs 2 shifts, so its staff are not shown Middle tasks. Copy the chain's Middle tasks into one of its shifts so those duties still get done:</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <Button size="sm" onClick={() => copyMiddleMutation.mutate({ storeId: st.id, to: 'OPENING' })} disabled={copyMiddleMutation.isPending}>Copy to its Opening</Button>
                      <Button size="sm" onClick={() => copyMiddleMutation.mutate({ storeId: st.id, to: 'CLOSING' })} disabled={copyMiddleMutation.isPending}>Copy to its Closing</Button>
                    </div>
                  </Notice>
                ))}
                {shiftTasks.length === 0 ? (
                  <div style={s.shiftEmpty}>No tasks for this shift</div>
                ) : (
                  <div style={s.taskList}>
                    {shiftTasks.map((task, idx) => (
                      <div key={task.id} style={s.taskRow}>
                        <div style={s.taskNum}>{idx + 1}</div>
                        <div style={s.taskBody}>
                          <div style={s.taskTitle}>{task.title}</div>
                          {task.description && <div style={s.taskDesc}>{task.description}</div>}
                          {task.store && (
                            <span style={s.storeBadge}>{task.store.name}</span>
                          )}
                        </div>
                        {(!isStoreManager || (task.storeId !== null && ownStoreIds.includes(task.storeId))) && (
                          <div style={s.taskActions}>
                            <button style={s.editBtn} onClick={() => openEdit(task)} title="Edit" aria-label={`Edit task ${task.title}`}>
                              <Pencil size={15} />
                            </button>
                            <button style={s.deleteBtn} onClick={() => setDeleteId(task.id)} title="Delete" aria-label={`Delete task ${task.title}`}>
                              <Trash2 size={15} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {modalOpen && (
        <Modal title={editTask ? 'Edit task' : 'Add task'} onClose={closeModal} busy={saving} maxWidth={500}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Shift" htmlFor="dt-shift">
              <select id="dt-shift" className="ui-input" style={INPUT} value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value as Shift }))}>
                {/* A 2-shift store has no Middle shift */}
                {SHIFT_ORDER.filter(sh => sh !== 'MIDDLE' || !isTwoShift(form.storeId || (isStoreManager && ownStoreIds.length === 1 ? ownStoreIds[0] : ''))).map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
              </select>
            </Field>

            <Field label="Title" htmlFor="dt-title" required>
              <input
                id="dt-title"
                className="ui-input"
                style={INPUT}
                value={form.title}
                placeholder="e.g. Coffee & Fountain"
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
            </Field>

            <Field label="Description (optional)" htmlFor="dt-description">
              <textarea
                id="dt-description"
                className="ui-input"
                style={{ ...INPUT, minHeight: 80, resize: 'vertical' }}
                value={form.description}
                placeholder="Step-by-step details for this task…"
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </Field>

            {isStoreManager && ownStoreIds.length <= 1 ? (
              <div style={{ padding: '8px 12px', background: C.primaryTint, borderRadius: RADIUS.md, fontSize: FONT.small, color: C.primary, fontWeight: 600 }}>
                This task will apply to your store only
              </div>
            ) : isStoreManager ? (
              <Field label="Store" htmlFor="dt-store">
                <select id="dt-store" className="ui-input" style={INPUT} value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
                  <option value="">Choose your store</option>
                  {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </Field>
            ) : (
              <Field label="Store" htmlFor="dt-store" hint="Chain-wide tasks show at every store.">
                <select id="dt-store" className="ui-input" style={INPUT} value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
                  <option value="">All stores (chain-wide)</option>
                  {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </Field>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <Button onClick={closeModal} disabled={saving}>Cancel</Button>
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editTask ? 'Save changes' : 'Add task'}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </Page>
  );
}

const s: Record<string, React.CSSProperties> = {
  // Wraps on a phone: the select takes the rest of the line, or its own line, and never runs past the edge
  filterRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' },
  filterLabel: { fontSize: 14, fontWeight: 600, color: '#374151', flexShrink: 0 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e4e7ec', fontSize: 14, color: '#111827', background: '#fff', cursor: 'pointer', flex: '1 1 200px', minWidth: 0, maxWidth: 360 },

  emptyState: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 14, color: TEXT_MUTED, lineHeight: 1.6, maxWidth: 480, margin: '0 auto' },

  groups: { display: 'flex', flexDirection: 'column', gap: 20 },
  shiftGroup: { borderRadius: 12, border: '1.5px solid', overflow: 'hidden' },
  shiftHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.06)' },
  shiftLabel: { fontSize: 15, fontWeight: 700 },
  shiftCount: { fontSize: 13, fontWeight: 600, opacity: 0.7 },
  shiftEmpty: { padding: '16px 18px', fontSize: 13, color: TEXT_MUTED, fontStyle: 'italic' },

  taskList: { display: 'flex', flexDirection: 'column' },
  taskRow: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#fff' },
  taskNum: { width: 22, height: 22, borderRadius: '50%', background: '#f1f3f6', color: TEXT_MUTED, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  taskBody: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 },
  taskDesc: { fontSize: 13, color: TEXT_MUTED, lineHeight: 1.5 },
  storeBadge: { display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, color: PRIMARY, background: '#eef2f7', borderRadius: 6, padding: '2px 8px' },
  // 36 px squares, 12 px apart, so the delete button is not hit for edit
  taskActions: { display: 'flex', gap: 12, flexShrink: 0 },
  editBtn: { background: '#f1f3f6', border: 'none', borderRadius: 6, width: 36, height: 36, padding: 0, cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  deleteBtn: { background: '#fdf2f2', border: 'none', borderRadius: 6, width: 36, height: 36, padding: 0, cursor: 'pointer', color: '#c42130', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
