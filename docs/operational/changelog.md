# Lucky Stop - Platform Changelog

All notable changes to the Lucky Stop Loyalty Platform are documented here.  
Format: `[Version] - Release Date` followed by what changed and who it affects.

Audience indicators: **Customer** · **Employee** · **Manager** · **Admin** · **Dev**

---

## [1.5] "Shelf Tags" - August 23, 2026

A major feature release centered on printable shelf/price labels, plus a full Store Manager admin-web parity pass and three billing fixes.

### Added
- **Manager, Employee, Admin** - Shelf/Price Labels: a chain-wide label catalog shared across all stores. Create a label by scanning a barcode (autocompletes the product name from a shared preset list) or entering one manually, then print or share a batch as a formatted PDF. Reachable via the Labels tab on mobile (Manager, Employee) and the Labels page on admin web (DevAdmin, SuperAdmin, StoreManager).
- **Manager, Employee** - Mobile Labels screen defaults to "Ready to Print" (this store's not-yet-printed labels), with a toggle to the Full Catalog, search, select-all, and quick-add directly from an existing barcode search result.
- **Admin** - 7 distinct print templates (including seasonal designs), each label sized to fit a real 1in x 2-5/8in address-label sheet (Avery 5160), plus a category field (reusing the same approval pipeline as Order List categories) filterable via chips/dropdown on both platforms.
- **Dev** - Every label print now logs a PRINT_LABEL event (who, which store, how many) to the Activity Log, with its own icon.
- **Manager, Employee** - Cross-store print warning on mobile: printing labels created at a different store than the one currently selected now prompts for confirmation first.
- **Manager** - Store Manager admin-web access extended to Notices, Catalog, Daily Reports, Daily Tasks, and Support (previously mobile-only or missing entirely).
- **Dev** - Billing: DevAdmin can now bill "the chain" (all stores at once) as a single manual charge attributed to the SuperAdmin rather than one specific store.

### Changed
- **Dev** - A manual/custom billing charge's typed reason now appears on every invoice view (DevAdmin's Monthly Bills breakdown, both invoice modals, the exported PDF) and on the SuperAdmin's own "My Billing" page.
- **Admin** - SuperAdmin's "My Billing" page and DevAdmin's Monthly Bills tab now show each charge's own paid/unpaid status individually, instead of marking an entire billing period unpaid the moment any single charge in it is outstanding.

### Fixed
- **Manager** - A manager assigned to more than one store got stuck on their first store in Chat, Scheduling, Notices, and Daily Tasks; the other stores' data was unreachable from those screens.
- **Manager** - Per-store badge indicators for Chat and Scheduling, and the sidebar's Notifications badge, now stay in sync per store instead of sharing one count.
- **Manager** - Several dead links and missing elements on Store Manager admin-web pages, and sidebar badge counts that didn't lead anywhere when clicked.
- **Employee** - Mobile Support ticket screen was gated to Admin only; Store Manager can now reach it.
- **Dev** - Manual billing charges crashed the DevAdmin invoice view instead of rendering (missing category data on a non-compound charge).

---

## [1.4] "Stocktake" - July 19, 2026

Admin-web focused release: a full parity audit against mobile, a cleanup pass on dead/broken code paths, and several real bugs caught during live testing the same day.

### Added
- **Admin** - "All Stores" view on the Requests hub's Stock tab, showing pending stock requests across every store at once with a store-name label on each card, instead of requiring a single store to be selected first.
- **Admin** - New Scanned Products page: search, browse, and delete entries in the chain-wide barcode → name/category/brand catalog that managers build up by scanning on mobile. Reachable by DevAdmin, SuperAdmin, and StoreManager. Includes a manual "+ Add Product" form to seed or correct an entry directly, without waiting for it to be scanned first.
- **Admin** - Restore Items action on a closed Order List, letting DevAdmin pull undelivered items from a closed list straight onto that store's current open list (previously mobile-only).
- **Admin** - "⚠ N stores with no open list" banner on the Order Lists tab, with a one-click button per store to open one - previously the only way to find these was checking the store filter one store at a time.
- **Admin** - Search box for the Order List detail view's Quick Add tiles, once a store has more than 6.

### Changed
- **Admin** - Order List detail view's two-column layout: the Restore Items / Quick Add panel moved from the right to the left, item list moved to the right.
- **Admin** - Quick Add tiles switched from a 2-column grid to a single scrollable column, capped at a fixed height instead of growing to fill the page.
- **Admin** - The two unfinished Hot Food admin pages (Menu Management, Order Board) now show a "Coming Soon" placeholder instead of partially-working functionality, gated the same way as the main Hot Food page.

### Fixed
- **Admin** - StoreManager could reach `/daily-reports`, `/daily-tasks`, and `/notices` by typing the URL directly, despite those links being hidden from their sidebar - every request 403'd with a broken page. All three now redirect cleanly.
- **Admin** - Order Lists browse-tab cards always silently showed 0 for "needed"/"received" item counts, regardless of a list's actual contents.
- **Dev** - Quick Add Pad (the "add from your most-ordered items" tiles on Order List) had been failing silently on every single request since it was introduced over a month ago - a raw SQL query referenced the wrong column names. Verified the fix directly against production data before shipping.
- **Admin** - Reviewing a stock request from the Order List page and from the Requests hub could show different (stale) pending counts for up to 30 seconds, since the two didn't share a cache-refresh signal.
- **Dev** - Removed unreachable StoreManager-only code paths in `DailyReports.tsx` and `Customers.tsx` left over from earlier permission changes.

---

## [1.3] - June 2026

### Added
- **Employee** - Full hot food menu management. Employees can now add, edit, and remove items from their store's hot food menu directly from the app. Each item supports a photo, category, price, estimated prep time, and description. Categories autocomplete from existing entries. Accessed via Hot Food Orders → Menu tab → **+ Add Item** or the pencil icon on any store item.
- **Employee** - Item availability toggling on hot food catalog items. Items assigned from the shared catalog can be marked Sold Out or Available per shift without needing admin involvement.
- **Manager** - Order list PDF printing with barcodes. The Print button on the active order list generates a formatted PDF grouped by status (Urgent / Needed / Ordered / Received) with product barcodes for any items matched in the store catalog. Two modes: Print Directly (native print dialog / AirPrint) or Share as PDF (email, WhatsApp, Files, etc.).
- **Employee, Manager** - Inventory notifications. Employees receive notifications when a manager acts on their item requests. Managers receive notifications when new requests arrive.
- **Customer** - Job openings / Careers. Customers can browse open positions posted by store admins and submit an application directly through the app. Accessible via the Careers section in the menu.

### Changed
- **Customer** - Hot food cart no longer accepts an order note. Payment and any special instructions are handled at the counter.
- **All roles** - App loading screen replaced with an animated Lucky Stop loader (was a static splash image).

### Fixed
- Employee item requests and manager order flows now use consistent terminology throughout the app.
- Careers screen: resolved a crash caused by a reference to a removed positions list.
- Inventory manager notifications: stock request status updates now correctly trigger push notifications.

---

## [1.2] - June 2026

### Added
- **Customer, Employee, Manager** - Language settings in Profile. Users can switch the app between **English** and **Español**. The chosen language is remembered across sessions. Accessible via Profile → Preferences → Language.
- **Customer** - Hot Food ordering from the customer app. Customers can browse the Hot Food menu, place orders, and receive push notifications when their order is ready. Accessible via the Hot Food tile on the home screen or the Hot Food tab in the menu.
- **Customer** - Featured Slideshow on the home screen. Rotating full-width promotional slides with category shortcuts (Hot Food, Deals, etc.) above the quick-action grid.
- **Employee** - Hot Food order management. Employees can view incoming hot food orders, mark them as in-progress or ready, and complete fulfilled orders. Accessible via Hot Food Orders in the menu.
- **Customer, Employee, Manager** - Notification bell with live unread badge on the home screen header for at-a-glance visibility without opening the drawer.
- **All roles** - Avatar photo shown in the app header on home and in the navigation drawer.

### Changed
- **Customer** - Tiered cashback rates now apply per tier (Bronze 5% → Platinum 9%) with a hard rate cap guard and tier fall-back logic at period reset.

### Fixed
- Manager home screen: category filter chips now correctly use the string values returned by the API (previously caused a `key` prop warning).
- Modal warning resolved: removed incompatible `presentationStyle="formSheet"` from the manager requests acknowledgement modal.

---

## [1.1] - May 2026

### Added
- **Customer, Employee, Manager** - In-app Help & Guide screens accessible from the Profile tab. Each role sees their own manual (Customer Guide, Employee Manual, Store Manager Manual) rendered inline without needing to leave the app.
- **Admin** - Documents tab in the admin portal. All legal documents, user manuals, and technical documentation are now readable and downloadable as PDF directly from the portal. Visibility is role-gated.
- **Customer** - 18+ age confirmation checkbox added to the welcome/registration screen. Required before account creation.
- **Customer** - 21+ location gate modal for stores with a minimum age requirement (e.g., liquor stores). Fires once when the customer's GPS detects a restricted store and is permanently stored on their account after confirmation.
- **Customer** - Delete My Account flow in the Profile screen. Wipes all personal data, anonymises transaction history for billing integrity.
- **Admin** - Business Docs section in the Documents tab (DEV_ADMIN only): Store Owner Pitch and Store Owner Overview documents.

### Changed
- **All roles** - Tobacco/Vapes removed as a product category from the app. Advertising for these products is handled in-store.

### Fixed
- Navbar document link added for all roles.

---

## [1.0] - May 2026 - Initial Launch

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
