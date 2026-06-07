# Lucky Stop Loyalty Platform — Technical Documentation

**Version:** 1.2
**Last Updated:** June 7, 2026
**Maintained By:** Cliff Industries (sksajidali1279@gmail.com)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Technology Stack](#3-technology-stack)
4. [Role-Based Access Control (RBAC)](#4-role-based-access-control-rbac)
5. [Authentication and Security](#5-authentication-and-security)
6. [Database Schema](#6-database-schema)
7. [Points and Cashback Calculation](#7-points-and-cashback-calculation)
8. [Tier System Logic](#8-tier-system-logic)
9. [API Reference](#9-api-reference)
10. [Push Notification System](#10-push-notification-system)
11. [Image Storage and Upload](#11-image-storage-and-upload)
12. [Mobile App Architecture](#12-mobile-app-architecture)
13. [Admin Portal Architecture](#13-admin-portal-architecture)
14. [POS Integration — Receipt QR Tokens](#14-pos-integration--receipt-qr-tokens)
15. [Environment Variables](#15-environment-variables)
16. [Deployment Infrastructure](#16-deployment-infrastructure)
17. [Billing System](#17-billing-system)
18. [Fraud Prevention System](#18-fraud-prevention-system)
19. [Audit Logging System](#19-audit-logging-system)
20. [Third-Party Integrations](#20-third-party-integrations)
21. [Error Handling Conventions](#21-error-handling-conventions)
22. [Development Setup](#22-development-setup)
23. [Database Migrations](#23-database-migrations)

---

## 1. System Overview

The Lucky Stop Loyalty Platform is a multi-tenant, multi-role SaaS loyalty rewards system for the Lucky Stop convenience store chain. It consists of:

- **Customer-facing mobile app** (React Native / Expo) for iOS and Android.
- **Employee and manager mobile app** (same binary, role-gated UI).
- **Web admin portal** (React / Vite) for administrative management.
- **REST API backend** (Node.js / Express / Prisma) serving all clients.
- **PostgreSQL database** (Neon) as the primary data store.

### Key Business Features

| Feature | Description |
|---|---|
| Loyalty points | 5%+ cashback on qualifying purchases, credited as in-app credits |
| Tier system | Bronze → Silver → Gold → Diamond → Platinum based on period points |
| QR code identification | Every customer has a unique QR code for in-store scanning |
| Receipt upload | Mandatory fraud documentation for every transaction |
| Catalog redemption | Customer-initiated reward claims with expiring redemption codes |
| Promotional offers | Time-limited bonus rate offers with push notification delivery |
| Procurement management | Digital order lists and employee item request workflows |
| Scheduling | Employee shift templates, roster generation, shift requests |
| Store chat | Real-time per-store staff messaging |
| Billing | Per-store monthly subscriptions + per-transaction dev cut |
| Analytics | Transaction analytics, inventory intelligence, leaderboard |

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLIENT LAYER                                  │
│                                                                 │
│  ┌──────────────────────┐    ┌──────────────────────────────┐  │
│  │  Mobile App          │    │  Web Admin Portal            │  │
│  │  React Native/Expo   │    │  React + Vite                │  │
│  │  iOS + Android       │    │  admin.luckystop.cliffindus  │  │
│  │  Expo EAS build      │    │  .com                        │  │
│  └──────────┬───────────┘    └─────────────┬────────────────┘  │
│             │                              │                    │
└─────────────┼──────────────────────────────┼────────────────────┘
              │                              │
              │         HTTPS (TLS 1.2+)     │
              ▼                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    BACKEND API LAYER                             │
│                                                                 │
│  Express.js REST API                                            │
│  api.luckystop.cliffindus.com                                   │
│  Hosted on Render                                               │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Auth    │ │  Points  │ │ Billing  │ │  Other Domains   │  │
│  │ Routes   │ │ Routes   │ │  Routes  │ │ (offers, catalog,│  │
│  │          │ │          │ │          │ │  schedule, etc.) │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
│                                                                 │
│  Middleware Stack:                                              │
│  authenticate → RBAC checks → route handlers → Prisma ORM      │
│                                                                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    DATA / SERVICES LAYER                         │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────┐    ┌──────────────┐  │
│  │  PostgreSQL DB   │    │  Cloudinary  │    │   Firebase   │  │
│  │  (Neon)          │    │  (Images)    │    │  (Auth/Push) │  │
│  └──────────────────┘    └──────────────┘    └──────────────┘  │
│                                                                 │
│  ┌──────────────────┐    ┌──────────────┐                      │
│  │    Resend        │    │   Expo EAS   │                      │
│  │  (Email)         │    │  (App Builds)│                      │
│  └──────────────────┘    └──────────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

### Request Flow

1. Client sends HTTPS request to `api.luckystop.cliffindus.com/api/*`.
2. Express middleware: CORS → JSON body parsing → `authenticate` middleware extracts and verifies JWT.
3. Role-specific middleware enforces RBAC.
4. Route handler calls controller function.
5. Controller calls Prisma ORM to query/mutate PostgreSQL.
6. Response returned as `{ success: true, data: {...} }` or `{ success: false, error: "..." }`.

---

## 3. Technology Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20.x | Runtime |
| Express.js | 4.18.3 | HTTP framework |
| Prisma ORM | 5.22.0 | Database ORM and migrations |
| PostgreSQL | 15.x (Neon) | Primary database |
| Firebase Admin SDK | 13.8.0 | OTP verification, push notifications |
| jsonwebtoken | 9.0.2 | JWT generation and verification |
| bcryptjs | 2.4.3 | PIN hashing |
| Cloudinary SDK | 2.2.0 | Image upload and delivery |
| Multer | 1.4.5 | Multipart form data handling |
| Zod | 3.22.4 | Request schema validation |
| node-cron | 4.2.1 | Scheduled jobs (billing generation) |
| Resend SDK | 6.1.3 | Transactional email delivery |
| TypeScript | 5.4.2 | Static typing |
| ts-node | — | TypeScript execution |

### Mobile App

| Technology | Version | Purpose |
|---|---|---|
| React Native | 0.83.6 | Mobile framework |
| Expo | 55.0.19 | Development platform + managed workflow |
| Expo Router | 55.0.13 | File-based navigation |
| React | 19.2.0 | UI library |
| TanStack React Query | 5.62.3 | Server state management |
| Zustand | 5.0.1 | Client state management |
| Axios | 1.7.9 | HTTP client |
| React Native Firebase | 21.13.0 | Firebase Auth (phone OTP) |
| Expo Secure Store | — | Encrypted JWT storage |
| Expo Image Picker | — | Camera / photo library access |
| Expo Local Authentication | — | Biometric (Face ID / Touch ID) |
| Expo Notifications | — | Push notification handling |
| React Hook Form | 7.54.0 | Form management |
| Zod | 3.x | Form validation |

### Admin Portal (Web)

| Technology | Version | Purpose |
|---|---|---|
| React | 18.3.1 | UI library |
| Vite | 6.0.3 | Build tool |
| React Router | 6.26.0 | Client-side routing |
| TanStack React Query | 5.62.3 | Server state management |
| Zustand | 5.0.1 | Client state management |
| Axios | 1.7.9 | HTTP client |
| Recharts | 2.15.4 | Charts and data visualization |
| Framer Motion | 12.38.0 | Animations |
| React Hook Form | 7.54.0 | Form management |
| Zod | 3.x | Form validation |
| React Hot Toast | 2.4.1 | Toast notifications |

---

## 4. Role-Based Access Control (RBAC)

The platform has five roles in descending order of access:

| Role | Code | Description |
|---|---|---|
| Developer Admin | `DEV_ADMIN` | Full platform access including billing management, API key management, deletion |
| Super Administrator | `SUPER_ADMIN` | All stores — staff management, offers, catalog, analytics, customer management |
| Store Manager | `STORE_MANAGER` | Assigned store(s) — transactions, scheduling, offers, order lists, employee requests |
| Employee / Cashier | `EMPLOYEE` | Assigned store — transaction processing, item requests, scheduling, chat |
| Customer | `CUSTOMER` | Personal account — loyalty program, redemptions, catalog |

### Role Helper Functions (authStore.ts)

```typescript
isEmployee = (role) => ['EMPLOYEE', 'STORE_MANAGER', 'SUPER_ADMIN', 'DEV_ADMIN'].includes(role)
isAdmin    = (role) => ['SUPER_ADMIN', 'DEV_ADMIN'].includes(role)
isDevAdmin = (role) => role === 'DEV_ADMIN'
```

### Backend RBAC Enforcement

The backend uses middleware functions composed in route definitions:

- `authenticate`: Verifies JWT, attaches `req.user`.
- `requireRole(...roles)`: Checks `req.user.role` against allowed roles.
- `requireStoreAccess(storeId)`: Verifies the user has access to the target store (via `UserStoreRole` or `allStoresAccess` flag).

Example:
```typescript
router.get('/points/store/:storeId', authenticate, requireStoreAccess, getStoreTransactions)
router.post('/auth/super-admin', authenticate, requireRole('DEV_ADMIN'), createSuperAdmin)
```

### allStoresAccess Flag

The `User.allStoresAccess` boolean allows `SUPER_ADMIN` and `DEV_ADMIN` users to bypass per-store access checks. This is set to `true` for all admin-level accounts.

---

## 5. Authentication and Security

### 5.1 Authentication Flow

**Customer Registration:**
1. Client calls `POST /auth/register` with `{ phone, pin, name, firebaseToken }`.
2. Server verifies the Firebase ID token (which contains the verified phone number).
3. Server hashes the PIN with bcrypt.
4. Server creates a `User` record with `role: CUSTOMER`.
5. Server generates a JWT signed with `JWT_SECRET`.
6. JWT is returned to the client and stored in `expo-secure-store`.

**Login:**
1. Client calls `POST /auth/login` with `{ phone, pin, pushToken?, platform? }`.
2. Server looks up the user by phone number.
3. Server verifies the PIN using bcrypt compare.
4. Server generates a JWT.
5. JWT is returned and stored in `expo-secure-store`.

**Subsequent requests:**
All authenticated requests include the JWT in the `Authorization: Bearer <token>` header. The `authenticate` middleware:
1. Extracts the JWT from the header.
2. Verifies the signature using `JWT_SECRET`.
3. Looks up the user by `sub` (user ID) in the database.
4. Attaches the full user record to `req.user`.

### 5.2 PIN Security

- PINs are 4 digits.
- PINs are hashed using `bcrypt` with 10 salt rounds.
- PIN history is tracked in `User.pinHistory` (array of previous hashes) to prevent reuse.
- Failed login attempts are counted in `User.failedLoginAttempts`.
- After a configurable number of failures, `User.lockedUntil` is set to a future timestamp.

### 5.3 JWT Configuration

```
JWT_SECRET    = [32+ character random secret]
JWT_EXPIRES_IN = '7d' (configurable)
```

JWTs are stored client-side in `expo-secure-store` (mobile) — a device-level encrypted key-value store. They are never stored in `AsyncStorage` or `localStorage`.

### 5.4 PIN Reset Flow

1. Customer provides phone number.
2. Firebase sends an OTP to the phone.
3. Customer verifies OTP — Firebase returns an ID token.
4. Client calls `POST /auth/verify-firebase-reset` with the Firebase token.
5. Server verifies the token, extracts the phone, generates a short-lived `resetToken` (stored in `OtpCode` table).
6. Client calls `POST /auth/reset-pin` with `{ resetToken, newPin }`.
7. Server validates the token, hashes the new PIN, updates the user.

### 5.5 API Key Authentication (POS Integration)

Store API keys are used by POS printer agents to generate receipt QR tokens. API keys are:
- Generated as random 32-character hex strings.
- Hashed using bcrypt before storage (only the hash is in the database).
- Sent in requests as `X-API-Key: <key>` header.
- Validated using bcrypt compare against the stored hash.

---

## 6. Database Schema

### Core Domain Models

#### User
Primary model for all platform users (customers, employees, managers, admins).

```prisma
model User {
  id                  String    @id @default(uuid())
  phone               String    @unique
  name                String?
  role                Role
  isActive            Boolean   @default(true)
  pinHash             String
  pinHistory          String[]
  isProfileComplete   Boolean   @default(false)
  tier                Tier      @default(BRONZE)
  periodPoints        Float     @default(0)
  tierPeriod          String?
  email               String?   @unique
  pointsBalance       Float     @default(0)
  avatarUrl           String?
  allStoresAccess     Boolean   @default(false)
  failedLoginAttempts Int       @default(0)
  lockedUntil         DateTime?
  qrCode              String    @unique
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  // ... relations
}
```

**Key points:**
- `qrCode` is auto-generated as a unique identifier at registration.
- `pointsBalance` is the redeemable credits balance (in dollar-equivalent units).
- `periodPoints` is the tier qualification counter, reset each tier period.
- `allStoresAccess` bypasses per-store RBAC for admin users.

#### Store
```prisma
model Store {
  id                  String   @id @default(uuid())
  name                String
  address             String
  city                String
  state               String
  zipCode             String
  phone               String
  isActive            Boolean  @default(true)
  billingType         BillingType @default(MONTHLY_SUBSCRIPTION)
  subscriptionPrice   Float    @default(0)
  transactionFeeRate  Float    @default(0.02)
  shiftsPerDay        Int      @default(3)
  latitude            Float?
  longitude           Float?
  gasPricePerGallon   Float?
  dieselPricePerGallon Float?
  gasPriceUpdatedAt   DateTime?
  enabledCategories   ProductCategory[]
  apiKey              String?  @unique
  // ... relations
}
```

#### PointsTransaction
```prisma
model PointsTransaction {
  id               String            @id @default(uuid())
  customerId       String
  grantedById      String
  storeId          String
  purchaseAmount   Float
  pointsAwarded    Float
  devCut           Float
  storeCost        Float
  cashbackRate     Float
  category         ProductCategory   @default(OTHER)
  status           TransactionStatus @default(APPROVED)
  receiptImageUrl  String?
  receiptImageHash String?           @unique
  notes            String?
  isGas            Boolean           @default(false)
  gasGallons       Float?
  gasPricePerGallon Float?
  gasBonusPoints   Float?
  fraudFlags       String[]
  isTestData       Boolean           @default(false)
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
}
```

**Key points:**
- `receiptImageHash` is unique — prevents the same receipt from being used twice across all transactions.
- `devCut` and `storeCost` are pre-calculated at transaction creation time.
- `fraudFlags` stores reasons if the transaction was auto-flagged.

#### CatalogRedemption
```prisma
model CatalogRedemption {
  id              String   @id @default(uuid())
  customerId      String
  catalogItemId   String
  pointsSpent     Float
  status          String   @default("PENDING")
  redemptionCode  String   @unique
  expiresAt       DateTime
  storeId         String?
  processedById   String?
  createdAt       DateTime @default(now())
}
```

#### UserNotification
```prisma
model UserNotification {
  id        String    @id @default(uuid())
  userId    String
  title     String
  body      String
  type      String
  isRead    Boolean   @default(false)
  expiresAt DateTime?
  createdAt DateTime  @default(now())
  @@index([userId, isRead])
}
```

**Key point:** `expiresAt` is used for offer notifications — set to the offer's end date so stale notifications automatically disappear from the user's inbox.

#### OrderList / OrderListItem
```prisma
model OrderList {
  id         String          @id @default(uuid())
  storeId    String
  name       String
  status     OrderListStatus @default(OPEN)
  openedById String
  closedById String?
  openedAt   DateTime        @default(now())
  closedAt   DateTime?
  notes      String?
}

model OrderListItem {
  id          String              @id @default(uuid())
  listId      String
  name        String
  quantity    String?
  category    String?
  notes       String?
  priority    OrderItemPriority   @default(NORMAL)
  sortOrder   Int                 @default(0)
  status      OrderListItemStatus @default(PENDING)
  source      OrderItemSource     @default(MANAGER)
  requestLineId String?           @unique
  addedById   String
  orderedAt   DateTime?
  receivedAt  DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
}
```

### Full Enum Reference

```typescript
enum Role       { DEV_ADMIN | SUPER_ADMIN | STORE_MANAGER | EMPLOYEE | CUSTOMER }
enum Tier        { BRONZE | SILVER | GOLD | DIAMOND | PLATINUM }
enum TransactionStatus { PENDING | FLAGGED | APPROVED | REJECTED }
enum ProductCategory { GROCERIES | FROZEN_FOODS | FRESH_FOODS | GAS | DIESEL | HOT_FOODS | OTHER }
enum OfferType  { ALL_STORES | SPECIFIC_STORE }
enum BillingType { MONTHLY_SUBSCRIPTION | PER_TRANSACTION | HYBRID | CUSTOM }
enum OrderListStatus    { OPEN | CLOSED }
enum OrderListItemStatus { PENDING | ORDERED | RECEIVED | REMOVED }
enum OrderItemPriority  { URGENT | NORMAL | LOW }
enum OrderItemSource    { MANAGER | EMPLOYEE_REQUEST }
enum EmployeeRequestStatus { PENDING | REVIEWED }
enum RequestLineStatus  { PENDING | ACCEPTED | REJECTED }
enum RejectionReason   { NO_SUPPLIER | OUT_OF_BUDGET | IN_STOCK | DUPLICATE | OTHER }
enum ShiftType { OPENING | MIDDLE | CLOSING }
enum ShiftRequestType { TIME_OFF | FILL_IN }
enum RequestStatus { PENDING | APPROVED | DENIED }
enum StoreRequestType { LOW_STOCK | STORE_SUPPLIES | CUSTOMER_REQUESTED_PRODUCT | WORK_ORDER }
enum StoreRequestPriority { LOW | MEDIUM | HIGH }
enum StoreRequestStatus { PENDING | ACKNOWLEDGED }
enum ApplicationStatus { NEW | REVIEWED | INTERVIEW | HIRED | REJECTED }
enum ProductRequestStatus { PENDING | ACCEPTED | DECLINED }
enum CategoryStatus { PENDING | APPROVED | REJECTED }
enum EmployeeRequestType { LOW_STOCK | CUSTOMER_REQUEST }
enum DayOfWeek { MON | TUE | WED | THU | FRI | SAT | SUN }
enum PromoStatus { PENDING | APPROVED | REJECTED }
```

---

## 7. Points and Cashback Calculation

### 7.1 Transaction Processing Logic

When `POST /points/grant` is called:

```typescript
// 1. Determine effective cashback rate
let cashbackRate = BASE_RATE (from TierCashbackRate for customer's tier)

// 2. Add category bonus (if applicable)
const categoryRate = await prisma.categoryRate.findUnique({ where: { category } })
cashbackRate += categoryRate?.cashbackRate ?? 0

// 3. Add any active offer bonus rates
const activeOffers = await getActiveOffersForStore(storeId, category)
for (const offer of activeOffers) {
  if (offer.tierBonusRates?.[customer.tier]) {
    cashbackRate += offer.tierBonusRates[customer.tier]
  } else if (offer.bonusRate) {
    cashbackRate += offer.bonusRate
  }
}

// 4. Calculate points
const pointsAwarded = purchaseAmount * cashbackRate

// 5. Calculate costs
const devCut = purchaseAmount * DEV_CUT_RATE
const storeCost = pointsAwarded + devCut

// 6. Create transaction
await prisma.pointsTransaction.create({ data: { ..., pointsAwarded, devCut, storeCost, cashbackRate } })

// 7. Credit customer balance
await prisma.user.update({ where: { id: customer.id }, data: { pointsBalance: { increment: pointsAwarded } } })

// 8. Update period points for tier calculation
await prisma.user.update({ where: { id: customer.id }, data: { periodPoints: { increment: pointsAwarded } } })
```

### 7.2 Gas Transaction Mode

For gas/diesel purchases, if the customer's tier has a `gasCentsPerGallon` rate set:

```typescript
if (isGas && tierRate.gasCentsPerGallon > 0) {
  const gasBonusPoints = gasGallons * (tierRate.gasCentsPerGallon / 100)
  // gasBonusPoints is added ON TOP of or INSTEAD OF the percentage-based points
  // depending on store configuration
}
```

### 7.3 Credit Redemption

When `POST /points/redeem` is called:
```typescript
// Deduct from customer balance
await prisma.user.update({ data: { pointsBalance: { decrement: amount } } })
// Record redemption
await prisma.creditRedemption.create({ data: { customerId, storeId, amount, devCut, processedBy } })
```

---

## 8. Tier System Logic

### 8.1 Tier Thresholds

Stored in the `TierCashbackRate` table. Each tier record has:
- `tier`: The tier enum value.
- `cashbackRate`: The cashback percentage for this tier.
- `gasCentsPerGallon`: Per-gallon gas bonus for this tier (0 = use percentage mode).
- `pointsThreshold`: The minimum period points required to reach this tier.

### 8.2 Tier Upgrade Logic

After each transaction, the backend checks if the customer's `periodPoints` has crossed the next tier threshold:

```typescript
const tierRates = await prisma.tierCashbackRate.findMany({ orderBy: { pointsThreshold: 'asc' } })
const newTier = tierRates.filter(t => t.pointsThreshold <= customer.periodPoints).pop()?.tier ?? 'BRONZE'
if (newTier !== customer.tier) {
  await prisma.user.update({ where: { id: customer.id }, data: { tier: newTier } })
  // Send tier upgrade push notification
}
```

### 8.3 Tier Period Reset

A cron job (or manual trigger by DevAdmin) resets `periodPoints` for all users at the end of the tier period. The `tier` field is preserved — users start the new period at their current tier.

---

## 9. API Reference

All endpoints are prefixed with `/api`. Base URL: `https://api.luckystop.cliffindus.com/api`

Authentication: `Authorization: Bearer <jwt_token>` on all authenticated routes.

### Authentication

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | /auth/register | Public | — | Register customer with Firebase OTP |
| POST | /auth/login | Public | — | Login with phone + PIN |
| GET | /auth/me | JWT | Any | Get current user profile |
| PATCH | /auth/profile | JWT | Any | Update display name |
| POST | /auth/profile/avatar | JWT | Any | Upload profile picture (multipart) |
| PATCH | /auth/pin | JWT | Any | Change PIN |
| PATCH | /auth/email | JWT | Any | Save recovery email |
| POST | /auth/push-token | JWT | Any | Register push notification token |
| POST | /auth/verify-firebase-reset | JWT | Any | Verify Firebase OTP for PIN reset |
| POST | /auth/reset-pin | JWT | Any | Reset PIN with reset token |
| POST | /auth/super-admin | JWT | DEV_ADMIN | Create Super Admin account |
| POST | /auth/staff | JWT | SUPER_ADMIN | Create employee/manager account |
| GET | /staff | JWT | SUPER_ADMIN | List all staff |
| GET | /users/customers | JWT | SUPER_ADMIN | List all customers |
| PATCH | /users/:userId/toggle-active | JWT | SUPER_ADMIN | Deactivate / reactivate user |
| PATCH | /users/:userId/reset-pin | JWT | SUPER_ADMIN | Reset a user's PIN |
| POST | /users/:userId/stores | JWT | SUPER_ADMIN | Add store to user |
| DELETE | /users/:userId/stores/:storeId | JWT | SUPER_ADMIN | Remove store from user |
| DELETE | /users/:userId | JWT | DEV_ADMIN | Permanently delete user |

### Points and Transactions

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | /points/grant | JWT | EMPLOYEE+ | Initiate points grant |
| POST | /points/grant/:txId/receipt | JWT | EMPLOYEE+ | Upload receipt and approve transaction |
| POST | /points/redeem | JWT | EMPLOYEE+ | Redeem customer credits in-store |
| GET | /points/customer-info/:qrCode | JWT | EMPLOYEE+ | Look up customer by QR code |
| POST | /points/tier-benefit | JWT | EMPLOYEE+ | Claim tier benefit for customer |
| POST | /points/catalog-redeem | JWT | EMPLOYEE+ | Process catalog redemption in-store |
| GET | /points/my-history | JWT | CUSTOMER | Customer's own transaction history |
| GET | /points/my-benefit-status | JWT | CUSTOMER | Customer tier benefit status |
| GET | /points/store/:storeId | JWT | STORE_MANAGER+ | Store transaction list |
| GET | /points/store/:storeId/summary | JWT | STORE_MANAGER+ | Store transaction summary |
| PATCH | /points/:txId/reject | JWT | STORE_MANAGER+ | Reject a transaction |
| GET | /points/platform-summary | JWT | SUPER_ADMIN | Platform-wide transaction summary |
| GET | /points/all | JWT | SUPER_ADMIN | All transactions |
| POST | /points/receipt-token | API-KEY | Store API | Generate receipt QR token (POS) |
| GET | /points/receipt-token/:tokenId | JWT | CUSTOMER | Preview receipt QR token |
| POST | /points/self-grant | JWT | CUSTOMER | Self-grant from receipt QR |

**Request body for `POST /points/grant`:**
```json
{
  "customerQrCode": "string",
  "storeId": "uuid",
  "purchaseAmount": 34.57,
  "category": "GROCERIES",
  "notes": "optional",
  "isGas": false,
  "gasGallons": null,
  "gasPricePerGallon": null
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transaction": { "id": "...", "pointsAwarded": 172.85, "cashbackRate": 0.05, ... },
    "customer": { "name": "Jane Doe", "tier": "BRONZE", "newBalance": 1450.32 }
  }
}
```

### Stores

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /stores | JWT | SUPER_ADMIN | All stores |
| GET | /stores/accessible | JWT | STORE_MANAGER+ | Accessible stores for user |
| GET | /stores/:storeId | JWT | STORE_MANAGER+ | Store detail |
| PATCH | /stores/:storeId | JWT | SUPER_ADMIN | Update store |
| GET | /stores/gas-prices | JWT | Any | All stores gas prices |
| PATCH | /stores/:storeId/gas-prices | JWT | STORE_MANAGER+ | Update gas prices |

### Offers and Banners

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /offers | JWT | Any | Active offers (optionally filtered by storeId) |
| GET | /offers/history | JWT | STORE_MANAGER+ | Expired/inactive offers |
| POST | /offers | JWT | STORE_MANAGER+ | Create offer (multipart) |
| PATCH | /offers/:offerId | JWT | STORE_MANAGER+ | Update offer |
| DELETE | /offers/:offerId | JWT | STORE_MANAGER+ | Deactivate offer |
| GET | /banners | JWT | Any | Active banners |
| POST | /banners | JWT | STORE_MANAGER+ | Create banner (multipart) |
| DELETE | /banners/:bannerId | JWT | STORE_MANAGER+ | Deactivate banner |

**Query params for `GET /offers`:**
- `storeId`: If provided, returns ALL_STORES offers + that store's specific offers. If omitted, returns all (admin use).

### Catalog (Redemption Catalog)

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /catalog | JWT | Any | Active catalog items |
| GET | /catalog/all | JWT | SUPER_ADMIN | All items including inactive |
| POST | /catalog | JWT | SUPER_ADMIN | Create catalog item |
| PATCH | /catalog/:id | JWT | SUPER_ADMIN | Update catalog item |
| DELETE | /catalog/:id | JWT | SUPER_ADMIN | Delete catalog item |
| POST | /catalog/redeem | JWT | CUSTOMER | Initiate redemption |
| GET | /catalog/my-redemptions | JWT | CUSTOMER | My redemption history |
| DELETE | /catalog/redeem/:id | JWT | CUSTOMER | Cancel pending redemption |
| GET | /catalog/pending/:qrCode | JWT | EMPLOYEE+ | Get pending redemptions for customer |
| POST | /catalog/redeem/:id/confirm | JWT | EMPLOYEE+ | Confirm redemption in-store |

### Notifications

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /notifications/my | JWT | Any | My notifications (paginated, expiry-filtered) |
| GET | /notifications/unread-count | JWT | Any | Unread notification count |
| PATCH | /notifications/mark-all-read | JWT | Any | Mark all as read |
| PATCH | /notifications/:id/read | JWT | Any | Mark one as read |
| POST | /notifications/broadcast | JWT | SUPER_ADMIN | Broadcast to customers/staff |

### Scheduling

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /schedule/my | JWT | EMPLOYEE | My schedule |
| GET | /schedule/vacancies | JWT | Any | Available shifts |
| POST | /schedule/requests | JWT | EMPLOYEE | Submit shift request |
| GET | /schedule/store/:storeId | JWT | STORE_MANAGER+ | Store schedule |
| GET | /schedule/store/:storeId/today | JWT | STORE_MANAGER+ | Today's roster |
| GET | /schedule/store/:storeId/day | JWT | EMPLOYEE | Day roster |
| GET | /schedule/store/:storeId/requests | JWT | STORE_MANAGER+ | Shift requests |
| GET | /schedule/store/:storeId/employees | JWT | STORE_MANAGER+ | Store employees |
| POST | /schedule/shifts | JWT | STORE_MANAGER | Assign shift |
| DELETE | /schedule/shifts/:shiftId | JWT | STORE_MANAGER | Remove shift |
| PATCH | /schedule/requests/:requestId | JWT | STORE_MANAGER | Approve/deny shift request |

### Order Lists

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /order-lists/suggestions | JWT | STORE_MANAGER | Item name autocomplete |
| GET | /order-lists/store/:storeId/active | JWT | STORE_MANAGER+ | Active list |
| GET | /order-lists/store/:storeId/history | JWT | STORE_MANAGER+ | Closed lists (paginated) |
| GET | /order-lists/:listId | JWT | STORE_MANAGER | List detail |
| POST | /order-lists/store/:storeId | JWT | STORE_MANAGER+ | Open new list |
| PATCH | /order-lists/:listId/close | JWT | STORE_MANAGER | Close list |
| POST | /order-lists/:listId/items | JWT | STORE_MANAGER | Add item |
| PATCH | /order-lists/items/:itemId | JWT | STORE_MANAGER | Update item |
| PATCH | /order-lists/items/:itemId/status | JWT | STORE_MANAGER | Update item status |
| DELETE | /order-lists/items/:itemId | JWT | STORE_MANAGER | Remove item |
| PATCH | /order-lists/:listId/reorder | JWT | STORE_MANAGER | Reorder items |
| POST | /order-lists/:listId/print | JWT | STORE_MANAGER | Print snapshot |
| GET | /order-lists/store/:storeId/print-history/:listId | JWT | STORE_MANAGER+ | Print job history |
| POST | /order-lists/store/:storeId/restore-items | JWT | STORE_MANAGER+ | Restore items from closed list |
| GET | /order-lists/admin/all | JWT | SUPER_ADMIN | All lists across stores |

### Employee Item Requests

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /employee-requests/suggestions | JWT | EMPLOYEE | Item autocomplete |
| POST | /employee-requests | JWT | EMPLOYEE | Submit item request |
| GET | /employee-requests/mine | JWT | EMPLOYEE | My requests |
| GET | /employee-requests/pending-count | JWT | STORE_MANAGER | Pending count |
| GET | /employee-requests/store/:storeId | JWT | STORE_MANAGER+ | Store requests |
| GET | /employee-requests/store/:storeId/rejected | JWT | STORE_MANAGER+ | Rejected lines log |
| PATCH | /employee-requests/:requestId/review | JWT | STORE_MANAGER | Review request lines |

### Billing (DevAdmin only)

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /billing/stores | JWT | DEV_ADMIN | All stores billing |
| GET | /billing/revenue | JWT | DEV_ADMIN | Dev revenue summary |
| GET | /billing/analytics | JWT | DEV_ADMIN | Billing analytics |
| PATCH | /billing/stores/:storeId | JWT | DEV_ADMIN | Update store billing config |
| POST | /billing/generate-monthly | JWT | DEV_ADMIN | Generate monthly bills |
| GET | /billing/tier-rates | JWT | EMPLOYEE+ | Tier cashback rates |
| PUT | /billing/tier-rates/:tier | JWT | SUPER_ADMIN | Update tier rate |
| GET | /billing/category-rates | JWT | EMPLOYEE+ | Category cashback rates |
| PATCH | /billing/category-rates/:category | JWT | DEV_ADMIN | Update category rate |
| GET | /billing/stores/:storeId/api-key | JWT | DEV_ADMIN | Get store API key |
| POST | /billing/stores/:storeId/api-key/regenerate | JWT | DEV_ADMIN | Regenerate API key |
| GET | /my-invoices | JWT | SUPER_ADMIN | SuperAdmin's invoices |

### Standard Response Format

**Success:**
```json
{ "success": true, "data": { ... } }
```

**Error:**
```json
{ "success": false, "error": "Human-readable error message" }
```

**Validation error (Zod):**
```json
{
  "success": false,
  "error": {
    "fieldErrors": { "purchaseAmount": ["Expected number, received string"] },
    "formErrors": []
  }
}
```

---

## 10. Push Notification System

### 10.1 Token Registration

When a user logs in, the mobile app sends their Expo push notification token to `POST /auth/push-token` with the platform (ios/android). Tokens are stored in the `PushToken` table (one user can have multiple tokens for multiple devices).

### 10.2 Sending Push Notifications

All push notification sending goes through `backend/src/utils/push.ts`:

```typescript
// Send to a single user
saveNotification(userId, title, body, type, expiresAt?)

// Save to multiple users' notification inbox
saveNotificationMany(userIds[], title, body, type, expiresAt?)

// Broadcast to all customers
broadcastToCustomers(title, body, type, expiresAt?)

// Send to all staff at a store
sendPushToStoreStaff(storeId, title, body, type)
```

### 10.3 Expo Push API

Notifications are sent to `https://exp.host/--/api/v2/push/send` in batches of 100 tokens:

```json
[
  { "to": "ExponentPushToken[xxx]", "title": "...", "body": "...", "sound": "default" }
]
```

### 10.4 Notification Expiry

The `UserNotification.expiresAt` field is used to auto-hide notifications:
- Set on offer broadcast notifications to the offer's `endDate`.
- All notification queries filter: `OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]`.

---

## 11. Image Storage and Upload

All image uploads go through Cloudinary. The backend uses `multer` with `memoryStorage()` to receive the file in memory, then uploads to Cloudinary using the Node SDK.

### Upload Folders

| Folder | Content |
|---|---|
| `luckystop/avatars` | User profile photos |
| `luckystop/offers` | Offer images |
| `luckystop/banners` | Banner images |
| `luckystop/receipts` | Transaction receipt photos |
| `luckystop/business-promos` | Business promotion images |

### Avatar Upload (Special Transformation)

```typescript
cloudinary.uploader.upload(dataUri, {
  folder: 'lucky-stop/avatars',
  public_id: `avatar_${userId}`,  // overwrites on re-upload
  overwrite: true,
  transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
})
```

### Receipt Upload

Receipt images are uploaded after transaction initiation. After upload:
1. The `receiptImageUrl` is stored on the transaction.
2. The image buffer is hashed (MD5 or SHA256) → stored as `receiptImageHash` (unique constraint prevents duplicate receipts).

---

## 12. Mobile App Architecture

### 12.1 File Structure

```
mobile/
├── app/
│   ├── _layout.tsx           # Root layout, loads auth state
│   ├── index.tsx             # Auth gate — routes to appropriate area
│   ├── role-tour.tsx         # First-time role tutorial
│   ├── (auth)/
│   │   ├── welcome.tsx       # Registration screen
│   │   ├── login.tsx         # Login screen
│   │   └── forgot-pin.tsx    # PIN recovery screen
│   ├── (customer)/
│   │   ├── _layout.tsx       # Customer tab navigator
│   │   ├── home.tsx          # Customer dashboard
│   │   ├── catalog.tsx       # Redemption catalog
│   │   ├── history.tsx       # Transaction history
│   │   ├── notifications.tsx
│   │   ├── profile.tsx       # Uses ProfileScreen component
│   │   ├── scan-receipt.tsx  # QR receipt scanner
│   │   ├── rewards.tsx       # Rewards section
│   │   ├── leaderboard.tsx
│   │   ├── ads.tsx           # Business promotions feed
│   │   ├── careers.tsx       # Job listings
│   │   └── request-product.tsx
│   ├── (employee)/
│   │   ├── _layout.tsx       # Employee drawer navigator
│   │   ├── home.tsx          # Employee dashboard
│   │   ├── scan.tsx          # QR scanner → transaction flow
│   │   ├── order-list.tsx    # View order list (read-only for employees)
│   │   ├── requests.tsx      # Employee item requests
│   │   ├── schedule.tsx
│   │   ├── chat.tsx
│   │   ├── leaderboard.tsx
│   │   ├── notifications.tsx
│   │   └── profile.tsx
│   └── (manager)/
│       ├── _layout.tsx       # Manager drawer navigator
│       ├── home.tsx          # Manager dashboard
│       ├── offers.tsx
│       ├── banners.tsx
│       ├── order-list.tsx    # Full order list management
│       ├── requests.tsx      # Employee + store requests
│       ├── schedule.tsx
│       ├── chat.tsx
│       ├── leaderboard.tsx
│       ├── notifications.tsx
│       └── profile.tsx
├── components/
│   ├── ProfileScreen.tsx     # Shared profile UI for all roles
│   ├── ChatScreen.tsx        # Shared chat UI
│   ├── NotificationsScreen.tsx
│   ├── EmployeeRequestsScreen.tsx
│   ├── ManagerRequestsScreen.tsx
│   ├── WelcomeBonusCard.tsx
│   ├── DrawerShell.tsx       # Side drawer navigation shell
│   ├── ErrorBoundary.tsx     # React class Error Boundary (global crash safety net)
│   ├── Icons.tsx             # SVG icon library
│   ├── EmptyState.tsx
│   ├── SkeletonLoader.tsx
│   ├── AppLoader.tsx
│   └── PageLoader.tsx
├── i18n/
│   ├── index.ts              # i18next init + loadSavedLanguage / setLanguage helpers
│   ├── en.json               # English translation strings
│   └── es.json               # Spanish translation strings
├── store/
│   └── authStore.ts          # Zustand auth state
├── services/
│   └── api.ts                # Axios instance + all API method groups
└── constants/
    └── index.ts              # API_URL, COLORS, CASHBACK_RATE
```

### 12.2 Navigation Structure

- **Unauthenticated:** `(auth)` group — welcome, login, forgot-pin.
- **Customer:** Tab navigator with Home, Catalog, History, Notifications, Profile.
- **Employee:** Drawer navigator with Home as default, Scan, Schedule, Chat, etc.
- **Manager:** Drawer navigator with Home as default, Order List, Requests, Offers, etc.
- **Admin roles:** Manager drawer with extended access.

### 12.3 Auth State

`useAuthStore` (Zustand) holds:
- `user: AuthUser | null`
- `token: string | null`
- `isLoading: boolean`
- `quickLoginPhone: string | null`
- `biometricEnabled: boolean`

On app start, `loadFromStorage()` reads JWT and user data from `expo-secure-store`. If valid, the user is auto-logged in.

### 12.4 Data Fetching Pattern

All API calls use `@tanstack/react-query`:

```typescript
const { data, isLoading, refetch } = useQuery({
  queryKey: ['my-transactions', page],
  queryFn: () => pointsApi.getMyHistory(page),
})

const mutation = useMutation({
  mutationFn: (data) => pointsApi.initiateGrant(data),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-transactions'] }),
})
```

### 12.5 Internationalization (i18n)

The app uses **i18next** with **react-i18next** for English/Spanish support.

**Library:** `i18next`, `react-i18next`
**Persistence:** `@react-native-async-storage/async-storage` (key: `app_language`)

**Initialization** (`mobile/i18n/index.ts`):
- i18next is initialized synchronously with English as the default language so the app renders immediately without a language flash.
- `loadSavedLanguage()` is called on app startup (alongside `loadFromStorage()` in `_layout.tsx`) to apply any previously-saved language preference asynchronously.

**Exported helpers:**
```typescript
loadSavedLanguage(): Promise<void>   // reads AsyncStorage and calls i18n.changeLanguage()
setLanguage(code: LanguageCode): Promise<void>  // writes AsyncStorage + changes language
getLanguage(): string                // returns current i18n.language
LANGUAGES: { code, label, nativeLabel }[]
type LanguageCode = 'en' | 'es'
```

**Usage in components:**
```typescript
import { useTranslation } from 'react-i18next';
const { t } = useTranslation();
// t('nav.home'), t('profile.storeCount', { count: n })
```

Translation keys are defined in `mobile/i18n/en.json` and `mobile/i18n/es.json` across namespaces: `nav`, `navGroup`, `drawer`, `profile`, `promoModal`, `disputeModal`, `deleteModal`, `avatarModal`, `langModal`.

Pluralization uses the i18next `_one` / `_other` suffix convention (e.g., `storeCount_one`, `storeCount_other`).

### 12.6 Error Boundary

`mobile/components/ErrorBoundary.tsx` is a React class component that wraps the entire app tree in `_layout.tsx`. It catches any unhandled JavaScript errors that would otherwise produce a blank/white screen.

**Behavior on error:**
- Renders a fallback screen with a warning icon, "Something went wrong", "Your account and points are safe.", and a "Try Again" button.
- The "Try Again" button resets boundary state (`hasError: false`), allowing the app to re-render without requiring a full restart.
- `componentDidCatch` logs the error to `console.error` — replace with `Sentry.captureException(error)` when crash reporting is added.

**Placement:** `<ErrorBoundary>` wraps `<QueryClientProvider>` in `_layout.tsx`, so it catches errors from any screen across all roles.

---

## 13. Admin Portal Architecture

### 13.1 File Structure

```
admin/src/
├── main.tsx               # Entry point
├── App.tsx                # Router setup
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   ├── Analytics.tsx
│   ├── StoreManagerDashboard.tsx
│   ├── Transactions.tsx
│   ├── Customers.tsx
│   ├── Staff.tsx
│   ├── Stores.tsx
│   ├── Offers.tsx
│   ├── Banners.tsx
│   ├── Catalog.tsx
│   ├── Notifications.tsx
│   ├── Leaderboard.tsx
│   ├── Careers.tsx
│   ├── BusinessPromotions.tsx
│   ├── Rates.tsx
│   ├── Billing.tsx
│   ├── SuperAdminBilling.tsx
│   ├── ActivityLog.tsx
│   ├── Support.tsx
│   ├── Chat.tsx
│   ├── Scheduling.tsx
│   ├── OrderList.tsx
│   ├── StoreRequests.tsx
│   ├── InventoryAnalytics.tsx
│   ├── Profile.tsx
│   └── Privacy.tsx
└── components/
    ├── Navbar.tsx
    └── PageLoader.tsx
```

### 13.2 Role-Gated Pages

The Navbar component uses the user's role to determine which navigation items are visible. Routes are also protected client-side by checking `user.role` before rendering admin-only content.

---

## 14. POS Integration — Receipt QR Tokens

For stores with QR-capable receipt printers, the platform supports automated receipt QR tokens:

### Flow

1. POS system completes a sale.
2. Printer agent calls `POST /points/receipt-token` with `X-API-Key` header and:
   ```json
   { "txRef": "POS-RECEIPT-123", "total": 45.99, "items": [...] }
   ```
3. Backend generates a `ReceiptToken` with a unique token ID and expiry.
4. Printer agent prints a QR code containing the token URL.
5. Customer scans the QR in the Lucky Stop app → opens `scan-receipt.tsx`.
6. App calls `GET /points/receipt-token/:tokenId` to preview the amount.
7. Customer taps **Claim Points** → `POST /points/self-grant` → points credited.

Each `txRef` per store is unique — prevents double-scanning the same receipt.

---

## 15. Environment Variables

### Backend (`backend/.env`)

```env
# Database
DATABASE_URL="postgresql://..."

# Auth
JWT_SECRET="[32+ char random secret]"
JWT_EXPIRES_IN="7d"

# Firebase Admin
FIREBASE_PROJECT_ID=""
FIREBASE_PRIVATE_KEY=""
FIREBASE_CLIENT_EMAIL=""

# Cloudinary
CLOUDINARY_CLOUD_NAME=""
CLOUDINARY_API_KEY=""
CLOUDINARY_API_SECRET=""

# Email
RESEND_API_KEY=""

# App
PORT=3000
NODE_ENV=production
```

### Admin Portal (`admin/.env`)

```env
VITE_API_URL=https://api.luckystop.cliffindus.com/api
```

### Mobile App (`mobile/.env` or `mobile/constants/index.ts`)

```typescript
export const API_URL = 'https://api.luckystop.cliffindus.com/api'
```

---

## 16. Deployment Infrastructure

| Service | Platform | URL |
|---|---|---|
| Backend API | Render | api.luckystop.cliffindus.com |
| Admin Portal | Vercel | admin.luckystop.cliffindus.com |
| Mobile App | Expo EAS | App Store + Google Play |
| Database | Neon (PostgreSQL) | Internal connection string |
| Image Storage | Cloudinary | CDN delivery |

### Backend Deployment (Render)

- Runtime: Node.js 20.x
- Build command: `npm install && npx prisma generate && npm run build`
- Start command: `node dist/index.js`
- Auto-deploy on push to `main` branch.
- Environment variables configured in Render dashboard.

### Admin Portal Deployment (Vercel)

- Framework preset: Vite
- Build command: `npm run build`
- Output directory: `dist`
- Auto-deploy on push to `main`.
- Environment variables configured in Vercel dashboard.

### Mobile App Deployment (Expo EAS)

```bash
# Development build
eas build --profile development --platform all

# Production build
eas build --profile production --platform all

# Submit to stores
eas submit --platform ios
eas submit --platform android
```

---

## 17. Billing System

### 17.1 Billing Models

Each store can be configured with one of four billing types:

| Type | Description |
|---|---|
| `MONTHLY_SUBSCRIPTION` | Fixed monthly fee regardless of transaction volume |
| `PER_TRANSACTION` | Fee charged per qualifying transaction |
| `HYBRID` | Monthly subscription + per-transaction fee |
| `CUSTOM` | Custom arrangement |

### 17.2 Transaction Fees

At transaction creation, the backend calculates:

```typescript
const devCutRate = await getDevCutRate() // from AppConfig table, default 0.02
const devCut = purchaseAmount * devCutRate
const storeCost = pointsAwarded + devCut
```

Both `devCut` and `storeCost` are stored on every transaction for audit and billing reconciliation.

### 17.3 Monthly Bill Generation

DevAdmin triggers `POST /billing/generate-monthly` to create `BillingRecord` entries for all stores for the current period. Records include transaction volumes and subscription fees.

### 17.4 Revenue Analytics

`GET /billing/revenue` returns aggregate revenue metrics for the developer:
- Total dev cut this month/quarter/year.
- Per-store revenue breakdown.
- Transaction volume trends.

---

## 18. Fraud Prevention System

### 18.1 Receipt Hash Deduplication

Every receipt image uploaded is hashed (MD5 of the image buffer). The hash is stored as `PointsTransaction.receiptImageHash` with a `@unique` constraint. Attempting to upload a previously uploaded receipt returns a constraint violation error, preventing duplicate credit.

### 18.2 Auto-Flagging

Transactions are automatically flagged (`status: FLAGGED`) when certain conditions are detected (e.g., unusually high purchase amount relative to the store's history). Flagged transactions are visible to managers and require review before points are finalized.

### 18.3 Role-Level Self-Grant Prevention

The backend verifies that `grantedById !== customerId` on every `POST /points/grant` request. If they match, the request is rejected with a 403 error.

### 18.4 Audit Log

Every significant action is logged to `AuditLog` with full actor, action, entity, and detail information. This provides a complete non-repudiable audit trail.

### 18.5 Account Lockout

After a configurable number of failed PIN attempts:
```typescript
if (user.failedLoginAttempts >= MAX_ATTEMPTS) {
  await prisma.user.update({ data: { lockedUntil: addMinutes(now, LOCKOUT_MINUTES) } })
}
```

---

## 19. Audit Logging System

Every controller that modifies data calls `audit()` from `backend/src/utils/audit.ts`:

```typescript
audit({
  actorId: req.user!.id,
  actorName: req.user!.name,
  actorRole: req.user!.role,
  action: 'CREATE_OFFER',
  entity: 'offer',
  entityId: offer.id,
  details: { title: offer.title, type: offer.type },
  storeId: offer.storeId,
})
```

This creates an `AuditLog` record. The audit log is append-only — records are never deleted or modified. Super Admins can search and filter the audit log via the Admin Portal.

### Audited Actions (Examples)

`CREATE_OFFER`, `UPDATE_OFFER`, `DELETE_OFFER`, `CREATE_BANNER`, `DELETE_BANNER`, `GRANT_POINTS`, `REJECT_TRANSACTION`, `REDEEM_CREDITS`, `PROCESS_CATALOG_REDEMPTION`, `CLOSE_ORDER_LIST`, `REVIEW_EMPLOYEE_REQUEST`, `APPROVE_SHIFT_REQUEST`, `CREATE_STAFF_ACCOUNT`, `DEACTIVATE_USER`, `RESET_PIN`, `UPDATE_TIER_RATE`, `UPDATE_CATEGORY_RATE`, `BROADCAST_NOTIFICATION`

---

## 20. Third-Party Integrations

### Firebase (Google)

- **Firebase Auth:** Phone number OTP verification for all users. The mobile app uses `@react-native-firebase/auth` to initiate OTP flows. The backend verifies Firebase ID tokens using the Admin SDK.
- **Firebase Cloud Messaging (FCM):** Used by Expo's push notification infrastructure for Android devices. iOS uses APNs. The backend sends to Expo's push API, which handles FCM/APNs routing.

### Cloudinary

Used for all user-generated image storage:
- Upload via Node SDK `upload_stream` (buffer uploads) or `upload` (base64 data URIs for avatars).
- Images are served via Cloudinary's CDN with transformation support.
- Cloudinary folder structure: `luckystop/[type]/[filename]`.

### Resend

Used for transactional email (PIN recovery notifications, billing reports). Configured with `RESEND_API_KEY`. The `from` address must be verified in the Resend dashboard.

### Expo EAS

Handles managed workflow builds for iOS and Android. OTA updates can be pushed without App Store review for JavaScript-only changes using Expo Updates.

---

## 21. Error Handling Conventions

### Backend

All controllers are wrapped in try/catch (or use Express error middleware):

```typescript
try {
  // ... logic
} catch (error) {
  console.error('Controller error:', error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}
```

Validation errors from Zod return 400 with the field errors object.
Auth errors return 401.
Permission errors return 403.
Not found returns 404.

### Mobile App

API calls use try/catch around mutation functions. Errors surface via `react-native-toast-message`:

```typescript
Toast.show({ type: 'error', text1: err.response?.data?.error || 'An error occurred' })
```

The Axios interceptor auto-handles 401 (expired token) by clearing the JWT from SecureStore.

---

## 22. Development Setup

### Prerequisites

- Node.js 20.x
- npm 10.x
- PostgreSQL (or Neon account)
- Firebase project with Phone Auth enabled
- Cloudinary account
- Expo CLI: `npm install -g expo-cli`
- EAS CLI: `npm install -g eas-cli`

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Fill in .env values

npx prisma generate
npx prisma db push      # Apply schema without migrations
# OR
npx prisma migrate dev  # With migration history

npm run dev             # ts-node with nodemon
```

### Admin Portal Setup

```bash
cd admin
npm install
cp .env.example .env
# Set VITE_API_URL

npm run dev             # Vite dev server on localhost:5173
```

### Mobile App Setup

```bash
cd mobile
npm install

# Start Expo development server
npx expo start

# For a physical device with development build:
eas build --profile development --platform android  # or ios
```

---

## 23. Database Migrations

The project uses Prisma ORM with PostgreSQL.

### Development Workflow

```bash
# Make changes to schema.prisma
# Apply to DB without migration files (recommended for dev):
npx prisma db push

# Apply with migration files (for production):
npx prisma migrate dev --name "description-of-change"
```

### Production Deployment

```bash
# On Render, run as build step or via deploy hook:
npx prisma migrate deploy
```

### Key Schema Rules

- All IDs use `@default(uuid())`.
- All models have `createdAt DateTime @default(now())`.
- Mutable models have `updatedAt DateTime @updatedAt`.
- Soft deletes are used where possible (e.g., `isActive: false` instead of deletion).
- Unique constraints on `receiptImageHash` prevent duplicate receipts.
- Indexes are defined on frequently queried fields (`userId, isRead` on notifications).

---

*This documentation covers the Lucky Stop platform as of version 1.0 (May 30, 2026). For the most current technical details, refer to the source code and inline comments.*

*Maintained by Cliff Industries. Contact: sksajidali1279@gmail.com*
