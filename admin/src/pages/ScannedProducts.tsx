import { useState, useEffect, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { scannedProductApi, orderCategoriesApi } from '../services/api';
import ConfirmModal from '../components/ConfirmModal';
import Modal from '../components/Modal';
import ErrorState from '../components/ErrorState';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/table';
import TableSkeleton from '../components/TableSkeleton';
import { TEXT_MUTED, PRIMARY } from '../lib/theme';
import { Page, PageHeader, Button, Field } from '../components/kit';
import DataTablePagination from '../components/DataTablePagination';
import { Plus, Search } from 'lucide-react';
import { INPUT } from '../lib/theme';
import Glyph from '../components/Glyph';
import { useAuthStore } from '../store/authStore';

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
  manual:        { label: 'Manual',           bg: '#eef2f7', color: PRIMARY },
  openfoodfacts: { label: 'Open Food Facts',  bg: '#eaf7ee', color: '#1e7a3d' },
  pdi:           { label: 'From PDI',         bg: '#fff4e5', color: '#8a5300' },   // named from a store's PDI item list on a scan (2026-11-06)
};


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
  const [approvedCats, setApprovedCats] = useState<string[]>([]);
  const [newCatSuggs, setNewCatSuggs] = useState<string[]>([]);
  const [showNewCatSugg, setShowNewCatSugg] = useState(false);
  const [editingItem, setEditingItem] = useState<ScannedProduct | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editBrand, setEditBrand] = useState('');
  const [editCatSuggs, setEditCatSuggs] = useState<string[]>([]);
  const [showEditCatSugg, setShowEditCatSugg] = useState(false);

  // Debounce the search box before it hits the server-side `q` filter:
  // same 250ms setTimeout/cleanup pattern used elsewhere in admin (OrderList.tsx).
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (showAddModal || editingItem) {
      orderCategoriesApi.getApproved()
        .then(r => setApprovedCats(r.data?.data || []))
        .catch(() => {});
    }
  }, [showAddModal, editingItem]);

  useEffect(() => {
    if (!newCategory.trim()) { setNewCatSuggs([]); return; }
    const q = newCategory.toLowerCase();
    setNewCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowNewCatSugg(true);
  }, [newCategory, approvedCats]);

  useEffect(() => {
    if (!editCategory.trim()) { setEditCatSuggs([]); return; }
    const q = editCategory.toLowerCase();
    setEditCatSuggs(approvedCats.filter(c => c.toLowerCase().includes(q) && c.toLowerCase() !== q).slice(0, 5));
    setShowEditCatSugg(true);
  }, [editCategory, approvedCats]);

  // Every PDI item into the catalog (2026-11-11, HQ): products already here are left as they are
  const role = useAuthStore((st) => st.user?.role);
  const hq = role === 'SUPER_ADMIN' || role === 'DEV_ADMIN';
  const [askFill, setAskFill] = useState(false);
  const [filling, setFilling] = useState(false);
  async function fillFromPdi() {
    setFilling(true);
    try {
      const r = (await scannedProductApi.fillFromPdi()).data.data as { added: number; already: number; leftOut: number };
      toast.success(r.added ? `${r.added.toLocaleString()} products added from the PDI item lists. ${r.already.toLocaleString()} were already here and were left as they are.` : 'Every PDI item is already here.');
      setAskFill(false);
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
    } catch (e: any) { toast.error(e?.response?.data?.error || 'The PDI items could not be added. Try again.'); } finally { setFilling(false); }
  }

  // Pages, filters and picking many (2026-11-11): about 18,000 products since the PDI lists went in, where it showed the 200 most scanned
  const [source, setSource] = useState('');
  const [category, setCategory] = useState('');
  const [scanned, setScanned] = useState('');
  const [sort, setSort] = useState('scans');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [allMatching, setAllMatching] = useState(false);   // every product that matches is picked (its ids fetched when acting)
  const [bulk, setBulk] = useState<'category' | 'delete' | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const filters = { q: debSearch.trim(), source, category, scanned, sort };
  useEffect(() => { setPage(1); setPicked(new Set()); setAllMatching(false); }, [debSearch, source, category, scanned, sort]);
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['scanned-products', filters, page],
    placeholderData: (prev) => prev,
    queryFn: () => scannedProductApi.listPaged({ ...filters, page }).then((r) => r.data.data as {
      items: ScannedProduct[]; total: number; page: number; pages: number; sources: Record<string, number>; categories: { name: string; items: number }[];
    }),
  });
  const products: ScannedProduct[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const pickedCount = allMatching ? total : picked.size;
  const pageAll = products.length > 0 && products.every((p) => allMatching || picked.has(p.id));
  const togglePick = (id: string) => { setAllMatching(false); setPicked((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const togglePage = () => { setAllMatching(false); setPicked((prev) => { const n = new Set(prev); if (pageAll) products.forEach((p) => n.delete(p.id)); else products.forEach((p) => n.add(p.id)); return n; }); };
  async function pickedIds(): Promise<string[]> {
    if (!allMatching) return [...picked];
    const r = (await scannedProductApi.idsMatching(filters)).data.data as { ids: string[]; capped: boolean };
    if (r.capped) toast(`Only the first ${r.ids.length.toLocaleString()} are changed at once. Run it again for the rest.`);
    return r.ids;
  }
  async function runBulk(value?: string) {
    if (!bulk) return;
    setBulkBusy(true);
    try {
      const ids = await pickedIds();
      if (bulk === 'category') {
        const r = (await scannedProductApi.bulkCategory(ids, value?.trim() ? value.trim() : null)).data.data as { updated: number };
        toast.success(`${r.updated.toLocaleString()} ${r.updated === 1 ? 'product' : 'products'}: category ${value?.trim() ? `"${value.trim()}"` : 'cleared'}.`);
      } else {
        const r = (await scannedProductApi.bulkDelete(ids)).data.data as { removed: number };
        toast.success(`${r.removed.toLocaleString()} ${r.removed === 1 ? 'product' : 'products'} removed.`);
      }
      setBulk(null); setPicked(new Set()); setAllMatching(false);
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
    } catch (e: any) { toast.error(e?.response?.data?.error || 'Nothing was changed. Try again.'); } finally { setBulkBusy(false); }
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

  const updateMutation = useMutation({
    mutationFn: (data: { id: string; name: string; category?: string; brand?: string }) =>
      scannedProductApi.update(data.id, { name: data.name, category: data.category || null, brand: data.brand || null }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['scanned-products'] });
      toast.success('Product updated');
      closeEditModal();
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update product'),
  });

  function openEditModal(item: ScannedProduct) {
    setEditingItem(item);
    setEditName(item.name);
    setEditCategory(item.category || '');
    setEditBrand(item.brand || '');
  }

  function closeEditModal() {
    setEditingItem(null);
    setEditName(''); setEditCategory(''); setEditBrand('');
    setShowEditCatSugg(false);
  }

  function submitEdit() {
    if (!editingItem) return;
    const name = editName.trim();
    if (!name) return;
    const category = editCategory.trim();
    if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
      orderCategoriesApi.submitNew(category).catch(() => {});
    }
    updateMutation.mutate({ id: editingItem.id, name, category: category || undefined, brand: editBrand.trim() || undefined });
  }

  function closeAddModal() {
    setShowAddModal(false);
    setNewBarcode(''); setNewName(''); setNewCategory(''); setNewBrand('');
  }

  function submitAdd() {
    const barcode = newBarcode.trim();
    const name = newName.trim();
    if (!barcode || !name) return;
    const category = newCategory.trim();
    if (category && !approvedCats.some(c => c.toLowerCase() === category.toLowerCase())) {
      orderCategoriesApi.submitNew(category).catch(() => {});
    }
    saveMutation.mutate({
      barcode, name,
      category: category || undefined,
      brand: newBrand.trim() || undefined,
    });
  }

  function handleDelete(item: ScannedProduct) { setConfirmItem(item); }


  return (
    <Page>
      <ConfirmModal
        open={askFill}
        title="Add every PDI item?"
        message="Every product in the stores' PDI item lists that is not here yet is added, with PDI's name (and a category where its department is one kind of product, like Candy or Tobacco). Products already here are left exactly as they are. Lottery tickets and the stores' own short codes are left out. No shelf labels are made. New items from later PDI uploads are added by themselves."
        confirmLabel="Add them"
        busy={filling}
        onConfirm={() => void fillFromPdi()}
        onCancel={() => setAskFill(false)}
      />
      <ConfirmModal
        open={!!confirmItem}
        title="Remove this product?"
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
        <Modal title="Add product" onClose={closeAddModal} busy={saveMutation.isPending} maxWidth={480}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Barcode" htmlFor="sp-add-barcode" required>
              <input
                id="sp-add-barcode"
                className="ui-input"
                style={INPUT}
                value={newBarcode}
                onChange={e => setNewBarcode(e.target.value)}
                placeholder="e.g. 012345678905"
                maxLength={50}
                autoFocus
              />
            </Field>
            <Field label="Name" htmlFor="sp-add-name" required>
              <input
                id="sp-add-name"
                className="ui-input"
                style={INPUT}
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Monster Energy 16oz"
                maxLength={200}
              />
            </Field>
            <Field label="Category" htmlFor="sp-add-category">
              <div style={{ position: 'relative' as const }}>
                <input
                  id="sp-add-category"
                  className="ui-input"
                  style={INPUT}
                  value={newCategory}
                  onChange={e => { setNewCategory(e.target.value); setShowNewCatSugg(true); }}
                  onFocus={() => setShowNewCatSugg(newCatSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowNewCatSugg(false), 150)}
                  placeholder="Optional, e.g. Drinks"
                  maxLength={100}
                  autoComplete="off"
                />
                {showNewCatSugg && newCatSuggs.length > 0 && (
                  <div style={m.sugg}>
                    {newCatSuggs.map(c => (
                      <div key={c} style={m.suggRow} onMouseDown={() => { setNewCategory(c); setShowNewCatSugg(false); }}>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Brand" htmlFor="sp-add-brand">
              <input
                id="sp-add-brand"
                className="ui-input"
                style={INPUT}
                value={newBrand}
                onChange={e => setNewBrand(e.target.value)}
                placeholder="Optional, e.g. Monster"
                maxLength={100}
              />
            </Field>
            <div style={m.hint}>
              If this barcode is already in the catalog, saving will update its name, category and brand instead of creating a duplicate.
            </div>
            <div style={m.actions}>
              <Button onClick={closeAddModal} disabled={saveMutation.isPending}>Cancel</Button>
              <Button
                variant="primary"
                onClick={submitAdd}
                disabled={!newBarcode.trim() || !newName.trim() || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Saving…' : 'Save product'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editingItem && (
        <Modal title="Edit product" onClose={closeEditModal} busy={updateMutation.isPending} maxWidth={480}>
          <div style={{ display: 'grid', gap: 12 }}>
            <Field label="Barcode" htmlFor="sp-edit-barcode" hint="Barcode can't be changed here. Delete and re-add to fix a wrong barcode.">
              <input id="sp-edit-barcode" className="ui-input" style={INPUT} value={editingItem.barcode} readOnly disabled />
            </Field>
            <Field label="Name" htmlFor="sp-edit-name" required>
              <input
                id="sp-edit-name"
                className="ui-input"
                style={INPUT}
                value={editName}
                onChange={e => setEditName(e.target.value)}
                placeholder="e.g. Monster Energy 16oz"
                maxLength={200}
                autoFocus
              />
            </Field>
            <Field label="Category" htmlFor="sp-edit-category">
              <div style={{ position: 'relative' as const }}>
                <input
                  id="sp-edit-category"
                  className="ui-input"
                  style={INPUT}
                  value={editCategory}
                  onChange={e => { setEditCategory(e.target.value); setShowEditCatSugg(true); }}
                  onFocus={() => setShowEditCatSugg(editCatSuggs.length > 0)}
                  onBlur={() => setTimeout(() => setShowEditCatSugg(false), 150)}
                  placeholder="Optional, e.g. Drinks"
                  maxLength={100}
                  autoComplete="off"
                />
                {showEditCatSugg && editCatSuggs.length > 0 && (
                  <div style={m.sugg}>
                    {editCatSuggs.map(c => (
                      <div key={c} style={m.suggRow} onMouseDown={() => { setEditCategory(c); setShowEditCatSugg(false); }}>
                        <span>{c}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            <Field label="Brand" htmlFor="sp-edit-brand">
              <input
                id="sp-edit-brand"
                className="ui-input"
                style={INPUT}
                value={editBrand}
                onChange={e => setEditBrand(e.target.value)}
                placeholder="Optional, e.g. Monster"
                maxLength={100}
              />
            </Field>
            <div style={m.actions}>
              <Button onClick={closeEditModal} disabled={updateMutation.isPending}>Cancel</Button>
              <Button
                variant="primary"
                onClick={submitEdit}
                disabled={!editName.trim() || updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving…' : 'Save changes'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Header */}
      <PageHeader
        title="Scanned products"
        description="Chain-wide barcode catalog (name, category, brand): products staff scanned, and every item in the stores' PDI lists." 
        actions={
          <>
            <div style={{ position: 'relative', width: 260 }}>
              <Search size={15} aria-hidden="true" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }} />
              <input
                className="ui-input"
                style={{ ...INPUT, paddingLeft: 32 }}
                aria-label="Search by product name or barcode"
                placeholder="Search by name or barcode…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {hq && <Button onClick={() => setAskFill(true)} disabled={filling}>{filling ? 'Adding...' : 'Add all PDI items'}</Button>}
            <Button variant="primary" icon={<Plus />} onClick={() => setShowAddModal(true)}>Add product</Button>
          </>
        }
      />

      {/* Filters (2026-11-11) */}
      <div style={s.filterBar}>
        <select aria-label="Where it came from" style={s.filterSelect} value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Every source</option>
          {Object.entries(SOURCE_META).map(([k, v]) => <option key={k} value={k}>{v.label}{data?.sources?.[k] != null ? ` (${data.sources[k].toLocaleString()})` : ''}</option>)}
        </select>
        <select aria-label="Category" style={s.filterSelect} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Every category</option>
          {(data?.categories ?? []).map((c) => <option key={c.name} value={c.name}>{c.name === '__none__' ? 'No category' : c.name} ({c.items.toLocaleString()})</option>)}
        </select>
        <select aria-label="Scanned" style={s.filterSelect} value={scanned} onChange={(e) => setScanned(e.target.value)}>
          <option value="">Scanned or not</option>
          <option value="yes">Scanned by staff</option>
          <option value="never">Never scanned</option>
        </select>
        <select aria-label="Sort" style={s.filterSelect} value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="scans">Sort: most scanned</option>
          <option value="newest">Sort: newest</option>
          <option value="name">Sort: name</option>
        </select>
      </div>

      {/* Content */}
      {isError ? (
        <ErrorState message="Failed to load scanned products." onRetry={refetch} />
      ) : isLoading && !data ? (
        <TableSkeleton columns={8} />
      ) : products.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}><Glyph e="📦" size={28} color="#5a6472" /></div>
          <div style={s.emptyTitle}>{search || source || category || scanned ? 'No matching products' : 'No scanned products yet'}</div>
          <div style={s.emptySub}>
            {search || source || category || scanned ? 'Try a different search or fewer filters' : 'Products appear here as managers scan barcodes, and from the stores\' PDI lists'}
          </div>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <div style={s.pickBar} aria-live="polite">
            <span style={{ marginRight: 'auto' }}>
              {pickedCount ? <b>{pickedCount.toLocaleString()} picked</b> : `${total.toLocaleString()} ${total === 1 ? 'product' : 'products'}`}{isFetching ? ' (updating...)' : ''}
              {pageAll && !allMatching && total > products.length && (
                <> · <button type="button" style={s.linkBtn} onClick={() => setAllMatching(true)}>Pick all {total.toLocaleString()} that match</button></>
              )}
            </span>
            {pickedCount > 0 && (
              <>
                <Button size="sm" onClick={() => setBulk('category')} disabled={bulkBusy}>Set category</Button>
                <Button size="sm" onClick={() => setBulk('delete')} disabled={bulkBusy}>Remove</Button>
                <Button size="sm" onClick={() => { setPicked(new Set()); setAllMatching(false); }}>Clear</Button>
              </>
            )}
          </div>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                <TableHead style={{ ...s.th, width: 36 }}><input type="checkbox" aria-label={pageAll ? 'Unpick every product on this page' : 'Pick every product on this page'} checked={pageAll} onChange={togglePage} /></TableHead>
                {['Name', 'Category', 'Barcode', 'Source', 'Scans', 'Last scanned', ''].map(h => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p, i) => {
                const meta = SOURCE_META[p.source] || { label: p.source, bg: '#f1f3f6', color: '#4b5563' };
                return (
                  <TableRow key={p.id} data-testid="scanned-row" style={{ background: i % 2 === 0 ? '#fff' : '#f7f8fa' }}>
                    <TableCell style={s.td}><input type="checkbox" aria-label={`Pick ${p.name}`} checked={allMatching || picked.has(p.id)} onChange={() => togglePick(p.id)} /></TableCell>
                    <TableCell style={{ ...s.td, whiteSpace: 'normal' }}><span style={s.itemName}>{p.name}</span>{p.brand ? <span style={{ display: 'block', fontSize: 12, color: TEXT_MUTED }}>{p.brand}</span> : null}</TableCell>
                    <TableCell style={s.td}>{p.category || <span style={{ color: TEXT_MUTED }}>None</span>}</TableCell>
                    <TableCell style={{ ...s.td, fontFamily: 'monospace', fontSize: 13 }}>{p.barcode}</TableCell>
                    <TableCell style={s.td}>
                      <span style={{ ...s.sourceBadge, background: meta.bg, color: meta.color }}>{meta.label}</span>
                    </TableCell>
                    <TableCell style={s.td}>{p.scanCount.toLocaleString()}</TableCell>
                    <TableCell style={s.td}>{p.scanCount === 0 ? <span style={{ color: TEXT_MUTED }}>Never scanned</span> : new Date(p.lastScannedAt).toLocaleDateString()}</TableCell>
                    <TableCell style={s.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button style={s.editBtn} onClick={() => openEditModal(p)} aria-label={`Edit ${p.name}`}>Edit</button>
                        <button style={s.deleteBtn} onClick={() => handleDelete(p)} disabled={deletingId === p.id} aria-label={`Delete ${p.name}`}>
                          {deletingId === p.id ? '…' : 'Delete'}
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <DataTablePagination page={data?.page ?? 1} totalPages={data?.pages ?? 1} onPrevious={() => setPage((p) => Math.max(1, p - 1))} onNext={() => setPage((p) => p + 1)} />
        </div>
      )}
      <ConfirmModal
        open={bulk === 'category'}
        title={`Set the category of ${pickedCount.toLocaleString()} ${pickedCount === 1 ? 'product' : 'products'}`}
        message="The category the order list, stock requests and Labels use for these products. Leave it empty for none."
        withInput inputLabel="Category" inputPlaceholder="e.g. Candy"
        confirmLabel="Set it" busy={bulkBusy}
        onConfirm={(v) => void runBulk(v)} onCancel={() => setBulk(null)}
      />
      <ConfirmModal
        open={bulk === 'delete'}
        title={`Remove ${pickedCount.toLocaleString()} ${pickedCount === 1 ? 'product' : 'products'}?`}
        message="The next scan of one of them asks whoever scans it to name it again (a PDI item comes back with the next PDI upload). Shelf labels are not touched."
        confirmLabel="Remove" danger busy={bulkBusy}
        onConfirm={() => void runBulk()} onCancel={() => setBulk(null)}
      />
    </Page>
  );
}

const s: Record<string, CSSProperties> = {
  filterBar: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 },
  filterSelect: { ...INPUT, width: 'auto', flex: '1 1 170px', minWidth: 0, maxWidth: '100%' },
  pickBar: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '10px 14px', borderBottom: '1px solid #e4e7ec', fontSize: 13, color: TEXT_MUTED },
  linkBtn: { background: 'none', border: 'none', padding: 0, font: 'inherit', color: PRIMARY, fontWeight: 700, cursor: 'pointer' },
  tableWrap: {
    background: '#fff', borderRadius: 12, overflowX: 'auto',
    boxShadow: '0 1px 2px rgba(16, 24, 40, 0.05)', border: '1px solid #e4e7ec',
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: {
    padding: '10px 14px', textAlign: 'left',
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
    color: TEXT_MUTED, background: '#f7f8fa', borderBottom: '1px solid #e4e7ec',
  },
  td: { padding: '13px 14px', borderBottom: '1px solid #f1f3f6', verticalAlign: 'middle', fontSize: 14 },
  itemName: { fontWeight: 700, fontSize: 14, color: PRIMARY, display: 'block', minWidth: 160 },
  sourceBadge: { borderRadius: 8, padding: '3px 10px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' },
  deleteBtn: {
    background: '#fdf2f2', color: '#c42130', border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },
  editBtn: {
    background: '#eef2f7', color: PRIMARY, border: 'none',
    borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 14, fontWeight: 600,
  },

  emptyBox: {
    background: '#fff', borderRadius: 12, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: PRIMARY },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};

const m: Record<string, CSSProperties> = {
  hint: { fontSize: 12, color: TEXT_MUTED, lineHeight: 1.5 },
  actions: { display: 'flex', gap: 8, justifyContent: 'flex-end' },
  sugg: {
    position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff',
    border: '1.5px solid #e4e7ec', borderTop: 'none', borderRadius: '0 0 10px 10px',
    zIndex: 10, boxShadow: '0 8px 20px rgba(0,0,0,0.1)', maxHeight: 220, overflowY: 'auto',
  },
  suggRow: {
    padding: '10px 14px', cursor: 'pointer', fontSize: 14,
    borderBottom: '1px solid #f7f8fa',
  },
};
