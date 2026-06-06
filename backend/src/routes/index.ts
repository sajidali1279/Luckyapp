import { Router } from 'express';
import { Role } from '@prisma/client';
import multer from 'multer';

import { authenticate, requireRole, requireStoreAccess } from '../middleware/auth';
import { register, login, changePin, updateProfile, uploadAvatar, deleteAvatar, createStaffAccount, createSuperAdmin, listStaff, toggleUserActive, resetUserPin, listCustomers, exportCustomersCsv, registerPushToken, getMe, addUserStore, removeUserStore, deleteUser, updateEmail, verifyFirebaseReset, resetPin, confirm21, deleteOwnAccount } from '../controllers/auth.controller';
import {
  initiateGrant,
  uploadReceiptAndApprove,
  reviewFlaggedTransaction,
  getMyTransactions,
  rejectTransaction,
  getStoreTransactions,
  getStoreSummary,
  redeemCredits,
  getPlatformSummary,
  getAllTransactions,
  exportTransactionsCsv,
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
import { getMappings, addMapping, deleteMapping, getMyMappings } from '../controllers/keywordMappings.controller';
import { getMyNotifications, markAllRead, markOneRead, getUnreadCount, broadcastNotification } from '../controllers/notifications.controller';
import { getMyChatStores, getMessages, sendMessage } from '../controllers/chat.controller';
import { submitRequest, getMyRequests, getStoreRequestsList, getPendingCount, acknowledgeRequest } from '../controllers/storeRequest.controller';
import { submitProductRequest, getMyProductRequests, getStoreProductRequests, respondToProductRequest } from '../controllers/productRequest.controller';
import {
  getActiveList, getListHistory, getListById, openList, closeList,
  addItem, updateItem, removeItem, updateItemStatus, reorderItems,
  printList, getPrintHistory, restoreItems, getItemSuggestions, adminGetAllLists,
} from '../controllers/orderList.controller';
import {
  submitRequest as submitItemRequest,
  getStoreRequests as getStoreItemRequests,
  adminGetAllRequests as adminGetAllItemRequests,
  getMyRequests as getMyItemRequests,
  getRejectedLines,
  reviewRequest,
  getEmployeeSuggestions,
  getItemRequestsPendingCount,
} from '../controllers/employeeRequest.controller';
import {
  getCategories as getOrderCategories,
  submitCategory,
  adminGetCategories,
  adminUpdateCategory,
  adminDeleteCategory,
} from '../controllers/orderCategory.controller';
import { getInventoryAnalytics } from '../controllers/inventoryAnalytics.controller';
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
  createThread, getThreads, getThread, sendMessage as sendSupportMessage, resolveThread,
  getUnreadCount as getSupportUnreadCount, updatePriority, getSupportStats,
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
  getWelcomeBonusStatus,
  claimWelcomeBonus,
  getCustomerWelcomeBonus,
  confirmWelcomeBonus,
} from '../controllers/welcome-bonus.controller';
import {
  submitApplication,
  getApplications,
  getNewApplicationCount,
  updateApplication,
  deleteApplication,
} from '../controllers/careers.controller';
import { submitDispute, getMyDisputes, getStoreDisputes, getAllDisputes, resolveDispute } from '../controllers/dispute.controller';
import {
  getMenu as getHotFoodMenu,
  createItem as createHotFoodItem,
  updateItem as updateHotFoodItem,
  deleteItem as deleteHotFoodItem,
  getAllOrders as getHotFoodOrders,
  updateOrderStatus,
  getStoreMenu,
  placeOrder,
  getMyOrders as getMyHotFoodOrders,
  getStoreOrders,
  getStorePendingCount,
  getCatalog as getHotFoodCatalog,
  createCatalogItem as createHotFoodCatalogItem,
  updateCatalogItem as updateHotFoodCatalogItem,
  updateCatalogItemImage as updateHotFoodCatalogItemImage,
  deleteCatalogItem as deleteHotFoodCatalogItem,
  getCatalogItemStores as getHotFoodCatalogItemStores,
  assignCatalogItemToStore as assignHotFoodCatalogItemToStore,
  removeCatalogItemFromStore as removeHotFoodCatalogItemFromStore,
} from '../controllers/hotFood.controller';
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
  getStoreById,
  getStores,
  getAccessibleStores,
  updateStore,
  updateGasPrices,
  getAllGasPrices,
  createBillingRecord,
  markBillingPaid,
  markPeriodPaid,
  getExtraCharges,
  updateBillingRecord,
  deleteBillingRecord,
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
router.post('/auth/profile/avatar', authenticate, upload.single('avatar'), uploadAvatar); // Upload profile picture
router.delete('/auth/profile/avatar', authenticate, deleteAvatar);                        // Remove profile picture
router.post('/auth/push-token', authenticate, registerPushToken);
router.get('/auth/me', authenticate, getMe);
router.patch('/auth/email', authenticate, updateEmail);                           // Save recovery email
router.post('/auth/verify-firebase-reset', verifyFirebaseReset);                  // Firebase phone OTP verified → get resetToken
router.post('/auth/reset-pin', resetPin);                                         // Reset PIN using resetToken
router.patch('/auth/confirm-21', authenticate, requireRole(Role.CUSTOMER), confirm21); // Customer confirms 21+ for age-restricted stores
router.delete('/auth/account', authenticate, requireRole(Role.CUSTOMER), deleteOwnAccount); // Customer self-deletes account
router.post('/auth/super-admin', authenticate, requireRole(Role.DEV_ADMIN), createSuperAdmin);       // Create SuperAdmin (HQ account)
router.post('/auth/staff', authenticate, requireRole(Role.SUPER_ADMIN), createStaffAccount);         // Create employee/manager
router.get('/staff', authenticate, requireRole(Role.SUPER_ADMIN), listStaff);                        // List all staff
router.get('/users/customers', authenticate, requireRole(Role.SUPER_ADMIN), listCustomers);          // List customers
router.get('/users/customers/export', authenticate, requireRole(Role.SUPER_ADMIN), exportCustomersCsv); // Export customers CSV
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
router.patch('/points/:transactionId/review', authenticate, requireRole(Role.STORE_MANAGER), reviewFlaggedTransaction);
router.get('/points/platform-summary', authenticate, requireRole(Role.SUPER_ADMIN), getPlatformSummary);
router.get('/points/all', authenticate, requireRole(Role.SUPER_ADMIN), getAllTransactions);
router.get('/points/export', authenticate, requireRole(Role.STORE_MANAGER), exportTransactionsCsv);

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
router.get('/stores/accessible', authenticate, requireRole(Role.STORE_MANAGER), getAccessibleStores);    // Manager+: own stores (or all if allStoresAccess)
router.patch('/stores/:storeId', authenticate, requireRole(Role.SUPER_ADMIN), updateStore);
router.get('/stores/gas-prices', authenticate, getAllGasPrices);                                             // All authenticated (home screen display)
router.get('/stores/:storeId', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreById); // Manager+: own store info
router.patch('/stores/:storeId/gas-prices', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, updateGasPrices); // Manager+ per store

// ─── Store Keyword Mappings (POS → Category classification) ──────────────────
router.get('/stores/my-keyword-mappings', getMyMappings);                                                    // Printer agent (API key auth, no JWT)
router.get('/stores/:storeId/keyword-mappings', authenticate, requireRole(Role.SUPER_ADMIN), getMappings);
router.post('/stores/:storeId/keyword-mappings', authenticate, requireRole(Role.SUPER_ADMIN), addMapping);
router.delete('/stores/:storeId/keyword-mappings/:id', authenticate, requireRole(Role.SUPER_ADMIN), deleteMapping);

// ─── Billing (DevAdmin only) ──────────────────────────────────────────────────
router.get('/billing/stores', authenticate, requireRole(Role.DEV_ADMIN), getAllStoresBilling);
router.get('/billing/revenue', authenticate, requireRole(Role.DEV_ADMIN), getDevRevenue);
router.get('/billing/analytics', authenticate, requireRole(Role.DEV_ADMIN), getAnalytics);
router.patch('/billing/stores/:storeId', authenticate, requireRole(Role.DEV_ADMIN), updateStoreBilling);
router.post('/billing/stores/:storeId/records', authenticate, requireRole(Role.DEV_ADMIN), createBillingRecord);
router.get('/billing/extra-charges', authenticate, requireRole(Role.DEV_ADMIN), getExtraCharges);
router.patch('/billing/records/:recordId/paid', authenticate, requireRole(Role.DEV_ADMIN), markBillingPaid);
router.patch('/billing/records/:recordId', authenticate, requireRole(Role.DEV_ADMIN), updateBillingRecord);
router.delete('/billing/records/:recordId', authenticate, requireRole(Role.DEV_ADMIN), deleteBillingRecord);
router.patch('/billing/period/:period/paid', authenticate, requireRole(Role.DEV_ADMIN), markPeriodPaid);
router.get('/billing/tier-rates', authenticate, requireRole(Role.EMPLOYEE), getTierRates);
router.put('/billing/tier-rates/:tier', authenticate, requireRole(Role.SUPER_ADMIN), updateTierRate);
router.get('/billing/category-rates', authenticate, requireRole(Role.EMPLOYEE), getCategoryRates);
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
router.patch('/support/threads/:threadId/priority', authenticate, requireRole(Role.DEV_ADMIN), updatePriority);
router.get('/support/stats', authenticate, requireRole(Role.DEV_ADMIN), getSupportStats);

// ─── Leaderboard & Ratings ────────────────────────────────────────────────────
router.get('/leaderboard/customers', authenticate, getCustomerLeaderboard);                                           // Chain or store customer leaderboard
router.get('/leaderboard/employees/:storeId', authenticate, requireRole(Role.EMPLOYEE), getEmployeeLeaderboard);     // Employee leaderboard for a store
router.post('/ratings', authenticate, requireRole(Role.CUSTOMER), submitRating);                                      // Customer rates employee after transaction
router.get('/ratings/pending', authenticate, requireRole(Role.CUSTOMER), getPendingRatings);                          // Customer: unrated approved transactions
router.get('/ratings/my/:storeId', authenticate, requireRole(Role.EMPLOYEE), getMyRatingSummary);                     // Employee: own rating summary

// ─── Careers ─────────────────────────────────────────────────────────────────
router.post('/careers/apply', authenticate, requireRole(Role.CUSTOMER), submitApplication);              // Customer submits job application
router.get('/careers/applications', authenticate, requireRole(Role.SUPER_ADMIN), getApplications);       // Admin views all applications
router.get('/careers/applications/new-count', authenticate, requireRole(Role.SUPER_ADMIN), getNewApplicationCount); // Badge count
router.patch('/careers/applications/:id', authenticate, requireRole(Role.SUPER_ADMIN), updateApplication);          // Update status / notes
router.delete('/careers/applications/:id', authenticate, requireRole(Role.DEV_ADMIN), deleteApplication);            // Delete application

// ─── Welcome / Joining Bonus ─────────────────────────────────────────────────
router.get('/welcome-bonus',                    authenticate, requireRole(Role.CUSTOMER),  getWelcomeBonusStatus);
router.post('/welcome-bonus/claim',             authenticate, requireRole(Role.CUSTOMER),  claimWelcomeBonus);
router.get('/welcome-bonus/customer/:qrCode',   authenticate, requireRole(Role.EMPLOYEE),  getCustomerWelcomeBonus);
router.post('/welcome-bonus/confirm',           authenticate, requireRole(Role.EMPLOYEE),  confirmWelcomeBonus);

// ─── Store Requests ───────────────────────────────────────────────────────────
router.post('/store-requests', authenticate, requireRole(Role.EMPLOYEE), submitRequest);             // Employee submits a request
router.get('/store-requests/mine', authenticate, requireRole(Role.EMPLOYEE), getMyRequests);         // Employee views their own requests
router.get('/store-requests/pending-count', authenticate, requireRole(Role.STORE_MANAGER), getPendingCount);  // Badge count for managers+
router.get('/store-requests/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), getStoreRequestsList); // Manager/admin views store requests
router.patch('/store-requests/:requestId/acknowledge', authenticate, requireRole(Role.STORE_MANAGER), acknowledgeRequest); // Acknowledge a request

// ─── Product Requests (Customer) ─────────────────────────────────────────────
router.post('/product-requests', authenticate, requireRole(Role.CUSTOMER), submitProductRequest);
router.get('/product-requests/mine', authenticate, requireRole(Role.CUSTOMER), getMyProductRequests);
router.get('/product-requests/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), getStoreProductRequests);
router.patch('/product-requests/:id/respond', authenticate, requireRole(Role.STORE_MANAGER), respondToProductRequest);

// ─── Order Lists (Procurement Ticketing) ─────────────────────────────────────
router.get('/order-lists/suggestions',                          authenticate, requireRole(Role.STORE_MANAGER), getItemSuggestions);                    // Item name autocomplete — all stores combined, no store filter needed
router.get('/order-lists/admin/all',                            authenticate, requireRole(Role.SUPER_ADMIN),   adminGetAllLists);                          // All lists across stores
router.get('/order-lists/store/:storeId/active',                authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getActiveList);         // Current OPEN list with items
router.get('/order-lists/store/:storeId/history',               authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getListHistory);         // Closed lists (paginated)
router.get('/order-lists/store/:storeId/print-history/:listId', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getPrintHistory);        // Print jobs for a list
router.get('/order-lists/:listId',                              authenticate, requireRole(Role.STORE_MANAGER), getListById);                                // Single list detail
router.post('/order-lists/store/:storeId',                      authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, openList);               // Open a new list for store
router.post('/order-lists/store/:storeId/restore-items',        authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, restoreItems);            // Add undelivered items to active list
router.post('/order-lists/:listId/items',                       authenticate, requireRole(Role.STORE_MANAGER), addItem);                                    // Add item to a list
router.post('/order-lists/:listId/print',                       authenticate, requireRole(Role.STORE_MANAGER), printList);                                  // Print/snapshot current list
router.patch('/order-lists/:listId/close',                      authenticate, requireRole(Role.STORE_MANAGER), closeList);                                  // Close list (order placed/delivered)
router.patch('/order-lists/:listId/reorder',                    authenticate, requireRole(Role.STORE_MANAGER), reorderItems);                               // Drag reorder items
router.patch('/order-lists/items/:itemId',                      authenticate, requireRole(Role.STORE_MANAGER), updateItem);                                 // Edit item (name/qty/category/notes)
router.patch('/order-lists/items/:itemId/status',               authenticate, requireRole(Role.STORE_MANAGER), updateItemStatus);                           // Mark ORDERED / RECEIVED
router.delete('/order-lists/items/:itemId',                     authenticate, requireRole(Role.STORE_MANAGER), removeItem);                                 // Soft-delete item (status → REMOVED)

// ─── Employee Item Requests ───────────────────────────────────────────────────
router.get('/employee-requests/suggestions',                     authenticate, requireRole(Role.EMPLOYEE),      getEmployeeSuggestions);              // Item name + category autocomplete
router.get('/employee-requests/pending-count',                   authenticate, requireRole(Role.STORE_MANAGER), getItemRequestsPendingCount);          // Badge count — all stores for admin, own stores for manager
router.get('/employee-requests/admin/all',                       authenticate, requireRole(Role.SUPER_ADMIN),   adminGetAllItemRequests);              // Admin: all requests across stores
router.post('/employee-requests',                                authenticate, requireRole(Role.EMPLOYEE),      submitItemRequest);                    // Employee submits multi-item form
router.get('/employee-requests/mine',                            authenticate, requireRole(Role.EMPLOYEE),      getMyItemRequests);                    // Employee views own requests
router.get('/employee-requests/store/:storeId',                  authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreItemRequests);   // Manager views store requests
router.get('/employee-requests/store/:storeId/rejected',         authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getRejectedLines);        // Rejection log for a store
router.patch('/employee-requests/:requestId/review',             authenticate, requireRole(Role.STORE_MANAGER), reviewRequest);                        // Accept/reject each line → adds to list

// ─── Inventory Analytics ─────────────────────────────────────────────────────
router.get('/inventory/analytics',         authenticate, requireRole(Role.STORE_MANAGER), getInventoryAnalytics);   // Top items, category breakdown, store comparison

// ─── Order Categories ─────────────────────────────────────────────────────────
router.get('/order-categories',          authenticate, requireRole(Role.EMPLOYEE),     getOrderCategories);    // Approved categories for dropdown
router.post('/order-categories/submit',  authenticate, requireRole(Role.EMPLOYEE), submitCategory);            // Employee/Manager submits new → DevAdmin notified
router.get('/order-categories/admin',    authenticate, requireRole(Role.DEV_ADMIN),    adminGetCategories);    // All categories with status filter
router.patch('/order-categories/:id',    authenticate, requireRole(Role.DEV_ADMIN),    adminUpdateCategory);   // Approve / edit name (cascades to items) / reject
router.delete('/order-categories/:id',   authenticate, requireRole(Role.DEV_ADMIN),    adminDeleteCategory);   // Hard delete

// ─── Hot Food ─────────────────────────────────────────────────────────────────
// Menu — admin CRUD (STORE_MANAGER = read-only, SUPER_ADMIN+ = write)
router.get('/hot-food/menu',         authenticate, requireRole(Role.STORE_MANAGER), getHotFoodMenu);
router.post('/hot-food/menu',        authenticate, requireRole(Role.SUPER_ADMIN),   createHotFoodItem);
router.patch('/hot-food/menu/:id',   authenticate, requireRole(Role.STORE_MANAGER), updateHotFoodItem);
router.delete('/hot-food/menu/:id',  authenticate, requireRole(Role.SUPER_ADMIN),   deleteHotFoodItem);
// Orders — admin board (specific routes before :id param)
router.get('/hot-food/orders/admin', authenticate, requireRole(Role.STORE_MANAGER), getHotFoodOrders);
router.get('/hot-food/orders/mine',  authenticate, requireRole(Role.CUSTOMER),      getMyHotFoodOrders);
router.patch('/hot-food/orders/:id', authenticate, requireRole(Role.STORE_MANAGER), updateOrderStatus);
// Orders — mobile (manager/employee per-store board) — specific before generic
router.get('/hot-food/orders/store/:storeId/pending-count', authenticate, requireRole(Role.STORE_MANAGER), getStorePendingCount);
router.get('/hot-food/orders/store/:storeId',               authenticate, requireRole(Role.STORE_MANAGER), getStoreOrders);
// Menu + orders — customer / mobile
router.get('/hot-food/store/:storeId/menu', authenticate, requireRole(Role.CUSTOMER), getStoreMenu);
router.post('/hot-food/orders',             authenticate, requireRole(Role.CUSTOMER), placeOrder);
// Catalog — admin (global item library with store assignment)
router.get('/hot-food/catalog',                         authenticate, requireRole(Role.SUPER_ADMIN),   getHotFoodCatalog);
router.post('/hot-food/catalog',                        authenticate, requireRole(Role.SUPER_ADMIN),   upload.single('image'), createHotFoodCatalogItem);
router.patch('/hot-food/catalog/:id',                   authenticate, requireRole(Role.SUPER_ADMIN),   updateHotFoodCatalogItem);
router.patch('/hot-food/catalog/:id/image',             authenticate, requireRole(Role.SUPER_ADMIN),   upload.single('image'), updateHotFoodCatalogItemImage);
router.delete('/hot-food/catalog/:id',                  authenticate, requireRole(Role.SUPER_ADMIN),   deleteHotFoodCatalogItem);
router.get('/hot-food/catalog/:id/stores',              authenticate, requireRole(Role.SUPER_ADMIN),   getHotFoodCatalogItemStores);
router.post('/hot-food/catalog/:id/stores',             authenticate, requireRole(Role.SUPER_ADMIN),   assignHotFoodCatalogItemToStore);
router.delete('/hot-food/catalog/:id/stores/:storeId',  authenticate, requireRole(Role.SUPER_ADMIN),   removeHotFoodCatalogItemFromStore);

// ─── Points Disputes ──────────────────────────────────────────────────────────
router.post('/disputes',                          authenticate, requireRole(Role.CUSTOMER),     submitDispute);
router.get('/disputes/mine',                      authenticate, requireRole(Role.CUSTOMER),     getMyDisputes);
router.get('/disputes/store/:storeId',            authenticate, requireRole(Role.STORE_MANAGER), getStoreDisputes);
router.get('/disputes/all',                       authenticate, requireRole(Role.SUPER_ADMIN),   getAllDisputes);
router.patch('/disputes/:id/resolve',             authenticate, requireRole(Role.STORE_MANAGER), resolveDispute);

export default router;
