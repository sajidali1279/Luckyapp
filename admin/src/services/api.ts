import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const authApi = {
  login: (phone: string, pin: string) => api.post('/auth/login', { phone, pin }),
};

export const billingApi = {
  getAllStores: () => api.get('/billing/stores'),
  getRevenue: () => api.get('/billing/revenue'),
  updateStoreBilling: (storeId: string, data: object) => api.patch(`/billing/stores/${storeId}`, data),
  createRecord: (storeId: string, data: object) => api.post(`/billing/stores/${storeId}/records`, data),
  markPaid: (recordId: string) => api.patch(`/billing/records/${recordId}/paid`),
};

export const offersApi = {
  create: (formData: FormData) => api.post('/offers', formData),
  update: (offerId: string, data: object) => api.patch(`/offers/${offerId}`, data),
  delete: (offerId: string) => api.delete(`/offers/${offerId}`),
  getActive: () => api.get('/offers'),
};

export const bannersApi = {
  create: (formData: FormData) => api.post('/banners', formData),
  delete: (bannerId: string) => api.delete(`/banners/${bannerId}`),
  getActive: () => api.get('/banners'),
};

export const pointsApi = {
  getStoreTransactions: (storeId: string, status?: string, page = 1) =>
    api.get(`/points/store/${storeId}?page=${page}${status ? `&status=${status}` : ''}`),
  reject: (transactionId: string) => api.patch(`/points/${transactionId}/reject`),
};

export const storesApi = {
  getAll: () => api.get('/billing/stores'),
};

export default api;
