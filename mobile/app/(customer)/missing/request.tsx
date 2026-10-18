// Ask HQ to post a missing person (2026-10-18). Call 911 first: HQ only posts a person the police have a report for, so the case number and
// the police department are required, and HQ checks them with the agency before anything shows. One open request at a time; while it is
// open this screen says HQ is checking it. The requester is told by push when HQ posts it or declines it. Backend: requestMissing.
import { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Linking, Platform, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import { Text, TextInput } from '../../../components/ScaledText';
import KeyboardSafe from '../../../components/KeyboardSafe';
import { missingApi } from '../../../services/api';
import { seenDate } from '../../../components/MissingPersonsCard';

const RELATIONSHIPS = ['FAMILY', 'FRIEND', 'OTHER'] as const;
type Relationship = typeof RELATIONSHIPS[number];
const digits = (v: string) => v.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');

export default function MissingRequestScreen() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { storeId } = useLocalSearchParams<{ storeId?: string }>();
  const mine = useQuery({ queryKey: ['missing-request-mine'], queryFn: () => missingApi.mine(), retry: 1 });
  const open: { id: string; name: string; createdAt: string } | null = mine.data?.data?.data ?? null;

  const [photo, setPhoto] = useState<{ uri: string; type: string } | null>(null);
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [seenOn, setSeenOn] = useState<Date | null>(null);
  const [picking, setPicking] = useState(false);
  const [place, setPlace] = useState('');
  const [description, setDescription] = useState('');
  const [agency, setAgency] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [agencyPhone, setAgencyPhone] = useState('');
  const [relationship, setRelationship] = useState<Relationship | null>(null);
  const [contactPhone, setContactPhone] = useState('');
  const [reported, setReported] = useState(false);
  const [sending, setSending] = useState(false);

  const back = () => (router.canGoBack() ? router.back() : router.replace('/(customer)/home'));
  const call911 = () => Linking.openURL('tel:911').catch(() => Toast.show({ type: 'error', text1: t('missing.cannotCall') }));
  const choosePhoto = () => {
    const take = async (camera: boolean) => {
      const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], allowsEditing: true, aspect: [4, 5], quality: 0.6, exif: false };
      if (camera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Toast.show({ type: 'error', text1: t('missingRequest.cameraDenied') }); return; }
      }
      const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
      const a = r.canceled ? null : r.assets?.[0];
      if (a) setPhoto({ uri: a.uri, type: a.mimeType ?? 'image/jpeg' });
    };
    Alert.alert(t('missingRequest.photo'), undefined, [
      { text: t('missingRequest.fromPhotos'), onPress: () => take(false) },
      { text: t('missingRequest.takePhoto'), onPress: () => take(true) },
      { text: t('missing.cancel'), style: 'cancel' },
    ]);
  };

  const phoneBad = (v: string) => v.trim() !== '' && digits(v).length !== 10;
  const missing = !photo ? 'photo' : !name.trim() ? 'name' : !seenOn ? 'date' : !place.trim() ? 'place' : !agency.trim() ? 'agency'
    : caseNumber.trim().length < 3 ? 'case' : phoneBad(agencyPhone) ? 'agencyPhone' : !relationship ? 'relationship' : phoneBad(contactPhone) ? 'contactPhone' : !reported ? 'reported' : null;

  const send = async () => {
    if (missing) { Toast.show({ type: 'error', text1: t(`missingRequest.need.${missing}`) }); return; }
    setSending(true);
    try {
      await missingApi.request({
        name: name.trim(), age, lastSeenAt: new Date(seenOn!.getFullYear(), seenOn!.getMonth(), seenOn!.getDate(), 12).toISOString(), lastSeenPlace: place.trim(),
        description: description.trim(), agencyName: agency.trim(), caseNumber: caseNumber.trim(), agencyPhone, relationship: relationship!, contactPhone,
        storeId: typeof storeId === 'string' ? storeId : '', policeReported: 'true',
      }, photo!);
      qc.invalidateQueries({ queryKey: ['missing-request-mine'] });
      Toast.show({ type: 'success', text1: t('missingRequest.sent'), text2: t('missingRequest.sentSub') });
      back();
    } catch (e: any) {
      const status = e?.response?.status;
      const key = status === 409 ? 'alreadyOpen' : status === 429 ? 'tooMany' : status === 403 ? 'restricted' : null;
      Toast.show({ type: 'error', text1: key ? t(`missingRequest.${key}`) : e?.response?.data?.error ?? t('missingRequest.failed') });
    } finally { setSending(false); }
  };

  const today = new Date();
  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.top}>
        <TouchableOpacity onPress={back} accessibilityRole="button" accessibilityLabel={t('missing.back')} style={s.backBtn}>
          <Text style={s.backText}>‹ {t('missing.back')}</Text>
        </TouchableOpacity>
        <Text style={s.topTitle}>{t('missingRequest.title')}</Text>
      </View>
      <KeyboardSafe style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <View style={s.first}>
            <Text style={s.firstTitle}>{t('missingRequest.call911First')}</Text>
            <Text style={s.firstBody}>{t('missingRequest.onlyPolice')}</Text>
            <TouchableOpacity style={s.call911} onPress={call911} accessibilityRole="button"><Text style={s.call911Text}>{t('missingRequest.call911')}</Text></TouchableOpacity>
          </View>

          {mine.isLoading ? <ActivityIndicator style={{ marginTop: 24 }} /> : open ? (
            <View style={s.openBox}>
              <Text style={s.openTitle}>{t('missingRequest.checkingTitle')}</Text>
              <Text style={s.openBody}>{t('missingRequest.checkingBody', { name: open.name, date: seenDate(open.createdAt, i18n.language) })}</Text>
            </View>
          ) : (
            <>
              <Text style={s.intro}>{t('missingRequest.intro')}</Text>

              <Text style={s.label}>{t('missingRequest.photo')} *</Text>
              <TouchableOpacity style={s.photoBtn} onPress={choosePhoto} accessibilityRole="button" accessibilityLabel={t('missingRequest.photo')}>
                {photo ? <Image source={{ uri: photo.uri }} style={s.photo} contentFit="cover" /> : <Text style={s.photoHint}>{t('missingRequest.addPhoto')}</Text>}
              </TouchableOpacity>

              <Text style={s.label}>{t('missingRequest.name')} *</Text>
              <TextInput style={s.input} value={name} onChangeText={setName} maxLength={80} autoCapitalize="words" />
              <Text style={s.label}>{t('missingRequest.age')}</Text>
              <TextInput style={[s.input, { width: 100 }]} value={age} onChangeText={(v) => setAge(v.replace(/\D/g, '').slice(0, 3))} keyboardType="number-pad" />

              <Text style={s.label}>{t('missingRequest.lastSeenOn')} *</Text>
              {Platform.OS === 'ios' ? (
                <View style={{ alignItems: 'flex-start' }}>
                  <DateTimePicker value={seenOn ?? today} mode="date" display="compact" maximumDate={today} themeVariant="light"
                    locale={i18n.language === 'es' ? 'es-US' : 'en-US'} onChange={(_e, d) => d && setSeenOn(d)} />
                  {!seenOn && <Text style={s.hint}>{t('missingRequest.pickDate')}</Text>}
                </View>
              ) : (
                <>
                  <TouchableOpacity style={s.input} onPress={() => setPicking(true)} accessibilityRole="button">
                    <Text style={{ color: seenOn ? '#111827' : '#9CA3AF', fontSize: 15 }}>{seenOn ? seenDate(seenOn.toISOString(), i18n.language) : t('missingRequest.pickDate')}</Text>
                  </TouchableOpacity>
                  {picking && <DateTimePicker value={seenOn ?? today} mode="date" maximumDate={today} onChange={(e, d) => { setPicking(false); if (e.type === 'set' && d) setSeenOn(d); }} />}
                </>
              )}
              <Text style={s.label}>{t('missingRequest.lastSeenAt')} *</Text>
              <TextInput style={s.input} value={place} onChangeText={setPlace} maxLength={120} placeholder={t('missingRequest.lastSeenAtHint')} placeholderTextColor="#9CA3AF" />
              <Text style={s.label}>{t('missingRequest.description')}</Text>
              <TextInput style={[s.input, { minHeight: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} maxLength={600} multiline
                placeholder={t('missingRequest.descriptionHint')} placeholderTextColor="#9CA3AF" />

              <Text style={s.section}>{t('missingRequest.policeReport')}</Text>
              <Text style={s.label}>{t('missingRequest.agency')} *</Text>
              <TextInput style={s.input} value={agency} onChangeText={setAgency} maxLength={80} placeholder={t('missingRequest.agencyHint')} placeholderTextColor="#9CA3AF" />
              <Text style={s.label}>{t('missingRequest.caseNumber')} *</Text>
              <TextInput style={s.input} value={caseNumber} onChangeText={setCaseNumber} maxLength={40} autoCapitalize="characters" />
              <Text style={s.label}>{t('missingRequest.agencyPhone')}</Text>
              <TextInput style={s.input} value={agencyPhone} onChangeText={setAgencyPhone} keyboardType="phone-pad" maxLength={20} />

              <Text style={s.section}>{t('missingRequest.aboutYou')}</Text>
              <Text style={s.label}>{t('missingRequest.relationship')} *</Text>
              <View style={s.chips}>
                {RELATIONSHIPS.map((r) => (
                  <TouchableOpacity key={r} style={[s.chip, relationship === r && s.chipOn]} onPress={() => setRelationship(r)} accessibilityRole="radio" accessibilityState={{ selected: relationship === r }}>
                    <Text style={[s.chipText, relationship === r && s.chipTextOn]}>{t(`missingRequest.rel.${r}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.label}>{t('missingRequest.contactPhone')}</Text>
              <TextInput style={s.input} value={contactPhone} onChangeText={setContactPhone} keyboardType="phone-pad" maxLength={20} placeholder={t('missingRequest.contactPhoneHint')} placeholderTextColor="#9CA3AF" />
              <Text style={s.hint}>{t('missingRequest.contactPrivate')}</Text>

              <TouchableOpacity style={s.tick} onPress={() => setReported((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: reported }}>
                <View style={[s.box, reported && s.boxOn]}>{reported && <Text style={s.boxMark}>✓</Text>}</View>
                <Text style={s.tickText}>{t('missingRequest.confirm')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[s.send, (sending || !!missing) && { opacity: 0.6 }]} onPress={send} disabled={sending} accessibilityRole="button">
                {sending ? <ActivityIndicator color="#fff" /> : <Text style={s.sendText}>{t('missingRequest.send')}</Text>}
              </TouchableOpacity>
              <Text style={s.hint}>{t('missingRequest.whatNext')}</Text>
            </>
          )}
        </ScrollView>
      </KeyboardSafe>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  top: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  backBtn: { paddingVertical: 4, paddingRight: 12 },
  backText: { fontSize: 16, fontWeight: '700', color: '#1D4ED8' },
  topTitle: { fontSize: 16, fontWeight: '800', color: '#111827', flexShrink: 1 },
  first: { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1, borderRadius: 14, padding: 14 },
  firstTitle: { fontSize: 17, fontWeight: '900', color: '#B91C1C' },
  firstBody: { fontSize: 14, color: '#7F1D1D', marginTop: 4, lineHeight: 20 },
  call911: { marginTop: 10, backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  call911Text: { color: '#fff', fontSize: 16, fontWeight: '900' },
  openBox: { marginTop: 16, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1, borderRadius: 14, padding: 14 },
  openTitle: { fontSize: 16, fontWeight: '800', color: '#1E3A8A' },
  openBody: { fontSize: 14, color: '#1E40AF', marginTop: 4, lineHeight: 20 },
  intro: { fontSize: 14, color: '#374151', marginTop: 16, lineHeight: 20 },
  section: { fontSize: 13, fontWeight: '800', color: '#6B7280', marginTop: 24, textTransform: 'uppercase', letterSpacing: 0.5 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: '#111827' },
  hint: { fontSize: 12, color: '#6B7280', marginTop: 6, lineHeight: 17 },
  photoBtn: { width: 140, height: 175, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9CA3AF', backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  photoHint: { fontSize: 13, fontWeight: '700', color: '#1D4ED8', textAlign: 'center', paddingHorizontal: 10 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#fff' },
  chipOn: { backgroundColor: '#1D3557', borderColor: '#1D3557' },
  chipText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#fff' },
  tick: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 20, padding: 12, borderRadius: 12, backgroundColor: '#FFF7ED', borderWidth: 1, borderColor: '#FED7AA' },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: '#9CA3AF', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginTop: 1 },
  boxOn: { backgroundColor: '#1D3557', borderColor: '#1D3557' },
  boxMark: { color: '#fff', fontSize: 14, fontWeight: '900', lineHeight: 16 },
  tickText: { flex: 1, fontSize: 14, color: '#111827', lineHeight: 20, fontWeight: '600' },
  send: { marginTop: 18, backgroundColor: '#1D3557', borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  sendText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
