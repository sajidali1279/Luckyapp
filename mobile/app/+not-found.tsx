import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../constants';
import { useAuthStore } from '../store/authStore';
import { getRoleHomeRoute } from '../utils/roleHome';

// Reached when a deep link (or a stray OS-level scheme probe, e.g. a bare
// `luckystop:///`) doesn't match any registered route. Rather than exposing
// Expo Router's raw "Unmatched Route" debug screen to end users, silently
// send them to whichever screen they'd land on anyway.
export default function NotFound() {
  const { user } = useAuthStore();

  useEffect(() => {
    router.replace(getRoleHomeRoute(user));
  }, [user]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
