import { useState, useMemo, Fragment, CSSProperties } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { labelsApi } from '../services/api';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table';
import TableSkeleton from './TableSkeleton';
import ErrorState from './ErrorState';
import { TEXT_MUTED } from '../lib/theme';
import { LabelPrintStatus, STATUS_LABEL, STATUS_COLOR, STATUS_BG } from '../utils/labelStatus';

const UNCATEGORIZED = '__uncategorized__';

interface CoverageStore { id: string; name: string; }
interface CoverageEntry { storeId: string; storeLabelId: string | null; status: LabelPrintStatus; priceText: string | null; hasOverride: boolean; }
interface CoverageLabel {
  id: string; productName: string; category: string | null; basePriceText: string; dealText: string | null;
  addedCount: number; coverage: CoverageEntry[];
}

// Cross-store view: one row per catalog item, showing how many of the chain's
// stores have it and — expanded — exactly which ones and in what state. The
// "Push to All" button closes the gap that made adding a new item to every
// store a 12-trip manual chore through the By Store dropdown.
export default function CoverageView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['labels-coverage'],
    queryFn: labelsApi.getCoverage,
  });
  const stores: CoverageStore[] = data?.data?.data?.stores || [];
  const labels: CoverageLabel[] = data?.data?.data?.labels || [];
  const totalStores = stores.length;

  const filtered = useMemo(() => labels.filter(l => {
    if (search.trim() && !l.productName.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (categoryFilter === UNCATEGORIZED) {
      if (l.category) return false;
    } else if (categoryFilter && l.category !== categoryFilter) {
      return false;
    }
    return true;
  }), [labels, search, categoryFilter]);

  const availableCategories = Array.from(new Set(labels.map(l => l.category).filter((c): c is string => !!c))).sort();
  const hasUncategorized = labels.some(l => !l.category);

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ['labels-coverage'] });
    qc.invalidateQueries({ queryKey: ['store-labels'] });
  }

  const pushMutation = useMutation({
    mutationFn: (labelId: string) => labelsApi.pushToAllStores(labelId),
    onSuccess: (res) => {
      const added = res.data?.data?.added ?? 0;
      invalidateAll();
      toast.success(added > 0 ? `Added to ${added} store${added === 1 ? '' : 's'}` : 'Already in every store');
    },
    onError: () => toast.error('Failed to push to all stores'),
  });

  const addOneMutation = useMutation({
    mutationFn: ({ labelId, storeId }: { labelId: string; storeId: string }) => labelsApi.addToStore(labelId, storeId),
    onSuccess: () => {
      invalidateAll();
      toast.success('Added at base price');
    },
    onError: () => toast.error('Failed to add'),
  });

  function toggleExpanded(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  if (isError) return <ErrorState message="Failed to load coverage." onRetry={refetch} />;
  if (isLoading) return <TableSkeleton columns={5} />;

  return (
    <div style={s.wrap}>
      {labels.length > 0 && (
        <div style={s.filterRow}>
          <input
            style={s.searchInput}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by product name…"
          />
          {(availableCategories.length > 0 || hasUncategorized) && (
            <select style={s.filterSelect} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
              <option value="">All Categories</option>
              {availableCategories.map(c => <option key={c} value={c}>{c}</option>)}
              {hasUncategorized && <option value={UNCATEGORIZED}>Uncategorized</option>}
            </select>
          )}
        </div>
      )}

      {labels.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🏷️</div>
          <div style={s.emptyTitle}>No labels yet</div>
          <div style={s.emptySub}>Add a label from the Catalog tab first</div>
        </div>
      ) : filtered.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>🔍</div>
          <div style={s.emptyTitle}>No labels match your filters</div>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <Table style={s.table}>
            <TableHeader>
              <TableRow>
                {['Product', 'Category', 'Base Price', 'Coverage', 'Actions'].map(h => (
                  <TableHead key={h} style={s.th}>{h}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((label, i) => {
                const isExpanded = expanded.has(label.id);
                const missing = totalStores - label.addedCount;
                const fullyCovered = missing <= 0;
                const isPushingThis = pushMutation.isPending && pushMutation.variables === label.id;
                return (
                  <Fragment key={label.id}>
                    <TableRow style={{ background: i % 2 === 0 ? '#fff' : '#f9f9fc' }}>
                      <TableCell style={s.td}>
                        <button style={s.expandBtn} onClick={() => toggleExpanded(label.id)} aria-label={isExpanded ? 'Collapse' : 'Expand'}>
                          {isExpanded ? '▾' : '▸'}
                        </button>
                        <span style={s.itemName}>{label.productName}</span>
                      </TableCell>
                      <TableCell style={s.td}>
                        {label.category ? label.category : <span style={{ color: TEXT_MUTED }}> - </span>}
                      </TableCell>
                      <TableCell style={s.td}>
                        ${label.basePriceText}
                        {label.dealText && <span style={s.dealBadge}>{label.dealText}</span>}
                      </TableCell>
                      <TableCell style={s.td}>
                        <span style={{ ...s.coverageBadge, ...(fullyCovered ? s.coverageFull : s.coveragePartial) }}>
                          {label.addedCount}/{totalStores} stores
                        </span>
                      </TableCell>
                      <TableCell style={s.td}>
                        {fullyCovered ? (
                          <span style={{ color: TEXT_MUTED, fontSize: 13 }}>Everywhere</span>
                        ) : (
                          <button style={s.pushBtn} disabled={isPushingThis} onClick={() => pushMutation.mutate(label.id)}>
                            {isPushingThis ? 'Pushing…' : `Push to All (+${missing})`}
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                    {isExpanded && (
                      <TableRow>
                        <TableCell style={s.expandedCell} colSpan={5}>
                          <div style={s.chipRow}>
                            {label.coverage.map(c => {
                              const store = stores.find(st => st.id === c.storeId);
                              return (
                                <div key={c.storeId} style={{ ...s.chip, borderColor: STATUS_COLOR[c.status], background: STATUS_BG[c.status] }}>
                                  <span style={s.chipStoreName}>{store?.name || c.storeId}</span>
                                  <span style={{ ...s.chipStatus, color: STATUS_COLOR[c.status] }}>{STATUS_LABEL[c.status]}</span>
                                  {c.status !== 'not_added' ? (
                                    <span style={s.chipPrice}>${c.priceText}{c.hasOverride ? ' •' : ''}</span>
                                  ) : (
                                    <button
                                      style={s.chipAddBtn}
                                      disabled={addOneMutation.isPending && addOneMutation.variables?.storeId === c.storeId}
                                      onClick={() => addOneMutation.mutate({ labelId: label.id, storeId: c.storeId })}
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', gap: 16 },
  filterRow: { display: 'flex', gap: 10, flexWrap: 'wrap' as const, alignItems: 'center' },
  searchInput: {
    flex: '1 1 240px', minWidth: 200, border: '1.5px solid #ddd', borderRadius: 10,
    padding: '9px 14px', fontSize: 14, outline: 'none',
  },
  filterSelect: {
    border: '1.5px solid #ddd', borderRadius: 10, padding: '9px 12px',
    fontSize: 14, background: '#fff', color: '#333', cursor: 'pointer',
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
  dealBadge: { display: 'block', fontSize: 12, fontWeight: 600, color: '#b7791f', marginTop: 2 },

  expandBtn: {
    background: 'none', border: 'none', cursor: 'pointer', color: TEXT_MUTED,
    fontSize: 12, marginRight: 8, width: 14, display: 'inline-block',
  },

  coverageBadge: { fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: '4px 10px' },
  coverageFull: { color: '#0f5132', background: '#f0fdf4' },
  coveragePartial: { color: '#b7791f', background: '#fffbeb' },

  pushBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
  },

  expandedCell: { padding: '12px 14px 16px 40px', background: '#fafbfc', borderBottom: '1px solid #f0f0f5' },
  chipRow: { display: 'flex', flexWrap: 'wrap' as const, gap: 8 },
  chip: {
    display: 'flex', alignItems: 'center', gap: 8, border: '1.5px solid',
    borderRadius: 10, padding: '6px 10px', fontSize: 12.5,
  },
  chipStoreName: { fontWeight: 700, color: '#1D3557' },
  chipStatus: { fontWeight: 700 },
  chipPrice: { color: TEXT_MUTED },
  chipAddBtn: {
    background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 6, padding: '3px 9px', cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
  },

  emptyBox: {
    background: '#fff', borderRadius: 16, padding: 60,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, textAlign: 'center',
  },
  emptyIcon: { fontSize: 56 },
  emptyTitle: { fontSize: 20, fontWeight: 700, color: '#1D3557' },
  emptySub: { color: TEXT_MUTED, fontSize: 14 },
};
