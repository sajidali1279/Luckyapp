// The app's one react-query cache, in its own file so the sign-in store can empty it (_layout.tsx and store/authStore.ts both need it).
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient();
