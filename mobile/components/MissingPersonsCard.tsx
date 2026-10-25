// "Help find" on Home (2026-10-18): missing person posters HQ put up for the customer's store (or every store), urgent first. A tap opens
// the poster (app/(customer)/missing/[id].tsx) with the agency's number and 911. Nothing shows when there is no poster. A link under the
// posters opens the request form (missing/request.tsx), with this store, for someone the customer knows.
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { missingApi } from '../services/api';

export interface MissingPoster {
  id: string; name: string; age: number | null; photoUrl: string | null; lastSeenAt: string; lastSeenPlace: string;
  description: string | null; descriptionEs: string | null; agencyName: string; agencyPhone: string; caseNumber: string; sourceUrl: string | null; urgent: boolean;
}

export const seenDate = (iso: string, language?: string) =>
  new Date(iso).toLocaleDateString((language ?? '').startsWith('es') ? 'es-US' : 'en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

export default function MissingPersonsCard({ storeId }: { storeId?: string }) {
  const { t, i18n } = useTranslation();
  const q = useQuery({ queryKey: ['missing-active', storeId ?? ''], queryFn: () => missingApi.active(storeId), staleTime: 5 * 60_000, retry: 1 });
  const posters: MissingPoster[] = q.data?.data?.data ?? [];
  if (posters.length === 0) return null;
  const urgent = posters.some((p) => p.urgent);
  return (
    <View style={st.wrap}>
      <Text style={[st.heading, urgent && st.headingUrgent]}>{urgent ? `⚠ ${t('missing.helpFindUrgent')}` : t('missing.helpFind')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
        {posters.map((p) => (
          <TouchableOpacity key={p.id} style={[st.card, p.urgent && st.cardUrgent, posters.length === 1 && st.cardWide]} activeOpacity={0.85}
            onPress={() => router.push(`/(customer)/missing/${p.id}` as any)} accessibilityRole="button"
            accessibilityLabel={t('missing.openA11y', { name: p.name })}>
            {p.photoUrl ? <Image source={{ uri: p.photoUrl }} style={st.photo} contentFit="cover" /> : <View style={[st.photo, { backgroundColor: '#E5E7EB' }]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              {p.urgent && <Text style={st.urgentTag}>{t('missing.urgent')}</Text>}
              <Text style={st.name} numberOfLines={1}>{p.name}{p.age != null ? `, ${p.age}` : ''}</Text>
              <Text style={st.line} numberOfLines={2}>{t('missing.lastSeen', { date: seenDate(p.lastSeenAt, i18n.language), place: p.lastSeenPlace })}</Text>
              <Text style={st.tap}>{t('missing.tapForPoster')}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <TouchableOpacity onPress={() => router.push({ pathname: '/(customer)/missing/request', params: storeId ? { storeId } : {} } as any)} accessibilityRole="button" style={st.askWrap}>
        <Text style={st.ask}>{t('missingRequest.someoneYouKnow')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { marginTop: 14, marginBottom: 4 },
  heading: { fontSize: 15, fontWeight: '800', color: '#111827', marginHorizontal: 16, marginBottom: 8 },
  headingUrgent: { color: '#B91C1C' },
  card: { flexDirection: 'row', gap: 12, width: 290, padding: 12, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  cardWide: { width: 340 },
  cardUrgent: { borderColor: '#FCA5A5', backgroundColor: '#FEF2F2' },
  photo: { width: 64, height: 78, borderRadius: 10 },
  urgentTag: { alignSelf: 'flex-start', fontSize: 10, fontWeight: '800', color: '#fff', backgroundColor: '#DC2626', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', marginBottom: 2 },
  name: { fontSize: 15, fontWeight: '800', color: '#111827' },
  line: { fontSize: 12, color: '#4B5563', marginTop: 2 },
  tap: { fontSize: 12, fontWeight: '700', color: '#1D4ED8', marginTop: 4 },
  askWrap: { alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 8, paddingVertical: 4 },
  ask: { fontSize: 13, color: '#4B5563', textDecorationLine: 'underline' },
});
