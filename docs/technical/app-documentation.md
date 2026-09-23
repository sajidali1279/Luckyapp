# Lucky Stop Loyalty Platform - Technical Documentation

**Version:** 1.5
**Last Updated:** August 23, 2026
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
14. [POS Integration - Receipt QR Tokens](#14-pos-integration--receipt-qr-tokens)
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
| ts-node | - | TypeScript execution |

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
| Expo Secure Store | - | Encrypted JWT storage |
| Expo Image Picker | - | Camera / photo library access |
| Expo Local Authentication | - | Biometric (Face ID / Touch ID) |
| Expo Notifications | - | Push notification handling |
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
| Super Administrator | `SUPER_ADMIN` | All stores - staff management, offers, catalog, analytics, customer management |
| Store Manager | `STORE_MANAGER` | Assigned store(s) - transactions, scheduling, offers, order lists, employee requests |
| Employee / Cashier | `EMPLOYEE` | Assigned store - transaction processing, item requests, scheduling, chat |
| Customer | `CUSTOMER` | Personal account - loyalty program, redemptions, catalog |

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

A successful login also writes `User.lastSignInAt = new Date()`, fire-and-forget (`.catch(() => {})`, never awaited) - a write here must never hold up or fail an otherwise-good sign-in. It is skipped entirely on a wrong PIN or a deactivated account, so it only ever reflects a real, successful sign-in. The Staff page's "Last signed in" line (ST3) reads this field; `register` (a customer's very first session) deliberately does not set it, since the field only has an admin-facing use today.

**Subsequent requests:**
All authenticated requests include the JWT in the `Authorization: Bearer <token>` header. The `authenticate` middleware:
1. Extracts the JWT from the header.
2. Verifies the signature using `JWT_SECRET`.
3. **Live-checks the account** - looks up `isActive` by user ID in the database and rejects with 401 (`Account no longer active. Please sign in again.`) if the account was deleted or deactivated, even though the JWT signature itself is still valid.
4. Attaches the decoded JWT payload to `req.user`.

**Why the live check matters (added 2026-07-10):** a JWT's signature stays valid for its full `JWT_EXPIRES_IN` lifetime (up to 7 days) regardless of what happens to the account afterward. Before this check existed, a deactivated or deleted account's existing token kept working until it naturally expired - including on iOS, where `expo-secure-store` is backed by the Keychain and survives an app delete/reinstall, so a stale session could outlive the account indefinitely. This also means an admin's "deactivate user" action now takes effect immediately on every subsequent request, not just on the account's next fresh login.

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

JWTs are stored client-side in `expo-secure-store` (mobile) - a device-level encrypted key-value store. They are never stored in `AsyncStorage` or `localStorage`.

### 5.4 PIN Reset Flow

1. Customer provides phone number.
2. Firebase sends an OTP to the phone.
3. Customer verifies OTP - Firebase returns an ID token.
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
  lastSignInAt        DateTime? // set on every successful login (fire-and-forget); null means never signed in
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
  voidedAt         DateTime?
  voidedById       String?
  voidReason       String?
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt
}
```

**Key points:**
- `receiptImageHash` is unique - prevents the same receipt from being used twice across all transactions.
- `devCut` and `storeCost` are pre-calculated at transaction creation time, on the FULL cashback including any gas-tier bonus (fixed in migration `20260922120000_add_voided_status_and_fields` — before, the bonus portion was credited to the customer at the store's full cost with no platform fee collected on it).
- `fraudFlags` stores reasons if the transaction was auto-flagged.
- `TransactionStatus` has a fifth value, `VOIDED`: an APPROVED sale undone after the fact (`PATCH /points/:txId/void`, Dev Admin or Super Admin only). `voidedAt`/`voidedById`/`voidReason` are only set once a sale reaches this state; `voidedById` is a plain id, not a Prisma relation (a rare admin action, looked up by id when shown rather than adding a third `User` relation to this model).

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

**Key point:** `expiresAt` is used for offer notifications - set to the offer's end date so stale notifications automatically disappear from the user's inbox.

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

#### Label and StoreLabel

```prisma
model Label {
  id               String        @id @default(uuid())
  productName      String
  priceText        String?       // base/chain-wide price; null = known product, no price set yet (e.g. created by a scan)
  dealText         String?       // chain-wide only, not store-overridable
  barcode          String?       // one item per barcode is enforced in the controller, not a DB constraint
  category         String?       // freeform, same approval pipeline as Order List's OrderCategory
  template         LabelTemplate @default(CLASSIC_RED_BLACK)
  createdByStoreId String?       // history only, does not drive print-queue membership
  createdById      String?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  storeLabels      StoreLabel[]
}

// One store's own copy of a catalog Label: an optional price override (with an optional end date) and its own print status.
model StoreLabel {
  id                String    @id @default(uuid())
  labelId           String
  storeId           String
  priceText         String?   // null = inherit the Label's base price
  overrideExpiresAt DateTime? // a "sale price" end. Meaningless without priceText; cleared whenever priceText is cleared
  printedAt         DateTime? // null = still in this store's print queue
  everPrinted       Boolean   @default(false) // never resets; the only way to tell "new" (never printed) apart from "needs reprint"
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  @@unique([labelId, storeId])
}
```

**Key points:** the catalog (`Label`) is chain-wide; a store's price, print status and sale end date live on its own `StoreLabel` row, so printing at one store never touches another store's queue. The effective shelf price is `StoreLabel.priceText ?? Label.priceText` (`utils/labelPricing.ts`), except a `StoreLabel` whose `overrideExpiresAt` has passed reads as gone (`utils/labelSale.ts` `endedSaleView`, applied by every read: the catalog list, By Store, Price Check, Coverage and Health) even before the 15-minute job that makes it durable in the database (`utils/label-price-expiry-cron.ts`). `POST /labels/print` only stamps `printedAt` on the specific `StoreLabel` rows sent, and only when each one's live price still matches the `printedPrice` the caller says is on the paper (an optional field; omitted, the old behavior of trusting the caller applies) — a price changed mid-print is reported back in `notMarked` and stays queued, not silently marked. Every price-changing save on a `StoreLabel` is decided once with a compare-and-set (`storeLabel.updateMany` matched on the row's previous price and end), so a fast double click or two people saving at once record one change. A change to the chain-wide `Label` (price, name, barcode, category, deal, template) still writes a `PRINT_LABEL`/`UPDATE_LABEL`/`STORE_LABEL_PRICE`/`LABEL_SALE_ENDED` Audit Log entry as appropriate (Section 19), each with a plain-sentence `details.summary`.

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
enum LabelTemplate { CLASSIC_RED_BLACK | CHRISTMAS_WINTER | SUMMER | CLEARANCE | INDEPENDENCE_DAY | HALLOWEEN | PREMIUM }
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

// 3. Add the ONE promotion that applies (utils/offerPick.ts). Rule: this category's before an all-category one,
//    then the store's own before the chain-wide one, then the larger bonus for this sale, then the newer one.
//    A cents-per-gallon promotion pays cents only (its percentage is ignored).
const offer = pickOffer(activeOffersForStore, { storeId, category, tier, purchaseAmount, gallons })
cashbackRate += offer ? percentBonus(offer, customer.tier) : 0

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

After each credited sale the backend recalculates the customer's tier from `periodPoints` (the cashback earned in the current half-year, kept in dollars; the API and the app show points, 100 per dollar) and moves the customer UP when they qualify, with a "Tier Up" notification (`updateCustomerTierIfNeeded` in `utils/tier.ts`). A tier never goes down here: after the half-year step down a customer keeps the lower tier while they earn their way back.

### 8.3 Tier Periods and the Reset

The rewards year is two half-years, `tierPeriod` = `YYYY-H1` (January to June) or `YYYY-H2` (July to December), counted on the store calendar (Central time), so a period starts at midnight in Texas. A new customer is created in the current period.

At each new period every customer falls back ONE tier (Platinum to Diamond ... Silver to Bronze; Bronze stays) and `periodPoints` starts again from 0. `utils/tier-reset-cron.ts` does it: it runs at :07 past every hour (UTC) and 90 seconds after the server starts, and each run only touches customers whose `tierPeriod` is not the current one, so it is safe to repeat and catches up after a sleep (a customer who missed several half-years falls one tier for each). Customers are notified one by one, only when their own tier fell. A run that moves anyone writes a `TIER_PERIOD_RESET` Activity Log entry.

**Sale-price expiry job** (`utils/label-price-expiry-cron.ts`, every 15 minutes and once ~100 seconds after start-up, self-healing): finds every `StoreLabel` whose `overrideExpiresAt` has passed, puts it back on the base price with no end date, and — only where the shelf still shows the old sale price because the label was printed at it — flags it to reprint and, once per store, pushes and emails that store's managers ("N sale price(s) ended. Reprint this/these label(s)."), then writes one `LABEL_SALE_ENDED` Audit Log entry for the whole run. A sale whose price happens to equal the base price is tidied up quietly (no reprint flag, no message). Claimed with a compare-and-set on `overrideExpiresAt`, so two overlapping runs act on each row once.

**Other background jobs (all in-process `node-cron`, all safe to repeat, so a sleeping server catches up when it wakes):**
- `utils/offerAnnounce.ts` (:12 past every hour UTC, and 2 minutes after start-up): announces every active promotion that has started in the last two weeks and has not been announced. A promotion posted with a start in the past or now is announced at posting. Audience: `utils/audience.ts` (`ALL_CUSTOMERS`, or `STORE_CUSTOMERS` for a single-store promotion); the message link carries `offerId=<id>`, and a promotion is skipped when a message with that id exists (or an old-style one with the promotion's title sent after it was created).
- `utils/morning-summary.ts` (:25 past every hour UTC, and 2.5 minutes after start-up): after 8 am Central, if no `MORNING_SUMMARY` Activity Log entry exists for the store day and something is waiting, emails HQ once (`utils/adminEmail.ts`: active Super Admins and Dev Admins with an email, plus `ADMIN_EMAIL`, sent through Resend, text escaped) and writes that entry.
- Urgent emails to the same recipients: a sale of $500 or more held for review (`initiateGrant`), every missing-points report (`submitDispute`), every HIGH priority store alert (`submitRequest`).
- Gas price saves notify `resolveAudience('STORE_CUSTOMERS', storeId)` only, replacing the unread `GAS_PRICE_UPDATE` line for that store title.

Every read of a customer's tier goes through `effectiveTier()` (the cashier's customer screen, the customer's benefit screen, benefit claims and the rate a sale is paid at), which treats a customer whose period is old as one tier down per half-year missed with no progress, so all of them agree even before the job has reached that customer. Crediting a sale calls `rollCustomerPeriod()` first inside the same transaction, so the points of a sale made before the job runs count in the new period and are not wiped later.

---

## 9. API Reference

All endpoints are prefixed with `/api`. Base URL: `https://api.luckystop.cliffindus.com/api`

Authentication: `Authorization: Bearer <jwt_token>` on all authenticated routes.

### Authentication

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| POST | /auth/register | Public | - | Register customer with Firebase OTP |
| POST | /auth/login | Public | - | Login with phone + PIN |
| GET | /auth/me | JWT | Any | Get current user profile |
| PATCH | /auth/profile | JWT | Any | Update display name |
| POST | /auth/profile/avatar | JWT | Any | Upload profile picture (multipart) |
| PATCH | /auth/pin | JWT | Any | Change PIN |
| PATCH | /auth/email | JWT | Any | Save recovery email |
| POST | /auth/push-token | JWT | Any | Register push notification token |
| POST | /auth/verify-firebase-reset | JWT | Any | Verify Firebase OTP for PIN reset |
| POST | /auth/reset-pin | JWT | Any | Reset PIN with reset token (single use: the token carries a fingerprint of the current PIN; ends that account's other sessions and clears its lockout) |
| POST | /auth/super-admin | JWT | DEV_ADMIN | Create Super Admin account (a number already in use gets a 409 with a sentence saying whose it is) |
| POST | /auth/staff | JWT | SUPER_ADMIN | Create employee/manager account (the account and its store link are one transaction; a closed or missing store is refused; a number that is already a customer or staff account gets a 409 with a sentence and a `code`) |
| GET | /staff | JWT | SUPER_ADMIN | List all staff (with `allStoresAccess`, `lastSignInAt` and whether each store is open) |
| PATCH | /users/:userId/edit | JWT | SUPER_ADMIN | Fix a name/phone typo, promote/demote Employee<->Store Manager, set `allStoresAccess` (same role rule as toggle-active/reset-pin). Body `{ name?, phone?, role?, allStoresAccess? }`, at least one field. `role` is refused for anyone whose CURRENT role isn't Employee or Store Manager (a Dev Admin/Super Admin's role is never changed by this route) and is separately checked against `canManageAccount` for the role being moved TO. Demoting to `EMPLOYEE` clears `allStoresAccess` regardless of what was sent, since the flag only means anything for a manager. Only fields that are a REAL change are written (`changed: false` otherwise); a phone collision answers the same `phoneTakenAnswer` shape `createStaffAccount` uses |
| GET | /users/customers | JWT | SUPER_ADMIN | List customers. `search` is part of a name or a phone written any way (brackets, dashes, +1; `%` and `_` are ordinary characters); `page` (1 or more) and `limit` (1 to 100, default 50) are validated with 400 sentences. Optional filters: `status` (`active`\|`restricted`), `hasBalance=true`, `hasNote=true`, `joinedWithin=week`, `hideTest=true`; `sort` (`joined_desc` default, `joined_asc`, `spend_desc`, `balance_desc`) - `spend_desc` sorts by total approved purchase amount, which lives on `PointsTransaction` not `User`, so it runs as two queries (every matching id's spend via `groupBy`, sorted in JS, then only the page's ids are fetched in full) rather than a single `ORDER BY`. Answers `customers` (with each restricted customer's `fraudNote` and an `isTest` flag from `utils/testAccounts.ts`, the same 111-555 rule the Launch Tracker uses), `total`, `page`, `pageSize`, `totalPages`, `activeTotal` and `restrictedTotal` (always chain-wide, unaffected by filters) and `totalCreditsOutstanding`. `GET /users/customers/export` takes the same `search`/filters plus `isActive`, and gains a Test Account CSV column |
| GET | /users/customers/:userId/detail | JWT | SUPER_ADMIN | A customer's own page: their record plus `totals` (approved sale count and spend), and their 15 most recent `sales`, `redemptions` and `disputes` |
| POST | /users/customers/:userId/goodwill-credit | JWT | SUPER_ADMIN | A small credit outside the dispute flow. Body `{ amount, reason }`: amount $0.01-$25 (lower than a dispute's $50 cap, since nothing here is backed by a claimed purchase amount), reason required (300 characters at most). Credits the balance immediately, audits `GOODWILL_CREDIT`, pushes the customer a notice |
| PATCH | /users/:userId/toggle-active | JWT | SUPER_ADMIN | Deactivate / reactivate user (only accounts below the caller's role; a Dev Admin may act on any account but their own). Body `{ isActive }` sets that state, and asking for the state the account already has changes and records nothing (`changed: false`); a body without it still toggles. The last active Dev Admin cannot be deactivated |
| PATCH | /users/:userId/reset-pin | JWT | SUPER_ADMIN | Reset a user's PIN (only accounts below the caller's role; a Dev Admin may act on any account but their own; ends that account's other sessions and clears its lockout) |
| POST | /users/:userId/stores | JWT | SUPER_ADMIN | Add store to user (same role rule; the store must exist and be open) |
| PUT | /users/:userId/stores | JWT | SUPER_ADMIN | The person's whole list of stores, `{ storeIds }`, in one all-or-nothing save (at least one store; a closed store cannot be newly added; Activity Log `SET_STORES` with the names before and after). The admin page uses this instead of an add and a remove sent at the same moment |
| DELETE | /users/:userId/stores/:storeId | JWT | SUPER_ADMIN | Remove store from user |
| GET | /users/:userId/footprint | JWT | DEV_ADMIN | What Delete would do: for staff the work on record (sales, redemptions, ratings, daily reports, item requests, order lists and items, label prints, notices, job postings) and whether the account can be deleted; for a customer what stays and what goes |
| DELETE | /users/:userId | JWT | DEV_ADMIN | Delete an account. A customer is anonymized like Delete My Account (personal details removed, sales kept, number freed). A staff account is deleted only when it has no work on record (otherwise 409 with a sentence and a `DELETE_USER_REFUSED` entry: deactivate instead), all in one transaction; the last active Dev Admin cannot be deleted |

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
| PATCH | /points/:txId/reject | JWT | STORE_MANAGER+ | Reject a pending transaction; body may include `reason` (optional, 300 chars max) |
| PATCH | /points/:txId/review | JWT | STORE_MANAGER+ | Approve or reject a flagged transaction; body `{ action: 'APPROVE'\|'REJECT', reason? }` |
| PATCH | /points/:txId/void | JWT | SUPER_ADMIN | Void an APPROVED sale and claw the points back; body `{ reason }`, required, 300 chars max |
| GET | /points/platform-summary | JWT | SUPER_ADMIN | Platform-wide transaction summary |
| GET | /points/all | JWT | SUPER_ADMIN | All transactions, filterable (see below) |
| GET | /points/export | JWT | SUPER_ADMIN / STORE_MANAGER (own store) | Transactions as CSV, same filters as `/points/all` |
| POST | /points/receipt-token | API-KEY | Store API | Generate receipt QR token (POS) |
| GET | /points/receipt-token/:tokenId | JWT | CUSTOMER | Preview receipt QR token |
| POST | /points/self-grant | JWT | CUSTOMER | Self-grant from receipt QR |

**`GET /points/all` and `GET /points/export` query params** (`parseTransactionFilters` in `points.controller.ts`, `utils/transactionSearch.ts`): `storeId`, `status` (a real `TransactionStatus`, or `NEEDS_REVIEW` for flagged + pending), `category`, `from`/`to` (`YYYY-MM-DD`, store-calendar days), `search` (customer/employee name or phone, or a transaction id, up to 100 chars), `customerId`, `grantedById` (exact match — what the admin's transaction-details side panel uses to show a customer's or employee's other recent sales), `minAmount`/`maxAmount` (on `purchaseAmount`), `includeTestData` (`'true'` to include `isTestData` rows; left out by default, matching Analytics and billing).

**Pending-sale expiry job** (`utils/pending-expiry-cron.ts`, every 30 minutes and once ~110 seconds after start-up): a PENDING sale (a grant an employee started, waiting on the receipt photo) with no receipt after `ABANDON_AFTER_HOURS` (24) is rejected automatically, the same status a person choosing Reject would set, with a note on the transaction saying so. That store's active managers (and active Super Admins, via `utils/alertRecipients.ts`'s existing `flaggedSaleRecipientIds`) are told once per run per store, naming how many, not once per lapsed sale.

**Morning summary's stale-flagged nudge** (`utils/morning-summary.ts`): alongside the total count of FLAGGED sales, the email now separately counts ones older than 24 hours and calls them out by name in the line ("3 sales are held for review (1 waiting over a day)."), instead of a stale sale blending into the daily total with no urgency signal.

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
| GET | /stores | JWT | SUPER_ADMIN | All stores (with `dieselPriceUpdatedAt` for price age) |
| GET | /stores/accessible | JWT | STORE_MANAGER+ | Accessible stores for user |
| GET | /stores/:storeId | JWT | STORE_MANAGER+ | Store detail |
| PATCH | /stores/:storeId | JWT | SUPER_ADMIN | Update store. Two-letter state, five-digit ZIP, phone stored as `+1` and ten digits (an empty phone clears it), coordinates as a pair inside the United States (`utils/storeRules.ts`), no duplicate names (409), sentences for every refusal; a request that changes nothing answers `changed: false` and records nothing; every change is an `UPDATE_STORE` Activity Log entry. Changing `isActive` needs DEV_ADMIN (403 otherwise) |
| GET | /stores/gas-prices | JWT | Any | All stores gas prices |
| PATCH | /stores/:storeId/gas-prices | JWT | STORE_MANAGER+ | Update gas prices: $0.50 to $20, at most three decimals. Only prices that really change are written, sent to staff and put in customers' inboxes (a repeat answers `changed: false`); the write is compare-and-set, so two identical requests at once count once and two different ones at once give the second a 409; `GAS_PRICE_UPDATE` Activity Log entry with old and new price |
| PUT | /stores/:storeId/hours | JWT | STORE_MANAGER+ | The seven days in one call; an open day needs both times and opening and closing may not be the same; the log lists the days that changed (`UPDATE_STORE_HOURS`); answers `changed` |
| POST | /stores/:storeId/holidays | JWT | STORE_MANAGER+ | A date override: a real calendar date, an open day needs times; `ADD_STORE_HOLIDAY` (and `DELETE_STORE_HOLIDAY` on removal, 404 when already removed) |
| POST | /stores/:storeId/keyword-mappings | JWT | SUPER_ADMIN | A POS receipt keyword, 3 to 40 characters; `ADD_KEYWORD_MAPPING` / `DELETE_KEYWORD_MAPPING` |

A closed store (`isActive: false`) refuses `POST /points/grant`, `POST /points/redeem`, `POST /points/tier-benefit` and `POST /points/catalog-redeem` with a 409 sentence naming the store (`utils/storeRules.ts` `refuseIfStoreClosed`).

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
- `includeScheduled=1`: SUPER_ADMIN and above only. Also returns offers that are active but start later (`startDate` in the future), so a scheduled promotion is visible in the admin. Ignored for every other role.

**`GET /banners`:** with `storeId`, the all-store banners plus that store's; with none, SUPER_ADMIN and above get every active banner (one-store banners included), a STORE_MANAGER gets the all-store banners plus their own stores', anyone else the all-store banners only.

**Validation on `POST /offers`** (a 400 answers with a plain sentence in `error` and the zod detail in `details`): the bonus is at most `CASHBACK_RATE_CAP` (10%) and cents per gallon at most 40, because total cashback is capped at 10% of a sale; `endDate` is after `startDate` and not already past; a `SPECIFIC_STORE` offer needs an existing `storeId`; an offer needs a bonus or `dealText`; cents per gallon needs the GAS or DIESEL category and is stored without a percentage; `tierBonusRates` may arrive as a JSON string (multipart). A STORE_MANAGER gets 403 for any cashback (percentage, per-tier or cents per gallon), can post Deals, and on `PATCH` keeps the stored rate (a difference of half a point or less, the mobile form's rounding, is dropped silently; a larger one is refused).

**Rate flags:** `HIGH_CASHBACK_RATE` (above 7.5%) and `CASHBACK_RATE_CAPPED` (above 10%) hold a sale for review only when the tier and category rates alone are that high. When a live promotion lifts the total, the 10% ceiling still applies but the sale is not held.

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
| POST | /notifications/broadcast | JWT | SUPER_ADMIN | Send a push to `ALL_CUSTOMERS`, `STORE_CUSTOMERS`, `ALL_STAFF` or `STORE_STAFF`. Title 1 to 65 and message 1 to 200 characters (enforced). Audience = active accounts only (`utils/audience.ts`): customers of a store means an approved purchase there in the last 6 months, staff at a store includes chain-wide managers. The same message to the same audience is refused (409) for 5 minutes, and while one is being sent. `test: true` sends only to the caller's own phones with `[Test]` in front (no inbox row, no log entry). The push service's answer for every phone is read (`utils/pushSend.ts`: batches of 100, a failed batch retried once, 429 and unreachable counted as failures, `DeviceNotRegistered` phones deleted). Answers `people`, `phones`, `withoutPhone`, `accepted`, `failed`, `removed`, `retried`, `partial` (and `recipientCount`); writes a `BROADCAST` Activity Log entry |
| GET | /notifications/audience | JWT | SUPER_ADMIN | Who a message would reach (`target`, `storeId`): `people`, `phones`, `withoutPhone`, from the same rule as the send |
| GET | /notifications/broadcasts | JWT | SUPER_ADMIN | The last 50 sends (from the Activity Log), newest first |

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

### Labels

| Method | Path | Auth | Role | Description |
|---|---|---|---|---|
| GET | /labels | JWT | EMPLOYEE+ | Chain-wide label catalog |
| POST | /labels | JWT | EMPLOYEE+ | Create a label. The price must be dollars and cents (0.01 to 999.99, stored as `3.99`, a leading `$` is dropped) and the barcode must not be on another item (409 `BARCODE_TAKEN` naming the first) |
| PATCH | /labels/:labelId | JWT | EMPLOYEE+ | Update a label. Only a real change counts (the phone sends every field on every edit): a change to the chain-wide price needs SUPER_ADMIN, a change to name, barcode, category, deal or template needs STORE_MANAGER, otherwise 403 with a sentence and a `LABEL_CHANGE_REFUSED` Activity Log entry. Runs in one transaction, resets `printedAt` at the affected stores, answers `{ changed, reprint: { stores, keptOwnPrice } }`; the Activity Log keeps before and after |
| DELETE | /labels/:labelId | JWT | SUPER_ADMIN (checked in the handler, so an employee gets a sentence) | Delete a label from every store; the Activity Log keeps its price, barcode and how many store copies, print records, store prices and sale prices went with it; 404 when it is already gone |
| GET | /labels/:labelId/impact | JWT | SUPER_ADMIN | How many stores hold the item and in what state (`storeCopies`, `inheritingBase`, `ownPrice`, `salePrice`, `printed`): what a price change or a delete would touch |
| GET | /labels/lookup?storeId=&barcode= | JWT | EMPLOYEE+ | Price Check: resolves one scanned barcode to that store's live price and status (a sale that has ended reads as already back on the base price) |
| GET | /labels/coverage | JWT | SUPER_ADMIN | Every catalog item x every active store in one shot, for the cross-store Coverage view |
| GET | /labels/health-summary | JWT | SUPER_ADMIN | Chain-wide count of labels that can really be printed right now (open stores, priced items only) plus `noPriceItems`, for the Dashboard stat card |
| POST | /labels/:labelId/push-to-all | JWT | SUPER_ADMIN | Adds this label, at the base price, to every active store that does not already have it (`skipDuplicates`, safe to call twice at once); the answer and the Activity Log name the stores added |
| GET | /store-labels?storeId=&unprinted= | JWT | EMPLOYEE+ | One store's copy of the whole catalog, with its effective price, override state and print status (`?unprinted=true` filters to the queue only) |
| POST | /store-labels | JWT | EMPLOYEE+ | Add a store's own copy of a catalog item, at the base price or an explicit store price (with an optional sale end date). Adding what the store already has with no price sent changes nothing |
| PATCH | /store-labels/:storeLabelId | JWT | EMPLOYEE+ | Set or clear (`priceText: null`) one store's own price. Omitting `expiresAt` keeps the sale's current end date; `null` clears it; a `YYYY-MM-DD` day means the end of that day on the store calendar (`America/Chicago`), refused if it has already passed. Only a real change to the price or the end counts; the shelf price actually changing is what flags the label to reprint |
| DELETE | /store-labels/:storeLabelId | JWT | SUPER_ADMIN | Takes a label out of one store's list. Refused (409) if that store copy has ever been printed (`everPrinted`), so only a never-printed row can be removed |
| POST | /labels/print | JWT | EMPLOYEE+ | Marks specific `StoreLabel` rows printed, each judged on its own; optional `items[].printedPrice` is checked against that row's live price and a mismatch (or a since-removed row, or one with no price) is reported in the response's `notMarked` instead of being marked. Logs one `PRINT_LABEL` audit event with a plain-sentence summary |

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
| GET | /billing/analytics | JWT | DEV_ADMIN | Billing analytics. `?range=7d\|30d\|90d\|month\|today` adds a previous-period comparison (`compare`), `byHour`, `byWeekday` and `promotionMarkers`; `?storeId=` narrows every aggregate to one store; omitting `range` and passing `from`/`to` instead runs a plain custom range with no comparison. See 17.6. |
| GET | /billing/analytics/export | JWT | DEV_ADMIN | CSV export of the same filtered data (daily rows plus a per-store summary) |
| PATCH | /billing/stores/:storeId | JWT | DEV_ADMIN | Update store billing config |
| POST | /billing/generate-monthly | JWT | DEV_ADMIN | Make usage bills for one FINISHED month (`?period=YYYY-MM`, default the last finished store month; a month still running or not started is refused). Skips any store that already has its usage bill (an extra charge does not count). Never replaces or deletes. |
| POST | /billing/generate-all | JWT | DEV_ADMIN | Fill in missing bills: every finished month since each store was created. Only creates; never recalculates, replaces or deletes. |
| POST | /billing/records/:recordId/recalculate | JWT | DEV_ADMIN | Rebuild ONE unpaid usage bill from its month's approved sales on the plan the bill was made with (`?dryRun=1` only reports current, recalculated and the difference). A paid bill is refused (400). |
| POST | /billing/stores/:storeId/records | JWT | DEV_ADMIN | Add a manual/custom charge. `:storeId` accepts the literal `chain` as a reserved sentinel, meaning a chain-wide charge billed to the SuperAdmin rather than one store (stored as a null `storeId`) |
| GET | /billing/extra-charges | JWT | DEV_ADMIN | List manual/custom charges, with the typed reason parsed out as `description` |
| PATCH | /billing/records/:recordId/paid | JWT | DEV_ADMIN | Mark ONE record paid. Body (all optional): `paidOn` (YYYY-MM-DD, not in the future), `method` (CHECK, BANK_TRANSFER, CASH, CARD, OTHER), `note`, `expectedAmount` (409 if the amount changed). 409 if already paid. The payment is kept in the record's `notes.payment`. |
| PATCH | /billing/records/:recordId/unpaid | JWT | DEV_ADMIN | Undo a payment. Body `{ reason }` (required). The old payment moves to `notes.paymentReversals`. |
| PATCH | /billing/period/:period/paid | JWT | DEV_ADMIN | Mark every UNPAID record of a month paid, all or nothing. Same body as above plus `expectedTotal` (409 if the unpaid total changed). Returns `{ period, updated, total }`. |
| PATCH | /billing/records/:recordId | JWT | DEV_ADMIN | Edit an UNPAID charge's amount/description (a paid charge is refused: add a new charge for the difference) |
| DELETE | /billing/records/:recordId | JWT | DEV_ADMIN | Delete an unpaid charge |
| GET | /billing/monthly-records | JWT | DEV_ADMIN | All billing records, grouped by period |
| GET | /billing/tier-rates | JWT | EMPLOYEE+ | Tier cashback rates |
| GET | /billing/tier-rates | JWT | EMPLOYEE+ | Tier cashback rates. Each row: `tier`, `cashbackRate` (fraction), `gasCentsPerGallon` (null = percent), `pointsThreshold` (POINTS, 100 = $1), `gasBonusCentsPerGallon` (the fixed Gold/Diamond/Platinum extra: 5, 7, 10) |
| PUT | /billing/tier-rates | JWT | SUPER_ADMIN | Change several tiers all or nothing. Body `{ changes: [{ tier, cashbackRate?, gasCentsPerGallon?, pointsThreshold? }] }` (thresholds in points). Refused with a sentence by `utils/rateRules.ts`: tier at most 7.5%, gas at most 25 cents, thresholds 100 to 10,000,000 points and strictly rising, a tier plus a category bonus at most 10%. Writes one `RATE_TIER_UPDATE` audit entry (with `summary`, before and after). Returns every tier, `changed`, `lastChange`. |
| PUT | /billing/tier-rates/:tier | JWT | SUPER_ADMIN | Change one tier (same rules and audit as the bulk route) |
| GET | /billing/category-rates | JWT | EMPLOYEE+ | Category cashback rates |
| PATCH | /billing/category-rates/:category | JWT | SUPER_ADMIN | Change a category bonus (at most 5%; same 10% rule; writes `RATE_CATEGORY_UPDATE`). Was DEV_ADMIN only while the page offered it to Super Admins. |
| GET | /billing/rates/last-change | JWT | SUPER_ADMIN | Who last changed a tier or category rate, when, and a sentence saying what (null if never recorded) |
| GET | /billing/stores/:storeId/api-key | JWT | DEV_ADMIN | Get store API key |
| POST | /billing/stores/:storeId/api-key/regenerate | JWT | DEV_ADMIN | Regenerate API key (recorded as `REGENERATE_API_KEY`, never the key) |
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
saveNotification(userId, title, body, type, actionUrl?, expiresAt?)

// Save to multiple users' notification inbox
saveNotificationMany(userIds[], title, body, type, actionUrl?, expiresAt?)

// Broadcast to all customers
broadcastToCustomers(title, body, type, actionUrl?, expiresAt?)

// Send to all staff at a store (or sendPushToStoreEmployees / sendPushToStoreManagers for a single role)
sendPushToStoreStaff(storeId, title, body, type, actionUrl?)
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

### 10.5 Deep-Linking (added 2026-07-18)

Every notification carries a real, ready-to-navigate destination computed server-side at creation time, rather than the client guessing where a notification "type" should go:

- `UserNotification.actionUrl` stores an in-app route (e.g. `/store-requests?tab=stock&highlight=<id>`), passed through as an optional param on every `push.ts` sender above.
- The same `actionUrl` is included in the Expo push payload's `data` field, so a tap on the OS notification (foreground, background, or cold-start) carries it too.
- Mobile has a single OS-level tap listener (root `_layout.tsx`) that reads `actionUrl` from the notification response and routes there via Expo Router, for all three launch states. A consume-once guard (`clearLastNotificationResponseAsync`) stops a cold-start tap from replaying itself on a later, unrelated relaunch.
- Destination screens implement a shared "highlight" treatment (`PulseHighlight` component + `useHighlightParam` hook) that scrolls to and briefly pulses the specific row a notification pointed at (a request, a dispute, an alert), driven by a `highlight=<id>` query param on the route.
- Admin's bell-feed notifications reuse the same `actionUrl` pattern (already existed there before the mobile-side work) rather than a separate mechanism.
- **Known gap, by design, not a bug:** notification types with no real destination screen to link to (e.g. a customer-facing "your hot food order is ready" push - there's no dedicated order-status screen yet) simply omit `actionUrl`; tapping them just opens the app.

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
│   ├── index.tsx             # Auth gate - routes to appropriate area
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

- **Unauthenticated:** `(auth)` group - welcome, login, forgot-pin.
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
- `componentDidCatch` logs the error to `console.error` - replace with `Sentry.captureException(error)` when crash reporting is added.

**Placement:** `<ErrorBoundary>` wraps `<QueryClientProvider>` in `_layout.tsx`, so it catches errors from any screen across all roles.

---

## 13. Admin Portal Architecture

### 13.1 File Structure

```
admin/src/
├── main.tsx               # Entry point
├── App.tsx                # Router setup, ProtectedLayout (sidebar + TopBar)
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
│   ├── ScannedProducts.tsx
│   ├── Labels.tsx
│   ├── Notifications.tsx
│   ├── Notices.tsx
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
│   ├── HotFood.tsx
│   ├── OrderList.tsx
│   ├── StoreRequests.tsx
│   ├── InventoryAnalytics.tsx
│   ├── DailyReports.tsx
│   ├── DailyTasks.tsx
│   ├── Documents.tsx
│   ├── EmployeePortal.tsx
│   ├── ComingSoon.tsx
│   ├── Profile.tsx
│   └── Privacy.tsx
├── components/
│   ├── AppSidebar.tsx      # The collapsible sidebar; groups and items come from lib/navItems.ts
│   ├── TopBar.tsx          # Menu/collapse trigger, page title, Search, bell, refresh + "Updated Xs ago"
│   ├── CommandPalette.tsx  # Ctrl/Cmd+K dialog: pages, live customer/staff search, Recent
│   ├── GlobalSearch.tsx    # The Dashboard's own inline search box (customers, staff, stores)
│   ├── ErrorBoundary.tsx
│   ├── NotFound.tsx
│   ├── Modal.tsx, ConfirmModal.tsx
│   └── ... (page-specific panels: StoreLabelsPanel, CoverageView, InvoiceModal, etc.)
└── lib/
    ├── navItems.ts         # NAV_ITEMS + visibleNavItems(role): the shell's own nav/role list
    └── ... (apiError, phoneText, storeDates, offerRules, rateRules, labelPrice, theme, utils)
```

### 13.2 Role-Gated Pages

`AppSidebar` and the Command Palette each read `lib/navItems.ts`'s `visibleNavItems(role)` to decide which pages a role can see; the two lists are kept deliberately separate rather than sharing one component tree, so a change to one cannot silently regress the other. Routes are also protected client-side by checking `user.role` before rendering admin-only content, and every route is enforced again on the server.

### 13.3 Top Bar and Command Palette (Shell Batch S2)

Every authenticated page renders inside `ProtectedLayout` (`App.tsx`), which pairs `AppSidebar` with `TopBar`:

- **TopBar** shows the current page's title (`hooks/usePageTitle.ts`), a menu/collapse trigger (`SidebarTrigger`, from the sidebar primitives), a Search button, a bell button, and a refresh button with a live "Updated Xs ago" ticker. Refresh calls `queryClient.refetchQueries({ type: 'active' })`, so it re-fetches whatever the current page already has open rather than a hardcoded list.
- **CommandPalette** opens on Search or **Ctrl/Cmd+K** from any page (a `window` keydown listener in `TopBar`). With no query it lists nav pages by group, plus a "Recent" group (up to 5, from `localStorage` key `admin-palette-recents`) built from pages actually opened through the palette. A query of two or more characters also searches live customers (`customersApi.list`, 250ms debounce) and staff (`staffApi.list`, client-filtered) for a Dev Admin or Super Admin. Choosing a customer or staff result navigates to `/customers?search=...&highlightId=...` or `/staff?search=...` — both `search` and `highlightId` are sent together, because `highlightId` alone only highlights a match that is already on the current, unfiltered page of results.
- **Bell popover** reads the same `useAdminBadges` counts the sidebar badges use (`lib/BADGE_LABELS` gives each one a singular/plural label), so the number is consistent everywhere it appears; it lists only the badges that are non-zero and links each one to its page via `navItems.ts`.
- The result list is a real ARIA `listbox`/`option` structure: each row is a sibling `<li role="presentation">` wrapping a `<button role="option">`, never a `<li>` with a bare group-label `<div>` next to it, which is what an accessible listbox's children are required to be.

### 13.4 One Badge Request, Retry Rules, Pinned and Recent Pages (Shell Batch S3)

- **`GET /admin/badges`** (`controllers/adminBadges.controller.ts`, Dev Admin or Super Admin only) answers every sidebar/palette/bell count the admin shell needs in one request, instead of the 13 separate `*/pending-count` and `*/unread-count` requests `useAdminBadges.ts` used to fire on every page load (confirmed by `tools/admin_shell_s3_check.py`'s `requests` section: 2 requests on `/profile`, down from 14). Each field's query is a direct copy of its own original controller's where-clause (named in a comment next to it — `points.controller.ts`, `dispute.controller.ts`, `storeRequest.controller.ts`, `productRequest.controller.ts`, `employeeRequest.controller.ts`, `chat.controller.ts`, `schedule.controller.ts`, `promotions.controller.ts`, `hotFood.controller.ts`, `orderCategory.controller.ts`, `billing.controller.ts`, `careers.controller.ts`, `support.controller.ts`), always taking the "every active store" branch those functions used for these two roles, since the admin web is Dev Admin/Super Admin only. The original 13 routes are untouched and still work; nothing else was found calling them directly besides a page's own local count (Billing, Customers' Disputes tab, Order List each still ask for their own count directly, only when that page is actually open — unrelated to the shell's every-page problem this fixes). `unreadCount` (the bell's notification-list-derived badge) stays a separate query, since it needs the full notification list, not just a count.
- **Retry rule** (`App.tsx`'s `QueryClient`): a query with no `retry` of its own now retries a network error or a 5xx up to 2 more times, and never retries a 4xx (a refused form, an expired session, a not-found record cannot succeed by asking again). Before, every query defaulted to react-query's built-in 3 retries regardless of the error. A query that already sets its own `retry` (several do, e.g. the badge and notification queries, which would rather just show 0 than keep trying) is unaffected.
- **Request timeout**: the shared axios instance (`services/api.ts`) now sets `timeout: 30_000`, so a hung request fails instead of leaving a page loading forever.
- **Pinned pages**: `hooks/usePinnedPages.ts` (`localStorage` key `admin-pinned-pages`, capped at 8, `useSyncExternalStore`-backed so every component sees a pin the moment it happens, including in the same tab). Pinning happens in the command palette with **Shift+Enter** on the highlighted page (kept out of the result rows themselves on purpose: a plain button living inside a `role="option"` row would itself become a second, rule-breaking child of the listbox in the accessible tree, the same class of ARIA problem S2 fixed). `AppSidebar.tsx` shows a "Pinned" group above "Overview" whenever anything is pinned, each row with a small unpin control, and reads each pinned page's icon/label/badge key from `navItems.ts` purely as a lookup table (the sidebar's own regular groups stay hand-written, per S2's reasoning for keeping the two lists separate).
- **Recent pages**: `lib/recentPages.ts` (the same `localStorage` key and list the palette already wrote, `admin-palette-recents`, now with a `useRecentPages()` hook so the sidebar sees a page opened moments ago without a remount) surfaces up to 3 most-recently-opened pages in their own sidebar group, excluding anything already shown as Pinned.

---

## 14. POS Integration - Receipt QR Tokens

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

Each `txRef` per store is unique - prevents double-scanning the same receipt.

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

### Mobile App Deployment (Expo EAS + custom CI)

`eas build`/`eas submit` remain available for development/preview builds:

```bash
# Development build
eas build --profile development --platform all

# Preview/internal APK, for direct-install testing
eas build --profile preview --platform android
```

**Production releases do not use EAS's cloud build service** - to avoid EAS build credits, both platforms build via dedicated GitHub Actions workflows that run a bare local build instead:

- **`.github/workflows/build-android.yml`** - `expo prebuild --clean` + Gradle `bundleRelease` (AAB, the format Play Console requires) on a standard Linux runner. Manually triggered (`workflow_dispatch`); uploads the AAB as a workflow artifact for manual Play Console upload - does not auto-submit.
- **`.github/workflows/build-ios.yml`** - `macos-latest` runner: decodes the distribution certificate, provisioning profile, and `GoogleService-Info.plist` from GitHub Secrets into a temporary keychain, archives via `xcodebuild`, exports a signed `.ipa`, and **auto-uploads to App Store Connect** via `xcrun altool --upload-app` (API-key auth - `xcodebuild -exportArchive -destination upload` does not reliably support non-interactive API-key auth in CI). Still requires a manual "Submit for Review" step in App Store Connect itself. The pinned Xcode version (`xcode-select -s`) must be re-checked after every Expo SDK bump - SDK upgrades have broken this build twice by requiring a newer Xcode/Swift than the runner's default.

**No OTA updates are configured** (no `expo-updates` dependency) - every code change, including a pure JS/TSX-only change, requires a full new native build and a fresh store submission to reach any installed device.

Both apps are live publicly: iOS App Store (`id6787270736`), Google Play (`com.luckystop.app`).

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

Bills are per store per FINISHED month on the store calendar (Central time, whatever the server clock). A usage bill is the subscription fee (Monthly or Hybrid plans) plus the dev cut recorded on each approved, non-test sale (cashback x the store's fee at that moment), with a full breakdown in `notes`. The monthly job (`billing-cron.ts`) runs every hour at :05 UTC and once a minute after start-up and is idempotent: it makes any missing usage bill for the last finished month and never changes an existing one. `POST /billing/generate-monthly` and `POST /billing/generate-all` do the same on demand.

Rules kept by every billing route: a bill or extra charge is never deleted or overwritten by a bulk action; a paid record never changes (a correction is a new CUSTOM charge); a CUSTOM extra charge never counts as a usage bill; every action writes an `audit()` entry (`BILLING_GENERATE`, `BILLING_FILL_MISSING`, `BILLING_RECALCULATE`, `BILLING_MARK_PAID`, `BILLING_MARK_PERIOD_PAID`, `BILLING_UNDO_PAID`, `BILLING_CHARGE_ADD`, `BILLING_CHARGE_EDIT`, `BILLING_CHARGE_DELETE`, `BILLING_REPORT_SENT`, `STORE_BILLING_UPDATE`, `DEV_CUT_RATE_UPDATE`). A store's `transactionFeeRate` is capped at 25% (`MAX_STORE_FEE_RATE`); the default for a store added later is `DEFAULT_DEV_CUT_RATE` (10%). `POST /billing/seed-test-data` returns 403 unless the server sets `ALLOW_SEED_TEST_DATA=true`.

### 17.4 Revenue Analytics

`GET /billing/revenue?period=all|month|last-month` (Dev Admin) returns, for approved non-test sales in that range: `totalTransactions`, `totalPurchaseVolume`, `totalPointsAwarded`, `totalDevCut` (the `PointsTransaction.devCut` accrued at grant time — an accrual, independent of whether it has been billed or paid), `totalRedemptions`/`totalRedeemedAmount` (credit redemptions), and `totalSubscriptionRevenue`.

`totalSubscriptionRevenue` is the `subscriptionFee` component read out of each **paid, non-`CUSTOM`** `BillingRecord.notes` in range (a `findMany` + reduce, not a column sum) — B2 fix. It used to be `billingRecord.aggregate({ _sum: { amount: true }, where: { isPaid: true } })`, which summed every paid record regardless of type, so a one-off `CUSTOM` charge (unrelated to any subscription) inflated the figure the same as real recurring subscription income.

### 17.5 Manual Charges and Chain-Wide Billing

`BillingRecord.storeId` is nullable: `null` means a chain-wide charge billed to the SuperAdmin/chain as a whole rather than one specific store, the same convention used by `AdminNotice.storeId`/`DailyTask.storeId` elsewhere in the schema. `POST /billing/stores/:storeId/records` treats the literal string `chain` as a reserved sentinel in the `:storeId` route param, mapping it to `null` server-side rather than adding a second route.

A `CUSTOM`-type `BillingRecord`'s `notes` column holds a different JSON shape than every other billing type: `{ description }` instead of the full compound breakdown (`txCount`, `purchaseVolume`, `categories`, etc.). Any code reading `notes` off a `BillingRecord` must branch on `billingType === 'CUSTOM'` before assuming the compound shape is present - the admin frontend's invoice views (`admin/src/pages/Billing.tsx`, `SuperAdminBilling.tsx`) do this by nulling out the parsed notes object for `CUSTOM` records and reading `description` separately.

Paid status is tracked per `BillingRecord`, not per billing period: `getSuperAdminInvoices` groups every record in a period into one consolidated invoice object, but each per-store row it returns carries its own `isPaid`/`paidAt`, and the invoice's own `isPaid` flag is only `true` when every record in that period is paid. Any summary total (Outstanding Balance, Total Paid) must aggregate by each record's own `isPaid`, not by the period-level flag, or a period with a mix of paid and unpaid charges will report its entire total as outstanding.

### 17.6 Analytics: Comparison Windows, Drill-down, CSV Export

`GET /billing/analytics` (`billing.controller.ts`, `getAnalytics`) accepts an optional `range` (`'today'|'7d'|'30d'|'90d'|'month'|'custom'`, validated against `dashboardWindows.ts`'s `COMPARE_RANGES`) and an optional `storeId`. This is the same `CompareRange` type and `compareWindow()`/`summarize()` pair the Dashboard's Activity panel already used (batch A1/Dashboard) - Analytics A2 only added `'90d'` to the union and reused the rest, so the Dashboard's Business tab and the Analytics page compute "current vs previous period, same length, ending at the same point" identically and share one cache key when their params match.

When `range` is given, the controller fetches both windows in a single query (`fromDate = compareWindow.previous.start`, `toDate = compareWindow.current.end`), computes `compare = summarize(compareWindow, allTransactions)` (giving `compare.current`/`compare.previous`, each with `totals` and a per-day `series`), then narrows `transactions`/`redemptions` down to just the current period before the existing `byDate`/`byStore`/`byCategory` aggregation runs unchanged. `range` in the response reflects the display window (current period only), not the wider fetch window used internally for the comparison.

`storeId` filters every aggregate (including `compare`) to one store; `byHour` (24 slots) and `byWeekday` (7 slots, `Sun`..`Sat`, via `storeTime.ts`'s `storeWeekday()`) bucket the current period's transactions by store-local hour/day. `promotionMarkers` lists offers whose `startDate` falls inside the display window, filtered by `storeId` via `OR:[{storeId},{storeId:null}]` so a chain-wide offer still shows under a single-store drill-down.

`GET /billing/analytics/export` (`exportAnalyticsCsv`) takes the same filters and streams a CSV: daily rows followed by a per-store summary section, `Content-Disposition` filename `analytics-<from>-to-<to>.csv`.

Client side (`admin/src/pages/Analytics.tsx`), a percent-change helper (`pctChange`) turns `compare.current.totals` vs `compare.previous.totals` into "+12% vs previous period" / "no change" / "new this period" (never `Infinity%` when the previous period was zero). Clicking a bar in the per-store charts sets `storeId` and hides those two charts while drilled in, matching the server's own single-store aggregation rather than re-deriving it client-side.

**Cache (`utils/analyticsCache.ts`):** `getAnalytics` wraps its query-plus-aggregation in `cachedAnalytics(key, compute)`, a 60-second in-process `Map`. The key is built from `fromDate`/`toDate`/`storeId`/the `compareWindow`'s four boundary timestamps - **not** their exact `.toISOString()` values, since a preset range's `current.end` is `now` at the moment of the request, a different millisecond on every call, which would make every key unique and the cache a permanent miss. `bucketTime()` floors each timestamp to a 30-second bucket (`CACHE_BUCKET_MS`) for the purpose of the key only; the actual query still uses the real, un-bucketed `fromDate`/`toDate`. Two requests for the same range/store landing in the same 30-second bucket share one cached result; a write (a sale approved, voided, rejected) is not actively invalidated, so a change can take up to ~60 seconds to show - an accepted tradeoff for a page nobody expects to be live-updating. `clearAnalyticsCache()` exists for tests, which reuse the module across cases and must not read an earlier case's cached result.

**Weekly summary (`utils/weekly-summary.ts`):** `runWeeklySummary()` follows the exact idempotency pattern `morning-summary.ts` established - it only acts when `storeWeekday(now) === 1` (Monday, store-local) and past 8am Central, and an `AuditLog` row (`action: 'WEEKLY_SUMMARY'`) since that Monday's start is the dedupe record, so a server asleep at 8am Monday sends it at the next hourly check instead of skipping the week, and the hourly cron (`:35 UTC`) never double-sends within the same week. It reuses `dashboardWindows.ts`'s `compareWindows('7d')`/`summarize()` (the same current-vs-previous-7-days definition Analytics and the Dashboard use) over approved, non-test transactions, adds the week's own platform fee (`devCut`) total and its busiest store by purchase volume, and sends through the existing `emailHQ()` helper.

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

This creates an `AuditLog` record. The audit log is append-only - records are never deleted or modified. Super Admins can search and filter the audit log via the Admin Portal.

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

`backend/src/index.ts` imports `express-async-errors` as its very first line, before any routes are mounted. This is load-bearing: **Express 4's built-in routing does not forward a thrown/rejected error from an `async` handler to error middleware** - without this import, a controller that throws just hangs the request forever with no response ever sent (the only trace is a swallowed `unhandledRejection` log). `express-async-errors` monkey-patches Express so every async handler's errors flow into the standard error-handling pipeline automatically, whether or not that specific controller has its own try/catch.

A catch-all error middleware is registered last, after all routes:

```typescript
app.use((err: Error, _req, res, _next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});
```

Individual controllers may still add their own try/catch for a more specific error message/status - that's the pattern below - but it is no longer required for correctness the way it was before `express-async-errors` was added (2026-07-10, commit `cf899e9`); an uncaught throw now always reaches this handler instead of hanging.

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

`process.on('unhandledRejection', ...)` / `process.on('uncaughtException', ...)` handlers log to the console as a last-resort safety net (Render logs), but should not be relied on as the primary error path - `express-async-errors` + the middleware above is.

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

A migration written by hand (not generated by running `prisma migrate dev` against a live database, to avoid touching production schema mid-session) still needs `prisma migrate deploy` run once, same as any other, before the server code that relies on its new columns/enum values reaches production. `20260922120000_add_voided_status_and_fields` (adds `TransactionStatus.VOIDED` and `PointsTransaction.voidedAt`/`voidedById`/`voidReason`, batch T3) is one of these — apply it alongside that server deploy, not after.

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
