import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';
import { COLORS } from '../constants';

// An invite link (luckystop://invite?code=ABC234, from luckystop.cliffindus.com/invite) opens here: the code is kept for the sign-up
// screen, which fills it in. Someone already signed in as a customer goes to Invite friends, where a new account can still add it.
export const PENDING_INVITE_KEY = 'pending_invite_code';
// Also kept in memory at once: on a cold start the sign-up screen can open before the saved copy is written
export const pendingInvite = { code: '' };

export default function InviteLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const user = useAuthStore((s) => s.user);
  const now = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
  if (now) pendingInvite.code = now;
  useEffect(() => {
    const c = String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10);
    (async () => {
      if (c) await AsyncStorage.setItem(PENDING_INVITE_KEY, c).catch(() => {});
      router.replace(user?.role === 'CUSTOMER' ? '/(customer)/invite-friends' : '/');
    })();
  }, [code, user?.role]);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );
}
