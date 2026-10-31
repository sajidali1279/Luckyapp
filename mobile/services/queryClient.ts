// The app's one react-query cache, in its own file so the sign-in store can empty it (_layout.tsx and store/authStore.ts both need it).
import { AppState } from 'react-native';
import { focusManager, QueryClient } from '@tanstack/react-query';

// React Native has no browser window to tell react-query when the app is in front, so every repeating check (refetchInterval) kept
// running with the app in the background (2026-10-31). The app's state is the focus now: polls pause in the background and carry on
// when it is back. Refreshing everything on coming back stays off (it would also reload forms filled from the server).
focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener('change', (state) => handleFocus(state === 'active'));
  return () => sub.remove();
});

export const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } });
