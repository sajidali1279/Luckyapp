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
  getCashbackHealth: () => api.get('/billing/cashback-health'),
  updateStoreBilling: (storeId: string, data: object) => api.patch(`/billing/stores/${storeId}`, data),
  createRecord: (storeId: string, data: object) => api.post(`/billing/stores/${storeId}/records`, data),
  markPaid: (recordId: string) => api.patch(`/billing/records/${recordId}/paid`),
  markPeriodPaid: (period: string) => api.patch(`/billing/period/${period}/paid`),
  getTierRates: () => api.get('/billing/tier-rates'),
  updateTierRate: (tier: string, data: { cashbackRate?: number; gasCentsPerGallon?: number | null; pointsThreshold?: number }) =>
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
  getExtraCharges: (storeId?: string, period?: string, isPaid?: boolean) => {
    const params = new URLSearchParams();
    if (storeId) params.set('storeId', storeId);
    if (period)  params.set('period', period);
    if (isPaid !== undefined) params.set('isPaid', String(isPaid));
    const qs = params.toString();
    return api.get(`/billing/extra-charges${qs ? `?${qs}` : ''}`);
  },
  updateRecord: (recordId: string, data: { description?: string; amount?: number }) =>
    api.patch(`/billing/records/${recordId}`, data),
  deleteRecord: (recordId: string) => api.delete(`/billing/records/${recordId}`),
  getPendingCount: () => api.get('/billing/pending-count'),
};

export const offersApi = {
  create: (formData: FormData) => api.post('/offers', formData),
  update: (offerId: string, data: object) => api.patch(`/offers/${offerId}`, data),
  delete: (offerId: string) => api.delete(`/offers/${offerId}`),
  getActive: () => api.get('/offers'),
  getHistory: () => api.get('/offers/history'),
};

export const bannersApi = {
  create: (formData: FormData) => api.post('/banners', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (bannerId: string) => api.delete(`/banners/${bannerId}`),
  getActive: () => api.get('/banners'),
};

export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; isDeal?: boolean; barcode?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
};

export const noticesApi = {
  create: (data: { title: string; body: string; storeId?: string; endDate: string }) => api.post('/admin/notices', data),
  getAll: () => api.get('/admin/notices'),
  getActive: () => api.get('/notices/active'),
  deactivate: (id: string) => api.patch(`/admin/notices/${id}`, {}),
  delete: (id: string) => api.delete(`/admin/notices/${id}`),
};

export const pointsApi = {
  getStoreSummary: (storeId: string) => api.get(`/points/store/${storeId}/summary`),
  getStoreTransactions: (storeId: string, status?: string, page = 1) =>
    api.get(`/points/store/${storeId}?page=${page}${status ? `&status=${status}` : ''}`),
  reject: (transactionId: string) => api.patch(`/points/${transactionId}/reject`),
  reviewFlagged: (transactionId: string, action: 'APPROVE' | 'REJECT') => api.patch(`/points/${transactionId}/review`, { action }),
  getPlatformSummary: () => api.get('/points/platform-summary'),
  getAllTransactions: (params: Record<string, string>) =>
    api.get('/points/all', { params }),
  getPendingCount: () => api.get('/points/pending-count'),
};

export const customersApi = {
  list: (search = '', page = 1) => api.get(`/users/customers?search=${encodeURIComponent(search)}&page=${page}`),
  toggleActive: (userId: string, fraudNote?: string) =>
    api.patch(`/users/${userId}/toggle-active`, fraudNote ? { fraudNote } : {}),
  delete: (userId: string) => api.delete(`/users/${userId}`),
  exportCsv: (search = '', isActive?: boolean) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (isActive !== undefined) params.set('isActive', String(isActive));
    const qs = params.toString();
    return api.get(`/users/customers/export${qs ? `?${qs}` : ''}`, { responseType: 'blob' });
  },
};

export const disputesApi = {
  getForStore: (storeId: string, status?: string) =>
    api.get(`/disputes/store/${storeId}${status ? `?status=${status}` : ''}`),
  getAll: (params?: { storeId?: string; status?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return api.get(`/disputes/all${q ? `?${q}` : ''}`);
  },
  resolve: (id: string, data: { action: 'APPROVED' | 'REJECTED'; resolvedNote?: string; creditedAmt?: number }) =>
    api.patch(`/disputes/${id}/resolve`, data),
  getPendingCount: () => api.get('/disputes/pending-count'),
};

export const storesApi = {
  getAll: () => api.get('/stores'),
  getOne: (storeId: string) => api.get(`/stores/${storeId}`),
  update: (storeId: string, data: object) => api.patch(`/stores/${storeId}`, data),
  updateGasPrices: (storeId: string, data: object) => api.patch(`/stores/${storeId}/gas-prices`, data),
  getApiKey: (storeId: string) => api.get(`/billing/stores/${storeId}/api-key`),
  regenerateApiKey: (storeId: string) => api.post(`/billing/stores/${storeId}/api-key/regenerate`),
  getKeywordMappings: (storeId: string) => api.get(`/stores/${storeId}/keyword-mappings`),
  addKeywordMapping: (storeId: string, keyword: string, category: string) =>
    api.post(`/stores/${storeId}/keyword-mappings`, { keyword, category }),
  deleteKeywordMapping: (storeId: string, id: string) =>
    api.delete(`/stores/${storeId}/keyword-mappings/${id}`),
  updateOrderInstructions: (storeId: string, instructions: string | null) =>
    api.patch(`/stores/${storeId}/order-instructions`, { instructions }),
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
  getPendingCount: () => api.get('/schedule/requests/pending-count'),
};

export const chatApi = {
  getMyStores: () => api.get('/chat/my-stores'),
  getMessages: (storeId: string, after?: string) =>
    api.get(`/chat/${storeId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  sendMessage: (storeId: string, text: string) =>
    api.post(`/chat/${storeId}/messages`, { text }),
  getUnreadCount: () => api.get('/chat/unread-count'),
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
  getPendingCount: () => api.get('/promotions/requests/pending-count'),
};

export const supportApi = {
  // SuperAdmin
  createThread: (subject: string, message: string, priority?: string, category?: string) =>
    api.post('/support/threads', { subject, message, priority, category }),
  getMyThreads: (params?: { status?: string; category?: string; priority?: string; search?: string }) =>
    api.get('/support/threads', { params }),
  getThread: (threadId: string) => api.get(`/support/threads/${threadId}`),
  sendMessage: (threadId: string, body: string) =>
    api.post(`/support/threads/${threadId}/messages`, { body }),
  // DevAdmin
  getInbox: (params?: { status?: string; category?: string; priority?: string; search?: string }) =>
    api.get('/support/inbox', { params }),
  getInboxThread: (threadId: string) => api.get(`/support/inbox/${threadId}`),
  replyInbox: (threadId: string, body: string) =>
    api.post(`/support/inbox/${threadId}/messages`, { body }),
  resolveThread: (threadId: string, status: 'OPEN' | 'RESOLVED') =>
    api.patch(`/support/threads/${threadId}/resolve`, { status }),
  setPriority: (threadId: string, priority: string) =>
    api.patch(`/support/threads/${threadId}/priority`, { priority }),
  getUnreadCount: () => api.get('/support/unread-count'),
  getStats: () => api.get('/support/stats'),
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

export const jobOpeningsApi = {
  getAll:  () => api.get('/careers/openings/all'),
  create:  (data: object) => api.post('/careers/openings', data),
  update:  (id: string, data: object) => api.patch(`/careers/openings/${id}`, data),
  delete:  (id: string) => api.delete(`/careers/openings/${id}`),
};

export const productRequestApi = {
  getStoreRequests: (storeId: string, status?: string) =>
    api.get(`/product-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  respond: (id: string, status: 'ACCEPTED' | 'DECLINED', responseNote?: string) =>
    api.patch(`/product-requests/${id}/respond`, { status, responseNote }),
  getPendingCount: () => api.get('/product-requests/pending-count'),
};

export const storeRequestApi = {
  // Manager/admin
  getStoreRequests: (storeId: string, status?: string) =>
    api.get(`/store-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  getPendingCount: () => api.get('/store-requests/pending-count'),
  acknowledge: (requestId: string, note?: string) =>
    api.patch(`/store-requests/${requestId}/acknowledge`, { note }),
};

export const orderListApi = {
  adminGetAll:      (params?: { storeId?: string; status?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return api.get(`/order-lists/admin/all${q ? `?${q}` : ''}`);
  },
  getById:          (listId: string) => api.get(`/order-lists/${listId}`),
  getActive:        (storeId: string) => api.get(`/order-lists/store/${storeId}/active`),
  getHistory:       (storeId: string, page = 1) => api.get(`/order-lists/store/${storeId}/history?page=${page}`),
  getQuickItems:    (storeId: string) => api.get(`/order-lists/store/${storeId}/quick-add`),
  openList:         (storeId: string) => api.post(`/order-lists/store/${storeId}`, {}),
  closeList:        (listId: string, notes?: string) => api.patch(`/order-lists/${listId}/close`, { notes }),
  addItem:          (listId: string, data: object) => api.post(`/order-lists/${listId}/items`, data),
  updateItem:       (itemId: string, data: object) => api.patch(`/order-lists/items/${itemId}`, data),
  removeItem:       (itemId: string) => api.delete(`/order-lists/items/${itemId}`),
  updateItemStatus: (itemId: string, status: string) => api.patch(`/order-lists/items/${itemId}/status`, { status }),
  reorderItems:     (listId: string, items: { id: string; sortOrder: number }[]) =>
    api.patch(`/order-lists/${listId}/reorder`, { items }),
  printList:        (listId: string, notes?: string) => api.post(`/order-lists/${listId}/print`, { notes }),
  getPrintHistory:  (storeId: string, listId: string) => api.get(`/order-lists/store/${storeId}/print-history/${listId}`),
  restoreItems:     (storeId: string, closedListId: string, itemIds: string[]) =>
    api.post(`/order-lists/store/${storeId}/restore-items`, { closedListId, itemIds }),
};

export const orderCategoriesApi = {
  getApproved:    () => api.get('/order-categories'),
  adminGetAll:    (status?: string) => api.get(`/order-categories/admin${status ? `?status=${status}` : ''}`),
  adminUpdate:    (id: string, data: { name?: string; status?: string }) => api.patch(`/order-categories/${id}`, data),
  adminDelete:    (id: string) => api.delete(`/order-categories/${id}`),
  getPendingCount: () => api.get('/order-categories/admin/pending-count'),
};

export const scannedProductApi = {
  list: (q?: string) => api.get('/scanned-products', { params: q ? { q } : undefined }),
  delete: (id: string) => api.delete(`/scanned-products/${id}`),
  save: (data: { barcode: string; name: string; category?: string; brand?: string }) =>
    api.post('/scanned-products', data),
};

export const employeeRequestApi = {
  adminGetAll: (params?: { storeId?: string; status?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return api.get(`/employee-requests/admin/all${q ? `?${q}` : ''}`);
  },
  getForStore: (storeId: string, status?: string) =>
    api.get(`/employee-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  submit: (data: { requestType: string; note?: string; lines: { name: string; quantity?: string; category?: string; notes?: string }[] }) =>
    api.post('/employee-requests', data),
  getMine: () => api.get('/employee-requests/mine'),
  getSuggestions: (q: string) => api.get(`/employee-requests/suggestions?q=${encodeURIComponent(q)}`),
  reviewRequest: (requestId: string, data: { lines: { id: string; action: 'ACCEPT' | 'REJECT'; rejectionReason?: string; rejectionNote?: string }[] }) =>
    api.patch(`/employee-requests/${requestId}/review`, data),
  getPendingCount: () => api.get('/employee-requests/pending-count'),
};

export const hotFoodApi = {
  // Menu management
  getMenu:       (storeId?: string) => api.get(`/hot-food/menu${storeId ? `?storeId=${storeId}` : ''}`),
  createItem:    (data: { storeId?: string; name: string; description?: string; price: number; isAvailable?: boolean; estimatedMinutes?: number }) =>
    api.post('/hot-food/menu', data),
  updateItem:    (id: string, data: { name?: string; description?: string; price?: number; isAvailable?: boolean; estimatedMinutes?: number; storeId?: string }) =>
    api.patch(`/hot-food/menu/${id}`, data),
  deleteItem:    (id: string) => api.delete(`/hot-food/menu/${id}`),
  // Orders management
  getAllOrders:  (params?: { storeId?: string; status?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return api.get(`/hot-food/orders/admin${q ? `?${q}` : ''}`);
  },
  updateStatus:  (orderId: string, status: string, estimatedMinutes?: number) =>
    api.patch(`/hot-food/orders/${orderId}`, { status, ...(estimatedMinutes != null && { estimatedMinutes }) }),
  getAdminPendingCount: () => api.get('/hot-food/orders/admin/pending-count'),
};

export const hotFoodCatalogApi = {
  getAll: () => api.get('/hot-food/catalog'),
  create: (formData: FormData) =>
    api.post('/hot-food/catalog', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id: string, data: Partial<{ name: string; description: string | null; price: number; estimatedMinutes: number | null }>) =>
    api.patch(`/hot-food/catalog/${id}`, data),
  updateImage: (id: string, formData: FormData) =>
    api.patch(`/hot-food/catalog/${id}/image`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id: string) => api.delete(`/hot-food/catalog/${id}`),
  getStoreAssignments: (id: string) => api.get(`/hot-food/catalog/${id}/stores`),
  assignToStore: (id: string, storeId: string) =>
    api.post(`/hot-food/catalog/${id}/stores`, { storeId }),
  removeFromStore: (id: string, storeId: string) =>
    api.delete(`/hot-food/catalog/${id}/stores/${storeId}`),
};

export const welcomeBonusApi = {
  getStatus:       () => api.get('/welcome-bonus'),
  getForCustomer:  (qrCode: string) => api.get(`/welcome-bonus/customer/${encodeURIComponent(qrCode)}`),
  confirm:         (claimCode: string, storeId?: string) => api.post('/welcome-bonus/confirm', { claimCode, storeId }),
};

export const dailyReportApi = {
  getByDate: (storeId?: string, date?: string) => {
    const params = new URLSearchParams();
    if (storeId) params.set('storeId', storeId);
    if (date) params.set('date', date);
    const qs = params.toString();
    return api.get(`/daily-reports${qs ? `?${qs}` : ''}`);
  },
};

export const dailyTaskApi = {
  getAll: (storeId?: string) => {
    const q = storeId ? `?storeId=${encodeURIComponent(storeId)}` : '';
    return api.get(`/admin/daily-tasks${q}`);
  },
  create: (data: { shift: string; title: string; description?: string; storeId?: string; sortOrder?: number }) =>
    api.post('/admin/daily-tasks', data),
  update: (id: string, data: Partial<{ shift: string; title: string; description: string | null; storeId: string | null; sortOrder: number; isActive: boolean }>) =>
    api.patch(`/admin/daily-tasks/${id}`, data),
  delete: (id: string) => api.delete(`/admin/daily-tasks/${id}`),
  seedDefaults: () => api.post('/admin/daily-tasks/seed'),
};

export const inventoryAnalyticsApi = {
  get: (params?: { storeId?: string; period?: string; category?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
    return api.get(`/inventory/analytics${q ? `?${q}` : ''}`);
  },
  getItemSuggestions: (params: { q: string; category?: string }) => {
    const qs = new URLSearchParams({ q: params.q });
    if (params.category) qs.set('category', params.category);
    return api.get(`/order-lists/suggestions?${qs.toString()}`);
  },
};

export default api;
