import { TouchableOpacity, StyleProp, ViewStyle } from 'react-native';
import { XIcon } from './Icons';

export default function ModalCloseButton({
  onPress,
  label = 'Close',
  size = 18,
  color = '#6c757d',
  style,
}: {
  onPress: () => void;
  label?: string;
  size?: number;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={style}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <XIcon size={size} color={color} strokeWidth={2} />
    </TouchableOpacity>
  );
}
