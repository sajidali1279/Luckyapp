# Lucky Stop — Platform Changelog

All notable changes to the Lucky Stop Loyalty Platform are documented here.  
Format: `[Version] — Release Date` followed by what changed and who it affects.

Audience indicators: **Customer** · **Employee** · **Manager** · **Admin** · **Dev**

---

## [1.2] — June 2026

### Added
- **Customer, Employee, Manager** — Language settings in Profile. Users can switch the app between **English** and **Español**. The chosen language is remembered across sessions. Accessible via Profile → Preferences → Language.
- **Customer** — Hot Food ordering from the customer app. Customers can browse the Hot Food menu, place orders, and receive push notifications when their order is ready. Accessible via the Hot Food tile on the home screen or the Hot Food tab in the menu.
- **Customer** — Featured Slideshow on the home screen. Rotating full-width promotional slides with category shortcuts (Hot Food, Deals, etc.) above the quick-action grid.
- **Employee** — Hot Food order management. Employees can view incoming hot food orders, mark them as in-progress or ready, and complete fulfilled orders. Accessible via Hot Food Orders in the menu.
- **Customer, Employee, Manager** — Notification bell with live unread badge on the home screen header for at-a-glance visibility without opening the drawer.
- **All roles** — Avatar photo shown in the app header on home and in the navigation drawer.

### Changed
- **Customer** — Tiered cashback rates now apply per tier (Bronze 5% → Platinum 9%) with a hard rate cap guard and tier fall-back logic at period reset.

### Fixed
- Manager home screen: category filter chips now correctly use the string values returned by the API (previously caused a `key` prop warning).
- Modal warning resolved: removed incompatible `presentationStyle="formSheet"` from the manager requests acknowledgement modal.

---

## [1.1] — May 2026

### Added
- **Customer, Employee, Manager** — In-app Help & Guide screens accessible from the Profile tab. Each role sees their own manual (Customer Guide, Employee Manual, Store Manager Manual) rendered inline without needing to leave the app.
- **Admin** — Documents tab in the admin portal. All legal documents, user manuals, and technical documentation are now readable and downloadable as PDF directly from the portal. Visibility is role-gated.
- **Customer** — 18+ age confirmation checkbox added to the welcome/registration screen. Required before account creation.
- **Customer** — 21+ location gate modal for stores with a minimum age requirement (e.g., liquor stores). Fires once when the customer's GPS detects a restricted store and is permanently stored on their account after confirmation.
- **Customer** — Delete My Account flow in the Profile screen. Wipes all personal data, anonymises transaction history for billing integrity.
- **Admin** — Business Docs section in the Documents tab (DEV_ADMIN only): Store Owner Pitch and Store Owner Overview documents.

### Changed
- **All roles** — Tobacco/Vapes removed as a product category from the app. Advertising for these products is handled in-store.

### Fixed
- Navbar document link added for all roles.

---

## [1.0] — May 2026 — Initial Launch

### Platform
- Multi-role mobile app (React Native / Expo) for iOS and Android
- Web admin portal (React / Vite) for SuperAdmin and StoreManager roles
- REST API backend (Node.js / Express / Prisma) on Render
- PostgreSQL database on Neon
- Firebase Auth (phone OTP) for all user authentication
- Firebase Cloud Messaging for push notifications
- Cloudinary for receipt photo and banner image storage

### Customer Features
- Phone number registration with OTP
- Unique QR code for in-store scanning
- 5% cashback on qualifying purchases
- Loyalty tier system: Bronze → Silver → Gold → Diamond → Platinum
- Product catalog with credit redemption and expiring redemption codes
- Welcome bonus on first transaction
- Tier benefit claims
- Transaction history
- Push notification delivery for offers and announcements
- Leaderboard (top customers by spend)
- Business promotion request (advertise in the app)
- Customer ratings for employees
- Product request submissions

### Employee Features
- QR code scanner with customer account lookup
- Receipt photo upload (mandatory per transaction)
- Points granting workflow
- Redemption code verification
- Item request submissions
- Shift schedule viewing
- Shift swap / time-off requests
- Store chat
- Leaderboard (staff rankings by customer rating)

### Manager Features
- Store dashboard (transaction feed, active offers, low-stock alerts)
- Staff management (add/remove employees, reset access)
- Offer management (bonus rate promotions with push notification delivery)
- Banner management (promotional images shown in customer app)
- Order list management (procurement tracker)
- Employee item request approvals
- Shift scheduling (templates, roster generation, request approvals)
- Store chat
- Inventory analytics (category trends, AI reorder suggestions)
- Customer and staff leaderboards

### Admin / SuperAdmin Features
- Multi-store management
- Customer management
- Notification broadcasting
- Rates and tier configuration
- Catalog management
- Activity audit log
- Leaderboard across all stores
- Support request management

### DevAdmin Features
- All SuperAdmin features
- Billing management (per-store subscription plan changes)
- Analytics dashboard
- Business promotions management
- Technical documentation access

---

*This changelog is maintained by Cliff Industries. For questions about a specific release, contact sksajidali1279@gmail.com.*
