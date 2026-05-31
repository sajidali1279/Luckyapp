# New Store Setup Checklist

**Use this for every new store onboarding.** Complete every item before marking the store as live.

---

## Phase 1 — Before Anything Else

- [ ] Merchant Agreement signed and on file
- [ ] Store owner has been briefed on the Store Owner Overview doc
- [ ] Store name, address, and GPS coordinates confirmed
- [ ] Confirm store minimum age requirement (standard = 18+, liquor stores = 21+)
- [ ] Monthly subscription payment method confirmed

---

## Phase 2 — Platform Configuration (You Do This)

### Store Record
- [ ] Create store in the database (via admin portal or direct DB entry)
  - Store name (exactly as it should appear in the app)
  - Address
  - GPS coordinates (lat/lng) — use Google Maps to verify
  - `minimumAge` field: set to `21` only for liquor/alcohol-primary stores, otherwise leave null
- [ ] Verify store appears in the location detection test (open mobile app, stand near store or spoof GPS)
- [ ] Confirm store radius (default 2-mile detection radius)

### Manager Account
- [ ] Create Store Manager account in the Staff page
  - Name, phone number, role: STORE_MANAGER
  - Assign to this store's ID
- [ ] Send manager their login instructions (phone number + OTP flow)
- [ ] Confirm manager can log in and sees their store's dashboard

### Product Catalog
- [ ] Confirm with store owner which products to offer as rewards
  - Minimum: 3–5 items (e.g., fountain drink, coffee, snack bag, energy drink)
  - Include credit cost for each (e.g., 500 credits = fountain drink)
- [ ] Add catalog items via admin portal (SuperAdmin or DevAdmin access required)
- [ ] Verify catalog items are visible in the customer app when near the store

### Push Notifications
- [ ] Confirm Firebase project has this store's device tokens configured
- [ ] Send a test push notification to the manager's device
- [ ] Verify notification is received

---

## Phase 3 — Employee Setup

- [ ] Manager adds at least 2 employee accounts before go-live
- [ ] Each employee logs in and completes setup (name, PIN)
- [ ] Run a test scan with a real customer account:
  - Employee scans QR
  - Enter a test amount ($1.00)
  - Take a receipt photo (can be a blank paper for testing)
  - Grant points
  - Verify customer sees credits in their balance
- [ ] Verify transaction appears in the manager's dashboard
- [ ] Print and post the Cashier Quick Reference Card at each register

---

## Phase 4 — Go-Live Confirmation

- [ ] Store owner walkthrough complete (confirm they understand the admin portal)
- [ ] Manager confirmed comfortable with the scheduling and order list features
- [ ] At least one offer created for launch week (bonus cashback promotion)
- [ ] At least one banner uploaded (welcome banner or opening promotion)
- [ ] Store marked as active in the system
- [ ] Store owner has the support email: sksajidali1279@gmail.com

---

## Phase 5 — Post-Launch (First 30 Days)

- [ ] **Day 3:** Check transaction log — confirm scans are happening correctly
- [ ] **Day 7:** Follow up with manager — any staff confusion or issues?
- [ ] **Day 14:** Review analytics — transaction count, points issued, active customers
- [ ] **Day 30:** Check-in call or message with store owner — satisfaction, feature requests
- [ ] Update changelog with go-live date and store number

---

## Notes

| Field | Value |
|---|---|
| Store Name | |
| Store ID (DB) | |
| Manager Name | |
| Manager Phone | |
| Go-Live Date | |
| Subscription Start Date | |
| Subscription Amount | $___/month |
| Special Configuration | |
