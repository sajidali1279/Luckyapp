// "Cuatro says" (2026-10-25, admin > Engagement > Cuatro): the mascot's tip of the day on Home. One short line from what this customer has
// right now (a reward ready to redeem, or one nearly there), else one of a few everyday tips that changes each day. The cross hides it until
// tomorrow. It only reads what Home already loaded (and the invite settings the Invite card shares); it asks the server for nothing new.
import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from '../ScaledText';
import { COLORS } from '../../constants';
import { referralsApi } from '../../services/api';
import { haptic } from '../../utils/haptics';
import { useEngagementFlags } from '../../hooks/useEngagement';
import Cuatro, { type CuatroPose } from './Cuatro';

const KEY = 'cuatro_hidden_day';
const dayKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const dayOfYear = (d: Date) => Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 86_400_000);

type Reward = { id: string; title: string; pointsCost: number };
type Tip = { key: string; pose: CuatroPose; text: string; action?: { label: string; go: () => void } };

export default function CuatroCard({ userPts, rewards, firstName, hotFood, onShowQr }: {
  userPts: number; rewards: Reward[]; firstName: string | null; hotFood: boolean; onShowQr: () => void;
}) {
  const { t } = useTranslation();
  const mascot = useEngagementFlags()?.mascot;
  const invites = useQuery({ queryKey: ['my-referrals'], queryFn: () => referralsApi.me(), staleTime: 10 * 60 * 1000, enabled: !!mascot?.home });
  const now = new Date();
  const today = dayKey(now);
  const [hiddenOn, setHiddenOn] = useState<string | null | undefined>(undefined);   // undefined: not read yet, so the card never flashes up
  useEffect(() => { SecureStore.getItemAsync(KEY).then((v) => setHiddenOn(v ?? null)).catch(() => setHiddenOn(null)); }, []);
  if (!mascot?.home || hiddenOn === undefined || hiddenOn === today) return null;

  const toRewards = { label: t('cuatro.seeRewards'), go: () => router.push('/(customer)/rewards') };
  const pick = (): Tip => {
    // what this customer has right now comes first
    const ready = rewards.filter((r) => r.pointsCost > 0 && userPts >= r.pointsCost).sort((a, b) => b.pointsCost - a.pointsCost)[0];
    if (ready) return { key: 'redeem', pose: 'cheer', text: t('cuatro.redeem', { reward: ready.title }), action: toRewards };
    const next = rewards.filter((r) => r.pointsCost > userPts).sort((a, b) => a.pointsCost - b.pointsCost)[0];
    if (next && next.pointsCost - userPts <= Math.max(150, next.pointsCost * 0.25)) {
      return { key: 'near', pose: 'point', text: t('cuatro.near', { pts: (next.pointsCost - userPts).toLocaleString('en-US'), reward: next.title }), action: toRewards };
    }
    // else an everyday tip, a different one each day
    const tips: (Tip | false)[] = [
      { key: 'qr', pose: 'thumbs', text: t('cuatro.qr'), action: { label: t('cuatro.showCode'), go: onShowQr } },
      hotFood && { key: 'hotFood', pose: 'chicken', text: t('cuatro.hotFood'), action: { label: t('cuatro.orderNow'), go: () => router.push('/(customer)/hot-food') } },
      !!invites.data?.data?.data?.settings?.enabled && { key: 'invite', pose: 'phone', text: t('cuatro.invite'), action: { label: t('cuatro.inviteNow'), go: () => router.push('/(customer)/invite-friends') } },
      { key: 'tier', pose: 'point', text: t('cuatro.tier'), action: { label: t('cuatro.seeTier'), go: () => router.push('/(customer)/rewards') } },
      { key: 'leaderboard', pose: 'wave', text: t('cuatro.leaderboard'), action: { label: t('cuatro.seeLeaderboard'), go: () => router.push('/(customer)/leaderboard') } },
    ];
    const pool = tips.filter((x): x is Tip => !!x);
    return pool[dayOfYear(now) % pool.length];
  };
  const tip = pick();
  const hour = now.getHours();
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  const hello = firstName ? t(`cuatro.${part}`, { name: firstName }) : t(`cuatro.${part}Anon`);
  const hide = () => { haptic.tap(); setHiddenOn(today); SecureStore.setItemAsync(KEY, today).catch(() => {}); };

  return (
    <View style={s.card}>
      <Cuatro pose={tip.pose} size={76} />
      <View style={s.words}>
        <Text style={s.says}>{t('cuatro.says', { name: mascot.name })}</Text>
        <Text style={s.hello}>{hello}</Text>
        <Text style={s.text}>{tip.text}</Text>
        {tip.action && (
          <TouchableOpacity onPress={() => { haptic.tap(); tip.action!.go(); }} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Text style={s.action}>{tip.action.label} ›</Text>
          </TouchableOpacity>
        )}
      </View>
      <TouchableOpacity style={s.close} onPress={hide} accessibilityRole="button" accessibilityLabel={t('cuatro.hide')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={s.closeText}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 4, marginBottom: 14, paddingVertical: 12, paddingLeft: 8, paddingRight: 34, borderRadius: 18, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0' },
  words: { flex: 1, gap: 2 },
  says: { fontSize: 11, fontWeight: '900', color: '#15803D', letterSpacing: 0.6, textTransform: 'uppercase' },
  hello: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  text: { fontSize: 14, color: COLORS.text, lineHeight: 19 },
  action: { fontSize: 14, fontWeight: '800', color: '#15803D', marginTop: 4 },
  close: { position: 'absolute', top: 10, right: 12 },
  closeText: { fontSize: 14, fontWeight: '700', color: COLORS.textMuted },
});
