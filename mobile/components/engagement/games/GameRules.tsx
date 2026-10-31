// The prize game's chances and official rules (2026-10-25), on the game screen itself. App stores ask for the rules inside the app, and
// for the line that Apple and Google are not sponsors. The numbers come from HQ's settings, so the rules always match the real game.
import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Text } from '../../ScaledText';
import { COLORS } from '../../../constants';
import type { Prize } from './types';

const pct = (c: number) => `${(c * 100).toFixed(c < 0.01 ? 2 : c < 0.1 ? 1 : 0)}%`;

export default function GameRules({ prizes, since, endsOn }: { prizes: Prize[]; since: string | null; endsOn: string | null }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(i18n.language?.startsWith('es') ? 'es-US' : 'en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  // the same prize listed twice (two slices of the wheel) shows once, with its chances added up
  const rows = [...prizes.reduce((m, p) => m.set(p.pts, (m.get(p.pts) ?? 0) + p.chance), new Map<number, number>())].sort((a, b) => b[0] - a[0]);
  const odds = (
    <View style={s.odds}>
      {rows.map(([pts, chance]) => (
        <View key={pts} style={s.oddsRow}>
          <Text style={s.oddsPrize}>{pts > 0 ? t('games.prizePts', { pts }) : t('games.noPrize')}</Text>
          <Text style={s.oddsChance}>{pct(chance)}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View style={s.wrap}>
      <Text style={s.head}>{t('games.chances')}</Text>
      {odds}
      <TouchableOpacity onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={s.toggle}>{open ? t('games.rulesHide') : t('games.rulesShow')}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.rules}>
          <Text style={s.rulesTitle}>{t('games.rulesTitle')}</Text>
          {(['r1', 'r2', 'r3', 'r4'] as const).map((k) => <Text key={k} style={s.rule}>{t(`games.${k}`)}</Text>)}
          {odds}
          {(['r5', 'r6'] as const).map((k) => <Text key={k} style={s.rule}>{t(`games.${k}`)}</Text>)}
          <Text style={s.rule}>{t('games.r7', { since: since ? date(since) : t('profile.notSet'), until: endsOn ? t('games.untilDate', { date: date(endsOn) }) : t('games.untilOpen') })}</Text>
          {(['r8', 'r9', 'r10'] as const).map((k) => <Text key={k} style={s.rule}>{t(`games.${k}`)}</Text>)}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 18, padding: 16, gap: 8, borderWidth: 1, borderColor: '#EEF1F5' },
  head: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  odds: { gap: 4 },
  oddsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  oddsPrize: { fontSize: 14, color: COLORS.text },
  oddsChance: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  toggle: { fontSize: 14, fontWeight: '800', color: COLORS.primary, marginTop: 4 },
  rules: { gap: 8, marginTop: 4 },
  rulesTitle: { fontSize: 15, fontWeight: '900', color: COLORS.text },
  rule: { fontSize: 13, color: COLORS.text, lineHeight: 19 },
});
