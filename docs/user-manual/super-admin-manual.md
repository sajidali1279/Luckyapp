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

Navigate to **Stores** in the sidebar. Each store is a card showing:
- Name, city and state, and whether it is inactive.
- Address, phone number (written as (580) 924-9898), today's opening hours ("Hours not set" in red until you set them) and its coordinates ("Located" or "No coords").
- The product categories it offers.
- Its **gas and diesel prices**, each with how old it is: "Updated today", "Updated 3 days ago", or "Never set". A price more than two days old is red.
- A **21+ Required** badge for an age-restricted store, and a count of pending customer disputes.

### 4.2 Gas and Diesel Prices

Each store has its own gas and diesel price, shown to customers in the app. On the store's card:
1. Type the new price in the **Gas** or **Diesel** box (dollars per gallon, up to three decimals, such as 3.499). Changing one box leaves the other as it is.
2. Click **Update**. Only the price that really changed is sent, and the store's staff are told to update the pumps. A price that is already saved changes nothing.
3. A move of more than 15%, or a price under $1, opens a box first with the old and new price and the change ("Gas from $3.399 to $4.499 (+32%)"). Check it, then **Change prices**. Prices below $0.50 or above $20 are refused.

If two people change the same price at the same moment, one wins and the other is told someone changed it a moment ago. Every change is in the Activity Log with the old and new price.

### 4.3 Editing a Store

1. On the store's card click **Edit Store**.
2. Change the details. The page checks them as you save: the state is its two-letter code (TX), the ZIP code is five digits, the phone is a full ten-digit number (or empty, which clears it), and the latitude and longitude go together and must be in the United States (a longitude without its minus sign, or a swapped pair, is refused; a pair outside Texas and Oklahoma gets a note). **Auto-fill from Address** looks the coordinates up.
3. Choose which product categories the store offers (empty means all) and whether it needs the 21+ confirmation.
4. Click **Save Changes**. Every change is written to the Activity Log.

The app finds the nearest store from the coordinates, so check them.

### 4.4 Store Hours and Holidays

Click **Store Hours** on the card. To fill the week in one go, set the opening and closing time and click **Same every day**, or **Open 24 hours every day**, or set Monday and click **Copy Monday to all days**; then change any single day (**Closed**, **24 Hours**, or its own times) and **Save Weekly Hours**. A day that is open needs both times, and opening and closing at the same time is refused. Under it you can add a **date override** (closed on Thanksgiving, shorter hours on Christmas Eve) with a real calendar date and a name.

### 4.5 POS Keyword Mappings

**POS Mappings** on the card maps words on a POS receipt line to a category (used by the receipt system). A keyword needs at least three characters, because it matches part of a receipt line. Additions and removals are recorded.

### 4.6 Deactivating a Store (Dev Admin only)

**Deactivate** is available to a Dev Admin only, on the page and on the server. A deactivated store disappears from the customer app, and **sales, redemptions, tier-benefit claims and catalog redemptions can no longer be recorded there** (the person at the till is told the store is closed). Staff keep their accounts and all data stays. **Reactivate** brings it back.

### 4.7 API Keys

Each store has a unique API key used for POS receipt QR code integration. Store API keys are managed by Dev Admin and are not visible to Super Admins. Regenerating a key is recorded in the Activity Log (never the key itself) and stops the printer agent that used the old one.

---

## 5. Managing Staff Accounts

### 5.1 Viewing All Staff

Navigate to **Staff** in the sidebar. The accounts are grouped by role (Dev Admin, Super Admin, Store Manager, Employee), one card each, showing:
- Name and phone number, written the way you read it: (940) 555-1212.
- Role, and **Deactivated** in words when the account is switched off.
- Assigned stores. A store that has closed says "(closed)". A Super Admin or a manager with chain-wide access shows "All stores"; an employee or manager with no store shows **No store assigned**, which needs fixing.

The search box finds a person by name, phone number (typed any way: with brackets, dashes or the country code 1), store name or role.

### 5.2 Creating a New Staff Account

1. Navigate to **Staff** and click **+ New Account**.
2. Choose the account type, then fill in:
   - **Full Name.**
   - **Phone Number:** their mobile number. You can paste it with the country code, "+1 (281) 555-0100" becomes (281) 555-0100.
   - **4-Digit PIN**, typed twice (tick **Show the PIN while I type it** to see it). Any four digits work.
   - **Assign to Store** (not for a Super Admin). A closed store is marked and cannot be picked.
3. Click **Create Account**.
4. A card follows with the name, phone number, PIN and store. The PIN is shown there once and is not saved anywhere you can read it later, so give it to the person then. **Create another** starts a fresh form.

The account and its store are made together: if something goes wrong nothing is left behind, and you can try again. If the phone number already belongs to someone the page says whose: a customer account (the person can delete it in the app under Profile, Delete My Account, to free the number, or you use another number) or a staff member (it names them, and says if they are deactivated).

**Best practice:** give the PIN to the person securely and ask them to change it after signing in.

### 5.3 Changing a Person's Stores

A store manager or employee can work at several stores.

1. On the person's card click **Stores**.
2. Tick every store they work at. **Select All** skips closed stores; a closed store they already have can stay or be un-ticked, but nobody can be newly given one.
3. The box says what will change ("Adds Lucky Stop #5. Removes Lucky Stop #4.") and **Save Changes** sends the whole list as one save: it either all happens or none of it does. At least one store must stay.

### 5.4 Resetting a Staff Member's PIN

If an employee is locked out or forgets their PIN:

1. On the person's card click **Reset PIN**.
2. Type the new 4-digit PIN twice (any four digits work).
3. Click **Reset PIN**, then give them the new PIN securely.

You can reset, deactivate and assign stores for store managers, employees and customers. Only a Dev Admin can change another Super Admin or a Dev Admin account, and nobody resets their own PIN this way: use **Profile** then **Change PIN**. The person is signed out everywhere when you reset their PIN and signs in again with the new one. A reset also clears any lockout.

### 5.5 Deactivating a Staff Account

When an employee leaves the company:

1. On the person's card click **Deactivate**.
2. Read the question and click **Deactivate**. It says what happens: they are signed out on their next request, cannot sign in until you reactivate them, and stop getting store alerts. Everything they did stays on record.

Clicking twice, or two admins at once, cannot switch the person back on: the page asks for a state ("deactivated") rather than "flip it".

**Do this promptly when an employee leaves.** Delays in deactivating accounts are a security risk. The last active Dev Admin cannot be deactivated.

### 5.6 Reactivating a Staff Account

If a previously deactivated staff member returns, click **Reactivate** on their card. There is no question; the message says they can sign in again.

### 5.7 Deleting an Account (Dev Admin only)

**Delete** is for an account made by mistake. Deleting someone who has sold or handled anything would erase the sales that customers were credited for and that stores are billed on, so the page checks first:

- **The account has work on record** (sales, redemptions, ratings, daily reports, item requests, order lists, label prints, notices or job postings): the box says so with the biggest counts ("Maria has work on record (240 sales, 4 daily reports and 16 item requests), so the account can only be deactivated") and offers **Deactivate instead**. Nothing is deleted.
- **Nothing is on record:** the box says deleting removes only the sign-in, and **Yes, delete** removes it. This cannot be undone.

A customer is never erased: Delete removes their name, phone number and personal details and keeps their sales so balances, bills and reports keep adding up (the same as Delete My Account in the app). Every delete, and every refusal, is written to the Activity Log. The last active Dev Admin cannot be deleted.

---

## 6. Managing Customers

### 6.1 Viewing All Customers

Navigate to **Customers** in the sidebar. The header counts every customer (not only the page you are on): **Total**, **Active**, **Restricted** and the **Credits Out** (unspent credit). Each customer is a card, 50 to a page, showing:
- Name and phone number, written as (940) 290-2772.
- The **credit balance**, the number of approved **transactions**, the **total spent** and the **joined** date (a store date in Central time, with the year).
- **Restricted** in words for a restricted account, followed by the reason you gave.

The search box finds a customer by part of a name (any case, spaces around it do not matter) or by phone number written any way: with brackets, dashes, spaces, "+1" or a leading 1. A search that finds nobody says so. **Export CSV** downloads the customers that match the search.

### 6.2 Restricting a Customer Account

To block an account (for suspected fraud or at the customer's request):

1. Find the customer and click **Restrict Account**.
2. A box says what restricting does (they cannot sign in or earn points; their balance and history stay). Type a **reason** if you want one: it is shown on their card and in the CSV.
3. Click **Restrict**.

The page asks for the state "restricted", so a double click, or two admins acting at once, cannot switch the account back on. Every restriction is in the Activity Log.

### 6.3 Restoring a Customer Account

Find the restricted customer and click **Restore Account**, then **Restore** in the box. The reason on the card is cleared.

### 6.4 Deleting a Customer Account (Dev Admin only)

**Delete Account** removes the customer's name, phone number and personal details and frees the number to sign up again (the same as **Delete My Account** in the app). Their sales are **not** erased, so balances, store bills, analytics and the leaderboards keep adding up. Unspent credit is forfeited.

The box says how many of their sales stay, and asks you to type the last four digits of the customer's phone number to confirm. This cannot be undone. Every delete is in the Activity Log.

### 6.5 A Customer's PIN

There is no PIN reset on the Customers page. A customer who forgets their PIN uses **Forgot PIN** in the app (a code sent by text message), which also clears a lockout.

### 6.6 Reviewing Disputes

Customers can report missing or incorrect points two ways in the App: a generic "Report Missing Points" form, or (for a specific past purchase) a **Dispute This Transaction** button on that transaction's detail view - both land in the same queue here. A store manager sees the reports for their store in the mobile app and can decide them there too; both use the same rules.

1. Navigate to **Customers** and click the **Disputes** tab. The tab shows how many reports are pending, whatever filter is on.
2. Filter by **Store** and **Status** (Pending, Approved, Rejected). A list cut at its limit says how many reports there are in all.
3. Click **Review** on a report. It shows the customer, what they wrote, the store and date, what they say the purchase was, and, if it was filed against a specific transaction, that transaction and its receipt photo.
4. Decide:
   - **Approve and credit $X:** type the credit to award, from $0.01 to $50 (dollars and cents). The button says the outcome ("Approve and credit $2.50") and stays off until the amount is valid. Add a note to the customer if you like. The credit is added at once and the customer is notified.
   - **Reject:** add a note explaining why. Nothing is credited and the customer is told.

A report is decided **once**. If someone else (another admin, or the store manager on their phone) decided it a moment earlier, the box says so ("Someone already decided this report: it was approved for $2.50. Nothing was changed.") and nothing is credited twice. Every decision is written to the Activity Log with who, how much and the note. A report from a customer who has since deleted their account can only be rejected.

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
- **Who is notified, and when:** customers hear about a promotion when it **starts**. One that starts today goes out right away; one that starts later goes out on its first day (an hourly job sends it, once). A promotion for **one store** goes to that store's customers (an approved purchase there in the last 6 months), not to everyone; a chain-wide promotion goes to every active customer.

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

There is no edit. To end an offer, click **Remove**: it stops right away and moves to Past. To change one, remove it and post a new one, or use **Reuse** on the old one. A new post sends a new notification when it starts.

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

### 11.1 Sending a Push Notification

To send a push notification to customers or staff:

1. Navigate to **Notifications** in the sidebar and open the **Send Push** tab.
2. Choose **Who gets this?**:
   - **All customers:** every active customer. Restricted and deleted customers are never included.
   - **Customers of one store:** customers with an approved purchase at that store in the last 6 months.
   - **All staff:** every active employee and store manager. Deactivated staff are never included.
   - **Staff at one store:** the active staff assigned to that store, and managers with chain-wide access.
   - For a store audience, choose the **Store** (closed stores are not offered).
3. A line under the audience says who the message would reach, in **people and phones**: for example "This reaches 13 customers. 9 of them have the app signed in on a phone (12 phones in all); the other 4 will only see it in the app's inbox." Everyone in the audience gets the message in the app's inbox; only people with the app signed in on a phone also get the push.
4. Write the **Title** (65 characters at most) and the **Message** (200 at most; the server enforces the same limits).
5. Click **Send me a test first**. The message goes to your own phone only, with "[Test]" in front, and is not recorded as a send. It needs you to be signed in to the Lucky Stop app on a phone.
6. Click **Review and send...**. A box shows who it goes to and the exact message. Click **Send to N customers** to send it.

**This action cannot be undone.** A message cannot be recalled once sent. The page asks first, and it sends once even if you click twice.

After a send, a panel says what happened: "Sent to 13 customers. 12 phones reached." If some phones failed it says so ("9 phones reached, 3 failed") and tells you **not** to send it again, because it already reached the others. The push service is asked to send again once for a batch that fails, and a phone it reports as no longer having the app is taken off the list. The same message to the same audience cannot be sent again within five minutes (a second click, or a colleague doing the same), and the page says when it went out.

The **Sent recently** list under the form shows the last sends: when, who, the audience, the title and message, and how many people and phones. Every send is also an Activity Log entry ("Push Sent").

### 11.2 Automatic Messages and Alerts to HQ

**Gas price changes.** When a store's gas or diesel price really changes, the store's staff are told to update the pumps, and the **customers of that store** (an approved purchase there in the last 6 months) get one line in the app's inbox. A new price replaces the unread old line for that store, so nothing piles up. Saving a price that is already saved sends nothing.

**The alert list** (the Notifications page) now includes **sales held for review**, one card each (red for $500 or more), and its cards keep their identity from day to day: the rejected-sales card only comes back as new when its number changes. The invoice alert counts stores, not bills. Disputes (missing-points reports) and Requests (store alerts, product and stock requests) each have their own tab now, instead of only showing inside **All**.

**Email to HQ.** So that nothing waits for someone to open the admin, an email goes to every active Super Admin and Dev Admin who has an email address on their account (and to the address in the server's ADMIN_EMAIL setting) when:
- a sale of **$500 or more** is held for review,
- a customer sends a **missing-points report**,
- a store raises a **high-priority alert**.
Each email says what happened and has a button into the right page. A **morning summary** email (one a day, after 8 am Central) lists what is waiting: sales held, missing-points reports, store alerts, requests and unpaid bills. It is not sent when nothing is waiting, and a server that slept through 8 am sends it on its first run after.

### 11.3 Notification Best Practices

- Keep titles short (under 50 characters for full display on most devices).
- Keep the body informative and action-oriented.
- Always send yourself a test first, on an iPhone as well as an Android phone if you can.
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
- The percent shown under the **Platform Fee** total ("10.0% of cashback") is now the real rate on the real platform fee only. A month that also carries an extra (one-off) charge shows that charge on its own line ("+ $500.00 (1 extra charge)") instead of folding it into the fee and the percent (a $500 charge next to a real $60 fee used to read "93.3% of cashback").
- An **invoice's lines now add up to its total**: each category or transaction line shows only the platform fee for that slice, never the fee plus the customer's cashback (the store never pays Lucky Stop the cashback; it pays the customer, through the app). The combined (all-stores) invoice keeps Platform Fee, Extra Charges and Cashback Covered as three separate cards and columns, for the same reason.
- The **billing period and issue date print on the store calendar** (Central time), wherever you open the admin, and the issue date is fixed to the day the bill was made, not "today."

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
- **A price is dollars and cents:** from 0.01 to 999.99 with at most two decimals. A "$" you type is dropped (the label draws its own), and "3.9" is saved as 3.90. The price boxes say so and stay off until the price is one.
- **Editing an item** shows a box first: what changes (for a price, before and after and the percentage, with a warning when it is more than 50%), how many stores use the chain price and will be told to reprint, and how many keep their own price. Changing anything else on the item tells all stores to reprint it. The Activity Log keeps the before and after.
- **Who may change what:** only a Super Admin or Dev Admin can change an item's chain-wide price or remove an item. A store manager can change its name, barcode, category, deal and design. A cashier can add items and set their own store's price, nothing more. A refused change gives a sentence and is recorded in the Activity Log.
- **One barcode belongs to one item.** Adding or editing an item with a barcode another item already has is refused, naming that item. **Duplicate** starts with the barcode empty.
- **Removing an item** asks first and says how many stores hold it and what goes with it (print records, store prices, sale prices). It cannot be undone, and the Activity Log keeps what it was.
- **Search and select-all** to work through a batch quickly.
- **Printing, on the By Store tab, asks "Did the labels print?"** after the print window opens. The label stays in that store's queue until you say yes; a cancelled print, a jam or a closed window leaves it queued instead of quietly disappearing. If the price changed at the moment of printing, that label is not marked and the box says which one and why.
- **A store's own price ("sale price")** is set from By Store: **Set Price** for one item, or type it right in the print tray for a one-off (the tray price only changes what is on the paper; it does not become the store's price unless you press **Save as this store's price**). An **end date** is optional — the price goes back to the base price by itself at the end of that day (Texas time), and correcting the price (say $1.99 to $1.79) keeps that end date rather than clearing it. A sale that has ended is treated as over the moment you look at it, not just after the next cleanup run.
- **Coverage's "Push to All"** asks first, names every store it will add to and what each gets, and warns when the item has no price yet. A label added this way and never printed at a store can be taken back out with **Remove** (on that store's row in By Store, or on its chip in Coverage) — this only works before the label has ever printed there; once printed, it stays on record.
- **Barcodes on the printed sheet are drawn by the admin itself**, not fetched from an outside website, so a store's network cannot block them.
- **Print for All Stores (Coverage)** is one combined print job, but each store's sheets are preceded by a heading page with that store's name and how many labels follow, so the stack can be split apart correctly afterward.
- **Every checkbox, list and store picker on this page has a name a screen reader can read**, and the amber "needs attention" text and table headers read at a clear contrast.
- Every print logs a `PRINT_LABEL` event to the Activity Log, recording who printed, which store, and how many labels.

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
| Add a new employee | Staff → + New Account | Fill in details, assign store, set the PIN twice |
| Deactivate a terminated employee | Staff → [Employee card] → Deactivate | Read the question, confirm |
| Reset an employee's PIN | Staff → [Employee card] → Reset PIN | Type the new PIN twice |
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
