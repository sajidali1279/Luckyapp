# Lucky Stop App

Loyalty rewards app for Lucky Stop gas station chain (~12 stores).

## Project Structure

```
LUCKYAPP/
├── backend/     Node.js + Express + Prisma + PostgreSQL
├── mobile/      React Native + Expo  (iOS + Android)
└── admin/       React.js web dashboard
```

## Roles

| Role | Description |
|---|---|
| `DEV_ADMIN` | You — all access + billing management |
| `SUPER_ADMIN` | LuckyStop HQ — offers, banners, all stores |
| `STORE_MANAGER` | Per-store management |
| `EMPLOYEE` | Scan QR, upload receipt, grant points |
| `CUSTOMER` | Mobile app user |

## Setup Order

### 1. Backend
```bash
cd backend
cp .env.example .env        # Fill in real values
npm install
npx prisma migrate dev      # Creates database tables
npm run db:seed             # Optional: seed test data
npm run dev
```

### 2. Mobile
```bash
cd mobile
npm install
# Add google-services.json (Android) and GoogleService-Info.plist (iOS) from Firebase Console
npx expo start
```

### 3. Admin Dashboard
```bash
cd admin
npm install
npm run dev                 # Opens on localhost:5173
```

## Services You Need to Set Up

| Service | Why | Cost |
|---|---|---|
| **PostgreSQL** | Database | Free (local) or ~$5/mo (Railway/Supabase) |
| **Firebase** | Phone OTP + Push Notifications | Free tier sufficient |
| **Cloudinary** | Receipt + banner image storage | Free tier (10GB) |
| **Railway/Render** | Backend hosting | ~$5-10/mo |
| **Vercel** | Admin dashboard hosting | Free |
| **Expo EAS** | Mobile app builds | Free (limited) or $99/yr |

## How Points Work

1. Customer opens app → shows QR code
2. Employee scans QR → enters purchase total
3. Employee MUST photograph receipt → points locked until uploaded
4. System credits 5% of purchase to customer
5. Your 2% dev cut tracked per transaction

## Revenue

- Monthly subscription: $99-149/store × 12 stores = ~$1,200-1,800/month
- Change billing type per store from the Billing page (DevAdmin only)
