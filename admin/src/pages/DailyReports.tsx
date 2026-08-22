import { useState, useMemo, CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dailyReportApi, storesApi } from '../services/api';
import ErrorState from '../components/ErrorState';
import CardSkeleton from '../components/CardSkeleton';
import { ClipboardCheck, Fuel, Droplets, Package, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Store { id: string; name: string; storeNumber?: string }

interface DailyReport {
  id: string;
  storeId: string;
  store?: { id: string; name: string };
  reportDate: string;
  gasPrice: number | null;
  dieselPrice: number | null;
  regGasGal: number | null;
  midGradeGasGal: number | null;
  premiumGasGal: number | null;
  cigsCount: number | null;
  imageUrl: string | null;
  notes: string | null;
  createdAt: string;
  submittedBy: { id: string; name: string; phone: string };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

// ─── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ report, showStore, storeMap }: { report: DailyReport; showStore: boolean; storeMap: Record<string, string> }) {
  const [expanded, setExpanded] = useState(false);
  const initials = (report.submittedBy.name || report.submittedBy.phone || '?').slice(0, 2).toUpperCase();

  return (
    <div style={s.card}>
      {/* Header row */}
      <button style={s.cardHeader} onClick={() => setExpanded(v => !v)}>
        <div style={s.avatarWrap}>
          <div style={s.avatar}>{initials}</div>
          <div>
            <div style={s.submitterName}>{report.submittedBy.name || report.submittedBy.phone}</div>
            <div style={s.submittedAt}>
              {showStore && (report.store?.name || storeMap[report.storeId]) && (
                <span style={s.storeBadge}>{report.store?.name ?? storeMap[report.storeId]}</span>
              )}
              Submitted at {fmtTime(report.createdAt)}
            </div>
          </div>
        </div>
        <div style={s.pillRow}>
          {report.gasPrice != null && (
            <span style={{ ...s.pill, background: '#FFF7ED', color: '#C2410C' }}>
              <Fuel size={11} /> Gas ${report.gasPrice.toFixed(2)}
            </span>
          )}
          {report.dieselPrice != null && (
            <span style={{ ...s.pill, background: '#EFF6FF', color: '#1D4ED8' }}>
              <Droplets size={11} /> Dsl ${report.dieselPrice.toFixed(2)}
            </span>
          )}
          {report.cigsCount != null && (
            <span style={{ ...s.pill, background: '#F0FDF4', color: '#15803D' }}>
              <Package size={11} /> Cigs {report.cigsCount}
            </span>
          )}
          {report.imageUrl && (
            <span style={{ ...s.pill, background: '#F5F3FF', color: '#6D28D9' }}>
              <ImageIcon size={11} /> Photo
            </span>
          )}
          {expanded ? <ChevronUp size={15} color="#5a6472" /> : <ChevronDown size={15} color="#5a6472" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div style={s.cardBody}>
          {/* Prices */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Today's Prices</div>
            <div style={s.dataGrid}>
              <DataCell label="Gas ($/gal)" value={report.gasPrice != null ? `$${report.gasPrice.toFixed(3)}` : '—'} />
              <DataCell label="Diesel ($/gal)" value={report.dieselPrice != null ? `$${report.dieselPrice.toFixed(3)}` : '—'} />
            </div>
          </div>

          {/* Inventory */}
          <div style={s.section}>
            <div style={s.sectionLabel}>Gas Inventory</div>
            <div style={s.dataGrid}>
              <DataCell label="Regular" value={report.regGasGal != null ? `${report.regGasGal.toLocaleString()} gal` : '—'} />
              <DataCell label="Mid-Grade" value={report.midGradeGasGal != null ? `${report.midGradeGasGal.toLocaleString()} gal` : '—'} />
              <DataCell label="Premium" value={report.premiumGasGal != null ? `${report.premiumGasGal.toLocaleString()} gal` : '—'} />
              <DataCell label="Cigs Count" value={report.cigsCount != null ? report.cigsCount.toLocaleString() : '—'} />
            </div>
          </div>

          {/* Notes */}
          {report.notes && (
            <div style={s.section}>
              <div style={s.sectionLabel}>Notes</div>
              <div style={s.notes}>{report.notes}</div>
            </div>
          )}

          {/* Image */}
          {report.imageUrl && (
            <div style={s.section}>
              <div style={s.sectionLabel}>Attached Photo</div>
              <a href={report.imageUrl} target="_blank" rel="noreferrer">
                <img src={report.imageUrl} alt="Daily report" style={s.reportImg} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.dataCell}>
      <div style={s.dataCellLabel}>{label}</div>
      <div style={s.dataCellValue}>{value}</div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DailyReports() {
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [date, setDate] = useState(todayStr());

  const { data: storesData } = useQuery({
    queryKey: ['accessible-stores'],
    queryFn: storesApi.getAccessible,
  });
  const stores: Store[] = storesData?.data?.data ?? [];
  const storeMap = useMemo(() => Object.fromEntries(stores.map(s => [s.id, s.name])), [stores]);

  const storeId = selectedStoreId;

  const { data, isLoading, isError, isFetching, refetch } = useQuery({
    queryKey: ['daily-reports', storeId, date],
    queryFn: () => dailyReportApi.getByDate(storeId || undefined, date),
    enabled: !!date,
  });
  const reports: DailyReport[] = data?.data?.data ?? [];

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <div style={s.iconWrap}>
            <ClipboardCheck size={20} color="#fff" />
          </div>
          <div>
            <h1 style={s.title}>Daily Reports</h1>
            <p style={s.subtitle}>Employee shift reports submitted by store staff</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={s.filters}>
        <select
          style={s.select}
          value={selectedStoreId}
          onChange={e => setSelectedStoreId(e.target.value)}
        >
          <option value="">All Stores</option>
          {stores.map(st => (
            <option key={st.id} value={st.id}>{st.name}</option>
          ))}
        </select>
        <input
          type="date"
          style={s.dateInput}
          value={date}
          onChange={e => setDate(e.target.value)}
          max={todayStr()}
        />
      </div>

      {/* Date label */}
      {date && (
        <div style={s.dateLabel}>
          {fmtDate(date)}
          {isFetching && <span style={s.loadingDot}> ·</span>}
        </div>
      )}

      {/* Content */}
      {isError ? (
        <ErrorState onRetry={refetch} />
      ) : isLoading ? (
        <CardSkeleton count={3} />
      ) : reports.length === 0 ? (
        <div style={s.emptyState}>
          <ClipboardCheck size={36} color="#D1D5DB" />
          <p style={s.emptyTitle}>No reports for this date</p>
          <p style={s.emptySubtitle}>Reports submitted by employees will appear here.</p>
        </div>
      ) : (
        <div style={s.reportList}>
          <div style={s.reportCount}>{reports.length} report{reports.length !== 1 ? 's' : ''}</div>
          {reports.map(r => <ReportCard key={r.id} report={r} showStore={!storeId} storeMap={storeMap} />)}
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, CSSProperties> = {
  page: {
    padding: '28px 32px',
    maxWidth: 860,
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 11,
    background: '#C0392B',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: 26,
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1.2,
  },
  subtitle: {
    margin: 0,
    fontSize: 13,
    color: '#5a6472',
    marginTop: 2,
  },
  filters: {
    display: 'flex',
    gap: 10,
    marginBottom: 16,
    flexWrap: 'wrap' as const,
  },
  select: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1.5px solid #E5E7EB',
    fontSize: 13.5,
    color: '#374151',
    background: '#fff',
    outline: 'none',
    cursor: 'pointer',
    minWidth: 180,
  },
  dateInput: {
    padding: '8px 12px',
    borderRadius: 8,
    border: '1.5px solid #E5E7EB',
    fontSize: 13.5,
    color: '#374151',
    background: '#fff',
    outline: 'none',
    cursor: 'pointer',
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: 600,
    color: '#374151',
    marginBottom: 12,
  },
  loadingDot: {
    color: '#5a6472',
    fontWeight: 400,
  },
  reportList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  reportCount: {
    fontSize: 12,
    color: '#5a6472',
    fontWeight: 500,
    marginBottom: 4,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  card: {
    background: '#fff',
    borderRadius: 12,
    border: '1.5px solid #E5E7EB',
    overflow: 'hidden',
  },
  cardHeader: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    gap: 12,
  },
  avatarWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: '50%',
    background: '#C0392B',
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 12,
    flexShrink: 0,
  },
  submitterName: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
    textAlign: 'left' as const,
  },
  submittedAt: {
    fontSize: 12,
    color: '#5a6472',
    textAlign: 'left' as const,
    marginTop: 1,
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  storeBadge: {
    display: 'inline-block',
    background: '#FDECEA',
    color: '#C0392B',
    fontSize: 11,
    fontWeight: 700,
    padding: '1px 7px',
    borderRadius: 20,
  },
  pillRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap' as const,
  },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '3px 8px',
    borderRadius: 20,
    fontSize: 11.5,
    fontWeight: 600,
  },
  cardBody: {
    borderTop: '1.5px solid #F3F4F6',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  section: {},
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    color: '#5a6472',
    marginBottom: 8,
  },
  dataGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
    gap: 8,
  },
  dataCell: {
    background: '#F9FAFB',
    borderRadius: 8,
    padding: '8px 10px',
  },
  dataCellLabel: {
    fontSize: 11,
    color: '#5a6472',
    fontWeight: 500,
    marginBottom: 2,
  },
  dataCellValue: {
    fontSize: 14,
    fontWeight: 600,
    color: '#111827',
  },
  notes: {
    fontSize: 13.5,
    color: '#374151',
    background: '#FFFBEB',
    border: '1px solid #FDE68A',
    borderRadius: 8,
    padding: '10px 12px',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap' as const,
  },
  reportImg: {
    maxWidth: '100%',
    maxHeight: 320,
    borderRadius: 8,
    objectFit: 'cover' as const,
    cursor: 'pointer',
    display: 'block',
  },
  empty: {
    textAlign: 'center' as const,
    padding: '48px 0',
    color: '#5a6472',
    fontSize: 14,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '56px 0',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    margin: 0,
    fontSize: 15,
    fontWeight: 600,
    color: '#374151',
  },
  emptySubtitle: {
    margin: 0,
    fontSize: 13,
    color: '#5a6472',
  },
};
