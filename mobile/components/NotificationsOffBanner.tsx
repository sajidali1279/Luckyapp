import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTranslation } from 'react-i18next';
import { useNotificationPermission } from '../hooks/useNotificationPermission';
import { BellIcon, XIcon } from './Icons';
import { COLORS } from '../constants';

const SNOOZE_KEY = 'notif-off-banner-snoozed-until';
const SNOOZE_DAYS = 7;

/**
 * Shown only while this phone blocks the app's notifications, with a "Turn on" button. `dismissible` adds an X that hides it for a week
 * (used on the customer home, so someone who switched notifications off on purpose is not asked on every visit); without it the banner
 * stays while notifications are off (the Notifications screen, where it explains an empty or quiet inbox).
 */
export default function NotificationsOffBanner({ dismissible = false }: { dismissible?: boolean }) {
  const { t } = useTranslation();
  const { isOff, turnOn } = useNotificationPermission();
  const [snoozed, setSnoozed] = useState(dismissible);   // hidden until the snooze date is read, so it never flashes

  useEffect(() => {
    if (!dismissible) return;
    AsyncStorage.getItem(SNOOZE_KEY)
      .then((v) => setSnoozed(!!v && Number(v) > Date.now()))
      .catch(() => setSnoozed(false));
  }, [dismissible]);

  if (!isOff || snoozed) return null;

  function snooze() {
    setSnoozed(true);
    AsyncStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 86_400_000)).catch(() => {});
  }

  return (
    <View style={s.banner} accessibilityRole="alert">
      <View style={s.iconWrap}>
        <BellIcon size={18} color="#b91c1c" strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>{t('notifPermission.bannerTitle')}</Text>
        <Text style={s.body}>{t('notifPermission.bannerBody')}</Text>
        <TouchableOpacity
          style={s.btn}
          onPress={turnOn}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('notifPermission.turnOnA11y')}
        >
          <Text style={s.btnText}>{t('notifPermission.turnOn')}</Text>
        </TouchableOpacity>
      </View>
      {dismissible && (
        <TouchableOpacity
          onPress={snooze}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.dismiss}
          accessibilityRole="button"
          accessibilityLabel={t('notifPermission.dismissA11y')}
        >
          <XIcon size={16} color="#991b1b" strokeWidth={2.5} />
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca', borderRadius: 14,
    marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 12,
  },
  iconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#fee2e2', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 14, fontWeight: '800', color: '#991b1b', marginBottom: 2 },
  body: { fontSize: 12.5, color: '#7f1d1d', lineHeight: 18 },
  btn: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: COLORS.primary, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  dismiss: { padding: 2, marginTop: 2 },
});
