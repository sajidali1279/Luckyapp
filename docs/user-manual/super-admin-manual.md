# Lucky Stop Platform - Super Administrator User Manual

**Role:** Super Admin (Lucky Stop HQ)
**Access Level:** All stores, all features (except billing management)
**Platform:** Web Admin Portal (admin.luckystop.cliffindus.com) + Mobile App
**Version:** 1.5 | Last Updated: August 23, 2026

---

## Table of Contents

1. [Your Role and Responsibilities](#1-your-role-and-responsibilities)
2. [Accessing the Platform](#2-accessing-the-platform)
3. [Dashboard - Overview](#3-dashboard--overview)
4. [Managing Stores](#4-managing-stores)
5. [Managing Staff Accounts](#5-managing-staff-accounts)
6. [Managing Customers](#6-managing-customers)
7. [Transactions - Viewing and Auditing](#7-transactions--viewing-and-auditing)
8. [Offers Management](#8-offers-management)
9. [Banners Management](#9-banners-management)
10. [Redemption Catalog Management](#10-redemption-catalog-management)
11. [Notifications - Broadcasting Messages](#11-notifications--broadcasting-messages)
12. [Leaderboard](#12-leaderboard)
13. [Careers - Job Applications](#13-careers--job-applications)
14. [Business Promotions](#14-business-promotions)
15. [Billing and Invoices](#15-billing-and-invoices)
16. [Cashback Rates](#16-cashback-rates)
17. [Inventory Analytics (Inventory Intelligence)](#17-inventory-analytics-inventory-intelligence)
18. [Activity Log (Audit Trail)](#18-activity-log-audit-trail)
19. [Support Tickets](#19-support-tickets)
20. [Important Notices](#20-important-notices)
21. [Requests Hub & Procurement](#21-requests-hub--procurement)
22. [Daily Reports](#22-daily-reports)
23. [Daily Tasks](#23-daily-tasks)
24. [Common Tasks - Quick Reference](#24-common-tasks--quick-reference)
25. [Troubleshooting](#25-troubleshooting)

---

## 1. Your Role and Responsibilities

As a **Super Administrator**, you are a Lucky Stop headquarters-level user with visibility and control across all participating store locations. Your responsibilities include:

- **Platform governance:** Ensuring all stores operate within Lucky Stop loyalty program standards.
- **Staff management:** Creating and managing employee and manager accounts for all stores.
- **Content management:** Overseeing platform-wide offers, banners, and the redemption catalog.
- **Customer oversight:** Reviewing customer accounts, managing disputes, and deactivating fraudulent accounts.
- **Analytics:** Monitoring transaction volumes, customer engagement, and store performance.
- **Compliance:** Reviewing the audit log and ensuring program integrity.

**What Super Admins cannot do:**
- Access DevAdmin billing management functions.
- Delete users permanently (DevAdmin only).
- Change the developer's platform cut rate.

---

## 2. Accessing the Platform

### 2.1 Web Admin Portal

1. Open a web browser and navigate to: **admin.luckystop.cliffindus.com**
2. Enter your registered phone number.
3. You will receive a One-Time Password (OTP) via SMS - enter it to log in.
4. Enter your 4-digit PIN.
5. You are now logged into the Admin Portal.

**Recommended browsers:** Chrome (latest), Firefox (latest), Safari (latest), Edge (latest).
**Recommended screen resolution:** 1280×720 or higher. The Admin Portal is designed for desktop use.

### 2.2 Mobile App Access

Super Admins also have access to the mobile app for on-the-go review. Download the Lucky Stop app from the App Store (iOS) or Google Play (Android) and log in with your phone number and PIN. The mobile app provides:
- Notification inbox.
- Profile management.
- Basic dashboard access.

Most administrative functions are only available through the web portal.

**Language settings:** The mobile app supports English and Español. To change your language: Profile → Preferences → Language → select your language → Save. The chosen language is remembered across sessions.

### 2.3 Session Security

- Your session will expire after a period of inactivity. You will be required to log in again.
- Do not share your PIN with anyone.
- Log out of the Admin Portal when using a shared or public computer.
- Enable biometric login on your mobile device for added convenience and security.

---

## 3. Dashboard - Overview

The Dashboard is the first screen you see after logging in. It provides a real-time snapshot of platform-wide activity.

### 3.1 What You See on the Dashboard

**Platform Summary Cards:**
- **Total Customers:** The number of registered customer accounts on the platform.
- **Total Transactions Today:** Number of qualifying purchases processed across all stores today.
- **Total Points Granted Today:** Total loyalty points awarded today.
- **Total Credits Redeemed Today:** Total dollar-equivalent credits redeemed in-store today.
- **Platform Revenue (Dev Cut):** Total developer cut earned from today's transactions.

**Store Performance Table:**
A table listing all active stores with:
- Store name and location.
- Transaction count (today, this week, this month).
- Points awarded and credits redeemed.
- Active customer count.

**Recent Transactions Feed:**
The most recent qualifying transactions across all stores, showing:
- Transaction timestamp.
- Store name.
- Customer identifier.
- Purchase amount.
- Points awarded.
- Status (Approved, Pending, Flagged).

### 3.2 Navigating the Dashboard

The sidebar navigation on the left side of the Admin Portal contains links to all major sections. The navigation includes:

| Section | What It Contains |
|---|---|
| **Overview** | Dashboard, Inventory Intelligence |
| **Transactions** | All transactions, filtering, review |
| **Customers** | Customer list, search, management, dispute review |
| **Staff** | Employee and manager accounts |
| **Stores** | Store locations and configuration |
| **Offers** | Promotional offer management |
| **Banners** | Promotional banner management |
| **Notices** | Pinned HQ announcements shown in store chat |
| **Catalog** | Redemption catalog management |
| **Promotions** | Business promotion requests |
| **Hot Food** | Hot food menu/order oversight (SuperAdmin only) |
| **Chat** | Store chat monitoring |
| **Scheduling** | Schedule overview |
| **Requests** | Unified hub - Alerts, Stock, Product requests |
| **Order List** | Store procurement order lists |
| **Scanned Products** | Chain-wide barcode → product catalog |
| **Careers** | Job applications |
| **Daily Reports** | Employee opening/closing shift reports |
| **Daily Tasks** | Configure shift task checklists |
| **Rates** | Tier and category cashback rates |
| **Leaderboard** | Rankings |
| **Activity Log** | Audit trail |
| **Billing** | Invoices (SuperAdmin view) |
| **Notifications** | Broadcast notifications |
| **Support** | Support ticket inbox |
| **Docs** | Legal documents, manuals, technical docs |
| **Profile** | Your account settings |

---

## 4. Managing Stores

### 4.1 Viewing All Stores

Navigate to **Stores** in the sidebar. You will see a list of all registered Lucky Stop locations with:
- Store name, address, city, state, and phone number.
- Active/inactive status.
- Billing type.
- Number of assigned staff.
- Current gas price.

### 4.2 Viewing a Store's Details

Click on any store name to view its full detail page, including:
- Complete address and contact information.
- Assigned employees and managers.
- Current gas and diesel prices.
- Enabled product categories.
- Recent transaction summary.

### 4.3 Editing a Store

To update store information:
1. Navigate to **Stores** → click the store name.
2. Click **Edit Store**.
3. Modify any fields (name, address, phone, active status).
4. Click **Save Changes**.

**Note:** Deactivating a store (setting it to inactive) will prevent transactions from being processed at that location but will not delete the store's data.

### 4.4 Store Gas Prices

Each store has its own configurable gas and diesel price, displayed to customers in the App. To update:
1. Navigate to **Stores** → click the store name.
2. Find the **Gas Prices** section.
3. Enter the current price per gallon for regular and diesel.
4. Click **Save Gas Prices**.

Gas prices are displayed to all App users and should be updated whenever fuel prices change at a location.

### 4.5 API Keys

Each store has a unique API key used for POS receipt QR code integration. Store API keys are managed by DevAdmin and are not visible to Super Admins.

---

## 5. Managing Staff Accounts

### 5.1 Viewing All Staff

Navigate to **Staff** in the sidebar. You will see a list of all employee and manager accounts across all stores, showing:
- Name.
- Phone number.
- Role (STORE_MANAGER or EMPLOYEE).
- Assigned stores.
- Account status (active/inactive).
- Date created.

### 5.2 Creating a New Staff Account

To add a new employee or manager to the platform:

1. Navigate to **Staff** → click **Add Staff Member**.
2. Fill in:
   - **Full Name:** Employee's name.
   - **Phone Number:** Their mobile number (must be unique).
   - **Role:** Employee or Store Manager.
   - **PIN:** Set an initial 4-digit PIN (employee should change this on first login).
   - **Store Assignment:** Select which store(s) this person is assigned to.
3. Click **Create Account**.
4. The employee can now log in with their phone number and the initial PIN, then change their PIN through the App.

**Best practice:** Communicate the initial PIN to the employee securely and ask them to change it upon first login.

### 5.3 Assigning an Employee to Additional Stores

A staff member can be assigned to multiple stores (common for managers who oversee multiple locations):

1. Navigate to **Staff** → click the staff member's name.
2. In the **Store Assignments** section, click **Add Store**.
3. Select the additional store from the dropdown.
4. Click **Save**.

### 5.4 Removing a Store Assignment

1. Navigate to **Staff** → click the staff member's name.
2. In **Store Assignments**, click the **×** next to the store to remove.
3. Confirm the removal.

### 5.5 Resetting a Staff Member's PIN

If an employee is locked out or forgets their PIN:

1. Navigate to **Staff** → click the staff member's name.
2. Click **Reset PIN**.
3. Enter a new temporary 4-digit PIN. Any four digits work.
4. Confirm and save.
5. Communicate the temporary PIN to the employee securely.

You can reset, deactivate and assign stores for store managers, employees and customers. Only a Dev Admin can change another Super Admin or a Dev Admin account, and nobody resets their own PIN this way: use **Profile** → **Change PIN**. The person is signed out everywhere when you reset their PIN and signs in again with the new one. A reset also clears any lockout.

### 5.6 Deactivating a Staff Account

When an employee leaves the company:

1. Navigate to **Staff** → click the staff member's name.
2. Click **Deactivate Account**.
3. Confirm the deactivation.

The account is immediately deactivated - the employee will not be able to log in. Their historical transaction records are preserved for audit purposes.

**Do this promptly when an employee is terminated.** Delays in deactivating accounts are a security risk.

### 5.7 Reactivating a Staff Account

If a previously deactivated staff member returns:

1. Navigate to **Staff** → click the staff member's name.
2. Click **Reactivate Account**.
3. Confirm reactivation.

---

## 6. Managing Customers

### 6.1 Viewing All Customers

Navigate to **Customers** in the sidebar. You will see a paginated list of all registered customer accounts with:
- Name.
- Phone number.
- Current tier.
- Points balance.
- Account status.
- Registration date.

Use the search bar to find a specific customer by name or phone number.

### 6.2 Viewing a Customer's Account

Click on a customer's name to see their full account detail:
- Profile photo (if uploaded).
- Phone number, email (if provided), tier, and points balance.
- Full transaction history.
- Redemption history.
- Account creation date and last activity.

### 6.3 Deactivating a Customer Account

To disable a customer account (for suspected fraud or at the customer's request):

1. Navigate to **Customers** → find the customer.
2. Click **Deactivate Account**.
3. The customer will no longer be able to log in or earn/redeem points.

### 6.4 Reactivating a Customer Account

1. Navigate to **Customers** → find the deactivated account.
2. Click **Reactivate Account**.

### 6.5 Resetting a Customer's PIN

If a customer is locked out and cannot use the phone OTP reset flow:

1. Navigate to **Customers** → find the customer.
2. Click **Reset PIN**.
3. Set a temporary PIN and communicate it securely to the customer.

### 6.6 Reviewing Customer Transactions

From a customer's detail page, you can see every transaction associated with their account, including the receipt image uploaded for each qualifying transaction. This is the primary tool for investigating customer disputes.

### 6.7 Reviewing Disputes

Customers can report missing or incorrect points two ways in the App: a generic "Report Missing Points" form, or (for a specific past purchase) a **Dispute This Transaction** button on that transaction's detail view - both land in the same queue here.

1. Navigate to **Customers** → click the **Disputes** tab. A count badge shows how many are pending.
2. Filter by **Store** and **Status** (Pending, Approved, Rejected).
3. Click a dispute to open it. If it was filed against a specific transaction, that transaction's details and receipt photo are shown inline - otherwise you're working from the customer's written description alone.
4. Click **Resolve**:
   - **Approve:** enter the points/credit amount to award, add an internal note, and confirm. Points are credited immediately.
   - **Reject:** add a note explaining why, and confirm. No points are credited.

A dispute tapped from a push notification scrolls to and highlights the matching row automatically.

---

## 7. Transactions - Viewing and Auditing

### 7.1 All Transactions

Navigate to **Transactions** in the sidebar. This shows all qualifying transactions across all stores with filters for:
- **Date range.**
- **Store.**
- **Status** (Approved, Pending, Flagged, Rejected).
- **Employee** (who processed the transaction).
- **Customer.**

### 7.2 Transaction Statuses

| Status | Meaning |
|---|---|
| **Approved** | Transaction processed and points credited. |
| **Pending** | Transaction initiated but not yet fully processed (rare). |
| **Flagged** | System flagged this transaction for potential issues - requires manager review. |
| **Rejected** | Transaction was rejected by a store manager. Points not credited. |

### 7.3 Reviewing a Transaction

Click on any transaction to view:
- Full transaction details (amount, category, points, cashback rate, employee).
- Receipt image.
- Transaction timestamp.
- Customer information.

### 7.4 Flagged Transactions

If a transaction is flagged (e.g., unusually high amount, suspicious pattern), it may appear in the Flagged Transactions view. Store managers can review and reject flagged transactions. As Super Admin, you have visibility into all flagged transactions across stores.

### 7.5 Exporting Transactions

The Transactions page provides export functionality. To export:
1. Apply filters for the desired date range and store(s).
2. Click **Export to CSV**.
3. The file will download to your browser.

---

## 8. Offers Management

Offers are what customers see in the App's Offers area. There are two kinds. **Promotions** raise a customer's cashback automatically. **Deals** show a price special ("2 for $5") and change no cashback. Super Admins and the Dev Admin post promotions. A Store Manager can post a Deal for their own store, but cannot post or change a cashback promotion.

### 8.1 Viewing Offers

Navigate to **Offers** in the sidebar. The **Promotions** and **Deals** tabs each show:
- **Live Now:** offers customers can see today.
- **Scheduled:** offers that are switched on but start on a later day. Each card says when it starts.
- **Past** (click "Past Promotions" or "Past Deals" to load them): offers that ended or were removed, kept so you can reuse them.

If nothing is live, the page says so: customers see no promotion until you post one.

### 8.2 Posting a Promotion

There are three ways, all ending in the same confirmation box:
- **Templates:** pick one and it fills the Full Form. Check the wording: a promotion applies to a whole category all day, so a template that mentions a brand, a time of day or a minimum purchase promises more than the system checks.
- **Quick Post:** choose a category, a bonus (a chip or your own number) and a length, then **Review & Post**. It goes to all stores.
- **Full Form:** choose the category first (**Store-wide** means every category), then the bonus (a percentage, optional per-tier percentages, or cents per gallon for Gas and Diesel), the start and end dates, **All Stores** or one store, an optional title, description and image, and the 21+ restriction.

Limits the page and the server both enforce: a bonus can be at most **10%** (cents per gallon at most **40**), because total cashback is capped at 10% of a sale; the end date must be on or after the start date and not already past.

Dates are store days in **Central time**, wherever you open the admin: a promotion starts at 12:00 AM on its first day and ends at 11:59 PM on its last. Quick Post lengths count days including today ("1 Week" is seven days).

### 8.3 The Confirmation Box

Before anything goes to customers the box shows: what it is, where (all stores or one), when (exact start and end, Central time), an example of what a customer earns, and:
- **A clash warning** if a live or scheduled promotion covers the same category at an overlapping time. Only one promotion applies to a sale, and the box says which one.
- **A ceiling note** if some tiers already reach the 10% cap at this size (they then earn 10% in total, less than the full bonus).
- That **every customer gets a notification** right away.

Nothing is sent until you click **Post now**. A second click while it is sending does nothing.

### 8.4 Which Promotion Applies to a Sale

Only one promotion applies to a sale. The rule, in order:
1. A promotion for the sale's category beats an all-category one.
2. A store's own promotion beats the chain-wide one.
3. The larger bonus for that sale wins (cents per gallon is compared by what it pays on that sale).
4. If they are still equal, the newer one wins.

Total cashback (tier rate + category rate + the promotion) never passes 10% of the sale.

### 8.5 Posting a Deal

1. Open the **Deals** tab and click **+ New Deal**.
2. Enter the item name and the **Deal Text** (at most 40 characters, e.g. "2 for $5"), the dates, where it applies, an optional image, category and 21+ restriction.
3. Click **Post Deal**, check the confirmation box and click **Post now**.

### 8.6 Removing and Changing an Offer

There is no edit. To end an offer, click **Remove**: it stops right away and moves to Past. To change one, remove it and post a new one, or use **Reuse** on the old one. A new post sends a new notification.

### 8.7 Reusing a Past Promotion

1. Open **Past Promotions** and click **Reuse** on the offer.
2. The form is filled exactly as before (the same percentage, per-tier rates and 21+ setting) with new dates: today and a month on. A per-tier promotion for Gas or Diesel comes back as its highest rate, because the form has no per-tier boxes for gas.
3. Adjust anything, then click **Create Offer** and confirm.

---

## 9. Banners Management

Banners are promotional images displayed at the top of the customer's home screen in a horizontal scrolling carousel.

### 9.1 Viewing Banners

Navigate to **Banners** in the sidebar. You see every active banner with its title, its store (or "All Stores") and an image preview, including banners made for a single store. If none is showing, the page says customers see none on Home.

### 9.2 Creating a New Banner

1. Navigate to **Banners** → click **+ New Banner**.
2. Fill in:
   - **Title:** Banner name (for your reference).
   - **Link:** (Optional) A web address starting with http:// or https://, shown as a Visit button when a customer taps the banner.
   - **Apply To:** All Stores or a specific Lucky Stop location.
   - **Banner Image:** Recommended dimensions: 1200×400px, JPG or PNG.
3. Click **Upload Banner**. A second click while it uploads does nothing.

### 9.3 Removing a Banner

1. Navigate to **Banners** → find the banner.
2. Click **Remove** and confirm. It disappears from the app right away; to show it again, upload it again.

---

## 10. Redemption Catalog Management

The Redemption Catalog is the collection of items customers can exchange their loyalty points for.

### 10.1 Viewing the Catalog

Navigate to **Catalog** in the sidebar. You will see all catalog items, active and inactive, with their points cost and availability status.

### 10.2 Adding a Catalog Item

1. Navigate to **Catalog** → click **Add Item**.
2. Fill in:
   - **Title:** Item name.
   - **Description:** Item details.
   - **Category:** The type of item (for filtering).
   - **Emoji:** An icon to display alongside the item.
   - **Points Cost:** The number of points required to redeem this item.
   - **Stock Limit:** (Optional) Maximum number of redemptions allowed. Leave blank for unlimited.
   - **Is Active:** Whether the item is immediately visible to customers.
   - **Sort Order:** Display order within the catalog.
3. Click **Save Item**.

### 10.3 Editing a Catalog Item

1. Navigate to **Catalog** → click the item name.
2. Click **Edit**.
3. Modify the desired fields.
4. Click **Save Changes**.

### 10.4 Deactivating a Catalog Item

1. Navigate to **Catalog** → click the item name.
2. Toggle the **Active** switch to off, or click **Deactivate**.
3. Deactivated items are hidden from customers but preserved in the system.

---

## 11. Notifications - Broadcasting Messages

### 11.1 Sending a Broadcast Notification

To send a push notification to customers or staff:

1. Navigate to **Notifications** in the sidebar.
2. Click **Send Broadcast**.
3. Configure the broadcast:
   - **Target Audience:**
     - **All Customers:** Every active customer on the platform.
     - **Store Customers:** Customers who have transacted at a specific store.
     - **All Staff:** All employees and store managers.
     - **Store Staff:** Staff assigned to a specific store.
   - **Store** (if store-specific): Select the applicable store.
   - **Title:** Notification title (shown in bold on the device).
   - **Body:** Notification message text.
4. Review the audience and message carefully.
5. Click **Send Broadcast**.

**This action cannot be undone.** Notifications are delivered immediately and cannot be recalled. Review all content carefully before sending.

### 11.2 Notification Best Practices

- Keep titles short (under 50 characters for full display on most devices).
- Keep the body informative and action-oriented.
- Test messages with a small audience (Store Staff) before broadcasting to all customers.
- Avoid sending multiple broadcasts on the same day - notification fatigue reduces engagement.

---

## 12. Leaderboard

### 12.1 Customer Leaderboard

Navigate to **Leaderboard** in the sidebar. The Customer Leaderboard shows the top loyalty customers ranked by:
- Total points earned within the current period.
- Tier level.

Use this for recognizing top customers or identifying highly engaged members for targeted promotions.

### 12.2 Employee Leaderboard

The Employee Leaderboard (available for each store) ranks employees by:
- Average customer rating.
- Number of rated transactions.

Use this to recognize top-performing staff.

---

## 13. Careers - Job Applications

### 13.1 Viewing Applications

Navigate to **Careers** in the sidebar. You will see all job applications submitted through the App, showing:
- Applicant name, phone, email.
- Position applied for.
- Store preference.
- Availability (full-time/part-time, shift preferences).
- Application status (New, Reviewed, Interview, Hired, Rejected).
- Date submitted.

A **badge** on the Careers navigation item indicates the number of new (unreviewed) applications.

### 13.2 Reviewing an Application

1. Click the applicant's name to open the full application.
2. Review all information, including experience and personal message.
3. Update the status using the **Status** dropdown:
   - **Reviewed:** You've read the application.
   - **Interview:** Scheduling an interview.
   - **Hired:** Position offered and accepted.
   - **Rejected:** Application not proceeding.
4. Add **Review Notes** for internal reference.
5. Click **Save**.

### 13.3 Following Up with Applicants

Contact applicants directly using the phone number or email provided in their application. The platform does not include built-in applicant communication tools.

---

## 14. Business Promotions

### 14.1 What Are Business Promotions?

Customers can submit requests to advertise their own business within the Lucky Stop App. These are reviewed by DevAdmin (not Super Admin) and, if approved, displayed in the App's Promotions feed.

As a Super Admin, you have visibility into the published promotions feed but do not manage the approval/rejection workflow. Contact DevAdmin with questions about specific promotion requests.

---

## 15. Billing and Invoices

### 15.1 Viewing Your Invoices

Navigate to **Billing** in the sidebar (Super Admin view, labeled "My Billing"). You will see:
- Your store subscription billing history.
- Monthly invoice summaries, expandable to a per-charge Store Breakdown table.
- Payment status for each period, and for each individual charge within it. A period with some charges paid and others still outstanding shows a partial "N/M Paid" badge rather than a flat Unpaid label, and the Outstanding Balance / Total Paid totals reflect each charge's own status.
- The reason typed in for any manual/custom charge, shown in a Reason column. A manual charge billed to the chain as a whole (not tied to one store) appears as "All Stores (Chain-wide)".

### 15.2 What Super Admins Can See

Super Admins can view their own billing history and invoice records. They cannot:
- Change billing plan types.
- Generate billing records.
- Access developer revenue data (DevAdmin only).

### 15.3 Questions About Billing

For billing questions or disputes, contact the Developer (DevAdmin) via the Support ticket system described in Section 19.

---

## 16. Cashback Rates

### 16.1 Viewing the rates

Navigate to **Cashback Rates** in the sidebar (Reports). The page shows:

**Tier table** - for Bronze, Silver, Gold, Diamond and Platinum: the cashback percentage earned on every purchase, an optional gas rate in cents per gallon, and the **points to reach the tier** in a half-year (100 points = $1 of cashback, so 5,000 points is $50.00). Under the table it says who last changed a rate and what they changed.

**Category bonus table** - a permanent extra percentage for a product category (for example Groceries +1%). The columns to the right show the total for each tier. A total over 7.5% is marked with a warning (those sales are held for a manager to review) and a total over 10% is marked as the most a sale can ever pay.

**Gas & Diesel Mode** - gas and diesel are paid either as a percent of the sale or as a flat number of cents per gallon for each tier. In cents-per-gallon mode Gold, Diamond and Platinum also get a fixed extra of 5, 7 and 10 cents a gallon (set in the system, not on this page, and not part of the platform fee). The table shows what a $40 fill pays each tier, extra included.

### 16.2 Changing a rate

1. Type the new number in the box (the row turns yellow) and click **Save**, or press Enter.
2. A box lists what will change and what it does to a $40 sale (for example "a Silver customer's $40 grocery sale pays $1.20 instead of $0.80"), and warns if some sales would be held for a manager.
3. Click **Save changes**. Several tiers saved together are saved all or nothing.

The page refuses a slip with a sentence before anything is saved: a tier's cashback can be at most 7.5%, a category bonus at most 5%, gas at most 25 cents a gallon, each tier must need more points than the one below it, and a tier plus a category bonus can never be more than 10%.

**Caution:** a change applies to the next sale. Sales that are already started keep their rate. It changes what the stores' customers earn, so coordinate with management first. Every change is written to the Activity Log with who, when, and the values before and after.

**The customer app does not follow this page.** It shows fixed numbers (1% to 5% cashback, 5,000 to 45,000 points to reach a tier, +5, +7 and +10 cents a gallon). If you change a tier's cashback or its points, tell customers, because the app will keep showing the old numbers until the app itself is updated.

**Switching gas to a percent** changes what every gas customer earns from the next sale, so it asks first and shows a $40 fill before and after. To go back you type the cents for each tier again.

### 16.3 Understanding How Rates Stack

The effective cashback rate on any transaction is:

> **Effective Rate = Tier Base Rate + Category Bonus Rate + Offer Bonus Rate**

Only one promotion applies to a sale, and the total is never more than 10% of the sale.

Example:
- Customer is Gold tier: Base rate = 3%
- Customer buys groceries with a +1% category bonus: 3% + 1% = 4%
- There is an active offer with +2% for groceries: 4% + 2% = 6%
- Total: Customer earns 6% on that grocery purchase.

For gas paid by the gallon the tier's cents per gallon replace the percent and the category bonus (the fixed Gold, Diamond and Platinum extra is added on top).

---

## 17. Inventory Analytics (Inventory Intelligence)

### 17.1 Accessing Inventory Intelligence

Navigate to **Overview** → **Inventory Intelligence** in the sidebar.

### 17.2 What It Shows

Inventory Intelligence provides analytics on ordering patterns across stores, including:

- **Top Ordered Items:** Most frequently appearing items on order lists across all stores.
- **Items by Category:** Breakdown of ordered items by product category.
- **Order Frequency:** How often specific items are ordered.
- **Store Comparison:** Which stores order which types of items most frequently.
- **Trend Data:** Changes in ordering patterns over time.

### 17.3 Filtering

Use the filters at the top of the page to focus on:
- **Specific store:** View inventory analytics for one location.
- **Time period:** This week, this month, last quarter, custom range.
- **Category:** Filter by product category.

### 17.4 Using Inventory Intelligence

This data is useful for:
- Identifying which products should potentially be added to the redemption catalog.
- Coordinating bulk purchasing across stores.
- Identifying stores with unusual ordering patterns.
- Understanding seasonal demand changes.

---

## 18. Activity Log (Audit Trail)

### 18.1 What Is the Activity Log?

The Activity Log is a permanent, immutable record of every significant action taken on the platform by any user. It is your primary tool for investigating incidents, audits, and compliance reviews.

### 18.2 Accessing the Activity Log

Navigate to **Activity Log** in the sidebar.

### 18.3 What Is Logged

Every significant action is recorded, including:
- Account creation, modification, deactivation.
- Transaction processing, rejection.
- Offer and banner creation, modification, deletion.
- Catalog changes.
- Redemption processing.
- Rate changes.
- Admin portal logins.
- Data exports.

Each log entry includes:
- **Timestamp:** Exact date and time of the action.
- **Actor:** Who performed the action (name, role).
- **Action:** What was done (e.g., CREATE_OFFER, REJECT_TRANSACTION).
- **Entity:** What was affected (offer, transaction, user, etc.).
- **Store:** Which store, if applicable.
- **Details:** Specific fields changed or data involved.

### 18.4 Filtering the Activity Log

Filter by:
- Date range.
- Actor (specific employee or admin).
- Action type.
- Store.
- Entity type.

### 18.5 Exporting the Audit Log

Click **Export to CSV** to download filtered audit log data for external review or compliance records.

---

## 19. Support Tickets

### 19.1 Contacting Developer Support

If you have a technical issue, billing question, or feature request, use the Support Ticket system to contact the DevAdmin (Developer).

### 19.2 Creating a Support Ticket

1. Navigate to **Support** in the sidebar.
2. Click **New Ticket**.
3. Enter:
   - **Subject:** Brief description of the issue.
   - **Message:** Detailed description of the problem, including any relevant transaction IDs, store names, or screenshots.
4. Click **Submit**.

### 19.3 Tracking Your Ticket

Your open and resolved tickets appear in the Support inbox. You will receive an in-app notification when the Developer responds. Click the ticket to view the conversation and reply.

### 19.4 Ticket Statuses

- **Open:** Awaiting response from Developer.
- **In Progress:** Developer is working on the issue.
- **Resolved:** Issue resolved and ticket closed.

---

## 20. Important Notices

Notices are pinned announcements shown at the top of every affected store's staff chat - for time-sensitive HQ messages (e.g. a health inspection, a system outage window) that shouldn't get lost in normal chat traffic.

### 20.1 Posting a Notice

1. Navigate to **Notices** in the sidebar.
2. Click **New Notice**.
3. Fill in:
   - **Title** (max 100 characters).
   - **Body** - the message text.
   - **Target:** All Stores, or a specific store.
   - **End Date:** when the notice stops showing (defaults to one week out).
4. Click **Post Notice**.

### 20.2 Managing Existing Notices

Each notice shows a status: **Active**, **Expired** (past its end date), or **Deactivated**. Click **Deactivate** to pull an active notice down early, or **Delete** to remove it permanently.

---

## 21. Requests Hub & Procurement

This is where store-level inventory operations - stock alerts, item requests, and order lists - are coordinated across the chain.

### 21.1 The Requests Hub

Navigate to **Requests** in the sidebar (badge shows total pending count). It has three tabs:

- **Alerts:** Low-stock alerts employees have flagged, and manager acknowledgements.
- **Stock:** Employee item requests awaiting a manager decision (Accept → added to the store's order list, or Deny).
- **Product:** Customer product requests forwarded from the App.

Select a store from the store picker at the top, or choose **All Stores** to see pending stock requests across every location at once (the All Stores view only applies to the Stock tab - Alerts and Product require a single store to be selected).

### 21.2 Order Lists

Navigate to **Order List** in the sidebar. Each store maintains one active procurement list at a time, with items marked Needed → Ordered → Received. As Super Admin you can view and manage any store's list.

- **Quick Add:** a searchable panel of that store's most-ordered items, for adding common items in one click.
- **Restore Items** *(DevAdmin only)*: on a closed list, pull any items that were never marked received onto that store's current open list.
- A banner at the top of the Order Lists tab flags any store with **no open list**, with a one-click button to open one.

### 21.3 Scanned Products

Navigate to **Scanned Products** in the sidebar. This is the chain-wide barcode → product name/category/brand catalog that gets built up automatically as managers scan items while building order lists on mobile.

- **Search** by product name.
- **+ Add Product** to seed or correct an entry manually (barcode, name, category, brand) without waiting for it to be scanned first - saving the same barcode again updates the existing entry rather than creating a duplicate.
- **Delete** to remove an incorrect entry; the next scan of that barcode will prompt for a fresh name.

### 21.4 Shelf/Price Labels

Navigate to **Labels** in the sidebar. This is a chain-wide catalog of printable shelf tags, shared across all stores, built up by DevAdmin, SuperAdmin, and Store Managers alike.

- **Add a label** by scanning a barcode (the product name autocompletes from the shared Scanned Products catalog) or typing one in manually. Set the regular price, an optional deal price, and a category.
- **Filter** by store, print status ("Ready to Print" vs. already printed), or category chips.
- **Search and select-all** to work through a batch quickly.
- **Print** generates a formatted PDF sized to a real 1in x 2-5/8in address-label sheet (Avery 5160), across 7 available templates including seasonal designs. Every print logs a PRINT_LABEL event to the Activity Log, recording who printed, which store, and how many labels.

---

## 22. Daily Reports

Navigate to **Daily Reports** in the sidebar to review the opening/closing shift reports employees submit from the mobile app (checklist completion, notes, any flagged issues). Use this to spot recurring problems at a specific store or shift.

---

## 23. Daily Tasks

Navigate to **Daily Tasks** in the sidebar to configure the checklist items employees see for opening and closing shifts.

1. Click **Add Task**.
2. Fill in **Shift** (Opening or Closing), **Title**, optional **Description** (step-by-step detail), and optionally restrict it to one **Store** (leave blank to apply chain-wide).
3. Click **Save**.

**Load Default Tasks** seeds a starter checklist for a store that has none configured yet. Edit or delete any task from the list view.

---

## 24. Common Tasks - Quick Reference

| Task | Where to Go | Steps |
|---|---|---|
| Add a new employee | Staff → Add Staff Member | Fill in details, assign store, set initial PIN |
| Deactivate a terminated employee | Staff → [Employee Name] → Deactivate | Confirm deactivation |
| Reset an employee's PIN | Staff → [Employee Name] → Reset PIN | Set new temporary PIN |
| Look up a customer | Customers → Search bar | Enter name or phone |
| Deactivate a fraudulent customer | Customers → [Customer] → Deactivate | Confirm |
| Resolve a customer dispute | Customers → Disputes tab → open dispute | Approve (credit points) or Reject, with a note |
| Create a new promotion offer | Offers → New Offer | Fill details, set dates |
| Post an HQ notice | Notices → New Notice | Fill in, set target and end date |
| Send a push notification to all customers | Notifications → Send Broadcast → All Customers | Write and send |
| Upload a new banner | Banners → New Banner | Upload image, set scope |
| Update a store's gas prices | Stores → [Store Name] → Gas Prices | Enter prices, save |
| Check a store's pending stock requests across all stores | Requests → Stock tab → All Stores | Review and accept/deny |
| Look up or correct a barcode's product info | Scanned Products → search or + Add Product | Search or fill in barcode/name/category/brand |
| Restore items from a closed order list (DevAdmin) | Order List → closed list → Restore Items | Select items, confirm |
| Add a shift checklist task | Daily Tasks → Add Task | Fill in shift, title, optional store |
| View a transaction's receipt | Transactions → [Transaction] | Receipt visible in detail view |
| Export transactions | Transactions → Export to CSV | Set filters, export |
| Check audit trail for an employee | Activity Log → Filter by actor | Filter and review |
| Submit a support ticket | Support → New Ticket | Describe issue |

---

## 25. Troubleshooting

**Problem: I can't log in to the Admin Portal.**
- Ensure you are using the correct URL: admin.luckystop.cliffindus.com
- Make sure you are entering the phone number associated with your Super Admin account (not a customer or employee number).
- Request a new OTP if the one you received has expired (OTPs are valid for a limited time).
- If your account has been locked (too many failed attempts), contact DevAdmin support.

**Problem: An employee says they can't log in to the mobile app.**
- Check that their account is active in the Staff section.
- Verify their phone number is correct.
- Reset their PIN if necessary.
- Ensure they have a stable internet connection.

**Problem: A customer says their points were not credited.**
- Look up the customer in Customers and review their recent transaction history.
- Check if the transaction was processed but flagged or rejected.
- Contact the relevant store manager to verify if the receipt was uploaded correctly.
- If the transaction is missing entirely, the employee may not have scanned the QR code correctly.
- If the customer already filed a dispute, resolve it from Customers → Disputes rather than manually adjusting their balance.

**Problem: An offer I created is not showing for customers.**
- Verify the offer start date has passed and the end date has not yet passed.
- Verify the offer is set to Active.
- If it's a store-specific offer, confirm the customer is shopping at that store.

**Problem: A store manager says they can't see their order list.**
- Confirm the store actually has an open order list - the Order Lists tab flags stores with none.
- Confirm the manager's account is still assigned to that store under Staff.

**Problem: The Activity Log shows an unauthorized action.**
- Identify the actor and when the action occurred.
- Check if the actor's account should still be active.
- Contact DevAdmin support immediately if you suspect unauthorized access.

**For all technical issues:** Submit a Support ticket through the Admin Portal or email sksajidali1279@gmail.com.
