// English | Español, for the screens before sign-in. The app starts in English and the language was only in Profile, so a
// Spanish-speaking customer met the welcome slides and the sign-in screen in English. The choice is saved, as Profile saves it.
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, setLanguage, type LanguageCode } from '../i18n';

export default function LanguageSwitch({ dark = false }: { dark?: boolean }) {
  const { i18n } = useTranslation();
  const current = (i18n.language as LanguageCode) || 'en';
  return (
    <View style={[s.row, dark && s.rowDark]} accessibilityRole="radiogroup">
      {LANGUAGES.map((l) => {
        const on = l.code === current;
        return (
          <TouchableOpacity
            key={l.code}
            style={[s.pill, on && (dark ? s.pillOnDark : s.pillOn)]}
            onPress={() => { if (!on) setLanguage(l.code); }}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={l.nativeLabel}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Text style={[s.text, dark && s.textDark, on && (dark ? s.textOnDark : s.textOn)]}>{l.nativeLabel}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'center', backgroundColor: '#eef1f5', borderRadius: 999, padding: 3, gap: 2 },
  rowDark: { backgroundColor: 'rgba(255,255,255,0.14)' },
  pill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  pillOn: { backgroundColor: '#fff' },
  pillOnDark: { backgroundColor: '#fff' },
  text: { fontSize: 13, fontWeight: '600', color: '#5a6472' },
  textDark: { color: 'rgba(255,255,255,0.85)' },
  textOn: { color: '#1D3557' },
  textOnDark: { color: '#1D3557' },
});
