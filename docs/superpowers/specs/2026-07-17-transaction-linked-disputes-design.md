# Transaction-Linked Disputes — Design Spec

**Date:** 2026-07-17
**Status:** Approved, ready for planning

## Problem

Item 1 of the 2026-07-12 feedback batch: customers should be able to dispute a *specific* transaction directly from viewing it, instead of today's only option — a generic "Report Missing Points" form (`mobile/app/(customer)/my-disputes.tsx`'s `ReportModal`) that has no link to any transaction or receipt at all. Admin should see the linked transaction and its receipt photo automatically when reviewing that dispute, instead of resolving purely off a free-text description and a self-reported dollar estimate.

## Why two flows, not one

The existing generic form serves a real, distinct case: a customer who got **zero points because nothing was ever recorded** (e.g. an employee forgot to scan them). There is no transaction to link to in that case — the report *is* "this purchase doesn't exist in your system."

That's different from disputing a transaction the customer can already see in their history (wrong category, fewer points than expected, wrong amount) — which does have a real record to attach to.

**Decision:** keep both flows.
- Generic form (`ReportModal`, unchanged): for "nothing was recorded."
- New transaction-linked flow: for "this specific thing I can see is wrong."

## Data model

Add one optional field to `PointsDispute` (`backend/prisma/schema.prisma:1273-1293`):

```prisma
model PointsDispute {
  id            String        @id @default(uuid())
  customerId    String
  storeId       String
  transactionId String?                                                        // NEW
  description   String
  estimatedAmt  Float?
  status        DisputeStatus @default(PENDING)
  resolvedById  String?
  resolvedNote  String?
  creditedAmt   Float?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  customer      User             @relation("DisputeSubmitter", fields: [customerId], references: [id], onDelete: Cascade)
  store         Store            @relation(fields: [storeId], references: [id])
  resolvedBy    User?            @relation("DisputeResolver", fields: [resolvedById], references: [id])
  transaction   PointsTransaction? @relation(fields: [transactionId], references: [id])  // NEW

  @@index([storeId, status])
  @@index([customerId])
  @@map("points_disputes")
}
```

`PointsTransaction` (`backend/prisma/schema.prisma:371-406`) needs the required Prisma back-relation:

```prisma
model PointsTransaction {
  // ...existing fields unchanged...
  disputes PointsDispute[]   // NEW
}
```

Nullable, additive column — a normal hand-authored SQL migration (matching this repo's existing migration style, e.g. `backend/prisma/migrations/20260712010000_add_notification_action_url/migration.sql`), no backfill, no data-loss risk. `storeId` on `PointsDispute` remains required and non-null even for linked disputes (see below) — no existing code that reads `dispute.storeId` needs to change.

## Backend changes

### `POST /api/disputes` (`backend/src/controllers/dispute.controller.ts`, `submitDispute`)

Current Zod schema requires `storeId` + `description` (+ optional `estimatedAmt`). New schema accepts **either** `storeId` (generic path, unchanged behavior) **or** `transactionId` (new path) — never both:

```ts
const submitSchema = z.object({
  storeId:       z.string().uuid().optional(),
  transactionId: z.string().uuid().optional(),
  description:   z.string().min(10).max(500),
  estimatedAmt:  z.number().positive().max(10000).optional(),
}).refine(
  (data) => Boolean(data.storeId) !== Boolean(data.transactionId),
  { message: 'Provide either storeId or transactionId, not both.' }
);
```

When `transactionId` is present:
1. Fetch the transaction; 404 if it doesn't exist, 403 if it doesn't belong to the requesting customer (`transaction.customerId !== req.user.id`).
2. Check for an existing **PENDING** dispute already referencing this `transactionId`; if found, reject with 409 ("You already have a pending report for this transaction.") — mirrors the existing duplicate-receipt-hash 409 pattern in `points.controller.ts`.
3. Derive `storeId` from `transaction.storeId` server-side (never trust a client-supplied value here).
4. Ignore `estimatedAmt` if the client sends it alongside `transactionId` (the real `purchaseAmount` is already on the linked record).
5. Create the `PointsDispute` with `transactionId` set.

The generic path (`storeId` present, no `transactionId`) behaves exactly as it does today — no change.

### Fetch endpoints

`getMyDisputes`, `getStoreDisputes`, `getAllDisputes` (same file) add an `include` for the linked transaction when present:

```ts
transaction: {
  select: {
    id: true,
    purchaseAmount: true,
    category: true,
    status: true,
    createdAt: true,
    receiptImageUrl: true,
    grantedBy: { select: { name: true } },
  },
},
```

### `resolveDispute`

No logic change expected. The existing `creditedAmt <= dispute.estimatedAmt` check already only applies when `estimatedAmt` is set (it's optional today too, for admin-created or edge-case disputes) — linked disputes with no `estimatedAmt` are naturally bounded by just the existing `DISPUTE_CREDIT_HARD_CAP = 50`. **This will be explicitly verified during planning/implementation**, not assumed.

### Notification routing

No changes. Admin already lands on `/customers?tab=disputes&highlightId=<id>` via the bell-feed wiring that just shipped (`adminDisputeUrl`, already wired in `billing.controller.ts`'s notification synthesizers). This feature only changes what the admin sees once they open the "Review" modal for that dispute — no new deep-link target is needed.

## Mobile (customer)

### `mobile/app/(customer)/history.tsx`

The transaction detail modal (today: store, date, category, amount, points, optional notes — no receipt shown, no actions) gains:
- The receipt photo, if `receiptImageUrl` is present (rendered as an `<Image>`; `null` for QR self-grant transactions, which have no photo — hide the section entirely in that case).
- A **"Dispute this transaction"** button, opening a new small modal.

### New component: transaction-dispute modal

A single-purpose component (not a mode of the existing `ReportModal` — see rationale below), containing just:
- A short explanation of what's being disputed (read-only summary: store, date, amount, category — pulled from the transaction already in hand, no re-fetch needed).
- One free-text description field (same 10–500 char validation as the generic form).
- Submit → `disputeApi.submit({ transactionId, description })`.

The button is always shown regardless of whether a dispute already exists for this transaction — there is no proactive "already reported" check on `history.tsx` (no extra fetch needed to render the list). Duplicate prevention is enforced server-side only: on a 409 (duplicate pending dispute), show a friendly alert directing the customer to "My Disputes" rather than a raw error.

**Why a separate component instead of extending `ReportModal`:** the two flows now have genuinely different fields (3 inputs vs. 1, plus a read-only summary block only the linked flow needs). This codebase already favors small, single-purpose components (e.g. `PulseHighlight`, `useHighlightParam` from the notification-deep-linking work) over conditional multi-mode ones. Threading a "linked mode" through the existing form risks destabilizing the flow that already works today for zero benefit.

### `mobile/app/(customer)/my-disputes.tsx`

Dispute cards with a linked transaction show a small summary strip (date · amount · category) above the existing description/status/credited-amount display. Cards without a linked transaction (the generic-form case) render exactly as they do today. The existing "+ Report" button and `ReportModal` are untouched.

## Admin

### `admin/src/pages/Customers.tsx` — Resolve Dispute modal

When the dispute has a linked transaction (now included in the fetch payload), the modal shows, above the existing description/estimatedAmt/credit-input/note fields:
- A transaction summary: date, `purchaseAmount`, `category`, granting employee's name, transaction status.
- The receipt photo, if present — same rendering pattern already used in `admin/src/pages/Transactions.tsx:346-350` (a link/image on the public Cloudinary URL, no signed-URL logic needed).

Disputes without a linked transaction render exactly as they do today. No changes to `Transactions.tsx` itself, and no new admin navigation/routing.

## Explicitly out of scope

- Auto-suggesting a credit amount based on recalculated cashback for the linked transaction — admin still enters "Credits to Award" manually, matching the existing "admin makes the judgment call, we just give context" pattern.
- Any change to the employee-facing dispute-submitted notification (`disputeSubmittedUrlEmployee`, still routes to `/(employee)/home`) — employees don't resolve disputes in this app's RBAC model, only admins do.
- Navigating admin to the `Transactions.tsx` page for a linked dispute — the transaction is shown inline in the resolve modal instead (decided over a navigate-based deep link, to avoid losing resolve-in-place context).
- Restricting which transaction statuses can be disputed — the button is shown regardless of `APPROVED`/`PENDING`/`REJECTED` status.
- Any UI change to `Transactions.tsx` itself.

## Verification

No test framework in this repo (consistent with prior work) — verification is `npx tsc --noEmit` per sub-app (backend, mobile, admin) plus manual click-through: submit a linked dispute from a transaction with a receipt, confirm it shows correctly in `my-disputes.tsx`, confirm the admin resolve modal shows the transaction + receipt, confirm resolving credits correctly, confirm the generic "+ Report" flow still works unchanged, confirm the 409 duplicate-dispute path.
