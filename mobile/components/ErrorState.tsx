import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTranslation } from 'react-i18next';
import { COLORS } from '../constants';

export default function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={s.center}>
      <Text style={s.errorText}>{message ?? t('sharedErrorState.defaultMessage')}</Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={s.retryBtn}
          accessibilityRole="button"
          accessibilityLabel={t('sharedErrorState.retryA11y')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={s.retryText}>{t('sharedErrorState.retry')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 4 },
  errorText: { color: '#EF4444', fontSize: 15, marginBottom: 8, textAlign: 'center' },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: COLORS.primary, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
