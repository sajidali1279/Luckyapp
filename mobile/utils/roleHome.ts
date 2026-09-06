import type { Href } from 'expo-router';
import type { AuthUser } from '../store/authStore';

// Where a logged-in user lands when they hit a screen that isn't meant to be
// landed on directly (the bare index route, an unmatched deep link) — same
// role split _layout.tsx's cold-start navigate() uses.
export function getRoleHomeRoute(user: AuthUser | null): Href {
  if (!user) return '/(auth)/login';
  if (['STORE_MANAGER', 'DEV_ADMIN', 'SUPER_ADMIN'].includes(user.role)) return '/(manager)/home';
  if (user.role === 'EMPLOYEE') return '/(employee)/home';
  return '/(customer)/home';
}
