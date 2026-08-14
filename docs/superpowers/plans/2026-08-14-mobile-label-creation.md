# Mobile Label Creation & Printing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Store Managers and Employees scan a physical item's barcode on mobile, name/price it, save it straight into the same chain-wide `Label` catalog admin web manages, and print/share the result — full create/edit/delete parity with admin web.

**Architecture:** No new backend tables. A permissions loosening on the existing `/labels` routes (`SUPER_ADMIN` → `EMPLOYEE` minimum role) lets mobile read/write the same `Label` table admin web already uses. A new shared `LabelsScreen.tsx` component (one implementation, re-exported by thin wrapper files in both `(manager)` and `(employee)` route trees — the same pattern this codebase already uses for `ManagerRequestsScreen`/`EmployeeRequestsScreen`-style screens, e.g. `requests.tsx`) reuses the existing `BarcodeScannerModal` for the scan→name→save-to-`ScannedProduct` step, and a new `mobile/utils/printLabels.ts` ports admin web's print-grid HTML/CSS almost verbatim, output via the existing `expo-print`/`expo-sharing` pattern already proven in `mobile/utils/printOrderList.ts`.

**Tech Stack:** React Native + Expo, `expo-router` (file-based routing), `@tanstack/react-query`, `expo-print` + `expo-sharing`, `expo-camera` (via the existing `BarcodeScannerModal`). Node/Express + Prisma (backend, one-line permission change only). **This repo has no test framework** — verification is `npx tsc --noEmit` per sub-app plus manual click-through (final task appends a checklist to `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`).

**Spec:** `docs/superpowers/specs/2026-08-14-mobile-label-creation-design.md` — read this first for the full rationale; this plan doesn't repeat the "why," only the "how."

## Global Constraints

- Store Manager **and** Employee get identical, full create/edit/delete/print access to the shared `Label` catalog from mobile — no tiering between the two roles.
- No new Prisma models or migrations — this feature only loosens an existing route guard and adds mobile UI on top of the `Label`/`ScannedProduct` tables that already exist.
- Scanning reuses `BarcodeScannerModal.tsx` as-is except for one new optional `hideQuantity` prop — do not fork or duplicate its scan/lookup/Open-Food-Facts/save-to-catalog logic.
- If a scanned barcode already matches an existing `Label`, opening the create form must instead open that label's **edit** form pre-filled — never silently create a duplicate `Label` row for the same barcode.
- Every save (create or edit) is an immediate API call — never hold a new/edited label only in local component state waiting for a separate "commit batch" action.
- The printed output's visual design (6-column A4 grid, border/text-only template contrast — no background-color fills, per-template icon, barcode rendered via the JsBarcode CDN pattern, QR code) must match `admin/src/utils/printLabels.ts` exactly, so a printed batch looks identical regardless of which platform produced it.
- Any `<script>` tag that reads DOM content produced elsewhere in the same HTML string (the JsBarcode barcode-rendering script) must appear **after** that content in the HTML, not in `<head>` — admin web's `printLabels.ts` shipped a real bug from getting this backwards (script ran before the `<svg>` elements existed and silently rendered nothing). Follow the already-fixed ordering exactly.

---

## File Structure

**Backend — modified:**
- `backend/src/routes/index.ts` — loosen the four `/labels` routes from `requireRole(Role.SUPER_ADMIN)` to `requireRole(Role.EMPLOYEE)`

**Mobile — new:**
- `mobile/utils/printLabels.ts` — the print/share utility, ported from admin web's version
- `mobile/components/LabelsScreen.tsx` — the real screen implementation (list, create/edit form, scan integration, print/share)
- `mobile/app/(manager)/labels.tsx` — thin re-export wrapper
- `mobile/app/(employee)/labels.tsx` — thin re-export wrapper

**Mobile — modified:**
- `mobile/services/api.ts` — new `labelsApi`
- `mobile/components/BarcodeScannerModal.tsx` — new optional `hideQuantity` prop
- `mobile/app/(manager)/_layout.tsx` — register the new tab + nav item
- `mobile/app/(employee)/_layout.tsx` — register the new tab + nav item

**Docs — modified:**
- `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md` — append a verification section (and correct one now-stale line in the existing Labels section left over from before the chain-wide refactor)

---

### Task 1: Backend — loosen `/labels` route permissions

**Files:**
- Modify: `backend/src/routes/index.ts:466-469`

**Interfaces:**
- Produces: `/labels` routes now reachable by any authenticated user whose role is `EMPLOYEE` or higher (`EMPLOYEE`, `STORE_MANAGER`, `SUPER_ADMIN`, `DEV_ADMIN`) — Task 2's mobile API client relies on this.

- [ ] **Step 1: Change the minimum role on all four routes**

In `backend/src/routes/index.ts`, replace lines 466-469:

```ts
router.get   ('/labels',                authenticate, requireRole(Role.SUPER_ADMIN), getAllLabels);
router.post  ('/labels',                authenticate, requireRole(Role.SUPER_ADMIN), createLabel);
router.patch ('/labels/:labelId',       authenticate, requireRole(Role.SUPER_ADMIN), updateLabel);
router.delete('/labels/:labelId',       authenticate, requireRole(Role.SUPER_ADMIN), deleteLabel);
```

with:

```ts
router.get   ('/labels',                authenticate, requireRole(Role.EMPLOYEE), getAllLabels);
router.post  ('/labels',                authenticate, requireRole(Role.EMPLOYEE), createLabel);
router.patch ('/labels/:labelId',       authenticate, requireRole(Role.EMPLOYEE), updateLabel);
router.delete('/labels/:labelId',       authenticate, requireRole(Role.EMPLOYEE), deleteLabel);
```

`requireRole` is a *minimum*-role check (`hasMinRole`, `backend/src/middleware/auth.ts`), and the role hierarchy (highest to lowest) is `DEV_ADMIN > SUPER_ADMIN > STORE_MANAGER > EMPLOYEE > CUSTOMER` — so `Role.EMPLOYEE` naturally allows every staff role through while still excluding `CUSTOMER`.

- [ ] **Step 2: Verify**

Run: `cd backend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/index.ts
git commit -m "feat: allow Store Manager and Employee to manage the Label catalog"
```

---

### Task 2: Mobile — `labelsApi` client

**Files:**
- Modify: `mobile/services/api.ts` (add after the `scannedProductApi` block, which currently ends around line 326)

**Interfaces:**
- Consumes: the `api` axios instance already defined at the top of this file (`mobile/services/api.ts:13`).
- Produces: `labelsApi.getAll()`, `labelsApi.create(data)`, `labelsApi.update(labelId, data)`, `labelsApi.delete(labelId)` — Task 5 imports and calls these.

- [ ] **Step 1: Add the API client object**

Immediately after the closing `};` of `scannedProductApi` (the block ending with `extractFromPhoto`), add:

```ts
export const labelsApi = {
  getAll: () => api.get('/labels'),
  create: (data: { productName: string; priceText: string; barcode?: string | null; template?: string }) =>
    api.post('/labels', data),
  update: (labelId: string, data: { productName?: string; priceText?: string; barcode?: string | null; template?: string }) =>
    api.patch(`/labels/${labelId}`, data),
  delete: (labelId: string) => api.delete(`/labels/${labelId}`),
};
```

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/services/api.ts
git commit -m "feat: add mobile labelsApi client"
```

---

### Task 3: Mobile — `BarcodeScannerModal` `hideQuantity` prop

**Files:**
- Modify: `mobile/components/BarcodeScannerModal.tsx`

**Interfaces:**
- Produces: `BarcodeScannerModal` now accepts an optional `hideQuantity?: boolean` prop (default `false`); when `true`, the "found" phase hides its Quantity input entirely. `BarcodeResult` (already exported at the top of this file) and the `onResult` callback shape are unchanged — Task 5 consumes both as-is.

- [ ] **Step 1: Add the prop to the `Props` interface**

Find the `Props` interface (currently):

```ts
interface Props {
  visible:  boolean;
  onClose:  () => void;
  onResult: (result: BarcodeResult) => void;
}
```

Replace with:

```ts
interface Props {
  visible:      boolean;
  onClose:      () => void;
  onResult:     (result: BarcodeResult) => void;
  hideQuantity?: boolean;
}
```

- [ ] **Step 2: Destructure the new prop with a default**

Find:

```ts
export default function BarcodeScannerModal({ visible, onClose, onResult }: Props) {
```

Replace with:

```ts
export default function BarcodeScannerModal({ visible, onClose, onResult, hideQuantity = false }: Props) {
```

- [ ] **Step 3: Skip auto-focusing the quantity field when hidden**

Find `showFound`:

```ts
  function showFound(name: string, cat: string | null, src: 'catalog' | 'openfoodfacts') {
    setFoundName(name);
    setFoundCat(cat);
    setFoundSource(src);
    setQuantity('');
    setPhase('found');
    setTimeout(() => qtyRef.current?.focus(), 300);
  }
```

Replace the last line with:

```ts
  function showFound(name: string, cat: string | null, src: 'catalog' | 'openfoodfacts') {
    setFoundName(name);
    setFoundCat(cat);
    setFoundSource(src);
    setQuantity('');
    setPhase('found');
    if (!hideQuantity) setTimeout(() => qtyRef.current?.focus(), 300);
  }
```

- [ ] **Step 4: Wrap the Quantity field in the "found" phase JSX**

Find (inside the `phase === 'found'` block):

```tsx
              {/* Qty input */}
              <Text style={st.fieldLabel}>Quantity  <Text style={st.fieldLabelSub}>(optional — leave blank if not needed)</Text></Text>
              <TextInput
                ref={qtyRef}
                style={[st.fieldInput, st.qtyInput]}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="e.g. 5"
                placeholderTextColor="#B0B8C4"
                keyboardType="numeric"
                returnKeyType="done"
                onSubmitEditing={handleConfirmFound}
                maxLength={10}
                selectTextOnFocus
              />
```

Replace with:

```tsx
              {/* Qty input — hidden for callers that don't use quantity (e.g. Labels) */}
              {!hideQuantity && (
                <>
                  <Text style={st.fieldLabel}>Quantity  <Text style={st.fieldLabelSub}>(optional — leave blank if not needed)</Text></Text>
                  <TextInput
                    ref={qtyRef}
                    style={[st.fieldInput, st.qtyInput]}
                    value={quantity}
                    onChangeText={setQuantity}
                    placeholder="e.g. 5"
                    placeholderTextColor="#B0B8C4"
                    keyboardType="numeric"
                    returnKeyType="done"
                    onSubmitEditing={handleConfirmFound}
                    maxLength={10}
                    selectTextOnFocus
                  />
                </>
              )}
```

- [ ] **Step 5: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add mobile/components/BarcodeScannerModal.tsx
git commit -m "feat: add hideQuantity option to BarcodeScannerModal for non-Order-List callers"
```

---

### Task 4: Mobile — `printLabels.ts` print/share utility

**Files:**
- Create: `mobile/utils/printLabels.ts`
- Read (for reference, not modification): `mobile/utils/printOrderList.ts` (full file) — the `expo-print`/`expo-sharing` pattern this reuses; `admin/src/utils/printLabels.ts` (full file) — the exact HTML/CSS this ports.

**Interfaces:**
- Consumes: `expo-print`, `expo-sharing` (already dependencies — confirmed in `mobile/package.json`).
- Produces: `printLabels({ labels, shareAsPdf }): Promise<void>` and `PrintableLabel` — Task 5 imports and calls this.

- [ ] **Step 1: Write the file**

```ts
/**
 * Generates and prints/shares a batch of shelf/price labels from mobile.
 * Mirrors admin web's printLabels.ts HTML/CSS exactly so a printed batch
 * looks identical regardless of which platform produced it.
 */
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface PrintableLabel {
  id: string;
  productName: string;
  priceText: string;
  barcode?: string | null;
  template: string;
}

// Static QR code pointing at the Lucky Stop app/signup page — same on every
// label, baked in as a data URI rather than pulled from a QR-generation
// library or a live external request at print time.
const QR_CODE_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMgAAADIAQMAAACXljzdAAAABlBMVEX///8RERFxTxnbAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAvklEQVRYhd2UwRHEMAgD6b9pcgNI2EkFe/jhgfVHI5nIrois8ytNoCSqq1tPdkIko6qm0ZIz8WQ9/A9Sxl2OUYlz16YdEyRZv3Q0QRKX+adQxHrLOW/0pBLFb2aKIpjsdojjTVLJNPPKv4pK8mq9NZJLBiuJ+ltYErMr1sfUcyQ5ZFq65SLJ5G6C6HwiiUrtLg0msbaO5OkYk4T03Uq55JPDl14qkeieBJ1MFNPfjEriUNW7/M4ojCh7c3vEJA9A1mYnV9N4IgAAAABJRU5ErkJggg==';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface TemplateStyle {
  border: string;
  borderTop: string;
  nameColor: string;
  priceColor: string;
  icon?: string;
}

// Every template gets its look from borders + text color only, never a
// background-color fill — matches admin web's rule exactly, for the same
// print-legibility reason (background graphics are off by default).
const TEMPLATES: Record<string, TemplateStyle> = {
  CLASSIC_RED_BLACK: {
    border: '3px solid #111',
    borderTop: '8px solid #c0392b',
    nameColor: '#111',
    priceColor: '#e63946',
  },
  CHRISTMAS_WINTER: {
    border: '3px solid #1e7a3d',
    borderTop: '8px solid #c0392b',
    nameColor: '#1e7a3d',
    priceColor: '#c0392b',
    icon: '❆ ',
  },
  SUMMER: {
    border: '3px solid #ea580c',
    borderTop: '8px solid #0891b2',
    nameColor: '#0c4a6e',
    priceColor: '#ea580c',
    icon: '☀ ',
  },
};

function renderLabel(label: PrintableLabel): string {
  const t = TEMPLATES[label.template] || TEMPLATES.CLASSIC_RED_BLACK;
  const barcode = label.barcode?.trim();
  const cls = barcode ? 'label has-barcode' : 'label';
  return `
    <div class="${cls}" style="border: ${t.border}; border-top: ${t.borderTop};">
      <img class="label-qr" src="${QR_CODE_DATA_URI}" alt="" />
      <div class="label-name" style="color: ${t.nameColor};">${t.icon || ''}${esc(label.productName)}</div>
      <div class="label-price" style="color: ${t.priceColor};">${esc(label.priceText)}</div>
      ${barcode ? `
      <div class="label-barcode-wrap">
        <svg class="label-barcode" data-barcode="${esc(barcode)}"></svg>
        <div class="label-barcode-val">${esc(barcode)}</div>
      </div>` : ''}
    </div>
  `;
}

function buildHtml(labels: PrintableLabel[]): string {
  const hasAnyBarcode = labels.some(l => l.barcode?.trim());
  // IMPORTANT: this script is placed at the end of <body> (see below), never
  // in <head> — a <head> script would run before the <svg> elements it
  // targets exist in the DOM and silently render nothing. Admin web shipped
  // exactly this bug once; this file starts from the fixed version.
  const barcodeScript = hasAnyBarcode
    ? `<script>
    function renderBarcodes() {
      document.querySelectorAll('svg[data-barcode]').forEach(function(el) {
        try {
          JsBarcode(el, el.getAttribute('data-barcode'), {
            format: 'CODE128', width: 1.5, height: 40,
            displayValue: false, margin: 0, lineColor: '#000'
          });
          var w = parseFloat(el.getAttribute('width') || '0');
          var h = parseFloat(el.getAttribute('height') || '0');
          if (w && h) el.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
          el.removeAttribute('width');
          el.removeAttribute('height');
        } catch (e) { el.style.display = 'none'; }
      });
    }
  </script>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.5/dist/JsBarcode.all.min.js" onload="renderBarcodes()"></script>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Print Labels</title>
  <style>
    @page { size: A4; margin: 10mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 6mm;
    }
    .label {
      position: relative;
      aspect-ratio: 3 / 2;
      border-radius: 5px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2.5mm 7mm 2.5mm 2.5mm;
      page-break-inside: avoid;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }
    .label-qr {
      position: absolute;
      bottom: 1mm;
      right: 1mm;
      width: 6mm;
      height: 6mm;
    }
    .label-name {
      font-size: 7pt;
      font-weight: 700;
      margin-bottom: 1.5mm;
    }
    .label-price {
      font-size: 11pt;
      font-weight: 900;
    }
    .label.has-barcode {
      aspect-ratio: auto;
    }
    .label.has-barcode .label-qr {
      width: 4.5mm;
      height: 4.5mm;
    }
    .label-barcode-wrap {
      width: 100%;
      margin-top: 1mm;
    }
    .label-barcode {
      display: block;
      width: 100%;
      max-width: 20mm;
      height: 6.5mm;
      margin: 0 auto;
    }
    .label-barcode-val {
      font-size: 5.5pt;
      color: #555;
      letter-spacing: 0.3px;
      margin-top: 0.3mm;
    }
  </style>
</head>
<body>
  <div class="grid">
    ${labels.map(renderLabel).join('')}
  </div>
  ${barcodeScript}
</body>
</html>`;
}

export async function printLabels({
  labels,
  shareAsPdf = false,
}: {
  labels: PrintableLabel[];
  shareAsPdf?: boolean;
}): Promise<void> {
  const html = buildHtml(labels);

  if (shareAsPdf) {
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: 'Labels.pdf',
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}
```

Note this drops admin web's `<script>window.onload = () => window.print();</script>` — that line exists only to auto-trigger the browser's print dialog once a new tab finishes loading, which has no equivalent or purpose in `expo-print`'s flow (`Print.printAsync`/`printToFileAsync` render the given HTML directly, there's no "tab" to auto-print from).

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/utils/printLabels.ts
git commit -m "feat: add mobile print/share utility for label batches"
```

---

### Task 5: Mobile — `LabelsScreen.tsx` shared screen

**Files:**
- Create: `mobile/components/LabelsScreen.tsx`
- Read (for reference, not modification): `mobile/app/(employee)/scan.tsx:1-450` (mode-select/card patterns, `Toast` usage) and `mobile/components/BarcodeScannerModal.tsx` (the modal this integrates, especially its exported `BarcodeResult` shape and the new `hideQuantity` prop from Task 3).

**Interfaces:**
- Consumes: `labelsApi` (Task 2), `BarcodeScannerModal` + `BarcodeResult` + `hideQuantity` (Task 3), `printLabels`/`PrintableLabel` (Task 4), `COLORS` from `../constants`, icon components from `./Icons` (`TagIcon`, `XIcon`, `CheckCircleIcon`, `EditIcon`, `CameraIcon` — all already exist in `mobile/components/Icons.tsx`).
- Produces: default-exported `LabelsScreen` component — Task 6's two wrapper files import and re-export this by name.

- [ ] **Step 1: Write the component**

```tsx
import { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ActivityIndicator, Modal, ScrollView, Alert,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { labelsApi } from '../services/api';
import { COLORS } from '../constants';
import { TagIcon, XIcon, CheckCircleIcon, EditIcon, CameraIcon } from './Icons';
import BarcodeScannerModal, { BarcodeResult } from './BarcodeScannerModal';
import { printLabels } from '../utils/printLabels';

interface Label {
  id: string;
  productName: string;
  priceText: string;
  barcode: string | null;
  template: string;
  updatedAt: string;
}

const TEMPLATES: { value: string; label: string; color: string }[] = [
  { value: 'CLASSIC_RED_BLACK', label: 'Classic Red & Black', color: '#c0392b' },
  { value: 'CHRISTMAS_WINTER', label: 'Christmas / Winter', color: '#1e7a3d' },
  { value: 'SUMMER', label: 'Summer', color: '#f59e0b' },
];

export default function LabelsScreen() {
  const qc = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showScanner, setShowScanner] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingLabel, setEditingLabel] = useState<Label | null>(null);
  const [formProductName, setFormProductName] = useState('');
  const [formPriceText, setFormPriceText] = useState('');
  const [formBarcode, setFormBarcode] = useState<string | null>(null);
  const [formTemplate, setFormTemplate] = useState('CLASSIC_RED_BLACK');
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['mobile-labels'],
    queryFn: labelsApi.getAll,
  });
  const labels: Label[] = data?.data?.data || [];

  function openCreateForm(scanned: BarcodeResult) {
    const existing = labels.find(l => l.barcode && l.barcode === scanned.barcode);
    if (existing) {
      openEditForm(existing);
      return;
    }
    setEditingLabel(null);
    setFormProductName(scanned.name);
    setFormPriceText('');
    setFormBarcode(scanned.barcode);
    setFormTemplate('CLASSIC_RED_BLACK');
    setShowForm(true);
  }

  function openEditForm(label: Label) {
    setEditingLabel(label);
    setFormProductName(label.productName);
    setFormPriceText(label.priceText);
    setFormBarcode(label.barcode);
    setFormTemplate(label.template);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingLabel(null);
    setFormProductName('');
    setFormPriceText('');
    setFormBarcode(null);
    setFormTemplate('CLASSIC_RED_BLACK');
  }

  async function handleSave() {
    const productName = formProductName.trim();
    const priceText = formPriceText.trim();
    if (!productName || !priceText || saving) return;
    setSaving(true);
    try {
      if (editingLabel) {
        await labelsApi.update(editingLabel.id, { productName, priceText, barcode: formBarcode, template: formTemplate });
      } else {
        const res = await labelsApi.create({ productName, priceText, barcode: formBarcode, template: formTemplate });
        const newId = res.data?.data?.id;
        if (newId) setSelectedIds(prev => new Set(prev).add(newId));
      }
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      Toast.show({ type: 'success', text1: editingLabel ? 'Label updated' : 'Label added' });
      closeForm();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to save label' });
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!editingLabel) return;
    Alert.alert(
      'Delete this label?',
      `"${editingLabel.productName}" will be removed from the shared catalog for every store.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    if (!editingLabel) return;
    setSaving(true);
    try {
      await labelsApi.delete(editingLabel.id);
      const deletedId = editingLabel.id;
      setSelectedIds(prev => { const next = new Set(prev); next.delete(deletedId); return next; });
      await qc.invalidateQueries({ queryKey: ['mobile-labels'] });
      Toast.show({ type: 'success', text1: 'Label removed' });
      closeForm();
    } catch (err: any) {
      Toast.show({ type: 'error', text1: err.response?.data?.error || 'Failed to remove label' });
    } finally {
      setSaving(false);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handlePrint(shareAsPdf: boolean) {
    const toPrint = labels.filter(l => selectedIds.has(l.id));
    if (toPrint.length === 0 || printing) return;
    setPrinting(true);
    try {
      await printLabels({ labels: toPrint, shareAsPdf });
    } catch (err: any) {
      Toast.show({ type: 'error', text1: shareAsPdf ? 'Export failed' : 'Print failed', text2: err?.message });
    } finally {
      setPrinting(false);
    }
  }

  return (
    <SafeAreaView style={s.fill} edges={['top']}>
      <BarcodeScannerModal
        visible={showScanner}
        hideQuantity
        onClose={() => setShowScanner(false)}
        onResult={(result) => { setShowScanner(false); openCreateForm(result); }}
      />

      <Modal visible={showForm} animationType="slide" transparent onRequestClose={closeForm}>
        <View style={s.formOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.formSheet}>
            <ScrollView contentContainerStyle={s.formScroll} keyboardShouldPersistTaps="handled">
              <View style={s.formHeader}>
                <Text style={s.formTitle}>{editingLabel ? 'Edit Label' : 'New Label'}</Text>
                <TouchableOpacity onPress={closeForm} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityRole="button" accessibilityLabel="Close">
                  <XIcon size={20} color={COLORS.textMuted} strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {formBarcode && (
                <View style={s.barcodeChip}>
                  <Text style={s.barcodeChipLabel}>Barcode</Text>
                  <Text style={s.barcodeChipValue}>{formBarcode}</Text>
                </View>
              )}

              <Text style={s.fieldLabel}>Product Name</Text>
              <TextInput
                style={s.fieldInput}
                value={formProductName}
                onChangeText={setFormProductName}
                placeholder="e.g. Monster Energy 16oz"
                placeholderTextColor="#B0B8C4"
                maxLength={120}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Price / Deal Text</Text>
              <TextInput
                style={s.fieldInput}
                value={formPriceText}
                onChangeText={setFormPriceText}
                placeholder='e.g. "$3.99" or "2 for $5"'
                placeholderTextColor="#B0B8C4"
                maxLength={40}
              />

              <Text style={[s.fieldLabel, { marginTop: 16 }]}>Template</Text>
              <View style={s.templateRow}>
                {TEMPLATES.map(t => (
                  <TouchableOpacity
                    key={t.value}
                    style={[s.templateChip, formTemplate === t.value && s.templateChipActive]}
                    onPress={() => setFormTemplate(t.value)}
                    accessibilityRole="button"
                    accessibilityLabel={`Use ${t.label} template`}
                  >
                    <View style={[s.templateSwatch, { backgroundColor: t.color }]} />
                    <Text style={s.templateChipText}>{t.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[s.saveBtn, (!formProductName.trim() || !formPriceText.trim() || saving) && s.saveBtnDim]}
                onPress={handleSave}
                disabled={!formProductName.trim() || !formPriceText.trim() || saving}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Save label"
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>{editingLabel ? 'Save Changes' : 'Add Label'}</Text>}
              </TouchableOpacity>

              {editingLabel && (
                <TouchableOpacity
                  style={s.deleteBtn}
                  onPress={confirmDelete}
                  disabled={saving}
                  accessibilityRole="button"
                  accessibilityLabel="Delete label"
                >
                  <Text style={s.deleteBtnText}>Delete Label</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <View style={s.header}>
        <Text style={s.headerTitle}>Labels</Text>
        <Text style={s.headerSub}>{labels.length} in the shared catalog</Text>
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator color={COLORS.secondary} size="large" /></View>
      ) : labels.length === 0 ? (
        <View style={s.center}>
          <TagIcon size={48} color={COLORS.border} strokeWidth={1.5} />
          <Text style={s.emptyTitle}>No labels yet</Text>
          <Text style={s.emptySub}>Scan an item to create the first one</Text>
        </View>
      ) : (
        <FlatList
          data={labels}
          keyExtractor={l => l.id}
          contentContainerStyle={s.list}
          refreshing={isRefetching}
          onRefresh={refetch}
          renderItem={({ item }) => {
            const checked = selectedIds.has(item.id);
            const tmpl = TEMPLATES.find(t => t.value === item.template) || TEMPLATES[0];
            return (
              <View style={s.card}>
                <TouchableOpacity
                  style={s.checkbox}
                  onPress={() => toggleSelected(item.id)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked }}
                  accessibilityLabel={`Select ${item.productName} for printing`}
                >
                  <View style={[s.checkboxBox, checked && { backgroundColor: COLORS.secondary, borderColor: COLORS.secondary }]}>
                    {checked && <CheckCircleIcon size={14} color="#fff" strokeWidth={3} />}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={s.cardBody} onPress={() => openEditForm(item)} accessibilityRole="button" accessibilityLabel={`Edit ${item.productName}`}>
                  <View style={[s.templateDot, { backgroundColor: tmpl.color }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{item.productName}</Text>
                    <Text style={s.cardPrice}>{item.priceText}</Text>
                    {item.barcode && <Text style={s.cardBarcode}>{item.barcode}</Text>}
                  </View>
                  <EditIcon size={16} color={COLORS.textMuted} strokeWidth={2} />
                </TouchableOpacity>
              </View>
            );
          }}
        />
      )}

      <View style={s.footer}>
        <TouchableOpacity
          style={s.scanBtn}
          onPress={() => setShowScanner(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Scan a new item to create a label"
        >
          <CameraIcon size={18} color="#fff" strokeWidth={2.5} />
          <Text style={s.scanBtnText}>New Label</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.printBtn, (selectedIds.size === 0 || printing) && s.printBtnDim]}
          onPress={() => handlePrint(false)}
          disabled={selectedIds.size === 0 || printing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Print ${selectedIds.size} selected labels`}
        >
          {printing ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.printBtnText}>Print ({selectedIds.size})</Text>}
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.shareBtn, (selectedIds.size === 0 || printing) && s.printBtnDim]}
          onPress={() => handlePrint(true)}
          disabled={selectedIds.size === 0 || printing}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Export ${selectedIds.size} selected labels as PDF`}
        >
          <Text style={s.shareBtnText}>PDF</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: COLORS.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 32 },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: COLORS.text },
  headerSub: { fontSize: 13, color: COLORS.textMuted, marginTop: 2 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, marginTop: 8 },
  emptySub: { fontSize: 14, color: COLORS.textMuted },
  list: { paddingHorizontal: 16, paddingBottom: 100, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', borderRadius: 14, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  checkbox: { padding: 2 },
  checkboxBox: {
    width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cardBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  templateDot: { width: 8, height: 8, borderRadius: 4 },
  cardName: { fontSize: 15, fontWeight: '700', color: COLORS.text },
  cardPrice: { fontSize: 14, fontWeight: '700', color: COLORS.danger, marginTop: 2 },
  cardBarcode: { fontSize: 11, color: COLORS.textMuted, marginTop: 2, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  footer: {
    flexDirection: 'row', gap: 8, padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: COLORS.border, backgroundColor: '#fff',
  },
  scanBtn: {
    flex: 1.3, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: COLORS.secondary, borderRadius: 12, paddingVertical: 14,
  },
  scanBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  printBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.managerPrimary, borderRadius: 12, paddingVertical: 14,
  },
  printBtnDim: { opacity: 0.4 },
  printBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  shareBtn: {
    flex: 0.6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.managerPrimary, borderRadius: 12, paddingVertical: 14,
  },
  shareBtnText: { color: COLORS.managerPrimary, fontSize: 14, fontWeight: '700' },
  formOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  formSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  formScroll: { padding: 20, paddingBottom: 40 },
  formHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  formTitle: { fontSize: 18, fontWeight: '800', color: COLORS.text },
  barcodeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#1E293B', borderRadius: 10, padding: 12, marginBottom: 16,
  },
  barcodeChipLabel: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 0.5 },
  barcodeChipValue: { fontSize: 15, fontWeight: '700', color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: COLORS.text, marginBottom: 8 },
  fieldInput: {
    backgroundColor: '#fff', borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: COLORS.text,
  },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  templateChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
  },
  templateChipActive: { borderColor: COLORS.secondary, backgroundColor: '#eff6ff' },
  templateSwatch: { width: 10, height: 10, borderRadius: 5 },
  templateChipText: { fontSize: 13, fontWeight: '600', color: COLORS.text },
  saveBtn: {
    backgroundColor: COLORS.secondary, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', justifyContent: 'center', marginTop: 24,
  },
  saveBtnDim: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  deleteBtnText: { color: COLORS.danger, fontSize: 14, fontWeight: '700' },
});
```

- [ ] **Step 2: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add mobile/components/LabelsScreen.tsx
git commit -m "feat: add shared LabelsScreen (scan, create/edit, print/share)"
```

---

### Task 6: Mobile — wire up navigation for both roles

**Files:**
- Create: `mobile/app/(manager)/labels.tsx`
- Create: `mobile/app/(employee)/labels.tsx`
- Modify: `mobile/app/(manager)/_layout.tsx`
- Modify: `mobile/app/(employee)/_layout.tsx`

**Interfaces:**
- Consumes: `LabelsScreen` (Task 5), `TagIcon` (already exists in `mobile/components/Icons.tsx`), `NavItem`/`NavGroup`/`DrawerShell` (already exist in `mobile/components/DrawerShell.tsx`).

- [ ] **Step 1: Create the Manager wrapper**

`mobile/app/(manager)/labels.tsx`:

```tsx
import LabelsScreen from '../../components/LabelsScreen';
export default LabelsScreen;
```

- [ ] **Step 2: Create the Employee wrapper**

`mobile/app/(employee)/labels.tsx`:

```tsx
import LabelsScreen from '../../components/LabelsScreen';
export default LabelsScreen;
```

- [ ] **Step 3: Register the tab and nav item in `mobile/app/(manager)/_layout.tsx`**

`TagIcon` is already imported on this file's icon import line (currently used for "Offers") — no import change needed here.

In the `Inventory` group's `items` array, add a new entry right after the `catalog` line:

```tsx
        { route: '/(manager)/home',       icon: (p) => <HomeIcon {...p} />,      label: t('nav.dashboard') },
        { route: '/(manager)/order-list', icon: (p) => <PackageIcon {...p} />,   label: t('nav.orderList') },
        { route: '/(manager)/catalog',    icon: (p) => <ListIcon {...p} />,      label: 'Store Catalog' },
        { route: '/(manager)/labels',     icon: (p) => <TagIcon {...p} />,       label: 'Labels' },
        { route: '/(manager)/requests',   icon: (p) => <ClipboardIcon {...p} />, label: t('nav.itemRequests'), badge: empReqPending + productReqPending + storeReqPending },
        { route: '/(manager)/disputes',   icon: (p) => <AlertTriangleIcon {...p} />, label: t('nav.disputes'), badge: disputesPending },
```

In the `Tabs` list, add `<Tabs.Screen name="labels" />` right after `<Tabs.Screen name="catalog" />`:

```tsx
        <Tabs.Screen name="home" />
        <Tabs.Screen name="order-list" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="disputes" />
        <Tabs.Screen name="support" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="profile" />
        <Tabs.Screen name="offers" />
        <Tabs.Screen name="banners" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="catalog" />
        <Tabs.Screen name="labels" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="guide" />
```

- [ ] **Step 4: Register the tab and nav item in `mobile/app/(employee)/_layout.tsx`**

Add `TagIcon` to the icon import list (not currently imported here):

```tsx
import {
  HomeIcon, CameraIcon, CalendarIcon, MessageCircleIcon,
  ClipboardIcon, BellIcon, TrophyIcon, PackageIcon, FlameIcon,
  UserIcon, BookOpenIcon, FileCheckIcon, ListChecksIcon, TagIcon,
} from '../../components/Icons';
```

In the `Work` group's `items` array, add a new entry right after `requests`:

```tsx
        { route: '/(employee)/schedule',   icon: (p) => <CalendarIcon {...p} />,      label: t('nav.schedule'), badge: vacancyCount },
        { route: '/(employee)/chat',       icon: (p) => <MessageCircleIcon {...p} />, label: t('nav.chat'), badge: chatUnread },
        { route: '/(employee)/requests',   icon: (p) => <ClipboardIcon {...p} />,     label: t('nav.requests') },
        { route: '/(employee)/labels',     icon: (p) => <TagIcon {...p} />,           label: 'Labels' },
        { route: '/(employee)/stock-request', icon: (p) => <PackageIcon {...p} />,       label: t('nav.stockRequest') },
        { route: '/(employee)/hot-food',      icon: (p) => <FlameIcon {...p} />,         label: t('nav.hotFoodOrders'), badge: hotFoodCount },
        { route: '/(employee)/daily-report',  icon: (p) => <FileCheckIcon {...p} />,     label: 'Daily Report' },
        { route: '/(employee)/daily-tasks',   icon: (p) => <ListChecksIcon {...p} />,    label: 'Daily Tasks' },
```

In the `Tabs` list, add `<Tabs.Screen name="labels" />` right after `<Tabs.Screen name="requests" />`:

```tsx
        <Tabs.Screen name="home" />
        <Tabs.Screen name="scan" />
        <Tabs.Screen name="schedule" />
        <Tabs.Screen name="chat" />
        <Tabs.Screen name="requests" />
        <Tabs.Screen name="labels" />
        <Tabs.Screen name="stock-request" />
        <Tabs.Screen name="hot-food" />
        <Tabs.Screen name="daily-report" />
        <Tabs.Screen name="daily-tasks" />
        <Tabs.Screen name="notifications" />
        <Tabs.Screen name="leaderboard" />
        <Tabs.Screen name="guide" />
        <Tabs.Screen name="profile" />
```

- [ ] **Step 5: Verify**

Run: `cd mobile && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual click-through**

Run the mobile app on a real Android device over USB (`npx expo run:android`, per `project_usb_android_testing`):

1. Log in as a Store Manager → confirm "Labels" appears in the Inventory drawer group → tap it → the list loads (may be empty or show whatever admin web already has, since it's the same shared catalog).
2. Log in as an Employee → confirm "Labels" appears in the Work drawer group → tap it → same list.

- [ ] **Step 7: Commit**

```bash
git add "mobile/app/(manager)/labels.tsx" "mobile/app/(employee)/labels.tsx" "mobile/app/(manager)/_layout.tsx" "mobile/app/(employee)/_layout.tsx"
git commit -m "feat: add Labels tab to Manager and Employee navigation"
```

---

### Task 7: Update the consolidated manual test checklist

**Files:**
- Modify: `docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md`

- [ ] **Step 1: Correct the now-stale line in section 10**

Section "10. Shelf/price labels (2026-08-11)" was written before the chain-wide refactor and the barcode/mobile additions — it still describes a per-store sidebar and says Store Manager gets a 403, both no longer true. Replace its last bullet:

```markdown
- [ ] Log in as a Store Manager (or check the API directly) → confirm no "Labels" nav item appears, and `/labels/*` endpoints return 403
- [ ] Switch to a different store in the sidebar → confirm the label table and any selection checkboxes reset to that store's own labels (no cross-store leakage)
```

with:

```markdown
- [ ] (Superseded by section 11 below — Labels is now a chain-wide catalog with no per-store sidebar, and Store Manager/Employee have full mobile access as of 2026-08-14.)
```

- [ ] **Step 2: Append a new section**

Add at the end of the file:

```markdown
## 11. Mobile label creation (2026-08-14)

- [ ] As Store Manager, open the new "Labels" tab (Inventory group) → confirm it shows the same catalog admin web's Labels page shows
- [ ] Tap "New Label", scan a barcode that's genuinely new (not in the catalog yet) → name it, enter a price, pick a template, save → confirm it appears in the mobile list immediately, and in admin web's Labels page after a refresh
- [ ] Scan that same barcode again → confirm it opens the existing label's *edit* form pre-filled, not a blank create form (no duplicate created)
- [ ] Edit a label's price from mobile → confirm admin web reflects the new price after a refresh
- [ ] Edit a label's price from admin web → confirm mobile reflects the new price after a pull-to-refresh
- [ ] Delete a label from mobile → confirm it disappears from admin web's Labels page too
- [ ] Select 2+ labels (including at least one with a barcode) and tap "Print" → confirm the OS print flow opens and the output visually matches admin web's template (border/text-only legibility, working barcode, QR code, correct template colors)
- [ ] Tap "PDF" instead → confirm the native share sheet opens with a Labels.pdf attachment
- [ ] Repeat the "New Label" flow as Employee (not Store Manager) → confirm identical access — full create/edit/delete, no restrictions relative to Store Manager
- [ ] As Customer or logged out, confirm `/labels` endpoints return 401/403 (the loosened permission still stops at Employee, not Customer)
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/2026-07-18-consolidated-manual-test-checklist.md
git commit -m "docs: add mobile label creation section to the manual test checklist"
```
