import { Router } from 'express';
import { Role } from '@prisma/client';
import multer from 'multer';

import { authenticate, requireRole, requireStoreAccess } from '../middleware/auth';
import { register, login, changePin, updateProfile, createStaffAccount, createSuperAdmin, listStaff, toggleUserActive, resetUserPin, listCustomers, registerPushToken, getMe, addUserStore, removeUserStore, deleteUser, updateEmail, forgotPin, verifyOtp, resetPin } from '../controllers/auth.controller';
import {
  initiateGrant,
  uploadReceiptAndApprove,
  getMyTransactions,
  rejectTransaction,
  getStoreTransactions,
  getStoreSummary,
  redeemCredits,
  getPlatformSummary,
  getAllTransactions,
} from '../controllers/points.controller';
import {
  createOffer, getActiveOffers, updateOffer, deleteOffer, getOffersHistory,
  createBanner, getActiveBanners, deleteBanner,
} from '../controllers/offers.controller';
import {
  generateReceiptToken,
  getReceiptToken,
  selfGrant,
  getStoreApiKey,
  regenerateStoreApiKey,
} from '../controllers/receipt.controller';
import { getAuditLogs, getAuditStats } from '../controllers/audit.controller';
import { getMyChatStores, getMessages, sendMessage } from '../controllers/chat.controller';
import { submitRequest, getMyRequests, getStoreRequestsList, getPendingCount, acknowledgeRequest } from '../controllers/storeRequest.controller';
import {
  getStoreSchedule,
  getTodayRoster,
  getDayRoster,
  assignShift,
  removeShift,
  getMySchedule,
  createShiftRequest,
  getStoreRequests,
  updateShiftRequest,
  getStoreEmployees,
  getVacancies,
} from '../controllers/schedule.controller';
import {
  updateStoreBilling,
  getAllStoresBilling,
  getStores,
  updateStore,
  createBillingRecord,
  markBillingPaid,
  markPeriodPaid,
  getDevRevenue,
  getAnalytics,
  getCategoryRates,
  updateCategoryRate,
  getDevCutRate,
  updateDevCutRate,
  generateMonthlyBilling,
  generateAllMissingBills,
  getMonthlyRecords,
  seedTestTransactions,
  sendBillingReport,
  getSuperAdminInvoices,
  getSuperAdminNotifications,
} from '../controllers/billing.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', register);                                          // New customer signup
router.post('/auth/login', login);                                                // Phone + PIN login
router.patch('/auth/pin', authenticate, changePin);                               // Change PIN
router.patch('/auth/profile', authenticate, updateProfile);                       // Update name
router.post('/auth/push-token', authenticate, registerPushToken);
router.get('/auth/me', authenticate, getMe);
router.patch('/auth/email', authenticate, updateEmail);                           // Save recovery email
router.post('/auth/forgot-pin', forgotPin);                                       // Request OTP (unauthenticated)
router.post('/auth/verify-otp', verifyOtp);                                       // Verify OTP → get resetToken
router.post('/auth/reset-pin', resetPin);                                         // Reset PIN using resetToken                                                          // Get current user (balance refresh)                 // Register push token
router.post('/auth/super-admin', authenticate, requireRole(Role.DEV_ADMIN), createSuperAdmin);       // Create SuperAdmin (HQ account)
router.post('/auth/staff', authenticate, requireRole(Role.SUPER_ADMIN), createStaffAccount);         // Create employee/manager
router.get('/staff', authenticate, requireRole(Role.SUPER_ADMIN), listStaff);                        // List all staff
router.get('/users/customers', authenticate, requireRole(Role.SUPER_ADMIN), listCustomers);          // List customers
router.patch('/users/:userId/toggle-active', authenticate, requireRole(Role.SUPER_ADMIN), toggleUserActive); // Deactivate/reactivate
router.patch('/users/:userId/reset-pin', authenticate, requireRole(Role.SUPER_ADMIN), resetUserPin); // Reset PIN
router.post('/users/:userId/stores', authenticate, requireRole(Role.SUPER_ADMIN), addUserStore);    // Add store assignment
router.delete('/users/:userId/stores/:storeId', authenticate, requireRole(Role.SUPER_ADMIN), removeUserStore); // Remove store assignment
router.delete('/users/:userId', authenticate, requireRole(Role.DEV_ADMIN), deleteUser);                       // Delete account (DevAdmin only)

// ─── Receipt QR (Printer Agent → Customer Self-Serve) ────────────────────────
router.post('/points/receipt-token', generateReceiptToken);                                             // Printer agent generates QR token (store API key auth)
router.get('/points/receipt-token/:tokenId', authenticate, getReceiptToken);                            // Customer previews receipt before claiming
router.post('/points/self-grant', authenticate, requireRole(Role.CUSTOMER), selfGrant);                 // Customer claims receipt QR points

// ─── Points (Customer) ────────────────────────────────────────────────────────
router.get('/points/my-history', authenticate, requireRole(Role.CUSTOMER), getMyTransactions);

// ─── Points (Employee) ────────────────────────────────────────────────────────
router.post('/points/grant', authenticate, requireRole(Role.EMPLOYEE), requireStoreAccess, initiateGrant);
router.post('/points/redeem', authenticate, requireRole(Role.EMPLOYEE), requireStoreAccess, redeemCredits);
router.post(
  '/points/grant/:transactionId/receipt',
  authenticate,
  requireRole(Role.EMPLOYEE),
  upload.single('receipt'),
  uploadReceiptAndApprove
);

// ─── Points (Admin) ───────────────────────────────────────────────────────────
router.get('/points/store/:storeId/summary', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreSummary);
router.get('/points/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreTransactions);
router.patch('/points/:transactionId/reject', authenticate, requireRole(Role.STORE_MANAGER), rejectTransaction);
router.get('/points/platform-summary', authenticate, requireRole(Role.SUPER_ADMIN), getPlatformSummary);
router.get('/points/all', authenticate, requireRole(Role.SUPER_ADMIN), getAllTransactions);

// ─── Offers ───────────────────────────────────────────────────────────────────
router.get('/offers', authenticate, getActiveOffers); // All authenticated users
router.get('/offers/history', authenticate, requireRole(Role.STORE_MANAGER), getOffersHistory);
router.post('/offers', authenticate, requireRole(Role.STORE_MANAGER), upload.single('image'), createOffer);
router.patch('/offers/:offerId', authenticate, requireRole(Role.STORE_MANAGER), updateOffer);
router.delete('/offers/:offerId', authenticate, requireRole(Role.STORE_MANAGER), deleteOffer);

// ─── Banners ──────────────────────────────────────────────────────────────────
router.get('/banners', authenticate, getActiveBanners); // All authenticated users
router.post('/banners', authenticate, requireRole(Role.STORE_MANAGER), upload.single('image'), createBanner);
router.delete('/banners/:bannerId', authenticate, requireRole(Role.STORE_MANAGER), deleteBanner);

// ─── Stores (SuperAdmin+) ─────────────────────────────────────────────────────
router.get('/stores', authenticate, requireRole(Role.SUPER_ADMIN), getStores);
router.patch('/stores/:storeId', authenticate, requireRole(Role.SUPER_ADMIN), updateStore);

// ─── Billing (DevAdmin only) ──────────────────────────────────────────────────
router.get('/billing/stores', authenticate, requireRole(Role.DEV_ADMIN), getAllStoresBilling);
router.get('/billing/revenue', authenticate, requireRole(Role.DEV_ADMIN), getDevRevenue);
router.get('/billing/analytics', authenticate, requireRole(Role.DEV_ADMIN), getAnalytics);
router.patch('/billing/stores/:storeId', authenticate, requireRole(Role.DEV_ADMIN), updateStoreBilling);
router.post('/billing/stores/:storeId/records', authenticate, requireRole(Role.DEV_ADMIN), createBillingRecord);
router.patch('/billing/records/:recordId/paid', authenticate, requireRole(Role.DEV_ADMIN), markBillingPaid);
router.patch('/billing/period/:period/paid', authenticate, requireRole(Role.DEV_ADMIN), markPeriodPaid);
router.get('/billing/category-rates', authenticate, requireRole(Role.DEV_ADMIN), getCategoryRates);
router.patch('/billing/category-rates/:category', authenticate, requireRole(Role.DEV_ADMIN), updateCategoryRate);
router.get('/billing/config/dev-cut-rate', authenticate, requireRole(Role.DEV_ADMIN), getDevCutRate);
router.put('/billing/config/dev-cut-rate', authenticate, requireRole(Role.DEV_ADMIN), updateDevCutRate);
router.post('/billing/generate-monthly', authenticate, requireRole(Role.DEV_ADMIN), generateMonthlyBilling);
router.post('/billing/generate-all', authenticate, requireRole(Role.DEV_ADMIN), generateAllMissingBills);
router.get('/billing/monthly-records', authenticate, requireRole(Role.DEV_ADMIN), getMonthlyRecords);
router.post('/billing/seed-test-data', authenticate, requireRole(Role.DEV_ADMIN), seedTestTransactions);
router.post('/billing/send-report', authenticate, requireRole(Role.DEV_ADMIN), sendBillingReport);
router.get('/billing/stores/:storeId/api-key', authenticate, requireRole(Role.DEV_ADMIN), getStoreApiKey);
router.post('/billing/stores/:storeId/api-key/regenerate', authenticate, requireRole(Role.DEV_ADMIN), regenerateStoreApiKey);

// ─── SuperAdmin — invoices & notifications ────────────────────────────────────
router.get('/my-invoices', authenticate, requireRole(Role.SUPER_ADMIN), getSuperAdminInvoices);
router.get('/notifications', authenticate, requireRole(Role.SUPER_ADMIN), getSuperAdminNotifications);

// ─── Audit Log (DevAdmin only) ────────────────────────────────────────────────
router.get('/audit/logs', authenticate, requireRole(Role.DEV_ADMIN), getAuditLogs);
router.get('/audit/stats', authenticate, requireRole(Role.DEV_ADMIN), getAuditStats);

// ─── Scheduling ───────────────────────────────────────────────────────────────
router.get('/schedule/store/:storeId/employees', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreEmployees);
router.get('/schedule/store/:storeId/today', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getTodayRoster);
router.get('/schedule/store/:storeId/requests', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreRequests);
router.get('/schedule/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreSchedule);
router.post('/schedule/shifts', authenticate, requireRole(Role.STORE_MANAGER), assignShift);
router.delete('/schedule/shifts/:shiftId', authenticate, requireRole(Role.STORE_MANAGER), removeShift);
router.get('/schedule/store/:storeId/day', authenticate, requireRole(Role.EMPLOYEE), getDayRoster);
router.get('/schedule/my', authenticate, requireRole(Role.EMPLOYEE), getMySchedule);
router.post('/schedule/requests', authenticate, requireRole(Role.EMPLOYEE), createShiftRequest);
router.patch('/schedule/requests/:requestId', authenticate, requireRole(Role.STORE_MANAGER), updateShiftRequest);
router.get('/schedule/vacancies', authenticate, getVacancies);                                       // Vacant shift slots (all roles)

// ─── Store Chat ───────────────────────────────────────────────────────────────
router.get('/chat/my-stores', authenticate, getMyChatStores);                                        // Stores user can chat in
router.get('/chat/:storeId/messages', authenticate, getMessages);                                    // Fetch messages (polling)
router.post('/chat/:storeId/messages', authenticate, sendMessage);                                   // Send message

// ─── Store Requests ───────────────────────────────────────────────────────────
router.post('/store-requests', authenticate, requireRole(Role.EMPLOYEE), submitRequest);             // Employee submits a request
router.get('/store-requests/mine', authenticate, requireRole(Role.EMPLOYEE), getMyRequests);         // Employee views their own requests
router.get('/store-requests/pending-count', authenticate, requireRole(Role.STORE_MANAGER), getPendingCount);  // Badge count for managers+
router.get('/store-requests/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), getStoreRequestsList); // Manager/admin views store requests
router.patch('/store-requests/:requestId/acknowledge', authenticate, requireRole(Role.STORE_MANAGER), acknowledgeRequest); // Acknowledge a request

export default router;
