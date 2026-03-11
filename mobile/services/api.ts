import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../constants';

const api = axios.create({ baseURL: API_URL });

// Attach JWT to every request automatically
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('jwt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-handle 401 (token expired — log user out)
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('jwt_token');
      // Navigation to login handled by auth store
    }
    return Promise.reject(error);
  }
);

export default api;

// ─── API Methods ──────────────────────────────────────────────────────────────

export const authApi = {
  register: (phone: string, pin: string, name: string) =>
    api.post('/auth/register', { phone, pin, name }),
  login: (phone: string, pin: string, pushToken?: string, platform?: string) =>
    api.post('/auth/login', { phone, pin, pushToken, platform }),
  updateProfile: (name: string) =>
    api.patch('/auth/profile', { name }),
  changePin: (currentPin: string, newPin: string) =>
    api.patch('/auth/pin', { currentPin, newPin }),
  registerPushToken: (token: string, platform: string) =>
    api.post('/auth/push-token', { token, platform }),
  getMe: () => api.get('/auth/me'),
};

export const pointsApi = {
  getMyHistory: (page = 1) =>
    api.get(`/points/my-history?page=${page}`),
  initiateGrant: (data: { customerQrCode: string; storeId: string; purchaseAmount: number; category?: string; notes?: string }) =>
    api.post('/points/grant', data),
  uploadReceipt: (transactionId: string, receiptFile: FormData) =>
    api.post(`/points/grant/${transactionId}/receipt`, receiptFile, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  redeemCredits: (data: { customerQrCode: string; storeId: string; amount: number }) =>
    api.post('/points/redeem', data),
  getStoreTransactions: (storeId: string, page = 1, status?: string) =>
    api.get(`/points/store/${storeId}?page=${page}${status ? `&status=${status}` : ''}`),
  rejectTransaction: (transactionId: string) =>
    api.patch(`/points/${transactionId}/reject`),
};

export const offersApi = {
  getActive: (storeId?: string) =>
    api.get(`/offers${storeId ? `?storeId=${storeId}` : ''}`),
  getBanners: (storeId?: string) =>
    api.get(`/banners${storeId ? `?storeId=${storeId}` : ''}`),
};

