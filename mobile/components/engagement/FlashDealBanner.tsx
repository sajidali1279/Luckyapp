// A flash deal from HQ (2026-10-24, admin > Engagement): a bold card near the top of Home while it runs, with a countdown, in the language
// the customer uses; a tap opens its link (the offers, Hot Food, Rewards or the gas prices). It goes away by itself when it ends, and is
// fetched again whenever a push arrives (the flash deal push itself refreshes it).
import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from '../ScaledText';
import { engagementApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { haptic } from '../../utils/haptics';

type Flash = { id: string; title: string; titleEs: string | null; body: string; bodyEs: string | null; url: string | null; endsAt: string };

export default function FlashDealBanner({ storeId, enabled }: { storeId?: string; enabled: boolean }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const isCustomer = useAuthStore((st) => st.user?.role === 'CUSTOMER');
  const q = useQuery({
    queryKey: ['flash-deal', storeId ?? ''],
    queryFn: async () => (await engagementApi.flashActive(storeId)).data.data as Flash | null,
    enabled: enabled && isCustomer, staleTime: 60_000, refetchInterval: 120_000, retry: 1,
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const d = q.data;
  const left = d ? new Date(d.endsAt).getTime() - now : 0;
  useEffect(() => { if (d && left <= 0) qc.invalidateQueries({ queryKey: ['flash-deal'] }); }, [d?.id, left <= 0]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!d || left <= 0) return null;
  const es = i18n.language === 'es';
  const h = Math.floor(left / 3_600_000), m = Math.max(1, Math.floor((left % 3_600_000) / 60_000));
  const time = h > 0 ? t('engagement.flashLeftHm', { h, m }) : t('engagement.flashLeftM', { m });
  const title = (es && d.titleEs) || d.title, body = (es && d.bodyEs) || d.body;
  const open = () => { if (!d.url) return; haptic.tap(); router.push(d.url as any); };
  return (
    <TouchableOpacity style={s.card} onPress={open} disabled={!d.url} activeOpacity={0.88} accessibilityRole={d.url ? 'button' : 'text'} accessibilityLabel={`${t('engagement.flashKicker')}. ${title}. ${body}. ${time}`}>
      <View style={s.top}>
        <Text style={s.kicker}>⚡ {t('engagement.flashKicker')}</Text>
        <View style={s.timerChip}><Text style={s.timer} maxFontSizeMultiplier={1.3}>{time}</Text></View>
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.body}>{body}</Text>
      {d.url ? <Text style={s.cta}>{t('engagement.flashOpen')} ›</Text> : null}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginTop: 4, marginBottom: 14, padding: 16, borderRadius: 18, backgroundColor: '#CC2936', gap: 6 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  kicker: { color: '#FFE8A3', fontSize: 12, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6, flexShrink: 1 },
  timerChip: { backgroundColor: '#FFE8A3', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  timer: { color: '#7A1220', fontSize: 12, fontWeight: '900' },
  title: { color: '#fff', fontSize: 19, fontWeight: '900' },
  body: { color: 'rgba(255,255,255,0.92)', fontSize: 14, lineHeight: 19 },
  cta: { color: '#fff', fontSize: 14, fontWeight: '800', marginTop: 2 },
});
