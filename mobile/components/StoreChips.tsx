// The row of store chips on the manager screens (Requests, Disputes, Schedule), with how many items wait at each store.
// A manager with 12 stores used to see one total in the menu and no hint of which store it was at (2026-10-10).
import { useEffect, useRef, useState } from 'react';
import { ScrollView, TouchableOpacity, View, StyleSheet } from 'react-native';
import { Text } from './ScaledText';   // capped font scaling, like every other screen (audit 2026-11-11)
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';
import type { ScrollViewInstance } from 'react-native';

interface Store { id: string; name: string }

// The store a screen opens on: the one with the most waiting, else the manager's own, else the first
export function startStore(stores: Store[], counts: Record<string, number>, myStoreIds?: string[]): string | null {
  if (stores.length === 0) return null;
  const busiest = [...stores].filter((s) => (counts[s.id] ?? 0) > 0).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
  const own = stores.find((s) => myStoreIds?.includes(s.id));
  return (busiest ?? own ?? stores[0]).id;
}

export default function StoreChips({ stores, selectedId, onSelect, counts = {}, a11yLabel, tone = 'dark' }: {
  stores: Store[];
  /** 'dark' (default): on a navy header. 'light': on the light page (Stock Request's "Request for", 2026-11-15: the dark look's
   *  white words were invisible there) */
  tone?: 'dark' | 'light';
  selectedId: string | null | undefined;
  onSelect: (id: string) => void;
  counts?: Record<string, number>;
  a11yLabel: (name: string) => string;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollViewInstance>(null);
  const xs = useRef<Record<string, number>>({});
  const [laidOut, setLaidOut] = useState(false);

  // Bring the chosen store into view: the busiest store may be the ninth chip, off the screen
  useEffect(() => {
    if (!selectedId || !laidOut) return;
    const x = xs.current[selectedId];
    if (x != null) scrollRef.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  }, [selectedId, laidOut]);

  return (
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {stores.map((store, i) => {
        const active = store.id === selectedId;
        const n = counts[store.id] ?? 0;
        return (
          <TouchableOpacity
            key={store.id}
            style={[s.chip, active && s.chipActive, tone === 'light' && (active ? s.chipLightActive : s.chipLight)]}
            onPress={() => onSelect(store.id)}
            onLayout={(e) => { xs.current[store.id] = e.nativeEvent.layout.x; if (i === stores.length - 1) setLaidOut(true); }}
            activeOpacity={0.75}
            accessibilityRole="tab"
            accessibilityLabel={n > 0 ? `${a11yLabel(store.name)}. ${t('storeChips.waitingA11y', { count: n })}` : a11yLabel(store.name)}
            accessibilityState={{ selected: active }}
            hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
          >
            <Text style={[s.chipText, active && s.chipTextActive, tone === 'light' && (active ? s.chipTextLightActive : s.chipTextLight)]}>{store.name}</Text>
            {n > 0 && (
              <View style={s.badge}>
                <Text style={s.badgeText}>{n > 99 ? '99+' : n}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  chipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderColor: 'rgba(255,255,255,0.55)' },
  chipText: { color: 'rgba(255,255,255,0.6)', fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  chipLight: { backgroundColor: COLORS.white, borderColor: COLORS.border },
  chipLightActive: { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary },
  chipTextLight: { color: COLORS.text, fontWeight: '600' },
  chipTextLightActive: { color: '#fff', fontWeight: '800' },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
});
