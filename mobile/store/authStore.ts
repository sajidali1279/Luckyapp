import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';

export type UserRole = 'DEV_ADMIN' | 'SUPER_ADMIN' | 'STORE_MANAGER' | 'EMPLOYEE' | 'CUSTOMER';

export interface AuthUser {
  id: string;
  phone: string;
  name?: string;
  role: UserRole;
  qrCode?: string;
  pointsBalance?: number;
  storeIds?: string[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  setAuth: (user: AuthUser, token: string) => Promise<void>;
  logout: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
  updateBalance: (newBalance: number) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isLoading: true,

  setAuth: async (user, token) => {
    await SecureStore.setItemAsync('jwt_token', token);
    await SecureStore.setItemAsync('user_data', JSON.stringify(user));
    set({ user, token, isLoading: false });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync('jwt_token');
    await SecureStore.deleteItemAsync('user_data');
    set({ user: null, token: null, isLoading: false });
  },

  loadFromStorage: async () => {
    try {
      const [token, userData] = await Promise.all([
        SecureStore.getItemAsync('jwt_token'),
        SecureStore.getItemAsync('user_data'),
      ]);
      if (token && userData) {
        set({ token, user: JSON.parse(userData), isLoading: false });
      } else {
        set({ isLoading: false });
      }
    } catch {
      set({ isLoading: false });
    }
  },

  updateBalance: (newBalance) =>
    set((state) => ({
      user: state.user ? { ...state.user, pointsBalance: newBalance } : null,
    })),
}));

// Role helpers
export const isEmployee = (role?: UserRole) => ['EMPLOYEE', 'STORE_MANAGER', 'SUPER_ADMIN', 'DEV_ADMIN'].includes(role || '');
export const isAdmin = (role?: UserRole) => ['SUPER_ADMIN', 'DEV_ADMIN'].includes(role || '');
export const isDevAdmin = (role?: UserRole) => role === 'DEV_ADMIN';
