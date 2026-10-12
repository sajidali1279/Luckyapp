// "Contact us" (2026-10-12): the phone, email and hours HQ set in admin Settings > App, with buttons to call and email. Nothing set: nothing shown.
import { View, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { useAppSettings } from '../hooks/useAppSettings';

export default function ContactCard() {
  const { t } = useTranslation();
  const { business } = useAppSettings();
  if (!business.supportPhone && !business.supportEmail) return null;
  const tel = business.supportPhone.replace(/[^0-9+]/g, '');
  return (
    <View style={st.card}>
      <Text style={st.title} accessibilityRole="header">{t('contact.title')}</Text>
      {business.supportHours ? <Text style={st.hours}>{business.supportHours}</Text> : null}
      <View style={st.row}>
        {business.supportPhone ? (
          <TouchableOpacity style={st.btn} onPress={() => Linking.openURL(`tel:${tel}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={t('contact.callA11y', { phone: business.supportPhone })}>
            <Ionicons name="call-outline" size={18} color={COLORS.secondary} />
            <Text style={st.btnText}>{business.supportPhone}</Text>
          </TouchableOpacity>
        ) : null}
        {business.supportEmail ? (
          <TouchableOpacity style={st.btn} onPress={() => Linking.openURL(`mailto:${business.supportEmail}`).catch(() => {})} accessibilityRole="button" accessibilityLabel={t('contact.emailA11y', { email: business.supportEmail })}>
            <Ionicons name="mail-outline" size={18} color={COLORS.secondary} />
            <Text style={st.btnText} numberOfLines={1}>{business.supportEmail}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#EEF0F3', padding: 16, marginBottom: 16, gap: 6 },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  hours: { fontSize: 13, color: COLORS.textMuted },
  row: { gap: 8, marginTop: 4 },
  btn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F4F6F8' },
  btnText: { fontSize: 15, fontWeight: '700', color: COLORS.secondary, flexShrink: 1 },
});
