// The one-time tier celebration (2026-10-24, HQ switch "Tier celebration" in admin > Engagement): when the customer's tier goes up, a short
// celebration over whatever screen they are on, with the perks they unlocked and a way to Rewards. The server decides (POST
// /engagement/tier-up says yes once per tier per half year, whichever phone asks), so a reinstall or a second phone never celebrates twice.
// Mounted in the customer layout as an in-tree overlay (a native Modal fails to draw on this Android build, see home.tsx InlineModal), it
// reads only primitive values from the store (never the whole user object: the Rewards bounce of 2026-10-21) and navigates only from a tap.
import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, BackHandler } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text } from '../ScaledText';
import { COLORS, TIER_CONFIG } from '../../constants';
import { engagementApi } from '../../services/api';
import { useAuthStore } from '../../store/authStore';
import { useEngagementFlags } from '../../hooks/useEngagement';
import { useLiveTierConfig } from '../../hooks/useLiveTierConfig';
import { useAppSettings } from '../../hooks/useAppSettings';
import { tierBenefitLines } from '../../utils/tierLines';
import { haptic } from '../../utils/haptics';
import { askForRatingSoon } from '../../utils/ratePrompt';
import ProgressRing from '../ProgressRing';
import FadeSlideIn from '../FadeSlideIn';
import Burst from './Burst';

const PIECES = ['🎉', '⭐', '✨', '🏆', '🎉', '⭐', '✨', '🏆', '🎉', '⭐', '✨', '🏆'];

export default function TierUpHost() {
  const flags = useEngagementFlags();
  const on = !!flags?.tierUp;
  const tier = useAuthStore((st) => st.user?.tier);
  const userId = useAuthStore((st) => st.user?.id);
  const [shown, setShown] = useState<string | null>(null);
  // Asked when the switch is on and whenever the tier changes; the server says no unless there is a fresh raise not yet celebrated
  useEffect(() => {
    if (!on || !tier || !userId) return;
    let alive = true;
    engagementApi.tierUp().then((r) => { const d = r.data?.data; if (alive && d?.show && d.tier) setShown(d.tier); }).catch(() => {});
    return () => { alive = false; };
  }, [on, tier, userId]);
  if (!shown) return null;
  return <TierUpCelebration tier={shown} onClose={() => { setShown(null); askForRatingSoon(); }} />;
}

function TierUpCelebration({ tier, onClose }: { tier: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { liveRates } = useLiveTierConfig();
  const app = useAppSettings();
  const cfg = TIER_CONFIG[tier] ?? TIER_CONFIG.SILVER;
  const lines = tierBenefitLines(tier, t, liveRates, app.limits);
  const [burst, setBurst] = useState(0);
  useEffect(() => { haptic.success(); const timer = setTimeout(() => setBurst(1), 250); return () => clearTimeout(timer); }, []);
  useEffect(() => {   // Android back closes the celebration instead of leaving the screen behind it
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [onClose]);
  const seePerks = () => { haptic.tap(); onClose(); router.navigate('/(customer)/rewards'); };
  const title = t('engagement.tierUpTitle', { tier: cfg.label });
  return (
    <View style={s.overlay} accessibilityViewIsModal>
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('engagement.tierUpClose')} />
      <FadeSlideIn style={{ width: '100%' }}>
        <View style={s.card}>
          <View style={s.hero}>
            <ProgressRing size={112} stroke={10} progress={1} color={cfg.color}>
              <Text style={s.emoji}>{cfg.emoji}</Text>
            </ProgressRing>
            <Burst fire={burst} pieces={PIECES} />
          </View>
          <Text style={s.title} accessibilityRole="header">{title}</Text>
          <Text style={s.sub}>{t('engagement.tierUpSub')}</Text>
          <View style={s.lines}>
            {lines.map((l, i) => <Text key={i} style={s.line}>✓  {l}</Text>)}
          </View>
          <TouchableOpacity style={s.btn} onPress={seePerks} accessibilityRole="button" activeOpacity={0.85}>
            <Text style={s.btnText}>{t('engagement.tierUpPerks')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.close} onPress={onClose} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={s.closeText}>{t('engagement.tierUpClose')}</Text>
          </TouchableOpacity>
        </View>
      </FadeSlideIn>
    </View>
  );
}

const s = StyleSheet.create({
  // no elevation on the overlay (it would sit under other views on Android); zIndex keeps it above the screens and the bottom bar
  overlay: { ...StyleSheet.absoluteFillObject, zIndex: 1000, backgroundColor: 'rgba(15,23,42,0.62)', justifyContent: 'center', padding: 20 },
  card: { backgroundColor: '#fff', borderRadius: 24, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center', gap: 10 },
  hero: { width: 160, height: 130, alignItems: 'center', justifyContent: 'center' },
  emoji: { fontSize: 50 },
  title: { fontSize: 24, fontWeight: '900', color: COLORS.text, textAlign: 'center' },
  sub: { fontSize: 14, color: COLORS.textMuted, textAlign: 'center' },
  lines: { alignSelf: 'stretch', gap: 6, marginTop: 2, marginBottom: 6 },
  line: { fontSize: 14, color: COLORS.text, lineHeight: 20 },
  btn: { alignSelf: 'stretch', backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  close: { paddingVertical: 6, paddingHorizontal: 16 },
  closeText: { color: COLORS.textMuted, fontWeight: '700', fontSize: 14 },
});
