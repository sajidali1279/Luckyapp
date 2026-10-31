import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '../constants';
import { useAuthStore } from '../store/authStore';
import { getRoleHomeRoute } from '../utils/roleHome';

// Normally never seen, _layout.tsx's cold-start navigate() replaces this
// with the real destination as soon as auth state resolves. But a deep link
// that resolves to an empty path (e.g. a bare `luckystop:///`) lands here
// directly mid-session, after that one-time effect has already fired, so
// this needs its own escape hatch rather than sitting on the spinner forever.
export default function Index() {
  const { user, isLoading } = useAuthStore();

  useEffect(() => {
    if (isLoading) return;
    router.replace(getRoleHomeRoute(user));
  }, [user?.id, user?.role, isLoading]);   // not the object: a balance refresh makes a new one

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator size="large" color={COLORS.primary} />
    </View>
  );
}
