import { useState, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';
import { printLabels } from '../utils/printLabels';
import { LABEL_PRESETS } from '../data/labelPresets';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  barcode: string | null;
  template: string;
  updatedAt: string;
}

const TEMPLATE_OPTIONS: { value: string; label: string; accent: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black', accent: '#c0392b' },
  { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter', accent: '#1e7a3d' },
  { value: 'SUMMER', label: 'Summer', accent: '#f59e0b' },
];

const TEMPLATE_LABELS: Record<string, string> = Object.fromEntries(
  TEMPLATE_OPTIONS.map(t => [t.value, t.label])
);

export default function Labels() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  const [confirmDelete, setConfirmDelete] = useState<Label | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const nameQuery = formProductName.trim().toLowerCase();
  const suggestions = nameQuery
    ? LABEL_PRESETS.filter(p => p.name.toLowerCase().includes(nameQuery)).slice(0, 8)
    : [];

  function applyPreset(preset: (typeof LABEL_PRESETS)[number]) {
    setFormProductName(preset.name);
    setFormPriceText(preset.priceText);
    setShowSuggestions(false);
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labels'],
    queryFn: labelsApi.getAll,
  });
  const labels: Label[] = data?.data?.data || [];

  const saveMutation = useMutation({
    mutationFn: () =>
      editingLabel
        ? labelsApi.update(editingLabel.id, { productName: formProductName.trim(), priceText: formPriceText.trim(), barcode: formBarcode.trim() || null, template: formTemplate })
        : labelsApi.create({ productName: formProductName.trim(), priceText: formPriceText.trim(), barcode: formBarcode.trim() || null, template: formTemplate }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      toast.success(editingLabel ? 'Label updated' : 'Label added');
      closeModal();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save label'),
  });

  const deleteMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.delete(labelId),
    onSuccess: (_res, labelId) => {
      qc.invalidateQueries({ queryKey: ['labels'] });
      setSelectedIds(prev => { const next = new Set(prev); next.delete(labelId); return next; });
      toast.success('Label removed');
      setConfirmDelete(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to remove label'),
  });

  function openAddModal() {
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormBarcode('');
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowModal(true);
  }

  function openEditModal(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormBarcode(label.barcode || '');
    setFormTemplate(label.template);
    setShowModal(true);
  }

  function duplicateLabel(label: Label) {
    // editingLabel stays null so Save creates a new label instead of updating this one.
    setEditingLabel(null);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormBarcode(label.barcode || '');
    setFormTemplate(label.template);
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormBarcode('');
    setFormTemplate('CLASSIC_RED_BLACK');
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handlePrintSelected() {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0) return;
    printLabels(toPrint);
  }

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmDelete}
        title="Remove Label"
        message={`Remove the label for "${confirmDelete?.productName}"? It will no longer appear in future print batches.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete.id); }}
        onCancel={() => setConfirmDelete(null)}
      />

      {showModal && (
        <div style={m.overlay} onClick={closeModal}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <div style={m.header}>
              <h2 style={m.title}>{editingLabel ? 'Edit Label' : 'Add Label'}</h2>
              <button style={m.closeBtn} onClick={closeModal}>✕</button>
            </div>
            <div style={m.form}>
              <div style={m.label}>Product Name *</div>
              <div style={{ position: 'relative' as const }}>
                <input
                  style={m.input}
                  value={formProductName}
                  onChange={e => { setFormProductName(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  placeholder="e.g. Monster Energy 16oz"
                  maxLength={120}
                  autoComplete="off"
                  autoFocus
                />
                {showSuggestions && suggestions.length > 0 && (
                  <div style={m.sugg}>
                    {suggestions.map(p => (
                      <div key={p.name} style={m.suggRow} onMouseDown={() => applyPreset(p)}>
                        <span style={{ fontWeight: 600 }}>{p.name}</span>
                        <span style={m.suggPrice}>{p.priceText}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={m.label}>Price / Deal Text *</div>
              <input
                style={m.input}
                value={formPriceText}
                onChange={e => setFormPriceText(e.target.value)}
                placeholder='e.g. "$3.99" or "2 for $5"'
                maxLength={40}
              />
              <div style={m.label}>Barcode (optional)</div>
              <input
                style={m.input}
                value={formBarcode}
                onChange={e => setFormBarcode(e.target.value)}
                placeholder="Scan or type the product's UPC/EAN — for order lookups, not tied to the price/deal above"
                maxLength={40}
              />
              <div style={m.label}>Template</div>
              <div style={m.templateRow}>
                {TEMPLATE_OPTIONS.map(t => (
                  <button
                    key={t.value}
                    type="button"
                    style={{ ...m.templateChip, ...(formTemplate === t.value ? m.templateChipActive : {}) }}
                    onClick={() => setFormTemplate(t.value)}
                  >
                    <span style={{ ...m.templateSwatch, background: t.accent }} />
                    {t.label}
                  </button>
                ))}
              </div>
              <div style={m.actions}>
                <button style={m.cancelBtn} onClick={closeModal}>Cancel</button>
                <button
                  style={{ ...m.saveBtn, ...(!formProductName.trim() || !formPriceText.trim() || saveMutation.isPending ? m.saveBtnDim : {}) }}
                  onClick={() => saveMutation.mutate()}
                  disabled={!formProductName.trim() || !formPriceText.trim() || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Label'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.inner}>
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>🏷️ Labels</h1>
            <p style={s.pageSub}>Chain-wide catalog of printable shelf/price tags — one list, every store.</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              style={{ ...s.printBtn, ...(selectedIds.size === 0 ? s.printBtnDim : {}) }}
              onClick={handlePrintSelected}
              disabled={selectedIds.size === 0}
            >
              🖨️ Print Selected ({selectedIds.size})
            </button>
            <button style={s.addBtn} onClick={openAddModal}>+ Add Label</button>
          </div>
        </div>

        {isError ? (
          <ErrorState message="Failed to load labels." onRetry={refetch} />
        ) : isLoading ? (
          <TableSkeleton columns={6} />
        ) : labels.length === 0 ? (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}>🏷️</div>
            <div style={s.emptyTitle}>No labels yet</div>
            <div style={s.emptySub}>Add a label to start building a print batch</div>
          </div>
        ) : (
          <div style={s.tableWrap}>
            <Table style={s.table}>
              <TableHeader>
                <TableRow>
                  {['', 'Product', 'Price / Deal', 'Template', 'Updated', 'Actions'].map(h => (
                    <TableHead key={h} style={s.th}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {labels.map((label, i) => (
                  <TableRow key={label.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                    <TableCell style={s.td}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(label.id)}
                        onChange={() => toggleSelected(label.id)}
                      />
                    </TableCell>
                    <TableCell style={s.td}>
                      <span style={s.itemName}>{label.productName}</span>
                      {label.barcode && <span style={s.barcodeBadge} title={`Barcode: ${label.barcode}`}>|||| {label.barcode}</span>}
                    </TableCell>
                    <TableCell style={s.td}>{label.priceText}</TableCell>
                    <TableCell style={s.td}>{TEMPLATE_LABELS[label.template] || label.template}</TableCell>
                    <TableCell style={s.td}>{new Date(label.updatedAt).toLocaleDateString()}</TableCell>
                    <TableCell style={s.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.editBtn} onClick={() => openEditModal(label)}>Edit</button>
                        <button style={s.duplicateBtn} onClick={() => duplicateLabel(label)}>Duplicate</button>
                        <button style={s.deleteBtn} onClick={() => setConfirmDelete(label)}>Delete</button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  page: { minHeight: '100vh', background: '#f4f6fb', padding: '32px 0' },
  inner: { padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 24 },

  pageHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  pageTitle: { fontSize: 26, fontWeight: 900, color: '#1D3557', margin: 0 },
  pageSub: { color: TEXT_MUTED, marginTop: 4, fontSize: 14 },
  printBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#0f5132', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  printBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#1D3557', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },

  tableWrap: {
    background: '#fff', borderRadius: 14, overflowX: 'auto',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eee',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: '#888', background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle', fontSize: 14 },
  itemName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  barcodeBadge: { display: 'block', fontSize: 11, color: TEXT_MUTED, fontFamily: 'monospace', marginTop: 2 },
  editBtn: {
    background: '#eff6ff', color: '#1D3557', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  duplicateBtn: {
    background: '#f4f4f4', color: '#444', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  deleteBtn: {
    background: '#fff0f0', color: '#c53030', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },

  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: 18, width: '100%', maxWidth: 480,
    margin: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.25)', overflow: 'hidden',
    maxHeight: '90vh', overflowY: 'auto',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 24px', borderBottom: '1px solid #eee',
    position: 'sticky', top: 0, background: '#fff', zIndex: 1,
  },
  title: { margin: 0, fontSize: 20, fontWeight: 800, color: '#1D3557' },
  closeBtn: { background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#888', lineHeight: 1 },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#333', marginTop: 6 },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  templateRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  templateChip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    border: '1.5px solid #ddd', borderRadius: 20,
    padding: '6px 12px', fontSize: 13, fontWeight: 600, color: '#444',
    background: '#fff', cursor: 'pointer',
  },
  templateChipActive: { borderColor: '#1D3557', background: '#eff6ff', color: '#1D3557' },
  templateSwatch: { width: 10, height: 10, borderRadius: 5, display: 'inline-block' },
  sugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
    border: '1.5px solid #e5e7eb', borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
  },
  suggRow: {
    padding: '10px 14px', cursor: 'pointer', display: 'flex',
    justifyContent: 'space-between', alignItems: 'center', fontSize: 14,
    borderBottom: '1px solid #f8fafc', transition: 'background 0.1s',
  },
  suggPrice: { fontSize: 13, color: TEXT_MUTED, marginLeft: 8, whiteSpace: 'nowrap' as const },
  actions: { display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 },
  cancelBtn: {
    background: '#f4f4f4', border: 'none', borderRadius: 10,
    padding: '10px 20px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#444',
  },
  saveBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, padding: '10px 24px', cursor: 'pointer', fontSize: 14, fontWeight: 700,
  },
  saveBtnDim: { opacity: 0.5, cursor: 'not-allowed' },
};
