import { useCallback, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useFocusEffect } from 'expo-router';
import { Text } from './ScaledText';
import { MegaphoneIcon, XIcon } from './Icons';
import { notificationsApi } from '../services/api';

// HQ's announcement on the customer's Home (2026-11-08): one card for rare, important news (holiday hours, a rule change), sent from
// admin Notifications > Send push with "Also show it as a card on customers' Home screen". It stays for the days HQ chose, or until the
// customer closes it or reads it in the inbox (both mark it read). Nothing shows when there is none.

const BLUE = '#1D4ED8';

interface HomeAnnouncement { id: string; title: string; body: string }

export default function AnnouncementCard() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [closed, setClosed] = useState<string | null>(null);
  const { data, refetch } = useQuery({
    queryKey: ['home-announcement'],
    queryFn: () => notificationsApi.homeAnnouncement(),
    staleTime: 60 * 1000,
  });
  // Home coming back into view: the inbox may have read it meanwhile
  useFocusEffect(useCallback(() => { refetch(); }, [refetch]));

  const item: HomeAnnouncement | null = data?.data?.data ?? null;
  if (!item || item.id === closed) return null;

  function close() {
    setClosed(item!.id);   // gone at once; the server is told in the background
    notificationsApi.markOneRead(item!.id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ['home-announcement'] });
        qc.invalidateQueries({ queryKey: ['unread-count'] });
        qc.invalidateQueries({ queryKey: ['my-notifications'] });
      })
      .catch(() => {});
  }

  return (
    <View style={st.card} accessibilityRole="summary" testID="announcement-card">
      <View style={st.iconWrap}>
        <MegaphoneIcon size={22} color={BLUE} strokeWidth={2} />
      </View>
      <View style={st.body}>
        <Text style={st.label}>{t('announcement.label')}</Text>
        <Text style={st.title}>{item.title}</Text>
        <Text style={st.text}>{item.body}</Text>
      </View>
      <TouchableOpacity
        onPress={close}
        style={st.close}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        accessibilityRole="button"
        accessibilityLabel={t('announcement.closeA11y')}
      >
        <XIcon size={18} color="#64748B" strokeWidth={2} />
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    marginHorizontal: 16, marginBottom: 12, padding: 16,
    backgroundColor: '#EFF6FF', borderRadius: 20, borderWidth: 1.5, borderColor: BLUE + '33',
    ...Platform.select({ ios: { shadowColor: '#0F172A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12 }, default: {} }),
  },
  iconWrap: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  label: { fontSize: 11, fontWeight: '800', color: BLUE, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 },
  title: { fontSize: 16, fontWeight: '800', color: '#0F172A', marginBottom: 4 },
  text: { fontSize: 14, color: '#334155', lineHeight: 20 },
  close: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
});
