# Admin Rates Page: Clarity Rework

## Problem

The admin Rates page (`admin/src/pages/Rates.tsx`) lets DevAdmin configure per-tier cashback rates and per-category bonus rates, but two things make it hard to reason about the actual numbers customers/stores end up with:

1. **Stacking isn't obvious.** The category bonus table's copy doesn't make clear that the bonus is a permanent, unconditional addition to the tier rate on every purchase — not a promotion.
2. **No full picture.** The category table's "effective rate" column only previews one tier (Bronze), and does so via a hardcoded bug: `const effective = !isNaN(numVal) ? 1 + numVal : 1;` (line 391) literally hardcodes "1" as if Bronze's tier rate is always exactly 1%, instead of reading the real, live Bronze `cashbackRate` from the already-loaded `tiers` array. If Bronze's rate is ever changed, this column silently shows stale/wrong numbers.

Separately, the static "How rates apply" example box shows a frozen illustrative number (`Gold tier base rate 3.0%`, `Active promo +2.0%`, `= $2.50` on $50) that doesn't reflect live configured rates at all.

Dev cut (the store's cost on top of cashback) is configured per-store (currently 4% for most stores, 8% for one), not chain-wide, so this page cannot show a single "store cost %" number without it being misleading for at least one store. Decision: this rework stays focused on cashback clarity; store cost is addressed with an explanatory note pointing to the per-store config, not a fabricated number.

## Changes

### 1. Category Bonus table → full tier matrix

Replace the current header/columns:
```
Category | Bonus % | Example (Bronze 1% base) | [actions]
```
with:
```
Category | Bonus % | Bronze | Silver | Gold | Diamond | Platinum | [actions]
```

Each of the five new columns shows that row's combined effective rate for that tier: `tierRate(tierKey) + categoryBonus`, where `tierRate(tierKey)` is read live from the `tiers` array (`RateRow[]`, already fetched via `billingApi.getTierRates()` and in scope on this page) — not a hardcoded constant. This replaces the single, buggy "Example (Bronze 1% base)" column and directly fixes the hardcoding bug as a side effect of computing real per-tier values instead of assuming Bronze=1%.

The existing GAS/DIESEL-in-¢/gallon-mode special case (where those two rows currently show a "redirect badge" instead of an editable %, since category bonus doesn't apply in ¢/gallon mode) is preserved — when `showPerGallon` is true, those rows keep their existing `colSpan` badge row instead of rendering the new 5-column matrix.

### 2. Clearer stacking explanation

Update the category section's subtitle from:
> "Add an extra cashback % on top of the tier base rate for specific product categories. Set to 0% to use only the tier rate for that category."

to:
> "This bonus adds to the tier base rate on every purchase in this category — it's not a promotion, it's a permanent part of the rate. The columns to the right show the resulting total cashback % for each tier."

### 3. Live "How rates apply" example

Replace the hardcoded calc box (currently showing a frozen "Gold tier base rate 3.0% + Active promo +2.0% = $2.50 on $50" example) with one computed from real loaded data: use the tier with the highest configured `cashbackRate` (typically Platinum, but computed dynamically rather than assumed) and show its actual current rate, with the existing $50 illustrative purchase amount kept as a round, easy-to-follow number (only the rate itself becomes live, not the example purchase amount).

### 4. Store-cost clarity note

Add a short, single-line note near the top of the page (below the existing page subtitle, or as a small info callout): *"Store cost = cashback paid out × (1 + that store's dev cut rate). Dev cut rate is set per-store on the Stores page, not here."* This avoids fabricating a chain-wide "store cost %" that wouldn't be accurate for every store, while still answering the "who bears what cost" question raised earlier.

## Out of scope

- No changes to the per-tier table's columns or the Gas/Diesel ¢-per-gallon toggle/table.
- No changes to any actual rate values — the DevAdmin applies new values themselves through this page once it ships.
- No changes to `backend/` — this is a frontend-only, read/display change. The existing `billingApi.getTierRates()`/`getCategoryRates()` endpoints and their data shapes are unchanged.
- No new "store cost" dollar figures or per-store rate selector — deliberately deferred per the discussion above.
