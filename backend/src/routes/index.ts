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
  getCustomerInfo,
  getMyBenefitStatus,
  claimTierBenefit,
  processCatalogRedemption,
} from '../controllers/points.controller';
import { getCatalog, getAllCatalog, createCatalogItem, updateCatalogItem, deleteCatalogItem, customerInitiateRedemption, getMyRedemptions, cancelRedemption, getPendingRedemptionsForCustomer, confirmRedemption } from '../controllers/catalog.controller';
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
import { getMyNotifications, markAllRead, markOneRead, getUnreadCount, broadcastNotification } from '../controllers/notifications.controller';
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
  createThread, getThreads, getThread, sendMessage as sendSupportMessage, resolveThread, getUnreadCount as getSupportUnreadCount,
} from '../controllers/support.controller';
import {
  submitPromotionRequest,
  getPublishedPromotions,
  getMyPromotionRequest,
  getAllPromotionRequests,
  publishPromotion,
  rejectPromotion,
  deletePromotion,
} from '../controllers/promotions.controller';
import {
  getCustomerLeaderboard,
  getEmployeeLeaderboard,
  submitRating,
  getPendingRatings,
  getMyRatingSummary,
} from '../controllers/leaderboard.controller';
import {
  updateStoreBilling,
  getAllStoresBilling,
  getStores,
  updateStore,
  updateGasPrices,
  getAllGasPrices,
  createBillingRecord,
  markBillingPaid,
  markPeriodPaid,
  getDevRevenue,
  getAnalytics,
  getCategoryRates,
  updateCategoryRate,
  getDevCutRate,
  updateDevCutRate,
  getTierRates,
  updateTierRate,
  generateMonthlyBilling,
  generateAllMissingBills,
  getMonthlyRecords,
  seedTestTransactions,
  sendBillingReport,
  getSuperAdminInvoices,
  getSuperAdminNotifications,
  getDevAdminNotifications,
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
// Customer info lookup (cashier use — before grant/redeem)
router.get('/points/customer-info/:qrCode', authenticate, requireRole(Role.EMPLOYEE), getCustomerInfo);
router.get('/points/my-benefit-status', authenticate, requireRole(Role.CUSTOMER), getMyBenefitStatus);

// Tier benefit claiming (Employee)
router.post('/points/tier-benefit', authenticate, requireRole(Role.EMPLOYEE), requireStoreAccess, claimTierBenefit);

// Catalog redemption (Employee)
router.post('/points/catalog-redeem', authenticate, requireRole(Role.EMPLOYEE), requireStoreAccess, processCatalogRedemption);

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
router.get('/stores/gas-prices', authenticate, getAllGasPrices);                                             // All authenticated (home screen display)
router.patch('/stores/:storeId/gas-prices', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, updateGasPrices); // Manager+ per store

// ─── Billing (DevAdmin only) ──────────────────────────────────────────────────
router.get('/billing/stores', authenticate, requireRole(Role.DEV_ADMIN), getAllStoresBilling);
router.get('/billing/revenue', authenticate, requireRole(Role.DEV_ADMIN), getDevRevenue);
router.get('/billing/analytics', authenticate, requireRole(Role.DEV_ADMIN), getAnalytics);
router.patch('/billing/stores/:storeId', authenticate, requireRole(Role.DEV_ADMIN), updateStoreBilling);
router.post('/billing/stores/:storeId/records', authenticate, requireRole(Role.DEV_ADMIN), createBillingRecord);
router.patch('/billing/records/:recordId/paid', authenticate, requireRole(Role.DEV_ADMIN), markBillingPaid);
router.patch('/billing/period/:period/paid', authenticate, requireRole(Role.DEV_ADMIN), markPeriodPaid);
router.get('/billing/tier-rates', authenticate, requireRole(Role.EMPLOYEE), getTierRates);
router.put('/billing/tier-rates/:tier', authenticate, requireRole(Role.SUPER_ADMIN), updateTierRate);
router.get('/billing/category-rates', authenticate, requireRole(Role.DEV_ADMIN), getCategoryRates);
router.patch('/billing/category-rates/:category', authenticate, requireRole(Role.DEV_ADMIN), updateCategoryRate);
router.get('/billing/config/dev-cut-rate', authenticate, requireRole(Role.DEV_ADMIN), getDevCutRate);
router.put('/billing/config/dev-cut-rate', authenticate, requireRole(Role.DEV_ADMIN), updateDevCutRate);
router.post('/billing/generate-monthly', authenticate, requireRole(Role.DEV_ADMIN), generateMonthlyBilling);
router.post('/billing/generate-all', authenticate, requireRole(Role.DEV_ADMIN), generateAllMissingBills);
router.get('/billing/monthly-records', authenticate, requireRole(Role.DEV_ADMIN), getMonthlyRecords);
router.post('/billing/seed-test-data', authenticate, requireRole(Role.DEV_ADMIN), seedTestTransactions);
router.post('/billing/send-report', authenticate, requireRole(Role.DEV_ADMIN), sendBillingReport);
router.get('/billing/notifications', authenticate, requireRole(Role.DEV_ADMIN), getDevAdminNotifications);
router.get('/billing/stores/:storeId/api-key', authenticate, requireRole(Role.DEV_ADMIN), getStoreApiKey);
router.post('/billing/stores/:storeId/api-key/regenerate', authenticate, requireRole(Role.DEV_ADMIN), regenerateStoreApiKey);

// ─── SuperAdmin — invoices & notifications ────────────────────────────────────
router.get('/my-invoices', authenticate, requireRole(Role.SUPER_ADMIN), getSuperAdminInvoices);
router.get('/notifications', authenticate, requireRole(Role.SUPER_ADMIN), getSuperAdminNotifications);

// ─── Push Broadcast (SuperAdmin+) ────────────────────────────────────────────
router.post('/notifications/broadcast', authenticate, requireRole(Role.SUPER_ADMIN), broadcastNotification);

// ─── In-App Notifications (all authenticated users) ──────────────────────────
router.get('/notifications/my', authenticate, getMyNotifications);
router.get('/notifications/unread-count', authenticate, getUnreadCount);
router.patch('/notifications/mark-all-read', authenticate, markAllRead);
router.patch('/notifications/:id/read', authenticate, markOneRead);

// ─── Audit Log ───────────────────────────────────────────────────────────────
router.get('/audit/logs', authenticate, requireRole(Role.SUPER_ADMIN), getAuditLogs);
router.get('/audit/stats', authenticate, requireRole(Role.SUPER_ADMIN), getAuditStats);

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

// ─── Redemption Catalog ───────────────────────────────────────────────────────
router.get('/catalog', authenticate, getCatalog);
router.get('/catalog/all', authenticate, requireRole(Role.SUPER_ADMIN), getAllCatalog);
router.post('/catalog', authenticate, requireRole(Role.SUPER_ADMIN), createCatalogItem);
router.patch('/catalog/:id', authenticate, requireRole(Role.SUPER_ADMIN), updateCatalogItem);
router.delete('/catalog/:id', authenticate, requireRole(Role.SUPER_ADMIN), deleteCatalogItem);
// Customer-initiated redemption (hold + 30-min expiry)
router.post('/catalog/redeem', authenticate, customerInitiateRedemption);
router.get('/catalog/my-redemptions', authenticate, getMyRedemptions);
router.delete('/catalog/redeem/:id', authenticate, cancelRedemption);
// Employee confirms a pending redemption
router.get('/catalog/pending/:qrCode', authenticate, requireRole(Role.EMPLOYEE), getPendingRedemptionsForCustomer);
router.post('/catalog/redeem/:id/confirm', authenticate, requireRole(Role.EMPLOYEE), confirmRedemption);

// ─── Business Promotions ──────────────────────────────────────────────────────
router.post('/promotions/request', authenticate, requireRole(Role.CUSTOMER), upload.single('image'), submitPromotionRequest);    // Customer submits (optional logo)
router.get('/promotions', authenticate, getPublishedPromotions);                                                                  // All authenticated — see published ads
router.get('/promotions/my', authenticate, requireRole(Role.CUSTOMER), getMyPromotionRequest);                                    // Customer checks their own request
router.get('/promotions/requests', authenticate, requireRole(Role.DEV_ADMIN), getAllPromotionRequests);                           // DevAdmin sees all requests
router.post('/promotions/:id/publish', authenticate, requireRole(Role.DEV_ADMIN), upload.single('image'), publishPromotion);     // DevAdmin publishes (optional banner image)
router.patch('/promotions/:id/reject', authenticate, requireRole(Role.DEV_ADMIN), rejectPromotion);                              // DevAdmin rejects
router.delete('/promotions/:id', authenticate, requireRole(Role.DEV_ADMIN), deletePromotion);                                    // DevAdmin deletes

// ─── Support (SuperAdmin → DevAdmin) ─────────────────────────────────────────
router.post('/support/threads', authenticate, requireRole(Role.SUPER_ADMIN), createThread);
router.get('/support/threads', authenticate, requireRole(Role.SUPER_ADMIN), getThreads);
router.get('/support/unread-count', authenticate, requireRole(Role.DEV_ADMIN), getSupportUnreadCount);
router.get('/support/threads/:threadId', authenticate, requireRole(Role.SUPER_ADMIN), getThread);
router.post('/support/threads/:threadId/messages', authenticate, requireRole(Role.SUPER_ADMIN), sendSupportMessage);
router.patch('/support/threads/:threadId/resolve', authenticate, requireRole(Role.DEV_ADMIN), resolveThread);
// DevAdmin also needs to read threads and send messages
router.get('/support/inbox', authenticate, requireRole(Role.DEV_ADMIN), getThreads);
router.get('/support/inbox/:threadId', authenticate, requireRole(Role.DEV_ADMIN), getThread);
router.post('/support/inbox/:threadId/messages', authenticate, requireRole(Role.DEV_ADMIN), sendSupportMessage);

// ─── Leaderboard & Ratings ────────────────────────────────────────────────────
router.get('/leaderboard/customers', authenticate, getCustomerLeaderboard);                                           // Chain or store customer leaderboard
router.get('/leaderboard/employees/:storeId', authenticate, requireRole(Role.EMPLOYEE), getEmployeeLeaderboard);     // Employee leaderboard for a store
router.post('/ratings', authenticate, requireRole(Role.CUSTOMER), submitRating);                                      // Customer rates employee after transaction
router.get('/ratings/pending', authenticate, requireRole(Role.CUSTOMER), getPendingRatings);                          // Customer: unrated approved transactions
router.get('/ratings/my/:storeId', authenticate, requireRole(Role.EMPLOYEE), getMyRatingSummary);                     // Employee: own rating summary

// ─── Store Requests ───────────────────────────────────────────────────────────
router.post('/store-requests', authenticate, requireRole(Role.EMPLOYEE), submitRequest);             // Employee submits a request
router.get('/store-requests/mine', authenticate, requireRole(Role.EMPLOYEE), getMyRequests);         // Employee views their own requests
router.get('/store-requests/pending-count', authenticate, requireRole(Role.STORE_MANAGER), getPendingCount);  // Badge count for managers+
router.get('/store-requests/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), getStoreRequestsList); // Manager/admin views store requests
router.patch('/store-requests/:requestId/acknowledge', authenticate, requireRole(Role.STORE_MANAGER), acknowledgeRequest); // Acknowledge a request

export default router;
