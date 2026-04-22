import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 — clears auth state and redirects to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('luckystop-admin-auth');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export const authApi = {
  login: (phone: string, pin: string) => api.post('/auth/login', { phone, pin }),
  createSuperAdmin: (phone: string, name: string, pin: string) =>
    api.post('/auth/super-admin', { phone, name, pin }),
  createStaff: (phone: string, name: string, pin: string, role: string, storeId: string) =>
    api.post('/auth/staff', { phone, name, pin, role, storeId }),
  forgotPin: (phone: string, email?: string) => api.post('/auth/forgot-pin', { phone, email }),
  verifyOtp: (phone: string, code: string) => api.post('/auth/verify-otp', { phone, code }),
  resetPin: (resetToken: string, newPin: string) => api.post('/auth/reset-pin', { resetToken, newPin }),
  updateProfile: (name: string) => api.patch('/auth/profile', { name }),
  changePin: (currentPin: string, newPin: string) => api.patch('/auth/pin', { currentPin, newPin }),
  updateEmail: (email: string) => api.patch('/auth/email', { email }),
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
  getTierRates: () => api.get('/billing/tier-rates'),
  updateTierRate: (tier: string, data: { cashbackRate?: number; gasCentsPerGallon?: number | null }) =>
    api.put(`/billing/tier-rates/${tier}`, data),
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
  updateGasPrices: (storeId: string, data: object) => api.patch(`/stores/${storeId}/gas-prices`, data),
  getApiKey: (storeId: string) => api.get(`/billing/stores/${storeId}/api-key`),
  regenerateApiKey: (storeId: string) => api.post(`/billing/stores/${storeId}/api-key/regenerate`),
  getKeywordMappings: (storeId: string) => api.get(`/stores/${storeId}/keyword-mappings`),
  addKeywordMapping: (storeId: string, keyword: string, category: string) =>
    api.post(`/stores/${storeId}/keyword-mappings`, { keyword, category }),
  deleteKeywordMapping: (storeId: string, id: string) =>
    api.delete(`/stores/${storeId}/keyword-mappings/${id}`),
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
  broadcast: (data: { target: string; storeId?: string; title: string; body: string }) =>
    api.post('/notifications/broadcast', data),
};

export const devAdminApi = {
  getNotifications: () => api.get('/billing/notifications'),
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

export const catalogApi = {
  getAll: () => api.get('/catalog/all'),
  create: (data: object) => api.post('/catalog', data),
  update: (id: string, data: object) => api.patch(`/catalog/${id}`, data),
  delete: (id: string) => api.delete(`/catalog/${id}`),
};

export const promotionsApi = {
  getRequests: (status?: string) => api.get(`/promotions/requests${status ? `?status=${status}` : ''}`),
  publish: (id: string, formData: FormData) =>
    api.post(`/promotions/${id}/publish`, formData),
  reject: (id: string, devAdminNote?: string) =>
    api.patch(`/promotions/${id}/reject`, { devAdminNote }),
  delete: (id: string) => api.delete(`/promotions/${id}`),
};

export const supportApi = {
  // SuperAdmin
  createThread: (subject: string, message: string) =>
    api.post('/support/threads', { subject, message }),
  getMyThreads: () => api.get('/support/threads'),
  getThread: (threadId: string) => api.get(`/support/threads/${threadId}`),
  sendMessage: (threadId: string, body: string) =>
    api.post(`/support/threads/${threadId}/messages`, { body }),
  // DevAdmin
  getInbox: () => api.get('/support/inbox'),
  getInboxThread: (threadId: string) => api.get(`/support/inbox/${threadId}`),
  replyInbox: (threadId: string, body: string) =>
    api.post(`/support/inbox/${threadId}/messages`, { body }),
  resolveThread: (threadId: string, status: 'OPEN' | 'RESOLVED') =>
    api.patch(`/support/threads/${threadId}/resolve`, { status }),
  getUnreadCount: () => api.get('/support/unread-count'),
};

export const leaderboardApi = {
  getCustomers: (storeId?: string) =>
    api.get(`/leaderboard/customers${storeId ? `?storeId=${storeId}` : ''}`),
  getEmployees: (storeId: string) =>
    api.get(`/leaderboard/employees/${storeId}`),
};

export const careersApi = {
  getApplications: (params?: Record<string, string>) =>
    api.get('/careers/applications', { params }),
  getNewCount: () => api.get('/careers/applications/new-count'),
  update: (id: string, data: { status?: string; reviewNotes?: string }) =>
    api.patch(`/careers/applications/${id}`, data),
  delete: (id: string) => api.delete(`/careers/applications/${id}`),
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
