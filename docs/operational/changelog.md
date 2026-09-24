# Lucky Stop - Platform Changelog

All notable changes to the Lucky Stop Loyalty Platform are documented here.  
Format: `[Version] - Release Date` followed by what changed and who it affects.

Audience indicators: **Customer** · **Employee** · **Manager** · **Admin** · **Dev**

---

## [Unreleased] - September 18, 2026

Labeling rework plus a Spanish and usability pass across the three mobile roles. Needs a new mobile build to reach phones. The admin and server fixes go live when they are deployed.

### Added
- **Customer, Server** - The app's tier card and rewards page now read live cashback percentages, gas bonus cents and point thresholds from the server, instead of fixed numbers written into the app - a rate change on the admin Rates page now reaches customers the next time they open the tier card, not only after a new app version. The cashier's on-screen earnings estimate no longer rounds a fractional rate before doing the math (only matters once a tier's rate is not a clean whole percent; today's rates all are).
- **Customer, Employee, Manager, Server** - Signing out now tells the server to stop sending that phone push notifications for the account you just left, instead of only clearing the sign-in on the phone itself.
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
- **Admin** - A top bar on every page: the real page title, and a Search button that opens a Ctrl/Cmd+K command palette from anywhere in the admin, not only the Dashboard. Typing a customer's or staff member's name or phone jumps straight to their record, already searched down and highlighted; typing a page name jumps to that page; an empty box lists pages by group plus your five most recently opened, under "Recent". The bell is now reachable from every page (not only the Dashboard), reads the same counts the sidebar badges use, says in words how many things need attention, and lists them by name with a link to each. A refresh button re-runs whatever the current page has open and the bar says how long ago it last updated ("Updated 2m ago").
- **Admin, Server** - Pin a page from the command palette (highlight it, press Shift+Enter) to keep it at the top of the sidebar, in its own "Pinned" group, no matter which page you are on; up to 8 at once, unpin the same way or with a small control next to it in the sidebar. The sidebar also now shows a short "Recent" list of pages just opened through Search. Loading a page now asks the server for its sidebar and bell counts in a single request instead of 13 separate ones (14 requests measured on a near-empty page, now 2). A request that fails because it was refused (an expired session, a bad request) is no longer retried automatically, since asking again cannot change that answer; a request that fails from a server error or a dropped connection still gets a couple more tries, and every request now gives up after 30 seconds instead of hanging indefinitely.

### Changed
- **Customer, Employee, Manager** - Spanish translations for the Labels, scanner and Price Check screens, customer Home (offers, rewards, tier details, QR sheet, welcome bonus, local ads), the receipt scanner, Profile, the shared Retry screen, and the Daily Report and Daily Tasks menu entries. Screen-reader labels are translated as well.
- **Customer** - The Home header title now shrinks on narrow phones instead of pushing the bell and profile buttons off the screen.
- **Manager** - The manual no longer says that press-and-hold reorders Order List items (mobile has no drag reordering). Press-and-hold now starts selecting.
- **Admin** - "Pending reviews" and the attention banner on the Dashboard now count flagged transactions as well as pending ones, matching the Transactions badge in the sidebar. Labels that need printing are listed in the banner too.
- **Admin** - The Dashboard header is more compact and search and shortcuts share one row, so the numbers start higher on the screen. The Dashboard shows at most five attention items until you ask for more.
- **Admin** - Dashboard counts and chart axes show thousands separators, an offer of 1.5% shows as 1.5% instead of 2%, and "Ends" turns red only in the last two days. The stat cards and store rows can be reached and opened with the keyboard.
- **Admin** - Transactions opens on "Needs review": flagged sales first, then sales still waiting for a receipt, the same set the sidebar badge counts. Approve and Reject ask first with the customer, amount, reasons and what will happen, stay locked while sending, and show the server's own reason if a decision is refused. Times and default dates use the stores' Central time wherever the admin is opened. A rejected or pending sale no longer shows its cashback in green, the copy-ID control works from the keyboard, every control has a name, colours pass contrast, and the header and filters wrap on narrow windows.
- **Admin, Server** - Transactions: find and decide faster. A Search box finds a sale by the customer's or employee's name or phone, or the transaction's own ID ("a customer says they got no points" no longer means paging through 25 rows at a time); "More filters" adds an amount range and an "Include test data" checkbox (test sales are left out by default now, like Analytics and billing already do, with a small TEST tag on any shown on purpose). Every filter lives in the address bar, so a view (a store's flagged sales this week, one customer's history) can be bookmarked or sent to someone else. A Details button, or pressing Enter on a highlighted row, opens a side panel with the receipt photo, that customer's last sales and that cashier's recent grants, without leaving the page; J and K move the highlight, A approves and R rejects the sale that is open or highlighted (typing in any box is unaffected). Reject now offers an optional reason, kept in the activity log and told to the customer. The CSV export gained the transaction's own ID, the employee's phone, gallons for a fuel sale, the fraud flags in words, the receipt link, a test-data column, and a note if a filter matched more than it could export.
- **Admin, Server** - Transactions: undo and watch. A Dev Admin or Super Admin can void an approved sale from its details panel, with a required reason: the points are taken back from the customer's balance right away (their balance can go negative if they already spent some of it) and they are told. A pending sale with no receipt uploaded within 24 hours is now automatically rejected instead of sitting in the queue forever, and that store's managers are told once, not once per lapsed sale. The daily "what is waiting" email to HQ now calls out flagged sales that have been waiting over a day by name, not just the total count. A Gold, Diamond or Platinum customer's per-gallon gas bonus is now included in the Cashback column, the summary bar, and — the one that matters most — the platform fee, which used to be calculated on the base cashback alone and missed the bonus portion entirely (no real customer had reached Gold yet, so nothing was actually under-billed).
- **Admin, Server** - Analytics: compare and explain. Every summary card now says how the period compares with the one before it of the same length ("+12% vs previous period"), and the daily charts draw the previous period as a dashed line alongside this one (Custom range shows neither, since there is no fixed previous period to compare against). Clicking a store's bar in "Transactions by Store" or "Purchase Volume by Store" narrows the whole page to that store, with a chip to clear it. Two new charts, Busiest Hours and Busiest Days of the Week, and a Cashback Share of Sales trend line. A dashed marker on the Daily Transactions and Daily Revenue charts shows where a promotion started, so a bump can be explained instead of guessed at. A CSV export downloads the same filtered data (daily rows plus a per-store summary).
- **Server** - Analytics answers stay fast under repeat views: the same range and store, asked again within about 30 seconds (a page refresh, two admins looking at the same thing, a chart re-rendering), reuses the last computed answer instead of re-scanning every sale again. A new weekly email to HQ, every Monday morning, sums up the past 7 days against the 7 days before: transactions, purchase volume, cashback awarded, platform fee and the week's busiest store, alongside the existing daily "what is waiting" email.
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
- **Admin, Server** - Cashback Rates: every change (tier cashback, gas cents per gallon, points to reach a tier, category bonus) is confirmed in a box that says what changes and what it does to a $40 sale, is refused with a sentence when it is out of range (a tier at most 7.5%, a category bonus at most 5%, gas at most 25 cents a gallon, each tier needing more points than the one below, a tier plus a bonus never over 10%), is saved all or nothing, and is written to the Activity Log with who, when, before and after. The page shows who last changed a rate.
- **Admin** - Cashback Rates: category totals over 7.5% (held for a manager) and over 10% (the most a sale can pay) are marked; the gas table shows what a $40 fill really pays, including the fixed extra for Gold, Diamond and Platinum; switching gas to a percent asks first and is one request instead of five; a failed load of the category bonuses says so instead of showing zeros; a refusal shows the server's sentence. The sidebar entry is now called Cashback Rates like the page, and the second tier editor in Billing, Platform Settings is replaced by a link to it.
- **Server** - Super Admins can now change category bonuses (the page showed them the boxes but the server only allowed Dev Admins).
- **Server** - The half-year tier reset runs every hour and after every start-up instead of at one minute, can be repeated safely, catches up after a sleep, and counts the half-year in Texas time (the new period starts at midnight on January 1 and July 1, not at 6 or 7 pm the evening before). Customers are told, one by one, only when their own tier fell ("Your tier stepped back to Gold"); Bronze customers hear nothing.

- **Admin, Server** - Staff: Delete now refuses an account that has work on record (sales, redemptions, ratings, daily reports, item requests, order lists, label prints, notices, job postings) with a sentence and offers Deactivate instead, and deletes only an account with nothing on record, in one transaction. Before, it erased every sale the person granted and could then fail half-way, leaving the account with its sales gone. Deleting a customer removes their personal details and keeps their sales (like Delete My Account). Every delete and refusal is in the Activity Log.
- **Admin, Server** - Staff: Deactivate asks first and says what it does, and it asks for a state ("deactivated") rather than a flip, so a double click or a second admin cannot switch the person back on. Reactivate is one click with a clear message. The last active Dev Admin cannot be deactivated or deleted.
- **Admin, Server** - Staff: changing a person's stores is one all-or-nothing save with the whole list (moving someone from one store to another used to send an add and a remove at the same moment and could leave them at both), refuses a store that does not exist or is closed, and the box says what will be added and removed. The Activity Log shows the stores before and after by name.
- **Admin, Server** - Staff: New Account keeps a number pasted with the country code (it used to cut "+1 (281) 555-0100" to a different number), takes the PIN twice with a Show option, creates the account and its store together (nothing left behind on a failure), marks closed stores, tells you whether a number already in use is a customer or a staff member, and ends with a card showing the name, phone, PIN and store to hand over. Reset PIN also asks for the PIN twice.
- **Admin, Server** - Staff: edit and promote. An Edit button on a manageable account fixes a name or phone typo without the Delete-and-recreate detour that used to erase every sale the person granted. An Employee can be promoted to Store Manager (and back) from the same box, with chain-wide access as its own checkbox; demoting to Employee clears chain-wide access, since it only means anything for a manager. A Dev Admin or Super Admin's own role is never changed here. Every card now says when the person last signed in, or "Never signed in".
- **Admin** - Staff page: real dialogs (named, Escape closes, Tab stays inside, focus returns), store choices that can be reached with the keyboard, phones written (940) 555-1212, "No store assigned" instead of "All stores" for someone with none, "(closed)" and "Deactivated" in words, search by phone in any format, store name or role, a heading and readable colours. Every box passes an automatic accessibility scan. The confirm boxes used across the admin now also keep Tab inside, stop the page behind from scrolling and return focus.
- **Server** - A sale held for review now alerts that store's active managers and the active Super Admins (before, every manager and Super Admin of the whole chain, deactivated ones included, with "at your store" in the text), and says which store. Store alerts no longer go to deactivated employees and managers.
- **Admin, Server** - Labels: only HQ (a Super Admin or Dev Admin) can change an item's chain-wide price or remove an item; a store manager can change its name, barcode, category, deal and design; a cashier can add items and set their own store's price. Before, any cashier could change the price of an item at every store, or delete it from all of them, from a phone. Only a real change counts, so the phone's Edit that repeats every field is harmless; a refused change gives a sentence and is recorded in the Activity Log. No app build is needed: the phone already shows the server's sentence.
- **Admin, Server** - Labels: a price must be dollars and cents (0.01 to 999.99, at most two decimals, saved as 3.99). "abc", "1..99", "0" and "$3.99" (which printed as "$$3.99") used to save. Every price box says what a price is and stays off until it is one.
- **Admin, Server** - Labels: editing an item shows what it does before it is saved (price before and after with the percentage, a warning above 50%, how many stores will reprint and how many keep their own price), runs in one transaction, and the Activity Log keeps before and after. Removing an item says how many stores hold it and what goes with it, and the Activity Log keeps its price, barcode and those counts. Removing an item that is already gone says so instead of showing a database message.
- **Admin, Server** - Labels: one barcode belongs to one item (adding or editing with a barcode another item has is refused, naming that item); Duplicate starts with the barcode empty; the Add and Edit boxes and the store price box are real dialogs with named boxes; every tab refreshes after a change; failures show the server's reason instead of "Failed to save".
- **Admin, Server** - Disputes: a missing-points report is decided once. Two approvals (a double click, the admin and the manager's phone, two managers) could both credit the customer; now the report is claimed only if it is still pending, in the same step as the credit, and the second person is told what was decided. Approving needs an amount ($0.01 to $50, dollars and cents): before, approving with no amount credited nothing while everyone was told points were credited. Every decision is recorded in the Activity Log with who, how much and the note. A report from a customer who deleted their account can only be rejected.
- **Admin, Server** - Customers: Restrict and Restore ask for the state wanted (a double click or a second admin can no longer undo a restriction), the reason typed when restricting now shows on the customer's card, and Total, Active and Restricted are counted over every customer (Active used to count only the 50 on the page). Delete now removes the customer's personal details and keeps their sales (the same as Delete My Account), so store revenue, bills and analytics no longer shrink; it asks for the last four digits of the phone number and says how many sales stay. Every box is a real dialog and failures show the server's reason.
- **Admin, Server** - Customers: search finds a phone number written any way (brackets, dashes, +1, a leading 1) and a name with spaces around it; "%" and "_" no longer match everyone; the CSV export uses the same search. A page or limit that is not a number, or a limit of 100000, is a plain 400 instead of a 500 or a request for everyone. Dates use the Central calendar with the year. The Disputes tab counts pending reports whatever the filter, and the disputes list says when it is cut at its limit.
- **Admin, Server** - Customers: find and help. A Sort box (Newest, Oldest, Highest spend, Highest balance) and a Filters panel (Status, Has a balance, Has a fraud note, Joined this week, Hide test accounts) narrow the list; Export CSV downloads exactly what is filtered, with a new Test Account column. A 111-555 area code is now tagged TEST on the card, the same rule the Launch Tracker already used. View Details opens a customer's own page: their balance, recent sales with receipt links, redemptions and missing-points reports in one place. A new Goodwill Credit tool on that page adds up to $25 with a required reason, for a case that is not a missing-points report; it is audited and the customer is told why.
- **Admin, Server** - Send Push is safe to use. The panel says who a message would reach in people and phones before anything is sent ("13 customers, 9 with the app signed in, 4 will only see it in the inbox"), can send you a test first ("[Test]" on your own phone), asks with the exact message in a box, and sends once even on a double click. The server enforces the 65 and 200 character limits (5,000 were accepted), refuses the same message to the same audience for five minutes, and records every send in the Activity Log; a "Sent recently" list shows them.
- **Server** - Push messages now report what really happened. The push service's answer for every phone is read, so "sent to 9 phones, 3 failed" is what the page says (before, a failed batch of a chain-wide send was swallowed and a store send answered an error after some phones already had it, inviting a duplicate); a failed batch is sent once more; phones the service says no longer have the app are removed (one employee account held 17 phones and a manager 10). Every automatic message (points, requests, reminders, alerts) uses the same sender.
- **Server** - Who a broadcast reaches: active accounts only. Restricted and deleted customers and deactivated staff are no longer messaged; "customers of a store" means an approved purchase there in the last six months (before: anyone with any sale there, even one that was rejected, ever); "staff at a store" includes managers with chain-wide access. New promotion messages also skip restricted and deleted customers.
- **Admin** - Labels page: every checkbox (select-all and each row), the store picker and the category filter now have a name a screen reader can read, across Catalog, By Store and Coverage (some were unnamed, one critically so). The amber "needs attention" text (deal prices, "No price set", "Needs Reprint", "Not Added" and coverage badges) and the table-header grey read at a clear contrast now (they measured 2.9 to 3.6 to 1 against their background; WCAG asks for 4.5). "Print for All Stores" (Coverage) now puts a heading page with the store's name and label count ahead of each store's sheets in the combined print job, so the stack can be split apart correctly afterward; a single store's own print is unaffected.
- **Admin** - Notifications page: Disputes and Requests each have their own tab now (they only showed inside "All" before), the page no longer scrolls sideways at 768px or 390px wide, and the red used for "unread" and the error filter is darker so it reads clearly (it measured 3.8 to 1 against white, now about 6.5 to 1).
- **Server, Admin** - Offers: a per-tier promotion left-blank fix, honest templates. A tier left out of a per-tier promotion now earns nothing from it, instead of quietly being paid the highest tier's rate that was typed in (a Gold-and-Platinum-only promotion no longer pays a Bronze customer the Platinum rate); a flat, non-per-tier promotion is unaffected. Every built-in promotion template was reworded: none names a brand (Coca-Cola, Pepsi, Monster, Red Bull, Frito-Lay and its chip brands, Dasani/Aquafina/Smartwater), promises a time window (11am-2pm, before noon, before 10am), or a minimum purchase ($50) that the system does not actually check, since a promotion always applies to a whole category, all day. Confirmed (with a new test, not just reading the code) that a sale held for review already alerts only that store's own managers plus every Super Admin, not the whole chain, as intended.
- **Admin, Server** - Billing: say it right. Invoice lines now add up to the total (a category line used to show the platform fee plus the customer's cashback, which the store never pays Lucky Stop, while the total below it was the fee alone); the billing period and issue date print on the store calendar wherever the admin is opened (a September bill used to print "Aug 31 to Sep 29" outside Texas), and the issue date is fixed to when the bill was made, not "today." The percent under a month's platform fee is now the real rate on the real fee (it used to always print the global default, and an extra one-off charge in the same month inflated it, once to "60.0% of cashback" on a 10% deal); an extra charge now has its own line, card and column everywhere a total is shown, instead of being folded into "Dev Cut." "Dev Cut" is renamed "Platform Fee" on every customer- and Super-Admin-facing screen. The Monthly Bills tab opens showing the whole month (paid and unpaid) with a status badge per row, instead of a default filter that silently under-counted a month with anything already paid. The "Subscription Revenue" card is now the real subscription-fee total (it used to sum every paid billing record of any kind, so a one-off charge inflated it). A failed load of the revenue summary now says so with a Try Again instead of the box silently disappearing. Fixed accessibility findings across the whole Billing page: every filter and form field now has a name a screen reader can read, red and orange text that read as low as 2.1 to 1 against white now read 4.5 to 1 or better, a heading level skip, and the page no longer scrolls sideways on a phone (Manual Charges was 233px over).
- **Admin, Server** - Billing: reach. A "Billing job last ran Xm ago" line on Monthly Bills, in colour, names how many of today's active stores have a bill for the last finished month, and warns if the job has gone quiet for longer than its hourly tick should allow. The moment the monthly job makes a store's bill, that store's own Super Admin is emailed the invoice automatically, no manual "Notify" click needed. A new "History" button on each store's Stores-tab row shows every past billing-plan change (type, price, fee) with who made it and when, read from the existing Activity Log.
- **Admin, Server** - Labels: printed means printed. Marking a label printed now asks first ("Did the labels print?") instead of the moment the print window opens, and checks the price on the paper against the store's live price, so a label changed mid-print stays in the queue and says why instead of being marked at the wrong price. A store's own sale price now keeps its end date when the price is corrected (it used to clear it, so a sale never ended by itself), the end date box shows and saves the right day on the store's calendar, and a sale whose end has passed is treated as over immediately everywhere it is shown (By Store, Price Check, Coverage, Health), not just after the job that makes it permanent runs (up to 15 minutes later). The print tray's price box is now a one-off for that print only, with a "Save as this store's price" button, instead of silently becoming the store's price and dropping its sale end date on blur. A never-printed label can be taken out of one store (Remove, in By Store and Coverage); "Push to all stores" now says which stores it will add to before it happens. The Dashboard's and Health's "labels to print" count no longer includes closed stores or items with no price (it could show more labels than stores). Barcodes on the printed sheet are now drawn by the admin itself, not fetched from a public website, so a store's blocked network can no longer print an empty barcode.
- **Admin, Server** - Alerts to HQ. HQ now gets an email for a sale of $500 or more held for review, every missing-points report and every high-priority store alert (to active Super Admins and Dev Admins with an email on their account, and the server's ADMIN_EMAIL), plus one morning summary email a day after 8 am Central that lists what is waiting and catches up after a sleep. The admin alert list now includes sales held for review (it did not, so the most urgent alert was missing), its cards keep the same id from day to day (the rejected-sales card used to come back as new at every midnight), and its texts count stores instead of bills and no longer quote a "dev cut" or call platform fees "subscription revenue".
- **Server, Admin** - Fewer, better customer messages. A gas price change is now told only to the customers of that store, one line per store (a new price replaces the unread old line); before, every save at any store put a line in every customer's inbox (360 lines, 333 unread, for 13 customers in a month). A promotion is announced when it starts, not when it is posted (a promotion made on Monday for Friday used to tell everyone on Monday to look in the app), and a single-store promotion goes to that store's customers only. The Post box says who is told and when.
- **Admin, Server** - Stores: deactivating a store now really closes it. Only a Dev Admin can do it (the server enforces what the page already hid), and a closed store refuses sales, redemptions, tier-benefit claims and catalog redemptions with a sentence naming the store; before, only what customers see changed and cashiers could keep granting points there.
- **Admin, Server** - Stores: gas and diesel prices. Typing in one box no longer blanks the other; every price shows how old it is ("Updated 3 days ago", "Never set", red after two days); a price that is already saved sends nothing (no message to staff, no line in every customer's inbox); a move over 15% or a price under $1 asks first with the old and new price; a double click sends one request and two managers changing the same price at once cannot both count; prices are $0.50 to $20 with at most three decimals; each change is in the Activity Log with old and new.
- **Admin, Server** - Stores: Edit Store checks the state (two letters), ZIP (five digits), phone (ten digits, stored as +1 and ten digits, and an empty phone now clears it), and coordinates (a pair, inside the United States, a note outside Texas and Oklahoma), refuses a duplicate name, shows the server's reason, and every edit, hours change, holiday, POS keyword and printer-key regeneration is recorded in the Activity Log.
- **Admin, Server** - Stores: store hours can be filled in one click ("Same every day", "Open 24 hours every day", "Copy Monday to all days"); an open day needs both times; holidays show their real date (they read "Invalid Date" before) and a real calendar date is required (Feb 30 was quietly saved as March 2); a POS keyword needs three characters. The Edit, Hours and POS boxes are real dialogs with named boxes.
- **Admin, Server** - Stores: grow. A Dev Admin can now **Add Store** (name, address, phone and coordinates are optional, a platform fee if it should differ from the default 10%) without a developer and the database. Every card now says whether it is **Ready for customers**, or names exactly what is missing (hours, phone, location, a fresh gas or diesel price, staff assigned, a first sale seen). A store manager gets a push if a price they already set has gone more than 2 days without an update (a price that was never set at all is a readiness gap, not a nag).
### Fixed
- **Employee** - The chain-wide Edit and Delete controls on the Labels screen (change an item's shared name, barcode, category, deal or price, or remove it everywhere) no longer show to a cashier, including the "scan a barcode that already exists" path that used to drop straight into that same edit form. The server already refused these for a cashier; the buttons are gone too, not just refused after the tap.
- **Manager** - The Offers "Bonus Cashback %" box is now read-only for a Store Manager, with a note that HQ sets cashback bonuses, instead of a live box that looked editable but was refused by the server on save. Deal Text is unaffected - managers can still post and edit deals.
- **Server** - The July 1 tier reset never ran (the server was not awake at the one minute it was scheduled), so every customer was still on 2026-H1: the customer's tier card showed "2026-H1" and the cashier's screen read them as Bronze with no progress. New customers now start in the current half-year and the job catches everyone up.
- **Server** - After the January step down, the first small sale would have sent a Platinum customer to Bronze with the notification "Tier Up! You're now BRONZE". A tier now only moves up while a customer earns their way back, and only a customer whose tier really rose hears "Tier Up".
- **Server** - The cashier's customer screen, the customer's benefit screen, benefit claims and the sale itself now read a customer's tier the same way (before, three of them disagreed for a customer whose half-year was old), and a sale made before the reset reaches the customer counts in the new half-year.
 showed the points with a dollar sign ("$5,000+ earned") and a value 100 times too large, and a dollar amount typed there set the threshold 100 times too low (Silver after 60 points instead of 5,000). They now show points and what that is in cashback.
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
- **Admin** - Jumping to a customer from a search result (the Dashboard's own search box, and now the command palette) only ever highlighted them if they already happened to be on the first, unfiltered page of the Customers list; otherwise nothing visibly happened. Both now search the list down to that customer as well as highlighting their card, and the highlight works on the main list, not only the Disputes tab.
- **Admin** - The Staff page could show a blank error screen for a staff member with no role on the record. It now shows "Staff" instead of failing.

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
