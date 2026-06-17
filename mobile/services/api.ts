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
  register: (phone: string, pin: string, name: string, firebaseToken: string) =>
    api.post('/auth/register', { phone, pin, name, firebaseToken }),
  login: (phone: string, pin: string, pushToken?: string, platform?: string) =>
    api.post('/auth/login', { phone, pin, pushToken, platform }),
  updateProfile: (name: string) =>
    api.patch('/auth/profile', { name }),
  uploadAvatar: (uri: string, mimeType: string) => {
    const form = new FormData();
    form.append('avatar', { uri, name: 'avatar.jpg', type: mimeType } as any);
    return api.post('/auth/profile/avatar', form, { headers: { 'Content-Type': 'multipart/form-data' } });
  },
  removeAvatar: () => api.delete('/auth/profile/avatar'),
  changePin: (currentPin: string, newPin: string) =>
    api.patch('/auth/pin', { currentPin, newPin }),
  registerPushToken: (token: string, platform: string) =>
    api.post('/auth/push-token', { token, platform }),
  getMe: () => api.get('/auth/me'),
  updateEmail: (email: string) => api.patch('/auth/email', { email }),
  verifyFirebaseReset: (firebaseToken: string) => api.post('/auth/verify-firebase-reset', { firebaseToken }),
  resetPin: (resetToken: string, newPin: string) => api.post('/auth/reset-pin', { resetToken, newPin }),
  confirm21: () => api.patch('/auth/confirm-21'),
  deleteAccount: () => api.delete('/auth/account'),
};

export const pointsApi = {
  getMyHistory: (page = 1) =>
    api.get(`/points/my-history?page=${page}`),
  getMyBenefitStatus: () => api.get('/points/my-benefit-status'),
  initiateGrant: (data: { customerQrCode: string; storeId: string; purchaseAmount: number; category?: string; notes?: string; isGas?: boolean; gasGallons?: number; gasPricePerGallon?: number }) =>
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
  getCustomerInfo: (qrCode: string) =>
    api.get(`/points/customer-info/${encodeURIComponent(qrCode)}`),
  claimTierBenefit: (customerQrCode: string, storeId: string) =>
    api.post('/points/tier-benefit', { customerQrCode, storeId }),
  processCatalogRedemption: (customerQrCode: string, catalogItemId: string, storeId: string) =>
    api.post('/points/catalog-redeem', { customerQrCode, catalogItemId, storeId }),
};

export const catalogApi = {
  getActive: () => api.get('/catalog'),
  getAll: () => api.get('/catalog/all'),
  create: (data: object) => api.post('/catalog', data),
  update: (id: string, data: object) => api.patch(`/catalog/${id}`, data),
  delete: (id: string) => api.delete(`/catalog/${id}`),
  // Customer-initiated redemption
  initiateRedemption: (catalogItemId: string) => api.post('/catalog/redeem', { catalogItemId }),
  getMyRedemptions: () => api.get('/catalog/my-redemptions'),
  cancelRedemption: (id: string) => api.delete(`/catalog/redeem/${id}`),
  // Employee
  getPendingForCustomer: (qrCode: string) => api.get(`/catalog/pending/${encodeURIComponent(qrCode)}`),
  confirmRedemption: (id: string, storeId?: string) => api.post(`/catalog/redeem/${id}/confirm`, { storeId }),
};

export const receiptApi = {
  getToken: (tokenId: string) => api.get(`/points/receipt-token/${tokenId}`),
  selfGrant: (tokenId: string) => api.post('/points/self-grant', { tokenId }),
};

export const offersApi = {
  getActive:   (storeId?: string) => api.get(`/offers${storeId ? `?storeId=${storeId}` : ''}`),
  getBanners:  (storeId?: string) => api.get(`/banners${storeId ? `?storeId=${storeId}` : ''}`),
  create:      (data: object) => api.post('/offers', data),
  update:      (offerId: string, data: object) => api.patch(`/offers/${offerId}`, data),
  deleteOffer: (offerId: string) => api.delete(`/offers/${offerId}`),
  deleteBanner:(bannerId: string) => api.delete(`/banners/${bannerId}`),
  createBanner: async (formData: FormData) => {
    const res = await fetchWithAuth('/banners', { method: 'POST', body: formData as any });
    const json = await res.json();
    if (!res.ok) throw { response: { data: json, status: res.status } };
    return { data: json };
  },
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
  getVacancies: () => api.get('/schedule/vacancies'),
};

export const chatApi = {
  getMyStores: () => api.get('/chat/my-stores'),
  getMessages: (storeId: string, after?: string) =>
    api.get(`/chat/${storeId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  sendMessage: (storeId: string, text: string) =>
    api.post(`/chat/${storeId}/messages`, { text }),
};

export const disputeApi = {
  submit: (data: { storeId: string; description: string; estimatedAmt?: number }) =>
    api.post('/disputes', data),
  getMine: () => api.get('/disputes/mine'),
};

export const storeRequestApi = {
  // Employee
  submit: (data: { storeId: string; type: string; priority: string; notes?: string }) =>
    api.post('/store-requests', data),
  getMine: () => api.get('/store-requests/mine'),
  // Manager
  getStoreRequests: (storeId: string, status?: string) =>
    api.get(`/store-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  getPendingCount: () => api.get('/store-requests/pending-count'),
  acknowledge: (requestId: string, note?: string) =>
    api.patch(`/store-requests/${requestId}/acknowledge`, { note }),
};

export const notificationsApi = {
  getMyNotifications: (page = 1) => api.get(`/notifications/my?page=${page}`),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAllRead: () => api.patch('/notifications/mark-all-read'),
  markOneRead: (id: string) => api.patch(`/notifications/${id}/read`),
  clearAll: () => api.delete('/notifications/my'),
};

export const storesApi = {
  getAll:         () => api.get('/stores'),
  getGasPrices:   () => api.get('/stores/gas-prices'),
  getTierRates:   () => api.get('/billing/tier-rates'),
  getCategoryRates: () => api.get('/billing/category-rates'),
  accessible:     () => api.get('/stores/accessible'),  // STORE_MANAGER+: own stores or all if allStoresAccess
};

export const welcomeBonusApi = {
  getStatus: () => api.get('/welcome-bonus'),
  claim: (rewardType: string) => api.post('/welcome-bonus/claim', { rewardType }),
  getForCustomer: (qrCode: string) => api.get(`/welcome-bonus/customer/${encodeURIComponent(qrCode)}`),
  confirm: (claimCode: string, storeId?: string) => api.post('/welcome-bonus/confirm', { claimCode, storeId }),
};

export const productRequestApi = {
  submit: (data: { storeId: string; productName: string; category?: string; description?: string }) =>
    api.post('/product-requests', data),
  getMine: () => api.get('/product-requests/mine'),
  getPendingCount: () => api.get('/product-requests/pending-count'),
  getStoreRequests: (storeId: string) =>
    api.get(`/product-requests/store/${storeId}`),
  respond: (id: string, status: 'ACCEPTED' | 'DECLINED', responseNote?: string) =>
    api.patch(`/product-requests/${id}/respond`, { status, responseNote }),
};

export const jobOpeningsApi = {
  getActive: () => api.get('/careers/openings'),
};

export const careersApi = {
  apply: (data: {
    name: string; phone: string; email?: string; position: string;
    storeId?: string;
    availability: { type: 'FULL_TIME' | 'PART_TIME'; shifts: string[] };
    experience?: string; message?: string;
  }) => api.post('/careers/apply', data),
};

export const promotionsApi = {
  getPublished: () => api.get('/promotions'),
  getMy: () => api.get('/promotions/my'),
  submit: async (data: {
    requesterName: string;
    requesterPhone: string;
    businessName: string;
    businessDescription: string;
    website?: string;
    imageUri?: string;
  }) => {
    if (data.imageUri) {
      // Build FormData for multipart upload
      const fd = new FormData();
      fd.append('requesterName', data.requesterName);
      fd.append('requesterPhone', data.requesterPhone);
      fd.append('businessName', data.businessName);
      fd.append('businessDescription', data.businessDescription);
      if (data.website) fd.append('website', data.website);
      const filename = data.imageUri.split('/').pop() ?? 'image.jpg';
      const ext = filename.split('.').pop()?.toLowerCase() ?? 'jpg';
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
      (fd as any).append('image', { uri: data.imageUri, name: filename, type: mimeMap[ext] ?? 'image/jpeg' });
      const res = await fetchWithAuth('/promotions/request', { method: 'POST', body: fd as any });
      const json = await res.json();
      if (!res.ok) throw { response: { data: json, status: res.status } };
      return { data: json };
    }
    return api.post('/promotions/request', {
      requesterName: data.requesterName,
      requesterPhone: data.requesterPhone,
      businessName: data.businessName,
      businessDescription: data.businessDescription,
      website: data.website,
    });
  },
};

export const leaderboardApi = {
  getCustomers: (storeId?: string) =>
    api.get(`/leaderboard/customers${storeId ? `?storeId=${storeId}` : ''}`),
  getEmployees: (storeId: string) =>
    api.get(`/leaderboard/employees/${storeId}`),
  getMyRatingSummary: (storeId: string) =>
    api.get(`/ratings/my/${storeId}`),
};

export const ratingsApi = {
  submit: (transactionId: string, rating: number) =>
    api.post('/ratings', { transactionId, rating }),
  getPending: () =>
    api.get('/ratings/pending'),
};

export const orderListApi = {
  getSuggestions: (q: string) => api.get(`/order-lists/suggestions?q=${encodeURIComponent(q)}`),
  getActive:      (storeId: string) => api.get(`/order-lists/store/${storeId}/active`),
  getHistory:     (storeId: string, page = 1) => api.get(`/order-lists/store/${storeId}/history?page=${page}`),
  getById:        (listId: string) => api.get(`/order-lists/${listId}`),
  openList:       (storeId: string) => api.post(`/order-lists/store/${storeId}`, {}),
  closeList:      (listId: string, notes?: string) => api.patch(`/order-lists/${listId}/close`, { notes }),
  addItem:        (listId: string, data: { name: string; quantity?: string; category?: string; notes?: string; priority?: string }) =>
    api.post(`/order-lists/${listId}/items`, data),
  updateItem:     (itemId: string, data: { name?: string; quantity?: string | null; category?: string | null; notes?: string | null; priority?: string }) =>
    api.patch(`/order-lists/items/${itemId}`, data),
  removeItem:     (itemId: string) => api.delete(`/order-lists/items/${itemId}`),
  updateItemStatus: (itemId: string, status: string) => api.patch(`/order-lists/items/${itemId}/status`, { status }),
  reorderItems:   (listId: string, items: { id: string; sortOrder: number }[]) =>
    api.patch(`/order-lists/${listId}/reorder`, { items }),
  printList:      (listId: string, notes?: string) => api.post(`/order-lists/${listId}/print`, { notes }),
  getPrintHistory:(storeId: string, listId: string) => api.get(`/order-lists/store/${storeId}/print-history/${listId}`),
  restoreItems:   (storeId: string, closedListId: string, itemIds: string[]) =>
    api.post(`/order-lists/store/${storeId}/restore-items`, { closedListId, itemIds }),
  getQuickItems:  (storeId: string) => api.get(`/order-lists/store/${storeId}/quick-add`),
  adminGetAll:    (params?: { storeId?: string; status?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
    return api.get(`/order-lists/admin/all${q ? `?${q}` : ''}`);
  },
};

export const scannedProductApi = {
  lookup: (barcode: string) => api.get(`/scanned-products/barcode/${encodeURIComponent(barcode)}`),
  save:   (data: { barcode: string; name: string; category?: string; brand?: string; source: 'manual' | 'openfoodfacts' }) =>
    api.post('/scanned-products', data),
  list:   (params?: { q?: string }) => {
    const qs = params?.q ? `?q=${encodeURIComponent(params.q)}` : '';
    return api.get(`/scanned-products${qs}`);
  },
  delete: (id: string) => api.delete(`/scanned-products/${id}`),
  extractFromPhoto: (imageUri: string, mimeType = 'image/jpeg') => {
    const fd = new FormData();
    const filename = imageUri.split('/').pop() ?? 'photo.jpg';
    (fd as any).append('image', { uri: imageUri, name: filename, type: mimeType });
    return api.post('/scanned-products/extract-from-photo', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 30000,
    });
  },
};

export const employeeRequestApi = {
  getSuggestions: (q: string) => api.get(`/employee-requests/suggestions?q=${encodeURIComponent(q)}`),
  getPendingCount: () => api.get('/employee-requests/pending-count'),
  submit: (data: { note?: string; requestType?: 'LOW_STOCK' | 'CUSTOMER_REQUEST'; lines: { name: string; quantity?: string; category?: string; notes?: string }[] }) =>
    api.post('/employee-requests', data),
  mine: () => api.get('/employee-requests/mine'),
  forStore: (storeId: string, status?: string) =>
    api.get(`/employee-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  rejectedLines: (storeId: string) => api.get(`/employee-requests/store/${storeId}/rejected`),
  review: (requestId: string, data: { listId?: string; lines: { id: string; action: 'ACCEPT' | 'REJECT'; rejectionReason?: string; rejectionNote?: string }[] }) =>
    api.patch(`/employee-requests/${requestId}/review`, data),
};

export const orderCategoriesApi = {
  getApproved: () => api.get('/order-categories'),
  submitNew:   (name: string) => api.post('/order-categories/submit', { name }),
  adminGetAll: (status?: string) => api.get(`/order-categories/admin${status ? `?status=${status}` : ''}`),
  adminUpdate: (id: string, data: { name?: string; status?: 'APPROVED' | 'REJECTED' }) => api.patch(`/order-categories/${id}`, data),
  adminDelete: (id: string) => api.delete(`/order-categories/${id}`),
};

export const dailyReportApi = {
  submit: (data: FormData) =>
    api.post('/daily-reports', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
  getToday: (storeId: string, date: string) =>
    api.get('/daily-reports/today', { params: { storeId, date } }),
};

export const dailyTaskApi = {
  getTasks: (storeId?: string) =>
    api.get('/daily-tasks', { params: storeId ? { storeId } : {} }),
};

export const managerApi = {
  getStoreStats: (storeId: string) =>
    api.get(`/points/store/${storeId}/summary`),
  getInventoryAnalytics: (params?: { storeId?: string; period?: string; category?: string }) => {
    const q = Object.entries(params || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');
    return api.get(`/inventory/analytics${q ? `?${q}` : ''}`);
  },
  getItemSuggestions: (params: { q: string; category?: string }) => {
    const qs = new URLSearchParams({ q: params.q });
    if (params.category) qs.set('category', params.category);
    return api.get(`/order-lists/suggestions?${qs.toString()}`);
  },
};

export const hotFoodApi = {
  getCustomerMenu: (storeId: string) => api.get(`/hot-food/store/${storeId}/menu`),
  // Employee management view — legacy + catalog items merged with availability + source
  getStoreAllItems: (storeId: string) => api.get(`/hot-food/store/${storeId}/all-items`),
  placeOrder:     (data: { storeId: string; items: { menuItemId: string; quantity: number }[]; note?: string }) =>
    api.post('/hot-food/orders', data),
  getMyOrders:    () => api.get('/hot-food/orders/mine'),
  getStoreOrders: (storeId: string) => api.get(`/hot-food/orders/store/${storeId}`),
  updateStatus:   (orderId: string, status: string, estimatedMinutes?: number) =>
    api.patch(`/hot-food/orders/${orderId}`, { status, ...(estimatedMinutes != null && { estimatedMinutes }) }),
  getPendingCount: (storeId: string) => api.get(`/hot-food/orders/store/${storeId}/pending-count`),
  // Toggle legacy menu item availability
  updateItemAvailability: (itemId: string, isAvailable: boolean) =>
    api.patch(`/hot-food/menu/${itemId}`, { isAvailable }),
  // Toggle catalog item availability at a specific store (employee only)
  updateCatalogItemAvailability: (storeId: string, catalogItemId: string, isAvailable: boolean) =>
    api.patch(`/hot-food/store/${storeId}/catalog/${catalogItemId}/availability`, { isAvailable }),
  createMenuItem: (formData: FormData) =>
    api.post('/hot-food/menu', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  updateMenuItem: (itemId: string, formData: FormData) =>
    api.patch(`/hot-food/menu/${itemId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteMenuItem: (itemId: string) =>
    api.delete(`/hot-food/menu/${itemId}`),
  getMenuCategories: (storeId?: string) =>
    api.get(`/hot-food/menu/categories${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}`),
};

export const supportApi = {
  createThread: (subject: string, message: string, priority?: string, category?: string) =>
    api.post('/support/threads', { subject, message, priority, category }),
  getMyThreads: (params?: { status?: string; category?: string; priority?: string; search?: string }) =>
    api.get('/support/threads', { params }),
  getThread: (threadId: string) => api.get(`/support/threads/${threadId}`),
  sendMessage: (threadId: string, body: string) =>
    api.post(`/support/threads/${threadId}/messages`, { body }),
  getUnreadCount: () => api.get('/support/unread-count'),
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

