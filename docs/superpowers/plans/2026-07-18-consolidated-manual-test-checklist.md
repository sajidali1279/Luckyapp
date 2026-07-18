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
