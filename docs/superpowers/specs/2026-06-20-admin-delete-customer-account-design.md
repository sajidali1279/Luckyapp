# Delete Customer Account (Admin Panel, DevAdmin-only)

## Problem

DevAdmin needs a way to permanently delete a customer account from the admin panel. The backend endpoint for this already exists (`DELETE /users/:userId`, DevAdmin-only) but is missing cleanup for three related tables, so it 500s for customers who have ever redeemed a catalog reward, rated an employee, or placed a hot food order. There is also no UI entry point for it yet.

## Backend fix

`backend/src/controllers/auth.controller.ts` — `deleteUser` (around line 601) hard-deletes a `User` and manually cleans up dependent rows that lack `onDelete: Cascade` in the Prisma schema. It currently cleans up `PointsTransaction`, `CreditRedemption`, `Redemption`, `UserStoreRole`, `PushToken`, but is missing:

- `CatalogRedemption` (`customerId`, `processedById` — both reference `User` with no cascade)
- `EmployeeRating` (`customerId`, `employeeId` — both reference `User` with no cascade)
- `HotFoodOrder` (`customerId` — references `User` with no cascade; `HotFoodOrderItem` cascades from `HotFoodOrder` so no separate cleanup needed)

Add `deleteMany` calls for these three models before `prisma.user.delete()`, inside the existing try/catch.

No route or RBAC change needed — the route is already gated with `requireRole(Role.DEV_ADMIN)`. The self-delete guard (`Cannot delete your own account`) already exists.

## Admin API client

`admin/src/services/api.ts` — add to `customersApi` (around line 108):

```ts
delete: (userId: string) => api.delete(`/users/${userId}`),
```

## Admin UI

`admin/src/pages/Customers.tsx`:

- Visibility: gate strictly on `user?.role === 'DEV_ADMIN'`. The existing `isSuperAdmin` flag also includes `SUPER_ADMIN` and must NOT be reused here — this button must not render for SuperAdmin.
- Add a "🗑 Delete Account" button on each customer card, next to the existing Restrict/Restore button, rendered only for DevAdmin. Styled distinctly (darker red) from the Restrict button so the two destructive-ish actions are visually distinguishable.
- New state `deleteTarget: { id: string; name: string } | null`, mirroring the existing `confirmTarget` pattern.
- New confirm modal, reusing existing modal styles (`s.backdrop`, `s.modal`, etc.), with copy: *"Permanently delete {name}? This erases their points balance, transaction history, and redemptions. This cannot be undone."* Simple confirm (no typed name) — matches the existing Restrict/Restore confirmation pattern per user preference.
- New `deleteMutation` calling `customersApi.delete(id)`. On success: toast, invalidate `['customers']` query, close modal. On error: toast showing the server error message (`err.response.data.error` if present) rather than a generic failure message, so any unexpected FK error surfaces clearly to the DevAdmin instead of failing silently.

## Out of scope

- No soft-delete/undo. This is a hard delete, matching the existing backend endpoint's behavior.
- No bulk delete.
- No changes to the customer-facing mobile app.
