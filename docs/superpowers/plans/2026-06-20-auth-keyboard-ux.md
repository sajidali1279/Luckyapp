# Auth Screens Keyboard/UX Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Android keyboard bug on the login/create-account/forgot-PIN screens, and add return-key field chaining plus auto-advance/auto-submit on fixed-length PIN/OTP fields.

**Architecture:** Two existing screen files, no new files. `mobile/app/(auth)/login.tsx` and `mobile/app/(auth)/forgot-pin.tsx` each get: (1) a one-line `KeyboardAvoidingView` behavior fix, (2) `useRef<TextInput>` instances wired to `returnKeyType`/`onSubmitEditing` for forward field navigation, (3) `useEffect` hooks that watch fixed-length field values and auto-trigger the same handler the submit button would once the field is full.

**Tech Stack:** React Native + Expo Router, TypeScript. No test runner exists in this project; verification is `npx tsc --noEmit` plus manual checks described per task (no device available to this agent — describe exactly what a human should verify when running the app).

**Spec:** `docs/superpowers/specs/2026-06-20-auth-keyboard-ux-design.md`

---

### Task 1: Fix Android `KeyboardAvoidingView` behavior (both files)

**Files:**
- Modify: `mobile/app/(auth)/login.tsx:261,340,405`
- Modify: `mobile/app/(auth)/forgot-pin.tsx:143`

- [ ] **Step 1: Fix all 3 instances in `login.tsx`**

All 3 occurrences in this file are the identical line:

```tsx
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
```

Replace **all 3** with:

```tsx
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
```

(They appear at the start of the `quick`, `verify-phone`, and main login/register render blocks — use a find-and-replace-all for this exact line since all 3 occurrences are byte-identical and require the identical fix.)

- [ ] **Step 2: Fix the 1 instance in `forgot-pin.tsx`**

Find:

```tsx
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
```

Replace with:

```tsx
      <KeyboardAvoidingView style={s.fill} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
```

- [ ] **Step 3: Verify both files compile**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/login.tsx mobile/app/\(auth\)/forgot-pin.tsx
git commit -m "fix: Android keyboard now resizes screen on auth/forgot-pin screens"
```

---

### Task 2: Quick-login PIN screen — ref, return key, auto-submit

**Files:**
- Modify: `mobile/app/(auth)/login.tsx` (imports, the `quick` screen's PIN `TextInput`, around line 294)

- [ ] **Step 1: Update the React Native import to include `Keyboard`**

Find:

```tsx
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Animated, Image,
} from 'react-native';
```

Replace with:

```tsx
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Animated, Image, Keyboard,
} from 'react-native';
```

- [ ] **Step 2: Add the `useRef` import**

Find:

```tsx
import { useState, useEffect, useCallback, useRef } from 'react';
```

This import already includes `useRef` (used elsewhere for `tabAnim`) — no change needed here, just confirm it's present (it is).

- [ ] **Step 3: Add a ref for the quick-login PIN field**

Find (near the top of the component, after the `tabAnim` ref declaration):

```tsx
  const tabAnim = useRef(new Animated.Value(screen === 'register' ? 1 : 0)).current;
```

Add immediately after it:

```tsx
  const quickPinRef = useRef<TextInput>(null);
```

- [ ] **Step 4: Add an auto-submit effect for the quick-login PIN**

Add this `useEffect` right after the existing `useEffect` that auto-triggers biometric (the one with dependency array `[screen, biometricEnabled, bioAvailable]`):

```tsx
  // Auto-submit quick-login PIN once 4 digits are entered
  useEffect(() => {
    if (screen === 'quick' && pin.length === 4 && !loading) {
      Keyboard.dismiss();
      handleQuickLogin();
    }
  }, [pin]);
```

- [ ] **Step 5: Wire the ref and explicit return key onto the PIN `TextInput`**

Find (in the `quick` screen render block):

```tsx
            <TextInput
              style={[styles.input, styles.pinInput, focusedInput === 'quickPin' && styles.inputFocused]}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              maxLength={4}
              autoFocus={!biometricEnabled}
              onFocus={() => setFocusedInput('quickPin')}
              onBlur={() => setFocusedInput(null)}
            />
```

Replace with:

```tsx
            <TextInput
              ref={quickPinRef}
              style={[styles.input, styles.pinInput, focusedInput === 'quickPin' && styles.inputFocused]}
              placeholder="••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              secureTextEntry
              value={pin}
              onChangeText={setPin}
              maxLength={4}
              autoFocus={!biometricEnabled}
              returnKeyType="done"
              onFocus={() => setFocusedInput('quickPin')}
              onBlur={() => setFocusedInput(null)}
            />
```

- [ ] **Step 6: Verify it compiles**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/login.tsx
git commit -m "feat: auto-submit quick-login PIN once 4 digits entered"
```

---

### Task 3: OTP verify screen (login.tsx) — return key, auto-verify

**Files:**
- Modify: `mobile/app/(auth)/login.tsx` (the `verify-phone` screen's OTP `TextInput`, around line 357)

- [ ] **Step 1: Add an auto-verify effect for the OTP field**

Add this `useEffect` right after the auto-submit effect added in Task 2, Step 4:

```tsx
  // Auto-verify OTP once 6 digits are entered
  useEffect(() => {
    if (screen === 'verify-phone' && otp.length === 6 && !loading) {
      Keyboard.dismiss();
      handleVerifyAndCreate();
    }
  }, [otp]);
```

- [ ] **Step 2: Add explicit return key to the OTP `TextInput`**

Find (in the `verify-phone` screen render block):

```tsx
            <TextInput
              style={[styles.input, vp.otpInput, focusedInput === 'otp' && styles.inputFocused]}
              placeholder="••••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              autoFocus
              onFocus={() => setFocusedInput('otp')}
              onBlur={() => setFocusedInput(null)}
            />
```

Replace with:

```tsx
            <TextInput
              style={[styles.input, vp.otpInput, focusedInput === 'otp' && styles.inputFocused]}
              placeholder="••••••"
              placeholderTextColor={COLORS.textMuted}
              keyboardType="number-pad"
              value={otp}
              onChangeText={setOtp}
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onFocus={() => setFocusedInput('otp')}
              onBlur={() => setFocusedInput(null)}
            />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/login.tsx
git commit -m "feat: auto-verify OTP once 6 digits entered on login screen"
```

---

### Task 4: Main login/register form — refs, chaining, auto-submit

**Files:**
- Modify: `mobile/app/(auth)/login.tsx` (the main login/register form: `name`, `phone`, `pin`, `confirmPin` `TextInput`s, around lines 440-493; styles/handlers already exist)

This is the most involved task: the same screen renders different field sequences depending on `screen === 'login'` vs `screen === 'register'`. Login mode shows Phone → PIN. Register mode shows Name → Phone → PIN → Confirm PIN.

- [ ] **Step 1: Add refs for the 4 fields**

Find the ref added in Task 2, Step 3 (`quickPinRef`) and add 4 more refs right after it:

```tsx
  const quickPinRef = useRef<TextInput>(null);
  const nameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);
  const mainPinRef = useRef<TextInput>(null);
  const confirmPinRef = useRef<TextInput>(null);
```

- [ ] **Step 2: Add an auto-submit effect for login-mode PIN**

Add this `useEffect` right after the OTP auto-verify effect added in Task 3, Step 1:

```tsx
  // Auto-submit login PIN once 4 digits are entered (login mode only — register mode has Confirm PIN after it)
  useEffect(() => {
    if (screen === 'login' && pin.length === 4 && !loading) {
      Keyboard.dismiss();
      handleLogin();
    }
  }, [pin]);
```

- [ ] **Step 3: Add an auto-submit effect for register-mode Confirm PIN**

Add this `useEffect` right after the effect added in Step 2:

```tsx
  // Auto-submit register form once Confirm PIN reaches 4 digits (register mode only)
  useEffect(() => {
    if (screen === 'register' && confirmPin.length === 4 && !sendingOtp) {
      Keyboard.dismiss();
      handleRegister();
    }
  }, [confirmPin]);
```

- [ ] **Step 4: Wire the Name field (register mode only)**

Find:

```tsx
          {screen === 'register' && (
            <>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                style={[styles.input, focusedInput === 'name' && styles.inputFocused]}
                placeholder="John Smith"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                onFocus={() => setFocusedInput('name')}
                onBlur={() => setFocusedInput(null)}
              />
            </>
          )}
```

Replace with:

```tsx
          {screen === 'register' && (
            <>
              <Text style={styles.label}>Your Name</Text>
              <TextInput
                ref={nameRef}
                style={[styles.input, focusedInput === 'name' && styles.inputFocused]}
                placeholder="John Smith"
                placeholderTextColor={COLORS.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
                onSubmitEditing={() => phoneRef.current?.focus()}
                onFocus={() => setFocusedInput('name')}
                onBlur={() => setFocusedInput(null)}
              />
            </>
          )}
```

- [ ] **Step 5: Wire the Phone field**

Find:

```tsx
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            style={[styles.input, focusedInput === 'phone' && styles.inputFocused]}
            placeholder="(555) 000-0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            onFocus={() => setFocusedInput('phone')}
            onBlur={() => setFocusedInput(null)}
          />
```

Replace with:

```tsx
          <Text style={styles.label}>Phone Number</Text>
          <TextInput
            ref={phoneRef}
            style={[styles.input, focusedInput === 'phone' && styles.inputFocused]}
            placeholder="(555) 000-0000"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="phone-pad"
            value={phone}
            onChangeText={(t) => setPhone(formatPhone(t))}
            returnKeyType="next"
            onSubmitEditing={() => mainPinRef.current?.focus()}
            onFocus={() => setFocusedInput('phone')}
            onBlur={() => setFocusedInput(null)}
          />
```

- [ ] **Step 6: Wire the PIN field**

Find:

```tsx
          <Text style={styles.label}>4-Digit PIN</Text>
          <TextInput
            style={[styles.input, styles.pinInput, focusedInput === 'pin' && styles.inputFocused]}
            placeholder="••••"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
            onFocus={() => setFocusedInput('pin')}
            onBlur={() => setFocusedInput(null)}
          />
```

Replace with:

```tsx
          <Text style={styles.label}>4-Digit PIN</Text>
          <TextInput
            ref={mainPinRef}
            style={[styles.input, styles.pinInput, focusedInput === 'pin' && styles.inputFocused]}
            placeholder="••••"
            placeholderTextColor={COLORS.textMuted}
            keyboardType="number-pad"
            secureTextEntry
            value={pin}
            onChangeText={setPin}
            maxLength={4}
            returnKeyType={screen === 'register' ? 'next' : 'done'}
            onSubmitEditing={() => { if (screen === 'register') confirmPinRef.current?.focus(); }}
            onFocus={() => setFocusedInput('pin')}
            onBlur={() => setFocusedInput(null)}
          />
```

- [ ] **Step 7: Wire the Confirm PIN field (register mode only)**

Find:

```tsx
          {screen === 'register' && (
            <>
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput
                style={[styles.input, styles.pinInput, focusedInput === 'confirmPin' && styles.inputFocused]}
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                value={confirmPin}
                onChangeText={setConfirmPin}
                maxLength={4}
                onFocus={() => setFocusedInput('confirmPin')}
                onBlur={() => setFocusedInput(null)}
              />
              <Text style={styles.pinHint}>
                Remember your PIN — it replaces a password. You'll need it every time you sign in.
              </Text>
            </>
          )}
```

Replace with:

```tsx
          {screen === 'register' && (
            <>
              <Text style={styles.label}>Confirm PIN</Text>
              <TextInput
                ref={confirmPinRef}
                style={[styles.input, styles.pinInput, focusedInput === 'confirmPin' && styles.inputFocused]}
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                keyboardType="number-pad"
                secureTextEntry
                value={confirmPin}
                onChangeText={setConfirmPin}
                maxLength={4}
                returnKeyType="done"
                onFocus={() => setFocusedInput('confirmPin')}
                onBlur={() => setFocusedInput(null)}
              />
              <Text style={styles.pinHint}>
                Remember your PIN — it replaces a password. You'll need it every time you sign in.
              </Text>
            </>
          )}
```

- [ ] **Step 8: Verify it compiles**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 9: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/login.tsx
git commit -m "feat: add field chaining and auto-submit to login/register form"
```

---

### Task 5: forgot-pin.tsx — phone step return key

**Files:**
- Modify: `mobile/app/(auth)/forgot-pin.tsx` (imports; the phone-step `TextInput`, around line 172)

- [ ] **Step 1: Update the React Native import to include `Keyboard`**

Find:

```tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, StatusBar,
} from 'react-native';
```

Replace with:

```tsx
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, StatusBar, Keyboard,
} from 'react-native';
```

- [ ] **Step 2: Add the `useRef` import**

Find:

```tsx
import { useState, useEffect } from 'react';
```

Replace with:

```tsx
import { useState, useEffect, useRef } from 'react';
```

- [ ] **Step 3: Add an explicit return key to the phone `TextInput`**

Find:

```tsx
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={(t) => setPhone(formatPhone(t))}
                keyboardType="phone-pad"
                placeholder="(555) 000-0000"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
```

Replace with:

```tsx
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={(t) => setPhone(formatPhone(t))}
                keyboardType="phone-pad"
                placeholder="(555) 000-0000"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                returnKeyType="done"
              />
```

(No auto-submit for this field — the phone number isn't a fixed-length field in the same way PIN/OTP are, and the spec doesn't include it. The "Send Verification Code" button is unaffected.)

- [ ] **Step 4: Verify it compiles**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/forgot-pin.tsx
git commit -m "fix: add explicit return key to forgot-pin phone step"
```

---

### Task 6: forgot-pin.tsx — OTP verify step, auto-verify

**Files:**
- Modify: `mobile/app/(auth)/forgot-pin.tsx` (the verify-step OTP `TextInput`, around line 206)

- [ ] **Step 1: Add an auto-verify effect**

Add this `useEffect` right after the existing resend-cooldown `useEffect` (the one with `[resendCooldown]` dependency):

```tsx
  // Auto-verify OTP once 6 digits are entered
  useEffect(() => {
    if (step === 'verify' && otp.length === 6 && !loading) {
      Keyboard.dismiss();
      handleVerifyOtp();
    }
  }, [otp]);
```

- [ ] **Step 2: Add explicit return key to the OTP `TextInput`**

Find:

```tsx
              <TextInput
                style={[s.input, s.otpInput]}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
```

Replace with:

```tsx
              <TextInput
                style={[s.input, s.otpInput]}
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                placeholder="••••••"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                returnKeyType="done"
              />
```

- [ ] **Step 3: Verify it compiles**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/forgot-pin.tsx
git commit -m "feat: auto-verify OTP once 6 digits entered on forgot-pin screen"
```

---

### Task 7: forgot-pin.tsx — reset step, refs/chaining/auto-submit

**Files:**
- Modify: `mobile/app/(auth)/forgot-pin.tsx` (the reset-step `newPin`/`confirmPin` `TextInput`s, around lines 251-273)

- [ ] **Step 1: Add refs for the two PIN fields**

Find the `Step` type/state declarations near the top of the component:

```tsx
export default function ForgotPinScreen() {
  const [step, setStep] = useState<Step>('phone');
```

Add, right after the existing `const [resendCooldown, setResendCooldown] = useState(0);` line:

```tsx
  const newPinRef = useRef<TextInput>(null);
  const confirmPinRef = useRef<TextInput>(null);
```

- [ ] **Step 2: Add an auto-submit effect**

Add this `useEffect` right after the auto-verify effect added in Task 6, Step 1:

```tsx
  // Auto-submit reset once both New PIN and Confirm PIN reach 4 digits
  useEffect(() => {
    if (step === 'reset' && newPin.length === 4 && confirmPin.length === 4 && !loading) {
      Keyboard.dismiss();
      handleResetPin();
    }
  }, [newPin, confirmPin]);
```

- [ ] **Step 3: Wire the New PIN field**

Find:

```tsx
              <Text style={s.label}>New PIN</Text>
              <TextInput
                style={[s.input, s.pinInput]}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
              />
```

Replace with:

```tsx
              <Text style={s.label}>New PIN</Text>
              <TextInput
                ref={newPinRef}
                style={[s.input, s.pinInput]}
                value={newPin}
                onChangeText={setNewPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => confirmPinRef.current?.focus()}
              />
```

- [ ] **Step 4: Wire the Confirm PIN field**

Find:

```tsx
              <Text style={s.label}>Confirm New PIN</Text>
              <TextInput
                style={[s.input, s.pinInput]}
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
              />
```

Replace with:

```tsx
              <Text style={s.label}>Confirm New PIN</Text>
              <TextInput
                ref={confirmPinRef}
                style={[s.input, s.pinInput]}
                value={confirmPin}
                onChangeText={setConfirmPin}
                keyboardType="number-pad"
                maxLength={4}
                secureTextEntry
                placeholder="••••"
                placeholderTextColor={COLORS.textMuted}
                returnKeyType="done"
              />
```

- [ ] **Step 5: Verify it compiles**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
cd S:\LUCKYAPP
git add mobile/app/\(auth\)/forgot-pin.tsx
git commit -m "feat: add field chaining and auto-submit to forgot-pin reset step"
```

---

### Task 8: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full type-check**

Run: `cd S:\LUCKYAPP\mobile && npx tsc --noEmit`
Expected: no errors in `login.tsx` or `forgot-pin.tsx` (pre-existing unrelated errors elsewhere in the project, if any, are not this task's concern).

- [ ] **Step 2: Confirm no other auth file was touched**

Run: `cd S:\LUCKYAPP && git diff --stat 4231423..HEAD -- mobile/`
Expected: only `mobile/app/(auth)/login.tsx` and `mobile/app/(auth)/forgot-pin.tsx` appear — `mobile/app/(auth)/welcome.tsx` and everything else under `mobile/` is untouched.

- [ ] **Step 3: Manual device/emulator check (for a human, not this agent — no device is available here)**

Once this is merged and a new build is installed on a device, verify:
- Android: opening the keyboard on any phone/PIN/OTP/name field shifts the screen up so the focused field stays visible above the keyboard (the original bug).
- Quick-login: typing the 4th PIN digit automatically attempts sign-in without tapping "Sign In".
- OTP screens (both login verify and forgot-pin verify): typing the 6th digit automatically attempts verification.
- Register form: tapping "next" on the keyboard moves Name → Phone → PIN → Confirm PIN; typing the 4th digit of Confirm PIN automatically sends the form (triggers OTP send).
- Login form (non-register): tapping "next" on Phone moves to PIN; typing the 4th PIN digit automatically attempts sign-in.
- Forgot-PIN reset step: tapping "next" on New PIN moves to Confirm PIN; once both are 4 digits, the reset is automatically submitted.
- No infinite loop, double-submit, or crash occurs from rapidly typing/deleting digits in any of the above fields.

No commit needed for this verification-only task.
