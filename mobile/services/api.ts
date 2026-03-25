import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import { API_URL } from '../constants';

async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const token = await SecureStore.getItemAsync('jwt_token');
  return fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...(options.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
}

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
  uploadReceipt: async (transactionId: string, receiptFile: FormData) => {
    const res = await fetchWithAuth(`/points/grant/${transactionId}/receipt`, { method: 'POST', body: receiptFile as any });
    const json = await res.json();
    if (!res.ok) throw { response: { data: json, status: res.status } };
    return { data: json };
  },
  redeemCredits: (data: { customerQrCode: string; storeId: string; amount: number }) =>
    api.post('/points/redeem', data),
  getStoreTransactions: (storeId: string, page = 1, status?: string) =>
    api.get(`/points/store/${storeId}?page=${page}${status ? `&status=${status}` : ''}`),
  rejectTransaction: (transactionId: string) =>
    api.patch(`/points/${transactionId}/reject`),
};

export const receiptApi = {
  getToken: (tokenId: string) => api.get(`/points/receipt-token/${tokenId}`),
  selfGrant: (tokenId: string) => api.post('/points/self-grant', { tokenId }),
};

export const offersApi = {
  getActive: (storeId?: string) =>
    api.get(`/offers${storeId ? `?storeId=${storeId}` : ''}`),
  getBanners: (storeId?: string) =>
    api.get(`/banners${storeId ? `?storeId=${storeId}` : ''}`),
};

export const schedulingApi = {
  // Employee
  getMySchedule: () => api.get('/schedule/my'),
  createRequest: (data: object) => api.post('/schedule/requests', data),
  // Manager
  getStoreSchedule: (storeId: string) => api.get(`/schedule/store/${storeId}`),
  getTodayRoster: (storeId: string) => api.get(`/schedule/store/${storeId}/today`),
  getStoreRequests: (storeId: string) => api.get(`/schedule/store/${storeId}/requests`),
  updateRequest: (requestId: string, status: 'APPROVED' | 'DENIED') =>
    api.patch(`/schedule/requests/${requestId}`, { status }),
  getStoreEmployees: (storeId: string) => api.get(`/schedule/store/${storeId}/employees`),
  getDayRoster: (storeId: string, date: string) =>
    api.get(`/schedule/store/${storeId}/day?date=${encodeURIComponent(date)}`),
};

export const managerApi = {
  createOffer: (data: object) => api.post('/offers', data),
  deleteOffer: (offerId: string) => api.delete(`/offers/${offerId}`),
  createBanner: async (formData: FormData) => {
    const res = await fetchWithAuth('/banners', { method: 'POST', body: formData as any });
    const json = await res.json();
    if (!res.ok) throw { response: { data: json, status: res.status } };
    return { data: json };
  },
  deleteBanner: (bannerId: string) => api.delete(`/banners/${bannerId}`),
  getStoreStats: (storeId: string) =>
    api.get(`/points/store/${storeId}/summary`),
};

