import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { useAuthStore, isEmployee } from '../store/authStore';

const queryClient = new QueryClient();

export default function RootLayout() {
  const { loadFromStorage, user, isLoading } = useAuthStore();

  useEffect(() => {
    loadFromStorage();
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace('/(auth)/login');
    } else if (isEmployee(user.role)) {
      router.replace('/(employee)/home');
    } else {
      router.replace('/(customer)/home');
    }
  }, [user, isLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </QueryClientProvider>
  );
}
