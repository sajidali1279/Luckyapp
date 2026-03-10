import { View, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants';

export default function Index() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
