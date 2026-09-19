import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { welcomeBonusApi } from '../services/api';
import { COLORS } from '../constants';

const REWARD_OPTIONS = [
  { rewardType: 'FOUNTAIN_DRINK', labelKey: 'customerWelcomeBonus.optionFountain', emoji: '🥤' },
  { rewardType: 'COFFEE',         labelKey: 'customerWelcomeBonus.optionCoffee',   emoji: '☕' },
  { rewardType: 'SODA_12OZ',      labelKey: 'customerWelcomeBonus.optionSoda',     emoji: '🥤' },
  { rewardType: 'HOT_SNACK',      labelKey: 'customerWelcomeBonus.optionHotSnack', emoji: '🌮' },
];

const GOLD = '#F59E0B';
const GREEN = '#22C55E';

export default function WelcomeBonusCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['welcome-bonus'],
    queryFn: () => welcomeBonusApi.getStatus(),
    staleTime: 60_000,
  });

  const bonus = data?.data?.data;

  const claimMut = useMutation({
    mutationFn: (rewardType: string) => welcomeBonusApi.claim(rewardType),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['welcome-bonus'] });
      setShowModal(true);
    },
  });

  if (isLoading || !bonus?.active) return null;

  async function handleCopy(code: string) {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClaim() {
    if (bonus.claimed) { setShowModal(true); return; }
    if (!selected) return;
    claimMut.mutate(selected);
  }

  const optionLabel = (o: { labelKey: string } | null | undefined) => (o ? t(o.labelKey) : undefined);
  const claimedOption = bonus.claimed
    ? REWARD_OPTIONS.find(r => r.rewardType === bonus.rewardType) ?? null
    : null;
  const selectedLabel = optionLabel(REWARD_OPTIONS.find(r => r.rewardType === selected));

  return (
    <>
      <View style={st.card}>
        {/* Day progress */}
        <View style={st.progressRow}>
          {Array.from({ length: 7 }, (_, i) => i + 1).map(d => (
            <View
              key={d}
              style={[
                st.dayPill,
                d < bonus.dayNumber && st.dayPillDone,
                d === bonus.dayNumber && st.dayPillToday,
              ]}
            >
              <Text style={[st.dayPillText, d === bonus.dayNumber && st.dayPillTextToday]}>
                {d < bonus.dayNumber ? '✓' : d}
              </Text>
            </View>
          ))}
        </View>

        <View style={st.body}>
          <Text style={st.tag}>{t('customerWelcomeBonus.tag', { day: bonus.dayNumber })}</Text>

          {/* Already confirmed */}
          {bonus.confirmed && (
            <View style={st.confirmedBox}>
              <Text style={st.confirmedEmoji}>{claimedOption?.emoji}</Text>
              <Text style={st.confirmedLabel}>{optionLabel(claimedOption)}</Text>
              <Text style={st.confirmedSub}>{t('customerWelcomeBonus.confirmedSub')}</Text>
            </View>
          )}

          {/* Claimed but not yet confirmed - show code */}
          {bonus.claimed && !bonus.confirmed && (
            <>
              <Text style={st.pickTitle}>{t('customerWelcomeBonus.youChose')}</Text>
              <View style={st.claimedOptionRow}>
                <Text style={st.claimedOptionEmoji}>{claimedOption?.emoji}</Text>
                <Text style={st.claimedOptionLabel}>{optionLabel(claimedOption)}</Text>
              </View>
              <View style={st.codeBox}>
                <Text style={st.codeLabel}>{t('customerWelcomeBonus.yourCode')}</Text>
                <Text style={st.code}>{bonus.claimCode}</Text>
              </View>
              <Text style={st.codeSub}>{t('customerWelcomeBonus.showCodeToCashier')}</Text>
              <TouchableOpacity
                style={st.viewBtn}
                onPress={() => setShowModal(true)}
                accessibilityRole="button"
                accessibilityLabel={t('customerWelcomeBonus.viewCodeA11y', { reward: optionLabel(claimedOption) })}
              >
                <Text style={st.viewBtnText}>{t('customerWelcomeBonus.viewCode')}</Text>
              </TouchableOpacity>
            </>
          )}

          {/* Not yet claimed - show choice grid */}
          {!bonus.claimed && (
            <>
              <Text style={st.pickTitle}>{t('customerWelcomeBonus.pickTitle')}</Text>
              <View style={st.grid}>
                {REWARD_OPTIONS.map(opt => {
                  const active = selected === opt.rewardType;
                  return (
                    <TouchableOpacity
                      key={opt.rewardType}
                      style={[st.optionCard, active && st.optionCardActive]}
                      onPress={() => setSelected(opt.rewardType)}
                      activeOpacity={0.8}
                      accessibilityRole="radio"
                      accessibilityLabel={t(opt.labelKey)}
                      accessibilityState={{ selected: active }}
                    >
                      <Text style={st.optionEmoji}>{opt.emoji}</Text>
                      <Text style={[st.optionLabel, active && st.optionLabelActive]} numberOfLines={2}>
                        {t(opt.labelKey)}
                      </Text>
                      {active && <View style={st.checkDot}><Text style={st.checkMark}>✓</Text></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity
                style={[st.btn, (!selected || claimMut.isPending) && st.btnDisabled]}
                onPress={handleClaim}
                disabled={!selected || claimMut.isPending}
                accessibilityRole="button"
                accessibilityLabel={
                  claimMut.isPending
                    ? t('customerWelcomeBonus.claimingA11y')
                    : selected
                      ? t('customerWelcomeBonus.claimA11y', { reward: selectedLabel })
                      : t('customerWelcomeBonus.chooseFirstA11y')
                }
              >
                {claimMut.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={st.btnText}>
                      {selected ? t('customerWelcomeBonus.claimA11y', { reward: selectedLabel }) : t('customerWelcomeBonus.chooseItem')}
                    </Text>
                }
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>

      {/* Code modal */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={md.overlay}>
          <View style={md.sheet}>
            <Text style={md.emoji}>{claimedOption?.emoji || bonus.rewardEmoji || '🎁'}</Text>
            <Text style={md.title}>{optionLabel(claimedOption) || bonus.rewardLabel || t('customerWelcomeBonus.yourReward')}</Text>
            <Text style={md.sub}>{t('customerWelcomeBonus.showCodeToReceive')}</Text>

            <View style={md.codeBox}>
              <Text style={md.codeLabel}>{t('customerWelcomeBonus.yourCode')}</Text>
              <Text style={md.code}>{bonus.claimCode}</Text>
            </View>

            <TouchableOpacity
              style={md.copyBtn}
              onPress={() => handleCopy(bonus.claimCode)}
              accessibilityRole="button"
              accessibilityLabel={copied ? t('customerWelcomeBonus.codeCopiedA11y') : t('customerWelcomeBonus.copyCodeA11y')}
            >
              <Text style={md.copyBtnText}>{copied ? t('customerWelcomeBonus.copied') : t('customerWelcomeBonus.copyCode')}</Text>
            </TouchableOpacity>

            <Text style={md.note}>
              {t('customerWelcomeBonus.note')}
            </Text>

            <TouchableOpacity
              style={md.closeBtn}
              onPress={() => setShowModal(false)}
              accessibilityRole="button"
              accessibilityLabel={t('customerWelcomeBonus.done')}
            >
              <Text style={md.closeBtnText}>{t('customerWelcomeBonus.done')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const st = StyleSheet.create({
  card: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
    shadowColor: GOLD, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22, shadowRadius: 12, elevation: 5,
    borderWidth: 1.5, borderColor: GOLD + '44',
  },
  progressRow: {
    flexDirection: 'row', backgroundColor: '#FEF3C7',
    paddingVertical: 10, paddingHorizontal: 16, gap: 6, justifyContent: 'center',
  },
  dayPill: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB',
    alignItems: 'center', justifyContent: 'center',
  },
  dayPillDone:  { backgroundColor: GREEN, borderColor: GREEN },
  dayPillToday: { backgroundColor: GOLD,  borderColor: GOLD  },
  dayPillText:      { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  dayPillTextToday: { color: '#fff' },

  body: { padding: 16, gap: 10 },
  tag: {
    fontSize: 11, fontWeight: '800', color: GOLD,
    textTransform: 'uppercase', letterSpacing: 0.5,
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20,
  },

  pickTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginTop: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionCard: {
    width: '47%', backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#E5E7EB',
    padding: 12, alignItems: 'center', gap: 4, position: 'relative',
  },
  optionCardActive: { borderColor: GOLD, backgroundColor: '#FFFBEB' },
  optionEmoji: { fontSize: 28 },
  optionLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280', textAlign: 'center' },
  optionLabelActive: { color: '#92400E', fontWeight: '800' },
  checkDot: {
    position: 'absolute', top: 6, right: 6,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 11, fontWeight: '900' },

  btn: {
    backgroundColor: GOLD, borderRadius: 14,
    paddingVertical: 13, alignItems: 'center', marginTop: 4,
  },
  btnDisabled: { opacity: 0.45 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

  // claimed states
  confirmedBox: { alignItems: 'center', paddingVertical: 10, gap: 6 },
  confirmedEmoji: { fontSize: 44 },
  confirmedLabel: { fontSize: 18, fontWeight: '900', color: '#1D3557' },
  confirmedSub: { fontSize: 13, color: GREEN, fontWeight: '700' },

  claimedOptionRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  claimedOptionEmoji: { fontSize: 32 },
  claimedOptionLabel: { fontSize: 16, fontWeight: '800', color: '#1D3557' },

  codeBox: {
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 2, borderColor: GOLD, borderStyle: 'dashed',
    paddingVertical: 12, alignItems: 'center',
  },
  codeLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  code: { fontSize: 32, fontWeight: '900', color: '#1D3557', letterSpacing: 8 },
  codeSub: { fontSize: 12, color: '#9CA3AF', textAlign: 'center' },
  viewBtn: {
    backgroundColor: GOLD, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  viewBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, paddingBottom: 44, alignItems: 'center', gap: 10,
  },
  emoji:  { fontSize: 52, marginBottom: 4 },
  title:  { fontSize: 22, fontWeight: '900', color: '#1D3557' },
  sub:    { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  codeBox: {
    backgroundColor: '#FFFBEB', borderRadius: 16,
    borderWidth: 2, borderColor: GOLD, borderStyle: 'dashed',
    paddingVertical: 18, paddingHorizontal: 40, alignItems: 'center', marginTop: 8,
  },
  codeLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  code: { fontSize: 44, fontWeight: '900', color: '#1D3557', letterSpacing: 10 },
  copyBtn: {
    backgroundColor: '#F3F4F6', borderRadius: 12,
    paddingVertical: 10, paddingHorizontal: 24, marginTop: 4,
  },
  copyBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  note: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 17, marginTop: 4 },
  closeBtn: {
    backgroundColor: COLORS.primary, borderRadius: 14,
    paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 4,
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
