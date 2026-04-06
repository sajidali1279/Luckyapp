import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { billingApi } from '../services/api';

const TIERS = ['BRONZE', 'SILVER', 'GOLD', 'DIAMOND', 'PLATINUM'] as const;
type TierKey = typeof TIERS[number];

const TIER_META: Record<TierKey, { emoji: string; color: string; spend: string }> = {
  BRONZE:   { emoji: '🥉', color: '#CD7F32', spend: 'New customers'     },
  SILVER:   { emoji: '🥈', color: '#A0A0B0', spend: '$50+ per period'   },
  GOLD:     { emoji: '🥇', color: '#F4A226', spend: '$150+ per period'  },
  DIAMOND:  { emoji: '💎', color: '#00B4D8', spend: '$300+ per period'  },
  PLATINUM: { emoji: '👑', color: '#9B5DE5', spend: '$450+ per period'  },
};

type RateRow = { tier: string; cashbackRate: number; gasCentsPerGallon: number | null };
type EditState = Record<string, { cashbackRate: string; gasCentsPerGallon: string }>;

function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

export default function Rates() {
  const qc = useQueryClient();
  const [form, setForm] = useState<EditState>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tier-rates'],
    queryFn: () => billingApi.getTierRates(),
  });

  const tiers: RateRow[] = data?.data?.data || [];

  // Populate form once data loads
  useEffect(() => {
    if (tiers.length === 0) return;
    const initial: EditState = {};
    for (const r of tiers) {
      initial[r.tier] = {
        cashbackRate: String((r.cashbackRate * 100).toFixed(1)),
        gasCentsPerGallon: r.gasCentsPerGallon != null ? String(r.gasCentsPerGallon) : '',
      };
    }
    setForm(initial);
    setDirty(new Set());
  }, [tiers.length]);

  const updateMut = useMutation({
    mutationFn: ({ tier, payload }: { tier: string; payload: object }) =>
      billingApi.updateTierRate(tier, payload),
    onSuccess: (_res, { tier }) => {
      toast.success(`${tier[0] + tier.slice(1).toLowerCase()} rate saved`);
      setSaving(null);
      setDirty(p => { const n = new Set(p); n.delete(tier); return n; });
      qc.invalidateQueries({ queryKey: ['tier-rates'] });
    },
    onError: () => { toast.error('Failed to save'); setSaving(null); },
  });

  function handleChange(tier: string, field: 'cashbackRate' | 'gasCentsPerGallon', value: string) {
    setForm(p => ({ ...p, [tier]: { ...p[tier], [field]: value } }));
    setDirty(p => new Set(p).add(tier));
  }

  function handleSave(tier: string) {
    const row = form[tier];
    if (!row) return;
    const rate = parseFloat(row.cashbackRate) / 100;
    const cpg = row.gasCentsPerGallon.trim() === '' ? null : parseFloat(row.gasCentsPerGallon);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      toast.error('Cashback must be 0 – 100%');
      return;
    }
    if (cpg !== null && isNaN(cpg)) {
      toast.error('Enter a valid ¢/gallon or leave blank');
      return;
    }
    setSaving(tier);
    updateMut.mutate({ tier, payload: { cashbackRate: rate, gasCentsPerGallon: cpg } });
  }

  function handleSaveAll() {
    const pending = [...dirty];
    if (pending.length === 0) { toast('No changes to save'); return; }
    for (const tier of pending) handleSave(tier);
  }

  function handleReset(tier: string) {
    const original = tiers.find(r => r.tier === tier);
    if (!original) return;
    setForm(p => ({
      ...p,
      [tier]: {
        cashbackRate: String((original.cashbackRate * 100).toFixed(1)),
        gasCentsPerGallon: original.gasCentsPerGallon != null ? String(original.gasCentsPerGallon) : '',
      },
    }));
    setDirty(p => { const n = new Set(p); n.delete(tier); return n; });
  }

  return (
    <div style={s.page}>
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>🏆 Cashback Rates</h1>
          <p style={s.subtitle}>
            Set the base cashback % each customer tier earns. Promotions stack on top of these.
          </p>
        </div>
        {dirty.size > 0 && (
          <button style={s.saveAllBtn} onClick={handleSaveAll}>
            💾 Save {dirty.size} change{dirty.size > 1 ? 's' : ''}
          </button>
        )}
      </div>

      {isLoading && <div style={s.loading}>Loading rates…</div>}
      {isError  && <div style={s.error}>Could not load rates. Check your connection.</div>}

      {!isLoading && !isError && tiers.length === 0 && (
        <div style={s.error}>No tier data returned. The backend may need to be restarted.</div>
      )}

      {tiers.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={{ ...s.th, width: 160 }}>Tier</th>
                <th style={s.th}>
                  Cashback %
                  <div style={s.thSub}>earned on every purchase</div>
                </th>
                <th style={s.th}>
                  Gas ¢ / gallon
                  <div style={s.thSub}>optional — overrides % for gas & diesel</div>
                </th>
                <th style={{ ...s.th, width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {TIERS.map((tierKey) => {
                const r = tiers.find(x => x.tier === tierKey);
                if (!r) return null;
                const row = form[tierKey];
                const meta = TIER_META[tierKey];
                const isDirty = dirty.has(tierKey);
                const isSaving = saving === tierKey;

                return (
                  <tr key={tierKey} style={{ ...s.tr, ...(isDirty ? s.trDirty : {}) }}>
                    {/* Tier label */}
                    <td style={s.td}>
                      <div style={s.tierCell}>
                        <span style={{ ...s.dot, background: meta.color }} />
                        <div>
                          <div style={s.tierName}>{meta.emoji} {tierKey[0] + tierKey.slice(1).toLowerCase()}</div>
                          <div style={s.tierSub}>{meta.spend}</div>
                        </div>
                      </div>
                    </td>

                    {/* Cashback % */}
                    <td style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" max="100" step="0.5"
                          value={row?.cashbackRate ?? ''}
                          onChange={e => handleChange(tierKey, 'cashbackRate', e.target.value)}
                          style={{ ...s.input, ...( isDirty ? s.inputDirty : {} ) }}
                          placeholder="e.g. 3"
                        />
                        <span style={s.suffix}>%</span>
                        {row?.cashbackRate && !isNaN(parseFloat(row.cashbackRate)) && (
                          <span style={s.preview}>{fmtPct(parseFloat(row.cashbackRate) / 100)} back per $1</span>
                        )}
                      </div>
                    </td>

                    {/* Gas ¢/gallon */}
                    <td style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" step="0.5"
                          value={row?.gasCentsPerGallon ?? ''}
                          onChange={e => handleChange(tierKey, 'gasCentsPerGallon', e.target.value)}
                          style={{ ...s.input, ...( isDirty ? s.inputDirty : {} ) }}
                          placeholder="leave blank to use %"
                        />
                        {row?.gasCentsPerGallon ? <span style={s.suffix}>¢</span> : null}
                      </div>
                      {r.gasCentsPerGallon != null && !isDirty && (
                        <div style={s.gasActive}>Active: {r.gasCentsPerGallon}¢/gal for GAS & DIESEL</div>
                      )}
                    </td>

                    {/* Actions */}
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {isDirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} disabled={isSaving} onClick={() => handleSave(tierKey)}>
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button style={s.undoBtn} onClick={() => handleReset(tierKey)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}>✓ Saved</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* How it works */}
      <div style={s.infoGrid}>
        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>📐 How rates apply</div>
          <p style={s.infoCardText}>
            When an employee grants points, the customer's tier rate is used automatically.
            If an active promo exists, its bonus adds on top.
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}><span>Gold tier base rate</span><span style={{ color: '#F4A226', fontWeight: 700 }}>3.0%</span></div>
            <div style={s.calcRow}><span>Active promo</span><span style={{ color: '#2DC653', fontWeight: 700 }}>+ 2.0%</span></div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns on $50</span><span style={{ fontWeight: 800 }}>= $2.50</span>
            </div>
          </div>
        </div>

        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>⛽ Gas ¢/gallon (optional)</div>
          <p style={s.infoCardText}>
            For GAS and DIESEL only, you can set a flat cents-per-gallon rate instead of a percentage.
            Leave blank to use the cashback % for gas too.
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}><span>Gallons pumped</span><span style={{ fontWeight: 700 }}>12 gal</span></div>
            <div style={s.calcRow}><span>Gold flat rate</span><span style={{ color: '#F4A261', fontWeight: 700 }}>3¢/gal</span></div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns</span><span style={{ fontWeight: 800 }}>= $0.36</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 900, margin: '0 auto', padding: '32px 24px' },

  headerRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16 },
  title: { margin: '0 0 6px', fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: 0, color: '#6c757d', fontSize: 14 },

  saveAllBtn: {
    padding: '10px 20px', background: '#1D3557', color: '#fff',
    border: 'none', borderRadius: 8, cursor: 'pointer',
    fontSize: 14, fontWeight: 700, flexShrink: 0,
    boxShadow: '0 2px 8px rgba(29,53,87,0.25)',
  },

  loading: { textAlign: 'center' as const, color: '#6c757d', padding: 60, fontSize: 15 },
  error: { textAlign: 'center' as const, color: '#E63946', padding: 40, background: '#fff5f5', borderRadius: 10 },

  tableWrap: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
    overflow: 'hidden', marginBottom: 28,
  },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { background: '#f8f9fa' },
  th: {
    padding: '12px 16px', textAlign: 'left' as const,
    fontSize: 12, fontWeight: 700, color: '#6c757d',
    textTransform: 'uppercase' as const, letterSpacing: 0.5,
    borderBottom: '2px solid #e9ecef',
  },
  thSub: { fontWeight: 400, textTransform: 'none' as const, letterSpacing: 0, color: '#adb5bd', fontSize: 10, marginTop: 2 },
  tr: { borderBottom: '1px solid #f1f3f5', transition: 'background 0.15s' },
  trDirty: { background: '#fffbf0' },
  td: { padding: '14px 16px', verticalAlign: 'middle' as const },

  tierCell: { display: 'flex', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: '50%', flexShrink: 0 },
  tierName: { fontWeight: 700, fontSize: 14, color: '#1D3557' },
  tierSub: { fontSize: 11, color: '#adb5bd', marginTop: 1 },

  inputGroup: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' as const },
  input: {
    width: 90, padding: '7px 10px',
    border: '1.5px solid #dee2e6', borderRadius: 7,
    fontSize: 15, fontWeight: 600, color: '#1D3557',
    outline: 'none', transition: 'border 0.15s',
  },
  inputDirty: { borderColor: '#F4A226' },
  suffix: { fontSize: 13, color: '#6c757d', fontWeight: 600 },
  preview: { fontSize: 11, color: '#2DC653', fontStyle: 'italic' },
  gasActive: { fontSize: 11, color: '#F4A261', marginTop: 4 },

  saveBtn: {
    padding: '6px 14px', background: '#2DC653', color: '#fff',
    border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 700,
  },
  undoBtn: {
    padding: '6px 10px', background: '#f8f9fa',
    border: '1px solid #dee2e6', borderRadius: 6,
    cursor: 'pointer', fontSize: 13, color: '#6c757d',
  },
  savedTag: { fontSize: 12, color: '#2DC653', fontWeight: 600 },

  infoGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  infoCard: {
    background: '#fff', borderRadius: 12,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    padding: '18px 20px',
  },
  infoCardTitle: { fontWeight: 700, fontSize: 14, color: '#1D3557', marginBottom: 8 },
  infoCardText: { fontSize: 13, color: '#6c757d', lineHeight: 1.55, margin: '0 0 12px' },
  calcBox: { display: 'flex', flexDirection: 'column' as const, gap: 6 },
  calcRow: { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#495057' },
};
