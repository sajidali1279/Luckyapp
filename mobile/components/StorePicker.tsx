// The manager's store picker (2026-11-15, the owner): one button that shows the chosen store, with a red badge for what waits at the
// OTHER stores, and a list that slides up with every store, its badge and what waits there (items to order, requests and alerts,
// disputes, schedule requests), busiest first, closed stores last, with a search box when there are many. Replaces the long row of chips
// on the manager screens. Drawn by the shell over everything (useShellCover), not a native Modal (they can fail to draw on Android).
import { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, ScrollView, BackHandler, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, TextInput } from './ScaledText';
import { MapPinIcon, ChevronDownIcon, CheckCircleIcon, XIcon } from './Icons';
import { useShellCover } from './DrawerShell';
import { managerApi } from '../services/api';
import { usePoll } from '../hooks/usePoll';
import { COLORS } from '../constants';

export interface StoreBadge { storeId: string; name: string; city?: string | null; closed: boolean; toOrder: number; requests: number; disputes: number; schedule: number; total: number }
type Store = { id: string; name: string };

/** What waits at each of the manager's stores (GET /manager/store-badges), shared by every screen that shows the picker */
export function useStoreBadges() {
  const q = useQuery({ queryKey: ['store-badges'], queryFn: () => managerApi.storeBadges(), staleTime: 30_000, refetchInterval: usePoll(60_000) });
  const rows: StoreBadge[] = q.data?.data?.data ?? [];
  return useMemo(() => new Map(rows.map((r) => [r.storeId, r])), [rows]);
}

const badgeText = (n: number) => (n > 99 ? '99+' : String(n));

export default function StorePicker({ stores, selectedId, onSelect, tone = 'dark' }: {
  stores: Store[];
  selectedId: string | null | undefined;
  onSelect: (id: string) => void;
  /** 'dark': on a coloured header (white words). 'light': on the light page. */
  tone?: 'dark' | 'light';
}) {
  const { t } = useTranslation();
  const cover = useShellCover();
  const badges = useStoreBadges();
  const [open, setOpen] = useState(false);
  const chosen = stores.find((s) => s.id === selectedId) ?? stores[0];
  const chosenBadge = chosen ? badges.get(chosen.id) : undefined;
  // What waits at the other open stores: the reason to switch
  const elsewhere = stores.reduce((n, s) => (s.id === chosen?.id || badges.get(s.id)?.closed ? n : n + (badges.get(s.id)?.total ?? 0)), 0);

  useEffect(() => {
    if (!cover) return;
    cover(open ? <StoreSheet stores={stores} badges={badges} selectedId={chosen?.id} onPick={(id) => { onSelect(id); setOpen(false); }} onClose={() => setOpen(false)} /> : null);
  }, [open, badges, stores, chosen?.id]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { cover?.(null); }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setOpen(false); return true; });
    return () => sub.remove();
  }, [open]);

  if (!chosen || stores.length < 2) return null;
  const light = tone === 'light';
  return (
    <View style={p.wrap}>
      <TouchableOpacity
        style={[p.btn, light ? p.btnLight : p.btnDark]}
        onPress={() => setOpen(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={elsewhere > 0
          ? t('storePicker.buttonA11yWaiting', { store: chosen.name, count: elsewhere })
          : t('storePicker.buttonA11y', { store: chosen.name })}
      >
        <MapPinIcon size={18} color={light ? COLORS.secondary : '#fff'} />
        <View style={{ flex: 1 }}>
          <Text style={[p.btnName, { color: light ? COLORS.text : '#fff' }]} numberOfLines={1}>{chosen.name}</Text>
          <Text style={[p.btnSub, { color: light ? COLORS.textMuted : 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>
            {chosenBadge?.closed ? t('storePicker.closed') : chosenBadge && chosenBadge.total > 0 ? summary(chosenBadge, t) : t('storePicker.allClearHere')}
          </Text>
        </View>
        {elsewhere > 0 && (
          <View style={p.otherPill}>
            <Text style={p.otherPillText}>{t('storePicker.elsewhere', { count: elsewhere })}</Text>
          </View>
        )}
        <ChevronDownIcon size={18} color={light ? COLORS.textMuted : '#fff'} />
      </TouchableOpacity>
    </View>
  );
}

/** "38 to order · 2 requests" */
function summary(b: StoreBadge, t: (k: string, o?: any) => string): string {
  const parts: string[] = [];
  if (b.toOrder) parts.push(t('storePicker.toOrder', { count: b.toOrder }));
  if (b.requests) parts.push(t('storePicker.requests', { count: b.requests }));
  if (b.disputes) parts.push(t('storePicker.disputes', { count: b.disputes }));
  if (b.schedule) parts.push(t('storePicker.schedule', { count: b.schedule }));
  return parts.join(' · ');
}

function StoreSheet({ stores, badges, selectedId, onPick, onClose }: {
  stores: Store[]; badges: Map<string, StoreBadge>; selectedId?: string; onPick: (id: string) => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return stores
      .filter((s) => !needle || s.name.toLowerCase().includes(needle) || (badges.get(s.id)?.city ?? '').toLowerCase().includes(needle))
      .map((s) => ({ s, b: badges.get(s.id) }))
      .sort((a, b) => Number(!!a.b?.closed) - Number(!!b.b?.closed) || (b.b?.total ?? 0) - (a.b?.total ?? 0) || a.s.name.localeCompare(b.s.name, undefined, { numeric: true }));
  }, [stores, badges, q]);
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={p.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('storePicker.close')} />
      <View style={[p.sheet, { paddingBottom: 12 + insets.bottom }]}>
        <View style={p.handle} />
        <View style={p.sheetTop}>
          <Text style={p.sheetTitle} accessibilityRole="header">{t('storePicker.title')}</Text>
          <TouchableOpacity onPress={onClose} style={p.closeBtn} accessibilityRole="button" accessibilityLabel={t('storePicker.close')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <XIcon size={20} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        {stores.length > 6 && (
          <TextInput value={q} onChangeText={setQ} placeholder={t('storePicker.search')} placeholderTextColor={COLORS.textMuted}
            style={p.search} autoCorrect={false} accessibilityLabel={t('storePicker.search')} />
        )}
        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          {rows.length === 0 && <Text style={p.none}>{t('storePicker.noMatch')}</Text>}
          {rows.map(({ s, b }) => {
            const active = s.id === selectedId;
            return (
              <TouchableOpacity key={s.id} style={[p.row, active && p.rowActive]} onPress={() => onPick(s.id)} activeOpacity={0.8}
                accessibilityRole="button" accessibilityState={{ selected: active }}
                accessibilityLabel={[s.name, b?.closed ? t('storePicker.closed') : b && b.total > 0 ? summary(b, t) : t('storePicker.allClear')].join('. ')}>
                <View style={{ flex: 1 }}>
                  <View style={p.rowNameLine}>
                    <Text style={[p.rowName, b?.closed && { color: COLORS.textMuted }]} numberOfLines={1}>{s.name}</Text>
                    {b?.closed && <View style={p.closedTag}><Text style={p.closedTagText}>{t('storePicker.closed')}</Text></View>}
                  </View>
                  <Text style={[p.rowSub, b && b.total > 0 && !b.closed && { color: '#9A3412', fontWeight: '700' }]} numberOfLines={1}>
                    {b && b.total > 0 ? summary(b, t) : t('storePicker.allClear')}
                  </Text>
                </View>
                {b && b.total > 0 && <View style={[p.badge, b.closed && { backgroundColor: '#94A3B8' }]}><Text style={p.badgeText}>{badgeText(b.total)}</Text></View>}
                {active && <CheckCircleIcon size={20} color={COLORS.success} />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const p = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingBottom: 12 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 14, borderWidth: 1, minHeight: 52 },
  btnDark: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.28)' },
  btnLight: { backgroundColor: COLORS.white, borderColor: COLORS.border },
  btnName: { fontSize: 16, fontWeight: '800' },
  btnSub: { fontSize: 12, fontWeight: '600', marginTop: 1 },
  otherPill: { backgroundColor: COLORS.danger, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4 },
  otherPillText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: COLORS.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingTop: 8 },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: '#D5DBE3', marginBottom: 8 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sheetTitle: { fontSize: 18, fontWeight: '900', color: COLORS.text },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F4F8' },
  search: { borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: COLORS.text, marginBottom: 8, backgroundColor: '#F8FAFC' },
  none: { textAlign: 'center', color: COLORS.textMuted, paddingVertical: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderRadius: 12, marginBottom: 4, minHeight: 56 },
  rowActive: { backgroundColor: '#ECFDF5' },
  rowNameLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowName: { fontSize: 16, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  rowSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  closedTag: { backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  closedTagText: { fontSize: 11, fontWeight: '800', color: '#64748B' },
  badge: { minWidth: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 7 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '900' },
});
