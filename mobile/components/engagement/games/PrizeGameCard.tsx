// The prize game's card on Home (2026-10-25): "Your free spin is ready!" or what today's play won. It opens the game with the store Home
// found nearby (Home only knows one when the customer is in range), so a prize is added at the store they are at.
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ScaledText';
import { COLORS } from '../../../constants';
import { engagementApi } from '../../../services/api';
import { haptic } from '../../../utils/haptics';
import { useEngagementFlags } from '../../../hooks/useEngagement';
import { ChevronRightIcon } from '../../Icons';
import { GAME_EMOJI, type GameState } from './types';

export default function PrizeGameCard({ storeId }: { storeId?: string }) {
  const { t } = useTranslation();
  const on = !!useEngagementFlags()?.games;
  const q = useQuery({ queryKey: ['prize-game'], queryFn: async () => (await engagementApi.game()).data.data as GameState, enabled: on, staleTime: 60_000 });
  const g = q.data;
  if (!on || !g || !g.enabled || (!g.open && !g.played)) return null;   // closed for the month and not played today: nothing to tap
  const title = g.played
    ? g.played.pts > 0 ? t('games.cardPlayedWon', { pts: g.played.pts }) : t('games.cardPlayedLost')
    : t(`games.cardReady_${g.game}`, { defaultValue: t('games.cardReady_SPIN') });
  return (
    <TouchableOpacity style={[s.card, g.played && s.done]} activeOpacity={0.85} accessibilityRole="button"
      onPress={() => { haptic.tap(); router.push({ pathname: '/(customer)/games', params: storeId ? { storeId } : {} }); }}>
      <Text style={s.emoji}>{GAME_EMOJI[g.game] ?? '🎡'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[s.kicker, g.played && s.kickerDone]}>{t(`games.title_${g.game}`, { defaultValue: t('games.title_SPIN') })}</Text>
        <Text style={[s.title, g.played && s.titleDone]}>{title}</Text>
        {!g.played && <Text style={s.sub}>{t('games.cardPlay')}</Text>}
      </View>
      <ChevronRightIcon size={20} color={g.played ? COLORS.textMuted : '#fff'} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 16, marginTop: 4, marginBottom: 14, padding: 14, borderRadius: 18, backgroundColor: '#1D3557' },
  done: { backgroundColor: '#EEF2F7', borderWidth: 1, borderColor: '#D3DCEA' },
  emoji: { fontSize: 34 },
  kicker: { fontSize: 11, fontWeight: '900', color: '#FFE8A3', letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 16, fontWeight: '900', color: '#fff' },
  sub: { fontSize: 12, color: '#C9D6E8', marginTop: 2 },
  kickerDone: { color: '#1D3557' },
  titleDone: { color: COLORS.text, fontSize: 15 },
});
