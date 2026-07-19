# Consolidated Manual Test Checklist — 2026-07-18 session

Covers everything shipped today: notification deep-linking, transaction-linked disputes, careers stale-cache fix + new-opening notification, iOS reCAPTCHA redirect fix, app icon swap. Nothing here has been verified on a real device yet — only `tsc --noEmit` + static code review.

## 0. Build first

- [y] Trigger the iOS build workflow (`Build iOS IPA`, manual `workflow_dispatch` in GitHub Actions)
- [y] Confirm it actually compiles — the reCAPTCHA `AppDelegate.swift` patch is the one change that could hard-fail the build if the anchor text ever mismatched (it shouldn't — verified against the real published template — but this is the first real compile of it)
- [y] Same for Android if you also rebuild that side

## 1. iOS reCAPTCHA redirect fix (highest risk — never compiled before)

- [ ] Trigger a phone-auth flow that falls back to the reCAPTCHA Safari popup (not the silent APNs path) — this usually means a number/device combo where silent verification can't complete
- [ ] Confirm OTP verification still completes successfully
- [ ] Confirm there's **no unwanted navigation blip** afterward (the bug this fix targets) — you should land back in the app cleanly, not get bounced through an unrelated screen

## 2. Notification deep-linking (foreground / background / cold start)

For each, tap the resulting push notification in all three app states:

- [ ] **Foreground** — app open when the push arrives, tap it
- [ ] **Background** — app backgrounded (not killed), tap it
- [ ] **Cold start** — app fully killed, tap the push, confirm it launches into the right screen (not just the default landing page)

Types worth spot-checking (don't need all of them, but cover a few different ones):

- [ ] A dispute-related push → lands on the right screen, target row scrolls + pulses — **fixed 2026-07-18**: root cause was `history.tsx`'s highlight lookup only searching already-fetched pages of the paginated list; it now keeps paging through history until it finds the target (or exhausts all pages) before scrolling/pulsing, decoupled from the shared hook's fixed 1.7s clear window. Needs a fresh on-device retest against an old transaction.
- [ ] A points/transaction push → lands on History, right transaction highlighted
- [ ] A request push (employee/manager) → lands on the right tab
- [ ] **In-app Notifications list**: tap an item of each type you can trigger — confirm it navigates instead of doing nothing
- [ ] Confirm a **stale cold-start tap doesn't replay** — force-quit the app after tapping one notification, relaunch normally (not via another tap) a bit later, confirm it does NOT re-navigate to that old destination

## 3. Transaction-linked disputes

- [ ] Open a transaction in History that has a receipt photo → confirm the photo displays, "Dispute This Transaction" button appears
- [ ] Tap it, try submitting under 10 characters → submit button stays disabled
- [ ] Submit a valid description → success toast, appears in "My Reports" with the transaction summary line (date · amount · category)
- [ ] Try disputing the **same transaction again** → confirm a friendly "you already have a pending report" message, not a raw error
- [ ] As admin, open Disputes tab, click "Review" on that dispute → confirm the transaction summary + receipt photo show inline, receipt opens full-size on click
- [ ] Resolve it (approve with a credit amount) → confirm it credits correctly and the customer gets notified
- [ ] Confirm the **old generic "+ Report" flow still works unchanged** (no transaction, just store/description/amount)

## 4. Careers — stale-cache fix + new-opening notification

- [ ] Open Careers screen, background/foreground the app (or navigate away and back) → confirm it refetches instead of showing stale data
- [ ] As admin, post a new opening with "Active" checked → confirm a customer device gets the push + inbox entry with the **briefcase icon**, tapping it navigates to Careers
- [ ] Post a new opening with "Active" **unchecked** → confirm no notification fires
- [ ] Edit that inactive opening, check "Active" → confirm a notification fires now
- [ ] Edit an opening that's already active (e.g. change pay range only) → confirm **no** notification fires
- [ ] Toggle an active opening to inactive → confirm **no** notification fires
- [ ] Post a chain-wide opening (no store assigned) → confirm the notification body reads "...at any Lucky Stop location..."

## 5. App icon (lowest risk, just visual)

- [ ] Confirm the new icon shows on the home screen / app switcher
- [ ] Look closely at the corners — confirm the double-rounding artifact (accepted tradeoff) is acceptable in practice, not worse than expected
- [ ] Confirm splash screen and Android adaptive icon also updated correctly

## 6. Order List polish (2026-07-18)

- [ ] Add a note when adding a new item on mobile (Quick Add Bar) → confirm it saves and shows on admin web
- [ ] Add a note when editing an existing PENDING item on mobile → confirm it saves and shows on admin web
- [ ] Try to edit an ORDERED or RECEIVED item's overflow menu on mobile → confirm "Edit Details" no longer appears (or the whole menu is hidden if nothing's left to offer)
- [ ] Edit standing instructions on mobile, type near 300 characters → confirm the counter updates live and matches what actually saves
- [ ] On a store with many locations assigned to one manager, check the store-tab row for a visible scroll-edge fade
- [ ] While a list is open on mobile, add an item, then check the same list on admin web within 30s without manually refreshing → confirm it appears
- [ ] On admin web, block popups for the site, then try Print → confirm a clear error toast instead of nothing happening
- [ ] On admin web, force a detail-load failure (e.g. disconnect network briefly, open a list) → confirm a retry button appears and works
- [ ] Visually compare the Order Lists tab and Categories tab on admin web → confirm item rows feel visually consistent with category rows

## 7. Requests hub redesign (2026-07-18)

- [ ] Submit a Store Alert as an employee → confirm the assigned manager gets a push notification that lands on the Alerts tab with the right card pulsing
- [ ] Acknowledge that alert as a manager → confirm the employee gets a push notification back
- [ ] Check admin web's notification bell as DevAdmin/SuperAdmin → confirm a pending Stock Request now appears as a card, and clicking it lands on the new Stock tab in the Requests hub with the right one highlighted
- [ ] On employee mobile, confirm the four alert-type icons (Low Stock/Store Supplies/Customer Asking/Work Order) now match the vector icons used on the manager side, not emoji
- [ ] Pull down to refresh on each of the manager hub's three tabs (Alerts/Stock/Products) → confirm it actually refetches
- [ ] On the manager hub's Products tab, confirm a status filter row now exists (All/Pending/Accepted/Declined or similar) and actually filters
- [ ] Read the one-line explainer text under each of the manager hub's three tabs → confirm it renders and makes sense
- [ ] On employee Stock Request screen, confirm the Low Stock vs Customer Ask explainer and the order-list lifecycle legend both appear
- [ ] As a manager assigned to 2+ stores, confirm some kind of "other stores may have pending requests" hint appears when appropriate
- [ ] On admin web, confirm Order List's page no longer has a "Requests" tab, and the Requests hub (`/store-requests`) now has three tabs: Alerts, Stock, Products
- [ ] On admin web, use the Stock tab to accept/reject a request → confirm it behaves the same as it used to on the old Order List page (per-line accept/reject, rejection reasons, Accept All)
- [ ] Check the "Order List" and "Requests" nav badges on admin web → confirm Stock's pending count now shows on "Requests," not "Order List"
- [ ] Acknowledge a Store Alert or respond to a Product Request on admin web → confirm the sidebar badge count updates immediately, not after up to a minute
- [ ] Force a Product Requests load failure on admin web → confirm a retry button now appears (previously it silently showed nothing/stale data)

## 8. Admin web cleanup & feature gaps (2026-07-19)

- [ ] As a STORE_MANAGER, try navigating directly to `/daily-reports` and `/daily-tasks` by URL → confirm you're now redirected/blocked cleanly instead of seeing a broken page
- [ ] As DevAdmin/SuperAdmin, navigate to `/hot-food/menu` and `/hot-food/orders` by URL → confirm a "Coming Soon" placeholder shows instead of the old partial functionality
- [ ] Confirm the main `/hot-food` page (Orders/Catalog/Availability) still works exactly as before — this plan should not have touched it
- [ ] On the Requests hub's Stock tab, select "All Stores" → confirm it shows pending stock requests across every store, each labeled with its store name, and that Review Items/Accept All still work correctly
- [ ] Navigate to the new Scanned Products admin page as DevAdmin, SuperAdmin, and StoreManager → confirm all three can view and delete entries, search works
- [ ] On a closed order list (view via the Order Lists tab's status filter), as DevAdmin, use the new Restore Items action → confirm it adds the selected items to that store's current open list
- [ ] Try Restore Items on a store with no currently-open list → confirm a clear error message, not a silent failure
- [ ] As STORE_MANAGER, try navigating directly to `/notices` by URL → confirm you're redirected/blocked cleanly instead of seeing a broken 403'd page (same class of fix as `/daily-reports` above)

## 9. Order List follow-up fixes (2026-07-19, same day)

- [ ] Close enough lists (or check on a day with several stores lacking one) that at least one store has no currently-open list → confirm a "⚠ N stores with no open list" banner appears above the Order Lists browse tab, with a clickable chip per missing store
- [ ] Click one of those chips → confirm it opens a list for that store directly (no need to touch the store filter dropdown) and the banner's count drops accordingly
- [ ] On the Order Lists browse tab (not the detail view), confirm cards now show "X needed"/"X received" stats when applicable, not just the total item count (previously these silently always showed nothing)
- [ ] From an order list's detail view, accept an employee's stock request via the inline "Employee Requests" panel, then check the Requests hub's Stock tab for that same store → confirm it no longer shows that request as pending (previously could lag up to 30s)
- [ ] Do the reverse: accept a stock request from the Requests hub's Stock tab, then open that store's order list detail view → confirm the inline panel no longer shows it as pending
