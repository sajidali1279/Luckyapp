# Rates Page Clarity Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin Rates page show the real, live combined cashback rate (tier + category bonus) across all five tiers at once, fix a hardcoded-Bronze-rate bug, and replace a frozen example with a live one — display logic only, no rate values or backend changes.

**Architecture:** Single-file change to `admin/src/pages/Rates.tsx`. Extends the existing category bonus table from one buggy preview column to five real per-tier columns, computed from data already loaded on the page (`tiers`). Updates copy and one calc-box example to read from that same live data instead of frozen constants.

**Tech Stack:** React + TypeScript, Vite. No test runner exists in this project — verification is `npx tsc --noEmit`, `npm run build`, and a manual visual check in the dev server (described per task).

**Spec:** `docs/superpowers/specs/2026-06-21-rates-page-clarity-rework-design.md`

---

### Task 1: Category table — replace single buggy column with 5 live per-tier columns

**Files:**
- Modify: `admin/src/pages/Rates.tsx` (category table header, around lines 369-381)
- Modify: `admin/src/pages/Rates.tsx` (category table row rendering, around lines 384-461)

- [ ] **Step 1: Add a small helper to look up a tier's live cashback rate**

Find the existing `fmtPct` helper near the top of the file:

```tsx
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }
```

Add a new helper immediately after it:

```tsx
function fmtPct(r: number) { return `${(r * 100).toFixed(1)}%`; }

function tierRateFor(tierKey: TierKey, tiers: RateRow[]): number {
  return tiers.find(t => t.tier === tierKey)?.cashbackRate ?? 0;
}
```

- [ ] **Step 2: Replace the category table header**

Find:

```tsx
              <tr style={s.thead}>
                <th style={{ ...s.th, width: 200 }}>Category</th>
                <th style={s.th}>
                  Bonus %
                  <div style={s.thSub}>added on top of tier base rate</div>
                </th>
                <th style={s.th}>
                  Example (Bronze 1% base)
                  <div style={s.thSub}>effective rate for a Bronze customer</div>
                </th>
                <th style={{ ...s.th, width: 100 }}></th>
              </tr>
```

(This is inside the category bonus table's `<thead>` — the second `<table>` on the page, in the "Category Bonus Rates" section, not the first per-tier table.)

Replace with:

```tsx
              <tr style={s.thead}>
                <th style={{ ...s.th, width: 180 }}>Category</th>
                <th style={s.th}>
                  Bonus %
                  <div style={s.thSub}>added on top of tier base rate</div>
                </th>
                {TIERS.map(tierKey => (
                  <th key={tierKey} style={{ ...s.th, textAlign: 'center' as const }}>
                    {TIER_META[tierKey].emoji} {tierKey[0] + tierKey.slice(1).toLowerCase()}
                    <div style={s.thSub}>total cashback %</div>
                  </th>
                ))}
                <th style={{ ...s.th, width: 80 }}></th>
              </tr>
```

- [ ] **Step 3: Replace the row rendering**

Find the entire `CATEGORIES.map((cat) => { ... })` block:

```tsx
              {CATEGORIES.map((cat) => {
                const meta = CAT_META[cat];
                const isGasDiesel = cat === 'GAS' || cat === 'DIESEL';
                const isDirty = catDirty.has(cat);
                const isSaving = catSaving === cat;
                const rawVal = catForm[cat] ?? '0';
                const numVal = parseFloat(rawVal);
                const effective = !isNaN(numVal) ? 1 + numVal : 1;

                // GAS/DIESEL in ¢/gallon mode — show redirect badge, no editable %
                if (isGasDiesel && showPerGallon) {
                  return (
                    <tr key={cat} style={s.tr}>
                      <td style={s.td}>
                        <div style={s.tierCell}>
                          <span style={s.catEmoji}>{meta.emoji}</span>
                          <div>
                            <div style={s.tierName}>{meta.label}</div>
                            <div style={s.tierSub}>{meta.desc}</div>
                          </div>
                        </div>
                      </td>
                      <td style={s.td} colSpan={3}>
                        <span style={s.perGallonBadge}>⛽ ¢/gallon mode — configure per-tier rates below</span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={cat} style={{ ...s.tr, ...(isDirty ? s.trDirty : {}) }}>
                    <td style={s.td}>
                      <div style={s.tierCell}>
                        <span style={s.catEmoji}>{meta.emoji}</span>
                        <div>
                          <div style={s.tierName}>{meta.label}</div>
                          <div style={s.tierSub}>{meta.desc}</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" max="20" step="0.5"
                          value={rawVal}
                          onChange={e => handleCatChange(cat, e.target.value)}
                          style={{ ...s.input, ...(isDirty ? s.inputDirty : {}) }}
                          placeholder="0"
                        />
                        <span style={s.suffix}>%</span>
                        {!isNaN(numVal) && numVal > 0 && (
                          <span style={s.preview}>+{numVal.toFixed(1)}% bonus</span>
                        )}
                        {!isNaN(numVal) && numVal === 0 && (
                          <span style={{ ...s.preview, color: '#adb5bd' }}>no bonus</span>
                        )}
                      </div>
                    </td>
                    <td style={s.td}>
                      {!isNaN(numVal) ? (
                        <span style={s.effectiveTag}>{effective.toFixed(1)}% effective</span>
                      ) : null}
                    </td>
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {isDirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} disabled={isSaving} onClick={() => handleCatSave(cat)}>
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button style={s.undoBtn} onClick={() => handleCatReset(cat)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}>✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
```

Replace with:

```tsx
              {CATEGORIES.map((cat) => {
                const meta = CAT_META[cat];
                const isGasDiesel = cat === 'GAS' || cat === 'DIESEL';
                const isDirty = catDirty.has(cat);
                const isSaving = catSaving === cat;
                const rawVal = catForm[cat] ?? '0';
                const numVal = parseFloat(rawVal);
                const bonusFraction = !isNaN(numVal) ? numVal / 100 : 0;

                // GAS/DIESEL in ¢/gallon mode — show redirect badge, no editable %
                if (isGasDiesel && showPerGallon) {
                  return (
                    <tr key={cat} style={s.tr}>
                      <td style={s.td}>
                        <div style={s.tierCell}>
                          <span style={s.catEmoji}>{meta.emoji}</span>
                          <div>
                            <div style={s.tierName}>{meta.label}</div>
                            <div style={s.tierSub}>{meta.desc}</div>
                          </div>
                        </div>
                      </td>
                      <td style={s.td} colSpan={7}>
                        <span style={s.perGallonBadge}>⛽ ¢/gallon mode — configure per-tier rates below</span>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={cat} style={{ ...s.tr, ...(isDirty ? s.trDirty : {}) }}>
                    <td style={s.td}>
                      <div style={s.tierCell}>
                        <span style={s.catEmoji}>{meta.emoji}</span>
                        <div>
                          <div style={s.tierName}>{meta.label}</div>
                          <div style={s.tierSub}>{meta.desc}</div>
                        </div>
                      </div>
                    </td>
                    <td style={s.td}>
                      <div style={s.inputGroup}>
                        <input
                          type="number"
                          min="0" max="20" step="0.5"
                          value={rawVal}
                          onChange={e => handleCatChange(cat, e.target.value)}
                          style={{ ...s.input, ...(isDirty ? s.inputDirty : {}) }}
                          placeholder="0"
                        />
                        <span style={s.suffix}>%</span>
                        {!isNaN(numVal) && numVal > 0 && (
                          <span style={s.preview}>+{numVal.toFixed(1)}% bonus</span>
                        )}
                        {!isNaN(numVal) && numVal === 0 && (
                          <span style={{ ...s.preview, color: '#adb5bd' }}>no bonus</span>
                        )}
                      </div>
                    </td>
                    {TIERS.map(tierKey => (
                      <td key={tierKey} style={{ ...s.td, textAlign: 'center' as const }}>
                        <span style={s.effectiveTag}>{fmtPct(tierRateFor(tierKey, tiers) + bonusFraction)}</span>
                      </td>
                    ))}
                    <td style={{ ...s.td, textAlign: 'right' }}>
                      {isDirty ? (
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button style={s.saveBtn} disabled={isSaving} onClick={() => handleCatSave(cat)}>
                            {isSaving ? '…' : 'Save'}
                          </button>
                          <button style={s.undoBtn} onClick={() => handleCatReset(cat)}>↩</button>
                        </div>
                      ) : (
                        <span style={s.savedTag}>✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
```

What changed: `effective` (the buggy `1 + numVal` hardcode) is gone, replaced by `bonusFraction` (the category bonus as a 0-1 fraction). The single "effective" `<td>` is replaced by a `TIERS.map(...)` producing one `<td>` per tier, each combining that tier's real live rate (via the new `tierRateFor` helper) with the category's bonus. The gas-mode redirect row's `colSpan` changes from `3` to `7` (it now needs to span Bonus% + 5 tier columns + actions = 7 columns, up from Bonus% + Example + actions = 3).

- [ ] **Step 4: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Rates.tsx
git commit -m "fix: category bonus table shows live per-tier rates instead of hardcoded Bronze example"
```

---

### Task 2: Clearer stacking explanation

**Files:**
- Modify: `admin/src/pages/Rates.tsx` (category section subtitle, around line 349-352)

- [ ] **Step 1: Update the subtitle text**

Find:

```tsx
          <p style={s.sectionSubtitle}>
            Add an extra cashback % on top of the tier base rate for specific product categories.
            Set to 0% to use only the tier rate for that category.
          </p>
```

Replace with:

```tsx
          <p style={s.sectionSubtitle}>
            This bonus adds to the tier base rate on every purchase in this category — it's not a
            promotion, it's a permanent part of the rate. The columns to the right show the
            resulting total cashback % for each tier.
          </p>
```

- [ ] **Step 2: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors (this is a text-only change, should be trivially clean).

- [ ] **Step 3: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Rates.tsx
git commit -m "docs: clarify that category bonus stacks unconditionally with tier rate"
```

---

### Task 3: Live "How rates apply" example

**Files:**
- Modify: `admin/src/pages/Rates.tsx` (add a derived value before the `return` statement)
- Modify: `admin/src/pages/Rates.tsx` (the "How rates apply" calc box, around lines 596-611)

- [ ] **Step 1: Add a `highestTier` derived value**

Find the line just before the component's `return (`:

```tsx
  return (
    <div style={s.page}>
```

Add immediately before it:

```tsx
  const highestTier = tiers.length > 0
    ? tiers.reduce((max, t) => (t.cashbackRate > max.cashbackRate ? t : max), tiers[0])
    : null;

  return (
    <div style={s.page}>
```

- [ ] **Step 2: Replace the calc box**

Find:

```tsx
        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>📐 How rates apply</div>
          <p style={s.infoCardText}>
            When an employee grants points, the customer's tier rate is used automatically.
            If an active promo exists, its bonus adds on top.
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}><span>Gold tier base rate</span><span style={{ color: '#F4A226', fontWeight: 700 }}>3.0%</span></div>
            <div style={s.calcRow}><span>Active promo</span><span style={{ color: '#2DC653', fontWeight: 700 }}>+ 2.0%</span></div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns on $50</span><span style={{ fontWeight: 800 }}>= $2.50</span>
            </div>
          </div>
        </div>
```

Replace with:

```tsx
        <div style={s.infoCard}>
          <div style={s.infoCardTitle}>📐 How rates apply</div>
          <p style={s.infoCardText}>
            When an employee grants points, the customer's tier rate is used automatically,
            plus any category bonus for that purchase (see the table above).
          </p>
          <div style={s.calcBox}>
            <div style={s.calcRow}>
              <span>{highestTier ? `${TIER_META[highestTier.tier as TierKey].emoji} ${highestTier.tier[0] + highestTier.tier.slice(1).toLowerCase()} tier base rate` : 'Tier base rate'}</span>
              <span style={{ color: '#F4A226', fontWeight: 700 }}>{highestTier ? fmtPct(highestTier.cashbackRate) : '—'}</span>
            </div>
            <div style={{ ...s.calcRow, borderTop: '1px solid #dee2e6', paddingTop: 8 }}>
              <span>Customer earns on $50</span>
              <span style={{ fontWeight: 800 }}>{highestTier ? `= $${(50 * highestTier.cashbackRate).toFixed(2)}` : '—'}</span>
            </div>
          </div>
        </div>
```

Note: the old "Active promo +2.0%" line is removed entirely rather than left hardcoded — this page has no live promo data to make that line non-stale too, so keeping a frozen "+2.0%" would just reintroduce the same staleness problem this task fixes. `highestTier` picks whichever tier currently has the highest configured `cashbackRate` (typically Platinum, but computed live rather than assumed).

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors. (`TierKey` must already be in scope as a type in this file — confirm by checking the top of the file for `type TierKey = typeof TIERS[number];`, which already exists.)

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Rates.tsx
git commit -m "feat: How rates apply example now uses live tier data instead of a frozen example"
```

---

### Task 4: Store-cost clarity note

**Files:**
- Modify: `admin/src/pages/Rates.tsx` (page header area, around line 198-212)
- Modify: `admin/src/pages/Rates.tsx` (styles object, add one new style)

- [ ] **Step 1: Add the note below the header row**

Find:

```tsx
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>🏆 Cashback Rates</h1>
          <p style={s.subtitle}>
            Set the base cashback % each customer tier earns. Promotions stack on top of these.
          </p>
        </div>
        {dirty.size > 0 && (
          <button style={s.saveAllBtn} onClick={handleSaveAll}>
            💾 Save {dirty.size} change{dirty.size > 1 ? 's' : ''}
          </button>
        )}
      </div>
```

Replace with:

```tsx
      <div style={s.headerRow}>
        <div>
          <h1 style={s.title}>🏆 Cashback Rates</h1>
          <p style={s.subtitle}>
            Set the base cashback % each customer tier earns. Promotions stack on top of these.
          </p>
        </div>
        {dirty.size > 0 && (
          <button style={s.saveAllBtn} onClick={handleSaveAll}>
            💾 Save {dirty.size} change{dirty.size > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div style={s.storeCostNote}>
        💡 Store cost = cashback paid out × (1 + that store's dev cut rate). Dev cut rate is set per-store on the Stores page, not here.
      </div>
```

- [ ] **Step 2: Add the `storeCostNote` style**

Find the `loading`/`error` style entries near the top of the `s` object:

```tsx
  loading: { textAlign: 'center' as const, color: '#6c757d', padding: 60, fontSize: 15 },
  error: { textAlign: 'center' as const, color: '#E63946', padding: 40, background: '#fff5f5', borderRadius: 10 },
```

Add immediately after them:

```tsx
  loading: { textAlign: 'center' as const, color: '#6c757d', padding: 60, fontSize: 15 },
  error: { textAlign: 'center' as const, color: '#E63946', padding: 40, background: '#fff5f5', borderRadius: 10 },

  storeCostNote: {
    background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10,
    padding: '10px 16px', fontSize: 14, color: '#1d4ed8', marginBottom: 24,
  },
```

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\admin && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add admin/src/pages/Rates.tsx
git commit -m "feat: add store-cost clarity note to Rates page"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `cd S:\LUCKYAPP\admin && npm run build`
Expected: `tsc && vite build` completes with no errors.

- [ ] **Step 2: Manual visual check**

Run: `cd S:\LUCKYAPP\admin && npm run dev`, open the printed local URL, log in, and go to the Rates page. Confirm:
- The Category Bonus Rates table now shows 5 tier columns (Bronze through Platinum) instead of one "Example (Bronze 1% base)" column, each showing a sensible combined %.
- Toggling Gas & Diesel Mode to "¢ / gallon" still correctly shows the redirect badge for the GAS and DIESEL rows in the category table, spanning the full row width without visual breakage (this is the colSpan change from Task 1 — confirm it doesn't look cut off or overflow).
- The category section's subtitle reads the new stacking-clarification copy.
- The "How rates apply" card at the bottom shows a tier name + real rate (not "Gold tier base rate 3.0%") and a dollar amount that's `50 × that rate`.
- A blue note near the top of the page mentions store cost and points to the Stores page.

Stop the dev server once confirmed (Ctrl+C). No commit needed for this verification-only task.

- [ ] **Step 3: Confirm no other files were touched**

Run: `cd S:\LUCKYAPP && git diff --stat b334596..HEAD`
Expected: only `admin/src/pages/Rates.tsx` appears (plus the earlier spec doc commit already made before this plan).
