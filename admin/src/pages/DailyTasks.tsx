import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { dailyTaskApi, storesApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { ListChecks, Plus, Pencil, Trash2, Sparkles } from 'lucide-react';

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
  OPENING: '🌅 Morning (Opening)',
  MIDDLE:  '☀️ Midday (Afternoon)',
  CLOSING: '🌙 Night (Closing)',
};

const SHIFT_ORDER: Shift[] = ['OPENING', 'MIDDLE', 'CLOSING'];

const SHIFT_COLORS: Record<Shift, { bg: string; border: string; label: string }> = {
  OPENING: { bg: '#FFF7ED', border: '#FED7AA', label: '#C2410C' },
  MIDDLE:  { bg: '#FEFCE8', border: '#FDE68A', label: '#92400E' },
  CLOSING: { bg: '#EFF6FF', border: '#BFDBFE', label: '#1E40AF' },
};

const EMPTY_FORM = { shift: 'OPENING' as Shift, title: '', description: '', storeId: '' };

export default function DailyTasks() {
  const { user } = useAuthStore();
  const isDevAdmin = user?.role === 'DEV_ADMIN';
  const qc = useQueryClient();

  const [scopeFilter, setScopeFilter] = useState<string>('global');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<DailyTask | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmSeed, setConfirmSeed] = useState(false);

  const { data: storesData } = useQuery({
    queryKey: ['stores-list'],
    queryFn: () => storesApi.getAll(),
    staleTime: 10 * 60_000,
  });
  const stores: { id: string; name: string }[] = storesData?.data?.data ?? [];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['daily-tasks-admin', scopeFilter],
    queryFn: () => dailyTaskApi.getAll(scopeFilter === 'global' ? 'global' : scopeFilter || undefined),
  });
  const tasks: DailyTask[] = data?.data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: (d: typeof form) => dailyTaskApi.create({ ...d, storeId: d.storeId || undefined }),
    onSuccess: () => { toast.success('Task added'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); closeModal(); },
    onError: () => toast.error('Failed to add task'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, d }: { id: string; d: typeof form }) =>
      dailyTaskApi.update(id, { ...d, storeId: d.storeId || null, description: d.description || null }),
    onSuccess: () => { toast.success('Task updated'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); closeModal(); },
    onError: () => toast.error('Failed to update task'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => dailyTaskApi.delete(id),
    onSuccess: () => { toast.success('Task deleted'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); setDeleteId(null); },
    onError: () => toast.error('Failed to delete task'),
  });

  const seedMutation = useMutation({
    mutationFn: () => dailyTaskApi.seedDefaults(),
    onSuccess: () => { toast.success('Default tasks loaded!'); qc.invalidateQueries({ queryKey: ['daily-tasks-admin'] }); setConfirmSeed(false); },
    onError: (e: any) => { toast.error(e.response?.data?.error || 'Seed failed'); setConfirmSeed(false); },
  });

  function openAdd() {
    setEditTask(null);
    setForm({ ...EMPTY_FORM, storeId: scopeFilter === 'global' ? '' : scopeFilter });
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
    if (editTask) updateMutation.mutate({ id: editTask.id, d: form });
    else createMutation.mutate(form);
  }

  const grouped = SHIFT_ORDER.reduce<Record<Shift, DailyTask[]>>((acc, s) => {
    acc[s] = tasks.filter(t => t.shift === s);
    return acc;
  }, { OPENING: [], MIDDLE: [], CLOSING: [] });

  const totalTasks = tasks.length;

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!deleteId}
        title="Delete Task"
        message="This task will be permanently removed from the checklist."
        confirmLabel="Delete"
        danger
        onConfirm={() => { if (deleteId) deleteMutation.mutate(deleteId); }}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmModal
        open={confirmSeed}
        title="Load Default Tasks"
        message="This will add the standard Lucky Stop checklists (Morning, Midday, Night) as chain-wide tasks. Only works if no global defaults exist yet."
        confirmLabel="Load Defaults"
        onConfirm={() => seedMutation.mutate()}
        onCancel={() => setConfirmSeed(false)}
      />

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.iconWrap}><ListChecks size={20} color="#fff" /></div>
          <div>
            <h1 style={s.title}>Daily Tasks</h1>
            <p style={s.subtitle}>Employee shift checklists — {totalTasks} task{totalTasks !== 1 ? 's' : ''} loaded</p>
          </div>
        </div>
        <div style={s.headerActions}>
          {isDevAdmin && (
            <button style={s.seedBtn} onClick={() => setConfirmSeed(true)}>
              <Sparkles size={14} /> Load Defaults
            </button>
          )}
          <button style={s.addBtn} onClick={openAdd}>
            <Plus size={14} /> Add Task
          </button>
        </div>
      </div>

      {/* Scope filter */}
      <div style={s.filterRow}>
        <label style={s.filterLabel}>Showing tasks for:</label>
        <select style={s.select} value={scopeFilter} onChange={e => setScopeFilter(e.target.value)}>
          <option value="global">🌐 All Stores (Chain-wide)</option>
          {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
      </div>

      {/* Content */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={3} />
      ) : totalTasks === 0 ? (
        <div style={s.emptyState}>
          <div style={s.emptyIcon}>📋</div>
          <div style={s.emptyTitle}>No tasks yet</div>
          <div style={s.emptyText}>
            {isDevAdmin
              ? 'Click "Load Defaults" to populate the standard Lucky Stop checklists, or add tasks manually.'
              : 'No tasks have been configured yet. Contact your administrator.'}
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
                            <span style={s.storeBadge}>🏪 {task.store.name}</span>
                          )}
                        </div>
                        <div style={s.taskActions}>
                          <button style={s.editBtn} onClick={() => openEdit(task)} title="Edit">
                            <Pencil size={13} />
                          </button>
                          <button style={s.deleteBtn} onClick={() => setDeleteId(task.id)} title="Delete">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div style={s.overlay} onClick={closeModal}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h2 style={s.modalTitle}>{editTask ? 'Edit Task' : 'Add Task'}</h2>

            <label style={s.fieldLabel}>Shift</label>
            <select style={s.input} value={form.shift} onChange={e => setForm(f => ({ ...f, shift: e.target.value as Shift }))}>
              {SHIFT_ORDER.map(s => <option key={s} value={s}>{SHIFT_LABELS[s]}</option>)}
            </select>

            <label style={s.fieldLabel}>Title <span style={s.req}>*</span></label>
            <input
              style={s.input}
              value={form.title}
              placeholder="e.g. Coffee & Fountain"
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            />

            <label style={s.fieldLabel}>Description (optional)</label>
            <textarea
              style={{ ...s.input, minHeight: 80, resize: 'vertical' as const, fontFamily: 'inherit' }}
              value={form.description}
              placeholder="Step-by-step details for this task…"
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            />

            <label style={s.fieldLabel}>Store (leave blank for all stores)</label>
            <select style={s.input} value={form.storeId} onChange={e => setForm(f => ({ ...f, storeId: e.target.value }))}>
              <option value="">🌐 All Stores (Chain-wide)</option>
              {stores.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>

            <div style={s.modalFooter}>
              <button style={s.cancelBtn} onClick={closeModal}>Cancel</button>
              <button
                style={s.saveBtn}
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
              >
                {createMutation.isPending || updateMutation.isPending ? 'Saving…' : editTask ? 'Save Changes' : 'Add Task'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { padding: '32px 24px' },

  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 14 },
  iconWrap: { width: 42, height: 42, borderRadius: 11, background: '#1D3557', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#111827' },
  subtitle: { margin: '4px 0 0', fontSize: 14, color: '#5a6472' },
  headerActions: { display: 'flex', gap: 10, alignItems: 'center', flexShrink: 0 },

  seedBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#f3f4f6', border: '1.5px solid #d1d5db', borderRadius: 10, fontSize: 13, fontWeight: 600, color: '#374151', cursor: 'pointer' },
  addBtn: { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#1D3557', border: 'none', borderRadius: 10, fontSize: 13, fontWeight: 700, color: '#fff', cursor: 'pointer' },

  filterRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 },
  filterLabel: { fontSize: 14, fontWeight: 600, color: '#374151', flexShrink: 0 },
  select: { padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111827', background: '#fff', cursor: 'pointer', minWidth: 220 },

  empty: { textAlign: 'center', padding: '60px 0', color: '#5a6472', fontSize: 15 },
  emptyState: { textAlign: 'center', padding: '80px 0' },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#111827', marginBottom: 8 },
  emptyText: { fontSize: 14, color: '#5a6472', lineHeight: 1.6, maxWidth: 480, margin: '0 auto' },

  groups: { display: 'flex', flexDirection: 'column', gap: 20 },
  shiftGroup: { borderRadius: 14, border: '1.5px solid', overflow: 'hidden' },
  shiftHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 18px', borderBottom: '1px solid rgba(0,0,0,0.06)' },
  shiftLabel: { fontSize: 15, fontWeight: 800 },
  shiftCount: { fontSize: 13, fontWeight: 600, opacity: 0.7 },
  shiftEmpty: { padding: '16px 18px', fontSize: 13, color: '#5a6472', fontStyle: 'italic' },

  taskList: { display: 'flex', flexDirection: 'column' },
  taskRow: { display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 18px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#fff' },
  taskNum: { width: 22, height: 22, borderRadius: '50%', background: '#f3f4f6', color: '#5a6472', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 },
  taskBody: { flex: 1, minWidth: 0 },
  taskTitle: { fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2 },
  taskDesc: { fontSize: 13, color: '#5a6472', lineHeight: 1.5 },
  storeBadge: { display: 'inline-block', marginTop: 4, fontSize: 11, fontWeight: 600, color: '#1D3557', background: '#dbeafe', borderRadius: 6, padding: '2px 8px' },
  taskActions: { display: 'flex', gap: 6, flexShrink: 0 },
  editBtn: { background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#374151', display: 'flex', alignItems: 'center' },
  deleteBtn: { background: '#fef2f2', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', color: '#dc2626', display: 'flex', alignItems: 'center' },

  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.2)' },
  modalTitle: { margin: '0 0 20px', fontSize: 18, fontWeight: 800, color: '#111827' },
  fieldLabel: { display: 'block', fontSize: 13, fontWeight: 700, color: '#374151', marginBottom: 6, marginTop: 14 },
  req: { color: '#ef4444' },
  input: { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, color: '#111827', boxSizing: 'border-box' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24 },
  cancelBtn: { padding: '9px 18px', background: '#f3f4f6', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, color: '#374151', cursor: 'pointer' },
  saveBtn: { padding: '9px 18px', background: '#1D3557', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#fff', cursor: 'pointer' },
};
