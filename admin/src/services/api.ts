import axios, { type AxiosResponse } from 'axios';
import { refusalText } from '../lib/apiError';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

// 30 seconds: long enough for the slowest real request (a CSV export, a cold backend waking up), short
// enough that a hung request fails instead of leaving a button stuck on "Saving..." forever.
const api = axios.create({ baseURL: API_URL, timeout: 30_000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jwt_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401 — clears auth state and redirects to login
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A refused form can come back as an object of field messages; make it one sentence so no page tries to draw an object
    const body = error.response?.data;
    if (body && body.error !== undefined && typeof body.error !== 'string') body.error = refusalText(body.error);
    if (error.response?.status === 401) {
      localStorage.removeItem('jwt_token');
      localStorage.removeItem('luckystop-admin-auth');
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login?expired=1';
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
  /** The Profile page: role, stores, sign-ins, email switches, recent actions */
  getAccount: () => api.get('/auth/account'),
  setEmailAlerts: (off: string[]) => api.patch('/auth/email-alerts', { off }),
  signOutOthers: () => api.post('/auth/sign-out-others'),
  uploadAvatar: (file: File) => { const fd = new FormData(); fd.append('avatar', file); return api.post('/auth/profile/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } }); },
  removeAvatar: () => api.delete('/auth/profile/avatar'),
};

export interface PaymentBody { paidOn?: string; method?: string; note?: string; expectedAmount?: number; expectedTotal?: number }

export const billingApi = {
  getAllStores: () => api.get('/billing/stores'),
  getRevenue: (period?: string) => api.get(`/billing/revenue${period && period !== 'all' ? `?period=${period}` : ''}`),
  getAnalytics: (params: { from?: string; to?: string; range?: string; storeId?: string } = {}) =>
    api.get('/billing/analytics', { params }),
  exportAnalyticsCsv: (params: { from?: string; to?: string; range?: string; storeId?: string } = {}) =>
    api.get('/billing/analytics/export', { params, responseType: 'blob' }),
  getCashbackHealth: () => api.get('/billing/cashback-health'),
  updateStoreBilling: (storeId: string, data: object) => api.patch(`/billing/stores/${storeId}`, data),
  createRecord: (storeId: string, data: object) => api.post(`/billing/stores/${storeId}/records`, data),
  /** Marks ONE record paid. The body says how and when, and what amount the person saw (the server refuses if it changed). */
  markPaid: (recordId: string, body: PaymentBody = {}) => api.patch(`/billing/records/${recordId}/paid`, body),
  /** The way back from a mistaken payment. The reason is kept in the record's history. */
  unmarkPaid: (recordId: string, reason: string) => api.patch(`/billing/records/${recordId}/unpaid`, { reason }),
  /** Marks every UNPAID record of a month paid, all or nothing. */
  markPeriodPaid: (period: string, body: PaymentBody = {}) => api.patch(`/billing/period/${period}/paid`, body),
  /** Rebuilds one UNPAID usage bill from its month's sales. dryRun only says what it would become. */
  recalculateRecord: (recordId: string, dryRun = false) => api.post(`/billing/records/${recordId}/recalculate${dryRun ? '?dryRun=1' : ''}`),
  getTierRates: () => api.get('/billing/tier-rates'),
  updateTierRate: (tier: string, data: { cashbackRate?: number; gasCentsPerGallon?: number | null; pointsThreshold?: number }) =>
    api.put(`/billing/tier-rates/${tier}`, data),
  /** Several tiers in one all-or-nothing save (thresholds are in points). The answer carries every tier as it now stands and the "last changed" line. */
  updateTierRates: (changes: { tier: string; cashbackRate?: number; gasCentsPerGallon?: number | null; pointsThreshold?: number }[]) =>
    api.put('/billing/tier-rates', { changes }),
  /** Who last changed a tier or category rate, when, and what (null if never recorded). */
  getRatesLastChange: () => api.get('/billing/rates/last-change'),
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
  getHeartbeat: () => api.get('/billing/heartbeat'),
  getStorePlanHistory: (storeId: string) => api.get(`/billing/stores/${storeId}/plan-history`),
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

/** Challenges: spend or visit targets that pay a reward (HQ). */
export const challengesApi = {
  list: () => api.get('/challenges'),
  create: (data: object) => api.post('/challenges', data),
  update: (id: string, data: object) => api.patch(`/challenges/${id}`, data),
};

export const offersApi = {
  create: (formData: FormData) => api.post('/offers', formData),
  update: (offerId: string, data: object) => api.patch(`/offers/${offerId}`, data),
  delete: (offerId: string) => api.delete(`/offers/${offerId}`),
  /** A new picture for an offer already posted, or none. */
  setImage: (offerId: string, file: File) => { const fd = new FormData(); fd.append('image', file); return api.post(`/offers/${offerId}/image`, fd); },
  removeImage: (offerId: string) => api.delete(`/offers/${offerId}/image`),
  /** Promotion ideas from the last 8 weeks of sales (HQ), each ready to fill in the form. */
  ideas: () => api.get('/offers/ideas'),
  /** A suggested Spanish version of an offer's words, to read and change. */
  translate: (words: { title: string; description: string; dealText: string }) => api.post('/offers/translate', words),
  getActive: () => api.get('/offers'),
  /** Live promotions plus the ones switched on that start later (HQ only), so a scheduled promotion is not invisible. */
  getLiveAndScheduled: () => api.get('/offers?includeScheduled=1'),
  getHistory: () => api.get('/offers/history'),
  getResults: (offerId: string) => api.get(`/offers/${offerId}/results`),   // what a promotion did (HQ)
  /** What a promotion would add in cashback, from the last 4 weeks of the same kind of sales. */
  estimate: (data: object) => api.post('/offers/estimate', data),
  /** Label deals the app shows in Today's Deals, and hiding one (HQ). */
  getShelfDeals: () => api.get('/offers/shelf-deals'),
  setShelfDealHidden: (labelId: string, hidden: boolean) => api.patch(`/offers/shelf-deals/${labelId}`, { hidden }),
};

/** Store managers' cashback promotion requests, which HQ approves (with any changes) or declines with a reason. */
export const offerRequestsApi = {
  list: (status?: string) => api.get('/offer-requests', { params: status ? { status } : {} }),
  approve: (id: string, changes: object) => api.post(`/offer-requests/${id}/approve`, changes),
  decline: (id: string, reason: string) => api.post(`/offer-requests/${id}/decline`, { reason }),
};

export const bannersApi = {
  create: (formData: FormData) => api.post('/banners', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (bannerId: string) => api.delete(`/banners/${bannerId}`),
  getActive: () => api.get('/banners'),
};

export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; dealText?: string | null; dealSuggested?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; dealText?: string | null; dealSuggested?: string | null; barcode?: string | null; category?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  // printedPrice is the price on the paper: a label counts as printed only if it is still the store's price
  print: (items: { storeLabelId: string; quantity: number; printedPrice?: string }[]) => api.post('/labels/print', { items }),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
  // What a price change or a delete would touch: how many stores hold the item and in what state
  impact: (labelId: string) => api.get(`/labels/${labelId}/impact`),
  getStoreLabels: (storeId: string, unprinted?: boolean) =>
    api.get(`/store-labels?storeId=${encodeURIComponent(storeId)}${unprinted ? '&unprinted=true' : ''}`),
  addToStore: (labelId: string, storeId: string, priceText?: string | null, expiresAt?: string | null): Promise<AxiosResponse> =>
    api.post('/store-labels', { labelId, storeId, priceText, expiresAt }),
  updateStoreLabel: (storeLabelId: string, priceText: string | null, expiresAt?: string | null): Promise<AxiosResponse> =>
    api.patch(`/store-labels/${storeLabelId}`, { priceText, expiresAt }),
  // Takes a label that was never printed there out of one store
  removeStoreLabel: (storeLabelId: string) => api.delete(`/store-labels/${storeLabelId}`),
  getCoverage: () => api.get('/labels/coverage'),
  getHealthSummary: () => api.get('/labels/health-summary'),
  pushToAllStores: (labelId: string) => api.post(`/labels/${labelId}/push-to-all`),
  /** Items that share a barcode (with or without the leading 0), and folding them into one. */
  getDuplicates: () => api.get('/labels/duplicates'),
  merge: (keepId: string, mergeIds: string[], priceText?: string | null) => api.post('/labels/merge', { keepId, mergeIds, priceText }),
  /** An edited Labels export: apply false is the preview, apply true makes the changes. */
  importRows: (rows: object[], apply: boolean, dealColumn: boolean) => api.post('/labels/import', { rows, apply, dealColumn }),
  /** Deals to fix, match or try (Labels > Deals), and hiding one for every HQ admin. */
  getDealRecommendations: () => api.get('/labels/deal-recommendations'),
  dismissDealRecommendation: (key: string, dismiss = true) => api.post('/labels/deal-recommendations/dismiss', { key, dismiss }),
  restoreDealRecommendations: () => api.post('/labels/deal-recommendations/restore'),
  /** HQ's max discount per category for deal suggestions, and saving them; many deals at once (Apply all). */
  getDealSettings: () => api.get('/labels/deal-settings'),
  updateDealSettings: (limits: { defaultPct: number; categories: Record<string, number>; excluded: string[] }) => api.put('/labels/deal-settings', limits),
  setDealsBulk: (items: { labelId: string; dealText: string; suggested?: string | null }[]) => api.post('/labels/deals/bulk', { items }),
  resetDealLearning: (category: string) => api.post('/labels/deal-learning/reset', { category }),
};

export interface NoticeInput {
  title?: string; body?: string; storeIds?: string[]; audience?: 'ALL_STAFF' | 'MANAGERS' | 'EMPLOYEES'; priority?: 'NORMAL' | 'URGENT';
  startDate?: string; endDate?: string; notify?: boolean; isActive?: boolean;
}
export const noticesApi = {
  create: (data: NoticeInput) => api.post('/admin/notices', data),
  /** Edit, extend, bring back (isActive: true); notify: true tells staff again */
  update: (id: string, data: NoticeInput) => api.put(`/admin/notices/${id}`, data),
  getAll: () => api.get('/admin/notices'),
  getActive: () => api.get('/notices/active'),
  deactivate: (id: string) => api.patch(`/admin/notices/${id}`, {}),
  delete: (id: string) => api.delete(`/admin/notices/${id}`),
};

export const pointsApi = {
  getStoreSummary: (storeId: string) => api.get(`/points/store/${storeId}/summary`),
  getStoreTransactions: (storeId: string, status?: string, page = 1) =>
    api.get(`/points/store/${storeId}?page=${page}${status ? `&status=${status}` : ''}`),
  reject: (transactionId: string, reason?: string) => api.patch(`/points/${transactionId}/reject`, reason ? { reason } : {}),
  reviewFlagged: (transactionId: string, action: 'APPROVE' | 'REJECT', reason?: string) =>
    api.patch(`/points/${transactionId}/review`, reason ? { action, reason } : { action }),
  /** Undoes an APPROVED sale and claws the points back. A reason is required (unlike a reject's optional one). */
  voidSale: (transactionId: string, reason: string) => api.patch(`/points/${transactionId}/void`, { reason }),
  getPlatformSummary: () => api.get('/points/platform-summary'),
  getPlatformTrend: (days = 30) => api.get(`/points/platform-trend?days=${days}`),
  getPlatformCompare: (range: string) => api.get(`/points/platform-compare?range=${range}`),
  getStoreHealth: () => api.get('/points/store-health'),
  getLaunchStats: () => api.get('/points/launch-stats'),
  getAllTransactions: (params: Record<string, string>) =>
    api.get('/points/all', { params }),
  getPendingCount: () => api.get('/points/pending-count'),
};

export interface CustomerFilters {
  status?: 'active' | 'restricted';
  hasBalance?: boolean;
  hasNote?: boolean;
  joinedWithin?: 'week';
  hideTest?: boolean;
  sort?: 'joined_desc' | 'joined_asc' | 'spend_desc' | 'balance_desc';
}

export const customersApi = {
  list: (search = '', page = 1, filters: CustomerFilters = {}) => {
    const params: Record<string, string> = { search, page: String(page) };
    if (filters.status) params.status = filters.status;
    if (filters.hasBalance) params.hasBalance = 'true';
    if (filters.hasNote) params.hasNote = 'true';
    if (filters.joinedWithin) params.joinedWithin = filters.joinedWithin;
    if (filters.hideTest) params.hideTest = 'true';
    if (filters.sort) params.sort = filters.sort;
    return api.get('/users/customers', { params });
  },
  detail: (userId: string) => api.get(`/users/customers/${userId}/detail`),
  goodwillCredit: (userId: string, amount: number, reason: string) =>
    api.post(`/users/customers/${userId}/goodwill-credit`, { amount, reason }),
  // Say which state you want: restricting twice, or a double click, cannot switch the account back on
  setActive: (userId: string, isActive: boolean, fraudNote?: string) =>
    api.patch(`/users/${userId}/toggle-active`, { isActive, ...(fraudNote ? { fraudNote } : {}) }),
  delete: (userId: string) => api.delete(`/users/${userId}`),
  exportCsv: (search = '', isActive?: boolean, filters: CustomerFilters = {}) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (isActive !== undefined) params.set('isActive', String(isActive));
    if (filters.status) params.set('status', filters.status);
    if (filters.hasBalance) params.set('hasBalance', 'true');
    if (filters.hasNote) params.set('hasNote', 'true');
    if (filters.joinedWithin) params.set('joinedWithin', filters.joinedWithin);
    if (filters.hideTest) params.set('hideTest', 'true');
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
  // SuperAdmin+ only. For any store-filter UI a Store Manager might also
  // reach, use getAccessible() instead — it returns everything for
  // SuperAdmin+ but scopes down to just the caller's own store(s) for a
  // Store Manager, so the same query works for both without branching.
  getAccessible: () => api.get('/stores/accessible'),
  getOne: (storeId: string) => api.get(`/stores/${storeId}`),
  create: (data: object) => api.post('/stores', data),
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
  // The store's label printer fine-tune (mm) that every phone printing for the store uses; HQ sets it
  getLabelPrinter: (storeId: string) => api.get(`/stores/${storeId}/label-printer`),
  setLabelPrinter: (storeId: string, layout: { down: number; right: number; width: number; height: number; gapX: number; gapY: number; scale: number }) => api.put(`/stores/${storeId}/label-printer`, layout),
  // HQ: the same numbers for every open store
  setLabelPrinterAllStores: (layout: { down: number; right: number; width: number; height: number; gapX: number; gapY: number; scale: number }) => api.put('/label-printer/all-stores', layout),
  getHours: (storeId: string) => api.get(`/stores/${storeId}/hours`),
  updateHours: (storeId: string, days: object[]) => api.put(`/stores/${storeId}/hours`, { days }),
  // When hot food can be ordered (none set = the store's own hours)
  getHotFoodHours: (storeId: string) => api.get(`/stores/${storeId}/hot-food-hours`),
  updateHotFoodHours: (storeId: string, days: object[]) => api.put(`/stores/${storeId}/hot-food-hours`, { days }),
  clearHotFoodHours: (storeId: string) => api.delete(`/stores/${storeId}/hot-food-hours`),
  addHoliday: (storeId: string, data: object) => api.post(`/stores/${storeId}/holidays`, data),
  deleteHoliday: (storeId: string, holidayId: string) =>
    api.delete(`/stores/${storeId}/holidays/${holidayId}`),
};

export const staffApi = {
  list: () => api.get('/staff'),
  // Say which state you want: a second identical request changes nothing (a double click can no longer switch the person back on)
  toggleActive: (userId: string, isActive: boolean) => api.patch(`/users/${userId}/toggle-active`, { isActive }),
  resetPin: (userId: string, newPin: string) => api.patch(`/users/${userId}/reset-pin`, { newPin }),
  addStore: (userId: string, storeId: string) => api.post(`/users/${userId}/stores`, { storeId }),
  removeStore: (userId: string, storeId: string) => api.delete(`/users/${userId}/stores/${storeId}`),
  // The person's whole list of stores in one all-or-nothing save
  setStores: (userId: string, storeIds: string[]) => api.put(`/users/${userId}/stores`, { storeIds }),
  // What Delete would do (work on record), Dev Admin only
  footprint: (userId: string) => api.get(`/users/${userId}/footprint`),
  deleteUser: (userId: string) => api.delete(`/users/${userId}`),
  // Fix a name/phone typo, promote/demote Employee<->Store Manager, set chain-wide access. Only the
  // fields present in `patch` are changed.
  edit: (userId: string, patch: { name?: string; phone?: string; role?: 'EMPLOYEE' | 'STORE_MANAGER'; allStoresAccess?: boolean }) =>
    api.patch(`/users/${userId}/edit`, patch),
};

export const superAdminApi = {
  getInvoices: () => api.get('/my-invoices'),
  getNotifications: () => api.get('/notifications'),
  broadcast: (data: { target: string; storeId?: string; title: string; body: string; test?: boolean }) =>
    api.post('/notifications/broadcast', data),
  // Who a message would reach, in people and phones, before anything is sent
  audience: (target: string, storeId?: string) =>
    api.get(`/notifications/audience?target=${encodeURIComponent(target)}${storeId ? `&storeId=${encodeURIComponent(storeId)}` : ''}`),
  // The last 50 sends, newest first
  broadcasts: () => api.get('/notifications/broadcasts'),
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
  getPendingCountByStore: () => api.get('/schedule/requests/pending-by-store'),
};

export const chatApi = {
  getMyStores: () => api.get('/chat/my-stores'),
  getMessages: (storeId: string, after?: string) =>
    api.get(`/chat/${storeId}/messages${after ? `?after=${encodeURIComponent(after)}` : ''}`),
  sendMessage: (storeId: string, text: string) =>
    api.post(`/chat/${storeId}/messages`, { text }),
  getUnreadCount: () => api.get('/chat/unread-count'),
  getUnreadCountByStore: () => api.get('/chat/unread-by-store'),
  clearChat: (storeId: string) => api.delete(`/chat/${storeId}/messages`),
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
  createManual: (formData: FormData) =>
    api.post('/promotions/manual', formData),
  reject: (id: string, devAdminNote?: string) =>
    api.patch(`/promotions/${id}/reject`, { devAdminNote }),
  delete: (id: string) => api.delete(`/promotions/${id}`),
  getPendingCount: () => api.get('/promotions/requests/pending-count'),
  // How many of the newest live ads the app features (the rest are under All Businesses)
  getSettings: () => api.get('/promotions/settings'),
  setFeaturedLimit: (featuredLimit: number) => api.put('/promotions/settings', { featuredLimit }),
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
  getPendingCountByStore: () => api.get('/product-requests/pending-by-store'),
};

export const storeRequestApi = {
  // Manager/admin
  getStoreRequests: (storeId: string, status?: string) =>
    api.get(`/store-requests/store/${storeId}${status ? `?status=${status}` : ''}`),
  getPendingCount: () => api.get('/store-requests/pending-count'),
  getPendingCountByStore: () => api.get('/store-requests/pending-by-store'),
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
  submitNew:      (name: string) => api.post('/order-categories/submit', { name }),
  adminGetAll:    (status?: string) => api.get(`/order-categories/admin${status ? `?status=${status}` : ''}`),
  adminUpdate:    (id: string, data: { name?: string; status?: string }) => api.patch(`/order-categories/${id}`, data),
  adminDelete:    (id: string) => api.delete(`/order-categories/${id}`),
  getPendingCount: () => api.get('/order-categories/admin/pending-count'),
};

export const scannedProductApi = {
  list: (q?: string) => api.get('/scanned-products', { params: q ? { q } : undefined }),
  update: (id: string, data: { name?: string; category?: string | null; brand?: string | null }) =>
    api.patch(`/scanned-products/${id}`, data),
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
  getPendingCountByStore: () => api.get('/employee-requests/pending-by-store'),
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
  updateStatus:  (orderId: string, status: string, estimatedMinutes?: number, reason?: string) =>
    api.patch(`/hot-food/orders/${orderId}`, { status, ...(estimatedMinutes != null && { estimatedMinutes }), ...(reason ? { reason } : {}) }),
  getAdminPendingCount: () => api.get('/hot-food/orders/admin/pending-count'),
  getStoresStatus: () => api.get('/hot-food/stores-status'),
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
  /** A 2-shift store: copy the chain's Middle tasks into its own Opening or Closing list (ones it already has are skipped) */
  copyMiddle: (storeId: string, to: 'OPENING' | 'CLOSING') => api.post('/admin/daily-tasks/copy-middle', { storeId, to }),
};

// App versions the phones compare themselves with (read: anyone; save: Dev Admin)
export const appVersionApi = {
  get: () => api.get('/app/version'),
  save: (data: { android: string; ios: string }) => api.put('/app/versions', data),   // the oldest version allowed per platform
};

// Analytics tabs (Dev Admin): the same window as the Analytics page (range, or from/to) and an optional store
export type InsightParams = { from?: string; to?: string; range?: string; storeId?: string };
export const insightsApi = {
  customers:  (params: InsightParams) => api.get('/analytics/customers', { params }),
  promotions: (params: InsightParams) => api.get('/analytics/promotions', { params }),
  points:     (params: InsightParams) => api.get('/analytics/points', { params }),
  staff:      (params: InsightParams) => api.get('/analytics/staff', { params }),
  heatmap:    (params: InsightParams) => api.get('/analytics/heatmap', { params }),
  forecast:   (params: { storeId?: string }) => api.get('/analytics/forecast', { params }),
  scorecards: () => api.get('/analytics/scorecards'),
};

export const inventoryAnalyticsApi = {
  restock:        (params: { storeId?: string; period: string }) => api.get('/inventory/analytics/restock', { params }),
  demand:         (params: { storeId?: string; period: string }) => api.get('/inventory/analytics/demand', { params }),
  rewardsHotFood: (params: { storeId?: string; period: string }) => api.get('/inventory/analytics/rewards-hotfood', { params }),
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

// The admin shell's sidebar badges and command palette bell: every "something is waiting" count in one
// request. See useAdminBadges.ts.
export const adminApi = {
  getBadgeCounts: () => api.get('/admin/badges'),
  /** HQ alerts read (or unread) for every HQ admin, on every computer. */
  setNotificationsRead: (ids: string[], read = true) => api.post('/admin/notifications/read', { ids, read }),
};

export default api;
