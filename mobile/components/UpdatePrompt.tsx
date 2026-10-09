import { useEffect, useRef, useState } from 'react';
import { AppState, Modal, View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text } from './ScaledText';
import { COLORS } from '../constants';
import { checkForUpdate, dismissUpdate, openStore, installedVersion, type UpdateState } from '../utils/appUpdate';
import { haptic } from '../utils/haptics';

const CHECK_EVERY_MS = 60 * 60_000;   // coming back to the front asks again at most once an hour

/** "A new version is ready" (Not now allowed) or "Please update" (nothing else opens), from utils/appUpdate.ts. */
export default function UpdatePrompt() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<UpdateState>({ kind: 'none' });
  const lastCheck = useRef(0);

  useEffect(() => {
    const run = () => {
      if (Date.now() - lastCheck.current < CHECK_EVERY_MS) return;
      lastCheck.current = Date.now();
      checkForUpdate().then(setState);
    };
    run();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // Required stays required until they update; check again right away so it clears once they have
      if (state.kind === 'required') lastCheck.current = 0;
      run();
    });
    return () => sub.remove();
  }, [state.kind]);

  if (state.kind === 'none') return null;
  const required = state.kind === 'required';
  const update = () => { haptic.press(); openStore(state.storeUrl); };
  const later = () => { haptic.tap(); dismissUpdate(state.latest); setState({ kind: 'none' }); };

  return (
    <Modal visible transparent={!required} animationType={required ? 'fade' : 'slide'} statusBarTranslucent
      onRequestClose={required ? () => {} : later}>
      <View style={required ? [s.full, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }] : s.backdrop}>
        <View style={required ? s.fullBody : [s.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={[s.iconWrap, required && s.iconWrapRequired]}>
            <Ionicons name={required ? 'alert-circle' : 'sparkles'} size={30} color={required ? COLORS.primary : COLORS.secondary} />
          </View>
          <Text style={s.title} accessibilityRole="header">{required ? t('appUpdate.requiredTitle') : t('appUpdate.availableTitle')}</Text>
          <Text style={s.body}>{required ? t('appUpdate.requiredBody') : t('appUpdate.availableBody')}</Text>
          <Text style={s.version}>{t('appUpdate.versions', { mine: installedVersion() ?? '?', latest: state.latest })}</Text>
          <TouchableOpacity style={s.primaryBtn} onPress={update} accessibilityRole="button" activeOpacity={0.85}>
            <Text style={s.primaryText}>{t('appUpdate.update')}</Text>
          </TouchableOpacity>
          {!required && (
            <TouchableOpacity style={s.laterBtn} onPress={later} accessibilityRole="button">
              <Text style={s.laterText}>{t('appUpdate.notNow')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: COLORS.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 24, paddingTop: 24, alignItems: 'center' },
  full: { flex: 1, backgroundColor: COLORS.white, justifyContent: 'center', paddingHorizontal: 28 },
  fullBody: { alignItems: 'center' },
  iconWrap: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#EEF2F7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  iconWrapRequired: { backgroundColor: '#FDECEE' },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  body: { fontSize: 15, color: COLORS.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  version: { fontSize: 13, color: COLORS.textMuted, marginTop: 10, textAlign: 'center' },
  primaryBtn: { marginTop: 20, backgroundColor: COLORS.primary, borderRadius: 14, paddingVertical: 15, alignSelf: 'stretch', alignItems: 'center' },
  primaryText: { color: COLORS.white, fontSize: 16, fontWeight: '800' },
  laterBtn: { marginTop: 6, paddingVertical: 12, alignSelf: 'stretch', alignItems: 'center' },
  laterText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '600' },
});
