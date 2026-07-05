import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeftIcon } from './Icons';
import { COLORS } from '../constants';

export default function BackButton({
  onPress,
  variant = 'dark',
  style,
}: {
  onPress?: () => void;
  variant?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}) {
  const isLight = variant === 'light';
  return (
    <TouchableOpacity
      onPress={onPress ?? (() => router.back())}
      style={[s.btn, { backgroundColor: isLight ? 'rgba(255,255,255,0.15)' : '#f1f5f9' }, style]}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <ChevronLeftIcon size={22} color={isLight ? '#fff' : COLORS.text} strokeWidth={2.5} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
});
