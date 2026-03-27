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
  createSuperAdmin: (phone: string, name: string, pin: string) =>
    api.post('/auth/super-admin', { phone, name, pin }),
  createStaff: (phone: string, name: string, pin: string, role: string, storeId: string) =>
    api.post('/auth/staff', { phone, name, pin, role, storeId }),
};

export const billingApi = {
  getAllStores: () => api.get('/billing/stores'),
  getRevenue: () => api.get('/billing/revenue'),
  getAnalytics: (from?: string, to?: string) =>
    api.get(`/billing/analytics${from ? `?from=${from}&to=${to}` : ''}`),
  updateStoreBilling: (storeId: string, data: object) => api.patch(`/billing/stores/${storeId}`, data),
  createRecord: (storeId: string, data: object) => api.post(`/billing/stores/${storeId}/records`, data),
  markPaid: (recordId: string) => api.patch(`/billing/records/${recordId}/paid`),
  markPeriodPaid: (period: string) => api.patch(`/billing/period/${period}/paid`),
  getCategoryRates: () => api.get('/billing/category-rates'),
  updateCategoryRate: (category: string, cashbackRate: number) =>
    api.patch(`/billing/category-rates/${category}`, { cashbackRate }),
  getDevCutRate: () => api.get('/billing/config/dev-cut-rate'),
  updateDevCutRate: (rate: number) => api.put('/billing/config/dev-cut-rate', { rate }),
  generateMonthlyBilling: (period?: string) =>
    api.post(`/billing/generate-monthly${period ? `?period=${period}` : ''}`),
  generateAllMissingBills: () => api.post('/billing/generate-all'),
  seedTestData: () => api.post('/billing/seed-test-data'),
  sendReport: (period?: string) => api.post(`/billing/send-report${period ? `?period=${period}` : ''}`),
  getMonthlyRecords: (period?: string, storeId?: string, isPaid?: boolean) => {
    const params = new URLSearchParams();
    if (period)  params.set('period', period);
    if (storeId) params.set('storeId', storeId);
    if (isPaid !== undefined) params.set('isPaid', String(isPaid));
    const qs = params.toString();
    return api.get(`/billing/monthly-records${qs ? `?${qs}` : ''}`);
  },
};

export const offersApi = {
  create: (formData: FormData) => api.post('/offers', formData),
  update: (offerId: string, data: object) => api.patch(`/offers/${offerId}`, data),
  delete: (offerId: string) => api.delete(`/offers/${offerId}`),
  getActive: () => api.get('/offers'),
  getHistory: () => api.get('/offers/history'),
};

export const bannersApi = {
  create: (formData: FormData) => api.post('/banners', formData),
  delete: (bannerId: string) => api.delete(`/banners/${bannerId}`),
  getActive: () => api.get('/banners'),
};

export const pointsApi = {
  getStoreSummary: (storeId: string) => api.get(`/points/store/${storeId}/summary`),
  getStoreTransactions: (storeId: string, status?: string, page = 1) =>
    api.get(`/points/store/${storeId}?page=${page}${status ? `&status=${status}` : ''}`),
  reject: (transactionId: string) => api.patch(`/points/${transactionId}/reject`),
  getPlatformSummary: () => api.get('/points/platform-summary'),
  getAllTransactions: (params: Record<string, string>) =>
    api.get('/points/all', { params }),
};

export const customersApi = {
  list: (search = '', page = 1) => api.get(`/users/customers?search=${encodeURIComponent(search)}&page=${page}`),
  toggleActive: (userId: string) => api.patch(`/users/${userId}/toggle-active`),
};

export const storesApi = {
  getAll: () => api.get('/stores'),
  update: (storeId: string, data: object) => api.patch(`/stores/${storeId}`, data),
};

export const staffApi = {
  list: () => api.get('/staff'),
  toggleActive: (userId: string) => api.patch(`/users/${userId}/toggle-active`),
  resetPin: (userId: string, newPin: string) => api.patch(`/users/${userId}/reset-pin`, { newPin }),
  addStore: (userId: string, storeId: string) => api.post(`/users/${userId}/stores`, { storeId }),
  removeStore: (userId: string, storeId: string) => api.delete(`/users/${userId}/stores/${storeId}`),
  deleteUser: (userId: string) => api.delete(`/users/${userId}`),
};

export const superAdminApi = {
  getInvoices: () => api.get('/my-invoices'),
  getNotifications: () => api.get('/notifications'),
};

export const auditApi = {
  getLogs: (params?: Record<string, string>) =>
    api.get('/audit/logs', { params }),
  getStats: () => api.get('/audit/stats'),
};

export const schedulingApi = {
  getStoreSchedule: (storeId: string) => api.get(`/schedule/store/${storeId}`),
  getTodayRoster: (storeId: string) => api.get(`/schedule/store/${storeId}/today`),
  assignShift: (data: object) => api.post('/schedule/shifts', data),
  removeShift: (shiftId: string) => api.delete(`/schedule/shifts/${shiftId}`),
  getStoreRequests: (storeId: string) => api.get(`/schedule/store/${storeId}/requests`),
  updateRequest: (requestId: string, status: string) => api.patch(`/schedule/requests/${requestId}`, { status }),
  getStoreEmployees: (storeId: string) => api.get(`/schedule/store/${storeId}/employees`),
  getVacancies: () => api.get('/schedule/vacancies'),
};

export const chatApi = {
  getMyStores: () => api.get('/chat/my-stores'),
  getMessages: (storeId: string, after?: string) =>
    api.get(`/chat/${storeId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  sendMessage: (storeId: string, text: string) =>
    api.post(`/chat/${storeId}/messages`, { text }),
};

export const storeRequestApi = {
  // Manager/admin
  getStoreRequests: (storeId: string, status?: string) =>
    api.get(`/store-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  getPendingCount: () => api.get('/store-requests/pending-count'),
  acknowledge: (requestId: string, note?: string) =>
    api.patch(`/store-requests/${requestId}/acknowledge`, { note }),
};

export default api;
