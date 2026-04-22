import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Clipboard } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { welcomeBonusApi } from '../services/api';
import { COLORS } from '../constants';

export default function WelcomeBonusCard() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['welcome-bonus'],
    queryFn: () => welcomeBonusApi.getStatus(),
    staleTime: 60_000,
  });

  const bonus = data?.data?.data;

  const claimMut = useMutation({
    mutationFn: () => welcomeBonusApi.claim(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['welcome-bonus'] });
      setShowModal(true);
    },
  });

  if (isLoading || !bonus?.active) return null;

  function handleCopy(code: string) {
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClaim() {
    if (bonus.claimed) {
      setShowModal(true);
    } else {
      claimMut.mutate();
    }
  }

  return (
    <>
      <View style={st.card}>
        {/* Day progress pills */}
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

        {/* Content */}
        <View style={st.body}>
          <View style={st.labelRow}>
            <Text style={st.tag}>🎁 Welcome Bonus · Day {bonus.dayNumber}/7</Text>
          </View>
          <Text style={st.rewardEmoji}>{bonus.rewardEmoji}</Text>
          <Text style={st.rewardLabel}>{bonus.rewardLabel}</Text>
          <Text style={st.sub}>
            {bonus.confirmed
              ? '✅ Confirmed! Enjoy your reward.'
              : bonus.claimed
                ? 'Show the code below to your cashier to claim.'
                : 'Tap to claim your free item for today!'}
          </Text>

          {bonus.claimed && !bonus.confirmed && bonus.claimCode && (
            <View style={st.codeBox}>
              <Text style={st.codeLabel}>YOUR CODE</Text>
              <Text style={st.code}>{bonus.claimCode}</Text>
            </View>
          )}

          {!bonus.confirmed && (
            <TouchableOpacity
              style={[st.btn, (claimMut.isPending) && st.btnDisabled]}
              onPress={handleClaim}
              disabled={claimMut.isPending}
            >
              {claimMut.isPending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={st.btnText}>
                    {bonus.claimed ? 'View Code' : 'Claim Today\'s Reward'}
                  </Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Code modal — shown after claiming */}
      <Modal visible={showModal} transparent animationType="slide" onRequestClose={() => setShowModal(false)}>
        <View style={md.overlay}>
          <View style={md.sheet}>
            <Text style={md.emoji}>{bonus.rewardEmoji || '🎁'}</Text>
            <Text style={md.title}>{bonus.rewardLabel || 'Your Reward'}</Text>
            <Text style={md.sub}>Show this code to your cashier to receive your free item</Text>

            <View style={md.codeBox}>
              <Text style={md.codeLabel}>YOUR CODE</Text>
              <Text style={md.code}>{bonus.claimCode}</Text>
            </View>

            <TouchableOpacity style={md.copyBtn} onPress={() => handleCopy(bonus.claimCode)}>
              <Text style={md.copyBtnText}>{copied ? '✓ Copied!' : 'Copy Code'}</Text>
            </TouchableOpacity>

            <Text style={md.note}>
              This code expires at the end of today. One per day, 7 days from when you joined.
            </Text>

            <TouchableOpacity style={md.closeBtn} onPress={() => setShowModal(false)}>
              <Text style={md.closeBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const GOLD = '#F59E0B';
const GREEN = '#22C55E';

const st = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1.5,
    borderColor: GOLD + '44',
  },
  progressRow: {
    flexDirection: 'row',
    backgroundColor: '#FEF3C7',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 6,
    justifyContent: 'center',
  },
  dayPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayPillDone: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  dayPillToday: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  dayPillText: { fontSize: 11, fontWeight: '700', color: '#9CA3AF' },
  dayPillTextToday: { color: '#fff' },

  body: { padding: 18, alignItems: 'center' },
  labelRow: { marginBottom: 10 },
  tag: {
    fontSize: 11,
    fontWeight: '800',
    color: GOLD,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
  },
  rewardEmoji: { fontSize: 44, marginBottom: 6 },
  rewardLabel: { fontSize: 20, fontWeight: '900', color: '#1D3557', marginBottom: 6 },
  sub: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 14 },

  codeBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: GOLD,
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 32,
    alignItems: 'center',
    marginBottom: 14,
    width: '100%',
  },
  codeLabel: { fontSize: 10, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 },
  code: { fontSize: 36, fontWeight: '900', color: '#1D3557', letterSpacing: 8 },

  btn: {
    backgroundColor: GOLD,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});

const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 28,
    paddingBottom: 44,
    alignItems: 'center',
    gap: 10,
  },
  emoji: { fontSize: 52, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '900', color: '#1D3557' },
  sub: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
  codeBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: GOLD,
    borderStyle: 'dashed',
    paddingVertical: 18,
    paddingHorizontal: 40,
    alignItems: 'center',
    marginTop: 8,
  },
  codeLabel: { fontSize: 11, fontWeight: '800', color: '#9CA3AF', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 },
  code: { fontSize: 44, fontWeight: '900', color: '#1D3557', letterSpacing: 10 },
  copyBtn: {
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 24,
    marginTop: 4,
  },
  copyBtnText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  note: { fontSize: 12, color: '#9CA3AF', textAlign: 'center', lineHeight: 17, marginTop: 4 },
  closeBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: 4,
    width: '100%',
    alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
