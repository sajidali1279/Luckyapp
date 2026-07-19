# Order List Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the visual, functional, and UX gaps in the Order List feature (manager mobile + admin web) surfaced by a full research pass on 2026-07-18, without touching anything the original 2026-07-11/07-12 design intentionally scoped out.

**Architecture:** No new models, no new endpoints except where noted — this is entirely UI-layer work (mobile screen + admin page) plus one small backend addition (push-free; just wiring an already-Zod-validated field through). Every fix targets a concretely identified rough edge from the research pass, not a speculative "nice to have."

**Tech Stack:** React Native + Expo Router (mobile), React + react-router-dom (admin, inline `style` objects — no Tailwind/CSS modules in this codebase), Node/Express + Prisma (backend). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through against `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` (append a new section there in the final task).

**Research:** All findings below come from a full-repo research pass (mobile `order-list.tsx`, admin `OrderList.tsx`, `backend/src/controllers/orderList.controller.ts`, `backend/prisma/schema.prisma`, and the existing 2026-07-11 spec + 2026-07-12 plan for this feature) done in the same session as this plan — not re-cited per task below, just noted here once.

## Global Constraints

- Do not touch: `Store.orderInstructions` living on `Store` (not `OrderList`) with no historical snapshot — deliberate, per the 2026-07-11 spec. Do not add per-list instruction history.
- Do not touch: auto-reopen-on-close behavior (always happens, no toggle) — deliberate, per the same spec.
- Do not add a push notification for standing-instructions changes — explicitly deferred in the original spec as a future follow-up, out of scope here.
- Do not change the SuperAdmin/DevAdmin permission split on admin (`canEdit = isDevAdmin` for item add/edit/remove and request review; `canClose = isDevAdmin || isSuperAdmin` for closing lists and editing instructions) — confirmed with the user this session: keep as-is.
- Do not touch `admin/src/pages/OrderList.tsx`'s `RequestsTab` (the Stock/`EmployeeItemRequest` review UI currently embedded in this page) or its Categories tab — a separate plan (`docs/superpowers/plans/2026-07-18-requests-hub-redesign.md`) removes `RequestsTab` entirely and relocates that functionality into a new unified admin Requests hub. Touching it here would be wasted work. If that plan hasn't landed yet when you execute this one, `RequestsTab` and Categories tab are simply not part of this plan's scope either way.
- Backend `addItem`/`updateItem` already accept `notes` in their Zod schemas (`backend/src/controllers/orderList.controller.ts:217-223,247-253`) — confirmed via direct code read. No backend schema/validation changes are needed for the notes-field task below, only wiring on the mobile client.

---

## File Structure

**Mobile — modified:**
- `mobile/app/(manager)/order-list.tsx` — notes field on add/edit, edit-menu fix, instructions char counter, store-tab scroll fade

**Admin — modified:**
- `admin/src/pages/OrderList.tsx` — detail-view polling parity, print popup-blocked fallback, error-state consistency, item-row visual polish

**Docs — modified:**
- `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` — append a verification section for this work

---

### Task 1: Mobile — add a Notes field to item add/edit

**Files:**
- Modify: `mobile/app/(manager)/order-list.tsx` (the `QuickAddBar` component, ~lines 350-604, and the `EditItemSheet` component, ~lines 606-700 — read the file first to get exact current line numbers, it may have shifted since this plan was written)

**Context:** The backend already accepts `notes` on both create and update. The admin web page already *displays* `item.notes` when present (populated today only via accepted employee-request lines). Right now a manager typing an item directly on mobile has no way to attach a note (e.g. "get the 12-pack, not singles") — this task closes that gap on both the add flow and the edit flow.

- [ ] **Step 1: Read the current file to confirm exact structure**

Run: read `mobile/app/(manager)/order-list.tsx` in full, or at minimum the `QuickAddBar` function and `EditItemSheet` function, plus the `addItemMutation`/`updateItemMutation`/`editForm` state near the top of `OrderListScreen`. Confirm current line numbers before editing — this file is actively touched by other work this session and line numbers may have moved.

- [ ] **Step 2: Add a notes field to the Quick Add Bar's expanded state**

The Quick Add Bar currently captures name + category + qty (parsed from trailing `x4`/`4x`) in one line, then calls `addItemMutation.mutate({ name, category, quantity, priority })` (or similar — confirm the exact call shape by reading the mutation definition). Add an optional collapsed "+ Note" affordance: a small text button under the input row that, when tapped, reveals a single-line `TextInput` (`maxLength={300}`, placeholder `"Add a note (optional)"`), and include its trimmed value as `notes` in the `addItemMutation.mutate(...)` payload (omit the key entirely, not empty string, when blank — match how `quantity`/`category` are already handled as optional in that same call). Reset the note text and collapse the field back after a successful add, alongside whatever other fields already reset there.

- [ ] **Step 3: Add a notes field to `EditItemSheet`**

`EditItemSheet` currently edits name/qty/priority chips/category with no notes field despite the schema and `updateItemMutation` (confirm exact mutation name by reading the file) supporting it. Add a `TextInput` (multiline, `maxLength={300}`, matching the visual style already used for the standing-instructions edit `TextInput` elsewhere in this same file — reuse that style object rather than inventing a new one) bound to a new local `notes` state initialized from `item.notes ?? ''` when the sheet opens for a given item. Include `notes: notes.trim() || null` in the update payload sent to `updateItemMutation.mutate(...)`.

- [ ] **Step 4: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add "mobile/app/(manager)/order-list.tsx"
git commit -m "feat: let managers attach a note when adding/editing an order-list item"
```

---

### Task 2: Mobile — stop offering "Edit Details" on items that can't be edited

**Files:**
- Modify: `mobile/app/(manager)/order-list.tsx` (the `ItemRow` component's overflow-menu `Alert.alert` options, ~line 253-262 — confirm current line number)

**Context:** The backend rejects `updateItem` with a 400 unless `item.status === 'PENDING'` (`orderList.controller.ts:265`). The mobile overflow menu currently always includes "Edit Details" regardless of status, so tapping it on an `ORDERED`/`RECEIVED` item opens the edit sheet, lets the manager type changes, then fails on save with a generic "Failed to update item" toast — a confusing dead end.

- [ ] **Step 1: Read the current `ItemRow` overflow-menu logic**

Confirm the exact current structure of the `Alert.alert(...)` options array (or however the "···" menu is built) and the `item.status` values available on that row.

- [ ] **Step 2: Gate "Edit Details" on `item.status === 'PENDING'`**

Only include the "Edit Details" option in the overflow menu when `item.status === 'PENDING'`. For `ORDERED`/`RECEIVED` items, the menu should still offer "Remove" only when the existing "Remove hidden once RECEIVED" rule allows it (don't change that rule — just add the same `PENDING`-only gate to Edit specifically). If removing "Edit Details" leaves the menu with zero options for a `RECEIVED` item (both Edit and Remove hidden), skip showing the "···" button/`Alert.alert` entirely for that row rather than opening an empty menu.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(manager)/order-list.tsx"
git commit -m "fix: hide Edit Details on order-list items that can't be edited"
```

---

### Task 3: Mobile — character counter on the standing-instructions editor

**Files:**
- Modify: `mobile/app/(manager)/order-list.tsx` (the standing-instructions banner's edit-mode `TextInput`, ~lines 1517-1555 — confirm current line number)

**Context:** The instructions `TextInput` already has `maxLength={300}` but silently truncates with no visible counter, so a manager writing a long note has no feedback about how much room is left until they hit the wall.

- [ ] **Step 1: Add a small counter row under the edit `TextInput`**

While in edit mode (the same conditional branch that renders the `TextInput` instead of the static text), render a small `Text` element below it showing `${instructionsDraft.length}/300` (use whatever the current local state variable for the in-progress edit value is called — confirm by reading the file). Style it small and muted (reuse an existing muted-text style token from this file, e.g. whatever `COLORS.textMuted`-based style is already used for similar helper text elsewhere in this screen — don't invent a new color).

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add "mobile/app/(manager)/order-list.tsx"
git commit -m "feat: show a character counter while editing order-list standing instructions"
```

---

### Task 4: Mobile — scroll-edge fade on the store-tab row

**Files:**
- Modify: `mobile/app/(manager)/order-list.tsx` (the store-tab horizontal `ScrollView`, ~lines 1413+, and its `StyleSheet.create` block)

**Context:** For a manager assigned to several stores, the horizontal store-picker row has no visual cue that it scrolls — it can look like a truncated, complete list rather than a scrollable one. Add a subtle edge fade, matching the pattern already used for the ticker fade on `cliffindus.com` (a `LinearGradient` overlay, not `overflow`/`mask` tricks that don't work reliably cross-platform in RN).

- [ ] **Step 1: Confirm `expo-linear-gradient` is already a dependency**

Run: `cd mobile && cat package.json | grep linear-gradient`
Expected: `"expo-linear-gradient"` present (this package is already used elsewhere in this app for header gradients — confirm by grepping `mobile/app` for `LinearGradient` imports if the package.json check is ambiguous). If it's not present, stop and flag this to the user rather than adding a new dependency — this task is meant to be a small polish item, not a dependency-adding one.

- [ ] **Step 2: Wrap the store-tab `ScrollView` with two small edge-fade overlays**

Wrap the existing store-tab `ScrollView` in a `View` with `position: 'relative'`, and add two absolutely-positioned `LinearGradient` overlays (left: `colors={[COLORS.secondary, COLORS.secondary + '00']}` horizontal, ~20px wide, `pointerEvents="none"`; right: the mirrored gradient) so the fade matches whatever the header's background color already is at that point in the screen (confirm the exact background color token used behind the store-tab row by reading the surrounding `View`'s style — don't guess, it must match exactly or the fade will show a visible seam). Only render the fades when the tab row's content actually overflows (i.e., `stores.length` is large enough to scroll) — a cheap width check isn't required; simplest correct approach is to always render both fades but keep them thin/subtle enough that they're a non-issue when there's nothing to scroll.

- [ ] **Step 3: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add "mobile/app/(manager)/order-list.tsx"
git commit -m "feat: add scroll-edge fade to order-list store-tab row"
```

---

### Task 5: Admin — polling parity on the list-detail view

**Files:**
- Modify: `admin/src/pages/OrderList.tsx` (the `admin-order-list-detail` query, ~line 738-742)

**Context:** The list-grid overview and the pending-requests panel both poll every 30s (`refetchInterval: 30000`). The detail view's main item-list query has no interval at all, so if a manager is actively editing the same list on mobile while an admin has it open, the admin's view silently goes stale until they trigger a mutation or navigate away and back.

- [ ] **Step 1: Add `refetchInterval: 30000` to the detail query**

Add the same `refetchInterval: 30000` option already used by the two other queries in this file to the `admin-order-list-detail` `useQuery` call.

- [ ] **Step 2: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add admin/src/pages/OrderList.tsx
git commit -m "fix: poll order-list detail view every 30s to match the rest of the page"
```

---

### Task 6: Admin — handle blocked print popups

**Files:**
- Modify: `admin/src/pages/OrderList.tsx` (the `printList` function, ~lines 91-147)

**Context:** `printList` calls `window.open(...)` and silently `return`s if it's `null` (blocked by the browser's popup blocker) — the admin gets no feedback at all that anything went wrong. Mobile's equivalent flow gives an explicit choice plus an error toast; this brings admin to the same standard.

- [ ] **Step 1: Read the current `printList` function in full**

Confirm the exact `window.open` call and what toast library/pattern this file already uses for errors elsewhere (it's `react-hot-toast`, imported as `toast` — confirm the import at the top of the file).

- [ ] **Step 2: Add a null-check with a toast**

Immediately after the `window.open(...)` call, if the returned window handle is falsy, call `toast.error('Popups are blocked — allow popups for this site to print, or use "Share as PDF" from the mobile app instead.')` and `return` before attempting to write to the (nonexistent) window.

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/OrderList.tsx
git commit -m "fix: show an error toast when the print popup is blocked instead of failing silently"
```

---

### Task 7: Admin — consistent error state on detail-load failure

**Files:**
- Modify: `admin/src/pages/OrderList.tsx` (the list-detail failure branch, ~line 769, and the `ErrorState` import already used elsewhere in this same file for the grid view)

**Context:** The list-grid view already uses the shared `ErrorState` component (with retry) on query failure. The detail view's failure path instead falls through to a bare `<div style={s.empty}>Failed to load list.</div>` with no retry button — an inconsistency within the same file.

- [ ] **Step 1: Find the detail-load failure branch and the query's `refetch` function**

Confirm the exact `isError`/`refetch` names on the `admin-order-list-detail` query (same query touched in Task 5).

- [ ] **Step 2: Replace the bare error text with `ErrorState`**

Replace `<div style={s.empty}>Failed to load list.</div>` with `<ErrorState message="Failed to load this order list." onRetry={refetch} />`, matching exactly how the grid view already calls this component earlier in the same file (same prop names).

- [ ] **Step 3: Verify**

Run: `cd admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/OrderList.tsx
git commit -m "fix: use the shared ErrorState component on order-list detail-load failure"
```

---

### Task 8: Admin — visual polish pass on Order Lists tab item rows

**Files:**
- Modify: `admin/src/pages/OrderList.tsx` (item-row rendering inside `OrderListDetail`, ~lines 600-670, and its `StyleSheet`-equivalent `s` object)

**Context:** Research flagged the Categories tab as visibly more polished (dedicated table layout, clear status pills, inline hint banner) than the Order Lists tab's plainer item rows. This task brings the item-row visual language closer to that bar without a full rewrite — same information, better hierarchy.

- [ ] **Step 1: Read both the Categories tab's row styling and the current Order Lists item-row styling**

Identify the concrete differences: pill/badge shape and color usage, spacing rhythm, font-weight hierarchy between primary text (item name) and secondary text (category/notes).

- [ ] **Step 2: Apply the Categories tab's pill/spacing conventions to item rows**

Update the item-row style object(s) so status/priority indicators use the same pill shape (border-radius, padding, font-size/weight) already established in the Categories tab, and align spacing (row padding, gap between name/category/notes lines) to the same rhythm. Do not change any interactive behavior in this task (click-to-advance status, inline qty edit, remove button) — this is styling only.

- [ ] **Step 3: Verify visually**

Run: `cd admin && npm run build` (production build catches bundler-level issues faster than a full manual login flow) and confirm it completes with no new errors. A full visual check needs a real DevAdmin/SuperAdmin login against live data — note in the final task's manual-checklist entry that this specific item needs an on-screen look once deployed.

- [ ] **Step 4: Commit**

```bash
git add admin/src/pages/OrderList.tsx
git commit -m "style: align Order Lists tab item-row visuals with the Categories tab"
```

---

### Task 9: Append manual verification section to the consolidated checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Append a new section**

Add a new `## 6. Order List polish (2026-07-18)` section at the end of the file with these unchecked items:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add Order List polish section to the manual test checklist"
```
