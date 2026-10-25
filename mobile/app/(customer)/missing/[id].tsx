// A missing person poster (2026-10-18): the photo, last seen, description, and the two things a customer can do: call the agency with
// information, or 911 if they see the person now. Lucky Stop takes no tips. A push or the Home card opens it; a poster that has come down
// says so. "Something wrong with this poster?" goes to HQ, who checks it with the police. "Someone you know is missing?" opens the request form.
import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking, Share, Alert, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text } from '../../../components/ScaledText';
import { missingApi } from '../../../services/api';
import { seenDate, type MissingPoster } from '../../../components/MissingPersonsCard';

const phoneText = (d: string) => (d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : d);

export default function MissingPosterScreen() {
  const { t, i18n } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useQuery({ queryKey: ['missing', id], queryFn: () => missingApi.get(String(id)), enabled: !!id, retry: false });
  const p: MissingPoster | undefined = q.data?.data?.data;
  const es = (i18n.language ?? '').startsWith('es');
  const [reporting, setReporting] = useState(false);

  const call = (number: string) => Linking.openURL(`tel:${number}`).catch(() => Toast.show({ type: 'error', text1: t('missing.cannotCall') }));
  const share = () => {
    if (!p) return;
    Share.share({ message: t('missing.shareText', {
      name: p.name, age: p.age != null ? `, ${p.age}` : '', date: seenDate(p.lastSeenAt, i18n.language), place: p.lastSeenPlace,
      agency: p.agencyName, phone: phoneText(p.agencyPhone), link: p.sourceUrl ?? '',
    }).trim() }).catch(() => {});
  };
  const report = () => {
    if (!p) return;
    const send = async (reason: string) => {
      setReporting(true);
      try { await missingApi.report(p.id, reason); Toast.show({ type: 'success', text1: t('missing.reportSent') }); }
      catch { Toast.show({ type: 'error', text1: t('missing.reportFailed') }); }
      finally { setReporting(false); }
    };
    Alert.alert(t('missing.reportTitle'), t('missing.reportBody'), [
      { text: t('missing.reportFound'), onPress: () => send('The person was found') },
      { text: t('missing.reportWrong'), onPress: () => send('The details or the photo are wrong') },
      { text: t('missing.cancel'), style: 'cancel' },
    ]);
  };

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.top}>
        <TouchableOpacity onPress={() => (router.canGoBack() ? router.back() : router.replace('/(customer)/home'))} accessibilityRole="button" accessibilityLabel={t('missing.back')} style={s.back}>
          <Text style={s.backText}>‹ {t('missing.back')}</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>{t('missing.title')}</Text>
      </View>
      {q.isLoading ? <View style={s.center}><ActivityIndicator /></View> : !p ? (
        <View style={s.center}><Text style={s.gone}>{t('missing.gone')}</Text></View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {p.urgent && <Text style={s.urgent}>⚠ {t('missing.urgentBanner')}</Text>}
          {p.photoUrl && <Image source={{ uri: p.photoUrl }} style={s.photo} contentFit="cover" accessibilityLabel={t('missing.photoA11y', { name: p.name })} />}
          <Text style={s.name}>{p.name}</Text>
          {p.age != null && <Text style={s.age}>{t('missing.age', { age: p.age })}</Text>}
          <Text style={s.seen}>{t('missing.lastSeen', { date: seenDate(p.lastSeenAt, i18n.language), place: p.lastSeenPlace })}</Text>
          {(es ? p.descriptionEs || p.description : p.description) ? (
            <View style={s.box}>
              <Text style={s.boxTitle}>{t('missing.description')}</Text>
              <Text style={s.boxText}>{es ? p.descriptionEs || p.description : p.description}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={s.call911} onPress={() => call('911')} accessibilityRole="button">
            <Text style={s.call911Text}>{t('missing.call911')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.callAgency} onPress={() => call(p.agencyPhone)} accessibilityRole="button">
            <Text style={s.callAgencyText}>{t('missing.callAgency', { agency: p.agencyName })}</Text>
            <Text style={s.callAgencySub}>{phoneText(p.agencyPhone)} · {t('missing.caseNumber', { number: p.caseNumber })}</Text>
          </TouchableOpacity>
          <Text style={s.note}>{t('missing.tipsNote')}</Text>
          <View style={s.row}>
            <TouchableOpacity style={s.link} onPress={share} accessibilityRole="button"><Text style={s.linkText}>{t('missing.share')}</Text></TouchableOpacity>
            {p.sourceUrl ? <TouchableOpacity style={s.link} onPress={() => Linking.openURL(p.sourceUrl!)} accessibilityRole="link"><Text style={s.linkText}>{t('missing.officialAlert')}</Text></TouchableOpacity> : null}
          </View>
          <TouchableOpacity onPress={report} disabled={reporting} accessibilityRole="button" style={{ marginTop: 18, alignSelf: 'center' }}>
            <Text style={s.report}>{reporting ? '…' : t('missing.reportLink')}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/(customer)/missing/request' as any)} accessibilityRole="button" style={{ marginTop: 10, alignSelf: 'center' }}>
            <Text style={s.report}>{t('missingRequest.someoneYouKnow')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  back: { paddingVertical: 4, paddingRight: 12 },
  backText: { fontSize: 16, fontWeight: '700', color: '#1D4ED8' },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  gone: { fontSize: 15, color: '#4B5563', textAlign: 'center' },
  urgent: { backgroundColor: '#DC2626', color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center', paddingVertical: 8, borderRadius: 10, overflow: 'hidden', marginBottom: 12 },
  photo: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, backgroundColor: '#E5E7EB' },
  name: { fontSize: 26, fontWeight: '900', color: '#111827', marginTop: 14 },
  age: { fontSize: 16, fontWeight: '700', color: '#374151', marginTop: 2 },
  seen: { fontSize: 15, color: '#374151', marginTop: 8, lineHeight: 21 },
  box: { marginTop: 14, padding: 14, borderRadius: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  boxTitle: { fontSize: 13, fontWeight: '800', color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' },
  boxText: { fontSize: 15, color: '#111827', lineHeight: 21 },
  call911: { marginTop: 18, backgroundColor: '#DC2626', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  call911Text: { color: '#fff', fontSize: 17, fontWeight: '900' },
  callAgency: { marginTop: 10, backgroundColor: '#1D3557', borderRadius: 14, paddingVertical: 14, alignItems: 'center', paddingHorizontal: 12 },
  callAgencyText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  callAgencySub: { color: '#CBD5E1', fontSize: 13, marginTop: 2 },
  note: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginTop: 12, lineHeight: 18 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 18, marginTop: 14, flexWrap: 'wrap' },
  link: { paddingVertical: 6 },
  linkText: { fontSize: 15, fontWeight: '700', color: '#1D4ED8' },
  report: { fontSize: 13, color: '#6B7280', textDecorationLine: 'underline' },
});
