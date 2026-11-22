// "Coming soon" offers and hot food combos (2026-11-22, the owner: build excitement before a deal is available). HQ sets when the teaser
// begins; until the deal starts the app shows it with a live countdown, the price or reward, a Remind me button and how many are waiting.
// ComingSoonCards: the big card(s) on Home. ComingSoonCombos: the compact row at the top of the Hot Food menu (combos only). When the
// countdown reaches zero, the lists are fetched again and the deal appears as a normal offer or combo.
import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from './ScaledText';
import { dealsApi } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { haptic } from '../utils/haptics';
import { offerBonusText } from '../utils/offerRate';
import { BellIcon, CheckCircleIcon } from './Icons';
import { usePoll } from '../hooks/usePoll';

export interface ComingSoonDeal {
  kind: 'OFFER' | 'COMBO'; id: string; title: string; titleEs: string | null; description: string | null; descriptionEs: string | null;
  imageUrl: string | null; startsAt: string; waiting: number; remindMe: boolean;
  dealText?: string | null; dealTextEs?: string | null; bonusRate?: number | null; tierBonusRates?: Record<string, number> | null;
  gasBonusCentsPerGallon?: number | null; price?: number; regularPrice?: number | null; itemName?: string;
}

/** The list for this store, and Remind me (shown right away, put back if the server says no). */
export function useComingSoon(storeId: string | undefined) {
  const qc = useQueryClient();
  const isCustomer = useAuthStore((st) => st.user?.role === 'CUSTOMER');
  const key = ['coming-soon', storeId ?? ''];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => ((await dealsApi.comingSoon(storeId)).data?.data ?? []) as ComingSoonDeal[],
    enabled: isCustomer, staleTime: 60_000, refetchInterval: usePoll(5 * 60_000), retry: 1,
  });
  const { t } = useTranslation();
  // on: what the tap asks for, decided at the tap (the deal object may change while the request is out)
  const remind = useMutation({
    mutationFn: ({ d, on }: { d: ComingSoonDeal; on: boolean }) => dealsApi.remind(d.kind, d.id, on),
    onMutate: ({ d, on }) => {
      qc.setQueryData<ComingSoonDeal[]>(key, (old) => old?.map((x) => (x.id === d.id ? { ...x, remindMe: on, waiting: Math.max(0, x.waiting + (on ? 1 : -1)) } : x)));
    },
    onSuccess: (r, { d, on }) => {
      const waiting = r.data?.data?.waiting;
      if (typeof waiting === 'number') qc.setQueryData<ComingSoonDeal[]>(key, (old) => old?.map((x) => (x.id === d.id ? { ...x, waiting } : x)));
      if (on) Toast.show({ type: 'success', text1: t('comingSoon.remindSet') });
    },
    onError: () => { qc.invalidateQueries({ queryKey: key }); Toast.show({ type: 'error', text1: t('comingSoon.remindFailed') }); },
  });
  return { deals: q.data ?? [], remind: (d: ComingSoonDeal) => { haptic.tap(); remind.mutate({ d, on: !d.remindMe }); } };
}

/** Ticks every second while shown; when the start is reached the lists are fetched again (the deal is live). */
function useCountdown(startsAt: string) {
  const qc = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const left = Math.max(0, Date.parse(startsAt) - now);
  useEffect(() => {
    if (left <= 0) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left <= 0]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (left > 0) return;
    ['coming-soon', 'offers', 'customer-hot-food-menu'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }, [left <= 0]);   // eslint-disable-line react-hooks/exhaustive-deps
  const s = Math.floor(left / 1000);
  return { left, d: Math.floor(s / 86_400), h: Math.floor((s % 86_400) / 3600), m: Math.floor((s % 3600) / 60), sec: s % 60 };
}

const two = (n: number) => String(n).padStart(2, '0');

function useWords(d: ComingSoonDeal) {
  const { t, i18n } = useTranslation();
  const es = i18n.language === 'es';
  const title = (es && d.titleEs) || d.title;
  const value = d.kind === 'COMBO'
    ? `$${(d.price ?? 0).toFixed(2)}${d.regularPrice && d.regularPrice > (d.price ?? 0) ? `  ·  ${t('comingSoon.save', { amount: `$${(d.regularPrice - (d.price ?? 0)).toFixed(2)}` })}` : ''}`
    : (es && d.dealTextEs) || d.dealText || (d.gasBonusCentsPerGallon != null ? t('customerHome.bonusPerGal', { cents: d.gasBonusCentsPerGallon })
      : offerBonusText({ bonusRate: d.bonusRate ?? null, tierBonusRates: d.tierBonusRates ?? null } as any, t, 'cashbackPill'));
  // the small Hot Food row has room for the price alone
  const price = d.kind === 'COMBO' ? `$${(d.price ?? 0).toFixed(2)}` : value;
  return { title, value, price };
}

function startText(t: (k: string, o?: any) => string, startsAt: string, lang: string) {
  const at = new Date(startsAt);
  const day = at.toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/Chicago' });
  const time = at.toLocaleTimeString(lang === 'es' ? 'es-US' : 'en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' });
  return t('comingSoon.startsAt', { day, time });
}

function RemindButton({ d, onPress, compact }: { d: ComingSoonDeal; onPress: () => void; compact?: boolean }) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[s.remind, compact && s.remindCompact, d.remindMe && s.remindOn]}
      accessibilityRole="button" accessibilityState={{ selected: d.remindMe }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityLabel={d.remindMe ? t('comingSoon.remindOnA11y') : t('comingSoon.remindA11y')}>
      {d.remindMe ? <CheckCircleIcon size={compact ? 18 : 16} color="#7A4B00" /> : <BellIcon size={compact ? 18 : 16} color="#1D3557" />}
      <Text style={[s.remindText, compact && s.remindTextCompact, d.remindMe && { color: '#7A4B00' }]} numberOfLines={1}>
        {compact ? (d.remindMe ? t('comingSoon.remindOnShort') : t('comingSoon.remindShort')) : d.remindMe ? t('comingSoon.reminding') : t('comingSoon.remindMe')}
      </Text>
    </TouchableOpacity>
  );
}

function BigCard({ d, width, onRemind }: { d: ComingSoonDeal; width: number; onRemind: () => void }) {
  const { t, i18n } = useTranslation();
  const c = useCountdown(d.startsAt);
  const w = useWords(d);
  if (c.left <= 0) return null;
  const tiles: [number, string][] = [[c.d, t('comingSoon.days')], [c.h, t('comingSoon.hrs')], [c.m, t('comingSoon.min')], [c.sec, t('comingSoon.sec')]];
  return (
    <View style={[s.card, { width }]} accessible accessibilityLabel={`${t('comingSoon.kicker')}. ${w.title}. ${w.value}. ${startText(t, d.startsAt, i18n.language)}`}>
      <View style={s.topRow}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={s.kicker}>✨ {t('comingSoon.kicker')}</Text>
          <Text style={s.title} numberOfLines={2}>{w.title}</Text>
          <Text style={s.value} numberOfLines={1}>{w.value}</Text>
          <Text style={s.when}>{startText(t, d.startsAt, i18n.language)}</Text>
        </View>
        {d.imageUrl ? <Image source={{ uri: d.imageUrl }} style={s.pic} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      </View>
      <View style={s.tiles} importantForAccessibility="no-hide-descendants">
        {tiles.map(([n, label]) => (
          <View key={label} style={s.tile}>
            <Text style={s.tileNum} maxFontSizeMultiplier={1.2}>{two(n)}</Text>
            <Text style={s.tileLabel} maxFontSizeMultiplier={1.2}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={s.bottomRow}>
        <RemindButton d={d} onPress={onRemind} />
        {d.waiting > 0 && <Text style={s.waiting}>🔥 {t('comingSoon.waiting', { count: d.waiting })}</Text>}
      </View>
    </View>
  );
}

/** Home: the big Coming soon card (side by side when there are several). */
export function ComingSoonCards({ storeId }: { storeId?: string }) {
  const { deals, remind } = useComingSoon(storeId);
  const { width } = useWindowDimensions();
  if (deals.length === 0) return null;
  const cardW = Math.min(width - 32, 520);
  if (deals.length === 1) return <View style={s.wrap}><BigCard d={deals[0]} width={cardW} onRemind={() => remind(deals[0])} /></View>;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={cardW + 10} decelerationRate="fast" contentContainerStyle={s.pager} style={{ flexGrow: 0 }}>
      {deals.map((d) => <BigCard key={d.id} d={d} width={cardW} onRemind={() => remind(d)} />)}
    </ScrollView>
  );
}

function SmallCard({ d, onRemind }: { d: ComingSoonDeal; onRemind: () => void }) {
  const { t } = useTranslation();
  const c = useCountdown(d.startsAt);
  const w = useWords(d);
  if (c.left <= 0) return null;
  const left = c.d > 0 ? t('comingSoon.inDh', { d: c.d, h: c.h }) : `${two(c.h)}:${two(c.m)}:${two(c.sec)}`;
  return (
    <View style={s.small} accessible accessibilityLabel={`${t('comingSoon.kicker')}. ${w.title}. ${w.value}. ${t('comingSoon.startsIn', { left })}`}>
      {d.imageUrl ? <Image source={{ uri: d.imageUrl }} style={s.smallPic} contentFit="cover" accessibilityIgnoresInvertColors /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.smallKicker}>✨ {t('comingSoon.kicker')}</Text>
        <Text style={s.smallTitle} numberOfLines={2}>{w.title}</Text>
        <Text style={s.smallValue} numberOfLines={1}>{w.price}</Text>
        <Text style={s.smallLeft} importantForAccessibility="no">{t('comingSoon.startsIn', { left })}</Text>
        {d.waiting > 0 && <Text style={s.smallWaiting}>🔥 {t('comingSoon.waiting', { count: d.waiting })}</Text>}
      </View>
      <RemindButton d={d} onPress={onRemind} compact />
    </View>
  );
}

/** Hot Food: the combos coming to this store, at the top of the menu. */
export function ComingSoonCombos({ storeId }: { storeId?: string }) {
  const { deals, remind } = useComingSoon(storeId);
  const combos = deals.filter((d) => d.kind === 'COMBO');
  if (combos.length === 0) return null;
  return <View style={s.smallWrap}>{combos.map((d) => <SmallCard key={d.id} d={d} onRemind={() => remind(d)} />)}</View>;
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 16, marginTop: 4, marginBottom: 14 },
  pager: { paddingHorizontal: 16, gap: 10, marginTop: 4, marginBottom: 14, alignItems: 'flex-start' },   // each card its own height
  card: { borderRadius: 20, padding: 16, backgroundColor: '#1D3557', gap: 12 },
  topRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  kicker: { color: '#FFD166', fontSize: 12, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: 20, fontWeight: '900' },
  value: { color: '#FFD166', fontSize: 16, fontWeight: '800' },
  when: { color: 'rgba(255,255,255,0.75)', fontSize: 13 },
  pic: { width: 84, height: 84, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingVertical: 8, alignItems: 'center' },
  tileNum: { color: '#fff', fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  tileLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  remind: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  remindCompact: { flexDirection: 'column', gap: 2, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14, backgroundColor: '#fff', minWidth: 64 },
  remindTextCompact: { fontSize: 11, fontWeight: '800' },
  remindOn: { backgroundColor: '#FFD166' },
  remindText: { color: '#1D3557', fontSize: 14, fontWeight: '800' },
  waiting: { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  smallWrap: { gap: 8, marginBottom: 12 },
  small: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: '#FFF8E6', borderWidth: 1, borderColor: '#FFD166' },
  smallPic: { width: 56, height: 56, borderRadius: 12 },
  smallKicker: { color: '#B45309', fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textTransform: 'uppercase' },
  smallTitle: { color: '#1D3557', fontSize: 15, fontWeight: '900' },
  smallValue: { color: '#CC2936', fontSize: 14, fontWeight: '800' },
  smallLeft: { color: '#1D3557', fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  smallWaiting: { color: '#B45309', fontSize: 12, fontWeight: '700' },
});
