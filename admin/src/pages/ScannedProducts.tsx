import { useState, useEffect, useMemo, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { scannedProductApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED } from '../lib/theme';

interface ScannedProduct {
  id: string;
  barcode: string;
  name: string;
  category: string | null;
  brand: string | null;
  source: string;
  scanCount: number;
  lastScannedAt: string;
}

const SOURCE_META: Record<string, { label: string; bg: string; color: string }> = {
  manual:        { label: 'Manual',           bg: '#e8f0fe', color: '#1D3557' },
  openfoodfacts: { label: 'Open Food Facts',  bg: '#eaf7ee', color: '#1e7a3d' },
};

// A category with more than this many items collapses to a preview with a
// "Show all" expander, so the page isn't dominated by whichever category
// happens to have the most entries — matches the same pattern used in
// mobile's Browse tab (mobile/app/(manager)/catalog.tsx).
const CATEGORY_PREVIEW_COUNT = 5;

export default function ScannedProducts() {
  const qc = useQueryClient();
  const [search, setSearch]         = useState('');
  const [debSearch, setDebSearch]   = useState('');
  const [confirmItem, setConfirmItem] = useState<ScannedProduct | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBarcode, setNewBarcode]   = useState('');
  const [newName, setNewName]         = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [newBrand, setNewBrand]       = useState('');

  // Debounce the search box before it hits the server-side `q` filter —
  // same 250ms setTimeout/cleanup pattern used elsewhere in admin (OrderList.tsx).
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['scanned-products', debSearch],
    queryFn: () => scannedProductApi.list(debSearch.trim() || undefined),
  });
  const products: ScannedProduct[] = data?.data?.data || [];

  const grouped = useMemo(() => {
    const map: Record<string, ScannedProduct[]> = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorized';
      (map[cat] = map[cat] || []).push(p);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [products]);

  function toggleExpanded(cat: string) {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      return next;
    });
  }

  const deleteMutation = useMutation({
    mutationFn: (id: string) => scannedProductApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
      toast.success('Product removed from catalog');
      setDeletingId(null);
    },
    onError: (e: any) => { toast.error(e.response?.data?.error || 'Failed to remove product'); setDeletingId(null); },
  });

  const saveMutation = useMutation({
    mutationFn: (data: { barcode: string; name: string; category?: string; brand?: string }) => scannedProductApi.save(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
      toast.success('Product saved to catalog');
      closeAddModal();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to save product'),
  });

  function closeAddModal() {
    setShowAddModal(false);
    setNewBarcode(''); setNewName(''); setNewCategory(''); setNewBrand('');
  }

  function submitAdd() {
    const barcode = newBarcode.trim();
    const name = newName.trim();
    if (!barcode || !name) return;
    saveMutation.mutate({
      barcode, name,
      category: newCategory.trim() || undefined,
      brand: newBrand.trim() || undefined,
    });
  }

  function handleDelete(item: ScannedProduct) { setConfirmItem(item); }

  if (isError) return <div style={{ padding: 32 }}><ErrorState message="Failed to load scanned products." onRetry={refetch} /></div>;

  return (
    <div style={s.page}>
      <ConfirmModal
        open={!!confirmItem}
        title="Remove Product"
        message={`Remove "${confirmItem?.name}" (barcode ${confirmItem?.barcode}) from the catalog? The next scan of this barcode will prompt whoever scans it to name it again.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (confirmItem) { setDeletingId(confirmItem.id); deleteMutation.mutate(confirmItem.id); }
          setConfirmItem(null);
        }}
        onCancel={() => setConfirmItem(null)}
      />

      {showAddModal && (
        <div style={m.overlay} onClick={closeAddModal}>
          <div style={m.modal} onClick={e => e.stopPropagation()}>
            <div style={m.header}>
              <h2 style={m.title}>Add Product</h2>
              <button style={m.closeBtn} onClick={closeAddModal}>✕</button>
            </div>
            <div style={m.form}>
              <div style={m.label}>Barcode *</div>
              <input
                style={m.input}
                value={newBarcode}
                onChange={e => setNewBarcode(e.target.value)}
                placeholder="e.g. 012345678905"
                maxLength={50}
                autoFocus
              />
              <div style={m.label}>Name *</div>
              <input
                style={m.input}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Monster Energy 16oz"
                maxLength={200}
              />
              <div style={m.label}>Category</div>
              <input
                style={m.input}
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="Optional - e.g. Drinks"
                maxLength={100}
              />
              <div style={m.label}>Brand</div>
              <input
                style={m.input}
                value={newBrand}
                onChange={e => setNewBrand(e.target.value)}
                placeholder="Optional - e.g. Monster"
                maxLength={100}
              />
              <div style={m.hint}>
                If this barcode is already in the catalog, saving will update its name/category/brand instead of creating a duplicate.
              </div>
              <div style={m.actions}>
                <button style={m.cancelBtn} onClick={closeAddModal}>Cancel</button>
                <button
                  style={{ ...m.saveBtn, ...(!newBarcode.trim() || !newName.trim() || saveMutation.isPending ? m.saveBtnDim : {}) }}
                  onClick={submitAdd}
                  disabled={!newBarcode.trim() || !newName.trim() || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save Product'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={s.inner}>

        {/* Header */}
        <div style={s.pageHeader}>
          <div>
            <h1 style={s.pageTitle}>📦 Scanned Products</h1>
            <p style={s.pageSub}>
              Chain-wide barcode → name/category/brand catalog built up by managers scanning products on mobile
              {!isLoading && ` · ${products.length}${products.length === 200 ? '+' : ''} shown`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={s.searchWrap}>
              <span style={s.searchIcon}>🔍</span>
              <input
                style={s.searchInput}
                placeholder="Search by product name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button style={s.addBtn} onClick={() => setShowAddModal(true)}>+ Add Product</button>
          </div>
        </div>

        {/* Content */}
        {isLoading ? (
          <TableSkeleton columns={7} />
        ) : products.length === 0 ? (
          <div style={s.emptyBox}>
            <div style={s.emptyIcon}>📦</div>
            <div style={s.emptyTitle}>{search ? 'No matching products' : 'No scanned products yet'}</div>
            <div style={s.emptySub}>
              {search ? 'Try a different search term' : 'Products appear here as managers scan barcodes while building order lists on mobile'}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {grouped.map(([cat, catItems]) => {
              const isExpanded = expandedCats.has(cat);
              const visibleItems = isExpanded ? catItems : catItems.slice(0, CATEGORY_PREVIEW_COUNT);
              const hiddenCount = catItems.length - visibleItems.length;
              return (
                <div key={cat} style={s.tableWrap}>
                  <div style={s.catHeader}>
                    <span style={s.catName}>{cat}</span>
                    <span style={s.catBadge}>{catItems.length}</span>
                  </div>
                  <Table style={s.table}>
                    <TableHeader>
                      <TableRow>
                        {['Barcode', 'Name', 'Brand', 'Source', 'Scans', 'Last Scanned', ''].map(h => (
                          <TableHead key={h} style={s.th}>{h}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleItems.map((p, i) => {
                        const meta = SOURCE_META[p.source] || { label: p.source, bg: '#f3f4f6', color: '#4b5563' };
                        return (
                          <TableRow key={p.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                            <TableCell style={{ ...s.td, fontFamily: 'monospace', fontSize: 13 }}>{p.barcode}</TableCell>
                            <TableCell style={s.td}><span style={s.itemName}>{p.name}</span></TableCell>
                            <TableCell style={s.td}>{p.brand || ' - '}</TableCell>
                            <TableCell style={s.td}>
                              <span style={{ ...s.sourceBadge, background: meta.bg, color: meta.color }}>{meta.label}</span>
                            </TableCell>
                            <TableCell style={s.td}>{p.scanCount.toLocaleString()}</TableCell>
                            <TableCell style={s.td}>{new Date(p.lastScannedAt).toLocaleDateString()}</TableCell>
                            <TableCell style={s.td}>
                              <button
                                style={s.deleteBtn}
                                onClick={() => handleDelete(p)}
                                disabled={deletingId === p.id}
                              >
                                {deletingId === p.id ? '…' : 'Delete'}
                              </button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  {(hiddenCount > 0 || (isExpanded && catItems.length > CATEGORY_PREVIEW_COUNT)) && (
                    <button style={s.showMoreBtn} onClick={() => toggleExpanded(cat)}>
                      {hiddenCount > 0 ? `Show all ${catItems.length} in ${cat}` : 'Show fewer'}
                    </button>
                  )}
                </div>
              );
            })}
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

  searchWrap: { position: 'relative', display: 'flex', alignItems: 'center' },
  searchIcon: { position: 'absolute', left: 12, fontSize: 14, pointerEvents: 'none' },
  searchInput: {
    paddingLeft: 36, paddingRight: 14, paddingTop: 9, paddingBottom: 9,
    borderRadius: 10, border: '1.5px solid #e5e7eb',
    fontSize: 15, background: '#fff', color: '#111827', minWidth: 240,
    outline: 'none',
  },
  addBtn: {
    padding: '10px 16px', borderRadius: 10, background: '#1D3557', border: 'none',
    color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  },

  tableWrap: {
    background: '#fff', borderRadius: 14, overflowX: 'auto',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)', border: '1px solid #eee',
  },
  catHeader: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '12px 16px', borderBottom: '1px solid #eee',
  },
  catName: { fontSize: 14, fontWeight: 800, color: '#1D3557', textTransform: 'uppercase', letterSpacing: 0.4 },
  catBadge: {
    fontSize: 12, fontWeight: 700, color: '#1D3557', background: '#1D355718',
    borderRadius: 10, padding: '2px 9px',
  },
  showMoreBtn: {
    width: '100%', padding: '11px 16px', background: '#f9f9fc', border: 'none',
    borderTop: '1px solid #eee', color: '#1D3557', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: TEXT_MUTED, background: '#f9f9fc', borderBottom: '1px solid #eee',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f0f0f5', verticalAlign: 'middle', fontSize: 14 },
  itemName: { fontWeight: 700, fontSize: 14, color: '#1D3557', display: 'block', minWidth: 160 },
  sourceBadge: { borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
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
  closeBtn: {
    background: 'none', border: 'none', fontSize: 18,
    cursor: 'pointer', color: TEXT_MUTED, lineHeight: 1,
  },
  form: { padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
  label: { fontSize: 13, fontWeight: 700, color: '#333', marginTop: 6 },
  input: {
    border: '1.5px solid #ddd', borderRadius: 10,
    padding: '10px 14px', fontSize: 15, outline: 'none', width: '100%',
    boxSizing: 'border-box' as const,
  },
  hint: { fontSize: 12, color: TEXT_MUTED, marginTop: 6, lineHeight: 1.5 },
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
