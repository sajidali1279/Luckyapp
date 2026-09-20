# Lucky Stop - Platform Changelog

All notable changes to the Lucky Stop Loyalty Platform are documented here.  
Format: `[Version] - Release Date` followed by what changed and who it affects.

Audience indicators: **Customer** · **Employee** · **Manager** · **Admin** · **Dev**

---

## [Unreleased] - September 18, 2026

Labeling rework plus a Spanish and usability pass across the three mobile roles. Needs a new mobile build to reach phones. The admin and server fixes go live when they are deployed.

### Added
- **Manager, Employee** - Labels "My Prints" is now a personal cart, kept on the phone and separate for each store. Tap catalog items, scan barcodes, or make a label from a product the store already scanned, then print exactly what is in the cart in one go, with copies per label and store-only prices.
- **Manager** - Store switcher on Labels, and a product list ("Not here? Browse products without a label") that makes a label without rescanning.
- **Manager** - Order List multi-select: press and hold an item, or tap Select, to mark several items ordered or received, or to remove them. "Mark all ordered" and "Mark all received" shortcuts sit on the section headers. If some requests fail, the app says how many and keeps those items selected for a retry.
- **Manager** - Store Catalog: tap a product in Browse to fix its name or category. A category that is not approved yet is sent for approval as usual.
- **Customer, Employee, Manager** - Pull-to-refresh on the leaderboards, My Disputes, Careers, Request a Product, Daily Tasks, and Store Alerts.
- **Employee** - A Retry screen when the Staff Rankings, Store Alerts, or Hot Food lists fail to load, instead of an empty list.
- **Admin** - Dashboard: Revenue Overview can be switched between This month, Last month and All time. Live Cashback Rates is now a table of every tier and category that follows the same rules as a real grant: cents per gallon for gas and diesel, one promotion, and the 10% cap. Store Performance lists every store, including one with no sales, with the date of its last sale. Recent Transactions shows a status label instead of only a colored dot.
- **Admin** - Each Dashboard panel now has its own loading placeholder and, if a request fails, a message with Try Again instead of quietly disappearing.
- **Admin** - Dashboard Activity has a time range (Today, 7 days, 30 days, This month). Every number shows how it compares with the same stretch of the previous period, ending at the same point, so the morning is compared with last week's morning. Cards carry a 14-day trend line, there is a new Average Ticket card, and the chart draws the previous period as a dashed line. The chart can show sales, transactions or cashback.
- **Admin** - Dashboard "Needs your attention" is one list: pending and flagged transactions (with how long the oldest has waited), disputes, store, support, schedule, hot food and business requests, billing, job applications, chat, and labels, plus alerts nobody watched before: a store with no sale in over a day, stores paying out more cashback than expected, and promotions ending within two days. Alerts that can stay true for a while have a 7-day snooze. The sidebar badges and this list read the same counts.
- **Admin** - Dashboard Store Health: a tile for every store with today's sales against the same time last week, month to date, cashback as a share of sales, time of the last sale, and what needs a look. It switches to the monthly ranking table.
- **Admin** - Flagged and pending transactions can be approved or rejected straight from the Dashboard, with a confirmation that shows the amount, store and customer. Fraud flags are listed on each one.
- **Admin** - Dashboard Launch Tracker for the first weeks: how many customers signed up, how many claimed the welcome reward, how many had it handed over at a store, how many have made a first purchase and how many signed up two or more days ago and still have not, with a per-day chart and a store-by-store table that keeps a store with nothing yet on the list. It counts from launch day, Monday September 21, so older test accounts never appear, and phone numbers starting 111 to 555 (the team's test accounts) are left out. Before launch it shows a countdown. It can be hidden and stays hidden.
- **Dev** - Dev Admin now sees the day-to-day Operations view on the Dashboard as well, with an Operations / Business switch. Revenue, cashback health, activity charts and live rates are on the Business side.
- **Admin** - Offers: before a promotion or deal goes to customers, a box shows what it is, which stores, the exact start and end in Central time, an example of what customers earn, any live promotion it clashes with (only one promotion applies to a sale) and which tiers already reach the 10% ceiling, and says every customer is notified. Quick Post and the deal form ask too. Promotions that start later now show under "Scheduled"; the list is split into "Live Now" and "Scheduled" (a promotion made for next week used to be invisible until its first day).
- **Admin, Server** - Banners: the list shows every banner, including one made for a single store (it used to vanish, so it could not be removed). A banner link must be a web address and the order a whole number from 0 to 999.

### Changed
- **Customer, Employee, Manager** - Spanish translations for the Labels, scanner and Price Check screens, customer Home (offers, rewards, tier details, QR sheet, welcome bonus, local ads), the receipt scanner, Profile, the shared Retry screen, and the Daily Report and Daily Tasks menu entries. Screen-reader labels are translated as well.
- **Customer** - The Home header title now shrinks on narrow phones instead of pushing the bell and profile buttons off the screen.
- **Manager** - The manual no longer says that press-and-hold reorders Order List items (mobile has no drag reordering). Press-and-hold now starts selecting.
- **Admin** - "Pending reviews" and the attention banner on the Dashboard now count flagged transactions as well as pending ones, matching the Transactions badge in the sidebar. Labels that need printing are listed in the banner too.
- **Admin** - The Dashboard header is more compact and search and shortcuts share one row, so the numbers start higher on the screen. The Dashboard shows at most five attention items until you ask for more.
- **Admin** - Dashboard counts and chart axes show thousands separators, an offer of 1.5% shows as 1.5% instead of 2%, and "Ends" turns red only in the last two days. The stat cards and store rows can be reached and opened with the keyboard.
- **Admin** - Transactions opens on "Needs review": flagged sales first, then sales still waiting for a receipt, the same set the sidebar badge counts. Approve and Reject ask first with the customer, amount, reasons and what will happen, stay locked while sending, and show the server's own reason if a decision is refused. Times and default dates use the stores' Central time wherever the admin is opened. A rejected or pending sale no longer shows its cashback in green, the copy-ID control works from the keyboard, every control has a name, colours pass contrast, and the header and filters wrap on narrow windows.
- **Admin** - The Dashboard's inline Approve and Reject stay locked while sending, show the server's reason, and Approve is disabled until the receipt is uploaded.
- **Admin, Server** - The Transactions CSV export writes dates and times in Central time (the headings say so), names the file with the store date, and defuses text that a spreadsheet would read as a formula. The Customers export has the same guard and its Joined date is the Central date.
- **Admin, Server** - When two promotions cover the same sales only one applies, and the rule is now fixed: a promotion for the sale's category beats an all-category one, then a store's own beats the chain-wide one, then the larger bonus, then the newer one. Before, it depended on the order the database returned the rows, so the same $40 sale could earn $4.00 or $2.80. The receipt-QR path uses the same rule.
- **Admin, Server** - A bonus can be at most 10% (cents per gallon at most 40) because total cashback is capped at 10% of a sale: 50 typed for 5 is refused with a sentence instead of being posted. A promotion needs a bonus or deal text, the end must be after the start and not already passed, and a one-store promotion needs a real store.
- **Admin** - Dates on promotions and deals are store days in Central time: they start at 12:00 AM on the first day and end at 11:59 PM on the last, wherever the admin is opened. Before, a promotion picked for Sep 21 started at 7 pm on Sep 20 and its card showed the day before. Quick Post lengths count store days ("1 Week" is seven days, today included).
- **Admin** - Reuse fills the form exactly (1.5% stays 1.5%, per-tier rates and the 21+ restriction are kept, the old "Valid ..." sentence is dropped). Cards show 1.5% instead of 2%. Removed and ended offers are labelled differently and the remove box says the offer stays under Past.
- **Manager, Server** - Store managers can no longer post or change a cashback promotion (percentage, per-tier or cents per gallon): HQ sets those. A manager can still post and edit Deals for their store, and editing a promotion keeps its stored rate. The mobile Offers screen still shows the bonus box until the next build; the server answers with the reason.
- **Server** - A sale is no longer held for manager review only because a live promotion lifted its cashback above 7.5% (templates at +7% and +10% would have held every sale they touched). The 10% ceiling still applies, and a sale is still held when the tier or category rates alone are too high.
- **Admin, Server** - Billing months are now store months (Central time). A sale at 9 pm on the last day of the month belongs to that month's bill; before, the server cut months at UTC midnight and moved it into the next one. Bills are made only for finished months, and the monthly job now runs every hour (at :05 UTC) and once after every server start, skipping any store that already has its bill, so the September bills are made by the first run after midnight on October 1 in Texas even if the server was asleep.
- **Admin, Server** - Billing buttons never delete or overwrite. "Regenerate All" is now "Fill in missing bills" and only makes bills that do not exist. A paid bill never changes: a correction is a new extra charge. An unpaid usage bill can be recalculated one at a time, after a preview of what it would become, on the plan it was made with.
- **Admin, Server** - Paying is one bill or one month at a time, in a box that lists exactly what will be marked (each bill, the total), asks for the date and how it was paid, and takes a note. If the amounts changed since the page was opened nothing is marked. A payment can be undone with a reason; the old payment stays in the bill's history.
- **Admin, Server** - Every billing action (making bills, recalculating, paying, undoing, extra charges, a store's plan or fee, the billing report) now writes an Activity Log entry with who and when.
- **Admin, Server** - A store's fee is typed as a percent of the cashback (10, not 0.1), is capped at 25%, and shows on every plan. A change is confirmed with what will change and when it applies. The Platform Settings card is now "Default fee for new stores" (read only) and its text and the Billing Model note describe the real deal. The default fee is 10%.
- **Admin** - Super Admins can download the PDF of an invoice before paying it. The Billing page shows an error with Try Again when the bills fail to load, and the Fill in missing bills, Notify and payment boxes ask before anything is sent.

### Fixed
- **Employee** - In Spanish, the hot-food order timer showed "{{minutes}}" instead of the number. Eight other Spanish strings had the same kind of mismatch and were corrected.
- **Admin** - The SuperAdmin 30-day purchase chart drew only the latest 100 sales, so most of the month looked like $0. It now uses daily totals for the full 30 days.
- **Admin, Employee, Customer** - "Today" and "this month" (Dashboard, transaction date filters and exports, the Employee of the Month cut-off), the per-day fraud checks, the receipt daily limit and the free daily refill now reset at midnight Central time. They used to reset at 7 pm (6 pm in winter).
- **Admin, Employee** - A category with no saved cashback rate showed a 5% bonus in Rates and in the cashier's cashback preview, but earns nothing when points are granted. It now shows 0%.
- **Customer** - Delete My Account failed for any customer who had ever earned or spent credit, because the database refuses to remove an account that transaction records point to. It now works as the privacy policy describes: the customer's personal information is removed and the sign-in stops working at once, while the sale records stay, with no name attached, for the store's billing. The phone number can be used to sign up again. Deleted customers no longer appear in the admin Customers list, its CSV export, the 30-day new-customer count or the Top Customers leaderboard. No app update needed.
- **Admin** - On a phone the menu could not be opened. There is now a menu button on a top bar, and choosing a page closes the menu.
- **Admin** - One page receiving a reply it did not expect used to blank the whole admin, sidebar included. That page now shows "This page ran into a problem" with Try again, Go to the Dashboard and Copy details, and everything else keeps working.
- **Admin** - Dashboard search results were hidden behind the panels below the search box. They can now be clicked, and the box has a name, closes with Escape, and moves through the results with the arrow keys.
- **Admin** - Analytics: the Revenue Breakdown chart showed $NaN and is replaced by "Cashback and Your Cut". Today's unfinished day is shaded instead of looking like a sales crash. Ranges are counted in Central time and cover exactly 7, 30 and 90 days (the page used to ask for tomorrow after 7 pm and included one extra day), and the Dashboard's Business tab now uses the same 30 days. Every store is listed even with no sales, an empty range says so, the charts stay on screen while a new range loads, and each chart has a text description. Custom range asks for dates, checks them, and says what is wrong. "Points Awarded" is now "Cashback Awarded".
- **Admin, Server** - An invalid Analytics date is now a clear error instead of a server error or a date that quietly rolls into the next month, and seeded test sales are left out of Analytics.
- **Admin** - The "Seed Test Data" button on Billing is hidden on the live site. One click on it filled the real database with fake sales and gave every real customer fake cashback.
- **Admin** - Signing out empties the data the page had loaded, so the next person to sign in on the same tab never sees the previous session's numbers. An expired session now says so on the sign-in page.
- **Admin** - Every page has its own browser tab title, an address that does not exist shows "Page not found", there is a "Skip to the page content" link, the logo is a real link, and screen readers hear what a sidebar count means. Low-contrast text was fixed in the sidebar, the Approve button, store badges, and the red used for offers and alerts.
- **Admin, Manager, Employee, Customer** - A login lock that has run out now starts a fresh set of tries. Before, one wrong PIN after the lock ended locked the account again for another 15 minutes. Resetting a PIN, by an admin or with the phone code, also clears the lock.
- **Admin, Server** - Two people, or a double click, approving the same flagged sale could credit the customer twice, and a receipt upload landing just after an admin rejected a pending sale could credit a rejected sale. Every decision now only takes effect if the sale is still in the state it was seen in; the second one is told it was already handled.
- **Admin, Server** - A flagged sale could be approved before any receipt was uploaded. Approval now needs the receipt, and the Approve button says it is waiting for it.
- **Admin** - On laptop-sized screens (1366 px and narrower) a page with a wide table scrolled sideways as a whole, header and filters included. The table now scrolls inside its own box (Transactions and Rates showed it).
- **Server** - Odd values on the transactions list and export (a letter for the page, an impossible date, an unknown status or category) are a clear error instead of a server error, and one sale with unreadable flag text no longer breaks the list.
- **Admin, Server** - A Super Admin could reset the PIN of a Dev Admin, or of another Super Admin, and sign in as them, and could also deactivate them. Account actions (reset PIN, deactivate, delete, store assignments) now only work on accounts below your own role; a Dev Admin can act on any account but their own. Refusals say why and are written to the Activity Log.
- **Admin, Server** - A Super Admin could reset their own PIN without knowing the current one, which would let a stolen session take the account over for good. Use Profile, Change PIN instead. The staff list also no longer sends Dev Admin accounts (names and phone numbers) to Super Admins, and the Staff page hides buttons you cannot use and shows the server's reason when one is refused.
- **Customer, Employee, Manager, Admin** - Sign-up, sign-in and every other request were rate-limited by Cloudflare's address instead of the person's, so everyone in the region shared one small set of limits (10 sign-ups an hour, 10 sign-ins per 15 minutes, in total). Limits now count each person's own connection and are sized for a store's shared Wi-Fi.
- **Customer** - Signing up stores the number Firebase verified. Before, the same person could open a second account by adding a leading 1, or register a one-digit "phone".
- **Server** - Change PIN now counts wrong current-PIN tries against the same five-tries lock as sign-in, so a stolen session cannot be used to guess the PIN. Session tokens must be signed with the expected algorithm and carry an account id, so the 10-minute PIN-reset token can never pass as a login token.
- **Admin, Server** - Creating a staff or Super Admin account stores the phone as ten digits and limits names to 80 characters; creating a Super Admin is now written to the Activity Log, and the Activity Log has labels for the new events.
- **Customer, Employee, Manager, Admin** - Any four-digit PIN is now accepted when you sign up, change your PIN, reset it with Forgot PIN, or when an admin sets one. The old "too common" refusal of PINs like 1234 is gone, because it made people try many PINs before one was accepted. You still cannot reuse one of your last three PINs.
- **Admin** - A form the server refused (deal text too long, a bonus too big, a bad phone number) no longer replaces the page with "This page ran into a problem": the reasons come back as one sentence, on every page that shows the server's message.
- **Admin, Server** - Per-tier promotions made from the Offers form were always refused by the server ("Expected object, received string"). They are accepted now.
- **Server** - A cents-per-gallon promotion is stored as cents only. It used to carry a percentage too, which paid that many percent of the sale when the gallons were not known (a $150 diesel sale earned $15.00 instead of $5.93).
- **Admin** - A fast double click on Post now or Upload Banner sends one offer or banner, not two, so customers are notified once. A refused post keeps what was typed (a refused deal was cleared).
- **Admin** - Offers and Banners: every box has a name for screen readers, headings are in order, red and green colours meet contrast, and the pages no longer scroll sideways on a phone.
- **Customer, Employee, Manager, Admin** - Repeated wrong PINs now lock the account for longer each time (15 minutes, then 1 hour, then 4 hours), and the message points to Forgot PIN, which unlocks it at once. A good sign-in starts the count over. Before, every lockout was 15 minutes, which allowed about 480 guesses a day at a four-digit PIN.
- **Customer, Employee, Manager, Admin** - Resetting a PIN, with Forgot PIN or by an admin, signs out every earlier session of that account, so a lost phone's session stops working. The person signs in again with the new PIN.
- **Customer, Employee, Manager, Admin** - A Forgot PIN reset code now works only once: it stops working as soon as the PIN changes.
- **Admin, Server** - A one-time extra charge in a month no longer stops that store's usage bill from being made (both "Generate" and the monthly job skipped any store that already had any record for the month), and "Regenerate All" no longer deletes an extra charge and replaces it with a duplicate usage bill.
- **Server** - A bill that was already paid could change amount when bills were regenerated (a late-approved sale or a plan change rewrote it while it still showed paid). Paid bills are now frozen.
- **Server** - Sales flagged as test data no longer count in bills, the revenue totals, the store 30 and 90 day totals or the cashback health. The seed-test-data route is switched off unless the server owner sets ALLOW_SEED_TEST_DATA.
- **Admin, Server** - The billing routes now check their input: an extra charge needs a positive amount, a real month (YYYY-MM) and a description; a store must exist; a fee cannot pass 25%; a payment date cannot be in the future.

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
