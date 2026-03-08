import { Router } from 'express';
import { Role } from '@prisma/client';
import multer from 'multer';

import { authenticate, requireRole, requireStoreAccess } from '../middleware/auth';
import { register, login, changePin, updateProfile, createStaffAccount, createSuperAdmin, listStaff, toggleUserActive, resetUserPin } from '../controllers/auth.controller';
import {
  initiateGrant,
  uploadReceiptAndApprove,
  getMyTransactions,
  rejectTransaction,
  getStoreTransactions,
} from '../controllers/points.controller';
import {
  createOffer, getActiveOffers, updateOffer, deleteOffer,
  createBanner, getActiveBanners, deleteBanner,
} from '../controllers/offers.controller';
import {
  updateStoreBilling,
  getAllStoresBilling,
  getStores,
  createBillingRecord,
  markBillingPaid,
  getDevRevenue,
} from '../controllers/billing.controller';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

// ─── Auth ─────────────────────────────────────────────────────────────────────
router.post('/auth/register', register);                                          // New customer signup
router.post('/auth/login', login);                                                // Phone + PIN login
router.patch('/auth/pin', authenticate, changePin);                               // Change PIN
router.patch('/auth/profile', authenticate, updateProfile);                       // Update name
router.post('/auth/super-admin', authenticate, requireRole(Role.DEV_ADMIN), createSuperAdmin);       // Create SuperAdmin (HQ account)
router.post('/auth/staff', authenticate, requireRole(Role.SUPER_ADMIN), createStaffAccount);         // Create employee/manager
router.get('/staff', authenticate, requireRole(Role.SUPER_ADMIN), listStaff);                        // List all staff
router.patch('/users/:userId/toggle-active', authenticate, requireRole(Role.SUPER_ADMIN), toggleUserActive); // Deactivate/reactivate
router.patch('/users/:userId/reset-pin', authenticate, requireRole(Role.SUPER_ADMIN), resetUserPin); // Reset PIN

// ─── Points (Customer) ────────────────────────────────────────────────────────
router.get('/points/my-history', authenticate, requireRole(Role.CUSTOMER), getMyTransactions);

// ─── Points (Employee) ────────────────────────────────────────────────────────
router.post('/points/grant', authenticate, requireRole(Role.EMPLOYEE), requireStoreAccess, initiateGrant);
router.post(
  '/points/grant/:transactionId/receipt',
  authenticate,
  requireRole(Role.EMPLOYEE),
  upload.single('receipt'),
  uploadReceiptAndApprove
);

// ─── Points (Admin) ───────────────────────────────────────────────────────────
router.get('/points/store/:storeId', authenticate, requireRole(Role.STORE_MANAGER), requireStoreAccess, getStoreTransactions);
router.patch('/points/:transactionId/reject', authenticate, requireRole(Role.STORE_MANAGER), rejectTransaction);

// ─── Offers ───────────────────────────────────────────────────────────────────
router.get('/offers', authenticate, getActiveOffers); // All authenticated users
router.post('/offers', authenticate, requireRole(Role.SUPER_ADMIN), upload.single('image'), createOffer);
router.patch('/offers/:offerId', authenticate, requireRole(Role.SUPER_ADMIN), updateOffer);
router.delete('/offers/:offerId', authenticate, requireRole(Role.SUPER_ADMIN), deleteOffer);

// ─── Banners ──────────────────────────────────────────────────────────────────
router.get('/banners', authenticate, getActiveBanners); // All authenticated users
router.post('/banners', authenticate, requireRole(Role.SUPER_ADMIN), upload.single('image'), createBanner);
router.delete('/banners/:bannerId', authenticate, requireRole(Role.SUPER_ADMIN), deleteBanner);

// ─── Stores (SuperAdmin+) ─────────────────────────────────────────────────────
router.get('/stores', authenticate, requireRole(Role.SUPER_ADMIN), getStores);

// ─── Billing (DevAdmin only) ──────────────────────────────────────────────────
router.get('/billing/stores', authenticate, requireRole(Role.DEV_ADMIN), getAllStoresBilling);
router.get('/billing/revenue', authenticate, requireRole(Role.DEV_ADMIN), getDevRevenue);
router.patch('/billing/stores/:storeId', authenticate, requireRole(Role.DEV_ADMIN), updateStoreBilling);
router.post('/billing/stores/:storeId/records', authenticate, requireRole(Role.DEV_ADMIN), createBillingRecord);
router.patch('/billing/records/:recordId/paid', authenticate, requireRole(Role.DEV_ADMIN), markBillingPaid);

export default router;
