# Transaction-Linked Disputes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let customers dispute a specific transaction directly from its detail view in `history.tsx`, with the linked transaction and receipt photo shown automatically to admin when they resolve it — while keeping the existing generic "Report Missing Points" form for cases where no transaction was ever recorded.

**Architecture:** Add an optional `transactionId` FK to `PointsDispute`. `POST /api/disputes` accepts either `storeId` (existing generic path, unchanged) or `transactionId` (new path, derives `storeId` server-side and blocks duplicate pending reports on the same transaction). The three dispute-fetch endpoints include a transaction summary when present. Mobile gets a new, separate lightweight modal (not a mode of the existing `ReportModal`) triggered from `history.tsx`'s transaction detail view. Admin's existing Resolve Dispute modal in `Customers.tsx` shows the linked transaction + receipt inline — no new admin navigation, since the notification deep-linking work already lands admin on the right dispute.

**Tech Stack:** Node/Express + Prisma/Postgres (backend), React Native + Expo Router (mobile), React + react-router-dom (admin). **This repo has no test framework** — verification throughout is `npx tsc --noEmit` per sub-app plus manual click-through, not automated tests. Prisma migrations are hand-authored SQL (no local `DATABASE_URL`, so `prisma migrate dev` can't run) — match the style of `backend/prisma/migrations/20260712010000_add_notification_action_url/migration.sql`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-transaction-linked-disputes-design.md`
- Keep both dispute flows: the existing generic form (`storeId` + description + optional `estimatedAmt`, no transaction) is unchanged; the new flow (`transactionId` + description only) is additive.
- `resolveDispute`'s existing credit-cap check (`backend/src/controllers/dispute.controller.ts:145`, `if (creditedAmt && dispute.estimatedAmt && creditedAmt > dispute.estimatedAmt)`) already short-circuits when `estimatedAmt` is falsy — **confirmed by direct read, no code change needed there.** Linked disputes (no `estimatedAmt`) are bounded only by the existing `DISPUTE_CREDIT_HARD_CAP = 50`.
- No new admin navigation/deep-linking — the transaction + receipt are shown inline in the existing Resolve Dispute modal on `admin/src/pages/Customers.tsx`, not a separate page.
- The new mobile modal uses plain hardcoded English strings, matching `mobile/app/(customer)/history.tsx`'s own convention (that file has no i18n) — do NOT add i18n keys for it, even though the sibling `ReportModal` in `my-disputes.tsx` does use i18n. This is a deliberate choice to match the file the new UI is triggered from, not the file it's conceptually similar to.
- `receiptImageUrl` is already present in every `pointsApi.getMyHistory()` response today (confirmed: `backend/src/controllers/points.controller.ts`'s `getMyTransactions` uses no top-level `select`, so all scalar fields including `receiptImageUrl` are already returned) — no backend change needed to expose it to `history.tsx`.
- Receipt photos are rendered as a plain `<img>`/`<a>` against the public Cloudinary URL already on `PointsTransaction.receiptImageUrl` — no signed-URL logic, matching the existing pattern in `admin/src/pages/Transactions.tsx:346-350`.

---

### Task 1: Prisma schema + migration — `PointsDispute.transactionId`

**Files:**
- Modify: `backend/prisma/schema.prisma:1273-1293` (`PointsDispute` model)
- Modify: `backend/prisma/schema.prisma:371-406` (`PointsTransaction` model)
- Create: `backend/prisma/migrations/20260717000000_add_dispute_transaction_link/migration.sql`

**Interfaces:**
- Produces: `PointsDispute.transactionId` (nullable `String`), `PointsDispute.transaction` relation (nullable `PointsTransaction`), `PointsTransaction.disputes` reverse relation — consumed by Tasks 2 and 3.

- [ ] **Step 1: Add `transactionId` + relation to `PointsDispute`**

In `backend/prisma/schema.prisma`, change:

```prisma
model PointsDispute {
  id            String        @id @default(uuid())
  customerId    String
  storeId       String
  description   String
  estimatedAmt  Float?
  status        DisputeStatus @default(PENDING)
  resolvedById  String?
  resolvedNote  String?
  creditedAmt   Float?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  customer      User          @relation("DisputeSubmitter", fields: [customerId], references: [id], onDelete: Cascade)
  store         Store         @relation(fields: [storeId], references: [id])
  resolvedBy    User?         @relation("DisputeResolver", fields: [resolvedById], references: [id])

  @@index([storeId, status])
  @@index([customerId])
  @@map("points_disputes")
}
```

to:

```prisma
model PointsDispute {
  id            String        @id @default(uuid())
  customerId    String
  storeId       String
  transactionId String?
  description   String
  estimatedAmt  Float?
  status        DisputeStatus @default(PENDING)
  resolvedById  String?
  resolvedNote  String?
  creditedAmt   Float?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  customer      User               @relation("DisputeSubmitter", fields: [customerId], references: [id], onDelete: Cascade)
  store         Store              @relation(fields: [storeId], references: [id])
  resolvedBy    User?              @relation("DisputeResolver", fields: [resolvedById], references: [id])
  transaction   PointsTransaction? @relation(fields: [transactionId], references: [id])

  @@index([storeId, status])
  @@index([customerId])
  @@map("points_disputes")
}
```

- [ ] **Step 2: Add the reverse relation to `PointsTransaction`**

Change:

```prisma
  customer    User  @relation("PointsEarner", fields: [customerId], references: [id])
  grantedBy   User  @relation("PointsGranter", fields: [grantedById], references: [id])
  store       Store @relation(fields: [storeId], references: [id])
  rating      EmployeeRating?

  @@index([customerId])
```

to:

```prisma
  customer    User  @relation("PointsEarner", fields: [customerId], references: [id])
  grantedBy   User  @relation("PointsGranter", fields: [grantedById], references: [id])
  store       Store @relation(fields: [storeId], references: [id])
  rating      EmployeeRating?
  disputes    PointsDispute[]

  @@index([customerId])
```

(This is inside `model PointsTransaction { ... }` — the `@@index([customerId])` here is the first of several `@@index` lines already in that model; only add the `disputes` field, don't touch the indexes.)

- [ ] **Step 3: Write the migration**

Create `backend/prisma/migrations/20260717000000_add_dispute_transaction_link/migration.sql`:

```sql
-- AlterTable
ALTER TABLE "points_disputes" ADD COLUMN "transactionId" TEXT;

-- AddForeignKey
ALTER TABLE "points_disputes" ADD CONSTRAINT "points_disputes_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "points_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

- [ ] **Step 4: Regenerate the Prisma client**

Run: `cd backend && npx prisma generate`
Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 5: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260717000000_add_dispute_transaction_link
git commit -m "feat: add transactionId link from PointsDispute to PointsTransaction"
```

---

### Task 2: `submitDispute` — accept `transactionId` as an alternative to `storeId`

**Files:**
- Modify: `backend/src/controllers/dispute.controller.ts:9-43`

**Interfaces:**
- Consumes: `PointsDispute.transactionId` from Task 1.
- Produces: `POST /api/disputes` now accepts `{ transactionId, description }` in addition to the existing `{ storeId, description, estimatedAmt? }` — consumed by Task 4's mobile API client update.

- [ ] **Step 1: Replace the schema and `submitDispute` function**

Change (lines 9-43):

```ts
const submitSchema = z.object({
  storeId:      z.string().uuid(),
  description:  z.string().min(10).max(500),
  estimatedAmt: z.number().positive().max(10000).optional(),
});

export async function submitDispute(req: AuthRequest, res: Response) {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { storeId, description, estimatedAmt } = parsed.data;

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) {
    res.status(404).json({ success: false, error: 'Store not found' });
    return;
  }

  const dispute = await prisma.pointsDispute.create({
    data: { customerId: req.user!.id, storeId, description, estimatedAmt },
  });

  // Notify employees only — cashiers handled the transaction and can escalate
  sendPushToStoreEmployees(
    storeId,
    'New Missing-Points Report',
    `A customer reported missing cashback at ${store.name}. Review in the admin portal.`,
    'DISPUTE_SUBMITTED',
    disputeSubmittedUrlEmployee(),
  ).catch(() => {});

  res.status(201).json({ success: true, data: dispute });
}
```

to:

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

export async function submitDispute(req: AuthRequest, res: Response) {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { description, transactionId } = parsed.data;
  let storeId = parsed.data.storeId;
  let estimatedAmt = parsed.data.estimatedAmt;

  if (transactionId) {
    const transaction = await prisma.pointsTransaction.findUnique({
      where: { id: transactionId },
      select: { id: true, customerId: true, storeId: true },
    });
    if (!transaction) {
      res.status(404).json({ success: false, error: 'Transaction not found' });
      return;
    }
    if (transaction.customerId !== req.user!.id) {
      res.status(403).json({ success: false, error: 'Not authorized for this transaction' });
      return;
    }
    const existingPending = await prisma.pointsDispute.findFirst({
      where: { transactionId, status: 'PENDING' },
    });
    if (existingPending) {
      res.status(409).json({ success: false, error: 'You already have a pending report for this transaction.' });
      return;
    }
    storeId = transaction.storeId;
    estimatedAmt = undefined;
  }

  if (!storeId) {
    res.status(400).json({ success: false, error: 'storeId is required' });
    return;
  }

  const store = await prisma.store.findUnique({ where: { id: storeId }, select: { id: true, name: true } });
  if (!store) {
    res.status(404).json({ success: false, error: 'Store not found' });
    return;
  }

  const dispute = await prisma.pointsDispute.create({
    data: { customerId: req.user!.id, storeId: store.id, transactionId, description, estimatedAmt },
  });

  // Notify employees only — cashiers handled the transaction and can escalate
  sendPushToStoreEmployees(
    storeId,
    'New Missing-Points Report',
    `A customer reported missing cashback at ${store.name}. Review in the admin portal.`,
    'DISPUTE_SUBMITTED',
    disputeSubmittedUrlEmployee(),
  ).catch(() => {});

  res.status(201).json({ success: true, data: dispute });
}
```

Note on the `if (!storeId)` guard (added right before the store lookup): the Zod `.refine` already guarantees exactly one of `storeId`/`transactionId` is present at the request-validation level, and the `if (transactionId)` block always sets `storeId` when taking that branch — so this guard is never actually reachable in practice. It exists purely so TypeScript can narrow `storeId` from `string | undefined` to `string` without a non-null assertion, consistent with this codebase's general style of preferring explicit checks over `!`.

- [ ] **Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors from this file.

- [ ] **Step 3: Commit**

```bash
git add backend/src/controllers/dispute.controller.ts
git commit -m "feat: accept transactionId as an alternative to storeId in submitDispute"
```

---

### Task 3: Fetch endpoints — include the linked transaction

**Files:**
- Modify: `backend/src/controllers/dispute.controller.ts:45-52` (`getMyDisputes`)
- Modify: `backend/src/controllers/dispute.controller.ts:54-73` (`getStoreDisputes`)
- Modify: `backend/src/controllers/dispute.controller.ts:89-103` (`getAllDisputes`)

**Interfaces:**
- Consumes: `PointsDispute.transaction` relation from Task 1.
- Produces: every dispute object returned by these three endpoints now includes a `transaction` field (`{ id, purchaseAmount, category, status, createdAt, receiptImageUrl, grantedBy?: { name } } | null`) — consumed by Task 6 (mobile `my-disputes.tsx`) and Task 7 (admin `Customers.tsx`). `getMyDisputes`'s transaction object has no `grantedBy` field (mobile doesn't need it); `getStoreDisputes`/`getAllDisputes` (both admin-consumed) include it.

- [ ] **Step 1: `getMyDisputes` — include transaction summary (no `grantedBy`)**

Change:

```ts
export async function getMyDisputes(req: AuthRequest, res: Response) {
  const disputes = await prisma.pointsDispute.findMany({
    where: { customerId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: { store: { select: { name: true } } },
  });
  res.json({ success: true, data: disputes });
}
```

to:

```ts
export async function getMyDisputes(req: AuthRequest, res: Response) {
  const disputes = await prisma.pointsDispute.findMany({
    where: { customerId: req.user!.id },
    orderBy: { createdAt: 'desc' },
    include: {
      store: { select: { name: true } },
      transaction: {
        select: {
          id: true,
          purchaseAmount: true,
          category: true,
          status: true,
          createdAt: true,
          receiptImageUrl: true,
        },
      },
    },
  });
  res.json({ success: true, data: disputes });
}
```

- [ ] **Step 2: `getStoreDisputes` — include transaction summary with `grantedBy`**

Change:

```ts
  const disputes = await prisma.pointsDispute.findMany({
    where: { storeId, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
    },
  });
```

to:

```ts
  const disputes = await prisma.pointsDispute.findMany({
    where: { storeId, ...(status ? { status: status as any } : {}) },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
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
    },
  });
```

- [ ] **Step 3: `getAllDisputes` — include transaction summary with `grantedBy`**

Change:

```ts
  const disputes = await prisma.pointsDispute.findMany({
    where: {
      ...(status  ? { status: status as any } : {}),
      ...(storeId ? { storeId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      store:    { select: { id: true, name: true } },
    },
  });
```

to:

```ts
  const disputes = await prisma.pointsDispute.findMany({
    where: {
      ...(status  ? { status: status as any } : {}),
      ...(storeId ? { storeId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      store:    { select: { id: true, name: true } },
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
    },
  });
```

- [ ] **Step 4: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add backend/src/controllers/dispute.controller.ts
git commit -m "feat: include linked transaction summary in dispute-fetch endpoints"
```

---

### Task 4: Mobile — API client type + new `DisputeTransactionModal` component

**Files:**
- Modify: `mobile/services/api.ts:154-157` (`disputeApi.submit`)
- Create: `mobile/components/DisputeTransactionModal.tsx`

**Interfaces:**
- Consumes: `POST /api/disputes` accepting `{ transactionId, description }` from Task 2.
- Produces: `DisputeTransactionModal` component with props `{ visible: boolean; onClose: () => void; transaction: { id: string; store?: { name?: string }; createdAt: string; purchaseAmount: number; category?: string } | null }` — consumed by Task 5 (`history.tsx`).

- [ ] **Step 1: Widen `disputeApi.submit`'s type**

In `mobile/services/api.ts`, change:

```ts
export const disputeApi = {
  submit: (data: { storeId: string; description: string; estimatedAmt?: number }) =>
    api.post('/disputes', data),
```

to:

```ts
export const disputeApi = {
  submit: (data: { storeId: string; description: string; estimatedAmt?: number } | { transactionId: string; description: string }) =>
    api.post('/disputes', data),
```

- [ ] **Step 2: Create `DisputeTransactionModal.tsx`**

Create `mobile/components/DisputeTransactionModal.tsx`:

```tsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Modal, KeyboardAvoidingView, Platform, TextInput,
} from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { format } from 'date-fns';
import { disputeApi } from '../services/api';
import { COLORS } from '../constants';
import ModalCloseButton from './ModalCloseButton';

const DESC_MIN = 10;
const DESC_MAX = 500;

interface DisputedTransaction {
  id: string;
  store?: { name?: string };
  createdAt: string;
  purchaseAmount: number;
  category?: string;
}

export default function DisputeTransactionModal({
  visible,
  onClose,
  transaction,
}: {
  visible: boolean;
  onClose: () => void;
  transaction: DisputedTransaction | null;
}) {
  const qc = useQueryClient();
  const [desc, setDesc] = useState('');

  const descValid = desc.trim().length >= DESC_MIN && desc.trim().length <= DESC_MAX;

  const submitMutation = useMutation({
    mutationFn: () => disputeApi.submit({
      transactionId: transaction!.id,
      description: desc.trim(),
    }),
    onSuccess: () => {
      Toast.show({ type: 'success', text1: 'Report submitted', text2: "We'll review this transaction." });
      qc.invalidateQueries({ queryKey: ['my-disputes'] });
      setDesc('');
      onClose();
    },
    onError: (err: any) => {
      const serverMsg = err.response?.data?.error;
      Toast.show({
        type: 'error',
        text1: typeof serverMsg === 'string' ? serverMsg : 'Submission failed',
        text2: typeof serverMsg === 'string' ? undefined : 'Please try again.',
      });
    },
  });

  if (!transaction) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={m.root}>
          <View style={m.header}>
            <Text style={m.title}>Dispute This Transaction</Text>
            <ModalCloseButton onPress={onClose} label="Close dispute form" color="#fff" style={m.closeBtn} />
          </View>
          <View style={m.summary}>
            <Text style={m.summaryStore}>{transaction.store?.name || 'Lucky Stop'}</Text>
            <Text style={m.summaryMeta}>
              {format(new Date(transaction.createdAt), 'MMM d, yyyy · h:mm a')} · ${Number(transaction.purchaseAmount).toFixed(2)}
              {transaction.category ? ` · ${transaction.category.replace(/_/g, ' ')}` : ''}
            </Text>
          </View>
          <View style={m.body}>
            <Text style={m.label}>What's wrong?</Text>
            <TextInput
              style={[m.input, { minHeight: 100, textAlignVertical: 'top' }]}
              value={desc}
              onChangeText={setDesc}
              placeholder="e.g. I got fewer points than expected, or the category looks wrong..."
              placeholderTextColor={COLORS.textMuted}
              multiline
              numberOfLines={4}
              maxLength={DESC_MAX}
            />
            <Text style={[m.hint, desc.length > 0 && !descValid && m.hintError]}>
              {desc.trim().length}/{DESC_MIN} characters minimum
            </Text>

            <TouchableOpacity
              style={[m.submitBtn, (!descValid || submitMutation.isPending) && { opacity: 0.5 }]}
              onPress={() => submitMutation.mutate()}
              disabled={!descValid || submitMutation.isPending}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Submit transaction dispute"
            >
              {submitMutation.isPending
                ? <ActivityIndicator color="#fff" />
                : <Text style={m.submitBtnText}>Submit Report</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const m = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, paddingBottom: 12,
    backgroundColor: '#f97316',
  },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  title: { color: '#fff', fontSize: 18, fontWeight: '900' },
  summary: { paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryStore: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  summaryMeta: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  body: { flex: 1, paddingHorizontal: 20, paddingTop: 16, gap: 12 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 12,
    padding: 14, fontSize: 16, color: COLORS.text, backgroundColor: COLORS.white,
  },
  hint: { fontSize: 11, color: COLORS.textMuted, marginTop: -6 },
  hintError: { color: COLORS.error },
  submitBtn: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 4 },
  submitBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
```

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors (the component isn't imported anywhere yet, so this just checks it's individually well-typed).

- [ ] **Step 4: Commit**

```bash
git add mobile/services/api.ts mobile/components/DisputeTransactionModal.tsx
git commit -m "feat: add DisputeTransactionModal and widen disputeApi.submit type"
```

---

### Task 5: `history.tsx` — receipt image + "Dispute this transaction" wiring

**Files:**
- Modify: `mobile/app/(customer)/history.tsx`

**Interfaces:**
- Consumes: `DisputeTransactionModal` from Task 4; `receiptImageUrl` already present on every transaction object from `pointsApi.getMyHistory()` (no backend change needed, see Global Constraints).

- [ ] **Step 1: Add the `Image` import and `DisputeTransactionModal` import**

Change (line 1):

```ts
import { View, Text, FlatList, StyleSheet, ActivityIndicator, StatusBar, TouchableOpacity, Modal } from 'react-native';
```

to:

```ts
import { View, Text, FlatList, StyleSheet, ActivityIndicator, StatusBar, TouchableOpacity, Modal, Image } from 'react-native';
```

Add near the other local imports (after the `PulseHighlight` import):

```ts
import DisputeTransactionModal from '../../components/DisputeTransactionModal';
```

- [ ] **Step 2: Add dispute-target state**

Change (line 21):

```ts
export default function HistoryScreen() {
  const [selected, setSelected] = useState<any>(null);
```

to:

```ts
export default function HistoryScreen() {
  const [selected, setSelected] = useState<any>(null);
  const [disputeTarget, setDisputeTarget] = useState<any>(null);
```

- [ ] **Step 3: Add receipt image and the "Dispute this transaction" button to the detail modal**

Change (lines 168-186):

```tsx
              {selected.notes ? (
                <View style={d.row}>
                  <Text style={d.rowLabel}>Notes</Text>
                  <Text style={d.rowValue}>{selected.notes}</Text>
                </View>
              ) : null}

              <TouchableOpacity
                style={d.closeBtn}
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                accessibilityLabel="Close transaction details"
              >
                <Text style={d.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}
```

to:

```tsx
              {selected.notes ? (
                <View style={d.row}>
                  <Text style={d.rowLabel}>Notes</Text>
                  <Text style={d.rowValue}>{selected.notes}</Text>
                </View>
              ) : null}

              {selected.receiptImageUrl ? (
                <Image source={{ uri: selected.receiptImageUrl }} style={d.receiptImg} resizeMode="cover" />
              ) : null}

              <TouchableOpacity
                style={d.disputeBtn}
                onPress={() => { setDisputeTarget(selected); setSelected(null); }}
                accessibilityRole="button"
                accessibilityLabel="Dispute this transaction"
              >
                <Text style={d.disputeBtnText}>Dispute This Transaction</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={d.closeBtn}
                onPress={() => setSelected(null)}
                accessibilityRole="button"
                accessibilityLabel="Close transaction details"
              >
                <Text style={d.closeBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}

      <DisputeTransactionModal
        visible={!!disputeTarget}
        onClose={() => setDisputeTarget(null)}
        transaction={disputeTarget}
      />
    </View>
  );
}
```

(Tapping "Dispute This Transaction" closes the detail sheet and opens the dispute modal in sequence — these are two separate top-level `Modal`s, matching how `ReportModal` in `my-disputes.tsx` already opens independently rather than nesting inside another modal.)

- [ ] **Step 4: Add the new styles**

Change (in the `d` StyleSheet, the `closeBtn`/`closeBtnText` block):

```ts
  closeBtn: {
    marginTop: 16, width: '100%', backgroundColor: COLORS.primary,
    borderRadius: 16, padding: 16, alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
```

to:

```ts
  receiptImg: { width: '100%', height: 180, borderRadius: 16, marginTop: 12, backgroundColor: COLORS.border },
  disputeBtn: {
    marginTop: 16, width: '100%', backgroundColor: 'transparent',
    borderRadius: 16, padding: 16, alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.error,
  },
  disputeBtnText: { color: COLORS.error, fontSize: 15, fontWeight: '800' },
  closeBtn: {
    marginTop: 16, width: '100%', backgroundColor: COLORS.primary,
    borderRadius: 16, padding: 16, alignItems: 'center',
  },
  closeBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
```

- [ ] **Step 5: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add "mobile/app/(customer)/history.tsx"
git commit -m "feat: show receipt photo and dispute action on transaction detail"
```

---

### Task 6: `my-disputes.tsx` — show linked-transaction summary on dispute cards

**Files:**
- Modify: `mobile/app/(customer)/my-disputes.tsx:202-222`

**Interfaces:**
- Consumes: `d.transaction` field from Task 3's `getMyDisputes` response (`{ id, purchaseAmount, category, status, createdAt, receiptImageUrl } | null`).

- [ ] **Step 1: Add the transaction summary line**

Change:

```tsx
                <Text style={s.desc}>{d.description}</Text>
                {d.estimatedAmt != null && (
                  <Text style={s.meta}>Claimed purchase: ${Number(d.estimatedAmt).toFixed(2)}</Text>
                )}
```

to:

```tsx
                <Text style={s.desc}>{d.description}</Text>
                {d.transaction && (
                  <Text style={s.meta}>
                    Transaction: {new Date(d.transaction.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · ${Number(d.transaction.purchaseAmount).toFixed(2)} · {String(d.transaction.category || '').replace(/_/g, ' ')}
                  </Text>
                )}
                {d.estimatedAmt != null && (
                  <Text style={s.meta}>Claimed purchase: ${Number(d.estimatedAmt).toFixed(2)}</Text>
                )}
```

No new imports or styles needed — reuses the existing `s.meta` style.

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(customer)/my-disputes.tsx"
git commit -m "feat: show linked transaction summary on dispute cards"
```

---

### Task 7: Admin — transaction + receipt in the Resolve Dispute modal

**Files:**
- Modify: `admin/src/pages/Customers.tsx:415-419` (Resolve Dispute modal body)
- Modify: `admin/src/pages/Customers.tsx` (style object `s`, add near `resolveBtn`)

**Interfaces:**
- Consumes: `resolveTarget.transaction` field from Task 3's `getStoreDisputes`/`getAllDisputes` responses (`{ id, purchaseAmount, category, status, createdAt, receiptImageUrl, grantedBy?: { name } } | null`).

- [ ] **Step 1: Add the linked-transaction block to the Resolve Dispute modal**

Change:

```tsx
            <div style={{ textAlign: 'left', marginBottom: 16 }}>
              <div style={s.disputeCustomer}>{resolveTarget.customer?.name || resolveTarget.customer?.phone}</div>
              <div style={{ fontSize: 15, color: '#5a6472', marginTop: 4, lineHeight: 1.5 }}>{resolveTarget.description}</div>
              {resolveTarget.estimatedAmt && <div style={{ fontSize: 14, color: '#5a6472', marginTop: 4 }}>Estimated: ${Number(resolveTarget.estimatedAmt).toFixed(2)}</div>}
            </div>
```

to:

```tsx
            <div style={{ textAlign: 'left', marginBottom: 16 }}>
              <div style={s.disputeCustomer}>{resolveTarget.customer?.name || resolveTarget.customer?.phone}</div>
              <div style={{ fontSize: 15, color: '#5a6472', marginTop: 4, lineHeight: 1.5 }}>{resolveTarget.description}</div>
              {resolveTarget.estimatedAmt && <div style={{ fontSize: 14, color: '#5a6472', marginTop: 4 }}>Estimated: ${Number(resolveTarget.estimatedAmt).toFixed(2)}</div>}
              {resolveTarget.transaction && (
                <div style={s.linkedTxCard}>
                  <div style={s.linkedTxHeader}>Linked Transaction</div>
                  <div style={s.linkedTxRow}>
                    {format(new Date(resolveTarget.transaction.createdAt), 'MMM d, yyyy · h:mm a')} · ${Number(resolveTarget.transaction.purchaseAmount).toFixed(2)} · {String(resolveTarget.transaction.category || '').replace(/_/g, ' ')}
                  </div>
                  <div style={s.linkedTxRow}>Granted by: {resolveTarget.transaction.grantedBy?.name || 'Unknown'} · Status: {resolveTarget.transaction.status}</div>
                  {resolveTarget.transaction.receiptImageUrl ? (
                    <a href={resolveTarget.transaction.receiptImageUrl} target="_blank" rel="noopener noreferrer">
                      <img src={resolveTarget.transaction.receiptImageUrl} alt="Receipt" style={s.linkedTxReceipt} />
                    </a>
                  ) : (
                    <div style={{ ...s.linkedTxRow, fontStyle: 'italic' }}>No receipt photo on file</div>
                  )}
                </div>
              )}
            </div>
```

`format` is already imported at the top of this file (`import { format } from 'date-fns';`) — no new import needed.

- [ ] **Step 2: Add the new styles**

Change (the `resolveBtn` style block, followed by the `// Fraud badge` comment):

```ts
  resolveBtn: {
    padding: '8px 18px', background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, flexShrink: 0,
  },

  // Fraud badge
```

to:

```ts
  resolveBtn: {
    padding: '8px 18px', background: '#1D3557', color: '#fff', border: 'none',
    borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: 15, flexShrink: 0,
  },

  linkedTxCard: {
    marginTop: 10, padding: '12px 14px', background: '#f8fafc',
    borderRadius: 12, borderWidth: '1px', borderStyle: 'solid', borderColor: '#e5e7eb',
  },
  linkedTxHeader: { fontSize: 12, fontWeight: 700, color: '#5a6472', textTransform: 'uppercase' as const, letterSpacing: 0.5, marginBottom: 6 },
  linkedTxRow: { fontSize: 14, color: '#374151', marginBottom: 4 },
  linkedTxReceipt: { width: '100%', maxHeight: 220, borderRadius: 10, objectFit: 'cover' as const, marginTop: 6, cursor: 'pointer' },

  // Fraud badge
```

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/Customers.tsx
git commit -m "feat: show linked transaction and receipt in the Resolve Dispute modal"
```

---

### Task 8: Final verification pass

**Files:**
- None (verification only)

- [ ] **Step 1: Full typecheck across all three sub-apps**

Run: `cd backend && npx tsc --noEmit`
Run: `cd mobile && npx tsc --noEmit`
Run: `cd admin && npx tsc --noEmit`
Expected: no errors in any.

- [ ] **Step 2: Manual click-through**

1. As a customer, open a transaction in History with a receipt photo → confirm the photo displays in the detail sheet, and a "Dispute This Transaction" button appears.
2. Tap it, submit a description under 10 characters → confirm the submit button stays disabled.
3. Submit a valid description → confirm success toast, and the report appears in "My Reports" with the transaction summary line (date · amount · category) showing above the description.
4. Try disputing the same transaction again → confirm a 409 with a friendly "you already have a pending report" message (not a raw error).
5. As admin, open the Disputes tab, click "Review" on the linked dispute → confirm the transaction summary (date, amount, category, granted-by, status) and the receipt photo appear inline in the modal, and clicking the photo opens the full image in a new tab.
6. Resolve it (approve with a credit amount) → confirm it credits correctly and the customer gets notified, same as before this plan.
7. Confirm the **existing generic flow still works unchanged**: use the "+ Report" button in "My Reports", fill in store/description/amount, submit — confirm no linked-transaction line appears on that card (since it has no `transactionId`), and admin's Resolve modal shows no "Linked Transaction" block for it.

- [ ] **Step 3: No commit needed** — this task is verification only.
