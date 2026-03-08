import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UserRole = 'DEV_ADMIN' | 'SUPER_ADMIN' | 'STORE_MANAGER' | 'EMPLOYEE' | 'CUSTOMER';

interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  role: UserRole;
  storeIds?: string[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  setAuth: (user: AuthUser, token: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('jwt_token', token);
        set({ user, token });
      },
      logout: () => {
        localStorage.removeItem('jwt_token');
        set({ user: null, token: null });
      },
    }),
    { name: 'luckystop-admin-auth', partialize: (s) => ({ user: s.user, token: s.token }) }
  )
);
