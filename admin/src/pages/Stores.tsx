import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { storesApi } from '../services/api';
import toast from 'react-hot-toast';

interface Store {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
}

export default function Stores() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<{ latitude: string; longitude: string }>({ latitude: '', longitude: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['stores'],
    queryFn: () => storesApi.getAll(),
  });

  const stores: Store[] = data?.data?.data ?? [];

  const mutation = useMutation({
    mutationFn: ({ storeId, lat, lng }: { storeId: string; lat: number | null; lng: number | null }) =>
      storesApi.update(storeId, { latitude: lat, longitude: lng }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stores'] });
      toast.success('Store location saved');
      setEditingId(null);
    },
    onError: () => toast.error('Failed to save'),
  });

  function startEdit(store: Store) {
    setEditingId(store.id);
    setForm({
      latitude: store.latitude != null ? String(store.latitude) : '',
      longitude: store.longitude != null ? String(store.longitude) : '',
    });
  }

  function save(storeId: string) {
    const lat = form.latitude.trim() === '' ? null : parseFloat(form.latitude);
    const lng = form.longitude.trim() === '' ? null : parseFloat(form.longitude);
    if ((lat != null && isNaN(lat)) || (lng != null && isNaN(lng))) {
      toast.error('Enter valid coordinates');
      return;
    }
    mutation.mutate({ storeId, lat, lng });
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>Stores</h1>
          <p style={s.subtitle}>Manage store locations and coordinates for customer proximity detection</p>
        </div>
        <div style={s.count}>{stores.length} stores</div>
      </div>

      <div style={s.infoBox}>
        <strong>How to get coordinates:</strong> Open Google Maps, right-click on the store location, and copy the latitude/longitude shown at the top of the context menu.
      </div>

      {isLoading ? (
        <div style={s.empty}>Loading stores…</div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                {['Store', 'Address', 'Phone', 'Latitude', 'Longitude', 'Actions'].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stores.map((store) => (
                <tr key={store.id} style={s.tr}>
                  <td style={s.td}>
                    <strong>{store.name}</strong>
                    <div style={s.sub}>{store.city}, {store.state}</div>
                  </td>
                  <td style={s.td}>
                    <div>{store.address}</div>
                    <div style={s.sub}>{store.zipCode}</div>
                  </td>
                  <td style={s.td}>{store.phone ?? '—'}</td>

                  {editingId === store.id ? (
                    <>
                      <td style={s.td}>
                        <input
                          style={s.input}
                          placeholder="e.g. 33.7490"
                          value={form.latitude}
                          onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                        />
                      </td>
                      <td style={s.td}>
                        <input
                          style={s.input}
                          placeholder="e.g. -84.3880"
                          value={form.longitude}
                          onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                        />
                      </td>
                      <td style={s.td}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            style={s.saveBtn}
                            onClick={() => save(store.id)}
                            disabled={mutation.isPending}
                          >
                            {mutation.isPending ? '…' : 'Save'}
                          </button>
                          <button style={s.cancelBtn} onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={s.td}>
                        {store.latitude != null ? (
                          <span style={s.coord}>{store.latitude.toFixed(6)}</span>
                        ) : (
                          <span style={s.missing}>Not set</span>
                        )}
                      </td>
                      <td style={s.td}>
                        {store.longitude != null ? (
                          <span style={s.coord}>{store.longitude.toFixed(6)}</span>
                        ) : (
                          <span style={s.missing}>Not set</span>
                        )}
                      </td>
                      <td style={s.td}>
                        <button style={s.editBtn} onClick={() => startEdit(store)}>
                          ✏️ Edit Location
                        </button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  page: { maxWidth: 1100, margin: '0 auto', padding: '32px 24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  title: { margin: 0, fontSize: 26, fontWeight: 800, color: '#1D3557' },
  subtitle: { margin: '4px 0 0', color: '#6c757d', fontSize: 14 },
  count: { background: '#1D3557', color: '#fff', borderRadius: 20, padding: '4px 14px', fontSize: 13, fontWeight: 700, alignSelf: 'center' },

  infoBox: { background: '#fffbeb', border: '1px solid #f59e0b', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#92400e', marginBottom: 20, lineHeight: 1.5 },

  tableWrap: { background: '#fff', borderRadius: 14, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', overflow: 'hidden' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { background: '#f8f9fb', padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #eee' },
  tr: { borderBottom: '1px solid #f0f2f5' },
  td: { padding: '14px', fontSize: 13, color: '#333', verticalAlign: 'middle' },
  sub: { fontSize: 11, color: '#6c757d', marginTop: 3 },

  coord: { fontFamily: 'monospace', fontSize: 12, color: '#1D3557', background: '#eef2ff', padding: '2px 6px', borderRadius: 4 },
  missing: { color: '#E63946', fontSize: 12, fontStyle: 'italic' },

  input: { border: '1.5px solid #c7d2fe', borderRadius: 6, padding: '6px 10px', fontSize: 13, width: 130, outline: 'none' },

  editBtn: { background: '#fff', border: '1.5px solid #1D3557', color: '#1D3557', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' },
  saveBtn: { background: '#2DC653', border: 'none', color: '#fff', borderRadius: 6, padding: '5px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' },
  cancelBtn: { background: '#fff', border: '1.5px solid #dee2e6', color: '#6c757d', borderRadius: 6, padding: '5px 12px', fontSize: 12, cursor: 'pointer' },

  empty: { textAlign: 'center', padding: '60px 0', color: '#6c757d', fontSize: 15 },
};
